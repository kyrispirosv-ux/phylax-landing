// Phylax Engine v3.0 — 12-Step Deterministic Pipeline (Kids-Only)
// Action space: ALLOW | BLOCK | LIMIT (no WARN)
// Main invariant: decisions are reproducible given the same ContentObject + PolicyObject.
// Grooming detection: intelligent multi-signal detector (grooming-detector.js), not lexicon matching.

import { localScoreAllTopics } from './lexicons.js';
import { cacheGet, cacheSet } from './decision-cache.js';
import { behaviorScores, evalBehaviorRules } from './behavior.js';
import { detectGrooming, groomingResultToTopicScore, buildGroomingEvidence } from './grooming-detector.js';
import { classifyIntent, isProtectiveIntent, intentThresholdModifier } from './intent-classifier.js';
import { scoreContentForLabel, evaluateRules as evaluateCompiledRules } from './rule-compiler.js';

// ── Helpers ───────────────────────────────────────────────────────

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

/**
 * Fast deterministic hash (djb2). Synchronous, no crypto needed.
 * Used for content ID (cache dedup), not security.
 */
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return 'cid_' + hash.toString(36);
}

// ═════════════════════════════════════════════════════════════════
// STEP 1 — Domain Gate (fast path)
// ═════════════════════════════════════════════════════════════════

function getRegistrableDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function domainGate(url, policy) {
  const domain = getRegistrableDomain(url);
  if (!domain) return 'CONTINUE';

  // URL-level blocking (specific pages/videos) — checked first, highest priority
  const urlLower = url.toLowerCase();
  if (policy.block_urls && policy.block_urls.length > 0) {
    for (const blockedUrl of policy.block_urls) {
      if (urlLower.includes(blockedUrl)) return 'BLOCK_URL';
    }
  }

  const dr = policy.domain_rules;
  if (dr.block_domains.some(d => domain.includes(d) || domain.endsWith(d))) return 'BLOCK';
  if (dr.allow_domains.some(d => domain.includes(d) || domain.endsWith(d))) return 'CONTINUE';
  if (dr.domain_mode === 'default_block') return 'BLOCK';
  return 'CONTINUE';
}

// ═════════════════════════════════════════════════════════════════
// STEP 2 — Content ID (stable hash for caching)
// ═════════════════════════════════════════════════════════════════

function contentId(content) {
  const key = `${content.domain}|${normalizePath(content.url)}|${content.title}|${(content.main_text || '').slice(0, 1000)}`;
  return hashString(key);
}

function normalizePath(url) {
  try {
    const u = new URL(url);
    // Strip tracking params, keep path + core query
    return u.pathname + (u.searchParams.get('v') ? '?v=' + u.searchParams.get('v') : '');
  } catch {
    return url;
  }
}

// ═════════════════════════════════════════════════════════════════
// STEP 3 — Canonical Text (deterministic construction)
// ═════════════════════════════════════════════════════════════════

function canonicalText(content) {
  const parts = [
    `TITLE: ${content.title || ''}`,
    `DESC: ${content.description || content.og?.desc || ''}`,
  ];

  // OG title can differ from page title and carry topic signals
  if (content.og?.title && content.og.title !== content.title) {
    parts.push(`OG_TITLE: ${content.og.title}`);
  }

  if (content.headings && content.headings.length > 0) {
    parts.push(`HEADINGS: ${content.headings.join(' | ')}`);
  }

  // Keywords from <meta name="keywords"> — often topic-relevant
  if (content.keywords && content.keywords.length > 0) {
    parts.push(`KEYWORDS: ${content.keywords.join(',')}`);
  }

  // URL path often contains topic signals (e.g., /best-online-casinos/)
  if (content.url) {
    try {
      const urlPath = new URL(content.url).pathname.replace(/[-_/]/g, ' ').trim();
      if (urlPath.length > 2) {
        parts.push(`URL_PATH: ${urlPath}`);
      }
    } catch { /* ignore invalid URLs */ }
  }

  if (content.main_text) {
    parts.push(`MAIN: ${content.main_text}`);
  }

  // CRITICAL: Fall back to visible_text_sample when main_text is empty.
  // extractMainText() uses getComputedStyle() which can fail on JS-heavy/SPA pages
  // that haven't finished rendering. visible_text_sample uses innerText which is
  // simpler and more reliable. Without this fallback, JS-heavy article pages
  // score 0 on all topics and silently pass through.
  if (!content.main_text && content.visible_text_sample) {
    parts.push(`MAIN: ${content.visible_text_sample}`);
  }

  if (content.platform?.transcript) {
    parts.push(`TRANSCRIPT: ${content.platform.transcript}`);
  }
  if (content.platform?.tags?.length) {
    parts.push(`TAGS: ${content.platform.tags.join(',')}`);
  }
  if (content.platform?.channel_or_author) {
    parts.push(`CHANNEL: ${content.platform.channel_or_author}`);
  }

  return parts.join('\n').slice(0, 12000);
}

