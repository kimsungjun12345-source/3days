/* 네이티브 다리 — 앱으로 감쌌을 때만 켜지는 기능들.
 *
 * 웹에서는 전부 조용히 넘어가고 기존 동작(navigator.vibrate 등)을 그대로 쓴다.
 * 번들러를 쓰지 않으므로 Capacitor가 주입하는 window.Capacitor.Plugins로 접근한다.
 */

const Cap = window.Capacitor;
const IS_NATIVE = !!(Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform());
const NP = (Cap && Cap.Plugins) || {};

const NOTIFY_PREF_KEY = "jaksim3.notify";
const NOTIFY_HOUR_KEY = "jaksim3.notifyHour";
const NOTIFY_MIN_KEY = "jaksim3.notifyMin";
const NOTIFY_HOUR_DEFAULT = 21; // 저녁 9시 — 하루를 정리하며 아직 만회할 수 있는 시간
const NOTIFY_MIN_DEFAULT = 0;

function notifyHour() {
  const v = Number(localStorage.getItem(NOTIFY_HOUR_KEY));
  return Number.isFinite(v) && v >= 0 && v <= 23 ? Math.floor(v) : NOTIFY_HOUR_DEFAULT;
}

function notifyMinute() {
  const v = Number(localStorage.getItem(NOTIFY_MIN_KEY));
  return Number.isFinite(v) && v >= 0 && v <= 59 ? Math.floor(v) : NOTIFY_MIN_DEFAULT;
}

/* 시각은 사용자가 분 단위로 자유롭게 고른다.
 * 기본값만 저녁 9시로 두고, 나머지는 전부 취향에 맡긴다. */
function setNotifyTime(h, m) {
  localStorage.setItem(NOTIFY_HOUR_KEY, String(h));
  localStorage.setItem(NOTIFY_MIN_KEY, String(m));
}

