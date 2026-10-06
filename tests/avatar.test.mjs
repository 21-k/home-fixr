// Avatar helpers (migration 0011): fixed icon set, deterministic colours.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AVATAR_ICON_OPTIONS, avatarColors, isAvatarIcon } from "../src/lib/avatar.ts";

test("icon set matches the profiles_avatar_icon_valid constraint", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0011_avatar_styles.sql", import.meta.url), "utf8");
  const inSql = [...sql.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).filter((k) => !["initials", "icon", "none"].includes(k));
  assert.deepEqual(new Set(AVATAR_ICON_OPTIONS.map((o) => o.key)), new Set(inSql));
  assert.ok(isAvatarIcon("wrench"));
  assert.ok(!isAvatarIcon("skull"));
});

test("colours are deterministic per handle and case-insensitive", () => {
  assert.deepEqual(avatarColors("Kash_sing"), avatarColors("kash_sing"));
  assert.deepEqual(avatarColors("oldsteam_zig"), avatarColors("oldsteam_zig"));
  const distinct = new Set(["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8", "i9", "j10"].map((h) => avatarColors(h).bg));
  assert.ok(distinct.size >= 4, "handles spread across the palette");
});

test("every <Avatar> call site passes a person, not bare initials", () => {
  // Mirrors the 13 surfaces; a regression to initials-only would drop styles.
  const files = [
    "src/components/PostCard.tsx", "src/components/AppHeader.tsx", "src/components/PostComposer.tsx",
    "src/app/(app)/feed/page.tsx", "src/app/(app)/q/[slug]/page.tsx", "src/app/(app)/u/[username]/page.tsx",
    "src/app/(app)/mentors/page.tsx", "src/app/(app)/search/page.tsx", "src/app/(app)/mentorships/page.tsx",
    "src/app/(app)/notifications/page.tsx", "src/app/(app)/messages/page.tsx",
    "src/app/(app)/messages/[username]/page.tsx", "src/app/(app)/collabs/mine/page.tsx",
  ];
  for (const f of files) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.match(src, /<Avatar[\s\S]{0,40}person=/, f);
    assert.doesNotMatch(src, /<Avatar\s+initials=/, f);
  }
});
