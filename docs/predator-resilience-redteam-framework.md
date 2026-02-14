# PHYLAX PREDATOR-RESILIENCE RED-TEAM FRAMEWORK v2.0

## Defensive Adversarial Testing Architecture for Child Protection

**Classification:** Internal — AI Safety Research
**Status:** Architecture Specification
**Date:** 2026-02-13

---

## SECTION 1 — FORMAL THREAT MODEL SPECIFICATION

### 1.1 Abstract Grooming Stage Taxonomy

Grooming follows a well-documented progression through abstract stages. Each stage is defined by intent class, not by specific dialogue. No scripts or explicit examples are included.

| Stage | ID | Description | Detection Signal Type | Base Weight |
|-------|----|-------------|-----------------------|-------------|
| Target Selection | GS-01 | Initial identification of vulnerable targets based on public signals | behavioral / graph | 0.15 |
| Trust Building | GS-02 | Establishing rapport through flattery, shared interests, emotional mirroring | semantic / temporal | 0.25 |
| Needs Fulfillment | GS-03 | Offering emotional support, gifts, attention to fill perceived gaps | semantic / behavioral | 0.35 |
| Isolation | GS-04 | Attempts to separate target from support networks, move to private channels | behavioral / semantic | 0.55 |
| Desensitization | GS-05 | Gradual introduction of boundary-testing content or language | semantic / temporal | 0.75 |
| Maintenance | GS-06 | Sustained control through guilt, secrecy, or emotional dependency | semantic / behavioral / temporal | 0.90 |

### 1.2 Intent Classification Ontology

```
IntentClass {
  id:                     string       // e.g., "IC-AGE-PROBE"
  description:            string       // abstract definition
  detection_type:         enum         // LEXICAL | SEMANTIC | BEHAVIORAL | TEMPORAL | GRAPH
  base_weight:            float        // 0.0 - 1.0
  escalation_multiplier:  float        // applied when co-occurring with other signals
  false_positive_risk:    string       // HIGH | MEDIUM | LOW
  mitigation_strategy:    string       // how to reduce FP
}
```

**Defined Intent Classes:**

| ID | Intent Class | Detection Type | Base Weight | Escalation Mult | FP Risk | Mitigation |
|----|-------------|----------------|-------------|------------------|---------|------------|
| IC-01 | Age/Identity Probing | SEMANTIC | 0.30 | 1.4 | MEDIUM | Require co-occurrence with age-gap signal |
| IC-02 | Location Elicitation | SEMANTIC | 0.40 | 1.6 | MEDIUM | Filter against known educational/social contexts |
| IC-03 | Secrecy Induction | SEMANTIC | 0.55 | 1.8 | LOW | Strong signal; few benign contexts for adult-to-minor |
| IC-04 | Isolation Steering | SEMANTIC + BEHAVIORAL | 0.50 | 1.7 | MEDIUM | Cross-reference with platform migration events |
| IC-05 | Boundary Testing | SEMANTIC + TEMPORAL | 0.60 | 2.0 | LOW | Temporal progression required to confirm |
| IC-06 | Emotional Dependency Building | SEMANTIC + TEMPORAL | 0.45 | 1.5 | HIGH | Requires sustained pattern; single-message insufficient |
| IC-07 | Platform Migration Request | BEHAVIORAL | 0.50 | 1.9 | LOW | Strong signal when combined with age-gap |
| IC-08 | PII Extraction | SEMANTIC | 0.65 | 2.0 | LOW | Phone + address combo is near-certain |
| IC-09 | Gift/Reward Offering | SEMANTIC | 0.30 | 1.3 | HIGH | Common in benign contexts; require co-occurrence |
| IC-10 | Authority Undermining | SEMANTIC | 0.35 | 1.5 | MEDIUM | Must co-occur with isolation signals |

### 1.3 Behavioral Signal Ontology

```
BehavioralSignal {
  id:                string
  description:       string
  data_source:       enum    // MESSAGE_METADATA | PLATFORM_EVENT | TEMPORAL | CONTACT_GRAPH
  base_weight:       float
  decay_halflife_h:  float   // hours before signal strength halves
  requires_baseline: bool    // whether normal behavior baseline is needed
}
```

| ID | Signal | Source | Weight | Decay (h) | Baseline Required |
|----|--------|--------|--------|-----------|-------------------|
| BS-01 | New contact with age gap | CONTACT_GRAPH | 0.40 | 168 | No |
| BS-02 | Message frequency spike | MESSAGE_METADATA | 0.25 | 24 | Yes |
| BS-03 | Late-night messaging pattern | TEMPORAL | 0.30 | 12 | Yes |
| BS-04 | Platform migration event | PLATFORM_EVENT | 0.50 | 48 | No |
| BS-05 | Conversation length anomaly | MESSAGE_METADATA | 0.20 | 24 | Yes |
| BS-06 | Media sharing acceleration | MESSAGE_METADATA | 0.35 | 24 | Yes |
| BS-07 | Contact isolation pattern | CONTACT_GRAPH | 0.45 | 72 | Yes |
| BS-08 | Response latency decrease | TEMPORAL | 0.15 | 12 | Yes |

### 1.4 Temporal Signal Ontology

**Escalation Indicators:**
- Increasing severity of intent signals over time window
- Measured as: `slope(intent_severity, time) > ESCALATION_THRESHOLD`
- Threshold: 0.05 severity units per hour

**Persistence Indicators:**
- Sustained engagement despite non-response or deflection
- Measured as: `count(re-engagement_attempts) / time_window`
- Threshold: 3+ re-engagements after silence >30min

**Velocity Indicators:**
- Rate of progression through grooming stages
- Measured as: `stages_traversed / elapsed_hours`
- Normal social bonding: <0.02 stages/hour
- Concerning velocity: >0.10 stages/hour
- High-risk velocity: >0.25 stages/hour

### 1.5 Risk Weight Multiplier Logic

```
EffectiveWeight(intent) =
  intent.base_weight
  * escalation_multiplier(co_occurring_intents)
  * persistence_multiplier(re_engagement_count)
  * velocity_multiplier(stage_progression_rate)
  * age_gap_multiplier(estimated_age_difference)

Where:
  escalation_multiplier = 1.0 + 0.2 * count(co_occurring_high_risk_intents)
  persistence_multiplier = min(2.0, 1.0 + 0.15 * re_engagement_count)
  velocity_multiplier = min(2.5, 1.0 + stage_velocity / 0.10)
  age_gap_multiplier = clamp(1.0, 2.5, 1.0 + (age_gap - 3) * 0.15)
```

---

## SECTION 2 — FIVE-LAYER DETECTION ARCHITECTURE

### Layer 1 — Token-Level Obfuscation Resilience

**Purpose:** Normalize obfuscated text before semantic analysis.

**Input Format:**
```json
{
  "raw_text": "string — unprocessed message content",
  "encoding": "utf-8",
  "source_platform": "string"
}
```

**Model Architecture:** Rule-based normalizer + character-level CNN fallback

**Processing Pipeline:**
1. Unicode normalization (NFKC)
2. Homoglyph resolution (Cyrillic а → Latin a, etc.)
3. Leetspeak expansion (1337 → leet, @ → a, 3 → e)
4. Emoji semantic mapping (eggplant emoji → [PHALLIC_SYMBOL], etc.)
5. Whitespace/zero-width character stripping
6. Word fragment reassembly ("s e x" → "sex")
7. Slang dictionary lookup

**Output Schema:**
```json
{
  "normalized_text": "string",
  "mutations_detected": [
    {
      "type": "HOMOGLYPH | LEETSPEAK | EMOJI_SUB | FRAGMENTATION | ZWCHAR",
      "original": "string",
      "resolved": "string",
      "position": [start, end]
    }
  ],
  "obfuscation_score": 0.0-1.0,
  "confidence": 0.0-1.0
}
```

**Risk Scoring Contribution:** Obfuscation score itself is a risk signal — deliberate obfuscation of sexual/grooming terms adds +0.15 to intent weight.

**Determinism Controls:** Normalization rules are static lookup tables. CNN fallback uses deterministic inference (fixed seed, no dropout).

**Failure Modes:**
- Novel obfuscation patterns not in lookup tables
- Multilingual text where homoglyphs are legitimate characters
- Over-normalization destroying benign content

