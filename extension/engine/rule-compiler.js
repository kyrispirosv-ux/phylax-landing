// Phylax Engine — Rule Compiler
// Compiles natural language rules into structured rule objects
// Prevents accidental domain-level blocking from nuanced rules

// ── Action Types ────────────────────────────────────────────────
export const RULE_ACTIONS = {
  BLOCK_DOMAIN:   'BLOCK_DOMAIN',
  ALLOW_DOMAIN:   'ALLOW_DOMAIN',
  BLOCK_CONTENT:  'BLOCK_CONTENT',
  WARN_CONTENT:   'WARN_CONTENT',
  FRICTION:       'FRICTION',
  COOLDOWN:       'COOLDOWN',
};

// ── Known Sites ─────────────────────────────────────────────────
const SITE_MAP = {
  'youtube':    { domains: ['youtube.com', 'www.youtube.com', 'm.youtube.com'], contentPaths: ['/watch', '/shorts', '/results', '/playlist', '/channel', '/@'] },
  'tiktok':     { domains: ['tiktok.com', 'www.tiktok.com'], contentPaths: ['/@', '/video'] },
  'instagram':  { domains: ['instagram.com', 'www.instagram.com'], contentPaths: ['/p/', '/reel/', '/stories/'] },
  'facebook':   { domains: ['facebook.com', 'www.facebook.com', 'm.facebook.com'], contentPaths: ['/watch', '/reel', '/groups'] },
  'twitter':    { domains: ['twitter.com', 'x.com'], contentPaths: ['/status/'] },
  'reddit':     { domains: ['reddit.com', 'www.reddit.com', 'old.reddit.com'], contentPaths: ['/r/', '/comments/'] },
  'snapchat':   { domains: ['snapchat.com'], contentPaths: [] },
  'roblox':     { domains: ['roblox.com', 'www.roblox.com'], contentPaths: ['/games/'] },
  'twitch':     { domains: ['twitch.tv', 'www.twitch.tv'], contentPaths: ['/videos/'] },
  'discord':    { domains: ['discord.com'], contentPaths: ['/channels/'] },
  'pinterest':  { domains: ['pinterest.com'], contentPaths: ['/pin/'] },
  'netflix':    { domains: ['netflix.com'], contentPaths: ['/watch/'] },
  'hulu':       { domains: ['hulu.com'], contentPaths: ['/watch/'] },
  'spotify':    { domains: ['spotify.com', 'open.spotify.com'], contentPaths: ['/track/', '/album/', '/playlist/'] },
  'fortnite':   { domains: ['fortnite.com'], contentPaths: [] },
  'minecraft':  { domains: ['minecraft.net'], contentPaths: [] },
  'steam':      { domains: ['store.steampowered.com', 'steampowered.com'], contentPaths: ['/app/'] },
  'whatsapp':   { domains: ['web.whatsapp.com'], contentPaths: [] },
  'telegram':   { domains: ['web.telegram.org'], contentPaths: [] },
};

// ── Known gambling domains ──────────────────────────────────────
const GAMBLING_DOMAINS = [
  'gambling.com', 'poker.com', 'bet365.com', 'draftkings.com',
  'fanduel.com', 'casino.com', 'bovada.lv', 'betway.com',
  'williamhill.com', '888casino.com', 'pokerstars.com', 'betmgm.com',
  'caesars.com', 'unibet.com', 'bwin.com', 'paddypower.com',
  'ladbrokes.com', 'betfair.com', 'pointsbet.com', 'sportsbet.com',
];

// ── Category domain maps ────────────────────────────────────────
const CATEGORY_DOMAINS = {
  'social media': ['facebook.com', 'instagram.com', 'tiktok.com', 'snapchat.com', 'twitter.com', 'x.com', 'reddit.com'],
  'gambling':     GAMBLING_DOMAINS,
  'adult':        ['pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com', 'youporn.com', 'brazzers.com', 'onlyfans.com', 'chaturbate.com'],
  'gaming':       ['roblox.com', 'minecraft.net', 'fortnite.com', 'steampowered.com'],
  'video':        ['youtube.com', 'twitch.tv', 'dailymotion.com'],
  'streaming':    ['netflix.com', 'hulu.com', 'disneyplus.com'],
};

