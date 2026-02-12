// Phylax SafeGuard — Background Service Worker (v3: Deterministic Pipeline)
// Kids-only engine: ALLOW | BLOCK | LIMIT
//
// Pipeline: domain gate → ContentObject → local scoring → topic policy →
//           behavior policy → aggregate → enforce → cache

import { createEvent, EventBuffer } from './engine/events.js';
import { compileRules, extractDNRPatterns, RULE_ACTIONS } from './engine/rule-compiler.js';
import { evaluate, buildPolicyObject, invalidateCache } from './engine/pipeline.js';
import { createSessionState, updateSessionState } from './engine/behavior.js';
import { DecisionLogger } from './engine/logger.js';

// ── State ───────────────────────────────────────────────────────

const PHYLAX_ORIGINS = [
  'https://phylax-landing.vercel.app',
  'http://localhost',
  'http://127.0.0.1'
];

const eventBuffer = new EventBuffer(500, 3600000);
const logger = new DecisionLogger();
let sessionState = createSessionState();
let profileTier = 'tween_13';

// ── Per-tab decision throttle ─────────────────────────────────
const tabDecisionCache = new Map();
const TAB_DECISION_THROTTLE_MS = 10000;

// ── Rule Storage ────────────────────────────────────────────────

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
  await updateDeclarativeNetRequestRules(rules);
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: 'PHYLAX_RULES_UPDATED', rules }).catch(() => {});
  }
}

// ── Compiled rules + Policy cache ─────────────────────────────

let compiledRulesCache = [];
let policyCache = null;

function getCompiledRules() {
  return compiledRulesCache;
}

function getPolicy() {
  if (!policyCache) {
    policyCache = buildPolicyObject(compiledRulesCache, { age: 13, sensitivity: 'med' });
  }
  return policyCache;
}

async function recompileRules(rules) {
  compiledRulesCache = compileRules(rules);
  policyCache = buildPolicyObject(compiledRulesCache, { age: 13, sensitivity: 'med' });
  invalidateCache(); // Clear decision cache when policy changes
  console.log('[Phylax] Rules compiled:', compiledRulesCache.length, 'rules →',
    compiledRulesCache.map(r => `${r.id}:${r.action.type}`).join(', '));
  console.log('[Phylax] Policy: domains_blocked=', policyCache.domain_rules.block_domains.length,
    'topic_rules=', policyCache.topic_rules.length,
    'behavior_rules=', policyCache.behavior_rules.length);
  return compiledRulesCache;
}

// ── DNR (network-level blocking) ──────────────────────────────

async function updateDeclarativeNetRequestRules(rules) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map(r => r.id);

  const compiled = await recompileRules(rules);
  const dnrPatterns = extractDNRPatterns(compiled);

  const addRules = [];
  let ruleId = 1;
  for (const { pattern, ruleText } of dnrPatterns) {
    addRules.push({
      id: ruleId++,
      priority: 1,
      action: { type: 'redirect', redirect: { extensionPath: '/blocked.html' } },
      condition: { urlFilter: pattern, resourceTypes: ['main_frame'] },
    });
    console.log(`[Phylax] DNR: "${pattern}" from "${ruleText}"`);
  }

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules,
    });
    console.log('[Phylax] DNR rules updated:', addRules.length);
  } catch (e) {
    console.error('[Phylax] DNR error:', e);
  }
}

// ── Decision throttle ───────────────────────────────────────────

function shouldThrottleDecision(tabId, decision, url) {
  if (!tabId || decision === 'ALLOW') return false;
  const cached = tabDecisionCache.get(tabId);
  if (!cached) return false;

  const elapsed = Date.now() - cached.timestamp;
  let urlPath = '';
  try { urlPath = new URL(url).pathname; } catch { urlPath = url; }

  return cached.decision === decision && cached.path === urlPath && elapsed < TAB_DECISION_THROTTLE_MS;
}

function recordTabDecision(tabId, decision, url) {
  if (!tabId || decision === 'ALLOW') return;
  let urlPath = '';
  try { urlPath = new URL(url).pathname; } catch { urlPath = url; }
  tabDecisionCache.set(tabId, { decision, path: urlPath, timestamp: Date.now() });
}

// ═══════════════════════════════════════════════════════════════
// CORE PIPELINE PROCESSING
// ═══════════════════════════════════════════════════════════════

