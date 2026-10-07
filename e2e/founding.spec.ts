import { test, expect, visit } from "./support/fixtures";
import { profileId, rest } from "./support/db";
import { FOUNDING } from "./support/routes";
import { USERS, storageStatePath } from "./support/users";

const NOTICE = /This is a Founding Community account/;

async function expectNoContactControls(page: import("@playwright/test").Page) {
  const main = page.locator("main");
  await expect(main.getByRole("link", { name: /Send a message|^Message$/ })).toHaveCount(0);
  await expect(main.getByRole("button", { name: /Request mentorship|Apply|I'm interested/i })).toHaveCount(0);
}

test.describe("Founding accounts, logged out @public", () => {
  test("founding profile shows the badge and notice, no contact controls", async ({ page }) => {
    await visit(page, `/u/${FOUNDING.senior}`);
    await expect(page.locator("main").getByRole("link", { name: "Founding Community" }).first()).toBeVisible();
    await expect(page.getByText(NOTICE)).toBeVisible();
    await expectNoContactControls(page);
    await expect(page.getByRole("link", { name: "Sign in to connect" })).toHaveCount(0);
  });

  test("founding mentor cards show the badge, never a Message button", async ({ page }) => {
    await visit(page, "/mentors");
    const card = page.locator("main div.rounded-xl", { hasText: `${FOUNDING.senior}` }).first();
    await expect(card.getByRole("link", { name: "Founding Community" })).toBeVisible();
    await expect(card.getByRole("link", { name: /^Message$/ })).toHaveCount(0);
  });

  test("the Accepting mentees filter never lists a founding account", async ({ page }) => {
    await visit(page, "/mentors?avail=accepting");
    await expect(page.locator("main").getByRole("link", { name: "Founding Community" })).toHaveCount(0);
  });
});

test.describe("Founding accounts, logged in", () => {
  test.use({ storageState: storageStatePath("junior") });

  test("founding profile: badge + notice, no Message / mentorship buttons", async ({ page }) => {
    await visit(page, `/u/${FOUNDING.senior}`);
    await expect(page.getByText(NOTICE)).toBeVisible();
    await expectNoContactControls(page);
  });

  test("message thread with a founding account shows the notice, no composer", async ({ page }) => {
    await visit(page, `/messages/${FOUNDING.senior}`);
    await expect(page.getByText(NOTICE)).toBeVisible();
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
});
