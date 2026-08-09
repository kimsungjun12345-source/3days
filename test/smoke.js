const { chromium } = require("playwright-core");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");

/* 검사는 file:// 이 아니라 진짜 http 로 연다.
 *
 * file:// 에서는 출처(origin)가 불투명해서 localStorage가 새로고침 사이에
 * 간헐적으로 날아간다. 그 탓에 '새로고침 뒤 기록이 남아 있는가' 계열 검사가
 * 열 번에 한두 번 이유 없이 깨졌다. 앱이 실제로 도는 환경도 http이니
 * 검사도 같은 조건에서 하는 것이 맞다. */
const ROOT = path.resolve(__dirname, "..");
const PORT = 8932;
const APP = `http://localhost:${PORT}/index.html`;

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

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("Failed to load resource")) errors.push("console: " + m.text()); });


  // 인트로와 첫 사용 안내는 실제 흐름이지만, 아래 검사들의 대상은 아니다.
  // 프로덕션 코드를 건드리지 않고 테스트에서만 건너뛴다.
  await page.addInitScript(() => {
    localStorage.setItem("jaksim3.onboarded", "1");
    // 서비스 워커가 끼면 새로고침마다 캐시에서 옛 파일이 올 수 있다.
    // 그건 test/pwa.js가 따로 검사하므로 여기서는 꺼 둔다.
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => new Promise(() => {});
    const style = document.createElement("style");
    style.textContent = ".intro{display:none !important}";
    const put = () => document.head && document.head.appendChild(style);
    if (document.head) put();
    else document.addEventListener("DOMContentLoaded", put);
  });


  // 새로고침 뒤 첫 렌더가 끝나기를 기다린다. 시간으로 어림잡으면
  // 기기가 느린 날 간헐적으로 깨지므로 화면 상태를 보고 판단한다.
  const reload = async () => {
    await page.reload();
    await page.waitForFunction(() => {
      const list = document.getElementById("goal-list");
      const empty = document.getElementById("empty");
      if (!list || !empty) return false;
      return list.children.length > 0 || !empty.hidden;
    }, null, { timeout: 5000 });
  };

  /* 안내가 다음 장으로 '다 넘어갈' 때까지 기다린다.
   * 글자만 바뀌면 애니메이션은 아직 도는 중이고, 그 사이에 다음 클릭을
   * 던지면 부하가 걸린 기기에서 옆 버튼으로 새는 일이 있었다. */
  const settled = async (prevTitle) => {
    await page.waitForFunction(
      (prev) => {
        const el = document.querySelector(".ob-title");
        const body = document.getElementById("ob-body");
        if (!el || !body || el.textContent.trim() === prev) return false;
        return body.getAnimations().every((a) => a.playState === "finished");
      },
      prevTitle,
      { timeout: 4000 }
    );
  };

  /* 3일째를 누르면 '어떤 돌을 얹을까요?'가 먼저 뜬다.
   * 검사도 사용자와 같은 순서를 밟는다 — 누르고, 돌을 고르고, 얹힐 때까지
   * 기다린다. 1·2일째에는 고르기가 뜨지 않으므로 그대로 지나간다. */
  const pickIfAsked = async (opt = 0) => {
    await page.waitForTimeout(420);
    if (await page.locator("#pick-stone").isVisible()) {
      await page.locator(".pick-opt").nth(opt).click();
      await page.waitForTimeout(1300);
    }
  };

  const tapToday = async (opt = 0) => {
    await page.click(".goal-card .btn-primary");
    await pickIfAsked(opt);
  };

  const assert = (cond, name) => {
    console.log((cond ? "PASS" : "FAIL") + "  " + name);
    if (!cond) process.exitCode = 1;
  };

  // 1. 빈 상태
  await page.goto(APP);
  assert(await page.locator("#empty").isVisible(), "empty state visible on first load");
  assert(await page.locator("#stats").isHidden(), "stats hidden with no goals");

  // 2. 새 작심 추가
  await page.click("#btn-add");
  await page.fill("#input-title", "아침에 물 한 잔");
  await page.click("#form-add button[type=submit]");
  assert((await page.locator(".goal-card").count()) === 1, "goal card created");
  assert(await page.locator("#stats").isVisible(), "stats visible after adding goal");
  // 하루치는 칸 하나다. 버튼이 '오늘의 돌'이라고 하면 돌 하나가 하루라는
  // 뜻이 되어 '3일에 돌 하나'라는 규칙과 정면으로 어긋난다.
  const freshCta = await page.locator(".goal-card .btn-primary").textContent();
  assert(freshCta.includes("오늘"), "fresh goal offers a today CTA, got: " + freshCta);
  assert(!freshCta.includes("돌"), "the daily CTA never promises a stone, got: " + freshCta);

  // 3. 오늘 체크
  await tapToday();
  assert((await page.locator(".goal-card .dot.done").count()) === 1, "one dot marked done after check");
  assert(await page.locator(".goal-card .btn-done").isDisabled(), "button disabled after today's check");
  assert((await page.locator("#stat-total-days").textContent()) === "1", "total days = 1");

  // 4. 완주 시나리오: 어제·그저께·오늘 체크한 상태를 주입
  await page.evaluate(([d2, d1, d0]) => {
    const s = JSON.parse(localStorage.getItem("jaksim3.v1"));
    s.goals[0].checks = [d2, d1, d0];
    s.goals[0].history = [d2, d1, d0];
    s.goals[0].lastCheckDate = d0;
    s.goals[0].totalDays = 3;
    localStorage.setItem("jaksim3.v1", JSON.stringify(s));
  }, [dstr(-2), dstr(-1), dstr(0)]);
  await reload();
  const cls4 = await page.locator(".goal-card").first().getAttribute("class");
  assert(cls4.includes("state-complete"), "complete state after 3 checks (got: " + cls4 + ")");
  assert((await page.locator("#stat-cycles").textContent()) === "1", "cycle counted while complete");

  // 5. 또 작심하기 (완주 당일 → 내일부터 Day 1)
  await page.click(".goal-card .btn-success");
  const doneBtnText = await page.locator(".goal-card .btn-done").textContent();
  assert(doneBtnText.includes("내일"), "next cycle deferred to tomorrow when completed today");
  assert((await page.locator("#stat-cycles").textContent()) === "1", "cycle count preserved after rollover");

  // 6. 끊김 시나리오: 마지막 체크가 3일 전
  await page.evaluate(([d3, d4, d5]) => {
    const s = JSON.parse(localStorage.getItem("jaksim3.v1"));
    s.goals[0].checks = [d3];
    s.goals[0].lastCheckDate = d3;
    s.goals[0].history = [d5, d4, d3];
    localStorage.setItem("jaksim3.v1", JSON.stringify(s));
  }, [dstr(-3), dstr(-4), dstr(-5)]);
  await reload();
  assert(await page.locator(".goal-card.state-broken").isVisible(), "broken state when a day was missed");
  assert((await page.locator("#stat-total-days").textContent()) === "3", "accumulated days preserved when broken");

  // 7. 다시 작심 → 오늘 Day 1 체크됨, 다시 일어난 횟수 +1
  await page.click(".goal-card .btn-rest");
  assert((await page.locator(".goal-card .dot.done").count()) === 1, "restart checks today as first day");
  assert((await page.locator("#stat-restarts").textContent()) === "1", "restart counter incremented");
  assert((await page.locator("#stat-total-days").textContent()) === "4", "total days keeps growing after restart");

  // 8. 삭제 — 상세 시트에 이름을 달고 서 있는 자리에서만
  // 길게 눌러 삭제는 없앴다. 아무도 못 찾는데 어쩌다 한 번 100일치를
  // 지우는, 발견 가능성 0 / 사고 가능성 0 아님의 최악 조합이었다.
  page.on("dialog", (d) => d.accept());
  await page.click(".goal-card .goal-top");
  await page.waitForTimeout(300);
  await page.click("#detail-delete");
  await page.waitForTimeout(500);
  assert((await page.locator(".goal-card").count()) === 0, "goal deleted from its own sheet");
  assert(await page.locator("#empty").isVisible(), "empty state returns after delete");

  // 9. 완주 축하 화면 — 실제로 3일째를 눌러서
  await page.evaluate(([d2, d1]) => {
    localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: [
      { id: "z", title: "10분 걷기", icon: "run", createdAt: "",
        checks: [d2, d1], lastCheckDate: d1, totalDays: 8, completedCycles: 2, restarts: 1 }]}));
  }, [dstr(-2), dstr(-1)]);
  await reload();
  await tapToday();
  await page.waitForTimeout(1600);
  assert(await page.locator("#cheer").isVisible(), "celebration appears after completing 3 days");
  const cheerTitle = await page.locator("#cheer-title").textContent();
  assert(cheerTitle.includes("세 번째 돌"), "celebration counts the right stone (got: " + cheerTitle + ")");
  assert((await page.locator("#cheer-word").textContent()).length > 0, "celebration shows an encouraging line");

  await page.click("#cheer-next");
  await page.waitForTimeout(500);
  assert(await page.locator("#cheer").isHidden(), "celebration closes on next-cycle");
  assert((await page.locator(".goal-card .dot.done").count()) === 0, "next cycle starts empty when today already counted");
  assert((await page.locator("#stat-cycles").textContent()) === "3", "completed cycle is banked");

  // 10. 기록 화면 — 카드를 탭하면 지난 12주가 열린다
  await page.evaluate(([h, d1]) => {
    localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: [
      { id: "r", title: "책 10쪽 읽기", icon: "book", createdAt: "",
        checks: [d1], history: h, lastCheckDate: d1,
        totalDays: h.length, completedCycles: 3, restarts: 2 }]}));
  }, [[dstr(-9), dstr(-8), dstr(-7), dstr(-4), dstr(-3), dstr(-1)], dstr(-1)]);
  await reload();

  await page.click(".goal-top");
  await page.waitForTimeout(300);
  assert(await page.locator("#detail").isVisible(), "record sheet opens on card tap");

  // 달력은 이번 달 한 장 — 날짜 숫자가 보이는 보통의 달력이다
  const cal = await page.evaluate(() => {
    const now = new Date();
    return {
      cells: document.querySelectorAll("#detail-mcal .mcal-cell:not(.blank)").length,
      inMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
      title: document.getElementById("detail-cal-title").textContent,
      nextDisabled: document.getElementById("detail-cal-next").disabled,
    };
  });
  assert(cal.cells === cal.inMonth, `calendar shows every day of the month (${cal.cells}/${cal.inMonth})`);
  assert(/\d{4}년 \d{1,2}월/.test(cal.title), "calendar names the month, got: " + cal.title);
  assert(cal.nextDisabled, "cannot page into the future");
  assert((await page.locator("#detail-mcal .mcal-cell.today").count()) === 1, "today is marked on the calendar");

  await page.click("#detail-cal-prev");
  await page.waitForTimeout(200);
  assert(
    (await page.locator("#detail-cal-title").textContent()) !== cal.title,
    "the previous month can be opened"
  );
  assert(!(await page.locator("#detail-cal-next").isDisabled()), "and paged back from");
  await page.click("#detail-cal-next");
  await page.waitForTimeout(200);
  await page.click("#detail-close");
  await page.waitForTimeout(200);
  assert(await page.locator("#detail").isHidden(), "record sheet closes");

  // 11. 카드를 길게 눌러도 아무 일이 없다 — 삭제는 상세 시트에서만
  await page.locator(".goal-card").hover();
  await page.mouse.down();
  await page.waitForTimeout(1000);
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert((await page.locator(".goal-card").count()) === 1, "a long press never deletes anything");

  // 12. 완주 후 방치 — 앱이 멈춰 있지 않고 상태가 흘러간다
  const seedDone = async (lastOffset) => {
    await page.evaluate(([a, b, c]) => {
      localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: [
        { id: "s", title: "아침에 물 한 잔", icon: "water", createdAt: "",
          checks: [a, b, c], history: [a, b, c], lastCheckDate: c,
          totalDays: 3, completedCycles: 0, restarts: 0 }]}));
    }, [dstr(lastOffset - 2), dstr(lastOffset - 1), dstr(lastOffset)]);
    await reload();
  };

  await seedDone(0);
  assert(await page.locator(".goal-card.state-complete").isVisible(), "day of completion stays celebratory");

  await seedDone(-1);
  assert(await page.locator(".goal-card.state-resting").isVisible(), "the day after completion invites the next three days");
  assert((await page.locator(".goal-card .btn").textContent()).includes("오늘부터"), "resting offers to continue today");

  await seedDone(-5);
  assert(await page.locator(".goal-card.state-lapsed").isVisible(), "a long pause after completion is recognised, not celebrated");
  assert((await page.locator(".goal-status").textContent()).includes("5일째 쉬는 중"), "lapsed card says how long the pause has been");

  await page.click(".goal-card .btn-rest");
  await page.waitForTimeout(300);
  assert((await page.locator(".goal-card .dot.done").count()) === 1, "coming back starts today as the first day");
  assert((await page.locator("#stat-cycles").textContent()) === "1", "the stone earned before the pause is kept");

  // 13. 같은 날 여러 작심을 체크해도 함께한 날은 하루
  await page.evaluate((d0) => {
    localStorage.setItem("jaksim3.v1", JSON.stringify({ goals:
      ["물", "걷기", "독서"].map((t, i) => ({
        id: "m" + i, title: t, icon: "stone", createdAt: "",
        checks: [d0], history: [d0], lastCheckDate: d0,
        totalDays: 1, completedCycles: 0, restarts: 0 })) }));
  }, dstr(0));
  await reload();
  assert((await page.locator("#stat-total-days").textContent()) === "1", "three goals checked today still count as one day");

  // 14. 돌탑 정원 — 작심마다 탑 하나, 자기 탑만 자란다
  await page.evaluate(([d2, d1]) => {
    localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: [
      { id: "A", title: "아침에 물 한 잔", icon: "water", createdAt: "", checks: [], history: [],
        lastCheckDate: null, totalDays: 9, completedCycles: 3, restarts: 0 },
      { id: "B", title: "책 10쪽 읽기", icon: "book", createdAt: "", checks: [d2, d1], history: [d2, d1],
        lastCheckDate: d1, totalDays: 5, completedCycles: 1, restarts: 1 }]}));
  }, [dstr(-2), dstr(-1)]);
  await reload();
  await page.waitForTimeout(200);

  // 돌 하나는 그림자·측면·윗면이 묶인 <g> 한 덩어리
  const stonesIn = (id) => page.evaluate((i) => {
    const t = document.querySelector('#hero-garden .tower-current[data-goal-id="' + i + '"] .tower-inner');
    return t ? t.querySelectorAll(":scope > g").length : -1;
  }, id);

  assert((await page.locator("#hero-garden .tower").count()) === 2, "every goal gets its own tower in the garden");
  assert((await stonesIn("A")) === 3 && (await stonesIn("B")) === 1, "each tower shows that goal's own stones");

  const bookCard = page.locator(".goal-card").filter({ hasText: "책 10쪽" });
  await bookCard.locator(".btn-primary").click();
  await pickIfAsked();
  await page.waitForTimeout(600);
  assert((await stonesIn("B")) === 2, "finishing three days grows that goal's tower");
  assert((await stonesIn("A")) === 3, "the other towers in the garden are left untouched");
  assert((await page.locator("#cheer-title").textContent()).includes("두 번째"), "celebration counts stones per goal");
  await page.click("#cheer-close");
  await page.waitForTimeout(300);

  // 오늘 할 일을 다 끝내면 점선 자리가 숨을 멈춘다 — 자리 자체는 남는다.
  // 자리를 통째로 걷어내면, 아직 돌이 하나도 없는 작심에서는 그릴 것이
  // 바닥 그림자밖에 안 남아 정원이 얼룩 하나처럼 보인다.
  const slots = () => page.locator("#hero-garden .building-stone").count();
  const pulsing = () => page.locator("#hero-garden .building-stone.waiting").count();
  assert((await pulsing()) > 0, "an unfinished day breathes in the garden");
  await page.evaluate((d0) => {
    const s = JSON.parse(localStorage.getItem("jaksim3.v1"));
    s.goals.forEach((g) => { g.checks = [d0]; g.lastCheckDate = d0; });
    localStorage.setItem("jaksim3.v1", JSON.stringify(s));
  }, dstr(0));
  await reload();
  await page.waitForTimeout(200);
  assert((await slots()) > 0, "the stone being built keeps its place after today is done");
  assert((await pulsing()) === 0, "but it stops breathing once today is done");

  // 15. 기록 내보내기 / 가져오기 — 저장소가 지워져도 되살릴 수 있어야 한다
  await page.evaluate((d1) => {
    localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: [
      { id: "x1", title: "아침에 물 한 잔", icon: "water", createdAt: "", checks: [d1], history: [d1],
        lastCheckDate: d1, totalDays: 14, completedCycles: 4, restarts: 2 },
      { id: "x2", title: "10분 걷기", icon: "run", createdAt: "", checks: [], history: [],
        lastCheckDate: null, totalDays: 6, completedCycles: 2, restarts: 1 }]}));
  }, dstr(-1));
  await reload();

  // 내보내기·가져오기는 설정 탭에 있다
  await page.click('.tab[data-view="settings"]');
  await page.waitForTimeout(200);
  assert(await page.locator("#view-settings").isVisible(), "settings tab opens");

  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#btn-export")]);
  const backupPath = path.join(os.tmpdir(), "jaksim-backup-test.json");
  await download.saveAs(backupPath);
  assert(/^[\x20-\x7e]+\.json$/.test(download.suggestedFilename()),
    "backup filename survives the browser (ascii + .json), got: " + download.suggestedFilename());
  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  assert(backup.goals.length === 2, "export contains every goal");
  assert(backup.goals[0].history.length === 1, "export keeps the day history");

  // 저장소를 통째로 날린 뒤 되살리기
  await page.evaluate(() => localStorage.removeItem("jaksim3.v1"));
  await reload();
  assert((await page.locator(".goal-card").count()) === 0, "wiped storage really is empty");
  await page.click('.tab[data-view="settings"]');
  await page.waitForTimeout(200);

  await page.setInputFiles("#file-import", backupPath);
  await page.waitForTimeout(600);
  await page.click('.tab[data-view="home"]');
  await page.waitForTimeout(200);
  assert((await page.locator(".goal-card").count()) === 2, "import brings the goals back");
  assert((await page.locator("#stat-cycles").textContent()) === "6", "import restores stones");
  assert((await page.locator("#stat-restarts").textContent()) === "3", "import restores restarts");

  // 엉뚱한 파일은 기존 기록을 건드리지 않는다
  const junkPath = path.join(os.tmpdir(), "jaksim-junk-test.json");
  fs.writeFileSync(junkPath, JSON.stringify({ hello: "world" }));
  await page.setInputFiles("#file-import", junkPath);
  await page.waitForTimeout(400);
  await page.click('.tab[data-view="home"]');
  await page.waitForTimeout(200);
  assert((await page.locator(".goal-card").count()) === 2, "a wrong file never wipes existing records");

  // 16. 공유 카드 — 자랑이 성립하는 순간에만

  /* 평범한 돌 하나에는 공유를 권하지 않는다. 매번 권하면 소음이 되어
   * 아무도 누르지 않고, 그러면 공유가 유입 경로 노릇을 못 한다.
   * 탑 한 채를 세운 날이 이 앱에서 자랑이 성립하는 유일한 순간이다. */
  await page.evaluate(([d2, d1]) => {
    localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: [
      { id: "sh", title: "아침에 물 한 잔 마시기", icon: "water", createdAt: "",
        checks: [d2, d1], history: [d2, d1], lastCheckDate: d1,
        totalDays: 5, completedCycles: 1, restarts: 3 }]}));
  }, [dstr(-2), dstr(-1)]);
  await reload();
  await tapToday();
  await page.waitForTimeout(1800);
  assert(await page.locator("#cheer-share").isHidden(), "an ordinary stone is not asked to be shared");
  await page.click("#cheer-close");
  await page.waitForTimeout(300);

  // 탑을 세운 날 — 이때만 권한다
  await page.evaluate(([d2, d1, per]) => {
    localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: [
      { id: "sh", title: "아침에 물 한 잔 마시기", icon: "water", createdAt: "",
        checks: [d2, d1], history: [d2, d1], lastCheckDate: d1,
        totalDays: 17, completedCycles: per - 1, restarts: 3 }]}));
  }, [dstr(-2), dstr(-1), await page.evaluate(() => STONES_PER_TOWER)]);
  await reload();
  await tapToday();
  await page.waitForTimeout(1800);
  assert(await page.locator("#cheer-share").isVisible(), "finishing a tower is worth sharing");
  assert(
    (await page.locator("#cheer-kicker").textContent()).includes("완성"),
    "and the celebration says so"
  );

  const card = await page.evaluate(() => {
    const c = renderShareCard({ title: "여섯 번째 돌을 얹었어요", goalTitle: "아침에 물 한 잔 마시기",
      stones: 6, days: 18, restarts: 3, word: "무너졌다 다시 쌓은 탑이라, 더 단단해요.", dateKey: "2026-01-01" });
    return { w: c.width, h: c.height, blank: c.getContext("2d")
      .getImageData(0, 0, c.width, c.height).data.every((v, i) => i % 4 === 3 || v === 247) };
  });
  assert(card.w === 1080 && card.h === 1350, "share card is 4:5 (1080x1350)");
  assert(card.blank === false, "share card actually has something drawn on it");

  const [shot] = await Promise.all([page.waitForEvent("download"), page.click("#cheer-share")]);
  assert(/\.png$/.test(shot.suggestedFilename()), "share card saves as a png, got: " + shot.suggestedFilename());
  const shotPath = path.join(os.tmpdir(), "jaksim-share-test.png");
  await shot.saveAs(shotPath);
  assert(fs.statSync(shotPath).size > 20000, "saved share card is a real image, not an empty file");

  // 17. 뒤로가기 / ESC — 열려 있는 시트부터 닫는다
  //     (안드로이드에서 이 처리가 없으면 시트 위에서 앱이 통째로 꺼진다)
  await page.evaluate(([d2, d1]) => {
    localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: [
      { id: "bk", title: "아침에 물 한 잔", icon: "water", createdAt: "",
        checks: [d2, d1], history: [d2, d1], lastCheckDate: d1,
        totalDays: 8, completedCycles: 2, restarts: 1 }]}));
  }, [dstr(-2), dstr(-1)]);
  await reload();

  await page.click("#btn-add");
  assert(await page.locator("#modal").isVisible(), "new-goal sheet opens");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  assert(await page.locator("#modal").isHidden(), "escape closes the new-goal sheet");

  await page.click(".goal-top");
  await page.waitForTimeout(300);
  assert(await page.locator("#detail").isVisible(), "record sheet opens");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  assert(await page.locator("#detail").isHidden(), "escape closes the record sheet");

  await tapToday();
  await page.waitForTimeout(1800);
  assert(await page.locator("#cheer").isVisible(), "celebration is open");
  assert(await page.evaluate(() => closeTopLayer()), "back button reports it handled the celebration");
  await page.waitForTimeout(300);
  assert(await page.locator("#cheer").isHidden(), "back button closes the celebration");
  assert(
    (await page.evaluate(() => closeTopLayer())) === false,
    "with nothing open the back button falls through so android can exit"
  );

  // 18. 어두운 테마 — 색이 뒤집혀도 읽을 수 있어야 한다
  const dark = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "dark",
  });
  const darkPage = await dark.newPage();
  await darkPage.addInitScript(() => {
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => new Promise(() => {});
  });
  darkPage.on("pageerror", (e) => errors.push("dark pageerror: " + e.message));
  await darkPage.goto(APP);
  await darkPage.evaluate((d1) => {
    localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: [
      { id: "dk", title: "아침에 물 한 잔", icon: "water", createdAt: "",
        checks: [d1], history: [d1], lastCheckDate: d1,
        totalDays: 9, completedCycles: 3, restarts: 1 }]}));
  }, dstr(-1));
  await darkPage.reload();
  await darkPage.waitForTimeout(300);

  const theme = await darkPage.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    const btn = document.querySelector(".goal-card .btn");
    const btnStyle = getComputedStyle(btn);
    return {
      bg: getComputedStyle(document.body).backgroundColor,
      stone: css.getPropertyValue("--stone-top-1").trim(),
      btnBg: btnStyle.backgroundColor,
      btnFg: btnStyle.color,
    };
  });
  assert(theme.bg === "rgb(22, 21, 19)", "dark theme paints a dark page, got: " + theme.bg);
  assert(theme.stone === "#c2baa9", "stones switch to their night tone, got: " + theme.stone);

  // 버튼 배경과 글자가 충분히 대비되는지 (밝은 버튼 위 흰 글자 같은 사고 방지)
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/\d+/g).map(Number).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const ratio = contrast(theme.btnBg, theme.btnFg);
  assert(ratio >= 4.5, "primary button text stays readable in dark (contrast " + ratio.toFixed(1) + ":1)");

  // 돌탑이 어두운 화면에서도 그려지는지
  assert(
    (await darkPage.locator("#hero-garden .tower").count()) === 1,
    "garden still renders in dark theme"
  );
  await dark.close();

  // 19. 탭 — 오늘(홈) / 지나온 길(기록) / 설정
  await page.evaluate((d1) => {
    localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: [
      { id: "tb", title: "아침에 물 한 잔", icon: "water", createdAt: "",
        checks: [d1], history: [d1], lastCheckDate: d1,
        totalDays: 11, completedCycles: 3, restarts: 2 }]}));
  }, dstr(-1));
  await reload();

  assert((await page.locator(".tab").count()) === 4, "four tabs are available");
  await page.click('.tab[data-view="garden"]');
  await page.waitForTimeout(250);
  assert(await page.locator("#view-garden").isVisible(), "garden tab opens");
  await page.click('.tab[data-view="record"]');
  await page.waitForTimeout(250);
  assert(await page.locator("#view-record").isVisible(), "record tab opens");
  assert(await page.locator("#view-home").isHidden(), "home is put away while on record");
  assert((await page.locator("#stat-cycles").textContent()) === "3", "the garden totals the stones");
  assert((await page.locator("#record-mcal .mcal-cell.done").count()) >= 1, "record calendar marks the days");
  assert((await page.locator("#garden-legend .record-row").count()) === 1, "each goal gets a row in the garden");

  await page.evaluate(() => switchView("garden"));
  await page.waitForTimeout(200);
  await page.click("#garden-legend .record-row");
  await page.waitForTimeout(300);
  assert(await page.locator("#detail").isVisible(), "a record row opens that goal's sheet");
  await page.click("#detail-close");
  await page.waitForTimeout(200);

  await page.click('.tab[data-view="home"]');
  await page.waitForTimeout(200);
  assert(await page.locator("#view-home").isVisible(), "home comes back");

  // 20. 처음 만나는 안내 — '칸 3개 = 돌 3개'라는 오해를 푸는 것이 핵심

  // 인트로가 완전히 끝나기를 먼저 기다린다.
  // 인트로는 2.3초 뒤 스스로 사라지면서 '처음 온 사람인가'를 다시 확인하고,
  // 처음이면 안내를 띄운다. 그 전에 아래에서 '봤음' 표시를 지워 버리면,
  // 검사가 안내를 넘기는 도중에 인트로가 안내를 처음부터 다시 열어 버린다.
  // (기기가 바쁜 날에만 걸려서 원인을 찾기 어려운 종류의 어긋남이었다.)
  await page.waitForFunction(() => !document.getElementById("intro"), null, { timeout: 8000 });
  await page.evaluate(() => localStorage.removeItem("jaksim3.onboarded"));
  await page.click('.tab[data-view="settings"]');
  await page.waitForTimeout(200);
  await page.click("#btn-show-onboard");
  await page.waitForTimeout(400);
  assert(await page.locator("#onboard").isVisible(), "the walkthrough opens");
  assert((await page.locator(".ob-dots i").count()) === 5, "walkthrough has five pages");
  assert(await page.locator("#ob-prev").isDisabled(), "there is nowhere to go back to on page one");

  const titles = [];
  for (let i = 0; i < 5; i++) {
    const shown = (await page.locator(".ob-title").textContent()).trim();
    titles.push(shown);
    if (i < 4) {
      await page.click("#ob-next");
      await settled(shown);
    }
  }
  assert(
    titles.some((t) => t.includes("돌 하나")),
    "one page explains that three checks make one stone, got: " + titles.join(" / ")
  );
  assert((await page.locator("#ob-next").textContent()).includes("시작"), "last page invites you in");

  // 놓친 장으로 돌아갈 수 있어야 한다 — 특히 '칸 셋이 돌 하나' 장은
  // 한 번 넘기면 다시 볼 방법이 없었다
  await page.click("#ob-prev");
  await settled(titles[4]);
  const backTitle = (await page.locator(".ob-title").textContent()).trim();
  assert(backTitle === titles[3], `back goes to the page before (want ${titles[3]}, got ${backTitle})`);
  await page.click("#ob-next");
  await settled(titles[3]);
  const fwdTitle = (await page.locator(".ob-title").textContent()).trim();
  assert(fwdTitle === titles[4], `and forward returns (want ${titles[4]}, got ${fwdTitle})`);
  await page.click("#ob-next");
  await page.waitForTimeout(300);
  assert(await page.locator("#onboard").isHidden(), "walkthrough closes at the end");
  assert(
    (await page.evaluate(() => localStorage.getItem("jaksim3.onboarded"))) === "1",
    "walkthrough is not shown again"
  );

  // 안내는 홈에서 시작하므로, 다시 열려면 설정으로 돌아가야 한다
  assert(await page.locator("#view-home").isVisible(), "walkthrough drops you on the home tab");

  // 뒤로가기로도 안내를 닫을 수 있어야 한다
  await page.click('.tab[data-view="settings"]');
  await page.waitForTimeout(200);
  await page.click("#btn-show-onboard");
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => closeTopLayer()), "back button closes the walkthrough");
  await page.waitForTimeout(200);
  assert(await page.locator("#onboard").isHidden(), "and it really closed");

  // 21. 안내는 손끝을 건드리지 않는다
  // 아직 아무것도 해내지 않은 사람에게 진동부터 주면 촉감이 '해냈다'는
  // 신호가 아니라 소음이 된다. 진동은 돌을 얹는 순간에만 쓴다.
  await page.click('.tab[data-view="settings"]');
  await page.waitForTimeout(200);
  await page.click("#btn-show-onboard");
  await page.waitForTimeout(300);
  // 안내가 뜬 뒤부터 센다 — 탭을 옮길 때의 딸깍은 안내의 몫이 아니다
  await page.evaluate(() => {
    window.__buzz = 0;
    navigator.vibrate = () => {
      window.__buzz += 1;
      return true;
    };
  });
  await page.click("#ob-next");
  await page.waitForTimeout(300);
  await page.click("#ob-skip");
  await page.waitForTimeout(200);
  assert((await page.evaluate(() => window.__buzz)) === 0, "walkthrough never buzzes");

  // 22. 돌탑 그림은 저마다 물감을 따로 가진다
  // 예전에는 모든 돌탑이 'stoneTop' 같은 같은 id를 함께 썼다. 문서에 같은
  // id가 여럿이면 url(#stoneTop)은 맨 앞 것을 가리키는데, 그게 숨어 있는
  // 그림의 것이면 크롬은 물감을 칠하지 않는다. 그래서 첫 실행 — 작심이
  // 없어 홈의 정원이 hidden인 바로 그때 — 안내의 돌탑이 그림자만 남고
  // 사라졌다. id가 겹치지 않는 한 이 일은 다시 일어나지 않는다.
  const dupIds = await page.evaluate(() => {
    const seen = new Set();
    const dup = [];
    for (const el of document.querySelectorAll("svg [id]")) {
      if (seen.has(el.id)) dup.push(el.id);
      seen.add(el.id);
    }
    return dup;
  });
  assert(dupIds.length === 0, "every cairn owns its own gradients" + (dupIds.length ? " → " + dupIds.join(", ") : ""));

  // 첫 실행 그대로 — 작심이 하나도 없어 홈의 정원이 숨은 그 상태에서
  await page.evaluate(() => {
    state.goals = [];
    save();
    render();
    openOnboard();
    for (let i = 0; i < 3; i++) document.getElementById("ob-next").click();
  });
  await page.waitForTimeout(200);
  assert(await page.locator("#stats").isHidden(), "the garden really is hidden with no goals");

  const paint = await page.evaluate(() => {
    const stone = document.querySelector(".ob-art svg .stone-top");
    if (!stone) return "그릴 돌이 없다";
    const ref = /url\(#(.+?)\)/.exec(stone.getAttribute("fill"))[1];
    const def = document.getElementById(ref);
    if (!def) return "물감을 찾지 못했다";
    // 숨은 가지에 있는 그라디언트는 크롬이 칠하지 않는다
    return def.closest("[hidden]") ? "숨은 물감을 가리킨다" : "ok";
  });
  assert(paint === "ok", "walkthrough stones paint on a fresh install → " + paint);
  await page.click("#ob-skip");
  await page.waitForTimeout(200);

  // 23. 새 작심 — 키보드 없이도 만들 수 있어야 한다
  await page.click("#btn-add");
  await page.waitForTimeout(300);
  assert(
    (await page.evaluate(() => document.activeElement.id)) !== "input-title",
    "opening the sheet does not summon the keyboard"
  );
  assert(await page.locator("#btn-submit-goal").isDisabled(), "cannot promise an empty goal");

  await page.click(".suggest-chip:nth-child(3)");
  await page.waitForTimeout(150);
  assert((await page.inputValue("#input-title")) === "자기 전 스트레칭", "a chip fills the title");
  assert((await page.locator(".suggest-chip.on").count()) === 1, "the chosen chip stays lit");
  assert(await page.locator("#btn-submit-goal").isEnabled(), "the promise button wakes up");
  assert(
    (await page.evaluate(() => document.activeElement.id)) !== "input-title",
    "choosing a chip still keeps the keyboard away"
  );

  await page.click(".suggest-chip:nth-child(3)");
  await page.waitForTimeout(150);
  assert((await page.inputValue("#input-title")) === "", "tapping the same chip undoes it");
  assert(await page.locator("#btn-submit-goal").isDisabled(), "and the button goes back to sleep");

  await page.click(".suggest-chip:nth-child(3)");
  await page.click("#btn-submit-goal");
  await page.waitForTimeout(200);
  assert((await page.locator(".goal-card").count()) === 1, "a goal is made without ever typing");
  assert(await page.locator("#modal").isHidden(), "and the sheet closes itself");

  // 24. 정원은 진행 중인 작심을 언제나 보여 준다
  // 예전에는 '오늘 할 일이 남았을 때'만 쌓는 중인 자리를 그렸다. 그래서
  // 돌이 아직 없는 작심에서 오늘 체크를 누르는 순간 그릴 것이 바닥
  // 그림자밖에 남지 않았고, 정원이 얼룩 하나로 보였다.
  await tapToday();
  await page.waitForTimeout(500);

  const towerParts = async () =>
    page.evaluate(() => {
      const t = document.querySelector("#hero-garden .tower");
      if (!t) return null;
      return {
        slot: !!t.querySelector(".building-stone"),
        waiting: !!t.querySelector(".building-stone.waiting"),
        // 다 쌓인 돌 (윗면 그라디언트를 쓰는 것만)
        stones: t.querySelectorAll(".stone-top").length,
        // 채워진 테두리 도막 = 이번 3일 중 해낸 날
        days: t.querySelectorAll(".slot-day").length,
      };
    });

  assert((await towerParts()).slot, "the stone being built keeps its place after today is done");
  assert(!(await towerParts()).waiting, "and it stops pulsing once today is done");

  // 하루 해낼 때마다 자리의 테두리가 한 도막씩 채워진다.
  // 자라는 것이 '돌'이면 안 된다 — 하루 만에 돌 하나가 쌓인 것처럼 보여
  // '3일에 돌 하나'라는 규칙과 정면으로 어긋난다. 그래서 채워지는 것은
  // 돌이 들어올 자리의 윤곽선뿐이고, 돌은 3일을 채워야 생긴다.
  assert((await towerParts()).days === 1, "one day in, one third of the outline is filled");
  assert(
    (await towerParts()).stones === 0,
    "one day in, no stone has appeared — a stone is three days, not one"
  );

  await page.evaluate((d) => {
    const g = state.goals[0];
    g.checks = [d];
    g.history = [d];
    g.lastCheckDate = d;
    save();
    render();
  }, dstr(-1));
  await tapToday();
  await page.waitForTimeout(400);
  assert((await towerParts()).days === 2, "two days in, two thirds are filled");
  assert((await towerParts()).stones === 0, "still no stone on day two");

  // 3일째에야 돌이 된다
  await page.evaluate((d) => {
    const g = state.goals[0];
    g.checks = [d[0], d[1]];
    g.history = [d[0], d[1]];
    g.lastCheckDate = d[1];
    save();
    render();
  }, [dstr(-2), dstr(-1)]);
  await tapToday();
  await page.waitForTimeout(1600);
  assert((await towerParts()).stones === 1, "the third day is what turns the outline into a stone");
  await page.click("#cheer-close");
  await page.waitForTimeout(300);

  // 25. 화면 밝기를 앱에서 직접 고른다
  await page.click('.tab[data-view="settings"]');
  await page.waitForTimeout(200);
  assert((await page.locator("#theme-seg .seg-item").count()) === 3, "three brightness choices");
  assert(
    (await page.locator('.seg-item[data-theme-pref="auto"]').getAttribute("class")).includes("on"),
    "it follows the device by default"
  );

  await page.click('.seg-item[data-theme-pref="dark"]');
  await page.waitForTimeout(250);
  assert(
    (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark",
    "choosing dark really darkens the app"
  );
  assert(
    (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(22, 21, 19)",
    "and the night palette is actually applied"
  );
  assert(
    (await page.evaluate(() => document.getElementById("theme-color").content)) === "#161513",
    "the system bar colour follows too"
  );

  await page.click('.seg-item[data-theme-pref="light"]');
  await page.waitForTimeout(250);
  assert(
    (await page.evaluate(() => document.documentElement.dataset.theme)) === "light",
    "light stays light even if the device is dark"
  );

  // 고른 밝기는 앱을 다시 열어도 남아 있어야 한다
  await page.reload();
  await page.waitForFunction(() => !!document.querySelector(".goal-card"), null, { timeout: 5000 });
  assert(
    (await page.evaluate(() => document.documentElement.dataset.theme)) === "light",
    "the choice survives a restart"
  );
  await page.evaluate(() => localStorage.removeItem("jaksim3.theme"));

  // 26. 개발자 도구 — 돌이 정말 쌓이는지 하루를 넘겨 가며 확인하는 수단
  // 이 앱은 '며칠째인가'로 돌아가서, 이게 없으면 사흘을 기다려야 확인이 된다.
  await page.evaluate(() => {
    state.goals = [];
    save();
    localStorage.removeItem("jaksim3.devDays");
    render();
  });
  await page.click('.tab[data-view="settings"]');
  await page.waitForTimeout(200);

  /* 테스트하라고 만든 빌드에서 테스트 도구를 숨겨 두면 앞뒤가 맞지 않는다.
   * 처음에는 정보 줄을 다섯 번 눌러야 열리게 해 뒀는데, 정작 그 빌드를
   * 받은 사람이 "개발자 도구가 없다"고 했다. 아무 표시도 없는 손짓을
   * 기억하라고 요구한 것이 문제였다. 이제 개발용 빌드에서는 대놓고 보인다. */
  assert(await page.locator("#dev-card").isVisible(), "a dev build shows its dev tools plainly");

  // 어느 빌드가 깔렸는지 앱 안에서 확인할 수 있어야 한다 —
  // '그 기능이 없다'는 말을 들었을 때 제일 먼저 봐야 하는 것이 이것이다
  assert(
    /v\d/.test(await page.locator("#about-sub").textContent()),
    "the version row says which build this is"
  );

  // 정보 줄은 접었다 펴는 스위치가 된다
  await page.click("#row-about");
  await page.waitForTimeout(150);
  assert(await page.locator("#dev-card").isHidden(), "tapping the version row folds it away");
  await page.click("#row-about");
  await page.waitForTimeout(150);
  assert(await page.locator("#dev-card").isVisible(), "and brings it back");

  await page.click("#dev-seed");
  await page.waitForTimeout(400);
  assert((await page.locator("#stat-cycles").textContent()) === "3", "the practice goal arrives with three stones");

  // 3일을 돌리면 돌이 정확히 하나 늘어야 한다 — 하루에 하나가 아니라
  await page.click('.tab[data-view="settings"]');
  await page.waitForTimeout(150);
  await page.click("#dev-run-cycle");
  // 3일째가 되면 돌 고르기가 먼저 뜬다 — 개발자 도구로 돌려도 순서는 같다
  await page.waitForFunction(() => !document.getElementById("pick-stone").hidden, null, { timeout: 8000 });
  await page.locator(".pick-opt").first().click();
  await page.waitForFunction(() => !document.getElementById("cheer").hidden, null, { timeout: 8000 });
  assert(
    (await page.locator("#cheer-title").textContent()).includes("네 번째"),
    "three days in a row adds exactly one stone"
  );
  await page.click("#cheer-close");
  await page.waitForTimeout(300);
  assert((await page.locator("#stat-cycles").textContent()) === "4", "and the garden agrees");

  // 날짜를 밀어 둔 동안에는 그 사실이 계속 보여야 한다
  assert(await page.locator("#dev-banner").isVisible(), "a shifted clock announces itself");
  assert(
    (await page.evaluate(() => Number(localStorage.getItem("jaksim3.devDays")))) === 2,
    "the cycle moved the clock by two days"
  );

  await page.click("#dev-banner");
  await page.waitForTimeout(300);
  assert(await page.locator("#dev-banner").isHidden(), "tapping the banner puts the clock back");
  assert(
    (await page.evaluate(() => localStorage.getItem("jaksim3.devDays"))) === null,
    "and nothing is left behind"
  );

  // 27. 오래 쌓아도 정원이 계속 자란다
  // 예전에는 한 작심의 탑이 돌 네 개에서 조용히 멈췄다. 돌 4개와 60개의
  // 그림이 픽셀 단위로 같았다는 뜻이고, 열이틀 뒤부터는 아무리 해내도
  // 보상이 없었다는 뜻이다. 이 앱이 주는 보상이 그거 하나뿐인데.
  const gardenAt = (stones) =>
    page.evaluate((n) => {
      state.goals = [{ id: "big", title: "아침에 물 한 잔", icon: "water", createdAt: "",
        checks: [], history: [], lastCheckDate: null, totalDays: n * 3, completedCycles: n, restarts: 0 }];
      save();
      render();
      const towers = [...document.querySelectorAll("#hero-garden .tower")];
      return {
        towers: towers.length,
        current: document.querySelectorAll("#hero-garden .tower-current").length,
        stones: towers.reduce((s, t) => s + t.querySelectorAll(".stone-top").length, 0),
      };
    }, stones);

  const per = await page.evaluate(() => STONES_PER_TOWER);
  const g1 = await gardenAt(1);
  const gFull = await gardenAt(per - 1);
  const gOver = await gardenAt(per);
  const gMid = await gardenAt(per * 4);
  const gYear = await gardenAt(120);

  assert(g1.towers === 1 && g1.stones === 1, "one stone, one tower");
  assert(gFull.towers === 1 && gFull.stones === per - 1, `${per - 1} stones still fit in one tower`);
  assert(gOver.towers === 2, `stone number ${per} finishes a tower and starts the next`);
  assert(gOver.current === 1, "exactly one tower is the one being built");
  assert(gMid.towers > gOver.towers, "four towers' worth makes more towers");
  assert(gYear.towers > gMid.towers, "and a year's worth makes more still");
  assert(
    gYear.stones > gMid.stones && gMid.stones > gOver.stones,
    `the garden keeps gaining stones (${per}→${gOver.stones}, ${per * 4}→${gMid.stones}, 120→${gYear.stones})`
  );

  // 완성한 탑 수는 정원의 목록에도 적혀 있어야 한다
  await page.click('.tab[data-view="garden"]');
  await page.waitForTimeout(250);
  assert(
    (await page.locator("#garden-legend .record-row .record-tt span").textContent()).includes(`탑 ${Math.floor(120 / per)}채`),
    "the garden list counts the finished towers"
  );
  await page.click('.tab[data-view="home"]');
  await page.waitForTimeout(200);

  // 28. 작심마다 돌이 다르다 — 색깔 범례가 아니라 돌의 성격으로
  // 탑이 여러 채 서면 어느 게 어느 작심인지 알아야 한다. 그렇다고
  // 빨강·파랑을 칠하면 정원이 아니라 그래프가 된다.
  await page.click('.tab[data-view="home"]');
  await page.waitForTimeout(200);
  const stones = await page.evaluate(() => {
    state.goals = ["가", "나", "다"].map((t, i) => ({
      id: "s" + i, title: t, icon: "water", createdAt: "",
      checks: [], history: [], lastCheckDate: null,
      totalDays: 9, completedCycles: 3, restarts: 0,
    }));
    save();
    render();
    const tone = (id) => {
      const el = document.querySelector(`#hero-garden .tower-current[data-goal-id="${id}"]`);
      return el ? getComputedStyle(el).filter : null;
    };
    /* 돌은 타원이 아니라 조약돌 path라서 ry 같은 속성이 없다.
       실제로 그려진 높이를 재는 편이 '납작함이 다른가'를 더 곧게 묻는다. */
    const width = (id) => {
      const el = document.querySelector(`#hero-garden .tower-current[data-goal-id="${id}"] .stone-top`);
      return el ? Math.round(el.getBBox().height * 10) : 0;
    };
    return {
      tones: ["s0", "s1", "s2"].map(tone),
      flats: ["s0", "s1", "s2"].map(width),
      lanes: ["s0", "s1", "s2"].map((id) => {
        const el = document.querySelector(`#hero-garden .tower-current[data-goal-id="${id}"]`);
        return el ? el.getAttribute("transform") : null;
      }),
    };
  });
  assert(new Set(stones.tones).size === 3, "each goal's stones catch the light differently");
  assert(new Set(stones.flats).size === 3, "and each goal's stones have their own shape");

  // 자리는 고정이어야 한다 — 많이 쌓은 순으로 자리를 주면 어제 가운데
  // 있던 탑이 오늘 옆으로 밀려서 '내 정원'이라는 기억이 안 생긴다
  const movedLanes = await page.evaluate(() => {
    const before = document.querySelector('#hero-garden .tower-current[data-goal-id="s0"]').getAttribute("transform");
    state.goals[2].completedCycles = 99; // 세 번째 작심이 압도적으로 앞서도
    save();
    render();
    const after = document.querySelector('#hero-garden .tower-current[data-goal-id="s0"]').getAttribute("transform");
    return { before, after };
  });
  assert(movedLanes.before === movedLanes.after, "a goal keeps its place in the garden as counts change");

  // 29. 스토어에 올리는 빌드에는 개발자 도구가 드러나지 않는다
  await page.route("**/build-info.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: 'window.BUILD = {"channel":"release","commit":"abc1234"};',
    })
  );
  await page.reload();
  await page.waitForFunction(() => !!window.BUILD, null, { timeout: 5000 });
  await page.click('.tab[data-view="settings"]');
  await page.waitForTimeout(250);
  assert(await page.locator("#dev-card").isHidden(), "a store build keeps the dev tools out of sight");
  for (let i = 0; i < 5; i++) {
    await page.click("#row-about");
    await page.waitForTimeout(80);
  }
  assert(await page.locator("#dev-card").isVisible(), "but five taps still reach them");
  await page.unroute("**/build-info.js");

  // 30. 처음 온 사람은 규칙을 먼저 읽고, 그 자리에서 첫 작심을 만든다
  // 한동안 반대로도 해 봤다(만들기 먼저 → 나중에 안내). 그런데 3일에 돌
  // 하나라는 이 앱의 유일한 규칙을 모른 채 목표부터 만들게 되고, 알려 줄
  // 자리가 계속 어정쩡해졌다. 다섯 장은 그림 위주라 금방 넘어가고
  // 건너뛰기도 있으니, 순서를 되돌리되 안내 끝에서 만들기로 이어 준다.
  const first = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const fp = await first.newPage();
  fp.on("pageerror", (e) => errors.push("first-run pageerror: " + e.message));
  await fp.addInitScript(() => {
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => new Promise(() => {});
  });
  await fp.goto(APP);
  await fp.waitForFunction(() => !document.getElementById("intro"), null, { timeout: 8000 });
  await fp.waitForTimeout(500);
  assert(await fp.locator("#onboard").isVisible(), "a brand-new user meets the rules first");
  assert(await fp.locator("#modal").isHidden(), "and nothing else is competing for the screen");

  // 안내를 끝내면 그 자리에서 바로 첫 작심으로 이어진다
  await fp.click("#ob-skip");
  await fp.waitForTimeout(600);
  assert(await fp.locator("#onboard").isHidden(), "the walkthrough can be skipped");
  assert(await fp.locator("#modal").isVisible(), "and it hands straight over to making one");
  assert(
    (await fp.locator("#modal-title").textContent()).includes("3일"),
    "asked as a question"
  );

  // 만들고 나면 규칙을 한 줄로 계속 붙여 둔다 (첫 돌을 얹기 전까지)
  await fp.click(".suggest-chip");
  await fp.click("#btn-submit-goal");
  await fp.waitForTimeout(400);
  assert(
    (await fp.locator("#note").textContent()).includes("세 칸"),
    "the rule stays on screen until the first stone"
  );
  await fp.reload();
  await fp.waitForTimeout(900);
  assert(await fp.locator("#onboard").isHidden(), "and the walkthrough never asks twice");
  await first.close();

  // 31. 여러 작심이 겹친 달력에서 '그날 무엇을 했나'가 보인다
  await page.click('.tab[data-view="home"]');
  await page.evaluate((d) => {
    state.goals = [
      { id: "m1", title: "아침에 물 한 잔", icon: "water", createdAt: "",
        checks: [d[0]], history: [d[0], d[1]], lastCheckDate: d[0],
        totalDays: 2, completedCycles: 0, restarts: 0 },
      { id: "m2", title: "10분 걷기", icon: "run", createdAt: "",
        checks: [d[0]], history: [d[0]], lastCheckDate: d[0],
        totalDays: 1, completedCycles: 0, restarts: 0 },
    ];
    save();
    render();
  }, [dstr(0), dstr(-1)]);
  await page.click('.tab[data-view="record"]');
  await page.waitForTimeout(350);

  const todayCell = page.locator(`#record-mcal .mcal-cell.done`).last();
  assert(
    (await todayCell.locator(".gdot").count()) === 2,
    "a day with two goals carries two marks"
  );
  assert(
    (await page.locator("#record-mcal .mcal-cell.done").count()) === 2,
    "and the days without any are left plain"
  );
  // 정원 목록의 칩 색이 달력의 점과 짝이 되어야 범례 없이 읽힌다
  await page.click('.tab[data-view="garden"]');
  await page.waitForTimeout(300);
  assert(
    (await page.locator("#garden-legend .record-row.g0").count()) === 1 &&
      (await page.locator("#garden-legend .record-row.g1").count()) === 1,
    "each goal keeps one colour across the calendar and the list"
  );
  await page.click('.tab[data-view="record"]');
  await page.waitForTimeout(250);

  // 지나간 칸은 눌러도 아무 일이 없다 — 되살리기는 없앴다
  assert(
    (await page.locator("#record-mcal .mcal-cell[data-key]").count()) === 0,
    "past days are a record, not a form"
  );
  await page.evaluate(() => { switchView("home"); });

  // 32. 정원에서는 탑이 한 채도 사라지지 않는다
  // 홈의 정원은 자리가 좁아 몇 채만 추려 그린다. 오래 다닌 사람에게는 그게
  // "예전 탑이 사라졌다"로 보이므로, 전부 서 있는 자리를 따로 둔다.
  await page.evaluate(() => {
    state.goals = ["물 한 잔", "10분 걷기", "스트레칭", "책 읽기"].map((t, i) => ({
      id: "t" + i, title: t, icon: "stone", createdAt: "",
      checks: [], history: [], lastCheckDate: "",
      totalDays: 60, completedCycles: 20, restarts: 0,
    }));
    save();
    render();
  });
  await page.waitForTimeout(300);

  const towersAll = await page.evaluate(() =>
    state.goals.reduce((s, g) => s + towersOf(g).done + 1, 0)
  );
  const onHome = await page.locator("#hero-garden .tower").count();
  assert(onHome < towersAll, `home shows a summary, not everything (${onHome}/${towersAll})`);
  // 홈에는 숫자도 설명도 없다 — 그림 하나뿐이고, 누르면 전부 보러 간다
  assert(
    (await page.locator("#view-home").innerText()).indexOf("쌓은 돌") === -1,
    "and home carries no numbers at all"
  );

  await page.click("#stats");
  await page.waitForTimeout(400);
  assert(await page.locator("#view-garden").isVisible(), "which opens the garden");
  assert(
    (await page.locator("#garden-page .tower").count()) === towersAll,
    `where every tower is standing (${towersAll})`
  );
  assert(
    (await page.locator("#garden-legend .record-row").count()) === 4,
    "with one line per goal underneath"
  );
  await page.click('.tab[data-view="home"]');
  await page.waitForTimeout(200);

  // 33. 만든 뒤에도 고칠 수 있어야 한다
  // 고치는 길이 없으면 오타 하나에 지우고 다시 만들어야 하고, 그러면
  // 쌓은 돌이 전부 사라진다. 100일 쌓은 사람에게는 그것이 앱을 지울 이유다.
  await page.evaluate((d) => {
    state.goals = [{ id: "ed", title: "아침에 물 한잔", icon: "water", createdAt: "",
      checks: [d], history: [d], lastCheckDate: d,
      totalDays: 30, completedCycles: 10, restarts: 2 }];
    save();
    render();
  }, dstr(0));
  await page.waitForTimeout(300);

  await page.click(".goal-card .goal-top");
  await page.waitForTimeout(300);
  await page.click("#detail-edit");
  await page.waitForTimeout(400);
  assert(
    (await page.locator("#modal-title").textContent()).includes("고치기"),
    "the sheet opens in edit mode"
  );
  assert(
    (await page.locator("#input-title").inputValue()) === "아침에 물 한잔",
    "prefilled with what is there now"
  );
  await page.fill("#input-title", "아침에 물 한 잔");
  await page.click('.icon-option[data-icon="sun"]');
  await page.click("#btn-submit-goal");
  await page.waitForTimeout(400);

  const edited = await page.evaluate(() => ({
    title: state.goals[0].title,
    icon: state.goals[0].icon,
    stones: stoneCount(state.goals[0]),
    days: state.goals[0].totalDays,
    restarts: state.goals[0].restarts,
  }));
  assert(edited.title === "아침에 물 한 잔", "the title is fixed");
  assert(edited.icon === "sun", "and the icon with it");
  // 여기가 핵심이다 — 고쳤다고 쌓은 것이 사라지면 고칠 이유가 없다
  assert(
    edited.stones === 10 && edited.days === 30 && edited.restarts === 2,
    `nothing that was built is lost (${edited.stones}돌 ${edited.days}일 ${edited.restarts}회)`
  );

  // 34. 잘못 누른 오늘은 지울 수 있다
  await page.evaluate(() => {
    // 오늘 아무것도 안 한 상태로 되돌린다. lastCheckDate까지 비워야 하는데,
    // 이걸 남겨 두면 checkedToday가 참이 되어 실제로는 생길 수 없는 상태가 된다
    state.goals[0].checks = [];
    state.goals[0].history = [];
    state.goals[0].lastCheckDate = "";
    state.goals[0].totalDays = 30;
    save();
    render();
  });
  await page.waitForTimeout(200);
  await tapToday();
  await page.waitForTimeout(500);
  assert((await page.locator(".goal-card .dot.done").count()) === 1, "a mis-tap fills a square");

  await page.click(".goal-card .goal-top");
  await page.waitForTimeout(300);
  assert(await page.locator("#detail-undo").isVisible(), "and the way back is right there");
  await page.click("#detail-undo");
  await page.waitForTimeout(400);
  assert((await page.locator(".goal-card .dot.done").count()) === 0, "the square empties again");
  assert(
    (await page.evaluate(() => state.goals[0].totalDays)) === 30,
    "and the day count goes back with it"
  );

  // 오늘 표시가 없으면 지울 것도 없다
  await page.click(".goal-card .goal-top");
  await page.waitForTimeout(300);
  assert(await page.locator("#detail-undo").isHidden(), "nothing to undo when nothing was marked");
  await page.click("#detail-close");
  await page.waitForTimeout(200);

  assert(errors.length === 0, "no console/page errors" + (errors.length ? " → " + errors.join("; ") : ""));

  await page.screenshot({ path: __dirname + "/screenshot.png", fullPage: true });
  await browser.close();
  server.close();
})();
