// Phylax SafeGuard — Background Service Worker (Module-based Orchestrator)
// Two-lane safety engine: Content Harm + Attention Compulsion → Policy → Enforcement

import { createEvent, EventBuffer } from './engine/events.js';
import { semanticParse } from './engine/semantic.js';
import { computeHarmRisk, checkEscalationTriggers } from './engine/harm-scorer.js';
import { computeCompulsionRisk, createSessionState, updateSessionState } from './engine/compulsion-scorer.js';
import { makeDecision, checkParentRules, ACTIONS } from './engine/policy-engine.js';
import { DecisionLogger } from './engine/logger.js';

// ── State ───────────────────────────────────────────────────────

const PHYLAX_ORIGINS = [
  'https://phylax-landing.vercel.app',
  'http://localhost',
  'http://127.0.0.1'
];

const eventBuffer = new EventBuffer(500, 3600000); // 500 events, 1 hour
const logger = new DecisionLogger();
let sessionState = createSessionState();
let profileTier = 'tween_13'; // Default, configurable by parent

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
  // Notify all tabs that rules changed
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      chrome.tabs.sendMessage(tab.id, { type: 'PHYLAX_RULES_UPDATED', rules });
    } catch (_) {}
  }
}

// ── Declarative Net Request (URL-level blocking) ────────────────

async function updateDeclarativeNetRequestRules(rules) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map(r => r.id);

  const addRules = [];
  let ruleId = 1;

  for (const rule of rules) {
    if (!rule.active) continue;
    const patterns = extractBlockPatterns(rule.text);
    for (const pattern of patterns) {
      addRules.push({
        id: ruleId++,
        priority: 1,
        action: { type: 'redirect', redirect: { extensionPath: '/blocked.html' } },
        condition: { urlFilter: pattern, resourceTypes: ['main_frame'] },
      });
    }
  }

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules: addRules,
    });
    console.log('[Phylax] DNR rules updated:', addRules.length);
  } catch (e) {
    console.error('[Phylax] DNR error:', e);
  }
}

function extractBlockPatterns(ruleText) {
  const text = ruleText.toLowerCase();
  const patterns = [];

  const CATEGORIES = {
    'social media': { domains: ['facebook.com', 'instagram.com', 'tiktok.com', 'snapchat.com', 'twitter.com', 'x.com', 'reddit.com'], keywords: [] },
    'gambling': { domains: ['gambling.com', 'poker.com', 'bet365.com', 'draftkings.com', 'fanduel.com', 'casino.com', 'bovada.lv', 'betway.com', 'williamhill.com', '888casino.com'], keywords: ['gambling', 'casino', 'poker', 'betting', 'slots'] },
    'adult': { domains: ['pornhub.com', 'xvideos.com', 'xnxx.com'], keywords: ['porn', 'xxx', 'adult'] },
    'gaming': { domains: ['roblox.com', 'minecraft.net', 'fortnite.com', 'steam.com'], keywords: [] },
    'video': { domains: ['youtube.com', 'twitch.tv', 'dailymotion.com'], keywords: [] },
    'streaming': { domains: ['netflix.com', 'hulu.com', 'disneyplus.com'], keywords: [] },
  };

  for (const [category, { domains, keywords }] of Object.entries(CATEGORIES)) {
    if (text.includes(category)) {
      for (const d of domains) patterns.push(`*${d}*`);
      for (const kw of keywords) {
        const p = `*${kw}*`;
        if (!patterns.includes(p)) patterns.push(p);
      }
    }
  }

  const BLOCK_KEYWORDS = ['gambling', 'casino', 'poker', 'betting', 'slots', 'porn', 'xxx', 'adult', 'drugs', 'weapons', 'gore', 'violence'];
  for (const kw of BLOCK_KEYWORDS) {
    if (text.includes(kw)) {
      const p = `*${kw}*`;
      if (!patterns.includes(p)) patterns.push(p);
    }
  }

  const SITE_MAP = {
    'youtube': 'youtube.com', 'tiktok': 'tiktok.com', 'instagram': 'instagram.com',
    'facebook': 'facebook.com', 'twitter': 'twitter.com', 'reddit': 'reddit.com',
    'snapchat': 'snapchat.com', 'roblox': 'roblox.com', 'twitch': 'twitch.tv',
    'discord': 'discord.com', 'pinterest': 'pinterest.com', 'tumblr': 'tumblr.com',
    'whatsapp': 'web.whatsapp.com', 'telegram': 'web.telegram.org',
    'netflix': 'netflix.com', 'hulu': 'hulu.com', 'spotify': 'spotify.com',
    'fortnite': 'fortnite.com', 'minecraft': 'minecraft.net',
    'steam': 'store.steampowered.com', 'poker': 'poker.com', 'bet365': 'bet365.com',
  };

  for (const [name, domain] of Object.entries(SITE_MAP)) {
    if (text.includes(name)) {
      const p = `*${domain}*`;
      if (!patterns.includes(p)) patterns.push(p);
    }
  }

  const domainRegex = /([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/g;
  let match;
  while ((match = domainRegex.exec(text)) !== null) {
    if (['e.g', 'i.e', 'etc.com'].includes(match[1])) continue;
    const p = `*${match[1]}*`;
    if (!patterns.includes(p)) patterns.push(p);
  }

  return patterns;
}

// ── Core Event Processing Pipeline ──────────────────────────────

async function processEvent(rawEvent, tabId) {
  const startTime = performance.now();

  // 1. Create typed event
  const event = createEvent({
    eventType: rawEvent.event_type,
    tabId,
    url: rawEvent.url,
    domain: rawEvent.domain,
    payload: rawEvent.payload || {},
    profileId: profileTier,
  });

  // 2. Update session state
  sessionState = updateSessionState(sessionState, event);

  // 3. Check parent-defined rules first (fast path)
  const rules = await getRules();
  const ruleMatch = checkParentRules(event, rules);
  if (ruleMatch) {
    const decision = {
      action: ruleMatch.action,
      scores: { harm: 100, compulsion: 0 },
      top_reasons: [`parent_rule:${ruleMatch.rule}`],
      message_child: ruleMatch.message_child,
      message_parent: ruleMatch.message_parent,
      cooldown_seconds: 0,
      hard_trigger: 'parent_rule',
      timestamp: Date.now(),
    };

    const logRecord = logger.log(event, decision);
    logRecord.model.latency_ms = Math.round(performance.now() - startTime);
    event._decision = decision;
    eventBuffer.push(event);

    return decision;
  }

  // 4. Semantic parse (Content Harm Lane input)
  const parsed = semanticParse(event);

  // 5. Content Harm Lane: HarmRisk scoring
  const harmResult = computeHarmRisk(parsed, eventBuffer, profileTier);

  // 6. Attention Harm Lane: CompulsionRisk scoring
  const compulsionResult = computeCompulsionRisk(parsed, eventBuffer, sessionState);

  // 7. Check escalation triggers (for parent alerts)
  let escalation = null;
  if (harmResult.detailed_reasons?.length > 0) {
    const topCategory = harmResult.detailed_reasons[0].category;
    escalation = checkEscalationTriggers(topCategory, eventBuffer);
  }

  // 8. Policy engine: map scores → action
  const decision = makeDecision({
    harmResult,
    compulsionResult,
    semanticParse: parsed,
    profileTier,
    parentOverrides: {},
    escalation,
  });

  // 9. Log the decision
  const logRecord = logger.log(event, decision);
  logRecord.model.latency_ms = Math.round(performance.now() - startTime);

  // 10. Track in event buffer (for repetition detection)
  event._decision = decision;
  eventBuffer.push(event);

  // 11. Update intervention count
  if (decision.action !== ACTIONS.ALLOW) {
    sessionState.interventions_today++;
  }

  console.log(`[Phylax] ${event.event_type} on ${event.source.domain}: harm=${decision.scores.harm} compulsion=${decision.scores.compulsion} → ${decision.action} (${Math.round(logRecord.model.latency_ms)}ms)`);

  return decision;
}

// ── Message Handling ────────────────────────────────────────────

// Messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Core pipeline: process events from observer.js
  if (message.type === 'PHYLAX_PROCESS_EVENT') {
    const tabId = sender.tab?.id;
    processEvent(message.event, tabId).then(decision => {
      sendResponse({ decision });
    });
    return true; // async
  }

  // Dashboard bridge messages (from bridge.js)
  if (message.type && message.type.startsWith('PHYLAX_')) {
    handleDashboardMessage(message, sendResponse);
    return true;
  }

  // Legacy: rules request
  if (message.type === 'GET_PHYLAX_RULES') {
    getRules().then(rules => sendResponse({ rules }));
    return true;
  }

  // Popup requesting engine status
  if (message.type === 'GET_PHYLAX_STATUS') {
    handleStatusRequest(sendResponse);
    return true;
  }
});

