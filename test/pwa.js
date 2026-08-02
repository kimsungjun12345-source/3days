/* PWA 검사 — 서비스 워커·매니페스트·오프라인 동작.
 * 서비스 워커는 file://에서 등록되지 않으므로 임시 서버를 띄워 확인한다.
 *
 *   node test/pwa.js
 */

const { chromium } = require("playwright-core");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = 8931;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]);
      let file = path.join(ROOT, rel === "/" ? "index.html" : rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, () => resolve(server));
  });
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));


  // 인트로와 첫 사용 안내는 실제 흐름이지만, 아래 검사들의 대상은 아니다.
  // 프로덕션 코드를 건드리지 않고 테스트에서만 건너뛴다.
  await page.addInitScript(() => {
    localStorage.setItem("jaksim3.onboarded", "1");
    const style = document.createElement("style");
    style.textContent = ".intro{display:none !important}";
    const put = () => document.head && document.head.appendChild(style);
    if (document.head) put();
    else document.addEventListener("DOMContentLoaded", put);
  });

  const assert = (cond, name) => {
    console.log((cond ? "PASS" : "FAIL") + "  " + name);
    if (!cond) process.exitCode = 1;
  };

  const base = `http://localhost:${PORT}/`;
  await page.goto(base, { waitUntil: "load" });

  // 매니페스트
  const mf = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const res = await fetch(link.href);
    return res.json();
  });
  assert(mf.name === "작심삼일", "manifest names the app");
  assert(mf.display === "standalone", "manifest opens without browser chrome");
  assert(mf.icons.some((i) => i.sizes === "512x512" && i.purpose === "any"), "manifest has a 512 icon");
  assert(mf.icons.some((i) => i.purpose === "maskable"), "manifest has a maskable icon for android");
  assert(mf.start_url === "./" && mf.scope === "./", "manifest scope works from any hosting path");

  // 아이콘 파일이 실제로 존재하는지
  for (const icon of mf.icons) {
    const res = await page.evaluate((src) => fetch(src).then((r) => ({ ok: r.ok, type: r.headers.get("content-type") })), icon.src);
    assert(res.ok, `icon file exists: ${icon.src}`);
  }

  // 서비스 워커
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return { scope: r.scope, active: !!r.active };
  });
  assert(reg.active, "service worker activates");

  await page.waitForTimeout(1200);
  const cache = await page.evaluate(async () => {
    const names = await caches.keys();
    const appCache = names.find((n) => n.includes("app"));
    if (!appCache) return { count: 0 };
    const c = await caches.open(appCache);
    return { count: (await c.keys()).length };
  });
  assert(cache.count >= 8, `app shell is cached (${cache.count} files)`);

  // 오프라인에서 앱이 열리고, 실제로 쓸 수 있어야 한다
  await ctx.setOffline(true);
  await page.reload({ waitUntil: "load" });
  assert((await page.title()) === "작심삼일", "app still opens with no network");
  assert(
    (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(247, 246, 243)",
    "styles survive offline (css came from cache)"
  );
  assert(await page.locator("#btn-add").isVisible(), "app is interactive offline");

  await page.click("#btn-add");
  await page.fill("#input-title", "오프라인에서 쌓기");
  await page.click("#form-add button[type=submit]");
  await page.click(".goal-card .btn-primary");
  await page.waitForTimeout(300);
  assert((await page.locator(".goal-card .dot.done").count()) === 1, "a stone can be placed while offline");

  await page.reload({ waitUntil: "load" });
  assert((await page.locator(".goal-card").count()) === 1, "offline record survives a reload");

  await ctx.setOffline(false);

  // iOS에는 설치 이벤트가 없으므로 안내 문구가 대신 떠야 한다
  const ios = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const iosPage = await ios.newPage();
  await iosPage.goto(base, { waitUntil: "load" });
  await iosPage.waitForTimeout(400);
  assert(await iosPage.locator("#btn-install").isVisible(), "iOS gets an install hint");
  assert(
    (await iosPage.locator("#install-sub").textContent()).includes("홈 화면에 추가"),
    "iOS hint explains the share-sheet route"
  );

  assert(errors.length === 0, "no console/page errors" + (errors.length ? " → " + errors.join("; ") : ""));

  await browser.close();
  server.close();
})();
