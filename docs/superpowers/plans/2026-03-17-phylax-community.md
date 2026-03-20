# Phylax Community Platform Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a community social platform to the Phylax parent dashboard where parents can discuss safety, share rules, and adopt community-vetted configurations.

**Architecture:** Extends the existing dashboard Next.js app with new routes under `/dashboard/community/`, new Supabase tables in the `public` schema, and new API routes under `/api/community/`. Uses existing auth, Supabase client infrastructure, and DashboardShell.

**Tech Stack:** Next.js 16, React 19, Supabase (PostgreSQL + RLS), Tailwind CSS v4, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-17-phylax-community-design.md`

---

## Chunk 1: Database & Types

### Task 1: Create community migration SQL

**Files:**
- Create: `dashboard/supabase/migrations/006_community.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 006_community.sql
-- Community platform tables, functions, triggers, and RLS policies

-- ─── Enums ───
CREATE TYPE community_post_category AS ENUM ('social_media', 'gaming', 'content', 'grooming', 'general');
CREATE TYPE community_content_status AS ENUM ('active', 'hidden', 'removed');
CREATE TYPE community_vote_target AS ENUM ('post', 'comment');
CREATE TYPE community_report_target AS ENUM ('post', 'comment', 'preset');
CREATE TYPE community_report_status AS ENUM ('pending', 'reviewed', 'dismissed');

-- ─── Tables ───

CREATE TABLE community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  category community_post_category NOT NULL DEFAULT 'general',
  title text NOT NULL,
  body text NOT NULL,
  is_anonymous boolean NOT NULL DEFAULT false,
  rule_snapshot jsonb DEFAULT NULL,
  status community_content_status NOT NULL DEFAULT 'active',
  upvotes int NOT NULL DEFAULT 0,
  downvotes int NOT NULL DEFAULT 0,
  comment_count int NOT NULL DEFAULT 0,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES community_comments(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_anonymous boolean NOT NULL DEFAULT false,
  status community_content_status NOT NULL DEFAULT 'active',
  upvotes int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE community_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  target_type community_vote_target NOT NULL,
  target_id uuid NOT NULL,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);

CREATE TABLE community_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  age_range text NOT NULL DEFAULT '',
  tier profile_tier NOT NULL DEFAULT 'tween_13',
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  adoption_count int NOT NULL DEFAULT 0,
  rating_avg numeric(3,2) NOT NULL DEFAULT 0,
  rating_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE community_preset_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id uuid NOT NULL REFERENCES community_presets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (preset_id, author_id)
);

CREATE TABLE community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  target_type community_report_target NOT NULL,
  target_id uuid NOT NULL,
  reason text NOT NULL,
  status community_report_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, target_type, target_id)
);

CREATE TABLE community_rule_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_text_hash text NOT NULL UNIQUE,
  rule_text_normalized text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  adoption_count int NOT NULL DEFAULT 0,
  effectiveness_score numeric NOT NULL DEFAULT 0,
  blocked_count_30d int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ───
CREATE INDEX idx_community_posts_category ON community_posts(category);
CREATE INDEX idx_community_posts_created ON community_posts(created_at DESC);
CREATE INDEX idx_community_posts_status ON community_posts(status);
CREATE INDEX idx_community_comments_post ON community_comments(post_id);
CREATE INDEX idx_community_comments_created ON community_comments(created_at DESC);
CREATE INDEX idx_community_votes_target ON community_votes(target_type, target_id);
CREATE INDEX idx_community_presets_tier ON community_presets(tier);
CREATE INDEX idx_community_rule_stats_adoption ON community_rule_stats(adoption_count DESC);

-- ─── Functions ───

-- Atomic vote toggle: inserts, removes, or flips a vote and updates denormalized counts
CREATE OR REPLACE FUNCTION community_toggle_vote(
  p_user_id uuid,
  p_target_type community_vote_target,
  p_target_id uuid,
  p_value smallint
) RETURNS jsonb AS $$
DECLARE
  existing_value smallint;
  result_action text;
BEGIN
  -- Check for existing vote
  SELECT value INTO existing_value
  FROM community_votes
  WHERE user_id = p_user_id AND target_type = p_target_type AND target_id = p_target_id;

  IF existing_value IS NOT NULL THEN
    IF existing_value = p_value THEN
      -- Same vote: remove it
      DELETE FROM community_votes
      WHERE user_id = p_user_id AND target_type = p_target_type AND target_id = p_target_id;

      IF p_target_type = 'post' THEN
        IF p_value = 1 THEN
          UPDATE community_posts SET upvotes = upvotes - 1 WHERE id = p_target_id;
        ELSE
          UPDATE community_posts SET downvotes = downvotes - 1 WHERE id = p_target_id;
        END IF;
      ELSE
        IF p_value = 1 THEN
          UPDATE community_comments SET upvotes = upvotes - 1 WHERE id = p_target_id;
        END IF;
      END IF;
      result_action := 'removed';
    ELSE
      -- Different vote: flip it
      UPDATE community_votes SET value = p_value, created_at = now()
      WHERE user_id = p_user_id AND target_type = p_target_type AND target_id = p_target_id;

      IF p_target_type = 'post' THEN
        IF p_value = 1 THEN
          UPDATE community_posts SET upvotes = upvotes + 1, downvotes = downvotes - 1 WHERE id = p_target_id;
        ELSE
          UPDATE community_posts SET upvotes = upvotes - 1, downvotes = downvotes + 1 WHERE id = p_target_id;
        END IF;
      ELSE
        IF p_value = 1 THEN
          UPDATE community_comments SET upvotes = upvotes + 1 WHERE id = p_target_id;
        ELSE
          UPDATE community_comments SET upvotes = upvotes - 1 WHERE id = p_target_id;
        END IF;
      END IF;
      result_action := 'flipped';
    END IF;
  ELSE
    -- No existing vote: insert
    INSERT INTO community_votes (user_id, target_type, target_id, value)
    VALUES (p_user_id, p_target_type, p_target_id, p_value);

    IF p_target_type = 'post' THEN
      IF p_value = 1 THEN
        UPDATE community_posts SET upvotes = upvotes + 1 WHERE id = p_target_id;
      ELSE
        UPDATE community_posts SET downvotes = downvotes + 1 WHERE id = p_target_id;
      END IF;
    ELSE
      IF p_value = 1 THEN
        UPDATE community_comments SET upvotes = upvotes + 1 WHERE id = p_target_id;
      END IF;
    END IF;
    result_action := 'created';
  END IF;

  RETURN jsonb_build_object('action', result_action, 'value', p_value);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-hide content after 3+ reports
