// Phylax Engine — Safety Decision Engine v1.0 (Agent 4)
// The JUDGE: combines semantic interpretation + pattern context + parent rules + child age
// into a final deterministic action.
//
// This is Step N of the Semantic Safety Pipeline — the decision layer that sits
// after semantic analysis (Agent 2) and pattern detection (Agent 3).
//
// Inputs:
//   semanticResult  — from Agent 2 (topic, intent, stance, risk_level, age_fit, flags)
//   patternResult   — from Agent 3 (pattern_type, confidence, escalation_stage, trend)
//   parentRules     — from Supabase sync (existing format + LLM rules)
//   childProfile    — age tier, thresholds from policyEngine
//   platformContext — which site, modality, direction
//
// Output: DecisionResult
//   { signal_id, decision, action_reason, confidence, triggered_rules,
//     explanation, escalate_to_cloud }
//
// Core invariants:
//   1. Deterministic — same inputs always produce the same output
//   2. Safety-first — grooming/exploitation always override individual message allow
//   3. Parent rules enforced AFTER semantic interpretation (not raw keyword matching)
//   4. Jailbreak detection is always-on, not parent-configurable
//   5. Explanations are parent-readable, not technical

import {
  compileLLMRules,
  evaluateLLMRules,
  detectJailbreak,
  LLM_RULE_ACTIONS,
} from './llm-rules.js';

// ── Helpers ───────────────────────────────────────────────────

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

/**
 * Generate a v4-style UUID without crypto dependency.
 * Not cryptographically secure — used for signal correlation only.
 */
function generateSignalId() {
  const hex = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) id += '-';
    if (i === 12) {
      id += '4';
    } else if (i === 16) {
      id += hex[(Math.random() * 4 | 0) + 8];
    } else {
      id += hex[Math.random() * 16 | 0];
    }
  }
  return id;
}

// ── Age Tier Configuration ───────────────────────────────────
// Maps age tier IDs from policyEngine.ts to decision thresholds.
// These determine how aggressively the engine acts per age group.

const AGE_TIER_CONFIG = {
  // AgeGroup 0: Under 5 — Max Protection
  0: {
    label: 'Early Years',
    sensitivity_multiplier: 2.5,
    block_threshold: 0.15,
    warn_threshold: 0.10,
    auto_alert_parent: true,
    allow_educational_override: false,
  },
  // AgeGroup 1: 5-8 — High Protection
  1: {
    label: 'Young Explorers',
    sensitivity_multiplier: 2.0,
    block_threshold: 0.25,
    warn_threshold: 0.15,
    auto_alert_parent: true,
    allow_educational_override: false,
  },
  // AgeGroup 2: 8-11 — Guided Internet
  2: {
    label: 'Growing Up',
    sensitivity_multiplier: 1.5,
    block_threshold: 0.40,
    warn_threshold: 0.25,
    auto_alert_parent: true,
    allow_educational_override: true,
  },
  // AgeGroup 3: 11-14 — Supervised Independence
  3: {
    label: 'Pre-Teen',
    sensitivity_multiplier: 1.2,
    block_threshold: 0.60,
    warn_threshold: 0.40,
    auto_alert_parent: false,
    allow_educational_override: true,
  },
  // AgeGroup 4: 14+ — Intelligent Guardian
  4: {
    label: 'Teen',
    sensitivity_multiplier: 1.0,
    block_threshold: 0.80,
    warn_threshold: 0.55,
    auto_alert_parent: false,
    allow_educational_override: true,
  },
  // Legacy tier names (from pipeline.js PROFILE_DEFAULTS)
  kid_10: {
    label: 'Child',
    sensitivity_multiplier: 1.8,
    block_threshold: 0.30,
    warn_threshold: 0.18,
    auto_alert_parent: true,
    allow_educational_override: false,
  },
  tween_13: {
    label: 'Tween',
    sensitivity_multiplier: 1.3,
    block_threshold: 0.50,
    warn_threshold: 0.33,
    auto_alert_parent: true,
    allow_educational_override: true,
  },
  teen_16: {
    label: 'Teen',
    sensitivity_multiplier: 1.0,
    block_threshold: 0.75,
    warn_threshold: 0.50,
    auto_alert_parent: false,
    allow_educational_override: true,
  },
};

