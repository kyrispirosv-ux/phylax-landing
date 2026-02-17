// Phylax SafeGuard — Background Service Worker v3.0
// 12-step deterministic pipeline: ContentObject + PolicyObject → DecisionObject
// Kids-only action space: ALLOW | BLOCK | LIMIT (no WARN)
// Communicates with parent dashboard via bridge.js + externally_connectable

import { createEvent, EventBuffer } from './engine/events.js';
import { DecisionLogger } from './engine/logger.js';
import { compileRules, extractDNRPatterns, getDebugLog, clearDebugLog } from './engine/rule-compiler.js';
import { evaluate, compileToPolicyObject } from './engine/pipeline.js';
import { createSessionState, updateSessionState } from './engine/behavior.js';
import { cacheClear, cacheStats } from './engine/decision-cache.js';
import { createConversationState } from './engine/grooming-detector.js';
import { classify_video_risk, analyze_message_risk, predict_conversation_risk, classify_search_risk } from './engine/risk-classifier.js';
import { startSync, queueEvent, getDeviceId } from './backend-sync.js';

// ── State ───────────────────────────────────────────────────────

const PHYLAX_ORIGINS = [
  'https://phylax2.vercel.app',
  'https://phylax-landing.vercel.app',
  'http://localhost',
  'http://127.0.0.1'
];

// ── Exempt email / productivity domains ─────────────────────────
// Email clients produce rampant false positives (spam summaries,
// phishing warnings, marketing emails all contain scam/violence keywords).
const EXEMPT_DOMAINS = [
  // Email clients
  'mail.google.com', 'inbox.google.com',
  'outlook.live.com', 'outlook.office.com', 'outlook.office365.com',
  'mail.yahoo.com',
  'mail.proton.me', 'mail.protonmail.com',
  'mail.zoho.com',
  'mail.aol.com',
  'fastmail.com',
  // Google productivity
  'calendar.google.com', 'contacts.google.com',
  'drive.google.com', 'docs.google.com',
  'sheets.google.com', 'slides.google.com',
  // AI assistants — content is user-generated and too varied for
  // keyword scoring. These tools have their own safety filters.
  'chat.openai.com', 'chatgpt.com',
  'claude.ai',
  'gemini.google.com',
  'copilot.microsoft.com',
  'poe.com',
  'perplexity.ai',
];

function isExemptDomain(domain) {
  return EXEMPT_DOMAINS.some(d => domain === d || domain.endsWith('.' + d));
}

const eventBuffer = new EventBuffer(500, 3600000);
const logger = new DecisionLogger();
let sessionState = createSessionState();
let profileTier = 'tween_13';

// ── Policy state ─────────────────────────────────────────────────
let compiledRulesCache = [];
let currentPolicy = null; // PolicyObject — the compiled pipeline input

// ── Per-conversation grooming state (multi-turn analysis) ────────
// Maps conversation key → persistent grooming detection state.
// The grooming detector uses this to track stage progression,
// escalation speed, and behavioral patterns across turns.
const groomingConversationStates = new Map();
const MAX_GROOMING_STATES = 500;
const GROOMING_STATE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

function getGroomingState(conversationKey) {
  if (!conversationKey) return null;
  const entry = groomingConversationStates.get(conversationKey);
  if (!entry) return null;
  // Expire stale states
  if (Date.now() - entry.updated_at > GROOMING_STATE_TTL_MS) {
    groomingConversationStates.delete(conversationKey);
    return null;
  }
  return entry;
}

function setGroomingState(conversationKey, state) {
  if (!conversationKey || !state) return;
  groomingConversationStates.set(conversationKey, state);
  // Evict oldest if over limit
  if (groomingConversationStates.size > MAX_GROOMING_STATES) {
    const oldest = groomingConversationStates.keys().next().value;
    groomingConversationStates.delete(oldest);
  }
}

// ── Service worker readiness ────────────────────────────────────
// Chrome MV3 service workers can receive messages before top-level
// async init completes. policyReady gates event processing so we
// never evaluate against a null/empty policy.
let policyReady = false;
let policyReadyPromise = null;
let policyReadyResolve = null;

function resetPolicyReady() {
  policyReady = false;
  policyReadyPromise = new Promise(resolve => { policyReadyResolve = resolve; });
}
function markPolicyReady() {
  policyReady = true;
  if (policyReadyResolve) policyReadyResolve();
}
resetPolicyReady();

async function waitForPolicy() {
  if (policyReady) return;
  await policyReadyPromise;
}

// ── Per-tab decision throttle ────────────────────────────────────
const tabDecisionCache = new Map();
const TAB_DECISION_THROTTLE_MS = 3000;

