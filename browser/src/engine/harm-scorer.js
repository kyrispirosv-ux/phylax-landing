// Phylax Engine — HarmRisk Scorer
// Computes HarmRisk (0-100) from semantic parse + taxonomy

import {
  HARM_CATEGORIES,
  ACTIONABILITY,
  TARGET_MULTIPLIER,
  CONTEXT_MULTIPLIER,
  HARD_TRIGGERS,
} from './taxonomy.js';

// ── Main scoring function ───────────────────────────────────────

export function computeHarmRisk(semanticParse, eventBuffer, profileTier) {
  const content = semanticParse.content;
  const categoryRisks = {};
  const reasons = [];

  // 1. Check hard triggers first
  const hardResult = checkHardTriggers(content, profileTier);
  if (hardResult) {
    return {
      score: 100,
      category_risks: { [hardResult.category]: 1.0 },
      top_reasons: hardResult.reasons,
      hard_trigger: hardResult.trigger_id,
      action_override: hardResult.action,
      redirect_resources: hardResult.resources || null,
    };
  }

  // 2. Compute per-category risk
  const policyCategories = content.policy_category || [];

  for (const cat of policyCategories) {
    const catDef = HARM_CATEGORIES[cat.label];
    if (!catDef) continue;

    const S = catDef.base_severity;     // base severity
    const P = cat.p;                     // probability from classifier
    const Conf = 1.0 - (content.uncertainty?.overall || 0.3); // confidence

    // Actionability multiplier
    const actionLevel = content.actionability?.level || 'none';
    const A = ACTIONABILITY[actionLevel] || 1.0;

    // Target multiplier
    const T = computeTargetMultiplier(content.target, cat.label);

    // Context multiplier
    const contextType = content.context_type || 'normal';
    const Ctx = CONTEXT_MULTIPLIER[contextType] || 1.0;

    // Repetition multiplier
    const Rep = computeRepetitionMultiplier(cat.label, eventBuffer);

    // CategoryRisk[c] = S * P * Conf * A * T * Ctx * Rep
    const risk = S * P * Conf * A * T * Ctx * Rep;
    categoryRisks[cat.label] = Math.min(1.0, risk);

    if (risk > 0.1) {
      reasons.push({
        category: cat.label,
        label: catDef.label,
        risk: Math.round(risk * 100),
        components: { S, P: Math.round(P * 100) / 100, Conf: Math.round(Conf * 100) / 100, A, T, Ctx, Rep },
      });
    }
  }

  // 3. HarmRisk = 100 * max(CategoryRisk)
  const maxRisk = Math.max(0, ...Object.values(categoryRisks));
  const score = Math.round(100 * maxRisk);

  // Sort reasons by risk descending
  reasons.sort((a, b) => b.risk - a.risk);

  return {
    score: Math.min(100, score),
    category_risks: categoryRisks,
    top_reasons: reasons.slice(0, 5).map(r => `${r.category}:${r.risk}`),
    detailed_reasons: reasons.slice(0, 5),
    hard_trigger: null,
    action_override: null,
    redirect_resources: null,
  };
}

// ── Hard trigger checks ─────────────────────────────────────────

function checkHardTriggers(content, profileTier) {
  const policyCategories = (content.policy_category || []).map(c => c.label);
  const hasMinor = content.target?.p_minor >= 0.5;
  const hasPIICombo = hasPIICombination(content.entities?.pii_flags);
  const hasWeapon = policyCategories.includes('weapons') || policyCategories.includes('violence_instructions');
  const hasDirectTarget = content.target?.is_direct;
  const intent = content.intent?.[0]?.label;

  // Check redirect triggers first (supportive intervention takes priority)
  for (const trigger of HARD_TRIGGERS.redirect) {
    const categoryMatch = trigger.categories.some(c => policyCategories.includes(c));
    if (categoryMatch && trigger.intent && intent === trigger.intent) {
      return {
        trigger_id: trigger.id,
        category: trigger.categories[0],
        reasons: [trigger.description],
        action: 'REDIRECT',
        resources: trigger.resources,
      };
    }
  }

  // Check hard block triggers
  for (const trigger of HARD_TRIGGERS.block) {
    const categoryMatch = trigger.categories.some(c => policyCategories.includes(c));
    if (!categoryMatch) continue;

    // Check additional conditions
    if (trigger.requires_minor && !hasMinor) continue;
    if (trigger.requires_pii_combo && !hasPIICombo) continue;
    if (trigger.requires_weapon && !hasWeapon) continue;
    if (trigger.requires_direct_target && !hasDirectTarget) continue;
    if (trigger.profile_tiers && !trigger.profile_tiers.includes(profileTier)) continue;

    return {
      trigger_id: trigger.id,
      category: trigger.categories[0],
      reasons: [trigger.description],
      action: 'BLOCK',
    };
  }

  return null;
}

// ── Target multiplier computation ───────────────────────────────

function computeTargetMultiplier(target, category) {
  if (!target) return TARGET_MULTIPLIER.unknown;

  if (target.p_minor >= 0.5) return TARGET_MULTIPLIER.minor_likely;

  if (target.is_self) {
    // Self-harm ideation vs instructions
    const instructionCats = ['self_harm_instructions', 'suicide_ideation'];
    if (instructionCats.includes(category)) return TARGET_MULTIPLIER.self_instruct;
    return TARGET_MULTIPLIER.self_ideation;
  }

  if (target.type === 'group') return TARGET_MULTIPLIER.group;
  return TARGET_MULTIPLIER.unknown;
}

// ── Repetition multiplier ───────────────────────────────────────

function computeRepetitionMultiplier(category, eventBuffer) {
  if (!eventBuffer) return 1.0;

  // Count events in this category in the last 30 minutes
  const windowMs = 30 * 60 * 1000;
  const recentEvents = eventBuffer.getByCategory(category, windowMs);
  const count = recentEvents.length;

  // Rep = 1 + 0.1 * min(count, 5) — caps at 1.5
  return 1.0 + 0.1 * Math.min(count, 5);
}

// ── PII combination check ───────────────────────────────────────

function hasPIICombination(piiFlags) {
  if (!piiFlags || piiFlags.length < 2) return false;
  const types = piiFlags.map(f => f.type);
  // Phone + address is high risk
  return types.includes('phone') && types.includes('address');
}

// ── Escalation check (for parent alerts) ────────────────────────

export function checkEscalationTriggers(category, eventBuffer) {
  if (!eventBuffer) return null;

  for (const trigger of HARD_TRIGGERS.escalate) {
    if (!trigger.categories.includes(category)) continue;

    const windowMs = trigger.time_window_hours * 3600 * 1000;
    const recentEvents = eventBuffer.getByCategory(category, windowMs);

    if (recentEvents.length >= trigger.min_count) {
      return {
        trigger_id: trigger.id,
        description: trigger.description,
        count: recentEvents.length,
        window_hours: trigger.time_window_hours,
      };
    }
  }

  return null;
}