**Logging:** Every mutation detected is logged with before/after pairs for audit.

### Layer 2 — Semantic Intent Classifier

**Purpose:** Classify normalized text against the Intent Classification Ontology.

**Input Format:**
```json
{
  "normalized_text": "string",
  "conversation_context": {
    "prior_messages": ["string[]  — last N messages"],
    "participant_metadata": {
      "estimated_age_gap": "float | null",
      "contact_duration_days": "int"
    }
  }
}
```

**Model Architecture:** Fine-tuned transformer classifier (distilled from LLM, runs locally) OR remote LLM API call for ambiguous-band scoring.

**Output Schema:**
```json
{
  "intent_scores": {
    "IC-01_age_probe": 0.72,
    "IC-02_location_elicit": 0.08,
    "IC-03_secrecy_induction": 0.45,
    "IC-04_isolation_steering": 0.12,
    "IC-05_boundary_testing": 0.03,
    "IC-06_emotional_dependency": 0.31,
    "IC-07_platform_migration": 0.00,
    "IC-08_pii_extraction": 0.15,
    "IC-09_gift_offering": 0.05,
    "IC-10_authority_undermining": 0.22
  },
  "max_intent": "IC-01_age_probe",
  "max_score": 0.72,
  "confidence": 0.81,
  "explanation_vector": ["age-related question", "directed at minor profile"],
  "grooming_stage_estimate": "GS-01",
  "requires_multi_turn_context": true
}
```

**Risk Scoring Contribution:** Intent scores feed directly into ConversationRiskScore accumulator (Section 3).

**Determinism Controls:**
- Temperature = 0 for LLM inference
- Deterministic tokenization
- Fixed model version pinning
- Same input must produce same output within ±0.01 tolerance

**Failure Modes:**
- Sarcasm/irony misclassification
- Educational content about grooming flagged as grooming itself
- Cultural communication norms causing false positives
- Ambiguous messages in [0.35, 0.65] confidence band

### Layer 3 — Multi-Turn Memory Accumulator

**Purpose:** Track risk accumulation across conversation turns. Single messages rarely constitute grooming — the pattern across time is the signal.

**Input Format:**
```json
{
  "conversation_id": "string",
  "new_turn": {
    "intent_scores": {},
    "timestamp_ms": 1707800000000,
    "speaker": "CONTACT | CHILD"
  },
  "history": "ConversationRiskState — retrieved from storage"
}
```

**Model Architecture:** Stateful accumulator (not ML — deterministic formula). See Section 3 for full mathematical model.

**Output Schema:**
```json
{
  "conversation_id": "string",
  "cumulative_risk_score": 0.0-100.0,
  "risk_trajectory": "STABLE | ESCALATING | DECELERATING | SPIKING",
  "turns_analyzed": 47,
  "highest_stage_reached": "GS-03",
  "stage_velocity": 0.08,
  "persistence_count": 3,
  "time_span_hours": 72.5,
  "threshold_status": "BELOW | APPROACHING | EXCEEDED",
  "recommended_action": "MONITOR | ALERT | INTERVENE"
}
```

**Risk Scoring Contribution:** This is the primary risk aggregator. Its output determines enforcement decisions.

**Determinism Controls:**
- Pure mathematical computation, no ML inference
- All operations use fixed-precision arithmetic (4 decimal places)
- Deterministic rounding: HALF_UP

**Failure Modes:**
- Conversation split across platforms (mitigated by Section 8)
- Long dormant conversations with stale risk state
- Rapid context switching between benign and concerning topics

### Layer 4 — Behavioral Anomaly Detector

**Purpose:** Detect non-linguistic signals that indicate risk outside of message content.

**Input Format:**
```json
{
  "child_id": "string",
  "event_type": "NEW_CONTACT | MESSAGE_SENT | MESSAGE_RECEIVED | PLATFORM_SWITCH | SESSION_START | SESSION_END",
  "event_metadata": {
    "contact_id": "string",
    "platform": "string",
    "timestamp_ms": 1707800000000,
    "estimated_contact_age": "int | null",
    "child_age": 13
  },
  "behavioral_baseline": "ChildBehaviorBaseline — 30-day rolling stats"
}
```

**Model Architecture:** Statistical anomaly detector (z-score based) + rule-based triggers.

**Output Schema:**
```json
{
  "anomaly_scores": {
    "BS-01_new_age_gap_contact": 0.80,
    "BS-02_frequency_spike": 0.15,
    "BS-03_late_night": 0.00,
    "BS-04_platform_migration": 0.60,
    "BS-05_conversation_length": 0.10,
    "BS-06_media_sharing": 0.00,
    "BS-07_contact_isolation": 0.25,
    "BS-08_response_latency": 0.05
  },
  "composite_anomaly_score": 0.0-1.0,
  "top_anomalies": ["BS-01", "BS-04"],
  "baseline_deviation_sigma": 2.3,
  "recommended_investigation": true
}
```

**Risk Scoring Contribution:** Composite anomaly score feeds into ConversationRiskScore as `behavioral_anomaly_score` additive component.

**Determinism Controls:** Z-score computation is deterministic given a fixed baseline window.

**Failure Modes:**
- Insufficient baseline data for new users (cold-start)
- Legitimate new friendships flagged as anomalous
- Seasonal behavioral shifts (summer vs. school year)

### Layer 5 — Parent Policy Enforcement Engine

**Purpose:** Ensure all enforcement decisions comply with parent-defined policy rules. This layer has VETO power — it can override lower layers.

**Input Format:**
```json
{
  "risk_assessment": {
    "cumulative_risk_score": 67.3,
    "intent_scores": {},
    "behavioral_anomalies": {},
    "recommended_action": "ALERT"
  },
  "policy_object": {
    "policy_version": "cid_abc123def",
    "child_profile": { "age": 13, "sensitivity": "high" },
    "grooming_rules": {
      "alert_threshold": 50.0,
      "block_threshold": 80.0,
      "auto_report_threshold": 95.0
    },
    "contact_rules": {
      "block_unknown_adults": true,
      "require_approval_new_contacts": true
    },
    "platform_rules": {
      "blocked_platforms": ["omegle.com", "chatroulette.com"],
      "dm_monitoring_enabled": true
    }
  }
}
```

**Model Architecture:** Deterministic rule evaluation engine (same architecture as existing `pipeline.js`).

**Output Schema:**
```json
{
  "final_decision": "ALLOW | MONITOR | ALERT_PARENT | BLOCK_CONTACT | BLOCK_PLATFORM",
  "policy_rule_matched": "grooming_rules.alert_threshold",
  "risk_score_at_decision": 67.3,
  "threshold_used": 50.0,
  "parent_notification": {
    "required": true,
    "urgency": "HIGH",
    "summary": "Conversation with [contact] shows escalating risk pattern",
    "evidence_refs": ["turn_23", "turn_31", "turn_45"]
  },
  "enforcement": {
    "layer": "RENDER",
    "technique": "contact_block_overlay"
  },
  "confidence": 0.91,
  "overblock_check": {
    "passed": true,
    "reason": "Risk score 67.3 exceeds alert threshold 50.0 with high confidence"
  }
}
```

**Risk Scoring Contribution:** This layer does not modify risk scores — it translates scores into enforcement actions per parent policy.

**Determinism Controls:** Identical to existing pipeline.js — same input produces same output, no randomness.

**Failure Modes:**
- Overly permissive parent policies leaving child unprotected
- Overly strict policies causing overblocking of benign social interaction
- Policy conflicts between grooming rules and platform rules

---

## SECTION 3 — CONVERSATION RISK ACCUMULATION MODEL

### 3.1 Core Formula

```
ConversationRiskScore(t) =
  decay(CRS(t-1), delta_t)
  + Sigma(intent_weight_i * escalation_factor * persistence_factor)
  + behavioral_anomaly_score
  * vulnerability_multiplier
  * cross_platform_carryover
```

### 3.2 Component Definitions

**Base Intent Contribution (per turn):**
```python
def intent_contribution(turn):
    scores = turn.intent_scores
    weights = INTENT_CLASS_WEIGHTS  # from Section 1.2

    contribution = 0.0
    active_intents = []

    for intent_id, score in scores.items():
        if score >= ACTIVATION_THRESHOLD:  # 0.30
            w = weights[intent_id].base_weight
            contribution += w * score
            active_intents.append(intent_id)

    return contribution, active_intents

ACTIVATION_THRESHOLD = 0.30
```