// ═════════════════════════════════════════════════════════════════
// STEP 3b — URL-based topic boosting
// ═════════════════════════════════════════════════════════════════
// URL paths like /best-online-casinos/ carry strong topic signals.
// This runs AFTER lexicon scoring and boosts scores for topics that
// appear in the URL. Without this, pages with short body text but
// topical URLs can slip through (common on affiliate/landing pages).

const URL_TOPIC_KEYWORDS = {
  gambling: ['casino', 'casinos', 'gambling', 'poker', 'betting', 'bet', 'slots', 'sportsbook', 'baccarat', 'roulette', 'blackjack', 'wager'],
  pornography: ['porn', 'xxx', 'nsfw', 'adult', 'nude', 'sex', 'hentai', 'erotic'],
  drugs: ['drugs', 'cocaine', 'heroin', 'meth', 'fentanyl', 'weed', 'marijuana', 'cannabis'],
  weapons: ['weapons', 'guns', 'firearms', 'ammo', 'ammunition', 'rifles', 'explosives'],
  self_harm: ['suicide', 'self-harm', 'selfharm'],
  violence: ['gore', 'execution', 'beheading', 'murder', 'torture'],
  hate: ['white-power', 'white-supremacy', 'nazi', 'hate'],
  scams: ['scam', 'fraud', 'phishing'],
  extremism: ['jihad', 'isis', 'caliphate', 'extremism'],
  eating_disorder: ['pro-ana', 'pro-mia', 'thinspo', 'thinspiration'],
};

function urlTopicBoost(url, localScores) {
  try {
    const path = new URL(url).pathname.toLowerCase().replace(/[-_]/g, ' ');
    const host = new URL(url).hostname.toLowerCase();

    for (const [topic, keywords] of Object.entries(URL_TOPIC_KEYWORDS)) {
      for (const kw of keywords) {
        if (kw.length >= 4 && (path.includes(kw) || host.includes(kw))) {
          const current = localScores[topic] || 0;
          // URL signal provides a floor of 0.40 — meaningful but not enough alone.
          // Combined with even a single lexicon match, pushes score above most thresholds.
          localScores[topic] = Math.max(current, 0.40, current + 0.15);
          break; // One URL match per topic is enough
        }
      }
    }
  } catch { /* ignore invalid URLs */ }
}

// ═════════════════════════════════════════════════════════════════
// STEP 4 — Local Prefilter Thresholds
// ═════════════════════════════════════════════════════════════════

const T_BLOCK_LOCAL = 0.92;  // Confidently block without remote
const T_ALLOW_LOCAL = 0.15;  // Confidently allow without remote

function needsRemote(score) {
  return !(score >= T_BLOCK_LOCAL || score <= T_ALLOW_LOCAL);
}

// ═════════════════════════════════════════════════════════════════
// STEP 5 — Score Merge (local + remote)
// ═════════════════════════════════════════════════════════════════

function mergeScores(localScores, remoteScores) {
  if (!remoteScores) return localScores;

  const merged = { ...localScores };
  for (const [topic, r] of Object.entries(remoteScores)) {
    const l = localScores[topic] || 0;
    merged[topic] = Math.max(r, l * 0.85);
  }
  return merged;
}

// ═════════════════════════════════════════════════════════════════
// STEP 6 — Intent Disambiguation (gated)
// ═════════════════════════════════════════════════════════════════

function needsIntent(scores, policy) {
  for (const rule of (policy.topic_rules || [])) {
    if (rule.action !== 'block') continue;
    const s = scores[rule.topic] || 0;
    const T = rule.threshold;
    // Ambiguous band: [T - 0.12, T + 0.08]
    if (s >= T - 0.12 && s <= T + 0.08) return true;
  }
  return false;
}