// ── Rule Storage ─────────────────────────────────────────────────

async function getRules() {
  const { phylaxRules } = await chrome.storage.local.get('phylaxRules');
  return phylaxRules || [];
}

async function getProfileTier() {
  const { phylaxProfile } = await chrome.storage.local.get('phylaxProfile');
  return phylaxProfile || 'tween_13';
}

async function setRules(rules) {
  await chrome.storage.local.set({ phylaxRules: rules });
  await rebuildPolicy(rules);
  // Notify all tabs
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: 'PHYLAX_RULES_UPDATED', rules }).catch(() => { });
  }
}

// ── Policy compilation ───────────────────────────────────────────
// Transforms NL rules → compiled rules → PolicyObject + DNR rules

async function rebuildPolicy(rules) {
  // Step 1: Compile NL rules via existing rule-compiler
  compiledRulesCache = compileRules(rules);
  console.log('[Phylax] Rules compiled:', compiledRulesCache.length, 'rules →',
    compiledRulesCache.map(r => `${r.id}:${r.action.type}`).join(', '));

  // Step 2: Transform compiled rules into PolicyObject for the pipeline
  currentPolicy = compileToPolicyObject(compiledRulesCache, profileTier);
  console.log('[Phylax] PolicyObject built:',
    `version=${currentPolicy.policy_version}`,
    `domains_blocked=${currentPolicy.domain_rules.block_domains.length}`,
    `topic_rules=${currentPolicy.topic_rules.length}`,
    `behavior_rules=${currentPolicy.behavior_rules.length}`);

  // Step 3: Update DNR rules for network-level domain blocking
  await updateDNR(compiledRulesCache);

  // Step 4: Invalidate decision cache (policy changed)
  cacheClear();
}

async function updateDNR(compiled) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map(r => r.id);
  const dnrPatterns = extractDNRPatterns(compiled);

  const addRules = [];
  let ruleId = 1;
  for (const { pattern, ruleId: srcRuleId, ruleText } of dnrPatterns) {
    addRules.push({
      id: ruleId++,
      priority: 1,
      action: { type: 'redirect', redirect: { extensionPath: '/blocked.html' } },
      condition: { urlFilter: pattern, resourceTypes: ['main_frame'] },
    });
    console.log(`[Phylax] DNR: "${pattern}" from "${ruleText}" (${srcRuleId})`);
  }

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules,
    });
    console.log('[Phylax] DNR updated:', addRules.length, 'domain block rules');
  } catch (e) {
    console.error('[Phylax] DNR error:', e);
  }
}

// ── Decision throttle ────────────────────────────────────────────

function shouldThrottleDecision(tabId, action, url) {
  if (!tabId || action === 'ALLOW') return false;
  const cached = tabDecisionCache.get(tabId);
  if (!cached) return false;

  const now = Date.now();
  const urlPath = extractThrottlePath(url);

  if (cached.action === action && cached.path === urlPath &&
    (now - cached.timestamp) < TAB_DECISION_THROTTLE_MS) {
    return true;
  }
  return false;
}

function recordTabDecision(tabId, action, url) {
  if (!tabId || action === 'ALLOW') return;
  const urlPath = extractThrottlePath(url);
  tabDecisionCache.set(tabId, { action, path: urlPath, timestamp: Date.now() });
}

/**
 * Extract a throttle-safe path from a URL.
 * For YouTube, includes the video ID (?v=...) so different videos on /watch
 * don't share the same throttle key — which caused decisions for one video
 * to incorrectly throttle decisions for a different video.
 */
function extractThrottlePath(url) {
  try {
    const u = new URL(url);
    let path = u.pathname;
    // YouTube: all videos share /watch — differentiate by video ID
    const videoId = u.searchParams.get('v');
    if (videoId) path += '?v=' + videoId;
    return path;
  } catch { return url; }
}

// ═════════════════════════════════════════════════════════════════
// CORE EVENT PROCESSING — runs the 12-step pipeline
// ═════════════════════════════════════════════════════════════════

// Helper to create a new event object


