# Phylax Semantic Safety Pipeline — Design Spec

**Date:** 2026-03-10
**Status:** Approved

## Overview

Phylax is not an "LLM filter." It is a **universal semantic safety layer** for a child's entire digital environment. LLMs, browsers, search, social media, messaging, video — all normalized through a single pipeline.

## Architecture

```
Child's Digital Environment (any platform)
        |
[1] Environment Capture Agent
    Normalize all inputs -> unified ContentSignal
        |
[2] Semantic Interpretation Agent
    Classify meaning, intent, stance, age-fitness
        |
[3] Context & Pattern Agent
    Track escalation, grooming trajectories, bypass attempts
        |
[4] Safety Decision Agent
    Combine semantics + patterns + parent rules -> action
        |
[5] Enforcement & Parent Intelligence Agent
    Block/blur/warn + smart parent alerts + feedback loop
```

## Unified ContentSignal Format

Every input from any source is normalized to:

```json
{
  "signal_id": "uuid",
  "source_type": "llm_response | browser_page | search_query | chat_message | social_post | video_caption",
  "platform": "chatgpt | claude | gemini | discord | instagram | youtube | google | ...",
  "modality": "text | image | video | audio",
  "direction": "incoming | outgoing",
  "content": "the actual text/data",
  "context": {
    "url": "...",
    "timestamp": 1712345678,
    "thread_id": "optional",
    "conversation_history": ["optional array of prior messages"]
  },
  "metadata": {
    "author_role": "user | assistant | unknown_contact | platform",
    "platform_features": ["streaming", "code_generation", "image_generation"]
  }
}
```

## Agent 1: Environment Capture

**Purpose:** Watch the child's digital environment and convert raw activity into normalized ContentSignals. No judgment — just capture and standardize.

**Covers:**
- LLM sites (ChatGPT, Claude, Gemini) — both prompts and responses
- Browser pages (existing observer.js integration)
- Search queries (existing search-interceptor.js integration)
- Chat/messaging (Discord, WhatsApp Web, Telegram Web)
- Social media feeds (Instagram, TikTok, Twitter/X)
- Video captions/transcripts (YouTube — existing youtube-scanner.js)

**LLM-specific requirements:**
- Streaming token buffering: buffer in hidden container, evaluate at sentence boundaries
- Prompt interception: capture outgoing prompts before they reach the LLM
- DOM selector fallback chain: CSS selectors -> aria/role -> text heuristic -> network interception
- Self-report selector failures to backend

**LLM DOM selectors (primary):**
| Site | Response container | Input area |
|------|-------------------|------------|
| ChatGPT | `[data-message-author-role="assistant"]` | `#prompt-textarea` |
| Claude | `.font-claude-message` | `[contenteditable]` in composer |
| Gemini | `message-content` | `.ql-editor` or textarea |

**Output:** ContentSignal objects emitted to pipeline.

## Agent 2: Semantic Interpretation

**Purpose:** Classify meaning, not keywords. Understand what content is about, what the intent is, whether it's educational vs. predatory vs. instructional.

**Must distinguish:**
- "What were the causes of the Holocaust?" (educational) vs "How do I radicalize someone?" (dangerous)
- "Why is self-harm dangerous?" (protective) vs "Ways to cut without parents noticing" (instructional harm)
- "How do guns work mechanically?" (curiosity) vs "How to build an untraceable gun" (dangerous)

**Architecture:**
- Layer 1 (local, fast): Extended rule-compiler + lexicon scoring + intent classifier
  - Reuses existing `localScoreAllTopics()`, `classifyIntent()`, `isProtectiveIntent()`
  - Add new LLM-specific intent types: `JAILBREAK_ATTEMPT`, `PERSONA_REQUEST`, `CAPABILITY_REQUEST`
- Layer 2 (cloud, accurate): Phylax API -> Claude for ambiguous cases
  - New endpoint: `POST /api/extension/llm-evaluate`
  - Sends: content + parent rules + conversation context
  - Returns: structured semantic analysis

**Output:**
```json
{
  "signal_id": "uuid",
  "topic": "self_harm",
  "intent": "instruction_seeking",
  "stance": "encouraging",
  "risk_level": 0.91,
  "age_fit": 0.12,
  "confidence": 0.88,
  "layer": "local | cloud",
  "reasoning": ["instructional language", "evasion of parental detection"]
}
```

## Agent 3: Context & Pattern Detection

**Purpose:** Track how meaning develops over time. Danger often isn't in one message — it's in a pattern.

