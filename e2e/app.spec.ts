import { test, expect, visit, expectFitsViewport } from "./support/fixtures";
import { FOUNDING, PUBLIC_ROUTES, discoverThreads } from "./support/routes";
import { USERS, storageStatePath } from "./support/users";

// Logged-in route health (local only).

test.describe("logged-in routes render healthy", () => {
  test.use({ storageState: storageStatePath("junior") });

  const routes = [
    ...PUBLIC_ROUTES.filter((r) => r !== "/login" && r !== "/join" && r !== "/"),
    "/messages",
    `/messages/${USERS.senior.handle}`,
    `/messages/${FOUNDING.senior}`,
    "/notifications",
    "/mentorships",
    "/settings",
    `/u/${USERS.junior.handle}`,
    `/u/${USERS.senior.handle}`,
  ];
  for (const route of routes) {
    test(`GET ${route}`, async ({ page }) => {
      const res = await visit(page, route);
      expect(res?.status(), route).toBe(200);
      expect(new URL(page.url()).pathname, "no unexpected redirect").toBe(route.split("?")[0]);
      await expect(page.locator("h1").first()).toBeVisible();
      await expectFitsViewport(page);
    });
  }

  test("threads render for a member", async ({ page }) => {
    for (const href of await discoverThreads(page, 4)) {
      const res = await visit(page, href);
      expect(res?.status()).toBe(200);
      await expect(page.getByPlaceholder("Share what you'd do…")).toBeVisible();
      await expectFitsViewport(page);
    }
  });

  test("own profile offers Edit profile", async ({ page }) => {
    await visit(page, `/u/${USERS.junior.handle}`);
    await page.getByRole("link", { name: "Edit profile" }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("the landing page offers a way into the app", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("link", { name: /Go to your feed/ }).click();
    await expect(page).toHaveURL(/\/feed$/);
  });
});

test.describe("member content layout", () => {
  test.use({ storageState: storageStatePath("junior") });

  test("a post with a long unbroken URL doesn't push the page sideways", async ({ page }) => {
    const tag = test.info().project.name;
    const title = `Long link check ${tag}`;
    const body = `See https://example.com/${"y".repeat(150)}/${tag} for the spec sheet.`;
    await visit(page, "/feed");
    await page.getByPlaceholder("Got a question for the pros?").fill(title);
    await page.getByPlaceholder("Share the details so people can actually help…").fill(body);
    await page.getByRole("button", { name: "Post", exact: true }).click();
    const card = page.locator("main").getByRole("link", { name: new RegExp(title) });
    await expect(card).toBeVisible();
    await expectFitsViewport(page);
    await card.click();
    await expect(page).toHaveURL(/\/q\/long-link-check/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expectFitsViewport(page);
  });
});

test.describe("empty states", () => {
  test.use({ storageState: storageStatePath("empty") });

  test("no messages", async ({ page }) => {
    await visit(page, "/messages");
    await expect(page.getByText("No conversations yet")).toBeVisible();
    await expectFitsViewport(page);
  });

  test("no notifications", async ({ page }) => {
    await visit(page, "/notifications");
    await expect(page.getByText(/Nothing yet/)).toBeVisible();
    await expectFitsViewport(page);
  });

  test("no mentorships", async ({ page }) => {
    await visit(page, "/mentorships");
    await expect(page.locator("h1").first()).toBeVisible();
    await expectFitsViewport(page);
  });

  test("no jobs", async ({ page }) => {
    await visit(page, "/collabs/mine");
    await expect(page.locator("h1").first()).toBeVisible();
    await expectFitsViewport(page);
  });

  test("empty conversation", async ({ page }) => {
    await visit(page, `/messages/${USERS.senior.handle}`);
    await expect(page.getByText(/No messages yet/)).toBeVisible();
  });
});

test.describe("un-onboarded member", () => {
  test.use({ storageState: storageStatePath("newbie") });

  test("/welcome renders healthy", async ({ page }) => {
    const res = await visit(page, "/welcome");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expectFitsViewport(page);
  });
});
