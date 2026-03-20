import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateExtension } from "@/lib/extension-auth";

/**
 * POST /api/extension/alerts
 * Extension sends parent alerts (grooming detection, content blocks, etc.)
 *
 * Auth: Bearer token (preferred) or device_id fallback.
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

  if (!alert_type || !title) {
    return NextResponse.json(
      { error: "alert_type and title required" },
      { status: 400 },
    );
  }

  // Authenticate the extension
  const auth = await authenticateExtension(request, device_id);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized or device not found" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: alert, error } = await supabase
    .from("alerts")
    .insert({
      family_id: auth.family_id,
      child_id: auth.child_id,
      device_id: auth.device_id,
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
