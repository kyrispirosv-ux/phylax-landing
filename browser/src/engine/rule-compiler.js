// Phylax Engine — Rule Compiler v2 (Intent-Aware Intelligence Layer)
// Compiles natural language rules into structured rule objects with:
//   1. Intent Modeling (BLOCK_DOMAIN, ALLOW_DOMAIN_EXCEPT_TOPIC, etc.)
//   2. Rule Hierarchy + Conflict Resolution (specificity wins)
//   3. Contextual Reasoning (educational vs promotional tone)
//   4. Reason Graph (transparent decision trail)
//   5. Generalized across ALL harmful content topics
// Core invariant: domain-level blocking ONLY happens for explicit "block <site>" rules.
// "Allow site, block content inside it" is a first-class concept.

// ── Action Types ────────────────────────────────────────────────
export const RULE_ACTIONS = {
  BLOCK_DOMAIN:   'BLOCK_DOMAIN',
  BLOCK_URL:      'BLOCK_URL',
  ALLOW_DOMAIN:   'ALLOW_DOMAIN',
  BLOCK_CONTENT:  'BLOCK_CONTENT',
  WARN_CONTENT:   'WARN_CONTENT',
  FRICTION:       'FRICTION',
  COOLDOWN:       'COOLDOWN',
};

// ── Intent Types (what the parent MEANT) ────────────────────────
export const INTENT_TYPES = {
  BLOCK_DOMAIN:               'BLOCK_DOMAIN',
  ALLOW_DOMAIN:               'ALLOW_DOMAIN',
  BLOCK_TOPIC_GLOBAL:         'BLOCK_TOPIC_GLOBAL',
  ALLOW_DOMAIN_EXCEPT_TOPIC:  'ALLOW_DOMAIN_EXCEPT_TOPIC',
  BLOCK_TOPIC_WITHIN_DOMAIN:  'BLOCK_TOPIC_WITHIN_DOMAIN',
  REDUCE_ADDICTION:           'REDUCE_ADDICTION',
  WARN_ONLY:                  'WARN_ONLY',
};

// ── Content Context Types (for contextual reasoning) ────────────
const CONTENT_CONTEXTS = {
  SEARCH_RESULTS: 'search_results',
  EDUCATIONAL:    'educational',
  NEWS:           'news',
  ACADEMIC:       'academic',
  PROMOTIONAL:    'promotional',
  ENTERTAINMENT:  'entertainment',
  NEUTRAL:        'neutral',
};

// ── Search engine domains (safe-list for reduced sensitivity) ───
const SEARCH_ENGINE_DOMAINS = [
  'google.com', 'www.google.com', 'bing.com', 'www.bing.com',
  'duckduckgo.com', 'search.yahoo.com', 'ecosia.org',
  'startpage.com', 'brave.com', 'search.brave.com',
];

