# UI issues: Home Fixr

Found by the Playwright suite in `e2e/` (local stack seeded with the 136 Founding accounts + 20
threads, plus local test members) and a logged-out, read-only crawl of https://www.home-fixr.com.
Severity: **High** = a core path is unusable for some visitors; **Medium** = wrong behaviour with a
workaround; **Low** = polish / accessibility / SEO.

Screenshots: `e2e/reports/before/` (before fixes), `e2e/reports/after/` (after fixes).

| id | page | viewport | auth | what's wrong | severity | screenshot | status |
|---|---|---|---|---|---|---|---|
| UI-01 | every app page (header) | mobile | out + in | No mobile menu. The desktop nav row is kept at 390px and overflows: Sign in / Join (logged out) and the bell, profile link and Log out (logged in) are pushed off-screen to x=529px, and every app page scrolls sideways. "Home Fixr" wraps onto two lines. | High | before/mobile-in-feed-viewport.png, before/mobile-out-mentors-viewport.png | open |
| UI-02 | /feed, /mentors, /collabs, /collabs/mine, /u/*, /q/*, /settings, /mentorships | < 1024px | out + in | The sidebar is `hidden lg:block` with no replacement, so below 1024px the mentor trade / region / availability filters, the feed trade filters, the job-type filters, "My jobs", and the "All mentors" / "Back to feed" / "View my profile" links are unreachable. | High | before/mobile-out-mentors.jpg | open |
| UI-03 | /messages, /messages/[handle], /notifications, /settings, /welcome, /mentorships | all | out | A logged-out visit sends you to `/login` with no return path, and signing in always lands on `/feed`, so a shared link to a conversation or notifications is lost. The redirect is also client-side (HTTP 200 + meta refresh) because `(app)/loading.tsx` starts streaming first. /mentorships showed a sign-in prompt instead. | High | - | open |
| UI-04 | /login, /join | all | in | A signed-in member who opens /login or /join sees the sign-in / sign-up form again instead of being sent on (to `next`, `/feed`, or `/welcome` if they haven't onboarded). Password sign-in also skips `/welcome` for members who never finished it. | Medium | - | open |
| UI-05 | /u/[missing], /q/[missing] | all | out + in | Unknown handles and thread slugs render "Page not found" but with **HTTP 200** (soft 404), because `(app)/loading.tsx` streams before `notFound()` runs. Same cause makes `/u/kash_sing` -> `/u/Kash_sing` a client-side redirect. | Medium | before/desktop-out-notfound.jpg | open |
| UI-06 | header, /search | mobile | out + in | The header search box is `hidden md:block`, so phones have no way to search; /search's empty state says "Type a query in the search box above" but there is no box on the page. | Medium | before/mobile-out-search.jpg | open |
| UI-07 | /u/[handle] "Recent answers" | all | out + in | Multi-line replies (e.g. Kash_sing's bullet lists) run together into one paragraph ("…before deciding: - Your take-home now … - Months of savings…"). | Medium | before/desktop-out-profile-Kash_sing.jpg | open |
| UI-08 | in-page sign-in links | all | out | "Sign in to connect" (profile), "Sign in to add your reply" (thread), "Sign in to post" (jobs), "Sign in" (My jobs, feed composer, header) all go to bare `/login`, so you land on /feed after signing in instead of back where you were. | Medium | - | open |
| UI-09 | /u/[handle] "Recent answers" | all | out + in | "Replied to …" links use `/q/<post uuid>` instead of the thread's slug URL (works via a fallback, but every profile emits non-canonical thread links). | Low | - | open |
| UI-10 | header + sidebars | all | out + in | Active state is colour-only: no `aria-current="page"` on the header nav or sidebar links, the header nav has no accessible name, and sidebar items are a `<div>` inside a `<Link>`. | Low | - | open |
| UI-11 | /feed, /messages/[handle], /collabs/mine (logged out) | all | out + in | No `<h1>` on the feed, a conversation, or the logged-out My jobs prompt. | Low | - | open |
| UI-12 | every page | all | out + in | Every page except About shares the home page's `<title>`; About's is doubled: "About · Home Fixr · Home Fixr". | Low | - | open |
| UI-13 | /auth/callback | all | out | `next` is appended to the origin unchecked (`${origin}${next}`), so `?next=@evil.example` becomes `https://www.home-fixr.com@evil.example`: an open redirect after Google sign-in. Found while wiring `next` through login. | Medium (security) | - | open |