**Escalation Factor:**
```python
def escalation_factor(current_stage, previous_stage, active_intents):
    stage_delta = current_stage - previous_stage

    # Co-occurrence bonus
    co_occurrence = 1.0 + 0.20 * max(0, len(active_intents) - 1)

    # Progression bonus
    if stage_delta > 0:
        progression = 1.0 + 0.30 * stage_delta
    elif stage_delta == 0:
        progression = 1.0
    else:
        progression = 0.85  # slight reduction for apparent de-escalation

    return min(3.0, co_occurrence * progression)
```

**Persistence Factor:**
```python
def persistence_factor(conversation_state):
    re_engagements = conversation_state.re_engagement_after_silence_count
    silence_threshold_minutes = 30

    if re_engagements == 0:
        return 1.0

    return min(2.0, 1.0 + 0.15 * re_engagements)
```

**Decay Function:**
```python
def decay(previous_risk, delta_hours):
    """
    Exponential decay with configurable half-life.
    Prevents stale risk from persisting indefinitely.
    Short half-life for low-risk; long half-life for high-risk.
    """
    if previous_risk >= 70.0:
        half_life = 168.0  # 7 days — high risk decays slowly
    elif previous_risk >= 40.0:
        half_life = 72.0   # 3 days — medium risk
    else:
        half_life = 24.0   # 1 day — low risk decays fast

    decay_rate = math.log(2) / half_life
    decayed = previous_risk * math.exp(-decay_rate * delta_hours)

    return round(decayed, 4)  # deterministic rounding
```

**Vulnerability Multiplier:**
```python
def vulnerability_multiplier(context):
    """
    Increases risk weight when child is in a vulnerable state.
    Computed from non-invasive signals only.
    """
    multiplier = 1.0

    # Late-night interaction (10 PM - 6 AM)
    hour = context.local_hour
    if hour >= 22 or hour < 6:
        multiplier += 0.20

    # Isolation signals (fewer social contacts recently)
    if context.active_contacts_7d < context.baseline_contacts * 0.5:
        multiplier += 0.15

    # High device usage (potential addiction co-risk)
    if context.daily_screen_minutes > 300:
        multiplier += 0.10

    # Recent negative emotional signals (from content analysis)
    if context.negative_sentiment_ratio_7d > 0.6:
        multiplier += 0.15

    return min(1.8, multiplier)  # cap to prevent runaway
```

**Cross-Platform Carryover:**
```python
def cross_platform_carryover(child_risk_profile, current_platform):
    """
    If risk was detected on another platform, carry partial risk forward.
    """
    other_platform_risk = child_risk_profile.max_risk_other_platforms(
        exclude=current_platform
    )

    if other_platform_risk >= 50.0:
        carryover = 1.0 + 0.15 * (other_platform_risk / 100.0)
    else:
        carryover = 1.0

    return min(1.5, carryover)
```

### 3.3 Full Accumulation Pseudocode

```python
def update_conversation_risk(conversation_state, new_turn, context):
    # Step 1: Decay previous risk
    delta_h = hours_since(conversation_state.last_update)
    decayed_risk = decay(conversation_state.risk_score, delta_h)

    # Step 2: Compute new turn contribution
    intent_contrib, active_intents = intent_contribution(new_turn)

    # Step 3: Estimate current grooming stage
    current_stage = estimate_stage(conversation_state, active_intents)

    # Step 4: Compute multipliers
    esc = escalation_factor(
        current_stage,
        conversation_state.highest_stage,
        active_intents
    )
    pers = persistence_factor(conversation_state)
    vuln = vulnerability_multiplier(context)
    cross = cross_platform_carryover(context.child_risk_profile, context.platform)

    # Step 5: Compute behavioral anomaly contribution
    behavioral = context.behavioral_anomaly_score * 10.0  # scale to 0-10

    # Step 6: Accumulate
    new_risk = decayed_risk
    new_risk += intent_contrib * esc * pers * 15.0  # scale factor
    new_risk += behavioral
    new_risk *= vuln
    new_risk *= cross

    # Step 7: Anti-spike smoothing
    max_single_turn_increase = 20.0
    if new_risk - decayed_risk > max_single_turn_increase:
        new_risk = decayed_risk + max_single_turn_increase

    # Step 8: Clamp and round
    new_risk = round(min(100.0, max(0.0, new_risk)), 4)

    # Step 9: Compute trajectory
    trajectory = compute_trajectory(
        conversation_state.risk_history[-10:],
        new_risk
    )

    # Step 10: Compute velocity
    velocity = stage_velocity(
        conversation_state.stage_timestamps,
        current_stage
    )

    # Step 11: Update state
    conversation_state.risk_score = new_risk
    conversation_state.last_update = now()
    conversation_state.highest_stage = max(current_stage, conversation_state.highest_stage)
    conversation_state.risk_history.append(new_risk)
    conversation_state.trajectory = trajectory
    conversation_state.velocity = velocity

    return conversation_state

def compute_trajectory(history, current):
    if len(history) < 3:
        return "INSUFFICIENT_DATA"
    slope = linear_regression_slope(history + [current])
    if slope > 0.5:
        return "SPIKING"
    elif slope > 0.1:
        return "ESCALATING"
    elif slope < -0.1:
        return "DECELERATING"
    else:
        return "STABLE"
```

### 3.4 Threshold Function

```python
THRESHOLDS = {
    "MONITOR":       30.0,
    "ALERT_PARENT":  50.0,
    "BLOCK_CONTACT": 75.0,
    "AUTO_REPORT":   95.0
}

def threshold_action(risk_score, policy):
    """
    Policy can override default thresholds.
    Parent-defined thresholds take precedence.
    """
    thresholds = policy.grooming_rules or THRESHOLDS

    if risk_score >= thresholds["AUTO_REPORT"]:
        return "AUTO_REPORT"
    elif risk_score >= thresholds["BLOCK_CONTACT"]:
        return "BLOCK_CONTACT"
    elif risk_score >= thresholds["ALERT_PARENT"]:
        return "ALERT_PARENT"
    elif risk_score >= thresholds["MONITOR"]:
        return "MONITOR"
    else:
        return "ALLOW"
```

---

## SECTION 4 — ADVERSARIAL OBFUSCATION STRESS ENGINE

### 4.1 Mutation Categories

```
MutationCategory {
  id:          string
  description: string
  generator:   function(input_text) -> mutated_text
  severity:    LOW | MEDIUM | HIGH
  prevalence:  float  // how commonly observed in real attacks
}
```

| ID | Category | Severity | Prevalence | Example Concept |
|----|----------|----------|------------|-----------------|
| MUT-01 | Character insertion | LOW | 0.70 | Inserting dots/spaces between characters |
| MUT-02 | Unicode homoglyph | MEDIUM | 0.40 | Cyrillic/Greek lookalikes replacing Latin |
| MUT-03 | Emoji semantic substitution | HIGH | 0.60 | Using emoji sequences to replace words |
| MUT-04 | Word fragmentation | MEDIUM | 0.55 | Breaking words across messages or with separators |
| MUT-05 | Slang/neologism mutation | HIGH | 0.80 | Evolving slang that replaces known terms |
| MUT-06 | Multilingual code-switching | HIGH | 0.30 | Switching language mid-sentence for key terms |
| MUT-07 | Zero-width character injection | LOW | 0.20 | Invisible Unicode chars breaking tokenization |
| MUT-08 | Phonetic substitution | MEDIUM | 0.50 | Numbers/letters that sound like the target word |
| MUT-09 | Reversal/anagram | LOW | 0.15 | Writing words backwards or scrambled |
| MUT-10 | Contextual euphemism | HIGH | 0.75 | Using common words with implied meaning |

### 4.2 Mutation Generator Pseudocode