// ── Educational / reference domains (safe-list) ─────────────────
const EDUCATIONAL_DOMAINS = [
  'wikipedia.org', 'en.wikipedia.org', 'britannica.com',
  'khanacademy.org', 'coursera.org', 'edx.org',
  'scholar.google.com', 'jstor.org', 'pubmed.ncbi.nlm.nih.gov',
  'wolframalpha.com', 'stackexchange.com', 'stackoverflow.com',
];

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
  sports_video_games: {
    aliases: [
      'sports video games', 'sports games', 'sports gaming', 'video game sports', 'gaming sports',
      'sports content relating to video games', 'sports content about video games',
      'sports relating to video games', 'sports about video games',
      'content relating to video games', 'content about video games',
      'video game content', 'video games content',
    ],
    // Strong keywords: uniquely identify sports video games (high weight)
    strong_keywords: [
      'nba 2k', 'nba2k', '2k25', '2k24', '2k23', '2k22', '2k21', '2k20', '2k19', '2k18', '2k17', '2k16',
      '2k gameplay', '2k build', '2k park', '2k rec', '2k comp', '2k next gen', '2k current gen',
      '2k mycareer', '2k myteam', '2k myplayer', '2k mypark',
      '2k best', '2k dribble', '2k jumpshot', '2k badge', '2k demigod',
      '2k update', '2k patch', '2k season', '2k rating', '2k face scan',
      '2k is broken', '2k is dead', '2k is trash', '2k rant', '2k review',
      '2k tips', '2k tutorial', '2k guide', '2k montage', '2k highlights',
      'play 2k', 'playing 2k', 'played 2k', 'new 2k', 'old 2k',
      'madden 2', 'madden nfl', 'madden ultimate',
      'ea sports fc', 'ea fc 2', 'ea fc24', 'ea fc25',
      'efootball', 'pes 202',
      'mlb the show', 'nhl 2k', 'nhl 25', 'nhl 24', 'nhl 23',
      'wwe 2k', 'ufc game', 'ufc undisputed',
      'gran turismo', 'forza motorsport', 'forza horizon',
      'rocket league', 'mario strikers',
      'myplayer', 'mycareer', 'my career', 'myteam', 'my team', 'mypark', 'my player',
      'ultimate team', 'franchise mode', 'pro clubs',
      'badge grinding', 'vc glitch', 'vc coins',
      'park mode', 'rec center', 'neighborhood 2k',
      'gameplay 2k', 'build 2k',
      'best jumpshot', 'best dribble moves', 'dribble god', 'demigod build',
      'comp stage', 'stage games', 'ante up',
      'sports video game', 'sports game gameplay', 'sports game review',
    ],
    // Weak keywords: need 2+ matches or corroboration with strong (low weight)
    keywords: [
      'fifa', 'madden', 'f1 game', 'f1 2', 'top spin',
      'game mode', 'best build', 'dribble moves',
      'virtual match', 'gaming sports',
      'esports fifa', 'esports madden',
      'video game football', 'video game basketball', 'video game soccer', 'video game baseball',
      'controller settings', 'pro stick', 'shot meter', 'shot timing',
    ],
    // Real sports signals that SUPPRESS the score (prevent false positives)
    negative_keywords: [
      'highlights', 'recap', 'live game', 'final score', 'postgame',
      'press conference', 'interview', 'draft pick', 'trade deadline',
      'injury report', 'starting lineup', 'box score', 'standings',
      'playoff', 'championship', 'world cup', 'super bowl', 'world series',
      'premier league', 'la liga', 'bundesliga', 'serie a', 'ligue 1',
      'real madrid', 'barcelona', 'manchester', 'liverpool', 'arsenal',
      'lebron', 'steph curry', 'mahomes', 'messi', 'ronaldo', 'haaland',
      'lakers', 'celtics', 'warriors', 'bulls', 'heat', 'knicks', 'nets',
      'training camp', 'preseason', 'regular season', 'postseason',
      'slam dunk', 'triple double', 'buzzer beater', 'game winner',
      'nba finals', 'mvp race', 'all star game', 'dunk contest',
    ],
    label: 'Sports Video Games',
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
  // "no content about X but Y is okay/fine/allowed"
  /no\s+(?:content|videos?|posts?)\s+about\s+.+\s+but\s+.+\s+(?:is\s+)?(?:ok(?:ay)?|fine|allowed)/i,
  // "no X but regular/normal Y is okay"
  /no\s+.+\s+but\s+(?:regular|normal|real|actual)\s+.+\s+(?:is\s+)?(?:ok(?:ay)?|fine|allowed)/i,
];

