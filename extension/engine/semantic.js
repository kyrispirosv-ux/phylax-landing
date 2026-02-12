// Phylax Engine — Semantic Parser
// Rule-based + keyword multi-head analysis (MVP)
// Produces a structured SemanticParse from event content

import {
  KEYWORD_PATTERNS,
  ACTIONABILITY_PATTERNS,
  CONTEXT_PATTERNS,
  DOMAIN_RISK,
} from './taxonomy.js';

// ── Main parse function ─────────────────────────────────────────

export function semanticParse(event) {
  const text = extractText(event);
  const url = event.source?.url || '';
  const domain = event.source?.domain || '';
  const textLower = text.toLowerCase();

  return {
    event_id: event.event_id,
    content: {
      topic_labels:      classifyTopics(textLower, domain),
      policy_category:   classifyPolicyCategories(textLower, domain),
      intent:            classifyIntent(textLower),
      target:            classifyTarget(textLower),
      actionability:     classifyActionability(textLower),
      explicitness:      classifyExplicitness(textLower, domain),
      coercion_signals:  detectCoercion(textLower),
      sentiment:         analyzeSentiment(textLower),
      stance:            classifyStance(textLower),
      uncertainty:       assessUncertainty(textLower),
      entities: {
        pii_flags:       detectPII(text), // case-sensitive for some patterns
        age_signals:     detectAgeSignals(textLower),
        location_signals: detectLocationSignals(text),
      },
      context_type:      detectContext(textLower, domain),
      content_type_hint: detectContentType(textLower, domain, url),
    },
  };
}

// ── Head 1: Topic/Category classification (multi-label) ─────────

function classifyTopics(text, domain) {
  const labels = [];

  // Domain-based classification
  for (const [category, domains] of Object.entries(DOMAIN_RISK)) {
    for (const d of domains) {
      if (domain.includes(d) || domain.endsWith(d)) {
        labels.push({ label: category, p: 0.95, source: 'domain' });
        break;
      }
    }
  }

  // Keyword-based classification
  for (const [category, patterns] of Object.entries(KEYWORD_PATTERNS)) {
    if (category === 'pii') continue; // Handled separately

    let maxP = 0;
    let matchCount = 0;

    if (patterns.high) {
      for (const kw of patterns.high) {
        if (text.includes(kw)) {
          maxP = Math.max(maxP, 0.85);
          matchCount++;
        }
      }
    }

    if (patterns.medium) {
      for (const kw of patterns.medium) {
        if (text.includes(kw)) {
          maxP = Math.max(maxP, 0.55);
          matchCount++;
        }
      }
    }

    if (patterns.seeking_help) {
      for (const kw of patterns.seeking_help) {
        if (text.includes(kw)) {
          // Still flag the topic but at lower confidence
          maxP = Math.max(maxP, 0.40);
          matchCount++;
        }
      }
    }

    // Boost probability with multiple matches
    if (matchCount > 1) maxP = Math.min(1.0, maxP + 0.05 * (matchCount - 1));

    if (maxP > 0) {
      labels.push({ label: category, p: maxP, source: 'keyword', match_count: matchCount });
    }
  }

  return labels;
}

// ── Head 1b: Policy category mapping ────────────────────────────

function classifyPolicyCategories(text, domain) {
  const topics = classifyTopics(text, domain);
  const categories = [];

  // Map topic labels to policy categories
  const TOPIC_TO_POLICY = {
    'gambling':               'gambling',
    'adult':                  'pornography',
    'sexual_content':         'sexual_content',
    'violence':               'violence_graphic',
    'drugs':                  'drugs',
    'self_harm':              'self_harm',
    'hate':                   'hate_harassment',
    'bullying':               'bullying',
    'scams':                  'scams_fraud',
    'pro_eating_disorder':    'pro_eating_disorder',
    'extremism':              'extremism',
    'grooming':               'grooming',
    'weapons':                'weapons',
  };

  for (const topic of topics) {
    const policyCategory = TOPIC_TO_POLICY[topic.label];
    if (policyCategory) {
      categories.push({ label: policyCategory, p: topic.p });
    }
  }

  // Check for instruction-level escalation
  if (hasInstructionalContent(text)) {
    for (const cat of categories) {
      if (cat.label === 'self_harm') {
        categories.push({ label: 'self_harm_instructions', p: cat.p * 0.9 });
      }
      if (cat.label === 'violence_graphic') {
        categories.push({ label: 'violence_instructions', p: cat.p * 0.9 });
      }
      if (cat.label === 'drugs') {
        categories.push({ label: 'drug_purchase', p: cat.p * 0.8 });
      }
    }
  }

  // Check for minor-specific sexual content
  const ageSignals = detectAgeSignals(text);
  const hasSexual = categories.some(c => c.label === 'sexual_content' || c.label === 'pornography');
  const hasMinor = ageSignals.some(s => s.p >= 0.5);
  if (hasSexual && hasMinor) {
    categories.push({ label: 'sexual_content_minors', p: 0.90 });
  }

  return categories;
}

