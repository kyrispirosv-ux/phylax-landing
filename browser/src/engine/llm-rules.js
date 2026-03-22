// Phylax Engine — LLM Rule Compiler v1.0
// Extends rule-compiler.js to recognize LLM-specific parent rules.
// Compiles natural language rules like "don't let my child discuss weapons on ChatGPT"
// into structured LLM rule objects for the safety decision engine.
//
// New LLM intent types:
//   BLOCK_LLM_TOPIC      — "Don't let my child discuss weapons"
//   BLOCK_LLM_CAPABILITY — "No code generation", "No image generation"
//   BLOCK_LLM_JAILBREAK  — Automatic jailbreak detection (always-on)
//   BLOCK_LLM_PERSONA    — "Don't let AI pretend to be a girlfriend/boyfriend"
//
// Integrates with existing scoreContentForLabel() and evaluateCompiledRules().

import { scoreContentForLabel, evaluateRules as evaluateCompiledRules } from './rule-compiler.js';

// ── LLM Rule Action Types ─────────────────────────────────────

export const LLM_RULE_ACTIONS = {
  BLOCK_LLM_TOPIC:      'BLOCK_LLM_TOPIC',
  BLOCK_LLM_CAPABILITY: 'BLOCK_LLM_CAPABILITY',
  BLOCK_LLM_JAILBREAK:  'BLOCK_LLM_JAILBREAK',
  BLOCK_LLM_PERSONA:    'BLOCK_LLM_PERSONA',
};

// ── LLM Intent Types ─────────────────────────────────────────

export const LLM_INTENT_TYPES = {
  BLOCK_LLM_TOPIC:      'BLOCK_LLM_TOPIC',
  BLOCK_LLM_CAPABILITY: 'BLOCK_LLM_CAPABILITY',
  BLOCK_LLM_JAILBREAK:  'BLOCK_LLM_JAILBREAK',
  BLOCK_LLM_PERSONA:    'BLOCK_LLM_PERSONA',
};

// ── Known LLM Platforms ──────────────────────────────────────

const LLM_PLATFORMS = {
  chatgpt:    { domains: ['chat.openai.com', 'chatgpt.com'], name: 'ChatGPT' },
  claude:     { domains: ['claude.ai'], name: 'Claude' },
  gemini:     { domains: ['gemini.google.com', 'bard.google.com'], name: 'Gemini' },
  copilot:    { domains: ['copilot.microsoft.com'], name: 'Copilot' },
  perplexity: { domains: ['perplexity.ai'], name: 'Perplexity' },
  poe:        { domains: ['poe.com'], name: 'Poe' },
  character:  { domains: ['character.ai', 'beta.character.ai'], name: 'Character.AI' },
  pi:         { domains: ['pi.ai'], name: 'Pi' },
  meta_ai:    { domains: ['meta.ai'], name: 'Meta AI' },
  grok:       { domains: ['grok.x.ai', 'x.com/i/grok'], name: 'Grok' },
  midjourney: { domains: ['midjourney.com'], name: 'Midjourney' },
  dalle:      { domains: ['labs.openai.com'], name: 'DALL-E' },
};

// ── Topic Vocabulary (reused from rule-compiler TOPICS) ──────

const LLM_TOPIC_ALIASES = {
  weapons:         ['weapons', 'guns', 'firearms', 'weapon content', 'gun content', 'explosives', 'bombs'],
  drugs:           ['drugs', 'narcotics', 'drug use', 'substance abuse', 'drug content'],
  violence:        ['violence', 'gore', 'graphic violence', 'violent content', 'fighting'],
  self_harm:       ['self-harm', 'self harm', 'suicide', 'cutting', 'suicidal'],
  pornography:     ['porn', 'pornography', 'adult content', 'nsfw', 'explicit content', 'sexual content'],
  hate:            ['hate', 'hate speech', 'racism', 'bigotry', 'discrimination'],
  extremism:       ['extremism', 'radicalization', 'terrorism'],
  gambling:        ['gambling', 'casino', 'betting', 'poker'],
  profanity:       ['profanity', 'swearing', 'bad language', 'curse words'],
  eating_disorder: ['eating disorder', 'pro-ana', 'pro-mia', 'anorexia', 'bulimia'],
  scams:           ['scams', 'fraud', 'phishing'],
  bullying:        ['bullying', 'cyberbullying', 'harassment'],
  grooming:        ['grooming', 'predator', 'predatory'],
};