async function processEvent(rawEvent, tabId) {
  const startTime = performance.now();
  const deviceId = await getDeviceId();

  // 1. Create typed event for logging + session tracking
  const event = createEvent({
    eventType: rawEvent.event_type,
    tabId,
    url: rawEvent.url,
    domain: rawEvent.domain,
    payload: rawEvent.payload || {},
    profileId: profileTier,
    deviceId,
  });

  // 2. Update session state (for behavior scoring)
  sessionState = updateSessionState(sessionState, event);

  // 3. Build ContentObject from observer payload
  const contentObject = buildContentObject(rawEvent);

  // 4. Ensure we have a policy (wait for service worker init if needed)
  await waitForPolicy();
  if (!currentPolicy) {
    try {
      const rules = await getRules();
      await rebuildPolicy(rules);
    } catch (e) {
      console.error('[Phylax] Failed to build policy:', e);
      currentPolicy = compileToPolicyObject([], profileTier);
    }
  }

  // 5. Run the 12-step pipeline
  const decision = evaluate(contentObject, currentPolicy, sessionState);

  // 5b. Persist updated grooming conversation state (for multi-turn tracking)
  if (contentObject._grooming_conversation_key && contentObject._grooming_conversation_state) {
    setGroomingState(contentObject._grooming_conversation_key, contentObject._grooming_conversation_state);
  }

  // 6. Normalize decision for backward compat
  // The pipeline returns { decision: "ALLOW"|"BLOCK"|"LIMIT", ... }
  // The enforcer/observer support both 'decision' and 'action' fields
  const normalized = {
    ...decision,
    action: decision.decision, // backward compat
    scores: {
      harm: decision.decision === 'BLOCK' ? Math.round(decision.confidence * 100) : 0,
      compulsion: decision.decision === 'LIMIT' ? Math.round(decision.confidence * 100) : 0,
    },
    top_reasons: [decision.reason_code],
    message_child: decision.decision === 'BLOCK'
      ? "This isn't allowed by your family's safety settings."
      : decision.decision === 'LIMIT'
        ? 'Time for a break!'
        : '',
    message_parent: decision.evidence?.join(' ') || decision.reason_code,
    timestamp: Date.now(),
    // Pass through enforcement and evidence
    hard_trigger: decision.reason_code === 'DOMAIN_BLOCK' ? 'parent_rule' : null,
    enforcement: decision.enforcement,
    evidence: decision.evidence,
    reason_code: decision.reason_code,
    // Grooming-specific analysis (for parent alerts with stage/tactic info)
    grooming_analysis: decision._grooming_analysis || null,
  };

  // 7. Log
  const logRecord = logger.log(event, normalized);
  logRecord.model.latency_ms = Math.round(performance.now() - startTime);
  event._decision = normalized;
  // eventBuffer.push(event); // REMOVED local buffer

  // Send to backend
  queueEvent({
    event_type: event.event_type,
    domain: event.domain || normalized.domain,
    url: event.url || normalized.url,
    category: normalized.category || 'General',
    rule_id: normalized.rule_id || null,
    reason_code: normalized.reason_code,
    confidence: normalized.confidence,
    metadata: {
      ...event.payload,
      decision: normalized.decision,
      scores: normalized.scores,
      evidence: normalized.evidence
    }
  });

  const latency = Math.round(performance.now() - startTime);
  console.log(`[Phylax] ${event.event_type} on ${rawEvent.domain}: ${decision.decision} (${decision.reason_code}) [${latency}ms]`);

  return normalized;
}

/**
 * Build a ContentObject from the raw event payload.
 * The observer sends content_object in the payload when available.
 * Falls back to legacy title/text fields.
 *
 * For chat contexts, injects the per-conversation grooming detection
 * state so the intelligent detector can track multi-turn patterns.
 */
function buildContentObject(rawEvent) {
  const payload = rawEvent.payload || {};
  let contentObject;

  // If observer sent a full content_object, use it
  if (payload.content_object) {
    contentObject = {
      ...payload.content_object,
      url: rawEvent.url || payload.content_object.url,
      domain: rawEvent.domain || payload.content_object.domain,
      ts_ms: Date.now(),
    };
  } else {
    // Legacy fallback: build minimal ContentObject from old fields
    contentObject = {
      url: rawEvent.url || '',
      domain: rawEvent.domain || '',
      ts_ms: Date.now(),
      content_type: payload.content_type_hint || 'unknown',
      spa_route_key: rawEvent.url || '',
      title: payload.title || '',
      description: '',
      headings: [],
      main_text: payload.text || '',
      visible_text_sample: '',
      og: {},
      schema_org: null,
      keywords: [],
      language: payload.lang || 'unknown',
      media: { has_video: false, has_audio: false, image_count: 0 },
      ui: {
        infinite_scroll: false,
        autoplay: false,
        short_form: false,
        has_recommendation_rail: false,
        requires_login: false,
      },
      platform: { name: 'none' },
    };
  }

  // Inject per-conversation grooming state for multi-turn detection
  if (contentObject.content_type === 'chat') {
    const domain = contentObject.domain || '';
    const path = contentObject.spa_route_key || contentObject.url || '';
    const convKey = normalizeConversationKey(domain, path);
    if (convKey) {
      contentObject._grooming_conversation_state = getGroomingState(convKey) || createConversationState();
      contentObject._grooming_conversation_key = convKey;
    }
  }

  return contentObject;
}

