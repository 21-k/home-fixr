// Screenshots of any local page, desktop (1280) and mobile (390, 2x).
//   node tests/app/screens.mjs /feed seed/reports/screens/feed feed [--mobile-max 5000]
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chrome } from "./chrome.mjs";

const [path, dir, name] = process.argv.slice(2);
const at = (f, d) => (process.argv.includes(f) ? Number(process.argv[process.argv.indexOf(f) + 1]) : d);
const APP = process.env.APP ?? "http://localhost:3000";
if (!path || !dir || !name || !/^(localhost|127\.0\.0\.1)$/.test(new URL(APP).hostname)) {
  console.error("usage: node tests/app/screens.mjs PATH OUTDIR NAME  (local app only)");
  process.exit(2);
}
mkdirSync(dir, { recursive: true });
const b = await chrome(APP);
try {
  await b.shot(path, join(dir, `${name}-desktop.png`), { width: 1280, maxHeight: at("--desktop-max", 6000) });
  await b.shot(path, join(dir, `${name}-mobile.png`), { width: 390, height: 844, mobile: true, maxHeight: at("--mobile-max", 4200) });
} finally {
  b.close();
}