async function processEvent(rawEvent, tabId) {
  const startTime = performance.now();

  // 1. Create typed event for buffer/logging
  const event = createEvent({
    eventType: rawEvent.event_type,
    tabId,
    url: rawEvent.url,
    domain: rawEvent.domain,
    payload: rawEvent.payload || {},
    profileId: profileTier,
  });

  // 2. Update session state (behavior tracking)
  sessionState = updateSessionState(sessionState, {
    event_type: rawEvent.event_type,
    domain: rawEvent.domain,
    url: rawEvent.url,
    content_type: rawEvent.payload?.content_type_hint,
    ui: rawEvent.payload?.content_object?.ui,
  });

  // 3. Get policy
  const policy = getPolicy();

  // 4. Build ContentObject from event payload
  const contentObject = rawEvent.payload?.content_object || buildContentObjectFromLegacy(rawEvent);

  // 5. Run the deterministic pipeline
  const result = evaluate(contentObject, policy, sessionState);

  console.log(`[Phylax] ${rawEvent.event_type} on ${rawEvent.domain}: ` +
    `decision=${result.decision} reason=${result.reason_code} ` +
    `confidence=${result.confidence} (${Math.round(performance.now() - startTime)}ms)`);

  // 6. Map pipeline result to enforcer decision format
  const decision = mapToEnforcerDecision(result, event);

  // 7. Log
  const logRecord = logger.log(event, decision);
  logRecord.model.latency_ms = Math.round(performance.now() - startTime);
  event._decision = decision;
  eventBuffer.push(event);

  return decision;
}

/**
 * Build a minimal ContentObject from legacy event payloads
 * (for backward compat when observer hasn't sent a full ContentObject)
 */
function buildContentObjectFromLegacy(rawEvent) {
  const payload = rawEvent.payload || {};
  return {
    url: rawEvent.url || '',
    domain: rawEvent.domain || '',
    ts_ms: Date.now(),
    content_type: payload.content_type_hint || 'unknown',
    spa_route_key: (rawEvent.domain || '') + (new URL(rawEvent.url || 'http://x').pathname),
    title: payload.title || '',
    description: '',
    headings: [],
    main_text: payload.text || '',
    visible_text_sample: (payload.text || '').slice(0, 2000),
    og: {},
    schema_org: null,
    keywords: [],
    entities: [],
    language: payload.lang || 'unknown',
    media: { has_video: false, has_audio: false, image_count: 0 },
    ui: {},
    platform: { name: 'none', object_kind: 'unknown', channel_or_author: '', tags: [] },
  };
}

/**
 * Map pipeline DecisionObject to enforcer-compatible decision format.
 * The enforcer reads: decision (or action), evidence, confidence, enforcement, hard_trigger
 */
function mapToEnforcerDecision(result, event) {
  // The enforcer needs both 'decision' and 'action' fields for backward compat
  const decision = {
    decision: result.decision,
    action: result.decision, // backward compat for enforcer
    reason_code: result.reason_code,
    confidence: result.confidence,
    evidence: result.evidence || [],
    enforcement: result.enforcement || { layer: 'RENDER', technique: 'overlay' },
    // Scores for logging
    scores: {
      harm: result.decision === 'BLOCK' ? Math.round(result.confidence * 100) : 0,
      compulsion: result.decision === 'LIMIT' ? Math.round(result.confidence * 100) : 0,
    },
    top_reasons: [result.reason_code],
    message_child: result.evidence?.[0] || '',
    message_parent: `${result.reason_code}: ${result.evidence?.join('; ') || 'N/A'}`,
    cooldown_seconds: 0,
    // Mark domain-gate blocks as parent_rule for full-page block enforcement
    hard_trigger: result.reason_code === 'DOMAIN_BLOCK' ? 'parent_rule' : null,
    // Debug info
    debug: result.debug,
    // LIMIT-specific
    budget_minutes: result.budget_minutes || null,
    timestamp: Date.now(),
  };
  return decision;
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLING
// ═══════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PHYLAX_PROCESS_EVENT') {
    const tabId = sender.tab?.id;
    const eventUrl = message.event?.url || '';

    processEvent(message.event, tabId).then(decision => {
      if (decision && decision.decision !== 'ALLOW' &&
          shouldThrottleDecision(tabId, decision.decision, eventUrl)) {
        console.log(`[Phylax] Throttled ${decision.decision} for tab ${tabId}`);
        sendResponse({ decision: { decision: 'ALLOW', action: 'ALLOW', throttled: true } });
      } else {
        if (decision && decision.decision !== 'ALLOW') {
          recordTabDecision(tabId, decision.decision, eventUrl);
        }
        sendResponse({ decision });
      }
    });
    return true;
  }

  if (message.type === 'GET_PHYLAX_RULES') {
    getRules().then(rules => sendResponse({ rules }));
    return true;
  }

  if (message.type === 'GET_PHYLAX_COMPILED_RULES') {
    sendResponse({ compiledRules: getCompiledRules() });
    return true;
  }

  if (message.type === 'GET_PHYLAX_DEBUG_LOG') {
    import('./engine/rule-compiler.js').then(({ getDebugLog }) => {
      sendResponse({ debugLog: getDebugLog() });
    });
    return true;
  }

  if (message.type === 'CLEAR_PHYLAX_DEBUG_LOG') {
    import('./engine/rule-compiler.js').then(({ clearDebugLog }) => {
      clearDebugLog();
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'PHYLAX_TEST_COMPILE_RULE') {
    import('./engine/rule-compiler.js').then(({ compileRule }) => {
      const compiled = compileRule(message.ruleText);
      sendResponse({ compiled });
    });
    return true;
  }

  if (message.type === 'GET_PHYLAX_STATUS') {
    handleStatusRequest(sendResponse);
    return true;
  }

  if (message.type && message.type.startsWith('PHYLAX_')) {
    handleDashboardMessage(message, sendResponse);
    return true;
  }
});

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
        sendResponse({ success: true, rulesCount: rules.length });
        break;
      }
      case 'PHYLAX_ADD_RULE': {
        const current = await getRules();
        current.push({ text: message.rule, active: true });
        await setRules(current);
        sendResponse({ success: true, rulesCount: current.length });
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
        sendResponse({ success: true, tier: profileTier });
        break;
      }
      case 'PHYLAX_PING': {
        sendResponse({
          success: true,
          version: chrome.runtime.getManifest().version,
          engine: 'pipeline-v3',
          profile: profileTier,
        });
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
  const compiled = getCompiledRules();
  const policy = getPolicy();
  const summary = logger.getTodaySummary();
  const stats = logger.getStats();

  sendResponse({
    engine: 'pipeline-v3',
    profile: profileTier,
    rules_count: rules.length,
    active_rules: rules.filter(r => r.active).length,
    compiled_rules: compiled.map(r => ({
      id: r.id,
      source_text: r.source_text,
      action: r.action.type,
      scope: r.scope,
      priority: r.priority,
      parsed_intent: r.parsed_intent || null,
    })),
    policy: {
      version: policy.policy_version,
      domain_blocked: policy.domain_rules.block_domains.length,
      topic_rules: policy.topic_rules.length,
      behavior_rules: policy.behavior_rules.length,
    },
    session: {
      start: sessionState.session_start_ms,
      page_hops_5m: sessionState.page_hops_last_5m,
      scroll_events_60s: sessionState.scroll_events_last_60s,
      short_form_streak: sessionState.short_form_streak,
    },
    events_buffered: eventBuffer.size,
    today: summary,
    stats,
  });
}

