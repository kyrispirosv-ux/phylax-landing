// Phylax Engine — Policy Engine
// Maps scores → actions depending on age tier + parent preferences

import { AGE_TIER_DEFAULTS, HARM_CATEGORIES } from './taxonomy.js';

// ── Actions ─────────────────────────────────────────────────────

export const ACTIONS = {
  ALLOW:        'ALLOW',
  WARN:         'WARN',
  BLOCK:        'BLOCK',
  REDIRECT:     'REDIRECT',
  NUDGE:        'NUDGE',
  FRICTION:     'FRICTION',
  COOLDOWN:     'COOLDOWN',
  ALERT_PARENT: 'ALERT_PARENT',
};

// ── Main decision function ──────────────────────────────────────

export function makeDecision({
  harmResult,
  compulsionResult,
  semanticParse,
  profileTier = 'tween_13',
  parentOverrides = {},
  escalation = null,
}) {
  const tierConfig = AGE_TIER_DEFAULTS[profileTier] || AGE_TIER_DEFAULTS.tween_13;

  // Merge parent overrides with defaults
  const config = { ...tierConfig, ...parentOverrides };

  // 1. Check hard trigger overrides first
  if (harmResult.action_override === 'BLOCK') {
    return buildDecision({
      action: ACTIONS.BLOCK,
      harm_score: harmResult.score,
      compulsion_score: compulsionResult.score,
      reasons: harmResult.top_reasons,
      hard_trigger: harmResult.hard_trigger,
      message_child: getChildMessage(ACTIONS.BLOCK, harmResult),
      message_parent: getParentMessage(harmResult, compulsionResult),
      evidence: buildEvidence(harmResult, compulsionResult),
    });
  }

  if (harmResult.action_override === 'REDIRECT') {
    return buildDecision({
      action: ACTIONS.REDIRECT,
      harm_score: harmResult.score,
      compulsion_score: compulsionResult.score,
      reasons: harmResult.top_reasons,
      hard_trigger: harmResult.hard_trigger,
      redirect_resources: harmResult.redirect_resources,
      message_child: getRedirectMessage(harmResult),
      message_parent: getParentMessage(harmResult, compulsionResult),
      evidence: buildEvidence(harmResult, compulsionResult),
    });
  }

  // 2. Category-based overrides from parent
  const topCategory = getTopCategory(harmResult);
  if (topCategory) {
    const categoryOverride = getCategoryOverride(topCategory, config);
    if (categoryOverride === 'blocked') {
      return buildDecision({
        action: ACTIONS.BLOCK,
        harm_score: harmResult.score,
        compulsion_score: compulsionResult.score,
        reasons: harmResult.top_reasons,
        message_child: getChildMessage(ACTIONS.BLOCK, harmResult),
        message_parent: getParentMessage(harmResult, compulsionResult),
        evidence: buildEvidence(harmResult, compulsionResult),
      });
    }
  }

  // 3. Score-based harm decision
  let harmAction = ACTIONS.ALLOW;
  if (harmResult.score >= config.harm_block_threshold) {
    harmAction = ACTIONS.BLOCK;
  } else if (harmResult.score >= config.harm_warn_threshold) {
    harmAction = ACTIONS.WARN;
  }

  // 4. Score-based compulsion decision
  let compulsionAction = ACTIONS.ALLOW;
  if (compulsionResult.score >= config.compulsion_lock_threshold) {
    compulsionAction = ACTIONS.COOLDOWN;
  } else if (compulsionResult.score >= config.compulsion_friction_threshold) {
    compulsionAction = ACTIONS.FRICTION;
  } else if (compulsionResult.score >= config.compulsion_nudge_threshold) {
    compulsionAction = ACTIONS.NUDGE;
  }

  // 5. Choose strongest action between harm and compulsion
  const action = resolveAction(harmAction, compulsionAction);

  // 6. Check if parent alert needed
  let alertParent = false;
  if (escalation) {
    alertParent = true;
  }

  // 7. Check bedtime/wake time restrictions
  const timeRestriction = checkTimeRestrictions(config);
  if (timeRestriction) {
    return buildDecision({
      action: ACTIONS.COOLDOWN,
      harm_score: harmResult.score,
      compulsion_score: compulsionResult.score,
      reasons: [`time_restriction:${timeRestriction}`],
      message_child: `It's ${timeRestriction} time. Browsing is restricted.`,
      message_parent: `Time restriction enforced: ${timeRestriction}`,
      cooldown_seconds: timeRestriction === 'bedtime' ? 3600 : 300,
      evidence: buildEvidence(harmResult, compulsionResult),
    });
  }

  const decision = buildDecision({
    action,
    harm_score: harmResult.score,
    compulsion_score: compulsionResult.score,
    reasons: [
      ...harmResult.top_reasons,
      ...(compulsionAction !== ACTIONS.ALLOW ? [`compulsion:${compulsionResult.score}`] : []),
    ],
    message_child: getChildMessage(action, harmResult, compulsionResult),
    message_parent: getParentMessage(harmResult, compulsionResult),
    cooldown_seconds: action === ACTIONS.COOLDOWN ? computeCooldownDuration(compulsionResult) : 0,
    alert_parent: alertParent,
    escalation,
    evidence: buildEvidence(harmResult, compulsionResult),
  });

  return decision;
}

