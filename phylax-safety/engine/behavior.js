// Phylax Engine — Behavior Intelligence
// Tracks session state and computes behavior pattern scores
// using sigmoid-based scoring functions.
// Behavior rules only output LIMIT (never block).

// ── SessionState ──────────────────────────────────────────────────

export function createSessionState() {
  return {
    session_start_ms: Date.now(),
    domain_time_ms: {},           // domain → cumulative ms
    page_hops_last_5m: 0,
    scroll_events_last_60s: 0,
    short_form_streak: 0,
    last_interaction_ms: Date.now(),
    today_active_minutes: 0,
    // Internal tracking arrays (pruned periodically)
    _hops: [],         // timestamps of page loads
    _scrolls: [],      // timestamps of scroll events
    _last_domain: null,
    _last_domain_start: 0,
  };
}

/**
 * Update session state with a new event.
 * Call this for every event processed.
 */
export function updateSessionState(state, event) {
  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;
  const oneMin = 60 * 1000;

  // Track domain time
  const domain = event.source?.domain || '';
  if (state._last_domain && state._last_domain !== domain) {
    const elapsed = now - state._last_domain_start;
    state.domain_time_ms[state._last_domain] =
      (state.domain_time_ms[state._last_domain] || 0) + elapsed;
  }
  if (domain !== state._last_domain) {
    state._last_domain = domain;
    state._last_domain_start = now;
  }

  // Track page hops (PAGE_LOAD events)
  if (event.event_type === 'PAGE_LOAD') {
    state._hops.push(now);
    // Prune old hops
    state._hops = state._hops.filter(t => now - t < fiveMin);
    state.page_hops_last_5m = state._hops.length;
  }

  // Track scroll events
  if (event.event_type === 'FEED_SCROLL') {
    state._scrolls.push(now);
    state._scrolls = state._scrolls.filter(t => now - t < oneMin);
    state.scroll_events_last_60s = state._scrolls.length;
  }

  // Track short-form streaks (video content under certain duration)
  const contentType = event.payload?.content_type_hint || event.payload?.content_type;
  const isShortForm = event.payload?.ui?.short_form ||
    contentType === 'video' && (event.source?.url || '').includes('/shorts');
  if (event.event_type === 'PAGE_LOAD' && isShortForm) {
    state.short_form_streak++;
  } else if (event.event_type === 'PAGE_LOAD' && !isShortForm) {
    state.short_form_streak = 0;
  }

  // Active minutes (approximate: count TIME_TICK events)
  if (event.event_type === 'TIME_TICK') {
    state.today_active_minutes++;
  }

  state.last_interaction_ms = now;
  return state;
}

// ── Scoring Functions ─────────────────────────────────────────────

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function isLateNight() {
  const hour = new Date().getHours();
  return hour >= 23 || hour < 5;
}

/**
 * Compute behavior pattern scores.
 * Returns Record<string, number> with scores 0..1.
 */
export function behaviorScores(state, contentUi) {
  const ui = contentUi || {};

  const scrollBinge = ui.infinite_scroll
    ? sigmoid((state.scroll_events_last_60s - 120) / 40)
    : 0;

  const rapidHop = sigmoid((state.page_hops_last_5m - 10) / 3);

  const shortBinge = ui.short_form
    ? sigmoid((state.short_form_streak - 8) / 2)
    : 0;

  const lateNight = isLateNight() ? 1 : 0;

  return {
    infinite_scroll_binge: scrollBinge,
    rapid_hop: rapidHop,
    short_binge: shortBinge,
    late_night: lateNight,
  };
}

/**
 * Evaluate behavior rules against pattern scores.
 * Returns a LIMIT DecisionObject or null.
 * Behavior rules only output LIMIT (never block).
 */
export function evalBehaviorRules(patternScores, behaviorRules) {
  if (!behaviorRules || behaviorRules.length === 0) return null;

  let best = null;

  for (const rule of behaviorRules) {
    const s = patternScores[rule.pattern] || 0;
    if (s < 0.75) continue; // fixed behavior trigger threshold

    const technique = rule.pattern.includes('scroll') ? 'scroll_gate'
      : rule.pattern.includes('short') ? 'pause_autoplay'
      : 'time_gate';

    const candidate = {
      decision: 'LIMIT',
      reason_code: `BEHAVIOR_LIMIT_${rule.pattern}`,
      confidence: s,
      evidence: [`Detected ${rule.pattern} pattern (score=${s.toFixed(2)})`],
      enforcement: {
        layer: 'FEATURE',
        technique,
      },
    };

    if (!best || s > best.confidence) {
      best = candidate;
    }
  }

  return best;
}