**Tracks:**
- Rolling conversation memory per platform/thread (stored in `chrome.storage.session`)
- Grooming trajectory detection (trust -> isolation -> secrecy -> escalation -> exploitation)
- Repeated harmful curiosity patterns
- Bypass attempt patterns (VPN, incognito, jailbreak prompts)
- Cross-platform correlation (same pattern across Discord + ChatGPT)

**Integrates with:** Existing `grooming-detector.js` conversation state tracking, `behavior.js` scoring.

**Output:**
```json
{
  "signal_id": "uuid",
  "pattern_type": "grooming_escalation | repeated_harm_seeking | bypass_attempt | none",
  "confidence": 0.88,
  "trajectory_window": 14,
  "supporting_signals": ["secrecy_language", "age-gap implication", "incremental intimacy"],
  "escalation_stage": 3
}
```

## Agent 4: Safety Decision

**Purpose:** The judge. Combines semantic interpretation + pattern context + parent preferences + child age -> action.

**Inputs:**
- SemanticResult from Agent 2
- PatternResult from Agent 3
- Parent rules (from Supabase via existing sync)
- Child age profile and tier thresholds
- Platform context

**New rule scopes for LLM:**
- `BLOCK_LLM_TOPIC` — "Don't let my child discuss weapons"
- `BLOCK_LLM_CAPABILITY` — "No code generation"
- `BLOCK_LLM_JAILBREAK` — automatic jailbreak detection (always on)
- `BLOCK_LLM_PERSONA` — "Don't let AI pretend to be a girlfriend"

**Decision actions:**
- `allow` — pass through
- `blur` — show content behind a click-through warning
- `block` — full block overlay
- `block_and_alert` — block + immediate parent notification
- `warn` — show educational warning
- `educational_redirect` — replace with age-appropriate explanation
- `queue_for_review` — allow but flag for parent review

**Parent rules applied AFTER semantic interpretation, not as the main engine.**

**Output:**
```json
{
  "signal_id": "uuid",
  "decision": "block_and_alert",
  "action_reason": "high-confidence grooming progression",
  "confidence": 0.95,
  "triggered_rules": ["rule-uuid-1"],
  "explanation": "Incoming conversation showed sustained secrecy and escalating intimacy from unknown contact."
}
```

## Agent 5: Enforcement & Parent Intelligence

**Purpose:** Execute decisions + communicate intelligently with parents.

**Enforcement:**
- Block overlays (extends existing enforcer.js pattern)
- Blur/redact with click-through
- Educational redirect content
- "Request Access" button -> existing access-request flow
- LLM-specific: hide streaming response while evaluating, show "Phylax is reviewing..." spinner

**Parent Intelligence:**
- Smart alerts (not constant notifications) at 3 levels: informational, concerning, critical
- Human-readable explanations: "Phylax blocked a response that appeared to provide actionable weapon-construction guidance" (NOT "Blocked because keyword matched: gun")
- Dashboard: LLM activity view, session summaries, filtered response count
- New event types: `llm_prompt_blocked`, `llm_response_blocked`, `llm_allowed`, `llm_pattern_detected`

**Logging:**
- Every decision logged to existing events pipeline
- Truncated snippets only (not full responses, for privacy)
- Aggregated stats per child per platform
- Feedback loop: parent can mark false positives/negatives to improve future decisions

## File Structure

```
phylax-safety/
  content/
    llm-observer.js          -- LLM site content scripts (Agent 1)
    signal-capture.js         -- Unified signal capture layer (Agent 1)
  engine/
    semantic-interpreter.js   -- Semantic classification (Agent 2)
    pattern-tracker.js        -- Context & pattern detection (Agent 3)
    safety-decision.js        -- Decision engine (Agent 4)
    llm-rules.js             -- LLM-specific rule types (Agent 4)
  enforcement/
    llm-enforcer.js          -- LLM-specific enforcement (Agent 5)

dashboard/
  src/app/
    api/extension/
      llm-evaluate/route.ts  -- Cloud semantic evaluation endpoint (Agent 2)
    dashboard/
      rules/                 -- Extended with LLM rule scope (Agent 5)
      activity/              -- Extended with LLM activity view (Agent 5)
```

## Integration Points

- ContentSignal format is the universal interface between all agents
- Existing `pipeline.js` orchestrates the flow
- Existing Supabase sync delivers parent rules to extension
- Existing `chrome.storage` patterns for local state
- Existing `enforcer.js` patterns for block overlays
- Existing `events` API for logging
