// The external review's interface copy and the "Team-written example" labels.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  AVAILABILITY_LABEL,
  COLLAB_TYPE_LABEL,
  COLLABS_NAV,
  COLLABS_TITLE,
  ROLE_LABEL,
  SELF_REPORTED_NOTE,
  profileHeadline,
  yearsLabel,
} from "../src/lib/format.ts";
import {
  FOUNDING_CONTACT_MESSAGE,
  TEAM_WRITTEN_LABEL,
  isTeamWritten,
} from "../src/lib/founding.ts";
import { COLLABS_EMPTY_MESSAGE } from "../src/lib/collabs.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const src = (rel) => readFileSync(join(ROOT, rel), "utf8");

test("years pluralise: 1 year, N years, never 'yrs'", () => {
  assert.equal(yearsLabel(1), "1 year");
  assert.equal(yearsLabel(2), "2 years");
  assert.equal(yearsLabel(28), "28 years");
  assert.equal(yearsLabel(0), "Less than 1 year");
  const base = { title: "Apprentice Plumber", trade: "plumbing", region: "Newark, NJ" };
  assert.equal(profileHeadline({ ...base, years_experience: 1 }), "Apprentice Plumber · 1 year · Newark, NJ");
  assert.equal(profileHeadline({ ...base, years_experience: 12 }), "Apprentice Plumber · 12 years · Newark, NJ");
});

test("role, availability and ride-along labels use the review's vocabulary (DB values unchanged)", () => {
  assert.deepEqual(ROLE_LABEL, { junior: "Apprentice", senior: "Mentor" });
  assert.deepEqual(AVAILABILITY_LABEL, {
    accepting: "Accepting mentorship requests",
    limited: "Limited availability",
    not_accepting: "Not accepting mentorship requests",
  });
  assert.equal(COLLAB_TYPE_LABEL.ride_along, "Apprentice ride-along");
  assert.equal(COLLABS_TITLE, "Ride-alongs and collaborations");
  assert.equal(COLLABS_NAV, "Ride-alongs");
  assert.equal(
    COLLABS_EMPTY_MESSAGE,
    "No active opportunities available. Mentors can post a ride-along or collaboration; apprentices can browse when opportunities become available.",
  );
  assert.match(SELF_REPORTED_NOTE, /self-reported .* not verified/);
});

test("team-written: Founding author or a seed batch, never a real member's own row", () => {
  assert.equal(TEAM_WRITTEN_LABEL, "Team-written example • AI-assisted");
  assert.equal(isTeamWritten({ seed_batch_id: null }, { is_founding_member: true }), true);
  assert.equal(isTeamWritten({ seed_batch_id: "fm-2026-10" }, { is_founding_member: false }), true);
  assert.equal(isTeamWritten({ seed_batch_id: null }, { is_founding_member: false }), false);
  assert.equal(isTeamWritten({}, null), false);
  assert.equal(isTeamWritten(null, undefined), false);
});

test("the label is wired into every surface that renders posts or replies", () => {
  for (const f of [
    "src/components/PostCard.tsx", // feed, search, profile Recent posts
    "src/app/(app)/q/[slug]/page.tsx", // thread post + each reply
    "src/app/(app)/u/[username]/page.tsx", // profile Recent answers
    "src/app/(app)/collabs/page.tsx", // seeded ride-alongs
  ]) {
    const s = src(f);
    assert.match(s, /<TeamWrittenLabel/, f);
    assert.match(s, /isTeamWritten\(/, f);
  }
  const thread = src("src/app/(app)/q/[slug]/page.tsx");
  assert.match(thread, /isTeamWritten\(post, post\.author\)/);
  assert.match(thread, /isTeamWritten\(reply, reply\.author\)/);
  // The profile's answers select must carry seed_batch_id for the rule.
  assert.match(src("src/app/(app)/u/[username]/page.tsx"), /seed_batch_id, post:posts/);
  // Feed, search and thread select * (which includes seed_batch_id).
  for (const f of ["src/app/(app)/feed/page.tsx", "src/app/(app)/search/page.tsx"]) {
    assert.match(src(f), /select\(`\*, author:profiles/, f);
  }
});

test("no wording implies the example profiles are real people", () => {
  assert.match(FOUNDING_CONTACT_MESSAGE, /^This is an example profile prepared by the Home Fixr team/);
  assert.match(FOUNDING_CONTACT_MESSAGE, /isn't a real member/);
  const all = walk(join(ROOT, "src")).map((f) => readFileSync(f, "utf8")).join("\n");
  assert.doesNotMatch(all, /approved by|Prepared by .* approved/i);
  assert.doesNotMatch(all, /Built with New Jersey vocational schools/);
});

test("no leftover review vocabulary in interface strings", () => {
  const bad = [];
  for (const f of walk(join(ROOT, "src"))) {
    const lines = readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
      // Interface copy lives in string literals and JSX text.
      const strings = [...t.matchAll(/"([^"]*)"|`([^`]*)`|>([^<>{}]+)</g)].map((m) => m[1] ?? m[2] ?? m[3]);
      for (const s of strings) {
        if (/^(junior|senior)$/.test(s) || /^\/collabs/.test(s) || /[_-]id\b|collab_|cv_|CV_|license_note/.test(s)) continue;
        // Identifiers, test ids, import paths: one token with no spaces.
        if (!/\s/.test(s) && (/[-/@$_.]/.test(s) || s === s.toLowerCase())) continue;
        if (/\bJunior\b|\bjuniors?\b(?!_)|senior pro|\bSeniors?\b|\bJobs\b|Job collabs|\bcollabs?\b|\bCVs?\b|licen[c]e|judgement|\d+ yrs\b/.test(s)) {
          bad.push(`${f.replace(ROOT, "")}:${i + 1}: ${s.slice(0, 80)}`);
        }
      }
    });
  }
  assert.deepEqual(bad, []);
});

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?)$/.test(n) ? [p] : [];
  });
}
