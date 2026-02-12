// Phylax Engine — Behavior Intelligence Layer
// Tracks session state and detects addiction patterns.
// Behavioral rules output LIMIT (never BLOCK).

// ── Session State ────────────────────────────────────────────

export function createSessionState() {
  return {
    session_start_ms: Date.now(),
    domain_time_ms: {},           // domain → cumulative ms
    page_hops_last_5m: 0,
    page_hop_timestamps: [],      // timestamps of recent page hops
    scroll_events_last_60s: 0,
    scroll_timestamps: [],        // timestamps of recent scrolls
    short_form_streak: 0,
    last_interaction_ms: Date.now(),
    last_domain: null,
    last_domain_start_ms: Date.now(),
  };
}

export function updateSessionState(state, event) {
  const now = Date.now();

  // Track domain time
  if (state.last_domain && state.last_domain_start_ms) {
    const elapsed = now - state.last_domain_start_ms;
    state.domain_time_ms[state.last_domain] =
      (state.domain_time_ms[state.last_domain] || 0) + elapsed;
  }

  // Page navigation tracking
  if (event.event_type === 'PAGE_LOAD') {
    state.last_domain = event.domain;
    state.last_domain_start_ms = now;

    // Track page hops (last 5 minutes)
    state.page_hop_timestamps.push(now);
    const fiveMinAgo = now - 300000;
    state.page_hop_timestamps = state.page_hop_timestamps.filter(t => t > fiveMinAgo);
    state.page_hops_last_5m = state.page_hop_timestamps.length;

    // Short-form streak
    const isShort = event.content_type === 'video' &&
      (event.url?.includes('/shorts') || event.ui?.short_form);
    if (isShort) {
      state.short_form_streak++;
    } else {
      state.short_form_streak = 0;
    }
  }

  // Scroll tracking
  if (event.event_type === 'FEED_SCROLL') {
    state.scroll_timestamps.push(now);
    const oneMinAgo = now - 60000;
    state.scroll_timestamps = state.scroll_timestamps.filter(t => t > oneMinAgo);
    state.scroll_events_last_60s = state.scroll_timestamps.length;
  }

  // Any interaction resets idle
  state.last_interaction_ms = now;

  return state;
}

// ── Behavior Pattern Scoring ─────────────────────────────────

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function isLateNight() {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 6;
}

/**
 * Compute behavior pattern scores from session state and content.
 * Returns { pattern_name: 0..1 } scores.
 */
export function behaviorScores(state, contentUI) {
  const scrollBinge = sigmoid((state.scroll_events_last_60s - 120) / 40);
  const rapidHop = sigmoid((state.page_hops_last_5m - 10) / 3);
  const shortBinge = sigmoid((state.short_form_streak - 8) / 2);
  const lateNight = isLateNight() ? 1 : 0;

  return {
    infinite_scroll_binge: contentUI?.infinite_scroll ? scrollBinge : 0,
    rapid_hop: rapidHop,
    short_binge: contentUI?.short_form ? shortBinge : 0,
    late_night: lateNight,
  };
}

/**
 * Evaluate behavior policy rules against pattern scores.
 * Returns a LIMIT DecisionObject or null.
 */
export function evalBehaviorPolicy(bScores, behaviorRules) {
  if (!behaviorRules || behaviorRules.length === 0) return null;

  let best = null;

  for (const rule of behaviorRules) {
    const score = bScores[rule.pattern] ?? 0;
    if (score < 0.75) continue; // fixed behavior trigger threshold

    const technique = rule.pattern.includes('scroll') ? 'scroll_gate'
      : rule.pattern.includes('short') ? 'pause_autoplay'
      : 'time_gate';

    const candidate = {
      decision: 'LIMIT',
      reason_code: `BEHAVIOR_LIMIT_${rule.pattern}`,
      confidence: Math.round(score * 100) / 100,
      evidence: [`Detected ${rule.pattern} pattern (score=${Math.round(score * 100) / 100})`],
      enforcement: {
        layer: 'FEATURE',
        technique,
      },
      budget_minutes: rule.budget_minutes || null,
      cooldown_minutes: rule.cooldown_minutes || null,
    };

    if (!best || candidate.confidence > best.confidence) {
      best = candidate;
    }
  }

  return best;
}

/**
 * Get total session minutes for a domain.
 */
export function getDomainMinutes(state, domain) {
  return Math.round((state.domain_time_ms[domain] || 0) / 60000);
}
