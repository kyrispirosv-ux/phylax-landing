/**
 * Phylax Feedback Capture — Parent Correction as Labeled Training Data
 *
 * Captures two types of parent feedback:
 * 1. False positives: parent allows content that was blocked
 * 2. False negatives: parent flags content that was allowed
 *
 * Integrates with the access-request flow and adds a "Flag this content"
 * capability for the parent activity dashboard.
 *
 * All feedback is anonymized — linked by signal_hash, never raw content.
 */

// ── Hash Helper ─────────────────────────────────────────────────

/**
 * Fast deterministic hash (djb2). Same as pipeline.js for consistency.
 */
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return 'cid_' + hash.toString(36);
}

// ── API Helpers ─────────────────────────────────────────────────

async function getApiConfig() {
  const stored = await chrome.storage.local.get([
    'phylaxDashboardUrl', 'phylaxDeviceId', 'phylaxAuthToken',
  ]);
  return {
    apiBase: stored.phylaxDashboardUrl || 'https://app.phylax.ai',
    deviceId: stored.phylaxDeviceId || null,
    authToken: stored.phylaxAuthToken || null,
  };
}

function buildHeaders(authToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  return headers;
}

// ── Age Tier Helper ─────────────────────────────────────────────

function normalizeAgeTier(tier) {
  const validTiers = ['kid_10', 'tween_13', 'teen_16'];
  return validTiers.includes(tier) ? tier : 'unknown';
}

// ── False Positive Capture ──────────────────────────────────────

/**
 * Capture a false positive signal when a parent approves blocked content.
 * Called when:
 * - Parent approves an access request (blocked content → allowed)
 * - Parent clicks "Allow this" on a block notification
 *
 * @param {object} params
 * @param {string} params.original_decision - The original pipeline action (e.g., 'block')
 * @param {string} params.original_topic - The topic that triggered the block
 * @param {number} params.original_confidence - The confidence score of the original decision
 * @param {string} params.platform - The platform (e.g., 'discord', 'chatgpt')
 * @param {string} params.child_tier - The child's age tier
 * @param {string} [params.content_key] - Key material for generating signal_hash
 */
export async function captureFalsePositive({
  original_decision = 'block',
  original_topic,
  original_confidence,
  platform,
  child_tier,
  content_key,
}) {
  const signal_hash = content_key
    ? hashString(content_key)
    : hashString(`fp_${original_topic}_${Date.now()}`);

  const feedback = {
    feedback_type: 'false_positive',
    signal_hash,
    original_decision,
    original_topic: original_topic || null,
    original_confidence: typeof original_confidence === 'number'
      ? Math.round(original_confidence * 100) / 100
      : null,
    parent_action: 'allow',
    parent_flagged_topic: null,
    platform: platform || null,
    child_age_tier: normalizeAgeTier(child_tier),
  };

  return sendFeedback(feedback);
}

// ── False Negative Capture ──────────────────────────────────────

/**
 * Capture a false negative signal when a parent flags allowed content.
 * Called when:
 * - Parent clicks "Flag this content" in the activity dashboard
 * - Parent reports a missed threat
 *
 * @param {object} params
 * @param {string} params.flagged_topic - The topic the parent identifies (e.g., 'grooming')
 * @param {string} params.platform - The platform where the content appeared
 * @param {string} params.child_tier - The child's age tier
 * @param {string} [params.content_key] - Key material for generating signal_hash
 * @param {string} [params.original_topic] - What the system classified it as (if anything)
 * @param {number} [params.original_confidence] - System's confidence (if any)
 */
export async function captureFalseNegative({
  flagged_topic,
  platform,
  child_tier,
  content_key,
  original_topic,
  original_confidence,
}) {
  const signal_hash = content_key
    ? hashString(content_key)
    : hashString(`fn_${flagged_topic}_${Date.now()}`);

  const feedback = {
    feedback_type: 'false_negative',
    signal_hash,
    original_decision: 'allow',
    original_topic: original_topic || null,
    original_confidence: typeof original_confidence === 'number'
      ? Math.round(original_confidence * 100) / 100
      : null,
    parent_action: null,
    parent_flagged_topic: flagged_topic || null,
    platform: platform || null,
    child_age_tier: normalizeAgeTier(child_tier),
  };

  return sendFeedback(feedback);
}