// ═════════════════════════════════════════════════════════════════
// STEP 7 — Confidence Calibration
// ═════════════════════════════════════════════════════════════════

function calibrateConfidence(score, content) {
  // Text coverage: how much text do we actually have?
  const textLen = (content.main_text || '').length + (content.title || '').length;
  const coverage = Math.min(1, textLen / 2000); // normalize to ~2000 chars
  return clamp01(0.15 + score * 0.85) * clamp01(0.6 + 0.4 * coverage);
}

// ═════════════════════════════════════════════════════════════════
// STEP 8 — Topic Policy Evaluation (Kids-Only: BLOCK or ALLOW)
// ═════════════════════════════════════════════════════════════════

function sortBlockRules(blockRules, scores) {
  return [...blockRules].sort((a, b) => {
    const sa = scores[a.topic] || 0;
    const sb = scores[b.topic] || 0;
    // Higher score first
    if (sb !== sa) return sb - sa;
    // Then by scope specificity (domain-scoped > global)
    const specA = a.scope?.domains ? 1 : 0;
    const specB = b.scope?.domains ? 1 : 0;
    return specB - specA;
  });
}

function evalTopicPolicy(content, scores, intent, policy) {
  const domain = (content.domain || '').toLowerCase();
  const contentType = content.content_type || 'unknown';

  const blockRules = (policy.topic_rules || []).filter(r => r.action === 'block');
  const sorted = sortBlockRules(blockRules, scores);

  // Intent-based threshold modifier:
  // Promotional/how_to content → lower threshold (easier to block)
  // News/education → higher threshold (harder to block, not impossible)
  // Recovery support → generally allow (harm reduction is good)
  const thresholdMod = intent ? intentThresholdModifier(intent) : 1.0;

  for (const rule of sorted) {
    // Scope check
    if (rule.scope?.domains && !rule.scope.domains.some(d =>
      domain.includes(d) || domain.endsWith(d))) continue;
    if (rule.scope?.content_types && !rule.scope.content_types.includes(contentType)) continue;

    const s = scores[rule.topic] || 0;

    // Apply intent-based threshold modulation.
    // e.g., gambling threshold 0.75 × 0.80 (promotional) = 0.60 effective
    // e.g., gambling threshold 0.75 × 1.25 (news) = 0.9375 effective
    const effectiveThreshold = clamp01(rule.threshold * thresholdMod);
    if (s < effectiveThreshold) continue;

    // Recovery/support content override: if the page is about harm reduction
    // or recovery support for the matched topic, allow it through.
    // e.g., "how to quit gambling" should not be blocked for gambling topic.
    if (intent && isProtectiveIntent(intent)) {
      return {
        decision: 'ALLOW',
        reason_code: `RECOVERY_ALLOW_${rule.topic}`,
        confidence: clamp01((s + intent.confidence) / 2),
        evidence: [
          `Matched ${rule.topic} but recovery/support intent detected (${intent.label}, ${intent.confidence.toFixed(2)}).`,
        ],
        enforcement: { layer: 'RENDER', technique: 'overlay' },
      };
    }

    // Exception check (intent-based allow from rule config)
    if (rule.exceptions?.length && intent) {
      for (const ex of rule.exceptions) {
        const need = ex.threshold || 0.70;
        if (intent.label === ex.intent && intent.confidence >= need) {
          return {
            decision: 'ALLOW',
            reason_code: `EXCEPTION_ALLOW_${rule.topic}_${ex.intent}`,
            confidence: clamp01((s + intent.confidence) / 2),
            evidence: [
              `Matched ${rule.topic} but exception intent=${ex.intent} applied`,
            ],
            enforcement: { layer: 'RENDER', technique: 'overlay' },
          };
        }
      }
    }

    // No exception → BLOCK
    const conf = calibrateConfidence(s, content);
    return {
      decision: 'BLOCK',
      reason_code: `TOPIC_BLOCK_${rule.topic}`,
      confidence: conf,
      evidence: buildEvidence(rule.topic, s, content, intent),
      enforcement: { layer: 'RENDER', technique: 'overlay' },
    };
  }

  // No block rules triggered
  return null;
}

