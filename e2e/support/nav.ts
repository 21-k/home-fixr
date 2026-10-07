import type { Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";

/** Below lg (1024px) the header collapses into a menu and sidebars into a disclosure. */
export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

/** The app header's main navigation, opening the mobile menu first if needed. */
export async function mainNav(page: Page): Promise<Locator> {
  if (isMobile(page)) {
    const toggle = page.getByRole("button", { name: /menu/i });
    await expect(toggle, "mobile menu button in the header").toBeVisible();
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  }
  const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  await expect(nav).toHaveCount(1);
  return nav;
}

/**
 * The page's sidebar navigation. Below the lg breakpoint the sidebar is
 * collapsed into a disclosure at the top of the page; open it first.
 */
export async function sideNav(page: Page): Promise<Locator> {
  const width = page.viewportSize()?.width ?? 1280;
  if (width < 1024) {
    const summary = page.getByTestId("mobile-sidebar").locator("summary");
    await expect(summary, "collapsed sidebar toggle on small screens").toBeVisible();
    const open = await page.getByTestId("mobile-sidebar").evaluate((d) => (d as HTMLDetailsElement).open);
    if (!open) await summary.click();
    return page.getByTestId("mobile-sidebar");
  }
  return page.locator("aside").first();
}
