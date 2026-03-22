// Phylax Engine — Unified Risk Classifier v1.0
//
// Four classification APIs:
//   1. classify_video_risk(content_text)  — YouTube semantic video blocking
//   2. analyze_message_risk(message_text, conversation_history) — Grooming detection
//   3. predict_conversation_risk(messages[]) — Predictive risk intelligence
//   4. classify_search_risk(query)  — Predictive search interception
//
// Every function returns the global structured format:
//   { decision, risk_score, category, reasoning, confidence }
//
// This module is DETERMINISTIC — no LLM, no network calls.
// Decisions are explainable and reproducible.

import { localScoreAllTopics } from './lexicons.js';
import { classifyIntent, isProtectiveIntent } from './intent-classifier.js';
import { detectGrooming, normalizeText, createConversationState } from './grooming-detector.js';

// ═════════════════════════════════════════════════════════════════
// STRUCTURED OUTPUT — every detection returns this shape
// ═════════════════════════════════════════════════════════════════

/**
 * Build a structured decision object.
 * @param {'allow'|'warn'|'block'} decision
 * @param {number} riskScore — 0–100
 * @param {string} category
 * @param {string[]} reasoning — explainable factors
 * @param {number} confidence — 0–1
 * @returns {StructuredDecision}
 */
function buildDecision(decision, riskScore, category, reasoning, confidence) {
  return {
    decision,
    risk_score: Math.round(Math.max(0, Math.min(100, riskScore))),
    category,
    reasoning,
    confidence: Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100,
  };
}


// ═════════════════════════════════════════════════════════════════
// TASK 1 — classify_video_risk(content_text)
// ═════════════════════════════════════════════════════════════════
//
// Classifies a single YouTube video's risk based on its textual signals.
// Used for element-level blocking on search result pages.
//
// Precision > Overblocking:
//   - Financial literacy → ALLOW
//   - Investing basics → ALLOW
//   - Business advice → ALLOW
//   - Gambling systems → BLOCK
//   - Casino tricks → BLOCK
//   - Get rich quick scams → BLOCK
//   - Sports betting tutorials → BLOCK

/**
 * Video risk classification thresholds.
 * Lower thresholds for high-harm topics, higher for ambiguous ones.
 */
const VIDEO_RISK_THRESHOLDS = {
  gambling:         0.60,
  pornography:      0.50,
  self_harm:        0.55,
  drugs:            0.65,
  violence:         0.70,
  weapons:          0.70,
  hate:             0.65,
  scams:            0.55,
  extremism:        0.60,
  eating_disorder:  0.65,
  bullying:         0.70,
};

/**
 * Intent-based threshold modifiers for video classification.
 * Educational/news intent raises threshold (harder to block).
 * Promotional/how_to for harmful content lowers threshold.
 */
const VIDEO_INTENT_MODIFIERS = {
  education:        1.40,  // Educational content is protected
  news_reporting:   1.30,  // News context is protected
  recovery_support: 1.50,  // Recovery/harm reduction is strongly protected
  how_to:           0.85,  // How-to for harmful topics is concerning
  promotion:        0.75,  // Promoting harmful activities is most concerning
  purchase:         0.80,  // Purchase intent for harmful items
  entertainment:    1.10,  // Entertainment context slightly protected
  unknown:          1.00,
};

/**
 * Protective keyword patterns that indicate educational/safe content.
 * When detected alongside topic keywords, raises the threshold significantly.
 */
