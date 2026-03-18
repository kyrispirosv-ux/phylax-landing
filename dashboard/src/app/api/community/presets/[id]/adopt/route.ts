import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";
import { getParentInfo } from "@/lib/supabase/helpers";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parent = await getParentInfo();
  if (!parent) return NextResponse.json({ error: "Parent not found" }, { status: 404 });

  const db = createServiceClient();

  const { data: preset } = await db
    .from("community_presets")
    .select("rules, adoption_count")
    .eq("id", id)
    .single();

  if (!preset) return NextResponse.json({ error: "Preset not found" }, { status: 404 });

  const rules = preset.rules as { text: string; scope: string; target: string | null }[];
  if (!Array.isArray(rules) || rules.length === 0) {
    return NextResponse.json({ error: "Preset has no rules" }, { status: 400 });
  }

  const inserts = rules.map((r, i) => ({
    family_id: parent.family_id,
    text: r.text,
    scope: r.scope as "site" | "content" | "llm",
    target: r.target,
    active: true,
    sort_order: 1000 + i,
    created_by: user.id,
  }));

  const { error } = await db.from("rules").insert(inserts);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db
    .from("community_presets")
    .update({ adoption_count: (preset.adoption_count || 0) + 1 })
    .eq("id", id);

  return NextResponse.json({ status: "ok", rules_added: rules.length });
}
