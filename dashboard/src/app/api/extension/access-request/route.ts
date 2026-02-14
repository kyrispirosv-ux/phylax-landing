import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/extension/access-request
 * Child's extension sends a "request access" for a blocked page.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { device_id, url, domain, rule_id, reason } = body;

  if (!device_id || !url) {
    return NextResponse.json({ error: "device_id and url required" }, { status: 400 });
  }

  const db = createServiceClient();

  const { data: device } = await db
    .from("devices")
    .select("id, child_id, family_id")
    .eq("id", device_id)
    .single();

  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  const { data: req, error } = await db
    .from("access_requests")
    .insert({
      family_id: device.family_id,
      child_id: device.child_id,
      device_id: device.id,
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
    family_id: device.family_id,
    child_id: device.child_id,
    device_id: device.id,
    alert_type: "ACCESS_REQUEST",
    severity: "info",
    title: `Access requested: ${domain || url}`,
    body: reason || null,
    url,
    domain: domain ?? null,
  });

  return NextResponse.json({ status: "ok", request_id: req?.id });
}
