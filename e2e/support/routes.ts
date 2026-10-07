import type { Page } from "@playwright/test";
import { visit } from "./fixtures";

// Seeded Founding Community handles that exist both locally (after
// seed.py --replace) and on production.
export const FOUNDING = {
  /** Senior, bullet-point multi-line answers. Mixed case + underscore. */
  senior: "Kash_sing",
  /** Junior, mixed case, no separators. */
  junior: "BergenPlumber",
  /** Junior with a dot and capitals. */
  dotted: "Raritan.airside",
  /** Junior with an underscore and capitals. */
  underscored: "NorthJersey_Plumber",
  /** Lower-case dotted junior. */
  lowerDotted: "chris.plumb",
};

export const MISSING_HANDLE = "no_such_member_e2e";
export const MISSING_SLUG = "no-such-thread-e2e-0000";

export const TRADES = ["electrical", "plumbing", "hvac"] as const;
export const REGIONS = ["NJ", "NY", "PA"] as const;
export const AVAILABILITY = ["accepting", "messages", "ride_alongs"] as const;
export const COLLAB_TYPES = ["extra_hand", "ride_along", "specialist"] as const;

/** Public routes every visitor can load (logged out or in). */
export const PUBLIC_ROUTES = [
  "/",
  "/feed",
  ...TRADES.map((t) => `/feed?trade=${t}`),
  "/mentors",
  ...TRADES.map((t) => `/mentors?trade=${t}`),
  ...REGIONS.map((r) => `/mentors?region=${r}`),
  ...AVAILABILITY.map((a) => `/mentors?avail=${a}`),
  "/mentors?trade=plumbing&region=NJ&avail=messages",
  "/collabs",
  ...COLLAB_TYPES.map((t) => `/collabs?type=${t}`),
  "/collabs/mine",
  "/search",
  "/search?q=pex",
  "/search?q=Kash",
  "/about",
  "/login",
  "/join",
  ...Object.values(FOUNDING).map((h) => `/u/${h}`),
];

/** Thread URLs discovered from the feed (works locally and live). */
export async function discoverThreads(page: Page, n = 5): Promise<string[]> {
  await visit(page, "/feed");
  const hrefs = await page
    .locator('main a[href^="/q/"]')
    .evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  return [...new Set(hrefs)].slice(0, n);
}
