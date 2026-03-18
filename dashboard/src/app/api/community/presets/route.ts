import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const tier = url.searchParams.get("tier");
  const sort = url.searchParams.get("sort") || "popular";

  const db = createServiceClient();
  let query = db
    .from("community_presets")
    .select("*, parents!inner(display_name)");

  if (tier) query = query.eq("tier", tier);

  if (sort === "rating") {
    query = query.order("rating_avg", { ascending: false });
  } else if (sort === "new") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query.order("adoption_count", { ascending: false });
  }

  query = query.limit(50);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const presets = (data || []).map((p: any) => ({
    ...p,
    author_name: p.parents?.display_name || "Parent",
    parents: undefined,
  }));

  return NextResponse.json({ presets });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.name?.trim() || !Array.isArray(body.rules) || body.rules.length === 0) {
    return NextResponse.json({ error: "Name and at least one rule required" }, { status: 400 });
  }

  const rules = body.rules
    .filter((r: any) => r && typeof r.text === "string")
    .map((r: any) => ({ text: r.text, scope: r.scope || "content", target: r.target || null }));

  const db = createServiceClient();

  const { data, error } = await db
    .from("community_presets")
    .insert({
      author_id: user.id,
      name: body.name.trim(),
      description: body.description?.trim() || "",
      age_range: body.age_range || "",
      tier: body.tier || "tween_13",
      rules,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "ok", preset_id: data?.id }, { status: 201 });
}
