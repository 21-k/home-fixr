// The external review's interface copy, and the HF Community disclosure that remains.
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
import { FOUNDING_ABOUT_SENTENCE, FOUNDING_CONTACT_MESSAGE } from "../src/lib/founding.ts";
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

test("post-level 'Team-written example' labels were removed (Oct 2026); the badge + About remain", () => {
  const all = walk(join(ROOT, "src")).map((f) => readFileSync(f, "utf8")).join("\n");
  assert.doesNotMatch(all, /Team-written example|TeamWrittenLabel|isTeamWritten/);
  // What still discloses the example profiles: the HF Community badge (plain
  // text with a hover note), the Terms of Service section 5 and the About sentence.
  const badge = src("src/components/FoundingBadge.tsx");
  assert.match(badge, /HF Community/);
  assert.doesNotMatch(badge, /<Link|href=/);
  assert.match(badge, /example profile prepared by the Home Fixr team/);
  const terms = src("src/app/terms/page.tsx");
  assert.match(terms, /id: "hf-community"/);
  assert.match(terms, /They are not real members\./);
  assert.match(src("src/app/page.tsx"), /href: "\/terms", label: "Terms of Service"/);
  assert.match(FOUNDING_ABOUT_SENTENCE, /example profiles .* HF Community badge/);
  assert.match(FOUNDING_ABOUT_SENTENCE, /not real members/);
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
