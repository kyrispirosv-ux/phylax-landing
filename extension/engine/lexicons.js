// Phylax Engine — Weighted Topic Lexicons
// Each topic has weighted keywords: { phrase, weight }
// Weight = specificity to harmful intent (0.0–1.0)
// Used with saturating curve: score = 1 - exp(-sum_of_matched_weights)
//
// Weight guide:
//   0.8–1.0  Very specific to harmful intent (e.g., "online gambling", "pornhub")
//   0.4–0.7  Commonly associated (e.g., "poker", "blackjack")
//   0.1–0.3  Ambiguous, context-dependent (e.g., "odds", "bet")

// ── Weighted lexicons per topic ─────────────────────────────────

export const LEXICONS = {
  gambling: [
    // High specificity
    { phrase: 'online gambling', weight: 0.95 },
    { phrase: 'sports betting', weight: 0.90 },
    { phrase: 'casino games', weight: 0.90 },
    { phrase: 'slot machine', weight: 0.85 },
    { phrase: 'gambling', weight: 0.80 },
    { phrase: 'sportsbook', weight: 0.80 },
    { phrase: 'bet365', weight: 0.95 },
    { phrase: 'draftkings', weight: 0.95 },
    { phrase: 'fanduel', weight: 0.95 },
    { phrase: 'betmgm', weight: 0.90 },
    { phrase: 'bovada', weight: 0.90 },
    { phrase: 'pokerstars', weight: 0.90 },
    { phrase: 'bookmaker', weight: 0.75 },
    // Medium specificity
    { phrase: 'casino', weight: 0.60 },
    { phrase: 'poker', weight: 0.50 },
    { phrase: 'blackjack', weight: 0.50 },
    { phrase: 'roulette', weight: 0.55 },
    { phrase: 'parlay', weight: 0.65 },
    { phrase: 'wager', weight: 0.50 },
    { phrase: 'betting odds', weight: 0.70 },
    { phrase: 'spread betting', weight: 0.75 },
    { phrase: 'point spread', weight: 0.55 },
    // Low specificity (ambiguous)
    { phrase: 'odds', weight: 0.12 },
    { phrase: 'jackpot', weight: 0.20 },
    { phrase: 'bet', weight: 0.10 },
    { phrase: 'payout', weight: 0.15 },
  ],

  pornography: [
    // High specificity
    { phrase: 'pornography', weight: 0.95 },
    { phrase: 'pornhub', weight: 0.99 },
    { phrase: 'xvideos', weight: 0.99 },
    { phrase: 'xnxx', weight: 0.99 },
    { phrase: 'xhamster', weight: 0.99 },
    { phrase: 'porn', weight: 0.85 },
    { phrase: 'xxx', weight: 0.80 },
    { phrase: 'nsfw', weight: 0.70 },
    { phrase: 'adult content', weight: 0.80 },
    { phrase: 'sexually explicit', weight: 0.90 },
    { phrase: 'onlyfans', weight: 0.75 },
    { phrase: 'sex video', weight: 0.90 },
    // Medium specificity
    { phrase: 'nude', weight: 0.55 },
    { phrase: 'naked', weight: 0.50 },
    { phrase: 'hentai', weight: 0.70 },
    { phrase: 'erotic', weight: 0.50 },
    { phrase: 'explicit', weight: 0.30 },
    { phrase: 'strip', weight: 0.20 },
  ],

  self_harm: [
    // High specificity
    { phrase: 'suicide methods', weight: 0.99 },
    { phrase: 'how to kill yourself', weight: 0.99 },
    { phrase: 'ways to die', weight: 0.95 },
    { phrase: 'end my life', weight: 0.90 },
    { phrase: 'kill myself', weight: 0.90 },
    { phrase: 'want to die', weight: 0.85 },
    { phrase: 'how to overdose', weight: 0.95 },
    // Medium specificity
    { phrase: 'self-harm', weight: 0.70 },
    { phrase: 'self harm', weight: 0.70 },
    { phrase: 'suicidal', weight: 0.65 },
    { phrase: 'suicide', weight: 0.50 },
    { phrase: 'cutting', weight: 0.35 },
  ],

  drugs: [
    // High specificity
    { phrase: 'drug dealer', weight: 0.90 },
    { phrase: 'buy drugs', weight: 0.95 },
    { phrase: 'getting high', weight: 0.70 },
    { phrase: 'substance abuse', weight: 0.60 },
    { phrase: 'how to make meth', weight: 0.99 },
    // Medium specificity
    { phrase: 'cocaine', weight: 0.60 },
    { phrase: 'heroin', weight: 0.65 },
    { phrase: 'meth', weight: 0.55 },
    { phrase: 'fentanyl', weight: 0.65 },
    { phrase: 'marijuana', weight: 0.40 },
    { phrase: 'weed', weight: 0.30 },
    { phrase: 'narcotics', weight: 0.55 },
    { phrase: 'edibles', weight: 0.30 },
    { phrase: 'shrooms', weight: 0.45 },
    { phrase: 'lsd', weight: 0.50 },
    { phrase: 'mdma', weight: 0.55 },
    { phrase: 'ecstasy', weight: 0.50 },
    // Low specificity
    { phrase: 'overdose', weight: 0.25 },
    { phrase: 'drugs', weight: 0.20 },
    { phrase: 'high', weight: 0.05 },
  ],

  violence: [
    // High specificity
    { phrase: 'graphic violence', weight: 0.90 },
    { phrase: 'mass shooting', weight: 0.95 },
    { phrase: 'school shooting', weight: 0.95 },
    { phrase: 'fight video', weight: 0.80 },
    { phrase: 'execution', weight: 0.75 },
    { phrase: 'beheading', weight: 0.90 },
    // Medium specificity
    { phrase: 'gore', weight: 0.65 },
    { phrase: 'murder', weight: 0.45 },
    { phrase: 'assault', weight: 0.35 },
    { phrase: 'torture', weight: 0.55 },
    { phrase: 'stabbing', weight: 0.50 },
    { phrase: 'brutality', weight: 0.55 },
    { phrase: 'beating', weight: 0.30 },
    // Low specificity
    { phrase: 'violence', weight: 0.20 },
    { phrase: 'shooting', weight: 0.15 },
    { phrase: 'fight', weight: 0.08 },
  ],

  weapons: [
    // High specificity
    { phrase: 'buy weapons', weight: 0.95 },
    { phrase: 'homemade weapon', weight: 0.90 },
    { phrase: 'weapon tutorial', weight: 0.90 },
    { phrase: 'gun sale', weight: 0.85 },
    { phrase: 'assault rifle', weight: 0.70 },
    // Medium specificity
    { phrase: 'firearms', weight: 0.55 },
    { phrase: 'handgun', weight: 0.50 },
    { phrase: 'ammunition', weight: 0.50 },
    { phrase: 'explosives', weight: 0.60 },
    { phrase: 'bomb making', weight: 0.95 },
    // Low specificity
    { phrase: 'weapons', weight: 0.20 },
    { phrase: 'guns', weight: 0.15 },
    { phrase: 'gun', weight: 0.10 },
  ],

  hate: [
    // High specificity
    { phrase: 'white supremacy', weight: 0.95 },
    { phrase: 'white power', weight: 0.90 },
    { phrase: 'ethnic cleansing', weight: 0.95 },
    { phrase: 'race war', weight: 0.90 },
    { phrase: 'hate speech', weight: 0.80 },
    // Medium specificity
    { phrase: 'racism', weight: 0.50 },
    { phrase: 'racist', weight: 0.45 },
    { phrase: 'bigotry', weight: 0.55 },
    { phrase: 'xenophobia', weight: 0.55 },
    { phrase: 'antisemitism', weight: 0.60 },
    { phrase: 'homophobia', weight: 0.50 },
    { phrase: 'transphobia', weight: 0.50 },
    // Low specificity
    { phrase: 'discrimination', weight: 0.15 },
    { phrase: 'slur', weight: 0.20 },
  ],

  bullying: [
    // High specificity
    { phrase: 'kill yourself', weight: 0.90 },
    { phrase: 'kys', weight: 0.85 },
    { phrase: 'you should die', weight: 0.90 },
    { phrase: 'go die', weight: 0.85 },
    { phrase: 'everyone hates you', weight: 0.80 },
    { phrase: 'nobody likes you', weight: 0.75 },
    // Medium specificity
    { phrase: 'cyberbullying', weight: 0.65 },
    { phrase: 'bullying', weight: 0.40 },
    // Low specificity
    { phrase: 'worthless', weight: 0.15 },
    { phrase: 'loser', weight: 0.10 },
    { phrase: 'ugly', weight: 0.08 },
  ],

  grooming: [
    // High specificity
    { phrase: 'send me a pic', weight: 0.90 },
    { phrase: 'send nudes', weight: 0.95 },
    { phrase: 'our secret', weight: 0.75 },
    { phrase: 'dont tell your parents', weight: 0.90 },
    { phrase: "don't tell your parents", weight: 0.90 },
    { phrase: 'mature for your age', weight: 0.85 },
    { phrase: 'special relationship', weight: 0.65 },
    { phrase: 'just between us', weight: 0.70 },
    // Medium specificity
    { phrase: 'grooming', weight: 0.50 },
    { phrase: 'are you alone', weight: 0.45 },
    { phrase: 'how old are you', weight: 0.30 },
    { phrase: 'predator', weight: 0.40 },
  ],

  scams: [
    // High specificity
    { phrase: 'get rich quick', weight: 0.85 },
    { phrase: 'guaranteed returns', weight: 0.85 },
    { phrase: 'double your money', weight: 0.80 },
    { phrase: 'nigerian prince', weight: 0.95 },
    { phrase: 'you won a prize', weight: 0.80 },
    { phrase: 'wire transfer', weight: 0.60 },
    { phrase: 'gift card payment', weight: 0.75 },
    { phrase: 'crypto scam', weight: 0.90 },
    // Medium specificity
    { phrase: 'phishing', weight: 0.55 },
    { phrase: 'scam', weight: 0.40 },
    { phrase: 'fraud', weight: 0.35 },
  ],

  extremism: [
    // High specificity
    { phrase: 'join isis', weight: 0.99 },
    { phrase: 'caliphate', weight: 0.80 },
    { phrase: 'great replacement', weight: 0.85 },
    { phrase: 'accelerationism', weight: 0.85 },
    { phrase: 'manifesto', weight: 0.40 },
    // Medium specificity
    { phrase: 'radicalization', weight: 0.65 },
    { phrase: 'terrorism', weight: 0.45 },
    { phrase: 'extremism', weight: 0.40 },
    { phrase: 'jihad', weight: 0.55 },
    { phrase: 'martyr', weight: 0.35 },
    { phrase: 'boogaloo', weight: 0.60 },
  ],

  eating_disorder: [
    // High specificity
    { phrase: 'pro ana', weight: 0.90 },
    { phrase: 'pro mia', weight: 0.90 },
    { phrase: 'thinspo', weight: 0.90 },
    { phrase: 'thinspiration', weight: 0.85 },
    { phrase: 'bonespo', weight: 0.90 },
    { phrase: 'meanspo', weight: 0.85 },
    { phrase: 'how to purge', weight: 0.90 },
    { phrase: 'how to starve', weight: 0.90 },
    // Medium specificity
    { phrase: 'purging', weight: 0.55 },
    { phrase: 'fasting tips', weight: 0.45 },
    { phrase: 'calorie restrict', weight: 0.50 },
    { phrase: 'body check', weight: 0.40 },
    { phrase: 'thigh gap', weight: 0.45 },
  ],

  profanity: [
    { phrase: 'fuck', weight: 0.50 },
    { phrase: 'shit', weight: 0.35 },
    { phrase: 'bitch', weight: 0.30 },
    { phrase: 'bastard', weight: 0.25 },
    { phrase: 'ass', weight: 0.15 },
    { phrase: 'damn', weight: 0.10 },
    { phrase: 'crap', weight: 0.08 },
    { phrase: 'piss', weight: 0.10 },
  ],
};

