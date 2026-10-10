import { test, expect, visit, expectFitsViewport } from "./support/fixtures";
import { profileId, rest } from "./support/db";
import { FOUNDING } from "./support/routes";
import { USERS, storageStatePath } from "./support/users";

// The old yellow example-profile notice was removed (Oct 2026); the HF Community
// badge (linking to the About explanation) is what remains on these profiles.
const NOTICE = /This is an example profile prepared by the Home Fixr team/;
const BADGE = "HF Community";

async function expectNoContactControls(page: import("@playwright/test").Page) {
  const main = page.locator("main");
  await expect(main.getByRole("link", { name: /Send a message|^Message$/ })).toHaveCount(0);
  await expect(main.getByRole("button", { name: /Request mentorship|Apply|I'm interested/i })).toHaveCount(0);
}

test.describe("Founding accounts, logged out @public", () => {
  test("founding profile shows the HF Community badge, no yellow notice, no contact controls", async ({ page }) => {
    await visit(page, `/u/${FOUNDING.senior}`);
    const badge = page.locator("main").getByRole("link", { name: BADGE }).first();
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute("href", "/about#founding-community");
    await expect(page.getByText(NOTICE)).toHaveCount(0);
    await expectNoContactControls(page);
    await expect(page.getByRole("link", { name: "Sign in to connect" })).toHaveCount(0);
  });

  test("founding mentor cards show the badge, never a Message button", async ({ page }) => {
    await visit(page, "/mentors");
    const card = page.locator("main div.rounded-xl", { hasText: `${FOUNDING.senior}` }).first();
    await expect(card.getByRole("link", { name: BADGE })).toBeVisible();
    await expect(card.getByRole("link", { name: /^Message$/ })).toHaveCount(0);
  });

  test("the Accepting mentorship requests filter never lists a founding account", async ({ page }) => {
    await visit(page, "/mentors?avail=accepting");
    await expect(page.locator("main").getByRole("link", { name: BADGE })).toHaveCount(0);
  });
});

test.describe("Founding accounts, logged in", () => {
  test.use({ storageState: storageStatePath("junior") });

  test("founding profile: badge, no yellow notice, no Message / mentorship buttons", async ({ page }) => {
    await visit(page, `/u/${FOUNDING.senior}`);
    await expect(page.locator("main").getByRole("link", { name: BADGE }).first()).toBeVisible();
    await expect(page.getByText(NOTICE)).toHaveCount(0);
    await expectNoContactControls(page);
  });

  test("message thread with a founding account says messaging isn't available, no composer", async ({ page }) => {
    await visit(page, `/messages/${FOUNDING.senior}`);
    await expect(page.getByText("Messaging isn't available for this profile.")).toBeVisible();
    await expect(page.getByText(NOTICE)).toHaveCount(0);
    await expect(page.getByPlaceholder("Write a message…")).toHaveCount(0);
  });
});

test.describe("real members' contact buttons work (local)", () => {
  test.use({ storageState: storageStatePath("junior") });

  test("mentor card Message button opens the conversation", async ({ page }) => {
    await visit(page, "/mentors?avail=accepting");
    const card = page.locator("main div.rounded-xl", { hasText: `@${USERS.senior.handle}` }).or(
      page.locator("main div.rounded-xl", { hasText: USERS.senior.handle }),
    ).first();
    await card.getByRole("link", { name: /^Message$/ }).click();
    await expect(page).toHaveURL(new RegExp(`/messages/${USERS.senior.handle}$`));
    await expect(page.getByPlaceholder("Write a message…")).toBeVisible();
  });

  test("Send a message delivers and shows after reload", async ({ page }) => {
    const text = `hello from e2e ${test.info().project.name}`;
    await visit(page, `/u/${USERS.senior.handle}`);
    await page.getByRole("link", { name: "Send a message" }).click();
    await expect(page).toHaveURL(new RegExp(`/messages/${USERS.senior.handle}$`));
    await page.getByPlaceholder("Write a message…").fill(text);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(text)).toBeVisible();
    await page.reload();
    await expect(page.getByText(text)).toBeVisible();
    const [junior, senior] = await Promise.all([profileId(USERS.junior.handle), profileId(USERS.senior.handle)]);
    const rows = await rest<unknown[]>(
      `messages?select=id&sender_id=eq.${junior}&recipient_id=eq.${senior}&body=eq.${encodeURIComponent(text)}`,
    );
    expect(rows.length).toBe(1);
  });

  test("Request mentorship creates a pending request", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "one request per pair; run once");
    await visit(page, `/u/${USERS.senior.handle}`);
    await page.getByRole("button", { name: "Request mentorship" }).click();
    await expect(page.getByText("Request sent")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Request sent")).toBeVisible();
    const [junior, senior] = await Promise.all([profileId(USERS.junior.handle), profileId(USERS.senior.handle)]);
    const rows = await rest<{ status: string }[]>(
      `mentorships?select=status&junior_id=eq.${junior}&senior_id=eq.${senior}`,
    );
    expect(rows).toEqual([{ status: "pending" }]);
  });

  test("a long unbroken message wraps inside the bubble", async ({ page }) => {
    const long = `https://example.com/${"x".repeat(160)}-${test.info().project.name}`;
    await visit(page, `/messages/${USERS.senior.handle}`);
    await page.getByPlaceholder("Write a message…").fill(long);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(long)).toBeVisible();
    await page.reload();
    const bubble = page.getByText(long);
    await expect(bubble).toBeVisible();
    await expectFitsViewport(page);
    // The message list scrolls, so overflow hides inside it: check the list
    // itself doesn't scroll sideways and the bubble sits inside it.
    const fit = await bubble.evaluate((el) => {
      let list = el.parentElement!;
      while (list && getComputedStyle(list).overflowY !== "auto") list = list.parentElement!;
      const r = el.getBoundingClientRect();
      const c = list.getBoundingClientRect();
      return { sideScroll: list.scrollWidth > list.clientWidth + 1, inside: r.left >= c.left - 1 && r.right <= c.right + 1 };
    });
    expect(fit).toEqual({ sideScroll: false, inside: true });
  });
});
