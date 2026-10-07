# UI issues: Home Fixr

Found by the Playwright suite in `e2e/` (local stack seeded with the 136 Founding accounts + 20
threads, plus local test members) and a logged-out, read-only crawl of https://www.home-fixr.com
at 1280x800 and 390x844. Branch `fix/ui-navigation`.

Severity: **High** = a core path is unusable for some visitors; **Medium** = wrong behaviour with
a workaround; **Low** = polish, accessibility, SEO.

"Red→green" means the covering test was run against the unfixed code and failed, then passed
after the fix (baseline run: 141 failed / 117 passed; final run: all pass).

Screenshots: `before/` = before fixes, `after/` = after fixes (local, both sizes).

| id | page | viewport | auth | what's wrong | severity | screenshot | status | covering test |
|---|---|---|---|---|---|---|---|---|
| UI-01 | every app page (header) | mobile | out + in | No mobile menu. The desktop nav row stayed at 390px and overflowed: Sign in / Join (logged out) and the bell, profile link and Log out (logged in) were pushed off-screen (to x=516-529px) and every app page scrolled sideways; "Home Fixr" wrapped onto two lines. | High | before/mobile-in-feed-viewport.png, before/mobile-out-mentors-viewport.png; after/mobile-in-feed-menu-open.jpg | fixed (red→green); live: pending deploy | `header-nav.spec.ts` "each header link lands on its page and is marked active", "sign in / join are reachable…", "account links are reachable…"; `public.spec.ts` / `app.spec.ts` route tests (fit-to-viewport) |
| UI-02 | /feed, /mentors, /collabs, /collabs/mine, /u/\*, /q/\*, /settings, /mentorships | < 1024px | out + in | Sidebar was `hidden lg:block` with no replacement: mentor trade / region / availability filters, feed trade filters, job-type filters, "My jobs", and the "All mentors" / "Back to feed" / "View my profile" links were unreachable on phones and tablets. | High | before/mobile-out-mentors.jpg; after/mobile-out-mentors-filters-open.jpg | fixed (red→green); live: pending deploy | `header-nav.spec.ts` "mentor filters are reachable…", "feed trade filters and job type filters…", "profile back links…", "thread back link…", "settings and messages back links" |
| UI-03 | /messages, /messages/[handle], /notifications, /settings, /welcome, /mentorships | all | out | Logged-out visits went to bare `/login` and signing in always landed on `/feed`, losing the page (e.g. a shared conversation link). The redirect was client-side (HTTP 200 + meta refresh) because `(app)/loading.tsx` streams first. /mentorships showed a sign-in prompt instead. | High | - | fixed (red→green); live: pending deploy | `auth-redirects.spec.ts` "… redirects to login (HTTP redirect, carries next=)" ×6, "login returns to the page you came from", "… deep link with a handle" |
| UI-04 | /login, /join | all | in | A signed-in member opening /login or /join got the form again instead of being sent on; password sign-in also skipped /welcome for members who never finished it. | Medium | - | fixed (red→green) | `auth-redirects.spec.ts` "/login and /join send an onboarded member to the feed", "/login?next= sends…", "… send them to /welcome" |
| UI-05 | /u/[missing], /q/[missing] | all | out + in | Unknown handles and thread slugs showed "Page not found" with **HTTP 200** (soft 404), because the group-level `loading.tsx` streamed before `notFound()`. Same cause made `/u/kash_sing` → `/u/Kash_sing` a client-side redirect. | Medium | before/desktop-out-notfound.jpg | fixed (red→green, also checked on `next build` + `next start`); live: pending deploy | `public.spec.ts` "a non-existent handle returns a real 404…", "a non-existent thread returns a real 404" |
| UI-06 | header, /search | mobile | out + in | Header search was `hidden md:block`, so phones couldn't search; /search's empty state pointed at "the search box above", which wasn't there. | Medium | before/mobile-out-search.jpg | fixed (red→green); live: pending deploy | `header-nav.spec.ts` "search is reachable from the header", "the search page has its own search box" |
| UI-07 | /u/[handle] "Recent answers" | all | out + in | Multi-line replies (Kash_sing's bullet lists) ran together into one paragraph. Now `whitespace-pre-line` with a 5-line clamp. | Medium | before/desktop-out-profile-Kash_sing.jpg; after/desktop-out-profile-Kash_sing.jpg | fixed (red→green); live: pending deploy | `profile.spec.ts` "multi-line answers keep their line breaks…" |
| UI-08 | in-page sign-in links | all | out | "Sign in to connect" (profile), "Sign in" (thread reply box, feed composer, My jobs, header), "Sign in to post" (jobs) all went to bare `/login`. | Medium | - | fixed (red→green); live: pending deploy | `auth-redirects.spec.ts` "in-page sign-in links carry the current page", "signing in from a profile's 'Sign in to connect' comes back to it" |
| UI-09 | /u/[handle] "Recent answers"; notification links | all | out + in | "Replied to …" links and reply notifications used `/q/<post uuid>`, a second URL for every thread. Profile links now use the slug and `/q/<uuid>` 307s to the slug. | Low | - | fixed (red→green) | `profile.spec.ts` "Recent answers link to the thread's canonical slug URL"; `app.spec.ts` "old /q/<post id> links … redirect to the slug URL" |
| UI-10 | header + sidebars | all | out + in | Active state was colour-only: no `aria-current`, no accessible name on the header nav, sidebar items were a `<div>` inside a `<Link>`. (Keyboard focus rings were already visible.) | Low | - | fixed (red→green) | `header-nav.spec.ts` active-state assertions, "the main nav is keyboard reachable with a visible focus ring" |
| UI-11 | /feed, /messages/[handle], /collabs/mine (logged out) | all | out + in | No `<h1>` on the feed, a conversation, or the logged-out My jobs prompt. | Low | - | fixed (red→green); live: pending deploy | `public.spec.ts` / `app.spec.ts` route tests (h1 visible) |
| UI-12 | every page | all | out + in | Every page except About used the home page's `<title>`; About's was doubled ("About · Home Fixr · Home Fixr"). | Low | - | fixed (red→green); live: pending deploy | `public.spec.ts` "every page has its own document title" |
| UI-13 | /auth/callback | all | out | `next` was appended to the origin unchecked (`${origin}${next}`), so `?next=@evil.example` would send a Google sign-in to `https://www.home-fixr.com@evil.example` (open redirect). Now `safeNext()`. | Medium (security) | - | fixed; **not red-first at route level** (needs a real Google OAuth code); the helper is unit-tested | `tests/next_path.test.mjs`; `auth-redirects.spec.ts` "next= cannot send you off-site" (password login path; it passed before too, since login ignored `next` then) |
| UI-14 | /messages/[handle], /q/\*, post/collab cards | all | in (out for viewing) | Long unbroken text (a URL) was clipped inside the message bubble list, and in a post widened the page to 1356px at a 390px viewport (1657px at 1280). Now `wrap-anywhere`. | Medium | - | fixed (red→green, found after the fit check learned to measure text nodes) | `founding.spec.ts` "a long unbroken message wraps inside the bubble"; `app.spec.ts` "a post with a long unbroken URL doesn't push the page sideways" |
| UI-15 | feed / thread | all | out + in | "1 replies". | Low | - | fixed (red→green); live: pending deploy | `public.spec.ts` "reply counts are pluralised correctly" |

## Live crawl (https://www.home-fixr.com, logged out, production `main` = before these fixes)

- Desktop: 338 pages (every internal link reachable from the public pages: 136 profiles, 20 threads,
  every filter combination, about/login/join), all HTTP 200, no console errors, no hydration
  warnings, no failed requests, nothing past the viewport edge. See `live/desktop.md`.
- Mobile: same 338 pages, 333 with the UI-01 header overflow (horizontal scroll). The 5 without it
  are pages with no app header: /, /about, /login, /join, and /messages (which redirects to
  /login). See `live/mobile.md`, `live/sample-mobile-feed.jpg`, `live/sample-mobile-mentors.jpg`
  (all per-page live screenshots are in the gitignored `live/desktop/` and `live/mobile/`).
- Live `@public` test failures (61 of 116; the other 54 pass, 1 skipped) all map to UI-01, 02, 03,
  05, 06, 07, 09, 10, 11 and 12, and are the same tests that failed locally
  before the fixes and pass locally after them: **fixed on branch, pending deploy**. No failure is
  live-only. (UI-15 has no thread with exactly one reply live, so it can't show there yet.)
- Local crawl of the fixed branch (`CRAWL=1`): 340 pages per size, 0 problems
  (`local-crawl/` is gitignored; the 2 extra pages are local-only demo members' content).
- Not checkable live: logged-in pages (production is read-only for testing) and the 404 status of
  missing handles, which needs the deploy.
