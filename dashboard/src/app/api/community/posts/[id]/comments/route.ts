import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceClient();

  const { data: comments, error } = await db
    .from("community_comments")
    .select("*, parents!inner(display_name)")
    .eq("post_id", id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const commentIds = (comments || []).map((c: any) => c.id);
  const { data: votes } = commentIds.length > 0
    ? await db
        .from("community_votes")
        .select("target_id, value")
        .eq("user_id", user.id)
        .eq("target_type", "comment")
        .in("target_id", commentIds)
    : { data: [] };

  const voteMap = new Map((votes || []).map((v: any) => [v.target_id, v.value]));

  const masked = (comments || []).map((c: any) => ({
    ...c,
    author_id: c.is_anonymous ? null : c.author_id,
    author_name: c.is_anonymous ? "A Phylax Parent" : c.parents?.display_name || "Parent",
    parents: undefined,
    user_vote: voteMap.get(c.id) || 0,
    is_own: c.author_id === user.id,
  }));

  return NextResponse.json({ comments: masked });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.body?.trim()) {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  }

  const db = createServiceClient();

  const { data: post } = await db
    .from("community_posts")
    .select("id")
    .eq("id", id)
    .eq("status", "active")
    .single();

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const { data: comment, error } = await db
    .from("community_comments")
    .insert({
      post_id: id,
      author_id: user.id,
      body: body.body.trim(),
      parent_comment_id: body.parent_comment_id || null,
      is_anonymous: body.is_anonymous || false,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status: "ok", comment_id: comment?.id }, { status: 201 });
}
