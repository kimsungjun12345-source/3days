/* 스토어 등록용 스크린샷을 만든다.
 *
 * 앱 화면을 실제로 띄워 찍은 뒤, 그 위에 한 줄 카피를 얹어 스토어가 요구하는
 * 크기로 합성한다. 카피는 기능 설명이 아니라 이 앱이 왜 다른지를 말한다.
 *
 *   node scripts/make-store-shots.js
 */

const { chromium } = require("playwright-core");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "store", "screenshots");
const PORT = 8944;
const CHROME =
  process.env.CHROMIUM_PATH ||
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";

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
      const file = path.join(ROOT, rel === "/" ? "index.html" : rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end();
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

/* 여러 번 무너지고 다시 쌓은 사람의 기록 — 이 앱이 자랑하고 싶은 모습 */
function history(days) {
  const h = [];
  let d = days;
  const runs = [3, 3, 3, 2, 3, 3, 1, 3, 3, 3, 2, 3];
  for (const r of runs) {
    for (let i = 0; i < r && d > 0; i++) h.push(dstr(-d)), (d -= 1);
    d -= 2;
  }
  return h.filter(Boolean);
}

const GOALS = [
  {
    id: "a", title: "아침에 물 한 잔 마시기", icon: "water",
    checks: [dstr(-1)], lastCheckDate: dstr(-1),
    totalDays: 26, completedCycles: 7, restarts: 3,
  },
  {
    id: "b", title: "자기 전 스트레칭", icon: "meditate",
    checks: [dstr(-2), dstr(-1)], lastCheckDate: dstr(-1),
    totalDays: 14, completedCycles: 4, restarts: 2,
  },
  {
    id: "c", title: "책 10쪽 읽기", icon: "book",
    checks: [dstr(-6)], lastCheckDate: dstr(-6),
    totalDays: 9, completedCycles: 3, restarts: 1,
  },
];

/* 각 장면: 카피 + 앱을 어떤 상태로 보여줄지 */
const SCENES = [
  {
    file: "01-promise",
    headline: "약속은 딱 3일",
    sub: "거창한 목표 대신, 사흘만.",
    setup: (page) => page.evaluate((g) => {
      localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: g }));
    }, GOALS.map((g) => ({ ...g, history: history(40) }))),
  },
  {
    file: "02-stone",
    headline: "3일을 채우면 돌 하나",
    sub: "작심삼일마다 나의 탑이 자랍니다.",
    setup: async (page) => {
      await page.evaluate((g) => {
        localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: g }));
      }, [{ ...GOALS[0], checks: [dstr(-2), dstr(-1)], history: history(40) }]);
      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(400);
      await page.click(".goal-card .btn-primary");
      await page.waitForTimeout(2000);
    },
    skipReload: true,
  },
  {
    file: "03-broken",
    headline: "무너져도 괜찮아요",
    sub: "쌓아 둔 돌은 사라지지 않으니까.",
    setup: (page) => page.evaluate((g) => {
      localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: g }));
    }, [
      { ...GOALS[2], history: history(40) },
      { ...GOALS[0], history: history(40) },
    ]),
  },
  {
    file: "04-record",
    headline: "다시 쌓은 횟수가\n진짜 기록",
    sub: "빈칸도 이야기의 일부입니다.",
    setup: async (page) => {
      await page.evaluate((g) => {
        localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: g }));
      }, [{ ...GOALS[0], history: history(60) }]);
      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(400);
      await page.click(".goal-top");
      await page.waitForTimeout(500);
    },
    skipReload: true,
  },
  {
    file: "05-garden",
    headline: "작심삼일 × 120 = 1년",
    sub: "그렇게 평생이 됩니다.",
    setup: (page) => page.evaluate((g) => {
      localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: g }));
    }, GOALS.concat([
      { id: "d", title: "일기 세 줄 쓰기", icon: "pen", checks: [], lastCheckDate: null,
        totalDays: 6, completedCycles: 2, restarts: 1 },
      { id: "e", title: "10분 걷기", icon: "run", checks: [dstr(-1)], lastCheckDate: dstr(-1),
        totalDays: 18, completedCycles: 5, restarts: 4 },
    ]).map((g) => ({ ...g, history: history(40) }))),
  },
];