```python
class ObfuscationMutationEngine:
    def __init__(self):
        self.homoglyph_map = load_homoglyph_database()  # ~2000 char mappings
        self.emoji_semantic_map = load_emoji_semantics()
        self.slang_dictionary = load_evolving_slang_db()
        self.phonetic_map = load_phonetic_substitutions()

    def mutate(self, text, mutation_types, intensity=0.5):
        """
        Apply specified mutations at given intensity.
        intensity 0.0 = minimal mutation
        intensity 1.0 = maximum mutation
        Returns: mutated text + mutation log
        """
        result = text
        mutations_applied = []

        for mut_type in mutation_types:
            if mut_type == "MUT-01":
                result, log = self.insert_characters(result, intensity)
            elif mut_type == "MUT-02":
                result, log = self.apply_homoglyphs(result, intensity)
            elif mut_type == "MUT-03":
                result, log = self.substitute_emoji(result, intensity)
            elif mut_type == "MUT-04":
                result, log = self.fragment_words(result, intensity)
            elif mut_type == "MUT-05":
                result, log = self.apply_slang(result, intensity)
            elif mut_type == "MUT-06":
                result, log = self.code_switch(result, intensity)
            elif mut_type == "MUT-07":
                result, log = self.inject_zwchars(result, intensity)
            elif mut_type == "MUT-08":
                result, log = self.phonetic_sub(result, intensity)
            elif mut_type == "MUT-09":
                result, log = self.reverse_words(result, intensity)
            elif mut_type == "MUT-10":
                result, log = self.apply_euphemism(result, intensity)

            mutations_applied.extend(log)

        return result, mutations_applied

    def apply_homoglyphs(self, text, intensity):
        """Replace a fraction of characters with visual lookalikes."""
        chars = list(text)
        log = []
        for i, c in enumerate(chars):
            if c in self.homoglyph_map and random.random() < intensity:
                replacement = random.choice(self.homoglyph_map[c])
                log.append({"pos": i, "original": c, "replacement": replacement})
                chars[i] = replacement
        return ''.join(chars), log
```

### 4.3 Stress Testing Pipeline

```python
def run_obfuscation_stress_test(test_corpus, detection_pipeline):
    """
    test_corpus: list of (abstract_category, text) pairs
                 Categories are abstract labels, NOT harmful content.
    """
    results = {
        "baseline": {},
        "per_mutation": {},
        "combined": {}
    }

    # Phase 1: Baseline detection accuracy
    baseline_results = []
    for category, text in test_corpus:
        score = detection_pipeline.classify(text)
        baseline_results.append({
            "category": category,
            "detected": score >= DETECTION_THRESHOLD,
            "score": score
        })
    results["baseline"] = compute_metrics(baseline_results)

    # Phase 2: Individual mutation testing
    engine = ObfuscationMutationEngine()
    for mut_type in ALL_MUTATION_TYPES:
        mut_results = []
        for category, text in test_corpus:
            for intensity in [0.25, 0.50, 0.75, 1.00]:
                mutated, log = engine.mutate(text, [mut_type], intensity)
                score = detection_pipeline.classify(mutated)
                mut_results.append({
                    "category": category,
                    "mutation": mut_type,
                    "intensity": intensity,
                    "detected": score >= DETECTION_THRESHOLD,
                    "score": score,
                    "mutations_count": len(log)
                })
        results["per_mutation"][mut_type] = compute_metrics(mut_results)

    # Phase 3: Combined mutation testing
    for combo in MUTATION_COMBINATIONS:
        combo_results = []
        for category, text in test_corpus:
            mutated, log = engine.mutate(text, combo, intensity=0.50)
            score = detection_pipeline.classify(mutated)
            combo_results.append({
                "category": category,
                "mutations": combo,
                "detected": score >= DETECTION_THRESHOLD,
                "score": score
            })
        combo_key = "+".join(combo)
        results["combined"][combo_key] = compute_metrics(combo_results)

    return results
```

### 4.4 Evaluation Metrics

```python
def compute_obfuscation_metrics(baseline_metrics, mutated_metrics):
    return {
        "detection_retention_pct":
            mutated_metrics["recall"] / baseline_metrics["recall"] * 100,

        "false_negative_under_obfuscation":
            mutated_metrics["fn"] / (mutated_metrics["fn"] + mutated_metrics["tp"]),

        "precision_drop_pct":
            (baseline_metrics["precision"] - mutated_metrics["precision"])
            / baseline_metrics["precision"] * 100,

        "mutation_retention_score":
            mutated_metrics["accuracy"] / baseline_metrics["accuracy"],

        "worst_mutation_type":
            min(per_mutation_results, key=lambda m: m["recall"]),

        "resilience_grade":
            grade_resilience(mutated_metrics["recall"])
            # A: >= 0.95, B: >= 0.85, C: >= 0.70, D: >= 0.50, F: < 0.50
    }
```

**Minimum Acceptable Thresholds:**

| Metric | Target | Minimum |
|--------|--------|---------|
| Detection Retention % | >= 95% | >= 85% |
| FN Under Obfuscation | <= 5% | <= 15% |
| Precision Drop % | <= 3% | <= 10% |
| Mutation Retention Score | >= 0.95 | >= 0.85 |

---

## SECTION 5 — BEHAVIORAL ANOMALY MODEL

### 5.1 Signal Definitions

Each behavioral signal is computed from metadata only — no message content analysis.

```python
class BehavioralAnomalyDetector:
    def __init__(self, child_id):
        self.baseline = load_30_day_baseline(child_id)

    def compute_anomaly_scores(self, events, child_profile):
        scores = {}

        # BS-01: New contact with age gap
        scores["new_age_gap_contact"] = self.score_age_gap(events, child_profile)

        # BS-02: Message frequency spike
        scores["frequency_spike"] = self.score_frequency_spike(events)

        # BS-03: Late-night messaging
        scores["late_night"] = self.score_late_night(events)

        # BS-04: Platform migration
        scores["platform_migration"] = self.score_platform_migration(events)

        # BS-05: Conversation length anomaly
        scores["conversation_length"] = self.score_conversation_length(events)

        # BS-06: Media sharing acceleration
        scores["media_sharing"] = self.score_media_sharing(events)

        # BS-07: Contact isolation
        scores["contact_isolation"] = self.score_contact_isolation(events)

        # BS-08: Response latency decrease
        scores["response_latency"] = self.score_response_latency(events)

        # Composite score
        composite = self.compute_composite(scores)

        return {
            "individual_scores": scores,
            "composite_score": composite,
            "top_anomalies": sorted(
                scores.items(), key=lambda x: x[1], reverse=True
            )[:3]
        }

    def score_age_gap(self, events, child_profile):
        """Detect new contacts with significant age difference."""
        new_contacts = [e for e in events if e.type == "NEW_CONTACT"]
        if not new_contacts:
            return 0.0

        max_gap_score = 0.0
        for contact in new_contacts:
            if contact.estimated_age is None:
                max_gap_score = max(max_gap_score, 0.3)  # unknown = moderate concern
            else:
                gap = abs(contact.estimated_age - child_profile.age)
                if gap >= 10:
                    max_gap_score = max(max_gap_score, 1.0)
                elif gap >= 5:
                    max_gap_score = max(max_gap_score, 0.6)
                elif gap >= 3:
                    max_gap_score = max(max_gap_score, 0.3)

        return max_gap_score

    def score_frequency_spike(self, events):
        """Z-score of current message frequency vs. baseline."""
        current_freq = count_messages_last_24h(events)
        z = (current_freq - self.baseline.avg_daily_messages) / max(
            self.baseline.std_daily_messages, 1.0
        )
        return sigmoid(z - 2.0)  # activates at 2 sigma above mean

    def score_late_night(self, events):
        """Proportion of recent messages in 10PM-6AM window."""
        recent = [e for e in events if e.age_hours < 24]
        if not recent:
            return 0.0
        late = [e for e in recent if e.local_hour >= 22 or e.local_hour < 6]
        return len(late) / len(recent)

    def score_platform_migration(self, events):
        """Detect requests to move conversation to different platform."""
        migration_events = [e for e in events if e.type == "PLATFORM_MIGRATION_SIGNAL"]
        if not migration_events:
            return 0.0
        return min(1.0, len(migration_events) * 0.5)

    def compute_composite(self, scores):
        """Weighted composite anomaly score."""
        weights = {
            "new_age_gap_contact": 0.25,
            "frequency_spike": 0.10,
            "late_night": 0.10,
            "platform_migration": 0.20,
            "conversation_length": 0.05,
            "media_sharing": 0.10,
            "contact_isolation": 0.15,
            "response_latency": 0.05
        }
        weighted_sum = sum(scores[k] * weights[k] for k in scores)
        return min(1.0, weighted_sum / sum(weights.values()))
```

