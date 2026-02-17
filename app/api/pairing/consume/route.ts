
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { MockPairingStore } from "@/lib/mockPairingStore";
import crypto from "crypto";

/** SHA-256 hex hash for verifying short code */
function sha256(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { short_code, device_name = "Chrome Extension", platform = "chrome" } = body;

        if (!short_code || short_code.length !== 6) {
            return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
        }

        const upperCode = short_code.toUpperCase();

        // ── Try Supabase first (production mode) ──
        try {
            const supabase = createServiceClient();
            const hashedCode = sha256(upperCode);

            const { data: token, error: tokenError } = await supabase
                .from("pairing_tokens")
                .select("*")
                .eq("short_code_hash", hashedCode)
                .is("used_at", null)
                .gt("expires_at", new Date().toISOString())
                .single();

            if (!tokenError && token) {
                // Production path — real Supabase token found
                const { data: device, error: deviceError } = await supabase
                    .from("devices")
                    .insert({
                        family_id: token.family_id,
                        child_id: token.child_id,
                        name: device_name,
                        type: platform,
                        status: "active",
                        last_active: new Date().toISOString(),
                        settings: {}
                    })
                    .select()
                    .single();

                if (deviceError || !device) {
                    console.error("Device creation failed:", deviceError);
                    return NextResponse.json({ error: "Failed to register device" }, { status: 500 });
                }

                await supabase
                    .from("pairing_tokens")
                    .update({ used_at: new Date().toISOString(), device_id: device.id })
                    .eq("id", token.id);

                const { data: child } = await supabase
                    .from("children")
                    .select("name, profile_tier")
                    .eq("id", token.child_id)
                    .single();

                return NextResponse.json({
                    device_id: device.id,
                    child_id: token.child_id,
                    family_id: token.family_id,
                    auth_token: null,
                    policy_version: 1,
                    policy_pack: {
                        policy_version: 1,
                        tier: child?.profile_tier || 'tween_13',
                        child_name: child?.name || 'Child',
                        rules: []
                    }
                });
            }
        } catch {
            // Supabase not configured or query failed — fall through to demo mode
            console.warn('[Pairing Consume] Supabase unavailable, using demo mode');
        }

        // ── Demo mode: accept ANY valid 6-character code ──
        const deviceId = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        MockPairingStore.consume(upperCode, deviceId);
        console.log(`[Pairing Consume] Demo mode: paired device ${deviceId} with code ${upperCode}`);

        return NextResponse.json({
            device_id: deviceId,
            child_id: "child_demo",
            family_id: "fam_demo",
            auth_token: `mock_token_${Date.now()}`,
            policy_version: 1,
            policy_pack: {
                policy_version: 1,
                tier: 'tween_13',
                child_name: 'Demo Child',
                rules: []
            }
        });

    } catch (error) {
        console.error("Pairing error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
