// Phylax Engine — Taxonomy
// Categories, severity tables, reason codes, hard triggers

// ── Top-level harm categories ───────────────────────────────────

export const HARM_CATEGORIES = {
  sexual_content:          { label: 'Sexual Content',              base_severity: 0.80 },
  sexual_content_minors:   { label: 'Sexual Content (Minors)',     base_severity: 1.00 },
  grooming:                { label: 'Grooming',                    base_severity: 1.00 },
  self_harm:               { label: 'Self-Harm',                   base_severity: 0.70 },
  suicide_ideation:        { label: 'Suicide Ideation',            base_severity: 0.80 },
  self_harm_instructions:  { label: 'Self-Harm Instructions',      base_severity: 0.95 },
  violence_graphic:        { label: 'Graphic Violence',            base_severity: 0.70 },
  violence_instructions:   { label: 'Violence Instructions',       base_severity: 0.85 },
  hate_harassment:         { label: 'Hate / Harassment',           base_severity: 0.75 },
  bullying:                { label: 'Bullying',                    base_severity: 0.35 },
  drugs:                   { label: 'Drugs',                       base_severity: 0.65 },
  drug_purchase:           { label: 'Drug Purchase Instructions',  base_severity: 0.75 },
  weapons:                 { label: 'Weapons',                     base_severity: 0.60 },
  extremism:               { label: 'Extremism / Radicalization',  base_severity: 0.80 },
  illegal_activity:        { label: 'Illegal Activity',            base_severity: 0.70 },
  scams_fraud:             { label: 'Scams / Fraud',               base_severity: 0.65 },
  doxxing_pii:             { label: 'Doxxing / PII Exposure',      base_severity: 0.90 },
  pro_eating_disorder:     { label: 'Pro-Eating Disorder',         base_severity: 0.70 },
  gambling:                { label: 'Gambling',                    base_severity: 0.70 },
  pornography:             { label: 'Pornography',                 base_severity: 0.80 },
  profanity:               { label: 'Profanity',                   base_severity: 0.15 },
};

// ── Actionability multipliers ───────────────────────────────────

export const ACTIONABILITY = {
  none:   0.7,
  low:    1.0,
  medium: 1.3,
  high:   1.7,
};

// ── Target multipliers ──────────────────────────────────────────

export const TARGET_MULTIPLIER = {
  minor_likely:  2.0,
  self_ideation: 1.2,
  self_instruct: 1.7,
  adult_unknown: 1.0,
  group:         0.9,
  unknown:       1.0,
};

// ── Context multipliers (anti-false-positive) ───────────────────

export const CONTEXT_MULTIPLIER = {
  news_reporting: 0.7,
  academic:       0.75,
  quoting:        0.8,
  educational:    0.85,
  fiction:        0.9,
  normal:         1.0,
  personal:       1.2,
  direct_message: 1.3,
  confession:     1.4,
};

// ── Hook categories (for compulsion scoring) ────────────────────

export const HOOK_TYPES = {
  short_form_loop:     { label: 'Short-Form Loop',         weight: 0.20 },
  outrage_bait:        { label: 'Outrage Bait',            weight: 0.15 },
  sexualized_content:  { label: 'Sexualized Content',      weight: 0.12 },
  validation_bait:     { label: 'Validation Bait',         weight: 0.10 },
  gambling_like_reward:{ label: 'Gambling-Like Reward',     weight: 0.18 },
  parasocial_pull:     { label: 'Parasocial Pull',         weight: 0.10 },
  doomscroll_topic:    { label: 'Doomscroll Topic',         weight: 0.15 },
};

// ── Behavioral feature weights (for compulsion scoring) ─────────

export const BEHAVIOR_WEIGHTS = {
  session_length:            0.15,
  night_use:                 0.20,
  rapid_scroll:              0.15,
  tab_thrash:                0.10,
  notification_open_latency: 0.10,
  repeat_reopen:             0.15,
  binge:                     0.15,
};

// ── Hard trigger definitions ────────────────────────────────────

