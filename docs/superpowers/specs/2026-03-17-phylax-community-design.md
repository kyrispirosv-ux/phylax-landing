# Phylax Community Platform Design

## Overview

A social community layer within the Phylax parent web app (dashboard) that lets parents communicate, share safety rules, and build trust in the platform. Functions as a social blog where parents exchange experiences and collectively improve child safety configurations.

**Core value:** Trust. Parents trusting the platform and each other.

## Architecture

- **Location:** New routes within the existing dashboard app at `/phylax-landing/dashboard/src/app/dashboard/community/...` (under the existing `/dashboard` auth layout to inherit auth guards and the `DashboardShell`)
- **Database:** Extend existing Supabase project with new community tables in the `public` schema. Extend `database.ts` types file with all new tables.
- **Auth:** Shared with existing parent auth — all community features require authenticated parent
- **Privacy:** No child data or browsing history ever touches community tables. Rule aggregation is anonymized via hashing/normalization.

## Data Model

### `community_posts`
The social feed. Parents share experiences, questions, and rule configurations.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| author_id | uuid FK parents.id | |
| category | enum | social_media, gaming, content, grooming, general |
| title | text | |
| body | text | |
| is_anonymous | boolean | Default false |
| rule_snapshot | jsonb | Sanitized rule config — see Rule Snapshot Schema below |
| status | enum | active, hidden, removed. Default active |
| upvotes | int | Denormalized count, default 0 |
| downvotes | int | Denormalized count, default 0 |
| comment_count | int | Denormalized, default 0 |
| pinned | boolean | Default false |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `community_comments`
Threaded replies on posts.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| post_id | uuid FK community_posts.id | |
| author_id | uuid FK parents.id | |
| parent_comment_id | uuid FK self | Nullable, for threading |
| body | text | |
| is_anonymous | boolean | Default false |
| status | enum | active, hidden, removed. Default active |
| upvotes | int | Denormalized, default 0 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `community_votes`
Tracks who voted on what. Prevents double-voting.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK parents.id | |
| target_type | enum | post, comment |
| target_id | uuid | |
| value | smallint | +1 or -1 |
| created_at | timestamptz | |

Unique constraint on `(user_id, target_type, target_id)`.

### `community_presets`
Shareable safety profiles.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| author_id | uuid FK parents.id | |
| name | text | e.g. "Strict preset for ages 8-12" |
| description | text | |
| age_range | text | e.g. "8-12" |
| tier | profile_tier enum | Reuses existing `profile_tier` enum: kid_10, tween_13, teen_16 |
| rules | jsonb | Array of sanitized rule configs — see Rule Snapshot Schema |
| adoption_count | int | Default 0 |
| rating_avg | numeric(3,2) | Default 0 |
| rating_count | int | Default 0 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `community_preset_reviews`
Ratings and reviews for presets.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| preset_id | uuid FK community_presets.id | |
| author_id | uuid FK parents.id | |
| rating | smallint | 1-5 |
| body | text | |
| created_at | timestamptz | |

Unique constraint on `(preset_id, author_id)` — one review per parent per preset.

### `community_reports`
Content moderation reports.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| reporter_id | uuid FK parents.id | |
| target_type | enum | post, comment, preset |
| target_id | uuid | |
| reason | text | |
| status | enum | pending, reviewed, dismissed |
| created_at | timestamptz | |

Unique constraint on `(reporter_id, target_type, target_id)` — one report per parent per target.

### `community_rule_stats`
Aggregated, anonymized rule popularity. Populated by scheduled cron job (Next.js API route at `/api/cron/community-aggregate`), consistent with existing `/api/cron/aggregate` pattern.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| rule_text_hash | text | SHA-256 of normalized rule text |
| rule_text_normalized | text | Human-readable normalized rule |
| category | text | |
| adoption_count | int | Families using this rule |
| effectiveness_score | numeric | `blocked_count_30d / adoption_count` — higher = more effective per family |
| blocked_count_30d | int | Blocked interactions last 30 days |
| updated_at | timestamptz | |

## Rule Snapshot Schema

When rules are shared in posts or presets, they are **sanitized** — all identifying fields stripped. Only these fields are stored:

```json
{
  "text": "Block gambling sites on YouTube",
  "scope": "site | content",
  "target": "youtube.com | null"
}
```

Fields explicitly **excluded**: `id`, `family_id`, `child_id`, `created_by`. The sanitization happens server-side in the API route before insertion — never trust the client.

## Routes

All routes live under `/dashboard/community/` to inherit the existing auth layout.

