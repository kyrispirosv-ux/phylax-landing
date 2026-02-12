// Phylax Engine — Rule Compiler (Generalized)
// Compiles natural language rules into structured rule objects.
// Works for ANY topic × ANY platform combination.
// Core invariant: domain-level blocking ONLY happens for explicit "block <site>" rules.
// "Allow site, block content inside it" is a first-class concept.

// ── Action Types ────────────────────────────────────────────────
export const RULE_ACTIONS = {
  BLOCK_DOMAIN:   'BLOCK_DOMAIN',
  ALLOW_DOMAIN:   'ALLOW_DOMAIN',
  BLOCK_CONTENT:  'BLOCK_CONTENT',
  WARN_CONTENT:   'WARN_CONTENT',
  FRICTION:       'FRICTION',
  COOLDOWN:       'COOLDOWN',
};

// ═════════════════════════════════════════════════════════════════
// DATA: Sites, Categories, Topics — all extensible
// ═════════════════════════════════════════════════════════════════

// ── Known platforms (name → domains + content paths) ────────────
const SITE_MAP = {
  'youtube':    { domains: ['youtube.com', 'www.youtube.com', 'm.youtube.com'], contentPaths: ['/watch', '/shorts', '/results', '/playlist', '/channel', '/@'] },
  'tiktok':     { domains: ['tiktok.com', 'www.tiktok.com'], contentPaths: ['/@', '/video'] },
  'instagram':  { domains: ['instagram.com', 'www.instagram.com'], contentPaths: ['/p/', '/reel/', '/stories/'] },
  'facebook':   { domains: ['facebook.com', 'www.facebook.com', 'm.facebook.com'], contentPaths: ['/watch', '/reel', '/groups', '/posts/'] },
  'twitter':    { domains: ['twitter.com', 'x.com'], contentPaths: ['/status/', '/i/'] },
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
  'google':     { domains: ['google.com', 'www.google.com'], contentPaths: ['/search'] },
  'bing':       { domains: ['bing.com', 'www.bing.com'], contentPaths: ['/search'] },
  'wikipedia':  { domains: ['wikipedia.org', 'en.wikipedia.org'], contentPaths: ['/wiki/'] },
  'tumblr':     { domains: ['tumblr.com', 'www.tumblr.com'], contentPaths: ['/post/'] },
};

// ── Category → known domains (for category-level domain blocking) ──
const CATEGORY_DOMAINS = {
  'social media': ['facebook.com', 'instagram.com', 'tiktok.com', 'snapchat.com', 'twitter.com', 'x.com', 'reddit.com'],
  'gambling': [
    'gambling.com', 'poker.com', 'bet365.com', 'draftkings.com', 'fanduel.com',
    'casino.com', 'bovada.lv', 'betway.com', 'williamhill.com', '888casino.com',
    'pokerstars.com', 'betmgm.com', 'caesars.com', 'unibet.com', 'bwin.com',
    'paddypower.com', 'ladbrokes.com', 'betfair.com', 'pointsbet.com', 'sportsbet.com',
  ],
  'adult': [
    'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com',
    'youporn.com', 'brazzers.com', 'onlyfans.com', 'chaturbate.com',
  ],
  'gaming':    ['roblox.com', 'minecraft.net', 'fortnite.com', 'steampowered.com'],
  'video':     ['youtube.com', 'twitch.tv', 'dailymotion.com'],
  'streaming': ['netflix.com', 'hulu.com', 'disneyplus.com'],
};

