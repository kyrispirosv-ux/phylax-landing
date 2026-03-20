/**
 * Phylax Signal Aggregator — Anonymous Safety Signal Collection
 *
 * Collects structured semantic metadata from pipeline decisions.
 * NEVER stores raw content, PII, URLs, or conversation transcripts.
 * All timestamps bucketed to the hour for privacy.
 *
 * Opt-in only: controlled by family setting `share_safety_insights`.
 */

const SIGNAL_FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SIGNAL_BUFFER = 500;

let signalBuffer = [];
let flushTimer = null;
let optedIn = false;

// ── Privacy Helpers ─────────────────────────────────────────────

/**
 * Bucket a timestamp to the nearest hour for privacy.
 * Never store exact timestamps in aggregated signals.
 */
function bucketTimestamp(date) {
  const d = new Date(date || Date.now());
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

/**
 * Fast deterministic hash (djb2). Same as pipeline.js for consistency.
 * Used for content identification, not security.
 */
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return 'cid_' + hash.toString(36);
}

/**
 * Map a child's tier to an anonymized age tier.
 * Only stores tier, never exact age.
 */
function normalizeAgeTier(tier) {
  const validTiers = ['kid_10', 'tween_13', 'teen_16'];
  return validTiers.includes(tier) ? tier : 'unknown';
}

/**
 * Derive region from browser locale. Only country-level, never precise location.
 */
function deriveRegion() {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    // Extract country hint from timezone (e.g., "America/New_York" -> "US")
    const tzCountryMap = {
      'America/': 'US', 'US/': 'US',
      'Europe/London': 'GB', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR',
      'Europe/': 'EU',
      'Asia/Tokyo': 'JP', 'Asia/Shanghai': 'CN', 'Asia/Kolkata': 'IN',
      'Asia/': 'APAC',
      'Australia/': 'AU',
      'Pacific/': 'OCEANIA',
      'Africa/': 'AF',
    };
    for (const [prefix, region] of Object.entries(tzCountryMap)) {
      if (locale.startsWith(prefix) || locale.includes(prefix)) return region;
    }
    return 'OTHER';
  } catch {
    return 'UNKNOWN';
  }
}

// ── Opt-in Management ───────────────────────────────────────────

/**
 * Load the opt-in setting from chrome.storage.local.
 * Default is false — sharing is strictly opt-in.
 */
async function loadOptIn() {
  try {
    const stored = await chrome.storage.local.get(['phylaxShareSafetyInsights']);
    optedIn = !!stored.phylaxShareSafetyInsights;
  } catch {
    optedIn = false;
  }
}

/**
 * Set the opt-in preference. Called from settings/onboarding.
 */
export async function setShareSafetyInsights(enabled) {
  optedIn = !!enabled;
  await chrome.storage.local.set({ phylaxShareSafetyInsights: optedIn });
  console.log(`[Phylax Signal] Safety insights sharing ${optedIn ? 'enabled' : 'disabled'}`);

  // If disabled, clear any buffered signals
  if (!optedIn) {
    signalBuffer = [];
  }
}

/**
 * Check if the user has opted in to sharing safety insights.
 */
export function isOptedIn() {
  return optedIn;
}

// ── Signal Creation ─────────────────────────────────────────────

/**
 * Validate that a signal tuple contains NO prohibited data.
 * Returns true if the signal is safe to send, false otherwise.
 */
function validateSignalPrivacy(signal) {
  const prohibited = ['content', 'text', 'message', 'url', 'username', 'email',
    'name', 'address', 'phone', 'ip', 'user_id', 'child_id', 'family_id',
    'device_id', 'transcript', 'conversation'];

  const keys = Object.keys(signal);
  for (const key of keys) {
    if (prohibited.includes(key)) {
      console.warn(`[Phylax Signal] Blocked prohibited field: ${key}`);
      return false;
    }
  }

  // Ensure no string values look like PII
  for (const [key, val] of Object.entries(signal)) {
    if (typeof val === 'string' && val.length > 200) {
      console.warn(`[Phylax Signal] Blocked suspiciously long field: ${key} (${val.length} chars)`);
      return false;
    }
  }

  return true;
}

/**
 * Create an anonymized signal tuple from a pipeline decision.
 * This is the core function — it strips all PII and content,
 * keeping only structured semantic metadata.
 *
 * @param {object} decision - The pipeline decision result
 * @param {object} context - Additional context (platform, source_type, etc.)
 * @returns {object|null} Anonymized signal tuple, or null if opted out
 */
