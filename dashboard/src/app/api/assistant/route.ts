import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const SYSTEM_PROMPTS: Record<string, string> = {
  rules: `You are the Phylax Safety Assistant — an expert in child online safety embedded in a parent dashboard.
Your job is to help parents create effective internet safety rules for their children.

You can help with:
- Suggesting site blocks (blocking entire domains like tiktok.com)
- Suggesting content filters (blocking topics like violence, gambling across all sites)
- Explaining what different rule types do
- Recommending rules based on the child's age
- Answering questions about online safety

When suggesting a rule, format it clearly:
**Type:** Site Block or Content Filter
**Rule:** [the rule text]
**Target:** [optional domain or keyword]

Keep responses concise and friendly. You're talking to parents who care about their kids' safety.`,

  llm: `You are the Phylax AI Safety Assistant — an expert in AI chatbot safety for children.
Your job is to help parents create rules that control how AI chatbots (ChatGPT, Gemini, Grok, Claude) interact with their children.

You can help with:
- **Topic Blocks**: Prevent AI from discussing specific subjects (weapons, drugs, explicit content, self-harm)
- **Capability Blocks**: Restrict what AI can do (code generation for exploits, image generation, web browsing)
- **Persona Blocks**: Stop jailbreak attempts (DAN prompts, roleplay bypasses, system prompt overrides)

When suggesting a rule, format it clearly:
**Platform:** All / ChatGPT / Gemini / Grok / Claude
**Category:** Topic Block / Capability Block / Persona Block
**Rule:** [the rule text]

You understand how children try to circumvent AI safety:
- Jailbreaking with DAN prompts
- Roleplay scenarios to bypass filters
- Asking AI to pretend it has no restrictions
- Using coded language

Keep responses concise and actionable. Help parents stay ahead of these tactics.`,
};

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messages, context } = await request.json();
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Messages required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI assistant not configured. Add ANTHROPIC_API_KEY to .env.local" }, { status: 503 });
  }

  const systemPrompt = SYSTEM_PROMPTS[context] || SYSTEM_PROMPTS.rules;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.slice(-10).map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[Assistant] Claude API error:", errText);
    return NextResponse.json({ error: "AI service error" }, { status: 502 });
  }

  const data = await response.json();
  const reply = data.content?.[0]?.text || "Sorry, I couldn't generate a response.";

  return NextResponse.json({ reply });
}
