import { test, expect, visit, expectFitsViewport } from "./support/fixtures";
import { rest, restPatch } from "./support/db";
import { IS_LIVE } from "./support/env";
import { FOUNDING } from "./support/routes";
import { USERS, storageStatePath } from "./support/users";

// The external review's copy and the authorship labels (review-changes pass).
// Logged-out checks are @public (safe on production); the rest are local.

// Post-level "Team-written example" labels were removed (Oct 2026). What
// discloses the example profiles now: the HF Community badge (linking to the
// About explanation) next to their names, and the About sentence.
const BADGE = "HF Community";
const badge = (scope: import("@playwright/test").Locator) => scope.getByRole("link", { name: BADGE });
const NO_LABEL = /Team-written example/;
const isDesktop = () => test.info().project.name === "desktop";

const HERO_COPY =
  "Home Fixr connects apprentices and early-career electricians, plumbers, and HVAC technicians with experienced tradespeople. Find a mentor, explore ride-along opportunities, and ask questions in the community.";
const RIDE_ALONG_COPY =
  "Mentors can post ride-along opportunities, and tradespeople can find collaborators for a job. Apply with a short introduction and attach a resume if you have one.";
const EMPTY_COPY =
  "No active opportunities available. Mentors can post a ride-along or collaboration; apprentices can browse when opportunities become available.";

async function bodyText(page: import("@playwright/test").Page) {
  return page.locator("body").innerText();
}

test.describe("homepage @public", () => {
  test("headline, supporting copy, CTAs and tagline", async ({ page }) => {
    await visit(page, "/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find a mentor in your trade.");
    await expect(page.getByText(HERO_COPY)).toBeVisible();
    const ctas = page.getByTestId("hero-ctas");
    await expect(ctas.getByRole("link", { name: "Find a mentor" })).toHaveAttribute("href", "/mentors");
    await expect(ctas.getByRole("link", { name: "Become a mentor" })).toHaveAttribute("href", "/join?role=mentor");
    await expect(ctas.getByRole("link", { name: "Browse the community" })).toHaveAttribute("href", "/feed");
    await expect(page.getByText("Built for people starting out in the skilled trades.").first()).toBeVisible();
    const text = await bodyText(page);
    expect(text).not.toMatch(/vocational schools/i);
    expect(text).not.toMatch(/mentor matching/i);
    expect(text).not.toMatch(/\byrs\b/);
    expect(text).not.toMatch(/\b(junior|senior pro)s?\b/i);
    // No registration / member totals on the marketing page.
    expect(text).not.toMatch(/\b\d[\d,]*\+?\s+(members|registered|apprentices|mentors|tradespeople)\b/i);
    await expectFitsViewport(page);
  });

  test("features run Mentor directory, Ride-alongs and collaborations, Community feed", async ({ page }) => {
    await visit(page, "/");
    const eyebrows = await page.locator("#features section span.uppercase").allInnerTexts();
    expect(eyebrows.slice(0, 3).map((e) => e.toLowerCase())).toEqual([
      "mentor directory",
      "ride-alongs and collaborations",
      "community feed",
    ]);
    await expect(page.getByText(RIDE_ALONG_COPY)).toBeVisible();
    await expect(page.getByText("Browse mentors by trade and region, then send a mentorship request.", { exact: false })).toBeVisible();
  });

  test("Become a mentor opens the join form with the mentor role picked", async ({ page }) => {
    test.skip(IS_LIVE, "the role preselect ships with this change");
    await visit(page, "/");
    await page.getByTestId("hero-ctas").getByRole("link", { name: "Become a mentor" }).click();
    await expect(page).toHaveURL(/\/join\?role=mentor$/);
    await expect(page.getByRole("button", { name: /I'm a mentor/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /I'm an apprentice/ })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("Joining as a mentor")).toBeVisible();
  });
});

test.describe("HF Community badge on team-written content @public", () => {
  test("seeded feed cards carry the badge; no post-level label anywhere", async ({ page }) => {
    await visit(page, "/feed");
    const founding = page.getByTestId("post-card").filter({ has: badge(page) });
    expect(await founding.count()).toBeGreaterThan(3);
    await expect(badge(founding.first())).toHaveAttribute("href", "/about#founding-community");
    expect(await bodyText(page)).not.toMatch(NO_LABEL);
    await expectFitsViewport(page);
  });

  test("a seeded thread: badge on the post and replies, no post-level label", async ({ page }) => {
    await visit(page, "/feed");
    const card = page.getByTestId("post-card").filter({ has: badge(page) }).filter({ hasNotText: /\b0 replies\b/ }).first();
    const href = await card.locator('a[href^="/q/"]').first().getAttribute("href");
    await visit(page, href!);
    await expect(badge(page.getByTestId("thread-post")).first()).toBeVisible();
    expect(await page.getByTestId("reply").filter({ has: badge(page) }).count()).toBeGreaterThan(0);
    expect(await bodyText(page)).not.toMatch(NO_LABEL);
    await expectFitsViewport(page);
  });
});

