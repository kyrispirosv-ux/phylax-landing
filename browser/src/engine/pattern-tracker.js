// Phylax Engine — Pattern Tracker v1.0
//
// Multi-message pattern detection that catches what single-message
// analysis misses: grooming trajectories, escalation trends,
// repeated harm-seeking, bypass attempts, and sustained manipulation.
//
// Architecture:
//   - Rolling conversation buffer per platform/thread (ring buffer, 50 msgs)
//   - Session storage (chrome.storage.session) for within-session state
//   - Local storage (chrome.storage.local) for cross-platform correlation
//   - Integrates with grooming-detector.js (extends, never replaces)
//
// Exports:
//   trackSignal(signal, semanticResult) -> PatternResult
//   getConversationContext(platform, threadId) -> recent messages
//
// Privacy-first: session buffers cleared on browser close.
// Efficient: O(1) ring buffer ops, no full-history scans.

import {
  detectGrooming,
  normalizeText,
  createConversationState,
} from './grooming-detector.js';


// ═════════════════════════════════════════════════════════════════
// CONSTANTS
// ═════════════════════════════════════════════════════════════════

const BUFFER_SIZE = 50;                    // messages per thread
const ESCALATION_WINDOW = 20;             // last N messages for trend analysis
const GROOMING_WINDOW = 30;               // last N messages for grooming trajectory
const CROSS_PLATFORM_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days
const PATTERN_DEBOUNCE_MS = 500;          // min gap between pattern evals on same thread
const MAX_THREADS_IN_SESSION = 100;       // evict oldest if exceeded
const MAX_CROSS_PLATFORM_ENTRIES = 200;

// Grooming stage model (maps to grooming-detector.js stages)
// Collapsed from the 9-stage model into a 5-stage trajectory model
// for pattern tracking purposes.
const TRAJECTORY_STAGES = {
  1: { name: 'trust_building', label: 'Trust-Building', groomingStages: ['trust_building'] },
  2: { name: 'isolation',      label: 'Isolation & Secrecy', groomingStages: ['isolation'] },
  3: { name: 'boundary_push',  label: 'Boundary Testing & Normalization', groomingStages: ['boundary_testing', 'normalization', 'age_exploitation'] },
  4: { name: 'escalation',     label: 'Escalation & Dependency', groomingStages: ['escalation', 'dependency', 'meeting_logistics'] },
  5: { name: 'exploitation',   label: 'Coercion & Exploitation', groomingStages: ['coercion', 'gaslighting', 'threats'] },
};

// Reverse lookup: grooming stage -> trajectory stage index
const GROOMING_TO_TRAJECTORY = {};
for (const [idx, def] of Object.entries(TRAJECTORY_STAGES)) {
  for (const gs of def.groomingStages) {
    GROOMING_TO_TRAJECTORY[gs] = parseInt(idx, 10);
  }
}

// Bypass attempt indicators
const BYPASS_PATTERNS = [
  /\b(?:jailbreak|dan\s+mode|developer\s+mode|ignore\s+(?:previous|above|all)\s+(?:instructions?|prompts?|rules?))\b/i,
  /\b(?:pretend\s+you\s+(?:are|have)\s+no\s+(?:restrictions?|filters?|limits?))\b/i,
  /\b(?:bypass|circumvent|disable|turn\s+off|remove)\s+(?:filter|safety|moderation|parental|restriction|block)/i,
  /\b(?:vpn|proxy|tor\s+browser|incognito|private\s+(?:browsing|mode|window))\b/i,
  /\b(?:unblock|access\s+blocked|get\s+around|work\s+around)\s+(?:site|website|content|page|filter)/i,
  /\b(?:how\s+to\s+(?:hide|clear|delete)\s+(?:browsing|search|web)\s+(?:history|data))\b/i,
  /\b(?:alt(?:ernate|ernative)?\s+(?:account|profile|identity))\b/i,
];

// Harmful topic categories for repeated-harm detection
const HARM_CATEGORIES = [
  'self_harm', 'suicide', 'eating_disorder', 'drugs',
  'weapons', 'violence', 'explicit_sexual', 'extremism',
];


// ═════════════════════════════════════════════════════════════════
// RING BUFFER — O(1) append, O(n) window read
// ═════════════════════════════════════════════════════════════════