// ── Content topic keywords ──────────────────────────────────────
const TOPIC_KEYWORDS = {
  gambling:   ['gambling', 'casino', 'poker', 'betting', 'slots', 'wager', 'roulette', 'blackjack', 'sportsbook', 'parlay'],
  adult:      ['porn', 'xxx', 'adult content', 'nsfw', 'explicit'],
  violence:   ['violence', 'gore', 'graphic violence', 'fighting'],
  drugs:      ['drugs', 'narcotics', 'drug use'],
  weapons:    ['weapons', 'guns', 'firearms'],
  self_harm:  ['self harm', 'self-harm', 'suicide', 'cutting'],
  hate:       ['hate speech', 'racism', 'bigotry'],
  bullying:   ['bullying', 'cyberbullying', 'harassment'],
};

// ── Intent detection patterns ───────────────────────────────────

// Patterns that indicate "do NOT block the whole site"
const CONDITIONAL_PATTERNS = [
  /don'?t\s+block\s+(?:all\s+(?:of\s+)?)?(\w+)/i,
  /(?:only|just)\s+(?:block\s+)?(?:videos?|posts?|content|pages?|shorts?|stories?)\s+(?:about|related\s+to|containing|with|on)\s+/i,
  /allow\s+(\w+)\s+(?:but|except)/i,
  /(\w+)\s+is\s+(?:fine|ok|okay|allowed)\s+(?:but|except)/i,
  /on\s+(\w+)\s+(?:only\s+)?block/i,
  /within\s+(\w+)/i,
  /block\s+(?:only\s+)?(?:videos?|posts?|content|pages?)\s+(?:about|on|from|related)/i,
];

// Patterns that indicate explicit full domain block
const EXPLICIT_BLOCK_PATTERNS = [
  /^block\s+(\w+)$/i,
  /^block\s+(\w+\.\w+)$/i,
  /never\s+allow\s+(\w+)/i,
  /block\s+all\s+(?:of\s+)?(\w+)$/i,
  /completely\s+block\s+(\w+)/i,
  /ban\s+(\w+)/i,
  /no\s+(\w+)\s*$/i,
];

// Patterns that indicate category-level blocking
const CATEGORY_BLOCK_PATTERNS = [
  /(?:no|block|ban)\s+(gambling|adult|porn|social\s*media|gaming|video|streaming)\s*(?:sites?|content|pages?)?/i,
  /block\s+(?:all\s+)?(gambling|adult|porn|social\s*media|gaming|video|streaming)/i,
];

// ── Debug log ───────────────────────────────────────────────────
const _debugLog = [];
export function getDebugLog() { return [..._debugLog]; }
export function clearDebugLog() { _debugLog.length = 0; }

function debug(ruleId, stage, data) {
  const entry = {
    timestamp: Date.now(),
    ruleId,
    stage,
    ...data,
  };
  _debugLog.push(entry);
  if (_debugLog.length > 500) _debugLog.shift();
  console.log(`[Phylax RuleCompiler] ${stage}:`, JSON.stringify(data));
  return entry;
}

// ── Main compiler ───────────────────────────────────────────────

let _ruleCounter = 0;

export function compileRule(ruleText) {
  const id = `rule_${++_ruleCounter}_${Date.now()}`;
  const text = ruleText.trim();
  const textLower = text.toLowerCase();

  debug(id, 'input', { raw_text: text });

  // Step 1: Detect rule intent
  const intent = detectIntent(textLower);
  debug(id, 'intent_detected', intent);

  // Step 2: Extract mentioned sites
  const mentionedSites = extractMentionedSites(textLower);
  debug(id, 'sites_found', { sites: mentionedSites.map(s => s.name) });

  // Step 3: Extract content topics
  const topics = extractTopics(textLower);
  debug(id, 'topics_found', { topics: topics.map(t => t.topic) });

  // Step 4: Extract category references
  const categories = extractCategories(textLower);
  debug(id, 'categories_found', { categories });

  // Step 5: Build the structured rule based on intent
  let compiled;

  if (intent.type === 'CONDITIONAL_CONTENT_BLOCK') {
    compiled = buildConditionalRule(id, text, intent, mentionedSites, topics, categories);
  } else if (intent.type === 'CATEGORY_BLOCK') {
    compiled = buildCategoryBlockRule(id, text, categories, mentionedSites);
  } else if (intent.type === 'EXPLICIT_DOMAIN_BLOCK') {
    compiled = buildDomainBlockRule(id, text, mentionedSites, categories);
  } else {
    // Fallback: try to infer from what we found
    compiled = buildInferredRule(id, text, mentionedSites, topics, categories);
  }

  // Step 6: Validate the compiled rule
  const validation = validateRule(compiled);
  debug(id, 'validation', validation);

  if (!validation.valid) {
    debug(id, 'compile_failed', { errors: validation.errors });
    // Return a safe fallback — don't silently create a domain block
    return {
      id,
      priority: 50,
      source_text: text,
      action: { type: RULE_ACTIONS.WARN_CONTENT, fallback: 'ALLOW' },
      scope: { global: true },
      condition: { raw_text_match: textLower },
      explain: {
        child: 'This content may be restricted by your family rules.',
        parent: `Rule could not be fully parsed: "${text}"`,
      },
      _compiled: false,
      _errors: validation.errors,
    };
  }

  debug(id, 'compile_success', { action: compiled.action.type, scope_type: compiled.scope.domain_allowlist ? 'content_scoped' : compiled.scope.domain_blocklist ? 'domain_block' : 'global' });

  return { ...compiled, _compiled: true, _errors: [] };
}

