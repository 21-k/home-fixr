// Plan §2a/§8: names render through displayName(); `full_name` may appear only
// in the private contexts listed here (the member's own forms, the data layer,
// and the helper itself). Any other file that mentions full_name fails.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const ALLOWED = new Set([
  "src/lib/types.ts", // the column's type
  "src/lib/display.ts", // displayName() itself
  "src/lib/profile-cols.ts", // column list (data, not rendering)
  "src/lib/actions.ts", // saving the member's own name
  "src/lib/auth/actions.ts", // signup
  "src/components/UserName.tsx", // passes the row to displayName()
  "src/components/SettingsForm.tsx", // own name, private
  "src/components/DisplayPreferenceField.tsx", // the "full_name" preference value, own settings
  "src/components/WelcomeForm.tsx", // own name, private
  "src/app/welcome/page.tsx", // "Welcome, <first name>" to the member themself
  "src/app/join/join-form.tsx", // signup form field
]);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test("no raw full_name outside private contexts", () => {
  const offenders = [];
  for (const file of walk(join(ROOT, "src"))) {
    if (!/\.(tsx?|mjs|js)$/.test(file)) continue;
    const rel = relative(ROOT, file);
    if (ALLOWED.has(rel)) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (line.includes("full_name")) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(offenders, [], `raw full_name found:\n${offenders.join("\n")}`);
});

test("every surface that renders another member's name uses UserName or displayName", () => {
  const surfaces = [
    "src/components/PostCard.tsx",
    "src/app/(app)/q/[slug]/page.tsx",
    "src/app/(app)/u/[username]/page.tsx",
    "src/app/(app)/mentors/page.tsx",
    "src/app/(app)/collabs/page.tsx",
    "src/app/(app)/collabs/mine/page.tsx",
    "src/app/(app)/search/page.tsx",
    "src/app/(app)/mentorships/page.tsx",
    "src/app/(app)/notifications/page.tsx",
    "src/app/(app)/messages/page.tsx",
    "src/app/(app)/messages/[username]/page.tsx",
    "src/app/(app)/feed/page.tsx",
  ];
  for (const s of surfaces) {
    const src = readFileSync(join(ROOT, s), "utf8");
    assert.ok(/UserName|displayName\(/.test(src), `${s} doesn't use UserName/displayName`);
  }
});

test("HF Community (founding) badge is wired into profile header, post cards, replies, mentor cards, collabs", () => {
  const userName = readFileSync(join(ROOT, "src/components/UserName.tsx"), "utf8");
  assert.match(userName, /is_founding_member && <FoundingBadge/);
  const profile = readFileSync(join(ROOT, "src/app/(app)/u/[username]/page.tsx"), "utf8");
  assert.match(profile, /isFounding && <FoundingBadge/);
  const mentors = readFileSync(join(ROOT, "src/app/(app)/mentors/page.tsx"), "utf8");
  assert.match(mentors, /FoundingBadge/);
  for (const s of ["src/components/PostCard.tsx", "src/app/(app)/q/[slug]/page.tsx", "src/app/(app)/collabs/page.tsx"]) {
    assert.match(readFileSync(join(ROOT, s), "utf8"), /<UserName/, s);
  }
  const cols = readFileSync(join(ROOT, "src/lib/profile-cols.ts"), "utf8");
  assert.match(cols, /is_founding_member/);
});

test("About page carries the disclosure sentence verbatim (review-changes wording)", async () => {
  const { FOUNDING_ABOUT_SENTENCE } = await import("../src/lib/founding.ts");
  assert.equal(
    FOUNDING_ABOUT_SENTENCE,
    "Some early discussions and example profiles were prepared by the Home Fixr team with AI assistance to show how the community works. Example profiles, and the posts they wrote, carry an HF Community badge. HF Community profiles are not real members and can't be messaged.",
  );
  const about = readFileSync(join(ROOT, "src/app/about/page.tsx"), "utf8");
  assert.match(about, /FOUNDING_ABOUT_SENTENCE/);
});