// ── Send Feedback ───────────────────────────────────────────────

/**
 * Send a feedback signal to the aggregation endpoint.
 * Feedback is sent immediately (not batched) since it's rare and valuable.
 */
async function sendFeedback(feedback) {
  try {
    const { apiBase, deviceId, authToken } = await getApiConfig();

    if (!deviceId) {
      console.warn('[Phylax Feedback] Cannot send: device not paired');
      return { error: 'Not paired' };
    }

    const res = await fetch(`${apiBase}/api/aggregation/feedback`, {
      method: 'POST',
      headers: buildHeaders(authToken),
      body: JSON.stringify({
        device_id: deviceId,
        feedback,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[Phylax Feedback] Send failed: ${res.status} ${errText}`);
      return { error: `HTTP ${res.status}` };
    }

    console.log(`[Phylax Feedback] Sent ${feedback.feedback_type} feedback`);
    return { status: 'ok' };
  } catch (err) {
    console.error('[Phylax Feedback] Send error:', err.message);
    return { error: err.message };
  }
}

// ── Access Request Integration ──────────────────────────────────

/**
 * Hook into the access request approval flow.
 * When a parent approves a blocked content request, capture it as
 * a false positive signal for the training data pipeline.
 *
 * Call this from the access-request approval handler.
 *
 * @param {object} accessRequest - The access request that was approved
 * @param {string} childTier - The child's age tier
 */
export async function onAccessRequestApproved(accessRequest, childTier) {
  if (!accessRequest) return;

  return captureFalsePositive({
    original_decision: 'block',
    original_topic: accessRequest.category || accessRequest.reason_code || null,
    original_confidence: accessRequest.confidence || null,
    platform: derivePlatform(accessRequest.domain),
    child_tier: childTier,
    content_key: accessRequest.url || accessRequest.domain || null,
  });
}

/**
 * Derive platform name from domain for signal enrichment.
 */
function derivePlatform(domain) {
  if (!domain) return null;
  const d = domain.toLowerCase();
  if (d.includes('discord')) return 'discord';
  if (d.includes('youtube') || d.includes('youtu.be')) return 'youtube';
  if (d.includes('tiktok')) return 'tiktok';
  if (d.includes('instagram')) return 'instagram';
  if (d.includes('snapchat')) return 'snapchat';
  if (d.includes('reddit')) return 'reddit';
  if (d.includes('twitter') || d.includes('x.com')) return 'twitter';
  if (d.includes('chatgpt') || d.includes('openai')) return 'chatgpt';
  if (d.includes('claude.ai')) return 'claude';
  if (d.includes('gemini')) return 'gemini';
  if (d.includes('roblox')) return 'roblox';
  if (d.includes('twitch')) return 'twitch';
  return null;
}

// ── Message Listener ────────────────────────────────────────────

/**
 * Listen for feedback messages from the dashboard bridge.
 * The parent dashboard can send "FLAG_CONTENT" and "APPROVE_CONTENT"
 * messages via the bridge to trigger feedback capture.
 */
export function startFeedbackListener() {
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'PHYLAX_FLAG_CONTENT') {
        captureFalseNegative({
          flagged_topic: msg.flagged_topic,
          platform: msg.platform,
          child_tier: msg.child_tier,
          content_key: msg.content_key,
          original_topic: msg.original_topic,
          original_confidence: msg.original_confidence,
        }).then(sendResponse).catch(() => sendResponse({ error: 'Failed' }));
        return true; // async response
      }

      if (msg.type === 'PHYLAX_APPROVE_CONTENT') {
        captureFalsePositive({
          original_decision: msg.original_decision || 'block',
          original_topic: msg.original_topic,
          original_confidence: msg.original_confidence,
          platform: msg.platform,
          child_tier: msg.child_tier,
          content_key: msg.content_key,
        }).then(sendResponse).catch(() => sendResponse({ error: 'Failed' }));
        return true; // async response
      }
    });

    console.log('[Phylax Feedback] Listener started');
  } catch { /* not in extension context */ }
}
