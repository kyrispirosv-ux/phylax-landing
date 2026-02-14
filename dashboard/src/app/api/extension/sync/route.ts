import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/extension/sync?device_id=xxx
 * Extension polls this to get the latest rules for the device's child profile.
 * Returns rules + profile tier so the extension can rebuild its policy.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("device_id");
  const pairingCode = searchParams.get("pairing_code");

  if (!deviceId && !pairingCode) {
    return NextResponse.json({ error: "device_id or pairing_code required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Look up the device
  let device;
  if (deviceId) {
    const { data } = await supabase
      .from("devices")
      .select("id, child_id, family_id, status")
      .eq("id", deviceId)
      .single();
    device = data;
  } else if (pairingCode) {
    // First-time pairing: look up by code, activate the device
    const { data } = await supabase
      .from("devices")
      .select("id, child_id, family_id, status")
      .eq("pairing_code", pairingCode)
      .single();
    device = data;

    if (device && device.status === "pending") {
      await supabase
        .from("devices")
        .update({ status: "active", pairing_code: null })
        .eq("id", device.id);
    }
  }

  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  // Update heartbeat
  await supabase
    .from("devices")
    .update({ last_heartbeat: new Date().toISOString() })
    .eq("id", device.id);

  // Get the child's tier
  const { data: child } = await supabase
    .from("children")
    .select("name, tier")
    .eq("id", device.child_id)
    .single();

  // Get all active rules for this family (global + child-specific)
  const { data: rules } = await supabase
    .from("rules")
    .select("text, active")
    .eq("family_id", device.family_id)
    .eq("active", true)
    .or(`child_id.is.null,child_id.eq.${device.child_id}`)
    .order("sort_order");

  return NextResponse.json({
    device_id: device.id,
    child_name: child?.name ?? "Unknown",
    tier: child?.tier ?? "tween_13",
    rules: (rules ?? []).map((r: { text: string; active: boolean }) => ({ text: r.text, active: r.active })),
    synced_at: Date.now(),
  });
}

/**
 * POST /api/extension/sync
 * Extension sends heartbeat + version info.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { device_id, extension_version, platform } = body;

  if (!device_id) {
    return NextResponse.json({ error: "device_id required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  await supabase
    .from("devices")
    .update({
      last_heartbeat: new Date().toISOString(),
      extension_version: extension_version ?? null,
    })
    .eq("id", device_id);

  return NextResponse.json({ status: "ok" });
}
