// Where the suite points, and whether it may touch anything.
//
//   npm run test:e2e        -> local dev server + local Supabase (read/write OK)
//   npm run test:e2e:live   -> BASE_URL=https://www.home-fixr.com, logged out,
//                              read-only, throttled to ~1 page/second.

export const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

/** Anything that isn't localhost is treated as production: read-only. */
export const IS_LIVE = !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(BASE_URL);

// Local Supabase defaults (the well-known demo keys `npx supabase start` prints).
// Never used in live mode.
export const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/** Minimum gap between page loads in live mode (be gentle with production). */
export const LIVE_THROTTLE_MS = 1100;

export const DESKTOP = { width: 1280, height: 800 };
export const MOBILE = { width: 390, height: 844 };