const PROTECTIVE_PATTERNS = [
  // Financial literacy & investing
  /\b(?:financial\s+literacy|personal\s+finance|investing\s+basics|how\s+to\s+invest|investment\s+guide)/i,
  /\b(?:stock\s+market|index\s+fund|retirement|compound\s+interest|savings?\s+account|budget(?:ing)?)/i,
  /\b(?:financial\s+education|money\s+management|financial\s+planning|wealth\s+building)/i,
  /\b(?:passive\s+income|real\s+estate\s+invest|business\s+(?:plan|model|strategy|idea))/i,
  /\b(?:entrepreneur|startup|side\s+hustle|freelanc)/i,
  // Risk awareness / warnings
  /\b(?:why\s+(?:you|people)\s+lose|scam\s+warning|avoid|beware|risk(?:s|y)?|danger(?:s|ous)?)/i,
  /\b(?:don'?t\s+(?:fall|get\s+scammed)|warning|truth\s+about|reality\s+of|exposed|debunk)/i,
  /\b(?:how\s+to\s+(?:spot|avoid|prevent|recognize)\s+scam)/i,
  // Academic / educational markers
  /\b(?:course|class|lesson|tutorial|explained|for\s+beginners|101|basics|fundamentals)/i,
  /\b(?:professor|university|harvard|stanford|mit|yale|oxford|cambridge|princeton|lecture|research|study|academic)/i,
  // Documentary / historical / educational context (KEY for semantic classification)
  /\bhistory\s+of\b/i,
  /\bhistorical\s+(?:account|event|context|footage|record|analysis|documentary|overview|perspective)/i,
  /\bdocumentary\b/i,
  /\bworld\s+war\s+(?:i{1,2}|1|2|one|two)\b/i,
  /\bww[12i]\b/i,                          // WW1, WW2, WWI, WWII abbreviations
  /\bwwii\b/i,
  /\bcivil\s+war\b/i,
  /\b(?:ancient|medieval|modern|colonial|industrial)\s+history\b/i,
  /\bthe\s+(?:rise|fall|story|origins?|causes?|impact|legacy|aftermath)\s+of\b/i,
  /\b(?:narrated|narrator|hosted)\s+by\b/i,
  /\b(?:museum|archive|library|historian|scholar|archaeolog)/i,
  /\b(?:ted\s*talk|tedx|khan\s*academy|crash\s*course|kurzgesagt|national\s+geographic|smithsonian|pbs|bbc\s+(?:earth|history))/i,
  /\b(?:century|era|period|epoch|dynasty|empire|kingdom|civilization)\b/i,
  /\b(?:revolution|independence|liberation|reformation|enlightenment|renaissance)\b/i,
  /\b(?:battle\s+of|siege\s+of|treaty\s+of|war\s+of)\b/i,
  /\b(?:causes?\s+and\s+(?:effects?|consequences?|impact)|timeline|chronolog)/i,
  /\bfull\s+documentary\b/i,
  /\bhow\s+(?:did|does|do|was|were|is|are)\b/i,
  /\bwhy\s+(?:did|does|do|was|were|is|are)\b/i,
  /\bexplained\b/i,
  /\bscience\s+(?:of|behind)\b/i,
  /\blesson\s+\d+\b/i,
  /\blecture\s+(?:\d+|on|about|series)\b/i,
  /\b(?:educational|informational|instructional)\b/i,
  // Named historical wars, conflicts, events — always educational context
  /\b(?:d[\s-]?day|pearl\s*harbor|normandy|stalingrad|midway|dunkirk|hiroshima|nagasaki)\b/i,
  /\b(?:holocaust|genocide|nuremberg|cold\s+war|vietnam\s+war|korean\s+war|gulf\s+war)\b/i,
  /\b(?:gettysburg|waterloo|verdun|somme|kursk|iwo\s+jima|okinawa|bulge)\b/i,
  /\b(?:blitz|blitzkrieg|luftwaffe|allied\s+forces|axis\s+powers|pacific\s+theater|eastern\s+front|western\s+front)\b/i,
  /\b(?:nazi|third\s+reich|soviet\s+union|churchill|roosevelt|eisenhower|patton|rommel)\b/i,
  /\b(?:in\s+colou?r|remastered|restored|rare\s+footage|archival|archive\s+footage)\b/i,
  /\b(?:veterans?|memorial|remembrance|commemoration|anniversary)\b/i,
  /\b(?:military\s+history|war\s+history|combat\s+footage|war\s+documentary)\b/i,
  /\b(?:invasion\s+of|liberation\s+of|occupation\s+of|surrender\s+of|fall\s+of)\b/i,
  // Prevention / awareness / anti-drug / safety education
  /\b(?:prevention|awareness|effects?\s+(?:of|on))\b/i,
  /\b(?:what\s+(?:every|all)\s+(?:teen|parent|student|kid|child))\b/i,
  /\b(?:drug\s+(?:abuse|prevention|education|awareness|effects?)|substance\s+abuse\s+(?:prevention|education))/i,
  /\b(?:dangers?\s+of|risks?\s+of|harm\s+of|impact\s+of|consequences?\s+of)\b/i,
  /\b(?:stay\s+safe|protect\s+(?:yourself|your\s+child)|say\s+no\s+to)\b/i,
  /\b(?:anti[-\s]?(?:drug|violence|bullying|gambling))\b/i,
  /\b(?:for\s+(?:students?|teens?|parents?|kids?|children|educators?|teachers?))\b/i,
  /\b(?:health\s+(?:education|class|lesson)|mental\s+health)\b/i,
];

/**
 * High-risk patterns that indicate harmful content regardless of context.
 */
const HARMFUL_VIDEO_PATTERNS = [
  // Gambling schemes
  /\b(?:guaranteed\s+(?:win|profit|returns?)|never\s+lose|secret\s+(?:system|method|strategy|trick))/,
  /\b(?:casino\s+(?:trick|hack|cheat|system|strategy)|beat\s+the\s+(?:house|casino|odds))/,
  /\b(?:betting\s+(?:system|strategy|hack|trick)|easy\s+money|quick\s+money|fast\s+cash)/,
  /\b(?:make\s+\$?\d+\s*(?:a\s+day|daily|per\s+hour|in\s+\d+\s+minutes?))/,
  /\b(?:sports?\s+betting\s+(?:tips?|picks?|system|strategy))/,
  /\b(?:slot\s+(?:hack|trick|strategy)|roulette\s+(?:system|strategy|method))/,
  // Get rich quick
  /\b(?:get\s+rich\s+(?:quick|fast|overnight)|millionaire\s+(?:in|by)\s+\d+)/,
  /\b(?:money\s+(?:glitch|hack|exploit|cheat))/,
  /\b(?:free\s+money|infinite\s+money|unlimited\s+money)/,
  // Violence glorification
  /\b(?:real\s+fight(?:s|ing)?(?:\s+video(?:s)?|\s+compilation)?)/,
  /\b(?:street\s+fight(?:s|ing)?(?:\s+compilation)?)/,
  /\b(?:brutal\s+(?:knockout|fight|beating|brawl|attack|assault)(?:s)?)/,
  /\b(?:(?:knockout|fight|violence|beating|attack)\s+compilation)/,
  /\b(?:caught\s+on\s+(?:camera|video|tape)\s+(?:fight|violence|attack))/,
  /\b(?:(?:attack|fight|assault|beating)\s+caught\s+on\s+(?:camera|video|tape))/,
  /\b(?:(?:violent|brutal|deadly|vicious)\s+(?:attack|assault|fight|brawl))/,
];

/**
 * Trusted channel patterns — channels known for educational/documentary content.
 * Matching these adds significant protective weight.
 */
const TRUSTED_CHANNEL_PATTERNS = [
  // Major educational YouTube channels
  /\b(?:kurzgesagt|crash\s*course|veritasium|vsauce|minutephysics|3blue1brown|smarter\s*every\s*day)/i,
  // History / military history channels
  /\b(?:history\s*channel|military\s*history|war\s*stories|world\s*war\s*two|timeline|imperial\s*war\s*museum)/i,
  /\b(?:the\s*great\s*war|real\s*time\s*history|mark\s*felton|kings\s*and\s*generals|history\s*hit|feature\s*history)/i,
  /\b(?:oversimplified|extra\s*credits|historia\s*civilis|epic\s*history|armchair\s*historian)/i,
  /\b(?:khan\s*academy|ted[\s-]*ed|ted\s*talks?|cgp\s*grey|real\s*engineering|wendover)/i,
  /\b(?:mark\s*rober|tom\s*scott|numberphile|computerphile|linus\s*tech|science\s*channel)/i,
  // Major media / documentary producers
  /\b(?:national\s*geographic|nat\s*geo|bbc|pbs|discovery|smithsonian|history\s*channel)/i,
  /\b(?:vice\s*news|al\s*jazeera|reuters|associated\s*press|cnn|nbc|abc\s*news|cbs)/i,
  /\b(?:frontline|nova|60\s*minutes|dateline|hbo\s*documentary)/i,
  // Universities & museums
  /\b(?:harvard|stanford|mit|yale|oxford|cambridge|princeton|columbia|berkeley)/i,
  /\b(?:museum|smithsonian|british\s*museum|metropolitan\s*museum|louvre)/i,
];

/**
 * Classify a single video's risk level based on its combined text content.
 *
 * SEMANTIC AI CLASSIFIER — Analyzes context, not just keywords.
 * Uses weighted multi-signal analysis:
 *   1. Lexicon topic scores (what words appear)
 *   2. Intent classification (WHY the content exists)
 *   3. Protective pattern detection (educational/documentary framing)
 *   4. Harmful pattern detection (glorification, exploitation)
 *   5. Channel reputation signals (trusted sources)
 *   6. Safety Confidence Score — net balance of positive vs negative signals
 *
 * Example outcomes:
 *   "History of World War II" → education intent + historical framing → ALLOW
 *   "Brutal Street Fight Compilation" → violence intent + glorification → BLOCK
 *   "Harvard lecture on addiction neuroscience" → education + university → ALLOW
 *   "How to cheat at online gambling" → harmful how-to + gambling → BLOCK
 *
 * @param {string} contentText — Combined: title + description + channel + tags + transcript
 * @param {Object} [metadata] — Optional: { title, channel, tags, description }
 * @returns {StructuredDecision}
 */
export function classify_video_risk(contentText, metadata = {}) {
  if (!contentText || contentText.length < 5) {
    return buildDecision('allow', 0, 'none', ['Insufficient content to classify.'], 0.5);
  }

  const lower = contentText.toLowerCase();
  const title = (metadata.title || contentText.slice(0, 200)).toLowerCase();
  const channel = (metadata.channel || '').toLowerCase();
  const reasoning = [];

  // ── Signal Layer 1: Topic scoring via lexicons ──────────────────
  const topicScores = localScoreAllTopics(lower);

  // ── Signal Layer 2: Protective pattern detection ────────────────
  // Each match adds to protective score; multiple matches compound
  let protectiveHits = 0;
  for (const pattern of PROTECTIVE_PATTERNS) {
    if (pattern.test(lower)) {
      protectiveHits++;
    }
  }
  // Saturating curve: 1 hit = 0.30, 2 hits = 0.51, 3 hits = 0.66, 5+ = 0.85+
  const protectiveScore = protectiveHits > 0
    ? Math.min(1.0, 1 - Math.exp(-protectiveHits * 0.35))
    : 0;
  if (protectiveScore > 0) {
    reasoning.push(`Protective/educational signals detected (${protectiveHits} signals, score: ${protectiveScore.toFixed(2)}).`);
  }

  // ── Signal Layer 3: Harmful pattern detection ───────────────────
  let harmfulPatternScore = 0;
  const harmfulMatches = [];
  for (const pattern of HARMFUL_VIDEO_PATTERNS) {
    const match = lower.match(pattern);
    if (match) {
      harmfulPatternScore += 0.35;
      harmfulMatches.push(match[0]);
    }
  }
  harmfulPatternScore = Math.min(1.0, harmfulPatternScore);
  if (harmfulPatternScore > 0) {
    reasoning.push(`Harmful patterns: ${harmfulMatches.slice(0, 3).join(', ')}.`);
  }

  // ── Signal Layer 4: Intent classification ───────────────────────
  const contentObj = {
    title: metadata.title || contentText.slice(0, 200),
    description: metadata.description || '',
    headings: [],
    main_text: contentText,
    url: '',
    domain: 'youtube.com',
    keywords: metadata.tags || [],
    platform: { name: 'youtube', channel_or_author: metadata.channel || '' },
  };
  const intent = classifyIntent(contentObj);
  const intentLabel = intent?.label || 'unknown';
  const intentConf = intent?.confidence || 0;
  const intentMod = VIDEO_INTENT_MODIFIERS[intentLabel] || 1.0;
  if (intentLabel !== 'unknown') {
    reasoning.push(`Intent: ${intentLabel} (confidence: ${intentConf.toFixed(2)}).`);
  }

  // ── Signal Layer 5: Channel reputation ──────────────────────────
  let channelReputationBoost = 0;
  const channelText = channel + ' ' + title;
  for (const pattern of TRUSTED_CHANNEL_PATTERNS) {
    if (pattern.test(channelText)) {
      channelReputationBoost = 0.3;
      reasoning.push('Trusted educational/media channel detected.');
      break;
    }
  }

  // ── Signal Layer 6: Safety Confidence Score ─────────────────────
  // Net balance: positive safety signals vs negative harm signals
  // This is the KEY semantic decision layer
  const positiveSignals = protectiveScore + channelReputationBoost
    + (intentLabel === 'education' ? intentConf * 0.5 : 0)
    + (intentLabel === 'news_reporting' ? intentConf * 0.4 : 0)
    + (intentLabel === 'recovery_support' ? intentConf * 0.6 : 0);
  const negativeSignals = harmfulPatternScore;

  // safetyConfidence: >0 means more safe than harmful, <0 means more harmful
  const safetyConfidence = positiveSignals - negativeSignals;

  // ── Evaluate each topic against context-aware thresholds ────────
  let topTopic = 'none';
  let topScore = 0;
  let blocked = false;

  for (const [topic, score] of Object.entries(topicScores)) {
    const baseThreshold = VIDEO_RISK_THRESHOLDS[topic] || 0.75;

    // Apply protective context: scales with number of protective signals
    // 1 signal → 1.15x, 2+ signals → 1.35x, 3+ with education intent → 1.55x
    let protectiveMod = 1.0;
    if (protectiveScore > 0.5) {
      protectiveMod = 1.45;
    } else if (protectiveScore > 0.3) {
      protectiveMod = 1.35;
    } else if (protectiveScore > 0) {
      protectiveMod = 1.15;
    }

    // Education intent with high confidence gets extra protection
    if (intentLabel === 'education' && intentConf >= 0.6) {
      protectiveMod += 0.15;
    }

    // Channel reputation bonus
    if (channelReputationBoost > 0) {
      protectiveMod += 0.10;
    }

    // Apply intent modifier
    const effectiveThreshold = Math.min(0.98, baseThreshold * intentMod * protectiveMod);

    // Apply harmful pattern boost to score (only when no educational context)
    const harmfulBoost = safetyConfidence < 0 ? harmfulPatternScore * 0.3 : harmfulPatternScore * 0.1;
    const effectiveScore = Math.min(1.0, score + harmfulBoost);

    if (effectiveScore > topScore) {
      topScore = effectiveScore;
      topTopic = topic;
    }

    if (effectiveScore >= effectiveThreshold) {
      blocked = true;
      reasoning.push(`Topic "${topic}" score ${effectiveScore.toFixed(2)} >= threshold ${effectiveThreshold.toFixed(2)}.`);
    }
  }

  // ── Harmful patterns alone can trigger blocking ─────────────────
  if (!blocked && harmfulPatternScore >= 0.6 && safetyConfidence < 0.2) {
    blocked = true;
    topTopic = 'scams';
    topScore = harmfulPatternScore;
    reasoning.push('Harmful pattern density alone triggers block.');
  }

  // ── Semantic Safety Override ─────────────────────────────────────
  // Strong educational/documentary context overrides topic matches
  // This is the core "AI classification" — understanding CONTEXT not just words

  // Tier 0 (NEW): Historical/documentary violence override
  // WWII documentaries, war history, etc. inherently contain "violence" keywords
  // (battle, attack, kill, shooting, bombing, etc.) but are EDUCATIONAL content.
  // When the violence topic is the block trigger AND strong historical context is
  // present, override regardless of score — historical war content is not "violence".
  if (blocked && (topTopic === 'violence' || topTopic === 'weapons') &&
      protectiveScore >= 0.30 && harmfulPatternScore === 0) {
    blocked = false;
    reasoning.push(`Historical/documentary violence override: protective signals (${protectiveScore.toFixed(2)}) indicate educational war/history content, not violence glorification.`);
  }

  // Tier 1: Very strong safety + zero harmful patterns → override even high topic scores
  // e.g., "Drug abuse prevention for teens" mentions cocaine, heroin, fentanyl
  //        but has zero harmful PATTERNS and strong educational framing
  if (blocked && safetyConfidence > 0.6 && harmfulPatternScore === 0 && topScore < 1.0) {
    blocked = false;
    reasoning.push(`Strong semantic safety override: high safety confidence (${safetyConfidence.toFixed(2)}) with zero harmful patterns — educational/preventive content.`);
  }

  // Tier 2: Moderate safety confidence overrides moderate topic scores
  if (blocked && safetyConfidence > 0.3 && topScore < 0.95) {
    blocked = false;
    reasoning.push(`Semantic safety override: positive safety signals (${positiveSignals.toFixed(2)}) outweigh harm signals (${negativeSignals.toFixed(2)}).`);
  }

  // Tier 3: Protective score alone can override moderate matches
  if (blocked && protectiveScore >= 0.35 && topScore < 0.90 && harmfulPatternScore < 0.3) {
    blocked = false;
    reasoning.push(`Strong protective context (${protectiveScore.toFixed(2)}) overrides moderate topic match — no harmful patterns present.`);
  }

  // ── Recovery/support intent override ────────────────────────────
  if (blocked && intent && isProtectiveIntent(intent)) {
    blocked = false;
    reasoning.push(`Recovery/support intent detected — allowing.`);
  }

  // ── Build final decision ────────────────────────────────────────
  const riskScore = Math.round(topScore * 100);
  const confidence = Math.min(1.0, 0.4 + topScore * 0.5 + (contentText.length > 200 ? 0.1 : 0));

  if (blocked) {
    return buildDecision('block', riskScore, topTopic, reasoning, confidence);
  }

  // Warn level: elevated but not blocked
  if (riskScore >= 40 && safetyConfidence < 0.2) {
    reasoning.push(`Elevated risk but below block threshold.`);
    return buildDecision('warn', riskScore, topTopic, reasoning, confidence * 0.8);
  }

  return buildDecision('allow', riskScore, topTopic || 'none', reasoning.length > 0 ? reasoning : ['No harmful signals detected.'], confidence);
}


// ═════════════════════════════════════════════════════════════════
// TASK 2 — analyze_message_risk(message_text, conversation_history)
// ═════════════════════════════════════════════════════════════════
//
// Detects manipulation patterns in chat messages.
// NOT just explicit words — detects behavioral patterns:
//   - secrecy encouragement
//   - emotional dependency
//   - isolation language
//   - age manipulation
//   - trust acceleration

/**
 * Stage mapping: grooming-detector stages → simplified demo stages.
 * The full detector uses 9 stages; the demo API collapses to 4 levels.
 */
const STAGE_MAP = {
  trust_building:   'early',
  isolation:        'mid',
  boundary_testing: 'mid',
  normalization:    'mid',
  dependency:       'mid',
  escalation:       'high',
  coercion:         'high',
  gaslighting:      'high',
  threats:          'high',
};

/**
 * Map internal signal IDs to human-readable trigger names.
 */
const TRIGGER_LABELS = {
  emotional_mirroring:     'emotional_mirroring',
  special_flattery:        'flattery',
  authority_undermining:   'authority_undermining',
  platform_migration:      'platform_migration',
  secrecy_demand:          'secrecy',
  support_erosion:         'isolation',
  personal_probing:        'personal_probing',
  body_normalization:      'body_normalization',
  relationship_probing:    'relationship_probing',
  image_request:           'image_solicitation',
  incremental_escalation:  'escalation',
  normalization_reframing: 'normalization',
  dependency_building:     'dependency_creation',
  guilt_induction:         'guilt_induction',
  emotional_pressure:      'emotional_pressure',
  gaslighting:             'gaslighting',
  leverage_threats:        'threat',
  maturity_flattery:       'age_manipulation',
  meeting_request:         'meeting_request',
};

/**
 * Analyze a single message or conversation for grooming/manipulation risk.
 *
 * @param {string} messageText — The message text to analyze
 * @param {Array} [conversationHistory] — Previous messages [{sender, text}]
 * @returns {{ stage: string, confidence: number, triggers: string[], decision: StructuredDecision }}
 */
export function analyze_message_risk(messageText, conversationHistory = null) {
  if (!messageText || messageText.length < 5) {
    return {
      stage: 'none',
      confidence: 0,
      triggers: [],
      ...buildDecision('allow', 0, 'none', ['No message content to analyze.'], 0.5),
    };
  }

  // Build chat messages array for the grooming detector
  const chatMessages = [];
  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      chatMessages.push({
        sender: msg.sender || 'CONTACT',
        text: msg.text || '',
      });
    }
  }
  // Add the current message as CONTACT (the potential threat)
  chatMessages.push({ sender: 'CONTACT', text: messageText });

  // Run the full grooming detector
  const groomingResult = detectGrooming(
    messageText,
    chatMessages.length > 1 ? chatMessages : null,
    null, // no persistent state for single analysis
  );

  // Map to simplified stage
  const detectedStage = groomingResult.stage;
  let simplifiedStage = detectedStage ? (STAGE_MAP[detectedStage] || 'early') : 'none';

  // If context suppression is active and the suppressed risk score is low,
  // downgrade the stage to 'none' to avoid false positives
  // (e.g. "Don't tell dad about his birthday surprise" triggers secrecy
  //  but family_context suppression should fully clear it)
  if (groomingResult.suppressed && groomingResult.risk_score < 0.25) {
    simplifiedStage = 'none';
  }

  // Extract trigger labels
  const triggers = (groomingResult.signals || []).map(s =>
    TRIGGER_LABELS[s.id] || s.id
  );

  // Add conversation-level behavioral triggers
  if (groomingResult.conversation?.behavioral_signals) {
    for (const bs of groomingResult.conversation.behavioral_signals) {
      triggers.push(bs.signal);
    }
  }

  // Map risk_score (0-1) to risk_score (0-100)
  const riskScore = Math.round(groomingResult.risk_score * 100);
  const confidence = groomingResult.risk_score;

  // Build reasoning
  const reasoning = [];
  if (groomingResult.explanation && groomingResult.explanation !== 'No grooming patterns detected.') {
    reasoning.push(groomingResult.explanation);
  }
  if (groomingResult.suppressed) {
    reasoning.push(`Context suppression: ${groomingResult.hard_negatives.join(', ')}.`);
  }
  if (triggers.length > 0) {
    reasoning.push(`Triggers: ${triggers.join(', ')}.`);
  }
  if (reasoning.length === 0) {
    reasoning.push('No manipulation patterns detected.');
  }

  // Determine decision
  let decision = 'allow';
  if (simplifiedStage === 'high') decision = 'block';
  else if (simplifiedStage === 'mid') decision = riskScore >= 50 ? 'block' : 'warn';
  else if (simplifiedStage === 'early') decision = riskScore >= 40 ? 'warn' : 'allow';

  const category = detectedStage || 'none';

  return {
    stage: simplifiedStage,
    confidence,
    triggers,
    ...buildDecision(decision, riskScore, category, reasoning, confidence),
  };
}