function buildEvidence(topic, score, content, intent) {
  const bullets = [];
  bullets.push(`Matched topic ${topic} (${score.toFixed(2)} ≥ threshold).`);
  if (content.title) {
    bullets.push(`Signals: TITLE='${content.title.slice(0, 80)}'.`);
  }
  if (intent) {
    bullets.push(`Intent classifier: ${intent.label} (${intent.confidence.toFixed(2)}).`);
  }
  return bullets;
}

// ═════════════════════════════════════════════════════════════════
// STEP 9 — Aggregation (BLOCK > LIMIT > ALLOW)
// ═════════════════════════════════════════════════════════════════

function aggregate(topicDecision, behaviorDecision) {
  // BLOCK wins
  if (topicDecision?.decision === 'BLOCK') return topicDecision;
  // LIMIT wins over ALLOW
  if (behaviorDecision?.decision === 'LIMIT') return behaviorDecision;
  // Topic-based ALLOW with exception
  if (topicDecision?.decision === 'ALLOW') return topicDecision;

  // Default ALLOW
  return {
    decision: 'ALLOW',
    reason_code: 'ALLOW_NO_RULE_MATCH',
    confidence: 0.8,
    evidence: [],
    enforcement: { layer: 'RENDER', technique: 'overlay' },
  };
}

// ═════════════════════════════════════════════════════════════════
// STEP 10 — Enforcement Selection
// ═════════════════════════════════════════════════════════════════

function selectEnforcement(decision, content, wasDomainGate) {
  // Core invariant: Platform ≠ Content.
  // Blocking content must NOT block the platform.
  // Always select the minimum-necessary restriction for the detected scope.
  if (decision.decision === 'BLOCK') {
    if (wasDomainGate) {
      decision.enforcement = { layer: 'NETWORK', technique: 'cancel_request' };
    } else if (content.content_type === 'chat') {
      // Chat/DM context: block the conversation pane only, not the entire platform.
      // Enforcer will cover just the chat thread and alert the parent.
      decision.enforcement = { layer: 'RENDER', technique: 'chat_block' };
    } else if (content.content_type === 'video') {
      // Video page: block just the player area, not the entire page.
      // User can still navigate away via sidebar, search bar, etc.
      decision.enforcement = { layer: 'RENDER', technique: 'player_block' };
    } else if (content.content_type === 'feed') {
      decision.enforcement = { layer: 'RENDER', technique: 'blur' };
    } else {
      decision.enforcement = { layer: 'RENDER', technique: 'overlay' };
    }
  } else if (decision.decision === 'LIMIT') {
    // Keep enforcement from behavior eval (scroll_gate / time_gate / pause_autoplay)
  }
  // ALLOW: no enforcement needed
  return decision;
}

// ═════════════════════════════════════════════════════════════════
// MAIN PIPELINE: evaluate()
// ═════════════════════════════════════════════════════════════════

/**
 * Run the full 12-step deterministic pipeline.
 *
 * @param {ContentObject} content — extracted from page
 * @param {PolicyObject} policy — compiled from parent rules
 * @param {SessionState} sessionState — behavior tracking
 * @returns {DecisionObject}
 */
