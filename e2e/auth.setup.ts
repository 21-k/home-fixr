import { mkdirSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";
import { IS_LIVE, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./support/env";
import { USERS, storageStatePath, type TestUser } from "./support/users";

// Creates the local test members fresh (deleting any previous copies, which
// cascades their messages, follows, mentorships...) and saves a logged-in
// storage state for each. Refuses to run against anything but localhost.

const admin = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { ...admin, ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function recreate(user: TestUser): Promise<string> {
  // (GoTrue's list-users endpoint 500s on the SQL-seeded founding rows, so
  // find the previous copy through its profile instead.)
  const prev = (await api(
    `/rest/v1/profiles?select=id&username=ilike.${encodeURIComponent(user.handle)}`,
  )) as { id: string }[];
  for (const p of prev) await api(`/auth/v1/admin/users/${p.id}`, { method: "DELETE" });
  const created = await api(`/auth/v1/admin/users`, {
    method: "POST",
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        full_name: user.fullName,
        username: user.handle,
        avatar_initials: user.fullName
          .split(" ")
          .map((p) => p[0])
          .join("")
          .toUpperCase(),
        role: user.role,
      },
    }),
  });
  const id = created.id as string;
  if (user.profile) {
    await api(`/rest/v1/profiles?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(user.profile),
    });
  }
  return id;
}

setup.describe.configure({ mode: "serial" });

for (const user of Object.values(USERS)) {
  setup(`create and sign in ${user.key}`, async ({ page }) => {
    expect(IS_LIVE, "auth setup only runs against the local stack").toBe(false);
    expect(SUPABASE_URL).toMatch(/^http:\/\/(127\.0\.0\.1|localhost)/);
    await recreate(user);

    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
    mkdirSync("e2e/.auth", { recursive: true });
    await page.context().storageState({ path: storageStatePath(user.key) });
  });
}
