import { test, expect, visit, expectFitsViewport } from "./support/fixtures";
import { FOUNDING } from "./support/routes";

test.describe("profile page @public", () => {
  test("multi-line answers keep their line breaks in Recent answers", async ({ page }) => {
    await visit(page, `/u/${FOUNDING.senior}`);
    const section = page.locator("main div", { has: page.getByRole("heading", { name: /Recent answers/ }) }).last();
    await expect(section).toBeVisible();
    // Kash_sing's answers are bullet lists ("…:\n- Your take-home now…").
    const previews = section.locator("p");
    const texts = await previews.evaluateAll((ps) =>
      ps.map((p) => ({ inner: (p as HTMLElement).innerText, raw: p.textContent ?? "" })),
    );
    const bulleted = texts.filter((t) => /\n\s*-\s/.test(t.raw));
    expect(bulleted.length, "some recent answers are bullet lists").toBeGreaterThan(0);
    for (const t of bulleted) {
      // innerText reflects CSS white-space: collapsed lines come back joined.
      expect(t.inner, "line breaks preserved in the preview").toMatch(/\n\s*-\s/);
    }
    await expectFitsViewport(page);
  });

  test("Recent answers link to the thread's canonical slug URL", async ({ page }) => {
    await visit(page, `/u/${FOUNDING.senior}`);
    const links = page.locator("main").getByRole("link", { name: /^“/ });
    const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, "slug, not a raw post id").not.toMatch(/\/q\/[0-9a-f]{8}-[0-9a-f]{4}-/);
    }
  });
});