| Route | Purpose |
|-------|---------|
| `/dashboard/community` | Main feed — social blog, sorted by trending/new/top |
| `/dashboard/community/post/[id]` | Single post with threaded comments |
| `/dashboard/community/create` | Create new post with optional rule attachment |
| `/dashboard/community/leaderboard` | Popular rules ranked by adoption + effectiveness |
| `/dashboard/community/presets` | Browsable safety profiles |
| `/dashboard/community/presets/[id]` | Preset detail with reviews + adopt button |
| `/dashboard/community/profile` | Your posts, presets, activity |

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/community/posts` | GET, POST | List/create posts (sanitizes rule_snapshot server-side) |
| `/api/community/posts/[id]` | GET, PATCH, DELETE | Get/update/soft-delete post |
| `/api/community/posts/[id]/comments` | GET, POST | List/create comments on a post |
| `/api/community/vote` | POST | Toggle vote (upsert/delete). Uses DB function for atomic count update |
| `/api/community/report` | POST | File a content report |
| `/api/community/presets` | GET, POST | List/create presets |
| `/api/community/presets/[id]` | GET | Get preset detail |
| `/api/community/presets/[id]/adopt` | POST | Adopt preset rules into family |
| `/api/community/presets/[id]/review` | POST | Rate/review a preset |
| `/api/community/leaderboard` | GET | Get aggregated rule stats |
| `/api/cron/community-aggregate` | POST | Cron job: aggregate rule stats |

## Components

| Component | Purpose |
|-----------|---------|
| `CommunityNav` | Tab navigation: Feed / Leaderboard / Presets |
| `PostCard` | Post preview: votes, comments, category badge, anon indicator |
| `PostFeed` | Cursor-based infinite scroll feed with category filters + sort |
| `CommentThread` | Nested comments with vote buttons |
| `VoteButton` | Optimistic UI upvote/downvote |
| `RuleLeaderboard` | Ranked rules with adoption counts + effectiveness bars |
| `PresetCard` | Preset preview: age range, star rating, adopt button |
| `CreatePostForm` | Rich text, category picker, anonymous toggle, rule attachment |
| `ReportModal` | Flag content for moderation |

## Database Functions & Triggers

### `community_toggle_vote(p_user_id uuid, p_target_type text, p_target_id uuid, p_value smallint)`
Postgres function that atomically:
1. Checks if vote exists for this user/target
2. If same value: removes vote, decrements count
3. If different value: updates vote, adjusts counts
4. If no vote: inserts vote, increments count

### `community_check_reports()` trigger
Trigger on `community_reports` INSERT that:
1. Counts reports for the target
2. If count >= 3, sets `status = 'hidden'` on the target post/comment

## Key Behaviors

### Anonymous Posting
- When `is_anonymous=true`, author displayed as "A Phylax Parent"
- `author_id` still stored for moderation but never exposed to other users
- Implemented via Postgres views (`community_posts_public`, `community_comments_public`) that return `null` for `author_id` when `is_anonymous = true`. All client reads go through these views.

### Rule Aggregation
- Next.js API cron route (`/api/cron/community-aggregate`) runs daily
- Hashes + normalizes rule text across all families
- Normalizes by lowercasing, stripping extra whitespace, removing family-specific details
- Aggregates counts into `community_rule_stats`
- No family/child identifiers ever included
- Highly specific rules (containing usernames, specific URLs beyond domain) are excluded from aggregation

### One-Click Adopt
- From leaderboard or presets, "Add to my rules" inserts into family's `rules` table
- Shows preview of what will be added before confirming
- Adopted rules include `text`, `scope`, and `target` matching the existing `rules` table schema

### Voting
- Optimistic UI updates
- Server-side via `community_toggle_vote` Postgres function for atomicity
- Toggling a vote removes it; switching direction updates in place

### Pagination
- Cursor-based pagination using `(created_at, id)` for feeds
- Prevents duplicate items when new content is inserted during scrolling

### Moderation
- Any parent can report content (one report per target per parent)
- Content auto-hidden after 3+ reports via trigger until reviewed
- Admin moderation interface to be added later
- Hidden/removed content excluded from feeds by default

### Dashboard Shell Integration
- Add "Community" to `NAV_ITEMS` in `shell.tsx`
- Update the `slice(0, 7)` limit to accommodate the new nav item

### Row Level Security
- Community posts/comments: readable by all authenticated parents (via public views for anonymous safety), writable only by author
- Votes: writable only by voter, not directly readable (exposed only as counts)
- Reports: writable by reporter, readable only by admins
- Rule stats: readable by all authenticated parents, writable only by service role (cron job)

## Design Principles
- Dark/minimal aesthetic matching existing Phylax UI
- Trust signals throughout: verified parent badges, moderation indicators, privacy callouts
- Mobile-responsive
- Privacy-first: no identifying child info in any community feature
