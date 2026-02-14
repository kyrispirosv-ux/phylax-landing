import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/extension/sync?device_id=xxx&policy_version=N
 * Extension polls this to get the latest policy pack.
 * Returns versioned policy pack with scoped rules.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("device_id");
  const currentVersion = searchParams.get("policy_version");

  if (!deviceId) {
    return NextResponse.json({ error: "device_id required" }, { status: 400 });
  }

  const db = createServiceClient();

  const { data: device } = await db
    .from("devices")
    .select("id, child_id, family_id, status")
    .eq("id", deviceId)
    .single();

  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  // Update heartbeat
  await db
    .from("devices")
    .update({ last_heartbeat: new Date().toISOString() })
    .eq("id", device.id);

  // Get family policy version
  const { data: family } = await db
    .from("families")
    .select("policy_version, policy_updated_at")
    .eq("id", device.family_id)
    .single();

  const serverVersion = family?.policy_version ?? 1;

  // If extension already has latest version, return short response
  if (currentVersion && parseInt(currentVersion) === serverVersion) {
    return NextResponse.json({
      up_to_date: true,
      policy_version: serverVersion,
      device_id: device.id,
    });
  }

  // Get the child's info
  const { data: child } = await db
    .from("children")
    .select("name, tier")
    .eq("id", device.child_id)
    .single();

  // Get all active rules for this family (global + child-specific)
  const { data: rules } = await db
    .from("rules")
    .select("id, text, scope, target, active, sort_order, child_id")
    .eq("family_id", device.family_id)
    .eq("active", true)
    .or(`child_id.is.null,child_id.eq.${device.child_id}`)
    .order("sort_order");

  // Build the versioned policy pack
  const policyPack = {
    policy_version: serverVersion,
    generated_at: family?.policy_updated_at ?? new Date().toISOString(),
    child_id: device.child_id,
    child_name: child?.name ?? "Unknown",
    tier: child?.tier ?? "tween_13",
    rules: (rules ?? []).map((r: {
      id: string;
      text: string;
      scope: string;
      target: string | null;
      sort_order: number;
      child_id: string | null;
    }) => ({
      id: r.id,
      text: r.text,
      scope: r.scope,
      target: r.target,
      sort_order: r.sort_order,
      applies_to: r.child_id ? "child" : "all",
    })),
  };

  return NextResponse.json({
    device_id: device.id,
    policy_pack: policyPack,
    policy_version: serverVersion,
    synced_at: new Date().toISOString(),
  });
}

/**
 * POST /api/extension/sync
 * Extension sends heartbeat + version info.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { device_id, extension_version } = body;

  if (!device_id) {
    return NextResponse.json({ error: "device_id required" }, { status: 400 });
  }

  const db = createServiceClient();

  await db
    .from("devices")
    .update({
      last_heartbeat: new Date().toISOString(),
      extension_version: extension_version ?? null,
    })
    .eq("id", device_id);

  return NextResponse.json({ status: "ok" });
}