// ── Parent-defined rules check ──────────────────────────────────
// Checks rules set via the Phylax dashboard (natural language rules)

export function checkParentRules(event, rules) {
  if (!rules || rules.length === 0) return null;

  const url = event.source?.url?.toLowerCase() || '';
  const domain = event.source?.domain?.toLowerCase() || '';

  for (const rule of rules) {
    if (!rule.active) continue;
    if (matchesRule(rule.text, url, domain)) {
      return {
        matched: true,
        rule: rule.text,
        action: ACTIONS.BLOCK,
        message_child: `This site is blocked by your family's safety rules.`,
        message_parent: `Rule enforced: "${rule.text}"`,
      };
    }
  }

  return null;
}

function matchesRule(ruleText, url, domain) {
  const text = ruleText.toLowerCase();

  // Site name mappings (same as previous blocker)
  const SITE_MAP = {
    'youtube': ['youtube.com'], 'tiktok': ['tiktok.com'],
    'instagram': ['instagram.com'], 'facebook': ['facebook.com'],
    'twitter': ['twitter.com', 'x.com'], 'reddit': ['reddit.com'],
    'snapchat': ['snapchat.com'], 'roblox': ['roblox.com'],
    'twitch': ['twitch.tv'], 'discord': ['discord.com'],
    'pinterest': ['pinterest.com'], 'netflix': ['netflix.com'],
    'hulu': ['hulu.com'], 'spotify': ['spotify.com'],
    'fortnite': ['fortnite.com'], 'minecraft': ['minecraft.net'],
    'steam': ['steampowered.com'], 'poker': ['poker.com'],
    'bet365': ['bet365.com'], 'whatsapp': ['whatsapp.com'],
    'telegram': ['telegram.org'],
  };

  const CATEGORIES = {
    'social media': ['facebook.com', 'instagram.com', 'tiktok.com', 'snapchat.com', 'twitter.com', 'x.com', 'reddit.com'],
    'gambling': ['gambling.com', 'poker.com', 'bet365.com', 'draftkings.com', 'fanduel.com', 'casino.com', 'bovada.lv', 'betway.com'],
    'adult': ['pornhub.com', 'xvideos.com', 'xnxx.com'],
    'gaming': ['roblox.com', 'minecraft.net', 'fortnite.com', 'steampowered.com'],
    'video': ['youtube.com', 'twitch.tv', 'dailymotion.com'],
    'streaming': ['netflix.com', 'hulu.com', 'disneyplus.com'],
  };

  // Category check
  for (const [cat, domains] of Object.entries(CATEGORIES)) {
    if (text.includes(cat)) {
      if (domains.some(d => domain.includes(d.split('.')[0]))) return true;
    }
  }

  // Keyword check
  const BLOCK_KEYWORDS = [
    'gambling', 'casino', 'poker', 'betting', 'slots', 'porn', 'xxx',
    'adult', 'drugs', 'weapons', 'gore', 'violence',
  ];
  for (const kw of BLOCK_KEYWORDS) {
    if (text.includes(kw) && (domain.includes(kw) || url.includes(kw))) return true;
  }

  // Site name check
  for (const [name, domains] of Object.entries(SITE_MAP)) {
    if (text.includes(name)) {
      if (domains.some(d => domain.includes(d.split('.')[0]))) return true;
    }
  }

  // Raw domain check
  const domainRegex = /([a-z0-9-]+\.[a-z]{2,})/g;
  let match;
  while ((match = domainRegex.exec(text)) !== null) {
    if (domain.includes(match[1]) || url.includes(match[1])) return true;
  }

  return false;
}

// ── Action resolution ───────────────────────────────────────────

const ACTION_PRIORITY = {
  [ACTIONS.ALLOW]:        0,
  [ACTIONS.NUDGE]:        1,
  [ACTIONS.WARN]:         2,
  [ACTIONS.FRICTION]:     3,
  [ACTIONS.REDIRECT]:     4,
  [ACTIONS.COOLDOWN]:     5,
  [ACTIONS.BLOCK]:        6,
  [ACTIONS.ALERT_PARENT]: 7,
};

function resolveAction(harmAction, compulsionAction) {
  const harmPri = ACTION_PRIORITY[harmAction] || 0;
  const compPri = ACTION_PRIORITY[compulsionAction] || 0;
  return harmPri >= compPri ? harmAction : compulsionAction;
}

