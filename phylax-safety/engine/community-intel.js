/**
 * Phylax Community Intelligence — Aggregated Safety Insights
 *
 * Fetches community-wide safety statistics from the aggregation endpoint.
 * All stats are aggregated across families — never individual family data.
 * Only available to families who have opted in to sharing safety insights.
 *
 * Cached locally and refreshed hourly.
 */

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_KEY = 'phylaxCommunityIntel';

// ── Community Stats Cache ───────────────────────────────────────

let cachedStats = null;
let lastFetch = 0;

/**
 * Get community safety statistics.
 * Returns cached data if available and fresh, otherwise fetches new data.
 *
 * @returns {Promise<object|null>} Community stats or null if unavailable
 */
export async function getCommunityStats() {
  // Check opt-in
  const stored = await chrome.storage.local.get(['phylaxShareSafetyInsights']);
  if (!stored.phylaxShareSafetyInsights) {
    return null; // Only available to families who share
  }

  // Return cached if fresh
  if (cachedStats && (Date.now() - lastFetch) < CACHE_TTL_MS) {
    return cachedStats;
  }

  // Try to load from storage first (persists across service worker restarts)
  try {
    const persisted = await chrome.storage.local.get([CACHE_KEY]);
    if (persisted[CACHE_KEY]) {
      const parsed = persisted[CACHE_KEY];
      if (parsed.fetched_at && (Date.now() - parsed.fetched_at) < CACHE_TTL_MS) {
        cachedStats = parsed.data;
        lastFetch = parsed.fetched_at;
        return cachedStats;
      }
    }
  } catch { /* ignore */ }

  // Fetch fresh data
  return fetchCommunityStats();
}

/**
 * Fetch fresh community stats from the aggregation endpoint.
 */
async function fetchCommunityStats() {
  try {
    const config = await getApiConfig();
    if (!config.deviceId) return null;

    const headers = { 'Content-Type': 'application/json' };
    if (config.authToken) headers['Authorization'] = `Bearer ${config.authToken}`;

    const res = await fetch(`${config.apiBase}/api/aggregation/community-stats`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[Phylax Intel] Fetch failed: ${res.status}`);
      return cachedStats; // Return stale cache on failure
    }

    const data = await res.json();
    cachedStats = data;
    lastFetch = Date.now();

    // Persist to storage
    try {
      await chrome.storage.local.set({
        [CACHE_KEY]: { data, fetched_at: lastFetch },
      });
    } catch { /* ignore */ }

    console.log('[Phylax Intel] Community stats refreshed');
    return data;
  } catch (err) {
    console.warn('[Phylax Intel] Fetch error:', err.message);
    return cachedStats; // Return stale cache on error
  }
}

/**
 * Force refresh community stats (ignores cache).
 */
export async function refreshCommunityStats() {
  lastFetch = 0;
  cachedStats = null;
  return fetchCommunityStats();
}

/**
 * Clear cached community stats (e.g., when user opts out).
 */
export async function clearCommunityCache() {
  cachedStats = null;
  lastFetch = 0;
  try {
    await chrome.storage.local.remove([CACHE_KEY]);
  } catch { /* ignore */ }
}

// ── Helper ──────────────────────────────────────────────────────

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

// ── Message Listener ────────────────────────────────────────────

/**
 * Listen for community stats requests from the dashboard bridge.
 */
export function startCommunityIntelListener() {
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'PHYLAX_GET_COMMUNITY_STATS') {
        getCommunityStats()
          .then(stats => sendResponse({ stats }))
          .catch(() => sendResponse({ stats: null }));
        return true; // async response
      }

      if (msg.type === 'PHYLAX_REFRESH_COMMUNITY_STATS') {
        refreshCommunityStats()
          .then(stats => sendResponse({ stats }))
          .catch(() => sendResponse({ stats: null }));
        return true;
      }
    });

    console.log('[Phylax Intel] Community intelligence listener started');
  } catch { /* not in extension context */ }
}