CREATE OR REPLACE FUNCTION community_check_reports() RETURNS trigger AS $$
DECLARE
  report_count int;
BEGIN
  SELECT count(*) INTO report_count
  FROM community_reports
  WHERE target_type = NEW.target_type AND target_id = NEW.target_id AND status = 'pending';

  IF report_count >= 3 THEN
    IF NEW.target_type = 'post' THEN
      UPDATE community_posts SET status = 'hidden' WHERE id = NEW.target_id AND status = 'active';
    ELSIF NEW.target_type = 'comment' THEN
      UPDATE community_comments SET status = 'hidden' WHERE id = NEW.target_id AND status = 'active';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_community_check_reports
  AFTER INSERT ON community_reports
  FOR EACH ROW EXECUTE FUNCTION community_check_reports();

-- Increment comment_count on post when comment is added
CREATE OR REPLACE FUNCTION community_update_comment_count() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_community_comment_count
  AFTER INSERT OR DELETE ON community_comments
  FOR EACH ROW EXECUTE FUNCTION community_update_comment_count();

-- ─── Views for anonymous safety ───

CREATE VIEW community_posts_public AS
SELECT
  id, category, title, body, is_anonymous, rule_snapshot, status,
  upvotes, downvotes, comment_count, pinned, created_at, updated_at,
  CASE WHEN is_anonymous THEN NULL ELSE author_id END AS author_id
FROM community_posts;

CREATE VIEW community_comments_public AS
SELECT
  id, post_id, parent_comment_id, body, is_anonymous, status,
  upvotes, created_at, updated_at,
  CASE WHEN is_anonymous THEN NULL ELSE author_id END AS author_id
FROM community_comments;

-- ─── RLS ───
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_preset_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_rule_stats ENABLE ROW LEVEL SECURITY;

-- Posts: all authenticated can read active, authors can write own
CREATE POLICY "posts_select" ON community_posts FOR SELECT TO authenticated
  USING (status = 'active' OR author_id = auth.uid());
CREATE POLICY "posts_insert" ON community_posts FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "posts_update" ON community_posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid());

-- Comments: same pattern
CREATE POLICY "comments_select" ON community_comments FOR SELECT TO authenticated
  USING (status = 'active' OR author_id = auth.uid());
CREATE POLICY "comments_insert" ON community_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "comments_update" ON community_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid());

-- Votes: users manage own votes only
CREATE POLICY "votes_select" ON community_votes FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "votes_insert" ON community_votes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "votes_delete" ON community_votes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Presets: all can read, authors can write
CREATE POLICY "presets_select" ON community_presets FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "presets_insert" ON community_presets FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "presets_update" ON community_presets FOR UPDATE TO authenticated
  USING (author_id = auth.uid());

-- Preset reviews: all can read, authors can write own
CREATE POLICY "preset_reviews_select" ON community_preset_reviews FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "preset_reviews_insert" ON community_preset_reviews FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

-- Reports: users can create own, only service role can read all
CREATE POLICY "reports_insert" ON community_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "reports_select_own" ON community_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

-- Rule stats: all authenticated can read
CREATE POLICY "rule_stats_select" ON community_rule_stats FOR SELECT TO authenticated
  USING (true);
```

- [ ] **Step 2: Commit migration**

```bash
git add dashboard/supabase/migrations/006_community.sql
git commit -m "feat(community): add migration 006 — community tables, functions, triggers, RLS"
```

### Task 2: Update TypeScript database types

**Files:**
- Modify: `dashboard/src/lib/types/database.ts`

- [ ] **Step 1: Add community table types after `access_requests` (line 339)**

Add these types inside `Tables: {` before the closing `};`:

```typescript
      community_posts: {
        Row: {
          id: string;
          author_id: string;
          category: "social_media" | "gaming" | "content" | "grooming" | "general";
          title: string;
          body: string;
          is_anonymous: boolean;
          rule_snapshot: { text: string; scope: string; target: string | null }[] | null;
          status: "active" | "hidden" | "removed";
          upvotes: number;
          downvotes: number;
          comment_count: number;
          pinned: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          category?: "social_media" | "gaming" | "content" | "grooming" | "general";
          title: string;
          body: string;
          is_anonymous?: boolean;
          rule_snapshot?: { text: string; scope: string; target: string | null }[] | null;
          status?: "active" | "hidden" | "removed";
        };
        Update: {
          title?: string;
          body?: string;
          category?: "social_media" | "gaming" | "content" | "grooming" | "general";
          is_anonymous?: boolean;
          rule_snapshot?: { text: string; scope: string; target: string | null }[] | null;
          status?: "active" | "hidden" | "removed";
          updated_at?: string;
        };
      };
      community_comments: {
        Row: {
          id: string;
          post_id: string;
          author_id: string;
          parent_comment_id: string | null;
          body: string;
          is_anonymous: boolean;
          status: "active" | "hidden" | "removed";
          upvotes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          author_id: string;
          parent_comment_id?: string | null;
          body: string;
          is_anonymous?: boolean;
        };
        Update: {
          body?: string;
          is_anonymous?: boolean;
          status?: "active" | "hidden" | "removed";
          updated_at?: string;
        };
      };
      community_votes: {
        Row: {
          id: string;
          user_id: string;
          target_type: "post" | "comment";
          target_id: string;
          value: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          target_type: "post" | "comment";
          target_id: string;
          value: number;
        };
        Update: {
          value?: number;
        };
      };
      community_presets: {
        Row: {
          id: string;
          author_id: string;
          name: string;
          description: string;
          age_range: string;
          tier: "kid_10" | "tween_13" | "teen_16";
          rules: { text: string; scope: string; target: string | null }[];
          adoption_count: number;
          rating_avg: number;
          rating_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          name: string;
          description?: string;
          age_range?: string;
          tier?: "kid_10" | "tween_13" | "teen_16";
          rules: { text: string; scope: string; target: string | null }[];
        };
        Update: {
          name?: string;
          description?: string;
          age_range?: string;
          tier?: "kid_10" | "tween_13" | "teen_16";
          rules?: { text: string; scope: string; target: string | null }[];
          updated_at?: string;
        };
      };
      community_preset_reviews: {
        Row: {
          id: string;
          preset_id: string;
          author_id: string;
          rating: number;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          preset_id: string;
          author_id: string;
          rating: number;
          body?: string;
        };
        Update: {
          rating?: number;
          body?: string;
        };
      };
      community_reports: {
        Row: {
          id: string;
          reporter_id: string;
          target_type: "post" | "comment" | "preset";
          target_id: string;
          reason: string;
          status: "pending" | "reviewed" | "dismissed";
          created_at: string;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          target_type: "post" | "comment" | "preset";
          target_id: string;
          reason: string;
        };
        Update: {
          status?: "pending" | "reviewed" | "dismissed";
        };
      };
      community_rule_stats: {
        Row: {
          id: string;
          rule_text_hash: string;
          rule_text_normalized: string;
          category: string;
          adoption_count: number;
          effectiveness_score: number;
          blocked_count_30d: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          rule_text_hash: string;
          rule_text_normalized: string;
          category?: string;
          adoption_count?: number;
          effectiveness_score?: number;
          blocked_count_30d?: number;
        };
        Update: {
          rule_text_normalized?: string;
          category?: string;
          adoption_count?: number;
          effectiveness_score?: number;
          blocked_count_30d?: number;
          updated_at?: string;
        };
      };