// Messages from the web app (via externally_connectable)
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
          engine: 'two-lane-v1',
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
  const summary = logger.getTodaySummary();
  const stats = logger.getStats();

  sendResponse({
    engine: 'two-lane-v1',
    profile: profileTier,
    rules_count: rules.length,
    active_rules: rules.filter(r => r.active).length,
    session: {
      start: sessionState.session_start,
      active_minutes: sessionState.today_active_minutes,
      interventions: sessionState.interventions_today,
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

// ── Tab navigation tracking ─────────────────────────────────────

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return; // Only main frame

  // Process as a PAGE_LOAD event
  const url = details.url;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;

  // Skip Phylax dashboard
  try {
    const domain = new URL(url).hostname;
    if (['phylax-landing.vercel.app', 'localhost', '127.0.0.1'].includes(domain)) return;
  } catch { return; }

  const decision = await processEvent({
    event_type: 'PAGE_LOAD',
    url,
    domain: new URL(url).hostname,
    payload: { title: '', text: '', content_type_hint: 'unknown' },
  }, details.tabId);

  // If the decision requires enforcement, send to the tab
  if (decision && decision.action !== ACTIONS.ALLOW) {
    try {
      chrome.tabs.sendMessage(details.tabId, {
        type: 'PHYLAX_ENFORCE_DECISION',
        decision,
      });
    } catch (_) {}
  }
});

// ── Initialization ──────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Phylax] Engine installed — Two-Lane Safety Engine v1');
  profileTier = await getProfileTier();
  await logger.restore();
  const rules = await getRules();
  if (rules.length > 0) {
    await updateDeclarativeNetRequestRules(rules);
    console.log('[Phylax] Restored', rules.length, 'rules');
  }
});

// Restore state on service worker wake
(async () => {
  profileTier = await getProfileTier();
  await logger.restore();
  const rules = await getRules();
  if (rules.length > 0) {
    await updateDeclarativeNetRequestRules(rules);
  }
  console.log('[Phylax] Service worker ready. Profile:', profileTier, '| Events buffered:', eventBuffer.size);
})();

// Persist logs periodically
setInterval(() => {
  logger.persist();
}, 60000); // Every minute
