import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { target_type, target_id, reason } = body;

  if (!target_type || !target_id || !reason?.trim()) {
    return NextResponse.json({ error: "target_type, target_id, and reason required" }, { status: 400 });
  }

  const db = createServiceClient();

  const { error } = await db
    .from("community_reports")
    .insert({
      reporter_id: user.id,
      target_type,
      target_id,
      reason: reason.trim(),
    });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "You already reported this" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" }, { status: 201 });
}
