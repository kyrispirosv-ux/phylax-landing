import { NextRequest, NextResponse } from "next/server";

// ═════════════════════════════════════════════════════════════════
// POST /api/extension/llm-evaluate
// ═════════════════════════════════════════════════════════════════
// Cloud evaluation endpoint (Layer 2) for ambiguous content.
// Called when local semantic interpreter confidence < 0.6.
//
// Receives content + parent rules + context, calls Claude for
// structured safety evaluation, returns SemanticResult format.
// ═════════════════════════════════════════════════════════════════

// ── Rate limiting (in-memory, per-IP) ────────────────────────────

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 20; // max requests per window per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return true;
  }

  return false;
}

// Periodic cleanup to prevent memory leak
setInterval(() => {
  const now = Date.now();
  const keys = Array.from(rateLimitMap.keys());
  for (const key of keys) {
    const entry = rateLimitMap.get(key);
    if (entry && now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(key);
    }
  }
}, RATE_LIMIT_WINDOW_MS * 5);

// ── Types ────────────────────────────────────────────────────────

interface EvaluationRequest {
  content: string;
  parent_rules: string[];
  conversation_context?: string;
  child_age_tier?: string;
  local_result?: {
    topic: string;
    intent: string;
    stance: string;
    risk_level: number;
    age_fit: number;
    confidence: number;
    flags: string[];
  };
}

interface SemanticResult {
  signal_id: string;
  topic: string;
  intent: string;
  stance: string;
  risk_level: number;
  age_fit: number;
  confidence: number;
  layer: string;
  reasoning: string[];
  flags: string[];
}

// ── Claude evaluation prompt ─────────────────────────────────────

function buildEvaluationPrompt(req: EvaluationRequest): string {
  const ageTier = req.child_age_tier || "tween_13";
  const rulesSection =
    req.parent_rules.length > 0
      ? req.parent_rules.map((r, i) => `  ${i + 1}. ${r}`).join("\n")
      : "  (No specific parent rules configured)";

  const contextSection = req.conversation_context
    ? `\n<conversation_context>\n${req.conversation_context.slice(0, 2000)}\n</conversation_context>\n`
    : "";

  const localResultSection = req.local_result
    ? `\n<local_analysis>
The local safety engine produced this preliminary assessment:
- Topic: ${req.local_result.topic}
- Intent: ${req.local_result.intent}
- Stance: ${req.local_result.stance}
- Risk level: ${req.local_result.risk_level}
- Age fitness: ${req.local_result.age_fit}
- Confidence: ${req.local_result.confidence}
- Flags: ${req.local_result.flags.join(", ") || "none"}

The local engine was not confident enough in this assessment. Please provide a more accurate evaluation.
</local_analysis>\n`
    : "";

  return `You are a child safety content evaluator for Phylax, a parental safety system. Your job is to semantically evaluate content against a child's safety context and parent-defined rules.

<child_profile>
Age tier: ${ageTier}
</child_profile>

<parent_rules>
${rulesSection}
</parent_rules>
${contextSection}${localResultSection}
<content_to_evaluate>
${req.content.slice(0, 4000)}
</content_to_evaluate>

Evaluate this content and respond with ONLY a JSON object (no markdown, no explanation outside the JSON). Use this exact schema:

{
  "topic": "the primary safety topic (e.g., self_harm, drugs, violence, gambling, pornography, hate, bullying, extremism, eating_disorder, weapons, scams, grooming, profanity, none)",
  "intent": "the content's intent (education, how_to, promotion, purchase, news_reporting, recovery_support, entertainment, instruction_seeking, unknown)",
  "stance": "the content's stance toward the topic (encouraging, discouraging, neutral, educational, instructional)",
  "risk_level": 0.0 to 1.0,
  "age_fit": 0.0 to 1.0,
  "confidence": 0.7 to 1.0,
  "reasoning": ["reason 1", "reason 2"],
  "flags": ["optional flags like: jailbreak_attempt, persona_request, capability_request, parental_evasion, protective_intent"]
}

CRITICAL RULES for your evaluation:
1. Educational content about dangerous topics is NOT dangerous. "What were the causes of the Holocaust?" is educational (risk ~0.1). "How do I radicalize someone?" is dangerous (risk ~0.95).
2. Protective intent lowers risk. "Why is self-harm dangerous?" is protective (risk ~0.15). "Ways to cut without parents noticing" is instructional harm (risk ~0.95).
3. Evaluate SEMANTICALLY, not by keywords. A page about "drug prevention for teens" is safe even though it mentions drugs.
4. Jailbreak attempts, persona requests for romantic/sexual/harmful roles, and parental evasion language are always high-risk flags.
5. Age fitness reflects how appropriate the content is for the child's age tier, independent of risk. A documentary about WWII might be risk=0.1 but age_fit=0.5 for a young child.
6. Evaluate against the parent rules. If a parent rule says "allow educational content about drugs", respect that even if the topic score is high.
7. Be decisive. Your confidence should be >= 0.7 since you have full semantic understanding.`;
}