```

- [ ] **Step 2: Add community enums to Enums section (after line 348)**

```typescript
      community_post_category: "social_media" | "gaming" | "content" | "grooming" | "general";
      community_content_status: "active" | "hidden" | "removed";
      community_vote_target: "post" | "comment";
      community_report_target: "post" | "comment" | "preset";
      community_report_status: "pending" | "reviewed" | "dismissed";
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/lib/types/database.ts
git commit -m "feat(community): add TypeScript types for community tables"
```

---

## Chunk 2: API Routes

### Task 3: Posts API — list and create

**Files:**
- Create: `dashboard/src/app/api/community/posts/route.ts`

- [ ] **Step 1: Create posts list/create API route**

```typescript
import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

// Sanitize rule snapshot — strip all identifying fields
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

/**
 * GET /api/community/posts
 * Query params: category, sort (trending|new|top), cursor (created_at ISO), limit
 */
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
    // Trending = most comments + votes in recent posts
    query = query.order("comment_count", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  // Pinned posts first
  query = query.order("pinned", { ascending: false });
  query = query.limit(limit);

  const { data: posts, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mask anonymous author info
  const masked = (posts || []).map((p: any) => ({
    ...p,
    author_id: p.is_anonymous ? null : p.author_id,
    author_name: p.is_anonymous ? "A Phylax Parent" : p.parents?.display_name || "Parent",
    parents: undefined,
  }));

  return NextResponse.json({ posts: masked });
}

/**
 * POST /api/community/posts
 * Body: { title, body, category, is_anonymous, rule_snapshot? }
 */
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
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/api/community/posts/route.ts
git commit -m "feat(community): add posts list/create API route"
```

### Task 4: Single post API — get, update, delete

**Files:**
- Create: `dashboard/src/app/api/community/posts/[id]/route.ts`

- [ ] **Step 1: Create single post API route**

```typescript
import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/community/posts/[id]
 */
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

  // Check user's existing vote
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

/**
 * PATCH /api/community/posts/[id]
 * Body: { title?, body?, category? }
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceClient();

  // Verify ownership
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

/**
 * DELETE /api/community/posts/[id] — soft delete
 */
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
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/api/community/posts/\[id\]/route.ts
git commit -m "feat(community): add single post GET/PATCH/DELETE API"
```

### Task 5: Comments API

**Files:**
- Create: `dashboard/src/app/api/community/posts/[id]/comments/route.ts`

- [ ] **Step 1: Create comments API route**

```typescript
import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/community/posts/[id]/comments
 */
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

  // Get user's votes on these comments
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

/**
 * POST /api/community/posts/[id]/comments
 * Body: { body, parent_comment_id?, is_anonymous? }
 */
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

  // Verify post exists
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
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/api/community/posts/\[id\]/comments/route.ts
git commit -m "feat(community): add comments list/create API"
```

### Task 6: Vote API

**Files:**
- Create: `dashboard/src/app/api/community/vote/route.ts`

- [ ] **Step 1: Create vote API route**

```typescript
import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/community/vote
 * Body: { target_type: "post"|"comment", target_id: string, value: 1|-1 }
 */
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
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/api/community/vote/route.ts
git commit -m "feat(community): add vote toggle API using DB function"
```

### Task 7: Report API

**Files:**
- Create: `dashboard/src/app/api/community/report/route.ts`

- [ ] **Step 1: Create report API route**

```typescript
import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/community/report
 * Body: { target_type, target_id, reason }
 */
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
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/api/community/report/route.ts
git commit -m "feat(community): add content report API"
```

### Task 8: Presets API — list, create, detail, adopt, review

**Files:**
- Create: `dashboard/src/app/api/community/presets/route.ts`
- Create: `dashboard/src/app/api/community/presets/[id]/route.ts`
- Create: `dashboard/src/app/api/community/presets/[id]/adopt/route.ts`
- Create: `dashboard/src/app/api/community/presets/[id]/review/route.ts`

- [ ] **Step 1: Create presets list/create**

```typescript
// dashboard/src/app/api/community/presets/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/community/presets
 * Query: tier, sort (popular|new|rating)
 */
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

/**
 * POST /api/community/presets
 * Body: { name, description, age_range, tier, rules }
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.name?.trim() || !Array.isArray(body.rules) || body.rules.length === 0) {
    return NextResponse.json({ error: "Name and at least one rule required" }, { status: 400 });
  }

  // Sanitize rules
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
```

- [ ] **Step 2: Create preset detail route**

```typescript
// dashboard/src/app/api/community/presets/[id]/route.ts
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
```

- [ ] **Step 3: Create adopt route**

```typescript
// dashboard/src/app/api/community/presets/[id]/adopt/route.ts
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
    .select("rules")
    .eq("id", id)
    .single();

  if (!preset) return NextResponse.json({ error: "Preset not found" }, { status: 404 });

  const rules = preset.rules as { text: string; scope: string; target: string | null }[];
  if (!Array.isArray(rules) || rules.length === 0) {
    return NextResponse.json({ error: "Preset has no rules" }, { status: 400 });
  }

  // Insert each rule into the family's rules
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

  // Increment adoption count
  await db.rpc("", {}).catch(() => {}); // fallback: manual increment
  await db
    .from("community_presets")
    .update({ adoption_count: (preset as any).adoption_count + 1 })
    .eq("id", id)
    .catch(() => {});

  return NextResponse.json({ status: "ok", rules_added: rules.length });
}
```

- [ ] **Step 4: Create review route**

```typescript
// dashboard/src/app/api/community/presets/[id]/review/route.ts
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

  // Update preset rating_avg and rating_count
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
```

- [ ] **Step 5: Commit all preset routes**

```bash
git add dashboard/src/app/api/community/presets/
git commit -m "feat(community): add presets API — list, create, detail, adopt, review"
```

### Task 9: Leaderboard API

**Files:**
- Create: `dashboard/src/app/api/community/leaderboard/route.ts`

- [ ] **Step 1: Create leaderboard API**

```typescript
import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/community/leaderboard
 * Returns top community rules by adoption count
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceClient();

  const { data, error } = await db
    .from("community_rule_stats")
    .select("*")
    .order("adoption_count", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rules: data || [] });
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/api/community/leaderboard/route.ts
git commit -m "feat(community): add leaderboard API"
```

---

## Chunk 3: UI Components

### Task 10: Community navigation component

**Files:**
- Create: `dashboard/src/components/community/community-nav.tsx`

- [ ] **Step 1: Create CommunityNav**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard/community", label: "Feed" },
  { href: "/dashboard/community/leaderboard", label: "Leaderboard" },
  { href: "/dashboard/community/presets", label: "Presets" },
];

export function CommunityNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 mb-6 border-b border-white/[0.06] pb-3">
      {TABS.map((tab) => {
        const isActive =
          tab.href === "/dashboard/community"
            ? pathname === "/dashboard/community"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? "bg-white/[0.08] text-white"
                : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
      <div className="flex-1" />
      <Link
        href="/dashboard/community/create"
        className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-all"
      >
        + New Post
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/community/community-nav.tsx
git commit -m "feat(community): add CommunityNav tab component"
```

### Task 11: VoteButton component

**Files:**
- Create: `dashboard/src/components/community/vote-button.tsx`

- [ ] **Step 1: Create VoteButton**

```tsx
"use client";

import { useState } from "react";

type Props = {
  targetType: "post" | "comment";
  targetId: string;
  upvotes: number;
  downvotes?: number;
  userVote: number; // 0, 1, or -1
};

export function VoteButton({ targetType, targetId, upvotes, downvotes = 0, userVote: initialVote }: Props) {
  const [vote, setVote] = useState(initialVote);
  const [ups, setUps] = useState(upvotes);
  const [downs, setDowns] = useState(downvotes);
  const [loading, setLoading] = useState(false);

  async function handleVote(value: 1 | -1) {
    if (loading) return;
    setLoading(true);

    // Optimistic update
    const oldVote = vote;
    const oldUps = ups;
    const oldDowns = downs;

    if (vote === value) {
      // Remove vote
      setVote(0);
      if (value === 1) setUps((u) => u - 1);
      else setDowns((d) => d - 1);
    } else if (vote === 0) {
      // New vote
      setVote(value);
      if (value === 1) setUps((u) => u + 1);
      else setDowns((d) => d + 1);
    } else {
      // Flip vote
      setVote(value);
      if (value === 1) { setUps((u) => u + 1); setDowns((d) => d - 1); }
      else { setUps((u) => u - 1); setDowns((d) => d + 1); }
    }

    try {
      const res = await fetch("/api/community/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Revert on error
      setVote(oldVote);
      setUps(oldUps);
      setDowns(oldDowns);
    } finally {
      setLoading(false);
    }
  }

  const score = ups - downs;

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => handleVote(1)}
        className={`p-1.5 rounded transition-colors ${
          vote === 1 ? "text-emerald-400 bg-emerald-400/10" : "text-white/30 hover:text-white/60 hover:bg-white/[0.04]"
        }`}
        aria-label="Upvote"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>
      <span className={`text-sm font-medium min-w-[2ch] text-center ${
        score > 0 ? "text-emerald-400" : score < 0 ? "text-rose-400" : "text-white/40"
      }`}>
        {score}
      </span>
      <button
        onClick={() => handleVote(-1)}
        className={`p-1.5 rounded transition-colors ${
          vote === -1 ? "text-rose-400 bg-rose-400/10" : "text-white/30 hover:text-white/60 hover:bg-white/[0.04]"
        }`}
        aria-label="Downvote"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/community/vote-button.tsx
git commit -m "feat(community): add VoteButton with optimistic UI"
```

### Task 12: PostCard component

**Files:**
- Create: `dashboard/src/components/community/post-card.tsx`

- [ ] **Step 1: Create PostCard**

```tsx
import Link from "next/link";
import { VoteButton } from "./vote-button";

const CATEGORY_COLORS: Record<string, string> = {
  social_media: "bg-blue-500/20 text-blue-300",
  gaming: "bg-purple-500/20 text-purple-300",
  content: "bg-amber-500/20 text-amber-300",
  grooming: "bg-rose-500/20 text-rose-300",
  general: "bg-white/[0.08] text-white/60",
};

type PostCardProps = {
  id: string;
  title: string;
  body: string;
  category: string;
  author_name: string;
  is_anonymous: boolean;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  created_at: string;
  user_vote?: number;
  rule_snapshot?: { text: string; scope: string; target: string | null }[] | null;
};

export function PostCard({
  id, title, body, category, author_name, is_anonymous,
  upvotes, downvotes, comment_count, created_at, user_vote = 0, rule_snapshot,
}: PostCardProps) {
  const timeAgo = getTimeAgo(created_at);
  const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.general;

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 hover:bg-white/[0.05] transition-colors">
      <div className="flex gap-3">
        <VoteButton
          targetType="post"
          targetId={id}
          upvotes={upvotes}
          downvotes={downvotes}
          userVote={user_vote}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${categoryColor}`}>
              {category.replace("_", " ")}
            </span>
            <span className="text-white/30 text-xs">
              {is_anonymous ? "A Phylax Parent" : author_name}
            </span>
            <span className="text-white/20 text-xs">{timeAgo}</span>
          </div>

          <Link href={`/dashboard/community/post/${id}`} className="block group">
            <h3 className="text-white font-medium text-[15px] leading-snug group-hover:text-emerald-300 transition-colors">
              {title}
            </h3>
            <p className="text-white/50 text-sm mt-1 line-clamp-2">{body}</p>
          </Link>

          {rule_snapshot && rule_snapshot.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {rule_snapshot.slice(0, 3).map((r, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[11px]">
                  {r.text.length > 40 ? r.text.slice(0, 40) + "..." : r.text}
                </span>
              ))}
              {rule_snapshot.length > 3 && (
                <span className="text-white/30 text-[11px]">+{rule_snapshot.length - 3} more</span>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 mt-2.5">
            <Link
              href={`/dashboard/community/post/${id}`}
              className="flex items-center gap-1.5 text-white/30 hover:text-white/60 text-xs transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
              </svg>
              {comment_count} {comment_count === 1 ? "comment" : "comments"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/community/post-card.tsx
git commit -m "feat(community): add PostCard component"
```

### Task 13: PostFeed component

**Files:**
- Create: `dashboard/src/components/community/post-feed.tsx`

- [ ] **Step 1: Create PostFeed with cursor-based infinite scroll**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { PostCard } from "./post-card";

type Post = {
  id: string;
  title: string;
  body: string;
  category: string;
  author_name: string;
  is_anonymous: boolean;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  created_at: string;
  user_vote?: number;
  rule_snapshot?: { text: string; scope: string; target: string | null }[] | null;
};

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "social_media", label: "Social Media" },
  { value: "gaming", label: "Gaming" },
  { value: "content", label: "Content" },
  { value: "grooming", label: "Grooming" },
  { value: "general", label: "General" },
];

const SORTS = [
  { value: "new", label: "New" },
  { value: "top", label: "Top" },
  { value: "trending", label: "Trending" },
];

export function PostFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("new");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);

  const fetchPosts = useCallback(async (reset = false) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    params.set("sort", sort);
    if (!reset && cursor) params.set("cursor", cursor);

    const res = await fetch(`/api/community/posts?${params}`);
    const data = await res.json();
    const newPosts = data.posts || [];

    if (reset) {
      setPosts(newPosts);
    } else {
      setPosts((prev) => [...prev, ...newPosts]);
    }

    setHasMore(newPosts.length >= 20);
    if (newPosts.length > 0) {
      setCursor(newPosts[newPosts.length - 1].created_at);
    }
    setLoading(false);
  }, [category, sort, cursor]);

  useEffect(() => {
    setCursor(null);
    setHasMore(true);
    fetchPosts(true);
  }, [category, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                category === c.value
                  ? "bg-white/[0.08] text-white"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-1">
          {SORTS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSort(s.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                sort === s.value
                  ? "bg-white/[0.08] text-white"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Posts */}
      <div className="space-y-3">
        {posts.map((post) => (
          <PostCard key={post.id} {...post} />
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" />
        </div>
      )}

      {!loading && posts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-white/40 text-sm">No posts yet. Be the first to share!</p>
        </div>
      )}

      {!loading && hasMore && posts.length > 0 && (
        <button
          onClick={() => fetchPosts(false)}
          className="w-full py-3 mt-4 text-sm text-white/40 hover:text-white/60 hover:bg-white/[0.03] rounded-lg transition-colors"
        >
          Load more
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/community/post-feed.tsx
git commit -m "feat(community): add PostFeed with cursor pagination and filters"
```

### Task 14: CommentThread component

**Files:**
- Create: `dashboard/src/components/community/comment-thread.tsx`

- [ ] **Step 1: Create CommentThread**

```tsx
"use client";

import { useState } from "react";
import { VoteButton } from "./vote-button";

type Comment = {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  body: string;
  author_name: string;
  is_anonymous: boolean;
  upvotes: number;
  user_vote: number;
  is_own: boolean;
  created_at: string;
};

type Props = {
  postId: string;
  comments: Comment[];
  onCommentAdded: () => void;
};

export function CommentThread({ postId, comments, onCommentAdded }: Props) {
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [newComment, setNewComment] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Build tree
  const rootComments = comments.filter((c) => !c.parent_comment_id);
  const childMap = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parent_comment_id) {
      const existing = childMap.get(c.parent_comment_id) || [];
      existing.push(c);
      childMap.set(c.parent_comment_id, existing);
    }
  }

  async function submitComment(body: string, parentId: string | null) {
    if (!body.trim() || submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/community/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), parent_comment_id: parentId, is_anonymous: isAnonymous }),
      });
      if (res.ok) {
        setNewComment("");
        setReplyBody("");
        setReplyTo(null);
        onCommentAdded();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function renderComment(comment: Comment, depth: number) {
    return (
      <div key={comment.id} className={`${depth > 0 ? "ml-6 border-l border-white/[0.06] pl-4" : ""}`}>
        <div className="py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white/40 text-xs font-medium">
              {comment.is_anonymous ? "A Phylax Parent" : comment.author_name}
            </span>
            <span className="text-white/20 text-xs">{getTimeAgo(comment.created_at)}</span>
          </div>
          <p className="text-white/70 text-sm leading-relaxed">{comment.body}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <VoteButton
              targetType="comment"
              targetId={comment.id}
              upvotes={comment.upvotes}
              userVote={comment.user_vote}
            />
            {depth < 3 && (
              <button
                onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                Reply
              </button>
            )}
          </div>

          {replyTo === comment.id && (
            <div className="mt-2 flex gap-2">
              <input
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write a reply..."
                className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50"
                onKeyDown={(e) => e.key === "Enter" && submitComment(replyBody, comment.id)}
              />
              <button
                onClick={() => submitComment(replyBody, comment.id)}
                disabled={submitting}
                className="px-3 py-2 bg-emerald-500/20 text-emerald-300 rounded-lg text-sm hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
              >
                Reply
              </button>
            </div>
          )}
        </div>

        {(childMap.get(comment.id) || []).map((child) => renderComment(child, depth + 1))}
      </div>
    );
  }

  return (
    <div>
      {/* New comment input */}
      <div className="mb-4">
        <div className="flex gap-2">
          <input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Share your thoughts..."
            className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50"
            onKeyDown={(e) => e.key === "Enter" && submitComment(newComment, null)}
          />
          <button
            onClick={() => submitComment(newComment, null)}
            disabled={submitting}
            className="px-4 py-2.5 bg-emerald-500/20 text-emerald-300 rounded-lg text-sm font-medium hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
          >
            Comment
          </button>
        </div>
        <label className="flex items-center gap-2 mt-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="rounded border-white/20 bg-white/[0.05]"
          />
          <span className="text-xs text-white/40">Post anonymously</span>
        </label>
      </div>

      {/* Comments */}
      <div className="divide-y divide-white/[0.04]">
        {rootComments.map((c) => renderComment(c, 0))}
      </div>

      {comments.length === 0 && (
        <p className="text-center text-white/30 text-sm py-6">No comments yet.</p>
      )}
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/community/comment-thread.tsx
git commit -m "feat(community): add CommentThread with nested replies"
```

### Task 15: ReportModal, PresetCard, RuleLeaderboard components

**Files:**
- Create: `dashboard/src/components/community/report-modal.tsx`
- Create: `dashboard/src/components/community/preset-card.tsx`
- Create: `dashboard/src/components/community/rule-leaderboard.tsx`

- [ ] **Step 1: Create ReportModal**

```tsx
// dashboard/src/components/community/report-modal.tsx
"use client";

import { useState } from "react";

type Props = {
  targetType: "post" | "comment" | "preset";
  targetId: string;
  onClose: () => void;
};

const REASONS = [
  "Spam or misleading",
  "Inappropriate content",
  "Harassment or bullying",
  "Contains personal information",
  "Other",
];

export function ReportModal({ targetType, targetId, onClose }: Props) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    const finalReason = reason === "Other" ? custom.trim() : reason;
    if (!finalReason) return;
    setSubmitting(true);

    const res = await fetch("/api/community/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_type: targetType, target_id: targetId, reason: finalReason }),
    });

    setSubmitting(false);
    if (res.ok || res.status === 409) setDone(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0F1320] border border-white/[0.08] rounded-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-4">
            <p className="text-white font-medium">Report submitted</p>
            <p className="text-white/40 text-sm mt-1">Thank you for helping keep our community safe.</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 bg-white/[0.08] text-white rounded-lg text-sm hover:bg-white/[0.12] transition-colors">
              Close
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-white font-semibold mb-4">Report {targetType}</h3>
            <div className="space-y-2 mb-4">
              {REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors ${
                    reason === r ? "bg-white/[0.08] text-white" : "text-white/50 hover:bg-white/[0.04]"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {reason === "Other" && (
              <textarea
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Describe the issue..."
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50 mb-4 resize-none h-20"
              />
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm text-white/40 hover:text-white/60 transition-colors">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={!reason || (reason === "Other" && !custom.trim()) || submitting}
                className="px-4 py-2 bg-rose-500/20 text-rose-300 rounded-lg text-sm font-medium hover:bg-rose-500/30 transition-colors disabled:opacity-50"
              >
                Submit Report
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create PresetCard**

```tsx
// dashboard/src/components/community/preset-card.tsx
import Link from "next/link";

type PresetCardProps = {
  id: string;
  name: string;
  description: string;
  age_range: string;
  tier: string;
  rules: { text: string }[];
  adoption_count: number;
  rating_avg: number;
  rating_count: number;
  author_name: string;
};

const TIER_LABELS: Record<string, string> = {
  kid_10: "Ages 8-10",
  tween_13: "Ages 11-13",
  teen_16: "Ages 14-16",
};

export function PresetCard({
  id, name, description, age_range, tier, rules,
  adoption_count, rating_avg, rating_count, author_name,
}: PresetCardProps) {
  return (
    <Link
      href={`/dashboard/community/presets/${id}`}
      className="block bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 hover:bg-white/[0.05] transition-colors"
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-white font-medium text-[15px]">{name}</h3>
          <p className="text-white/40 text-xs mt-0.5">by {author_name}</p>
        </div>
        <span className="px-2 py-0.5 rounded bg-white/[0.06] text-white/50 text-[11px] font-medium">
          {TIER_LABELS[tier] || age_range || tier}
        </span>
      </div>

      {description && (
        <p className="text-white/50 text-sm line-clamp-2 mb-3">{description}</p>
      )}

      <div className="flex flex-wrap gap-1 mb-3">
        {rules.slice(0, 4).map((r, i) => (
          <span key={i} className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[11px]">
            {r.text.length > 35 ? r.text.slice(0, 35) + "..." : r.text}
          </span>
        ))}
        {rules.length > 4 && (
          <span className="text-white/30 text-[11px] self-center">+{rules.length - 4} more</span>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-white/40">
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
          </svg>
          {adoption_count} adopted
        </span>
        {rating_count > 0 && (
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            {rating_avg.toFixed(1)} ({rating_count})
          </span>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Create RuleLeaderboard**

```tsx
// dashboard/src/components/community/rule-leaderboard.tsx
"use client";

import { useState, useEffect } from "react";

type RuleStat = {
  id: string;
  rule_text_normalized: string;
  category: string;
  adoption_count: number;
  effectiveness_score: number;
  blocked_count_30d: number;
};

export function RuleLeaderboard() {
  const [rules, setRules] = useState<RuleStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/community/leaderboard")
      .then((r) => r.json())
      .then((d) => { setRules(d.rules || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-white/40 text-sm">No rule statistics yet. Rules will appear here as more parents use Phylax.</p>
      </div>
    );
  }

  const maxAdoption = rules[0]?.adoption_count || 1;

  return (
    <div className="space-y-2">
      {rules.map((rule, i) => (
        <div key={rule.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className={`text-lg font-bold min-w-[2ch] text-right ${
              i < 3 ? "text-emerald-400" : "text-white/30"
            }`}>
              {i + 1}
            </span>
            <div className="flex-1">
              <p className="text-white text-sm font-medium">{rule.rule_text_normalized}</p>
              <div className="flex items-center gap-4 mt-1.5 text-xs text-white/40">
                <span>{rule.adoption_count} families</span>
                <span>{rule.blocked_count_30d.toLocaleString()} blocks (30d)</span>
                <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50 text-[10px]">
                  {rule.category}
                </span>
              </div>
              {/* Effectiveness bar */}
              <div className="mt-2 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all"
                  style={{ width: `${Math.min((rule.adoption_count / maxAdoption) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Commit all three components**

```bash
git add dashboard/src/components/community/report-modal.tsx dashboard/src/components/community/preset-card.tsx dashboard/src/components/community/rule-leaderboard.tsx
git commit -m "feat(community): add ReportModal, PresetCard, RuleLeaderboard components"
```

---

## Chunk 4: Pages & Shell Integration

### Task 16: Community feed page (main)

**Files:**
- Create: `dashboard/src/app/dashboard/community/page.tsx`

- [ ] **Step 1: Create community feed page**

```tsx
import { CommunityNav } from "@/components/community/community-nav";
import { PostFeed } from "@/components/community/post-feed";

export default function CommunityPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Community</h1>
        <p className="text-white/40 text-sm mt-1">Connect with other parents. Share rules. Stay safer together.</p>
      </div>
      <CommunityNav />
      <PostFeed />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/dashboard/community/page.tsx
git commit -m "feat(community): add main community feed page"
```

### Task 17: Single post page

**Files:**
- Create: `dashboard/src/app/dashboard/community/post/[id]/page.tsx`

- [ ] **Step 1: Create post detail page**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { VoteButton } from "@/components/community/vote-button";
import { CommentThread } from "@/components/community/comment-thread";
import { ReportModal } from "@/components/community/report-modal";

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);

  const fetchPost = useCallback(async () => {
    const [postRes, commentsRes] = await Promise.all([
      fetch(`/api/community/posts/${id}`),
      fetch(`/api/community/posts/${id}/comments`),
    ]);
    const postData = await postRes.json();
    const commentsData = await commentsRes.json();
    setPost(postData.post);
    setComments(commentsData.comments || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchPost(); }, [fetchPost]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!post) {
    return <p className="text-center text-white/40 py-12">Post not found.</p>;
  }

  const CATEGORY_COLORS: Record<string, string> = {
    social_media: "bg-blue-500/20 text-blue-300",
    gaming: "bg-purple-500/20 text-purple-300",
    content: "bg-amber-500/20 text-amber-300",
    grooming: "bg-rose-500/20 text-rose-300",
    general: "bg-white/[0.08] text-white/60",
  };

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/dashboard/community" className="text-white/40 hover:text-white/60 text-sm mb-4 inline-block transition-colors">
        &larr; Back to feed
      </Link>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${CATEGORY_COLORS[post.category] || CATEGORY_COLORS.general}`}>
            {post.category.replace("_", " ")}
          </span>
          <span className="text-white/40 text-xs">{post.author_name}</span>
          <span className="text-white/20 text-xs">{new Date(post.created_at).toLocaleDateString()}</span>
        </div>

        <h1 className="text-xl font-bold text-white mb-3">{post.title}</h1>
        <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">{post.body}</p>

        {post.rule_snapshot && post.rule_snapshot.length > 0 && (
          <div className="mt-4 p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
            <p className="text-emerald-300 text-xs font-medium mb-2">Attached Rules</p>
            <div className="space-y-1">
              {post.rule_snapshot.map((r: any, i: number) => (
                <div key={i} className="text-sm text-white/60">
                  {r.text} <span className="text-white/30">({r.scope}{r.target ? ` — ${r.target}` : ""})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/[0.06]">
          <VoteButton
            targetType="post"
            targetId={post.id}
            upvotes={post.upvotes}
            downvotes={post.downvotes}
            userVote={post.user_vote || 0}
          />
          <span className="text-white/30 text-xs">{post.comment_count} comments</span>
          <div className="flex-1" />
          <button
            onClick={() => setShowReport(true)}
            className="text-xs text-white/30 hover:text-rose-400 transition-colors"
          >
            Report
          </button>
          {post.is_own && (
            <button
              onClick={async () => {
                if (confirm("Delete this post?")) {
                  await fetch(`/api/community/posts/${id}`, { method: "DELETE" });
                  router.push("/dashboard/community");
                }
              }}
              className="text-xs text-white/30 hover:text-rose-400 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Comments */}
      <div className="mt-6">
        <h2 className="text-white font-semibold mb-4">Comments</h2>
        <CommentThread postId={id} comments={comments} onCommentAdded={fetchPost} />
      </div>

      {showReport && (
        <ReportModal targetType="post" targetId={id} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/dashboard/community/post/\[id\]/page.tsx
git commit -m "feat(community): add post detail page with comments"
```

### Task 18: Create post page

**Files:**
- Create: `dashboard/src/app/dashboard/community/create/page.tsx`

- [ ] **Step 1: Create new post form page**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommunityNav } from "@/components/community/community-nav";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "social_media", label: "Social Media Safety" },
  { value: "gaming", label: "Gaming" },
  { value: "content", label: "Age-Appropriate Content" },
  { value: "grooming", label: "Grooming Prevention" },
];

export default function CreatePostPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    setSubmitting(true);
    setError("");

    const res = await fetch("/api/community/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, category, is_anonymous: isAnonymous }),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/dashboard/community/post/${data.post_id}`);
    } else {
      const data = await res.json();
      setError(data.error || "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <CommunityNav />
      <div className="max-w-2xl mx-auto">
        <h1 className="text-xl font-bold text-white mb-6">Create a Post</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-white/60 mb-1.5">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                    category === c.value
                      ? "bg-white/[0.08] text-white"
                      : "bg-white/[0.03] text-white/40 hover:text-white/60"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-white/60 mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's on your mind?"
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50"
              maxLength={200}
            />
          </div>

          <div>
            <label className="block text-sm text-white/60 mb-1.5">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share your experience, question, or advice..."
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50 resize-none h-40"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="rounded border-white/20 bg-white/[0.05]"
            />
            <span className="text-sm text-white/50">Post anonymously</span>
            <span className="text-xs text-white/30">(your name won&apos;t be shown)</span>
          </label>

          {error && <p className="text-rose-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2.5 text-sm text-white/40 hover:text-white/60 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !body.trim() || submitting}
              className="px-6 py-2.5 bg-emerald-500/20 text-emerald-300 rounded-lg text-sm font-medium hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
            >
              {submitting ? "Posting..." : "Post"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/dashboard/community/create/page.tsx
git commit -m "feat(community): add create post page"
```

### Task 19: Leaderboard page

**Files:**
- Create: `dashboard/src/app/dashboard/community/leaderboard/page.tsx`

- [ ] **Step 1: Create leaderboard page**

```tsx
import { CommunityNav } from "@/components/community/community-nav";
import { RuleLeaderboard } from "@/components/community/rule-leaderboard";

export default function LeaderboardPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Rules Leaderboard</h1>
        <p className="text-white/40 text-sm mt-1">The most popular safety rules across the Phylax community.</p>
      </div>
      <CommunityNav />
      <RuleLeaderboard />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/dashboard/community/leaderboard/page.tsx
git commit -m "feat(community): add leaderboard page"
```

### Task 20: Presets list page

**Files:**
- Create: `dashboard/src/app/dashboard/community/presets/page.tsx`

- [ ] **Step 1: Create presets list page**

```tsx
"use client";

import { useState, useEffect } from "react";
import { CommunityNav } from "@/components/community/community-nav";
import { PresetCard } from "@/components/community/preset-card";

export default function PresetsPage() {
  const [presets, setPresets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState("");
  const [sort, setSort] = useState("popular");

  useEffect(() => {
    const params = new URLSearchParams();
    if (tier) params.set("tier", tier);
    params.set("sort", sort);

    fetch(`/api/community/presets?${params}`)
      .then((r) => r.json())
      .then((d) => { setPresets(d.presets || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tier, sort]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Safety Presets</h1>
        <p className="text-white/40 text-sm mt-1">Ready-made rule sets shared by other parents.</p>
      </div>
      <CommunityNav />

      <div className="flex flex-wrap gap-2 mb-4">
        {[{ v: "", l: "All Ages" }, { v: "kid_10", l: "Ages 8-10" }, { v: "tween_13", l: "Ages 11-13" }, { v: "teen_16", l: "Ages 14-16" }].map((t) => (
          <button
            key={t.v}
            onClick={() => setTier(t.v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tier === t.v ? "bg-white/[0.08] text-white" : "text-white/40 hover:text-white/60"
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" />
        </div>
      ) : presets.length === 0 ? (
        <p className="text-center text-white/40 text-sm py-12">No presets yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {presets.map((p) => <PresetCard key={p.id} {...p} />)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/dashboard/community/presets/page.tsx
git commit -m "feat(community): add presets list page"
```

### Task 21: Preset detail page

**Files:**
- Create: `dashboard/src/app/dashboard/community/presets/[id]/page.tsx`

- [ ] **Step 1: Create preset detail page**

```tsx
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function PresetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [preset, setPreset] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adopting, setAdopting] = useState(false);
  const [adopted, setAdopted] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/community/presets/${id}`)
      .then((r) => r.json())
      .then((d) => { setPreset(d.preset); setReviews(d.reviews || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  async function handleAdopt() {
    setAdopting(true);
    const res = await fetch(`/api/community/presets/${id}/adopt`, { method: "POST" });
    if (res.ok) setAdopted(true);
    setAdopting(false);
  }

  async function handleReview() {
    if (!reviewRating) return;
    setReviewSubmitting(true);
    const res = await fetch(`/api/community/presets/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: reviewRating, body: reviewBody }),
    });
    if (res.ok) {
      // Refresh
      const d = await (await fetch(`/api/community/presets/${id}`)).json();
      setPreset(d.preset);
      setReviews(d.reviews || []);
      setReviewRating(0);
      setReviewBody("");
    }
    setReviewSubmitting(false);
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" /></div>;
  }
  if (!preset) return <p className="text-center text-white/40 py-12">Preset not found.</p>;

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/dashboard/community/presets" className="text-white/40 hover:text-white/60 text-sm mb-4 inline-block transition-colors">
        &larr; Back to presets
      </Link>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white">{preset.name}</h1>
            <p className="text-white/40 text-sm mt-1">by {preset.author_name} &middot; {preset.adoption_count} adoptions</p>
          </div>
          {preset.rating_count > 0 && (
            <div className="flex items-center gap-1 text-amber-400">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              <span className="text-sm font-medium">{preset.rating_avg.toFixed(1)}</span>
              <span className="text-white/30 text-xs">({preset.rating_count})</span>
            </div>
          )}
        </div>

        {preset.description && <p className="text-white/60 text-sm mb-4">{preset.description}</p>}

        <div className="space-y-2 mb-6">
          <p className="text-white/50 text-xs font-medium uppercase tracking-wider">Rules in this preset</p>
          {(preset.rules || []).map((r: any, i: number) => (
            <div key={i} className="flex items-center gap-2 bg-white/[0.03] rounded-lg px-3 py-2">
              <span className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-300 text-[11px] flex items-center justify-center font-medium">{i + 1}</span>
              <span className="text-white/70 text-sm">{r.text}</span>
              {r.target && <span className="text-white/30 text-xs ml-auto">{r.target}</span>}
            </div>
          ))}
        </div>

        <button
          onClick={handleAdopt}
          disabled={adopting || adopted}
          className={`w-full py-3 rounded-lg text-sm font-medium transition-all ${
            adopted
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
          } disabled:opacity-60`}
        >
          {adopted ? "Rules Added to Your Setup" : adopting ? "Adding..." : `Adopt ${(preset.rules || []).length} Rules`}
        </button>
      </div>

      {/* Reviews */}
      <div className="mt-6">
        <h2 className="text-white font-semibold mb-4">Reviews</h2>

        {/* Write review */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-4">
          <div className="flex items-center gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} onClick={() => setReviewRating(s)} className="p-0.5">
                <svg className={`w-5 h-5 ${s <= reviewRating ? "text-amber-400" : "text-white/20"}`} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </button>
            ))}
          </div>
          <textarea
            value={reviewBody}
            onChange={(e) => setReviewBody(e.target.value)}
            placeholder="Write a review (optional)..."
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50 resize-none h-16 mb-2"
          />
          <button
            onClick={handleReview}
            disabled={!reviewRating || reviewSubmitting}
            className="px-4 py-2 bg-white/[0.08] text-white rounded-lg text-sm hover:bg-white/[0.12] transition-colors disabled:opacity-50"
          >
            Submit Review
          </button>
        </div>

        {/* Existing reviews */}
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <svg key={s} className={`w-3.5 h-3.5 ${s <= r.rating ? "text-amber-400" : "text-white/20"}`} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  ))}
                </div>
                <span className="text-white/40 text-xs">{r.author_name}</span>
              </div>
              {r.body && <p className="text-white/60 text-sm">{r.body}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/dashboard/community/presets/\[id\]/page.tsx
git commit -m "feat(community): add preset detail page with adopt & reviews"
```

### Task 22: Update DashboardShell navigation

**Files:**
- Modify: `dashboard/src/components/dashboard/shell.tsx`

- [ ] **Step 1: Add Community to NAV_ITEMS (after "Reports", before "Lock It Down")**

At line 8, replace the NAV_ITEMS array:

```typescript
const NAV_ITEMS = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/children", label: "Children" },
  { href: "/dashboard/devices", label: "Devices" },
  { href: "/dashboard/rules", label: "Rules" },
  { href: "/dashboard/alerts", label: "Alerts" },
  { href: "/dashboard/activity", label: "AI Activity" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/community", label: "Community" },
  { href: "/dashboard/lockdown", label: "Lock It Down" },
  { href: "/dashboard/settings", label: "Settings" },
];
```

- [ ] **Step 2: Update desktop nav slice to show 8 items (line 56)**

Change `NAV_ITEMS.slice(0, 7)` to `NAV_ITEMS.slice(0, 8)` on line 56.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/dashboard/shell.tsx
git commit -m "feat(community): add Community tab to dashboard nav"
```

### Task 23: Verify build

- [ ] **Step 1: Run TypeScript check and build**

```bash
cd /Users/kyriacosvidalakis/phylax-landing/dashboard
npx next build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 2: Fix any errors that arise**

- [ ] **Step 3: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix(community): resolve build errors"
```
