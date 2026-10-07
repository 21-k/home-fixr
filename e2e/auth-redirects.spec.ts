import type { Page } from "@playwright/test";
import { test, expect, visit } from "./support/fixtures";
import { FOUNDING } from "./support/routes";
import { USERS, storageStatePath } from "./support/users";

const PROTECTED = [
  "/messages",
  `/messages/${USERS.senior.handle}`,
  "/notifications",
  "/mentorships",
  "/settings",
  "/welcome",
];

async function signIn(page: Page, user = USERS.junior) {
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test.describe("logged-out visits to member pages", () => {
  for (const path of PROTECTED) {
    test(`${path} redirects to login (HTTP redirect, carries next=)`, async ({ page }) => {
      const res = await page.request.get(path, { maxRedirects: 0 });
      expect([303, 307, 308]).toContain(res.status());
      const loc = new URL(res.headers()["location"], "http://x");
      expect(loc.pathname).toBe("/login");
      expect(loc.searchParams.get("next")).toBe(path);
    });
  }

  test("login returns to the page you came from", async ({ page }) => {
    await visit(page, "/notifications");
    await expect(page).toHaveURL(/\/login\?next=%2Fnotifications/);
    await signIn(page);
    await expect(page).toHaveURL((u) => u.pathname === "/notifications");
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  });

  test("login returns to a deep link with a handle", async ({ page }) => {
    await visit(page, `/messages/${USERS.senior.handle}`);
    await signIn(page);
    await expect(page).toHaveURL((u) => u.pathname === `/messages/${USERS.senior.handle}`);
  });

  test("next= cannot send you off-site", async ({ page }) => {
    for (const evil of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
      await page.context().clearCookies();
      await visit(page, `/login?next=${encodeURIComponent(evil)}`);
      await signIn(page);
      await expect(page).toHaveURL((u) => u.origin === new URL(page.url()).origin && u.pathname === "/feed");
    }
  });

  test("in-page sign-in links carry the current page", async ({ page }) => {
    await visit(page, `/u/${USERS.senior.handle}`);
    await expect(page.getByRole("link", { name: "Sign in to connect" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(`/u/${USERS.senior.handle}`)}`,
    );
    await visit(page, "/collabs");
    await expect(page.getByRole("link", { name: "Sign in to post" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent("/collabs")}`,
    );
  });

  test("signing in from a profile's 'Sign in to connect' comes back to it", async ({ page }) => {
    await visit(page, `/u/${USERS.senior.handle}`);
    await page.getByRole("link", { name: "Sign in to connect" }).click();
    await signIn(page);
    await expect(page).toHaveURL((u) => u.pathname === `/u/${USERS.senior.handle}`);
  });
});

test.describe("logged-in visits to /login and /join", () => {
  test.use({ storageState: storageStatePath("junior") });

  test("/login and /join send an onboarded member to the feed", async ({ page }) => {
    for (const path of ["/login", "/join"]) {
      await visit(page, path);
      await expect(page).toHaveURL((u) => u.pathname === "/feed");
    }
  });

  test("/login?next= sends an onboarded member on to next", async ({ page }) => {
    await visit(page, "/login?next=%2Fmessages");
    await expect(page).toHaveURL((u) => u.pathname === "/messages");
  });

  test("/welcome sends an onboarded member to the feed", async ({ page }) => {
    await visit(page, "/welcome");
    await expect(page).toHaveURL((u) => u.pathname === "/feed");
  });

  test("the header shows the account, not Sign in / Join", async ({ page }) => {
    await visit(page, `/u/${FOUNDING.senior}`);
    await expect(page.locator("header").getByRole("link", { name: "Join" })).toHaveCount(0);
  });
});

test.describe("a member who hasn't finished /welcome", () => {
  test.use({ storageState: storageStatePath("newbie") });

  test("/login and /join send them to /welcome", async ({ page }) => {
    for (const path of ["/login", "/join"]) {
      await visit(page, path);
      await expect(page).toHaveURL((u) => u.pathname === "/welcome");
    }
  });

  test("/welcome renders the handle step", async ({ page }) => {
    await visit(page, "/welcome");
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
    await expect(page.getByText(/Pick a handle/i).first()).toBeVisible();
  });
});
