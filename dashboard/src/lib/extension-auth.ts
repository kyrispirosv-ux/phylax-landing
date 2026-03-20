import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Verify an extension auth token from the Authorization header.
 * Returns the device record if valid, or null if invalid/missing.
 *
 * Token format: base64url(payload).base64url(hmac_signature)
 * Payload: { device_id, family_id, child_id, iat }
 *
 * Validation:
 * 1. Parse and verify HMAC signature
 * 2. Check device exists and is active
 * 3. Verify token hash matches stored hash (prevents use of revoked tokens)
 */
export async function verifyExtensionAuth(request: Request): Promise<{
  device_id: string;
  family_id: string;
  child_id: string;
} | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;

  // Verify signature
  const signingKey =
    process.env.PAIRING_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "phylax-default-key";
  const expectedSig = crypto
    .createHmac("sha256", signingKey)
    .update(payloadB64)
    .digest("base64url");

  if (signature !== expectedSig) return null;

  // Parse payload
  let payload: { device_id: string; family_id: string; child_id: string; iat: number };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  } catch {
    return null;
  }

  if (!payload.device_id || !payload.family_id || !payload.child_id) return null;

  // Verify device exists and token hash matches
  const db = createServiceClient();
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const { data: device } = await db
    .from("devices")
    .select("id, child_id, family_id, status, auth_token_hash")
    .eq("id", payload.device_id)
    .single();

  if (!device) return null;
  if (device.status !== "active") return null;

  // Verify token hash matches (prevents revoked token usage)
  if (device.auth_token_hash && device.auth_token_hash !== tokenHash) {
    return null;
  }

  return {
    device_id: device.id,
    family_id: device.family_id,
    child_id: device.child_id,
  };
}

/**
 * Authenticate an extension request.
 * Supports two modes:
 * 1. Auth token in Authorization header (preferred, secure)
 * 2. device_id in query/body (fallback for backward compatibility)
 *
 * Returns the device info or null.
 */
export async function authenticateExtension(
  request: Request,
  deviceId?: string | null,
): Promise<{
  device_id: string;
  family_id: string;
  child_id: string;
} | null> {
  // Try auth token first
  const tokenAuth = await verifyExtensionAuth(request);
  if (tokenAuth) return tokenAuth;

  // Fallback: device_id lookup (backward compat for unpaired/legacy extensions)
  if (!deviceId) return null;

  const db = createServiceClient();
  const { data: device } = await db
    .from("devices")
    .select("id, child_id, family_id, status")
    .eq("id", deviceId)
    .single();

  if (!device || device.status !== "active") return null;

  return {
    device_id: device.id,
    family_id: device.family_id,
    child_id: device.child_id,
  };
}
