
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
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

        const supabase = createServiceClient();
        const hashedCode = sha256(short_code.toUpperCase());

        // 1. Find valid token
        const { data: token, error: tokenError } = await supabase
            .from("pairing_tokens")
            .select("*")
            .eq("short_code_hash", hashedCode)
            .is("used_at", null)
            .gt("expires_at", new Date().toISOString())
            .single();

        if (tokenError || !token) {
            return NextResponse.json({ error: "Invalid or expired pairing code" }, { status: 404 });
        }

        // 2. Create Device
        const { data: device, error: deviceError } = await supabase
            .from("devices")
            .insert({
                family_id: token.family_id,
                child_id: token.child_id,
                name: device_name,
                type: platform,
                status: "active",
                last_active: new Date().toISOString(),
                settings: {
                    // Default settings are usually inherited from child profile, 
                    // but we can set overrides here if needed.
                }
            })
            .select()
            .single();

        if (deviceError || !device) {
            console.error("Device creation failed:", deviceError);
            return NextResponse.json({ error: "Failed to register device" }, { status: 500 });
        }

        // 3. Mark token as used
        await supabase
            .from("pairing_tokens")
            .update({
                used_at: new Date().toISOString(),
                device_id: device.id
            })
            .eq("id", token.id);

        // 4. Get Child Profile (for policy tier)
        const { data: child } = await supabase
            .from("children")
            .select("name, profile_tier")
            .eq("id", token.child_id)
            .single();

        // 5. Return success payload
        return NextResponse.json({
            device_id: device.id,
            child_id: token.child_id,
            family_id: token.family_id,
            auth_token: null, // We might want to generate a permanent device token here if needed, but for now device_id is enough for our simple checks
            policy_version: 1, // specific version tracking can be added later
            policy_pack: {
                policy_version: 1,
                tier: child?.profile_tier || 'tween_13',
                child_name: child?.name || 'Child',
                rules: [] // The extension will fetch full rules on first sync
            }
        });

    } catch (error) {
        console.error("Pairing error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
