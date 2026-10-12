// The external review's interface copy, and the HF-logo disclosure that remains.
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
  FOUNDING_ABOUT_SENTENCE,
  FOUNDING_BADGE_NOTE,
  FOUNDING_COLLAB_MESSAGE,
  FOUNDING_CONTACT_MESSAGE,
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

test("post-level 'Team-written example' labels were removed (Oct 2026); the badge + About remain", () => {
  const all = walk(join(ROOT, "src")).map((f) => readFileSync(f, "utf8")).join("\n");
  assert.doesNotMatch(all, /Team-written example|TeamWrittenLabel|isTeamWritten/);
  // What still discloses the example profiles: the HF logo (with an accessible
  // name and hover note), the Terms of Service section 5 and the About sentence.
  const badge = src("src/components/FoundingBadge.tsx");
  assert.match(badge, /<LogoMark /);
  assert.doesNotMatch(badge, /<Link|href=/);
  assert.match(badge, /aria-label=\{FOUNDING_BADGE_NOTE\}/);
  assert.match(badge, /title=\{FOUNDING_BADGE_NOTE\}/);
  assert.match(FOUNDING_BADGE_NOTE, /^HF: an example profile prepared by the Home Fixr team with AI assistance\. Not a real member\.$/);
  const terms = src("src/app/terms/page.tsx");
  assert.match(terms, /id: "hf-community"/);
  assert.match(terms, /title: "5\. Example profiles marked HF, and example content"/);
  assert.match(terms, /They are not real members\./);
  assert.match(terms, /Profiles marked HF can&apos;t be messaged/);
  assert.match(src("src/app/page.tsx"), /href: "\/terms", label: "Terms of Service"/);
  assert.match(src("src/app/page.tsx"), /q: "What are the profiles marked HF\?"/);
  assert.match(src("src/app/about/page.tsx"), /Example profiles marked HF<\/h2>/);
  assert.match(FOUNDING_ABOUT_SENTENCE, /example profiles, and the posts they wrote, are marked with the HF logo/i);
  assert.match(FOUNDING_ABOUT_SENTENCE, /not real members/);
});

test("the badge is the HF logo only: no visible text, and no 'Community' in any badge copy", () => {
  const badge = src("src/components/FoundingBadge.tsx");
  // Everything between the opening <span ...> and </span> is the logo, nothing typed.
  const inner = badge.slice(badge.indexOf(">", badge.indexOf("<span")) + 1, badge.lastIndexOf("</span>"));
  assert.equal(inner.replace(/<LogoMark[^>]*\/>/, "").trim(), "");
  assert.doesNotMatch(badge, /sr-only/);
  for (const s of [FOUNDING_BADGE_NOTE, FOUNDING_ABOUT_SENTENCE, FOUNDING_COLLAB_MESSAGE, FOUNDING_CONTACT_MESSAGE]) {
    assert.doesNotMatch(s, /Community/, s);
  }
  for (const f of ["src/app/about/page.tsx", "src/app/terms/page.tsx", "src/app/page.tsx", "src/components/FoundingBadge.tsx"]) {
    assert.doesNotMatch(src(f), /HF Community/, f);
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

test("the HF mark is the LogoMark monogram everywhere, never a typed 'HF' square", () => {
  const bad = [];
  for (const f of walk(join(ROOT, "src"))) {
    const s = readFileSync(f, "utf8");
    if (/bg-brand-500[^"]*"[^>]*>\s*HF\s*</.test(s) || /^\s*HF\s*$/m.test(s)) bad.push(f.replace(ROOT, ""));
  }
  assert.deepEqual(bad, []);
  for (const f of ["src/components/AppHeader.tsx", "src/app/page.tsx", "src/app/login/page.tsx", "src/app/join/join-form.tsx",
                   "src/app/welcome/page.tsx", "src/app/about/page.tsx", "src/app/terms/page.tsx", "src/app/not-found.tsx",
                   "src/components/FoundingBadge.tsx"]) {
    assert.match(src(f), /<LogoMark /, f);
  }
  assert.match(src("src/app/opengraph-image.tsx"), /LOGO_MARK/);
});