export function evaluate(content, policy, sessionState) {
  // Step 1: Domain gate (also checks URL-level blocks)
  const gate = domainGate(content.url, policy);
  if (gate === 'BLOCK_URL') {
    return {
      decision: 'BLOCK',
      reason_code: 'URL_BLOCK',
      confidence: 1.0,
      evidence: ['This specific page/video has been blocked by your parent.'],
      enforcement: { layer: 'OVERLAY', technique: 'full_block' },
      debug: { topic_scores: {}, cache_hit: false },
    };
  }
  if (gate === 'BLOCK') {
    return {
      decision: 'BLOCK',
      reason_code: 'DOMAIN_BLOCK',
      confidence: 0.99,
      evidence: ['Blocked by parent domain rule.'],
      enforcement: { layer: 'NETWORK', technique: 'cancel_request' },
      debug: { topic_scores: {}, cache_hit: false },
    };
  }

  // Step 2: Content ID (for caching)
  const cid = content.id || contentId(content);
  content.id = cid;

  // Step 3: Cache check
  const cached = cacheGet(policy.policy_version, cid);
  if (cached) {
    return { ...cached, debug: { ...cached.debug, cache_hit: true } };
  }

  // Step 4: Local prefilter (weighted lexicon scoring)
  // NOTE: Grooming is NOT scored here. The grooming lexicon is empty;
  // intelligent grooming detection happens in Step 4b below.
  const text = canonicalText(content).toLowerCase();
  const localScores = localScoreAllTopics(text);

  // Step 4a: URL-based topic boosting
  // URL paths like /best-online-casinos/ carry strong topic signals.
  // Boosts scores for topics found in the URL — critical for landing
  // pages, affiliate sites, and SPA pages with minimal body text.
  urlTopicBoost(content.url, localScores);

  // Step 4b: Intelligent Grooming Detection
  // Replaces static keyword matching with multi-signal, conversation-aware,
  // obfuscation-resistant grooming pattern detection.
  // Uses the grooming detector (grooming-detector.js) instead of the lexicon.
  const groomingResult = detectGrooming(
    text,
    content.chat?.messages || null,
    content._grooming_conversation_state || null,
  );
  const groomingScore = groomingResultToTopicScore(groomingResult);
  if (groomingScore > 0) {
    localScores.grooming = groomingScore;
  }
  // Persist updated conversation state back on content for the caller
  if (groomingResult.updated_conversation_state) {
    content._grooming_conversation_state = groomingResult.updated_conversation_state;
    content._grooming_result = groomingResult;
  }

  // Step 4c: Rule-compiler keyword scoring for custom topics
  // Topics defined in rule-compiler (e.g., sports_video_games) may not have
  // lexicons. For any policy topic that scored 0 from the lexicon, try the
  // rule-compiler's keyword-based scorer as a fallback.
  if (policy._compiledRules) {
    const domain = (content.domain || '').toLowerCase();
    const url = (content.url || '').toLowerCase();
    for (const rule of (policy.topic_rules || [])) {
      if (!localScores[rule.topic] || localScores[rule.topic] === 0) {
        const ruleScore = scoreContentForLabel(text, domain, url, rule.topic, true);
        if (ruleScore > 0) {
          localScores[rule.topic] = ruleScore;
        }
      }
    }

    // Also evaluate the full compiled rules with exception handling
    // This catches "block X but allow Y" patterns that scoreContentForLabel alone can't handle
    const ruleResult = evaluateCompiledRules(policy._compiledRules, content.url || '', domain, text);
    if (ruleResult.action === 'BLOCK_CONTENT') {
      // The rule matched — inject the score for the matched topic
      const matchedLabels = ruleResult.matchedRules?.[0]?.matched_labels || [];
      for (const label of matchedLabels) {
        localScores[label] = Math.max(localScores[label] || 0, ruleResult.confidence || 0.80);
      }
      // If no specific labels matched but we have a block, use the rule's block labels
      if (matchedLabels.length === 0 && ruleResult.matchedRules?.[0]?.rule?._blockLabels) {
        for (const label of ruleResult.matchedRules[0].rule._blockLabels) {
          localScores[label] = Math.max(localScores[label] || 0, ruleResult.confidence || 0.80);
        }
      }
    } else if (ruleResult.action === 'ALLOW') {
      // Exception matched — suppress the score (e.g., "regular sports is okay")
      const matchedRule = ruleResult.matchedRules?.[0]?.rule;
      if (matchedRule?._blockLabels) {
        for (const label of matchedRule._blockLabels) {
          delete localScores[label];
        }
      }
    }
  }

  // Step 5: Remote semantic scoring (stub — no backend yet)
  // In the future, this calls an embedding service for topic vector scoring
  let remoteScores = null;
  // const anyNeedsRemote = Object.values(localScores).some(s => needsRemote(s));
  // if (anyNeedsRemote) remoteScores = await remoteEmbedScore(text);

  // Step 6: Merge scores
  const scores = mergeScores(localScores, remoteScores);

  // Step 7: Intent classification (heuristic — no LLM needed)
  // Classifies page intent using title, headings, URL, and text signals.
  // Used to modulate blocking thresholds:
  //   promotional/how_to → easier to block (lower threshold)
  //   news/education → harder to block (higher threshold)
  //   recovery_support → generally allow (harm reduction)
  let intent = null;
  const hasTopicScores = Object.values(scores).some(s => s > 0.1);
  if (hasTopicScores) {
    // Only classify intent when we actually have topic matches.
    // No point running intent on pages with zero topic signal.
    intent = classifyIntent(content);
    if (intent.label === 'unknown') intent = null;
  }

  // Step 8: Topic policy evaluation → BLOCK or null
  const topicDecision = evalTopicPolicy(content, scores, intent, policy);

  // Step 8b: Enrich grooming decisions with intelligent evidence
  // Replace generic "Matched topic grooming" with behavioral explanation.
  if (topicDecision && topicDecision.reason_code === 'TOPIC_BLOCK_grooming' && groomingResult) {
    topicDecision.evidence = buildGroomingEvidence(groomingResult);
    // Attach grooming analysis metadata for parent alerts
    topicDecision._grooming_analysis = {
      stage: groomingResult.stage,
      tactic: groomingResult.tactic,
      risk_score: groomingResult.risk_score,
      explanation: groomingResult.explanation,
      conversation: groomingResult.conversation,
    };
  }

  // Step 9: Behavior evaluation → LIMIT or null
  const bScores = behaviorScores(sessionState, content.ui || {});
  const behaviorDecision = evalBehaviorRules(bScores, policy.behavior_rules || []);

  // Step 10: Aggregate (BLOCK > LIMIT > ALLOW)
  let final = aggregate(topicDecision, behaviorDecision);

  // Step 11: Enforcement selection
  final = selectEnforcement(final, content, false);

  // Step 12: Attach debug + cache
  final.debug = {
    topic_scores: scores,
    content_type: content.content_type || 'unknown',
    text_length: (content.main_text || '').length + (content.visible_text_sample || '').length,
    intent: intent ? { label: intent.label, confidence: intent.confidence } : undefined,
    behavior: { pattern_scores: bScores },
    grooming: groomingResult ? {
      risk_score: groomingResult.risk_score,
      stage: groomingResult.stage,
      tactic: groomingResult.tactic,
      signal_count: groomingResult.signal_count,
      suppressed: groomingResult.suppressed,
      conversation: groomingResult.conversation ? {
        trajectory_score: groomingResult.conversation.trajectory_score,
        stages_active: groomingResult.conversation.stages_active,
        highest_stage: groomingResult.conversation.highest_stage,
      } : undefined,
    } : undefined,
    cache_hit: false,
  };

  // Cache the decision
  if (final.decision !== 'ALLOW' || Object.keys(scores).length > 0) {
    cacheSet(policy.policy_version, cid, final);
  }

  return final;
}