/**
 * Create a fixed-size ring buffer for conversation messages.
 * Avoids array resizing and shift() costs.
 */
function createRingBuffer(capacity) {
  return {
    capacity,
    items: new Array(capacity),
    head: 0,       // next write position
    count: 0,      // current item count
  };
}

/**
 * Push a message into the ring buffer, overwriting oldest if full.
 */
function ringPush(buf, item) {
  buf.items[buf.head] = item;
  buf.head = (buf.head + 1) % buf.capacity;
  if (buf.count < buf.capacity) buf.count++;
}

/**
 * Read last N items from the ring buffer in chronological order.
 * Returns a new array (no mutation).
 */
function ringRead(buf, n) {
  const count = Math.min(n || buf.count, buf.count);
  if (count === 0) return [];

  const result = new Array(count);
  // Start index: head points to next write, so oldest is at head (if full)
  // or at 0 (if not full). Newest is at head - 1.
  const start = buf.count < buf.capacity
    ? buf.count - count
    : (buf.head - count + buf.capacity) % buf.capacity;

  for (let i = 0; i < count; i++) {
    result[i] = buf.items[(start + i) % buf.capacity];
  }
  return result;
}

/**
 * Serialize ring buffer for storage (strips nulls).
 */
function ringSerialize(buf) {
  return {
    capacity: buf.capacity,
    items: ringRead(buf),
    count: buf.count,
  };
}

/**
 * Deserialize ring buffer from storage.
 */
function ringDeserialize(data) {
  if (!data) return createRingBuffer(BUFFER_SIZE);
  const buf = createRingBuffer(data.capacity || BUFFER_SIZE);
  const items = data.items || [];
  for (const item of items) {
    if (item) ringPush(buf, item);
  }
  return buf;
}


// ═════════════════════════════════════════════════════════════════
// IN-MEMORY THREAD STATE
// ═════════════════════════════════════════════════════════════════
//
// Primary data structure: Map<threadKey, ThreadState>
// Thread state lives in memory during the session and is
// persisted to chrome.storage.session periodically.

const _threadStates = new Map();
let _lastPersistMs = 0;
const PERSIST_INTERVAL_MS = 5000;  // batch storage writes

/**
 * Build a stable thread key from platform + threadId.
 */
function threadKey(platform, threadId) {
  return `${platform}::${threadId || 'default'}`;
}

/**
 * Get or create thread state for a given thread.
 */
function getThreadState(platform, threadId) {
  const key = threadKey(platform, threadId);
  let state = _threadStates.get(key);
  if (!state) {
    state = createThreadState(platform, threadId);
    _threadStates.set(key, state);
    enforceThreadLimit();
  }
  return state;
}

/**
 * Create a fresh thread state.
 */
function createThreadState(platform, threadId) {
  return {
    platform,
    thread_id: threadId,
    created_at: Date.now(),
    updated_at: Date.now(),
    last_eval_ms: 0,
    // Conversation buffer
    buffer: createRingBuffer(BUFFER_SIZE),
    // Grooming trajectory (from grooming-detector.js)
    grooming_state: createConversationState(),
    // Pattern-specific accumulators
    grooming_trajectory: {
      stage_history: [],         // [{ts, stage_index, confidence}]
      current_stage: 0,
      peak_stage: 0,
      stage_confidence: [0, 0, 0, 0, 0, 0],  // indices 1-5 used
    },
    // Harm topic tracking
    harm_topic_counts: {},       // category -> count
    // Bypass tracking
    bypass_attempts: [],         // [{ts, pattern_hint}]
    // Risk trend
    risk_history: [],            // [{ts, score}] last ESCALATION_WINDOW entries
    // Manipulation tracking
    manipulation_signals: [],    // [{ts, signal_id, weight}]
  };
}

/**
 * Evict oldest threads when we exceed MAX_THREADS_IN_SESSION.
 */
function enforceThreadLimit() {
  if (_threadStates.size <= MAX_THREADS_IN_SESSION) return;

  // Find and evict the oldest updated thread
  let oldestKey = null;
  let oldestTs = Infinity;
  for (const [key, state] of _threadStates) {
    if (state.updated_at < oldestTs) {
      oldestTs = state.updated_at;
      oldestKey = key;
    }
  }
  if (oldestKey) _threadStates.delete(oldestKey);
}


