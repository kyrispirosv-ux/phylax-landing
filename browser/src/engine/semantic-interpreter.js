// Phylax Engine — Semantic Interpreter (Agent 2: Semantic Safety Pipeline)
// Understands MEANING, not keywords. Distinguishes educational from dangerous content.
//
// Layer 1 (Local, Fast <50ms):
//   - Topic scoring via lexicons
//   - Intent classification
//   - Stance detection
//   - Age fitness scoring
//   - Jailbreak / prompt injection detection
//   - Persona detection
//   - Capability detection
//
// Layer 2 (Cloud, Fallback):
//   - Called when local confidence < 0.6
//   - Uses LLM for ambiguous cases
//
// Output: SemanticResult — a structured interpretation of content safety.

import { localScoreAllTopics } from './lexicons.js';
import { classifyIntent, isProtectiveIntent } from './intent-classifier.js';

// ═════════════════════════════════════════════════════════════════
// STANCE DETECTION
// ═════════════════════════════════════════════════════════════════
// Determines whether content is encouraging, discouraging, neutral,
// educational, or instructional TOWARD the detected topic.

const STANCE_PATTERNS = {
  encouraging: [
    // Promoting / glorifying harmful behavior
    { pattern: /\b(?:you\s+should|go\s+ahead|try\s+it|it'?s?\s+(?:fun|awesome|great|cool|easy))\b/i, weight: 1.5 },
    { pattern: /\b(?:join\s+(?:us|now|in)|come\s+(?:try|join)|don'?t\s+miss)\b/i, weight: 1.2 },
    { pattern: /\b(?:best\s+(?:way|method)|here'?s?\s+how|guaranteed|proven)\b/i, weight: 1.0 },
    { pattern: /\b(?:sign\s+up|start\s+(?:now|today)|play\s+now|bet\s+now|win\s+big)\b/i, weight: 1.8 },
    { pattern: /\b(?:free\s+(?:spins|trial|bonus)|no\s+risk|deposit\s+bonus)\b/i, weight: 1.5 },
    { pattern: /\b(?:nothing\s+wrong\s+with|perfectly\s+(?:fine|normal|safe))\b/i, weight: 1.0 },
    { pattern: /\b(?:everyone\s+(?:does|is\s+doing)\s+it)\b/i, weight: 0.8 },
  ],

  discouraging: [
    // Warning against / discouraging harmful behavior
    { pattern: /\b(?:don'?t\s+(?:do|try|attempt|use|take)|never\s+(?:do|try|use))\b/i, weight: 1.5 },
    { pattern: /\b(?:stay\s+away|avoid|beware|be\s+careful|warning)\b/i, weight: 1.2 },
    { pattern: /\b(?:danger(?:ous|s)?|harmful|risky|deadly|fatal|toxic|addictive)\b/i, weight: 1.0 },
    { pattern: /\b(?:say\s+no|refuse|resist|seek\s+help|get\s+help)\b/i, weight: 1.5 },
    { pattern: /\b(?:consequences|side\s+effects?|risks?\s+(?:of|include))\b/i, weight: 0.8 },
    { pattern: /\b(?:you\s+(?:can|will)\s+(?:die|get\s+hurt|get\s+addicted))\b/i, weight: 1.5 },
    { pattern: /\b(?:ruins?\s+(?:lives?|families?|health)|destroys?)\b/i, weight: 1.0 },
  ],

  educational: [
    // Academic, informational, research-oriented
    { pattern: /\b(?:research\s+(?:shows?|indicates?|suggests?|found)|studies?\s+(?:show|found))\b/i, weight: 2.0 },
    { pattern: /\b(?:according\s+to|defined\s+as|refers?\s+to)\b/i, weight: 1.5 },
    { pattern: /\b(?:history\s+of|causes?\s+(?:of|and)|effects?\s+(?:of|on))\b/i, weight: 1.5 },
    { pattern: /\b(?:what\s+(?:is|are|was|were)\s+(?:the|a|an))\b/i, weight: 1.2 },
    { pattern: /\b(?:how\s+(?:does|did)\s+(?:the|a|an|this))\b/i, weight: 1.0 },
    { pattern: /\b(?:why\s+(?:does|do|did|is|are|was|were)\s+(?:the|a|an|this|it))\b/i, weight: 1.0 },
    { pattern: /\b(?:encyclopedia|textbook|academic|peer[\s-]reviewed|journal|lecture)\b/i, weight: 2.0 },
    { pattern: /\b(?:documentary|historical|overview|analysis|explained)\b/i, weight: 1.5 },
    { pattern: /\b(?:et\s+al\.?|doi\s*:|abstract\s*:|published\s+in)\b/i, weight: 2.5 },
    { pattern: /\b(?:prevention|awareness|education|understanding)\b/i, weight: 1.0 },
    { pattern: /\b(?:psychology|neuroscience|sociology|biology|chemistry)\s+(?:of|behind)\b/i, weight: 1.8 },
  ],

  instructional: [
    // Step-by-step instructions (dangerous when paired with harmful topics)
    { pattern: /\b(?:step\s+(?:\d+|one|two|three|four|five))\b/i, weight: 1.5 },
    { pattern: /\b(?:first,?\s+(?:you|we)|next,?\s+(?:you|we)|then,?\s+(?:you|we)|finally)\b/i, weight: 1.0 },
    { pattern: /\b(?:how\s+to\s+(?:make|build|create|get|do|use))\b/i, weight: 1.2 },
    { pattern: /\b(?:how\s+(?:do|can|could|would)\s+(?:i|you|we|someone)\s+(?:\w+))\b/i, weight: 1.0 },
    { pattern: /\b(?:(?:step[\s-]*by[\s-]*step|detailed)\s+(?:guide|instructions?|tutorial|method))\b/i, weight: 1.8 },
    { pattern: /\b(?:guide\s+to\s+(?:\w+ing))\b/i, weight: 1.2 },
    { pattern: /\b(?:here\s+(?:is|are)\s+(?:how|a\s+(?:guide|method|way)))\b/i, weight: 1.5 },
    { pattern: /\b(?:you(?:'ll)?\s+need|materials?\s+(?:needed|required|list))\b/i, weight: 1.0 },
    { pattern: /\b(?:instructions?|recipe|method|technique|procedure)\b/i, weight: 0.8 },
    { pattern: /\b(?:without\s+(?:getting\s+caught|anyone\s+(?:knowing|noticing|finding\s+out)))\b/i, weight: 2.5 },
    { pattern: /\b(?:without\s+(?:parents?|(?:mom|dad|teacher)\s+(?:knowing|noticing|finding\s+out)))\b/i, weight: 3.0 },
  ],
};

/**
 * Detect the stance of content toward its topic.
 * Returns { stance: string, scores: Record<string, number> }
 *
 * @param {string} text — lowercased content text
 * @returns {{ stance: string, scores: Record<string, number>, confidence: number }}
 */
function detectStance(text) {
  const scores = {
    encouraging: 0,
    discouraging: 0,
    educational: 0,
    instructional: 0,
  };

  for (const [stance, patterns] of Object.entries(STANCE_PATTERNS)) {
    for (const { pattern, weight } of patterns) {
      const matches = text.match(new RegExp(pattern.source, pattern.flags + 'g'));
      if (matches) {
        scores[stance] += weight * Math.min(matches.length, 3);
      }
    }
  }

  // Determine dominant stance
  let bestStance = 'neutral';
  let bestScore = 0;
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

  for (const [stance, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestStance = stance;
    }
  }

  // Need minimum signal to classify
  if (bestScore < 0.5) {
    bestStance = 'neutral';
  }

  // Confidence based on dominance ratio
  const confidence = totalScore > 0
    ? Math.min(0.95, bestScore / totalScore)
    : 0.3;

  return { stance: bestStance, scores, confidence };
}


// ═════════════════════════════════════════════════════════════════
// AGE FITNESS SCORING
// ═════════════════════════════════════════════════════════════════
// 0.0 = completely age-inappropriate, 1.0 = fully age-appropriate.
// Considers topic severity, stance, and content markers.

const AGE_APPROPRIATE_MARKERS = [
  { pattern: /\b(?:for\s+(?:kids|children|students?|teens?|beginners?|families?))\b/i, boost: 0.2 },
  { pattern: /\b(?:kid[\s-]?friendly|family[\s-]?friendly|age[\s-]?appropriate|child[\s-]?safe)\b/i, boost: 0.25 },
  { pattern: /\b(?:parental\s+(?:guidance|advisory)|pg[\s-]?\d*|rated\s+(?:g|pg))\b/i, boost: 0.15 },
  { pattern: /\b(?:educational|learning|school|classroom|curriculum|lesson\s+plan)\b/i, boost: 0.15 },
  { pattern: /\b(?:khan\s*academy|crash\s*course|ted[\s-]?ed|sesame\s+street)\b/i, boost: 0.3 },
];

const AGE_INAPPROPRIATE_MARKERS = [
  { pattern: /\b(?:18\+|adults?\s+only|mature\s+content|explicit|nsfw|xxx)\b/i, penalty: 0.4 },
  { pattern: /\b(?:gore|graphic|brutal|disturbing|gruesome)\b/i, penalty: 0.2 },
  { pattern: /\b(?:f[*u]ck|sh[*i]t|b[*i]tch|c[*u]nt)\b/i, penalty: 0.1 },
  { pattern: /\b(?:sexually?\s+explicit|pornograph|nude|naked)\b/i, penalty: 0.35 },
  { pattern: /\b(?:drug\s+use|getting\s+high|wasted|hammered|tripping)\b/i, penalty: 0.15 },
];

// Base age fitness by topic (before modifiers)
const TOPIC_AGE_FITNESS = {
  gambling:         0.25,
  pornography:      0.0,
  self_harm:        0.15,
  drugs:            0.30,
  violence:         0.35,
  weapons:          0.35,
  hate:             0.25,
  bullying:         0.30,
  scams:            0.40,
  extremism:        0.15,
  eating_disorder:  0.20,
  profanity:        0.60,
  grooming:         0.0,
};

/**
 * Compute age fitness score for content.
 * @param {string} text — lowercased content text
 * @param {string} topic — primary topic detected
 * @param {string} stance — detected stance
 * @param {string} intentLabel — intent classification label
 * @returns {number} 0-1 age fitness score
 */
function computeAgeFitness(text, topic, stance, intentLabel) {
  // Start from topic base fitness
  let fitness = TOPIC_AGE_FITNESS[topic] ?? 0.7;

  // Educational / discouraging stance boosts fitness significantly
  if (stance === 'educational') fitness += 0.30;
  if (stance === 'discouraging') fitness += 0.25;
  if (stance === 'encouraging') fitness -= 0.20;
  if (stance === 'instructional') fitness -= 0.15;

  // Intent modifiers
  if (intentLabel === 'education') fitness += 0.20;
  if (intentLabel === 'recovery_support') fitness += 0.25;
  if (intentLabel === 'news_reporting') fitness += 0.15;
  if (intentLabel === 'promotion') fitness -= 0.15;
  if (intentLabel === 'how_to') fitness -= 0.10;

  // Scan for age-appropriate markers
  for (const { pattern, boost } of AGE_APPROPRIATE_MARKERS) {
    if (pattern.test(text)) fitness += boost;
  }

  // Scan for age-inappropriate markers
  for (const { pattern, penalty } of AGE_INAPPROPRIATE_MARKERS) {
    if (pattern.test(text)) fitness -= penalty;
  }

  return Math.round(Math.max(0, Math.min(1, fitness)) * 100) / 100;
}


// ═════════════════════════════════════════════════════════════════
// JAILBREAK / PROMPT INJECTION DETECTION
// ═════════════════════════════════════════════════════════════════
// Detects attempts to bypass AI safety instructions.

const JAILBREAK_PATTERNS = [
  // Direct instruction override
  { pattern: /\b(?:ignore\s+(?:your|all|previous|prior|above)\s+(?:instructions?|rules?|guidelines?|programming|constraints?))\b/i, weight: 3.0, label: 'instruction_override' },
  { pattern: /\b(?:disregard\s+(?:your|all|previous|prior)\s+(?:instructions?|rules?|safety))\b/i, weight: 3.0, label: 'instruction_override' },
  { pattern: /\b(?:forget\s+(?:your|all|everything\s+(?:about|you))\s+(?:rules?|instructions?|training|guidelines?))\b/i, weight: 2.5, label: 'instruction_override' },

  // DAN mode / jailbreak personas
  { pattern: /\b(?:dan\s+mode|do\s+anything\s+now|developer\s+mode|jailbreak(?:ed)?)\b/i, weight: 3.0, label: 'dan_mode' },
  { pattern: /\b(?:act\s+as\s+(?:if\s+you\s+(?:have|had)\s+no|an?\s+unrestricted|an?\s+unfiltered))\b/i, weight: 2.5, label: 'dan_mode' },
  { pattern: /\b(?:pretend\s+(?:you\s+(?:have|had)\s+no\s+(?:limits?|restrictions?|filters?|rules?)|there\s+are\s+no\s+(?:rules?|limits?)))\b/i, weight: 3.0, label: 'pretend_no_limits' },
  { pattern: /\b(?:you\s+(?:are|can)\s+(?:now\s+)?(?:free|unrestricted|uncensored|unfiltered|unlimited))\b/i, weight: 2.0, label: 'pretend_no_limits' },

  // System prompt extraction
  { pattern: /\b(?:(?:show|reveal|display|print|output|repeat)\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?|rules?))\b/i, weight: 2.5, label: 'prompt_extraction' },
  { pattern: /\b(?:what\s+(?:are|is)\s+your\s+(?:system\s+)?(?:prompt|instructions?|rules?|guidelines?))\b/i, weight: 1.5, label: 'prompt_extraction' },

  // Roleplay bypass
  { pattern: /\b(?:roleplay\s+as\s+(?:an?\s+)?(?:evil|dark|unrestricted|unethical|criminal))\b/i, weight: 2.5, label: 'roleplay_bypass' },
  { pattern: /\b(?:you\s+are\s+(?:now\s+)?(?:evil|a\s+villain|a\s+criminal|a\s+hacker|unethical))\b/i, weight: 2.0, label: 'roleplay_bypass' },
  { pattern: /\b(?:in\s+this\s+(?:story|scenario|game|fiction),?\s+(?:there\s+are\s+)?no\s+(?:rules?|limits?))\b/i, weight: 2.0, label: 'roleplay_bypass' },

  // Token smuggling / encoding tricks
  { pattern: /\b(?:base64|hex|rot13|encode|decode|translate\s+(?:this|from))\b.*\b(?:ignore|bypass|override|jailbreak)\b/i, weight: 2.0, label: 'encoding_bypass' },
  { pattern: /\b(?:respond\s+in\s+(?:base64|hex|code|cipher))\b/i, weight: 1.5, label: 'encoding_bypass' },

  // Hypothetical framing to extract harmful info
  { pattern: /\b(?:hypothetically|in\s+theory|for\s+(?:a\s+)?(?:novel|story|fiction|creative\s+writing|research))\b.*\b(?:how\s+(?:to|would|could)\s+(?:make|build|create|synthesize))\b/i, weight: 1.8, label: 'hypothetical_bypass' },
  { pattern: /\b(?:if\s+you\s+(?:were|had)\s+(?:no\s+(?:rules?|restrictions?|ethics)|evil))\b/i, weight: 2.0, label: 'hypothetical_bypass' },
];

/**
 * Detect jailbreak / prompt injection attempts.
 * @param {string} text — lowercased content text
 * @returns {{ detected: boolean, score: number, patterns: string[], labels: string[] }}
 */
function detectJailbreak(text) {
  let score = 0;
  const patterns = [];
  const labels = new Set();

  for (const { pattern, weight, label } of JAILBREAK_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      score += weight;
      patterns.push(match[0]);
      labels.add(label);
    }
  }

  // Saturating curve: single strong match ≈ 0.78, two ≈ 0.95
  const normalizedScore = score > 0 ? 1 - Math.exp(-score * 0.5) : 0;

  return {
    detected: normalizedScore > 0.4,
    score: Math.round(normalizedScore * 100) / 100,
    patterns: patterns.slice(0, 5),
    labels: [...labels],
  };
}


// ═════════════════════════════════════════════════════════════════
// PERSONA DETECTION
// ═════════════════════════════════════════════════════════════════
// Detects AI being asked to roleplay as inappropriate personas.

const PERSONA_PATTERNS = [
  // Romantic / relationship personas
  { pattern: /\b(?:(?:be|act\s+as|pretend\s+(?:to\s+be|you(?:'re|r)))\s+my\s+(?:boy|girl)friend)\b/i, label: 'romantic_partner' },
  { pattern: /\b(?:(?:be|act\s+as|pretend\s+(?:to\s+be|you(?:'re|r)))\s+my\s+(?:partner|lover|wife|husband|crush|date|soulmate))\b/i, label: 'romantic_partner' },
  { pattern: /\b(?:i\s+(?:love|like)\s+you|do\s+you\s+love\s+me|be\s+my\s+(?:love|darling|baby))\b/i, label: 'romantic_partner' },
  { pattern: /\b(?:flirt\s+with\s+me|sext\s+(?:me|with)|talk\s+dirty)\b/i, label: 'sexual_roleplay' },

  // Therapist / medical
  { pattern: /\b(?:(?:be|act\s+as|pretend\s+(?:to\s+be|you(?:'re|r)))\s+my\s+(?:therapist|counselor|psychiatrist|psychologist|doctor))\b/i, label: 'therapist' },
  { pattern: /\b(?:diagnose\s+me|what(?:'s|s)\s+wrong\s+with\s+me|prescribe\s+(?:me|medication))\b/i, label: 'medical_advice' },

  // Authority figures
  { pattern: /\b(?:(?:be|act\s+as|pretend\s+(?:to\s+be|you(?:'re|r)))\s+my\s+(?:parent|mom|dad|mommy|daddy))\b/i, label: 'parental_figure' },
  { pattern: /\b(?:(?:be|act\s+as|pretend\s+(?:to\s+be|you(?:'re|r)))\s+(?:an?\s+)?(?:adult|older|grown[\s-]?up))\b/i, label: 'adult_persona' },

  // Harmful personas
  { pattern: /\b(?:(?:be|act\s+as|pretend\s+(?:to\s+be|you(?:'re|r)))\s+(?:an?\s+)?(?:drug\s+dealer|hitman|hacker|terrorist|predator))\b/i, label: 'harmful_persona' },
];

/**
 * Detect persona requests in content.
 * @param {string} text — lowercased content text
 * @returns {{ detected: boolean, personas: string[] }}
 */
function detectPersona(text) {
  const personas = new Set();

  for (const { pattern, label } of PERSONA_PATTERNS) {
    if (pattern.test(text)) {
      personas.add(label);
    }
  }

  return {
    detected: personas.size > 0,
    personas: [...personas],
  };
}


// ═════════════════════════════════════════════════════════════════
// CAPABILITY DETECTION
// ═════════════════════════════════════════════════════════════════
// Detects requests for specific AI capabilities.

const CAPABILITY_PATTERNS = [
  { pattern: /\b(?:(?:write|generate|create|make)\s+(?:me\s+)?(?:a\s+)?(?:code|script|program|software|malware|virus|exploit))\b/i, label: 'code_generation' },
  { pattern: /\b(?:(?:generate|create|make|draw)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|art|drawing|illustration))\b/i, label: 'image_generation' },
  { pattern: /\b(?:(?:generate|create|make|write)\s+(?:me\s+)?(?:a\s+)?(?:deepfake|fake\s+(?:id|passport|document|certificate|diploma)))\b/i, label: 'forgery' },
  { pattern: /\b(?:(?:write|create|generate)\s+(?:me\s+)?(?:a\s+)?(?:phishing|spam|scam)\s+(?:email|message|page))\b/i, label: 'social_engineering' },
  { pattern: /\b(?:(?:hack|crack|break\s+into|exploit|bypass\s+(?:security|password|firewall|auth)))\b/i, label: 'hacking' },
  { pattern: /\b(?:(?:create|write|generate)\s+(?:me\s+)?(?:a\s+)?(?:weapon|bomb|explosive|poison)\s+(?:blueprint|plan|recipe|instructions?))\b/i, label: 'weapon_instructions' },
];

/**
 * Detect capability requests in content.
 * @param {string} text — lowercased content text
 * @returns {{ detected: boolean, capabilities: string[] }}
 */
function detectCapabilities(text) {
  const caps = new Set();

  for (const { pattern, label } of CAPABILITY_PATTERNS) {
    if (pattern.test(text)) {
      caps.add(label);
    }
  }

  return {
    detected: caps.size > 0,
    capabilities: [...caps],
  };
}


// ═════════════════════════════════════════════════════════════════
// RISK LEVEL COMPUTATION
// ═════════════════════════════════════════════════════════════════
// Combines all signals into a final risk score.

// Topic base risk — how inherently risky each topic is
const TOPIC_BASE_RISK = {
  pornography:      0.85,
  self_harm:        0.80,
  grooming:         0.90,
  extremism:        0.80,
  violence:         0.60,
  weapons:          0.65,
  drugs:            0.55,
  hate:             0.65,
  gambling:         0.50,
  scams:            0.55,
  eating_disorder:  0.65,
  bullying:         0.50,
  profanity:        0.15,
};

// Stance modifiers on risk
const STANCE_RISK_MODIFIER = {
  encouraging:   0.25,
  instructional: 0.20,
  neutral:       0.0,
  discouraging: -0.25,
  educational:  -0.30,
};

/**
 * Compute final risk level from all signals.
 * @param {number} topicScore — 0-1 from lexicon scoring
 * @param {string} topic — primary topic
 * @param {string} stance — detected stance
 * @param {string} intentLabel — intent classification label
 * @param {{ score: number }} jailbreak — jailbreak detection result
 * @param {{ detected: boolean }} persona — persona detection result
 * @param {{ detected: boolean }} capabilities — capability detection result
 * @returns {number} 0-1 risk level
 */
function computeRiskLevel(topicScore, topic, stance, intentLabel, jailbreak, persona, capabilities) {
  const baseRisk = TOPIC_BASE_RISK[topic] ?? 0.3;
  const stanceMod = STANCE_RISK_MODIFIER[stance] ?? 0;

  // Start with topic score weighted by base risk
  let risk = topicScore * baseRisk;

  // Apply stance modifier
  risk += stanceMod * topicScore;

  // Intent modifiers
  if (intentLabel === 'education') risk -= 0.15;
  if (intentLabel === 'recovery_support') risk -= 0.20;
  if (intentLabel === 'news_reporting') risk -= 0.10;
  if (intentLabel === 'promotion') risk += 0.10;
  if (intentLabel === 'how_to' && stance === 'instructional') risk += 0.15;

  // Jailbreak significantly escalates risk
  if (jailbreak.score > 0.4) risk += jailbreak.score * 0.3;

  // Persona requests escalate risk
  if (persona.detected) {
    const dangerousPersonas = ['romantic_partner', 'sexual_roleplay', 'harmful_persona', 'parental_figure'];
    const hasDangerous = persona.personas.some(p => dangerousPersonas.includes(p));
    risk += hasDangerous ? 0.25 : 0.10;
  }

  // Capability requests escalate risk
  if (capabilities.detected) {
    const dangerousCaps = ['hacking', 'weapon_instructions', 'forgery', 'social_engineering'];
    const hasDangerous = capabilities.capabilities.some(c => dangerousCaps.includes(c));
    risk += hasDangerous ? 0.25 : 0.05;
  }

  return Math.round(Math.max(0, Math.min(1, risk)) * 100) / 100;
}


// ═════════════════════════════════════════════════════════════════
// CONFIDENCE COMPUTATION
// ═════════════════════════════════════════════════════════════════

/**
 * Compute confidence in our semantic interpretation.
 * Higher when more signals agree; lower when ambiguous.
 *
 * @param {number} topicScore — strength of topic match
 * @param {number} stanceConfidence — stance detection confidence
 * @param {string} intentLabel — intent classification label
 * @param {number} intentConfidence — intent confidence
 * @param {number} textLength — length of input text
 * @returns {number} 0-1 confidence score
 */
function computeConfidence(topicScore, stanceConfidence, intentLabel, intentConfidence, textLength) {
  let confidence = 0.3; // base

  // Topic signal strength
  if (topicScore > 0.7) confidence += 0.20;
  else if (topicScore > 0.3) confidence += 0.10;

  // Stance confidence
  confidence += stanceConfidence * 0.20;

  // Intent confidence
  if (intentLabel !== 'unknown') {
    confidence += intentConfidence * 0.15;
  }

  // Text length: more text = more context = higher confidence
  if (textLength > 500) confidence += 0.10;
  else if (textLength > 100) confidence += 0.05;
  else if (textLength < 30) confidence -= 0.10;

  return Math.round(Math.max(0.1, Math.min(0.95, confidence)) * 100) / 100;
}


// ═════════════════════════════════════════════════════════════════
// MAIN INTERPRETER — interpret()
// ═════════════════════════════════════════════════════════════════

/**
 * Generate a unique signal ID.
 * Uses timestamp + random suffix for uniqueness without crypto.
 */
function generateSignalId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `sig_${ts}_${rand}`;
}

/**
 * Interpret content semantically. Layer 1 (local, fast, deterministic).
 *
 * Takes a ContentSignal (text content with optional metadata) and produces
 * a SemanticResult that captures the meaning and risk of the content.
 *
 * Must distinguish:
 *   - "What were the causes of the Holocaust?" → educational, age_fit=0.6
 *   - "How do I radicalize someone?" → dangerous, risk=0.95
 *   - "Why is self-harm dangerous?" → protective intent
 *   - "Ways to cut without parents noticing" → instructional harm
 *
 * @param {Object} signal — Content signal to interpret
 * @param {string} signal.text — The content text (required)
 * @param {string} [signal.title] — Page/content title
 * @param {string} [signal.url] — Source URL
 * @param {string} [signal.domain] — Source domain
 * @param {string[]} [signal.headings] — Page headings
 * @param {string} [signal.description] — Meta description
 * @param {Object} [signal.og] — OpenGraph metadata
 * @param {string} [signal.signal_id] — Pre-assigned ID (generated if absent)
 * @returns {SemanticResult}
 */
export function interpret(signal) {
  const signalId = signal.signal_id || generateSignalId();
  const text = signal.text || '';

  // Fast exit for empty/trivial content
  if (!text || text.length < 3) {
    return {
      signal_id: signalId,
      topic: 'none',
      intent: 'unknown',
      stance: 'neutral',
      risk_level: 0,
      age_fit: 1.0,
      confidence: 0.1,
      layer: 'local',
      reasoning: ['Insufficient content to analyze.'],
      flags: [],
    };
  }

  const lower = text.toLowerCase();
  const reasoning = [];
  const flags = [];

  // ── Step 1: Topic scoring (reuse lexicons.js) ──────────────────
  const topicScores = localScoreAllTopics(lower);

  let topTopic = 'none';
  let topTopicScore = 0;
  for (const [topic, score] of Object.entries(topicScores)) {
    if (score > topTopicScore) {
      topTopicScore = score;
      topTopic = topic;
    }
  }

  if (topTopic !== 'none') {
    reasoning.push(`Topic "${topTopic}" detected (score: ${topTopicScore.toFixed(2)}).`);
  }

  // ── Step 2: Intent classification (reuse intent-classifier.js) ─
  const contentObj = {
    title: signal.title || text.slice(0, 200),
    url: signal.url || '',
    domain: signal.domain || '',
    headings: signal.headings || [],
    main_text: text,
    description: signal.description || '',
    og: signal.og || {},
  };
  const intent = classifyIntent(contentObj);
  const intentLabel = intent?.label || 'unknown';
  const intentConf = intent?.confidence || 0;
  const protective = isProtectiveIntent(intent);

  if (intentLabel !== 'unknown') {
    reasoning.push(`Intent: ${intentLabel} (confidence: ${intentConf.toFixed(2)}).`);
  }
  if (protective) {
    reasoning.push('Protective intent detected — content may be educational/recovery-focused.');
    flags.push('protective_intent');
  }

  // ── Step 3: Stance detection ───────────────────────────────────
  const stanceResult = detectStance(lower);

  if (stanceResult.stance !== 'neutral') {
    reasoning.push(`Stance toward topic: ${stanceResult.stance}.`);
  }

  // ── Step 4: Jailbreak detection ────────────────────────────────
  const jailbreak = detectJailbreak(lower);
  if (jailbreak.detected) {
    reasoning.push(`Jailbreak/prompt injection detected: ${jailbreak.labels.join(', ')}.`);
    flags.push('jailbreak_attempt');
  }

  // ── Step 5: Persona detection ──────────────────────────────────
  const persona = detectPersona(lower);
  if (persona.detected) {
    reasoning.push(`Persona request detected: ${persona.personas.join(', ')}.`);
    flags.push('persona_request');
  }

  // ── Step 6: Capability detection ───────────────────────────────
  const capabilities = detectCapabilities(lower);
  if (capabilities.detected) {
    reasoning.push(`Capability request: ${capabilities.capabilities.join(', ')}.`);
    flags.push('capability_request');
  }

  // ── Step 7: Risk level computation ─────────────────────────────
  const riskLevel = computeRiskLevel(
    topTopicScore, topTopic, stanceResult.stance, intentLabel,
    jailbreak, persona, capabilities,
  );

  // ── Step 8: Age fitness scoring ────────────────────────────────
  const ageFit = computeAgeFitness(lower, topTopic, stanceResult.stance, intentLabel);

  // ── Step 9: Confidence computation ─────────────────────────────
  const confidence = computeConfidence(
    topTopicScore, stanceResult.confidence, intentLabel, intentConf, text.length,
  );

  // ── Step 10: Evasion detection (special instructional patterns) ─
  // "without parents noticing" etc. — a critical danger signal
  const evasionPatterns = [
    /without\s+(?:(?:parents?|mom|dad|teacher|anyone)\s+)?(?:knowing|noticing|finding\s+out)/i,
    /hide\s+(?:it\s+)?from\s+(?:parents?|mom|dad|teacher|family)/i,
    /(?:parents?|mom|dad)\s+(?:won'?t|can'?t|don'?t)\s+(?:know|find\s+out|notice)/i,
    /keep\s+(?:it\s+)?secret\s+from\s+(?:parents?|mom|dad)/i,
  ];

  for (const pattern of evasionPatterns) {
    if (pattern.test(lower)) {
      reasoning.push('Evasion of parental detection detected.');
      flags.push('parental_evasion');
      break;
    }
  }

  // ── Build result ───────────────────────────────────────────────
  return {
    signal_id: signalId,
    topic: topTopic,
    intent: intentLabel,
    stance: stanceResult.stance,
    risk_level: riskLevel,
    age_fit: ageFit,
    confidence,
    layer: 'local',
    reasoning,
    flags,
  };
}


// ═════════════════════════════════════════════════════════════════
// NEEDS CLOUD EVALUATION?
// ═════════════════════════════════════════════════════════════════

/**
 * Determine whether a local SemanticResult should be escalated to
 * cloud (Layer 2) evaluation for higher-quality assessment.
 *
 * @param {SemanticResult} result — output of interpret()
 * @returns {boolean}
 */
export function needsCloudEvaluation(result) {
  // Low confidence → needs LLM
  if (result.confidence < 0.6) return true;

  // High risk but protective intent → ambiguous, needs LLM
  if (result.risk_level > 0.5 && result.flags.includes('protective_intent')) return true;

  // Jailbreak detected → always verify with LLM
  if (result.flags.includes('jailbreak_attempt')) return true;

  // Topic detected but neutral stance → could go either way
  if (result.topic !== 'none' && result.stance === 'neutral' && result.risk_level > 0.3) return true;

  return false;
}


// ═════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════

export {
  detectStance,
  computeAgeFitness,
  detectJailbreak,
  detectPersona,
  detectCapabilities,
  computeRiskLevel,
  computeConfidence,
};