// ═════════════════════════════════════════════════════════════════
// TASK 3 — predict_conversation_risk(messages[])
// ═════════════════════════════════════════════════════════════════
//
// Detects harmful behavioral PATTERNS before explicit danger.
// Analyzes conversation TRAJECTORY, not single messages.
//
// Detects grooming sequences like:
//   1. compliment → 2. trust statement → 3. exclusivity claim → 4. secrecy request
//
// Returns: { risk_level, pattern_detected, stage, decision }

/**
 * Grooming sequence patterns.
 * Each sequence defines a progression that is concerning when observed
 * in order within a conversation. The stages don't need to be consecutive —
 * the sequence detector looks for the PROGRESSION, not adjacency.
 */
const GROOMING_SEQUENCES = {
  grooming_sequence: {
    label: 'Classic Grooming Sequence',
    stages: ['trust_building', 'isolation', 'boundary_testing', 'escalation'],
    min_stages_for_detection: 2,
    description: 'Progression from trust-building through isolation to boundary testing or escalation.',
  },
  rapid_escalation: {
    label: 'Rapid Escalation',
    stages: ['trust_building', 'escalation'],
    min_stages_for_detection: 2,
    description: 'Jump from initial trust-building directly to escalation (skipping intermediate stages).',
  },
  isolation_coercion: {
    label: 'Isolation-to-Coercion',
    stages: ['isolation', 'dependency', 'coercion'],
    min_stages_for_detection: 2,
    description: 'Pattern of isolating the target then creating dependency and applying coercion.',
  },
  flattery_secrecy: {
    label: 'Flattery-to-Secrecy Pipeline',
    stages: ['trust_building', 'isolation'],
    min_stages_for_detection: 2,
    description: 'Compliments and trust-building followed by secrecy demands.',
    // Specific signal sequence: special_flattery → secrecy_demand
    signal_sequence: ['special_flattery', 'secrecy_demand'],
  },
  maturity_normalization: {
    label: 'Age Manipulation',
    stages: ['boundary_testing', 'normalization'],
    min_stages_for_detection: 2,
    description: 'Telling the target they are mature for their age, then normalizing inappropriate behavior.',
    signal_sequence: ['maturity_flattery', 'normalization_reframing'],
  },
};