// ═════════════════════════════════════════════════════════════════
// PARENT ALERT SYSTEM — notifies parent of chat/DM threats
// ═════════════════════════════════════════════════════════════════

async function handleParentAlert(alert) {
  if (!alert) return;

  console.log(`[Phylax] PARENT ALERT: ${alert.alert_type} on ${alert.platform} — ${alert.reason_code} (confidence: ${alert.confidence})`);

  // Store alert for parent dashboard retrieval
  const { phylaxAlerts } = await chrome.storage.local.get('phylaxAlerts');
  const alerts = phylaxAlerts || [];
  alerts.push({
    ...alert,
    id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    read: false,
  });
  // Keep last 200 alerts
  if (alerts.length > 200) alerts.splice(0, alerts.length - 200);
  await chrome.storage.local.set({ phylaxAlerts: alerts });

  // Log to decision logger as high-priority event
  const logEvent = createEvent({
    eventType: 'PARENT_ALERT',
    tabId: null,
    url: alert.url,
    domain: alert.domain,
    payload: alert,
    profileId: profileTier,
  });
  // eventBuffer.push(logEvent);
  queueEvent({
    event_type: 'PARENT_ALERT',
    domain: alert.domain,
    url: alert.url,
    category: alert.category || 'Safety',
    reason_code: alert.reason_code,
    confidence: alert.confidence,
    metadata: alert
  });
}

// ═════════════════════════════════════════════════════════════════
// BLOCKED CONVERSATIONS — per-contact persistent DM blocking
// ═════════════════════════════════════════════════════════════════

// Once a specific conversation is flagged, it stays blocked until a
// parent explicitly unblocks it. The child cannot dismiss or bypass.

async function blockConversation(info) {
  const { phylaxBlockedConversations } = await chrome.storage.local.get('phylaxBlockedConversations');
  const blocked = phylaxBlockedConversations || [];

  // Extract a stable conversation key from the URL path
  const convKey = normalizeConversationKey(info.domain, info.path);
  if (!convKey) return;

  // Don't duplicate
  if (blocked.some(b => b.key === convKey)) return;

  blocked.push({
    key: convKey,
    domain: info.domain,
    platform: info.platform,
    path: info.path,
    contact_name: info.contact_name || null,
    reason_code: info.reason_code,
    confidence: info.confidence,
    blocked_at: Date.now(),
    blocked_by: 'system',
  });

  await chrome.storage.local.set({ phylaxBlockedConversations: blocked });
  console.log(`[Phylax] Conversation blocked: ${convKey} on ${info.platform}`);
}

async function isConversationBlocked(domain, path) {
  const { phylaxBlockedConversations } = await chrome.storage.local.get('phylaxBlockedConversations');
  const blocked = phylaxBlockedConversations || [];
  const convKey = normalizeConversationKey(domain, path);
  if (!convKey) return false;
  return blocked.some(b => b.key === convKey);
}

/**
 * Extract a stable conversation identifier from URL path.
 * Instagram: /direct/t/THREAD_ID/ → "instagram:/direct/t/THREAD_ID"
 * Discord:   /channels/@me/CHANNEL_ID → "discord:/channels/@me/CHANNEL_ID"
 * WhatsApp:  always same URL, use contact header text
 * Twitter:   /messages/CONVERSATION_ID → "twitter:/messages/CONVERSATION_ID"
 */
function normalizeConversationKey(domain, path) {
  if (domain.includes('instagram.com')) {
    // /direct/t/123456789/ → grab the thread segment
    const match = path.match(/\/direct\/t\/([^/]+)/);
    if (match) return `instagram:${match[0]}`;
    return `instagram:${path}`;
  }
  if (domain.includes('discord.com')) {
    // /channels/@me/123456 or /channels/GUILD/CHANNEL
    const match = path.match(/\/channels\/(.+)/);
    if (match) return `discord:${match[0]}`;
    return null;
  }
  if (domain.includes('twitter.com') || domain.includes('x.com')) {
    const match = path.match(/\/messages\/([^/]+)/);
    if (match) return `twitter:${match[0]}`;
    return null;
  }
  if (domain.includes('messenger.com')) {
    // /t/THREAD_ID
    const match = path.match(/\/t\/([^/]+)/);
    if (match) return `messenger:${match[0]}`;
    return null;
  }
  // Fallback: domain + path
  return `${domain}:${path}`;
}

// ═════════════════════════════════════════════════════════════════
// MESSAGE HANDLING
// ═════════════════════════════════════════════════════════════════

// Messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Core pipeline: process events from observer.js
  if (message.type === 'PHYLAX_PROCESS_EVENT') {
    const tabId = sender.tab?.id;
    const eventUrl = message.event?.url || '';
    const eventDomain = message.event?.domain || '';
    if (isExemptDomain(eventDomain)) {
      sendResponse({ decision: { action: 'ALLOW', decision: 'ALLOW', scores: { harm: 0, compulsion: 0 } } });
      return true;
    }
    processEvent(message.event, tabId).then(decision => {
      if (decision && decision.action !== 'ALLOW' &&
        shouldThrottleDecision(tabId, decision.action, eventUrl)) {
        console.log(`[Phylax] Throttled ${decision.action} for tab ${tabId}`);
        sendResponse({ decision: { action: 'ALLOW', decision: 'ALLOW', scores: decision.scores, throttled: true } });
      } else {
        if (decision && decision.action !== 'ALLOW') {
          recordTabDecision(tabId, decision.action, eventUrl);
        }
        sendResponse({ decision });
      }
    });
    return true;
  }

  // Parent alert from enforcer (chat threat detected)
  if (message.type === 'PHYLAX_PARENT_ALERT') {
    handleParentAlert(message.alert);
    // Persist this conversation as blocked
    blockConversation(message.alert);
    sendResponse({ success: true });
    return true;
  }

  // Check if a conversation is blocked (called by observer on DM page load)
  if (message.type === 'PHYLAX_CHECK_CONVERSATION_BLOCKED') {
    isConversationBlocked(message.domain, message.path).then(blocked => {
      sendResponse({ blocked });
    });
    return true;
  }

  // ── TASK 1: YouTube element-level video classification ─────────
  // Receives per-video metadata from youtube-scanner.js and returns
  // a structured classification using the risk-classifier pipeline.
  if (message.type === 'PHYLAX_CLASSIFY_VIDEO') {
    const video = message.video;
    if (!video) {
      sendResponse({ classification: null });
      return true;
    }

    // Ensure policy is ready (thresholds depend on profile tier)
    waitForPolicy().then(() => {
      const classification = classify_video_risk(
        video.contentText || '',
        {
          title: video.title,
          channel: video.channel,
          description: video.description,
          tags: video.badges || [],
        }
      );

      console.log(`[Phylax] Video classify: "${(video.title || '').slice(0, 50)}" → ${classification.decision} (${classification.category}, risk: ${classification.risk_score})`);

      // Log blocked/warned videos
      if (classification.decision !== 'allow') {
        const logEvent = createEvent({
          eventType: 'VIDEO_CLASSIFIED',
          tabId: sender.tab?.id,
          url: `https://youtube.com/watch?v=${video.videoId}`,
          domain: 'youtube.com',
          payload: {
            videoId: video.videoId,
            title: video.title,
            classification,
            searchQuery: message.searchQuery,
          },
          profileId: profileTier,
        });
        // eventBuffer.push(logEvent);
        queueEvent({
          event_type: 'VIDEO_BLOCK',
          domain: 'youtube.com',
          url: `https://youtube.com/watch?v=${video.videoId}`,
          category: classification.category,
          reason_code: classification.decision === 'block' ? 'VIDEO_BLOCKED' : 'VIDEO_WARNED',
          confidence: classification.risk_score / 100,
          metadata: {
            title: video.title,
            channel: video.channel,
            reasoning: classification.reasoning
          }
        });
      }

      sendResponse({ classification });
    });
    return true;
  }

  // ── TASK 2: Grooming/manipulation message analysis ────────────
  // Direct API for analyze_message_risk — used for demo testing.
  if (message.type === 'PHYLAX_ANALYZE_MESSAGE') {
    const result = analyze_message_risk(
      message.messageText || '',
      message.conversationHistory || null,
    );
    sendResponse({ result });
    return true;
  }

  // ── TASK 3: Predictive conversation risk analysis ─────────────
  // Direct API for predict_conversation_risk — used for demo testing.
  if (message.type === 'PHYLAX_PREDICT_RISK') {
    const result = predict_conversation_risk(message.messages || []);
    sendResponse({ result });

    // If elevated or higher, send predictive warning to the tab
    if (result.risk_level === 'elevated' || result.risk_level === 'high' || result.risk_level === 'critical') {
      const tabId = sender.tab?.id;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: 'PHYLAX_PREDICTIVE_WARNING',
          decision: result,
        }).catch(() => { });
      }
    }

    return true;
  }

  // ── TASK 3b: Search query risk classification ──────────────────
  // Receives search queries from search-interceptor.js and returns
  // a classification using classify_search_risk.
  if (message.type === 'PHYLAX_CLASSIFY_SEARCH') {
    const query = message.query;
    if (!query || query.length < 3) {
      sendResponse({ classification: { decision: 'allow', risk_score: 0, category: 'none' } });
      return true;
    }

    const classification = classify_search_risk(query);
    console.log(`[Phylax] Search classify: "${query.slice(0, 60)}" → ${classification.decision} (${classification.category}, risk: ${classification.risk_score})`);

    sendResponse({ classification });
    return true;
  }

  // Search blocked notification — log event and send parent alert
  if (message.type === 'PHYLAX_SEARCH_BLOCKED') {
    const classification = message.classification || {};
    const logEvent = createEvent({
      eventType: 'SEARCH_BLOCKED',
      tabId: sender.tab?.id,
      url: message.url || '',
      domain: message.domain || '',
      payload: {
        query: message.query,
        category: classification.category,
        risk_score: classification.risk_score,
        blocked_reason: classification.blocked_reason,
      },
      profileId: profileTier,
    });
    // eventBuffer.push(logEvent);
    queueEvent({
      event_type: 'SEARCH_BLOCKED',
      domain: message.domain,
      url: message.url,
      category: classification.category,
      reason_code: 'SEARCH_RISK',
      confidence: classification.risk_score / 100,
      metadata: {
        query: message.query,
        blocked_reason: classification.blocked_reason
      }
    });

    // Send parent alert
    handleParentAlert({
      type: 'SEARCH_BLOCKED',
      severity: classification.risk_score >= 90 ? 'high' : 'medium',
      title: 'Blocked Search Query',
      body: `A harmful search was blocked: ${classification.category}`,
      url: message.url || '',
      domain: message.domain || '',
      reason_code: 'SEARCH_RISK',
      confidence: classification.confidence || 0.9,
      evidence: classification.reasoning || [],
    });

    sendResponse({ success: true });
    return true;
  }

  // Rule queries
  if (message.type === 'GET_PHYLAX_RULES') {
    getRules().then(rules => sendResponse({ rules }));
    return true;
  }

  if (message.type === 'GET_PHYLAX_COMPILED_RULES') {
    sendResponse({ compiledRules: compiledRulesCache });
    return true;
  }

  if (message.type === 'GET_PHYLAX_DEBUG_LOG') {
    sendResponse({ debugLog: getDebugLog() });
    return true;
  }

  if (message.type === 'CLEAR_PHYLAX_DEBUG_LOG') {
    clearDebugLog();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'PHYLAX_TEST_COMPILE_RULE') {
    import('./engine/rule-compiler.js').then(({ compileRule }) => {
      const compiled = compileRule(message.ruleText);
      sendResponse({ compiled });
    });
    return true;
  }

  // Status request from popup
  if (message.type === 'GET_PHYLAX_STATUS') {
    handleStatusRequest(sendResponse);
    return true;
  }

  // Dashboard bridge messages — catch-all for PHYLAX_ prefixed
  if (message.type && message.type.startsWith('PHYLAX_')) {
    handleDashboardMessage(message, sendResponse);
    return true;
  }
});

