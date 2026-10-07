import type { Page } from "@playwright/test";
import { test, expect, visit } from "./support/fixtures";
import { IS_LIVE, LIVE_THROTTLE_MS } from "./support/env";
import { FOUNDING, PUBLIC_ROUTES, discoverThreads } from "./support/routes";
import { USERS, storageStatePath } from "./support/users";

// Every link in the header, sidebar(s), in-page navs and footer, on every page,
// resolves (after redirects) to a 200. Hash links must point at an element
// that exists on that page.

const CHROME = "header a[href], nav a[href], aside a[href], footer a[href]";

async function checkChromeLinks(page: Page, routes: string[]) {
  // ~40 pages + ~70 link targets: slow on a busy dev server.
  if (!IS_LIVE) test.setTimeout(300_000);
  const targets = new Map<string, string>(); // href -> first page it was seen on
  const badHashes: string[] = [];

  for (const route of routes) {
    await visit(page, route);
    const hrefs = await page
      .locator(CHROME)
      .evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    for (const href of hrefs) {
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
      if (href.startsWith("#")) {
        const exists = await page.locator(`[id="${href.slice(1)}"]`).count();
        if (!exists) badHashes.push(`${route} -> ${href}`);
        continue;
      }
      const url = new URL(href, page.url());
      if (url.origin !== new URL(page.url()).origin) continue;
      const key = url.pathname + url.search;
      if (!targets.has(key)) targets.set(key, route);
    }
  }

  const broken: string[] = [];
  for (const [href, from] of targets) {
    if (IS_LIVE) await page.waitForTimeout(LIVE_THROTTLE_MS);
    const res = await page.request.get(href);
    if (res.status() !== 200) broken.push(`${href} (linked from ${from}) -> ${res.status()}`);
  }
  expect(badHashes, "hash links with no target").toEqual([]);
  expect(broken, "chrome links that do not resolve to 200").toEqual([]);
  expect(targets.size).toBeGreaterThan(5);
}

test.describe("chrome links, logged out @public", () => {
  test("header, sidebar and footer links resolve on every public page", async ({ page }) => {
    const threads = await discoverThreads(page, 3);
    await checkChromeLinks(page, [...PUBLIC_ROUTES, ...threads]);
  });
});

test.describe("chrome links, logged in", () => {
  test.use({ storageState: storageStatePath("junior") });
  test("header, sidebar and footer links resolve on every logged-in page", async ({ page }) => {
    const threads = await discoverThreads(page, 3);
    await checkChromeLinks(page, [
      ...PUBLIC_ROUTES.filter((r) => r !== "/login" && r !== "/join"),
      ...threads,
      "/messages",
      `/messages/${USERS.senior.handle}`,
      `/messages/${FOUNDING.senior}`,
      "/notifications",
      "/mentorships",
      "/settings",
      `/u/${USERS.junior.handle}`,
      `/u/${USERS.senior.handle}`,
    ]);
  });
});
