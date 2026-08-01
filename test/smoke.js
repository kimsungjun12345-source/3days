const { chromium } = require("playwright-core");
const path = require("path");

const APP = "file://" + path.resolve(__dirname, "..", "index.html");

function dstr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("Failed to load resource")) errors.push("console: " + m.text()); });

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
  assert((await page.locator(".goal-card .btn-primary").textContent()).includes("돌 얹기"), "fresh goal offers stone-check CTA");

  // 3. 오늘 체크
  await page.click(".goal-card .btn-primary");
  assert((await page.locator(".goal-card .dot.done").count()) === 1, "one dot marked done after check");
  assert(await page.locator(".goal-card .btn-done").isDisabled(), "button disabled after today's check");
  assert((await page.locator("#stat-total-days").textContent()) === "1", "total days = 1");

  // 4. 완주 시나리오: 어제·그저께·오늘 체크한 상태를 주입
  await page.evaluate(([d2, d1, d0]) => {
    const s = JSON.parse(localStorage.getItem("jaksim3.v1"));
    s.goals[0].checks = [d2, d1, d0];
    s.goals[0].lastCheckDate = d0;
    s.goals[0].totalDays = 3;
    localStorage.setItem("jaksim3.v1", JSON.stringify(s));
  }, [dstr(-2), dstr(-1), dstr(0)]);
  await page.reload();
  assert(await page.locator(".goal-card.state-complete").isVisible(), "complete state after 3 checks");
  assert((await page.locator("#stat-cycles").textContent()) === "1", "cycle counted while complete");

  // 5. 또 작심하기 (완주 당일 → 내일부터 Day 1)
  await page.click(".goal-card .btn-success");
  const doneBtnText = await page.locator(".goal-card .btn-done").textContent();
  assert(doneBtnText.includes("내일"), "next cycle deferred to tomorrow when completed today");
  assert((await page.locator("#stat-cycles").textContent()) === "1", "cycle count preserved after rollover");

  // 6. 끊김 시나리오: 마지막 체크가 3일 전
  await page.evaluate(([d3]) => {
    const s = JSON.parse(localStorage.getItem("jaksim3.v1"));
    s.goals[0].checks = [d3];
    s.goals[0].lastCheckDate = d3;
    localStorage.setItem("jaksim3.v1", JSON.stringify(s));
  }, [dstr(-3)]);
  await page.reload();
  assert(await page.locator(".goal-card.state-broken").isVisible(), "broken state when a day was missed");
  assert((await page.locator("#stat-total-days").textContent()) === "3", "accumulated days preserved when broken");

  // 7. 다시 작심 → 오늘 Day 1 체크됨, 다시 일어난 횟수 +1
  await page.click(".goal-card .btn-rest");
  assert((await page.locator(".goal-card .dot.done").count()) === 1, "restart checks today as first day");
  assert((await page.locator("#stat-restarts").textContent()) === "1", "restart counter incremented");
  assert((await page.locator("#stat-total-days").textContent()) === "4", "total days keeps growing after restart");

  // 8. 삭제
  page.on("dialog", (d) => d.accept());
  await page.evaluate(() => {
    const c = document.querySelector(".goal-card");
    c.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
  await page.waitForTimeout(800);
  assert((await page.locator(".goal-card").count()) === 0, "goal deleted");
  assert(await page.locator("#empty").isVisible(), "empty state returns after delete");

  // 9. 완주 축하 화면 — 실제로 3일째를 눌러서
  await page.evaluate(([d2, d1]) => {
    localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: [
      { id: "z", title: "10분 걷기", icon: "run", createdAt: "",
        checks: [d2, d1], lastCheckDate: d1, totalDays: 8, completedCycles: 2, restarts: 1 }]}));
  }, [dstr(-2), dstr(-1)]);
  await page.reload();
  await page.click(".goal-card .btn-primary");
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
  await page.reload();

  await page.click(".goal-top");
  await page.waitForTimeout(300);
  assert(await page.locator("#detail").isVisible(), "record sheet opens on card tap");
  assert((await page.locator(".cal-cell").count()) === 84, "calendar shows 12 weeks");
  assert((await page.locator(".cal-cell.on").count()) === 6, "calendar marks every day from history");
  assert((await page.locator("#detail-word").textContent()).includes("다시"), "record sheet tells the restart story");
  await page.click("#detail-close");
  await page.waitForTimeout(200);
  assert(await page.locator("#detail").isHidden(), "record sheet closes");

  // 11. 버튼을 길게 눌러도 삭제되지 않는다
  await page.locator(".goal-card .btn").hover();
  await page.mouse.down();
  await page.waitForTimeout(1000);
  await page.mouse.up();
  assert((await page.locator(".goal-card").count()) === 1, "long-press on a button never deletes the goal");

  assert(errors.length === 0, "no console/page errors" + (errors.length ? " → " + errors.join("; ") : ""));

  await page.screenshot({ path: __dirname + "/screenshot.png", fullPage: true });
  await browser.close();
})();