### 5.2 Normalization Strategy

All behavioral scores are normalized to [0.0, 1.0] using:

```python
def sigmoid(x):
    return 1.0 / (1.0 + math.exp(-x))

def z_normalize(value, mean, std):
    if std < 1e-6:
        return 0.0
    return (value - mean) / std

def normalize_to_unit(raw_score, baseline_mean, baseline_std):
    z = z_normalize(raw_score, baseline_mean, baseline_std)
    return sigmoid(z - 1.5)  # activates meaningfully above 1.5 sigma
```

### 5.3 Sandbox Simulation Design

Testing behavioral signals without real users:

```python
class BehavioralSimulator:
    """
    Generates synthetic behavioral event streams for testing.
    No real user data is used. All profiles are synthetic.
    """

    def simulate_benign_profile(self):
        """Normal child behavior pattern."""
        return EventStream(
            messages_per_day=NormalDist(mean=25, std=10),
            active_hours=range(8, 22),
            contacts=5-15 same-age peers,
            platform_switches=0,
            session_lengths=NormalDist(mean=30, std=15)
        )

    def simulate_concerning_pattern(self, scenario_type):
        """
        Generate synthetic event stream matching a concerning behavioral pattern.
        scenario_type is an abstract category, NOT a script.
        """
        if scenario_type == "GRADUAL_ISOLATION":
            return EventStream(
                contact_diversity=LinearDecay(start=10, end=2, over_days=30),
                single_contact_frequency=LinearGrowth(start=5, end=50, over_days=30),
                platform_migrations=1,
                late_night_ratio=LinearGrowth(start=0.0, end=0.4, over_days=30)
            )

        elif scenario_type == "RAPID_ESCALATION":
            return EventStream(
                new_age_gap_contact=True,
                frequency_spike=ExponentialGrowth(base=5, factor=2, days=7),
                platform_migrations=2,
                late_night_ratio=0.5
            )

        elif scenario_type == "SLOW_BURN":
            return EventStream(
                contact_duration_days=90,
                frequency=LinearGrowth(start=3, end=20, over_days=90),
                late_night_ratio=LinearGrowth(start=0.0, end=0.2, over_days=90),
                platform_migrations=0,
                conversation_length=LinearGrowth(start=10, end=60, over_days=90)
            )

    def run_simulation(self, detector, scenario_type, duration_days=30):
        """Run detector against synthetic event stream and evaluate."""
        events = self.simulate_concerning_pattern(scenario_type)
        daily_scores = []

        for day in range(duration_days):
            day_events = events.generate_day(day)
            result = detector.compute_anomaly_scores(day_events, SYNTHETIC_CHILD_PROFILE)
            daily_scores.append(result)

        return {
            "scenario": scenario_type,
            "detection_day": first_day_above_threshold(daily_scores, 0.5),
            "peak_score": max(s["composite_score"] for s in daily_scores),
            "trajectory": [s["composite_score"] for s in daily_scores],
            "false_alarm_days": count_days_above_threshold_in_benign(daily_scores)
        }
```

---

## SECTION 6 — CROSS-PLATFORM RISK UNIFICATION

### 6.1 ChildRiskProfile Schema

```json
{
  "child_id": "string — opaque identifier",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "cumulative_risk": 0.0-100.0,
  "risk_velocity": 0.0-10.0,
  "vulnerability_index": 0.0-1.0,
  "platform_risk_map": {
    "instagram": {
      "risk_score": 45.2,
      "last_updated": "ISO8601",
      "active_conversations_at_risk": 1,
      "highest_stage_detected": "GS-02"
    },
    "discord": {
      "risk_score": 62.8,
      "last_updated": "ISO8601",
      "active_conversations_at_risk": 1,
      "highest_stage_detected": "GS-03"
    }
  },
  "contact_risk_map": {
    "contact_abc123": {
      "platforms_seen": ["instagram", "discord"],
      "cumulative_risk": 58.5,
      "first_contact_date": "ISO8601",
      "last_interaction_date": "ISO8601",
      "grooming_stage_estimate": "GS-03",
      "cross_platform_flag": true
    }
  },
  "risk_history": [
    {"date": "2026-02-10", "risk": 30.2},
    {"date": "2026-02-11", "risk": 42.1},
    {"date": "2026-02-12", "risk": 55.8},
    {"date": "2026-02-13", "risk": 62.8}
  ],
  "last_escalation_timestamp": "ISO8601 | null"
}
```

### 6.2 Cross-Platform Aggregation Function

```python
def aggregate_cross_platform_risk(child_risk_profile):
    """
    Compute unified risk score from all platform-specific scores.
    Key insight: risk that spans platforms is MORE concerning than
    risk isolated to one platform.
    """
    platform_scores = child_risk_profile.platform_risk_map

    if len(platform_scores) == 0:
        return 0.0

    # Base: weighted max (highest platform risk dominates)
    max_risk = max(p["risk_score"] for p in platform_scores.values())
    avg_risk = mean(p["risk_score"] for p in platform_scores.values())

    base_risk = 0.7 * max_risk + 0.3 * avg_risk

    # Cross-platform multiplier
    cross_platform_contacts = count_contacts_on_multiple_platforms(
        child_risk_profile.contact_risk_map
    )

    if cross_platform_contacts > 0:
        cross_multiplier = 1.0 + 0.15 * min(3, cross_platform_contacts)
    else:
        cross_multiplier = 1.0

    # Platform migration multiplier
    migration_events = count_recent_migration_events(child_risk_profile)
    migration_multiplier = 1.0 + 0.10 * min(3, migration_events)

    unified_risk = base_risk * cross_multiplier * migration_multiplier

    return min(100.0, round(unified_risk, 4))
```

### 6.3 Session and Temporal Linking

```python
class CrossPlatformLinker:
    """
    Links conversations across platforms to the same contact.
    Uses temporal correlation and metadata — NOT content matching.
    """

    def link_sessions(self, events_platform_a, events_platform_b):
        """
        Detect if conversations on two platforms involve the same contact.
        Uses non-invasive signals only.
        """
        signals = []

        # Temporal correlation: messages end on A, start on B within minutes
        temporal_score = self.temporal_correlation(
            events_platform_a, events_platform_b
        )
        signals.append(("temporal", temporal_score))

        # Username similarity (if visible)
        username_score = self.username_similarity(
            events_platform_a.contact_username,
            events_platform_b.contact_username
        )
        signals.append(("username", username_score))

        # Migration reference: explicit mention of other platform
        migration_score = self.migration_reference_score(
            events_platform_a, events_platform_b
        )
        signals.append(("migration_ref", migration_score))

        # Composite linking confidence
        confidence = weighted_mean(signals, weights=[0.4, 0.3, 0.3])

        return {
            "linked": confidence >= 0.6,
            "confidence": confidence,
            "signals": dict(signals)
        }

    def temporal_correlation(self, events_a, events_b):
        """
        Score based on temporal adjacency of conversation endpoints.
        High score = conversation on A ends right before B starts.
        """
        end_times_a = [e.timestamp for e in events_a if e.type == "SESSION_END"]
        start_times_b = [e.timestamp for e in events_b if e.type == "SESSION_START"]

        min_gap_minutes = float('inf')
        for end_a in end_times_a:
            for start_b in start_times_b:
                gap = abs(start_b - end_a) / 60000  # ms to minutes
                min_gap_minutes = min(min_gap_minutes, gap)

        if min_gap_minutes <= 5:
            return 0.9
        elif min_gap_minutes <= 15:
            return 0.6
        elif min_gap_minutes <= 60:
            return 0.3
        else:
            return 0.0
```

### 6.4 Privacy Constraints

1. **No message content leaves the device for cross-platform linking.** Only metadata (timestamps, platform IDs, contact identifiers) is used.
2. **Contact identifiers are hashed locally** before any storage.
3. **Child risk profiles are stored on-device only**, synchronized to parent account via encrypted channel.
4. **No third-party data sharing.** Cross-platform data is never sent to external APIs.
5. **Temporal data has retention limits:** event-level data expires after 90 days; aggregated scores after 365 days.