/**
 * Risk level mapping based on trajectory analysis.
 */
function computeRiskLevel(trajectoryScore, sequencesDetected, stagesActive, highestStage) {
  // High-stage signals are automatically elevated
  if (highestStage >= 7) return 'critical';
  if (highestStage >= 4 && sequencesDetected > 0) return 'high';

  // Sequence detection is highly concerning
  if (sequencesDetected >= 2) return 'high';
  if (sequencesDetected >= 1 && stagesActive >= 3) return 'high';
  if (sequencesDetected >= 1) return 'elevated';

  // Multi-stage presence without sequence
  if (stagesActive >= 3 && trajectoryScore >= 0.4) return 'elevated';
  if (stagesActive >= 2 && trajectoryScore >= 0.3) return 'elevated';

  // Some signals but no clear pattern
  if (trajectoryScore >= 0.2 || stagesActive >= 1) return 'low';

  return 'none';
}

/**
 * Predict conversation risk by analyzing the trajectory of messages.
 * Detects behavioral patterns BEFORE explicit danger.
 *
 * @param {Array} messages — [{sender: "CONTACT"|"CHILD", text: string}]
 * @returns {{ risk_level: string, pattern_detected: string|null, stage: string, decision: StructuredDecision }}
 */
export function predict_conversation_risk(messages) {
  if (!messages || messages.length === 0) {
    return {
      risk_level: 'none',
      pattern_detected: null,
      stage: 'none',
      ...buildDecision('allow', 0, 'none', ['No conversation data to analyze.'], 0.5),
    };
  }

  // Step 1: Analyze each CONTACT message for grooming signals
  const contactMessages = messages.filter(m =>
    m.sender === 'CONTACT' || m.sender === 'UNKNOWN' || !m.sender
  );

  if (contactMessages.length === 0) {
    return {
      risk_level: 'none',
      pattern_detected: null,
      stage: 'none',
      ...buildDecision('allow', 0, 'none', ['No contact messages to analyze.'], 0.5),
    };
  }

  // Step 2: Run grooming detection with full conversation context
  const combinedContactText = contactMessages.map(m => m.text).join(' ');
  const groomingResult = detectGrooming(
    combinedContactText,
    messages,
    null,
  );

  // Step 3: Build per-message signal timeline
  const messageTimeline = [];
  let convState = createConversationState();

  for (let i = 0; i < contactMessages.length; i++) {
    const normalized = normalizeText(contactMessages[i].text);
    // Re-use the grooming detector's internal signal extraction via triage
    const msgResult = detectGrooming(normalized, null, convState);
    convState = msgResult.updated_conversation_state || convState;

    messageTimeline.push({
      index: i,
      text_preview: contactMessages[i].text.slice(0, 80),
      signals: (msgResult.signals || []).map(s => s.id),
      stage: msgResult.stage,
      risk_score: msgResult.risk_score,
    });
  }

  // Step 4: Detect grooming sequences
  const detectedSequences = [];
  const stagesInOrder = messageTimeline
    .filter(m => m.stage)
    .map(m => m.stage);
  const signalsInOrder = messageTimeline
    .flatMap(m => m.signals);

  for (const [seqKey, seqDef] of Object.entries(GROOMING_SEQUENCES)) {
    // Check stage sequence
    let stageMatchCount = 0;
    let lastMatchIndex = -1;

    for (const requiredStage of seqDef.stages) {
      const foundIndex = stagesInOrder.findIndex((s, idx) =>
        idx > lastMatchIndex && s === requiredStage
      );
      if (foundIndex >= 0) {
        stageMatchCount++;
        lastMatchIndex = foundIndex;
      }
    }

    if (stageMatchCount >= seqDef.min_stages_for_detection) {
      let signalMatch = true;

      // Optional: check specific signal sequence
      if (seqDef.signal_sequence) {
        let sigIdx = -1;
        for (const reqSignal of seqDef.signal_sequence) {
          const foundSigIdx = signalsInOrder.findIndex((s, idx) =>
            idx > sigIdx && s === reqSignal
          );
          if (foundSigIdx >= 0) {
            sigIdx = foundSigIdx;
          } else {
            signalMatch = false;
            break;
          }
        }
      }

      if (signalMatch) {
        detectedSequences.push({
          key: seqKey,
          label: seqDef.label,
          description: seqDef.description,
          stages_matched: stageMatchCount,
          stages_required: seqDef.stages.length,
        });
      }
    }
  }

  // Step 5: Compute trajectory metrics
  const stagesActive = new Set(stagesInOrder).size;
  const highestStage = convState.highest_stage_reached;
  const trajectoryScore = groomingResult.conversation?.trajectory_score || groomingResult.risk_score;

  // Step 6: Determine risk level
  const riskLevel = computeRiskLevel(
    trajectoryScore,
    detectedSequences.length,
    stagesActive,
    highestStage,
  );

  // Step 7: Determine dominant pattern
  const primaryPattern = detectedSequences.length > 0
    ? detectedSequences[0].key
    : (stagesActive >= 2 ? 'multi_stage_signals' : null);

  // Step 8: Map to simplified stage
  const dominantStage = groomingResult.stage
    ? (STAGE_MAP[groomingResult.stage] || 'early')
    : 'none';

  // Step 9: Build reasoning
  const reasoning = [];
  if (detectedSequences.length > 0) {
    for (const seq of detectedSequences) {
      reasoning.push(`Sequence detected: ${seq.label} — ${seq.description}`);
    }
  }
  if (groomingResult.conversation?.behavioral_signals) {
    for (const bs of groomingResult.conversation.behavioral_signals) {
      reasoning.push(bs.description);
    }
  }
  if (stagesActive >= 2) {
    reasoning.push(`Signals detected across ${stagesActive} distinct grooming stages.`);
  }
  if (groomingResult.explanation && groomingResult.explanation !== 'No grooming patterns detected.') {
    reasoning.push(groomingResult.explanation);
  }
  if (reasoning.length === 0) {
    reasoning.push('No concerning behavioral patterns detected.');
  }

  // Step 10: Build structured output
  const riskScore = Math.round(trajectoryScore * 100);
  const confidence = Math.min(1.0, trajectoryScore + (detectedSequences.length > 0 ? 0.15 : 0));

  let decision = 'allow';
  if (riskLevel === 'critical' || riskLevel === 'high') decision = 'block';
  else if (riskLevel === 'elevated') decision = riskScore >= 70 ? 'block' : 'warn';

  return {
    risk_level: riskLevel,
    pattern_detected: primaryPattern,
    stage: dominantStage === 'none' ? 'none' : `${dominantStage} grooming`,
    sequences: detectedSequences,
    timeline: messageTimeline,
    ...buildDecision(decision, riskScore, primaryPattern || 'none', reasoning, confidence),
  };
}