/* '21:05' → { h: 21, m: 5 } · 잘못된 값이면 null */
function parseTimeValue(str) {
  const mt = /^(\d{1,2}):(\d{2})$/.exec(String(str || "").trim());
  if (!mt) return null;
  const h = Number(mt[1]);
  const m = Number(mt[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function timeValue(h, m) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/* 기계식 '21:05' 대신 사람이 말하는 '밤 9시 5분'으로 보여 준다 */
function friendlyTime(h, m) {
  const part = h < 6 ? "새벽" : h < 12 ? "아침" : h < 18 ? "낮" : h < 21 ? "저녁" : "밤";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${part} ${h12}시` : `${part} ${h12}시 ${m}분`;
}

/* ── 촉감 ─────────────────────────── */

/* 네이티브에서는 OS 햅틱 엔진을 쓴다. 진동 모터를 그냥 돌리는 것보다
 * 훨씬 짧고 단단한 촉감이 나온다.
 *
 * 세기를 상황별로 나눈 이유: 탭 전환이나 칩 선택까지 돌 얹을 때와 같은
 * 세기로 울리면 전체가 '투박한 진동기'처럼 느껴진다. 가장 약한 것은
 * selection(딸깍), 일상 체크는 light, 돌이 착지할 때만 medium을 쓴다. */
function nativeHaptic(kind) {
  if (!IS_NATIVE || !NP.Haptics) return false;
  try {
    switch (kind) {
      case "select":
        NP.Haptics.selectionChanged();
        break;
      case "success":
        NP.Haptics.notification({ type: "SUCCESS" });
        break;
      case "land":
        NP.Haptics.impact({ style: "MEDIUM" });
        break;
      default:
        NP.Haptics.impact({ style: "LIGHT" });
    }
    return true;
  } catch (e) {
    return false;
  }
}

/* ── 공유 ─────────────────────────── */

/* 네이티브 공유 시트로 이미지를 넘긴다. 실패하면 false를 돌려 웹 경로로 보낸다. */
async function nativeShareImage(blob, filename, text) {
  if (!IS_NATIVE || !NP.Share || !NP.Filesystem) return false;
  try {
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const written = await NP.Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: "CACHE",
    });
    await NP.Share.share({ text, files: [written.uri] });
    return true;
  } catch (e) {
    return false;
  }
}

/* ── 알림 ──────────────────────────
 * 이 앱에서 알림은 잔소리가 아니라 제품의 일부다. 무너진 뒤에 돌아올
 * 명분을 주는 것이 핵심이라, 문구에서 죄책감을 자극하지 않는다.
 */

function notifyEnabled() {
  return localStorage.getItem(NOTIFY_PREF_KEY) === "1";
}

async function requestNotifyPermission() {
  if (!IS_NATIVE || !NP.LocalNotifications) return false;
  try {
    const res = await NP.LocalNotifications.requestPermissions();
    return res && res.display === "granted";
  } catch (e) {
    return false;
  }
}

async function setNotifyEnabled(on) {
  if (on) {
    const ok = await requestNotifyPermission();
    if (!ok) return false;
    localStorage.setItem(NOTIFY_PREF_KEY, "1");
    await rescheduleNotifications();
    return true;
  }
  localStorage.setItem(NOTIFY_PREF_KEY, "0");
  await clearNotifications();
  return true;
}

async function clearNotifications() {
  if (!IS_NATIVE || !NP.LocalNotifications) return;
  try {
    const pending = await NP.LocalNotifications.getPending();
    if (pending && pending.notifications && pending.notifications.length) {
      await NP.LocalNotifications.cancel({ notifications: pending.notifications });
    }
  } catch (e) {
    /* 무시 */
  }
}

function atHour(daysFromNow, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/* 지금 상태를 보고 앞으로 보낼 알림을 다시 짠다.
 * 앱을 열 때마다 통째로 갈아끼우므로 상태와 어긋난 알림이 남지 않는다. */
async function rescheduleNotifications() {
  if (!IS_NATIVE || !NP.LocalNotifications || !notifyEnabled()) return;
  if (typeof state === "undefined" || !state.goals) return;

  await clearNotifications();

  const items = [];
  const now = new Date();
  let id = 1;

  const todo = state.goals.filter((g) => {
    const st = goalStatus(g);
    return (st === "fresh" || st === "active") && !checkedToday(g);
  });

  // 오늘 아직 남은 일이 있고 알림 시간이 지나지 않았다면 오늘 저녁에 한 번
  const hour = notifyHour();
  const minute = notifyMinute();
  const passed = now.getHours() * 60 + now.getMinutes() >= hour * 60 + minute;
  if (todo.length && !passed) {
    const near = todo.find((g) => g.checks.length === 2);
    items.push({
      id: id++,
      title: "작심삼일",
      body: near
        ? `오늘만 넘기면 '${near.title}' 돌 하나가 완성돼요`
        : todo.length === 1
          ? `'${todo[0].title}', 아직 오늘 돌을 안 얹었어요`
          : `오늘 얹을 돌이 ${todo.length}개 남았어요`,
      schedule: { at: atHour(0, hour, minute) },
    });
  }

  // 내일부터 사흘간의 잔잔한 리마인더
  for (let d = 1; d <= 3; d++) {
    items.push({
      id: id++,
      title: "작심삼일",
      body: "오늘의 돌, 하나 얹어 볼까요?",
      schedule: { at: atHour(d, hour, minute) },
    });
  }

  // 돌아올 명분을 주는 알림 — 이 앱에만 있는 기능
  const resting = state.goals
    .map((g) => ({ g, since: daysSinceLastCheck(g) }))
    .filter((x) => x.since !== null)
    .sort((a, b) => a.since - b.since)[0];

  if (resting) {
    const g = resting.g;
    const stones = g.completedCycles + (g.checks.length >= 3 ? 1 : 0);
    const comeback = [
      { after: 3, body: `쌓아 둔 돌 ${stones}개는 그대로예요. 오늘 하나만 더 얹어 볼까요?` },
      { after: 7, body: "작심삼일은 원래 여러 번 하는 거예요. 다시 시작하기 좋은 날이에요." },
      { after: 16, body: `'${g.title}', 딱 3일만 다시 해볼까요? 무너진 자리부터 다시 쌓으면 돼요.` },
    ];
    for (const c of comeback) {
      items.push({
        id: id++,
        title: "작심삼일",
        body: c.body,
        schedule: { at: atHour(c.after, hour, minute) },
      });
    }
  }

  try {
    await NP.LocalNotifications.schedule({ notifications: items });
  } catch (e) {
    /* 예약에 실패해도 앱 사용에는 지장이 없다 */
  }
}

/* ── 앱 껍데기 ─────────────────────── */

/* 상태바를 화면 테마에 맞춘다.
 * Capacitor에서 Style.LIGHT는 '밝은 배경용(어두운 글자)', DARK는 그 반대다. */
async function applyStatusBarTheme() {
  if (!IS_NATIVE || !NP.StatusBar) return;
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  try {
    await NP.StatusBar.setStyle({ style: dark ? "DARK" : "LIGHT" });
    if (Cap.getPlatform && Cap.getPlatform() === "android") {
      await NP.StatusBar.setBackgroundColor({ color: dark ? "#161513" : "#f7f6f3" });
    }
  } catch (e) {
    /* 무시 */
  }
}

async function setupNativeShell() {
  if (!IS_NATIVE) return;
  try {
    await applyStatusBarTheme();
    // 설정에서 테마를 바꾸면 상태바도 따라가야 한다
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", applyStatusBarTheme);
    if (NP.SplashScreen) await NP.SplashScreen.hide();
  } catch (e) {
    /* 무시 */
  }

  if (!NP.App) return;

  // 앱으로 돌아올 때마다 날짜와 알림을 다시 맞춘다
  NP.App.addListener("appStateChange", ({ isActive }) => {
    if (!isActive) return;
    if (typeof render === "function") render();
    rescheduleNotifications();
  });

  // 안드로이드 뒤로가기: 열려 있는 시트부터 닫고, 없을 때만 앱을 나간다.
  // 이 처리가 없으면 축하 화면에서 뒤로가기를 눌렀을 때 앱이 통째로 꺼진다.
  NP.App.addListener("backButton", () => {
    if (typeof closeTopLayer === "function" && closeTopLayer()) return;
    NP.App.exitApp();
  });
}

setupNativeShell();