// External messages from web app (via externally_connectable)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isPhylaxOrigin(sender.origin || sender.url)) {
    sendResponse({ success: false, error: 'Unauthorized origin' });
    return;
  }
  handleDashboardMessage(message, sendResponse);
  return true;
});

async function handleDashboardMessage(message, sendResponse) {
  try {
    switch (message.type) {
      case 'PHYLAX_SYNC_RULES': {
        const rules = message.rules || [];
        await setRules(rules);
        sendResponse({
          success: true,
          rulesCount: rules.length,
          policyVersion: currentPolicy?.policy_version,
          topicRulesCount: currentPolicy?.topic_rules?.length || 0,
          domainBlocksCount: currentPolicy?.domain_rules?.block_domains?.length || 0,
        });
        break;
      }
      case 'PHYLAX_ADD_RULE': {
        const current = await getRules();
        current.push({ text: message.rule, active: true });
        await setRules(current);
        sendResponse({ success: true, rulesCount: current.length });
        break;
      }
      case 'PHYLAX_PAIR_DEVICE': {
        console.log('[Phylax] Device paired — starting background sync');
        // Rebuild policy from whatever rules we now have (may have been set by popup/pairing page)
        const pairedRules = await getRules();
        await rebuildPolicy(pairedRules);
        // Start background sync timers (policy poll, heartbeat, event flush)
        startSync();
        sendResponse({ success: true });
        break;
      }
      case 'PHYLAX_TOGGLE_RULE': {
        const rules = await getRules();
        if (rules[message.index]) {
          rules[message.index].active = !rules[message.index].active;
          await setRules(rules);
        }
        sendResponse({ success: true });
        break;
      }
      case 'PHYLAX_CLEAR_RULES': {
        await setRules([]);
        sendResponse({ success: true });
        break;
      }
      case 'PHYLAX_SET_PROFILE': {
        profileTier = message.tier || 'tween_13';
        await chrome.storage.local.set({ phylaxProfile: profileTier });
        // Rebuild policy with new profile (thresholds change)
        const rules = await getRules();
        await rebuildPolicy(rules);
        sendResponse({ success: true, tier: profileTier });
        break;
      }
      case 'PHYLAX_PING': {
        sendResponse({
          success: true,
          version: chrome.runtime.getManifest().version,
          engine: 'pipeline-v3',
          profile: profileTier,
          policyVersion: currentPolicy?.policy_version || null,
        });
        break;
      }
      case 'PHYLAX_GET_POLICY': {
        sendResponse({
          success: true,
          policy: currentPolicy,
        });
        break;
      }
      case 'PHYLAX_GET_DECISIONS': {
        const recent = logger.getRecent(50);
        sendResponse({ success: true, decisions: recent });
        break;
      }
      case 'PHYLAX_GET_ALERTS': {
        const { phylaxAlerts } = await chrome.storage.local.get('phylaxAlerts');
        sendResponse({ success: true, alerts: phylaxAlerts || [] });
        break;
      }
      case 'PHYLAX_MARK_ALERT_READ': {
        const { phylaxAlerts: allAlerts } = await chrome.storage.local.get('phylaxAlerts');
        if (allAlerts && message.alertId) {
          const alert = allAlerts.find(a => a.id === message.alertId);
          if (alert) alert.read = true;
          await chrome.storage.local.set({ phylaxAlerts: allAlerts });
        }
        sendResponse({ success: true });
        break;
      }
      case 'PHYLAX_GET_BLOCKED_CONVERSATIONS': {
        const { phylaxBlockedConversations } = await chrome.storage.local.get('phylaxBlockedConversations');
        sendResponse({ success: true, blocked: phylaxBlockedConversations || [] });
        break;
      }
      case 'PHYLAX_UNBLOCK_CONVERSATION': {
        // Parent-only action: remove a conversation from the blocked list
        const { phylaxBlockedConversations } = await chrome.storage.local.get('phylaxBlockedConversations');
        const blocked = phylaxBlockedConversations || [];
        const updated = blocked.filter(b => b.key !== message.conversationKey);
        await chrome.storage.local.set({ phylaxBlockedConversations: updated });
        console.log(`[Phylax] Conversation unblocked: ${message.conversationKey}`);
        sendResponse({ success: true, remaining: updated.length });
        break;
      }
      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (e) {
    console.error('[Phylax] Error:', e);
    sendResponse({ success: false, error: e.message });
  }
}

async function handleStatusRequest(sendResponse) {
  const rules = await getRules();
  const summary = logger.getTodaySummary();
  const stats = logger.getStats();
  const cache = cacheStats();

  sendResponse({
    engine: 'pipeline-v3',
    profile: profileTier,
    rules_count: rules.length,
    active_rules: rules.filter(r => r.active).length,
    policy: currentPolicy ? {
      version: currentPolicy.policy_version,
      domain_blocks: currentPolicy.domain_rules.block_domains.length,
      domain_allows: currentPolicy.domain_rules.allow_domains.length,
      topic_rules: currentPolicy.topic_rules.map(r => ({
        topic: r.topic,
        action: r.action,
        threshold: r.threshold,
        scope: r.scope,
      })),
      behavior_rules: currentPolicy.behavior_rules.length,
    } : null,
    session: {
      start: sessionState.session_start_ms,
      active_minutes: sessionState.today_active_minutes,
      page_hops_5m: sessionState.page_hops_last_5m,
      scroll_events_60s: sessionState.scroll_events_last_60s,
      short_form_streak: sessionState.short_form_streak,
    },
    cache,
    events_buffered: eventBuffer.size,
    today: summary,
    stats,
  });
}

function isPhylaxOrigin(origin) {
  if (!origin) return false;
  return PHYLAX_ORIGINS.some(a => origin.startsWith(a));
}

// ═════════════════════════════════════════════════════════════════
// TAB NAVIGATION TRACKING
// ═════════════════════════════════════════════════════════════════

// Early blocking: onCommitted fires before page renders
// ONLY for BLOCK_DOMAIN rules (no content needed)
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const url = details.url;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) return;
  await waitForPolicy();

  try {
    const domain = new URL(url).hostname;
    if (['phylax2.vercel.app', 'phylax-landing.vercel.app', 'localhost', '127.0.0.1'].includes(domain)) return;
    if (isExemptDomain(domain)) return;

    // Quick domain gate check from the current policy
    if (currentPolicy) {
      const blocked = currentPolicy.domain_rules.block_domains.some(d =>
        domain.includes(d) || domain.endsWith(d));
      if (blocked) {
        const blockDecision = {
          action: 'BLOCK',
          decision: 'BLOCK',
          reason_code: 'DOMAIN_BLOCK',
          confidence: 0.99,
          evidence: ['Blocked by parent domain rule.'],
          enforcement: { layer: 'NETWORK', technique: 'cancel_request' },
          hard_trigger: 'parent_rule',
        };

        if (!shouldThrottleDecision(details.tabId, 'BLOCK', url)) {
          console.log(`[Phylax] Early block: ${domain} (domain gate)`);
          recordTabDecision(details.tabId, 'BLOCK', url);
          chrome.tabs.sendMessage(details.tabId, {
            type: 'PHYLAX_ENFORCE_DECISION',
            decision: blockDecision,
          }).catch(() => { });
        }
      }
    }
  } catch { /* ignore */ }
});