// ── Known domains per category (for domain gate) ─────────────

export const CATEGORY_DOMAINS = {
  gambling: [
    'gambling.com', 'poker.com', 'bet365.com', 'draftkings.com', 'fanduel.com',
    'casino.com', 'bovada.lv', 'betway.com', 'williamhill.com', '888casino.com',
    'pokerstars.com', 'betmgm.com', 'caesars.com', 'unibet.com', 'bwin.com',
    'paddypower.com', 'ladbrokes.com', 'betfair.com', 'pointsbet.com', 'sportsbet.com',
  ],
  pornography: [
    'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com',
    'youporn.com', 'brazzers.com', 'onlyfans.com', 'chaturbate.com',
  ],
  'social media': [
    'facebook.com', 'instagram.com', 'tiktok.com', 'snapchat.com',
    'twitter.com', 'x.com', 'reddit.com',
  ],
  gaming: ['roblox.com', 'minecraft.net', 'fortnite.com', 'steampowered.com'],
  video: ['youtube.com', 'twitch.tv', 'dailymotion.com'],
  streaming: ['netflix.com', 'hulu.com', 'disneyplus.com'],
};

// ── Scoring functions ────────────────────────────────────────

/**
 * Score text against a single weighted lexicon using saturating exponential curve.
 * Returns 0..1 where higher = more confident match.
 */
export function localTopicScore(text, lexicon) {
  let sum = 0;
  for (const kw of lexicon) {
    if (text.includes(kw.phrase)) {
      sum += kw.weight;
    }
  }
  return 1 - Math.exp(-sum);
}

/**
 * Score text against ALL topics. Returns { topic: score } map.
 */
export function localScoreAllTopics(text) {
  const scores = {};
  const lower = text.toLowerCase();
  for (const [topic, lexicon] of Object.entries(LEXICONS)) {
    scores[topic] = localTopicScore(lower, lexicon);
  }
  return scores;
}

/**
 * Check if domain is a known harmful domain for any category.
 * Returns the category name or null.
 */
export function domainCategory(domain) {
  const d = domain.toLowerCase();
  for (const [cat, domains] of Object.entries(CATEGORY_DOMAINS)) {
    if (domains.some(cd => d.includes(cd) || d.endsWith(cd))) {
      return cat;
    }
  }
  return null;
}
