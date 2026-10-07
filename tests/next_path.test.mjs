// ?next= must only ever be a same-site path (no open redirects).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loginHref, safeNext } from "../src/lib/next-path.ts";

test("safeNext keeps same-site paths", () => {
  assert.equal(safeNext("/messages"), "/messages");
  assert.equal(safeNext("/messages/Kash_sing"), "/messages/Kash_sing");
  assert.equal(safeNext("/mentors?trade=hvac&region=NJ"), "/mentors?trade=hvac&region=NJ");
});

test("safeNext rejects anything that could leave the site or loop", () => {
  for (const bad of [null, undefined, "", "https://evil.example", "//evil.example", "/\\evil.example",
    "@evil.example", "evil.example", "/ok\nLocation: x", "/login", "/login?next=/x", "/join", "/auth/callback"]) {
    assert.equal(safeNext(bad), null, String(bad));
  }
});

test("loginHref carries an encoded next, but not for / or unsafe values", () => {
  assert.equal(loginHref("/u/Kash_sing"), "/login?next=%2Fu%2FKash_sing");
  assert.equal(loginHref("/"), "/login");
  assert.equal(loginHref("//evil.example"), "/login");
  assert.equal(loginHref(undefined), "/login");
});
