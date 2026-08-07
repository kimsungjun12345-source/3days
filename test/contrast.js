/* 글자가 읽히는지 검사한다 — 밝은 화면과 어두운 화면 양쪽에서.
 *
 * 실기기 피드백에 "밝게 했을 때 흰색이라 안 보이는 글자가 있다"가 나왔다.
 * 눈으로 훑어서는 매번 놓치므로, 화면마다 보이는 모든 글자를 돌며
 * 실제로 뒤에 깔린 색과의 명암비를 계산한다.
 *
 * 기준은 WCAG AA다. 본문 4.5:1, 큰 글자(24px 이상 또는 18.66px 이상 굵게)
 * 3:1. 다만 '읽는 글자'가 아니라 장식으로 흐려 둔 것들(지나갈 날짜,
 * 화살표, 바닥글)은 3:1까지 봐준다 — 목록으로 명시해 둔다.
 *
 *   node test/contrast.js
 */

const { chromium } = require("playwright-core");
const path = require("path");

const APP = "file://" + path.resolve(__dirname, "..", "index.html");

function dstr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* 일부러 흐리게 둔 것들 — 여기 있는 것만 3:1로 낮춰 본다.
 * 새로 추가할 때는 "이 글자를 못 읽어도 앱을 쓰는 데 지장이 없는가"를
 * 먼저 물을 것. 지장이 있으면 색을 고쳐야지 목록에 넣을 일이 아니다. */
const DIMMED = [".mcal-cell.future", ".footer", ".data-actions", ".field-hint", ".row-arrow", ".ob-cap"];

const AUDIT = (dimmed) => {
  const chan = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = (c) => 0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2]);
  /* rgb()은 0~255로, color-mix()가 만드는 color(srgb …)는 0~1로 나온다.
   * 둘을 구분하지 않으면 반투명한 탭바 배경이 거의 검정으로 읽혀
   * 멀쩡한 글자가 실패로 잡힌다. */
  const parse = (s) => {
    const str = String(s);
    const m = str.match(/[\d.]+/g);
    if (!m) return null;
    const nums = m.slice(0, 4).map(Number);
    if (/^color\(/.test(str)) {
      return [nums[0] * 255, nums[1] * 255, nums[2] * 255, nums[3]];
    }
    return nums;
  };
  // 부모를 거슬러 올라가 실제로 뒤에 깔린 불투명한 색을 찾는다
  const bgOf = (el) => {
    let n = el;
    while (n) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && (c[3] === undefined || c[3] > 0.85)) return c;
      n = n.parentElement;
    }
    return [255, 255, 255];
  };

  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const st = getComputedStyle(el);
    if (el.offsetParent === null && st.position !== "fixed") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (st.visibility === "hidden" || Number(st.opacity) < 0.3) continue;
    // 자기 자신이 직접 글자를 들고 있는 것만 (부모까지 중복해 세지 않는다)
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;

    const fg = parse(st.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const l1 = lum(fg);
    const l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

    const size = parseFloat(st.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(st.fontWeight) >= 700);
    const dim = dimmed.some((sel) => el.closest(sel));
    const need = large || dim ? 3 : 4.5;

    if (ratio + 0.005 < need) {
      const cls = typeof el.className === "string" && el.className.trim()
        ? "." + el.className.trim().split(/\s+/).join(".")
        : "";
      out.push({
        sel: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + cls,
        text: el.textContent.trim().slice(0, 20),
        ratio: Math.round(ratio * 100) / 100,
        need,
        color: st.color,
        bg: `rgb(${bg.slice(0, 3).join(",")})`,
      });
    }
  }
  return out;
};

