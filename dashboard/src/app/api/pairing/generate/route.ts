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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { child_id } = body;

  if (!child_id) {
    return NextResponse.json({ error: "child_id required" }, { status: 400 });
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

  // Verify child belongs to this family
  const db = createServiceClient();
  const { data: child } = await db
    .from("children")
    .select("id, family_id")
    .eq("id", child_id)
    .eq("family_id", parent.family_id)
    .single();

  if (!child) {
    return NextResponse.json({ error: "Child not found in your family" }, { status: 404 });
  }

  // Invalidate any existing unused tokens for this child
  await db
    .from("pairing_tokens")
    .update({ expires_at: new Date().toISOString() })
    .eq("child_id", child_id)
    .is("used_at", null);

  // Generate cryptographically strong values
  const secret = crypto.randomBytes(32).toString("hex");
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
  let shortCode = "";
  for (let i = 0; i < 6; i++) {
    shortCode += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  // Store ONLY hashes — raw values are returned to the client but never persisted
  const { data: token, error } = await db
    .from("pairing_tokens")
    .insert({
      family_id: parent.family_id,
      child_id: child_id,
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

  // Build install link with token embedded in fragment (not query for security)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(".supabase.co", "") || "https://app.phylax.ai";
  const installLink = `${baseUrl}/pair#token=${token.id}&secret=${secret}`;

  return NextResponse.json({
    token_id: token.id,
    secret,
    short_code: shortCode,
    install_link: installLink,
    expires_at: expiresAt,
    child_id,
  });
}
