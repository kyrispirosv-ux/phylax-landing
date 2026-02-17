import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import crypto from "crypto";

const MAX_ATTEMPTS_PER_IP = 10;
const ATTEMPT_WINDOW_MINUTES = 15;

/** SHA-256 hex hash */
function sha256(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
}

/** Generate a signed session token for the extension */
function generateAuthToken(deviceId: string, familyId: string, childId: string): string {
    const payload = {
        device_id: deviceId,
        family_id: familyId,
        child_id: childId,
        iat: Math.floor(Date.now() / 1000),
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signingKey = process.env.PAIRING_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "phylax-default-key";
    const signature = crypto.createHmac("sha256", signingKey).update(payloadB64).digest("base64url");
    return `${payloadB64}.${signature}`;
}

/**
 * POST /api/pairing/consume
 * Extension consumes a pairing token.
 */
export async function POST(request: Request) {
    const body = await request.json();
    const { short_code, device_name } = body;

    if (!short_code) {
        return NextResponse.json({ error: "Code required" }, { status: 400 });
    }

    const db = createServiceClient();
    const shortCodeHash = sha256(short_code.toUpperCase());

    // 1. Find the token
    const { data: token } = await db
        .from("pairing_tokens")
        .select("*")
        .eq("short_code_hash", shortCodeHash)
        .is("used_at", null) // Must be unused
        .gt("expires_at", new Date().toISOString()) // Must not be expired
        .single();

    if (!token) {
        return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    // 2. Generate new device ID
    const deviceId = "dev_" + crypto.randomBytes(8).toString("hex");

    // 3. Mark token as used
    const { error: updateError } = await db
        .from("pairing_tokens")
        .update({
            used_at: new Date().toISOString(),
            used_by_device_id: deviceId
        })
        .eq("id", token.id);

    if (updateError) {
        return NextResponse.json({ error: "Failed to redeem code" }, { status: 500 });
    }

    // 4. Generate Auth Token for extension
    const authToken = generateAuthToken(deviceId, token.family_id, token.child_id);

    // 5. Get Initial Policy (Mock for now, or fetch from DB if available)
    // In a real app, we'd fetch the child's assigned policy.
    const policyPack = {
        policy_version: 1,
        generated_at: new Date().toISOString(),
        tier: "standard",
        rules: [
            { id: "r1", text: "Block gambling sites", scope: "global" },
            { id: "r2", text: "Detect bullying in DMs", scope: "global" }
        ]
    };

    return NextResponse.json({
        device_id: deviceId,
        child_id: token.child_id,
        family_id: token.family_id,
        auth_token: authToken,
        policy_version: 1,
        policy_pack: policyPack
    });
}
