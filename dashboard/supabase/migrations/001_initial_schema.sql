-- Phylax Dashboard — Initial Schema
-- Run this in your Supabase SQL editor or via supabase db push

-- ═════════════════════════════════════════════════════════════
-- FAMILIES
-- ═════════════════════════════════════════════════════════════

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Family',
  created_at timestamptz not null default now()
);

alter table public.families enable row level security;

-- ═════════════════════════════════════════════════════════════
-- PARENTS (linked to Supabase Auth users)
-- ═════════════════════════════════════════════════════════════

create type public.parent_role as enum ('owner', 'co_parent', 'viewer');

create table public.parents (
  id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  display_name text not null default '',
  role public.parent_role not null default 'owner',
  created_at timestamptz not null default now()
);

alter table public.parents enable row level security;

-- ═════════════════════════════════════════════════════════════
-- CHILD PROFILES
-- ═════════════════════════════════════════════════════════════

create type public.profile_tier as enum ('kid_10', 'tween_13', 'teen_16');

create table public.children (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  age smallint,
  tier public.profile_tier not null default 'tween_13',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.children enable row level security;

-- ═════════════════════════════════════════════════════════════
-- DEVICES (registered child devices)
-- ═════════════════════════════════════════════════════════════

create type public.device_platform as enum ('chrome', 'ios', 'android');
create type public.device_status as enum ('active', 'inactive', 'pending');

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  platform public.device_platform not null default 'chrome',
  device_name text not null default '',
  extension_version text,
  pairing_code text unique,
  status public.device_status not null default 'pending',
  last_heartbeat timestamptz,
  created_at timestamptz not null default now()
);

alter table public.devices enable row level security;

-- ═════════════════════════════════════════════════════════════
-- RULES (parent-defined safety rules — synced to extension)
-- ═════════════════════════════════════════════════════════════

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade, -- null = applies to all children
  text text not null,                    -- NL rule text ("block gambling")
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_by uuid references public.parents(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rules enable row level security;

-- ═════════════════════════════════════════════════════════════
-- ALERTS (parent notifications — grooming, threats, etc.)
-- ═════════════════════════════════════════════════════════════

create type public.alert_severity as enum ('info', 'warning', 'critical');

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  alert_type text not null,              -- 'CHAT_THREAT', 'CONTENT_BLOCK', etc.
  severity public.alert_severity not null default 'warning',
  title text not null,
  body text,
  url text,
  domain text,
  reason_code text,
  confidence real,
  evidence jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.alerts enable row level security;

-- ═════════════════════════════════════════════════════════════
-- DECISION LOG (anonymized — no raw content stored)
-- ═════════════════════════════════════════════════════════════

create table public.decision_log (
  id bigint generated always as identity primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  action text not null,                  -- ALLOW, BLOCK, LIMIT
  reason_code text,
  domain text,
  confidence real,
  topic_scores jsonb,
  created_at timestamptz not null default now()
);

alter table public.decision_log enable row level security;

-- Partition-friendly index for time-series queries
create index idx_decision_log_family_time on public.decision_log (family_id, created_at desc);
create index idx_alerts_family_time on public.alerts (family_id, created_at desc);
create index idx_rules_family on public.rules (family_id);
create index idx_children_family on public.children (family_id);
create index idx_devices_child on public.devices (child_id);
create index idx_devices_pairing on public.devices (pairing_code) where pairing_code is not null;

-- ═════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY POLICIES
-- ═════════════════════════════════════════════════════════════

-- Parents can only see their own family's data
create policy "parents_own_family" on public.families
  for all using (id in (select family_id from public.parents where id = auth.uid()));

create policy "parents_own_record" on public.parents
  for all using (id = auth.uid());

create policy "children_own_family" on public.children
  for all using (family_id in (select family_id from public.parents where id = auth.uid()));

create policy "devices_own_family" on public.devices
  for all using (family_id in (select family_id from public.parents where id = auth.uid()));

create policy "rules_own_family" on public.rules
  for all using (family_id in (select family_id from public.parents where id = auth.uid()));

create policy "alerts_own_family" on public.alerts
  for all using (family_id in (select family_id from public.parents where id = auth.uid()));

create policy "decision_log_own_family" on public.decision_log
  for all using (family_id in (select family_id from public.parents where id = auth.uid()));

-- ═════════════════════════════════════════════════════════════
-- TRIGGER: auto-create family + parent on signup
-- ═════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  new_family_id uuid;
begin
  -- Create a family for the new user
  insert into public.families (name)
  values (coalesce(new.raw_user_meta_data ->> 'family_name', 'My Family'))
  returning id into new_family_id;

  -- Create the parent record
  insert into public.parents (id, family_id, display_name, role)
  values (
    new.id,
    new_family_id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'owner'
  );

  -- Create a default child profile
  insert into public.children (family_id, name, tier)
  values (new_family_id, 'My Child', 'tween_13');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
