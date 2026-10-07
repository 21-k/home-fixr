import type { Page } from "@playwright/test";
import { test, expect, visit, expectFitsViewport } from "./support/fixtures";
import { isMobile, mainNav, sideNav } from "./support/nav";
import { FOUNDING, discoverThreads } from "./support/routes";
import { USERS, storageStatePath } from "./support/users";

const NAV_ITEMS = [
  { label: "Feed", path: "/feed" },
  { label: "Mentors", path: "/mentors" },
  { label: "Jobs", path: "/collabs" },
];

async function expectActive(page: Page, label: string | null) {
  const nav = await mainNav(page);
  for (const item of [...NAV_ITEMS.map((i) => i.label), "Messages"]) {
    const link = nav.getByRole("link", { name: item, exact: true });
    if (item === label) await expect(link, `${item} active`).toHaveAttribute("aria-current", "page");
    else await expect(link, `${item} not active`).not.toHaveAttribute("aria-current", "page");
  }
  if (isMobile(page)) await page.keyboard.press("Escape");
}

async function clickNav(page: Page, label: string) {
  const nav = await mainNav(page);
  await nav.getByRole("link", { name: label, exact: true }).click();
}

test.describe("header navigation, logged out @public", () => {
  test("each header link lands on its page and is marked active", async ({ page }) => {
    await visit(page, "/about");
    await visit(page, "/mentors");
    for (const item of NAV_ITEMS) {
      await clickNav(page, item.label);
      await expect(page).toHaveURL((u) => u.pathname === item.path);
      await expectActive(page, item.label);
      await expectFitsViewport(page);
    }
  });

  test("Messages in the header sends a logged-out visitor to sign in, then back", async ({ page }) => {
    await visit(page, "/feed");
    await clickNav(page, "Messages");
    await expect(page).toHaveURL((u) => u.pathname === "/login" && u.searchParams.get("next") === "/messages");
  });

  test("sign in / join are reachable from the header on every app page", async ({ page }) => {
    for (const route of ["/feed", "/mentors", "/collabs", `/u/${FOUNDING.senior}`]) {
      await visit(page, route);
      const nav = await mainNav(page);
      const scope = isMobile(page) ? nav : page.locator("header");
      await expect(scope.getByRole("link", { name: "Sign in" })).toBeVisible();
      await expect(scope.getByRole("link", { name: "Join" })).toBeVisible();
      if (isMobile(page)) await page.keyboard.press("Escape");
    }
  });

  test("sub-routes keep their section active", async ({ page }) => {
    await visit(page, "/collabs/mine");
    await expectActive(page, "Jobs");
    await visit(page, "/mentors?trade=plumbing");
    await expectActive(page, "Mentors");
    await visit(page, `/u/${FOUNDING.senior}`);
    await expectActive(page, null);
  });

  test("the logo goes home", async ({ page }) => {
    await visit(page, "/feed");
    await page.locator("header").getByRole("link", { name: /Home Fixr/ }).first().click();
    await expect(page).toHaveURL((u) => u.pathname === "/");
  });

  test("profile back links go where they say", async ({ page }) => {
    await visit(page, `/u/${FOUNDING.senior}`);
    await (await sideNav(page)).getByRole("link", { name: /All mentors/ }).click();
    await expect(page).toHaveURL((u) => u.pathname === "/mentors");
    await visit(page, `/u/${FOUNDING.senior}`);
    await (await sideNav(page)).getByRole("link", { name: /Back to feed/ }).click();
    await expect(page).toHaveURL((u) => u.pathname === "/feed");
  });

  test("thread back link goes to the feed", async ({ page }) => {
    const [thread] = await discoverThreads(page, 1);
    await visit(page, thread);
    await (await sideNav(page)).getByRole("link", { name: /Back to feed/ }).click();
    await expect(page).toHaveURL((u) => u.pathname === "/feed");
  });

  test("mentor filters are reachable and mark the active filter", async ({ page }) => {
    await visit(page, "/mentors");
    await (await sideNav(page)).getByRole("link", { name: "Plumbing" }).click();
    await expect(page).toHaveURL(/trade=plumbing/);
    const side = await sideNav(page);
    await expect(side.getByRole("link", { name: "Plumbing" })).toHaveAttribute("aria-current", "page");
    await side.getByRole("link", { name: "New Jersey" }).click();
    await expect(page).toHaveURL(/trade=plumbing.*region=NJ|region=NJ.*trade=plumbing/);
    await (await sideNav(page)).getByRole("link", { name: "All trades" }).click();
    await expect(page).toHaveURL((u) => !u.searchParams.has("trade") && u.searchParams.get("region") === "NJ");
  });

  test("feed trade filters and job type filters are reachable", async ({ page }) => {
    await visit(page, "/feed");
    await (await sideNav(page)).getByRole("link", { name: "HVAC" }).click();
    await expect(page).toHaveURL(/\/feed\?trade=hvac/);
    await visit(page, "/collabs");
    await (await sideNav(page)).getByRole("link", { name: /Junior ride-along/ }).click();
    await expect(page).toHaveURL(/\/collabs\?type=ride_along/);
  });

  test("search is reachable from the header", async ({ page }) => {
    await visit(page, "/feed");
    const scope = isMobile(page) ? await mainNav(page) : page.locator("header");
    const box = scope.getByRole("searchbox");
    await expect(box).toBeVisible();
    await box.fill("pex");
    await box.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=pex/);
    await expect(page.getByRole("heading", { name: /Results for/ })).toBeVisible();
  });

  test("the search page has its own search box", async ({ page }) => {
    await visit(page, "/search");
    // Outside the header: on phones the header box lives in a closed menu.
    const box = page.locator("header ~ *").getByRole("searchbox");
    await expect(box).toBeVisible();
    await box.fill("valve");
    await box.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=valve/);
  });
});

