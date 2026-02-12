// Phylax Engine — Decision Cache
// Policy-versioned content caching for deterministic pipeline.
// Cache key: policyVersion + contentId
// TTL: BLOCK=24h, LIMIT=15m, ALLOW=2h

const TTL = {
  BLOCK: 86400000,   // 24 hours
  LIMIT: 900000,     // 15 minutes
  ALLOW: 7200000,    // 2 hours
};

export class DecisionCache {
  constructor(maxSize = 500) {
    this._cache = new Map();
    this._maxSize = maxSize;
  }

  _key(policyVersion, contentId) {
    return `${policyVersion}:${contentId}`;
  }

  get(policyVersion, contentId) {
    const key = this._key(policyVersion, contentId);
    const entry = this._cache.get(key);
    if (!entry) return null;

    const ttl = TTL[entry.decision.decision] || TTL.ALLOW;
    if (Date.now() - entry.ts > ttl) {
      this._cache.delete(key);
      return null;
    }

    return { ...entry.decision, debug: { ...entry.decision.debug, cache_hit: true } };
  }

  set(policyVersion, contentId, decision) {
    const key = this._key(policyVersion, contentId);

    // Evict oldest if at capacity
    if (this._cache.size >= this._maxSize) {
      const oldest = this._cache.keys().next().value;
      this._cache.delete(oldest);
    }

    this._cache.set(key, { decision, ts: Date.now() });
  }

  invalidate(policyVersion) {
    // Clear all entries for a given policy version
    for (const [key] of this._cache) {
      if (key.startsWith(policyVersion + ':')) {
        this._cache.delete(key);
      }
    }
  }

  clear() {
    this._cache.clear();
  }

  get size() {
    return this._cache.size;
  }
}