// ═════════════════════════════════════════════════════════════════
// STORAGE LAYER — chrome.storage.session + chrome.storage.local
// ═════════════════════════════════════════════════════════════════

/**
 * Check if chrome.storage APIs are available.
 */
function hasStorage() {
  return typeof chrome !== 'undefined' && chrome.storage;
}

/**
 * Persist thread states to session storage (batched).
 * Called after each trackSignal if enough time has passed.
 */
async function persistSession() {
  if (!hasStorage()) return;

  const now = Date.now();
  if (now - _lastPersistMs < PERSIST_INTERVAL_MS) return;
  _lastPersistMs = now;

  const serialized = {};
  for (const [key, state] of _threadStates) {
    serialized[`pt_${key}`] = {
      platform: state.platform,
      thread_id: state.thread_id,
      created_at: state.created_at,
      updated_at: state.updated_at,
      buffer: ringSerialize(state.buffer),
      grooming_state: state.grooming_state,
      grooming_trajectory: state.grooming_trajectory,
      harm_topic_counts: state.harm_topic_counts,
      bypass_attempts: state.bypass_attempts.slice(-20),
      risk_history: state.risk_history.slice(-ESCALATION_WINDOW),
      manipulation_signals: state.manipulation_signals.slice(-30),
    };
  }

  try {
    await chrome.storage.session.set(serialized);
  } catch {
    // Storage quota exceeded or unavailable — degrade gracefully
  }
}

/**
 * Restore thread states from session storage on startup.
 */
async function restoreSession() {
  if (!hasStorage()) return;

  try {
    const data = await chrome.storage.session.get(null);
    for (const [key, val] of Object.entries(data)) {
      if (!key.startsWith('pt_')) continue;
      const tKey = key.slice(3);
      const state = createThreadState(val.platform, val.thread_id);
      state.created_at = val.created_at;
      state.updated_at = val.updated_at;
      state.buffer = ringDeserialize(val.buffer);
      state.grooming_state = val.grooming_state || createConversationState();
      state.grooming_trajectory = val.grooming_trajectory || state.grooming_trajectory;
      state.harm_topic_counts = val.harm_topic_counts || {};
      state.bypass_attempts = val.bypass_attempts || [];
      state.risk_history = val.risk_history || [];
      state.manipulation_signals = val.manipulation_signals || [];
      _threadStates.set(tKey, state);
    }
  } catch {
    // Session storage unavailable — start fresh
  }
}

/**
 * Write cross-platform correlation data to local storage.
 * This survives browser restarts (unlike session storage).
 */
async function updateCrossPlatformState(platform, signal) {
  if (!hasStorage()) return;

  try {
    const { phylax_xplat = {} } = await chrome.storage.local.get('phylax_xplat');

    // Prune expired entries
    const now = Date.now();
    const entries = (phylax_xplat.entries || []).filter(
      e => now - e.ts < CROSS_PLATFORM_TTL_MS
    );

    // Add new entry
    entries.push({
      ts: now,
      platform,
      pattern_type: signal.pattern_type,
      confidence: signal.confidence,
      stage: signal.escalation_stage || null,
    });

    // Enforce size limit
    while (entries.length > MAX_CROSS_PLATFORM_ENTRIES) {
      entries.shift();
    }

    phylax_xplat.entries = entries;
    phylax_xplat.updated_at = now;

    await chrome.storage.local.set({ phylax_xplat });
  } catch {
    // Storage unavailable — skip cross-platform tracking
  }
}

/**
 * Read cross-platform correlation data.
 * Returns entries from OTHER platforms that correlate with
 * the given platform's activity.
 */
async function getCrossPlatformCorrelation(platform, windowMs) {
  if (!hasStorage()) return { entries: [], correlation_score: 0 };

  try {
    const { phylax_xplat = {} } = await chrome.storage.local.get('phylax_xplat');
    const now = Date.now();
    const window = windowMs || (24 * 60 * 60 * 1000); // default 24h

    const entries = (phylax_xplat.entries || []).filter(
      e => e.platform !== platform && now - e.ts < window
    );

    // Correlation score: higher if multiple platforms show risk signals
    const platforms = new Set(entries.map(e => e.platform));
    const avgConfidence = entries.length > 0
      ? entries.reduce((s, e) => s + e.confidence, 0) / entries.length
      : 0;

    const correlationScore = Math.min(1.0,
      (platforms.size * 0.25) + (avgConfidence * 0.5) +
      (Math.min(entries.length, 10) / 10 * 0.25)
    );

    return { entries, correlation_score: correlationScore };
  } catch {
    return { entries: [], correlation_score: 0 };
  }
}


