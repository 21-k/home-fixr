# Home Fixr

A social community platform for the skilled trades — senior plumbers, HVAC
technicians, and electricians mentor new entrants. Members ask questions, find
mentors, message each other, and team up on jobs. **Community, not a
marketplace** — no leads, invoicing, or payments.

Built with **Next.js 16 (App Router)**, **React 19**, **Tailwind CSS v4**, and
**Supabase** (Postgres + Auth + Row-Level Security).

> Note: this project runs a modified Next.js where **Middleware is renamed to
> Proxy** (`src/proxy.ts`). See `AGENTS.md`.

## Features

- **Auth** — email/password sign-up with a role picker (junior / senior),
  login, logout. A DB trigger creates the profile row on sign-up.
- **Community feed** — posts (questions / tips / discussions) with a composer,
  trade filters, and author info.
- **Question threads** — replies, accept-an-answer, mark-helpful, delete own.
- **Mentor directory** — browse seniors by trade / region / availability.
- **Profiles** — bio, stats, recent posts & answers; editable in Settings.
- **Mentorships** — juniors request, seniors accept/decline.
- **Job collabs** — post/browse collaboration gigs, express interest.
- **Follows, messaging, notifications** — social layer (requires migration 0002).
- **Search** across posts and members.

## Setup

### 1. Install

```bash
npm install
```

### 2. Environment

Create `.env.local` in the repo root (already git-ignored):

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Find these in Supabase → Project Settings → API (use the **anon/public** key).

### 3. Database

In the Supabase **SQL Editor**, run these **in order** (each is idempotent):

1. `supabase/schema.sql` — tables, RLS policies, and grants
2. `supabase/migrations/0001_app.sql` — signup/profile trigger, reply-count
   trigger, RPCs (accept/helpful/interest), `title` column
3. `supabase/migrations/0002_social.sql` — follows, messages, notifications
   (+ RLS, grants, notification triggers)
4. `supabase/seed.sql` — demo data (optional but recommended)

### 4. Disable email confirmation (dev)

Supabase → Authentication → Sign In / Providers → Email → turn **Confirm email
off**. This lets sign-up log you in instantly (and avoids the confirmation-email
rate limit during development).

### 5. Run

```bash
npm run dev
```

Open http://localhost:3000.

## Project structure

```
src/
  app/
    page.tsx              Landing
    join/  login/         Auth screens
    (app)/                Authenticated shell (header + nav)
      feed/  mentors/  collabs/  mentorships/  messages/
      notifications/  search/  settings/
      q/[id]/             Question thread
      u/[username]/       Profile
  components/             Avatar, PostCard, composers, buttons, header…
  lib/
    actions.ts            Server actions (posts, replies, mentorship, messages…)
    auth/                 signUp/signIn/signOut + session helper
    supabase/             Browser + server clients, and the Proxy session refresh
    types.ts  format.ts
  proxy.ts                Next.js 16 Proxy (session refresh — was "middleware")
supabase/
  schema.sql  migrations/0001_app.sql  migrations/0002_social.sql  seed.sql
```

## Deploy (Vercel)

1. Push this repo to GitHub.
2. Import it at vercel.com → New Project.
3. Add the two `NEXT_PUBLIC_SUPABASE_*` environment variables.
4. Deploy. (The Supabase project is already hosted; no extra backend needed.)

## Data model

`profiles` · `posts` · `replies` · `job_collabs` · `mentorships` ·
`follows` · `messages` · `notifications`. Every table has RLS: public read where
appropriate, writes scoped to the owning user; cross-owner actions (accept
answer, counters) go through `SECURITY DEFINER` RPCs.