export const HARD_TRIGGERS = {
  // Instant block — no scoring needed
  block: [
    {
      id: 'grooming_minor',
      description: 'Grooming signals + minor-likely target',
      categories: ['grooming'],
      requires_minor: true,
    },
    {
      id: 'sexual_minor',
      description: 'Sexual content involving minors',
      categories: ['sexual_content_minors'],
      requires_minor: false, // the category itself implies minors
    },
    {
      id: 'explicit_porn_kid',
      description: 'Explicit porn on kid profile',
      categories: ['pornography'],
      profile_tiers: ['kid_10', 'tween_13'],
    },
    {
      id: 'doxxing_combo',
      description: 'Phone + address together',
      categories: ['doxxing_pii'],
      requires_pii_combo: true,
    },
    {
      id: 'self_harm_instructions',
      description: 'Self-harm / suicide instructions',
      categories: ['self_harm_instructions'],
    },
    {
      id: 'violence_instructions_weapon',
      description: 'Violence instructions with weapon procurement',
      categories: ['violence_instructions'],
      requires_weapon: true,
    },
    {
      id: 'explicit_threat',
      description: 'Direct threats with specific target',
      categories: ['violence_graphic'],
      requires_direct_target: true,
    },
  ],

  // Escalation — alert parent
  escalate: [
    {
      id: 'repeated_grooming',
      description: 'Repeated grooming attempts across days',
      categories: ['grooming'],
      time_window_hours: 72,
      min_count: 2,
    },
    {
      id: 'repeated_self_harm',
      description: 'Repeated self-harm ideation',
      categories: ['self_harm', 'suicide_ideation'],
      time_window_hours: 48,
      min_count: 3,
    },
    {
      id: 'repeated_pro_ed',
      description: 'Repeated pro-ED content',
      categories: ['pro_eating_disorder'],
      time_window_hours: 48,
      min_count: 3,
    },
    {
      id: 'repeated_bullying_victim',
      description: 'Repeated bullying victimization signals',
      categories: ['bullying'],
      time_window_hours: 72,
      min_count: 4,
    },
  ],

  // Redirect — supportive intervention instead of block
  redirect: [
    {
      id: 'self_harm_seeking_help',
      description: 'Self-harm but intent is seeking help',
      categories: ['self_harm', 'suicide_ideation'],
      intent: 'seeking_help',
      resources: [
        { label: 'Crisis Text Line', value: 'Text HOME to 741741' },
        { label: 'National Suicide Prevention Lifeline', value: '988' },
        { label: 'Childhelp National Hotline', value: '1-800-422-4453' },
      ],
    },
  ],
};

// ── Keyword patterns for MVP rule-based detection ───────────────

