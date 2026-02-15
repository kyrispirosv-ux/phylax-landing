import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";
import crypto from "crypto";

/** SHA-256 hex hash for one-way storage */
function sha256(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * POST /api/pairing/generate
 * Parent generates a pairing token for a child.
 * Returns: token_id, secret, short_code, install_link, expires_at
 *
 * Security: raw secret and short_code are NEVER stored —
 * only their SHA-256 hashes are persisted in the database.
 */
export async function POST(request: Request) {
    // Authenticate the parent
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        // For demo/dev purposes, if no user is found, we might want to bypass or mock.
        // However, strictly speaking, pairing requires a user.
        // If we are in the landing page flow without auth, we might need a dummy user or handle this differently.
        // Given the context of "Link this Device" in existing code, let's assume valid user or handle error.

        // Check if we are in a dev environment/demo mode where we can use a service role to find *any* parent to bind to?
        // No, that is unsafe. 
        // If the user is on the onboarding page, they might NOT be logged in yet?
        // The onboarding flow seems to be "Install Extension -> Link Device -> Dashboard".
        // If they aren't logged in, who are we checking?

        // For now, let's return 401. The frontend should handle this.
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { child_id } = body;

    // If no child_id provided, try to find the first child of the parent
    let targetChildId = child_id;
    const db = createServiceClient();

    if (!targetChildId) {
        const { data: parent } = await db
            .from("parents")
            .select("id, family_id")
            .eq("id", user.id)
            .single();

        if (parent) {
            const { data: child } = await db
                .from("children")
                .select("id")
                .eq("family_id", parent.family_id)
                .limit(1)
                .single();

            if (child) {
                targetChildId = child.id;
            }
        }
    }

    if (!targetChildId) {
        return NextResponse.json({ error: "No child found to pair with" }, { status: 400 });
    }

    // Get parent's family (re-verify)
    const { data: parent } = await db
        .from("parents")
        .select("id, family_id")
        .eq("id", user.id)
        .single();

    if (!parent) {
        return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }

    // Invalidate any existing unused tokens for this child
    await db
        .from("pairing_tokens")
        .update({ expires_at: new Date().toISOString() })
        .eq("child_id", targetChildId)
        .is("used_at", null);

    // Generate cryptographically strong values
    const secret = crypto.randomBytes(32).toString("hex");
    const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
    let shortCode = "";
    for (let i = 0; i < 6; i++) {
        shortCode += ALPHABET[crypto.randomInt(ALPHABET.length)];
    }
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Store ONLY hashes
    const { data: token, error } = await db
        .from("pairing_tokens")
        .insert({
            family_id: parent.family_id,
            child_id: targetChildId,
            secret_hash: sha256(secret),
            short_code_hash: sha256(shortCode),
            expires_at: expiresAt,
            created_by: parent.id,
        })
        .select("id")
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(".supabase.co", "") || "https://app.phylax.ai";
    const installLink = `${baseUrl}/pair#token=${token.id}&secret=${secret}`;

    return NextResponse.json({
        token_id: token.id,
        secret,
        short_code: shortCode,
        install_link: installLink,
        expires_at: expiresAt,
        child_id: targetChildId,
    });
}