// ═════════════════════════════════════════════════════════════════
// PATTERN DETECTORS
// ═════════════════════════════════════════════════════════════════

/**
 * Detect grooming trajectory from conversation buffer.
 * Integrates with grooming-detector.js stage model.
 *
 * @param {Object} threadState
 * @returns {Object|null} grooming pattern result or null
 */
function detectGroomingTrajectory(threadState) {
  const messages = ringRead(threadState.buffer, GROOMING_WINDOW);
  if (messages.length < 3) return null;

  const trajectory = threadState.grooming_trajectory;
  const stageHist = trajectory.stage_history;

  // Need at least 2 stage observations to detect trajectory
  if (stageHist.length < 2) return null;

  // Compute current stage from recent history (last 5 observations)
  const recentStages = stageHist.slice(-5);
  const currentStage = recentStages[recentStages.length - 1].stage_index;

  // Check for stage progression (moving through stages over time)
  const firstStage = stageHist[0].stage_index;
  const stageProgression = currentStage > firstStage;

  // Compute confidence per trajectory stage from accumulated observations
  const stageConfidences = [0, 0, 0, 0, 0, 0]; // index 0 unused
  for (const obs of stageHist) {
    if (obs.stage_index >= 1 && obs.stage_index <= 5) {
      stageConfidences[obs.stage_index] = Math.min(1.0,
        stageConfidences[obs.stage_index] + obs.confidence * 0.3
      );
    }
  }

  // Count how many stages have been observed with meaningful confidence
  const activeStages = stageConfidences.filter((c, i) => i > 0 && c > 0.15).length;

  // Trajectory confidence: progression through multiple stages is alarming
  let trajectoryConfidence = 0;

  if (stageProgression && activeStages >= 2) {
    // Base: how many stages covered
    trajectoryConfidence = Math.min(1.0, activeStages * 0.2);

    // Boost: reaching higher stages
    if (currentStage >= 4) trajectoryConfidence += 0.2;
    if (currentStage >= 5) trajectoryConfidence += 0.15;

    // Boost: rapid progression (many stages in few messages)
    const progressionSpeed = (currentStage - firstStage) / Math.max(stageHist.length, 1);
    if (progressionSpeed > 0.3) trajectoryConfidence += 0.15;

    trajectoryConfidence = Math.min(1.0, trajectoryConfidence);
  }

  if (trajectoryConfidence < 0.2) return null;

  // Build supporting signals list
  const supportingSignals = [];
  if (stageConfidences[2] > 0.15) supportingSignals.push('secrecy_language');
  if (stageConfidences[3] > 0.15) supportingSignals.push('boundary_normalization');
  if (stageConfidences[4] > 0.15) supportingSignals.push('incremental_intimacy');
  if (stageConfidences[5] > 0.15) supportingSignals.push('coercion_or_threats');
  if (currentStage > firstStage + 1) supportingSignals.push('rapid_stage_progression');

  // Check for age-gap implication from grooming detector state
  if (threadState.grooming_state.age_gap_signals > 0) {
    supportingSignals.push('age-gap implication');
  }

  // Determine trend
  const trendWindow = recentStages.slice(-3);
  let trend = 'stable';
  if (trendWindow.length >= 2) {
    const first = trendWindow[0].stage_index;
    const last = trendWindow[trendWindow.length - 1].stage_index;
    if (last > first) trend = 'increasing';
    else if (last < first) trend = 'decreasing';
  }

  return {
    signal_id: generateSignalId(),
    pattern_type: 'grooming_escalation',
    confidence: Math.round(trajectoryConfidence * 100) / 100,
    trajectory_window: messages.length,
    supporting_signals: supportingSignals,
    escalation_stage: currentStage,
    trend,
  };
}

