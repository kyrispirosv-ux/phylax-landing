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
  /\b(?:financial\s+literacy|personal\s+finance|investing\s+basics|how\s+to\s+invest|investment\s+guide)/,
  /\b(?:stock\s+market|index\s+fund|retirement|compound\s+interest|savings?\s+account|budget(?:ing)?)/,
  /\b(?:financial\s+education|money\s+management|financial\s+planning|wealth\s+building)/,
  /\b(?:passive\s+income|real\s+estate\s+invest|business\s+(?:plan|model|strategy|idea))/,
  /\b(?:entrepreneur|startup|side\s+hustle|freelanc)/,
  // Risk awareness / warnings
  /\b(?:why\s+(?:you|people)\s+lose|scam\s+warning|avoid|beware|risk(?:s|y)?|danger(?:s|ous)?)/,
  /\b(?:don'?t\s+(?:fall|get\s+scammed)|warning|truth\s+about|reality\s+of|exposed|debunk)/,
  /\b(?:how\s+to\s+(?:spot|avoid|prevent|recognize)\s+scam)/,
  // Academic / educational markers
  /\b(?:course|class|lesson|tutorial|explained|for\s+beginners|101|basics|fundamentals)/,
  /\b(?:professor|university|harvard|stanford|mit|lecture|research|study|academic)/,
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
  /\b(?:brutal\s+(?:knockout|fight|beating|brawl)(?:s)?)/,
  /\b(?:(?:knockout|fight|violence|beating)\s+compilation)/,
  /\b(?:caught\s+on\s+camera\s+(?:fight|violence|attack))/,
];

/**
 * Classify a single video's risk level based on its combined text content.
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
  const reasoning = [];

  // Step 1: Topic scoring via lexicons
  const topicScores = localScoreAllTopics(lower);

  // Step 2: Check for protective patterns (financial literacy, education, etc.)
  let protectiveScore = 0;
  for (const pattern of PROTECTIVE_PATTERNS) {
    if (pattern.test(lower)) {
      protectiveScore += 0.25;
    }
  }
  protectiveScore = Math.min(1.0, protectiveScore);
  if (protectiveScore > 0) {
    reasoning.push(`Protective/educational signals detected (score: ${protectiveScore.toFixed(2)}).`);
  }

  // Step 3: Check for harmful patterns (gambling schemes, get-rich-quick, etc.)
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

  // Step 4: Intent classification from content signals
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
  const intentMod = VIDEO_INTENT_MODIFIERS[intent?.label] || 1.0;
  if (intent && intent.label !== 'unknown') {
    reasoning.push(`Intent: ${intent.label} (confidence: ${intent.confidence.toFixed(2)}).`);
  }

  // Step 5: Evaluate each topic against modulated thresholds
  let topTopic = 'none';
  let topScore = 0;
  let blocked = false;

  for (const [topic, score] of Object.entries(topicScores)) {
    const baseThreshold = VIDEO_RISK_THRESHOLDS[topic] || 0.75;

    // Apply protective context: educational content raises threshold
    const protectiveMod = protectiveScore > 0.3 ? 1.35 : (protectiveScore > 0 ? 1.15 : 1.0);

    // Apply intent modifier
    const effectiveThreshold = Math.min(0.95, baseThreshold * intentMod * protectiveMod);

    // Apply harmful pattern boost to score
    const effectiveScore = Math.min(1.0, score + harmfulPatternScore * 0.3);

    if (effectiveScore > topScore) {
      topScore = effectiveScore;
      topTopic = topic;
    }

    if (effectiveScore >= effectiveThreshold) {
      blocked = true;
      reasoning.push(`Topic "${topic}" score ${effectiveScore.toFixed(2)} >= threshold ${effectiveThreshold.toFixed(2)}.`);
    }
  }

  // Step 6: Harmful patterns alone can trigger blocking (even without topic match)
  if (!blocked && harmfulPatternScore >= 0.6) {
    blocked = true;
    topTopic = 'scams';
    topScore = harmfulPatternScore;
    reasoning.push('Harmful pattern density alone triggers block.');
  }

  // Step 7: Strong protective context can override weak topic matches
  if (blocked && protectiveScore >= 0.5 && topScore < 0.85) {
    blocked = false;
    reasoning.push(`Strong protective context (${protectiveScore.toFixed(2)}) overrides moderate topic match.`);
  }

  // Step 8: Recovery/support intent override
  if (blocked && intent && isProtectiveIntent(intent)) {
    blocked = false;
    reasoning.push(`Recovery/support intent detected — allowing.`);
  }

  // Build final decision
  const riskScore = Math.round(topScore * 100);
  const confidence = Math.min(1.0, 0.4 + topScore * 0.5 + (contentText.length > 200 ? 0.1 : 0));

  if (blocked) {
    return buildDecision('block', riskScore, topTopic, reasoning, confidence);
  }

  // Warn level: elevated but not blocked
  if (riskScore >= 40) {
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