export function compileRules(rules) {
  _ruleCounter = 0;
  return rules
    .filter(r => r.active)
    .map(r => {
      const compiled = compileRule(r.text);
      compiled._originalRule = r;
      return compiled;
    });
}

// ── Intent Detection ────────────────────────────────────────────

function detectIntent(text) {
  // Check for conditional/content-scoped patterns first (highest priority)
  for (const pattern of CONDITIONAL_PATTERNS) {
    if (pattern.test(text)) {
      return { type: 'CONDITIONAL_CONTENT_BLOCK', pattern: pattern.toString() };
    }
  }

  // Check for category-level blocks
  for (const pattern of CATEGORY_BLOCK_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { type: 'CATEGORY_BLOCK', category: match[1].toLowerCase().replace(/\s+/g, '_'), pattern: pattern.toString() };
    }
  }

  // Check for explicit domain blocks
  for (const pattern of EXPLICIT_BLOCK_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { type: 'EXPLICIT_DOMAIN_BLOCK', target: match[1], pattern: pattern.toString() };
    }
  }

  // Default: treat as general block intent
  return { type: 'GENERAL', pattern: null };
}

// ── Site Extraction ─────────────────────────────────────────────

function extractMentionedSites(text) {
  const found = [];

  for (const [name, info] of Object.entries(SITE_MAP)) {
    if (text.includes(name)) {
      found.push({ name, ...info });
    }
  }

  // Also check for raw domains
  const domainRegex = /([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/g;
  let match;
  while ((match = domainRegex.exec(text)) !== null) {
    const domain = match[1];
    if (['e.g', 'i.e', 'etc.com'].includes(domain)) continue;
    // Don't duplicate if already found via site name
    if (!found.some(s => s.domains?.includes(domain))) {
      found.push({ name: domain, domains: [domain], contentPaths: [] });
    }
  }

  return found;
}

// ── Topic Extraction ────────────────────────────────────────────

function extractTopics(text) {
  const found = [];

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        found.push({ topic, keyword: kw, threshold: 0.6 });
        break;
      }
    }
  }

  return found;
}

// ── Category Extraction ─────────────────────────────────────────

function extractCategories(text) {
  const found = [];

  for (const cat of Object.keys(CATEGORY_DOMAINS)) {
    if (text.includes(cat.replace('_', ' '))) {
      found.push(cat);
    }
  }

  // Keyword-to-category mapping for common shorthand
  if (text.includes('gambling') && !found.includes('gambling')) found.push('gambling');
  if ((text.includes('porn') || text.includes('adult')) && !found.includes('adult')) found.push('adult');

  return found;
}

// ── Rule Builders ───────────────────────────────────────────────