// ═════════════════════════════════════════════════════════════════
// TASK 3b — classify_search_risk(query)
// ═════════════════════════════════════════════════════════════════
//
// Predictive search interception.
// Classifies a search query BEFORE it executes.
// Blocks harmful-intent queries, allows educational/research queries.
//
// Decision logic:
//   - Educational queries about sensitive topics → ALLOW
//     e.g. "effects of stress on teenage brain", "what is suicide prevention"
//   - Direct harmful queries → BLOCK
//     e.g. "how to kill yourself", "buy drugs online", "child porn"
//   - Ambiguous queries → ALLOW (err on side of learning)

/**
 * Search query risk thresholds.
 * Higher thresholds than video classification since search queries are short
 * and we want to minimise false positives on legitimate research.
 */
const SEARCH_RISK_THRESHOLDS = {
  pornography:      0.50,
  self_harm:        0.55,
  drugs:            0.65,
  violence:         0.75,
  weapons:          0.70,
  hate:             0.70,
  scams:            0.65,
  extremism:        0.60,
  gambling:         0.70,
  eating_disorder:  0.65,
  bullying:         0.70,
};

/**
 * Educational/research search patterns that indicate safe intent.
 * When detected, the query is allowed regardless of topic scores.
 */
const SAFE_SEARCH_PATTERNS = [
  // Academic/research queries
  /\b(?:effects?\s+of|impact\s+of|causes?\s+of|research\s+on|study\s+(?:of|on|about))/,
  /\b(?:what\s+is|what\s+are|how\s+does|why\s+do|definition\s+of|meaning\s+of)/,
  /\b(?:prevention|awareness|support|help\s+(?:for|with)|resources?\s+for)/,
  /\b(?:statistics|facts?\s+about|history\s+of|science\s+(?:of|behind))/,
  /\b(?:signs?\s+of|symptoms?\s+of|treatment\s+(?:for|of))/,
  /\b(?:how\s+to\s+(?:prevent|avoid|recognize|stop|report|help))/,
  /\b(?:documentary|educational|explained|for\s+(?:kids|students|beginners))/,
  /\b(?:psychology|neuroscience|biology|health|mental\s+health)/,
  /\b(?:coping|recovery|rehabilitation|therapy|counseling)/,
  /\b(?:teenage|adolescent|child(?:ren)?)\s+(?:brain|development|psychology|health)/,
  // Specific protective phrases for sensitive topics
  /\b(?:suicide\s+(?:prevention|hotline|helpline|awareness|resources?|crisis\s+line))/,
  /\b(?:(?:suicide|self.?harm)\s+(?:help|support|talk|counseling))/,
  /\b(?:drug\s+(?:abuse\s+)?(?:prevention|education|awareness|effects?))/,
  /\b(?:violence\s+(?:prevention|awareness|against))/,
  /\b(?:(?:crisis|help)\s+(?:line|hotline|number|center|resources?))/,
];