test.describe("header navigation, logged in", () => {
  test.use({ storageState: storageStatePath("junior") });

  test("each header link lands on its page and is marked active", async ({ page }) => {
    await visit(page, "/feed");
    for (const item of [...NAV_ITEMS, { label: "Messages", path: "/messages" }]) {
      await clickNav(page, item.label);
      await expect(page).toHaveURL((u) => u.pathname === item.path);
      await expectActive(page, item.label);
      await expectFitsViewport(page);
    }
  });

  test("account links are reachable from the header", async ({ page }) => {
    await visit(page, "/feed");
    const nav = await mainNav(page);
    const scope = isMobile(page) ? nav : page.locator("header");
    await expect(scope.getByRole("link", { name: /Notifications/ })).toBeVisible();
    await scope.getByRole("link", { name: /Notifications/ }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    const scope2 = isMobile(page) ? await mainNav(page) : page.locator("header");
    await expect(scope2.getByRole("button", { name: "Log out" })).toBeVisible();
  });

  test("settings and messages back links", async ({ page }) => {
    await visit(page, "/settings");
    await (await sideNav(page)).getByRole("link", { name: /View my profile/ }).click();
    await expect(page).toHaveURL(new RegExp(`/u/${USERS.junior.handle}$`));
    await visit(page, "/settings");
    await (await sideNav(page)).getByRole("link", { name: /Back to feed/ }).click();
    await expect(page).toHaveURL(/\/feed$/);
    await visit(page, `/messages/${USERS.senior.handle}`);
    await page.getByRole("link", { name: /All messages/ }).click();
    await expect(page).toHaveURL(/\/messages$/);
    await visit(page, "/collabs/mine");
    await (await sideNav(page)).getByRole("link", { name: /All collabs/ }).click();
    await expect(page).toHaveURL(/\/collabs$/);
  });
});

test.describe("keyboard and focus @public", () => {
  test("the main nav is keyboard reachable with a visible focus ring", async ({ page }) => {
    test.skip(isMobile(page), "keyboard nav is checked at desktop size");
    await visit(page, "/mentors");
    let found = false;
    for (let i = 0; i < 12 && !found; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          text: el.textContent?.trim(),
          inMainNav: !!el.closest('nav[aria-label="Main"]'),
          outline: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0,
          ring: s.boxShadow !== "none",
        };
      });
      if (info?.inMainNav && info.text === "Feed") {
        found = true;
        expect(info.outline || info.ring, "visible focus indicator on nav link").toBe(true);
      }
    }
    expect(found, "Tab reaches the Feed link in the main nav").toBe(true);
  });
});