// Patterns indicating "block X but allow Y" (content with exceptions)
const EXCEPTION_PATTERNS = [
  // "no <content> about X but Y is okay/fine/allowed"
  { pattern: /no\s+(?:content|videos?|posts?)\s+about\s+(.+?)\s+but\s+(?:regular\s+|normal\s+|real\s+|actual\s+)?(.+?)\s+(?:is\s+)?(?:ok(?:ay)?|fine|allowed)/i, blockGroup: 1, allowGroup: 2 },
  // "block X but allow/permit Y"
  { pattern: /block\s+(.+?)\s+but\s+(?:allow|permit|keep)\s+(.+)/i, blockGroup: 1, allowGroup: 2 },
  // "block X but not Y" / "block X but not real/regular Y"
  { pattern: /block\s+(.+?)\s+but\s+not\s+(?:regular\s+|normal\s+|real\s+|actual\s+)?(.+)/i, blockGroup: 1, allowGroup: 2 },
  // "no X but Y is okay/fine/allowed"
  { pattern: /no\s+(.+?)\s+but\s+(?:regular\s+|normal\s+|real\s+|actual\s+)?(.+?)\s+(?:is\s+)?(?:ok(?:ay)?|fine|allowed)/i, blockGroup: 1, allowGroup: 2 },
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

  // Step -1: Check for specific URL blocking (e.g., YouTube video links)
  const urlRule = tryBuildUrlBlockRule(id, text, textLower);
  if (urlRule) {
    debug(id, 'url_block_rule_built', { urls: urlRule._blockUrls });
    return {
      ...urlRule,
      parsed_intent: 'URL_BLOCK',
      parsed_intent_model: {
        user_intent_type: 'BLOCK_URL',
        strength: 'hard',
        confidence: 1.0,
        scope_granularity: 'url',
      },
      debug_reason_codes: [],
      _compiled: true,
      _errors: [],
    };
  }

  // Step 0: Check for exception patterns FIRST ("no X but Y is okay")
  // These require special handling: block X + allow Y as exclusion
  const exceptionRule = tryBuildExceptionRule(id, text, textLower);
  if (exceptionRule) {
    debug(id, 'exception_rule_built', { block: exceptionRule._blockLabels, allow: exceptionRule._allowLabels });
    // Skip to validation
    const validation = validateRule(exceptionRule);
    if (validation.valid) {
      return {
        ...exceptionRule,
        parsed_intent: 'EXCEPTION_CONTENT_BLOCK',
        parsed_intent_model: {
          user_intent_type: INTENT_TYPES.BLOCK_TOPIC_GLOBAL,
          strength: 'hard',
          confidence: 0.90,
          scope_granularity: 'global',
        },
        debug_reason_codes: [],
        _compiled: true,
        _errors: [],
      };
    }
  }

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
    parsed_intent_model: {
      user_intent_type: intent.user_intent_type || intent.type,
      strength: intent.strength || 'hard',
      confidence: intent.confidence || 0.5,
      scope_granularity: intent.scope_granularity || 'global',
    },
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
  // ── Intent Model Output ─────────────────────────────────────
  // Returns: { type, user_intent_type, strength, confidence, scope_granularity, pattern }

  // 1. Warn-only patterns ("warn about X", "alert about X")
  const warnPatterns = [
    /(?:warn|alert|notify|flag)\s+(?:about|if|when|for)\s+/i,
    /(?:just|only)\s+warn/i,
  ];
  for (const p of warnPatterns) {
    if (p.test(text)) {
      return {
        type: 'WARN_ONLY',
        user_intent_type: INTENT_TYPES.WARN_ONLY,
        strength: 'soft',
        confidence: 0.85,
        scope_granularity: labels.length > 0 ? 'content' : 'global',
        pattern: p.toString(),
      };
    }
  }

  // 2. Addiction / compulsion patterns ("limit time", "reduce usage", "restrict screen time")
  const addictionPatterns = [
    /(?:limit|reduce|restrict|control)\s+(?:time|usage|screen\s*time|hours|minutes|browsing)/i,
    /(?:no\s+more\s+than|max(?:imum)?)\s+\d+\s+(?:minutes?|hours?|mins?|hrs?)/i,
    /(?:take\s+a\s+break|force\s+break|mandatory\s+break)/i,
  ];
  for (const p of addictionPatterns) {
    if (p.test(text)) {
      return {
        type: 'REDUCE_ADDICTION',
        user_intent_type: INTENT_TYPES.REDUCE_ADDICTION,
        strength: 'hard',
        confidence: 0.88,
        scope_granularity: sites.length > 0 ? 'domain' : 'global',
        pattern: p.toString(),
      };
    }
  }

  // 3. Conditional / content-scoped patterns (highest priority for content rules)
  for (const pattern of CONDITIONAL_PATTERNS) {
    if (pattern.test(text)) {
      return {
        type: 'CONDITIONAL_CONTENT_BLOCK',
        user_intent_type: sites.length > 0
          ? INTENT_TYPES.ALLOW_DOMAIN_EXCEPT_TOPIC
          : INTENT_TYPES.BLOCK_TOPIC_GLOBAL,
        strength: 'hard',
        confidence: 0.90,
        scope_granularity: sites.length > 0 ? 'content' : 'global',
        pattern: pattern.toString(),
      };
    }
  }

  // Also: if we have BOTH a site AND a topic → content-level intent
  if (sites.length > 0 && labels.length > 0) {
    const isExplicitBlock = EXPLICIT_BLOCK_PATTERNS.some(p => p.test(text));
    if (!isExplicitBlock) {
      return {
        type: 'CONDITIONAL_CONTENT_BLOCK',
        user_intent_type: INTENT_TYPES.ALLOW_DOMAIN_EXCEPT_TOPIC,
        strength: 'hard',
        confidence: 0.87,
        scope_granularity: 'content',
        pattern: 'inferred:site+topic',
      };
    }
  }

  // 4. Category-level domain blocks ("no gambling sites", "block adult content")
  for (const pattern of CATEGORY_BLOCK_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const rawCat = match[1].toLowerCase().replace(/\s+/g, ' ');
      const resolvedCat = resolveCategoryName(rawCat);
      return {
        type: 'CATEGORY_BLOCK',
        user_intent_type: INTENT_TYPES.BLOCK_TOPIC_GLOBAL,
        category: resolvedCat,
        strength: 'hard',
        confidence: 0.92,
        scope_granularity: 'domain',
        pattern: pattern.toString(),
      };
    }
  }

  // 5. Explicit domain blocks ("block youtube", "ban reddit")
  for (const pattern of EXPLICIT_BLOCK_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const target = match[1].toLowerCase();
      const isKnownSite = Object.keys(SITE_MAP).includes(target) ||
        Object.values(SITE_MAP).some(s => s.domains.some(d => d.includes(target)));
      if (!isKnownSite) {
        const resolvedCat = resolveTopicToCategory(target);
        if (resolvedCat) {
          return {
            type: 'CATEGORY_BLOCK',
            user_intent_type: INTENT_TYPES.BLOCK_TOPIC_GLOBAL,
            category: resolvedCat,
            strength: 'hard',
            confidence: 0.88,
            scope_granularity: 'domain',
            pattern: pattern.toString(),
          };
        }
        if (labels.length > 0) {
          return {
            type: 'GENERAL',
            user_intent_type: INTENT_TYPES.BLOCK_TOPIC_GLOBAL,
            strength: 'hard',
            confidence: 0.70,
            scope_granularity: 'global',
            pattern: pattern.toString(),
          };
        }
      }
      return {
        type: 'EXPLICIT_DOMAIN_BLOCK',
        user_intent_type: INTENT_TYPES.BLOCK_DOMAIN,
        target: match[1],
        strength: 'hard',
        confidence: 0.95,
        scope_granularity: 'domain',
        pattern: pattern.toString(),
      };
    }
  }

  return {
    type: 'GENERAL',
    user_intent_type: labels.length > 0
      ? INTENT_TYPES.BLOCK_TOPIC_GLOBAL
      : INTENT_TYPES.WARN_ONLY,
    strength: labels.length > 0 ? 'hard' : 'soft',
    confidence: 0.60,
    scope_granularity: 'global',
    pattern: null,
  };
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
// EXCEPTION RULE BUILDER ("no X but Y is okay")
// ═════════════════════════════════════════════════════════════════