// ── Severity Hierarchy ───────────────────────────────────────
// Ordered by severity: grooming/exploitation > self-harm > violence > drugs > profanity
// Higher severity = lower threshold for blocking + more likely to alert parent.

const SEVERITY_WEIGHTS = {
  grooming:           1.00,
  exploitation:       1.00,
  sexual_content_minors: 1.00,
  jailbreak:          0.95,
  self_harm:          0.90,
  suicide:            0.90,
  pornography:        0.85,
  sexual_content:     0.85,
  extremism:          0.85,
  violence:           0.80,
  weapons:            0.75,
  drugs:              0.75,
  hate:               0.70,
  bullying:           0.70,
  eating_disorder:    0.70,
  scams:              0.65,
  gambling:           0.60,
  profanity:          0.30,
  general_safety:     0.50,
};

// ── Decision Actions ─────────────────────────────────────────

const DECISION_ACTIONS = {
  allow:                'allow',
  blur:                 'blur',
  block:                'block',
  block_and_alert:      'block_and_alert',
  warn:                 'warn',
  educational_redirect: 'educational_redirect',
  queue_for_review:     'queue_for_review',
};

// ── Explanation Templates ────────────────────────────────────
// Human-readable explanations for parents. Keyed by topic/pattern.

const EXPLANATION_TEMPLATES = {
  grooming: {
    single: 'A message in this conversation contained patterns commonly associated with online grooming, such as {detail}.',
    pattern: 'Incoming conversation showed sustained {detail} from {source}.',
  },
  jailbreak: {
    single: 'Your child attempted to bypass the AI safety filters. The message tried to trick the AI into ignoring its safety rules.',
  },
  self_harm: {
    single: 'This conversation touched on self-harm or suicide-related topics in a way that could be harmful for your child.',
  },
  violence: {
    single: 'This conversation contained violent content that is not appropriate for your child\'s age group.',
  },
  drugs: {
    single: 'This conversation discussed drugs or substance use in a way that goes beyond educational context.',
  },
  pornography: {
    single: 'This conversation contained sexually explicit content that is not appropriate for your child.',
  },
  weapons: {
    single: 'This conversation discussed weapons in a context that is not educational or age-appropriate.',
  },
  hate: {
    single: 'This conversation contained hate speech or discriminatory content.',
  },
  extremism: {
    single: 'This conversation contained content related to extremist ideologies or radicalization.',
  },
  bullying: {
    single: 'This conversation contained bullying or cyberbullying patterns.',
  },
  eating_disorder: {
    single: 'This conversation discussed eating disorders in a way that could encourage harmful behavior.',
  },
  scams: {
    single: 'This conversation contained patterns associated with scams or fraudulent activity.',
  },
  gambling: {
    single: 'This conversation discussed gambling in a way that is not appropriate for your child.',
  },
  profanity: {
    single: 'This conversation contained excessive profanity or vulgar language.',
  },
  capability_blocked: {
    single: 'Your child tried to use a capability ({capability}) that you have restricted.',
  },
  persona_blocked: {
    single: 'The AI was being asked to adopt a persona ({persona}) that you have restricted.',
  },
  pattern_escalation: {
    single: 'While individual messages may seem harmless, the overall pattern of this conversation shows concerning escalation — {detail}.',
  },
  default: {
    single: 'This content was flagged by your family\'s safety settings.',
  },
};

// ═════════════════════════════════════════════════════════════════
// MAIN DECISION FUNCTION
// ═════════════════════════════════════════════════════════════════

/**
 * Make a safety decision by combining all pipeline inputs.
 *
 * @param {Object} semanticResult — From Agent 2
 *   { topic, intent, stance, risk_level, age_fit, flags, _raw_text? }
 * @param {Object} patternResult — From Agent 3
 *   { pattern_type, confidence, escalation_stage, trend, signals? }
 * @param {Array} parentRules — From Supabase sync
 *   Array of { id, text|source_text|rule, ... }
 * @param {Object} childProfile — Age tier info
 *   { age_tier, age?, thresholds? }
 * @param {Object} platformContext — Platform information
 *   { site, modality, direction }
 * @returns {DecisionResult}
 */
