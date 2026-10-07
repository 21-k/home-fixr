import { mkdirSync } from "node:fs";
import { test, visit } from "./support/fixtures";
import { FOUNDING, discoverThreads } from "./support/routes";
import { USERS, storageStatePath } from "./support/users";

// Screenshots of the main pages at both sizes, logged out and in (local).
//   SHOTS=after npx playwright test e2e/screens.spec.ts
// writes e2e/reports/<SHOTS>/<project>-<state>-<page>.png

const DIR = `e2e/reports/${process.env.SHOTS ?? "after"}`;
const PAGES = [
  ["home", "/"],
  ["feed", "/feed"],
  ["mentors", "/mentors"],
  ["collabs", "/collabs"],
  ["search", "/search?q=pex"],
  ["profile-Kash_sing", `/u/${FOUNDING.senior}`],
  ["about", "/about"],
  ["login", "/login"],
  ["notfound", "/u/no_such_member_e2e"],
] as const;

async function shoot(page: import("@playwright/test").Page, name: string, menu = false) {
  mkdirSync(DIR, { recursive: true });
  const file = `${DIR}/${test.info().project.name}-${name}.jpg`;
  await page.screenshot({ path: file, fullPage: !menu, type: "jpeg", quality: 70 });
}

test.describe("screens @screens", () => {
  test("logged out", async ({ page, health }) => {
    health.allow(/404/);
    for (const [name, path] of PAGES) {
      await visit(page, path);
      await shoot(page, `out-${name}`);
    }
    const [thread] = await discoverThreads(page, 1);
    await visit(page, thread);
    await shoot(page, "out-thread");
    if (test.info().project.name === "mobile") {
      await visit(page, "/feed");
      const toggle = page.getByRole("button", { name: /menu/i });
      if (await toggle.count()) {
        await toggle.click();
        await shoot(page, "out-feed-menu-open", true);
      }
      await visit(page, "/mentors");
      const filters = page.getByTestId("mobile-sidebar").locator("summary");
      if (await filters.count()) {
        await filters.click();
        await shoot(page, "out-mentors-filters-open", true);
      }
    }
  });

  test.describe("logged in", () => {
    test.use({ storageState: storageStatePath("junior") });
    test("junior", async ({ page }) => {
      for (const [name, path] of [
        ["feed", "/feed"],
        ["mentors", "/mentors"],
        ["messages", "/messages"],
        ["conversation", `/messages/${USERS.senior.handle}`],
        ["notifications", "/notifications"],
        ["settings", "/settings"],
        ["profile-own", `/u/${USERS.junior.handle}`],
      ] as const) {
        await visit(page, path);
        await shoot(page, `in-${name}`);
      }
      if (test.info().project.name === "mobile") {
        await visit(page, "/feed");
        const toggle = page.getByRole("button", { name: /menu/i });
        if (await toggle.count()) {
          await toggle.click();
          await shoot(page, "in-feed-menu-open", true);
        }
      }
    });
  });
});