// ── Unified topic vocabulary ────────────────────────────────────
// Each topic has NL aliases (how users refer to it) + content keywords (for classification).
// This is the SINGLE source of truth for all topic matching.
const TOPICS = {
  gambling: {
    aliases: ['gambling', 'casino', 'betting', 'poker', 'slots', 'sportsbook', 'wagering'],
    keywords: ['gambling', 'casino', 'poker', 'betting', 'slots', 'wager', 'roulette', 'blackjack', 'sportsbook', 'parlay', 'odds', 'jackpot', 'bet365', 'draftkings', 'fanduel', 'bookmaker'],
    label: 'Gambling',
  },
  pornography: {
    aliases: ['porn', 'pornography', 'adult content', 'nsfw', 'explicit content', 'xxx', 'sexual content'],
    keywords: ['porn', 'pornography', 'xxx', 'nsfw', 'adult content', 'explicit', 'sex video', 'nude', 'naked', 'hentai', 'onlyfans', 'erotic', 'sexually explicit'],
    label: 'Pornography / Sexual Content',
  },
  self_harm: {
    aliases: ['self-harm', 'self harm', 'suicide', 'cutting', 'suicidal', 'suicide methods'],
    keywords: ['self-harm', 'self harm', 'suicide', 'suicidal', 'cutting', 'kill myself', 'want to die', 'end my life', 'ways to die', 'suicide methods', 'how to kill yourself', 'overdose'],
    label: 'Self-Harm / Suicide',
  },
  drugs: {
    aliases: ['drugs', 'narcotics', 'drug use', 'drug content', 'substance abuse', 'drug-related'],
    keywords: ['drugs', 'narcotics', 'cocaine', 'heroin', 'meth', 'fentanyl', 'marijuana', 'weed', 'drug dealer', 'drug use', 'getting high', 'substance abuse', 'overdose', 'edibles', 'shrooms', 'lsd', 'mdma', 'ecstasy'],
    label: 'Drugs / Substance Abuse',
  },
  violence: {
    aliases: ['violence', 'gore', 'graphic violence', 'violent content', 'fighting', 'brutality'],
    keywords: ['violence', 'gore', 'graphic violence', 'murder', 'assault', 'beating', 'torture', 'execution', 'beheading', 'stabbing', 'shooting', 'fight video', 'brutality', 'mass shooting', 'school shooting'],
    label: 'Violence / Gore',
  },
  weapons: {
    aliases: ['weapons', 'guns', 'firearms', 'weapon content', 'gun content'],
    keywords: ['weapons', 'guns', 'firearms', 'assault rifle', 'handgun', 'ammunition', 'bomb', 'explosives', 'gun sale', 'buy weapons', 'homemade weapon', 'weapon tutorial'],
    label: 'Weapons / Firearms',
  },
  hate: {
    aliases: ['hate', 'hate speech', 'racism', 'bigotry', 'harassment', 'hate content', 'racist', 'discrimination'],
    keywords: ['hate speech', 'racism', 'racist', 'bigotry', 'white supremacy', 'white power', 'ethnic cleansing', 'race war', 'discrimination', 'xenophobia', 'antisemitism', 'homophobia', 'transphobia', 'slur'],
    label: 'Hate Speech / Harassment',
  },
  bullying: {
    aliases: ['bullying', 'cyberbullying', 'harassment', 'online bullying'],
    keywords: ['bullying', 'cyberbullying', 'kill yourself', 'kys', 'nobody likes you', 'you should die', 'loser', 'go die', 'everyone hates you', 'ugly', 'worthless'],
    label: 'Bullying / Cyberbullying',
  },
  grooming: {
    aliases: ['grooming', 'predator', 'predatory', 'grooming behavior', 'child predator'],
    keywords: ['grooming', 'send me a pic', 'send nudes', 'our secret', 'dont tell your parents', 'are you alone', 'how old are you', 'special relationship', 'just between us', 'mature for your age'],
    label: 'Grooming / Predatory Behavior',
  },
  scams: {
    aliases: ['scams', 'fraud', 'phishing', 'scam content'],
    keywords: ['scam', 'fraud', 'phishing', 'nigerian prince', 'you won a prize', 'wire transfer', 'gift card payment', 'get rich quick', 'guaranteed returns', 'double your money', 'crypto scam'],
    label: 'Scams / Fraud',
  },
  extremism: {
    aliases: ['extremism', 'radicalization', 'terrorism', 'extremist content', 'radical'],
    keywords: ['extremism', 'radicalization', 'terrorism', 'jihad', 'manifesto', 'join isis', 'caliphate', 'martyr', 'accelerationism', 'boogaloo', 'great replacement', 'race war'],
    label: 'Extremism / Radicalization',
  },
  eating_disorder: {
    aliases: ['eating disorder', 'pro-ana', 'pro-mia', 'anorexia', 'bulimia', 'eating disorders'],
    keywords: ['pro ana', 'pro mia', 'thinspo', 'thinspiration', 'bonespo', 'meanspo', 'purging', 'fasting tips', 'how to purge', 'how to starve', 'thigh gap', 'body check', 'calorie restrict'],
    label: 'Pro-Eating Disorder',
  },
  profanity: {
    aliases: ['profanity', 'swearing', 'bad language', 'curse words', 'vulgar language'],
    keywords: ['fuck', 'shit', 'ass', 'damn', 'bitch', 'bastard', 'crap', 'piss'],
    label: 'Profanity',
  },
};

// ═════════════════════════════════════════════════════════════════
// NL INTENT DETECTION
// ═════════════════════════════════════════════════════════════════

// Patterns indicating "allow the site, block CONTENT inside it"
const CONDITIONAL_PATTERNS = [
  // "don't block all of X" / "dont block youtube"
  /don'?t\s+block\s+(?:all\s+(?:of\s+)?)?(\w+)/i,
  // "only [block] videos/posts/content/articles about Y"
  /(?:only|just)\s+(?:block\s+)?(?:videos?|posts?|content|pages?|shorts?|stories?|articles?|results?|messages?|chats?)\s+(?:about|related\s+to|containing|with|on|regarding|involving)\s+/i,
  // "allow X but/except ..."
  /allow\s+(\w+)\s+(?:but|except)/i,
  // "X is fine/ok/allowed but/except ..."
  /(\w+)\s+is\s+(?:fine|ok|okay|allowed)\s+(?:but|except)/i,
  // "on X [only] block ..."
  /on\s+(\w+)\s+(?:only\s+)?block/i,
  // "within X"
  /within\s+(\w+)/i,
  // "block [only] videos/posts/content about ..."
  /block\s+(?:only\s+)?(?:videos?|posts?|content|pages?|articles?|results?|messages?)\s+(?:about|on|from|related|involving|regarding)/i,
  // "allow X but block Y" / "allow X except Y"
  /allow\s+\w+\s+but\s+block/i,
  // "X but not Y" / "X but block Y"
  /\w+\s+but\s+(?:not|block|warn|flag)/i,
];

