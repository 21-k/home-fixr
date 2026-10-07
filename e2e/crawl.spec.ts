import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, visit, hasHorizontalScroll, overflowingElements } from "./support/fixtures";
import { IS_LIVE } from "./support/env";

// Logged-out crawl of every internal link reachable from the public pages.
// Read-only: only GET navigations, throttled to ~1 page/second in live mode.
//
//   npm run test:e2e:live                       # production, both sizes
//   CRAWL=1 npx playwright test e2e/crawl.spec.ts  # same crawl, local stack
//
// Writes e2e/reports/{live,local-crawl}/<project>.json + .md and a full-page
// screenshot per page into e2e/reports/{live,local-crawl}/<project>/.

const SEEDS = ["/", "/feed", "/mentors", "/collabs", "/collabs/mine", "/search?q=pex", "/about", "/login", "/join"];
const MAX_PAGES = Number(process.env.CRAWL_MAX ?? 400);
const SKIP = [/^\/auth\//, /^\/(opengraph|twitter)-image/, /^\/_next\//];

type PageResult = {
  url: string;
  finalUrl: string;
  status: number | null;
  problems: string[];
  horizontalScroll: boolean;
  overflow: string[];
  screenshot: string;
};

function fileName(path: string) {
  const name = path.replace(/^\//, "").replace(/[^A-Za-z0-9._-]+/g, "_") || "home";
  return name.slice(0, 120);
}

test("crawl every internal link, logged out @live", async ({ page, health }, testInfo) => {
  test.setTimeout(45 * 60_000);
  const dir = `e2e/reports/${IS_LIVE ? "live" : "local-crawl"}`;
  const shotDir = `${dir}/${testInfo.project.name}`;
  mkdirSync(shotDir, { recursive: true });

  const origin = new URL(testInfo.project.use.baseURL ?? "http://localhost:3000").origin;
  const queue = [...SEEDS];
  const seen = new Set(queue);
  const results: PageResult[] = [];

  while (queue.length && results.length < MAX_PAGES) {
    const path = queue.shift()!;
    health.drain();
    let status: number | null = null;
    try {
      const res = await visit(page, path);
      status = res?.status() ?? null;
    } catch (e) {
      health.add(`navigation error: ${(e as Error).message.slice(0, 200)}`);
    }
    const shot = `${shotDir}/${fileName(path)}.jpg`;
    await page.screenshot({ path: shot, fullPage: true, type: "jpeg", quality: 60 }).catch(() => {});
    const result: PageResult = {
      url: path,
      finalUrl: page.url().replace(origin, ""),
      status,
      problems: health.drain(),
      horizontalScroll: await hasHorizontalScroll(page).catch(() => false),
      overflow: await overflowingElements(page).catch(() => []),
      screenshot: shot,
    };
    results.push(result);

    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href))
      .catch(() => [] as string[]);
    for (const href of hrefs) {
      const u = new URL(href);
      if (u.origin !== origin) continue;
      // Every page's "Sign in" carries its own ?next=; crawl the auth pages once.
      const key = /^\/(login|join)$/.test(u.pathname) ? u.pathname : u.pathname + u.search;
      if (SKIP.some((re) => re.test(u.pathname)) || seen.has(key)) continue;
      seen.add(key);
      queue.push(key);
    }
  }

  const bad = results.filter(
    (r) => r.status !== 200 || r.problems.length || r.horizontalScroll || r.overflow.length,
  );
  writeFileSync(`${dir}/${testInfo.project.name}.json`, JSON.stringify({ origin, results }, null, 2));
  const md = [
    `# Crawl: ${origin} (${testInfo.project.name})`,
    "",
    `${results.length} pages crawled, ${bad.length} with problems. Unvisited queue: ${queue.length}.`,
    "",
    "| page | final URL | status | problems |",
    "|---|---|---|---|",
    ...bad.map(
      (r) =>
        `| ${r.url} | ${r.finalUrl} | ${r.status} | ${[
          ...r.problems,
          ...(r.horizontalScroll ? ["horizontal scroll"] : []),
          ...r.overflow.map((o) => `overflow: ${o}`),
        ]
          .join("<br>")
          .replace(/\|/g, "\\|")} |`,
    ),
  ].join("\n");
  writeFileSync(`${dir}/${testInfo.project.name}.md`, md + "\n");

  expect(results.length).toBeGreaterThan(20);
  expect(bad.map((r) => `${r.url} -> ${r.status}`), "pages with problems (see report)").toEqual([]);
});
