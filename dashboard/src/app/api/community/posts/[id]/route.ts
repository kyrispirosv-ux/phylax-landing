import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceClient();

  const { data: post, error } = await db
    .from("community_posts")
    .select("*, parents!inner(display_name)")
    .eq("id", id)
    .single();

  if (error || !post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const { data: vote } = await db
    .from("community_votes")
    .select("value")
    .eq("user_id", user.id)
    .eq("target_type", "post")
    .eq("target_id", id)
    .maybeSingle();

  return NextResponse.json({
    post: {
      ...post,
      author_id: post.is_anonymous ? null : post.author_id,
      author_name: post.is_anonymous ? "A Phylax Parent" : (post as any).parents?.display_name || "Parent",
      parents: undefined,
      user_vote: vote?.value || 0,
      is_own: post.author_id === user.id,
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceClient();

  const { data: post } = await db
    .from("community_posts")
    .select("author_id")
    .eq("id", id)
    .single();

  if (!post || post.author_id !== user.id) {
    return NextResponse.json({ error: "Not found or not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title) updates.title = body.title.trim();
  if (body.body) updates.body = body.body.trim();
  if (body.category) updates.category = body.category;

  const { error } = await db.from("community_posts").update(updates).eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceClient();

  const { data: post } = await db
    .from("community_posts")
    .select("author_id")
    .eq("id", id)
    .single();

  if (!post || post.author_id !== user.id) {
    return NextResponse.json({ error: "Not found or not authorized" }, { status: 403 });
  }

  const { error } = await db
    .from("community_posts")
    .update({ status: "removed", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}
