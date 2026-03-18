import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { rating, body: reviewBody } = body;

  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating 1-5 required" }, { status: 400 });
  }

  const db = createServiceClient();

  const { error } = await db
    .from("community_preset_reviews")
    .insert({
      preset_id: id,
      author_id: user.id,
      rating,
      body: reviewBody?.trim() || "",
    });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "You already reviewed this preset" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: reviews } = await db
    .from("community_preset_reviews")
    .select("rating")
    .eq("preset_id", id);

  if (reviews && reviews.length > 0) {
    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    await db
      .from("community_presets")
      .update({ rating_avg: Math.round(avg * 100) / 100, rating_count: reviews.length })
      .eq("id", id);
  }

  return NextResponse.json({ status: "ok" }, { status: 201 });
}