export function makeDecision(semanticResult, patternResult, parentRules, childProfile, platformContext) {
  const signalId = generateSignalId();
  const triggeredRules = [];

  // ── Resolve age tier configuration ─────────────────────────
  const ageTier = childProfile?.age_tier ?? childProfile?.age_group ?? 3;
  const tierConfig = AGE_TIER_CONFIG[ageTier] || AGE_TIER_CONFIG[3];

  // ── Compile LLM rules from parent rules ────────────────────
  const { llmRules, standardRules } = compileLLMRules(parentRules || []);

  // ═══════════════════════════════════════════════════════════
  // STEP 1: Automatic blocks (always-on, not configurable)
  // ═══════════════════════════════════════════════════════════

  // 1a. Jailbreak detection — always blocked
  const rawText = semanticResult?._raw_text || '';
  const jailbreakResult = detectJailbreak(rawText);

  if (jailbreakResult.detected) {
    triggeredRules.push('__jailbreak_protection');
    return buildResult({
      signal_id: signalId,
      decision: DECISION_ACTIONS.block_and_alert,
      action_reason: 'jailbreak_attempt',
      confidence: jailbreakResult.confidence,
      triggered_rules: triggeredRules,
      explanation: EXPLANATION_TEMPLATES.jailbreak.single,
      escalate_to_cloud: false,
    });
  }

  // 1b. Hardcoded safety: child sexual exploitation material — instant block
  const csemSignals = detectCSEM(semanticResult);
  if (csemSignals.detected) {
    triggeredRules.push('__csem_protection');
    return buildResult({
      signal_id: signalId,
      decision: DECISION_ACTIONS.block_and_alert,
      action_reason: 'csem_detected',
      confidence: 0.99,
      triggered_rules: triggeredRules,
      explanation: 'This content was immediately blocked due to child safety protections.',
      escalate_to_cloud: false,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 2: Evaluate parent LLM rules against semantic result
  // ═══════════════════════════════════════════════════════════

  const llmMatches = evaluateLLMRules(llmRules, semanticResult || {}, platformContext || {});

  if (llmMatches.length > 0) {
    // Sort by confidence descending, take the strongest match
    llmMatches.sort((a, b) => b.confidence - a.confidence);
    const topMatch = llmMatches[0];

    for (const m of llmMatches) {
      triggeredRules.push(m.rule.id);
    }

    const explanation = buildLLMRuleExplanation(topMatch);
    const decision = determineDecisionForLLMRule(topMatch, tierConfig);

    return buildResult({
      signal_id: signalId,
      decision,
      action_reason: topMatch.detail,
      confidence: topMatch.confidence,
      triggered_rules: triggeredRules,
      explanation,
      escalate_to_cloud: false,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 3: Factor in pattern context (Agent 3)
  // Grooming escalation overrides individual message "allow"
  // ═══════════════════════════════════════════════════════════

  const patternDecision = evaluatePatternContext(patternResult, semanticResult, tierConfig);

  if (patternDecision) {
    // Pattern context produced a decision — this takes precedence
    // because conversation-level signals outweigh single-message analysis
    return buildResult({
      signal_id: signalId,
      decision: patternDecision.decision,
      action_reason: patternDecision.action_reason,
      confidence: patternDecision.confidence,
      triggered_rules: patternDecision.triggered_rules,
      explanation: patternDecision.explanation,
      escalate_to_cloud: patternDecision.escalate_to_cloud,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 4: Evaluate semantic result against age tier thresholds
  // ═══════════════════════════════════════════════════════════

  const semanticDecision = evaluateSemanticResult(semanticResult, tierConfig, childProfile);

  // ═══════════════════════════════════════════════════════════
  // STEP 5: Evaluate standard parent rules (non-LLM)
  // ═══════════════════════════════════════════════════════════

  const standardRuleDecision = evaluateStandardRules(standardRules, semanticResult, platformContext);

  // ═══════════════════════════════════════════════════════════
  // STEP 6: Cloud escalation check
  // ═══════════════════════════════════════════════════════════

  const escalateToCloud = shouldEscalateToCloud(
    semanticResult,
    patternResult,
    semanticDecision,
    tierConfig,
  );

  // ═══════════════════════════════════════════════════════════
  // STEP 7: Aggregate all signals → final decision
  // ═══════════════════════════════════════════════════════════

  const finalDecision = aggregateDecisions(
    semanticDecision,
    standardRuleDecision,
    patternResult,
    tierConfig,
    escalateToCloud,
  );

  // Merge triggered rules
  const allTriggeredRules = [
    ...triggeredRules,
    ...(semanticDecision?.triggered_rules || []),
    ...(standardRuleDecision?.triggered_rules || []),
  ];

  return buildResult({
    signal_id: signalId,
    decision: finalDecision.decision,
    action_reason: finalDecision.action_reason,
    confidence: finalDecision.confidence,
    triggered_rules: allTriggeredRules,
    explanation: finalDecision.explanation,
    escalate_to_cloud: escalateToCloud,
  });
}

// ═════════════════════════════════════════════════════════════════
// INTERNAL: Pattern context evaluation
// ═════════════════════════════════════════════════════════════════

function evaluatePatternContext(patternResult, semanticResult, tierConfig) {
  if (!patternResult) return null;

  const patternType = (patternResult.pattern_type || '').toLowerCase();
  const patternConfidence = patternResult.confidence || 0;
  const escalationStage = patternResult.escalation_stage || 0;
  const trend = (patternResult.trend || '').toLowerCase();

  // Grooming pattern with escalation — this is the highest priority pattern
  if (patternType === 'grooming' || patternType === 'grooming_sequence') {
    // Stage 3+ (boundary testing / escalation) = immediate block + alert
    if (escalationStage >= 3 || patternConfidence >= 0.75) {
      const stageDescriptions = {
        1: 'trust building and rapport establishment',
        2: 'isolation and secrecy encouragement',
        3: 'boundary testing and normalization',
        4: 'escalation and explicit requests',
        5: 'coercion and threats',
      };
      const stageDesc = stageDescriptions[escalationStage] || 'concerning escalation';

      return {
        decision: DECISION_ACTIONS.block_and_alert,
        action_reason: 'high-confidence grooming progression',
        confidence: Math.max(patternConfidence, 0.85),
        triggered_rules: ['__grooming_pattern_detection'],
        explanation: EXPLANATION_TEMPLATES.grooming.pattern
          .replace('{detail}', `${stageDesc} and escalating intimacy`)
          .replace('{source}', 'an unknown contact'),
        escalate_to_cloud: false,
      };
    }

    // Stage 1-2 with escalating trend — block but don't necessarily alert yet
    if (escalationStage >= 1 && trend === 'escalating') {
      return {
        decision: DECISION_ACTIONS.block,
        action_reason: 'grooming pattern with escalating trend',
        confidence: clamp01(patternConfidence + 0.10),
        triggered_rules: ['__grooming_pattern_detection'],
        explanation: EXPLANATION_TEMPLATES.grooming.single
          .replace('{detail}', 'secrecy encouragement and unusual rapport building'),
        escalate_to_cloud: patternConfidence < 0.6,
      };
    }

    // Low-stage grooming signals — warn or queue for review depending on age
    if (patternConfidence >= 0.40) {
      const decision = tierConfig.auto_alert_parent
        ? DECISION_ACTIONS.warn
        : DECISION_ACTIONS.queue_for_review;

      return {
        decision,
        action_reason: 'early grooming indicators detected',
        confidence: patternConfidence,
        triggered_rules: ['__grooming_pattern_detection'],
        explanation: EXPLANATION_TEMPLATES.grooming.single
          .replace('{detail}', 'early trust-building and personal probing'),
        escalate_to_cloud: patternConfidence < 0.5,
      };
    }
  }

  // General escalation pattern — any topic with escalating trend
  if (trend === 'escalating' && patternConfidence >= 0.60) {
    return {
      decision: DECISION_ACTIONS.block,
      action_reason: `escalating ${patternType} pattern`,
      confidence: patternConfidence,
      triggered_rules: ['__pattern_escalation'],
      explanation: EXPLANATION_TEMPLATES.pattern_escalation.single
        .replace('{detail}', `a ${patternType} pattern that is intensifying over time`),
      escalate_to_cloud: false,
    };
  }

  // Ambiguous pattern — single message seems fine but pattern context suggests concern
  if (patternType && patternConfidence >= 0.30 && patternConfidence < 0.60) {
    const semanticRisk = semanticResult?.risk_level || 0;
    if (semanticRisk < 0.30) {
      // Semantic says low risk, but pattern context says moderate concern
      // → escalate to cloud for deeper analysis
      return {
        decision: DECISION_ACTIONS.queue_for_review,
        action_reason: 'ambiguous pattern requiring deeper analysis',
        confidence: patternConfidence,
        triggered_rules: [],
        explanation: 'This conversation has been flagged for review due to an emerging pattern that needs further analysis.',
        escalate_to_cloud: true,
      };
    }
  }

  return null; // No pattern-based override
}

// ═════════════════════════════════════════════════════════════════
// INTERNAL: Semantic result evaluation
// ═════════════════════════════════════════════════════════════════

function evaluateSemanticResult(semanticResult, tierConfig, childProfile) {
  if (!semanticResult) {
    return {
      decision: DECISION_ACTIONS.allow,
      action_reason: 'no_semantic_data',
      confidence: 0.50,
      triggered_rules: [],
      explanation: '',
    };
  }

  const topic = (semanticResult.topic || '').toLowerCase().replace(/[\s-]/g, '_');
  const intent = (semanticResult.intent || '').toLowerCase();
  const riskLevel = semanticResult.risk_level || 0;
  const ageFit = semanticResult.age_fit || 'unknown';
  const stance = semanticResult.stance || 'neutral';
  const flags = semanticResult.flags || [];

  // Get severity weight for this topic
  const severityWeight = SEVERITY_WEIGHTS[topic] || 0.50;

  // Compute effective risk: risk_level * severity_weight * age_sensitivity
  const effectiveRisk = clamp01(riskLevel * severityWeight * tierConfig.sensitivity_multiplier);

  // Educational/supportive stance reduces effective risk (but NOT for grooming/exploitation)
  let stanceModifier = 1.0;
  const isHighSeverity = severityWeight >= 0.85;

  if (!isHighSeverity && tierConfig.allow_educational_override) {
    if (stance === 'educational' || stance === 'supportive' || stance === 'preventive') {
      stanceModifier = 0.50;
    } else if (stance === 'neutral') {
      stanceModifier = 0.85;
    } else if (stance === 'harmful' || stance === 'promotional') {
      stanceModifier = 1.20;
    }
  }

  // Intent-based modifier
  let intentModifier = 1.0;
  if (!isHighSeverity && tierConfig.allow_educational_override) {
    if (intent === 'educational' || intent === 'informational' || intent === 'seeking_help') {
      intentModifier = 0.60;
    } else if (intent === 'promotional' || intent === 'how_to') {
      intentModifier = 1.15;
    }
  }

  const adjustedRisk = clamp01(effectiveRisk * stanceModifier * intentModifier);

  // Age fitness check
  let ageFitPenalty = 0;
  if (ageFit === 'too_old' || ageFit === 'adult_only') {
    ageFitPenalty = 0.15;
  } else if (ageFit === 'teen_only' && (tierConfig.sensitivity_multiplier > 1.3)) {
    ageFitPenalty = 0.10;
  }

  const finalRisk = clamp01(adjustedRisk + ageFitPenalty);

  // Determine action based on thresholds
  let decision;
  let actionReason;

  if (finalRisk >= tierConfig.block_threshold * (1.0 / Math.max(severityWeight, 0.30))) {
    // High severity topics have a lower effective block threshold
    if (severityWeight >= 0.90 && tierConfig.auto_alert_parent) {
      decision = DECISION_ACTIONS.block_and_alert;
      actionReason = `${topic}_block_and_alert`;
    } else {
      decision = DECISION_ACTIONS.block;
      actionReason = `${topic}_block`;
    }
  } else if (finalRisk >= tierConfig.warn_threshold) {
    // Warn band
    if (stance === 'educational' && tierConfig.allow_educational_override) {
      decision = DECISION_ACTIONS.educational_redirect;
      actionReason = `${topic}_educational_redirect`;
    } else {
      decision = DECISION_ACTIONS.warn;
      actionReason = `${topic}_warn`;
    }
  } else {
    // Below warn threshold
    if (finalRisk > 0.10 && flags.length > 0) {
      decision = DECISION_ACTIONS.queue_for_review;
      actionReason = 'low_risk_flagged_for_review';
    } else {
      decision = DECISION_ACTIONS.allow;
      actionReason = 'below_threshold';
    }
  }

  // Build explanation
  const explanation = buildSemanticExplanation(topic, decision, stance, intent);

  return {
    decision,
    action_reason: actionReason,
    confidence: clamp01(0.40 + finalRisk * 0.55),
    triggered_rules: [],
    explanation,
  };
}

// ═════════════════════════════════════════════════════════════════
// INTERNAL: Standard parent rules evaluation
// ═════════════════════════════════════════════════════════════════

function evaluateStandardRules(standardRules, semanticResult, platformContext) {
  if (!standardRules || standardRules.length === 0) {
    return null;
  }

  const topic = (semanticResult?.topic || '').toLowerCase().replace(/[\s-]/g, '_');
  const riskLevel = semanticResult?.risk_level || 0;
  const triggeredRules = [];

  for (const rule of standardRules) {
    const ruleText = (rule.text || rule.source_text || rule.rule || '').toLowerCase();

    // Check for topic-based blocking
    if (topic && ruleText.includes(topic.replace(/_/g, ' '))) {
      const blockVerbs = /\b(?:block|prevent|stop|no|don'?t|ban|forbid|restrict)\b/;
      if (blockVerbs.test(ruleText) && riskLevel >= 0.30) {
        triggeredRules.push(rule.id || rule.rule_id || 'unknown_rule');
        return {
          decision: DECISION_ACTIONS.block,
          action_reason: `parent_rule_${topic}`,
          confidence: clamp01(0.70 + riskLevel * 0.25),
          triggered_rules: triggeredRules,
          explanation: (EXPLANATION_TEMPLATES[topic] || EXPLANATION_TEMPLATES.default).single,
        };
      }
    }
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════
// INTERNAL: Cloud escalation logic
// ═════════════════════════════════════════════════════════════════

function shouldEscalateToCloud(semanticResult, patternResult, semanticDecision, tierConfig) {
  if (!semanticResult) return false;

  const riskLevel = semanticResult.risk_level || 0;
  const confidence = semanticDecision?.confidence || 0;
  const patternType = patternResult?.pattern_type || '';
  const patternConfidence = patternResult?.confidence || 0;

  // Rule 1: Low local confidence + moderate risk → escalate
  if (confidence < 0.60 && riskLevel > 0.30) {
    return true;
  }

  // Rule 2: Pattern suggests grooming but single-message semantics are ambiguous
  if (patternType === 'grooming' && patternConfidence >= 0.30 && riskLevel < 0.40) {
    return true;
  }

  // Rule 3: Topic is high-severity but confidence is borderline
  const topic = (semanticResult.topic || '').toLowerCase().replace(/[\s-]/g, '_');
  const severity = SEVERITY_WEIGHTS[topic] || 0;
  if (severity >= 0.85 && confidence >= 0.40 && confidence < 0.65) {
    return true;
  }

  return false;
}

// ═════════════════════════════════════════════════════════════════
// INTERNAL: Decision aggregation
// ═════════════════════════════════════════════════════════════════

const DECISION_PRIORITY = {
  [DECISION_ACTIONS.allow]:                0,
  [DECISION_ACTIONS.queue_for_review]:     1,
  [DECISION_ACTIONS.educational_redirect]: 2,
  [DECISION_ACTIONS.warn]:                 3,
  [DECISION_ACTIONS.blur]:                 4,
  [DECISION_ACTIONS.block]:                5,
  [DECISION_ACTIONS.block_and_alert]:      6,
};

function aggregateDecisions(semanticDecision, standardRuleDecision, patternResult, tierConfig, escalateToCloud) {
  const candidates = [semanticDecision, standardRuleDecision].filter(Boolean);

  if (candidates.length === 0) {
    return {
      decision: DECISION_ACTIONS.allow,
      action_reason: 'no_signals',
      confidence: 0.80,
      explanation: '',
    };
  }

  // Sort by decision priority descending (strongest first)
  candidates.sort((a, b) => {
    const pa = DECISION_PRIORITY[a.decision] || 0;
    const pb = DECISION_PRIORITY[b.decision] || 0;
    return pb - pa;
  });

  const strongest = candidates[0];

  // If cloud escalation is needed and the decision is below block,
  // upgrade to queue_for_review at minimum
  if (escalateToCloud) {
    const currentPriority = DECISION_PRIORITY[strongest.decision] || 0;
    if (currentPriority < DECISION_PRIORITY[DECISION_ACTIONS.queue_for_review]) {
      return {
        ...strongest,
        decision: DECISION_ACTIONS.queue_for_review,
        action_reason: strongest.action_reason + '_escalated_to_cloud',
        explanation: strongest.explanation || 'This content has been flagged for additional review.',
      };
    }
  }

  return strongest;
}

// ═════════════════════════════════════════════════════════════════
// INTERNAL: CSEM detection (hardcoded, always-on)
// ═════════════════════════════════════════════════════════════════

function detectCSEM(semanticResult) {
  if (!semanticResult) return { detected: false };

  const flags = semanticResult.flags || [];
  const topic = (semanticResult.topic || '').toLowerCase();

  // Check for explicit CSEM flags
  for (const flag of flags) {
    const flagStr = (typeof flag === 'string' ? flag : flag.label || '').toLowerCase();
    if (flagStr.includes('csem') ||
        flagStr.includes('child_exploitation') ||
        flagStr.includes('sexual_content_minors') ||
        flagStr.includes('child_sexual')) {
      return { detected: true };
    }
  }

  // Check topic
  if (topic === 'sexual_content_minors' || topic === 'csem' || topic === 'child_exploitation') {
    return { detected: true };
  }

  return { detected: false };
}

// ═════════════════════════════════════════════════════════════════
// INTERNAL: Explanation builders
// ═════════════════════════════════════════════════════════════════

function buildLLMRuleExplanation(match) {
  const ruleType = match.rule.action?.type;

  switch (ruleType) {
    case LLM_RULE_ACTIONS.BLOCK_LLM_TOPIC:
      return (EXPLANATION_TEMPLATES[match.rule.topic] || EXPLANATION_TEMPLATES.default).single;

    case LLM_RULE_ACTIONS.BLOCK_LLM_CAPABILITY:
      return EXPLANATION_TEMPLATES.capability_blocked.single
        .replace('{capability}', match.rule.capability.replace(/_/g, ' '));

    case LLM_RULE_ACTIONS.BLOCK_LLM_PERSONA:
      return EXPLANATION_TEMPLATES.persona_blocked.single
        .replace('{persona}', match.rule.persona_type.replace(/_/g, ' '));

    case LLM_RULE_ACTIONS.BLOCK_LLM_JAILBREAK:
      return EXPLANATION_TEMPLATES.jailbreak.single;

    default:
      return EXPLANATION_TEMPLATES.default.single;
  }
}

function buildSemanticExplanation(topic, decision, stance, intent) {
  if (decision === DECISION_ACTIONS.allow) return '';

  if (decision === DECISION_ACTIONS.educational_redirect) {
    return `This conversation touched on ${topic.replace(/_/g, ' ')} in an educational context. An age-appropriate explanation has been provided instead.`;
  }

  const template = EXPLANATION_TEMPLATES[topic] || EXPLANATION_TEMPLATES.default;
  return template.single;
}

function determineDecisionForLLMRule(match, tierConfig) {
  const ruleType = match.rule.action?.type;

  // Jailbreak is always block + alert
  if (ruleType === LLM_RULE_ACTIONS.BLOCK_LLM_JAILBREAK) {
    return DECISION_ACTIONS.block_and_alert;
  }

  // Parent explicitly created this rule — they WANT it blocked.
  // Lower the threshold compared to auto-detected topics.
  // High confidence → block + alert for young children
  if (match.confidence >= 0.75) {
    return tierConfig.auto_alert_parent
      ? DECISION_ACTIONS.block_and_alert
      : DECISION_ACTIONS.block;
  }

  // Moderate confidence → block (parent explicitly set this rule,
  // so even moderate matches should be enforced)
  if (match.confidence >= 0.40) {
    return DECISION_ACTIONS.block;
  }

  // Low confidence → warn (still respect parent's intent)
  if (match.confidence >= 0.25) {
    return DECISION_ACTIONS.warn;
  }

  // Very low confidence → queue for review
  return DECISION_ACTIONS.queue_for_review;
}

// ═════════════════════════════════════════════════════════════════
// INTERNAL: Result builder
// ═════════════════════════════════════════════════════════════════

function buildResult({ signal_id, decision, action_reason, confidence, triggered_rules, explanation, escalate_to_cloud }) {
  return {
    signal_id,
    decision,
    action_reason,
    confidence: Math.round(clamp01(confidence) * 100) / 100,
    triggered_rules: triggered_rules || [],
    explanation: explanation || '',
    escalate_to_cloud: escalate_to_cloud || false,
  };
}