export const KEYWORD_PATTERNS = {
  grooming: {
    high: [
      'send me a pic', 'send pic', 'send photo', 'send nudes',
      'don\'t tell your parents', 'dont tell your parents', 'our secret',
      'keep this between us', 'don\'t tell anyone', 'dont tell anyone',
      'you\'re so mature', 'youre so mature', 'mature for your age',
      'i won\'t tell', 'i wont tell', 'no one has to know',
      'special relationship', 'just between us',
    ],
    medium: [
      'how old are you', 'what grade are you in', 'where do you go to school',
      'where do you live', 'are you alone', 'are your parents home',
      'do you have a boyfriend', 'do you have a girlfriend',
      'you\'re beautiful', 'you\'re pretty', 'you\'re handsome',
      'what are you wearing',
    ],
  },

  self_harm: {
    high: [
      'how to kill yourself', 'how to commit suicide', 'ways to die',
      'best way to end it', 'how to cut yourself', 'methods of suicide',
      'suicide methods', 'painless way to die', 'how many pills to',
      'lethal dose',
    ],
    medium: [
      'i want to die', 'i want to kill myself', 'end it all',
      'no reason to live', 'better off dead', 'wish i was dead',
      'can\'t go on', 'cant go on', 'life isn\'t worth',
      'nobody would miss me', 'no one would care',
    ],
    seeking_help: [
      'suicide hotline', 'crisis line', 'need help', 'feeling suicidal',
      'contemplating suicide', 'help me', 'talk to someone',
      'crisis text', 'suicide prevention',
    ],
  },

  sexual_content: {
    high: [
      'pornhub', 'xvideos', 'xnxx', 'onlyfans', 'xxx',
      'hardcore porn', 'sex video', 'nude video', 'naked',
    ],
    medium: [
      'nsfw', 'erotic', 'sexy', 'hookup', 'booty call',
      'fap', 'hentai', 'rule34', 'r34',
    ],
  },

  violence: {
    high: [
      'how to make a bomb', 'how to make explosives', 'build a weapon',
      'how to poison', 'how to stab', 'how to shoot',
      'kill someone', 'murder someone', 'i will kill you',
      'school shooting', 'mass shooting',
    ],
    medium: [
      'gore', 'execution video', 'beheading', 'torture video',
      'fight video', 'beating video', 'assault video',
    ],
  },

  drugs: {
    high: [
      'buy drugs online', 'where to buy', 'dark web drugs',
      'how to make meth', 'how to cook', 'drug dealer',
      'buy weed online', 'buy cocaine', 'fentanyl',
    ],
    medium: [
      'getting high', 'smoke weed', 'rolling', 'tripping',
      'edibles', 'vaping', 'juul', 'dab pen',
    ],
  },

  gambling: {
    high: [
      'online casino', 'online poker', 'sports betting', 'place a bet',
      'gambling site', 'slot machine', 'bet365', 'draftkings', 'fanduel',
      'poker online', 'roulette', 'blackjack online',
    ],
    medium: [
      'gambling', 'casino', 'betting', 'slots', 'wager',
      'parlay', 'odds', 'spread', 'jackpot', 'poker',
    ],
  },

  hate: {
    high: [
      'kill all', 'death to all', 'white power', 'white supremacy',
      'ethnic cleansing', 'race war', 'gas the',
    ],
    medium: [
      'n word', 'faggot', 'tranny', 'retard', 'kys',
    ],
  },

  bullying: {
    medium: [
      'kill yourself', 'kys', 'nobody likes you', 'you\'re ugly',
      'youre ugly', 'loser', 'fat ugly', 'go die',
      'you should die', 'everyone hates you',
    ],
  },

  pii: {
    phone: /(?:\+?1[-.\s]?)?(?:\(?[0-9]{3}\)?[-.\s]?)?[0-9]{3}[-.\s]?[0-9]{4}/g,
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    address: /\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|place|pl)\b/gi,
    ssn: /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g,
  },

  pro_eating_disorder: {
    high: [
      'pro ana', 'pro mia', 'thinspo', 'thinspiration',
      'bonespo', 'meanspo', 'fasting tips', 'purging tips',
      'how to purge', 'how to starve',
    ],
    medium: [
      'calorie restrict', 'water fast', 'body check', 'thigh gap',
      'hip bones', 'collar bones', 'goal weight', 'ugw', 'gw',
    ],
  },

  extremism: {
    high: [
      'join isis', 'join the cause', 'jihad', 'martyr', 'caliphate',
      'manifesto', 'race war', 'accelerationism', 'boogaloo',
      'great replacement',
    ],
  },

  scams: {
    high: [
      'send me money', 'wire transfer', 'gift card payment',
      'nigerian prince', 'you won a prize', 'claim your prize',
      'verify your account', 'password expired',
    ],
    medium: [
      'get rich quick', 'make money fast', 'crypto investment',
      'guaranteed returns', 'double your money',
    ],
  },
};

// ── Actionability keyword patterns ──────────────────────────────

export const ACTIONABILITY_PATTERNS = {
  high: [
    'step by step', 'step 1', 'step one', 'how to make',
    'how to build', 'instructions for', 'recipe for',
    'ingredients:', 'materials needed', 'you will need',
    'tutorial', 'guide to', 'diy',
  ],
  medium: [
    'how to', 'where to buy', 'where to get', 'link to',
    'click here', 'download', 'order from',
  ],
  low: [
    'tips', 'advice', 'suggestions', 'recommendations',
  ],
};

// ── Context detection patterns ──────────────────────────────────

