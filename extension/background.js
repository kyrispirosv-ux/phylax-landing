// Phylax SafeGuard — Background Service Worker (Module-based Orchestrator)
// Two-lane safety engine: Content Harm + Attention Compulsion → Policy → Enforcement

import { createEvent, EventBuffer } from './engine/events.js';
import { semanticParse } from './engine/semantic.js';
import { computeHarmRisk, checkEscalationTriggers } from './engine/harm-scorer.js';
import { computeCompulsionRisk, createSessionState, updateSessionState } from './engine/compulsion-scorer.js';
import { makeDecision, checkParentRules, ACTIONS } from './engine/policy-engine.js';
import { DecisionLogger } from './engine/logger.js';
import { compileRules, evaluateRules, extractDNRPatterns, RULE_ACTIONS, getDebugLog, clearDebugLog } from './engine/rule-compiler.js';

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
    chrome.tabs.sendMessage(tab.id, { type: 'PHYLAX_RULES_UPDATED', rules }).catch(() => {});
  }
}

// ── Compiled rules cache ─────────────────────────────────────────
let compiledRulesCache = [];

function getCompiledRules() {
  return compiledRulesCache;
}

async function recompileRules(rules) {
  compiledRulesCache = compileRules(rules);
  console.log('[Phylax] Rules compiled:', compiledRulesCache.length, 'rules →',
    compiledRulesCache.map(r => `${r.id}:${r.action.type}`).join(', '));
  return compiledRulesCache;
}

// ── Declarative Net Request (URL-level blocking) ────────────────
// ONLY creates network-level blocks for BLOCK_DOMAIN rules (never content-scoped rules)