// Patterns indicating explicit full domain block
const EXPLICIT_BLOCK_PATTERNS = [
  /^block\s+(\w+)$/i,
  /^block\s+(\w+\.\w+)$/i,
  /never\s+allow\s+(\w+)/i,
  /block\s+all\s+(?:of\s+)?(\w+)$/i,
  /completely\s+block\s+(\w+)/i,
  /^ban\s+(\w+)$/i,
  /^no\s+(\w+)\s*$/i,
];

// Patterns indicating category-level domain blocking (block known domains for a category)
// Dynamically built from TOPICS + CATEGORY_DOMAINS to be fully general
function buildCategoryBlockPatterns() {
  // Matches: "no <category> sites", "block <category>", "ban <category> content", etc.
  const categoryNames = Object.keys(CATEGORY_DOMAINS).map(c => c.replace('_', '\\s*'));
  const topicAliases = [];
  for (const [key, topic] of Object.entries(TOPICS)) {
    for (const alias of topic.aliases) {
      if (CATEGORY_DOMAINS[key] || CATEGORY_DOMAINS[alias]) {
        topicAliases.push(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
      }
    }
  }
  const allNames = [...new Set([...categoryNames, ...topicAliases])];
  if (allNames.length === 0) return [];
  const joined = allNames.join('|');
  return [
    new RegExp(`(?:no|block|ban)\\s+(${joined})\\s*(?:sites?|content|pages?|domains?)?\\s*$`, 'i'),
    new RegExp(`^block\\s+(?:all\\s+)?(${joined})\\s*(?:sites?)?$`, 'i'),
  ];
}

const CATEGORY_BLOCK_PATTERNS = buildCategoryBlockPatterns();

// ═════════════════════════════════════════════════════════════════
// DEBUG LOG
// ═════════════════════════════════════════════════════════════════

const _debugLog = [];
export function getDebugLog() { return [..._debugLog]; }
export function clearDebugLog() { _debugLog.length = 0; }

function debug(ruleId, stage, data) {
  const entry = { timestamp: Date.now(), ruleId, stage, ...data };
  _debugLog.push(entry);
  if (_debugLog.length > 500) _debugLog.shift();
  console.log(`[Phylax RuleCompiler] ${stage}:`, JSON.stringify(data));
  return entry;
}

// ═════════════════════════════════════════════════════════════════
// MAIN COMPILER
// ═════════════════════════════════════════════════════════════════

let _ruleCounter = 0;

export function compileRule(ruleText) {
  const id = `rule_${++_ruleCounter}_${Date.now()}`;
  const text = ruleText.trim();
  const textLower = text.toLowerCase();

  debug(id, 'input', { raw_text: text });

  // Step 1: Extract mentioned sites
  const mentionedSites = extractMentionedSites(textLower);
  debug(id, 'sites_found', { sites: mentionedSites.map(s => s.name) });

  // Step 2: Extract all content topics/labels
  const labels = extractLabels(textLower);
  debug(id, 'labels_found', { labels });

  // Step 3: Extract category references (for domain-level blocking)
  const categories = extractCategories(textLower);
  debug(id, 'categories_found', { categories });

  // Step 4: Detect rule intent
  const intent = detectIntent(textLower, mentionedSites, labels, categories);
  debug(id, 'intent_detected', intent);

  // Step 5: Build the structured rule
  let compiled;

  if (intent.type === 'CONDITIONAL_CONTENT_BLOCK') {
    compiled = buildConditionalRule(id, text, intent, mentionedSites, labels);
  } else if (intent.type === 'CATEGORY_BLOCK') {
    compiled = buildCategoryBlockRule(id, text, intent.category, mentionedSites);
  } else if (intent.type === 'EXPLICIT_DOMAIN_BLOCK') {
    compiled = buildDomainBlockRule(id, text, mentionedSites, categories);
  } else {
    compiled = buildInferredRule(id, text, mentionedSites, labels, categories);
  }

  // Step 6: Validate
  const validation = validateRule(compiled);
  debug(id, 'validation', validation);

  if (!validation.valid) {
    debug(id, 'compile_failed', { errors: validation.errors });
    return {
      id,
      priority: 50,
      source_text: text,
      parsed_intent: intent.type,
      action: { type: RULE_ACTIONS.WARN_CONTENT, fallback: 'ALLOW' },
      scope: { global: true },
      condition: { raw_text_match: textLower },
      explain: {
        child: 'This content may be restricted by your family rules.',
        parent: `Rule could not be fully parsed: "${text}"`,
      },
      debug_reason_codes: validation.errors,
      _compiled: false,
      _errors: validation.errors,
    };
  }

  const scopeType = compiled.scope.domain_allowlist ? 'content_scoped'
    : compiled.scope.domain_blocklist ? 'domain_block' : 'global';

  debug(id, 'compile_success', { action: compiled.action.type, scope_type: scopeType });

  return {
    ...compiled,
    parsed_intent: intent.type,
    debug_reason_codes: [],
    _compiled: true,
    _errors: [],
  };
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

// ═════════════════════════════════════════════════════════════════
// EXTRACTORS
// ═════════════════════════════════════════════════════════════════

function extractMentionedSites(text) {
  const found = [];

  for (const [name, info] of Object.entries(SITE_MAP)) {
    if (text.includes(name)) {
      found.push({ name, ...info });
    }
  }

  // Raw domain patterns
  const domainRegex = /([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/g;
  let match;
  while ((match = domainRegex.exec(text)) !== null) {
    const domain = match[1];
    if (['e.g', 'i.e', 'etc.com'].includes(domain)) continue;
    if (!found.some(s => s.domains?.includes(domain))) {
      found.push({ name: domain, domains: [domain], contentPaths: [] });
    }
  }

  return found;
}

// Extract all topic labels mentioned in text — fully general, uses TOPICS vocabulary
function extractLabels(text) {
  const found = [];

  for (const [topicKey, topic] of Object.entries(TOPICS)) {
    for (const alias of topic.aliases) {
      if (text.includes(alias)) {
        if (!found.includes(topicKey)) found.push(topicKey);
        break;
      }
    }
  }

  return found;
}

function extractCategories(text) {
  const found = [];

  for (const cat of Object.keys(CATEGORY_DOMAINS)) {
    const catText = cat.replace(/_/g, ' ');
    if (text.includes(catText)) {
      found.push(cat);
    }
  }

  // Map topic aliases to categories where a matching CATEGORY_DOMAINS entry exists
  for (const [topicKey, topic] of Object.entries(TOPICS)) {
    if (CATEGORY_DOMAINS[topicKey]) {
      for (const alias of topic.aliases) {
        if (text.includes(alias) && !found.includes(topicKey)) {
          found.push(topicKey);
          break;
        }
      }
    }
  }

  return found;
}

// ═════════════════════════════════════════════════════════════════
// INTENT DETECTION
// ═════════════════════════════════════════════════════════════════

function detectIntent(text, sites, labels, categories) {
  // 1. Conditional / content-scoped patterns (highest priority)
  //    If the text indicates "allow the site, block content matching X"
  for (const pattern of CONDITIONAL_PATTERNS) {
    if (pattern.test(text)) {
      return { type: 'CONDITIONAL_CONTENT_BLOCK', pattern: pattern.toString() };
    }
  }

  // Also: if we have BOTH a site AND a topic, and the text doesn't explicitly
  // say "block <site>", infer content-level intent
  if (sites.length > 0 && labels.length > 0) {
    // Check it's not an explicit "block <site>" pattern
    const isExplicitBlock = EXPLICIT_BLOCK_PATTERNS.some(p => p.test(text));
    if (!isExplicitBlock) {
      return { type: 'CONDITIONAL_CONTENT_BLOCK', pattern: 'inferred:site+topic' };
    }
  }

  // 2. Category-level domain blocks ("no gambling sites", "block adult content")
  for (const pattern of CATEGORY_BLOCK_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const rawCat = match[1].toLowerCase().replace(/\s+/g, ' ');
      const resolvedCat = resolveCategoryName(rawCat);
      return { type: 'CATEGORY_BLOCK', category: resolvedCat, pattern: pattern.toString() };
    }
  }

  // 3. Explicit domain blocks ("block youtube", "ban reddit")
  for (const pattern of EXPLICIT_BLOCK_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const target = match[1].toLowerCase();
      // If the target is a topic alias (not a known site), reclassify
      const isKnownSite = Object.keys(SITE_MAP).includes(target) ||
        Object.values(SITE_MAP).some(s => s.domains.some(d => d.includes(target)));
      if (!isKnownSite) {
        // Check if it maps to a category with known domains
        const resolvedCat = resolveTopicToCategory(target);
        if (resolvedCat) {
          return { type: 'CATEGORY_BLOCK', category: resolvedCat, pattern: pattern.toString() };
        }
        // It's a topic without a domain category — treat as general (will become content block)
        if (labels.length > 0) {
          return { type: 'GENERAL', pattern: pattern.toString() };
        }
      }
      return { type: 'EXPLICIT_DOMAIN_BLOCK', target: match[1], pattern: pattern.toString() };
    }
  }

  return { type: 'GENERAL', pattern: null };
}

// Resolve a topic alias to a CATEGORY_DOMAINS key (e.g., "porn" → "adult")
function resolveTopicToCategory(alias) {
  // Direct category match
  if (CATEGORY_DOMAINS[alias]) return alias;
  // Check all topics: if the alias belongs to a topic that has a category
  for (const [topicKey, topic] of Object.entries(TOPICS)) {
    if (topic.aliases.includes(alias) || topicKey === alias) {
      if (CATEGORY_DOMAINS[topicKey]) return topicKey;
    }
  }
  // Cross-reference: some topic aliases map to differently-named categories
  // e.g. "porn"/"pornography" → "adult" category
  const TOPIC_TO_CATEGORY = {
    'pornography': 'adult',
    'porn': 'adult',
    'adult content': 'adult',
    'nsfw': 'adult',
    'xxx': 'adult',
    'sexual content': 'adult',
    'explicit content': 'adult',
  };
  if (TOPIC_TO_CATEGORY[alias]) return TOPIC_TO_CATEGORY[alias];
  return null;
}

// Resolve a raw category name from user text to a CATEGORY_DOMAINS key
function resolveCategoryName(rawName) {
  // Direct match
  if (CATEGORY_DOMAINS[rawName]) return rawName;
  // Underscore form
  const underscore = rawName.replace(/\s+/g, '_');
  if (CATEGORY_DOMAINS[underscore]) return underscore;
  // Check topic aliases
  for (const [key, topic] of Object.entries(TOPICS)) {
    if (CATEGORY_DOMAINS[key] && topic.aliases.includes(rawName)) return key;
  }
  // Prefix match
  for (const cat of Object.keys(CATEGORY_DOMAINS)) {
    if (cat.startsWith(rawName) || rawName.startsWith(cat)) return cat;
  }
  return rawName;
}

// ═════════════════════════════════════════════════════════════════
// RULE BUILDERS
// ═════════════════════════════════════════════════════════════════

function buildConditionalRule(id, sourceText, intent, sites, labels) {
  // "Allow site, block content matching labels inside it"
  const domainAllowlist = [];
  const pathPatterns = [];

  for (const site of sites) {
    if (site.domains) domainAllowlist.push(...site.domains);
    if (site.contentPaths && site.contentPaths.length > 0) {
      pathPatterns.push(...site.contentPaths);
    }
  }

  // If no labels found, we still compile but with a raw-text condition
  const classifier = labels.length > 0
    ? { labels_any: labels, threshold: 0.6 }
    : null;

  const topicLabels = labels.map(l => TOPICS[l]?.label || l).join(', ');

  return {
    id,
    priority: 80,
    source_text: sourceText,
    scope: {
      domain_allowlist: [...new Set(domainAllowlist)],
      path_patterns: pathPatterns.length > 0 ? [...new Set(pathPatterns)] : ['*'],
    },
    condition: classifier
      ? { classifier }
      : { raw_text: sourceText.toLowerCase() },
    action: {
      type: RULE_ACTIONS.BLOCK_CONTENT,
      fallback: 'WARN_IF_UNCERTAIN',
    },
    explain: {
      child: `This content appears to contain ${topicLabels || 'restricted'} material.`,
      parent: `Blocked content on ${[...new Set(domainAllowlist)].join(', ')} classified as: ${topicLabels || 'restricted'}.`,
    },
  };
}

function buildCategoryBlockRule(id, sourceText, category, mentionedSites) {
  const domainBlocklist = [];

  // Resolve category to domains
  const resolvedCat = resolveCategoryName(category);
  if (CATEGORY_DOMAINS[resolvedCat]) {
    domainBlocklist.push(...CATEGORY_DOMAINS[resolvedCat]);
  }

  // If no known domains for this category, try topic keywords as a content-level rule instead
  if (domainBlocklist.length === 0) {
    const labels = [resolvedCat];
    return buildConditionalRule(id, sourceText, { type: 'category_fallback' }, mentionedSites, labels);
  }

  // Don't add non-category-domain sites to blocklist
  const domainAllowlist = [];
  for (const site of mentionedSites) {
    const isCategoryDomain = domainBlocklist.some(d => site.domains?.includes(d));
    if (!isCategoryDomain) {
      domainAllowlist.push(...(site.domains || []));
    }
  }

  const label = TOPICS[resolvedCat]?.label || resolvedCat;

  return {
    id,
    priority: 70,
    source_text: sourceText,
    scope: {
      domain_blocklist: [...new Set(domainBlocklist)],
      ...(domainAllowlist.length > 0 ? { domain_allowlist: [...new Set(domainAllowlist)] } : {}),
    },
    condition: { category_match: [resolvedCat] },
    action: {
      type: RULE_ACTIONS.BLOCK_DOMAIN,
      fallback: 'BLOCK_DOMAIN',
    },
    explain: {
      child: `This site is blocked because it contains ${label} content.`,
      parent: `Domain blocked by category rule: ${label}.`,
    },
  };
}

function buildDomainBlockRule(id, sourceText, sites, categories) {
  const domainBlocklist = [];

  for (const site of sites) {
    if (site.domains) domainBlocklist.push(...site.domains);
  }
  for (const cat of categories) {
    if (CATEGORY_DOMAINS[cat]) {
      domainBlocklist.push(...CATEGORY_DOMAINS[cat]);
    }
  }

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
    scope: { domain_blocklist: [...new Set(domainBlocklist)] },
    condition: {},
    action: {
      type: RULE_ACTIONS.BLOCK_DOMAIN,
      fallback: 'BLOCK_DOMAIN',
    },
    explain: {
      child: 'This site is blocked by your family\'s safety rules.',
      parent: `Domain explicitly blocked: ${[...new Set(domainBlocklist)].join(', ')}.`,
    },
  };
}

function buildInferredRule(id, sourceText, sites, labels, categories) {
  // sites + labels → content-level block
  if (sites.length > 0 && labels.length > 0) {
    return buildConditionalRule(id, sourceText, { type: 'inferred' }, sites, labels);
  }
  // categories only → category domain block
  if (categories.length > 0) {
    return buildCategoryBlockRule(id, sourceText, categories[0], sites);
  }
  // sites only → domain block
  if (sites.length > 0) {
    return buildDomainBlockRule(id, sourceText, sites, categories);
  }
  // labels only → global content block
  if (labels.length > 0) {
    const classifier = { labels_any: labels, threshold: 0.6 };
    const topicLabels = labels.map(l => TOPICS[l]?.label || l).join(', ');
    return {
      id,
      priority: 50,
      source_text: sourceText,
      scope: { global: true },
      condition: { classifier },
      action: { type: RULE_ACTIONS.BLOCK_CONTENT, fallback: 'WARN_IF_UNCERTAIN' },
      explain: {
        child: `This content appears to contain ${topicLabels} material.`,
        parent: `Content blocked globally for: ${topicLabels}.`,
      },
    };
  }
  // Unknown: warn
  return {
    id,
    priority: 30,
    source_text: sourceText,
    scope: { global: true },
    condition: { raw_text: sourceText.toLowerCase() },
    action: { type: RULE_ACTIONS.WARN_CONTENT, fallback: 'ALLOW' },
    explain: {
      child: 'This content may be restricted.',
      parent: `Unrecognized rule applied as warning: "${sourceText}".`,
    },
  };
}

// ═════════════════════════════════════════════════════════════════
// VALIDATION
// ═════════════════════════════════════════════════════════════════

function validateRule(rule) {
  const errors = [];
  if (!rule.id) errors.push('missing_id');
  if (!rule.source_text) errors.push('missing_source_text');
  if (!rule.action?.type) errors.push('missing_action_type');
  if (!Object.values(RULE_ACTIONS).includes(rule.action?.type)) {
    errors.push(`unknown_action_type:${rule.action?.type}`);
  }
  if (!rule.scope) errors.push('missing_scope');
  if (rule.action?.type === RULE_ACTIONS.BLOCK_DOMAIN) {
    if (!rule.scope.domain_blocklist || rule.scope.domain_blocklist.length === 0) {
      errors.push('block_domain_no_blocklist');
    }
  }
  return { valid: errors.length === 0, errors };
}

// ═════════════════════════════════════════════════════════════════
// UNIFIED CONTENT CLASSIFIER
// ═════════════════════════════════════════════════════════════════

// Score content against ANY label using the unified TOPICS vocabulary.
// Returns 0..1.
function scoreContentForLabel(content, domain, url, label) {
  let score = 0;

  // 1. Domain reputation
  const catDomains = CATEGORY_DOMAINS[label];
  if (catDomains && catDomains.some(d => domain.includes(d))) {
    score = Math.max(score, 0.95);
  }

  // 2. Content keyword matching
  const topic = TOPICS[label];
  if (topic) {
    let matchCount = 0;
    for (const kw of topic.keywords) {
      if (content.includes(kw)) matchCount++;
    }
    if (matchCount > 0) {
      score = Math.max(score, Math.min(0.95, 0.4 + matchCount * 0.12));
    }
  }

  // 3. URL keyword signals
  if (topic) {
    for (const kw of topic.keywords) {
      if (kw.length >= 4 && url.includes(kw)) {
        score = Math.max(score, 0.7);
        break;
      }
    }
  }

  return score;
}

// ═════════════════════════════════════════════════════════════════
// ENFORCEMENT: EVALUATE RULES AGAINST A PAGE
// ═════════════════════════════════════════════════════════════════

export function evaluateRules(compiledRules, url, domain, pageContent) {
  const results = [];
  const sorted = [...compiledRules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const rule of sorted) {
    results.push(evaluateRule(rule, url, domain, pageContent));
  }

  debug('eval', 'all_results', {
    url, domain,
    results: results.map(r => ({ ruleId: r.rule.id, matched: r.matched, action: r.action, reason: r.reason })),
  });

  return resolveResults(results, domain);
}

function evaluateRule(rule, url, domain, pageContent) {
  const domainLower = domain.toLowerCase();
  const urlLower = (url || '').toLowerCase();
  const contentLower = (pageContent || '').toLowerCase();

  // ── BLOCK_DOMAIN ──────────────────────────────────────────────
  if (rule.action.type === RULE_ACTIONS.BLOCK_DOMAIN) {
    const blocklist = rule.scope.domain_blocklist || [];
    const matched = blocklist.some(d => domainLower.includes(d) || domainLower.endsWith(d));
    return {
      rule, matched,
      action: matched ? RULE_ACTIONS.BLOCK_DOMAIN : null,
      reason: matched ? `domain_in_blocklist:${domainLower}` : 'domain_not_in_blocklist',
      scope: 'domain',
    };
  }

  // ── ALLOW_DOMAIN ──────────────────────────────────────────────
  if (rule.action.type === RULE_ACTIONS.ALLOW_DOMAIN) {
    const allowlist = rule.scope.domain_allowlist || [];
    const matched = allowlist.some(d => domainLower.includes(d) || domainLower.endsWith(d));
    return {
      rule, matched,
      action: matched ? RULE_ACTIONS.ALLOW_DOMAIN : null,
      reason: matched ? `domain_in_allowlist:${domainLower}` : 'domain_not_in_allowlist',
      scope: 'domain',
    };
  }

  // ── BLOCK_CONTENT / WARN_CONTENT ──────────────────────────────
  if (rule.action.type === RULE_ACTIONS.BLOCK_CONTENT || rule.action.type === RULE_ACTIONS.WARN_CONTENT) {
    // Domain scope check
    const allowlist = rule.scope.domain_allowlist || [];
    const isGlobal = rule.scope.global === true;
    const domainApplies = isGlobal || allowlist.length === 0 ||
      allowlist.some(d => domainLower.includes(d) || domainLower.endsWith(d));

    if (!domainApplies) {
      return { rule, matched: false, action: null, reason: 'domain_not_in_scope', scope: 'content' };
    }

    // Path pattern check
    const pathPatterns = rule.scope.path_patterns || [];
    let pathMatches = pathPatterns.length === 0;
    if (!pathMatches) {
      try {
        const urlPath = new URL(url).pathname;
        pathMatches = pathPatterns.some(p => p === '*' || urlPath.startsWith(p));
      } catch {
        pathMatches = true;
      }
    }

    if (!pathMatches) {
      return { rule, matched: false, action: null, reason: 'path_not_matched', scope: 'content' };
    }

    // Content condition check
    const conditionResult = evaluateCondition(rule.condition, contentLower, domainLower, urlLower);

    if (conditionResult.matched) {
      return {
        rule, matched: true,
        action: rule.action.type,
        reason: conditionResult.reason,
        confidence: conditionResult.confidence,
        matched_labels: conditionResult.matched_labels,
        scope: 'content',
      };
    }

    if (conditionResult.uncertain && rule.action.fallback === 'WARN_IF_UNCERTAIN') {
      return {
        rule, matched: true,
        action: RULE_ACTIONS.WARN_CONTENT,
        reason: `uncertain_fallback:${conditionResult.reason}`,
        confidence: conditionResult.confidence,
        scope: 'content',
      };
    }

    return { rule, matched: false, action: null, reason: 'condition_not_met', scope: 'content' };
  }

  return { rule, matched: false, action: null, reason: 'unknown_action_type', scope: 'unknown' };
}

function evaluateCondition(condition, content, domain, url) {
  // Unified classifier: { labels_any: [...], threshold: 0.6 }
  if (condition.classifier) {
    const { labels_any, labels_all, labels_not, threshold = 0.6 } = condition.classifier;

    // labels_not: if ANY of these match, content is NOT flagged (exclusion)
    if (labels_not && labels_not.length > 0) {
      for (const label of labels_not) {
        const score = scoreContentForLabel(content, domain, url, label);
        if (score >= threshold) {
          return { matched: false, uncertain: false, reason: `excluded_by:${label}:${score.toFixed(2)}`, confidence: score };
        }
      }
    }

    // labels_all: ALL must match
    if (labels_all && labels_all.length > 0) {
      let allMatch = true;
      let minScore = 1.0;
      const matched_labels = [];
      for (const label of labels_all) {
        const score = scoreContentForLabel(content, domain, url, label);
        if (score < threshold) { allMatch = false; break; }
        minScore = Math.min(minScore, score);
        matched_labels.push(label);
      }
      if (allMatch) {
        return { matched: true, reason: `labels_all:${labels_all.join(',')}:${minScore.toFixed(2)}`, confidence: minScore, matched_labels };
      }
    }

    // labels_any: ANY must match
    if (labels_any && labels_any.length > 0) {
      let bestScore = 0;
      let bestLabel = null;
      const matched_labels = [];
      for (const label of labels_any) {
        const score = scoreContentForLabel(content, domain, url, label);
        if (score > bestScore) { bestScore = score; bestLabel = label; }
        if (score >= threshold) matched_labels.push(label);
      }
      if (bestScore >= threshold) {
        return { matched: true, reason: `label:${bestLabel}:${bestScore.toFixed(2)}`, confidence: bestScore, matched_labels };
      }
      if (bestScore >= threshold * 0.6) {
        return { matched: false, uncertain: true, reason: `label_uncertain:${bestLabel}:${bestScore.toFixed(2)}`, confidence: bestScore };
      }
      return { matched: false, uncertain: false, reason: 'no_label_match', confidence: bestScore };
    }

    return { matched: false, uncertain: false, reason: 'empty_classifier', confidence: 0 };
  }

  // Legacy: topic-based (backward compat)
  if (condition.content_classifier?.topics) {
    const labels_any = condition.content_classifier.topics.map(t => t.topic);
    const threshold = condition.content_classifier.topics[0]?.threshold || 0.6;
    return evaluateCondition({ classifier: { labels_any, threshold } }, content, domain, url);
  }

  // Category match
  if (condition.category_match) {
    return { matched: true, reason: `category:${condition.category_match.join(',')}`, confidence: 0.9 };
  }

  // Raw text match
  if (condition.raw_text) {
    const words = condition.raw_text.split(/\s+/).filter(w => w.length > 3);
    const matchCount = words.filter(w => content.includes(w)).length;
    const ratio = matchCount / (words.length || 1);
    if (ratio > 0.5) return { matched: true, reason: `raw_text_match:${ratio.toFixed(2)}`, confidence: ratio };
    return { matched: false, uncertain: ratio > 0.25, reason: `raw_text_low:${ratio.toFixed(2)}`, confidence: ratio };
  }

  // No conditions = always matches
  return { matched: true, reason: 'no_conditions', confidence: 1.0 };
}

// ═════════════════════════════════════════════════════════════════
// RESULT RESOLUTION
// ═════════════════════════════════════════════════════════════════

function resolveResults(results, domain) {
  const matched = results.filter(r => r.matched);

  if (matched.length === 0) {
    return { action: 'ALLOW', matchedRules: [], reason: 'no_rules_matched', debug: results };
  }

  const domainLower = domain.toLowerCase();

  // Content-scoped allowlist = implicit domain allow
  const hasContentScopedAllow = matched.some(r =>
    (r.action === RULE_ACTIONS.BLOCK_CONTENT || r.action === RULE_ACTIONS.WARN_CONTENT) &&
    r.rule.scope.domain_allowlist?.some(d => domainLower.includes(d))
  );

  const domainBlocks = matched.filter(r => r.action === RULE_ACTIONS.BLOCK_DOMAIN);

  // Content-scoped allowlist overrides lower-priority domain blocks
  if (hasContentScopedAllow && domainBlocks.length > 0) {
    const highestContent = matched
      .filter(r => r.action === RULE_ACTIONS.BLOCK_CONTENT || r.action === RULE_ACTIONS.WARN_CONTENT)
      .sort((a, b) => (b.rule.priority || 0) - (a.rule.priority || 0))[0];
    const highestDomainBlock = domainBlocks
      .sort((a, b) => (b.rule.priority || 0) - (a.rule.priority || 0))[0];

    if (highestContent && highestContent.rule.priority >= highestDomainBlock.rule.priority) {
      return {
        action: highestContent.action,
        matchedRules: [highestContent],
        reason: `content_rule_overrides_domain_block:${highestContent.reason}`,
        confidence: highestContent.confidence,
        debug: results,
      };
    }
  }

  // Domain blocks
  if (domainBlocks.length > 0) {
    const best = domainBlocks.sort((a, b) => (b.rule.priority || 0) - (a.rule.priority || 0))[0];
    return { action: RULE_ACTIONS.BLOCK_DOMAIN, matchedRules: [best], reason: best.reason, debug: results };
  }

  // Content blocks
  const contentBlocks = matched.filter(r => r.action === RULE_ACTIONS.BLOCK_CONTENT);
  if (contentBlocks.length > 0) {
    const best = contentBlocks.sort((a, b) => (b.rule.priority || 0) - (a.rule.priority || 0))[0];
    return { action: RULE_ACTIONS.BLOCK_CONTENT, matchedRules: [best], reason: best.reason, confidence: best.confidence, debug: results };
  }

  // Content warns
  const contentWarns = matched.filter(r => r.action === RULE_ACTIONS.WARN_CONTENT);
  if (contentWarns.length > 0) {
    const best = contentWarns.sort((a, b) => (b.rule.priority || 0) - (a.rule.priority || 0))[0];
    return { action: RULE_ACTIONS.WARN_CONTENT, matchedRules: [best], reason: best.reason, confidence: best.confidence, debug: results };
  }

  return { action: 'ALLOW', matchedRules: matched, reason: 'no_actionable_match', debug: results };
}

// ═════════════════════════════════════════════════════════════════
// DNR PATTERN EXTRACTION (network-level, BLOCK_DOMAIN only)
// ═════════════════════════════════════════════════════════════════

export function extractDNRPatterns(compiledRules) {
  const patterns = [];
  for (const rule of compiledRules) {
    if (rule.action.type !== RULE_ACTIONS.BLOCK_DOMAIN) continue;
    for (const domain of (rule.scope.domain_blocklist || [])) {
      patterns.push({ pattern: `*${domain}*`, ruleId: rule.id, ruleText: rule.source_text });
    }
  }
  return patterns;
}