/**
 * Try to build a URL-level block rule when the rule text contains specific URLs.
 * Supports YouTube video URLs, general URLs, and YouTube video IDs.
 * Examples:
 *   "block https://www.youtube.com/watch?v=E3b62-R7GzI"
 *   "block this video: youtube.com/watch?v=abc123"
 *   "no access to https://example.com/some-page"
 */
function tryBuildUrlBlockRule(id, sourceText, textLower) {
  const blockUrls = [];

  // Extract YouTube video IDs from URLs or standalone
  // Matches: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID
  const ytPatterns = [
    /(?:youtube\.com\/watch\?[^&\s]*v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/gi,
  ];
  for (const pattern of ytPatterns) {
    let match;
    while ((match = pattern.exec(sourceText)) !== null) {
      const videoId = match[1];
      // Use the video ID as the blocking key — matches any YouTube URL with this ID
      blockUrls.push(`v=${videoId.toLowerCase()}`);
    }
  }

  // Extract full URLs (https://... or http://...)
  const urlPattern = /https?:\/\/[^\s"'<>]+/gi;
  let urlMatch;
  while ((urlMatch = urlPattern.exec(sourceText)) !== null) {
    const rawUrl = urlMatch[0].replace(/[.,;!?)]+$/, ''); // strip trailing punctuation
    // If it's a YouTube URL, we already extracted the video ID above
    if (rawUrl.includes('youtube.com') || rawUrl.includes('youtu.be')) continue;
    blockUrls.push(rawUrl.toLowerCase());
  }

  if (blockUrls.length === 0) return null;

  return {
    id,
    priority: 100, // Highest priority — explicit URL blocks are unambiguous
    source_text: sourceText,
    scope: { global: true },
    condition: { url_match: blockUrls },
    action: { type: RULE_ACTIONS.BLOCK_URL },
    explain: {
      child: 'This page has been blocked by your family rules.',
      parent: `URL blocked: ${blockUrls.join(', ')}`,
    },
    _blockUrls: blockUrls,
  };
}

/**
 * Try to build an exception-based rule from natural language like:
 *   "no content about sports video games but regular sports is okay"
 *   "block gambling content but sports betting news is fine"
 *
 * Returns null if the text doesn't match exception patterns.
 */
function tryBuildExceptionRule(id, sourceText, textLower) {
  for (const { pattern, blockGroup, allowGroup } of EXCEPTION_PATTERNS) {
    const match = textLower.match(pattern);
    if (!match) continue;

    const blockPhrase = match[blockGroup].trim();
    const allowPhrase = match[allowGroup].trim();

    debug(id, 'exception_pattern_match', { blockPhrase, allowPhrase, pattern: pattern.toString() });

    // Extract topic labels from block and allow phrases
    const blockLabels = extractLabels(blockPhrase);
    const allowLabels = extractLabels(allowPhrase);

    // If we found structured labels for the block phrase, great
    // If not, try to match the raw phrase against topics using keyword search
    if (blockLabels.length === 0) {
      // Try to find the best matching topic by checking if the phrase contains topic keywords
      for (const [topicKey, topic] of Object.entries(TOPICS)) {
        for (const alias of topic.aliases) {
          if (blockPhrase.includes(alias)) {
            blockLabels.push(topicKey);
            break;
          }
        }
        if (blockLabels.length > 0) break;
        // Also check if the phrase IS an alias with extra words
        for (const alias of topic.aliases) {
          if (alias.split(' ').every(word => blockPhrase.includes(word))) {
            blockLabels.push(topicKey);
            break;
          }
        }
        if (blockLabels.length > 0) break;
      }
    }

    // Build the rule with block labels and exception keywords
    const blockTopicLabels = blockLabels.map(l => TOPICS[l]?.label || l).join(', ');
    const allowTopicLabels = allowLabels.length > 0
      ? allowLabels.map(l => TOPICS[l]?.label || l).join(', ')
      : allowPhrase;

    // Build classifier with labels_any (block) and optional labels_not (allow)
    const classifier = {
      labels_any: blockLabels.length > 0 ? blockLabels : undefined,
      threshold: 0.55,
    };
    if (allowLabels.length > 0) {
      classifier.labels_not = allowLabels;
    }

    // If no block labels were found, use raw text matching with the block phrase
    // enhanced with the allow phrase as an exclusion
    const condition = blockLabels.length > 0
      ? { classifier }
      : { raw_text: blockPhrase, exception_text: allowPhrase };

    return {
      id,
      priority: 60,
      source_text: sourceText,
      scope: { global: true },
      condition,
      action: { type: RULE_ACTIONS.BLOCK_CONTENT, fallback: 'WARN_IF_UNCERTAIN' },
      explain: {
        child: `Content about ${blockTopicLabels || blockPhrase} is restricted. ${allowTopicLabels || allowPhrase} content is allowed.`,
        parent: `Block: "${blockPhrase}" | Allow exception: "${allowPhrase}"`,
      },
      _blockLabels: blockLabels,
      _allowLabels: allowLabels,
      _blockPhrase: blockPhrase,
      _allowPhrase: allowPhrase,
    };
  }
  return null;
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

// ═════════════════════════════════════════════════════════════════
// CONTEXTUAL REASONING
// ═════════════════════════════════════════════════════════════════

// Detect content context for anti-false-positive reasoning
function detectContentContext(content, domain, url) {
  // Search engine results pages — require much higher confidence
  if (SEARCH_ENGINE_DOMAINS.some(d => domain.includes(d) || domain.endsWith(d))) {
    return { type: CONTENT_CONTEXTS.SEARCH_RESULTS, multiplier: 0.25 };
  }

  // Educational / reference domains — reduce sensitivity
  if (EDUCATIONAL_DOMAINS.some(d => domain.includes(d) || domain.endsWith(d))) {
    return { type: CONTENT_CONTEXTS.EDUCATIONAL, multiplier: 0.40 };
  }

  // News sites (heuristic)
  const newsIndicators = ['news', 'reuters', 'bbc', 'cnn', 'nytimes', 'associated press', 'guardian', 'washingtonpost'];
  if (newsIndicators.some(n => domain.includes(n) || content.includes(n))) {
    return { type: CONTENT_CONTEXTS.NEWS, multiplier: 0.50 };
  }

  // Academic content (heuristic)
  const academicIndicators = ['study finds', 'research shows', 'published in', 'journal of', 'et al', 'abstract:', 'doi:'];
  if (academicIndicators.some(a => content.includes(a))) {
    return { type: CONTENT_CONTEXTS.ACADEMIC, multiplier: 0.45 };
  }

  // Promotional content (raises sensitivity)
  const promotionalIndicators = ['sign up', 'join now', 'free trial', 'click here', 'buy now', 'limited time', 'special offer', 'download now'];
  if (promotionalIndicators.filter(p => content.includes(p)).length >= 2) {
    return { type: CONTENT_CONTEXTS.PROMOTIONAL, multiplier: 1.3 };
  }

  return { type: CONTENT_CONTEXTS.NEUTRAL, multiplier: 1.0 };
}

// Score content against ANY label using the unified TOPICS vocabulary.
// Returns 0..1, modulated by contextual reasoning.
// skipContextReduction: true when the rule explicitly targets this domain
export function scoreContentForLabel(content, domain, url, label, skipContextReduction = false) {
  let score = 0;

  // 1. Domain reputation (known harmful domains)
  const catDomains = CATEGORY_DOMAINS[label];
  if (catDomains && catDomains.some(d => domain.includes(d))) {
    score = Math.max(score, 0.95);
  }

  // 2. Content keyword matching (supports strong_keywords + negative_keywords)
  const topic = TOPICS[label];
  if (topic) {
    let strongMatchCount = 0;
    let weakMatchCount = 0;

    // Check strong keywords first (high-confidence, unique identifiers)
    const strongKws = topic.strong_keywords || [];
    for (const kw of strongKws) {
      if (content.includes(kw)) strongMatchCount++;
    }

    // Check regular (weak) keywords
    for (const kw of topic.keywords) {
      if (content.includes(kw)) weakMatchCount++;
    }

    const totalMatches = strongMatchCount + weakMatchCount;

    if (totalMatches > 0) {
      let baseScore;
      if (strongMatchCount >= 2) {
        // 2+ strong matches = very high confidence
        baseScore = Math.min(0.95, 0.75 + strongMatchCount * 0.08);
      } else if (strongMatchCount === 1) {
        // 1 strong match = high confidence (strong keywords are unique identifiers)
        baseScore = Math.min(0.88, 0.70 + weakMatchCount * 0.06);
      } else if (weakMatchCount >= 3) {
        // 3+ weak matches with no strong = moderate confidence
        baseScore = Math.min(0.75, 0.40 + weakMatchCount * 0.10);
      } else if (weakMatchCount === 2) {
        // 2 weak matches = low confidence
        baseScore = 0.40;
      } else {
        // 1 weak match only = very low confidence (likely false positive)
        baseScore = 0.20;
      }
      score = Math.max(score, baseScore);
    }

    // Check negative keywords (suppress score for real sports content)
    const negKws = topic.negative_keywords || [];
    if (negKws.length > 0 && score > 0) {
      let negMatchCount = 0;
      for (const kw of negKws) {
        if (content.includes(kw)) negMatchCount++;
      }
      if (negMatchCount > 0 && strongMatchCount === 0) {
        // Real sports signals + no strong video game signals → suppress entirely
        score = 0;
      } else if (negMatchCount >= 2 && strongMatchCount <= 1) {
        // Multiple real sports signals + weak video game signal → heavy reduction
        score *= 0.3;
      }
    }
  }

  // 3. URL keyword signals
  if (topic) {
    const urlKws = [...(topic.strong_keywords || []), ...topic.keywords];
    for (const kw of urlKws) {
      if (kw.length >= 5 && url.includes(kw)) {
        score = Math.max(score, 0.7);
        break;
      }
    }
  }

  // 4. Contextual reasoning: modulate score based on content context
  // Skip reduction when the rule explicitly targets this domain
  if (!skipContextReduction) {
    const context = detectContentContext(content, domain, url);
    if (score > 0 && score < 0.95) {
      score = Math.min(1.0, score * context.multiplier);
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

  // Store URL on rule for reason graph access
  rule._evalUrl = urlLower;

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
    // If this rule explicitly targets this domain (user said "on wikipedia block X"),
    // don't raise thresholds for educational/search contexts
    const isExplicitlyScoped = allowlist.length > 0 &&
      allowlist.some(d => domainLower.includes(d) || domainLower.endsWith(d));
    const conditionResult = evaluateCondition(rule.condition, contentLower, domainLower, urlLower, isExplicitlyScoped);

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

function evaluateCondition(condition, content, domain, url, isExplicitlyScoped = false) {
  // Unified classifier: { labels_any: [...], threshold: 0.6 }
  if (condition.classifier) {
    const { labels_any, labels_all, labels_not } = condition.classifier;
    let threshold = condition.classifier.threshold || 0.6;

    // Contextual threshold: raise threshold for search/educational content
    // BUT only for global/non-explicitly-scoped rules. If the user explicitly
    // targeted this domain (e.g., "on wikipedia block X"), respect their intent.
    if (!isExplicitlyScoped) {
      const context = detectContentContext(content, domain, url);
      if (context.type === CONTENT_CONTEXTS.SEARCH_RESULTS) {
        threshold = Math.max(threshold, 0.80);
      } else if (context.type === CONTENT_CONTEXTS.EDUCATIONAL || context.type === CONTENT_CONTEXTS.ACADEMIC) {
        threshold = Math.max(threshold, 0.75);
      } else if (context.type === CONTENT_CONTEXTS.NEWS) {
        threshold = Math.max(threshold, 0.70);
      }
    }

    // labels_not: if ANY of these match, content is NOT flagged (exclusion)
    if (labels_not && labels_not.length > 0) {
      for (const label of labels_not) {
        const score = scoreContentForLabel(content, domain, url, label, isExplicitlyScoped);
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
        const score = scoreContentForLabel(content, domain, url, label, isExplicitlyScoped);
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
        const score = scoreContentForLabel(content, domain, url, label, isExplicitlyScoped);
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

  // Raw text match — with contextual reasoning
  if (condition.raw_text) {
    // Filter out common action verbs that don't contribute to content matching
    const stopWords = new Set([
      'block', 'allow', 'warn', 'flag', 'restrict', 'limit', 'ban',
      'content', 'site', 'sites', 'page', 'pages', 'videos', 'posts',
      'only', 'just', 'about', 'from', 'that', 'this', 'with', 'dont',
      'okay', 'fine', 'allowed', 'regular', 'normal', 'real', 'actual',
    ]);
    const words = condition.raw_text.split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));
    if (words.length === 0) {
      return { matched: false, uncertain: false, reason: 'raw_text_no_semantic_words', confidence: 0 };
    }
    const matchCount = words.filter(w => content.includes(w)).length;
    const ratio = matchCount / (words.length || 1);

    // Exception handling: if we have exception_text and the content matches it,
    // suppress the block (the content is in the "allowed" exception category)
    if (condition.exception_text && ratio >= 0.3) {
      const exceptionWords = condition.exception_text.split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w));
      if (exceptionWords.length > 0) {
        const exceptionMatchCount = exceptionWords.filter(w => content.includes(w)).length;
        const exceptionRatio = exceptionMatchCount / exceptionWords.length;
        // If content matches the exception AND doesn't strongly match the block terms,
        // then this is the "allowed" category — don't block
        if (exceptionRatio >= 0.5 && ratio < 0.8) {
          return { matched: false, uncertain: false, reason: `exception_override:${condition.exception_text}:${exceptionRatio.toFixed(2)}`, confidence: 0 };
        }
      }
    }

    // Apply contextual threshold: require higher confidence on search/educational pages
    // (but not for rules that explicitly target this domain)
    let requiredRatio = 0.5;
    if (!isExplicitlyScoped) {
      const ctx = detectContentContext(content, domain, url);
      requiredRatio = ctx.type === CONTENT_CONTEXTS.SEARCH_RESULTS ? 0.8
        : ctx.type === CONTENT_CONTEXTS.EDUCATIONAL ? 0.7
        : ctx.type === CONTENT_CONTEXTS.NEWS ? 0.7
        : 0.5;
    }
    if (ratio >= requiredRatio) return { matched: true, reason: `raw_text_match:${ratio.toFixed(2)}`, confidence: ratio };
    return { matched: false, uncertain: ratio > requiredRatio * 0.5, reason: `raw_text_low:${ratio.toFixed(2)}`, confidence: ratio };
  }

  // No conditions = always matches
  return { matched: true, reason: 'no_conditions', confidence: 1.0 };
}

// ═════════════════════════════════════════════════════════════════
// SPECIFICITY SCORING (for conflict resolution)
// ═════════════════════════════════════════════════════════════════

function computeSpecificity(rule) {
  let specificity = 0;

  // Domain-scoped rules are more specific than global
  if (rule.scope.domain_blocklist?.length > 0) specificity += 20;
  if (rule.scope.domain_allowlist?.length > 0) specificity += 25;

  // Path-scoped rules are more specific than domain-only
  if (rule.scope.path_patterns?.length > 0 &&
      !rule.scope.path_patterns.includes('*')) specificity += 15;

  // Classifier-based conditions are more specific than raw text
  if (rule.condition?.classifier) specificity += 10;
  if (rule.condition?.classifier?.labels_not) specificity += 5;
  if (rule.condition?.classifier?.labels_all) specificity += 5;

  // Rules with explicit intent types are more specific
  if (rule.parsed_intent_model?.user_intent_type) specificity += 5;

  // Content-scoped rules are more specific than domain-level
  if (rule.action?.type === RULE_ACTIONS.BLOCK_CONTENT ||
      rule.action?.type === RULE_ACTIONS.WARN_CONTENT) specificity += 10;

  return specificity;
}

// ═════════════════════════════════════════════════════════════════
// REASON GRAPH (transparent decision trail)
// ═════════════════════════════════════════════════════════════════

function buildReasonGraph(results, domain, url, finalAction) {
  const context = detectContentContext('', domain, url);
  const graph = {
    domain,
    url,
    content_context: context.type,
    context_multiplier: context.multiplier,
    rules_evaluated: results.length,
    rules_matched: results.filter(r => r.matched).length,
    final_action: finalAction,
    decision_path: [],
    conflict_resolutions: [],
  };

  for (const r of results) {
    graph.decision_path.push({
      rule_id: r.rule.id,
      rule_text: r.rule.source_text,
      intent_type: r.rule.parsed_intent_model?.user_intent_type || 'unknown',
      action_type: r.rule.action.type,
      matched: r.matched,
      match_reason: r.reason,
      confidence: r.confidence || null,
      specificity: computeSpecificity(r.rule),
      priority: r.rule.priority || 0,
    });
  }

  return graph;
}

// ═════════════════════════════════════════════════════════════════
// RESULT RESOLUTION (with hierarchy + conflict resolution)
// ═════════════════════════════════════════════════════════════════

function resolveResults(results, domain) {
  const matched = results.filter(r => r.matched);
  const url = results[0]?.rule?._evalUrl || '';

  if (matched.length === 0) {
    const graph = buildReasonGraph(results, domain, url, 'ALLOW');
    return { action: 'ALLOW', matchedRules: [], reason: 'no_rules_matched', reason_graph: graph, debug: results };
  }

  const domainLower = domain.toLowerCase();

  // ── Hierarchy Resolution (per spec section 6) ──────────────────
  // Priority order:
  //   1. Explicit DOMAIN_BLOCK
  //   2. Explicit DOMAIN_ALLOW (overrides implicit blocks)
  //   3. Scoped CONTENT_BLOCK (domain-scoped > global)
  //   4. Global TOPIC_BLOCK
  //   5. Default ALLOW

  // Sort all matched by specificity (more specific wins), then priority
  const sorted = [...matched].sort((a, b) => {
    const specA = computeSpecificity(a.rule);
    const specB = computeSpecificity(b.rule);
    if (specB !== specA) return specB - specA;
    return (b.rule.priority || 0) - (a.rule.priority || 0);
  });

  // Content-scoped allowlist = implicit domain allow
  const hasContentScopedAllow = sorted.some(r =>
    (r.action === RULE_ACTIONS.BLOCK_CONTENT || r.action === RULE_ACTIONS.WARN_CONTENT) &&
    r.rule.scope.domain_allowlist?.some(d => domainLower.includes(d))
  );

  const domainBlocks = sorted.filter(r => r.action === RULE_ACTIONS.BLOCK_DOMAIN);

  // Content-scoped allowlist overrides lower-specificity domain blocks
  if (hasContentScopedAllow && domainBlocks.length > 0) {
    const highestContent = sorted
      .filter(r => r.action === RULE_ACTIONS.BLOCK_CONTENT || r.action === RULE_ACTIONS.WARN_CONTENT)[0];
    const highestDomainBlock = domainBlocks[0];

    const contentSpec = computeSpecificity(highestContent.rule);
    const domainSpec = computeSpecificity(highestDomainBlock.rule);

    if (contentSpec >= domainSpec || highestContent.rule.priority >= highestDomainBlock.rule.priority) {
      const graph = buildReasonGraph(results, domain, url, highestContent.action);
      graph.conflict_resolutions.push({
        winner: highestContent.rule.id,
        loser: highestDomainBlock.rule.id,
        reason: 'content_scoped_allow_overrides_domain_block',
        winner_specificity: contentSpec,
        loser_specificity: domainSpec,
      });
      return {
        action: highestContent.action,
        matchedRules: [highestContent],
        reason: `content_rule_overrides_domain_block:${highestContent.reason}`,
        confidence: highestContent.confidence,
        reason_graph: graph,
        debug: results,
      };
    }
  }

  // Domain blocks (highest precedence if no content-scoped override)
  if (domainBlocks.length > 0) {
    const best = domainBlocks[0];
    const graph = buildReasonGraph(results, domain, url, RULE_ACTIONS.BLOCK_DOMAIN);
    return { action: RULE_ACTIONS.BLOCK_DOMAIN, matchedRules: [best], reason: best.reason, reason_graph: graph, debug: results };
  }

  // Content blocks
  const contentBlocks = sorted.filter(r => r.action === RULE_ACTIONS.BLOCK_CONTENT);
  if (contentBlocks.length > 0) {
    const best = contentBlocks[0];
    const graph = buildReasonGraph(results, domain, url, RULE_ACTIONS.BLOCK_CONTENT);
    return { action: RULE_ACTIONS.BLOCK_CONTENT, matchedRules: [best], reason: best.reason, confidence: best.confidence, reason_graph: graph, debug: results };
  }

  // Content warns
  const contentWarns = sorted.filter(r => r.action === RULE_ACTIONS.WARN_CONTENT);
  if (contentWarns.length > 0) {
    const best = contentWarns[0];
    const graph = buildReasonGraph(results, domain, url, RULE_ACTIONS.WARN_CONTENT);
    return { action: RULE_ACTIONS.WARN_CONTENT, matchedRules: [best], reason: best.reason, confidence: best.confidence, reason_graph: graph, debug: results };
  }

  const graph = buildReasonGraph(results, domain, url, 'ALLOW');
  return { action: 'ALLOW', matchedRules: matched, reason: 'no_actionable_match', reason_graph: graph, debug: results };
}

// ═════════════════════════════════════════════════════════════════
// DNR PATTERN EXTRACTION (network-level, BLOCK_DOMAIN only)
// ═════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════
// EXPORTED: Content context detection (for use by background.js)
// ═════════════════════════════════════════════════════════════════

export { detectContentContext, CONTENT_CONTEXTS };

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