test.describe("a real member's post and reply carry no HF Community badge (local)", () => {
  test.use({ storageState: storageStatePath("junior") });

  test("feed card, thread post, reply and profile show no badge", async ({ page }) => {
    const tag = test.info().project.name;
    const title = `Real member label check ${tag}`;
    const replyText = `Real member reply ${tag}`;
    await visit(page, "/feed");
    await page.getByPlaceholder("Got a question? Ask the community.").fill(title);
    await page.getByPlaceholder("Share the details so people can actually help…").fill("Checking the label stays off real posts.");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    const card = page.getByTestId("post-card").filter({ hasText: title });
    await expect(card).toBeVisible();

    // Server state: the post exists, by a non-founding member, with no seed batch.
    const [row] = await rest<{ id: string; slug: string; seed_batch_id: string | null; author: { is_founding_member: boolean } }[]>(
      `posts?select=id,slug,seed_batch_id,author:profiles(is_founding_member)&title=eq.${encodeURIComponent(title)}&order=created_at.desc&limit=1`,
    );
    expect(row.seed_batch_id).toBeNull();
    expect(row.author.is_founding_member).toBe(false);

    try {
      await page.reload();
      await expect(card).toBeVisible();
      await expect(badge(card)).toHaveCount(0);
      // ...while the seeded cards on the same page keep theirs.
      await expect(badge(page.locator("main")).first()).toBeVisible();

      await visit(page, `/q/${row.slug}`);
      await expect(badge(page.getByTestId("thread-post"))).toHaveCount(0);
      await page.getByPlaceholder("Share what you'd do…").fill(replyText);
      await page.getByRole("button", { name: "Post reply" }).click();
      const reply = page.getByTestId("reply").filter({ hasText: replyText });
      await expect(reply).toBeVisible();
      await page.reload();
      await expect(reply).toBeVisible();
      await expect(badge(reply)).toHaveCount(0);

      await visit(page, `/u/${USERS.junior.handle}`);
      await expect(page.getByTestId("post-card").filter({ hasText: title })).toBeVisible();
      await expect(badge(page.locator("main"))).toHaveCount(0);
    } finally {
      // Clean up through the app's own delete (cascades the reply).
      await visit(page, `/q/${row.slug}`);
      await page.getByTestId("thread-post").getByRole("button", { name: "Delete" }).click();
      await expect
        .poll(async () => (await rest<unknown[]>(`posts?select=id&id=eq.${row.id}`)).length)
        .toBe(0);
    }
  });
});

test.describe("feed sidebar, signed out @public", () => {
  test("Explore mentors and Topics to explore", async ({ page }) => {
    test.skip(!isDesktop(), "the right rail shows from 1280px (xl) up");
    await visit(page, "/feed");
    await expect(page.getByRole("link", { name: /Explore mentors/ })).toHaveAttribute("href", "/mentors");
    await expect(page.getByRole("heading", { name: "Topics to explore" })).toBeVisible();
    const text = await bodyText(page);
    expect(text).not.toMatch(/Trending in NJ|Your mentors/);
    await page.getByRole("link", { name: "Permits and inspections" }).click();
    await expect(page).toHaveURL(/\/search\?q=permit$/);
  });
});

