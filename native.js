/* 네이티브 다리 — 앱으로 감쌌을 때만 켜지는 기능들.
 *
 * 웹에서는 전부 조용히 넘어가고 기존 동작(navigator.vibrate 등)을 그대로 쓴다.
 * 번들러를 쓰지 않으므로 Capacitor가 주입하는 window.Capacitor.Plugins로 접근한다.
 */

const Cap = window.Capacitor;
const IS_NATIVE = !!(Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform());
const NP = (Cap && Cap.Plugins) || {};

const NOTIFY_PREF_KEY = "jaksim3.notify";
const NOTIFY_HOUR = 21; // 저녁 9시 — 하루를 정리하며 아직 만회할 수 있는 시간

/* ── 촉감 ─────────────────────────── */

/* 네이티브에서는 OS 햅틱 엔진을 쓴다. 진동보다 훨씬 부드럽다. */
function nativeHaptic(kind) {
  if (!IS_NATIVE || !NP.Haptics) return false;
  try {
    if (kind === "heavy") NP.Haptics.impact({ style: "HEAVY" });
    else if (kind === "success") NP.Haptics.notification({ type: "SUCCESS" });
    else NP.Haptics.impact({ style: "LIGHT" });
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

function atHour(daysFromNow, hour) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
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
  if (todo.length && now.getHours() < NOTIFY_HOUR) {
    const near = todo.find((g) => g.checks.length === 2);
    items.push({
      id: id++,
      title: "작심삼일",
      body: near
        ? `오늘만 넘기면 '${near.title}' 돌 하나가 완성돼요`
        : todo.length === 1
          ? `'${todo[0].title}', 아직 오늘 돌을 안 얹었어요`
          : `오늘 얹을 돌이 ${todo.length}개 남았어요`,
      schedule: { at: atHour(0, NOTIFY_HOUR) },
    });
  }

  // 내일부터 사흘간의 잔잔한 리마인더
  for (let d = 1; d <= 3; d++) {
    items.push({
      id: id++,
      title: "작심삼일",
      body: "오늘의 돌, 하나 얹어 볼까요?",
      schedule: { at: atHour(d, NOTIFY_HOUR) },
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
        schedule: { at: atHour(c.after, NOTIFY_HOUR) },
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

async function setupNativeShell() {
  if (!IS_NATIVE) return;
  try {
    if (NP.StatusBar) {
      await NP.StatusBar.setStyle({ style: "LIGHT" }); // 밝은 배경 → 어두운 글자
      if (Cap.getPlatform && Cap.getPlatform() === "android") {
        await NP.StatusBar.setBackgroundColor({ color: "#f7f6f3" });
      }
    }
    if (NP.SplashScreen) await NP.SplashScreen.hide();
  } catch (e) {
    /* 무시 */
  }

  // 앱으로 돌아올 때마다 날짜와 알림을 다시 맞춘다
  if (NP.App) {
    NP.App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      if (typeof render === "function") render();
      rescheduleNotifications();
    });
  }
}

setupNativeShell();
