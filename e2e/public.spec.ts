import { test, expect, visit, expectFitsViewport } from "./support/fixtures";
import {
  FOUNDING,
  MISSING_HANDLE,
  MISSING_SLUG,
  PUBLIC_ROUTES,
  discoverThreads,
} from "./support/routes";

// The browser logs the 404 document itself as a console error.
const NOT_FOUND_CONSOLE = /Failed to load resource: the server responded with a status of 404/;

// Logged-out, read-only: runs locally and against production (@public).

test.describe("public routes render healthy @public", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`GET ${route}`, async ({ page }) => {
      const res = await visit(page, route);
      expect(res?.status(), `status of ${route}`).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
      await expect(page.getByText("Page not found")).toHaveCount(0);
      await expectFitsViewport(page);
    });
  }

  test("reply counts are pluralised correctly", async ({ page }) => {
    await visit(page, "/feed");
    await expect(page.locator("main span", { hasText: /^\s*1 replies\s*$/ })).toHaveCount(0);
  });

  test("thread pages (discovered from the feed)", async ({ page }) => {
    const threads = await discoverThreads(page, 5);
    expect(threads.length).toBeGreaterThanOrEqual(3);
    for (const href of threads) {
      const res = await visit(page, href);
      expect(res?.status(), href).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
      // (on phones it sits in the collapsed sidebar; header-nav.spec clicks it there)
      await expect(page.locator('a[href="/feed"]', { hasText: "Back to feed" }).first()).toBeAttached();
      await expectFitsViewport(page);
    }
  });
});

test.describe("profiles and not-found @public", () => {
  test("handle lookup is case-insensitive and redirects to the canonical handle", async ({ page }) => {
    const res = await visit(page, `/u/${FOUNDING.senior.toLowerCase()}`);
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(`/u/${FOUNDING.senior}`);
    await expect(page.getByText(`@${FOUNDING.senior}`)).toBeVisible();
  });

  test("a non-existent handle returns a real 404 with the not-found page", async ({ page, health }) => {
    health.allow(new RegExp(`HTTP 404 GET .*/u/${MISSING_HANDLE}`));
    health.allow(NOT_FOUND_CONSOLE);
    const res = await visit(page, `/u/${MISSING_HANDLE}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: /feed/i }).first()).toBeVisible();
    await expectFitsViewport(page);
  });

  test("a non-existent thread returns a real 404", async ({ page, health }) => {
    health.allow(new RegExp(`HTTP 404 GET .*/q/${MISSING_SLUG}`));
    health.allow(NOT_FOUND_CONSOLE);
    const res = await visit(page, `/q/${MISSING_SLUG}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("an unknown route returns 404", async ({ page, health }) => {
    health.allow(/HTTP 404 GET .*\/this-route-does-not-exist/);
    health.allow(NOT_FOUND_CONSOLE);
    const res = await visit(page, "/this-route-does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("every page has its own document title", async ({ page }) => {
    const titles = new Map<string, string>();
    for (const route of ["/feed", "/mentors", "/collabs", "/about", "/login", "/join", `/u/${FOUNDING.senior}`]) {
      await visit(page, route);
      titles.set(route, await page.title());
    }
    // No doubled suffix like "About · Home Fixr · Home Fixr".
    for (const [route, title] of titles) {
      expect(title, route).not.toMatch(/Home Fixr.*Home Fixr/);
    }
    expect(new Set(titles.values()).size, JSON.stringify([...titles])).toBe(titles.size);
  });
});
