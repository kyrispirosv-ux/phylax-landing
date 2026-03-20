-- Phylax Dashboard — Migration 004
-- Data moat infrastructure: anonymized safety signals, parent feedback, community intelligence

-- ═════════════════════════════════════════════════════════════
-- SAFETY SIGNALS (anonymized, for the data flywheel)
-- No PII, no raw content, no exact timestamps.
-- ═════════════════════════════════════════════════════════════

create table public.safety_signals (
  id bigint generated always as identity primary key,
  signal_hash text not null,
  topic text,
  intent text,
  stance text,
  risk_level real,
  platform text,
  source_type text,
  direction text,
  decision text,
  confidence real,
  pattern_type text,
  escalation_stage smallint,
  child_age_tier text,
  triggered_rule_types text[],
  timestamp_bucket timestamptz,
  region text,
  created_at timestamptz not null default now()
);

-- Indexes for analytics queries
create index idx_safety_signals_topic on public.safety_signals (topic, created_at desc);
create index idx_safety_signals_platform on public.safety_signals (platform, created_at desc);
create index idx_safety_signals_decision on public.safety_signals (decision, created_at desc);
create index idx_safety_signals_bucket on public.safety_signals (timestamp_bucket);
create index idx_safety_signals_pattern on public.safety_signals (pattern_type) where pattern_type is not null;
create index idx_safety_signals_risk on public.safety_signals (risk_level desc) where risk_level is not null;

-- No RLS on safety_signals — it's anonymous aggregate data, accessed only by service role
-- No family_id column — signals are deliberately de-identified

-- ═════════════════════════════════════════════════════════════
-- PARENT FEEDBACK (labeled training data)
-- Links to signal_hash, never to specific content.
-- ═════════════════════════════════════════════════════════════

create table public.parent_feedback (
  id bigint generated always as identity primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  signal_hash text not null,
  feedback_type text not null,           -- 'false_positive' | 'false_negative'
  original_decision text,
  original_topic text,
  original_confidence real,
  parent_action text,
  parent_flagged_topic text,
  platform text,
  child_age_tier text,
  created_at timestamptz not null default now()
);

alter table public.parent_feedback enable row level security;

-- Indexes for analytics and rate limiting
create index idx_parent_feedback_family on public.parent_feedback (family_id, created_at desc);
create index idx_parent_feedback_type on public.parent_feedback (feedback_type, created_at desc);
create index idx_parent_feedback_topic on public.parent_feedback (original_topic) where original_topic is not null;
create index idx_parent_feedback_signal on public.parent_feedback (signal_hash);

-- RLS: parents can see their own family's feedback
create policy "feedback_own_family" on public.parent_feedback
  for all using (family_id in (select family_id from public.parents where id = auth.uid()));

-- ═════════════════════════════════════════════════════════════
-- FAMILY OPT-IN SETTING
-- Default false — sharing is strictly opt-in.
-- ═════════════════════════════════════════════════════════════

alter table public.families add column share_safety_insights boolean not null default false;
