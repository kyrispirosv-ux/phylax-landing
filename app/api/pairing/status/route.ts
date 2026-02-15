import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import crypto from "crypto";

/** SHA-256 hex hash */
function sha256(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * GET /api/pairing/status?code=XXXXXX
 * Checks if a pairing code has been consumed.
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
        return NextResponse.json({ error: "Code required" }, { status: 400 });
    }

    const db = createServiceClient();
    const shortCodeHash = sha256(code.toUpperCase());

    const { data: token } = await db
        .from("pairing_tokens")
        .select("used_at, used_by_device_id, child_id")
        .eq("short_code_hash", shortCodeHash)
        .single();

    if (!token) {
        return NextResponse.json({ error: "Invalid code" }, { status: 404 });
    }

    if (token.used_at) {
        return NextResponse.json({
            paired: true,
            device_id: token.used_by_device_id,
            child_id: token.child_id,
        });
    }

    return NextResponse.json({ paired: false });
}
