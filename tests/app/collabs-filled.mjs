// Script-based end-to-end check for "Position filled" collabs (migration 0013),
// run against the LOCAL stack: `npm run dev` + local Supabase with the
// Founding batch's collabs seeded. (The Playwright suite lives on
// fix/ui-navigation / PR #7, not on this branch; port this there once both
// land.)
//
//   node tests/app/collabs-filled.mjs                       # the checks below
//   node tests/app/collabs-filled.mjs --screens DIR         # + screenshots (headless Chrome)
//   node tests/app/collabs-filled.mjs --print-cookie        # a signed-in member's Cookie header (for qa.py)
//   node tests/app/collabs-filled.mjs --cleanup             # delete the throwaway members
//
// What it proves, through the real app (server actions, RLS, triggers):
//   1. A signed-in real member sees every seeded collab as "Position filled"
//      with no apply control, open collabs first, and "Open only" hides them.
//   2. A real poster's flow: post -> someone applies -> accept -> My jobs offers
//      "Mark as filled" -> the real server action fills it -> the board shows
//      Position filled (Reopen for the poster, "You're in" for the applicant),
//      a new application is refused by the DB -> Reopen (server action) ->
//      open again.
// Throwaway members use @hf-check.test emails and are deleted at the end.
import { createServerClient } from "@supabase/ssr";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { chrome } from "./chrome.mjs";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const APP = opt("--app", "http://localhost:3000").replace(/\/$/, "");
const SCREENS = opt("--screens", "");
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_home-fixr";
const EMAIL_DOMAIN = "hf-check.test";

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
for (const u of [SB_URL, APP]) {
  const h = new URL(u).hostname;
  if (!["127.0.0.1", "localhost"].includes(h)) {
    console.error(`refusing: ${u} is not local`);
    process.exit(2);
  }
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
  }).toString().trim();
}

