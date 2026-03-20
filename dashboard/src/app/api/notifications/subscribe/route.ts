import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/notifications/subscribe
 * Returns the VAPID public key so the client can subscribe to push notifications.
 */
export async function GET() {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;

  if (!vapidPublicKey) {
    return NextResponse.json(
      { error: "Push notifications not configured" },
      { status: 503 }
    );
  }

  return NextResponse.json({ vapidPublicKey });
}

/**
 * POST /api/notifications/subscribe
 * Stores or updates a push subscription linked to the authenticated parent's family.
 *
 * Body: { subscription: PushSubscriptionJSON }
 *
 * Uses the `push_subscriptions` table:
 *   id, family_id, parent_id, endpoint, keys_p256dh, keys_auth, created_at, updated_at
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Look up parent to get family_id
    const { data: parent } = await supabase
      .from("parents")
      .select("family_id")
      .eq("id", user.id)
      .single() as { data: { family_id: string } | null };

    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }

    const body = await request.json();
    const { subscription } = body;

    if (!subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json(
        { error: "Invalid push subscription" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceClient();

    // Upsert: use endpoint as the unique identifier
    const { error } = await serviceClient
      .from("push_subscriptions")
      .upsert(
        {
          family_id: parent.family_id,
          parent_id: user.id,
          endpoint: subscription.endpoint,
          keys_p256dh: subscription.keys.p256dh,
          keys_auth: subscription.keys.auth,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      );

    if (error) {
      console.error("[Push Subscribe] Supabase error:", error);
      return NextResponse.json(
        { error: "Failed to store subscription" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Push Subscribe] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notifications/subscribe
 * Removes a push subscription when the user unsubscribes.
 *
 * Body: { endpoint: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    await serviceClient
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .eq("parent_id", user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Push Unsubscribe] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
