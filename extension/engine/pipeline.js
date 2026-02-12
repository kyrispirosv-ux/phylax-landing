// Phylax Engine — Deterministic Classification Pipeline (Kids-Only)
//
// Action space: ALLOW | BLOCK | LIMIT  (no WARN, no interstitials)
// Pipeline: domain gate → extract → local prefilter → (remote) → (intent) →
//           topic policy → behavior policy → aggregate → enforce → explain → cache
//
// Core invariant: content objects are classified, not URLs.

import { LEXICONS, CATEGORY_DOMAINS, localTopicScore, localScoreAllTopics, domainCategory } from './lexicons.js';
import { behaviorScores, evalBehaviorPolicy } from './behavior.js';
import { DecisionCache } from './decision-cache.js';

// ── Singleton cache ──────────────────────────────────────────
const cache = new DecisionCache(500);

// ── Simple FNV-1a hash (sync, no crypto needed) ─────────────
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

// ═══════════════════════════════════════════════════════════════
// STEP 1 — DOMAIN GATE (fast path)
// ═══════════════════════════════════════════════════════════════

function domainGate(url, policy) {
  let domain;
  try { domain = new URL(url).hostname.toLowerCase(); } catch { return 'CONTINUE'; }

  const registrable = getRegistrableDomain(domain);

  if (policy.domain_rules.block_domains.some(d => registrable.includes(d) || domain.includes(d))) {
    return 'BLOCK';
  }
  if (policy.domain_rules.allow_domains.some(d => registrable.includes(d) || domain.includes(d))) {
    return 'CONTINUE';
  }
  if (policy.domain_rules.domain_mode === 'default_block') {
    return 'BLOCK';
  }
  return 'CONTINUE';
}

function getRegistrableDomain(hostname) {
  // Simple: strip leading www.
  return hostname.replace(/^www\./, '');
}

// ═══════════════════════════════════════════════════════════════
// STEP 2 — CONTENT ID + CANONICAL TEXT
// ═══════════════════════════════════════════════════════════════

export function contentId(content) {
  const key = `${content.domain}|${normalizePath(content.url)}|${content.title}|${(content.main_text || '').slice(0, 1000)}`;
  return fnv1a(key);
}

function normalizePath(url) {
  try {
    const u = new URL(url);
    // Strip tracking params, keep structural path
    return u.hostname + u.pathname;
  } catch {
    return url;
  }
}

export function canonicalText(content) {
  const parts = [
    `TITLE: ${content.title || ''}`,
    `DESC: ${content.description || content.og?.desc || ''}`,
  ];
  if (content.headings?.length) {
    parts.push(`HEADINGS: ${content.headings.join(' | ')}`);
  }
  parts.push(`MAIN: ${content.main_text || ''}`);
  if (content.platform?.transcript) {
    parts.push(`TRANSCRIPT: ${content.platform.transcript}`);
  }
  if (content.platform?.tags?.length) {
    parts.push(`TAGS: ${content.platform.tags.join(',')}`);
  }
  return parts.join('\n').slice(0, 12000);
}

// ═══════════════════════════════════════════════════════════════
// STEP 3 — LOCAL PREFILTER
// ═══════════════════════════════════════════════════════════════

function needsRemote(localScore) {
  return !(localScore >= 0.92 || localScore <= 0.15);
}