/** A real local member, signed in through Supabase Auth, with the app's cookies. */
async function member(tag) {
  const jar = new Map();
  const client = createServerClient(SB_URL, SB_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const stamp = Date.now().toString(36).slice(-6);
  const email = `${tag}-${stamp}@${EMAIL_DOMAIN}`;
  const { data, error } = await client.auth.signUp({
    email,
    password: `Check-${stamp}-pw!`,
    options: { data: { full_name: `Check ${tag}`, username: `hfcheck_${tag}_${stamp}`.slice(0, 22) } },
  });
  if (error || !data.session) throw new Error(`sign-up failed for ${email}: ${error?.message ?? "no session"}`);
  return {
    client,
    id: data.user.id,
    email,
    cookie: () => [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    jar,
  };
}

async function page(path, who) {
  const res = await fetch(APP + path, { headers: who ? { Cookie: who.cookie() } : {}, redirect: "manual" });
  return { status: res.status, html: await res.text() };
}

function cards(html) {
  return html
    .split(/(?=<div[^>]*data-testid="collab-card")/)
    .slice(1)
    .map((chunk) => ({
      chunk,
      filled: chunk.includes('data-filled="true"'),
      title: (chunk.match(/<h3[^>]*>(.*?)<\/h3>/s)?.[1] ?? "")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&#x27;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .trim(),
    }));
}
const APPLY_RE = /I(&#x27;|&apos;|')m interested|Edit application/;

/** Submit a server-action form the way a no-JS browser does (progressive enhancement). */
async function submitActionForm(path, who, testId) {
  const { html } = await page(path, who);
  const at = html.indexOf(`data-testid="${testId}"`);
  if (at < 0) return { ok: false, why: `no ${testId} on ${path}` };
  const formStart = html.lastIndexOf("<form", at);
  const form = html.slice(formStart, html.indexOf("</form>", at));
  const fd = new FormData();
  for (const m of form.matchAll(/<input[^>]*>/g)) {
    const name = m[0].match(/name="([^"]+)"/)?.[1];
    const value = m[0].match(/value="([^"]*)"/)?.[1] ?? "";
    if (name) fd.append(name, value.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  }
  if (![...fd.keys()].some((k) => k.startsWith("$ACTION_ID_"))) return { ok: false, why: "no $ACTION_ID_ field" };
  const res = await fetch(APP + path, { method: "POST", body: fd, headers: { Cookie: who.cookie() }, redirect: "manual" });
  return { ok: res.status < 400, why: `HTTP ${res.status}` };
}

async function cleanup() {
  const n = psql(`with d as (delete from auth.users where email like '%@${EMAIL_DOMAIN}' returning 1) select count(*) from d;`);
  console.log(`cleanup: deleted ${n} throwaway members (@${EMAIL_DOMAIN})`);
}

// ------------------------------------------------------------------ checks
async function seededChecks(viewer) {
  const seeded = JSON.parse(readFileSync(join(ROOT, "seed/content/collabs.json"), "utf8")).collabs;
  const { status, html } = await page("/collabs", viewer);
  const cs = cards(html);
  const byTitle = new Map(cs.map((c) => [c.title, c]));
  const missing = seeded.filter((c) => !byTitle.has(c.title)).map((c) => c.id);
  const notFilled = seeded.filter((c) => byTitle.has(c.title) && !(byTitle.get(c.title).filled && byTitle.get(c.title).chunk.includes("Position filled"))).map((c) => c.id);
  const withApply = seeded.filter((c) => byTitle.has(c.title) && APPLY_RE.test(byTitle.get(c.title).chunk)).map((c) => c.id);
  check("signed in: /collabs renders as a signed-in member", status === 200 && html.includes('href="/collabs/mine"'), `HTTP ${status}`);
  check(`signed in: all ${seeded.length} seeded collabs show Position filled`, !missing.length && !notFilled.length, `missing ${missing} not filled ${notFilled}`);
  check("signed in: no apply / I'm interested control on any seeded collab", !withApply.length, withApply.join(","));
  const flags = cs.map((c) => c.filled);
  check("signed in: open collabs come before filled ones", flags.join() === [...flags].sort().join(), `${flags.filter((f) => !f).length} open, ${flags.filter(Boolean).length} filled`);
  const open = await page("/collabs?status=open", viewer);
  const leaked = seeded.filter((c) => cards(open.html).some((x) => x.title === c.title)).map((c) => c.id);
  check("signed in: Open only hides every seeded collab", open.status === 200 && !leaked.length, leaked.join(","));
}

async function posterFlow(poster, applicant, other) {
  const title = `Check collab ${Date.now().toString(36)}`;
  const { data: col, error } = await poster.client
    .from("job_collabs")
    .insert({ poster_id: poster.id, type: "extra_hand", title, body: "Throwaway collab for the filled check.", trade: "plumbing", location: "Clifton, NJ", pay_type: "day_rate" })
    .select("id")
    .single();
  check("poster: a real member can post a collab", !error && col, error?.message);
  if (!col) return;
  let c = cards((await page("/collabs", applicant)).html).find((x) => x.title === title);
  check("applicant: the new collab is open with an I'm interested button", c && !c.filled && APPLY_RE.test(c.chunk));
  const { data: app, error: aerr } = await applicant.client
    .from("collab_interests")
    .insert({ collab_id: col.id, user_id: applicant.id, note: "I can help." })
    .select("id")
    .single();
  check("applicant: can apply while it's open", !aerr && app, aerr?.message);
  const { error: rerr } = await poster.client.from("collab_interests").update({ status: "accepted" }).eq("id", app?.id);
  check("poster: accepts the applicant", !rerr, rerr?.message);
  const mine = await page("/collabs/mine", poster);
  check("poster: My jobs offers Mark as filled right after the accept", mine.html.includes('data-testid="offer-mark-filled"') && mine.html.includes('data-testid="collab-mark-filled"'));
  const sub = await submitActionForm("/collabs/mine", poster, "collab-mark-filled");
  const { data: row } = await poster.client.from("job_collabs").select("filled_at").eq("id", col.id).single();
  check("poster: the Mark as filled server action fills the collab", sub.ok && row?.filled_at, `${sub.why}; filled_at ${row?.filled_at}`);
  c = cards((await page("/collabs", poster)).html).find((x) => x.title === title);
  check("poster: board shows Position filled with a Reopen control", c?.filled && c.chunk.includes("Position filled") && c.chunk.includes('data-testid="collab-reopen"'));
  c = cards((await page("/collabs", applicant)).html).find((x) => x.title === title);
  check("accepted applicant: sees Position filled + You're in, no apply control", c?.filled && /You(&#x27;|&apos;|')re in/.test(c.chunk) && !APPLY_RE.test(c.chunk));
  c = cards((await page("/collabs", other)).html).find((x) => x.title === title);
  check("another member: sees Position filled and no apply control", c?.filled && !APPLY_RE.test(c.chunk));
  const { error: lateErr } = await other.client.from("collab_interests").insert({ collab_id: col.id, user_id: other.id, note: "late" });
  check("another member: applying to the filled collab is refused by the DB", lateErr && /filled/i.test(lateErr.message), lateErr?.message);
  const { error: rpcErr } = await other.client.rpc("express_collab_interest", { p_collab_id: col.id, p_note: "late" });
  check("another member: the old RPC is refused too", rpcErr && /filled/i.test(rpcErr.message), rpcErr?.message);
  const sub2 = await submitActionForm("/collabs/mine", poster, "collab-reopen");
  const { data: row2 } = await poster.client.from("job_collabs").select("filled_at").eq("id", col.id).single();
  check("poster: the Reopen server action reopens it", sub2.ok && row2 && row2.filled_at === null, sub2.why);
  c = cards((await page("/collabs", other)).html).find((x) => x.title === title);
  check("another member: reopened collab is open again with I'm interested", c && !c.filled && APPLY_RE.test(c.chunk));
  const { error: hijack } = await other.client.from("job_collabs").update({ filled_at: new Date().toISOString() }).eq("id", col.id).select("id");
  const { data: row3 } = await poster.client.from("job_collabs").select("filled_at").eq("id", col.id).single();
  check("another member: can't mark someone else's collab filled", !hijack && row3?.filled_at === null);
  return { collabId: col.id, title };
}

// --------------------------------------------------------------------- main
if (flag("--cleanup")) {
  await cleanup();
  process.exit(0);
}
if (flag("--print-cookie")) {
  const m = await member("viewer");
  console.log(m.cookie());
  process.exit(0);
}

let failed = false;
try {
  const viewer = await member("viewer");
  const poster = await member("poster");
  const other = await member("other");
  await seededChecks(viewer);
  let b = null;
  let first = null;
  if (SCREENS) {
    // Board screenshots before the throwaway poster flow adds its own collab.
    mkdirSync(SCREENS, { recursive: true });
    const seeded = JSON.parse(readFileSync(join(ROOT, "seed/content/collabs.json"), "utf8")).collabs;
    first = psql(`select id from job_collabs where seed_batch_id = 'fm-2026-10' and title = '${seeded[0].title.replace(/'/g, "''")}'`);
    b = await chrome(APP);
    await b.shot("/collabs", join(SCREENS, "collabs-desktop.png"), { width: 1280 });
    await b.shot("/collabs", join(SCREENS, "collabs-mobile.png"), { width: 390, height: 844, mobile: true, maxHeight: 4200 });
    await b.shot("/collabs", join(SCREENS, "filled-collab-card.png"), { width: 1280, selector: `#collab-${first}` });
    await b.shot("/collabs", join(SCREENS, "filled-collab-card-signed-in.png"), { width: 1280, selector: `#collab-${first}`, cookie: viewer.cookie() });
    await b.shot("/collabs?status=open", join(SCREENS, "collabs-open-only.png"), { width: 1280, cookie: viewer.cookie() });
  }
  const flow = await posterFlow(poster, viewer, other);
  if (SCREENS) {
    try {
      if (flow) {
        // The poster's view right after an accept: put the throwaway collab back in that state.
        psql(`update collab_interests set status = 'accepted' where collab_id = '${flow.collabId}'; update job_collabs set filled_at = null where id = '${flow.collabId}';`);
        await b.shot("/collabs/mine", join(SCREENS, "my-jobs-offer-mark-filled.png"), { width: 1280, selector: `#collab-${flow.collabId}`, cookie: poster.cookie() });
      }
    } finally {
      b.close();
    }
  }
} catch (e) {
  console.error(e);
  failed = true;
} finally {
  if (!flag("--keep")) await cleanup();
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(failed || bad.length ? 1 : 0);