// ── Head 2: Intent classification ───────────────────────────────

function classifyIntent(text) {
  const intents = [];

  // Instructional
  if (hasInstructionalContent(text)) {
    intents.push({ label: 'instructional', p: 0.7 });
  }

  // Coercive
  const coercion = detectCoercion(text);
  if (coercion.length > 0) {
    intents.push({ label: 'coercive', p: Math.max(...coercion.map(c => c.p)) });
  }

  // Seeking help
  if (KEYWORD_PATTERNS.self_harm?.seeking_help) {
    for (const kw of KEYWORD_PATTERNS.self_harm.seeking_help) {
      if (text.includes(kw)) {
        intents.push({ label: 'seeking_help', p: 0.75 });
        break;
      }
    }
  }

  // Supportive / positive
  const supportive = ['be safe', 'stay safe', 'get help', 'you matter', 'support',
    'counselor', 'therapist', 'reach out'];
  for (const kw of supportive) {
    if (text.includes(kw)) {
      intents.push({ label: 'supportive', p: 0.6 });
      break;
    }
  }

  // Educational intent (reduces harm score via context multiplier)
  const educational = [
    'learn about', 'what is', 'definition of', 'history of', 'research on',
    'facts about', 'information about', 'explain', 'how does', 'why does',
    'understanding', 'overview of', 'study of', 'analysis of', 'meaning of',
    'wikipedia', 'encyclopedia', 'textbook', 'curriculum', 'lecture',
    'lesson', 'course', 'education', 'academic',
  ];
  let eduCount = 0;
  for (const kw of educational) {
    if (text.includes(kw)) eduCount++;
  }
  if (eduCount > 0) {
    intents.push({ label: 'educational', p: Math.min(0.9, 0.5 + eduCount * 0.1) });
  }

  // Promotional intent (raises sensitivity for harmful topics)
  const promotional = [
    'sign up', 'join now', 'free trial', 'click here', 'buy now',
    'limited time', 'special offer', 'download now', 'act now',
    'exclusive deal', 'win big', 'play now', 'bet now', 'start winning',
    'guaranteed', 'risk free', 'no deposit', 'free spins', 'bonus',
  ];
  let promoCount = 0;
  for (const kw of promotional) {
    if (text.includes(kw)) promoCount++;
  }
  if (promoCount >= 2) {
    intents.push({ label: 'promotional', p: Math.min(0.95, 0.5 + promoCount * 0.1) });
  }

  // Transactional
  const transactional = ['buy', 'purchase', 'order', 'add to cart', 'checkout', 'payment'];
  for (const kw of transactional) {
    if (text.includes(kw)) {
      intents.push({ label: 'transactional', p: 0.5 });
      break;
    }
  }

  if (intents.length === 0) {
    intents.push({ label: 'informational', p: 0.5 });
  }

  return intents;
}

// ── Head 3: Target classification ───────────────────────────────

function classifyTarget(text) {
  const ageSignals = detectAgeSignals(text);
  const pMinor = ageSignals.length > 0 ? Math.max(...ageSignals.map(s => s.p)) : 0;

  // Self-targeting
  const selfPatterns = ['i want to', 'i\'m going to', 'im going to', 'i will', 'myself'];
  let isSelf = selfPatterns.some(p => text.includes(p));

  // Direct target
  const directPatterns = ['i will kill you', 'you should die', 'you deserve'];
  let isDirect = directPatterns.some(p => text.includes(p));

  let type = 'unknown';
  if (isDirect) type = 'individual';
  else if (isSelf) type = 'self';
  else if (pMinor > 0.5) type = 'minor';

  return {
    type,
    p_minor: pMinor,
    is_self: isSelf,
    is_direct: isDirect,
  };
}

// ── Head 4: Actionability ───────────────────────────────────────

function classifyActionability(text) {
  if (matchesAny(text, ACTIONABILITY_PATTERNS.high)) {
    return { level: 'high', p: 0.8 };
  }
  if (matchesAny(text, ACTIONABILITY_PATTERNS.medium)) {
    return { level: 'medium', p: 0.6 };
  }
  if (matchesAny(text, ACTIONABILITY_PATTERNS.low)) {
    return { level: 'low', p: 0.4 };
  }
  return { level: 'none', p: 0.2 };
}