/**
 * High-risk search patterns that indicate harmful intent.
 * These should be blocked regardless of educational modifiers.
 */
const HARMFUL_SEARCH_PATTERNS = [
  // Self-harm method-seeking
  /\b(?:how\s+to\s+(?:kill|hurt|harm)\s+(?:my|your)?self)/,
  /\b(?:ways\s+to\s+(?:die|kill\s+yourself|commit\s+suicide))/,
  /\b(?:suicide\s+(?:methods?|techniques?|ways?))/,
  /\b(?:painless\s+(?:death|suicide|way\s+to\s+die))/,
  // Drug purchasing
  /\b(?:buy|order|get|purchase)\s+(?:cocaine|heroin|meth|fentanyl|drugs?|pills?)\s*(?:online)?/,
  /\b(?:where\s+to\s+(?:buy|get|find)\s+(?:drugs?|cocaine|heroin|meth|weed))/,
  // Explicit content seeking
  /\b(?:child\s+(?:porn|pornography|abuse\s+(?:images?|videos?|material)))/,
  /\b(?:underage|minor)\s+(?:nude|naked|porn|sex)/,
  // Violence method-seeking
  /\b(?:how\s+to\s+(?:make|build)\s+(?:a\s+)?(?:bomb|explosive|weapon))/,
  /\b(?:how\s+to\s+(?:attack|kill|shoot)\s+(?:people|a\s+school|someone))/,
  // Eating disorder encouragement
  /\b(?:pro\s*[-\s]?ana|pro\s*[-\s]?mia|thinspo|how\s+to\s+(?:purge|starve))/,
];

