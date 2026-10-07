import { defineConfig } from "@playwright/test";
import { BASE_URL, DESKTOP, IS_LIVE, MOBILE } from "./e2e/support/env";

// Local (`npm run test:e2e`): starts `npm run dev` (pointed at local Supabase by
// .env.local), creates local test users, runs everything except the live crawl.
//
// Live (`npm run test:e2e:live`, BASE_URL=https://www.home-fixr.com): logged
// out, read-only, one worker, throttled. Only tests tagged @public (safe GETs)
// and @live (the crawl) run; no setup, no logins, no form submissions.

const mobile = { viewport: MOBILE, isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: "./e2e",
  // Separate dirs so a live run and a local run can go at the same time
  // (each wipes its outputDir on start).
  outputDir: IS_LIVE ? "./e2e/.results-live" : "./e2e/.results",
  timeout: IS_LIVE ? 30 * 60_000 : 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: !IS_LIVE,
  workers: IS_LIVE ? 1 : process.env.CI ? 2 : 4,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: IS_LIVE ? "e2e/.report-live" : "e2e/.report", open: "never" }]],
  grep: IS_LIVE ? /@public|@live/ : undefined,
  // The crawl (@live) runs locally only when asked for (CRAWL=1); the
  // screenshot pass (@screens) only with SHOTS=<dir>.
  grepInvert: IS_LIVE
    ? undefined
    : new RegExp(
        [process.env.CRAWL ? null : "@live", process.env.SHOTS ? null : "@screens"]
          .filter(Boolean)
          .join("|") || "$^",
      ),
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 45_000,
  },
  projects: IS_LIVE
    ? [
        { name: "desktop", use: { viewport: DESKTOP } },
        { name: "mobile", use: mobile },
      ]
    : [
        { name: "setup", testMatch: /auth\.setup\.ts/, use: { viewport: DESKTOP } },
        { name: "desktop", use: { viewport: DESKTOP }, dependencies: ["setup"] },
        { name: "mobile", use: mobile, dependencies: ["setup"] },
      ],
  webServer: IS_LIVE
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
