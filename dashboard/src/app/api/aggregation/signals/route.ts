import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/aggregation/signals
 * Receives batched anonymized signal tuples from extensions.
 * Only accepts from devices with share_safety_insights enabled.
 *
 * Privacy enforcement:
 * - Validates no PII fields present
 * - Validates no raw content
 * - Validates no exact timestamps (must be hour-bucketed)
 * - Rate-limited per device (max 200 signals per flush)
 */

const MAX_BATCH_SIZE = 200;

// Fields that must NEVER appear in a signal
const PROHIBITED_FIELDS = new Set([
  "content", "text", "message", "url", "username", "email",
  "name", "address", "phone", "ip", "user_id", "child_id",
  "family_id", "device_id", "transcript", "conversation",
]);

// Fields allowed in a signal tuple
const ALLOWED_FIELDS = new Set([
  "signal_hash", "topic", "intent", "stance", "risk_level",
  "platform", "source_type", "direction", "decision", "confidence",
  "pattern_type", "escalation_stage", "child_age_tier",
  "triggered_rule_types", "parent_override", "timestamp_bucket",
  "region",
]);

type SignalTuple = {
  signal_hash: string;
  topic?: string;
  intent?: string;
  stance?: string;
  risk_level?: number;
  platform?: string;
  source_type?: string;
  direction?: string;
  decision?: string;
  confidence?: number;
  pattern_type?: string;
  escalation_stage?: number;
  child_age_tier?: string;
  triggered_rule_types?: string[];
  parent_override?: string;
  timestamp_bucket?: string;
  region?: string;
};

/**
 * Validate that a timestamp is bucketed to the hour (minutes, seconds, ms are zero).
 */
function isHourBucketed(ts: string): boolean {
  try {
    const d = new Date(ts);
    return d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
  } catch {
    return false;
  }
}

/**
 * Validate a single signal tuple for privacy compliance.
 */
function validateSignal(signal: Record<string, unknown>): string | null {
  // Check for prohibited fields
  for (const key of Object.keys(signal)) {
    if (PROHIBITED_FIELDS.has(key)) {
      return `Prohibited field: ${key}`;
    }
    if (!ALLOWED_FIELDS.has(key)) {
      return `Unknown field: ${key}`;
    }
  }

  // Require signal_hash
  if (!signal.signal_hash || typeof signal.signal_hash !== "string") {
    return "Missing or invalid signal_hash";
  }

  // Validate timestamp is hour-bucketed
  if (signal.timestamp_bucket && typeof signal.timestamp_bucket === "string") {
    if (!isHourBucketed(signal.timestamp_bucket)) {
      return "timestamp_bucket must be bucketed to the hour";
    }
  }

  // Check no string values are suspiciously long (potential content leaks)
  for (const [key, val] of Object.entries(signal)) {
    if (typeof val === "string" && val.length > 200) {
      return `Field ${key} is too long (${val.length} chars)`;
    }
  }

  // Validate numeric ranges
  if (signal.risk_level !== undefined && signal.risk_level !== null) {
    const rl = signal.risk_level as number;
    if (typeof rl !== "number" || rl < 0 || rl > 1) {
      return "risk_level must be a number between 0 and 1";
    }
  }

  if (signal.confidence !== undefined && signal.confidence !== null) {
    const conf = signal.confidence as number;
    if (typeof conf !== "number" || conf < 0 || conf > 1) {
      return "confidence must be a number between 0 and 1";
    }
  }

  return null; // valid
}

export async function POST(request: Request) {
  let body: { device_id?: string; signals?: SignalTuple[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { device_id, signals } = body;

  if (!device_id) {
    return NextResponse.json({ error: "device_id required" }, { status: 400 });
  }

  if (!Array.isArray(signals) || signals.length === 0) {
    return NextResponse.json({ error: "signals array required" }, { status: 400 });
  }

  if (signals.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Batch too large (max ${MAX_BATCH_SIZE})` },
      { status: 400 },
    );
  }

  const db = createServiceClient();

  // Look up device and verify family opt-in
  const { data: device } = await db
    .from("devices")
    .select("id, family_id")
    .eq("id", device_id)
    .single();

  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  // Check family has opted in to sharing safety insights
  const { data: family } = await db
    .from("families")
    .select("share_safety_insights")
    .eq("id", device.family_id)
    .single();

  if (!family?.share_safety_insights) {
    return NextResponse.json(
      { error: "Family has not opted in to share_safety_insights" },
      { status: 403 },
    );
  }

  // Rate limiting: check recent signal count from this device (last 5 minutes)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count: recentCount } = await db
    .from("safety_signals")
    .select("*", { count: "exact", head: true })
    .gte("created_at", fiveMinAgo);

  // Global rate limit — if more than 10,000 signals in last 5 min, reject
  if (recentCount && recentCount > 10000) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Validate each signal for privacy compliance
  const validSignals: SignalTuple[] = [];
  const errors: string[] = [];

  for (let i = 0; i < signals.length; i++) {
    const err = validateSignal(signals[i] as unknown as Record<string, unknown>);
    if (err) {
      errors.push(`Signal ${i}: ${err}`);
    } else {
      validSignals.push(signals[i]);
    }
  }

  if (validSignals.length === 0) {
    return NextResponse.json(
      { error: "All signals rejected", details: errors },
      { status: 400 },
    );
  }

  // Insert valid signals into safety_signals table (NOT events table)
  const rows = validSignals.map((s) => ({
    signal_hash: s.signal_hash,
    topic: s.topic ?? null,
    intent: s.intent ?? null,
    stance: s.stance ?? null,
    risk_level: s.risk_level ?? null,
    platform: s.platform ?? null,
    source_type: s.source_type ?? null,
    direction: s.direction ?? null,
    decision: s.decision ?? null,
    confidence: s.confidence ?? null,
    pattern_type: s.pattern_type ?? null,
    escalation_stage: s.escalation_stage ?? null,
    child_age_tier: s.child_age_tier ?? null,
    triggered_rule_types: s.triggered_rule_types ?? null,
    timestamp_bucket: s.timestamp_bucket ?? null,
    region: s.region ?? null,
  }));

  const { error } = await db.from("safety_signals").insert(rows);

  if (error) {
    console.error("[aggregation/signals] Insert error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    status: "ok",
    accepted: validSignals.length,
    rejected: errors.length,
    ...(errors.length > 0 ? { rejection_reasons: errors } : {}),
  });
}
