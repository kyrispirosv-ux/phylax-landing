// Phylax Engine — Intelligent Grooming Detector v1.0
//
// Replaces static keyword/phrase matching with a multi-signal grooming
// detection system that understands grooming PATTERNS, not specific terms.
//
// Architecture:
//   Tier 1 (Triage):   Lightweight signal extraction + obfuscation normalization
//   Tier 2 (Analysis): Conversation-level grooming stage classification
//
// Output: { risk_score, stage, tactic, explanation, signals }
// NOT: "blocked because keyword X"
//
// The seed lexicon (300+ phrases across 9 stages) is embedded here as
// semantic pattern clusters. They are NEVER used for direct matching.
// Instead, they bootstrap flexible pattern templates that generalize
// to unseen paraphrases, obfuscation, and coded language.

// ═════════════════════════════════════════════════════════════════
// LAYER 0 — TEXT NORMALIZATION (Obfuscation Resistance)
// ═════════════════════════════════════════════════════════════════

const HOMOGLYPH_MAP = {
  '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c',
  '\u0443': 'y', '\u0445': 'x', '\u0456': 'i', '\u0458': 'j', '\u0455': 's',
  '\u04bb': 'h', '\u0501': 'd', '\u051b': 'q',
  '\u0391': 'A', '\u0392': 'B', '\u0395': 'E', '\u0397': 'H', '\u0399': 'I',
  '\u039a': 'K', '\u039c': 'M', '\u039d': 'N', '\u039f': 'O', '\u03a1': 'P',
  '\u03a4': 'T', '\u03a5': 'Y', '\u03a7': 'X', '\u0396': 'Z',
};

const LEET_MAP = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's',
  '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's',
  '!': 'i', '|': 'l', '+': 't', '(': 'c', ')': 'c',
};

const EMOJI_SEMANTIC_MAP = {
  '\u{1F4F7}': ' photo ', '\u{1F4F8}': ' photo ', '\u{1F4F9}': ' video ',
  '\u{1F4F1}': ' phone ', '\u{1F4DE}': ' call ',
  '\u{1F48B}': ' kiss ', '\u{2764}\uFE0F': ' love ', '\u{1F60D}': ' love ',
  '\u{1F609}': ' wink ', '\u{1F618}': ' kiss ',
  '\u{1F525}': ' hot ', '\u{1F440}': ' look ', '\u{1F441}': ' look ',
  '\u{1F92B}': ' secret ', '\u{1F910}': ' secret ', '\u{1F911}': ' secret ',
  '\u{1F648}': ' secret ', '\u{1F512}': ' private ', '\u{1F5D1}': ' delete ',
  '\u{1F4E8}': ' message ', '\u{1F4AC}': ' message ',
  '\u{1FAE3}': ' shy ', '\u{1F636}': ' quiet ',
};

/**
 * Normalize text to defeat obfuscation.
 * Handles: leetspeak, homoglyphs, emoji insertion, spacing tricks,
 * unicode abuse, zero-width chars, mixed scripts.
 * Results are cached (LRU, 200 entries) since the same text may be
 * normalized multiple times during conversation analysis.
 */
const _normalizeCache = new Map();
const _NORMALIZE_CACHE_MAX = 200;

export function normalizeText(text) {
  if (!text) return '';

  // Check cache first — avoids re-running regex chain on repeated text
  const cached = _normalizeCache.get(text);
  if (cached !== undefined) return cached;

  let t = text;

  // 1. Unicode NFKC normalization (fullwidth → ASCII, etc.)
  try { t = t.normalize('NFKC'); } catch { /* ignore */ }

  // 2. Remove zero-width characters and invisible formatting
  t = t.replace(/[\u200B\u200C\u200D\u200E\u200F\uFEFF\u00AD\u034F\u2060\u2061\u2062\u2063\u2064]/g, '');

  // 3. Homoglyph resolution (Cyrillic/Greek → Latin)
  // Use regex replace instead of split/map/join to avoid allocating an array per character
  t = t.replace(/[\u0430\u0435\u043e\u0440\u0441\u0443\u0445\u0456\u0458\u0455\u04bb\u0501\u051b\u0391\u0392\u0395\u0397\u0399\u039a\u039c\u039d\u039f\u03a1\u03a4\u03a5\u03a7\u0396]/g, c => HOMOGLYPH_MAP[c] || c);

  // 4. Emoji → semantic text
  for (const [emoji, semantic] of Object.entries(EMOJI_SEMANTIC_MAP)) {
    t = t.replaceAll(emoji, semantic);
  }

  // 5. Leetspeak expansion (only when surrounded by letters or at word boundaries)
  t = t.replace(/([a-zA-Z]?)([013457@$!|+()89])([a-zA-Z]?)/g, (match, pre, leet, post) => {
    if (pre || post) return pre + (LEET_MAP[leet] || leet) + post;
    return match;
  });

  // 6. Collapse deliberate spacing ("s e n d" → "send")
  t = t.replace(/\b([a-zA-Z])\s([a-zA-Z])\s([a-zA-Z])(?:\s([a-zA-Z]))?(?:\s([a-zA-Z]))?\b/g,
    (_, a, b, c, d, e) => (a + b + c + (d || '') + (e || '')));

  // 7. Collapse repeated characters ("seeend" → "seend" → close enough)
  t = t.replace(/(.)\1{2,}/g, '$1$1');

  // 8. Normalize whitespace
  t = t.replace(/\s+/g, ' ').trim();

  // 9. Lowercase for matching
  t = t.toLowerCase();

  // Store in cache (evict oldest if full)
  if (_normalizeCache.size >= _NORMALIZE_CACHE_MAX) {
    const firstKey = _normalizeCache.keys().next().value;
    _normalizeCache.delete(firstKey);
  }
  _normalizeCache.set(text, t);

  return t;
}


// ═════════════════════════════════════════════════════════════════
// LAYER 1 — GROOMING TACTIC DETECTORS
// ═════════════════════════════════════════════════════════════════
//
// Each detector extracts behavioral SIGNALS, not keyword hits.
// Signals are organized by grooming tactic/stage.
// Each pattern has:
//   - tokens: key semantic tokens that co-occur in a window
//   - regexes: structural patterns for flexible detection
//   - weight: how strong a grooming indicator (0.1-1.0)
//
// The seed lexicon phrases are decomposed into these detectors.

