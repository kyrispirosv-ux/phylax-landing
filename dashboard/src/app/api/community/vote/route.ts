import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { target_type, target_id, value } = body;

  if (!target_type || !target_id || (value !== 1 && value !== -1)) {
    return NextResponse.json({ error: "target_type, target_id, and value (1 or -1) required" }, { status: 400 });
  }

  if (target_type !== "post" && target_type !== "comment") {
    return NextResponse.json({ error: "target_type must be post or comment" }, { status: 400 });
  }

  const db = createServiceClient();

  const { data, error } = await db.rpc("community_toggle_vote", {
    p_user_id: user.id,
    p_target_type: target_type,
    p_target_id: target_id,
    p_value: value,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
