-- Phylax Dashboard — Migration 002
-- Pairing tokens, events, report summaries, rule scope, policy versioning

-- ═════════════════════════════════════════════════════════════
-- PAIRING TOKENS (secure device pairing)
-- ═════════════════════════════════════════════════════════════

create table public.pairing_tokens (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  secret text not null,                    -- random 32+ byte hex string
  short_code char(6) not null,             -- 6-character alphanumeric code (maps to strong token)
  expires_at timestamptz not null,
  used_at timestamptz,                     -- null = unused
  used_by_device_id uuid references public.devices(id),
  created_by uuid not null references public.parents(id),
  created_at timestamptz not null default now()
);

alter table public.pairing_tokens enable row level security;

create index idx_pairing_tokens_short_code on public.pairing_tokens (short_code) where used_at is null;
create index idx_pairing_tokens_secret on public.pairing_tokens (secret) where used_at is null;
create index idx_pairing_tokens_family on public.pairing_tokens (family_id);

-- Rate-limit table for pairing code attempts
create table public.pairing_attempts (
  id bigint generated always as identity primary key,
  ip_hint text,                            -- partial IP or fingerprint (not full IP for privacy)
  short_code char(6),
  success boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_pairing_attempts_ip on public.pairing_attempts (ip_hint, created_at desc);

-- ═════════════════════════════════════════════════════════════
-- EVENTS (extension → backend logging)
-- ═════════════════════════════════════════════════════════════

create table public.events (
  id bigint generated always as identity primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  event_type text not null,                -- blocked, allowed, request_access, device_heartbeat, policy_applied
  domain text,
  url text,
  category text,                           -- topic category (gambling, violence, etc.)
  rule_id uuid references public.rules(id) on delete set null,
  reason_code text,
  confidence real,
  metadata jsonb,                          -- extra context (scores, etc.)
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

create index idx_events_family_time on public.events (family_id, created_at desc);
create index idx_events_device_time on public.events (device_id, created_at desc);
create index idx_events_type on public.events (event_type, created_at desc);

-- ═════════════════════════════════════════════════════════════
-- REPORT SUMMARIES (pre-aggregated for dashboard performance)
-- ═════════════════════════════════════════════════════════════

create type public.report_period as enum ('daily', 'weekly');

create table public.report_summaries (
  id bigint generated always as identity primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  period public.report_period not null,
  period_start date not null,              -- start of day/week
  total_events int not null default 0,
  blocked_count int not null default 0,
  allowed_count int not null default 0,
  request_access_count int not null default 0,
  top_blocked_domains jsonb default '[]',  -- [{domain, count}]
  top_categories jsonb default '[]',       -- [{category, count}]
  active_minutes int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, child_id, period, period_start)
);

alter table public.report_summaries enable row level security;

create index idx_reports_family_period on public.report_summaries (family_id, period, period_start desc);

-- ═════════════════════════════════════════════════════════════
-- ALTER RULES: add scope column
-- ═════════════════════════════════════════════════════════════

create type public.rule_scope as enum ('site', 'content');

alter table public.rules add column scope public.rule_scope not null default 'content';
alter table public.rules add column target text;  -- domain for site scope, topic for content scope

-- ═════════════════════════════════════════════════════════════
-- POLICY VERSIONING (track per-family)
-- ═════════════════════════════════════════════════════════════

alter table public.families add column policy_version int not null default 1;
alter table public.families add column policy_updated_at timestamptz not null default now();

-- ═════════════════════════════════════════════════════════════
-- ACCESS REQUESTS (child requests access to blocked content)
-- ═════════════════════════════════════════════════════════════

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  url text not null,
  domain text,
  rule_id uuid references public.rules(id) on delete set null,
  reason text,                             -- child's message to parent
  status text not null default 'pending',  -- pending, approved, denied
  reviewed_by uuid references public.parents(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.access_requests enable row level security;

create index idx_access_requests_family on public.access_requests (family_id, status, created_at desc);

-- ═════════════════════════════════════════════════════════════
-- RLS POLICIES FOR NEW TABLES
-- ═════════════════════════════════════════════════════════════

create policy "pairing_tokens_own_family" on public.pairing_tokens
  for all using (family_id in (select family_id from public.parents where id = auth.uid()));

-- pairing_attempts: no RLS (service-role only)
-- events: parents see their family's events
create policy "events_own_family" on public.events
  for all using (family_id in (select family_id from public.parents where id = auth.uid()));

create policy "reports_own_family" on public.report_summaries
  for all using (family_id in (select family_id from public.parents where id = auth.uid()));

create policy "access_requests_own_family" on public.access_requests
  for all using (family_id in (select family_id from public.parents where id = auth.uid()));

-- ═════════════════════════════════════════════════════════════
-- FUNCTION: bump policy version on rule changes
-- ═════════════════════════════════════════════════════════════

create or replace function public.bump_policy_version()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.families
  set policy_version = policy_version + 1,
      policy_updated_at = now()
  where id = coalesce(new.family_id, old.family_id);
  return coalesce(new, old);
end;
$$;

create trigger on_rule_change
  after insert or update or delete on public.rules
  for each row execute function public.bump_policy_version();

-- ═════════════════════════════════════════════════════════════
-- FUNCTION: aggregate daily report
-- ═════════════════════════════════════════════════════════════

create or replace function public.aggregate_daily_report(
  p_family_id uuid,
  p_child_id uuid,
  p_date date
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_total int;
  v_blocked int;
  v_allowed int;
  v_request_access int;
  v_top_domains jsonb;
  v_top_categories jsonb;
begin
  select
    count(*),
    count(*) filter (where event_type = 'blocked'),
    count(*) filter (where event_type = 'allowed'),
    count(*) filter (where event_type = 'request_access')
  into v_total, v_blocked, v_allowed, v_request_access
  from public.events
  where family_id = p_family_id
    and (p_child_id is null or child_id = p_child_id)
    and created_at >= p_date
    and created_at < p_date + interval '1 day';

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into v_top_domains
  from (
    select domain, count(*) as count
    from public.events
    where family_id = p_family_id
      and (p_child_id is null or child_id = p_child_id)
      and event_type = 'blocked'
      and domain is not null
      and created_at >= p_date
      and created_at < p_date + interval '1 day'
    group by domain
    order by count desc
    limit 10
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into v_top_categories
  from (
    select category, count(*) as count
    from public.events
    where family_id = p_family_id
      and (p_child_id is null or child_id = p_child_id)
      and category is not null
      and created_at >= p_date
      and created_at < p_date + interval '1 day'
    group by category
    order by count desc
    limit 10
  ) t;

  insert into public.report_summaries
    (family_id, child_id, period, period_start, total_events, blocked_count, allowed_count, request_access_count, top_blocked_domains, top_categories, updated_at)
  values
    (p_family_id, p_child_id, 'daily', p_date, v_total, v_blocked, v_allowed, v_request_access, v_top_domains, v_top_categories, now())
  on conflict (family_id, child_id, period, period_start)
  do update set
    total_events = excluded.total_events,
    blocked_count = excluded.blocked_count,
    allowed_count = excluded.allowed_count,
    request_access_count = excluded.request_access_count,
    top_blocked_domains = excluded.top_blocked_domains,
    top_categories = excluded.top_categories,
    updated_at = now();
end;
$$;