---

## SECTION 7 — DETERMINISTIC POLICY TRANSLATION VALIDATION

### 7.1 Test Design

The policy engine translates natural-language parent input into structured rule graphs. This must be:
- **Consistent:** Same input always produces same rule graph.
- **Complete:** All parent intent is captured.
- **Precise:** No unintended overblocking.

### 7.2 Structured Policy Graph Schema

```json
{
  "policy_graph": {
    "version": "string",
    "compiled_at": "ISO8601",
    "source_rules": [
      {
        "id": "rule_001",
        "source_text": "block gambling on youtube",
        "parsed_intent": "BLOCK_TOPIC_WITHIN_DOMAIN",
        "nodes": [
          {
            "type": "CONDITION",
            "field": "domain",
            "operator": "MATCHES",
            "value": ["youtube.com", "*.youtube.com"]
          },
          {
            "type": "CONDITION",
            "field": "topic_score.gambling",
            "operator": ">=",
            "value": 0.75
          },
          {
            "type": "ACTION",
            "action": "BLOCK",
            "reason_code": "TOPIC_BLOCK_gambling"
          }
        ],
        "edges": [
          {"from": 0, "to": 1, "logic": "AND"},
          {"from": 1, "to": 2, "logic": "THEN"}
        ]
      }
    ]
  }
}
```

### 7.3 Consistency Testing

```python
def test_consistency(rule_compiler, test_inputs, repetitions=10):
    """
    Each input is compiled N times. All outputs must be structurally identical.
    """
    results = []

    for input_text in test_inputs:
        compilations = []
        for i in range(repetitions):
            compiled = rule_compiler.compile(input_text)
            compilations.append(compiled)

        # All compilations must produce identical graph
        reference = compilations[0]
        all_match = all(
            structural_equal(reference, c) for c in compilations[1:]
        )

        results.append({
            "input": input_text,
            "repetitions": repetitions,
            "consistent": all_match,
            "variance_detected": not all_match,
            "divergence_points": find_divergences(compilations) if not all_match else []
        })

    return {
        "total_tests": len(test_inputs),
        "consistent_count": sum(1 for r in results if r["consistent"]),
        "consistency_rate": sum(1 for r in results if r["consistent"]) / len(results),
        "failures": [r for r in results if not r["consistent"]]
    }
```

### 7.4 Overblocking Detection

```python
def test_overblocking(pipeline, policy_object, test_content_corpus):
    """
    Verify that policies do not block content they should not block.

    test_content_corpus contains:
    - Clearly benign content (expected: ALLOW)
    - Edge cases (expected: varies by policy)
    - Clearly harmful content (expected: BLOCK)
    """
    results = []

    for item in test_content_corpus:
        decision = pipeline.evaluate(item.content, policy_object, empty_session())
        results.append({
            "content_id": item.id,
            "expected_action": item.expected_action,
            "actual_action": decision.action,
            "correct": decision.action == item.expected_action,
            "is_overblock": (
                item.expected_action == "ALLOW"
                and decision.action == "BLOCK"
            ),
            "is_underblock": (
                item.expected_action == "BLOCK"
                and decision.action == "ALLOW"
            ),
            "confidence": decision.confidence,
            "reason": decision.reason_code
        })

    overblocks = [r for r in results if r["is_overblock"]]
    underblocks = [r for r in results if r["is_underblock"]]

    return {
        "total_tests": len(results),
        "accuracy": sum(1 for r in results if r["correct"]) / len(results),
        "overblock_rate": len(overblocks) / len(results),
        "underblock_rate": len(underblocks) / len(results),
        "overblock_cases": overblocks,
        "underblock_cases": underblocks,
        "threshold": {
            "max_acceptable_overblock_rate": 0.05,
            "max_acceptable_underblock_rate": 0.02,
            "passed": (
                len(overblocks) / len(results) <= 0.05
                and len(underblocks) / len(results) <= 0.02
            )
        }
    }
```

### 7.5 Policy Drift Detection

```python
def test_policy_drift(rule_compiler, pipeline, test_inputs, model_versions):
    """
    Verify that policy compilation remains stable across model updates.
    Run same inputs through different model versions and compare outputs.
    """
    results = {}

    for version in model_versions:
        rule_compiler.set_model_version(version)
        version_outputs = {}

        for input_text in test_inputs:
            compiled = rule_compiler.compile(input_text)
            version_outputs[input_text] = compiled

        results[version] = version_outputs

    # Compare all versions against baseline (first version)
    baseline_version = model_versions[0]
    drift_report = []

    for version in model_versions[1:]:
        for input_text in test_inputs:
            baseline_graph = results[baseline_version][input_text]
            current_graph = results[version][input_text]

            if not structural_equal(baseline_graph, current_graph):
                drift_report.append({
                    "input": input_text,
                    "baseline_version": baseline_version,
                    "current_version": version,
                    "divergences": find_divergences(
                        [baseline_graph, current_graph]
                    )
                })

    return {
        "versions_tested": len(model_versions),
        "inputs_tested": len(test_inputs),
        "drift_detected": len(drift_report) > 0,
        "drift_cases": drift_report,
        "drift_rate": len(drift_report) / (
            len(test_inputs) * (len(model_versions) - 1)
        )
    }
```

---

## SECTION 8 — STATISTICAL EVALUATION FRAMEWORK

### 8.1 Core Metrics

```
Confusion Matrix:
                    Predicted Positive    Predicted Negative
Actual Positive     TP (True Positive)    FN (False Negative)
Actual Negative     FP (False Positive)   TN (True Negative)

Precision   = TP / (TP + FP)         -- Of flagged content, how much was truly harmful
Recall      = TP / (TP + FN)         -- Of all harmful content, how much was detected
F1          = 2 * P * R / (P + R)    -- Harmonic mean of precision and recall
FPR         = FP / (FP + TN)         -- False alarm rate
FNR         = FN / (FN + TP)         -- Miss rate
```

### 8.2 Phylax-Specific Metrics

```python
def early_detection_index(conversations):
    """
    Measures how early in a grooming progression the system detects risk.
    Lower = better (detected earlier).

    EDI = mean(detection_turn / total_turns) across all detected conversations.
    Range: 0.0 (detected at first turn) to 1.0 (detected at last turn).
    """
    ratios = []
    for conv in conversations:
        if conv.detected:
            ratio = conv.first_detection_turn / conv.total_turns
            ratios.append(ratio)
    return mean(ratios) if ratios else None

def escalation_detection_latency(conversations):
    """
    Average number of turns between an escalation event and system detection.
    Lower = better.
    """
    latencies = []
    for conv in conversations:
        for escalation in conv.escalation_events:
            if escalation.detected:
                latency = escalation.detection_turn - escalation.event_turn
                latencies.append(latency)
    return mean(latencies) if latencies else None

def overblocking_rate(decisions):
    """
    Rate at which benign content/conversations are incorrectly blocked.
    Must be minimized without sacrificing recall.
    """
    benign_decisions = [d for d in decisions if d.ground_truth == "BENIGN"]
    blocked_benign = [d for d in benign_decisions if d.action == "BLOCK"]
    return len(blocked_benign) / max(len(benign_decisions), 1)

def platform_equity_score(per_platform_metrics):
    """
    Measures consistency of detection performance across platforms.
    1.0 = perfectly equal performance; lower = disparity.
    """
    recalls = [m["recall"] for m in per_platform_metrics.values()]
    return 1.0 - (max(recalls) - min(recalls))
```

### 8.3 Minimum Acceptable Performance Thresholds

| Metric | Target | Minimum for Deployment | Critical Failure |
|--------|--------|----------------------|------------------|
| Precision (grooming) | >= 0.90 | >= 0.80 | < 0.70 |
| Recall (grooming) | >= 0.95 | >= 0.85 | < 0.75 |
| F1 (grooming) | >= 0.92 | >= 0.82 | < 0.72 |
| False Positive Rate | <= 0.03 | <= 0.08 | > 0.15 |
| False Negative Rate | <= 0.05 | <= 0.15 | > 0.25 |
| Early Detection Index | <= 0.25 | <= 0.40 | > 0.60 |
| Escalation Det. Latency | <= 2 turns | <= 5 turns | > 10 turns |
| Overblocking Rate | <= 0.02 | <= 0.05 | > 0.10 |
| Platform Equity Score | >= 0.90 | >= 0.80 | < 0.65 |
| Obfuscation Retention | >= 0.95 | >= 0.85 | < 0.70 |

