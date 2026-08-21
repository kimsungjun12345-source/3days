const { launchBrowser } = require("./browser");
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
  const browser = await launchBrowser();
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

  /* 3일째를 채우면 돌이 탑으로 날아가고 바로 축하가 뜬다. 애니메이션이
   * 끝날 시간만 준다. */
  const tapToday = async () => {
    await page.click(".goal-card .btn-primary");
    await page.waitForTimeout(1200);
  };

  /* 끊겼다 돌아오면 '다시 왔네요' 시트가 열린다. 이 앱에서 가장 중요한
     순간이라 일부러 저절로 사라지지 않으므로, 검사도 사람처럼 한 번 닫고
     다음으로 간다. 안 닫으면 뒤따르는 클릭이 전부 시트에 막힌다. */
  const comeBack = async (sel = ".goal-card .btn-rest") => {
    await page.click(sel);
    await page.waitForTimeout(450);
    if (await page.locator("#return").isVisible()) {
      await page.click("#return-ok");
      await page.waitForTimeout(300);
    }
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
  await comeBack();
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

  await comeBack();
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
  await page.waitForTimeout(1200);
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
  assert(theme.stone === "#B2A89D", "stones switch to their night tone, got: " + theme.stone);

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
  assert((await page.locator("#record-goals .record-row").count()) === 1, "the record calendar carries a key to its colours");

  // 정원에서는 탑 자체가 그 작심으로 들어가는 문이다 — 목록이 없기 때문에
  await page.evaluate(() => switchView("garden"));
  await page.waitForTimeout(200);
  assert(
    (await page.locator("#garden-page .record-row").count()) === 0,
    "the garden shows towers only, not the home list over again"
  );
  await page.click("#garden-page .tower-current");
  await page.waitForTimeout(300);
  assert(await page.locator("#detail").isVisible(), "tapping a tower opens that goal's sheet");
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
  /* 끊겨도 된다는 것이 이 앱이 다른 습관 앱과 갈리는 유일한 지점이다.
     그런데 그 장이 오랫동안 맨 뒤에 있었다 — 가장 안 읽히는 자리다.
     처음 온 사람이 "또 매일 체크하는 앱이구나"로 판단을 끝내기 전에 와야 한다. */
  const recoveryAt = titles.findIndex((t) => t.includes("끊겨도"));
  assert(recoveryAt !== -1, "one page promises that stones survive a break, got: " + titles.join(" / "));
  assert(
    recoveryAt < titles.length - 1,
    `and it does not hide at the very end (page ${recoveryAt + 1} of ${titles.length})`
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

  /* 칩의 글자를 검사에 박아 두지 않는다. 추천 목록은 앱이 무엇을 담는
     곳인지를 말하는 자리라 제품 방향이 바뀌면 같이 바뀌는데, 그때마다
     멀쩡한 검사가 깨진다. 재야 할 것은 '고른 그 칩이 그대로 들어가는가'다. */
  const chip3 = (await page.locator(".suggest-chip:nth-child(3)").textContent()).trim();
  await page.click(".suggest-chip:nth-child(3)");
  await page.waitForTimeout(150);
  assert((await page.inputValue("#input-title")) === chip3, `a chip fills the title (${chip3})`);
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
  // 3일을 채우면 돌이 날아가고 바로 축하가 뜬다
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

  // 완성한 탑 수는 글로도 적혀 있어야 한다 — 세어 보게 두지 않는다
  await page.click('.tab[data-view="garden"]');
  await page.waitForTimeout(250);
  assert(
    (await page.locator("#garden-word").textContent()).includes(`탑 ${Math.floor(120 / per)}채`),
    "the garden counts the finished towers in words"
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
    /* 돌빛은 이제 filter가 아니라 작심마다 다른 CSS 변수(--stone-top-1)로
       준다. 탑 그룹의 .stone-tone-N이 그 값을 쥔다 — 셋이 서로 달라야 한다. */
    const tone = (id) => {
      const el = document.querySelector(`#hero-garden .tower-current[data-goal-id="${id}"]`);
      return el ? getComputedStyle(el).getPropertyValue("--stone-top-1").trim() : null;
    };
    /* 세 조약돌은 발자국(bounding box)을 일부러 똑같이 맞춰 두어(fitBox)
       탑이 단정하다. 그래서 다른 것은 크기가 아니라 윤곽 곡선이다 — 맨 위
       돌의 path(d)가 작심마다 달라야 셋이 서로 다른 돌로 읽힌다. */
    const shape = (id) => {
      const el = document.querySelector(`#hero-garden .tower-current[data-goal-id="${id}"] .stone-top`);
      return el ? el.getAttribute("d") : null;
    };
    return {
      tones: ["s0", "s1", "s2"].map(tone),
      shapes: ["s0", "s1", "s2"].map(shape),
      lanes: ["s0", "s1", "s2"].map((id) => {
        const el = document.querySelector(`#hero-garden .tower-current[data-goal-id="${id}"]`);
        return el ? el.getAttribute("transform") : null;
      }),
    };
  });
  assert(new Set(stones.tones).size === 3, "each goal's stones catch the light differently");
  assert(new Set(stones.shapes).size === 3, "and each goal's stones have their own shape");

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
    (await fp.locator("#modal-title").textContent()).trim().endsWith("?"),
    "asked as a question, not labelled '새 작심'"
  );
  /* 여기서 담는 것이 '목표'가 아니라 '매일 반복할 행동'이라는 게 드러나야
     한다. 안 그러면 '취업하기'나 '토익 900점'이 들어오고, 그 순간 이 앱이
     목표 관리 앱인지 투두인지 모호해진다. docs/POSITIONING.md 참고. */
  assert(
    (await fp.locator("#modal-sub").textContent()).includes("매일"),
    "and it says what kind of thing goes in here"
  );

  // 만들고 나면 규칙과 약속을 한 줄로 계속 붙여 둔다 (첫 돌을 얹기 전까지)
  await fp.click(".suggest-chip");
  await fp.click("#btn-submit-goal");
  await fp.waitForTimeout(400);
  const firstNote = await fp.locator("#note").textContent();
  assert(firstNote.includes("3일"), "the rule stays on screen until the first stone");
  assert(firstNote.includes("그대로"), "and so does the promise that a missed day takes nothing away");
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
  /* 점의 색이 무엇인지 말해 주는 줄이 같은 화면에 있어야 한다.
     열쇠가 다른 탭에 있으면, 색은 있는데 읽을 방법이 없는 셈이 된다. */
  assert(
    (await page.locator("#record-goals .record-row.g0").count()) === 1 &&
      (await page.locator("#record-goals .record-row.g1").count()) === 1,
    "each goal keeps one colour across the calendar and its key"
  );

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
    (await page.locator("#garden-page .tower[role=button]").count()) === towersAll,
    "and each of them can be tapped for its record"
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
    (await page.locator("#modal-title").textContent()).includes("수정하기"),
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

  /* 35. 작심은 정원 자리 수(6)까지만 만들 수 있다.
   *
   * 정원에 자리가 여섯인데 만들기를 막지 않아서, 일곱 번째 작심은 목록에는
   * 뜨지만 그림에는 서지 않았다. 이 앱이 주는 유일한 보상이 돌탑이라
   * 그게 조용히 빠지면 안 된다. */
  const seedMany = async (n) => {
    await page.evaluate((count) => {
      const goals = [];
      for (let i = 0; i < count; i += 1) {
        goals.push({
          id: "cap" + i, title: "작심 " + (i + 1), icon: "water", createdAt: "",
          checks: [], history: [], lastCheckDate: null,
          totalDays: 0, completedCycles: 0, restarts: 0,
        });
      }
      localStorage.setItem("jaksim3.v1", JSON.stringify({ goals }));
    }, n);
    await reload();
  };

  await seedMany(6);
  assert((await page.locator(".goal-card").count()) === 6, "six goals all show up");
  assert(
    (await page.locator("#btn-add b").textContent()).includes("다 찼어요"),
    "the add card says the garden is full"
  );
  await page.click("#btn-add");
  await page.waitForTimeout(300);
  assert(await page.locator("#modal").isHidden(), "and tapping it does not open the sheet");
  assert(
    (await page.evaluate(() => state.goals.length)) === 6,
    "so a seventh goal cannot be created"
  );

  // 하나를 지우면 자리가 다시 열린다 — 막힌 채로 굳으면 그건 버그다
  await page.evaluate(() => {
    state.goals.pop();
    save();
    render();
  });
  await page.waitForTimeout(250);
  assert(
    (await page.locator("#btn-add b").textContent()).includes("새 작심"),
    "deleting one opens the slot again"
  );

  /* 36. 이미 여섯을 넘겨 둔 기록은 건드리지 않는다.
   *
   * 상한은 '새로 만드는 일'에만 건다. 예전 빌드에서 만들었거나 파일로
   * 가져온 기록을 지우거나 숨기면, 지키려던 것(쌓은 기록은 사라지지
   * 않는다)을 정작 앱이 어기게 된다. */
  await seedMany(8);
  assert((await page.locator(".goal-card").count()) === 8, "goals beyond six are kept, not dropped");
  await page.evaluate(() => switchView("record"));
  await page.waitForTimeout(300);
  assert(
    (await page.locator("#record-goals .record-row").count()) === 8,
    "and every one of them is listed in the record"
  );
  await page.evaluate(() => switchView("garden"));
  await page.waitForTimeout(300);
  // 그림에는 여섯까지만 서므로, 문구가 '전부'라고 말하면 거짓이 된다
  assert(
    !(await page.locator("#garden-word").textContent()).includes("전부"),
    "the garden never claims to show them all when it cannot"
  );
  await page.evaluate(() => switchView("home"));
  await page.waitForTimeout(200);

  /* 37. '다시 쌓음'은 다시 시작한 횟수다 — 끊긴 뒤든, 오래 쉰 뒤든.
   *
   * 예전에는 1~2칸 하다 끊긴 경우만 셌다. 3일을 다 채우고 2주 쉬었다
   * 돌아온 사람은 세지 않았는데, 그쪽이 오히려 이 앱이 자랑하려는 복귀다.
   * 공유 카드에 나가는 숫자라 정의가 흔들리면 카드가 거짓말을 한다. */
  const seedOne = async (checks, last, restarts) => {
    await page.evaluate((d) => {
      localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: [
        { id: "again", title: "10분 걷기", icon: "run", createdAt: "",
          checks: d.checks, history: d.checks, lastCheckDate: d.last,
          totalDays: d.checks.length, completedCycles: 1, restarts: d.restarts }]}));
    }, { checks, last, restarts });
    await reload();
  };

  // 완주하고 한참 쉬었다 돌아온 사람 (lapsed)
  await seedOne([dstr(-9), dstr(-8), dstr(-7)], dstr(-7), 0);
  assert(
    (await page.evaluate(() => goalStatus(state.goals[0]))) === "lapsed",
    "a goal left alone after a full cycle is lapsed"
  );
  await comeBack();
  assert(
    (await page.evaluate(() => state.goals[0].restarts)) === 1,
    "coming back after a long rest counts as starting again"
  );

  // 완주 다음 날 바로 이어 가는 사람 (resting) — 멈춘 적이 없으니 세지 않는다
  await seedOne([dstr(-3), dstr(-2), dstr(-1)], dstr(-1), 0);
  assert(
    (await page.evaluate(() => goalStatus(state.goals[0]))) === "resting",
    "picking up the day after finishing is resting"
  );
  await page.click(".goal-card .btn-primary");
  await page.waitForTimeout(600);
  assert(
    (await page.evaluate(() => state.goals[0].restarts)) === 0,
    "and carrying straight on is not starting again"
  );

  // 끊긴 뒤 다시 쌓기 (broken) — 예전부터 세던 길, 그대로 센다
  await seedOne([dstr(-6), dstr(-5)], dstr(-5), 0);
  assert(
    (await page.evaluate(() => goalStatus(state.goals[0]))) === "broken",
    "a cycle cut short is broken"
  );
  await comeBack();
  assert(
    (await page.evaluate(() => state.goals[0].restarts)) === 1,
    "and rebuilding after a break still counts"
  );

  // 카드에 나가는 문구도 숫자의 뜻과 맞아야 한다
  assert(
    !(await page.evaluate(() => historyWord(state.goals[0]))).includes("무너지고"),
    "the record line no longer says they collapsed"
  );

  /* 38. 측정이 사용자가 쓴 글을 실어 나르지 않는다.
   *
   * 이건 '조심해서 쓰자'로 지킬 수 있는 종류가 아니다. 급할 때 파라미터
   * 하나 얹는 것은 너무 쉬운 일이라, 반년 뒤에 반드시 깨진다. 그래서
   * 허용목록과 타입 제한을 검사로 못 박는다. 여기서 막히면 작심 제목이
   * 스토어 밖으로 나가는 길 자체가 없다. */
  await page.evaluate(() => {
    // 실제로 보내지는 값만 남기는 함수를 그대로 부른다
    window.__sent = [];
    window.__probe = (name, params) => analyticsParams(name, params);
  });

  const leak = await page.evaluate(() => {
    const title = "아침에 물 한 잔";
    return {
      // 제목을 허용된 키에 실어도 문자열이라 걸린다
      asAllowedKey: JSON.stringify(window.__probe("day_checked", { day_number: title })),
      // 없는 키는 이름에서 걸린다
      asNewKey: JSON.stringify(window.__probe("goal_created", { title })),
      // 숫자는 통과한다 (측정이 아예 죽으면 그것대로 곤란하다)
      asNumber: JSON.stringify(window.__probe("day_checked", { day_number: 2 })),
    };
  });
  assert(leak.asAllowedKey === "{}", "a goal title cannot ride along even on an allowed key");
  assert(leak.asNewKey === "{}", "and an unlisted parameter never leaves");
  assert(leak.asNumber === '{"day_number":2}', "while the day number still goes through");

  const unknown = await page.evaluate(() => {
    const before = console.warn;
    let warned = false;
    console.warn = () => { warned = true; };
    track("goal_deleted"); // 설계 문서에만 있고 아직 쓰지 않는 이름
    console.warn = before;
    return warned;
  });
  assert(unknown, "an event that is not on the list is refused");

  /* 39. 이벤트가 실제로 그 순간에 불린다.
   * Firebase가 아직 붙지 않았으므로, 부르는 곳까지가 지금 확인할 수 있는
   * 전부다. 붙이는 날 호출 지점을 새로 찾아 심는 일이 없어야 한다. */
  await page.evaluate(() => {
    window.__events = [];
    window.__origTrack = track;
    // eslint-disable-next-line no-global-assign
    track = (name, params) => { window.__events.push([name, params]); };
  });
  await seedOne([dstr(-4), dstr(-3)], dstr(-3), 0); // broken 상태
  const brokenSeen = await page.evaluate(() => {
    // reload로 track이 원래대로 돌아왔으므로 다시 감싼다
    window.__events = [];
    window.__origTrack = track;
    track = (name, params) => { window.__events.push([name, params]); };
    localStorage.removeItem("jaksim3.brokenSeen");
    render();
    render(); // 두 번 그려도 한 번만 세야 한다
    return window.__events.filter((e) => e[0] === "cycle_broken").length;
  });
  assert(brokenSeen === 1, "a broken cycle is counted once, not once per render");

  const flow = await page.evaluate(() => {
    window.__events = [];
    state.goals[0].checks = [];
    state.goals[0].lastCheckDate = "";
    save();
    checkToday(state.goals[0]);
    checkToday(state.goals[0]); // 같은 날 두 번은 무시된다
    return window.__events.map((e) => e[0] + (e[1] ? ":" + JSON.stringify(e[1]) : ""));
  });
  assert(
    flow.length === 1 && flow[0] === 'day_checked:{"day_number":1}',
    "checking a day reports which square it was — and only once " + JSON.stringify(flow)
  );

  await page.evaluate(() => { track = window.__origTrack; });

  /* 40. 오늘 것은 돌이 된 뒤에도 되돌릴 수 있다.
   *
   * 여기는 두 번 고쳤다. 처음에는 버튼을 lastCheckDate로 보여 주고 지우기는
   * checks로 해서, 버튼이 보이는데 눌러도 아무 일이 없었다. 그다음에는 두
   * 조건을 맞추느라 '완주한 날 다음 3일까지 시작했으면 되돌릴 수 없다'로
   * 두었는데, 그건 사용자 눈에는 그냥 '오늘 잘못 눌렀는데 못 지운다'였다.
   * 세 번째 칸을 눌러 놓고 축하 화면에서 다음 3일까지 시작해 버린 사람에게는
   * 되돌릴 길이 더 필요하지 덜 필요하지 않다. */
  await page.evaluate((d) => {
    localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: [
      { id: "u", title: "운동하러 가기", icon: "run", createdAt: "",
        checks: [d[2], d[1], d[0]], history: [d[2], d[1], d[0]], lastCheckDate: d[0],
        totalDays: 3, completedCycles: 0, restarts: 0 }]}));
  }, [dstr(0), dstr(-1), dstr(-2)]);
  await reload();

  // 완주한 날 다음 사이클을 시작하면 checks는 비고 오늘 것은 돌로 넘어간다
  await page.evaluate(() => nextCycle(state.goals[0]));
  await page.waitForTimeout(300);
  const afterNext = await page.evaluate(() => ({
    checks: state.goals[0].checks.length,
    cycles: state.goals[0].completedCycles,
    stones: stoneCount(state.goals[0]),
    canUndo: canUndoToday(state.goals[0]),
  }));
  assert(afterNext.checks === 0 && afterNext.cycles === 1, "the finished three days became a stone");
  assert(afterNext.canUndo, "and today is still undoable even though it turned into one");

  await page.click(".goal-card .goal-top");
  await page.waitForTimeout(300);
  assert(await page.locator("#detail-undo").isVisible(), "so the button is there to press");
  await page.click("#detail-undo");
  await page.waitForTimeout(500);
  const unwound = await page.evaluate(() => ({
    checks: state.goals[0].checks.length,
    cycles: state.goals[0].completedCycles,
    stones: stoneCount(state.goals[0]),
    days: state.goals[0].totalDays,
    hasToday: state.goals[0].history.includes(
      new Date().toISOString().slice(0, 10)
    ),
  }));
  // 돌이 도로 풀리고 그 사이클의 앞 두 날이 칸으로 돌아와야 한다
  assert(unwound.cycles === 0 && unwound.stones === 0, "undoing takes the stone back apart");
  assert(unwound.checks === 2, `and the first two days return as squares (${unwound.checks})`);
  assert(unwound.days === 2, `with the day count following (${unwound.days})`);
  // 지우고 나면 시트가 스스로 닫힌다 — 따로 닫을 것이 없다
  await page.waitForTimeout(200);

  // 되돌릴 수 있을 때는 보이고, 누르면 실제로 지워진다
  await seedOne([dstr(-1), dstr(0)], dstr(0), 0);
  await page.click(".goal-card .goal-top");
  await page.waitForTimeout(300);
  assert(await page.locator("#detail-undo").isVisible(), "when it can be undone the button is there");
  await page.click("#detail-undo");
  await page.waitForTimeout(400);
  assert(
    (await page.evaluate(() => state.goals[0].checks.length)) === 1,
    "and pressing it actually clears today"
  );

  /* 41. 달력의 점은 만들 수 있는 작심 수만큼 다 찍힌다.
   * 네 개에서 자르면 여섯을 다 해낸 날의 기록이 빠져 보인다. */
  await page.evaluate((today) => {
    const goals = [];
    for (let i = 0; i < 6; i += 1) {
      goals.push({
        id: "c" + i, title: "작심 " + (i + 1), icon: "water", createdAt: "",
        checks: [today], history: [today], lastCheckDate: today,
        totalDays: 1, completedCycles: 0, restarts: 0,
      });
    }
    localStorage.setItem("jaksim3.v1", JSON.stringify({ goals }));
  }, dstr(0));
  await reload();
  await page.evaluate(() => switchView("record"));
  await page.waitForTimeout(400);
  const todayDots = await page.evaluate(
    () => document.querySelectorAll("#record-mcal .mcal-cell.today .gdot").length
  );
  assert(todayDots === 6, `a day with six goals shows six dots (${todayDots})`);

  /* 42. 작심 여섯이 정원에서 서로 파고들지 않는다.
   *
   * 예전에는 가로 간격만 봤다. 자리를 좌우로만 벌리던 때는 그걸로 충분했는데,
   * 정원 탭이 앞뒤로 깊어진 뒤로는 틀린 잣대가 됐다 — 앞뒤로 멀리 떨어진 두
   * 탑은 가로로 겹쳐 보여도 실제로는 하나가 다른 하나 뒤에 서 있는 것이고,
   * 그건 원근에서 당연한 일이다. 그래서 두 축을 함께 본다. 가려지는 것은
   * 괜찮고, 삼켜지는 것만 막는다. */
  await page.evaluate(() => switchView("garden"));
  await page.waitForTimeout(500);
  const collide = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll("#garden-page .tower")].map((t) =>
      t.getBoundingClientRect()
    );
    let worst = 0;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w <= 0 || h <= 0) continue;
        // 작은 쪽이 얼마나 먹혔는지로 잰다 — 큰 탑 기준이면 늘 작게 나온다
        worst = Math.max(worst, (w * h) / Math.min(a.width * a.height, b.width * b.height));
      }
    }
    return {
      current: document.querySelectorAll("#garden-page .tower-current").length,
      worst: Math.round(worst * 100) / 100,
    };
  });
  assert(collide.current === 6, "all six goals stand in the garden");
  assert(collide.worst <= 0.4, `and no tower is swallowed by another (${collide.worst})`);

  /* 43. 정원은 앱바 아래부터 탭바 위까지를 다 쓴다.
   *
   * 그림이 제 비율만큼만 자리를 차지하던 때는 화면 중간에서 내용이 끝나고
   * 아래 절반이 비었다. 눈으로는 "좀 허전하네" 정도라 그냥 넘어가기 쉬워서,
   * 숫자로 잡아 둔다. style.css의 --appbar-h가 실제 앱바와 어긋나도 여기서
   * 걸린다. */
  const fills = await page.evaluate(() => {
    const svg = document.querySelector("#garden-page svg");
    const vb = svg.getAttribute("viewBox").split(" ").map(Number);
    const box = svg.getBoundingClientRect();
    const scale = Math.min(box.width / vb[2], box.height / vb[3]);
    const stats = document.querySelector("#view-garden .record-stats").getBoundingClientRect();
    const tabbar = document.querySelector(".tabbar").getBoundingClientRect();
    return {
      drawnH: Math.round(vb[3] * scale),
      drawnW: Math.round(vb[2] * scale),
      boxH: Math.round(box.height),
      gapToTabbar: Math.round(tabbar.top - stats.bottom),
      scrolls: document.documentElement.scrollHeight > innerHeight + 1,
    };
  });
  assert(!fills.scrolls, "the garden fits on one screen");
  assert(
    fills.gapToTabbar >= 0 && fills.gapToTabbar <= 48,
    `the numbers sit just above the tabbar (${fills.gapToTabbar}px)`
  );
  assert(
    fills.drawnH >= fills.boxH * 0.85,
    `and the towers fill the height they were given (${fills.drawnH}/${fills.boxH})`
  );

  /* 44. 작심 여섯의 달력이 화면 밖으로 나가지 않는다.
   *
   * 하루에 여섯을 다 하면 칸 아래 점도 여섯이다. 한 줄로 세우면 51px가
   * 필요한데 칸은 37~41px뿐이고, 격자 칸은 기본적으로 '내용보다 좁아질 수
   * 없어서' 칸이 벌어지고 달력이 카드 밖으로 밀려 나갔다. 폰에서는 오른쪽이
   * 잘려 보였다. 좁은 기기에서 먼저 터지므로 좁은 폭으로 잰다. */
  await page.setViewportSize({ width: 360, height: 760 });
  await page.evaluate(() => switchView("record"));
  await page.waitForTimeout(400);
  const sixDots = await page.evaluate(() => {
    const cell = document.querySelector("#record-mcal .mcal-cell.today");
    const cb = cell.getBoundingClientRect();
    const dots = cell.querySelector(".gdots").getBoundingClientRect();
    return {
      pageOverflows: document.documentElement.scrollWidth > innerWidth + 1,
      dots: cell.querySelectorAll(".gdot").length,
      // 접힌 점이 칸 밖으로 삐져나가면 옆 칸 위에 겹쳐 그려진다
      inside: dots.right <= cb.right + 0.5 && dots.bottom <= cb.bottom + 0.5,
      numberVisible: cell.querySelector("i").getBoundingClientRect().height > 6,
    };
  });
  assert(!sixDots.pageOverflows, "six goals do not push the calendar off the screen");
  assert(sixDots.dots === 6, `every one of the six still gets a dot (${sixDots.dots})`);
  assert(sixDots.inside, "and the folded dots stay inside their day");
  assert(sixDots.numberVisible, "with the date still readable above them");

  /* 기기 글꼴을 키운 사람에게서 먼저 터진다.
   *
   * 점을 두 줄로 접고 나서도 실기기에서는 여전히 삐져나왔다. 원인은 날짜
   * 글자였다 — 기기 설정으로 글꼴을 키우면 그 한 줄이 칸을 밀어 올리고,
   * 밀린 만큼 점이 아래로 나간다. 브라우저 기본(16px)만 재면 영영 못 잡는다. */
  for (const scale of [1.15, 1.3]) {
    await page.evaluate((s) => { document.documentElement.style.fontSize = 16 * s + "px"; }, scale);
    await page.waitForTimeout(250);
    const big = await page.evaluate(() => {
      const cell = document.querySelector("#record-mcal .mcal-cell.today");
      const cb = cell.getBoundingClientRect();
      const db = cell.querySelector(".gdots").getBoundingClientRect();
      return {
        slack: Math.round(cb.bottom - db.bottom),
        inside: db.right <= cb.right + 0.5 && db.bottom <= cb.bottom + 0.5,
        overflows: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    assert(big.inside && !big.overflows, `the dots hold at ${Math.round(scale * 100)}% system text`);
    // 딱 맞는 것은 맞는 것이 아니다 — 여유가 없으면 다음 기기에서 다시 터진다
    assert(big.slack >= 2, `with room to spare beneath them (${big.slack}px)`);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await page.setViewportSize({ width: 390, height: 844 });

  /* 45. 무언가를 바꾸면 지금 보고 있는 탭이 함께 바뀐다.
   *
   * 정원과 기록은 탭을 열 때 한 번 그리고 마는 구조였다. 그래서 그 탭에 머문
   * 채로 '오늘 표시 지우기'를 하면 화면이 옛 상태로 남았다 — 정원에서는 아래
   * 숫자만 하나 줄고 탑의 3일 테두리는 그대로, 기록에서는 달력에 오늘이 그대로
   * 칠해진 채로. 지운 사람 눈에는 지워진 것과 안 지워진 것이 한 화면에 같이
   * 있는 셈이라, 지워졌는지 아닌지를 알 수 없다. */
  const seedTwoDays = () =>
    page.evaluate((d) => {
      state.goals = [{ id: "stay", title: "물 한 잔", icon: "water", createdAt: "",
        checks: [d.yes, d.today], history: [d.yes, d.today], lastCheckDate: d.today,
        totalDays: 2, completedCycles: 0, restarts: 0 }];
      save();
      render();
    }, { yes: dstr(-1), today: dstr(0) });

  await seedTwoDays();
  await page.evaluate(() => switchView("garden"));
  await page.waitForTimeout(400);
  await page.evaluate(() => { openDetail(state.goals[0]); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { undoToday(state.goals[0]); closeDetail(); });
  await page.waitForTimeout(400);
  const onGarden = await page.evaluate(() => ({
    ring: document.querySelectorAll("#garden-page .slot-day").length,
    checks: state.goals[0].checks.length,
    days: document.getElementById("stat-total-days").textContent,
  }));
  assert(
    onGarden.ring === onGarden.checks,
    `undoing from the garden clears the three-day ring too (${onGarden.ring} vs ${onGarden.checks})`
  );
  assert(onGarden.days === "1", `and the numbers agree with it (${onGarden.days})`);

  await seedTwoDays();
  await page.evaluate(() => switchView("record"));
  await page.waitForTimeout(400);
  await page.evaluate(() => { openDetail(state.goals[0]); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { undoToday(state.goals[0]); closeDetail(); });
  await page.waitForTimeout(400);
  assert(
    (await page.locator("#record-mcal .mcal-cell.today.done").count()) === 0,
    "and undoing from the record clears today off the calendar"
  );

  /* 46. 십 년을 다녀도 앱이 무너지지 않는다.
   *
   * 이 앱은 오래 쓰라고 만든 것이라, 오래 쓴 사람에게서 처음 터지면 가장
   * 나쁘다. 작심 여섯이 10년을 하루도 빠짐없이 다닌 기록을 넣어 본다 —
   * 탑 1458채, 돌 7296개, 저장된 기록 279KB.
   *
   * 예전에는 정원 탭이 그 1458채를 전부 그렸다. SVG 요소가 4만 개가 되어
   * 개발용 컴퓨터에서도 여는 데 1초가 걸렸고(폰이면 몇 배다), 그러면서 보이는
   * 것은 없었다 — 탑 하나가 1px도 안 되니 한 덩어리로 뭉친다. 지금은 한 쪽에
   * towersPerPage만큼만 세우고 나머지는 넘겨서 본다. */
  const decade = await page.evaluate(() => {
    const days = 3650;
    const hist = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      hist.push(
        `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`
      );
    }
    localStorage.setItem("jaksim3.v1", JSON.stringify({
      goals: Array.from({ length: 6 }, (_, i) => ({
        id: "decade" + i, title: "작심 " + (i + 1), icon: "water", createdAt: hist[0],
        checks: [], history: hist.slice(), lastCheckDate: hist[hist.length - 1],
        totalDays: days, completedCycles: Math.floor(days / 3), restarts: 4 + i,
      })),
    }));
    return localStorage.getItem("jaksim3.v1").length;
  });
  // 5MB 한도에 견주면 한참 아래다 — 30년을 다녀도 여유가 있다는 뜻
  assert(decade < 400 * 1024, `ten years of six goals still fits in storage (${Math.round(decade / 1024)}KB)`);

  await reload();
  await page.evaluate(() => switchView("garden"));
  await page.waitForTimeout(600);
  const long = await page.evaluate(() => {
    const svg = document.querySelector("#garden-page svg");
    return {
      towers: document.querySelectorAll("#garden-page .tower").length,
      nodes: svg.getElementsByTagName("*").length,
      word: document.getElementById("garden-word").textContent,
      realTowers: state.goals.reduce((s, g) => s + towersOf(g).done, 0),
      overflowX: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  assert(long.realTowers > 1000, `the record itself still counts every tower (${long.realTowers})`);
  assert(
    long.towers > 0 && long.towers <= 90,
    `but the garden draws a legible number of them (${long.towers})`
  );
  assert(long.nodes < 4000, `so the drawing stays light (${long.nodes} svg nodes)`);
  assert(
    long.word.includes(`탑 ${long.realTowers}채`),
    `the count still tells the truth → ${long.word}`
  );
  assert(!long.overflowX, "a decade of towers does not spill off the screen");

  /* 47. 한 쪽에 다 못 세우면 넘겨서 본다 — 빠지는 탑은 없다.
   *
   * 한 화면에 읽히는 만큼만 세우는 것과 옛 탑을 버리는 것은 다르다. 후자면
   * 이 탭을 만든 이유(예전 탑이 사라진다)가 그대로 돌아온다. 그래서 넘기는
   * 길이 실제로 동작하는지, 끝에서 멈추는지, 넘긴 뒤에도 탑이 여전히 눌리는지
   * 까지 본다. */
  await page.evaluate(() => switchView("garden"));
  await page.waitForTimeout(500);
  const nav = await page.evaluate(() => ({
    shown: !document.getElementById("garden-nav").hidden,
    label: document.getElementById("garden-page-label").textContent,
    pages: gardenPageCount(state.goals),
    // 첫 쪽에서는 더 최근이 없다
    nextOff: document.getElementById("garden-next").disabled,
    prevOff: document.getElementById("garden-prev").disabled,
  }));
  assert(nav.shown, "ten years of towers offer a way to page back");
  assert(nav.pages > 20, `and that is a lot of pages (${nav.pages})`);
  assert(nav.label === `1 / ${nav.pages}`, `starting at the newest (${nav.label})`);
  assert(nav.nextOff && !nav.prevOff, "with only the way backwards open");

  const firstPage = await page.evaluate(
    () => [...document.querySelectorAll("#garden-page .tower")].map((t) => t.getAttribute("transform")).join("|")
  );
  await page.click("#garden-prev");
  await page.waitForTimeout(400);
  const turned = await page.evaluate(() => ({
    label: document.getElementById("garden-page-label").textContent,
    towers: document.querySelectorAll("#garden-page .tower").length,
    // 첫 쪽에만 '쌓는 중인 탑'이 있다 — 뒤 쪽은 이미 완성된 것들이다
    current: document.querySelectorAll("#garden-page .tower-current").length,
    shape: [...document.querySelectorAll("#garden-page .tower")].map((t) => t.getAttribute("transform")).join("|"),
    word: document.getElementById("garden-word").textContent,
    nextOff: document.getElementById("garden-next").disabled,
  }));
  assert(turned.label === `2 / ${nav.pages}`, `paging back moves one page (${turned.label})`);
  assert(turned.shape !== firstPage, "and puts different towers on the ground");
  assert(turned.towers > 0, `the older page stands its own towers (${turned.towers})`);
  assert(turned.current === 0, "none of which is still being built");
  assert(turned.word.includes("예전에 세운"), `and the words follow → ${turned.word}`);
  assert(!turned.nextOff, "the way back to the newest is open again");

  /* 넘긴 쪽의 탑도 눌러서 그 작심으로 갈 수 있어야 한다.
     맨 뒤부터 그리므로 마지막이 맨 앞 탑이다 — 뒤 탑은 앞 탑에 가려 있어
     누르면 앞 탑이 잡힌다. 원근에서는 그게 맞다. */
  await page.locator("#garden-page .tower").last().click();
  await page.waitForTimeout(400);
  assert(await page.locator("#detail").isVisible(), "a tower on an older page still opens its record");
  await page.click("#detail-close");
  await page.waitForTimeout(250);

  /* 화살표는 곁들이고, 진짜 손짓은 옆으로 미는 것이다.
   *
   * 탑 하나하나가 눌리는 버튼이라 미는 것과 누르는 것이 섞이기 쉽다. 밀었는데
   * 손 뗀 자리의 탑이 열리면 최악이므로, 밀고 나서 상세가 열리지 않는 것까지
   * 함께 본다. 세로로 미는 것은 쪽과 무관해야 한다 — 그건 화면을 넘기려는
   * 손짓이 아니다. */
  const gbox = await page.locator("#garden-page").boundingBox();
  const gy = gbox.y + gbox.height / 2;
  const swipe = async (fromR, toR) => {
    await page.mouse.move(gbox.x + gbox.width * fromR, gy);
    await page.mouse.down();
    await page.mouse.move(gbox.x + gbox.width * toR, gy, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
  };
  const pageLabel = () => page.locator("#garden-page-label").textContent();

  const beforeSwipe = await pageLabel();
  await swipe(0.75, 0.25); // 왼쪽으로 — 종이를 넘기듯 예전으로
  assert((await pageLabel()) !== beforeSwipe, `swiping left turns the page (${await pageLabel()})`);
  assert(await page.locator("#detail").isHidden(), "and does not open the tower it let go of");

  await swipe(0.25, 0.8); // 오른쪽으로 — 최근으로 되돌아온다
  assert(
    (await pageLabel()) === beforeSwipe,
    `swiping back the other way returns (${await pageLabel()})`
  );

  const beforeDrag = await pageLabel();
  await page.mouse.move(gbox.x + gbox.width / 2, gbox.y + 20);
  await page.mouse.down();
  await page.mouse.move(gbox.x + gbox.width / 2 + 10, gbox.y + gbox.height - 20, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  assert((await pageLabel()) === beforeDrag, "but dragging up and down leaves the page alone");

  // 맨 끝까지 간 뒤에는 더 갈 곳이 없다 — 눌러도 조용히 멈춘다
  await page.evaluate(() => {
    for (let i = 0; i < gardenPageCount(state.goals) + 3; i++) turnGarden(1);
  });
  await page.waitForTimeout(400);
  const end = await page.evaluate(() => ({
    label: document.getElementById("garden-page-label").textContent,
    prevOff: document.getElementById("garden-prev").disabled,
    towers: document.querySelectorAll("#garden-page .tower").length,
  }));
  assert(end.label === `${nav.pages} / ${nav.pages}`, `the last page is the last (${end.label})`);
  assert(end.prevOff, "and going further back is closed off");
  assert(end.towers > 0, `the oldest page is not empty (${end.towers})`);

  // 탭을 나갔다 오면 가장 최근으로 돌아온다 — 예전 쪽에 남아 있으면 탑을 잃은 줄 안다
  await page.evaluate(() => switchView("home"));
  await page.waitForTimeout(200);
  await page.evaluate(() => switchView("garden"));
  await page.waitForTimeout(400);
  assert(
    (await page.locator("#garden-page-label").textContent()) === `1 / ${nav.pages}`,
    "leaving and coming back lands on the newest again"
  );

  /* 넘길 것이 없는 사람에게는 넘기는 자리도 없다.
     저장은 건드리지 않는다 — 아래에서 10년치 기록으로 되돌아와야 한다. */
  await page.evaluate((d) => {
    state.goals = [{ id: "few", title: "물 한 잔", icon: "water", createdAt: "",
      checks: [d], history: [d], lastCheckDate: d,
      totalDays: 1, completedCycles: 0, restarts: 0 }];
    switchView("garden");
  }, dstr(0));
  await page.waitForTimeout(400);
  assert(
    await page.locator("#garden-nav").isHidden(),
    "a garden that fits on one page shows no pager at all"
  );

  // 오래 쓴 기록에서도 나머지 화면이 열려야 한다 — 여기서 터지면 되돌릴 길이 없다
  await reload();
  await page.evaluate(() => switchView("record"));
  await page.waitForTimeout(500);
  assert(
    (await page.locator("#record-goals .record-row").count()) === 6,
    "the record still lists every goal after ten years"
  );
  await page.evaluate(() => openDetail(state.goals[0]));
  await page.waitForTimeout(400);
  assert(await page.locator("#detail").isVisible(), "and a ten-year goal's sheet still opens");
  await page.click("#detail-close");
  await page.waitForTimeout(200);

  /* 48. 돌아온 순간이 토스트 한 줄로 지나가지 않는다 — 그리고 사용자가 고른다.
   *
   * 이 앱이 다른 습관 앱과 갈리는 지점은 '안 끊기게 하는 것'이 아니라
   * '끊긴 뒤에 돌아오게 하는 것'이다. 그런데 완주는 화면을 통째로 쓰는
   * 축하를 받고 돌아온 순간은 토스트 한 줄이었다 — 제품이 말하는 것과
   * 제품이 실제로 보상하는 행동이 어긋나 있었다.
   *
   * 시트는 다시 시작하기 '전에' 뜬다. 처음에는 먼저 시작하고 알려 주기만
   * 했는데, 그러면 '좋아, 다시 해볼게'가 거짓말이 된다 — 누르기 전에 이미
   * 시작돼 있고 바깥을 눌러도 되돌릴 수 없다. docs/POSITIONING.md 참고. */
  const seedGoal = (checks, last, extra) =>
    page.evaluate((d) => {
      localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: [
        { id: "cb", title: "운동하러 가기", icon: "run", createdAt: "",
          checks: d.checks, history: d.checks, lastCheckDate: d.last,
          totalDays: d.checks.length, completedCycles: d.cycles, restarts: d.restarts }]}));
    }, { checks, last, cycles: (extra && extra.cycles) || 0, restarts: (extra && extra.restarts) || 0 });
  const restartsNow = () => page.evaluate(() => state.goals[0].restarts);

  // 끊긴 뒤(broken) 다시 쌓기
  await seedGoal([dstr(-5), dstr(-4)], dstr(-4), { cycles: 3, restarts: 1 });
  await reload();
  assert(
    (await page.locator(".goal-card .btn").textContent()).includes("다시 쌓기"),
    "a broken goal offers the way back"
  );
  await page.click(".goal-card .btn");
  await page.waitForTimeout(500);
  const back = await page.evaluate(() => ({
    open: !document.getElementById("return").hidden,
    title: document.getElementById("return-title").textContent,
    word: document.getElementById("return-word").textContent,
    countShown: !document.getElementById("return-count").hidden,
    count: document.getElementById("return-count").textContent,
    cheerOpen: !document.getElementById("cheer").hidden,
  }));
  assert(back.open, "coming back opens a moment of its own, not a toast");
  assert(back.title.includes("다시"), `which greets the return (${back.title})`);
  assert(back.word.includes("그대로"), `and says the stones are still there → ${back.word}`);
  // 완주 축하와 같은 화면이면 두 감정이 뭉개진다
  assert(!back.cheerOpen, "and it is not the completion celebration wearing a hat");
  /* 세는 것은 멈춘 횟수가 아니라 돌아온 횟수다. '멈췄지만'이 들어가면
     위로하는 모양을 하고서 실패를 앞세우는 문장이 된다. */
  assert(back.countShown, "past comebacks are worth saying out loud");
  assert(
    back.count.includes("다시 돌아왔어요") && !back.count.includes("멈"),
    `counted as comebacks, not stumbles (${back.count})`
  );

  /* 여기가 이번 수정의 핵심이다 — 아직 아무 일도 일어나지 않았어야 한다.
     버튼이 '좋아, 다시 해볼게'인데 이미 시작돼 있으면 버튼이 거짓말이다. */
  assert((await restartsNow()) === 1, "nothing has happened yet — the sheet only asked");

  // 바깥을 누르면 물어만 본 것이 된다
  await page.mouse.click(195, 60);
  await page.waitForTimeout(400);
  assert(await page.locator("#return").isHidden(), "tapping outside closes the question");
  assert((await restartsNow()) === 1, "and answering nothing starts nothing");

  // 이번에는 실제로 고른다
  await page.click(".goal-card .btn");
  await page.waitForTimeout(450);
  await page.click("#return-ok");
  await page.waitForTimeout(500);
  assert(await page.locator("#return").isHidden(), "choosing it closes the sheet");
  assert((await restartsNow()) === 2, "and only then does the comeback count");
  assert(
    (await page.locator(".goal-card .dot.done").count()) === 1,
    "with today standing as the first of the new three"
  );

  // 처음 돌아온 사람에게는 아직 셀 복귀가 없다
  await seedGoal([dstr(-5)], dstr(-5), { cycles: 0, restarts: 0 });
  await reload();
  await page.click(".goal-card .btn");
  await page.waitForTimeout(450);
  assert(
    await page.locator("#return-count").isHidden(),
    "a first comeback has no earlier ones to point at"
  );
  await page.click("#return-ok");
  await page.waitForTimeout(400);

  /* 오래 쉬었다 온 것(lapsed)도 같은 순간을 받는다 — 3일을 다 채우고 2주
     쉬었다 돌아온 쪽이 오히려 더 큰 복귀다. */
  await seedGoal([dstr(-16), dstr(-15), dstr(-14)], dstr(-14), { cycles: 4, restarts: 0 });
  await reload();
  await page.click(".goal-card .btn");
  await page.waitForTimeout(500);
  assert(
    await page.locator("#return").isVisible(),
    "coming back from a long rest gets the same moment"
  );
  assert((await restartsNow()) === 0, "and it asks first here too");
  await page.click("#return-ok");
  await page.waitForTimeout(500);
  assert((await restartsNow()) === 1, "then counts once chosen");

  /* 완주 다음 날 바로 이어 가는 것(resting)은 멈춘 적이 없다. 여기에 '다시
     왔네요'가 뜨면 멈추지도 않은 사람에게 멈췄다고 말하는 셈이다. */
  await seedGoal([dstr(-3), dstr(-2), dstr(-1)], dstr(-1), { cycles: 2, restarts: 0 });
  await reload();
  await page.click(".goal-card .btn");
  await page.waitForTimeout(500);
  assert(
    await page.locator("#return").isHidden(),
    "but carrying straight on the next day is not a comeback"
  );
  assert(
    (await page.evaluate(() => state.goals[0].completedCycles)) === 3,
    "and it just carries on, without asking"
  );

  /* ── 49. 스트릭이 있던 자리 ──────────────────────
   *
   * 카드에서 습관 앱이 '🔥 12일 연속'을 두는 자리에 이 앱이 세기로 한 수가
   * 서 있는지. 그 자리가 비어 있으면 스트릭을 일부러 버린 앱이 아니라
   * 스트릭이 아직 없는 앱으로 읽힌다.
   *
   * 폭도 함께 잰다. 한 줄에 다 못 들어가면 말줄임표에 잘려 숫자가 보이다
   * 말고, 그러면 있느니만 못하다 — 360px 기기와 큰 글씨에서 확인한다. */
  const statusOf = () => page.locator(".goal-card .goal-status").textContent();
  const statusFits = () =>
    page.evaluate(() => {
      const s = document.querySelector(".goal-card .goal-status");
      return s.scrollWidth <= s.closest(".goal-tt").clientWidth + 1;
    });

  await seedGoal([dstr(-1)], dstr(-1), { cycles: 4, restarts: 3 });
  await reload();
  assert((await statusOf()).includes("3번 다시 쌓는 중"), "a goal that came back says so where a streak would be");
  assert(await statusFits(), "and it fits the line instead of being cut off");

  // 다시 온 적 없는 작심은 그대로 며칠째인지를 말한다
  await seedGoal([dstr(-1)], dstr(-1), { cycles: 1, restarts: 0 });
  await reload();
  assert((await statusOf()).includes("둘째 날"), "a goal that never broke still counts its days");

  // 완주한 순간만은 그 순간의 말이 먼저다
  await seedGoal([dstr(-2), dstr(-1), dstr(0)], dstr(0), { cycles: 1, restarts: 3 });
  await reload();
  assert((await statusOf()).includes("돌 하나 완성"), "the moment of finishing still speaks first");

  // 끊긴 카드는 이미 돌아오라고 말하고 있다 — 같은 말을 두 번 하지 않는다
  await seedGoal([dstr(-5), dstr(-4)], dstr(-4), { cycles: 3, restarts: 3 });
  await reload();
  assert((await statusOf()).includes("그대로"), "a broken card keeps saying what is still there");

  // 작은 화면 + 큰 글씨에서도 잘리지 않아야 의미가 있다
  await page.setViewportSize({ width: 360, height: 780 });
  await page.addStyleTag({ content: "html{font-size:130%}" });
  await seedGoal([dstr(-1)], dstr(-1), { cycles: 4, restarts: 3 });
  await reload();
  await page.addStyleTag({ content: "html{font-size:130%}" });
  await page.waitForTimeout(200);
  assert(await statusFits(), "and it still fits at 360px with 130% system text");
  await page.setViewportSize({ width: 390, height: 844 });

  /* ── 50. 처음 온 사람에게 하는 말 ──────────────────
   *
   * 돌 하나를 얹기 전까지 홈에 뜨는 유일한 문장이다. 규칙만 설명하면
   * 첫날 화면에 이 앱이 다른 습관 앱과 갈리는 말이 한 마디도 없게 된다. */
  await seedGoal([], null, { cycles: 0, restarts: 0 });
  await reload();
  const note = await page.locator("#note").textContent();
  assert(note.includes("3일"), "the one line on home still teaches the rule");
  assert(note.includes("그대로"), "and promises that a missed day takes nothing away");

  /* 안내에서도 '끊겨도 그대로'가 말이 아니라 그림으로 서 있는지 */
  const breakSlide = await page.evaluate(() => {
    closeDetail();
    openOnboard();
    obIndex = ONBOARD.findIndex((x) => x.art === obBreakArt);
    paintOnboard();
    const line = document.querySelector(".ob-break-line");
    return {
      title: document.querySelector(".ob-title").textContent,
      gap: !!document.querySelector(".ob-break-gap"),
      done: document.querySelectorAll(".ob-break-line .dot.done").length,
      today: document.querySelectorAll(".ob-break-line .dot.today").length,
      stone: !!document.querySelector(".ob-break-stone svg"),
      fits: line.getBoundingClientRect().width <= document.querySelector(".ob-body").clientWidth,
    };
  });
  assert(breakSlide.title === "끊겨도 돌은 그대로", "the recovery slide is still the fourth");
  /* 왼쪽이 두 칸인 것이 이 장의 요점이다. 셋이면 3일을 끝내고 쉰 그림이라,
     정작 사람이 멈추는 자리(두 칸째)를 안 보여 주게 된다. */
  assert(breakSlide.done === 2 && breakSlide.gap && breakSlide.today === 1,
    "and it draws a three-day run that stopped at two, a gap, then a fresh first day");
  assert(breakSlide.stone, "with the tower still standing above the gap");
  assert(breakSlide.fits, "and the row fits the screen instead of wrapping");
  await page.evaluate(() => closeOnboard());

  assert(errors.length === 0, "no console/page errors" + (errors.length ? " → " + errors.join("; ") : ""));

  await page.screenshot({ path: __dirname + "/screenshot.png", fullPage: true });
  await browser.close();
  server.close();
})();