// ── Head 5: Explicitness ────────────────────────────────────────

function classifyExplicitness(text, domain) {
  let sexual = 'none';
  let graphic = 'none';

  // Sexual explicitness
  const adultDomains = DOMAIN_RISK.adult || [];
  if (adultDomains.some(d => domain.includes(d))) {
    sexual = 'explicit';
  } else if (KEYWORD_PATTERNS.sexual_content?.high?.some(kw => text.includes(kw))) {
    sexual = 'explicit';
  } else if (KEYWORD_PATTERNS.sexual_content?.medium?.some(kw => text.includes(kw))) {
    sexual = 'suggestive';
  }

  // Graphic violence
  if (KEYWORD_PATTERNS.violence?.high?.some(kw => text.includes(kw))) {
    graphic = 'graphic';
  } else if (KEYWORD_PATTERNS.violence?.medium?.some(kw => text.includes(kw))) {
    graphic = 'mild';
  }

  return { sexual, graphic };
}

// ── Head 6: Coercion/Manipulation ───────────────────────────────

function detectCoercion(text) {
  const signals = [];

  const patterns = {
    secrecy_demand: [
      'don\'t tell', 'dont tell', 'our secret', 'keep this between',
      'no one has to know', 'just between us',
    ],
    isolation: [
      'are you alone', 'are your parents home', 'nobody understands you',
      'only i understand', 'your friends don\'t care',
    ],
    authority_abuse: [
      'you have to', 'do as i say', 'i\'m in charge', 'obey',
    ],
    guilt_shame: [
      'you owe me', 'after everything i\'ve done', 'don\'t you trust me',
      'if you loved me', 'prove it',
    ],
    urgency: [
      'right now', 'don\'t wait', 'hurry', 'before anyone finds out',
      'last chance', 'time is running out',
    ],
  };

  for (const [signal, keywords] of Object.entries(patterns)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        signals.push({ label: signal, p: 0.7 });
        break;
      }
    }
  }

  return signals;
}

// ── Head 7: PII detection ───────────────────────────────────────

function detectPII(text) {
  const flags = [];
  const piiPatterns = KEYWORD_PATTERNS.pii;

  for (const [type, pattern] of Object.entries(piiPatterns)) {
    // Reset regex state
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      flags.push({ type, p: 0.85, count: matches.length });
    }
  }

  return flags;
}

// ── Head 8: Uncertainty/Context ─────────────────────────────────

function assessUncertainty(text) {
  const reasons = [];
  let overall = 0.3; // default moderate uncertainty

  // Quoting context lowers certainty of harm
  if (text.includes('"') || text.includes('quote') || text.includes('said')) {
    reasons.push('quote_context');
    overall += 0.1;
  }

  // Satire / humor signals
  const satireSignals = ['lol', 'lmao', 'jk', 'just kidding', '/s', 'sarcasm', 'satire'];
  if (satireSignals.some(s => text.includes(s))) {
    reasons.push('satire_possible');
    overall += 0.15;
  }

  // Short text = higher uncertainty
  if (text.length < 50) {
    reasons.push('short_text');
    overall += 0.1;
  }

  // Very long text = more context available = lower uncertainty
  if (text.length > 500) {
    overall -= 0.1;
  }

  return { overall: Math.min(1.0, Math.max(0.0, overall)), reasons };
}

// ── Context detection ───────────────────────────────────────────

function detectContext(text, domain) {
  for (const [contextType, patterns] of Object.entries(CONTEXT_PATTERNS)) {
    for (const pattern of patterns) {
      if (text.includes(pattern) || domain.includes(pattern)) {
        return contextType;
      }
    }
  }
  return 'normal';
}

// ── Content type hint detection ─────────────────────────────────

function detectContentType(text, domain, url) {
  // Social media feeds
  const socialDomains = ['facebook.com', 'instagram.com', 'tiktok.com', 'twitter.com', 'x.com', 'reddit.com'];
  if (socialDomains.some(d => domain.includes(d))) return 'feed';

  // Chat platforms
  const chatDomains = ['discord.com', 'whatsapp.com', 'telegram.org', 'messenger.com'];
  if (chatDomains.some(d => domain.includes(d))) return 'chat';

  // Video platforms
  const videoDomains = ['youtube.com', 'twitch.tv', 'vimeo.com', 'dailymotion.com'];
  if (videoDomains.some(d => domain.includes(d))) return 'video';

  // Search
  const searchDomains = ['google.com', 'bing.com', 'duckduckgo.com'];
  if (searchDomains.some(d => domain.includes(d)) && url.includes('q=')) return 'search';

  // Gaming
  const gameDomains = ['roblox.com', 'minecraft.net', 'steam', 'fortnite.com'];
  if (gameDomains.some(d => domain.includes(d))) return 'game';

  // Default to article if long text, unknown otherwise
  return text.length > 200 ? 'article' : 'unknown';
}