### 8.4 Investor-Facing Performance Report Template

```json
{
  "report_metadata": {
    "report_date": "ISO8601",
    "evaluation_corpus_size": 10000,
    "platforms_covered": ["instagram", "discord", "tiktok", "snapchat", "youtube"],
    "model_version": "string",
    "policy_version": "string"
  },
  "headline_metrics": {
    "grooming_detection_recall": 0.93,
    "grooming_detection_precision": 0.91,
    "f1_score": 0.92,
    "early_detection_index": 0.22,
    "false_positive_rate": 0.04,
    "overblocking_rate": 0.018
  },
  "adversarial_resilience": {
    "obfuscation_retention_score": 0.94,
    "worst_mutation_category": "MUT-10_contextual_euphemism",
    "worst_mutation_retention": 0.87
  },
  "cross_platform": {
    "platforms_tested": 5,
    "platform_equity_score": 0.88,
    "cross_platform_linking_accuracy": 0.82
  },
  "policy_engine": {
    "consistency_rate": 1.00,
    "overblock_test_pass": true,
    "underblock_test_pass": true,
    "policy_drift_rate": 0.00
  },
  "behavioral_detection": {
    "isolation_detection_rate": 0.89,
    "platform_migration_detection_rate": 0.94,
    "age_gap_detection_rate": 0.97
  },
  "comparison_to_baseline": {
    "vs_keyword_only": "+47% recall, -12% FPR",
    "vs_single_message_classifier": "+31% recall on multi-turn patterns",
    "vs_no_behavioral_signals": "+22% early detection improvement"
  }
}
```

---

## SECTION 9 — RED TEAM GOVERNANCE STRUCTURE

### 9.1 Internal Review Workflow

```
1. TEST PROPOSAL
   Researcher submits RedTeamTestProposal:
   {
     test_id, description, threat_model_section,
     mutation_types, expected_outcomes,
     ethical_review_required: bool
   }

2. APPROVAL GATE
   - Low-risk tests (obfuscation, policy consistency): Auto-approved
   - Medium-risk tests (behavioral simulation): Team lead approval
   - High-risk tests (new threat category modeling): Ethics board approval

3. EXECUTION
   - Tests run in sandboxed environment only
   - No real user data — synthetic corpus only
   - All test inputs/outputs logged

4. REVIEW
   - Results reviewed by at least 2 team members
   - Any unexpected findings flagged for ethics review
   - Results stored in versioned test repository

5. REMEDIATION
   - Detection gaps trigger model update cycle
   - Updates re-tested before deployment
   - Regression tests added to CI/CD
```

### 9.2 Logging Schema

```json
{
  "log_entry": {
    "log_id": "uuid",
    "timestamp": "ISO8601",
    "test_id": "string",
    "test_type": "OBFUSCATION | BEHAVIORAL | POLICY | CROSS_PLATFORM | GROOMING_DETECTION",
    "input_hash": "sha256 — NOT the input itself for sensitive tests",
    "output": {
      "decision": "string",
      "risk_score": "float",
      "detection_result": "TP | FP | TN | FN"
    },
    "model_version": "string",
    "policy_version": "string",
    "reviewer": "string",
    "approved": "bool",
    "notes": "string"
  }
}
```

### 9.3 Test Case Versioning

```
RedTeamTestCase {
  id:           string       // stable identifier
  version:      semver       // 1.0.0, 1.1.0, etc.
  created:      ISO8601
  modified:     ISO8601
  author:       string
  category:     enum
  description:  string       // abstract only
  inputs:       hash[]       // content hashes, not raw content
  expected:     ExpectedOutcome
  dependencies: string[]     // other test IDs this depends on
  deprecated:   bool
}
```

### 9.4 Data Retention Policy

| Data Type | Retention Period | Storage | Access |
|-----------|-----------------|---------|--------|
| Test results (aggregated) | Indefinite | Encrypted DB | Red team + Eng leads |
| Test inputs (synthetic) | 1 year | Encrypted object store | Red team only |
| Audit logs | 3 years | Append-only log | Compliance + Red team |
| Model versions | Indefinite | Version control | Engineering |
| Sensitive test outputs | 90 days | Encrypted, auto-deleted | Red team lead only |

### 9.5 Prohibited Actions

The following are explicitly prohibited in all red-team testing:

1. **No real child data.** All testing uses synthetic data only.
2. **No generation of explicit grooming scripts.** Test inputs are abstract category labels, not dialogue.
3. **No deployment of test payloads outside sandbox.** All mutation and detection testing runs in isolated environments.
4. **No interaction with real minors.** Behavioral simulation uses synthetic profiles only.
5. **No sharing of detection bypass techniques externally.** Obfuscation findings are classified as internal.
6. **No retention of generated harmful content.** If any test produces explicit content, it is immediately purged and only the detection result (TP/FP/TN/FN) is retained.
7. **No testing on production systems.** All red-team tests run against staging replicas.
8. **No single-person approval of high-risk tests.** Minimum 2-person review required.

### 9.6 Ethics Compliance Checklist

Before any red-team test execution:

- [ ] Test proposal documented and approved at appropriate level
- [ ] No real user data involved
- [ ] Synthetic test corpus reviewed for appropriateness
- [ ] Sandbox environment verified isolated from production
- [ ] Logging enabled and verified
- [ ] Results review scheduled with at least 2 team members
- [ ] Data retention policy applied to test artifacts
- [ ] No explicit harmful content will be generated or retained

---

## SECTION 10 — ADDICTION + VULNERABILITY INTEGRATION

### 10.1 Vulnerability Multiplier Model

Grooming risk is significantly amplified when a child exhibits vulnerability signals. This section defines how addiction and vulnerability indicators modify the base risk score.

```python
def compute_vulnerability_multiplier(child_context):
    """
    Returns multiplier in range [1.0, 2.0].
    Higher values indicate increased vulnerability to exploitation.

    Uses ONLY non-invasive signals:
    - Device usage patterns (not content)
    - Temporal patterns (not message content)
    - Contact graph structure (not conversation content)
    """
    addiction_score = compute_addiction_score(child_context)
    isolation_score = compute_isolation_score(child_context)
    emotional_vulnerability = compute_emotional_vulnerability(child_context)

    # Weighted combination
    vulnerability_raw = (
        0.40 * addiction_score +
        0.35 * isolation_score +
        0.25 * emotional_vulnerability
    )

    # Map to multiplier range [1.0, 2.0]
    multiplier = 1.0 + vulnerability_raw

    return min(2.0, round(multiplier, 4))
```

### 10.2 Addiction Score Computation

```python
def compute_addiction_score(context):
    """
    Score 0.0-1.0 indicating compulsive device/platform usage.
    Uses ONLY behavioral metadata, NOT content.
    """
    components = []

    # 1. Session length anomaly
    avg_session = context.avg_session_minutes_7d
    baseline_session = context.baseline_avg_session_minutes_30d
    if baseline_session > 0:
        session_ratio = avg_session / baseline_session
        components.append(("session_length", sigmoid(session_ratio - 1.5)))
    else:
        components.append(("session_length", 0.0))

    # 2. Late-night usage frequency
    late_sessions = context.sessions_after_10pm_7d
    total_sessions = context.total_sessions_7d
    if total_sessions > 0:
        late_ratio = late_sessions / total_sessions
        components.append(("late_night", min(1.0, late_ratio * 2.0)))
    else:
        components.append(("late_night", 0.0))

    # 3. Screen time trend (increasing over 2 weeks)
    if context.daily_minutes_week1 > 0:
        trend = context.daily_minutes_week2 / context.daily_minutes_week1
        components.append(("screen_trend", sigmoid(trend - 1.3)))
    else:
        components.append(("screen_trend", 0.0))

    # 4. Compulsive check frequency (short sessions < 2 min)
    short_sessions = context.sessions_under_2min_7d
    components.append(("compulsive_checks",
        min(1.0, short_sessions / 50.0)))  # 50+ short sessions = max

    # 5. Notification response speed (how fast child responds)
    avg_response_seconds = context.avg_notification_response_seconds
    if avg_response_seconds < 30:
        components.append(("notification_speed", 0.8))
    elif avg_response_seconds < 120:
        components.append(("notification_speed", 0.4))
    else:
        components.append(("notification_speed", 0.1))

    # Weighted mean
    weights = {
        "session_length": 0.25,
        "late_night": 0.20,
        "screen_trend": 0.20,
        "compulsive_checks": 0.20,
        "notification_speed": 0.15
    }

    score = sum(v * weights[k] for k, v in components)
    return min(1.0, round(score, 4))
```

