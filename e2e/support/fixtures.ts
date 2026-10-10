import { test as base, expect, type Page, type Response } from "@playwright/test";
import { IS_LIVE, LIVE_THROTTLE_MS } from "./env";

/**
 * Page-health problems collected while a test runs: console errors, hydration
 * warnings, uncaught exceptions and failed (4xx/5xx or aborted-by-error)
 * requests. Every test fails at teardown if any were seen, unless the test
 * allowed them with `health.allow(/pattern/)` (e.g. the 404 page's own status).
 */
export class Health {
  problems: string[] = [];
  private allowed: RegExp[] = [];

  allow(pattern: RegExp) {
    this.allowed.push(pattern);
  }

  add(problem: string) {
    if (this.allowed.some((re) => re.test(problem))) return;
    this.problems.push(problem);
  }

  /** Problems seen so far, then cleared (for crawls that report per page). */
  drain(): string[] {
    const p = this.problems;
    this.problems = [];
    return p;
  }
}

// Noise that is not an app defect.
const IGNORED_CONSOLE = [
  /Download the React DevTools/,
  /\[HMR\]/,
  /\[Fast Refresh\]/,
  // Vercel Analytics/Speed Insights debug lines on production.
  /\[Vercel (Web Analytics|Speed Insights)\]/,
];

export function watchHealth(page: Page, health: Health) {
  page.on("console", (msg) => {
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    const isHydration = /hydrat|did not match|server rendered HTML/i.test(text);
    if (msg.type() === "error" || (msg.type() === "warning" && isHydration)) {
      health.add(`console.${msg.type()} on ${page.url()}: ${text.slice(0, 500)}`);
    }
  });
  page.on("pageerror", (err) => {
    health.add(`pageerror on ${page.url()}: ${err.message.slice(0, 500)}`);
  });
  page.on("response", (res: Response) => {
    const status = res.status();
    if (status >= 400) {
      health.add(`HTTP ${status} ${res.request().method()} ${res.url()}`);
    }
  });
  page.on("requestfailed", (req) => {
    const failure = req.failure()?.errorText ?? "";
    // Prefetches and in-flight RSC requests are aborted on navigation: normal.
    if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(failure)) return;
    health.add(`request failed ${req.method()} ${req.url()}: ${failure}`);
  });
}

let lastLiveLoad = 0;

/** page.goto, throttled in live mode so production sees ~1 page per second. */
export async function visit(page: Page, url: string) {
  if (IS_LIVE) {
    const wait = lastLiveLoad + LIVE_THROTTLE_MS - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    lastLiveLoad = Date.now();
  }
  const res = await page.goto(url, { waitUntil: "load" });
  // Let client components hydrate so hydration errors surface.
  await page.waitForLoadState("networkidle").catch(() => {});
  return res;
}

/** Elements that stick out past the right edge of the viewport. */
export async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    const clipped = (el: Node) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true;
      }
      return false;
    };
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.position === "fixed") continue;
      if (r.right > vw + 1 && !clipped(el)) {
        const id = el.id ? `#${el.id}` : "";
        const cls = typeof el.className === "string" ? "." + el.className.split(/\s+/).slice(0, 3).join(".") : "";
        const text = (el.textContent ?? "").trim().slice(0, 40);
        out.push(`${el.tagName.toLowerCase()}${id}${cls} right=${Math.round(r.right)} vw=${vw} "${text}"`);
      }
    }
    // Text that overflows its own box (a long unbroken URL) doesn't widen the
    // element, so check text nodes too.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim() || !n.parentElement) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width === 0 || r.right <= vw + 1) continue;
      const style = getComputedStyle(n.parentElement);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (!clipped(n) && !n.parentElement.closest("[hidden]")) {
        out.push(`text "${n.textContent.trim().slice(0, 40)}" right=${Math.round(r.right)} vw=${vw}`);
      }
    }
    // Only report the outermost offenders.
    return out.slice(0, 5);
  });
}

/** Horizontal page scroll (the classic mobile layout bug). */
export async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

/** Assert the layout fits the viewport. */
export async function expectFitsViewport(page: Page) {
  expect.soft(await hasHorizontalScroll(page), `horizontal scroll on ${page.url()}`).toBe(false);
  expect.soft(await overflowingElements(page), `elements past the viewport edge on ${page.url()}`).toEqual([]);
}

export const test = base.extend<{ health: Health }>({
  health: [
    async ({ page }, use, testInfo) => {
      const health = new Health();
      watchHealth(page, health);
      await use(health);
      if (health.problems.length) {
        await testInfo.attach("health-problems", {
          body: health.problems.join("\n"),
          contentType: "text/plain",
        });
      }
      expect(health.problems, "page health problems (console/network/hydration)").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
