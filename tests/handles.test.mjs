// Unit checks for the pure handle/display helpers. Node strips the TS types.
//   node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleFormatError, suggestHandles, handleErrorMessage } from "../src/lib/handles.ts";
import { displayName, firstNameInitial } from "../src/lib/display.ts";

test("handle format mirrors public.handle_format_error()", () => {
  assert.equal(handleFormatError("RaritanSparky"), null);
  assert.equal(handleFormatError("Kaylee.wires"), null);
  assert.equal(handleFormatError("ab"), "too_short");
  assert.equal(handleFormatError("a".repeat(23)), "too_long");
  assert.equal(handleFormatError("bad-dash"), "bad_chars");
  assert.equal(handleFormatError(".lead"), "dot_edge");
  assert.equal(handleFormatError("trail."), "dot_edge");
  assert.equal(handleFormatError(""), "empty");
});

test("suggestions are valid, distinct, at most three, and use name/trade/town", () => {
  const s = suggestHandles({ fullName: "Marcus Daniels", trade: "electrical", region: "Old Bridge, NJ" });
  assert.ok(s.length >= 2 && s.length <= 3, JSON.stringify(s));
  for (const h of s) assert.equal(handleFormatError(h), null, h);
  assert.equal(new Set(s.map((h) => h.toLowerCase())).size, s.length);
  assert.ok(s.includes("MarcusD_Elec"), JSON.stringify(s));
  assert.ok(s.includes("Marcus_OldBridge"), JSON.stringify(s));
});

test("suggestions still work with no name (Google placeholder) or no town", () => {
  const s = suggestHandles({ fullName: "New Member", trade: null, region: null });
  assert.ok(s.length >= 1);
  for (const h of s) assert.equal(handleFormatError(h), null, h);
});

test("displayName honours display_preference and never leaks full name for handle users", () => {
  const p = { username: "ShorePipes", full_name: "Dana Russo" };
  assert.equal(displayName({ ...p, display_preference: "handle" }), "ShorePipes");
  assert.equal(displayName({ ...p, display_preference: "first_name_initial" }), "Dana R.");
  assert.equal(displayName({ ...p, display_preference: "full_name" }), "Dana Russo");
  assert.equal(displayName({ ...p, display_preference: undefined }), "ShorePipes");
  assert.equal(displayName({ username: "x_y", full_name: "New Member", display_preference: "full_name" }), "x_y");
  assert.equal(displayName(null), "Unknown");
  assert.equal(firstNameInitial("Marcus"), "Marcus");
});

test("DB error hints map to friendly copy", () => {
  assert.match(handleErrorMessage({ message: "x", hint: "handle_taken" }), /taken/);
  assert.match(handleErrorMessage({ message: "x", hint: "handle_rate_limited" }), /30 days/);
  assert.match(handleErrorMessage({ message: 'duplicate key value violates unique constraint "profiles_username_lower_idx"' }), /taken/);
});
