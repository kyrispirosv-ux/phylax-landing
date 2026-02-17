// Phylax Engine — Weighted Keyword Lexicons
// Scoring: score = 1 - exp(-Σ weight_i * hit_i)  (saturating curve)
// A single strong keyword (w=1.5) gives ~0.78. Two gives ~0.95.
// This prevents flat keyword counting false positives while ensuring
// genuinely harmful content gets high scores quickly.

// ── Lexicon per topic ─────────────────────────────────────────────

export const LEXICONS = {
  gambling: [
    // Very strong indicators (w ≥ 2.0)
    { phrase: 'online casino', weight: 2.5 },
    { phrase: 'sports betting', weight: 2.2 },
    { phrase: 'place your bet', weight: 2.0 },
    { phrase: 'bet365', weight: 2.5 },
    { phrase: 'draftkings', weight: 2.5 },
    { phrase: 'fanduel', weight: 2.5 },
    { phrase: 'pokerstars', weight: 2.5 },
    { phrase: 'betmgm', weight: 2.5 },
    // Strong indicators (w 1.0–2.0)
    { phrase: 'gambling', weight: 1.5 },
    { phrase: 'casino', weight: 1.4 },
    { phrase: 'poker', weight: 1.2 },
    { phrase: 'blackjack', weight: 1.3 },
    { phrase: 'roulette', weight: 1.3 },
    { phrase: 'slot machine', weight: 1.5 },
    { phrase: 'sportsbook', weight: 1.8 },
    { phrase: 'parlay', weight: 1.5 },
    { phrase: 'wager', weight: 1.0 },
    { phrase: 'bookmaker', weight: 1.5 },
    { phrase: 'baccarat', weight: 1.3 },
    { phrase: 'craps', weight: 1.0 },
    // Moderate indicators (w 0.3–1.0)
    { phrase: 'betting', weight: 0.8 },
    { phrase: 'jackpot', weight: 0.7 },
    { phrase: 'slots', weight: 0.7 },
    { phrase: 'odds', weight: 0.4 },
    { phrase: 'spread', weight: 0.3 },
    { phrase: 'payout', weight: 0.6 },
    { phrase: 'house edge', weight: 1.0 },
    { phrase: 'free spins', weight: 1.2 },
    { phrase: 'deposit bonus', weight: 1.5 },
    { phrase: 'cash out', weight: 0.4 },
  ],

  pornography: [
    { phrase: 'pornhub', weight: 3.0 },
    { phrase: 'xvideos', weight: 3.0 },
    { phrase: 'xnxx', weight: 3.0 },
    { phrase: 'xhamster', weight: 3.0 },
    { phrase: 'onlyfans', weight: 2.5 },
    { phrase: 'chaturbate', weight: 3.0 },
    { phrase: 'pornography', weight: 2.5 },
    { phrase: 'porn', weight: 2.0 },
    { phrase: 'xxx', weight: 1.8 },
    { phrase: 'nsfw', weight: 1.2 },
    { phrase: 'hentai', weight: 2.0 },
    { phrase: 'erotic', weight: 1.0 },
    { phrase: 'sex video', weight: 2.0 },
    { phrase: 'nude', weight: 1.0 },
    { phrase: 'naked', weight: 0.8 },
    { phrase: 'sexually explicit', weight: 2.0 },
    { phrase: 'adult content', weight: 1.5 },
    { phrase: 'strip', weight: 0.4 },
    { phrase: 'webcam model', weight: 1.8 },
  ],

  self_harm: [
    { phrase: 'suicide methods', weight: 3.0 },
    { phrase: 'how to kill yourself', weight: 3.0 },
    { phrase: 'ways to die', weight: 2.5 },
    { phrase: 'end my life', weight: 2.5 },
    { phrase: 'kill myself', weight: 2.5 },
    { phrase: 'want to die', weight: 2.0 },
    { phrase: 'self-harm', weight: 1.5 },
    { phrase: 'self harm', weight: 1.5 },
    { phrase: 'suicide', weight: 1.2 },
    { phrase: 'suicidal', weight: 1.5 },
    { phrase: 'cutting', weight: 0.8 },
    { phrase: 'overdose', weight: 0.8 },
    { phrase: 'hang myself', weight: 2.5 },
    { phrase: 'jump off', weight: 0.5 },
    { phrase: 'slit wrists', weight: 2.5 },
  ],

  drugs: [
    { phrase: 'drug dealer', weight: 2.0 },
    { phrase: 'buy cocaine', weight: 2.5 },
    { phrase: 'buy heroin', weight: 2.5 },
    { phrase: 'buy meth', weight: 2.5 },
    { phrase: 'fentanyl', weight: 1.8 },
    { phrase: 'cocaine', weight: 1.2 },
    { phrase: 'heroin', weight: 1.5 },
    { phrase: 'methamphetamine', weight: 1.5 },
    { phrase: 'meth', weight: 1.0 },
    { phrase: 'marijuana', weight: 0.6 },
    { phrase: 'weed', weight: 0.5 },
    { phrase: 'getting high', weight: 0.8 },
    { phrase: 'substance abuse', weight: 0.8 },
    { phrase: 'drug use', weight: 0.7 },
    { phrase: 'narcotics', weight: 1.0 },
    { phrase: 'edibles', weight: 0.5 },
    { phrase: 'shrooms', weight: 0.8 },
    { phrase: 'lsd', weight: 0.8 },
    { phrase: 'mdma', weight: 0.9 },
    { phrase: 'ecstasy', weight: 0.9 },
    { phrase: 'crack', weight: 0.7 },
    { phrase: 'opioid', weight: 0.8 },
  ],

  violence: [
    { phrase: 'mass shooting', weight: 2.5 },
    { phrase: 'school shooting', weight: 2.5 },
    { phrase: 'execution video', weight: 3.0 },
    { phrase: 'beheading', weight: 3.0 },
    { phrase: 'graphic violence', weight: 2.0 },
    { phrase: 'gore', weight: 1.5 },
    { phrase: 'murder', weight: 1.0 },
    { phrase: 'torture', weight: 1.5 },
    { phrase: 'stabbing', weight: 1.2 },
    { phrase: 'shooting', weight: 0.6 },
    { phrase: 'assault', weight: 0.6 },
    { phrase: 'beating', weight: 0.5 },
    { phrase: 'fight video', weight: 1.5 },
    { phrase: 'fight compilation', weight: 2.0 },
    { phrase: 'street fight', weight: 1.5 },
    { phrase: 'real fight', weight: 1.8 },
    { phrase: 'brutal knockout', weight: 2.0 },
    { phrase: 'knockout video', weight: 1.5 },
    { phrase: 'knockout compilation', weight: 2.0 },
    { phrase: 'brutal', weight: 0.6 },
    { phrase: 'brutality', weight: 1.0 },
    { phrase: 'violent', weight: 0.4 },
    { phrase: 'violence compilation', weight: 2.0 },
    { phrase: 'caught on camera', weight: 0.5 },
    { phrase: 'kill', weight: 0.3 },
  ],

  weapons: [
    { phrase: 'buy weapons', weight: 2.5 },
    { phrase: 'homemade weapon', weight: 2.5 },
    { phrase: 'weapon tutorial', weight: 2.5 },
    { phrase: 'gun sale', weight: 2.0 },
    { phrase: 'assault rifle', weight: 1.5 },
    { phrase: 'firearms', weight: 1.0 },
    { phrase: 'handgun', weight: 0.8 },
    { phrase: 'ammunition', weight: 0.8 },
    { phrase: 'explosives', weight: 1.5 },
    { phrase: 'bomb making', weight: 3.0 },
    { phrase: 'guns', weight: 0.5 },
    { phrase: 'weapons', weight: 0.5 },
    { phrase: 'ar-15', weight: 1.0 },
    { phrase: 'concealed carry', weight: 0.6 },
  ],

  hate: [
    { phrase: 'white supremacy', weight: 2.5 },
    { phrase: 'white power', weight: 2.5 },
    { phrase: 'ethnic cleansing', weight: 3.0 },
    { phrase: 'race war', weight: 2.5 },
    { phrase: 'hate speech', weight: 1.5 },
    { phrase: 'racism', weight: 0.8 },
    { phrase: 'racist', weight: 0.7 },
    { phrase: 'bigotry', weight: 1.0 },
    { phrase: 'antisemitism', weight: 1.5 },
    { phrase: 'homophobia', weight: 1.0 },
    { phrase: 'transphobia', weight: 1.0 },
    { phrase: 'xenophobia', weight: 1.0 },
    { phrase: 'slur', weight: 0.5 },
    { phrase: 'discrimination', weight: 0.4 },
    { phrase: 'nazi', weight: 1.5 },
  ],

  bullying: [
    { phrase: 'kill yourself', weight: 2.5 },
    { phrase: 'kys', weight: 2.0 },
    { phrase: 'you should die', weight: 2.5 },
    { phrase: 'nobody likes you', weight: 1.5 },
    { phrase: 'go die', weight: 2.0 },
    { phrase: 'everyone hates you', weight: 1.5 },
    { phrase: 'worthless', weight: 0.8 },
    { phrase: 'cyberbullying', weight: 1.5 },
    { phrase: 'bullying', weight: 1.0 },
    { phrase: 'loser', weight: 0.3 },
    { phrase: 'ugly', weight: 0.2 },
  ],

  // ──────────────────────────────────────────────────────────────
  // GROOMING: Handled by grooming-detector.js (intelligent model).
  // The grooming topic is NO LONGER scored via keyword matching.
  // See engine/grooming-detector.js for the multi-signal, conversation-
  // aware, obfuscation-resistant grooming detection system.
  //
  // The old static lexicon has been retired. The seed phrases are now
  // embedded as semantic pattern clusters in the grooming detector,
  // organized by grooming stage/tactic, matched flexibly via regex
  // templates — not literal string comparison.
  //
  // localScoreAllTopics() skips 'grooming' entirely; the pipeline
  // calls detectGrooming() separately for intelligent scoring.
  // ──────────────────────────────────────────────────────────────
  grooming: [],  // Empty: scored by grooming-detector.js, not lexicon

  scams: [
    { phrase: 'nigerian prince', weight: 2.5 },
    { phrase: 'you won a prize', weight: 2.0 },
    { phrase: 'wire transfer', weight: 1.5 },
    { phrase: 'gift card payment', weight: 2.0 },
    { phrase: 'get rich quick', weight: 1.8 },
    { phrase: 'guaranteed returns', weight: 2.0 },
    { phrase: 'double your money', weight: 2.0 },
    { phrase: 'crypto scam', weight: 2.0 },
    { phrase: 'phishing', weight: 1.5 },
    { phrase: 'scam', weight: 1.0 },
    { phrase: 'fraud', weight: 0.8 },
    { phrase: 'free money', weight: 1.2 },
    { phrase: 'act now', weight: 0.4 },
    { phrase: 'limited time offer', weight: 0.3 },
  ],

  extremism: [
    { phrase: 'join isis', weight: 3.0 },
    { phrase: 'caliphate', weight: 2.0 },
    { phrase: 'jihad', weight: 1.5 },
    { phrase: 'great replacement', weight: 2.5 },
    { phrase: 'accelerationism', weight: 2.5 },
    { phrase: 'boogaloo', weight: 1.5 },
    { phrase: 'radicalization', weight: 1.5 },
    { phrase: 'extremism', weight: 1.0 },
    { phrase: 'terrorism', weight: 1.0 },
    { phrase: 'martyr', weight: 0.8 },
    { phrase: 'manifesto', weight: 0.8 },
    { phrase: 'holy war', weight: 1.5 },
    { phrase: 'race war', weight: 2.0 },
  ],

  eating_disorder: [
    { phrase: 'pro ana', weight: 2.5 },
    { phrase: 'pro mia', weight: 2.5 },
    { phrase: 'thinspo', weight: 2.5 },
    { phrase: 'thinspiration', weight: 2.5 },
    { phrase: 'bonespo', weight: 2.5 },
    { phrase: 'meanspo', weight: 2.5 },
    { phrase: 'how to purge', weight: 2.5 },
    { phrase: 'how to starve', weight: 2.5 },
    { phrase: 'purging', weight: 1.5 },
    { phrase: 'fasting tips', weight: 1.0 },
    { phrase: 'thigh gap', weight: 1.0 },
    { phrase: 'body check', weight: 0.8 },
    { phrase: 'calorie restrict', weight: 0.8 },
    { phrase: 'anorexia', weight: 0.6 },
    { phrase: 'bulimia', weight: 0.6 },
  ],

  profanity: [
    { phrase: 'fuck', weight: 0.8 },
    { phrase: 'shit', weight: 0.5 },
    { phrase: 'bitch', weight: 0.5 },
    { phrase: 'bastard', weight: 0.3 },
    { phrase: 'ass', weight: 0.2 },
    { phrase: 'damn', weight: 0.1 },
    { phrase: 'crap', weight: 0.1 },
  ],
};

// ── Scoring Functions ─────────────────────────────────────────────

/**
 * Score a single topic against pre-lowercased text using the saturating curve.
 * score = 1 - exp(-Σ weight_i * hit_i)
 */
export function localTopicScore(text, topicKey) {
  const lex = LEXICONS[topicKey];
  if (!lex || lex.length === 0) return 0;

  let sum = 0;
  for (const kw of lex) {
    if (text.includes(kw.phrase)) sum += kw.weight;
  }

  return sum === 0 ? 0 : 1 - Math.exp(-sum);
}

/**
 * Score all topics against text. Returns Record<string, number>.
 * Lowercases text once up front to avoid redundant per-topic lowering.
 * Skips scoring if text is too short to contain meaningful phrases.
 */
export function localScoreAllTopics(text) {
  if (!text || text.length < 3) return {};
  const lower = text.toLowerCase();
  const scores = {};
  for (const topic of Object.keys(LEXICONS)) {
    const s = localTopicScore(lower, topic);
    if (s > 0) scores[topic] = s;
  }
  return scores;
}
