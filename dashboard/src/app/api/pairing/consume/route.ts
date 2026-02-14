import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const MAX_ATTEMPTS_PER_IP = 10;
const ATTEMPT_WINDOW_MINUTES = 15;

/**
 * POST /api/pairing/consume
 * Extension consumes a pairing token (by token_id+secret or short_code).
 * Creates a device record bound to the child.
 * Returns: device_id, child_id, policy_version, policy_pack
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { token_id, secret, short_code, device_name, platform } = body;

  if (!token_id && !short_code) {
    return NextResponse.json(
      { error: "Provide token_id+secret or short_code" },
      { status: 400 },
    );
  }

  const db = createServiceClient();

  // Rate limit for short_code attempts
  if (short_code && !token_id) {
    const ipHint = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()?.slice(-8) || "unknown";

    // Check recent failed attempts
    const cutoff = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000).toISOString();
    const { count } = await db
      .from("pairing_attempts")
      .select("*", { count: "exact", head: true })
      .eq("ip_hint", ipHint)
      .eq("success", false)
      .gte("created_at", cutoff);

    if ((count ?? 0) >= MAX_ATTEMPTS_PER_IP) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429 },
      );
    }

    // Look up the token by short code
    const { data: token } = await db
      .from("pairing_tokens")
      .select("*")
      .eq("short_code", short_code)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!token) {
      // Log failed attempt
      await db.from("pairing_attempts").insert({
        ip_hint: ipHint,
        short_code,
        success: false,
      });
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 404 });
    }

    // Log success
    await db.from("pairing_attempts").insert({
      ip_hint: ipHint,
      short_code,
      success: true,
    });

    // Continue with this token
    return await consumeToken(db, token, device_name, platform);
  }

  // Direct token_id + secret flow
  if (token_id && secret) {
    const { data: token } = await db
      .from("pairing_tokens")
      .select("*")
      .eq("id", token_id)
      .eq("secret", secret)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!token) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }

    return await consumeToken(db, token, device_name, platform);
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function consumeToken(db: any, token: any, deviceName?: string, platform?: string) {
  // Create the device record
  const { data: device, error: deviceError } = await db
    .from("devices")
    .insert({
      child_id: token.child_id,
      family_id: token.family_id,
      platform: platform || "chrome",
      device_name: deviceName || "Chrome Browser",
      status: "active",
      last_heartbeat: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (deviceError) {
    return NextResponse.json({ error: deviceError.message }, { status: 500 });
  }

  // Mark token as used
  await db
    .from("pairing_tokens")
    .update({
      used_at: new Date().toISOString(),
      used_by_device_id: device.id,
    })
    .eq("id", token.id);

  // Get the family's policy version
  const { data: family } = await db
    .from("families")
    .select("policy_version, policy_updated_at")
    .eq("id", token.family_id)
    .single();

  // Get child info
  const { data: child } = await db
    .from("children")
    .select("name, tier")
    .eq("id", token.child_id)
    .single();

  // Get active rules (policy pack)
  const { data: rules } = await db
    .from("rules")
    .select("id, text, scope, target, active, sort_order")
    .eq("family_id", token.family_id)
    .eq("active", true)
    .or(`child_id.is.null,child_id.eq.${token.child_id}`)
    .order("sort_order");

  const policyPack = {
    policy_version: family?.policy_version ?? 1,
    generated_at: new Date().toISOString(),
    child_id: token.child_id,
    child_name: child?.name ?? "Unknown",
    tier: child?.tier ?? "tween_13",
    rules: (rules ?? []).map((r: { id: string; text: string; scope: string; target: string | null; sort_order: number }) => ({
      id: r.id,
      text: r.text,
      scope: r.scope,
      target: r.target,
      sort_order: r.sort_order,
    })),
  };

  return NextResponse.json({
    device_id: device.id,
    child_id: token.child_id,
    family_id: token.family_id,
    policy_version: family?.policy_version ?? 1,
    policy_pack: policyPack,
  });
}
