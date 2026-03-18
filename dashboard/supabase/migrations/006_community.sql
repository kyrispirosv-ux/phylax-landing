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
  SELECT value INTO existing_value
  FROM community_votes
  WHERE user_id = p_user_id AND target_type = p_target_type AND target_id = p_target_id;

  IF existing_value IS NOT NULL THEN
    IF existing_value = p_value THEN
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

CREATE POLICY "posts_select" ON community_posts FOR SELECT TO authenticated
  USING (status = 'active' OR author_id = auth.uid());
CREATE POLICY "posts_insert" ON community_posts FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "posts_update" ON community_posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "comments_select" ON community_comments FOR SELECT TO authenticated
  USING (status = 'active' OR author_id = auth.uid());
CREATE POLICY "comments_insert" ON community_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "comments_update" ON community_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "votes_select" ON community_votes FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "votes_insert" ON community_votes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "votes_delete" ON community_votes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "presets_select" ON community_presets FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "presets_insert" ON community_presets FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "presets_update" ON community_presets FOR UPDATE TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "preset_reviews_select" ON community_preset_reviews FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "preset_reviews_insert" ON community_preset_reviews FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "reports_insert" ON community_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "reports_select_own" ON community_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

CREATE POLICY "rule_stats_select" ON community_rule_stats FOR SELECT TO authenticated
  USING (true);