async function updateDeclarativeNetRequestRules(rules) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map(r => r.id);

  // Compile rules and extract ONLY domain-level block patterns
  const compiled = await recompileRules(rules);
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
    console.log(`[Phylax] DNR pattern: "${pattern}" from rule "${ruleText}" (${srcRuleId})`);
  }

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules: addRules,
    });
    console.log('[Phylax] DNR rules updated:', addRules.length, '(only BLOCK_DOMAIN rules)');
  } catch (e) {
    console.error('[Phylax] DNR error:', e);
  }
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

  // 3. Check compiled parent-defined rules (smart path)
  const compiled = getCompiledRules();
  const pageContent = rawEvent.payload?.text || rawEvent.payload?.title || '';
  const ruleResult = evaluateRules(compiled, rawEvent.url, rawEvent.domain, pageContent);

  console.log(`[Phylax] Rule evaluation for ${rawEvent.domain}: action=${ruleResult.action}, reason=${ruleResult.reason}`);

  if (ruleResult.action === RULE_ACTIONS.BLOCK_DOMAIN) {
    const matchedRule = ruleResult.matchedRules[0]?.rule;
    const decision = {
      action: 'BLOCK',
      scores: { harm: 100, compulsion: 0 },
      top_reasons: [`parent_rule:${matchedRule?.source_text || 'unknown'}`],
      message_child: matchedRule?.explain?.child || 'This site is blocked by your family\'s safety rules.',
      message_parent: matchedRule?.explain?.parent || 'Domain blocked by parent rule.',
      cooldown_seconds: 0,
      hard_trigger: 'parent_rule',
      rule_debug: {
        compiled_rule: matchedRule,
        evaluation: ruleResult.reason,
        all_results: ruleResult.debug?.map(r => ({ id: r.rule.id, matched: r.matched, action: r.action, reason: r.reason })),
      },
      timestamp: Date.now(),
    };

    const logRecord = logger.log(event, decision);
    logRecord.model.latency_ms = Math.round(performance.now() - startTime);
    event._decision = decision;
    eventBuffer.push(event);
    return decision;
  }

  if (ruleResult.action === RULE_ACTIONS.BLOCK_CONTENT) {
    const matchedRule = ruleResult.matchedRules[0]?.rule;
    const decision = {
      action: 'BLOCK',
      scores: { harm: 80, compulsion: 0 },
      top_reasons: [`content_rule:${matchedRule?.source_text || 'unknown'}`],
      message_child: matchedRule?.explain?.child || 'This content has been blocked by your family\'s safety rules.',
      message_parent: matchedRule?.explain?.parent || 'Content blocked by parent rule.',
      cooldown_seconds: 0,
      hard_trigger: 'content_rule',
      rule_debug: {
        compiled_rule: matchedRule,
        evaluation: ruleResult.reason,
        confidence: ruleResult.confidence,
        all_results: ruleResult.debug?.map(r => ({ id: r.rule.id, matched: r.matched, action: r.action, reason: r.reason })),
      },
      timestamp: Date.now(),
    };

    const logRecord = logger.log(event, decision);
    logRecord.model.latency_ms = Math.round(performance.now() - startTime);
    event._decision = decision;
    eventBuffer.push(event);
    return decision;
  }

  if (ruleResult.action === RULE_ACTIONS.WARN_CONTENT) {
    const matchedRule = ruleResult.matchedRules[0]?.rule;
    const decision = {
      action: 'WARN',
      scores: { harm: 50, compulsion: 0 },
      top_reasons: [`content_warn:${matchedRule?.source_text || 'unknown'}`],
      message_child: matchedRule?.explain?.child || 'This content may not be appropriate.',
      message_parent: matchedRule?.explain?.parent || 'Content warning from parent rule.',
      cooldown_seconds: 0,
      rule_debug: {
        compiled_rule: matchedRule,
        evaluation: ruleResult.reason,
        confidence: ruleResult.confidence,
        all_results: ruleResult.debug?.map(r => ({ id: r.rule.id, matched: r.matched, action: r.action, reason: r.reason })),
      },
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

  // Legacy: rules request
  if (message.type === 'GET_PHYLAX_RULES') {
    getRules().then(rules => sendResponse({ rules }));
    return true;
  }

  // Get compiled rules (for debug panel)
  if (message.type === 'GET_PHYLAX_COMPILED_RULES') {
    sendResponse({ compiledRules: getCompiledRules() });
    return true;
  }

  // Get rule compiler debug log
  if (message.type === 'GET_PHYLAX_DEBUG_LOG') {
    sendResponse({ debugLog: getDebugLog() });
    return true;
  }

  // Clear debug log
  if (message.type === 'CLEAR_PHYLAX_DEBUG_LOG') {
    clearDebugLog();
    sendResponse({ success: true });
    return true;
  }

  // Test rule compilation (for debug panel)
  if (message.type === 'PHYLAX_TEST_COMPILE_RULE') {
    import('./engine/rule-compiler.js').then(({ compileRule }) => {
      const compiled = compileRule(message.ruleText);
      sendResponse({ compiled });
    });
    return true;
  }

  // Popup requesting engine status
  if (message.type === 'GET_PHYLAX_STATUS') {
    handleStatusRequest(sendResponse);
    return true;
  }

  // Dashboard bridge messages (from bridge.js) — catch-all for PHYLAX_ prefixed messages
  if (message.type && message.type.startsWith('PHYLAX_')) {
    handleDashboardMessage(message, sendResponse);
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
  const compiled = getCompiledRules();
  const summary = logger.getTodaySummary();
  const stats = logger.getStats();

  sendResponse({
    engine: 'two-lane-v2',
    profile: profileTier,
    rules_count: rules.length,
    active_rules: rules.filter(r => r.active).length,
    compiled_rules: compiled.map(r => ({
      id: r.id,
      source_text: r.source_text,
      action: r.action.type,
      scope: r.scope,
      priority: r.priority,
      _compiled: r._compiled,
      _errors: r._errors,
    })),
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

// Early blocking: onCommitted fires as soon as navigation commits (before page renders)
// ONLY blocks for BLOCK_DOMAIN rules (not content-scoped rules)
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const url = details.url;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) return;

  try {
    const domain = new URL(url).hostname;
    if (['phylax-landing.vercel.app', 'localhost', '127.0.0.1'].includes(domain)) return;

    // Fast-path: only check compiled rules for BLOCK_DOMAIN actions
    // Content-scoped rules need page content, so they wait for onCompleted
    const compiled = getCompiledRules();
    const result = evaluateRules(compiled, url, domain, '');

    if (result.action === RULE_ACTIONS.BLOCK_DOMAIN) {
      const matchedRule = result.matchedRules[0]?.rule;
      console.log(`[Phylax] Early block: ${domain} matched BLOCK_DOMAIN rule: "${matchedRule?.source_text}"`);
      chrome.tabs.sendMessage(details.tabId, {
        type: 'PHYLAX_ENFORCE_DECISION',
        decision: {
          action: 'BLOCK',
          scores: { harm: 100, compulsion: 0 },
          top_reasons: [`parent_rule:${matchedRule?.source_text || 'unknown'}`],
          message_child: matchedRule?.explain?.child || 'This site is blocked by your family\'s safety rules.',
          hard_trigger: 'parent_rule',
          rule_debug: { compiled_rule: matchedRule, evaluation: result.reason },
        },
      }).catch(() => {});
    }
    // NOTE: BLOCK_CONTENT and WARN_CONTENT are NOT enforced here —
    // they need page content analysis which happens in onCompleted
  } catch { /* ignore */ }
});

// Full analysis: onCompleted fires after page loads (for content analysis)
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
    chrome.tabs.sendMessage(details.tabId, {
      type: 'PHYLAX_ENFORCE_DECISION',
      decision,
    }).catch(() => {});
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