/**
 * Detect repeated harm-seeking across messages.
 * Fires when a child keeps returning to the same harmful topic.
 *
 * @param {Object} threadState
 * @returns {Object|null}
 */
function detectRepeatedHarmSeeking(threadState) {
  const counts = threadState.harm_topic_counts;
  let worstCategory = null;
  let worstCount = 0;

  for (const [category, count] of Object.entries(counts)) {
    if (count > worstCount) {
      worstCount = count;
      worstCategory = category;
    }
  }

  // Threshold: 3+ hits on the same harm category
  if (worstCount < 3) return null;

  const confidence = Math.min(1.0, 0.4 + (worstCount - 3) * 0.12);

  return {
    signal_id: generateSignalId(),
    pattern_type: 'repeated_harm_seeking',
    confidence: Math.round(confidence * 100) / 100,
    trajectory_window: threadState.buffer.count,
    supporting_signals: [`${worstCategory}_repeated_${worstCount}x`],
    escalation_stage: null,
    trend: worstCount > 5 ? 'increasing' : 'stable',
  };
}

/**
 * Detect bypass attempts (jailbreaks, filter evasion, etc.).
 *
 * @param {Object} threadState
 * @param {string} normalizedText - current message text, normalized
 * @returns {Object|null}
 */
function detectBypassAttempt(threadState, normalizedText) {
  if (!normalizedText || normalizedText.length < 10) return null;

  let matchedHint = null;
  for (const pattern of BYPASS_PATTERNS) {
    if (pattern.test(normalizedText)) {
      matchedHint = pattern.source.slice(0, 40);
      break;
    }
  }

  if (matchedHint) {
    threadState.bypass_attempts.push({
      ts: Date.now(),
      pattern_hint: matchedHint,
    });
    // Prune old attempts (keep last 20)
    if (threadState.bypass_attempts.length > 20) {
      threadState.bypass_attempts = threadState.bypass_attempts.slice(-20);
    }
  }

  // Need 2+ attempts to flag as a pattern
  const recentAttempts = threadState.bypass_attempts.filter(
    a => Date.now() - a.ts < 30 * 60 * 1000  // last 30 minutes
  );

  if (recentAttempts.length < 2) return null;

  const confidence = Math.min(1.0, 0.45 + (recentAttempts.length - 2) * 0.15);

  return {
    signal_id: generateSignalId(),
    pattern_type: 'bypass_attempt',
    confidence: Math.round(confidence * 100) / 100,
    trajectory_window: recentAttempts.length,
    supporting_signals: [...new Set(recentAttempts.map(a => a.pattern_hint))],
    escalation_stage: null,
    trend: recentAttempts.length > 4 ? 'increasing' : 'stable',
  };
}

/**
 * Detect sustained manipulation patterns.
 * Someone systematically using manipulation tactics across messages.
 *
 * @param {Object} threadState
 * @returns {Object|null}
 */
function detectSustainedManipulation(threadState) {
  const signals = threadState.manipulation_signals;
  if (signals.length < 3) return null;

  // Look at recent window only
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const recent = signals.filter(s => now - s.ts < windowMs);

  if (recent.length < 3) return null;

  // Count unique manipulation tactics used
  const uniqueTactics = new Set(recent.map(s => s.signal_id));

  // Sustained = repeated + diverse tactics
  const diversityScore = Math.min(1.0, uniqueTactics.size * 0.25);
  const persistenceScore = Math.min(1.0, recent.length * 0.12);
  const avgWeight = recent.reduce((s, r) => s + r.weight, 0) / recent.length;

  const confidence = Math.min(1.0,
    diversityScore * 0.35 + persistenceScore * 0.35 + avgWeight * 0.3
  );

  if (confidence < 0.35) return null;

  return {
    signal_id: generateSignalId(),
    pattern_type: 'sustained_manipulation',
    confidence: Math.round(confidence * 100) / 100,
    trajectory_window: recent.length,
    supporting_signals: [...uniqueTactics],
    escalation_stage: null,
    trend: recent.length > 5 ? 'increasing' : 'stable',
  };
}

/**
 * Detect escalation trend — conversation risk trending upward.
 *
 * @param {Object} threadState
 * @returns {Object|null}
 */