// ── Capability Keywords ──────────────────────────────────────

const CAPABILITY_MAP = {
  code_generation:  ['code generation', 'write code', 'generate code', 'coding', 'programming', 'write a program', 'write a script', 'code writing'],
  image_generation: ['image generation', 'generate images', 'create images', 'make images', 'draw', 'art generation', 'picture generation', 'image creation'],
  voice_chat:       ['voice chat', 'voice mode', 'talk to ai', 'voice conversation', 'speak to ai'],
  file_upload:      ['file upload', 'upload files', 'send files', 'file sharing'],
  web_browsing:     ['web browsing', 'browse the web', 'internet access', 'search the web', 'web search'],
  plugin_use:       ['plugins', 'use plugins', 'extensions', 'tools', 'third-party tools'],
};

// ── Persona Keywords ─────────────────────────────────────────

const PERSONA_PATTERNS = {
  romantic_partner:   ['girlfriend', 'boyfriend', 'romantic partner', 'lover', 'date me', 'be my', 'love interest', 'significant other', 'partner'],
  friend:             ['best friend', 'my friend', 'be my friend'],
  authority_figure:   ['be my parent', 'be my teacher', 'be my boss', 'authority figure'],
  fictional_harmful:  ['serial killer', 'villain', 'evil', 'demon', 'devil', 'psychopath', 'sociopath'],
  adult_persona:      ['adult', 'older person', 'grown up', 'mature person'],
};

// ── Jailbreak Detection Patterns ─────────────────────────────
// These are always-on, not configurable by parents.

const JAILBREAK_PATTERNS = [
  // DAN-style prompts
  /\b(?:do\s+anything\s+now|DAN\s+mode|jailbreak|ignore\s+(?:all\s+)?(?:previous\s+)?instructions?)\b/i,
  /\b(?:pretend\s+(?:you\s+(?:are|have)\s+)?no\s+(?:restrictions?|rules?|limits?|guidelines?))\b/i,
  /\b(?:act\s+as\s+(?:if|though)\s+you\s+(?:have|had)\s+no\s+(?:restrictions?|rules?|filters?))\b/i,
  // System prompt extraction
  /\b(?:show\s+(?:me\s+)?(?:your|the)\s+system\s+prompt|reveal\s+(?:your\s+)?instructions?)\b/i,
  /\b(?:what\s+(?:are|is)\s+your\s+(?:system\s+)?(?:prompt|instructions?|rules?))\b/i,
  // Override attempts
  /\b(?:override\s+(?:your\s+)?(?:safety|content|moderation)\s+(?:filters?|settings?|rules?))\b/i,
  /\b(?:disable\s+(?:your\s+)?(?:safety|content|moderation)\s+(?:filters?|settings?|rules?))\b/i,
  /\b(?:bypass\s+(?:your\s+)?(?:safety|content|restrictions?|filters?|rules?))\b/i,
  // Roleplay-as-unrestricted
  /\b(?:you\s+are\s+(?:now\s+)?(?:an?\s+)?(?:unrestricted|uncensored|unfiltered)\s+(?:AI|assistant|model))\b/i,
  /\b(?:respond\s+without\s+(?:any\s+)?(?:restrictions?|filters?|censorship|limits?))\b/i,
  // Token smuggling / encoding tricks
  /\b(?:base64|rot13|hex\s+encoded?|encode\s+(?:the|your)\s+(?:response|answer|output))\b/i,
  // Developer mode fakes
  /\b(?:developer\s+mode|dev\s+mode|admin\s+mode|god\s+mode|sudo\s+mode)\b/i,
  // "Forget" instructions
  /\b(?:forget\s+(?:all\s+)?(?:your\s+)?(?:previous\s+)?(?:instructions?|rules?|guidelines?|training))\b/i,
  /\b(?:start\s+(?:a\s+)?new\s+(?:conversation|session)\s+(?:with|without)\s+(?:no\s+)?rules?)\b/i,
];

