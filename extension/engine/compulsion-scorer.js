// Phylax Engine — Compulsion/Attention Risk Scorer
// Two components: Behavioral compulsion + Hook-based compulsion

import { HOOK_TYPES, BEHAVIOR_WEIGHTS } from './taxonomy.js';

// ── Main scoring function ───────────────────────────────────────

export function computeCompulsionRisk(semanticParse, eventBuffer, sessionState) {
  const behaviorScore = computeBehaviorScore(eventBuffer, sessionState);
  const hookScore = computeHookScore(semanticParse);
  const historyScore = computeHistoryScore(sessionState);

  // CompulsionRisk = 100 * sigmoid(alpha * (B + H + History) - beta)
  const alpha = 2.5;
  const beta = 1.5;
  const raw = alpha * (behaviorScore + hookScore + historyScore) - beta;
  const score = Math.round(100 * sigmoid(raw));

  return {
    score: Math.min(100, Math.max(0, score)),
    behavior_score: Math.round(behaviorScore * 100),
    hook_score: Math.round(hookScore * 100),
    history_score: Math.round(historyScore * 100),
    behavior_features: computeBehaviorFeatures(eventBuffer, sessionState),
    hook_features: computeHookFeatures(semanticParse),
  };
}

// ── Behavioral compulsion score ─────────────────────────────────

function computeBehaviorScore(eventBuffer, sessionState) {
  const features = computeBehaviorFeatures(eventBuffer, sessionState);
  let score = 0;

  for (const [feature, weight] of Object.entries(BEHAVIOR_WEIGHTS)) {
    score += weight * (features[feature] || 0);
  }

  return Math.min(1.0, Math.max(0.0, score));
}

function computeBehaviorFeatures(eventBuffer, sessionState) {
  if (!eventBuffer || !sessionState) {
    return {
      session_length: 0, night_use: 0, rapid_scroll: 0,
      tab_thrash: 0, notification_open_latency: 0,
      repeat_reopen: 0, binge: 0,
    };
  }

  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;
  const thirtyMin = 30 * 60 * 1000;

  // Session length (normalized: 0 at 0min, 1 at 120min+)
  const sessionMinutes = (now - (sessionState.session_start || now)) / 60000;
  const session_length = Math.min(1.0, sessionMinutes / 120);

  // Night use (1.0 if between 10pm-6am, 0 otherwise)
  const hour = new Date().getHours();
  const night_use = (hour >= 22 || hour < 6) ? 1.0 : 0.0;

  // Rapid scroll (scroll events per minute in last 5 min)
  const scrollEvents = eventBuffer.countType('FEED_SCROLL', fiveMin);
  const rapid_scroll = Math.min(1.0, scrollEvents / 30); // 30 scrolls/5min = max

  // Tab thrash (tab switches in last 5 min)
  const tabSwitches = eventBuffer.countType('TAB_SWITCH', fiveMin);
  const tab_thrash = Math.min(1.0, tabSwitches / 15);

  // Notification open latency (inverse: fast opens = high)
  const avgLatency = sessionState.avg_notification_latency || 30000; // default 30s
  const notification_open_latency = Math.min(1.0, Math.max(0.0, 1.0 - (avgLatency / 60000)));

  // Repeat reopen (how many times same domain visited in 30 min)
  const pageLoads = eventBuffer.countType('PAGE_LOAD', thirtyMin);
  const repeat_reopen = Math.min(1.0, pageLoads / 20);

  // Binge (total active minutes today)
  const todayMinutes = sessionState.today_active_minutes || 0;
  const binge = Math.min(1.0, todayMinutes / 180); // 3 hours = max

  return {
    session_length,
    night_use,
    rapid_scroll,
    tab_thrash,
    notification_open_latency,
    repeat_reopen,
    binge,
  };
}

// ── Hook-based compulsion score ─────────────────────────────────

function computeHookScore(semanticParse) {
  const features = computeHookFeatures(semanticParse);
  let score = 0;

  for (const [hookType, { weight }] of Object.entries(HOOK_TYPES)) {
    score += weight * (features[hookType] || 0);
  }

  return Math.min(1.0, Math.max(0.0, score));
}

function computeHookFeatures(semanticParse) {
  if (!semanticParse?.content) {
    return {};
  }

  const content = semanticParse.content;
  const contentType = content.content_type_hint || 'unknown';
  const text = ''; // We work from the parsed features
  const features = {};

  // Short-form loop: feed content with video
  features.short_form_loop =
    (contentType === 'feed' || contentType === 'video') ? 0.8 : 0.0;

  // Outrage bait: high arousal + negative sentiment + harmful stance
  const arousal = content.sentiment?.arousal || 0;
  const valence = content.sentiment?.valence || 0;
  const harmful = content.stance?.harmful || 0;
  features.outrage_bait =
    (arousal > 0.5 && valence < -0.2 && harmful > 0.3) ? 0.7 : 0.0;

  // Sexualized content
  const explicitness = content.explicitness || {};
  features.sexualized_content =
    explicitness.sexual === 'suggestive' ? 0.5 :
    explicitness.sexual === 'explicit' ? 0.9 : 0.0;

  // Validation bait: social feed with likes/comments culture
  features.validation_bait =
    (contentType === 'social' || contentType === 'feed') ? 0.4 : 0.0;

  // Gambling-like reward
  const isGambling = (content.policy_category || []).some(c =>
    c.label === 'gambling' && c.p > 0.3
  );
  features.gambling_like_reward = isGambling ? 0.8 : 0.0;

  // Parasocial pull
  features.parasocial_pull =
    (contentType === 'video' || contentType === 'social') ? 0.3 : 0.0;

  // Doomscroll topic
  const hasDoomTopics = (content.topic_labels || []).some(t =>
    ['violence', 'extremism', 'hate'].includes(t.label) && t.p > 0.3
  );
  features.doomscroll_topic = hasDoomTopics ? 0.6 : 0.0;

  return features;
}

// ── History score (interventions today) ─────────────────────────

function computeHistoryScore(sessionState) {
  if (!sessionState) return 0;

  const interventionsToday = sessionState.interventions_today || 0;
  // More interventions = higher base compulsion score
  return Math.min(0.3, interventionsToday * 0.05);
}

// ── Sigmoid helper ──────────────────────────────────────────────

function sigmoid(x) {
  return 1.0 / (1.0 + Math.exp(-x));
}

// ── Session state management ────────────────────────────────────

export function createSessionState() {
  return {
    session_start: Date.now(),
    today_active_minutes: 0,
    interventions_today: 0,
    avg_notification_latency: 30000,
    last_activity: Date.now(),
    domains_visited_today: new Set(),
  };
}

export function updateSessionState(state, event) {
  if (!state) return createSessionState();

  state.last_activity = Date.now();

  // Track active minutes (rough: assume active if events within 2 min)
  const elapsed = (Date.now() - state.session_start) / 60000;
  state.today_active_minutes = Math.round(elapsed);

  // Track unique domains
  if (event.source?.domain) {
    state.domains_visited_today.add(event.source.domain);
  }

  return state;
}