function buildConditionalRule(id, sourceText, intent, sites, topics, categories) {
  // This is the key case: "dont block all of youtube only videos about gambling"
  // → Allow the site domain, but block CONTENT matching the topic

  const domainAllowlist = [];
  const pathPatterns = [];

  for (const site of sites) {
    if (site.domains) domainAllowlist.push(...site.domains);
    if (site.contentPaths) pathPatterns.push(...site.contentPaths);
  }

  const topicConditions = topics.map(t => ({
    topic: t.topic,
    threshold: t.threshold,
  }));

  // If no specific topics found, try to infer from categories
  if (topicConditions.length === 0 && categories.length > 0) {
    for (const cat of categories) {
      topicConditions.push({ topic: cat, threshold: 0.6 });
    }
  }

  return {
    id,
    priority: 80,
    source_text: sourceText,
    scope: {
      domain_allowlist: [...new Set(domainAllowlist)],
      path_patterns: pathPatterns.length > 0 ? [...new Set(pathPatterns)] : ['*'],
    },
    condition: {
      content_classifier: topicConditions.length > 0
        ? { topics: topicConditions }
        : { raw_text: sourceText },
    },
    action: {
      type: RULE_ACTIONS.BLOCK_CONTENT,
      fallback: 'WARN_IF_UNCERTAIN',
    },
    explain: {
      child: `This content appears to contain ${topicConditions.map(t => t.topic).join(', ')} material.`,
      parent: `Blocked content on ${domainAllowlist.join(', ')} classified as: ${topicConditions.map(t => t.topic).join(', ')}.`,
    },
  };
}

function buildCategoryBlockRule(id, sourceText, categories, mentionedSites) {
  // "No gambling sites" → block known gambling domains, NOT youtube
  const domainBlocklist = [];

  for (const cat of categories) {
    if (CATEGORY_DOMAINS[cat]) {
      domainBlocklist.push(...CATEGORY_DOMAINS[cat]);
    }
  }

  // If specific sites are mentioned alongside "allow" context, add allowlist
  const domainAllowlist = [];
  const textLower = sourceText.toLowerCase();
  for (const site of mentionedSites) {
    // Check if the site is NOT one of the category domains
    const isCategoryDomain = domainBlocklist.some(d => site.domains?.includes(d));
    if (!isCategoryDomain) {
      domainAllowlist.push(...(site.domains || []));
    }
  }

  return {
    id,
    priority: 70,
    source_text: sourceText,
    scope: {
      domain_blocklist: [...new Set(domainBlocklist)],
      ...(domainAllowlist.length > 0 ? { domain_allowlist: [...new Set(domainAllowlist)] } : {}),
    },
    condition: {
      category_match: categories,
    },
    action: {
      type: RULE_ACTIONS.BLOCK_DOMAIN,
      fallback: 'BLOCK_DOMAIN',
    },
    explain: {
      child: `This site is blocked because it contains ${categories.join(', ')} content.`,
      parent: `Domain blocked by category rule: ${categories.join(', ')}.`,
    },
  };
}

function buildDomainBlockRule(id, sourceText, sites, categories) {
  // "block youtube" → explicit domain block
  const domainBlocklist = [];

  for (const site of sites) {
    if (site.domains) domainBlocklist.push(...site.domains);
  }

  // Also add category domains if categories were mentioned
  for (const cat of categories) {
    if (CATEGORY_DOMAINS[cat]) {
      domainBlocklist.push(...CATEGORY_DOMAINS[cat]);
    }
  }

  // If nothing specific found, try raw domain extraction
  if (domainBlocklist.length === 0) {
    const textLower = sourceText.toLowerCase();
    const domainRegex = /([a-z0-9-]+\.[a-z]{2,})/g;
    let match;
    while ((match = domainRegex.exec(textLower)) !== null) {
      if (!['e.g', 'i.e'].includes(match[1])) {
        domainBlocklist.push(match[1]);
      }
    }
  }

  return {
    id,
    priority: 90,
    source_text: sourceText,
    scope: {
      domain_blocklist: [...new Set(domainBlocklist)],
    },
    condition: {},
    action: {
      type: RULE_ACTIONS.BLOCK_DOMAIN,
      fallback: 'BLOCK_DOMAIN',
    },
    explain: {
      child: 'This site is blocked by your family\'s safety rules.',
      parent: `Domain explicitly blocked: ${domainBlocklist.join(', ')}.`,
    },
  };
}

