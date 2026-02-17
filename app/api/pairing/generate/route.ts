import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";
import { MockPairingStore } from "@/lib/mockPairingStore";
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
 * In demo mode (no auth), returns a mock code stored in MockPairingStore.
 */
export async function POST(request: Request) {
    // Try to authenticate the parent
    let user = null;
    try {
        const supabase = await createServerSupabase();
        const { data } = await supabase.auth.getUser();
        user = data?.user;
    } catch {
        // Supabase not configured — demo mode
    }

    if (!user) {
        // Demo mode: generate a mock pairing code
        const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let shortCode = "";
        for (let i = 0; i < 6; i++) {
            shortCode += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
        }

        MockPairingStore.create(shortCode);
        console.log(`[Pairing Generate] Demo mode: created mock code ${shortCode}`);

        return NextResponse.json({
            token_id: `mock_${Date.now()}`,
            secret: "demo",
            short_code: shortCode,
            install_link: "",
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            child_id: "child_demo",
        });
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
