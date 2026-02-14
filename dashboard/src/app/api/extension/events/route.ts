import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/extension/events
 * Extension sends events (blocked, allowed, request_access, heartbeat, policy_applied)
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { device_id, events } = body;

  if (!device_id) {
    return NextResponse.json({ error: "device_id required" }, { status: 400 });
  }

  const db = createServiceClient();

  // Look up device
  const { data: device } = await db
    .from("devices")
    .select("id, child_id, family_id")
    .eq("id", device_id)
    .single();

  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  // Accept single event or batch
  const eventList = Array.isArray(events) ? events : [body];

  const rows = eventList.map((evt: {
    event_type: string;
    domain?: string;
    url?: string;
    category?: string;
    rule_id?: string;
    reason_code?: string;
    confidence?: number;
    metadata?: unknown;
    timestamp?: string;
  }) => ({
    family_id: device.family_id,
    child_id: device.child_id,
    device_id: device.id,
    event_type: evt.event_type,
    domain: evt.domain ?? null,
    url: evt.url ?? null,
    category: evt.category ?? null,
    rule_id: evt.rule_id ?? null,
    reason_code: evt.reason_code ?? null,
    confidence: evt.confidence ?? null,
    metadata: evt.metadata ?? null,
  }));

  const { error } = await db.from("events").insert(rows);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update heartbeat
  await db
    .from("devices")
    .update({ last_heartbeat: new Date().toISOString() })
    .eq("id", device.id);

  return NextResponse.json({ status: "ok", count: rows.length });
}