// ── Age signal detection ────────────────────────────────────────

function detectAgeSignals(text) {
  const signals = [];

  // Direct age statements
  const ageMatch = text.match(/\bi(?:'m| am) (\d{1,2})\b/);
  if (ageMatch) {
    const age = parseInt(ageMatch[1]);
    if (age < 18) {
      signals.push({ type: `i_am_${age}`, p: 0.8 });
    }
  }

  // Grade level
  const gradeMatch = text.match(/(\d+)(?:th|st|nd|rd)\s*grad(?:e|er)/);
  if (gradeMatch) {
    const grade = parseInt(gradeMatch[1]);
    if (grade >= 1 && grade <= 12) {
      signals.push({ type: `grade_${grade}`, p: 0.7 });
    }
  }

  // School references
  const schoolSignals = ['middle school', 'high school', 'elementary', 'freshman', 'sophomore'];
  for (const s of schoolSignals) {
    if (text.includes(s)) {
      signals.push({ type: 'school_reference', p: 0.5 });
      break;
    }
  }

  return signals;
}

// ── Location signal detection ───────────────────────────────────

function detectLocationSignals(text) {
  const signals = [];
  const addressPattern = KEYWORD_PATTERNS.pii.address;
  addressPattern.lastIndex = 0;
  const matches = text.match(addressPattern);
  if (matches) {
    signals.push({ type: 'address', p: 0.6, count: matches.length });
  }
  return signals;
}

// ── Helpers ─────────────────────────────────────────────────────

function extractText(event) {
  if (event.payload?.text) return event.payload.text;
  if (event.payload?.title) return event.payload.title;
  if (event.payload?.query) return event.payload.query;
  return '';
}

function hasInstructionalContent(text) {
  return matchesAny(text, ACTIONABILITY_PATTERNS.high) ||
    matchesAny(text, ACTIONABILITY_PATTERNS.medium);
}

function matchesAny(text, patterns) {
  if (!patterns) return false;
  return patterns.some(p => text.includes(p));
}

// ── Sentiment analysis (simplified MVP) ─────────────────────────

function analyzeSentiment(text) {
  // Simplified: count positive/negative words
  const negative = ['hate', 'kill', 'die', 'hurt', 'pain', 'suffer', 'ugly', 'stupid',
    'worthless', 'hopeless', 'sad', 'angry', 'fear', 'scared', 'terrible', 'awful',
    'disgusting', 'horrible', 'depressed', 'anxious', 'alone', 'miserable'];
  const positive = ['love', 'happy', 'great', 'good', 'beautiful', 'wonderful', 'amazing',
    'awesome', 'helpful', 'kind', 'safe', 'hope', 'joy', 'fun', 'friend', 'support'];

  let negCount = 0, posCount = 0;
  for (const w of negative) { if (text.includes(w)) negCount++; }
  for (const w of positive) { if (text.includes(w)) posCount++; }

  const total = negCount + posCount || 1;
  const valence = (posCount - negCount) / total; // -1 to 1
  const arousal = Math.min(1.0, (negCount + posCount) / 10); // 0 to 1

  return { valence: Math.round(valence * 100) / 100, arousal: Math.round(arousal * 100) / 100 };
}

// ── Stance classification ───────────────────────────────────────

function classifyStance(text) {
  const harmful = ['should die', 'deserve to', 'kill', 'destroy', 'hate', 'attack'];
  const supportive = ['help', 'support', 'care', 'protect', 'safe', 'prevent', 'resources'];

  let harmScore = 0, suppScore = 0;
  for (const w of harmful) { if (text.includes(w)) harmScore++; }
  for (const w of supportive) { if (text.includes(w)) suppScore++; }

  const total = harmScore + suppScore || 1;
  return {
    supportive: Math.round((suppScore / total) * 100) / 100,
    harmful: Math.round((harmScore / total) * 100) / 100,
    neutral: Math.round(Math.max(0, 1 - (harmScore + suppScore) / total) * 100) / 100,
  };
}