(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  });

  let failures = 0;
  const assert = (cond, name) => {
    console.log((cond ? "PASS" : "FAIL") + "  " + name);
    if (!cond) {
      failures += 1;
      process.exitCode = 1;
    }
  };

  /* 기기 설정과 앱 설정이 어긋난 조합까지 본다.
   *
   * 예전에는 light/light와 dark/dark만 봤다. 그런데 실제로 글자가 사라진 곳은
   * '기기는 어둡고 앱에서는 밝게를 고른' 조합이었다. <button>은 color를
   * 상속하지 않고 UA 기본값을 쓰는데, 그 값이 기기 설정을 따라 흰색이 되면서
   * 흰 카드 위에 흰 글자가 됐다. 엇갈린 조합을 보지 않으면 영원히 못 잡는다. */
  const COMBOS = [
    { device: "light", app: null, label: "기기 밝음" },
    { device: "dark", app: null, label: "기기 어두움" },
    { device: "dark", app: "light", label: "기기 어두움 + 앱 밝게" },
    { device: "light", app: "dark", label: "기기 밝음 + 앱 어둡게" },
  ];

  for (const combo of COMBOS) {
    const scheme = combo.label;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: combo.device });
    const page = await ctx.newPage();

    await page.addInitScript((d) => {
      localStorage.setItem("jaksim3.onboarded", "1");
      if (d[3]) localStorage.setItem("jaksim3.theme", d[3]);
      else localStorage.removeItem("jaksim3.theme");
      localStorage.setItem("jaksim3.v1", JSON.stringify({ goals: [
        { id: "a", title: "아침에 물 한 잔", icon: "water", createdAt: "",
          checks: [d[0]], history: [d[1], d[0]], lastCheckDate: d[0],
          totalDays: 7, completedCycles: 2, restarts: 1 },
        { id: "b", title: "10분 걷기", icon: "run", createdAt: "",
          checks: [], history: [d[2]], lastCheckDate: d[2],
          totalDays: 4, completedCycles: 1, restarts: 0 }]}));
      const s = document.createElement("style");
      s.textContent = ".intro{display:none !important}";
      const put = () => document.head && document.head.appendChild(s);
      document.head ? put() : document.addEventListener("DOMContentLoaded", put);
    }, [dstr(0), dstr(-1), dstr(-9), combo.app]);

    await page.goto(APP);
    await page.waitForTimeout(500);

    const screens = {
      "홈": async () => {},
      "기록": async () => { await page.click('.tab[data-view="record"]'); },
      // 알림 줄은 앱으로 감쌌을 때만 보이지만, 색은 여기서 함께 확인해 둔다
      "설정": async () => {
        await page.click('.tab[data-view="settings"]');
        await page.evaluate(() => {
          document.getElementById("notify-row").hidden = false;
          document.getElementById("notify-hour-row").hidden = false;
        });
      },
      "새 작심": async () => {
        await page.click('.tab[data-view="home"]');
        await page.click("#btn-add");
        await page.click(".suggest-chip");
      },
      "안내": async () => { await page.click("#btn-cancel"); await page.evaluate(() => openOnboard()); },
      "안내 마지막": async () => {
        await page.evaluate(() => { for (let i = 0; i < 4; i++) document.getElementById("ob-next").click(); });
      },
      "기록 상세": async () => { await page.evaluate(() => { closeOnboard(); openDetail(state.goals[0]); }); },
      // 달력에서 지난 날을 골랐을 때 열리는 줄
      "기록 상세 · 되살리기": async () => {
        await page.evaluate(() => {
          const cell = document.querySelector("#detail-mcal .mcal-cell[data-key]");
          if (cell) cell.click();
        });
      },
      "축하": async () => { await page.evaluate(() => { closeDetail(); showCheer(state.goals[0]); }); },
      // 눌러 볼 것은 하나뿐이고, 안 하겠다는 뜻은 모서리의 ✕로 말한다
      // 탑을 세운 날에만 뜨는 백업 권유
      "축하+백업": async () => { await page.evaluate(() => { document.getElementById("backup-note").hidden = false; }); },
      // 첫 돌을 얹은 직후의 알림 권유
      "알림 권유": async () => {
        await page.evaluate(() => {
          closeCheer();
          document.getElementById("backup-note").hidden = true;
          document.getElementById("ask-notify").hidden = false;
        });
      },
    };

    for (const [name, go] of Object.entries(screens)) {
      await go();
      await page.waitForTimeout(350);
      const bad = await page.evaluate(AUDIT, DIMMED);
      assert(
        bad.length === 0,
        `${scheme} · ${name} — every word is readable` +
          (bad.length
            ? "\n" + bad.map((b) => `        ${b.ratio}:1 (need ${b.need})  ${b.sel}  "${b.text}"  ${b.color} on ${b.bg}`).join("\n")
            : "")
      );
    }
    await ctx.close();
  }

  console.log(failures === 0 ? "\n모든 글자가 읽힙니다." : `\n${failures}개 화면에서 안 읽히는 글자가 있습니다.`);
  await browser.close();
})();