export function createSignal(decision, context = {}) {
  if (!optedIn) return null;

  const signal = {
    signal_hash: decision.content_id || hashString(JSON.stringify({
      topic: decision.top_topic,
      action: decision.action,
      ts: bucketTimestamp(),
    })),
    topic: decision.top_topic || null,
    intent: decision.intent || context.intent || null,
    stance: decision.stance || context.stance || null,
    risk_level: typeof decision.risk_score === 'number'
      ? Math.round(decision.risk_score * 100) / 100
      : null,
    platform: context.platform || null,
    source_type: context.source_type || null,
    direction: context.direction || null,
    decision: decision.action || null,
    confidence: typeof decision.confidence === 'number'
      ? Math.round(decision.confidence * 100) / 100
      : null,
    pattern_type: decision.pattern_type || context.pattern_type || null,
    escalation_stage: typeof decision.escalation_stage === 'number'
      ? decision.escalation_stage
      : null,
    child_age_tier: normalizeAgeTier(context.child_tier || context.age_tier),
    triggered_rule_types: Array.isArray(decision.triggered_rules)
      ? decision.triggered_rules.map(r => typeof r === 'string' ? r : r.type).filter(Boolean).slice(0, 10)
      : [],
    parent_override: context.parent_override || null,
    timestamp_bucket: bucketTimestamp(),
    region: deriveRegion(),
  };

  // Privacy validation — reject if any prohibited fields leaked in
  if (!validateSignalPrivacy(signal)) {
    console.warn('[Phylax Signal] Signal rejected by privacy validation');
    return null;
  }

  return signal;
}

// ── Signal Buffering ────────────────────────────────────────────

/**
 * Queue an anonymized signal for batch sending.
 * Signals are buffered locally and flushed every 5 minutes.
 */
export function queueSignal(decision, context = {}) {
  if (!optedIn) return;

  const signal = createSignal(decision, context);
  if (!signal) return;

  signalBuffer.push(signal);

  // Enforce buffer cap
  if (signalBuffer.length > MAX_SIGNAL_BUFFER) {
    signalBuffer = signalBuffer.slice(-MAX_SIGNAL_BUFFER);
  }

  console.log(`[Phylax Signal] Queued signal (buffer: ${signalBuffer.length})`);
}

/**
 * Flush buffered signals to the aggregation endpoint.
 * Sends the batch and clears the buffer on success.
 */
export async function flushSignals() {
  if (!optedIn || signalBuffer.length === 0) return;

  const batch = signalBuffer.splice(0, MAX_SIGNAL_BUFFER);

  try {
    const stored = await chrome.storage.local.get(['phylaxDashboardUrl', 'phylaxDeviceId', 'phylaxAuthToken']);
    const apiBase = stored.phylaxDashboardUrl || 'https://app.phylax.ai';
    const deviceId = stored.phylaxDeviceId;
    const authToken = stored.phylaxAuthToken;

    if (!deviceId) {
      console.warn('[Phylax Signal] Cannot flush: device not paired');
      signalBuffer.unshift(...batch);
      return;
    }

    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const res = await fetch(`${apiBase}/api/aggregation/signals`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        device_id: deviceId,
        signals: batch,
      }),
    });

    if (!res.ok) {
      console.error(`[Phylax Signal] Flush failed: ${res.status}`);
      signalBuffer.unshift(...batch);
    } else {
      console.log(`[Phylax Signal] Flushed ${batch.length} signals`);
    }
  } catch (err) {
    console.error('[Phylax Signal] Flush error:', err.message);
    signalBuffer.unshift(...batch);
  }
}

// ── Lifecycle ───────────────────────────────────────────────────

/**
 * Start the signal aggregator. Call once from background.js.
 * Loads opt-in state and starts the flush timer.
 */
export async function startSignalAggregator() {
  await loadOptIn();

  if (flushTimer) return; // already running
  flushTimer = setInterval(flushSignals, SIGNAL_FLUSH_INTERVAL_MS);

  // Listen for opt-in changes from the dashboard bridge
  try {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.phylaxShareSafetyInsights) {
        optedIn = !!changes.phylaxShareSafetyInsights.newValue;
        console.log(`[Phylax Signal] Opt-in changed: ${optedIn}`);
        if (!optedIn) signalBuffer = [];
      }
    });
  } catch { /* not in extension context */ }

  console.log(`[Phylax Signal] Aggregator started (opted_in: ${optedIn})`);
}

/**
 * Stop the signal aggregator. Flushes any remaining signals first.
 */
export async function stopSignalAggregator() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  // Final flush
  await flushSignals();
}

/**
 * Get the current buffer size (for diagnostics).
 */
export function getBufferSize() {
  return signalBuffer.length;
}