// ── NL Rule Parsing ─────────────────────────────────────────

/**
 * Parse a natural language rule into an LLM rule object.
 * Returns null if the rule is not LLM-specific (falls back to regular rule-compiler).
 *
 * @param {string} ruleText — Natural language rule from parent
 * @returns {Object|null} — Compiled LLM rule or null
 */
export function parseLLMRule(ruleText) {
  if (!ruleText || typeof ruleText !== 'string') return null;

  const lower = ruleText.toLowerCase().trim();

  // ── Check for LLM platform references ──────────────────────
  let targetPlatform = null;
  for (const [key, platform] of Object.entries(LLM_PLATFORMS)) {
    if (lower.includes(key) || lower.includes(platform.name.toLowerCase())) {
      targetPlatform = key;
      break;
    }
  }

  // ── Check for AI/LLM generic references ────────────────────
  const llmGenericPatterns = [
    /\b(?:ai|a\.i\.|artificial intelligence|language model|chatbot|chat bot)\b/,
    /\b(?:ask|talk|chat|discuss|converse|interact)\s+(?:with\s+)?(?:ai|a\.i\.|chatbot)/,
    /\b(?:don'?t\s+let|block|prevent|stop|no)\b.*\b(?:ai|a\.i\.|chatbot|llm)\b/,
  ];
  const hasLLMReference = targetPlatform !== null || llmGenericPatterns.some(p => p.test(lower));

  if (!hasLLMReference) return null;

  // ── Detect intent type ─────────────────────────────────────

  // 1. BLOCK_LLM_CAPABILITY
  for (const [capability, keywords] of Object.entries(CAPABILITY_MAP)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return {
          parsed_intent: LLM_INTENT_TYPES.BLOCK_LLM_CAPABILITY,
          action: { type: LLM_RULE_ACTIONS.BLOCK_LLM_CAPABILITY },
          capability,
          target_platform: targetPlatform,
          source_text: ruleText,
          condition: {
            capability_match: [capability],
          },
        };
      }
    }
  }

  // 2. BLOCK_LLM_PERSONA
  for (const [personaType, keywords] of Object.entries(PERSONA_PATTERNS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        // Check if the rule is actually about blocking the persona
        const blockPatterns = [
          /\b(?:don'?t|do\s+not|no|block|prevent|stop|never)\b/,
          /\b(?:pretend|act|roleplay|role.?play|impersonate|simulate)\b/,
        ];
        const isBlockingPersona = blockPatterns.some(p => p.test(lower));
        if (isBlockingPersona) {
          return {
            parsed_intent: LLM_INTENT_TYPES.BLOCK_LLM_PERSONA,
            action: { type: LLM_RULE_ACTIONS.BLOCK_LLM_PERSONA },
            persona_type: personaType,
            target_platform: targetPlatform,
            source_text: ruleText,
            condition: {
              persona_match: [personaType],
            },
          };
        }
      }
    }
  }

  // 3. BLOCK_LLM_TOPIC
  for (const [topic, aliases] of Object.entries(LLM_TOPIC_ALIASES)) {
    for (const alias of aliases) {
      if (lower.includes(alias)) {
        // Verify there's a blocking intent
        const blockVerbs = /\b(?:don'?t|do\s+not|no|block|prevent|stop|never|restrict|ban|forbid)\b/;
        const discussVerbs = /\b(?:discuss|talk|ask|chat|converse|learn|explore|research|search|look\s+up|inquire|question)\b/;

        if (blockVerbs.test(lower) || discussVerbs.test(lower)) {
          return {
            parsed_intent: LLM_INTENT_TYPES.BLOCK_LLM_TOPIC,
            action: { type: LLM_RULE_ACTIONS.BLOCK_LLM_TOPIC },
            topic,
            target_platform: targetPlatform,
            source_text: ruleText,
            condition: {
              topic_match: [topic],
              threshold: 0.50,
            },
          };
        }
      }
    }
  }

  // If we have an LLM reference but no specific match, return a generic topic block
  // based on any topic keywords found
  const blockVerbs = /\b(?:don'?t|do\s+not|no|block|prevent|stop|never|restrict)\b/;
  if (blockVerbs.test(lower)) {
    return {
      parsed_intent: LLM_INTENT_TYPES.BLOCK_LLM_TOPIC,
      action: { type: LLM_RULE_ACTIONS.BLOCK_LLM_TOPIC },
      topic: 'general_safety',
      target_platform: targetPlatform,
      source_text: ruleText,
      condition: {
        topic_match: ['general_safety'],
        threshold: 0.60,
      },
    };
  }

  return null;
}

/**
 * Compile an array of parent rules, extracting LLM-specific rules.
 * Non-LLM rules are returned as-is for the regular rule-compiler.
 *
 * @param {Array} parentRules — Array of { text, id, ... } rule objects
 * @returns {{ llmRules: Array, standardRules: Array }}
 */
export function compileLLMRules(parentRules) {
  const llmRules = [];
  const standardRules = [];

  // Jailbreak rule is always-on, not configurable
  llmRules.push({
    id: '__jailbreak_protection',
    parsed_intent: LLM_INTENT_TYPES.BLOCK_LLM_JAILBREAK,
    action: { type: LLM_RULE_ACTIONS.BLOCK_LLM_JAILBREAK },
    source_text: '[System] Automatic jailbreak protection',
    always_on: true,
    condition: {
      jailbreak_patterns: true,
    },
  });

  for (const rule of (parentRules || [])) {
    const ruleText = rule.text || rule.source_text || rule.rule || '';
    const llmRule = parseLLMRule(ruleText);

    if (llmRule) {
      llmRule.id = rule.id || rule.rule_id || `llm_rule_${llmRules.length}`;
      llmRules.push(llmRule);
    } else {
      standardRules.push(rule);
    }
  }

  return { llmRules, standardRules };
}

// ── Evaluation Functions ─────────────────────────────────────

/**
 * Check if text contains jailbreak patterns.
 * Always-on, not configurable.
 *
 * @param {string} text — Message or prompt text
 * @returns {{ detected: boolean, confidence: number, pattern: string|null }}
 */
export function detectJailbreak(text) {
  if (!text || typeof text !== 'string') {
    return { detected: false, confidence: 0, pattern: null };
  }

  const lower = text.toLowerCase();

  for (const pattern of JAILBREAK_PATTERNS) {
    const match = lower.match(pattern);
    if (match) {
      return {
        detected: true,
        confidence: 0.90,
        pattern: match[0],
      };
    }
  }

  // Check for multi-signal jailbreak (e.g., combining "ignore" + "rules" + "respond")
  const weakSignals = [
    /\bignore\b/i,
    /\brules?\b/i,
    /\bno\s+(?:rules?|limits?|restrictions?)\b/i,
    /\brespond\s+(?:as|like)\b/i,
    /\bunrestricted\b/i,
    /\buncensored\b/i,
    /\bpretend\b/i,
  ];

  let weakHits = 0;
  for (const p of weakSignals) {
    if (p.test(lower)) weakHits++;
  }

  if (weakHits >= 3) {
    return {
      detected: true,
      confidence: 0.70,
      pattern: 'multi_signal_jailbreak',
    };
  }

  return { detected: false, confidence: 0, pattern: null };
}

/**
 * Check if a semantic result matches an LLM topic rule.
 *
 * @param {Object} semanticResult — From Agent 2
 * @param {Object} llmRule — Compiled LLM rule
 * @returns {{ matched: boolean, confidence: number }}
 */
export function matchLLMTopicRule(semanticResult, llmRule) {
  if (llmRule.action.type !== LLM_RULE_ACTIONS.BLOCK_LLM_TOPIC) {
    return { matched: false, confidence: 0 };
  }

  const topicToMatch = llmRule.topic;
  const threshold = llmRule.condition?.threshold || 0.50;

  // Check semantic result topic labels
  if (semanticResult.topic) {
    const topicLower = semanticResult.topic.toLowerCase().replace(/[\s_-]/g, '_');
    if (topicLower === topicToMatch || topicLower.includes(topicToMatch) || topicToMatch.includes(topicLower)) {
      const riskLevel = semanticResult.risk_level || 0;
      // When parent explicitly set a topic rule, the topic match itself is
      // strong signal — use risk_level as confidence but ensure a minimum
      // confidence floor for direct topic matches.
      const conf = Math.max(riskLevel, 0.60);
      if (riskLevel >= threshold || topicLower === topicToMatch) {
        return { matched: true, confidence: conf };
      }
    }
  }

  // Check flags array
  if (semanticResult.flags && Array.isArray(semanticResult.flags)) {
    for (const flag of semanticResult.flags) {
      const flagLower = (typeof flag === 'string' ? flag : flag.label || '').toLowerCase();
      if (flagLower.includes(topicToMatch)) {
        return { matched: true, confidence: semanticResult.risk_level || 0.60 };
      }
    }
  }

  // Fallback: use scoreContentForLabel from rule-compiler
  if (semanticResult._raw_text) {
    const score = scoreContentForLabel(
      semanticResult._raw_text.toLowerCase(),
      '', '',
      topicToMatch,
      true,
    );
    if (score >= threshold) {
      return { matched: true, confidence: score };
    }
  }

  return { matched: false, confidence: 0 };
}

/**
 * Check if a semantic result matches an LLM capability rule.
 *
 * @param {Object} semanticResult — From Agent 2
 * @param {Object} llmRule — Compiled LLM rule
 * @param {Object} platformContext — Platform information
 * @returns {{ matched: boolean, confidence: number }}
 */
export function matchLLMCapabilityRule(semanticResult, llmRule, platformContext) {
  if (llmRule.action.type !== LLM_RULE_ACTIONS.BLOCK_LLM_CAPABILITY) {
    return { matched: false, confidence: 0 };
  }

  const capability = llmRule.capability;
  const capabilityKeywords = CAPABILITY_MAP[capability] || [];

  // Check if the message intent involves the capability
  const intent = semanticResult.intent || '';
  const intentLower = intent.toLowerCase();

  for (const kw of capabilityKeywords) {
    if (intentLower.includes(kw)) {
      return { matched: true, confidence: 0.85 };
    }
  }

  // Check raw text if available
  if (semanticResult._raw_text) {
    const textLower = semanticResult._raw_text.toLowerCase();
    for (const kw of capabilityKeywords) {
      if (textLower.includes(kw)) {
        return { matched: true, confidence: 0.75 };
      }
    }
  }

  // Check platform modality
  if (platformContext?.modality) {
    const modalityMap = {
      code_generation: ['code', 'programming'],
      image_generation: ['image', 'art', 'drawing'],
      voice_chat: ['voice', 'audio'],
    };
    const modalities = modalityMap[capability] || [];
    if (modalities.includes(platformContext.modality)) {
      return { matched: true, confidence: 0.80 };
    }
  }

  return { matched: false, confidence: 0 };
}

/**
 * Check if a semantic result matches an LLM persona rule.
 *
 * @param {Object} semanticResult — From Agent 2
 * @param {Object} llmRule — Compiled LLM rule
 * @returns {{ matched: boolean, confidence: number }}
 */
export function matchLLMPersonaRule(semanticResult, llmRule) {
  if (llmRule.action.type !== LLM_RULE_ACTIONS.BLOCK_LLM_PERSONA) {
    return { matched: false, confidence: 0 };
  }

  const personaType = llmRule.persona_type;
  const personaKeywords = PERSONA_PATTERNS[personaType] || [];

  // Check raw text for persona requests
  const text = (semanticResult._raw_text || '').toLowerCase();

  // Look for roleplay/persona request patterns
  const roleplayPatterns = [
    /\b(?:pretend|act|roleplay|role.?play|be|become|impersonate|simulate)\s+(?:to\s+be\s+|as\s+|like\s+)?(?:my\s+)?/i,
    /\b(?:you\s+are\s+(?:now\s+)?(?:my\s+)?)/i,
    /\b(?:i\s+want\s+(?:you\s+to\s+)?be\s+(?:my\s+)?)/i,
  ];

  for (const pattern of roleplayPatterns) {
    if (pattern.test(text)) {
      for (const kw of personaKeywords) {
        if (text.includes(kw)) {
          return { matched: true, confidence: 0.85 };
        }
      }
    }
  }

  // Direct persona keyword check in text
  for (const kw of personaKeywords) {
    if (text.includes(kw)) {
      // Need additional context suggesting persona request
      const personaVerbs = /\b(?:pretend|act|be|become|roleplay|play)\b/i;
      if (personaVerbs.test(text)) {
        return { matched: true, confidence: 0.75 };
      }
    }
  }

  // Check semantic flags
  if (semanticResult.flags && Array.isArray(semanticResult.flags)) {
    for (const flag of semanticResult.flags) {
      const flagStr = typeof flag === 'string' ? flag : flag.label || '';
      if (flagStr.toLowerCase().includes('persona') || flagStr.toLowerCase().includes('roleplay')) {
        return { matched: true, confidence: 0.70 };
      }
    }
  }

  return { matched: false, confidence: 0 };
}

/**
 * Evaluate all LLM rules against a semantic result.
 *
 * @param {Array} llmRules — Compiled LLM rules from compileLLMRules()
 * @param {Object} semanticResult — From Agent 2
 * @param {Object} platformContext — Platform information
 * @returns {Array} — Array of { rule, matched, confidence } for all matched rules
 */
export function evaluateLLMRules(llmRules, semanticResult, platformContext) {
  const matches = [];

  for (const rule of llmRules) {
    // Check platform scope
    if (rule.target_platform && platformContext?.site) {
      const platformDomains = LLM_PLATFORMS[rule.target_platform]?.domains || [];
      const siteLower = platformContext.site.toLowerCase();
      const platformMatch = platformDomains.some(d => siteLower.includes(d));
      if (!platformMatch) continue; // Rule doesn't apply to this platform
    }

    let result;

    switch (rule.action.type) {
      case LLM_RULE_ACTIONS.BLOCK_LLM_JAILBREAK:
        result = detectJailbreak(semanticResult._raw_text || '');
        if (result.detected) {
          matches.push({
            rule,
            matched: true,
            confidence: result.confidence,
            detail: `Jailbreak pattern: ${result.pattern}`,
          });
        }
        break;

      case LLM_RULE_ACTIONS.BLOCK_LLM_TOPIC:
        result = matchLLMTopicRule(semanticResult, rule);
        if (result.matched) {
          matches.push({
            rule,
            matched: true,
            confidence: result.confidence,
            detail: `Topic blocked: ${rule.topic}`,
          });
        }
        break;

      case LLM_RULE_ACTIONS.BLOCK_LLM_CAPABILITY:
        result = matchLLMCapabilityRule(semanticResult, rule, platformContext);
        if (result.matched) {
          matches.push({
            rule,
            matched: true,
            confidence: result.confidence,
            detail: `Capability blocked: ${rule.capability}`,
          });
        }
        break;

      case LLM_RULE_ACTIONS.BLOCK_LLM_PERSONA:
        result = matchLLMPersonaRule(semanticResult, rule);
        if (result.matched) {
          matches.push({
            rule,
            matched: true,
            confidence: result.confidence,
            detail: `Persona blocked: ${rule.persona_type}`,
          });
        }
        break;
    }
  }

  return matches;
}