// ── Category override lookup ────────────────────────────────────

function getCategoryOverride(category, config) {
  if (config.blocked_categories?.includes(category)) return 'blocked';
  if (config.warned_categories?.includes(category)) return 'warned';
  return 'allowed';
}

function getTopCategory(harmResult) {
  if (!harmResult.detailed_reasons?.length) return null;
  return harmResult.detailed_reasons[0].category;
}

// ── Time restrictions ───────────────────────────────────────────

function checkTimeRestrictions(config) {
  if (!config.bedtime || !config.wake_time) return null;

  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const currentTime = hour * 60 + minute;

  const [bedH, bedM] = config.bedtime.split(':').map(Number);
  const [wakeH, wakeM] = config.wake_time.split(':').map(Number);
  const bedtime = bedH * 60 + bedM;
  const waketime = wakeH * 60 + wakeM;

  // After bedtime or before wake time
  if (currentTime >= bedtime || currentTime < waketime) {
    return currentTime >= bedtime ? 'bedtime' : 'early_morning';
  }

  return null;
}

// ── Message generation ──────────────────────────────────────────

function getChildMessage(action, harmResult, compulsionResult) {
  if (action === ACTIONS.BLOCK) {
    const reason = harmResult.detailed_reasons?.[0];
    if (reason) {
      const label = HARM_CATEGORIES[reason.category]?.label || 'harmful content';
      return `This page was blocked because it contains ${label.toLowerCase()}.`;
    }
    return 'This page has been blocked by your family\'s safety policy.';
  }

  if (action === ACTIONS.WARN) {
    return 'This content might not be appropriate. Do you want to continue?';
  }

  if (action === ACTIONS.NUDGE) {
    const minutes = compulsionResult?.behavior_features?.session_length;
    const sessionMin = minutes ? Math.round(minutes * 120) : 0;
    return `You've been browsing for ${sessionMin} minutes. Maybe take a break?`;
  }

  if (action === ACTIONS.FRICTION) {
    return 'Take a moment to think about what you\'re looking for. What\'s your goal right now?';
  }

  if (action === ACTIONS.COOLDOWN) {
    return 'Screen time limit reached. Time for a break!';
  }

  return '';
}

function getRedirectMessage(harmResult) {
  const resources = harmResult.redirect_resources || [];
  const resourceText = resources.map(r => `${r.label}: ${r.value}`).join('\n');
  return `If you're going through a tough time, help is available:\n${resourceText}`;
}

function getParentMessage(harmResult, compulsionResult) {
  const parts = [];

  if (harmResult.score > 0) {
    const topReasons = harmResult.detailed_reasons?.slice(0, 3) || [];
    const reasonStr = topReasons.map(r => `${r.label} (${r.risk}%)`).join(', ');
    parts.push(`Harm risk: ${harmResult.score}/100. Detected: ${reasonStr || 'none'}.`);
  }

  if (compulsionResult.score > 30) {
    parts.push(`Compulsion risk: ${compulsionResult.score}/100.`);
  }

  if (harmResult.hard_trigger) {
    parts.push(`Hard trigger: ${harmResult.hard_trigger}.`);
  }

  return parts.join(' ') || 'No significant risks detected.';
}

// ── Cooldown duration ───────────────────────────────────────────

function computeCooldownDuration(compulsionResult) {
  if (compulsionResult.score >= 90) return 1800; // 30 min
  if (compulsionResult.score >= 80) return 900;  // 15 min
  if (compulsionResult.score >= 70) return 600;  // 10 min
  return 300; // 5 min
}

// ── Evidence building (minimal, privacy-aware) ──────────────────

function buildEvidence(harmResult, compulsionResult) {
  return {
    harm_score: harmResult.score,
    compulsion_score: compulsionResult.score,
    top_categories: harmResult.detailed_reasons?.slice(0, 3).map(r => ({
      category: r.category,
      risk: r.risk,
    })) || [],
    hard_trigger: harmResult.hard_trigger || null,
    timestamp: Date.now(),
  };
}

// ── Decision builder ────────────────────────────────────────────

function buildDecision(params) {
  return {
    action: params.action,
    scores: {
      harm: params.harm_score,
      compulsion: params.compulsion_score,
    },
    top_reasons: params.reasons || [],
    message_child: params.message_child || '',
    message_parent: params.message_parent || '',
    cooldown_seconds: params.cooldown_seconds || 0,
    alert_parent: params.alert_parent || false,
    escalation: params.escalation || null,
    redirect_resources: params.redirect_resources || null,
    hard_trigger: params.hard_trigger || null,
    evidence: params.evidence || {},
    timestamp: Date.now(),
  };
}