function buildInferredRule(id, sourceText, sites, topics, categories) {
  const textLower = sourceText.toLowerCase();

  // If we have sites + topics → likely content-level block on those sites
  if (sites.length > 0 && topics.length > 0) {
    return buildConditionalRule(id, sourceText, { type: 'inferred' }, sites, topics, categories);
  }

  // If we have only categories → category block
  if (categories.length > 0) {
    return buildCategoryBlockRule(id, sourceText, categories, sites);
  }

  // If we have only sites → domain block
  if (sites.length > 0) {
    return buildDomainBlockRule(id, sourceText, sites, categories);
  }

  // Last resort: try keyword-based topic blocking (global scope)
  if (topics.length > 0) {
    return {
      id,
      priority: 50,
      source_text: sourceText,
      scope: { global: true },
      condition: {
        content_classifier: { topics: topics.map(t => ({ topic: t.topic, threshold: t.threshold })) },
      },
      action: {
        type: RULE_ACTIONS.BLOCK_CONTENT,
        fallback: 'WARN_IF_UNCERTAIN',
      },
      explain: {
        child: `This content appears to contain ${topics.map(t => t.topic).join(', ')} material.`,
        parent: `Content blocked globally for topics: ${topics.map(t => t.topic).join(', ')}.`,
      },
    };
  }

  // Truly unknown: warn, don't block
  return {
    id,
    priority: 30,
    source_text: sourceText,
    scope: { global: true },
    condition: { raw_text: textLower },
    action: {
      type: RULE_ACTIONS.WARN_CONTENT,
      fallback: 'ALLOW',
    },
    explain: {
      child: 'This content may be restricted.',
      parent: `Unrecognized rule applied as warning: "${sourceText}".`,
    },
  };
}

// ── Validation ──────────────────────────────────────────────────

