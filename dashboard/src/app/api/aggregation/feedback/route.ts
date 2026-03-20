import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/aggregation/feedback
 * Receives parent correction signals (false positives and false negatives).
 * Links to signal_hash — never to specific content.
 */

type FeedbackPayload = {
  feedback_type: "false_positive" | "false_negative";
  signal_hash: string;
  original_decision?: string;
  original_topic?: string;
  original_confidence?: number;
  parent_action?: string;
  parent_flagged_topic?: string;
  platform?: string;
  child_age_tier?: string;
};

const VALID_FEEDBACK_TYPES = new Set(["false_positive", "false_negative"]);

export async function POST(request: Request) {
  let body: { device_id?: string; feedback?: FeedbackPayload };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { device_id, feedback } = body;

  if (!device_id) {
    return NextResponse.json({ error: "device_id required" }, { status: 400 });
  }

  if (!feedback || typeof feedback !== "object") {
    return NextResponse.json({ error: "feedback object required" }, { status: 400 });
  }

  if (!VALID_FEEDBACK_TYPES.has(feedback.feedback_type)) {
    return NextResponse.json(
      { error: "feedback_type must be 'false_positive' or 'false_negative'" },
      { status: 400 },
    );
  }

  if (!feedback.signal_hash || typeof feedback.signal_hash !== "string") {
    return NextResponse.json({ error: "signal_hash required" }, { status: 400 });
  }

  // Validate no suspiciously long strings (content leak protection)
  for (const [key, val] of Object.entries(feedback)) {
    if (typeof val === "string" && val.length > 200) {
      return NextResponse.json(
        { error: `Field ${key} is too long` },
        { status: 400 },
      );
    }
  }

  // Validate confidence range
  if (
    feedback.original_confidence !== undefined &&
    feedback.original_confidence !== null
  ) {
    if (
      typeof feedback.original_confidence !== "number" ||
      feedback.original_confidence < 0 ||
      feedback.original_confidence > 1
    ) {
      return NextResponse.json(
        { error: "original_confidence must be between 0 and 1" },
        { status: 400 },
      );
    }
  }

  const db = createServiceClient();

  // Look up device to get family_id
  const { data: device } = await db
    .from("devices")
    .select("id, family_id")
    .eq("id", device_id)
    .single();

  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  // Rate limiting: max 50 feedback entries per family per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await db
    .from("parent_feedback")
    .select("*", { count: "exact", head: true })
    .eq("family_id", device.family_id)
    .gte("created_at", oneHourAgo);

  if (recentCount && recentCount >= 50) {
    return NextResponse.json(
      { error: "Rate limit exceeded (max 50 feedback per hour)" },
      { status: 429 },
    );
  }

  // Insert feedback into parent_feedback table
  const row = {
    family_id: device.family_id,
    signal_hash: feedback.signal_hash,
    feedback_type: feedback.feedback_type,
    original_decision: feedback.original_decision ?? null,
    original_topic: feedback.original_topic ?? null,
    original_confidence: feedback.original_confidence ?? null,
    parent_action: feedback.parent_action ?? null,
    parent_flagged_topic: feedback.parent_flagged_topic ?? null,
    platform: feedback.platform ?? null,
    child_age_tier: feedback.child_age_tier ?? null,
  };

  const { error } = await db.from("parent_feedback").insert(row);

  if (error) {
    console.error("[aggregation/feedback] Insert error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