function isPhylaxOrigin(origin) {
  if (!origin) return false;
  return PHYLAX_ORIGINS.some(a => origin.startsWith(a));
}

// ═══════════════════════════════════════════════════════════════
// TAB NAVIGATION (early blocking for domain-gate rules)
// ═══════════════════════════════════════════════════════════════

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const url = details.url;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) return;

  try {
    const domain = new URL(url).hostname;
    if (['phylax-landing.vercel.app', 'localhost', '127.0.0.1'].includes(domain)) return;

    // Fast domain gate check
    const policy = getPolicy();
    const domainLower = domain.toLowerCase().replace(/^www\./, '');
    const isDomainBlocked = policy.domain_rules.block_domains.some(d =>
      domainLower.includes(d) || domainLower.endsWith(d)
    );

    if (isDomainBlocked) {
      const blockDecision = {
        decision: 'BLOCK',
        action: 'BLOCK',
        reason_code: 'DOMAIN_BLOCK',
        confidence: 0.99,
        evidence: ['Blocked by parent domain rule.'],
        enforcement: { layer: 'NETWORK', technique: 'cancel_request' },
        hard_trigger: 'parent_rule',
      };

      if (!shouldThrottleDecision(details.tabId, 'BLOCK', url)) {
        console.log(`[Phylax] Early domain block: ${domain}`);
        recordTabDecision(details.tabId, 'BLOCK', url);
        chrome.tabs.sendMessage(details.tabId, {
          type: 'PHYLAX_ENFORCE_DECISION',
          decision: blockDecision,
        }).catch(() => {});
      }
    }
  } catch { /* ignore */ }
});

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const url = details.url;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;

  let domain;
  try {
    domain = new URL(url).hostname;
    if (['phylax-landing.vercel.app', 'localhost', '127.0.0.1'].includes(domain)) return;
  } catch { return; }

  const decision = await processEvent({
    event_type: 'PAGE_LOAD',
    url,
    domain,
    payload: { title: '', text: '', content_type_hint: 'unknown' },
  }, details.tabId);

  if (decision && decision.decision !== 'ALLOW') {
    if (!shouldThrottleDecision(details.tabId, decision.decision, url)) {
      recordTabDecision(details.tabId, decision.decision, url);
      chrome.tabs.sendMessage(details.tabId, {
        type: 'PHYLAX_ENFORCE_DECISION',
        decision,
      }).catch(() => {});
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Phylax] Pipeline v3 installed — Kids-Only Engine');
  profileTier = await getProfileTier();
  await logger.restore();
  const rules = await getRules();
  if (rules.length > 0) {
    await updateDeclarativeNetRequestRules(rules);
    console.log('[Phylax] Restored', rules.length, 'rules');
  }
});

(async () => {
  profileTier = await getProfileTier();
  await logger.restore();
  const rules = await getRules();
  if (rules.length > 0) {
    await updateDeclarativeNetRequestRules(rules);
  }
  console.log('[Phylax] Service worker ready. Profile:', profileTier, '| Events buffered:', eventBuffer.size);
})();

setInterval(() => { logger.persist(); }, 60000);
