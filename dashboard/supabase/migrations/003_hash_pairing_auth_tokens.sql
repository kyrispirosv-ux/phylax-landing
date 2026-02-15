-- Phylax Dashboard — Migration 003
-- Hash pairing codes (never store raw), add device auth tokens, add device unpair support

-- ═════════════════════════════════════════════════════════════
-- PAIRING TOKENS: store hashes instead of raw values
-- ═════════════════════════════════════════════════════════════

-- Change short_code from char(6) to text so we can store SHA-256 hex hashes
alter table public.pairing_tokens alter column short_code type text;
alter table public.pairing_tokens alter column secret type text;

-- Rename to make intent clear
alter table public.pairing_tokens rename column secret to secret_hash;
alter table public.pairing_tokens rename column short_code to short_code_hash;

-- Rebuild indexes for hash-based lookups
drop index if exists idx_pairing_tokens_short_code;
drop index if exists idx_pairing_tokens_secret;
create index idx_pairing_tokens_short_code_hash on public.pairing_tokens (short_code_hash) where used_at is null;
create index idx_pairing_tokens_secret_hash on public.pairing_tokens (secret_hash) where used_at is null;

-- ═════════════════════════════════════════════════════════════
-- DEVICES: add auth_token_hash for session tokens
-- ═════════════════════════════════════════════════════════════

alter table public.devices add column auth_token_hash text;
create index idx_devices_auth_token on public.devices (auth_token_hash) where auth_token_hash is not null;

-- ═════════════════════════════════════════════════════════════
-- CLEANUP: function to purge expired pairing tokens + old attempts
-- ═════════════════════════════════════════════════════════════

create or replace function public.cleanup_expired_pairing_tokens()
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  deleted_count int;
begin
  -- Delete expired unused tokens older than 1 hour
  delete from public.pairing_tokens
  where used_at is null
    and expires_at < now() - interval '1 hour';
  get diagnostics deleted_count = row_count;

  -- Delete pairing attempts older than 24 hours
  delete from public.pairing_attempts
  where created_at < now() - interval '24 hours';

  return deleted_count;
end;
$$;
