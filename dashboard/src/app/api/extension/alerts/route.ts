import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/extension/alerts
 * Extension sends parent alerts (grooming detection, content blocks, etc.)
 */
export async function POST(request: Request) {
  const body = await request.json();
  const {
    device_id,
    alert_type,
    severity,
    title,
    body: alertBody,
    url,
    domain,
    reason_code,
    confidence,
    evidence,
  } = body;

  if (!device_id || !alert_type || !title) {
    return NextResponse.json(
      { error: "device_id, alert_type, and title required" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Look up the device to get family_id and child_id
  const { data: device } = await supabase
    .from("devices")
    .select("id, child_id, family_id")
    .eq("id", device_id)
    .single();

  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  const { data: alert, error } = await supabase
    .from("alerts")
    .insert({
      family_id: device.family_id,
      child_id: device.child_id,
      device_id: device.id,
      alert_type,
      severity: severity ?? "warning",
      title,
      body: alertBody ?? null,
      url: url ?? null,
      domain: domain ?? null,
      reason_code: reason_code ?? null,
      confidence: confidence ?? null,
      evidence: evidence ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", alert_id: alert?.id });
}
