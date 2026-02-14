// Phylax Engine — Lightweight Heuristic Intent Classifier
// Classifies the INTENT of a page without an LLM call.
// Uses title, headings, URL, meta, and text signals.
//
// Intent labels:
//   promotion    — selling, advertising, affiliate, "best X sites" listicles
//   how_to       — instructional guides, tutorials, step-by-step
//   purchase     — checkout, sign-up, buy, deposit
//   news_reporting — neutral journalism, coverage, reporting
//   education    — academic, research, reference, informational
//   recovery_support — harm reduction, quitting, support resources
//   entertainment — games, streams, casual browsing
//   unknown      — insufficient signal
//
// Returns { label: string, confidence: number (0–1) }

// ── Signal patterns ──────────────────────────────────────────────

const INTENT_SIGNALS = {
  promotion: {
    title: [
      /\bbest\b.*\b(?:sites?|apps?|platforms?|casinos?|games?)\b/i,
      /\btop\s+\d+\b/i,
      /\breview(?:s|ed)?\b/i,
      /\brated\b/i,
      /\bbonus(?:es)?\b/i,
      /\bfree\s+(?:spins?|trial|bonus|money|credits?)\b/i,
      /\bpromo(?:tion|s|tional)?\b/i,
      /\baffiliate\b/i,
      /\b(?:sign|join)\s+(?:up|now)\b/i,
      /\bget\s+started\b/i,
      /\bexclusive\s+(?:offer|deal|bonus)\b/i,
    ],
    url: [
      /best[-_]/, /top[-_]\d+/, /review/, /bonus/, /promo/,
      /affiliate/, /signup/, /register/, /offers?/,
    ],
    text: [
      { pattern: /sign\s*up\s*(?:now|today|here|free)/gi, weight: 1.5 },
      { pattern: /join\s*(?:now|today|free)/gi, weight: 1.2 },
      { pattern: /deposit\s*bonus/gi, weight: 1.8 },
      { pattern: /free\s*(?:spins?|trial|bonus|credits?)/gi, weight: 1.5 },
      { pattern: /exclusive\s*(?:offer|deal|bonus)/gi, weight: 1.5 },
      { pattern: /click\s*here/gi, weight: 0.8 },
      { pattern: /limited\s*time/gi, weight: 1.0 },
      { pattern: /special\s*offer/gi, weight: 1.0 },
      { pattern: /use\s*(?:code|coupon|promo)/gi, weight: 1.5 },
      { pattern: /claim\s*(?:your|now|today|bonus|offer)/gi, weight: 1.3 },
      { pattern: /\brated\s*#?\s*\d/gi, weight: 0.8 },
      { pattern: /our\s*(?:pick|recommendation|top\s*choice)/gi, weight: 1.0 },
    ],
    baseWeight: 0,
  },

  how_to: {
    title: [
      /\bhow\s+to\b/i,
      /\bguide\b/i,
      /\btutorial\b/i,
      /\bstep[\s-]+by[\s-]+step\b/i,
      /\btips?\s+(?:for|to|on|and)\b/i,
      /\blearn\s+(?:how|to)\b/i,
      /\bbeginner'?s?\s+guide\b/i,
      /\bcomplete\s+guide\b/i,
      /\bstrateg(?:y|ies)\b/i,
    ],
    url: [
      /how[-_]to/, /guide/, /tutorial/, /tips/, /strategy/,
    ],
    text: [
      { pattern: /step\s*\d+/gi, weight: 0.8 },
      { pattern: /first,?\s*(?:you\s*(?:need|should|must)|start\s*by)/gi, weight: 1.0 },
      { pattern: /here'?s?\s*(?:how|what)/gi, weight: 0.6 },
      { pattern: /follow\s*(?:these|the)\s*steps/gi, weight: 1.2 },
      { pattern: /beginner/gi, weight: 0.5 },
      { pattern: /learn(?:ing)?\s+(?:how\s+)?to/gi, weight: 0.8 },
    ],
    baseWeight: 0,
  },

  purchase: {
    title: [
      /\bbuy\b/i,
      /\bshop\b/i,
      /\border\b/i,
      /\bpurchase\b/i,
      /\bcheckout\b/i,
      /\badd\s+to\s+cart\b/i,
    ],
    url: [
      /buy/, /shop/, /cart/, /checkout/, /order/, /purchase/, /deposit/,
    ],
    text: [
      { pattern: /add\s*to\s*cart/gi, weight: 2.0 },
      { pattern: /buy\s*now/gi, weight: 1.8 },
      { pattern: /checkout/gi, weight: 1.5 },
      { pattern: /\bprice\b.*\$\d/gi, weight: 1.2 },
      { pattern: /shipping/gi, weight: 0.8 },
      { pattern: /in\s*stock/gi, weight: 1.0 },
      { pattern: /deposit\s*(?:now|\$|with|via)/gi, weight: 1.5 },
    ],
    baseWeight: 0,
  },

  news_reporting: {
    title: [
      /\breport(?:s|ed|ing)?\b/i,
      /\baccording\s+to\b/i,
      /\bsays?\b/i,
      /\bannounce[ds]?\b/i,
      /\bupdate[ds]?\b/i,
      /\bbreaking\b/i,
      /\banalysis\b/i,
      /\bopinion\b/i,
    ],
    url: [
      /news/, /article/, /story/, /press/, /blog/,
    ],
    text: [
      { pattern: /according\s+to/gi, weight: 1.0 },
      { pattern: /(?:said|stated|reported|announced)\s+(?:that|in|on|by)/gi, weight: 1.0 },
      { pattern: /(?:officials?|spokesperson|experts?|analysts?|researchers?)\s+(?:said|say|warned|noted)/gi, weight: 1.2 },
      { pattern: /(?:reuters|associated\s+press|ap\s+news)/gi, weight: 1.5 },
      { pattern: /published\s+(?:on|by|in)/gi, weight: 0.8 },
      { pattern: /(?:the|a)\s+(?:study|report|survey|poll)\s+(?:found|showed|revealed|suggests)/gi, weight: 1.2 },
    ],
    baseWeight: 0,
  },

  education: {
    title: [
      /\bwhat\s+is\b/i,
      /\bdefinition\b/i,
      /\bexplain(?:ed|ing)?\b/i,
      /\bunderstand(?:ing)?\b/i,
      /\bresearch\b/i,
      /\bstudy\b/i,
      /\bacademic\b/i,
      /\bencyclopedia\b/i,
    ],
    url: [
      /wiki/, /edu/, /learn/, /course/, /lesson/, /definition/,
      /research/, /academic/, /study/,
    ],
    text: [
      { pattern: /(?:research|study|studies)\s+(?:show|indicate|suggest|found)/gi, weight: 1.2 },
      { pattern: /et\s+al\.?/gi, weight: 1.5 },
      { pattern: /(?:journal|published)\s+(?:of|in|by)/gi, weight: 1.5 },
      { pattern: /abstract\s*:/gi, weight: 2.0 },
      { pattern: /doi\s*:/gi, weight: 2.0 },
      { pattern: /\bhistory\s+of\b/gi, weight: 0.6 },
      { pattern: /\bdefined\s+as\b/gi, weight: 0.8 },
      { pattern: /\baccording\s+to\s+(?:the\s+)?(?:national|world|american|british)/gi, weight: 1.0 },
    ],
    baseWeight: 0,
  },

  recovery_support: {
    title: [
      /\brecovery\b/i,
      /\bquit(?:ting)?\b/i,
      /\bhelp\s+(?:for|with|line)\b/i,
      /\bsupport\s+(?:group|line|service)\b/i,
      /\baddiction\s+(?:help|support|recovery|treatment)\b/i,
      /\bharm\s+reduction\b/i,
      /\bhotline\b/i,
      /\bcrisis\b/i,
    ],
    url: [
      /recovery/, /support/, /help/, /quit/, /hotline/, /crisis/,
    ],
    text: [
      { pattern: /if\s+you\s+(?:or\s+someone|need\s+help|are\s+struggling)/gi, weight: 1.5 },
      { pattern: /(?:call|text|contact)\s+(?:the\s+)?(?:helpline|hotline|crisis|support)/gi, weight: 1.8 },
      { pattern: /\b(?:AA|NA|gamblers?\s+anonymous|SAMHSA)\b/gi, weight: 2.0 },
      { pattern: /recovery\s+(?:program|resource|center|community|journey)/gi, weight: 1.5 },
      { pattern: /harm\s+reduction/gi, weight: 1.5 },
      { pattern: /(?:quit|stop|overcome)\s+(?:gambling|drinking|using|addiction)/gi, weight: 1.2 },
      { pattern: /\btreatment\s+(?:options?|center|program|facility)/gi, weight: 1.2 },
      { pattern: /you\s+are\s+not\s+alone/gi, weight: 1.0 },
    ],
    baseWeight: 0,
  },
};

// ── Domain reputation ─────────────────────────────────────────────

const NEWS_DOMAINS = [
  'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'cnn.com',
  'nytimes.com', 'washingtonpost.com', 'theguardian.com', 'nbcnews.com',
  'abcnews.go.com', 'cbsnews.com', 'foxnews.com', 'npr.org', 'aljazeera.com',
  'usatoday.com', 'wsj.com', 'bloomberg.com', 'cnbc.com', 'news.google.com',
  'huffpost.com', 'politico.com', 'thehill.com', 'axios.com',
];

const EDUCATIONAL_DOMAINS = [
  'wikipedia.org', 'en.wikipedia.org', 'britannica.com',
  'khanacademy.org', 'coursera.org', 'edx.org',
  'scholar.google.com', 'jstor.org', 'pubmed.ncbi.nlm.nih.gov',
  'wolframalpha.com', 'stackexchange.com', 'stackoverflow.com',
  'nature.com', 'sciencedirect.com', 'researchgate.net',
];

const RECOVERY_DOMAINS = [
  'samhsa.gov', 'aa.org', 'na.org', 'gamblersanonymous.org',
  'ncpgambling.org', 'nami.org', 'betterhelp.com', 'talkspace.com',
  'crisistextline.org', 'suicidepreventionlifeline.org', '988lifeline.org',
];

// ═════════════════════════════════════════════════════════════════
// MAIN CLASSIFIER
// ═════════════════════════════════════════════════════════════════

/**
 * Classify the intent of a page.
 *
 * @param {ContentObject} content — extracted content from observer
 * @returns {{ label: string, confidence: number }}
 */
export function classifyIntent(content) {
  const title = (content.title || '').toLowerCase();
  const url = (content.url || '').toLowerCase();
  const domain = (content.domain || '').toLowerCase();
  const headings = (content.headings || []).join(' ').toLowerCase();
  const text = (
    (content.main_text || '') + ' ' +
    (content.visible_text_sample || '') + ' ' +
    (content.description || '') + ' ' +
    (content.og?.desc || '')
  ).toLowerCase().slice(0, 5000);

  // ── Domain-based fast path ───────────────────────────────────
  if (NEWS_DOMAINS.some(d => domain.includes(d))) {
    return { label: 'news_reporting', confidence: 0.80 };
  }
  if (EDUCATIONAL_DOMAINS.some(d => domain.includes(d))) {
    return { label: 'education', confidence: 0.80 };
  }
  if (RECOVERY_DOMAINS.some(d => domain.includes(d))) {
    return { label: 'recovery_support', confidence: 0.85 };
  }

  // ── Score each intent ─────────────────────────────────────────
  const scores = {};

  for (const [intent, signals] of Object.entries(INTENT_SIGNALS)) {
    let score = signals.baseWeight;

    // Title patterns (strong signal)
    for (const pat of signals.title) {
      if (pat.test(title) || pat.test(headings)) {
        score += 1.5;
        break; // One title match is enough per intent
      }
    }

    // URL patterns (moderate signal)
    for (const pat of signals.url) {
      if (pat.test(url)) {
        score += 0.8;
        break;
      }
    }

    // Text patterns (weighted)
    for (const sig of (signals.text || [])) {
      const matches = text.match(sig.pattern);
      if (matches) {
        // Count up to 3 matches to avoid runaway scores on long text
        score += sig.weight * Math.min(matches.length, 3);
      }
    }

    if (score > 0) scores[intent] = score;
  }

  // ── Pick the best intent ──────────────────────────────────────
  let bestLabel = 'unknown';
  let bestScore = 0;

  for (const [label, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestLabel = label;
    }
  }

  // Normalize confidence to 0–1 using a saturating curve
  // Score of 2.0 → confidence 0.63, 3.0 → 0.78, 5.0 → 0.92
  const confidence = bestScore > 0 ? 1 - Math.exp(-bestScore * 0.5) : 0;

  // Minimum threshold: need some signal to classify
  if (confidence < 0.25) {
    return { label: 'unknown', confidence: 0 };
  }

  return { label: bestLabel, confidence: Math.min(confidence, 0.95) };
}

/**
 * Check if an intent should exempt content from blocking.
 * Recovery support pages should generally not be blocked even if they
 * mention restricted topics (e.g., "quit gambling" mentions gambling).
 *
 * @param {{ label: string, confidence: number }} intent
 * @returns {boolean}
 */
export function isProtectiveIntent(intent) {
  if (!intent || intent.confidence < 0.50) return false;
  return intent.label === 'recovery_support';
}

/**
 * Get a threshold modifier based on intent.
 * Returns a multiplier applied to the blocking threshold:
 *   < 1.0 → easier to block (lower effective threshold)
 *   > 1.0 → harder to block (higher effective threshold)
 *   1.0   → no change
 *
 * @param {{ label: string, confidence: number }} intent
 * @returns {number}
 */
export function intentThresholdModifier(intent) {
  if (!intent || intent.confidence < 0.35) return 1.0;

  switch (intent.label) {
    case 'promotion':
      // Promotional content about restricted topics → easier to block
      return 0.80;
    case 'how_to':
      // How-to guides for restricted topics → easier to block
      return 0.85;
    case 'purchase':
      // Purchase/signup pages for restricted topics → easier to block
      return 0.75;
    case 'news_reporting':
      // News reporting → harder to block (but still possible)
      return 1.25;
    case 'education':
      // Educational content → harder to block
      return 1.30;
    case 'recovery_support':
      // Recovery/support → much harder to block
      return 2.0;
    default:
      return 1.0;
  }
}
