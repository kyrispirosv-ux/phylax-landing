import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateExtension } from "@/lib/extension-auth";

/**
 * POST /api/extension/access-request
 * Child's extension sends a "request access" for a blocked page.
 *
 * Auth: Bearer token (preferred) or device_id fallback.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { device_id, url, domain, rule_id, reason } = body;

  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  // Authenticate the extension
  const auth = await authenticateExtension(request, device_id);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized or device not found" }, { status: 401 });
  }

  const db = createServiceClient();

  const { data: req, error } = await db
    .from("access_requests")
    .insert({
      family_id: auth.family_id,
      child_id: auth.child_id,
      device_id: auth.device_id,
      url,
      domain: domain ?? null,
      rule_id: rule_id ?? null,
      reason: reason ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also create an alert for the parent
  await db.from("alerts").insert({
    family_id: auth.family_id,
    child_id: auth.child_id,
    device_id: auth.device_id,
    alert_type: "ACCESS_REQUEST",
    severity: "info",
    title: `Access requested: ${domain || url}`,
    body: reason || null,
    url,
    domain: domain ?? null,
  });

  return NextResponse.json({ status: "ok", request_id: req?.id });
}
