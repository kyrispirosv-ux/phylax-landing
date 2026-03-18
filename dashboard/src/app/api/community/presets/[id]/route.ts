import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceClient();

  const { data: preset, error } = await db
    .from("community_presets")
    .select("*, parents!inner(display_name)")
    .eq("id", id)
    .single();

  if (error || !preset) return NextResponse.json({ error: "Preset not found" }, { status: 404 });

  const { data: reviews } = await db
    .from("community_preset_reviews")
    .select("*, parents!inner(display_name)")
    .eq("preset_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    preset: {
      ...preset,
      author_name: (preset as any).parents?.display_name || "Parent",
      parents: undefined,
      is_own: preset.author_id === user.id,
    },
    reviews: (reviews || []).map((r: any) => ({
      ...r,
      author_name: r.parents?.display_name || "Parent",
      parents: undefined,
    })),
  });
}
