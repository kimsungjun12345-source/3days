/* 측정 — 무엇을 보내는가보다 무엇을 못 보내게 하는가가 중요한 파일.
 *
 * 이 앱은 서버도 계정도 없고, 개인정보 처리방침에 "수집하는 정보가 없다"고
 * 적어 두고 살아왔다. 그 약속을 지키면서도 알고 싶은 것이 딱 두 가지 있다.
 *
 *   3일을 끝낸 사람이 또 3일을 시작하는가?
 *   무너진 사람이 앱을 지우는 대신 돌아오는가?
 *
 * 이 둘을 모르면 베타 20명을 돌려도 "왜 남았고 왜 지웠는지"를 기억과 진술로만
 * 재구성해야 한다. 그래서 흐름만 센다. 무엇을 하기로 했는지는 끝내 모른 채로.
 *
 * ── 지켜야 할 선 ────────────────────────────────
 * 작심 제목은 사용자가 직접 쓴 글이다. 이름도, 이메일도, 어떤 자유 입력도
 * 나가지 않는다. 그런데 '조심해서 쓰자'는 다짐은 반년 뒤에 반드시 깨진다 —
 * 급할 때 파라미터 하나 더 얹는 것은 너무 쉬운 일이라서.
 *
 * 그래서 규칙을 문서가 아니라 코드로 둔다.
 *   1. 허용목록에 없는 이벤트 이름은 나가지 않는다
 *   2. 이벤트마다 허용된 파라미터 키만 통과한다
 *   3. 값은 숫자와 참·거짓만 된다 — 문자열은 타입에서 막힌다
 *
 * 3번이 핵심이다. 사용자가 쓴 것은 전부 문자열이므로, 문자열을 통째로
 * 막아 두면 실수로 제목을 실어 보내는 일 자체가 성립하지 않는다.
 *
 * ── 지금은 어디로 가는가 ──────────────────────────
 * 아직 아무 데도 가지 않는다. Firebase 프로젝트와 google-services.json이
 * 준비되면 @capacitor-firebase/analytics가 window.Capacitor.Plugins에
 * 실리고, 그때부터 이 파일이 그쪽으로 넘긴다. 그전까지는 조용히 버린다.
 * 붙는 시점에 호출 지점을 새로 찾아 심는 일이 없도록 미리 깔아 둔다.
 */

/* 이벤트와, 그 이벤트에만 허용되는 파라미터 키.
 * 빈 배열은 '파라미터 없음'이라는 뜻이다.
 *
 * first_open은 여기 없다 — 일부러다. Firebase가 첫 실행을 자동으로 세고,
 * first_open은 예약어라 손으로 logEvent를 부르면 SDK가 거부한다. 두 번
 * 세지 않으려고 자동 수집에 맡긴다. 콘솔의 퍼널 첫 칸(first_open)은
 * 그대로 채워진다 — 우리가 보내지 않을 뿐이다. */
const ANALYTICS_EVENTS = {
  goal_created: [],
  day_checked: ["day_number"], // 1 · 2 · 3
  cycle_completed: [],
  next_cycle_started: [],
  cycle_broken: [],
  comeback_started: [],
  notification_opt_in: [],
  share_tapped: [],
};

/* 끊긴 것을 한 번만 세기 위한 표시. 작심 객체에 넣지 않는 이유는, 저장되는
 * 데이터에 필드를 더하면 예전 기록을 이어받는 일까지 딸려 오기 때문이다.
 * 측정 사정 때문에 사용자 기록의 모양을 바꿀 이유는 없다. */
const ANALYTICS_BROKEN_KEY = "jaksim3.brokenSeen";

function analyticsPlugin() {
  const plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
  const fb = plugins.FirebaseAnalytics;
  return fb && typeof fb.logEvent === "function" ? fb : null;
}

/* 허용목록을 통과한 것만 남긴다. 막힌 것은 조용히 버리지 않고 콘솔에
 * 알린다 — 개발 중에 오타 난 이벤트가 영원히 안 잡히면 곤란하다. */
function analyticsParams(name, params) {
  const allowed = ANALYTICS_EVENTS[name];
  const out = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (!allowed.includes(key)) {
      console.warn(`analytics: '${name}'에 없는 파라미터 '${key}' — 보내지 않습니다`);
      continue;
    }
    if (typeof value !== "number" && typeof value !== "boolean") {
      console.warn(`analytics: '${name}.${key}'는 숫자나 참·거짓만 됩니다 — 보내지 않습니다`);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function track(name, params) {
  if (!Object.prototype.hasOwnProperty.call(ANALYTICS_EVENTS, name)) {
    console.warn(`analytics: 모르는 이벤트 '${name}' — 보내지 않습니다`);
    return;
  }
  const safe = analyticsParams(name, params);
  const fb = analyticsPlugin();
  if (!fb) return; // 아직 붙지 않았다. 앱은 그대로 돈다.
  try {
    fb.logEvent({ name, params: safe });
  } catch (e) {
    /* 측정이 앱을 멈추게 두지 않는다. 이 앱은 네트워크가 없어도 완전히
       동작하는 것이 약속이고, 분석이 실패하는 것은 그보다 훨씬 가벼운 일이다. */
  }
}

/* 끊긴 사이클은 그 사이클당 한 번만. 홈을 열 때마다 세면 '무너진 횟수'가
 * 아니라 '앱을 연 횟수'가 된다. */
function trackBrokenOnce(goal) {
  let seen = {};
  try {
    seen = JSON.parse(localStorage.getItem(ANALYTICS_BROKEN_KEY) || "{}");
  } catch (e) {
    seen = {};
  }
  // 같은 작심이 여러 번 끊길 수 있으므로 '마지막으로 체크한 날'까지 열쇠에 넣는다
  const mark = goal.lastCheckDate || "";
  if (seen[goal.id] === mark) return;
  seen[goal.id] = mark;
  localStorage.setItem(ANALYTICS_BROKEN_KEY, JSON.stringify(seen));
  track("cycle_broken");
}
