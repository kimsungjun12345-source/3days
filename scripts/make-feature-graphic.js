/* 구글 플레이 그래픽 이미지(Feature Graphic)를 만든다.
 *
 * 스토어 앱 페이지 맨 위에 걸리는 1024×500 가로 배너다. Play는 이것 없이
 * 스토어 등록정보를 완료시켜 주지 않는다. 스크린샷과 같은 방식으로, 앱의
 * 진짜 돌탑 정원을 렌더해 왼쪽엔 이름과 문구, 오른쪽엔 정원을 둔다.
 *
 * 크기는 정확히 1024×500이어야 한다(Play 규격). 그래서 deviceScaleFactor를
 * 1로 두고 그대로 찍는다 — 2로 키우면 2048×1000이 되어 규격에서 벗어난다.
 *
 *   node scripts/make-feature-graphic.js
 */

const { launchBrowser } = require("../test/browser");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "store", "feature-graphic.png");
const PORT = 8947;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]);
      const file = path.join(ROOT, rel === "/" ? "index.html" : rel);
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

function dstr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* 여러 채가 선 정원이어야 배너가 풍성하다 — 오래 다닌 사람의 모습 */
const GOALS = [
  { id: "a", title: "아침에 물 한 잔", icon: "water", checks: [dstr(-1)], lastCheckDate: dstr(-1),
    totalDays: 26, completedCycles: 7, restarts: 3 },
  { id: "b", title: "자기 전 스트레칭", icon: "meditate", checks: [dstr(-2), dstr(-1)], lastCheckDate: dstr(-1),
    totalDays: 17, completedCycles: 5, restarts: 2 },
  { id: "c", title: "책 10쪽", icon: "book", checks: [dstr(-1)], lastCheckDate: dstr(-1),
    totalDays: 11, completedCycles: 3, restarts: 1 },
  { id: "d", title: "10분 걷기", icon: "run", checks: [dstr(-1)], lastCheckDate: dstr(-1),
    totalDays: 8, completedCycles: 2, restarts: 1 },
  { id: "e", title: "일기 세 줄", icon: "pen", checks: [dstr(-1)], lastCheckDate: dstr(-1),
    totalDays: 5, completedCycles: 1, restarts: 0 },
];

// 돌 색은 style.css의 CSS 변수(--stone-*)와 톤 클래스에서 온다. setContent는
// 기준 URL이 없어 <link>가 안 먹으므로, 스타일을 통째로 인라인한다.
const APP_CSS = fs.readFileSync(path.join(ROOT, "style.css"), "utf8");

function bannerHTML(gardenSvg) {
  return `<!DOCTYPE html><meta charset="utf-8">
  <style>${APP_CSS}</style>
  <style>
    html, body { margin:0; padding:0; }
    /* Play 규격 그대로 1024×500 */
    .fg {
      width:1024px; height:500px; position:relative; overflow:hidden;
      background: radial-gradient(120% 140% at 18% 20%, #fbfaf7 0%, #f4f2ec 60%, #efece5 100%);
      font-family: "IBM Plex Sans KR", "Noto Sans KR", -apple-system, sans-serif;
      display:flex; align-items:center;
    }
    /* 왼쪽 — 이름과 문구 */
    .fg-copy { padding-left:80px; width:560px; z-index:2; }
    /* 워드마크는 앱바와 같은 락업 — 먹빛 돌탑 마크 + 단색 이름(코랄 강조 없음) */
    .fg-brand {
      display:flex; align-items:center; gap:20px;
      font-size:88px; font-weight:800; letter-spacing:-0.02em; line-height:1;
      color:#1b1a18; margin:0;
    }
    .fg-mark { display:inline-flex; }
    .fg-mark svg { display:block; }
    .fg-tag {
      font-size:31px; font-weight:600; color:#3c3833; margin:26px 0 0;
      letter-spacing:-0.01em;
    }
    .fg-sub {
      font-size:22px; font-weight:500; color:#9a938a; margin:12px 0 0;
      letter-spacing:-0.01em;
    }
    /* 오른쪽 — 진짜 돌탑 정원 */
    .fg-garden {
      position:absolute; right:-10px; bottom:-6px; width:560px; height:500px;
      display:flex; align-items:flex-end; justify-content:center;
    }
    .fg-garden svg { width:100%; height:auto; }
    /* 왼쪽 글자 뒤로 정원이 살짝 겹쳐도 읽히게, 글자 쪽에 옅은 밝은 기운 */
    .fg-veil {
      position:absolute; inset:0;
      background: linear-gradient(90deg, rgba(250,249,246,0.92) 32%, rgba(250,249,246,0) 60%);
      z-index:1;
    }
  </style>
  <div class="fg">
    <div class="fg-garden">${gardenSvg}</div>
    <div class="fg-veil"></div>
    <div class="fg-copy">
      <h1 class="fg-brand"><span class="fg-mark" aria-hidden="true"><svg viewBox="0 0 20 20" width="66" height="66" fill="#1b1a18"><ellipse cx="10" cy="16.6" rx="7.6" ry="2.9"/><ellipse cx="10" cy="10.7" rx="5.9" ry="2.6"/><ellipse cx="10" cy="5.5" rx="4.2" ry="2.3"/></svg></span>셋돌하나</h1>
      <p class="fg-tag">3일을 해내면, 돌 하나.</p>
      <p class="fg-sub">무너져도 쌓은 건 그대로.</p>
    </div>
  </div>`;
}

(async () => {
  const server = await serve();
  const browser = await launchBrowser();

  // 1) 앱을 실제로 띄워 정원 SVG를 뽑는다
  const appCtx = await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
  const app = await appCtx.newPage();
  await app.addInitScript((g) => {
    localStorage.setItem("jaksim3.onboarded", "1");
    localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: g }));
    const s = document.createElement("style");
    s.textContent = ".intro{display:none !important}";
    const put = () => document.head && document.head.appendChild(s);
    document.head ? put() : document.addEventListener("DOMContentLoaded", put);
  }, GOALS.map((x) => ({ ...x, history: [] })));
  await app.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "load" });
  await app.waitForTimeout(600);
  const gardenSvg = await app.evaluate(() => {
    const el = document.getElementById("hero-garden");
    return el ? el.innerHTML : "";
  });
  await appCtx.close();

  if (!gardenSvg) {
    console.error("정원 SVG를 뽑지 못했습니다.");
    await browser.close();
    server.close();
    process.exit(1);
  }

  // 2) 배너 페이지를 만들어 정확히 1024×500으로 찍는다
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  await page.setContent(bannerHTML(gardenSvg), { waitUntil: "load" });
  await page.waitForTimeout(500);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await page.screenshot({ path: OUT });
  console.log(`그래픽 이미지 → ${path.relative(ROOT, OUT)} (1024×500)`);

  await browser.close();
  server.close();
})();
