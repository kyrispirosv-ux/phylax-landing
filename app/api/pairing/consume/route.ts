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
// ── API Route: Consume Pairing Token ─────────────────────────────────────────

export async function POST(request: Request) {
    const body = await request.json();
    const { short_code, device_name } = body;

    // MOCK: simulate success for any code for demo purposes
    // In real app, we would validate code against DB

    // Simulate network delay
    await new Promise(r => setTimeout(r, 1000));

    if (short_code && short_code.length === 6) {
        // Return dummy success data
        return NextResponse.json({
            device_id: "dev_" + Math.random().toString(36).substr(2, 9),
            child_id: "child_123",
            family_id: "fam_123",
            auth_token: "mock_token_" + Date.now(),
            policy_version: 1,
            policy_pack: {
                policy_version: 1,
                generated_at: new Date().toISOString(),
                tier: "tween_13",
                rules: [
                    { id: "r1", text: "Block gambling sites", scope: "global" },
                    { id: "r2", text: "Detect bullying in DMs", scope: "global" }
                ]
            }
        });
    }

    return NextResponse.json(
        { error: "Invalid code" },
        { status: 400 }
    );
}
