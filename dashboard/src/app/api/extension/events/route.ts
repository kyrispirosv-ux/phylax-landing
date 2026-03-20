import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateExtension } from "@/lib/extension-auth";

/**
 * POST /api/extension/events
 * Extension sends events (blocked, allowed, request_access, heartbeat, policy_applied)
 *
 * Auth: Bearer token (preferred) or device_id fallback.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { device_id, events } = body;

  // Authenticate the extension
  const auth = await authenticateExtension(request, device_id);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized or device not found" }, { status: 401 });
  }

  const db = createServiceClient();

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
    family_id: auth.family_id,
    child_id: auth.child_id,
    device_id: auth.device_id,
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
    .eq("id", auth.device_id);

  return NextResponse.json({ status: "ok", count: rows.length });
}