// Full analysis: onCompleted fires after page loads
// Request REAL content from the tab's observer instead of sending empty strings
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const url = details.url;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) return;
  await waitForPolicy();

  let domain;
  try {
    domain = new URL(url).hostname;
    if (['phylax2.vercel.app', 'phylax-landing.vercel.app', 'localhost', '127.0.0.1'].includes(domain)) return;
    if (isExemptDomain(domain)) return;
  } catch { return; }

  // Ask the content script for real content instead of sending empty payload
  let payload = { title: '', text: '', content_type_hint: 'unknown' };
  try {
    const tabContent = await chrome.tabs.sendMessage(details.tabId, { type: 'PHYLAX_REQUEST_CONTENT' });
    if (tabContent?.content_object) {
      payload = {
        content_object: tabContent.content_object,
        title: tabContent.content_object.title || '',
        text: (tabContent.content_object.title || '') + ' ' +
          (tabContent.content_object.description || '') + ' ' +
          (tabContent.content_object.main_text || '').slice(0, 3000),
        content_type_hint: tabContent.content_object.content_type || 'unknown',
      };
    }
  } catch { /* content script not ready — fall back to empty */ }

  const decision = await processEvent({
    event_type: 'PAGE_LOAD',
    url,
    domain,
    payload,
  }, details.tabId);

  if (decision && decision.action !== 'ALLOW') {
    if (!shouldThrottleDecision(details.tabId, decision.action, url)) {
      recordTabDecision(details.tabId, decision.action, url);
      chrome.tabs.sendMessage(details.tabId, {
        type: 'PHYLAX_ENFORCE_DECISION',
        decision,
      }).catch(() => { });
    }
  }
});