function determineRemoteNeed(localScores, policy) {
  for (const rule of policy.topic_rules) {
    if (rule.action !== 'block') continue;
    const score = localScores[rule.topic] ?? 0;
    if (needsRemote(score)) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
// STEP 4 — REMOTE SEMANTIC SCORING (stub — future backend)
// ═══════════════════════════════════════════════════════════════

// eslint-disable-next-line no-unused-vars
function remoteEmbedScore(_text) {
  // Future: call backend embedding API
  // Returns { topic_scores: {}, quality: { text_coverage, language } }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// STEP 5 — INTENT DISAMBIGUATION (stub — future LLM)
// ═══════════════════════════════════════════════════════════════

function needsIntent(scores, policy) {
  for (const rule of policy.topic_rules) {
    if (rule.action !== 'block') continue;
    const s = scores[rule.topic] ?? 0;
    const T = rule.threshold;
    if (s >= T - 0.12 && s <= T + 0.08) return true;
  }
  return false;
}

// eslint-disable-next-line no-unused-vars
function intentClassify(_text, _topTopics) {
  // Future: call LLM with temperature 0, strict schema
  // Returns { intent: string, confidence: number, rationale_bullets: string[] }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// STEP 6 — SCORE MERGE
// ═══════════════════════════════════════════════════════════════

function mergeScores(localScores, remoteScores) {
  if (!remoteScores) return localScores;

  const merged = { ...localScores };
  for (const [topic, r] of Object.entries(remoteScores.topic_scores || {})) {
    const l = localScores[topic] ?? 0;
    merged[topic] = Math.max(r, l * 0.85);
  }
  return merged;
}

// ═══════════════════════════════════════════════════════════════
// STEP 7 — TOPIC POLICY EVALUATION (Kids-Only: BLOCK or ALLOW)
// ═══════════════════════════════════════════════════════════════

function evalTopicPolicy(content, scores, intent, policy) {
  const domain = content.domain;
  const contentType = content.content_type;

  const blockRules = policy.topic_rules.filter(r => r.action === 'block');
  // Sort: higher score first, then more specific scope, then stable tie-break
  const sorted = blockRules.sort((a, b) => {
    const sa = scores[a.topic] ?? 0;
    const sb = scores[b.topic] ?? 0;
    if (sb !== sa) return sb - sa;
    // More specific scope wins
    const specA = (a.scope?.domains?.length || 0) + (a.scope?.content_types?.length || 0);
    const specB = (b.scope?.domains?.length || 0) + (b.scope?.content_types?.length || 0);
    return specB - specA;
  });

  for (const rule of sorted) {
    // Scope check
    if (rule.scope?.domains && !rule.scope.domains.some(d => domain.includes(d))) continue;
    if (rule.scope?.content_types && !rule.scope.content_types.includes(contentType)) continue;

    const s = scores[rule.topic] ?? 0;
    if (s < rule.threshold) continue;

    // Exception check (intent-based allow)
    if (rule.exceptions?.length && intent) {
      let excepted = false;
      for (const ex of rule.exceptions) {
        const need = ex.threshold ?? 0.70;
        if (intent.label === ex.intent && intent.confidence >= need) {
          excepted = true;
          break;
        }
      }
      if (excepted) {
        return {
          decision: 'ALLOW',
          reason_code: `EXCEPTION_ALLOW_${rule.topic}_${intent.label}`,
          confidence: clamp01((s + intent.confidence) / 2),
          evidence: [`Matched ${rule.topic} but exception intent=${intent.label} applied`],
          enforcement: { layer: 'RENDER', technique: 'overlay' },
        };
      }
    }

    // No exception → BLOCK
    return {
      decision: 'BLOCK',
      reason_code: `TOPIC_BLOCK_${rule.topic}`,
      confidence: clamp01(s),
      evidence: buildEvidence(rule.topic, s, content, intent),
      enforcement: {
        layer: 'RENDER',
        technique: 'overlay',
      },
    };
  }

  return null; // No block rules triggered
}

function clamp01(v) {
  return Math.min(1, Math.max(0, Math.round(v * 100) / 100));
}

function buildEvidence(topic, score, content, intent) {
  const ev = [];
  ev.push(`Matched topic ${topic} (${(score * 100).toFixed(0)}% confidence).`);
  if (content.title) {
    ev.push(`TITLE: '${content.title.slice(0, 100)}'`);
  }
  if (content.platform?.channel_or_author) {
    ev.push(`Channel: ${content.platform.channel_or_author}`);
  }
  if (intent) {
    ev.push(`Intent: ${intent.label} (${(intent.confidence * 100).toFixed(0)}%)`);
  }
  return ev;
}

// ═══════════════════════════════════════════════════════════════
// STEP 9 — AGGREGATION (BLOCK > LIMIT > ALLOW)
// ═══════════════════════════════════════════════════════════════

function aggregate(topicDecision, behaviorDecision) {
  if (topicDecision?.decision === 'BLOCK') return topicDecision;
  if (behaviorDecision?.decision === 'LIMIT') return behaviorDecision;

  return {
    decision: 'ALLOW',
    reason_code: 'ALLOW_NO_RULE_MATCH',
    confidence: 0.80,
    evidence: [],
    enforcement: { layer: 'RENDER', technique: 'overlay' },
  };
}

// ═══════════════════════════════════════════════════════════════
// STEP 10 — ENFORCEMENT MAPPING
// ═══════════════════════════════════════════════════════════════

function selectEnforcement(decision, isDomainGate) {
  if (decision.decision === 'BLOCK') {
    if (isDomainGate) {
      decision.enforcement = { layer: 'NETWORK', technique: 'cancel_request' };
    } else {
      decision.enforcement = { layer: 'RENDER', technique: 'overlay' };
    }
  }
  // LIMIT enforcement is already set by evalBehaviorPolicy
  return decision;
}

// ═══════════════════════════════════════════════════════════════
// POLICY OBJECT BUILDER (adapter from compiled rules)
// ═══════════════════════════════════════════════════════════════

/**
 * Convert compiled rules (from rule-compiler.js) into a PolicyObject.
 * This adapts the existing rule format to the new pipeline's expected input.
 */
export function buildPolicyObject(compiledRules, profile) {
  const blockDomains = [];
  const allowDomains = [];
  const topicRules = [];
  const behaviorRules = [];

  for (const rule of compiledRules) {
    const actionType = rule.action?.type;

    // BLOCK_DOMAIN → domain_rules.block_domains
    if (actionType === 'BLOCK_DOMAIN') {
      const domains = rule.scope?.domain_blocklist || [];
      blockDomains.push(...domains);
    }

    // ALLOW_DOMAIN → domain_rules.allow_domains
    if (actionType === 'ALLOW_DOMAIN') {
      const domains = rule.scope?.domain_allowlist || [];
      allowDomains.push(...domains);
    }

    // BLOCK_CONTENT with classifier → topic_rules
    if (actionType === 'BLOCK_CONTENT' && rule.condition?.classifier) {
      const labels = rule.condition.classifier.labels_any || [];
      const threshold = rule.condition.classifier.threshold || 0.60;

      for (const label of labels) {
        const scopeDomains = rule.scope?.domain_allowlist;
        topicRules.push({
          topic: label,
          action: 'block',
          threshold,
          scope: scopeDomains?.length ? { domains: scopeDomains } : undefined,
          source_text: rule.source_text,
          explain: rule.explain,
        });
      }
    }

    // BLOCK_CONTENT with category fallback
    if (actionType === 'BLOCK_CONTENT' && rule.condition?.classifier?.labels_any) {
      // Already handled above
    }

    // FRICTION/COOLDOWN → behavior_rules
    if (actionType === 'FRICTION' || actionType === 'COOLDOWN') {
      behaviorRules.push({
        pattern: rule.parsed_intent === 'REDUCE_ADDICTION' ? 'infinite_scroll_binge' : 'rapid_hop',
        action: 'limit',
        budget_minutes: 30,
        cooldown_minutes: 5,
      });
    }
  }

  // Compute policy version from rule sources
  const ruleTexts = compiledRules.map(r => r.source_text || '').join('|');
  const policyVersion = fnv1a(ruleTexts);

  return {
    policy_version: policyVersion,
    child_profile: {
      age: profile?.age || 13,
      sensitivity: profile?.sensitivity || 'med',
    },
    domain_rules: {
      allow_domains: [...new Set(allowDomains)],
      block_domains: [...new Set(blockDomains)],
      domain_mode: 'default_allow',
    },
    topic_rules: topicRules,
    behavior_rules: behaviorRules,
    explainability: { mode: 'standard' },
  };
}

// ═══════════════════════════════════════════════════════════════
// FULL PIPELINE (Kids-Only)
// ═══════════════════════════════════════════════════════════════

/**
 * Evaluate a ContentObject against a PolicyObject.
 *
 * @param {object} content - ContentObject from observer
 * @param {object} policy - PolicyObject from buildPolicyObject()
 * @param {object} sessionState - Session state from behavior.js
 * @returns {object} DecisionObject with decision, reason_code, confidence, evidence, enforcement
 */
export function evaluate(content, policy, sessionState) {
  // 1) Domain gate
  const gateResult = domainGate(content.url, policy);
  if (gateResult === 'BLOCK') {
    return {
      decision: 'BLOCK',
      reason_code: 'DOMAIN_BLOCK',
      confidence: 0.99,
      evidence: ['Blocked by parent domain rule.'],
      enforcement: { layer: 'NETWORK', technique: 'cancel_request' },
    };
  }

  // 2) Content ID (for caching)
  const cId = contentId(content);

  // 3) Cache check
  const cached = cache.get(policy.policy_version, cId);
  if (cached) return cached;

  // 4) Canonical text
  const text = canonicalText(content).toLowerCase();

  // 5) Local prefilter (weighted lexicons)
  const localScores = localScoreAllTopics(text);

  // 6) Domain reputation boost
  // If the domain itself is a known harmful domain, override score
  const knownCat = domainCategory(content.domain);
  if (knownCat && localScores[knownCat] !== undefined) {
    localScores[knownCat] = Math.max(localScores[knownCat], 0.95);
  }

  // 7) Remote scoring (future — stub returns null)
  const remoteNeeded = determineRemoteNeed(localScores, policy);
  let remote = null;
  if (remoteNeeded) {
    remote = remoteEmbedScore(text);
  }

  // 8) Merge scores
  const scores = mergeScores(localScores, remote);

  // 9) Intent disambiguation (future — stub returns null)
  let intent = null;
  if (needsIntent(scores, policy)) {
    intent = intentClassify(text, topTopics(scores, 3));
  }

  // 10) Topic policy evaluation (BLOCK or nothing)
  const topicDecision = evalTopicPolicy(content, scores, intent, policy);

  // 11) Behavior policy evaluation (LIMIT or nothing)
  const bScores = behaviorScores(sessionState, content.ui);
  const behaviorDecision = evalBehaviorPolicy(bScores, policy.behavior_rules);

  // 12) Aggregate (BLOCK > LIMIT > ALLOW)
  let final = aggregate(topicDecision, behaviorDecision);

  // 13) Select enforcement technique
  final = selectEnforcement(final, false);

  // 14) Attach debug info
  final.debug = {
    topic_scores: filterSignificantScores(scores),
    intent: intent ? { label: intent.label, confidence: intent.confidence } : undefined,
    behavior: { pattern_scores: bScores },
    content_id: cId,
    policy_version: policy.policy_version,
    remote_needed: remoteNeeded,
  };

  // 15) Cache
  cache.set(policy.policy_version, cId, final);

  return final;
}

// ── Helpers ───────────────────────────────────────────────────

function topTopics(scores, n) {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([topic]) => topic);
}

function filterSignificantScores(scores) {
  const sig = {};
  for (const [k, v] of Object.entries(scores)) {
    if (v >= 0.05) sig[k] = Math.round(v * 100) / 100;
  }
  return sig;
}

/**
 * Invalidate cache when policy changes.
 */
export function invalidateCache() {
  cache.clear();
}

/**
 * Get cache stats.
 */
export function getCacheSize() {
  return cache.size;
}
