import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/devices
 * Returns the parent's devices. Used by the dashboard to poll for newly paired devices.
 */
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: parent } = await supabase
    .from("parents")
    .select("family_id")
    .eq("id", user.id)
    .single() as { data: { family_id: string } | null };

  if (!parent) {
    return NextResponse.json({ devices: [] });
  }

  const { data: devices } = await supabase
    .from("devices")
    .select("id, child_id, device_name, status, last_heartbeat, extension_version")
    .eq("family_id", parent.family_id)
    .eq("status", "active");

  return NextResponse.json({ devices: devices ?? [] });
}

/**
 * DELETE /api/devices?device_id=xxx
 * Parent unpairs a device. Marks it inactive and clears auth token.
 */
export async function DELETE(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("device_id");

  if (!deviceId) {
    return NextResponse.json({ error: "device_id required" }, { status: 400 });
  }

  // Get parent's family
  const { data: parent } = await supabase
    .from("parents")
    .select("id, family_id")
    .eq("id", user.id)
    .single() as { data: { id: string; family_id: string } | null };

  if (!parent) {
    return NextResponse.json({ error: "Parent not found" }, { status: 404 });
  }

  // Verify device belongs to this family
  const db = createServiceClient();
  const { data: device } = await db
    .from("devices")
    .select("id, family_id")
    .eq("id", deviceId)
    .eq("family_id", parent.family_id)
    .single();

  if (!device) {
    return NextResponse.json({ error: "Device not found in your family" }, { status: 404 });
  }

  // Mark device as inactive and clear auth token
  const { error } = await db
    .from("devices")
    .update({
      status: "inactive",
      auth_token_hash: null,
    })
    .eq("id", deviceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, device_id: deviceId });
}