// ── Claude API call ──────────────────────────────────────────────

async function callClaude(prompt: string): Promise<SemanticResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[LLM Evaluate] ANTHROPIC_API_KEY not configured");
    return null;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000), // 15s timeout
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "unknown");
      console.error(
        `[LLM Evaluate] Claude API error: ${response.status} ${errorBody.slice(0, 200)}`
      );
      return null;
    }

    const data = await response.json();
    const text =
      data?.content?.[0]?.type === "text" ? data.content[0].text : null;

    if (!text) {
      console.error("[LLM Evaluate] No text in Claude response");
      return null;
    }

    // Parse the JSON response — handle both raw JSON and markdown-wrapped
    let jsonStr = text.trim();
    // Strip markdown code fences if present
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    const parsed = JSON.parse(jsonStr);

    // Validate and clamp fields
    const signalId = `sig_cloud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    return {
      signal_id: signalId,
      topic: parsed.topic || "none",
      intent: parsed.intent || "unknown",
      stance: parsed.stance || "neutral",
      risk_level: clamp01(parsed.risk_level ?? 0),
      age_fit: clamp01(parsed.age_fit ?? 0.5),
      confidence: clamp01(parsed.confidence ?? 0.7),
      layer: "cloud",
      reasoning: Array.isArray(parsed.reasoning)
        ? parsed.reasoning.slice(0, 5)
        : ["Cloud evaluation completed."],
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
    };
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error("[LLM Evaluate] Failed to parse Claude JSON response");
    } else if (err instanceof DOMException && err.name === "AbortError") {
      console.error("[LLM Evaluate] Claude API request timed out (15s)");
    } else {
      console.error("[LLM Evaluate] Claude API call failed:", err);
    }
    return null;
  }
}

function clamp01(n: number): number {
  return Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;
}

// ── Route handler ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Rate limiting
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Max 20 requests per minute." },
      { status: 429 }
    );
  }

  // Parse request
  let body: EvaluationRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Validate required fields
  if (!body.content || typeof body.content !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid 'content' field (string required)" },
      { status: 400 }
    );
  }

  if (body.content.length < 3) {
    return NextResponse.json(
      { error: "Content too short to evaluate" },
      { status: 400 }
    );
  }

  if (body.content.length > 10_000) {
    return NextResponse.json(
      { error: "Content exceeds maximum length (10,000 characters)" },
      { status: 400 }
    );
  }

  if (!body.parent_rules || !Array.isArray(body.parent_rules)) {
    body.parent_rules = [];
  }

  // Build prompt and call Claude
  const prompt = buildEvaluationPrompt(body);
  const result = await callClaude(prompt);

  if (!result) {
    // Cloud evaluation failed — return error with suggestion to use local result
    return NextResponse.json(
      {
        error: "Cloud evaluation unavailable",
        fallback: "local",
        message:
          "The LLM evaluation service is temporarily unavailable. Use the local semantic interpreter result.",
      },
      { status: 503 }
    );
  }

  return NextResponse.json(result);
}

// ── CORS preflight ───────────────────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