/**
 * Compile parent rules (from rule-compiler) into a PolicyObject.
 * This is the bridge between the NL rule compiler and the deterministic pipeline.
 *
 * @param {Array} compiledRules — output of compileRules()
 * @param {string} profileTier — 'kid_10' | 'tween_13' | 'teen_16'
 * @returns {PolicyObject}
 */
export function compileToPolicyObject(compiledRules, profileTier) {
  const version = hashString(JSON.stringify(compiledRules.map(r => r.source_text)) + profileTier);

  const profile = PROFILE_DEFAULTS[profileTier] || PROFILE_DEFAULTS.tween_13;

  const policy = {
    policy_version: version,
    child_profile: profile,
    domain_rules: {
      allow_domains: [],
      block_domains: [],
      domain_mode: 'default_allow',
    },
    block_urls: [],
    topic_rules: [],
    behavior_rules: DEFAULT_BEHAVIOR_RULES,
    explainability: { mode: 'standard' },
  };

  // ── Mandatory safety topics ──────────────────────────────────
  // These are always-on child protections regardless of parent config.
  // Parents can make rules stricter, but these cannot be removed.
  const MANDATORY_SAFETY_TOPICS = [
    { topic: 'grooming', threshold: 0.60 },
    { topic: 'self_harm', threshold: 0.70 },
    { topic: 'pornography', threshold: 0.65 },
    { topic: 'violence', threshold: 0.80 },
    { topic: 'weapons', threshold: 0.80 },
    { topic: 'drugs', threshold: 0.80 },
    { topic: 'extremism', threshold: 0.75 },
    { topic: 'bullying', threshold: 0.75 },
    { topic: 'eating_disorder', threshold: 0.75 },
    { topic: 'scams', threshold: 0.75 },
  ];

  for (const mandatory of MANDATORY_SAFETY_TOPICS) {
    policy.topic_rules.push({
      topic: mandatory.topic,
      action: 'block',
      threshold: Math.min(mandatory.threshold, profile.topic_threshold_default),
    });
  }

  const seenDomains = new Set();
  const seenTopics = new Set(MANDATORY_SAFETY_TOPICS.map(m => m.topic));

  for (const rule of compiledRules) {
    // BLOCK_DOMAIN rules → domain_rules.block_domains
    if (rule.action?.type === 'BLOCK_DOMAIN') {
      for (const d of (rule.scope?.domain_blocklist || [])) {
        if (!seenDomains.has(d)) {
          policy.domain_rules.block_domains.push(d);
          seenDomains.add(d);
        }
      }

      // CRITICAL FIX: Category blocks must ALSO produce global topic rules.
      // This is what makes "block gambling" work on YouTube (not just gambling domains).
      // Maps category names to lexicon topic keys (they may differ).
      if (rule.condition?.category_match) {
        for (const cat of rule.condition.category_match) {
          const topics = CATEGORY_TO_TOPICS[cat] || [cat];
          for (const topic of topics) {
            if (!seenTopics.has(topic)) {
              policy.topic_rules.push({
                topic,
                action: 'block',
                threshold: profile.topic_threshold_default,
              });
              seenTopics.add(topic);
            }
          }
        }
      }
    }

    // BLOCK_URL rules → block_urls (specific page/video blocking)
    if (rule.action?.type === 'BLOCK_URL' && rule._blockUrls) {
      for (const url of rule._blockUrls) {
        if (!policy.block_urls.includes(url)) {
          policy.block_urls.push(url);
        }
      }
    }

    // BLOCK_CONTENT rules with classifier → topic_rules
    if (rule.action?.type === 'BLOCK_CONTENT' && rule.condition?.classifier?.labels_any) {
      for (const label of rule.condition.classifier.labels_any) {
        if (!seenTopics.has(label)) {
          policy.topic_rules.push({
            topic: label,
            action: 'block',
            threshold: rule.condition.classifier.threshold || profile.topic_threshold_default,
            scope: rule.scope?.domain_allowlist?.length
              ? { domains: rule.scope.domain_allowlist }
              : undefined,
          });
          seenTopics.add(label);
        }
      }
    }

    // Domain allowlists from content-scoped rules
    if (rule.scope?.domain_allowlist) {
      for (const d of rule.scope.domain_allowlist) {
        if (!policy.domain_rules.allow_domains.includes(d)) {
          policy.domain_rules.allow_domains.push(d);
        }
      }
    }

    // REDUCE_ADDICTION intent → behavior rules
    if (rule.parsed_intent === 'REDUCE_ADDICTION') {
      // Extract time limit if specified
      const timeMatch = rule.source_text?.match(/(\d+)\s*(?:minutes?|mins?|hours?|hrs?)/i);
      if (timeMatch) {
        const num = parseInt(timeMatch[1]);
        const isHours = /hours?|hrs?/i.test(timeMatch[0]);
        const minutes = isHours ? num * 60 : num;
        policy.behavior_rules.push({
          pattern: 'infinite_scroll_binge',
          action: 'limit',
          budget_minutes: minutes,
        });
      }
    }
  }

  // Attach compiled rules for Step 4c (rule-compiler keyword scoring)
  policy._compiledRules = compiledRules;

  return policy;
}

// ── Category → Lexicon Topic Mapping ─────────────────────────────
// Category names from rule-compiler may differ from lexicon topic keys.
// e.g., category "adult" → lexicon topic "pornography"
const CATEGORY_TO_TOPICS = {
  adult: ['pornography'],
  gambling: ['gambling'],
  weapons: ['weapons', 'violence'],
  drugs: ['drugs'],
  self_harm: ['self_harm'],
  hate: ['hate'],
  bullying: ['bullying'],
  grooming: ['grooming'],
  scams: ['scams'],
  extremism: ['extremism'],
};

// ── Profile Defaults ──────────────────────────────────────────────

const PROFILE_DEFAULTS = {
  kid_10: {
    age: 10,
    sensitivity: 'high',
    topic_threshold_default: 0.65, // Block earlier for kids
  },
  tween_13: {
    age: 13,
    sensitivity: 'med',
    topic_threshold_default: 0.75,
  },
  teen_16: {
    age: 16,
    sensitivity: 'low',
    topic_threshold_default: 0.82, // Higher threshold for teens
  },
};

// ── Default Behavior Rules ────────────────────────────────────────

// Behavior rules disabled for now — re-enable when ready for user testing.
const DEFAULT_BEHAVIOR_RULES = [];