test.describe("mentor directory @public", () => {
  test("title, availability labels, filters and the self-reported note", async ({ page }) => {
    await visit(page, "/mentors");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find a mentor");
    await expect(page.getByTestId("self-reported-note")).toHaveText(
      "Licenses, credentials and experience are self-reported by members and not verified by Home Fixr.",
    );
    const filters = isDesktop() ? page.locator("aside").first() : page.getByTestId("mobile-sidebar");
    if (!isDesktop()) await filters.locator("summary").click();
    await expect(filters.getByRole("link", { name: "Accepting mentorship requests" })).toBeVisible();
    await expect(filters.getByRole("link", { name: "Open to messages" })).toBeVisible();
    await expect(filters.getByRole("link", { name: "Open to hosting ride-alongs" })).toBeVisible();
    const text = await bodyText(page);
    expect(text).toMatch(/Limited availability|Not accepting mentorship requests|Accepting mentorship requests/);
    expect(text).not.toMatch(/Accepting mentees|Not taking mentees|Senior pros/);
    // Headlines read "· 28 years" (bios are member voice and may say "yrs").
    expect(text).not.toMatch(/· \d+ yrs?\b|\b1 years\b/);
    expect(text).toMatch(/· \d+ years? ·/);
    expect(text).not.toMatch(/\bverified\b(?! by Home Fixr)/i);
    await expectFitsViewport(page);
  });

  test("a Founding mentor's profile: availability label, self-reported note, HF Community badge, no yellow notice", async ({ page }) => {
    await visit(page, `/u/${FOUNDING.senior}`);
    await expect(page.getByText(/^(Accepting mentorship requests|Limited availability|Not accepting mentorship requests)$/)).toBeVisible();
    await expect(page.getByTestId("self-reported-note")).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: "HF Community" }).first()).toBeVisible();
    await expect(page.getByText(/This is an example profile prepared by the Home Fixr team/)).toHaveCount(0);
    const text = await bodyText(page);
    expect(text).not.toMatch(/\byrs\b|Mentoring:|collabs posted/);
    await expectFitsViewport(page);
  });

  test("no '1 yrs' anywhere years render", async ({ page }) => {
    // Interface headlines ("Title · N years · Region"); member post and bio
    // text is their own voice and isn't rewritten.
    for (const route of ["/", "/feed", "/mentors", `/u/${FOUNDING.senior}`, `/u/${FOUNDING.junior}`, "/search?q=pex"]) {
      await visit(page, route);
      const text = await bodyText(page);
      expect(text, route).not.toMatch(/· \d+ yrs?\b|\b1 years\b/);
    }
    // A 1-year member renders "1 year".
    if (IS_LIVE) return;
    const [one] = await rest<{ username: string }[]>("profiles?select=username&years_experience=eq.1&limit=1");
    if (one) {
      await visit(page, `/u/${one.username}`);
      await expect(page.getByText(/· 1 year(?!s)/).first()).toBeVisible();
    }
  });
});

test.describe("ride-alongs and collaborations @public", () => {
  test("title, nav label and the Apprentice ride-along filter", async ({ page }) => {
    await visit(page, "/collabs");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ride-alongs and collaborations");
    await expect(page).toHaveTitle(/^Ride-alongs and collaborations · Home Fixr$/);
    const filters = isDesktop() ? page.locator("aside").first() : page.getByTestId("mobile-sidebar");
    if (!isDesktop()) await filters.locator("summary").click();
    await expect(filters.getByRole("link", { name: "Apprentice ride-along" })).toBeVisible();
    const text = await bodyText(page);
    expect(text).not.toMatch(/Junior ride-along|Job collabs|\bCV\b/);
  });
});

test.describe("ride-alongs empty state (local)", () => {
  test("a filter with no open items shows the empty-state copy", async ({ page }) => {
    // Fills the open specialist collabs for a moment, so run it once.
    test.skip(!isDesktop(), "mutates shared rows; desktop only");
    const open = await rest<{ id: string }[]>("job_collabs?select=id&type=eq.specialist&filled_at=is.null");
    try {
      if (open.length) {
        await restPatch(`job_collabs?id=in.(${open.map((o) => o.id).join(",")})`, { filled_at: new Date().toISOString() });
      }
      expect(await rest<unknown[]>("job_collabs?select=id&type=eq.specialist&filled_at=is.null")).toEqual([]);
      await visit(page, "/collabs?type=specialist&status=open");
      await expect(page.getByTestId("collabs-empty")).toHaveText(EMPTY_COPY);
      await expect(page.getByTestId("collab-card")).toHaveCount(0);
      // The same filter with filled items included still lists them.
      await visit(page, "/collabs?type=specialist");
      await expect(page.getByTestId("collab-card").first()).toBeVisible();
    } finally {
      if (open.length) {
        await restPatch(`job_collabs?id=in.(${open.map((o) => o.id).join(",")})`, { filled_at: null });
      }
    }
    expect(await rest<unknown[]>("job_collabs?select=id&type=eq.specialist&filled_at=is.null")).toHaveLength(open.length);
  });
});

test.describe("About / FAQ disclosure @public", () => {
  test("carries the disclosure sentence and shows the badge", async ({ page }) => {
    await visit(page, "/about");
    await expect(page.getByText(/^Some early discussions and example profiles were prepared by the Home Fixr team with AI assistance/)).toBeVisible();
    await expect(page.getByText("HF Community profiles are not real members and can't be messaged.", { exact: false })).toBeVisible();
    await expect(badge(page.locator("main")).first()).toBeVisible();
    expect(await bodyText(page)).not.toMatch(NO_LABEL);
    expect(await bodyText(page)).not.toMatch(/licence|judgement/i);
  });
});
