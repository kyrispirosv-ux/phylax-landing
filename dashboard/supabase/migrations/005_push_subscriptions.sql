-- Push notification subscriptions for PWA parent alerts
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  parent_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  keys_p256dh text NOT NULL,
  keys_auth   text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Index for fast lookup when sending alerts to a family
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_family_id ON push_subscriptions(family_id);

-- Index for parent-specific queries
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_parent_id ON push_subscriptions(parent_id);

-- RLS: parents can only read/manage their own subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can read own subscriptions"
  ON push_subscriptions FOR SELECT
  USING (auth.uid() = parent_id);

CREATE POLICY "Parents can insert own subscriptions"
  ON push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = parent_id);

CREATE POLICY "Parents can update own subscriptions"
  ON push_subscriptions FOR UPDATE
  USING (auth.uid() = parent_id);

CREATE POLICY "Parents can delete own subscriptions"
  ON push_subscriptions FOR DELETE
  USING (auth.uid() = parent_id);

-- Service role bypasses RLS for sending push notifications from backend
