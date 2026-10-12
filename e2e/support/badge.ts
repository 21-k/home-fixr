import { expect, type Locator } from "@playwright/test";

/** Screen-reader name of the HF logo that marks an example profile (src/lib/founding.ts). */
export const HF_BADGE_NOTE =
  "HF: an example profile prepared by the Home Fixr team with AI assistance. Not a real member.";

/**
 * The example-profile badge is the HF logo only: one SVG, no visible text (no
 * "HF Community"), named for screen readers (no hover note).
 */
export async function expectHfLogoBadge(badge: Locator) {
  await expect(badge).toBeVisible();
  await expect(badge.locator("svg")).toHaveCount(1);
  expect((await badge.innerText()).trim()).toBe("");
  await expect(badge).not.toContainText("Community");
  await expect(badge).toHaveAccessibleName(HF_BADGE_NOTE);
  // No hover note (removed for a quieter page); the meaning is in Terms §5 / About.
  expect(await badge.getAttribute("title")).toBeNull();
}
