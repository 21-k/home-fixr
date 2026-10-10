// Headless Chrome over the DevTools protocol, for the script-based app checks
// (no Playwright on this branch). Local app only.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function chrome(APP = "http://localhost:3000") {
  const port = 9300 + Math.floor(Math.random() * 500);
  const dir = mkdtempSync(join(tmpdir(), "hf-chrome-"));
  const proc = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--hide-scrollbars", "--no-first-run", "about:blank",
  ], { stdio: "ignore" });
  let ver;
  for (let i = 0; i < 50 && !ver; i++) {
    await new Promise((r) => setTimeout(r, 200));
    ver = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).catch(() => null);
  }
  const target = ver.find((t) => t.type === "page");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) {
      waiters.filter((w) => w.method === msg.method).forEach((w) => w.resolve(msg));
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const once = (method) => new Promise((resolve) => waiters.push({ method, resolve }));
  await send("Page.enable");
  await send("Network.enable");
  return {
    send,
    async shot(path, file, { width = 1280, height = 900, mobile = false, cookie = null, selector = null, maxHeight = 16000 } = {}) {
      await send("Network.clearBrowserCookies");
      if (cookie) {
        for (const part of cookie.split("; ")) {
          const i = part.indexOf("=");
          await send("Network.setCookie", { name: part.slice(0, i), value: part.slice(i + 1), url: APP });
        }
      }
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
      const loaded = once("Page.loadEventFired");
      await send("Page.navigate", { url: APP + path });
      await loaded;
      await new Promise((r) => setTimeout(r, 1200));
      let clip;
      if (selector) {
        const { result } = await send("Runtime.evaluate", {
          expression: `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView(); const r = e.getBoundingClientRect(); return JSON.stringify({x: r.x + scrollX - 12, y: r.y + scrollY - 12, width: r.width + 24, height: r.height + 24}); })()`,
          returnByValue: true,
        });
        if (!result.value) throw new Error(`no ${selector} on ${path}`);
        clip = { ...JSON.parse(result.value), scale: 1 };
      } else {
        const { result } = await send("Runtime.evaluate", { expression: "window.scrollTo(0, 0); document.documentElement.scrollHeight", returnByValue: true });
        // Grow the viewport to the page (capped) and shoot it whole: no clip offsets.
        const full = Math.min(result.value, maxHeight);
        await send("Emulation.setDeviceMetricsOverride", { width, height: full, deviceScaleFactor: mobile ? 2 : 1, mobile });
        await new Promise((r) => setTimeout(r, 500));
        await send("Runtime.evaluate", { expression: "window.scrollTo(0, 0)" });
      }
      const { data } = await send("Page.captureScreenshot", clip ? { format: "png", captureBeyondViewport: true, clip } : { format: "png" });
      writeFileSync(file, Buffer.from(data, "base64"));
      console.log(`screenshot ${file}`);
    },
    close() {
      ws.close();
      proc.kill();
    },
  };
}

