// Phylax Engine — Policy-Versioned Decision Cache
// Cache keyed by policy_version + content_id
// TTL per action type: BLOCK=24h, LIMIT=15m, ALLOW=2h

const CACHE_TTL = {
  BLOCK: 24 * 60 * 60 * 1000,  // 24 hours
  LIMIT: 15 * 60 * 1000,       // 15 minutes (behavior changes)
  ALLOW: 2 * 60 * 60 * 1000,   // 2 hours
};

const MAX_CACHE_SIZE = 2000;
const cache = new Map();

/**
 * Get a cached decision.
 * Returns null if not found or expired.
 */
export function cacheGet(policyVersion, contentId) {
  const key = `${policyVersion}:${contentId}`;
  const entry = cache.get(key);
  if (!entry) return null;

  const ttl = CACHE_TTL[entry.decision.decision] || CACHE_TTL.ALLOW;
  if (Date.now() - entry.ts > ttl) {
    cache.delete(key);
    return null;
  }

  return entry.decision;
}

/**
 * Cache a decision.
 */
export function cacheSet(policyVersion, contentId, decision) {
  const key = `${policyVersion}:${contentId}`;
  cache.set(key, { decision, ts: Date.now() });

  // Evict oldest entries if cache is too large
  if (cache.size > MAX_CACHE_SIZE) {
    const it = cache.keys();
    let count = cache.size - MAX_CACHE_SIZE;
    while (count-- > 0) {
      const oldest = it.next().value;
      cache.delete(oldest);
    }
  }
}

/**
 * Invalidate all entries for a given policy version.
 * Called when policy changes (rules updated).
 */
export function cacheInvalidate(policyVersion) {
  const prefix = `${policyVersion}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/**
 * Clear entire cache. Called on rule changes.
 */
export function cacheClear() {
  cache.clear();
}

/**
 * Get cache stats for debug.
 */
export function cacheStats() {
  return { size: cache.size, max: MAX_CACHE_SIZE };
}
