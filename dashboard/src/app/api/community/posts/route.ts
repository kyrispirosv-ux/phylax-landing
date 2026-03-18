import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

function sanitizeRules(rules: unknown): { text: string; scope: string; target: string | null }[] | null {
  if (!Array.isArray(rules)) return null;
  return rules
    .filter((r) => r && typeof r.text === "string")
    .map((r) => ({
      text: r.text,
      scope: r.scope || "content",
      target: r.target || null,
    }));
}

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const sort = url.searchParams.get("sort") || "new";
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || String(PAGE_SIZE)), 50);

  const db = createServiceClient();

  let query = db
    .from("community_posts")
    .select("id, category, title, body, is_anonymous, rule_snapshot, status, upvotes, downvotes, comment_count, pinned, created_at, updated_at, author_id, parents!inner(display_name)")
    .eq("status", "active");

  if (category && category !== "all") {
    query = query.eq("category", category);
  }

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  if (sort === "top") {
    query = query.order("upvotes", { ascending: false });
  } else if (sort === "trending") {
    query = query.order("comment_count", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  query = query.order("pinned", { ascending: false });
  query = query.limit(limit);

  const { data: posts, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const masked = (posts || []).map((p: any) => ({
    ...p,
    author_id: p.is_anonymous ? null : p.author_id,
    author_name: p.is_anonymous ? "A Phylax Parent" : p.parents?.display_name || "Parent",
    parents: undefined,
  }));

  return NextResponse.json({ posts: masked });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { title, body: postBody, category, is_anonymous, rule_snapshot } = body;

  if (!title?.trim() || !postBody?.trim()) {
    return NextResponse.json({ error: "Title and body are required" }, { status: 400 });
  }

  const db = createServiceClient();

  const { data: post, error } = await db
    .from("community_posts")
    .insert({
      author_id: user.id,
      title: title.trim(),
      body: postBody.trim(),
      category: category || "general",
      is_anonymous: is_anonymous || false,
      rule_snapshot: sanitizeRules(rule_snapshot),
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status: "ok", post_id: post?.id }, { status: 201 });
}