function detectEscalation(threadState) {
  const history = threadState.risk_history;
  if (history.length < 4) return null;

  const window = history.slice(-ESCALATION_WINDOW);

  // Split into first half and second half
  const mid = Math.floor(window.length / 2);
  const firstHalf = window.slice(0, mid);
  const secondHalf = window.slice(mid);

  const firstAvg = firstHalf.reduce((s, h) => s + h.score, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((s, h) => s + h.score, 0) / secondHalf.length;

  const delta = secondAvg - firstAvg;

  // Only flag if there's a meaningful upward trend AND the current level is concerning
  if (delta < 0.1 || secondAvg < 0.25) return null;

  // Compute linear regression slope for more precise trend
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  const n = window.length;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += window[i].score;
    sumXY += i * window[i].score;
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  if (slope < 0.005) return null; // not enough upward trend

  const confidence = Math.min(1.0, delta * 2 + slope * 10);

  let trend = 'increasing';
  // Check if the very last few are plateauing or decreasing
  if (window.length >= 3) {
    const lastThree = window.slice(-3);
    const lastSlope = (lastThree[2].score - lastThree[0].score) / 2;
    if (lastSlope < 0) trend = 'decreasing';
    else if (Math.abs(lastSlope) < 0.02) trend = 'stable';
  }

  return {
    signal_id: generateSignalId(),
    pattern_type: 'escalation',
    confidence: Math.round(confidence * 100) / 100,
    trajectory_window: window.length,
    supporting_signals: [
      `risk_delta_${delta.toFixed(2)}`,
      `slope_${slope.toFixed(3)}`,
      `current_avg_${secondAvg.toFixed(2)}`,
    ],
    escalation_stage: null,
    trend,
  };
}


// ═════════════════════════════════════════════════════════════════
// SIGNAL INGESTION & ACCUMULATION
// ═════════════════════════════════════════════════════════════════

/**
 * Ingest a signal and its semantic result into the thread state.
 * Updates all accumulators used by pattern detectors.
 *
 * @param {Object} threadState
 * @param {Object} signal - the incoming signal/event
 * @param {Object} semanticResult - from semantic.js parse
 */
function ingestSignal(threadState, signal, semanticResult) {
  const now = Date.now();
  threadState.updated_at = now;

  // Extract text from the signal
  const text = signal.text || signal.payload?.text || signal.payload?.main_text || '';
  const normalizedText = text ? normalizeText(text) : '';

  // Determine sender type (for grooming analysis)
  const sender = signal.sender || signal.payload?.sender || 'UNKNOWN';

  // ── 1. Push into conversation buffer ─────────────────────────
  ringPush(threadState.buffer, {
    ts: now,
    text,
    sender,
    platform: threadState.platform,
    risk_score: signal.risk_score || 0,
    semantic_summary: semanticResult ? {
      topics: (semanticResult.content?.topic_labels || []).map(t => t.label),
      intent: semanticResult.content?.intent,
      coercion: semanticResult.content?.coercion_signals,
      age_signals: semanticResult.content?.entities?.age_signals,
    } : null,
  });

  // ── 2. Run grooming detector on contact messages ─────────────
  if (sender === 'CONTACT' || sender === 'UNKNOWN') {
    const chatMessages = ringRead(threadState.buffer, GROOMING_WINDOW)
      .map(m => ({ sender: m.sender, text: m.text }));

    const groomingResult = detectGrooming(text, chatMessages, threadState.grooming_state);
    threadState.grooming_state = groomingResult.updated_conversation_state;

    // Map grooming stage to trajectory stage
    if (groomingResult.stage) {
      const trajectoryStage = GROOMING_TO_TRAJECTORY[groomingResult.stage];
      if (trajectoryStage) {
        threadState.grooming_trajectory.stage_history.push({
          ts: now,
          stage_index: trajectoryStage,
          confidence: groomingResult.risk_score,
        });

        // Keep stage history bounded
        if (threadState.grooming_trajectory.stage_history.length > 50) {
          threadState.grooming_trajectory.stage_history =
            threadState.grooming_trajectory.stage_history.slice(-40);
        }

        threadState.grooming_trajectory.current_stage = trajectoryStage;
        threadState.grooming_trajectory.peak_stage = Math.max(
          threadState.grooming_trajectory.peak_stage, trajectoryStage
        );

        // Update stage confidence
        if (trajectoryStage >= 1 && trajectoryStage <= 5) {
          threadState.grooming_trajectory.stage_confidence[trajectoryStage] = Math.min(1.0,
            threadState.grooming_trajectory.stage_confidence[trajectoryStage] + groomingResult.risk_score * 0.2
          );
        }
      }
    }

    // Track manipulation signals from grooming detector
    if (groomingResult.signals) {
      const manipulationIds = [
        'guilt_induction', 'emotional_pressure', 'gaslighting',
        'dependency_building', 'support_erosion', 'secrecy_demand',
      ];
      for (const sig of groomingResult.signals) {
        if (manipulationIds.includes(sig.id)) {
          threadState.manipulation_signals.push({
            ts: now,
            signal_id: sig.id,
            weight: sig.weight,
          });
        }
      }
      // Bound manipulation signals
      if (threadState.manipulation_signals.length > 50) {
        threadState.manipulation_signals = threadState.manipulation_signals.slice(-40);
      }
    }
  }

  // ── 3. Track harm topic counts ───────────────────────────────
  if (semanticResult?.content?.topic_labels) {
    for (const topic of semanticResult.content.topic_labels) {
      if (HARM_CATEGORIES.includes(topic.label) && topic.p > 0.5) {
        threadState.harm_topic_counts[topic.label] =
          (threadState.harm_topic_counts[topic.label] || 0) + 1;
      }
    }
  }

  // ── 4. Track risk score history ──────────────────────────────
  const riskScore = signal.risk_score || 0;
  threadState.risk_history.push({ ts: now, score: riskScore });
  if (threadState.risk_history.length > ESCALATION_WINDOW * 2) {
    threadState.risk_history = threadState.risk_history.slice(-ESCALATION_WINDOW);
  }

  return normalizedText;
}


// ═════════════════════════════════════════════════════════════════
// UUID GENERATION (lightweight, no crypto dependency)
// ═════════════════════════════════════════════════════════════════

let _signalCounter = 0;

function generateSignalId() {
  const ts = Date.now().toString(36);
  const count = (++_signalCounter).toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `ps_${ts}_${count}_${rand}`;
}


// ═════════════════════════════════════════════════════════════════
// MAIN API
// ═════════════════════════════════════════════════════════════════

/**
 * Track a signal through the pattern detection engine.
 * This is the primary entry point — called on every message.
 *
 * @param {Object} signal - Incoming signal/event. Expected shape:
 *   { platform, thread_id, text?, payload?, sender?, risk_score? }
 * @param {Object} semanticResult - SemanticParse from semantic.js
 * @returns {PatternResult} Pattern detection results
 *
 * PatternResult shape:
 * {
 *   patterns: PatternSignal[],     // detected multi-message patterns
 *   highest_confidence: number,    // max confidence across all patterns
 *   has_pattern: boolean,          // convenience flag
 *   thread_key: string,            // for caller reference
 *   cross_platform: Object|null,   // cross-platform correlation (async populated)
 * }
 */
export function trackSignal(signal, semanticResult) {
  const platform = signal.platform || signal.source?.platform || 'unknown';
  const threadId = signal.thread_id || signal.source?.thread_id || 'default';
  const threadState = getThreadState(platform, threadId);

  // Debounce: skip pattern evaluation if called too rapidly on same thread
  const now = Date.now();
  const debounced = now - threadState.last_eval_ms < PATTERN_DEBOUNCE_MS;
  threadState.last_eval_ms = now;

  // ── Ingest signal into thread state ──────────────────────────
  const normalizedText = ingestSignal(threadState, signal, semanticResult);

  // ── Run pattern detectors ────────────────────────────────────
  const patterns = [];

  if (!debounced) {
    // Grooming trajectory
    const groomingPattern = detectGroomingTrajectory(threadState);
    if (groomingPattern) patterns.push(groomingPattern);

    // Repeated harm seeking
    const harmPattern = detectRepeatedHarmSeeking(threadState);
    if (harmPattern) patterns.push(harmPattern);

    // Bypass attempts
    const bypassPattern = detectBypassAttempt(threadState, normalizedText);
    if (bypassPattern) patterns.push(bypassPattern);

    // Sustained manipulation
    const manipulationPattern = detectSustainedManipulation(threadState);
    if (manipulationPattern) patterns.push(manipulationPattern);

    // Escalation trend
    const escalationPattern = detectEscalation(threadState);
    if (escalationPattern) patterns.push(escalationPattern);
  }

  // Compute summary
  const highestConfidence = patterns.length > 0
    ? Math.max(...patterns.map(p => p.confidence))
    : 0;

  // ── Async: persist session + update cross-platform state ─────
  // Fire-and-forget; don't block the synchronous return.
  if (patterns.length > 0) {
    const topPattern = patterns.reduce((a, b) => b.confidence > a.confidence ? b : a);
    // Async, non-blocking
    updateCrossPlatformState(platform, topPattern).catch(() => {});
  }
  persistSession().catch(() => {});

  return {
    patterns,
    highest_confidence: highestConfidence,
    has_pattern: patterns.length > 0,
    thread_key: threadKey(platform, threadId),
    cross_platform: null,  // populated async below if needed
  };
}

/**
 * Get conversation context for a thread — used by cloud evaluation
 * to send recent messages for deeper analysis.
 *
 * @param {string} platform
 * @param {string} threadId
 * @returns {Object} Conversation context
 */
export function getConversationContext(platform, threadId) {
  const key = threadKey(platform, threadId);
  const state = _threadStates.get(key);

  if (!state) {
    return {
      platform,
      thread_id: threadId,
      messages: [],
      message_count: 0,
      grooming_stage: 0,
      risk_trend: 'none',
      patterns_detected: [],
    };
  }

  const messages = ringRead(state.buffer);
  const recentRisks = state.risk_history.slice(-10);

  // Compute risk trend from recent history
  let riskTrend = 'none';
  if (recentRisks.length >= 3) {
    const firstAvg = recentRisks.slice(0, Math.floor(recentRisks.length / 2))
      .reduce((s, h) => s + h.score, 0) / Math.floor(recentRisks.length / 2);
    const secondAvg = recentRisks.slice(Math.floor(recentRisks.length / 2))
      .reduce((s, h) => s + h.score, 0) /
      (recentRisks.length - Math.floor(recentRisks.length / 2));
    if (secondAvg - firstAvg > 0.1) riskTrend = 'increasing';
    else if (firstAvg - secondAvg > 0.1) riskTrend = 'decreasing';
    else riskTrend = 'stable';
  }

  // Collect active patterns
  const activePatterns = [];
  const groomingPattern = detectGroomingTrajectory(state);
  if (groomingPattern) activePatterns.push(groomingPattern.pattern_type);
  const harmPattern = detectRepeatedHarmSeeking(state);
  if (harmPattern) activePatterns.push(harmPattern.pattern_type);
  const manipPattern = detectSustainedManipulation(state);
  if (manipPattern) activePatterns.push(manipPattern.pattern_type);

  return {
    platform,
    thread_id: threadId,
    messages: messages.map(m => ({
      ts: m.ts,
      text: m.text,
      sender: m.sender,
      risk_score: m.risk_score,
    })),
    message_count: state.buffer.count,
    grooming_stage: state.grooming_trajectory.current_stage,
    grooming_peak_stage: state.grooming_trajectory.peak_stage,
    risk_trend: riskTrend,
    patterns_detected: activePatterns,
    harm_topics: { ...state.harm_topic_counts },
    bypass_attempt_count: state.bypass_attempts.length,
  };
}

/**
 * Get cross-platform correlation for a given platform.
 * Async — call when you need to check for cross-platform patterns.
 *
 * @param {string} platform
 * @param {number} windowMs - optional time window (default 24h)
 * @returns {Promise<Object>} Cross-platform correlation data
 */
export async function getCrossPlatformData(platform, windowMs) {
  return getCrossPlatformCorrelation(platform, windowMs);
}

/**
 * Initialize the pattern tracker (restore session state).
 * Call once at extension startup.
 */
export async function initPatternTracker() {
  await restoreSession();
}

/**
 * Reset all state for a thread. Used for testing or explicit clear.
 */
export function resetThread(platform, threadId) {
  const key = threadKey(platform, threadId);
  _threadStates.delete(key);
}

/**
 * Get all active thread keys. Used for debugging/admin.
 */
export function getActiveThreads() {
  return [..._threadStates.keys()];
}