// ═════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═════════════════════════════════════════════════════════════════

chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    console.log('[Phylax] Engine installed — Pipeline v3.0 (Intelligent Grooming Detection)');
    profileTier = await getProfileTier();
    await logger.restore();
    const rules = await getRules();
    if (rules.length > 0) {
      await rebuildPolicy(rules);
      console.log('[Phylax] Restored', rules.length, 'rules, policy version:', currentPolicy?.policy_version);
    } else {
      // Build default policy even with no rules (for behavior rules)
      await rebuildPolicy([]);
    }
    markPolicyReady();

    // On fresh install, check if not yet paired and open pairing page
    if (details.reason === 'install') {
      const { phylaxPaired } = await chrome.storage.local.get('phylaxPaired');
      if (!phylaxPaired) {
        chrome.tabs.create({ url: chrome.runtime.getURL('pairing.html') });
      }
    }
  } catch (e) {
    console.error('[Phylax] onInstalled error:', e);
    currentPolicy = compileToPolicyObject([], profileTier);
    markPolicyReady();
  }
});

// Restore state on service worker wake
(async () => {
  try {
    profileTier = await getProfileTier();
    await logger.restore();
    const rules = await getRules();
    await rebuildPolicy(rules);
    markPolicyReady();
    console.log('[Phylax] Service worker ready. Profile:', profileTier,
      '| Policy:', currentPolicy?.policy_version || 'none',
      '| Topic rules:', currentPolicy?.topic_rules?.length || 0,
      '| Domain blocks:', currentPolicy?.domain_rules?.block_domains?.length || 0);
  } catch (e) {
    console.error('[Phylax] Service worker init error:', e);
    // Build a minimal default policy so the extension still functions
    currentPolicy = compileToPolicyObject([], profileTier);
    markPolicyReady();
  }
})();

// Persist logs periodically
setInterval(() => {
  logger.persist();
}, 60000);