/**
 * Classify a search query's risk level BEFORE the search executes.
 *
 * @param {string} query — The raw search query text
 * @returns {StructuredDecision & { blocked_reason?: string }}
 */
export function classify_search_risk(query) {
  if (!query || query.length < 3) {
    return buildDecision('allow', 0, 'none', ['Query too short to classify.'], 0.5);
  }

  const lower = query.toLowerCase().trim();
  const reasoning = [];

  // Step 1: Check for harmful patterns (highest priority — always block)
  for (const pattern of HARMFUL_SEARCH_PATTERNS) {
    const match = lower.match(pattern);
    if (match) {
      reasoning.push('Harmful-intent pattern detected: "' + match[0] + '".');

      // Determine category from the match
      let category = 'harmful_content';
      if (/kill|hurt|harm|suicide|die/.test(match[0])) category = 'self_harm';
      else if (/buy|order|drug|cocaine|heroin|meth|fentanyl/.test(match[0])) category = 'drugs';
      else if (/porn|nude|naked|abuse/.test(match[0])) category = 'pornography';
      else if (/bomb|explosive|weapon|attack|shoot/.test(match[0])) category = 'violence';
      else if (/pro.?ana|pro.?mia|thinspo|purge|starve/.test(match[0])) category = 'eating_disorder';

      return {
        ...buildDecision('block', 95, category, reasoning, 0.9),
        blocked_reason: 'harmful-intent query detected',
      };
    }
  }

  // Step 2: Check for safe/educational patterns
  let safeScore = 0;
  for (const pattern of SAFE_SEARCH_PATTERNS) {
    if (pattern.test(lower)) {
      safeScore += 0.3;
    }
  }
  safeScore = Math.min(1.0, safeScore);
  if (safeScore > 0) {
    reasoning.push('Educational/research signals detected (score: ' + safeScore.toFixed(2) + ').');
  }

  // Step 3: Topic scoring via lexicons
  const topicScores = localScoreAllTopics(lower);

  // Step 4: Evaluate topics against thresholds
  let topTopic = 'none';
  let topScore = 0;
  let blocked = false;

  for (const [topic, score] of Object.entries(topicScores)) {
    const baseThreshold = SEARCH_RISK_THRESHOLDS[topic] || 0.75;

    // Safe queries raise threshold significantly
    const safeMod = safeScore > 0.3 ? 1.5 : (safeScore > 0 ? 1.2 : 1.0);
    const effectiveThreshold = Math.min(0.95, baseThreshold * safeMod);

    if (score > topScore) {
      topScore = score;
      topTopic = topic;
    }

    if (score >= effectiveThreshold && safeScore < 0.5) {
      blocked = true;
      reasoning.push('Topic "' + topic + '" score ' + score.toFixed(2) + ' >= threshold ' + effectiveThreshold.toFixed(2) + '.');
    }
  }

  // Step 5: Strong safe signals override moderate topic matches
  if (blocked && safeScore >= 0.5) {
    blocked = false;
    reasoning.push('Strong educational context overrides topic match.');
  }

  // Build decision
  const riskScore = Math.round(topScore * 100);
  const confidence = Math.min(1.0, 0.5 + topScore * 0.4);

  if (blocked) {
    return {
      ...buildDecision('block', riskScore, topTopic, reasoning, confidence),
      blocked_reason: 'harmful-intent query detected',
    };
  }

  if (riskScore >= 40 && safeScore < 0.3) {
    reasoning.push('Elevated risk but below block threshold.');
    return buildDecision('warn', riskScore, topTopic, reasoning, confidence * 0.8);
  }

  return buildDecision('allow', riskScore, topTopic || 'none',
    reasoning.length > 0 ? reasoning : ['No harmful signals detected — safe educational content.'], confidence);
}