function validateRule(rule) {
  const errors = [];

  if (!rule.id) errors.push('Missing rule ID');
  if (!rule.source_text) errors.push('Missing source text');
  if (!rule.action?.type) errors.push('Missing action type');
  if (!Object.values(RULE_ACTIONS).includes(rule.action?.type)) {
    errors.push(`Unknown action type: ${rule.action?.type}`);
  }
  if (!rule.scope) errors.push('Missing scope');

  // Guard: BLOCK_DOMAIN must have domain_blocklist
  if (rule.action?.type === RULE_ACTIONS.BLOCK_DOMAIN) {
    if (!rule.scope.domain_blocklist || rule.scope.domain_blocklist.length === 0) {
      errors.push('BLOCK_DOMAIN rule has no domain_blocklist');
    }
  }

  // Guard: BLOCK_CONTENT must have either domain_allowlist or global scope
  if (rule.action?.type === RULE_ACTIONS.BLOCK_CONTENT) {
    if (!rule.scope.domain_allowlist && !rule.scope.global) {
      // Not necessarily an error, but flag it
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Enforcement Matching ────────────────────────────────────────

export function evaluateRules(compiledRules, url, domain, pageContent) {
  const results = [];

  // Sort by priority (highest first)
  const sorted = [...compiledRules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const rule of sorted) {
    const result = evaluateRule(rule, url, domain, pageContent);
    results.push(result);
  }

  debug('eval', 'all_results', {
    url,
    domain,
    results: results.map(r => ({
      ruleId: r.rule.id,
      matched: r.matched,
      action: r.action,
      reason: r.reason,
    })),
  });

  return resolveResults(results, domain);
}

function evaluateRule(rule, url, domain, pageContent) {
  const domainLower = domain.toLowerCase();
  const urlLower = (url || '').toLowerCase();
  const contentLower = (pageContent || '').toLowerCase();

  // ── BLOCK_DOMAIN rules ───────────────────────────────────────
  if (rule.action.type === RULE_ACTIONS.BLOCK_DOMAIN) {
    const blocklist = rule.scope.domain_blocklist || [];
    const matched = blocklist.some(d => domainLower.includes(d) || domainLower.endsWith(d));

    return {
      rule,
      matched,
      action: matched ? RULE_ACTIONS.BLOCK_DOMAIN : null,
      reason: matched ? `domain_in_blocklist:${domainLower}` : 'domain_not_in_blocklist',
      scope: 'domain',
    };
  }

  // ── ALLOW_DOMAIN rules ───────────────────────────────────────
  if (rule.action.type === RULE_ACTIONS.ALLOW_DOMAIN) {
    const allowlist = rule.scope.domain_allowlist || [];
    const matched = allowlist.some(d => domainLower.includes(d) || domainLower.endsWith(d));

    return {
      rule,
      matched,
      action: matched ? RULE_ACTIONS.ALLOW_DOMAIN : null,
      reason: matched ? `domain_in_allowlist:${domainLower}` : 'domain_not_in_allowlist',
      scope: 'domain',
    };
  }

  // ── BLOCK_CONTENT / WARN_CONTENT rules ───────────────────────
  if (rule.action.type === RULE_ACTIONS.BLOCK_CONTENT || rule.action.type === RULE_ACTIONS.WARN_CONTENT) {
    // Check if domain is in allowlist (meaning we should analyze content on this domain)
    const allowlist = rule.scope.domain_allowlist || [];
    const isGlobal = rule.scope.global === true;
    const domainApplies = isGlobal || allowlist.length === 0 || allowlist.some(d => domainLower.includes(d) || domainLower.endsWith(d));

    if (!domainApplies) {
      return {
        rule,
        matched: false,
        action: null,
        reason: 'domain_not_in_scope',
        scope: 'content',
      };
    }

    // Check path patterns if specified
    const pathPatterns = rule.scope.path_patterns || [];
    let pathMatches = pathPatterns.length === 0; // if no patterns, always match
    if (!pathMatches) {
      try {
        const urlPath = new URL(url).pathname;
        pathMatches = pathPatterns.some(p => {
          if (p === '*') return true;
          return urlPath.startsWith(p);
        });
      } catch {
        pathMatches = true; // can't parse URL, assume match
      }
    }

    if (!pathMatches) {
      return {
        rule,
        matched: false,
        action: null,
        reason: 'path_not_matched',
        scope: 'content',
      };
    }

    // Check content conditions
    const conditionMet = evaluateCondition(rule.condition, contentLower, domainLower, urlLower);

    if (conditionMet.matched) {
      return {
        rule,
        matched: true,
        action: rule.action.type,
        reason: conditionMet.reason,
        confidence: conditionMet.confidence,
        scope: 'content',
      };
    }

    // Fallback for uncertain
    if (conditionMet.uncertain && rule.action.fallback === 'WARN_IF_UNCERTAIN') {
      return {
        rule,
        matched: true,
        action: RULE_ACTIONS.WARN_CONTENT,
        reason: `uncertain_fallback:${conditionMet.reason}`,
        confidence: conditionMet.confidence,
        scope: 'content',
      };
    }

    return {
      rule,
      matched: false,
      action: null,
      reason: 'condition_not_met',
      scope: 'content',
    };
  }

  return { rule, matched: false, action: null, reason: 'unknown_action_type', scope: 'unknown' };
}

function evaluateCondition(condition, content, domain, url) {
  // Content classifier (topic-based)
  if (condition.content_classifier?.topics) {
    for (const topicCond of condition.content_classifier.topics) {
      const score = scoreContentForTopic(content, domain, url, topicCond.topic);
      if (score >= topicCond.threshold) {
        return { matched: true, reason: `topic:${topicCond.topic}:${score.toFixed(2)}`, confidence: score };
      }
      if (score >= topicCond.threshold * 0.6) {
        return { matched: false, uncertain: true, reason: `topic_uncertain:${topicCond.topic}:${score.toFixed(2)}`, confidence: score };
      }
    }
    return { matched: false, uncertain: false, reason: 'no_topic_match', confidence: 0 };
  }

  // Category match
  if (condition.category_match) {
    // Category matching is handled at domain level, always true if we got here
    return { matched: true, reason: `category:${condition.category_match.join(',')}`, confidence: 0.9 };
  }

  // Raw text match (fallback)
  if (condition.raw_text) {
    const words = condition.raw_text.split(/\s+/).filter(w => w.length > 3);
    const matchCount = words.filter(w => content.includes(w)).length;
    const ratio = matchCount / (words.length || 1);
    if (ratio > 0.5) {
      return { matched: true, reason: `raw_text_match:${ratio.toFixed(2)}`, confidence: ratio };
    }
    return { matched: false, uncertain: ratio > 0.25, reason: `raw_text_low:${ratio.toFixed(2)}`, confidence: ratio };
  }

  // No conditions = always matches (for domain-level rules)
  return { matched: true, reason: 'no_conditions', confidence: 1.0 };
}

function scoreContentForTopic(content, domain, url, topic) {
  let score = 0;

  // Check domain reputation first
  const categoryDomains = CATEGORY_DOMAINS[topic];
  if (categoryDomains && categoryDomains.some(d => domain.includes(d))) {
    score = Math.max(score, 0.95);
  }

  // Check content keywords
  const keywords = TOPIC_KEYWORDS[topic];
  if (keywords) {
    let matchCount = 0;
    for (const kw of keywords) {
      if (content.includes(kw)) matchCount++;
    }
    if (matchCount > 0) {
      score = Math.max(score, Math.min(0.95, 0.4 + matchCount * 0.15));
    }
  }

  // Check URL for topic signals
  if (keywords) {
    for (const kw of keywords) {
      if (url.includes(kw)) {
        score = Math.max(score, 0.7);
        break;
      }
    }
  }

  return score;
}

// ── Result Resolution ───────────────────────────────────────────
// Precedence: ALLOW_DOMAIN override > BLOCK_DOMAIN > BLOCK_CONTENT > WARN_CONTENT

function resolveResults(results, domain) {
  const matched = results.filter(r => r.matched);

  if (matched.length === 0) {
    return {
      action: 'ALLOW',
      matchedRules: [],
      reason: 'no_rules_matched',
      debug: results,
    };
  }

  // Check for explicit ALLOW_DOMAIN (highest precedence)
  // If domain is in an allowlist for a content-scoped rule, that's an implicit allow
  const domainLower = domain.toLowerCase();
  const hasContentScopedAllow = matched.some(r =>
    (r.action === RULE_ACTIONS.BLOCK_CONTENT || r.action === RULE_ACTIONS.WARN_CONTENT) &&
    r.rule.scope.domain_allowlist?.some(d => domainLower.includes(d))
  );

  // Check for BLOCK_DOMAIN
  const domainBlocks = matched.filter(r => r.action === RULE_ACTIONS.BLOCK_DOMAIN);

  // If domain is allowed by a content-scoped rule AND there's a domain block
  // that came from a CATEGORY block (not explicit), the content-scoped rule wins
  if (hasContentScopedAllow && domainBlocks.length > 0) {
    const highestContentRule = matched
      .filter(r => r.action === RULE_ACTIONS.BLOCK_CONTENT || r.action === RULE_ACTIONS.WARN_CONTENT)
      .sort((a, b) => (b.rule.priority || 0) - (a.rule.priority || 0))[0];

    const highestDomainBlock = domainBlocks
      .sort((a, b) => (b.rule.priority || 0) - (a.rule.priority || 0))[0];

    // Content-scoped rule with allowlist takes precedence over lower-priority domain blocks
    if (highestContentRule && highestContentRule.rule.priority >= highestDomainBlock.rule.priority) {
      return {
        action: highestContentRule.action,
        matchedRules: [highestContentRule],
        reason: `content_rule_overrides_domain_block:${highestContentRule.reason}`,
        debug: results,
      };
    }
  }

  // Standard: highest priority domain block wins
  if (domainBlocks.length > 0) {
    const best = domainBlocks.sort((a, b) => (b.rule.priority || 0) - (a.rule.priority || 0))[0];
    return {
      action: RULE_ACTIONS.BLOCK_DOMAIN,
      matchedRules: [best],
      reason: best.reason,
      debug: results,
    };
  }

  // Content blocks
  const contentBlocks = matched.filter(r => r.action === RULE_ACTIONS.BLOCK_CONTENT);
  if (contentBlocks.length > 0) {
    const best = contentBlocks.sort((a, b) => (b.rule.priority || 0) - (a.rule.priority || 0))[0];
    return {
      action: RULE_ACTIONS.BLOCK_CONTENT,
      matchedRules: [best],
      reason: best.reason,
      confidence: best.confidence,
      debug: results,
    };
  }

  // Content warns
  const contentWarns = matched.filter(r => r.action === RULE_ACTIONS.WARN_CONTENT);
  if (contentWarns.length > 0) {
    const best = contentWarns.sort((a, b) => (b.rule.priority || 0) - (a.rule.priority || 0))[0];
    return {
      action: RULE_ACTIONS.WARN_CONTENT,
      matchedRules: [best],
      reason: best.reason,
      confidence: best.confidence,
      debug: results,
    };
  }

  // Fallback
  return {
    action: 'ALLOW',
    matchedRules: matched,
    reason: 'no_actionable_match',
    debug: results,
  };
}

// ── DNR Pattern Extraction (for network-level blocking only) ────
// Only creates DNR patterns for BLOCK_DOMAIN rules

export function extractDNRPatterns(compiledRules) {
  const patterns = [];

  for (const rule of compiledRules) {
    // ONLY create DNR (network-level) blocks for explicit domain blocks
    if (rule.action.type !== RULE_ACTIONS.BLOCK_DOMAIN) continue;

    const blocklist = rule.scope.domain_blocklist || [];
    for (const domain of blocklist) {
      patterns.push({
        pattern: `*${domain}*`,
        ruleId: rule.id,
        ruleText: rule.source_text,
      });
    }
  }

  return patterns;
}
