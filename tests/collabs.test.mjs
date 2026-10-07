// "Position filled" collabs (migration 0013): the pure rules, plus a few
// source-level checks that the board, My jobs and the server actions use them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyBlockReason,
  collabsHref,
  COLLAB_FILLED_LABEL,
  isCollabFilled,
  parseCollabStatusFilter,
  shouldOfferMarkFilled,
  sortCollabsOpenFirst,
} from "../src/lib/collabs.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const src = (rel) => readFileSync(ROOT + rel, "utf8");

test("a collab is filled exactly when filled_at is set", () => {
  assert.equal(isCollabFilled({ filled_at: null }), false);
  assert.equal(isCollabFilled({ filled_at: "2026-09-01T12:00:00Z" }), true);
  assert.equal(isCollabFilled(null), false);
});

test("open collabs sort before filled ones, keeping newest-first inside each group", () => {
  const list = [
    { id: "f1", filled_at: "x" },
    { id: "o1", filled_at: null },
    { id: "f2", filled_at: "y" },
    { id: "o2", filled_at: null },
  ];
  assert.deepEqual(sortCollabsOpenFirst(list).map((c) => c.id), ["o1", "o2", "f1", "f2"]);
  assert.deepEqual(list.map((c) => c.id), ["f1", "o1", "f2", "o2"], "input not mutated");
});

test("status filter: default shows all (open first); only ?status=open narrows", () => {
  assert.equal(parseCollabStatusFilter(undefined), "all");
  assert.equal(parseCollabStatusFilter("open"), "open");
  assert.equal(parseCollabStatusFilter(["open"]), "open");
  assert.equal(parseCollabStatusFilter("filled"), "all");
  assert.equal(collabsHref({}), "/collabs");
  assert.equal(collabsHref({ status: "open" }), "/collabs?status=open");
  assert.equal(collabsHref({ type: "ride_along", status: "open" }), "/collabs?type=ride_along&status=open");
  assert.equal(collabsHref({ type: "ride_along", status: "all" }), "/collabs?type=ride_along");
});

test("filled beats founding for visitors; the poster always gets their own controls", () => {
  assert.equal(applyBlockReason({ isOwnPosting: false, filled: true, posterIsFounding: true }), "filled");
  assert.equal(applyBlockReason({ isOwnPosting: false, filled: true, posterIsFounding: false }), "filled");
  assert.equal(applyBlockReason({ isOwnPosting: false, filled: false, posterIsFounding: true }), "founding");
  assert.equal(applyBlockReason({ isOwnPosting: true, filled: true, posterIsFounding: false }), "own");
  assert.equal(applyBlockReason({ isOwnPosting: false, filled: false, posterIsFounding: false }), null);
});

test("Mark as filled is offered after an accept, only while the job is open", () => {
  assert.equal(shouldOfferMarkFilled({ filled_at: null }, ["interested", "accepted"]), true);
  assert.equal(shouldOfferMarkFilled({ filled_at: null }, ["interested", "declined"]), false);
  assert.equal(shouldOfferMarkFilled({ filled_at: "x" }, ["accepted"]), false);
});

test("the Jobs board sorts open first, filters, and badges filled collabs", () => {
  const page = src("src/app/(app)/collabs/page.tsx");
  assert.match(page, /sortCollabsOpenFirst\(/);
  assert.match(page, /\.is\("filled_at", null\)/, "Open only must filter in the query");
  assert.match(page, /<CollabFilledBadge \/>/);
  assert.match(page, /filled=\{filled\}/, "the apply control must know the job is filled");
  assert.match(page, /Open only/);
  assert.equal(COLLAB_FILLED_LABEL, "Position filled");
});

test("the apply control hides on filled jobs and the poster gets Mark filled / Reopen", () => {
  const ctl = src("src/components/CollabInterestControl.tsx");
  const filledBranch = ctl.slice(ctl.indexOf('block === "filled"'), ctl.indexOf('block === "founding"'));
  assert.ok(filledBranch.length > 0);
  assert.doesNotMatch(filledBranch, /I&apos;m interested|setOpen\(true\)|CollabApplyForm/);
  assert.match(ctl.slice(ctl.indexOf('block === "own"'), ctl.indexOf('block === "filled"')), /CollabFilledToggle/);
  const mine = src("src/app/(app)/collabs/mine/page.tsx");
  assert.match(mine, /shouldOfferMarkFilled\(/);
  assert.match(mine, /CollabFilledToggle/);
});

test("server actions refuse applications to filled jobs before the Founding check", () => {
  const a = src("src/lib/actions.ts");
  const apply = a.slice(a.indexOf("export async function applyToCollab"), a.indexOf("export async function respondToCollabInterest"));
  const filledAt = apply.indexOf("if (collab.filled_at) return { error: COLLAB_FILLED_MESSAGE }");
  const founding = apply.indexOf("poster?.is_founding_member");
  assert.ok(filledAt > 0 && founding > filledAt, "filled check must come first in applyToCollab");
  const toggle = a.slice(a.indexOf("export async function toggleCollabInterest"), a.indexOf("export async function applyToCollab"));
  assert.match(toggle, /if \(collab\.filled_at\) return;/);
  const setFilled = a.slice(a.indexOf("export async function setCollabFilled"));
  assert.match(setFilled, /\.eq\("poster_id", user\.id\)/, "only the poster's own collab");
  assert.match(a, /hint === "collab_filled"/);
});