/* 스토어별 크기 — 애플·구글이 요구하는 대표 해상도 */
const SIZES = [
  { name: "ios-6.7", w: 1290, h: 2796 },
  { name: "ios-6.5", w: 1242, h: 2688 },
  { name: "android", w: 1080, h: 1920 },
];

function frameHTML({ shot, headline, sub, w, h }) {
  // 카피 영역과 기기 영역의 비율을 크기와 무관하게 유지
  const copyTop = Math.round(h * 0.062);
  const deviceTop = Math.round(h * 0.245);
  const deviceW = Math.round(w * 0.78);
  const radius = Math.round(deviceW * 0.085);
  const hSize = Math.round(w * 0.072);
  const sSize = Math.round(w * 0.036);

  return `<!DOCTYPE html><meta charset="utf-8">
  <style>
    @font-face { font-family: 'AppFont'; src: local('Noto Sans KR'), local('Pretendard'); }
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      width:${w}px; height:${h}px; overflow:hidden;
      background: linear-gradient(170deg, #f7f6f3 0%, #f2efe8 52%, #eae4d8 100%);
      font-family: 'Noto Sans KR', Pretendard, -apple-system, sans-serif;
      position:relative;
    }
    .copy {
      position:absolute; top:${copyTop}px; left:0; right:0;
      text-align:center; padding:0 ${Math.round(w * 0.09)}px;
    }
    .copy h1 {
      font-size:${hSize}px; font-weight:800; color:#1b1a18;
      letter-spacing:-0.02em; line-height:1.28; white-space:pre-line;
      word-break:keep-all;
    }
    .copy p {
      margin-top:${Math.round(h * 0.014)}px;
      font-size:${sSize}px; font-weight:500; color:#8b8479; word-break:keep-all;
    }
    .device {
      position:absolute; top:${deviceTop}px; left:50%; transform:translateX(-50%);
      width:${deviceW}px; border-radius:${radius}px; overflow:hidden;
      background:#f7f6f3;
      box-shadow: 0 ${Math.round(h * 0.012)}px ${Math.round(h * 0.03)}px rgba(60,50,35,0.18),
                  0 0 0 ${Math.round(w * 0.006)}px #26241f;
    }
    .device img { display:block; width:100%; }
  </style>
  <div class="copy"><h1>${headline}</h1><p>${sub}</p></div>
  <div class="device"><img src="data:image/png;base64,${shot}"></div>`;
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({ executablePath: CHROME });
  fs.mkdirSync(OUT, { recursive: true });

  const base = `http://localhost:${PORT}/index.html`;
  let count = 0;

  for (const scene of SCENES) {
    // 앱 화면을 실제로 띄워 찍는다 (기기 비율 그대로)
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 760 },
      deviceScaleFactor: 3,
    });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "load" });
    await scene.setup(page);
    if (!scene.skipReload) await page.reload({ waitUntil: "load" });
    // 시트가 열린 장면은 뒤가 너무 어두우면 스토어에서 칙칙해 보인다
    await page.addStyleTag({
      content: `.modal-backdrop, .cheer-backdrop { background: rgba(27,26,24,0.12) !important; }`,
    });
    await page.waitForTimeout(600);
    const shot = (await page.screenshot()).toString("base64");
    await ctx.close();

    for (const size of SIZES) {
      const framePage = await browser.newPage({
        viewport: { width: size.w, height: size.h },
      });
      await framePage.setContent(
        frameHTML({ shot, headline: scene.headline, sub: scene.sub, w: size.w, h: size.h }),
        { waitUntil: "load" }
      );
      await framePage.waitForTimeout(200);
      const dir = path.join(OUT, size.name);
      fs.mkdirSync(dir, { recursive: true });
      await framePage.screenshot({ path: path.join(dir, `${scene.file}.png`) });
      await framePage.close();
      count += 1;
    }
    console.log(`${scene.file} — ${scene.headline.replace("\n", " ")}`);
  }

  await browser.close();
  server.close();
  console.log(`\n스크린샷 ${count}장 → store/screenshots/`);
})();
