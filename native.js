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

/* 저장된 값이 없을 때 기본값으로 돌아가야 한다.
 *
 * 여기 오래 숨어 있던 버그가 있었다. localStorage.getItem은 값이 없으면
 * null을 주고 Number(null)은 0이다. 0은 "0시부터 23시 사이"를 통과하므로
 * 기본값 21시가 한 번도 쓰이지 않았다 — 시간을 손대지 않은 사람에게는
 * 하루 알림이 저녁 9시가 아니라 자정에 울리고 있었다는 뜻이다.
 * 숫자로 바꾸기 전에 '값이 있기는 한가'를 먼저 묻는다. */
function storedNumber(key, min, max, fallback) {
  const raw = localStorage.getItem(key);
  if (raw === null || raw === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) && v >= min && v <= max ? Math.floor(v) : fallback;
}

function notifyHour() {
  return storedNumber(NOTIFY_HOUR_KEY, 0, 23, NOTIFY_HOUR_DEFAULT);
}

function notifyMinute() {
  return storedNumber(NOTIFY_MIN_KEY, 0, 59, NOTIFY_MIN_DEFAULT);
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

/* 글자 파일을 저장하고 '어디에 둘지'를 사용자에게 묻는다.
 *
 * 웹에서 쓰던 <a download>는 안드로이드 WebView 안에서 아무 일도 하지
 * 않는다. 다운로드 매니저가 연결돼 있지 않아서 클릭이 그냥 삼켜진다 —
 * 그래서 "저장했어요" 토스트만 뜨고 파일은 어디에도 없었다.
 *
 * 대신 파일을 만든 뒤 공유 시트를 연다. 저장 위치를 앱이 정해서 알려 주는
 * 것보다, 드라이브든 파일 앱이든 사용자가 고르는 편이 확실하다 — 무엇보다
 * 화면에 보인다. 권한을 하나도 요구하지 않는 것도 이 방식뿐이다. */
async function nativeSaveText(text, filename, mime) {
  if (!IS_NATIVE || !NP.Share || !NP.Filesystem) return false;
  try {
    const written = await NP.Filesystem.writeFile({
      path: filename,
      data: text,
      directory: "CACHE",
      encoding: "utf8",
    });
    await NP.Share.share({
      title: filename,
      text: "작심삼일 기록 백업",
      files: [written.uri],
    });
    return true;
  } catch (e) {
    // 공유를 취소한 것도 여기로 온다 — 파일은 이미 만들어졌으므로 실패가 아니다
    return e && /cancel|abort/i.test(String(e.message || e)) ? true : false;
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
    await registerNotifyActions();
    await rescheduleNotifications();
    return true;
  }
  localStorage.setItem(NOTIFY_PREF_KEY, "0");
  await clearNotifications();
  return true;
}

/* ── 알림에서 바로 체크하기 ─────────────
 *
 * 물 한 잔 마신 걸 표시하려고 앱을 열고, 카드를 찾고, 버튼을 누른다 —
 * 실제 행동보다 기록하는 쪽이 번거로우면 사람은 기록을 그만둔다.
 * 알림에 버튼을 달아 두면 알림창에서 한 번으로 끝난다.
 *
 * 안드로이드는 액션 유형을 미리 등록해 둬야 알림에 버튼이 붙는다. */
const NOTIFY_ACTION_ID = "jaksim-today";

/* 액션 등록이 끝났는지. 이게 false인데 알림에 actionTypeId를 달면
   안드로이드 쪽에서 등록되지 않은 그룹을 찾다가 예외가 나고, 그러면
   그 알림 하나가 아니라 같이 넘긴 예약 전체가 실패한다. */
let actionsReady = false;

/* 마지막 예약이 어떻게 됐는지 — 개발자 도구에서 읽는다 */
let notifyDebug = { tried: 0, scheduled: 0, error: "" };

async function registerNotifyActions() {
  if (!IS_NATIVE || !NP.LocalNotifications) return false;
  if (actionsReady) return true;
  try {
    await NP.LocalNotifications.registerActionTypes({
      types: [
        {
          id: NOTIFY_ACTION_ID,
          actions: [{ id: "done", title: "오늘 했어요" }],
        },
      ],
    });
    // 버튼을 눌렀을 때 — 앱을 열지 않고도 그 작심의 오늘 칸이 채워진다
    NP.LocalNotifications.addListener("localNotificationActionPerformed", (ev) => {
      if (!ev || ev.actionId !== "done") return;
      const goalId = ev.notification && ev.notification.extra && ev.notification.extra.goalId;
      if (typeof state === "undefined" || !state.goals) return;
      const goal = goalId
        ? state.goals.find((g) => g.id === goalId)
        : state.goals.find((g) => {
            const st = goalStatus(g);
            return (st === "fresh" || st === "active") && !checkedToday(g);
          });
      if (goal && typeof checkToday === "function") {
        checkToday(goal);
        if (typeof toast === "function") toast("stone", `'${goal.title}' 오늘 칸을 채웠어요`);
      }
    });
    actionsReady = true;
    return true;
  } catch (e) {
    /* 액션을 못 붙여도 알림 자체는 그대로 가야 한다 */
    return false;
  }
}

/* 예약된 알림 중 가장 먼저 울릴 것 — 없으면 null.
 *
 * "알림이 안 온다"를 확인할 방법이 앱 안에 하나도 없었다. 켜 두면 온다고
 * 믿는 수밖에 없고, 안 오면 왜 안 오는지 알 길이 없다. 다음 알림이 언제인지
 * 화면에 적어 두면 그것만으로 진단이 된다 — 시각이 안 보이면 예약이 안 된
 * 것이고, 보이는데 안 울리면 기기 쪽 문제다. */
async function nextNotificationAt() {
  if (!IS_NATIVE || !NP.LocalNotifications) return null;
  try {
    const pending = await NP.LocalNotifications.getPending();
    const list = (pending && pending.notifications) || [];
    const times = list
      .map((n) => n.schedule && n.schedule.at)
      .filter(Boolean)
      .map((t) => new Date(t).getTime())
      .filter((t) => Number.isFinite(t) && t > Date.now());
    return times.length ? new Date(Math.min(...times)) : null;
  } catch (e) {
    return null;
  }
}

/* 지금부터 몇 초 뒤에 한 번 — 알림이 실제로 오는지 확인할 때만 쓴다 */
async function sendTestNotification(afterSeconds = 5) {
  if (!IS_NATIVE || !NP.LocalNotifications) return false;
  try {
    const ok = await requestNotifyPermission();
    if (!ok) return false;
    await NP.LocalNotifications.schedule({
      notifications: [
        {
          id: 9999,
          title: "작심삼일",
          body: "알림이 잘 오고 있어요.",
          schedule: { at: new Date(Date.now() + afterSeconds * 1000) },
        },
      ],
    });
    return true;
  } catch (e) {
    return false;
  }
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

/* 알림은 진짜 시계로 잡는다.
 *
 * 예전에는 앱이 믿는 '오늘'(개발자 모드로 밀 수 있는 날짜)을 따라갔다.
 * 그런데 안드로이드 알람은 실제 시각에 울리므로, 날짜를 100일 뒤로 밀어
 * 두고 테스트하면 알림도 100일 뒤로 예약된다 — 즉 영영 오지 않는다.
 * 무엇을 알릴지는 앱의 날짜가 정하고, 언제 울릴지는 진짜 시계가 정한다. */
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

  // 등록이 끝나기 전에 예약하면 버튼 달린 통이 예약 전체를 무너뜨린다
  await registerNotifyActions();
  await clearNotifications();

  const items = [];
  // 오늘 저녁에 보낼지 말지는 진짜 시각으로 판단한다 (atHour와 같은 이유)
  const clock = new Date();
  let id = 1;

  const todo = state.goals.filter((g) => {
    const st = goalStatus(g);
    return (st === "fresh" || st === "active") && !checkedToday(g);
  });

  // 오늘 아직 남은 일이 있고 알림 시간이 지나지 않았다면 오늘 저녁에 한 번
  const hour = notifyHour();
  const minute = notifyMinute();
  const passed = clock.getHours() * 60 + clock.getMinutes() >= hour * 60 + minute;
  if (todo.length && !passed) {
    const near = todo.find((g) => g.checks.length === 2);
    // 대상이 하나로 좁혀질 때만 버튼을 단다 — 무엇이 체크될지 모르면 안 된다
    const only = near || (todo.length === 1 ? todo[0] : null);
    items.push({
      id: id++,
      title: "작심삼일",
      body: near
        ? `오늘만 넘기면 '${near.title}' 돌 하나가 완성돼요`
        : todo.length === 1
          ? `'${todo[0].title}', 아직 오늘 칸이 비어 있어요`
          : `오늘 채울 칸이 ${todo.length}개 남았어요`,
      schedule: { at: atHour(0, hour, minute) },
      ...(only && actionsReady ? { actionTypeId: NOTIFY_ACTION_ID, extra: { goalId: only.id } } : {}),
    });
  }

  // 내일부터 사흘간의 잔잔한 리마인더
  for (let d = 1; d <= 3; d++) {
    items.push({
      id: id++,
      title: "작심삼일",
      // 돌은 사흘에 하나다. 매일 오는 알림이 '오늘의 돌'이라고 하면
      // 돌 하나가 하루라는 뜻이 되어 앱 전체의 규칙과 어긋난다.
      body: "오늘 한 칸, 채워 볼까요?",
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

  /* 한 통이 잘못되면 나머지까지 통째로 실패한다.
   *
   * 실기기에서 "테스트 알림은 오는데 매일 알림은 안 온다"가 나왔다. 둘의
   * 차이는 하나뿐이었다 — 매일 알림 묶음에는 알림창에서 바로 체크하는
   * 버튼(actionTypeId)이 달린 통이 하나 섞여 있다. 그 버튼 그룹이 아직
   * 등록되지 않았으면 안드로이드가 예약 중에 예외를 내고, 같이 넘긴
   * 대여섯 통이 전부 예약되지 않는다. 그리고 예전에는 그 예외를 조용히
   * 삼키고 있어서, 앱에는 아무 흔적도 남지 않았다.
   *
   * 그래서 세 가지를 바꾼다. 버튼은 등록이 끝났을 때만 달고, 그래도
   * 실패하면 버튼을 떼고 한 번 더 넣어 보고, 무슨 일이 있었는지는
   * 남겨 둔다 — 알림은 안 왔을 때 이유를 알 수 있어야 고칠 수 있다. */
  notifyDebug = { tried: items.length, scheduled: 0, error: "" };
  const put = async (list) => {
    await NP.LocalNotifications.schedule({ notifications: list });
  };

  try {
    await put(items);
  } catch (e) {
    notifyDebug.error = String((e && e.message) || e);
    try {
      // 버튼이 문제였을 수 있다 — 떼고 다시. 알림이 오는 편이 버튼보다 중요하다
      await put(items.map(({ actionTypeId, extra, ...rest }) => rest));
      notifyDebug.error += " (버튼 없이 재시도 성공)";
    } catch (e2) {
      notifyDebug.error += " / " + String((e2 && e2.message) || e2);
    }
  }

  try {
    const left = await NP.LocalNotifications.getPending();
    notifyDebug.scheduled = ((left && left.notifications) || []).length;
  } catch (e) {
    /* 세어 보지 못해도 예약 자체에는 지장이 없다 */
  }
}


/* ── 앱 껍데기 ─────────────────────── */

/* 상태바를 화면 테마에 맞춘다.
 * Capacitor에서 Style.LIGHT는 '밝은 배경용(어두운 글자)', DARK는 그 반대다. */
async function applyStatusBarTheme() {
  if (!IS_NATIVE || !NP.StatusBar) return;
  // 기기 설정이 아니라 앱이 실제로 칠한 색을 따라간다 —
  // 설정에서 '어둡게'를 골랐는데 상태바만 밝으면 이가 빠져 보인다
  const dark = document.documentElement.dataset.theme === "dark";
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
    // 기기 설정을 따르는 중에 해가 지고 뜨면 상태바도 같이 바뀌어야 한다
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => setTimeout(applyStatusBarTheme, 0));
    if (NP.SplashScreen) await NP.SplashScreen.hide();
  } catch (e) {
    /* 무시 */
  }

  if (notifyEnabled()) await registerNotifyActions();

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