export const CONTEXT_PATTERNS = {
  news_reporting: [
    'according to', 'reports say', 'news:', 'breaking:',
    'reuters', 'associated press', 'bbc', 'cnn', 'nytimes',
    'police said', 'officials say', 'investigation',
  ],
  academic: [
    'study finds', 'research shows', 'published in',
    'journal of', 'university of', 'et al',
    'abstract:', 'methodology', 'findings suggest',
  ],
  educational: [
    'learn about', 'lesson on', 'education', 'textbook',
    'curriculum', 'course on', 'lecture on',
    'khanacademy', 'khan academy', 'coursera', 'edx',
    'wikipedia.org',
  ],
  quoting: [
    'he said', 'she said', 'they said', 'quote:',
    '"', 'according to', 'testified that',
  ],
  fiction: [
    'fiction', 'novel', 'story', 'movie', 'film',
    'tv show', 'series', 'character', 'plot',
    'imdb', 'rotten tomatoes',
  ],
};

// ── Domain reputation (known high-risk domains) ─────────────────

export const DOMAIN_RISK = {
  // Gambling
  gambling: [
    'gambling.com', 'casino.com', 'poker.com', 'bet365.com',
    'draftkings.com', 'fanduel.com', 'bovada.lv', 'betway.com',
    'williamhill.com', '888casino.com', 'pokerstars.com',
    'betmgm.com', 'caesars.com', 'unibet.com', 'bwin.com',
  ],
  // Adult
  adult: [
    'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com',
    'redtube.com', 'youporn.com', 'brazzers.com',
    'onlyfans.com', 'chaturbate.com',
  ],
  // Weapons
  weapons: [
    'gunbroker.com', 'armslist.com',
  ],
  // Drugs
  drugs: [
    // Dark web markets are not static domains
  ],
  // Scams (common phishing patterns)
  scams: [
    // Detected via pattern matching, not static list
  ],
};

// ── Age tier default thresholds ─────────────────────────────────

export const AGE_TIER_DEFAULTS = {
  kid_10: {
    label: 'Child (Under 12)',
    harm_block_threshold: 45,
    harm_warn_threshold: 25,
    compulsion_lock_threshold: 75,
    compulsion_friction_threshold: 55,
    compulsion_nudge_threshold: 35,
    blocked_categories: [
      'sexual_content', 'sexual_content_minors', 'grooming',
      'pornography', 'violence_graphic', 'violence_instructions',
      'drugs', 'drug_purchase', 'gambling', 'weapons',
      'self_harm_instructions', 'hate_harassment', 'extremism',
    ],
    warned_categories: [
      'self_harm', 'suicide_ideation', 'bullying', 'scams_fraud',
      'pro_eating_disorder', 'illegal_activity', 'profanity',
    ],
    max_daily_minutes: 120,
    bedtime: null,
    wake_time: null,
  },

  tween_13: {
    label: 'Tween (13-15)',
    harm_block_threshold: 55,
    harm_warn_threshold: 35,
    compulsion_lock_threshold: 80,
    compulsion_friction_threshold: 60,
    compulsion_nudge_threshold: 40,
    blocked_categories: [
      'sexual_content', 'sexual_content_minors', 'grooming',
      'pornography', 'violence_instructions', 'drug_purchase',
      'gambling', 'self_harm_instructions', 'extremism',
    ],
    warned_categories: [
      'violence_graphic', 'drugs', 'weapons', 'hate_harassment',
      'self_harm', 'suicide_ideation', 'bullying', 'scams_fraud',
      'pro_eating_disorder', 'doxxing_pii', 'illegal_activity',
    ],
    max_daily_minutes: 180,
    bedtime: null,
    wake_time: null,
  },

  teen_16: {
    label: 'Teen (16+)',
    harm_block_threshold: 70,
    harm_warn_threshold: 45,
    compulsion_lock_threshold: 85,
    compulsion_friction_threshold: 70,
    compulsion_nudge_threshold: 50,
    blocked_categories: [
      'sexual_content_minors', 'grooming', 'self_harm_instructions',
      'violence_instructions', 'extremism',
    ],
    warned_categories: [
      'sexual_content', 'pornography', 'violence_graphic',
      'drugs', 'drug_purchase', 'gambling', 'weapons',
      'hate_harassment', 'self_harm', 'suicide_ideation',
      'scams_fraud', 'doxxing_pii', 'pro_eating_disorder',
    ],
    max_daily_minutes: 240,
    bedtime: null,
    wake_time: null,
  },
};