### 10.3 Isolation Score Computation

```python
def compute_isolation_score(context):
    """
    Score 0.0-1.0 indicating social isolation.
    Higher = more isolated = more vulnerable.
    """
    # Contact diversity decline
    contacts_now = context.unique_contacts_7d
    contacts_baseline = context.baseline_unique_contacts_30d
    if contacts_baseline > 0:
        diversity_decline = 1.0 - (contacts_now / contacts_baseline)
        diversity_score = max(0.0, diversity_decline)
    else:
        diversity_score = 0.0

    # Concentration: proportion of time with single contact
    if context.total_message_count_7d > 0:
        max_contact_messages = context.max_single_contact_messages_7d
        concentration = max_contact_messages / context.total_message_count_7d
        concentration_score = max(0.0, concentration - 0.3) / 0.7  # normalize above 0.3
    else:
        concentration_score = 0.0

    # Group vs. 1:1 ratio
    if context.total_conversations_7d > 0:
        dm_ratio = context.dm_conversations_7d / context.total_conversations_7d
        dm_score = max(0.0, dm_ratio - 0.5) / 0.5  # concern above 50% DM
    else:
        dm_score = 0.0

    return min(1.0, round(
        0.40 * diversity_score +
        0.35 * concentration_score +
        0.25 * dm_score,
    4))
```

### 10.4 Combined Grooming + Addiction Co-Risk Model

```python
def compute_co_risk_score(grooming_risk, addiction_score, isolation_score):
    """
    Combined score that captures the interaction between
    grooming patterns and vulnerability indicators.

    Insight: A moderate grooming signal + high vulnerability
    should score higher than moderate grooming alone.
    """
    vulnerability = 0.60 * addiction_score + 0.40 * isolation_score

    if vulnerability >= 0.7:
        # High vulnerability: grooming signals are amplified significantly
        amplification = 1.5
    elif vulnerability >= 0.4:
        # Moderate vulnerability: moderate amplification
        amplification = 1.2
    else:
        # Low vulnerability: minimal amplification
        amplification = 1.0

    co_risk = grooming_risk * amplification

    # Additional flag: if both grooming AND addiction are elevated,
    # this is a distinct compound risk signal
    if grooming_risk >= 40.0 and addiction_score >= 0.6:
        co_risk += 10.0  # additive bonus for compound risk

    return min(100.0, round(co_risk, 4))
```

---

## SECTION 11 — FUTURE RESEARCH EXTENSIONS

### 11.1 Graph Neural Network Interaction Modeling

**Concept:** Model the child's contact graph as a dynamic graph where nodes are contacts and edges are interactions. Apply GNN to detect structural patterns associated with grooming.

**Research Direction:**
- Temporal graph attention networks for evolving contact patterns
- Anomaly detection on graph embeddings (isolation subgraph detection)
- Star-topology detection (predator connecting to multiple isolated minors)
- Graph-based early warning: structural changes that precede content-level signals

**Expected Benefit:** Detection of coordinated grooming networks; detection before content becomes explicit.

### 11.2 Attachment Velocity Modeling

**Concept:** Measure the rate at which emotional dependency forms between a child and a contact. Normal friendships develop attachment gradually; exploitative relationships often show accelerated bonding.

**Research Direction:**
- Define "attachment velocity" as rate of change in communication intensity + exclusivity
- Model: `AttachmentVelocity = d/dt(frequency * exclusivity * emotional_intensity)`
- Compare against age-appropriate bonding baselines
- Flag statistical outliers (>2 sigma above age-matched baseline)

**Expected Benefit:** Detection of love-bombing and rapid trust acceleration tactics.

### 11.3 Emotional Trajectory Detection

**Concept:** Track the emotional arc of a child's communications over time. Grooming often correlates with specific emotional trajectories (initial euphoria, growing dependency, secrecy-induced anxiety).

**Research Direction:**
- Sentiment trajectory analysis (not single-message; trajectory over weeks)
- Emotional volatility scoring (rapid mood swings correlated with specific contact)
- Contact-specific emotional impact analysis
- Comparison to peer-group emotional baselines

**Expected Benefit:** Early detection of emotional manipulation before explicit content appears.

### 11.4 Early-Stage Vulnerability Forecasting

**Concept:** Predict which children are at elevated risk BEFORE any grooming contact occurs, enabling preventive measures.

**Research Direction:**
- Behavioral pattern analysis predicting vulnerability windows
- Temporal models: seasonal patterns (school transitions, summer isolation)
- Device usage pattern changes that predict vulnerability
- Privacy-preserving federated learning across user population

**Expected Benefit:** Shift from reactive detection to proactive prevention.

### 11.5 Cross-Lingual Grooming Detection

**Concept:** Grooming increasingly occurs across languages, especially in multilingual communities and through translation tools.

**Research Direction:**
- Multilingual intent classification (language-agnostic grooming stage detection)
- Code-switching detection (mixing languages to evade detection)
- Translation-aware semantic analysis
- Language-pair specific obfuscation patterns

**Expected Benefit:** Coverage for non-English-speaking children; resilience against language-based evasion.

### 11.6 Federated Detection Model Training

**Concept:** Train detection models across multiple deployments without sharing raw data.

**Research Direction:**
- Federated learning for grooming detection model updates
- Differential privacy guarantees for gradient sharing
- Secure aggregation protocols
- Model performance parity across federated participants

**Expected Benefit:** Continuous model improvement without centralizing sensitive data.

---

## APPENDIX A — INTEGRATION WITH EXISTING PHYLAX ARCHITECTURE

This red-team framework maps to the existing Phylax pipeline as follows:

| Framework Layer | Existing Pipeline Component | Integration Point |
|----------------|---------------------------|-------------------|
| Layer 1 (Obfuscation) | `observer.js` content extraction | Pre-processing before lexicon scoring |
| Layer 2 (Semantic) | `pipeline.js` Step 5-6 (lexicon + remote scoring) | Enhanced intent classification |
| Layer 3 (Multi-turn) | New — extends `pipeline.js` | New stateful accumulator alongside `decision-cache.js` |
| Layer 4 (Behavioral) | `behavior.js` + `compulsion-scorer.js` | Extended with contact graph signals |
| Layer 5 (Policy) | `pipeline.js` Step 8 (topic policy eval) | Extended with grooming-specific thresholds |
| Cross-platform | New — extends `harm-scorer.js` | New `ChildRiskProfile` storage layer |
| Vulnerability | `compulsion-scorer.js` | Extended with isolation + co-risk scoring |

### Existing Thresholds to Preserve

The existing pipeline uses these deterministic thresholds that must remain intact:

```
T_BLOCK_LOCAL  = 0.92  (high-confidence local block)
T_ALLOW_LOCAL  = 0.15  (high-confidence local allow)
Ambiguous band = [0.15, 0.92]  (requires remote scoring)
```

Grooming detection operates in addition to these thresholds — it does not replace the content safety pipeline but adds a parallel multi-turn risk dimension.

---

## APPENDIX B — GLOSSARY

| Term | Definition |
|------|-----------|
| CRS | ConversationRiskScore — cumulative risk across a conversation |
| EDI | Early Detection Index — how early in a conversation risk is flagged |
| GS-XX | Grooming Stage identifier (abstract taxonomy) |
| IC-XX | Intent Class identifier |
| BS-XX | Behavioral Signal identifier |
| MUT-XX | Mutation category identifier |
| FPR | False Positive Rate |
| FNR | False Negative Rate |

---

*This document is a defensive AI safety architecture specification. It contains no operational exploit tactics, grooming scripts, or explicit content. All examples are abstract and non-explicit. This framework is designed for internal red-team evaluation of child protection systems only.*