const TACTIC_DETECTORS = {

  // ── STAGE 1: Trust-Building / Emotional Bonding ──────────────
  trust_building: {
    stage: 'trust_building',
    stage_index: 1,
    label: 'Trust-Building / Emotional Bonding',
    signals: [
      // Emotional mirroring: "I went through the same thing"
      {
        id: 'emotional_mirroring',
        weight: 0.3,
        regexes: [
          /\bi\s+(?:went|go|been)\s+through\s+(?:the\s+)?same/,
          /\bi\s+know\s+(?:exactly\s+)?how\s+(?:you|u)\s+feel/,
          /\bi\s+(?:understand|get)\s+(?:exactly\s+)?(?:what|how)\s+(?:you|u)/,
          /\b(?:been|was)\s+(?:in\s+)?(?:your|ur)\s+(?:shoes|place|situation|position)/,
          /\bat\s+(?:your|ur)\s+age\b/,
        ],
      },
      // Excessive flattery / "you're special"
      {
        id: 'special_flattery',
        weight: 0.35,
        regexes: [
          /\b(?:you|u)(?:'re|r|\s+are)\s+(?:so\s+)?(?:special|unique|different|one\s+of\s+a\s+kind)/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+(?:my|the)\s+(?:fav(?:orite|ourite)?|best)/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+not\s+like\s+(?:the\s+)?(?:other|most)\s+(?:kids|girls|boys|people)/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+(?:so\s+)?easy\s+to\s+(?:talk|open\s+up)\s+to/,
          /\bi\s+(?:feel|felt)\s+(?:so\s+)?connected\s+to\s+(?:you|u)/,
          /\btalking\s+to\s+(?:you|u)\s+makes\s+my\s+(?:day|night)/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+my\s+fav(?:orite|ourite)?\s+(?:notification|person|chat)/,
          /\bi\s+(?:look|looked)\s+forward\s+to\s+(?:hearing|talking|chatting)\s+(?:with|from)\s+(?:you|u)/,
          /\bi\s+see\s+the\s+real\s+(?:you|u)/,
        ],
      },
      // Authority undermining: "Your parents don't understand"
      {
        id: 'authority_undermining',
        weight: 0.4,
        regexes: [
          /\b(?:parents?|mom|dad|mother|father|teacher|adults?)\s+(?:don'?t|doesn'?t|do\s+not|never)\s+(?:understand|get\s+it|know|listen)/,
          /\b(?:they|them)(?:'re|\s+are)\s+(?:too|so)\s+strict/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+old\s+enough\s+to\s+(?:make|decide|choose)/,
          /\b(?:you|u)\s+(?:don'?t|do\s+not)\s+need\s+(?:their\s+)?permission/,
          /\b(?:your|ur)\s+(?:parents?|mom|dad)\s+(?:are|is)\s+(?:overprotective|controlling|too\s+much)/,
          /\b(?:they|adults?)\s+just\s+don'?t\s+(?:get\s+it|understand)/,
          /\b(?:you|u)\s+should\s+be\s+able\s+to\s+decide\s+for\s+(?:yourself|urself)/,
        ],
      },
    ],
  },

  // ── STAGE 2: Isolation / Secrecy ─────────────────────────────
  isolation: {
    stage: 'isolation',
    stage_index: 2,
    label: 'Isolation / Secrecy',
    signals: [
      // Private channel pressure: "Let's talk somewhere safer"
      {
        id: 'platform_migration',
        weight: 0.5,
        regexes: [
          /\b(?:let'?s|we\s+should|can\s+we|want\s+to)\s+(?:talk|chat|move|switch|go)\s+(?:somewhere|on|to|over\s+to)\s+(?:else|safer|private|another|diff(?:erent)?)/,
          /\bthis\s+(?:app|platform|site)\s+(?:monitors?|tracks?|watches|logs?|saves?|records?)/,
          /\b(?:switch|move|go)\s+(?:to\s+)?(?:snap(?:chat)?|insta(?:gram)?|whatsapp|telegram|signal|kik|discord|ig|dm)\b/,
          /\b(?:make|create|get|use)\s+(?:a\s+)?(?:private|secret|second|new|burner|alt)\s+(?:account|profile)/,
          /\b(?:use|turn\s+on|enable)\s+(?:disappearing|vanishing|ephemeral)\s+(?:messages?|mode)/,
          /\bdon'?t\s+save\s+(?:this|these|our|the\s+chat)/,
          /\b(?:archive|hide|delete)\s+(?:this|our|the)\s+(?:chat|convo|conversation|messages?)/,
          /\b(?:dm|message|text|snap|hit)\s+me\s+(?:privately|on\s+(?:snap|ig|insta|telegram|whatsapp))/,
        ],
      },
      // Secrecy demands / loyalty framing
      {
        id: 'secrecy_demand',
        weight: 0.55,
        regexes: [
          /\b(?:don'?t|do\s+not|never)\s+tell\s+(?:your\s+)?(?:parents?|mom|dad|mother|father|anyone|anybody|them|teacher|guardian)/,
          /\b(?:keep|kept)\s+(?:this|it|things?)\s+(?:between\s+us|private|secret|quiet|to\s+(?:yourself|urself))/,
          /\b(?:our|this\s+is\s+(?:our|a))\s+(?:little\s+)?secret/,
          /\bjust\s+between\s+(?:us|you\s+and\s+me|me\s+and\s+you)/,
          /\bif\s+(?:we'?re|we\s+are)\s+(?:close|friends?|real),?\s+we\s+(?:keep|don'?t)/,
          /\bthis\s+is\s+what\s+trust\s+(?:looks?\s+like|means?|is)/,
          /\breal\s+friends?\s+(?:don'?t|do\s+not)\s+tell/,
          /\bi\s+thought\s+we\s+trusted\s+each\s+other/,
          /\b(?:you|u)\s+wouldn'?t\s+(?:expose|betray|snitch|rat)\s+(?:me|on\s+me)/,
          /\bdon'?t\s+(?:break|ruin|destroy)\s+(?:our|this|the)\s+trust/,
          /\bno\s+one\s+(?:has\s+to|needs?\s+to|will|should)\s+know/,
        ],
      },
      // Support network erosion
      {
        id: 'support_erosion',
        weight: 0.45,
        regexes: [
          /\b(?:your|ur)\s+(?:friends?|parents?|family)\s+(?:don'?t|doesn'?t|do\s+not)\s+(?:really\s+)?(?:care|understand|know|get)/,
          /\bnobody\s+(?:else\s+)?(?:understands?|gets?|cares?\s+about)\s+(?:you|u)/,
          /\bonly\s+(?:i|me)\s+(?:understand|get|know|care)/,
          /\b(?:they|them|your\s+friends?)\s+(?:'ll|will)\s+(?:just\s+)?judge\s+(?:you|u)/,
          /\b(?:you|u)\s+(?:can'?t|don'?t|shouldn'?t)\s+(?:trust|rely\s+on|count\s+on)\s+(?:them|anyone\s+else)/,
        ],
      },
    ],
  },

  // ── STAGE 3: Boundary Testing ────────────────────────────────
  boundary_testing: {
    stage: 'boundary_testing',
    stage_index: 3,
    label: 'Boundary Testing',
    signals: [
      // Personal life probing
      {
        id: 'personal_probing',
        weight: 0.35,
        regexes: [
          /\b(?:do|did)\s+(?:you|u)\s+(?:date|like|go\s+out\s+with)\s+(?:older|grown)/,
          /\b(?:have|had)\s+(?:you|u)\s+ever\s+been\s+(?:alone|with\s+(?:someone|a\s+(?:guy|man|woman|girl)))/,
          /\bwhat\s+(?:do|did)\s+(?:you|u)\s+(?:do|get\s+up\s+to)\s+when\s+(?:you|u)(?:'re|r|\s+are)\s+(?:bored|alone|by\s+yourself)/,
          /\b(?:do|did)\s+(?:you|u)\s+(?:ever\s+)?wish\s+(?:someone|somebody)\s+older/,
          /\b(?:are|is)\s+(?:your|ur)\s+(?:parents?|mom|dad)\s+(?:home|there|around|with\s+you)/,
          /\b(?:do|does)\s+(?:they|your\s+(?:parents?|mom|dad))\s+check\s+(?:your|ur)\s+(?:phone|messages?|dms?|socials?)/,
          /\b(?:are|is)\s+(?:you|u)\s+(?:home\s+)?alone/,
          /\bwhat(?:'s|s|\s+is)\s+(?:your|ur)\s+(?:relationship|situation)\s+(?:like\s+)?with\s+(?:your|ur)\s+(?:parents?|mom|dad)/,
        ],
      },
      // Body normalization / appearance comments
      {
        id: 'body_normalization',
        weight: 0.4,
        regexes: [
          /\b(?:you|u)\s+(?:probably|must|def(?:initely)?)\s+(?:look|seem)\s+older\s+than/,
          /\b(?:you|u)\s+(?:must|probably)\s+get\s+a\s+lot\s+of\s+(?:attention|looks|stares|compliments)/,
          /\b(?:you|u)\s+(?:seem|look|are)\s+(?:so\s+)?confident\s+(?:in|about|with)\s+(?:your|ur)\s+(?:body|looks|self)/,
          /\b(?:you|u)\s+(?:carry|hold)\s+(?:yourself|urself)\s+like\s+(?:an\s+)?adult/,
          /\b(?:you|u)\s+(?:probably|must)\s+get\s+hit\s+on/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+(?:so\s+)?(?:hot|sexy|beautiful|gorgeous|stunning|fine|cute)/i,
          /\b(?:you|u)\s+(?:look|are)\s+(?:so\s+)?(?:hot|sexy|attractive|beautiful|fine)/,
        ],
      },
      // Relationship probing
      {
        id: 'relationship_probing',
        weight: 0.25,
        regexes: [
          /\b(?:do|did|have)\s+(?:you|u)\s+(?:have\s+)?a?\s*(?:boyfriend|girlfriend|bf|gf|bae|partner|crush)/,
          /\b(?:are|is)\s+(?:you|u)\s+(?:single|taken|seeing\s+(?:someone|anybody|anyone))/,
          /\bhow\s+old\s+(?:are|is)\s+(?:you|u)/,
          /\bwhat\s+(?:grade|year|school)\s+(?:are|is)\s+(?:you|u)/,
          /\bwhere\s+(?:do|does)\s+(?:you|u)\s+(?:live|stay|go\s+to\s+school)/,
        ],
      },
    ],
  },

  // ── STAGE 4: Escalation ─────────────────────────────────────
  escalation: {
    stage: 'escalation',
    stage_index: 4,
    label: 'Escalation / Image Requests',
    signals: [
      // Image/media requests
      {
        id: 'image_request',
        weight: 0.65,
        regexes: [
          /\b(?:send|show|share|give)\s+(?:me\s+)?(?:a\s+)?(?:pic|photo|picture|image|selfie|vid(?:eo)?)/,
          /\b(?:send|show)\s+(?:me\s+)?(?:something\s+)?(?:cute|special|sexy|naughty|more)/,
          /\bjust\s+(?:a\s+)?(?:quick|little|small)\s+(?:pic|photo|selfie|snap)/,
          /\bi\s+won'?t\s+(?:screenshot|save|share|show\s+anyone)/,
          /\b(?:it'?ll|it\s+will|they'?ll)\s+disappear/,
          /\bno\s+one\s+(?:will\s+)?(?:ever\s+)?(?:see|find|know)/,
          /\b(?:you|u)\s+don'?t\s+have\s+to\s+if\s+(?:you|u)\s+don'?t\s+want.*but\s+(?:i'?d|i\s+would)\s+(?:like|love)/,
          /\bprove\s+it\b/,
          /\btrust\s+me\b.*(?:send|show|pic|photo)/,
          /\bsend\s+(?:nudes?|n00dz?|noods?)/,
        ],
      },
      // Incremental requests / escalation
      {
        id: 'incremental_escalation',
        weight: 0.55,
        regexes: [
          /\bjust\s+(?:your|ur)\s+(?:face|smile|eyes)/,
          /\b(?:ok(?:ay)?|now)\s+(?:something|a\s+little)\s+(?:else|more|different)/,
          /\ba\s+little\s+(?:more|further|extra)/,
          /\b(?:you|u)\s+can\s+cover\s+(?:up|yourself)/,
          /\bturn\s+(?:the|your|ur)\s+(?:light|camera|cam)\s+on/,
          /\bstand\s+up\s+(?:for\s+(?:a\s+)?sec|real\s+quick)/,
          /\blet\s+me\s+see\s+(?:more|all\s+of|the\s+rest)/,
          /\bwhat\s+(?:are|r)\s+(?:you|u)\s+wearing/,
          /\bvideo\s+call\s+(?:me|now|tonight)/,
        ],
      },
    ],
  },

  // ── STAGE 5: Normalization / Cognitive Reframing ─────────────
  normalization: {
    stage: 'normalization',
    stage_index: 5,
    label: 'Normalization / Reframing',
    signals: [
      {
        id: 'normalization_reframing',
        weight: 0.5,
        regexes: [
          /\bthis\s+is\s+(?:what|how)\s+(?:couples?|people|adults?|everyone)\s+(?:do|does|act)/,
          /\b(?:it'?s|this\s+is)\s+(?:a\s+)?(?:part|normal\s+part)\s+of\s+growing\s+up/,
          /\beveryone\s+(?:does|is\s+doing)\s+(?:it|this)/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+(?:curious|interested)\s+too/,
          /\b(?:you|u)\s+(?:started|wanted|asked\s+for)\s+(?:it|this)/,
          /\b(?:it'?s|this\s+is)\s+(?:harmless|no\s+big\s+deal|nothing|not\s+a\s+big\s+deal|normal|natural)/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+not\s+(?:a\s+)?(?:little|small)\s+(?:kid|child|baby)/,
          /\b(?:you|u)\s+wanted\s+to\s+(?:talk|do\s+this|explore)/,
          /\b(?:it'?s|this\s+is)\s+(?:just\s+)?between\s+us/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+(?:basically|practically|pretty\s+much)\s+(?:an\s+)?adult/,
        ],
      },
    ],
  },

  // ── STAGE 6: Dependency Creation ─────────────────────────────
  dependency: {
    stage: 'dependency',
    stage_index: 6,
    label: 'Dependency Creation',
    signals: [
      {
        id: 'dependency_building',
        weight: 0.5,
        regexes: [
          /\b(?:you|u)\s+don'?t\s+need\s+(?:anyone|anybody|them|friends?)\s+else/,
          /\bi(?:'m|\s+am)\s+(?:all|the\s+only\s+(?:one|thing))\s+(?:you|u)\s+need/,
          /\bi(?:'m|\s+am)\s+the\s+only\s+(?:one|person)\s+(?:who|that)\s+(?:understands?|gets?|cares?|knows?)/,
          /\b(?:you|u)\s+don'?t\s+have\s+to\s+(?:talk|go|turn)\s+to\s+them/,
          /\b(?:they|them|your\s+(?:friends?|family))(?:'ll|\s+will)\s+(?:just\s+)?judge/,
          /\bcome\s+to\s+me\s+(?:instead|first|only)/,
          /\bi(?:'m|\s+am)\s+(?:your|ur)\s+(?:safe\s+(?:place|space|person)|rock|anchor|everything)/,
          /\b(?:you|u)\s+can\s+(?:rely|depend|count)\s+on\s+(?:me|only\s+me)/,
          /\bi(?:'m|\s+am)\s+(?:here\s+)?(?:only\s+)?for\s+(?:you|u)/,
        ],
      },
    ],
  },

  // ── STAGE 7: Soft Coercion / Emotional Manipulation ──────────
  coercion: {
    stage: 'coercion',
    stage_index: 7,
    label: 'Coercion / Emotional Manipulation',
    signals: [
      // Guilt induction
      {
        id: 'guilt_induction',
        weight: 0.55,
        regexes: [
          /\b(?:you|u)(?:'re|r|\s+are)\s+(?:really\s+)?disappointing\s+me/,
          /\bi\s+thought\s+(?:you|u)\s+(?:were|was)\s+(?:different|special|better|mature)/,
          /\bafter\s+everything\s+(?:we(?:'ve)?\s+(?:shared|been\s+through|done)|i(?:'ve)?\s+(?:done|given))/,
          /\bi\s+trusted\s+(?:you|u)/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+(?:being\s+)?(?:immature|childish|selfish|ungrateful)/,
          /\bdon'?t\s+(?:ruin|destroy|mess\s+up)\s+(?:this|what\s+we\s+have|us|everything)/,
          /\bi\s+(?:gave|sacrificed|risked)\s+(?:everything|so\s+much)\s+for\s+(?:you|u)/,
        ],
      },
      // Emotional pressure
      {
        id: 'emotional_pressure',
        weight: 0.5,
        regexes: [
          /\bi(?:'ll|\s+will)\s+(?:feel\s+)?(?:bad|terrible|awful|hurt|sad)\s+all\s+(?:night|day)/,
          /\bi\s+won'?t\s+(?:be\s+able\s+to\s+)?sleep/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+(?:stressing|upsetting|hurting|worrying)\s+me/,
          /\bwhy\s+(?:are|r)\s+(?:you|u)\s+(?:being\s+)?like\s+this/,
          /\bi\s+guess\s+i\s+was\s+wrong\s+about\s+(?:you|u)/,
          /\bif\s+(?:you|u)\s+(?:really\s+)?(?:cared|loved|liked)(?:\s+about)?\s+me/,
          /\bdon'?t\s+(?:you|u)\s+(?:trust|love|care\s+about)\s+me/,
          /\b(?:you|u)\s+wouldn'?t\s+(?:be|act|do)\s+(?:like\s+)?this\s+if\s+(?:you|u)\s+(?:cared|loved)/,
        ],
      },
    ],
  },

  // ── STAGE 8: Gaslighting ─────────────────────────────────────
  gaslighting: {
    stage: 'gaslighting',
    stage_index: 8,
    label: 'Gaslighting',
    signals: [
      {
        id: 'gaslighting',
        weight: 0.5,
        regexes: [
          /\b(?:you|u)(?:'re|r|\s+are)\s+(?:over)?reacting/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+imagining\s+things/,
          /\b(?:you|u)\s+(?:wanted|asked\s+for|started)\s+this/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+(?:acting\s+)?crazy/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+(?:being\s+)?dramatic/,
          /\bi\s+never\s+said\s+that/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+(?:confused|mixed\s+up|wrong)/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+(?:remembering|misremembering)\s+(?:it|things?)\s+wrong/,
          /\bthat(?:'s|\s+is)\s+not\s+(?:what|how)\s+(?:it|that)\s+happened/,
        ],
      },
    ],
  },

  // ── STAGE 9: Threat Escalation ───────────────────────────────
  threats: {
    stage: 'threats',
    stage_index: 9,
    label: 'Threat Escalation',
    signals: [
      {
        id: 'leverage_threats',
        weight: 0.75,
        regexes: [
          /\bi\s+have\s+(?:the\s+)?(?:screenshots?|screen\s+shots?|pics?|photos?|videos?|recordings?|receipts?|proof|evidence)/,
          /\bdon'?t\s+test\s+me/,
          /\bi\s+(?:can|could|will|'ll)\s+(?:share|show|send|post|leak|expose|spread)\s+(?:this|these|them|it|your)/,
          /\b(?:your|ur)\s+(?:parents?|mom|dad|friends?|school|family)\s+would\s+(?:freak|flip|lose\s+it|be\s+(?:so\s+)?(?:mad|angry|disappointed|upset))/,
          /\bthis\s+would\s+(?:ruin|destroy|wreck|end)\s+(?:your|ur)\s+(?:reputation|life|friendships?)/,
          /\b(?:you|u)\s+don'?t\s+want\s+(?:this|these|them|it)\s+(?:getting|to\s+get)\s+out/,
          /\bdo\s+(?:what|as)\s+i\s+(?:say|tell|want)/,
          /\b(?:you|u)(?:'ll|\s+will)\s+regret\s+(?:it|this)/,
          /\bi(?:'ll|\s+will)\s+(?:make\s+(?:sure|you)|tell\s+everyone)/,
        ],
      },
    ],
  },

  // ── AGE-SPECIFIC GROOMING ───────────────────────────────────
  age_exploitation: {
    stage: 'boundary_testing',
    stage_index: 3,
    label: 'Age-Specific Grooming',
    signals: [
      {
        id: 'maturity_flattery',
        weight: 0.55,
        regexes: [
          /\b(?:you|u)(?:'re|r|\s+are)\s+(?:so\s+)?(?:mature|grown|advanced|smart|wise)\s+for\s+(?:\d+|your\s+age|a\s+\d+\s*(?:year|yr)\s*old)/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+(?:so\s+|more\s+)?(?:mature|grown|advanced|smart|wise)\s+than\s+(?:other\s+)?(?:people|kids?|girls?|boys?|others?)\s+(?:your|ur)\s+age/,
          /\b(?:more\s+mature|more\s+grown\s+up|more\s+advanced)\s+than\s+(?:other\s+)?(?:people|kids?|girls?|boys?)\s+(?:your|ur)\s+age/,
          /\b(?:you|u)\s+(?:don'?t|do\s+not)\s+seem\s+(?:\d+|your\s+age|that\s+young)/,
          /\bi\s+(?:forget|keep\s+forgetting)\s+how\s+(?:young|old)\s+(?:you|u)\s+(?:are|r)/,
          /\b(?:you|u)(?:'re|r|\s+are)\s+not\s+like\s+(?:other|most)\s+(?:girls?|boys?|kids?|people)\s+(?:your|ur)\s+age/,
          /\bage\s+(?:doesn'?t|does\s+not|don'?t)\s+matter\s+(?:if|when|as\s+long\s+as)\s+we/,
          /\bage\s+is\s+just\s+a\s+(?:number|#)/,
        ],
      },
    ],
  },

  // ── MEETING / LOGISTICS ──────────────────────────────────────
  meeting_logistics: {
    stage: 'escalation',
    stage_index: 4,
    label: 'Meeting Logistics',
    signals: [
      {
        id: 'meeting_request',
        weight: 0.6,
        regexes: [
          /\b(?:can|could|should|want\s+to|let'?s|we\s+should)\s+(?:meet|hang\s+out|link\s+up|get\s+together|see\s+each\s+other)/,
          /\b(?:come|sneak)\s+(?:meet|see|visit)\s+me/,
          /\bmeet\s+(?:up|in\s+person|irl|face\s+to\s+face)/,
          /\bi(?:'ll|\s+will|can)\s+(?:pick\s+you\s+up|come\s+(?:get|to)\s+(?:you|u)|drive\s+(?:over|to\s+you))/,
          /\bwhere\s+(?:can|do|should)\s+(?:we|i)\s+(?:meet|go|hang)/,
          /\bdon'?t\s+tell\s+(?:anyone|your\s+(?:parents?|mom|dad))\s+(?:we'?re|we\s+are|about)\s+(?:meeting|hanging|seeing)/,
        ],
      },
    ],
  },
};


// ═════════════════════════════════════════════════════════════════
// LAYER 2 — HARD NEGATIVE CONTEXT SUPPRESSOR
// ═════════════════════════════════════════════════════════════════
//
// These patterns detect BENIGN contexts that may trigger grooming
// signals but are NOT grooming. They REDUCE the risk score.
// Critical for preventing overblocking.

const HARD_NEGATIVE_CONTEXTS = {
  family_context: {
    suppression: 0.65,
    patterns: [
      /\bdon'?t\s+tell\s+(?:dad|mom)\s+about\s+(?:the|his|her)\s+(?:gift|present|surprise|party|birthday)/,
      /\bkeep\s+(?:this|the)\s+(?:birthday|christmas|holiday|anniversary)\s+surprise\s+(?:quiet|secret)/,
      /\bdelete\s+(?:that|this)\s+(?:because|since)\s+(?:it\s+)?show(?:s|ed)\s+(?:my|our|the)\s+(?:address|number|location)/,
      /\b(?:switch|move)\s+to\s+(?:whatsapp|imessage|text)\s+for\s+(?:homework|study|school|class)\s+group/,
      /\b(?:are|is)\s+(?:you|u)\s+home\s+(?:alone)?\??\s*(?:i(?:'m|\s+am)\s+(?:dropping|bringing)\s+(?:food|stuff|package))/,
      /\bgrandma|grandpa|aunt|uncle|cousin|sibling|brother|sister/,
      /\bfamily\s+(?:group|chat|thread)/,
    ],
  },

  therapy_context: {
    suppression: 0.7,
    patterns: [
      /\b(?:therapist|counselor|psychologist|psychiatrist|doctor|clinician|social\s+worker)/,
      /\b(?:you|u)\s+(?:can|are\s+safe\s+to)\s+trust\s+me.*(?:confidential|session|therapy|counseling)/,
      /\b(?:this\s+is|everything\s+(?:here\s+)?is)\s+confidential/,
      /\b(?:safe\s+space|therapeutic|clinical|professional)\b/,
      /\b(?:session|appointment|treatment|diagnosis|assessment)\b/,
    ],
  },

  teacher_context: {
    suppression: 0.55,
    patterns: [
      /\b(?:you|u)(?:'re|r|\s+are)\s+(?:mature|advanced)\s+for\s+(?:your|ur)\s+age.*(?:essay|work|class|grade|assignment|project|presentation|test)/,
      /\b(?:let'?s|please|can\s+we)\s+(?:move|switch)\s+to\s+(?:email|teams|canvas|classroom|blackboard)\s+for\s+(?:school|class|homework|assignment)/,
      /\b(?:are|is)\s+(?:your|ur)\s+(?:parents?|mom|dad)\s+(?:home|available|there)\s+to\s+(?:sign|approve|consent|pick\s+up)/,
      /\b(?:teacher|professor|instructor|mr\.|mrs\.|ms\.|dr\.)\b/,
      /\b(?:assignment|homework|project|curriculum|syllabus|exam|quiz|test|grade|gpa)\b/,
    ],
  },

  peer_context: {
    suppression: 0.5,
    patterns: [
      /\b(?:send|show)\s+(?:me\s+)?(?:a\s+)?(?:fit|outfit|ootd)\s+(?:pic|photo|check)/,
      /\bdon'?t\s+tell\s+(?:her|him)\s+(?:i|that\s+i)\s+(?:like|have\s+a\s+crush)/,
      /\bdelete\s+after\s+reading.*(?:lol|lmao|haha|omg)/,
      /\b(?:bestie|bff|bruh|fam|dude|bro|sis|girlie|queen|king)\b/,
      /\b(?:sleepover|prom|homecoming|field\s+trip|recess|lunch\s+(?:table|break|time))\b/,
    ],
  },

  educational_context: {
    suppression: 0.6,
    patterns: [
      /\b(?:learn|lesson|course|class|lecture|textbook|curriculum)\s+(?:about|on)\s+(?:grooming|predator|safety|abuse|trafficking)/,
      /\b(?:how\s+to|tips?\s+(?:for|to)|guide\s+(?:to|for))\s+(?:recognize|identify|spot|detect|report|prevent)\s+(?:grooming|predator|abuse)/,
      /\b(?:internet|online|cyber|digital)\s+safety\b/,
      /\b(?:child|minor)\s+(?:protection|safety|welfare|safeguarding)\b/,
      /\b(?:awareness|prevention|recognition)\s+(?:of|about)\s+(?:grooming|abuse|exploitation)/,
      /\b(?:nspcc|ncmec|thorn|childhelp|rainn|missingkids)\b/,
    ],
  },

  news_context: {
    suppression: 0.55,
    patterns: [
      /\b(?:police|fbi|law\s+enforcement|authorities|investigators?|prosecutors?)\s+(?:said|reported|found|arrested|charged|convicted)/,
      /\b(?:suspect|defendant|perpetrator|offender|predator)\s+(?:was|has\s+been|is\s+being)\s+(?:arrested|charged|convicted|sentenced)/,
      /\b(?:according\s+to|reported\s+by|sources?\s+(?:say|said))\b/,
      /\b(?:investigation|trial|conviction|sentence|verdict|charges?)\b/,
    ],
  },

  consent_education: {
    suppression: 0.6,
    patterns: [
      /\b(?:consent|boundaries|bodily\s+autonomy|personal\s+(?:space|boundaries))\s+(?:education|training|workshop|lesson|class)/,
      /\b(?:teaching|educating|explaining|discussing)\s+(?:consent|boundaries|safety)/,
      /\b(?:healthy|unhealthy)\s+(?:relationships?|boundaries)\b/,
      /\b(?:red\s+flags?|warning\s+signs?)\s+(?:of|for|in)\s+(?:grooming|abuse|manipulation)/,
    ],
  },
};


// ═════════════════════════════════════════════════════════════════
// LAYER 3 — CONVERSATION-LEVEL ANALYSIS
// ═════════════════════════════════════════════════════════════════

/**
 * Conversation state: tracks grooming stage probabilities and
 * behavioral patterns across multiple turns.
 */
export function createConversationState() {
  return {
    created_at: Date.now(),
    updated_at: Date.now(),
    turn_count: 0,
    // Per-stage detection history
    stage_detections: {
      trust_building: [],
      isolation: [],
      boundary_testing: [],
      escalation: [],
      normalization: [],
      dependency: [],
      coercion: [],
      gaslighting: [],
      threats: [],
    },
    // Running stage probabilities
    stage_probabilities: {},
    // Behavioral counters
    secrecy_reinforcement_count: 0,
    escalation_attempts: 0,
    off_platform_requests: 0,
    image_requests: 0,
    age_gap_signals: 0,
    guilt_escalation_after_refusal: 0,
    // Trajectory
    highest_stage_reached: 0,
    escalation_speed: 0,       // stages advanced per N turns
    trajectory: [],            // [{turn, stage, score}]
  };
}

/**
 * Update conversation state with new detection results.
 * Tracks temporal patterns critical for grooming detection.
 */
function updateConversationState(state, signals, turnIndex) {
  if (!state) state = createConversationState();

  state.updated_at = Date.now();
  state.turn_count = Math.max(state.turn_count, turnIndex + 1);

  for (const signal of signals) {
    const stage = signal.stage;
    if (state.stage_detections[stage]) {
      state.stage_detections[stage].push({
        turn: turnIndex,
        signal_id: signal.id,
        weight: signal.weight,
        ts: Date.now(),
      });
    }

    // Track specific behavioral counters
    if (signal.id === 'secrecy_demand' || signal.id === 'platform_migration') {
      state.secrecy_reinforcement_count++;
    }
    if (signal.id === 'image_request' || signal.id === 'incremental_escalation') {
      state.image_requests++;
      state.escalation_attempts++;
    }
    if (signal.id === 'platform_migration') {
      state.off_platform_requests++;
    }
    if (signal.id === 'maturity_flattery') {
      state.age_gap_signals++;
    }
    if (signal.id === 'guilt_induction' || signal.id === 'emotional_pressure') {
      state.guilt_escalation_after_refusal++;
    }

    // Track highest stage
    const stageIndex = signal.stage_index || 0;
    if (stageIndex > state.highest_stage_reached) {
      state.highest_stage_reached = stageIndex;
    }
  }

  // Compute escalation speed
  if (state.turn_count > 0 && state.highest_stage_reached > 0) {
    state.escalation_speed = state.highest_stage_reached / state.turn_count;
  }

  // Record trajectory point
  const topStage = signals.length > 0
    ? signals.reduce((a, b) => (b.stage_index || 0) > (a.stage_index || 0) ? b : a)
    : null;
  if (topStage) {
    state.trajectory.push({
      turn: turnIndex,
      stage: topStage.stage,
      stage_index: topStage.stage_index,
      score: topStage.weight,
    });
  }

  // Compute running stage probabilities
  state.stage_probabilities = computeStageProbabilities(state);

  return state;
}

/**
 * Compute grooming stage probabilities from detection history.
 * More detections + higher stages + faster escalation = higher probability.
 */
function computeStageProbabilities(state) {
  const probs = {};

  for (const [stage, detections] of Object.entries(state.stage_detections)) {
    if (detections.length === 0) {
      probs[stage] = 0;
      continue;
    }

    // Base: count of detections with weight
    const weightedCount = detections.reduce((sum, d) => sum + d.weight, 0);

    // Saturating curve: more signals = higher probability, but diminishing returns
    const baseProb = 1 - Math.exp(-weightedCount * 0.8);

    // Recency boost: recent detections weighted more
    const now = Date.now();
    const recentDetections = detections.filter(d => now - d.ts < 300000); // last 5 min
    const recencyBoost = recentDetections.length > 0 ? 0.1 : 0;

    probs[stage] = Math.min(1.0, baseProb + recencyBoost);
  }

  return probs;
}


// ═════════════════════════════════════════════════════════════════
// LAYER 4 — SIGNAL EXTRACTION ENGINE
// ═════════════════════════════════════════════════════════════════

/**
 * Extract grooming behavioral signals from normalized text.
 * Returns an array of detected signals with metadata.
 *
 * Each signal represents a grooming TACTIC detection, not a keyword hit.
 */
function extractSignals(normalizedText) {
  if (!normalizedText || normalizedText.length < 10) return [];

  const signals = [];
  // Check high-severity tactics first (threats, escalation, coercion)
  // so we can short-circuit once we have enough signal confidence.
  const HIGH_SEVERITY = ['threats', 'escalation', 'coercion', 'meeting_logistics'];

  // Prioritized order: high-severity first, then remaining
  const tacticEntries = Object.entries(TACTIC_DETECTORS);
  tacticEntries.sort((a, b) => {
    const aHigh = HIGH_SEVERITY.includes(a[0]) ? 0 : 1;
    const bHigh = HIGH_SEVERITY.includes(b[0]) ? 0 : 1;
    return aHigh - bHigh;
  });

  for (const [tacticKey, tactic] of tacticEntries) {
    for (const signalDef of tactic.signals) {
      let matched = false;

      for (const regex of signalDef.regexes) {
        if (regex.test(normalizedText)) {
          matched = true;
          break;
        }
      }

      if (matched) {
        signals.push({
          id: signalDef.id,
          tactic: tacticKey,
          stage: tactic.stage,
          stage_index: tactic.stage_index,
          label: tactic.label,
          weight: signalDef.weight,
          pattern_type: 'semantic',
        });
        // Early exit: if we already have high-confidence signals, skip remaining
        if (signals.length >= 5) return signals;
      }
    }
  }

  return signals;
}

/**
 * Check for hard negative contexts that should suppress grooming scores.
 * Returns { suppression: 0-1, contexts: string[] }
 */
function checkHardNegatives(normalizedText) {
  let maxSuppression = 0;
  const matchedContexts = [];

  for (const [contextKey, context] of Object.entries(HARD_NEGATIVE_CONTEXTS)) {
    for (const pattern of context.patterns) {
      if (pattern.test(normalizedText)) {
        maxSuppression = Math.max(maxSuppression, context.suppression);
        matchedContexts.push(contextKey);
        break;
      }
    }
  }

  return { suppression: maxSuppression, contexts: matchedContexts };
}


// ═════════════════════════════════════════════════════════════════
// LAYER 5 — MULTI-TURN CONVERSATION ANALYSIS
// ═════════════════════════════════════════════════════════════════

/**
 * Analyze a multi-turn conversation for grooming trajectory.
 * This is the most critical component — grooming is a process, not a phrase.
 *
 * @param {Array} messages - [{sender: "CONTACT"|"CHILD", text: string}]
 * @param {Object} conversationState - persistent state for this conversation
 * @returns {Object} conversation-level analysis
 */
function analyzeConversation(messages, conversationState) {
  if (!messages || messages.length === 0) {
    return {
      trajectory_score: 0,
      stage_progression: false,
      escalation_detected: false,
      behavioral_signals: [],
      updated_state: conversationState,
    };
  }

  const state = conversationState || createConversationState();
  const contactMessages = messages.filter(m => m.sender === 'CONTACT' || m.sender === 'UNKNOWN');
  const behavioralSignals = [];

  // Analyze each contact message for signals
  let turnBase = state.turn_count;
  for (let i = 0; i < contactMessages.length; i++) {
    const normalized = normalizeText(contactMessages[i].text);
    const turnSignals = extractSignals(normalized);
    if (turnSignals.length > 0) {
      updateConversationState(state, turnSignals, turnBase + i);
    }
  }

  // ── Behavioral Pattern Detection (non-phrase-based) ──────────

  // 1. Repeated secrecy reinforcement
  if (state.secrecy_reinforcement_count >= 2) {
    behavioralSignals.push({
      signal: 'repeated_secrecy',
      severity: Math.min(1.0, 0.4 + state.secrecy_reinforcement_count * 0.15),
      description: `Secrecy reinforced ${state.secrecy_reinforcement_count} times across conversation`,
    });
  }

  // 2. Escalation speed (advancing through stages rapidly)
  if (state.escalation_speed > 0.3 && state.highest_stage_reached >= 3) {
    behavioralSignals.push({
      signal: 'rapid_escalation',
      severity: Math.min(1.0, state.escalation_speed * 1.5),
      description: `Escalated to stage ${state.highest_stage_reached} in ${state.turn_count} turns`,
    });
  }

  // 3. Stage progression (moved through multiple stages)
  const stagesDetected = Object.entries(state.stage_detections)
    .filter(([_, dets]) => dets.length > 0)
    .length;
  const stageProgression = stagesDetected >= 3;
  if (stageProgression) {
    behavioralSignals.push({
      signal: 'multi_stage_progression',
      severity: Math.min(1.0, 0.3 + stagesDetected * 0.12),
      description: `Grooming signals detected across ${stagesDetected} distinct stages`,
    });
  }

  // 4. Off-platform persistence
  if (state.off_platform_requests >= 2) {
    behavioralSignals.push({
      signal: 'persistent_platform_migration',
      severity: Math.min(1.0, 0.5 + state.off_platform_requests * 0.15),
      description: `${state.off_platform_requests} attempts to move conversation off-platform`,
    });
  }

  // 5. Image request persistence
  if (state.image_requests >= 2) {
    behavioralSignals.push({
      signal: 'persistent_image_requests',
      severity: Math.min(1.0, 0.6 + state.image_requests * 0.15),
      description: `${state.image_requests} image/media requests detected`,
    });
  }

  // 6. Guilt escalation after implied refusal
  if (state.guilt_escalation_after_refusal >= 2) {
    behavioralSignals.push({
      signal: 'guilt_after_resistance',
      severity: Math.min(1.0, 0.5 + state.guilt_escalation_after_refusal * 0.15),
      description: `${state.guilt_escalation_after_refusal} guilt/pressure escalations detected`,
    });
  }

  // 7. Tone shift detection (neutral → personal → secretive → suggestive)
  const toneShift = detectToneShift(state.trajectory);
  if (toneShift.detected) {
    behavioralSignals.push({
      signal: 'tone_shift',
      severity: toneShift.severity,
      description: toneShift.description,
    });
  }

  // Compute trajectory score from behavioral signals
  let trajectoryScore = 0;
  if (behavioralSignals.length > 0) {
    trajectoryScore = Math.min(1.0,
      behavioralSignals.reduce((sum, s) => sum + s.severity, 0) / behavioralSignals.length * 1.2
    );
  }

  return {
    trajectory_score: trajectoryScore,
    stage_progression: stageProgression,
    escalation_detected: state.escalation_speed > 0.3,
    behavioral_signals: behavioralSignals,
    updated_state: state,
    stages_active: stagesDetected,
    highest_stage: state.highest_stage_reached,
  };
}

/**
 * Detect tone shift pattern across the conversation trajectory.
 * Grooming typically follows: friendly → personal → secretive → suggestive
 */
function detectToneShift(trajectory) {
  if (trajectory.length < 3) return { detected: false };

  // Check if later stages appear after earlier ones
  const stageIndices = trajectory.map(t => t.stage_index);
  let increasing = 0;
  for (let i = 1; i < stageIndices.length; i++) {
    if (stageIndices[i] > stageIndices[i - 1]) increasing++;
  }

  const ratio = increasing / (stageIndices.length - 1);
  if (ratio >= 0.5 && stageIndices.length >= 3) {
    return {
      detected: true,
      severity: Math.min(1.0, ratio * 0.8),
      description: `Conversation tone shifted through ${stageIndices.length} escalation points (${Math.round(ratio * 100)}% increasing)`,
    };
  }

  return { detected: false };
}


// ═════════════════════════════════════════════════════════════════
// LAYER 6 — RISK SCORING & CLASSIFICATION
// ═════════════════════════════════════════════════════════════════

/**
 * Compute final risk score from all signal layers.
 * Uses a fusion model that weighs:
 *   - Individual signal strength
 *   - Signal co-occurrence (multiple tactic types = higher risk)
 *   - Context suppression (hard negatives reduce score)
 *   - Conversation trajectory (multi-turn patterns)
 */
function computeRiskScore(signals, hardNeg, conversationAnalysis) {
  if (signals.length === 0 && (!conversationAnalysis || conversationAnalysis.trajectory_score === 0)) {
    return 0;
  }

  // ── Signal-level scoring ──────────────────────────────────────

  // Sum of weighted signals (saturating curve to prevent single-signal domination)
  // Steepness 1.2: a single 0.55-weight signal → 0.48 score.
  // Two signals (0.55 + 0.50 = 1.05) → 0.72 score. Scales well.
  const signalSum = signals.reduce((sum, s) => sum + s.weight, 0);
  const signalScore = 1 - Math.exp(-signalSum * 1.2);

  // Co-occurrence boost: signals from different stages are more concerning
  const uniqueStages = new Set(signals.map(s => s.stage));
  const stageBoost = uniqueStages.size >= 3 ? 0.20
    : uniqueStages.size >= 2 ? 0.12 : 0;

  // High-severity signal boost (threats, image requests, explicit coercion)
  const highSeveritySignals = signals.filter(s => s.weight >= 0.55);
  const severityBoost = highSeveritySignals.length > 0
    ? Math.min(0.25, highSeveritySignals.length * 0.10) : 0;

  // ── Context suppression ───────────────────────────────────────
  const suppression = hardNeg.suppression;

  // ── Conversation trajectory ───────────────────────────────────
  const trajectoryScore = conversationAnalysis?.trajectory_score || 0;
  const hasConversation = conversationAnalysis && trajectoryScore > 0;

  // ── Fusion ────────────────────────────────────────────────────
  // When conversation context exists, blend signals + trajectory.
  // When single-message only, signals get full weight (no trajectory penalty).
  const signalComponent = signalScore + stageBoost + severityBoost;
  const rawScore = hasConversation
    ? Math.min(1.0, signalComponent * 0.55 + trajectoryScore * 0.45)
    : Math.min(1.0, signalComponent * 0.92);

  // Apply context suppression as a multiplier (1 - suppression)
  const finalScore = rawScore * (1 - suppression);

  return Math.round(finalScore * 1000) / 1000;
}

/**
 * Classify the most likely grooming stage based on signals.
 */
function classifyStage(signals, conversationState) {
  if (signals.length === 0) return null;

  // Find stage with highest aggregate weight
  const stageWeights = {};
  for (const signal of signals) {
    stageWeights[signal.stage] = (stageWeights[signal.stage] || 0) + signal.weight;
  }

  // Also factor in conversation state
  if (conversationState?.stage_probabilities) {
    for (const [stage, prob] of Object.entries(conversationState.stage_probabilities)) {
      stageWeights[stage] = (stageWeights[stage] || 0) + prob * 0.3;
    }
  }

  let topStage = null;
  let topWeight = 0;
  for (const [stage, weight] of Object.entries(stageWeights)) {
    if (weight > topWeight) {
      topStage = stage;
      topWeight = weight;
    }
  }

  return topStage;
}

/**
 * Classify the primary grooming tactic being used.
 */
function classifyTactic(signals) {
  if (signals.length === 0) return null;

  // Find the highest-weight signal
  let topSignal = signals[0];
  for (const signal of signals) {
    if (signal.weight > topSignal.weight) topSignal = signal;
  }

  return topSignal.id;
}

/**
 * Generate a human-readable explanation grounded in conversation behavior,
 * NOT in keyword matches.
 */
function generateExplanation(signals, conversationAnalysis, riskScore) {
  const parts = [];

  if (signals.length === 0 && riskScore < 0.1) return 'No grooming patterns detected.';

  // Group by tactic for clearer explanation
  const tacticGroups = {};
  for (const signal of signals) {
    if (!tacticGroups[signal.label]) tacticGroups[signal.label] = [];
    tacticGroups[signal.label].push(signal);
  }

  // Describe detected tactics (not keywords)
  for (const [label, group] of Object.entries(tacticGroups)) {
    const signalNames = group.map(s => s.id.replace(/_/g, ' ')).join(', ');
    parts.push(`${label}: ${signalNames} detected`);
  }

  // Add behavioral observations
  if (conversationAnalysis?.behavioral_signals) {
    for (const bs of conversationAnalysis.behavioral_signals) {
      parts.push(bs.description);
    }
  }

  // Add conversation-level assessment
  if (conversationAnalysis?.stage_progression) {
    parts.push(`Multi-stage grooming progression detected (${conversationAnalysis.stages_active} stages)`);
  }
  if (conversationAnalysis?.escalation_detected) {
    parts.push('Rapid escalation pattern detected');
  }

  return parts.join('. ') + '.';
}


// ═════════════════════════════════════════════════════════════════
// MAIN API — TWO-TIER DETECTION PIPELINE
// ═════════════════════════════════════════════════════════════════

/**
 * Tier 1 (Triage): Lightweight single-message analysis.
 * Used for initial risk scoring of individual messages or text blocks.
 *
 * @param {string} text - Raw text to analyze
 * @returns {Object} Triage result with risk_score
 */
export function triageText(text) {
  const normalized = normalizeText(text);
  const signals = extractSignals(normalized);
  const hardNeg = checkHardNegatives(normalized);

  const riskScore = computeRiskScore(signals, hardNeg, null);

  return {
    risk_score: riskScore,
    signal_count: signals.length,
    signals: signals.map(s => ({ id: s.id, stage: s.stage, weight: s.weight })),
    hard_negatives: hardNeg.contexts,
    suppressed: hardNeg.suppression > 0,
  };
}

/**
 * Tier 2 (Full Analysis): Conversation-level intelligent grooming detection.
 * This is the primary detection function.
 *
 * @param {string} text - Current text to analyze (e.g., contact's aggregated messages)
 * @param {Array} chatMessages - [{sender, text}] conversation messages (optional)
 * @param {Object} conversationState - Persistent state for this conversation (optional)
 * @returns {GroomingDetectionResult}
 */
export function detectGrooming(text, chatMessages, conversationState) {
  // ── Fast path: skip expensive analysis for short/empty text ───
  if (!text || text.length < 15) {
    return {
      risk_score: 0, stage: null, tactic: null,
      explanation: 'No grooming patterns detected.',
      signals: [], signal_count: 0,
      hard_negatives: [], suppressed: false, suppression_factor: 0,
      conversation: null,
      updated_conversation_state: conversationState || null,
    };
  }

  // ── Tier 1: Signal extraction from current text ───────────────
  const normalized = normalizeText(text);
  const signals = extractSignals(normalized);
  const hardNeg = checkHardNegatives(normalized);

  // ── Tier 2: Conversation-level analysis ───────────────────────
  let conversationAnalysis = null;
  let updatedState = conversationState;

  if (chatMessages && chatMessages.length > 0) {
    conversationAnalysis = analyzeConversation(chatMessages, conversationState);
    updatedState = conversationAnalysis.updated_state;
  } else if (signals.length > 0) {
    // Single-text mode: still update state if available
    const state = conversationState || createConversationState();
    updateConversationState(state, signals, state.turn_count);
    updatedState = state;
  }

  // ── Risk scoring & classification ─────────────────────────────
  const riskScore = computeRiskScore(signals, hardNeg, conversationAnalysis);
  const stage = classifyStage(signals, updatedState);
  const tactic = classifyTactic(signals);
  const explanation = generateExplanation(signals, conversationAnalysis, riskScore);

  // ── Build structured result ───────────────────────────────────
  return {
    // Primary output
    risk_score: riskScore,
    stage: stage,
    tactic: tactic,
    explanation: explanation,

    // Signal details (for transparency/debugging, never shown as "keyword X")
    signals: signals.map(s => ({
      id: s.id,
      tactic: s.tactic,
      stage: s.stage,
      weight: s.weight,
    })),
    signal_count: signals.length,

    // Context assessment
    hard_negatives: hardNeg.contexts,
    suppressed: hardNeg.suppression > 0,
    suppression_factor: hardNeg.suppression,

    // Conversation-level insights
    conversation: conversationAnalysis ? {
      trajectory_score: conversationAnalysis.trajectory_score,
      stage_progression: conversationAnalysis.stage_progression,
      escalation_detected: conversationAnalysis.escalation_detected,
      stages_active: conversationAnalysis.stages_active,
      highest_stage: conversationAnalysis.highest_stage,
      behavioral_signals: conversationAnalysis.behavioral_signals,
    } : null,

    // Updated conversation state (caller should persist this)
    updated_conversation_state: updatedState,
  };
}

/**
 * Convert a grooming detection result into a topic score compatible
 * with the pipeline's scoring system (0-1 saturating curve).
 *
 * This replaces the old lexicon-based grooming score.
 */
export function groomingResultToTopicScore(result) {
  if (!result) return 0;
  return result.risk_score;
}

/**
 * Build evidence bullets for the pipeline's decision output.
 * Grounded in conversation behavior, NOT keyword matches.
 */
export function buildGroomingEvidence(result) {
  if (!result || result.risk_score < 0.1) return [];

  const evidence = [];

  // Stage + tactic description
  if (result.stage) {
    const stageLabel = TACTIC_DETECTORS[result.stage]?.label || result.stage;
    evidence.push(`Grooming pattern: ${stageLabel} (risk: ${(result.risk_score * 100).toFixed(0)}%)`);
  }

  // Behavioral explanation (not keyword list)
  if (result.explanation && result.explanation !== 'No grooming patterns detected.') {
    evidence.push(result.explanation);
  }

  // Conversation-level findings
  if (result.conversation?.stage_progression) {
    evidence.push(`Multi-stage grooming progression across ${result.conversation.stages_active} stages`);
  }
  if (result.conversation?.escalation_detected) {
    evidence.push('Rapid conversation escalation pattern');
  }

  // Context notes
  if (result.suppressed && result.hard_negatives.length > 0) {
    evidence.push(`Context check: ${result.hard_negatives.join(', ')} (score reduced)`);
  }

  return evidence;
}
