/* ── 작심마다 다른 돌: 세 조약돌 A·B·C ──
   무작위로 흔들지 않고 낮은 하모닉 셋으로 '설계'해 고정한다. 발자국은
   fitBox가 강제로 맞추므로 셋이 늘 같은 크기로 쌓인다. 자세한 근거는
   docs/BRAND.md. */
/* 조약돌 A·B·C — 무작위로 흔들지 않고 낮은 하모닉 몇 개로 '설계'한다.
 *
 * r(θ) = 1 + a1·cos(θ-φ1) + a2·cos(2θ-φ2) + a3·cos(3θ-φ3)
 *   a1 : 한쪽을 좁히거나 밀어 무게를 옮긴다 (비대칭·눌림)
 *   a2 : 길쭉함
 *   a3 : 조약돌 특유의 완만한 세 결 — 이게 '돌'을 만든다. 크면 삼각김밥이 된다
 * 진폭을 작게 묶으면 매끈하고, 위상만 돌리면 세 개가 남처럼 안 보이면서 다르다. */
const R2 = Math.PI / 180;
const SPEC = [
  // A 가장 안정적인 둥근 형태
  { a1: 0.015, p1: 210, a2: 0.02, p2: 100, a3: 0.018, p3: 30 },
  // B 살짝 길쭉하고 왼쪽이 조금 좁은 형태
  { a1: 0.055, p1: 8,   a2: 0.06, p2: 95,  a3: 0.02,  p3: 140 },
  // C 조금 더 비대칭이고 자연스럽게 눌린 형태
  { a1: 0.05,  p1: 235, a2: 0.02, p2: 60,  a3: 0.05,  p3: 205 },
];
const BOX = { x0: 10, x1: 90, y0: 28, y1: 72 };
const N = 60;

function pts(spec) {
  const cx = 50, cy = 50, rx = 40, ry = 22, out = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const R = 1 + spec.a1 * Math.cos(th - spec.p1 * R2)
                + spec.a2 * Math.cos(2 * th - spec.p2 * R2)
                + spec.a3 * Math.cos(3 * th - spec.p3 * R2);
    out.push([cx + Math.cos(th) * rx * R, cy + Math.sin(th) * ry * R]);
  }
  return fit(out);
}
function fit(p) {
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = (BOX.x1 - BOX.x0) / (x1 - x0), sy = (BOX.y1 - BOX.y0) / (y1 - y0);
  return p.map(([x, y]) => [BOX.x0 + (x - x0) * sx, BOX.y0 + (y - y0) * sy]);
}
// Catmull-Rom → 닫힌 매끈한 곡선
function smooth(p) {
  const n = p.length;
  let d = `M${p[0][0].toFixed(2)},${p[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d + "Z";
}
// 앞면 벽 — 아랫반을 t만큼 아래로, 끝은 얇게(55%)
function wall(p, t) {
  const cy = 50, ymax = Math.max(...p.map((q) => q[1]));
  const front = p.filter((q) => q[1] >= cy - 0.01).sort((a, b) => a[0] - b[0]);
  const hAt = (y) => t * (0.55 + 0.45 * Math.max(0, (y - cy) / (ymax - cy)));
  let d = `M${front[0][0].toFixed(2)},${front[0][1].toFixed(2)}`;
  for (const [x, y] of front.slice(1)) d += ` L${x.toFixed(2)},${y.toFixed(2)}`;
  for (let i = front.length - 1; i >= 0; i--) {
    const [x, y] = front[i]; d += ` L${x.toFixed(2)},${(y + hAt(y)).toFixed(2)}`;
  }
  return d + "Z";
}

const PEB = SPEC.map(pts);
function pebbleTop(i) { return smooth(PEB[i]); }
function pebbleWall(i, t) { return wall(PEB[i], t); }



/* 셋돌하나 — 3일마다 돌 하나, 무너지면 다시 쌓는 습관 앱 */

const STORAGE_KEY = "jaksim3.v1";

const DAY_KO = ["첫째", "둘째", "셋째"];

const ORDINAL_KO = [
  "첫", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열",
  "열한", "열두", "열세", "열네", "열다섯",
];

function ordinal(n) {
  return (ORDINAL_KO[n - 1] || n) + " 번째";
}

/* 처음 온 사람이 빈 입력창 앞에서 멈추지 않도록.
 *
 * 이 여섯 줄이 사실상 "이 앱은 무엇을 담는 곳인가"를 대신 말한다. 그래서
 * 예전 목록(물 한 잔 · 12시 전에 눕기)은 두 번 틀렸다. 하나는 이 앱을 만든
 * 이유와 다르다는 것 — 끊겨서 괴로웠던 건 운동이나 나가서 작업하기 같은
 * 것이지 물 한 잔이 아니었다. 다른 하나가 더 중요한데, 그런 것들은 애초에
 * 잘 안 끊긴다. 안 끊기는 것만 담으면 이 앱의 차별점(끊긴 뒤에 작동하는
 * 것)이 평생 켜지지 않고, 그러면 돌 그림이 예쁜 체크리스트가 된다.
 *
 * 그래서 '며칠 하다 끊기기 쉬운 반복 행동'으로 바꿨다. docs/POSITIONING.md
 * 참고. */
const SUGGESTIONS = [
  { title: "운동하러 가기", icon: "run" },
  { title: "밖에서 작업하기", icon: "sun" },
  { title: "영어 20분", icon: "book" },
  { title: "책 10쪽 읽기", icon: "pen" },
  { title: "산책하기", icon: "heart" },
  { title: "스트레칭하기", icon: "meditate" },
];

/* ── 지금 몇 시인가 ────────────────────
 * 앱의 모든 날짜 판단은 여기를 지난다.
 *
 * 이 앱은 '며칠 연속인가'로 돌아가므로, 실제로 쌓이는지 보려면 하루씩
 * 기다려야 한다. 개발자 모드에서 날짜를 앞으로 밀 수 있게 하려면 날짜를
 * 읽는 곳이 한 군데여야 한다.
 */
const DEV_DAYS_KEY = "jaksim3.devDays";

function devDays() {
  const v = Number(localStorage.getItem(DEV_DAYS_KEY));
  return Number.isFinite(v) ? Math.trunc(v) : 0;
}

function setDevDays(n) {
  if (n) localStorage.setItem(DEV_DAYS_KEY, String(n));
  else localStorage.removeItem(DEV_DAYS_KEY);
}

function now() {
  const d = new Date();
  const shift = devDays();
  if (shift) d.setDate(d.getDate() + shift);
  return d;
}

function todayStr(offsetDays = 0) {
  const d = now();
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/* ── 저장소 ─────────────────────────── */

function load() {
  let data = { goals: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (e) {
    /* 손상된 데이터는 새로 시작 */
  }
  // history(체크한 모든 날짜)는 나중에 추가된 필드 — 예전 데이터도 이어받게 한다
  for (const g of data.goals || []) {
    if (!Array.isArray(g.history)) g.history = [...(g.checks || [])];
  }
  return data;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = load();

/* ── 상태 판정 ──────────────────────────
 * fresh    : 이번 사이클 체크 0개 → 오늘 시작 가능
 * active   : 1~2개 체크, 아직 안 끊김 → 진행 중
 * complete : 오늘 3개를 다 채움 → 완주 당일
 * resting  : 어제 완주하고 아직 다음을 시작하지 않음 → 오늘 이어가기
 * lapsed   : 완주한 뒤 이틀 넘게 쉬는 중 → 돌아오기를 기다림
 * broken   : 1~2개 체크했지만 하루를 건너뜀 → 다시 쌓기 대기
 *
 * 완주 상태를 날짜로 나누는 이유: 예전에는 3개를 채우면 상태가 영원히
 * complete로 굳어, 몇 주를 쉬어도 앱이 "돌 하나 완성!"만 반복했다.
 * 그러면 앱이 사용자가 떠난 것을 알아채지 못한다.
 */
function goalStatus(goal) {
  const checks = goal.checks;
  if (checks.length === 0) return "fresh";
  const last = checks[checks.length - 1];
  if (checks.length >= 3) {
    if (last >= todayStr()) return "complete";
    if (last >= todayStr(-1)) return "resting";
    return "lapsed";
  }
  if (last < todayStr(-1)) return "broken";
  return "active";
}

/* 마지막으로 돌을 얹은 지 며칠 지났는지 */
function daysSinceLastCheck(goal) {
  if (!goal.lastCheckDate) return null;
  const last = new Date(goal.lastCheckDate + "T00:00:00");
  const today = new Date(todayStr() + "T00:00:00");
  return Math.round((today - last) / 86400000);
}

function checkedToday(goal) {
  return goal.lastCheckDate === todayStr();
}

/* ── 액션 ─────────────────────────── */

/* 작심은 정원의 자리 수(GARDEN_MAX)만큼만 만들 수 있다.
 *
 * 정원에는 자리가 여섯뿐인데 만들기는 막지 않아서, 일곱 번째 작심은
 * 목록에는 뜨지만 그림에는 서지 않았다. 이 앱이 주는 유일한 보상이
 * 돌탑인데 그게 조용히 빠지는 셈이라, 자리 수를 만들기 쪽에도 그대로
 * 적용한다. 숫자를 새로 만들지 않고 GARDEN_MAX 하나만 본다 — 둘로
 * 나뉘면 언젠가 한쪽만 바뀐다.
 *
 * 예전에 여섯을 넘겨 만든 기록이나 가져온 기록은 지우지 않는다. 여기서
 * 막는 것은 '새로 만드는 일'뿐이다. */
function goalsAtCap() {
  return state.goals.length >= GARDEN_MAX;
}

function addGoal(title, icon) {
  if (goalsAtCap()) {
    toast("stone", `작심은 한 번에 ${GARDEN_MAX}개까지예요`);
    return;
  }
  const goal = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title,
    icon,
    createdAt: now().toISOString(),
    checks: [],          // 이번 사이클에서 체크한 날짜들 (최대 3개)
    history: [],         // 지금까지 체크한 모든 날짜 — 기록 화면의 재료
    lastCheckDate: null, // 같은 날 중복 카운트 방지
    totalDays: 0,
    completedCycles: 0,
    // 다시 쌓기를 시작한 횟수 — 끊긴 뒤(broken)와 오래 쉰 뒤(lapsed) 둘 다.
    // 완주 다음 날 바로 이어 가는 것은 멈춘 적이 없으므로 세지 않는다.
    restarts: 0,
  };
  state.goals.push(goal);
  newGoalId = goal.id;
  track("goal_created");
  save();
  render();
  haptic(10);
  toast(icon, "약속했어요. 딱 3일만 가봐요!");
}

/* ── 지나간 날은 지나간 대로 ─────────────
 *
 * 한동안 '어제 것도 표시하기'가 있었다. 카드에 버튼으로 뒀다가 헷갈린다는
 * 말을 듣고 달력으로 옮겼는데, 옮기고 나니 더 분명해졌다 — 지난 칸을 눌러
 * 되살려도 돌이 쌓이지도, 칸이 차지도 않는다. 아무 일도 일어나지 않는
 * 버튼이었다. 억지로 반응을 만들어 붙일 수도 있었지만, 그러려면 지나간
 * 사흘을 소급해 돌로 바꿔 줘야 한다.
 *
 * 그래서 아예 없앴다. 이 앱에서 하루를 놓치는 값은 원래 크지 않다 —
 * 쌓아 둔 돌은 하나도 잃지 않고, 다시 3일 약속하면 그만이다. 그런 앱에서
 * 기록을 소급해 고치게 하는 건 오히려 "기록은 완벽해야 한다"고 말하는
 * 셈이라, 이 앱이 하려는 말과 정면으로 어긋난다.
 *
 * 대신 놓치지 않도록 도와주는 쪽에 건다: 정해진 시각의 알림 한 번, 그리고
 * 그 알림에서 앱을 열지 않고 바로 누르는 '오늘 했어요'. 그걸로도 놓쳤다면
 * 그건 무너진 것이고, 무너져도 괜찮다는 게 이 앱의 전부다.
 */

/* 오늘 표시를 지운다 — 잘못 눌렀을 때 돌아갈 길.
 *
 * 없어도 되는 기능처럼 보이지만 아니다. 손가락이 미끄러져 남의 작심을
 * 눌렀는데 되돌릴 방법이 없으면, 기록이 '내가 한 것'이 아니라 '앱이
 * 주장하는 것'이 된다. 한 번 그렇게 느끼면 나머지 숫자도 못 믿는다.
 *
 * 세 번째 칸을 지우면 돌도 함께 사라진다 — stoneCount는 checks에서
 * 나오는 값이라 따로 되돌릴 것이 없다. */
/* 오늘 표시를 지울 수 있는가.
 *
 * 오늘 체크한 것은 두 자리 중 하나에 가 있다. 보통은 이번 사이클의 칸
 * (checks)이고, 완주한 날 '또 3일 약속하기'까지 눌렀다면 checks는 비워지고
 * 오늘 것은 이미 돌(completedCycles)로 넘어가 있다.
 *
 * 한동안 뒤쪽은 되돌릴 수 없다고 두었다. 돌이 된 것을 도로 푸는 일이라
 * 조심스러웠는데, 사용자 눈에는 그냥 '오늘 잘못 눌렀다'일 뿐이다. 세 번째
 * 칸을 눌러 완주해 놓고 축하 화면에서 다음 3일까지 시작해 버렸다면 되돌릴
 * 길이 더 필요하지 덜 필요하지 않다. 두 자리 모두에서 지울 수 있게 한다.
 *
 * 예전에는 버튼을 lastCheckDate로 보여 주고 지우기는 checks로 했다. 그래서
 * 버튼이 보이는데 눌러도 아무 일이 없었다. 보이면 반드시 작동해야 하므로,
 * 두 곳이 같은 것을 묻게 한다. */
function canUndoToday(goal) {
  const t = todayStr();
  if (goal.checks.includes(t)) return true;
  // 오늘 것이 이미 돌로 넘어간 경우
  return goal.completedCycles > 0 && goal.lastCheckDate === t && (goal.history || []).includes(t);
}

function undoToday(goal) {
  const t = todayStr();
  if (!canUndoToday(goal)) return false;
  if (goal.checks.includes(t)) {
    goal.checks = goal.checks.filter((d) => d !== t);
  } else {
    /* 돌을 도로 풀고 그 사이클의 앞 두 날을 칸으로 되살린다.
     *
     * 어느 날이 그 사이클이었는지는 따로 적어 두지 않지만 알아낼 수 있다 —
     * 사이클은 언제나 연달아 체크한 세 날이므로, 오늘을 뺀 history의 마지막
     * 둘이 그 사이클의 첫째·둘째 날이다.
     *
     * 이미 나간 cycle_completed와 next_cycle_started는 되부를 수 없다.
     * 완주한 그날 안에 되돌리는 드문 경우라 그대로 둔다 — 측정을 위해
     * 사용자가 못 되돌리게 하는 것은 앞뒤가 바뀐 일이다. */
    goal.completedCycles = Math.max(0, goal.completedCycles - 1);
    goal.checks = (goal.history || []).filter((d) => d !== t).slice(-2);
  }
  goal.history = (goal.history || []).filter((d) => d !== t);
  goal.totalDays = Math.max(0, goal.totalDays - 1);
  goal.lastCheckDate = goal.checks[goal.checks.length - 1] || goal.history[goal.history.length - 1] || "";
  save();
  render();
  haptic(6);
  return true;
}

function checkToday(goal, opts = {}) {
  if (checkedToday(goal) || goal.checks.length >= 3) return;
  goal.checks.push(todayStr());
  if (!goal.history.includes(todayStr())) goal.history.push(todayStr());
  goal.lastCheckDate = todayStr();
  goal.totalDays += 1;

  // 방금 채워진 칸과 완주 여부를 렌더 후 애니메이션에 넘긴다
  const completed = goal.checks.length === 3;

  /* 며칠째에서 사람들이 빠지는지가 이 앱의 첫 번째 질문이다.
     칸 번호(1·2·3)만 보낸다 — 무엇을 하기로 했는지는 보내지 않는다. */
  track("day_checked", { day_number: goal.checks.length });
  if (completed) track("cycle_completed");
  pendingAnim = {
    goalId: goal.id,
    dotIndex: goal.checks.length - 1,
    completed,
    silent: !!opts.silent,
  };
  if (completed && !reduceMotion) heldGoalId = goal.id;

  save();
  render();
}

/* 돌 하나 완성 후 다음 3일 시작 */
function nextCycle(goal, from) {
  goal.completedCycles += 1;
  goal.checks = [];
  /* 완주하고 한참 쉬다가 돌아온 것도 '다시 쌓기 시작'이다.
   *
   * 예전에는 이 길로 들어온 사람의 restarts가 늘지 않았다. 1~2칸 하다
   * 끊긴 사람만 세고, 3일을 다 채운 뒤 2주 쉬었다 돌아온 사람은 안 셌다.
   * 그런데 이 앱이 자랑하려는 숫자는 '무너진 횟수'가 아니라 '돌아온
   * 횟수'다 — 오래 쉬었다 돌아온 쪽이 오히려 더 큰 복귀다.
   * 완주 다음 날 바로 이어 가는 것(resting)은 멈춘 적이 없으니 세지 않는다. */
  if (from === "lapsed") goal.restarts += 1;
  /* 이어 간 것과 돌아온 것을 이름으로 갈라 둔다. 파라미터로 구분하면
     질의할 때마다 조건을 붙여야 하는데, 이 둘은 이 앱에서 가장 자주
     들여다볼 수 두 개라 처음부터 따로 서는 편이 낫다. */
  track(from === "lapsed" ? "comeback_started" : "next_cycle_started");
  haptic(10);
  // 완성한 날 바로 누르면 오늘은 이미 카운트됐으므로 내일부터 첫째 날
  if (!checkedToday(goal)) {
    checkToday(goal, { silent: true });
    if (from !== "lapsed") toast("stone", "또 하나 쌓기 시작!");
  } else {
    save();
    render();
    if (from !== "lapsed") toast("sleep", "내일 첫 칸부터 시작해요");
  }
}

/* 끊긴 뒤 다시 쌓기 — 쌓은 날은 유지, 사이클만 새로 */
function restart(goal) {
  goal.restarts += 1;
  goal.checks = [];
  // 끊긴 뒤 다시 온 것 — 완주 후 오래 쉬었다 온 것과 같은 이름으로 센다
  track("comeback_started");
  haptic(10);
  if (!checkedToday(goal)) {
    checkToday(goal, { silent: true });
  } else {
    save();
    render();
  }
}

function removeGoal(goal) {
  const kept =
    goal.totalDays > 0 ? `\n(지금까지 쌓은 ${goal.totalDays}일 기록도 함께 사라져요)` : "";
  if (!confirm(`'${goal.title}' 작심을 지울까요?${kept}`)) return;
  state.goals = state.goals.filter((g) => g.id !== goal.id);
  save();
  render();
}

/* ── 돌탑 SVG ────────────────────────
 * stones   : 완성한 돌 개수 (그림에는 최대 MAX_STONES개까지)
 * building : 쌓는 중인 돌(점선)을 얹을지
 * ghost    : 아직 아무것도 없을 때 보여줄 흐린 돌 개수
 * viewBox는 쌓인 높이에 맞춰 계산하므로 돌이 늘어도 잘리지 않는다.
 */
const MAX_STONES = 5;

/* 빛은 왼쪽 위에서 온다는 전제로, 돌마다 측면·윗면·그림자를 나눠 그린다 */
/* 돌 색은 CSS 변수로 받는다 — 어두운 화면에서는 같은 돌이 밤빛으로 바뀐다 */

/* 그라디언트·필터 id는 그림마다 새로 뽑는다.
 *
 * 한때 모든 돌탑이 'stoneTop' 같은 고정 id를 함께 썼다. 문서에 같은 id가
 * 여럿이면 url(#stoneTop)은 무조건 맨 앞의 것을 가리키는데, 그게 하필
 * 숨어 있는 그림의 것이면 크롬은 그 물감을 칠하지 않는다. 그 결과 첫 실행
 * 화면에서 — 작심이 하나도 없어 홈의 정원(#stats)이 hidden인 바로 그때 —
 * 안내에 뜬 돌탑이 그림자만 남고 통째로 사라졌다.
 *
 * 그림마다 id를 따로 가지면 남의 그림이 숨어 있든 말든 상관이 없다. */
let stoneDefsSeq = 0;

function stoneDefs(uid) {
  return `<radialGradient id="stoneTop-${uid}" cx="40%" cy="28%" r="95%">
    <stop offset="0%" stop-color="var(--stone-top-1)"/>
    <stop offset="35%" stop-color="var(--stone-top-2)"/>
    <stop offset="72%" stop-color="var(--stone-top-3)"/>
    <stop offset="100%" stop-color="var(--stone-top-4)"/>
  </radialGradient>
  <radialGradient id="stoneBelly-${uid}" cx="50%" cy="95%" r="60%">
    <stop offset="0%" stop-color="var(--stone-belly)" stop-opacity="0.42"/>
    <stop offset="65%" stop-color="var(--stone-belly)" stop-opacity="0.10"/>
    <stop offset="100%" stop-color="var(--stone-belly)" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="stoneRim-${uid}" cx="40%" cy="14%" r="42%">
    <stop offset="0%" stop-color="var(--stone-rim)" stop-opacity="0.55"/>
    <stop offset="100%" stop-color="var(--stone-rim)" stop-opacity="0"/>
  </radialGradient>
  <filter id="stoneGrain-${uid}" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" stitchTiles="stitch" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.6 0.6 0.6 0 0"/>
  </filter>
  <filter id="stoneMottle-${uid}" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" seed="7" stitchTiles="stitch" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.7 0.7 0.7 0 0"/>
  </filter>
  <filter id="groundShadow-${uid}" x="-60%" y="-120%" width="220%" height="340%">
    <feGaussianBlur stdDeviation="3.4"/>
  </filter>`;
}

/* 씨앗값으로 -0.5~0.5을 만드는 난수. 정원의 자리 흔들림이 쓴다 —
   같은 씨앗이면 늘 같은 값이라 다시 그려도 정원이 들썩이지 않는다. */
function wobble(seed, k) {
  const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5; // -0.5 ~ 0.5
}

/* 돌 하나 — 납작한 조약돌을 위에서 비스듬히 본 모습.
 * 같은 타원을 두께(t)만큼 아래에 한 번 더 깔아 측면이 초승달처럼 드러나게 하고,
 * 그 위에 밝은 윗면을 얹는다. 이 두께가 있어야 쌓인 것으로 보인다.
 *
 * 한동안 이 타원을 조약돌 윤곽(점 열 개를 씨앗값으로 밀고 당긴 닫힌 곡선)으로
 * 바꿔 두었다. 가까이 보면 손으로 주운 돌 같았지만, 여러 채가 서면 울퉁불퉁한
 * 덩어리로 뭉쳐 보였다 — 특히 정원 탭이 탑을 크게 그리게 된 뒤로. 돌탑이
 * 단정해 보이는 쪽이 이 앱에 맞아서 처음의 타원으로 되돌렸다. */
/* 돌 하나 — 위에서 비스듬히 본 조약돌. pebbleTop/pebbleWall이 준 곡선을
 * 이 층의 크기로 앉힌다. 입체는 윤곽이 아니라 음영이 만든다:
 *   벽(옆면)은 가로로 밝기가 변하고, 끝으로 갈수록 얇아진다.
 *   윗면은 빛 쪽이 부풀고 반대쪽 가장자리가 떨어지는 돔이다.
 * 두께는 ry의 0.42 — 0.66은 조약돌치고 두꺼워 원반으로 읽혔다. */
function stonePiece(cx, cy, rx, ry, tilt, uid, layer = 0, seed = 0) {
  const rot = `rotate(${tilt} ${cx} ${cy})`;
  const kind = (layer + seed) % 3;
  const sx = (rx * 2) / 80, sy = (ry * 2) / 44;
  const box = `translate(${cx.toFixed(2)} ${cy.toFixed(2)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(-50 -50)`;
  const d = pebbleTop(kind);
  const cid = `sc-${uid}-${layer}`;
  /* 진짜 돌 질감은 세 겹이 만든다: 볼륨 방사 음영 + 아래 초승달(배) + 윗머리
     림. 그 위에 얼룩(큰 반점, multiply)으로 톤 변화를, 미세결(soft-light)로
     표면 거칠기를 얹는다. 이 두 결이 없으면 매끈한 플라스틱이 된다. */
  return `<g transform="${rot}">
    <g transform="${box}">
      <clipPath id="${cid}"><path d="${d}"/></clipPath>
      <path class="stone-top" d="${d}" fill="url(#stoneTop-${uid})"/>
      <path d="${d}" fill="url(#stoneBelly-${uid})"/>
      <path d="${d}" fill="url(#stoneRim-${uid})"/>
      <g clip-path="url(#${cid})">
        <rect x="0" y="0" width="100" height="100" filter="url(#stoneMottle-${uid})" opacity="0.13" style="mix-blend-mode:multiply"/>
        <rect x="0" y="0" width="100" height="100" filter="url(#stoneGrain-${uid})" opacity="0.24" style="mix-blend-mode:soft-light"/>
      </g>
    </g>
  </g>`;
}

/* ── 돌탑 정원 ────────────────────────
 * 작심 하나가 탑 하나. 홈에는 그 탑들이 원근을 두고 함께 서 있다.
 * 앞쪽 탑은 크고 진하게, 뒤쪽 탑은 작고 흐리게 — 뒤로 갈수록 공기에
 * 잠기는 것처럼 보이게 해서 정원처럼 읽히게 한다.
 */

/* 바닥 중심을 원점으로 위로 쌓는 돌 무더기 */
function stoneStack(stones, building, max = MAX_STONES, ghost = 0, uid = 0, ch = STONE_CHARACTERS[0]) {
  const shown = Math.min(stones, max);
  let y = -4;
  let rx = 40;
  let ry = 17 * ch.flat;
  let top = 0;
  // 바닥 그림자는 마지막에 앞쪽으로 끼워 넣는다 — 크기가 실제로 서 있는
  // 것의 발 너비를 따라야 하는데, 그건 다 그려 보기 전에는 알 수 없다.
  // 늘 같은 크기로 두면 돌이 하나도 없는 탑에서 그림자만 커다랗게 남아
  // 정원이 얼룩 하나처럼 보인다.
  const parts = [];
  let foot = 0;
  // 마지막으로 놓인 돌의 실제 크기 — 다음 돌이 들어올 자리를 여기에 맞춘다
  let lastW = rx;
  let lastH = ry;

  /* 층마다 일정한 비율로 좁아진다.
   *
   * 한동안 여기에도 흔들림을 얹어, 넓은 돌 위에 좁은 돌이 오기도 하고 그
   * 반대이기도 하게 두었다. 손으로 쌓은 탑에 가깝기는 했지만 탑의 윤곽이
   * 들쭉날쭉해져서, 여러 채가 서면 정돈된 정원으로 읽히지 않았다.
   * 탑의 결은 작심마다 다른 돌의 성격(ch)이 이미 맡고 있다. */
  for (let i = 0; i < shown; i++) {
    y -= ry * 1.42;
    const tilt = (i % 2 === 0 ? -1 : 1.05) * ch.tilt;
    const cx = i % 2 === 0 ? -1.5 : 1.5;
    parts.push(stonePiece(cx, y, rx, ry, tilt, uid, i, ch.seed || 0));
    lastW = rx;
    lastH = ry;
    foot = Math.max(foot, rx + Math.abs(cx));
    top = Math.min(top, y - ry);
    y -= ry * 0.4;
    rx *= ch.taper;
    ry *= 0.93;
  }

  for (let i = 0; i < ghost; i++) {
    y -= ry * 1.5;
    parts.push(
      `<ellipse class="ghost-stone" style="animation-delay:${i * 0.5}s"
        cx="0" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="var(--ghost-stone)"/>`
    );
    top = Math.min(top, y - ry);
    y -= ry * 0.4;
    rx *= ch.taper;
    ry *= 0.93;
  }

  /* 쌓는 중인 돌 자리 — 테두리가 곧 3일이다.
   *
   * building은 참/거짓이거나 { done, waiting } 이다. done은 이번 3일 중
   * 며칠을 해냈는지(0~2).
   *
   * 여기는 두 번 틀렸던 자리다. 처음에는 '오늘 할 일이 남았을 때'만
   * 그려서, 돌이 아직 없는 작심에서 오늘 체크를 누르는 순간 그릴 것이
   * 바닥 그림자밖에 없었다. 그래서 진행 상황을 돌로 그려 넣었더니
   * 이번에는 그게 그냥 돌로 보였다 — 하루 만에 돌 하나가 쌓인 것처럼.
   * 돌 하나는 사흘이라고 해 놓고 그림이 정반대로 말한 셈이다.
   *
   * 그래서 자라는 것은 돌이 아니라 '돌이 들어올 자리의 테두리'다.
   * 테두리를 정확히 세 도막으로 끊어 두고, 하루 해낼 때마다 한 도막씩
   * 진해진다. 세 도막이 다 차야 비로소 돌이 된다. 채워지는 것이 윤곽선
   * 뿐이므로 돌이 생겼다고 오해할 여지가 없다.
   *
   * pathLength="3"으로 둘레를 3으로 정규화하면 타원 둘레를 재지 않고도
   * 정확히 3등분한 도막을 그릴 수 있다. */
  const slot = building === true ? { done: 0, waiting: true } : building || null;
  if (slot) {
    /* 자리는 '다음 돌이 놓일 자리'다. 그러므로 크기도 위치도 마지막으로
       놓인 돌을 기준으로 잡아야 한다. 예전에는 흔들리기 전의 이상적인
       반지름을 썼는데, 층마다 크기를 흔들기 시작하면서 자리가 맨 위 돌보다
       커지는 일이 생겼다 — 그러면 돌 자리가 아니라 공중에 뜬 굴렁쇠로 보인다. */
    const by = y - lastH * 0.92;
    const brx = Math.max(lastW * 0.8, 12);
    const bry = Math.max(lastH * 0.78, 5);
    const done = Math.min(Math.max(slot.done, 0), 2);
    const ring = (cls, width, extra) =>
      `<ellipse class="${cls}" cx="0" cy="${by.toFixed(1)}" rx="${brx.toFixed(1)}" ry="${bry.toFixed(1)}"
        pathLength="3" fill="none" stroke-width="${width}" stroke-linecap="round" ${extra}/>`;

    // 아직 안 채운 도막들 — 자리는 여기라는 표시
    parts.push(
      `<ellipse class="slot-bed" cx="0" cy="${by.toFixed(1)}" rx="${brx.toFixed(1)}" ry="${bry.toFixed(1)}"
        fill="var(--slot-fill)"/>`,
      ring("building-stone" + (slot.waiting ? " waiting" : ""), 2, 'stroke="var(--slot-empty)" stroke-dasharray="0.8 0.2"')
    );
    // 해낸 날 수만큼 도막이 진해진다 — 빈 도막보다 굵게 그려야 눈에 띈다
    for (let i = 0; i < done; i++) {
      parts.push(ring("slot-day", 3, `stroke="var(--accent)" stroke-dasharray="0.8 2.2" stroke-dashoffset="${-i}"`));
    }
    foot = Math.max(foot, brx);
    top = Math.min(top, by - bry);
  }

  // 바닥에 드리운 그림자는 빛 반대쪽(오른쪽 아래)으로 살짝 밀어 둔다
  const shadowRx = Math.max(foot * 1.18, 16);
  parts.unshift(
    `<ellipse cx="4" cy="2" rx="${shadowRx.toFixed(1)}" ry="${(shadowRx * 0.17).toFixed(1)}"
      fill="var(--ground-shadow)" filter="url(#groundShadow-${uid})"/>`
  );

  return { markup: parts.join("\n"), top, foot: shadowRx };
}

/* ── 탑이 여러 개가 될 때 ──────────────
 * 탑 하나는 무한정 자라지 않는다. 돌 다섯 개(= 15일)를 채우면 그 탑은
 * 완성되고, 그다음 돌부터는 그 옆에 새 탑이 선다.
 *
 * 예전에는 한 작심의 탑이 돌 네 개에서 조용히 멈췄다. 열이틀만 지나면
 * 아무리 쌓아도 그림이 그대로였다는 뜻이다. 이 앱이 주는 보상이
 * '내 탑이 자라는 걸 보는 것' 하나뿐인데 그게 12일 만에 끊겼다.
 *
 * 탑을 여러 개로 나누면 두 가지가 같이 풀린다. 하나는 높이 문제 —
 * 돌 120개짜리 탑은 화면에 담을 수도 없고 보기에도 이상하다. 다른 하나는
 * 이야기 — 마이산 탑사처럼, 오래 다닌 사람의 자리에는 탑이 여러 채 선다.
 */
const STONES_PER_TOWER = 5; // 5 × 3일 = 15일

/* ── 작심마다 다른 돌 ──────────────────
 * 정원에 탑이 여러 채 서면 "어느 게 내 물 마시기 탑이지?"가 생긴다.
 * 그렇다고 작심마다 빨강·파랑을 칠하면 정원이 아니라 막대그래프가 된다.
 * 이 앱에서 돌탑은 데이터를 읽는 도구가 아니라 내가 쌓아온 것을 바라보는
 * 자리라서, 그 톤을 잃으면 앱의 절반이 사라진다.
 *
 * 그래서 색을 새로 칠하지 않고 '돌의 성격'을 달리했다. 실제 돌밭에서
 * 돌을 구별하는 방식 그대로다 — 어떤 자리는 납작한 판석이 쌓여 있고,
 * 어떤 자리는 둥근 조약돌이며, 볕과 이끼에 따라 돌빛이 조금씩 다르다.
 *
 *   flat  : 납작한 정도 (높을수록 판석)
 *   taper : 위로 갈수록 좁아지는 속도
 *   tilt  : 돌을 얹은 손버릇 — 기울기의 크기
 *   tone  : 돌빛. 회색 돌에 아주 약한 색조만 얹는다
 */
/* 색조는 속삭이는 정도만. 구별은 주로 '밝기'와 '모양'이 한다 —
 * 실제 돌밭도 빨강·파랑이 아니라 밝은 사암과 어두운 현무암으로 갈린다.
 * 색을 세게 주면 정원이 아니라 색깔 범례가 된다.
 *
 * 돌빛(tone)은 CSS의 .stone-tone-N 이 쥐고 있다. 어두운 화면에서는
 * 같은 필터를 그대로 쓰면 밝은 돌이 배경에서 떠 보이기 때문에,
 * 팔레트가 있는 곳에서 테마별로 따로 잡아야 한다. */
/* 순서가 곧 정원에 들어오는 순서다. 이웃한 둘이 가장 달라 보이도록
 * 늘어놨다 — 작심이 두 개인 사람이 제일 많은데, 그 둘이 비슷하면
 * 이 장치는 아무 일도 하지 않은 것이 된다. */
const STONE_CHARACTERS = [
  { flat: 1.0, taper: 0.85, tilt: 1.6 },   // 기본 — 따뜻한 회색, 보통 두께
  { flat: 1.24, taper: 0.81, tilt: 0.7 },  // 창백하고 서늘한 판석 — 아주 납작
  { flat: 0.82, taper: 0.9, tilt: 3.6 },   // 짙은 조약돌 — 둥글고 삐뚤빼뚤
  { flat: 1.12, taper: 0.83, tilt: 1.1 },  // 밝은 사암
  { flat: 0.94, taper: 0.87, tilt: 2.4 },  // 이끼 낀 어두운 돌
  { flat: 0.9, taper: 0.88, tilt: 2.9 },   // 무채색 자갈
];

/* 돌 하나하나의 생김새는 이제 없다.
 *
 * 3일을 채울 때마다 돌 모양을 고르게 하던 때가 있었다. 고르는 화면은
 * 먼저 걷어냈고(3일마다 묻는 것은 첫 주에는 재미지만 둘째 달에는 마찰이다),
 * 고른 모양을 그림에 반영하던 부분도 이번에 걷었다 — 돌마다 넓이와 두께가
 * 달라지면 탑의 윤곽이 들쭉날쭉해져서, 탑을 크게 그리는 정원 탭에서는
 * 정돈된 정원으로 읽히지 않았다.
 *
 * 예전 기록의 goal.stoneShapes는 지우지 않고 그대로 둔다. 쌓은 기록은
 * 사라지지 않는다는 것이 이 앱의 약속이고, 언젠가 다시 쓸지도 모른다.
 * 작심마다 탑이 달라 보이는 일은 돌의 성격(STONE_CHARACTERS)이 맡는다. */

function characterOf(index) {
  const i = index % STONE_CHARACTERS.length;
  return { ...STONE_CHARACTERS[i], toneClass: `stone-tone-${i}`, seed: i };
}

/* 이 작심의 돌 — 정원·축하 화면·기록이 모두 같은 돌을 써야
 * "이게 내 그 탑이구나"가 성립한다 */
function goalCharacter(goal) {
  const i = state.goals.findIndex((g) => g.id === goal.id);
  return characterOf(i < 0 ? 0 : i);
}

/* 작심 하나가 가진 탑들 — 완성한 탑 수와, 지금 쌓는 중인 탑의 돌 수 */
function towersOf(goal, heldBack = false) {
  const total = Math.max(0, stoneCount(goal) - (heldBack ? 1 : 0));
  return { done: Math.floor(total / STONES_PER_TOWER), current: total % STONES_PER_TOWER };
}

/* 작심마다 정원의 한 구역(가로 위치)을 가진다. 그 구역 안에서 탑들이
 * 뒤로 물러나며 지그재그로 선다 — 새로 쌓는 탑이 늘 맨 앞이다.
 *
 * 자리는 균등하게 벌리고, 순서만 가운데에서 바깥으로 나간다.
 *
 * 예전 값(0.5, 0.2, 0.79, 0.35, 0.66, 0.11)은 여섯이 다 차면 0.11과 0.2가
 * 붙어 탑 발치가 서로 파고들었다. 지금 쌓는 탑은 여섯 개가 모두 맨 앞줄에
 * 서므로 — 뒤로 물러나 가려지지도 않는다 — 앞줄 간격만으로 안 겹쳐야 한다.
 * 발치 반경이 축소율(0.62)까지 먹으면 약 28px이라 자리 사이가 56px보다
 * 넓어야 하고, 0.176 × 340 ≈ 60px이 그 값이다.
 *
 * 하나뿐일 때 가운데가 아니어도 괜찮다. 그림은 그린 뒤에 내용에 맞춰
 * 잘라 맞추므로(auto-fit), 탑 하나는 어느 자리에 있든 화면 한가운데 온다. */
const GOAL_LANES = [0.428, 0.572, 0.284, 0.716, 0.14, 0.86];

/* 작심마다 조금씩 다른 깊이에 선다.
 *
 * 지금 쌓는 탑은 작심마다 하나씩이고, 전부 같은 깊이에 두면 여섯 개가
 * 자로 잰 듯 일렬로 선다 — 정원이 아니라 진열대다. 자리마다 조금씩 뒤로
 * 물러나게 해서 앞뒤가 생기게 한다. 값이 자리 순서와 같이 커지지 않게
 * 섞어 둔 이유는, 규칙이 보이면 그것대로 또 줄로 읽히기 때문이다.
 *
 * 자리(GOAL_LANES)를 왼쪽부터 늘어놓고 그 순서로 깊이를 읽으면 오르내려야
 * 한다. 예전 값은 왼쪽에서 오른쪽으로 갈수록 깊어져서, 왼쪽은 전부 앞줄
 * 오른쪽은 전부 뒷줄이 됐다. 정원 탭에서 좌우를 좁히자 그게 한쪽 구석에
 * 탑이 뭉치는 것으로 드러났다.
 *
 * 그렇다고 아무렇게나 섞으면 이번에는 깊이가 몰린 자리와 빈 자리가 생겨,
 * 정원 한가운데가 텅 빈 띠로 남았다. 그래서 값 자체는 0.06부터 0.41까지
 * 고르게 벌려 두고(0.07 간격), 그 여섯을 자리 순서에만 지그재그로 나눠
 * 준다 — 왼쪽부터 0.41 · 0.20 · 0.06 · 0.34 · 0.13 · 0.27. 이웃한 두 자리는
 * 늘 다른 줄에 서고, 앞에서 뒤까지는 빈 구간 없이 채워진다.
 *
 * 첫 작심은 앞에 둔다(0.06). 작심이 하나뿐인 사람에게는 그게 정원의 전부라
 * 뒤로 물러나 있을 이유가 없다. */
const LANE_DEPTH = [0.06, 0.34, 0.2, 0.13, 0.41, 0.27];
const GARDEN_MAX = GOAL_LANES.length;
/* 정원에 그리는 탑 수는 대체로 열 채 안쪽으로 유지한다.
 * 작심이 여섯이면 한 작심당 두 채씩만 그린다 — 그보다 많이 그리면
 * 탑들이 서로 가려서 '많다'는 느낌 말고는 아무것도 남지 않는다.
 * 정확한 개수는 그림이 아니라 기록 탭의 숫자가 말한다. */
function towersDrawn(goalCount) {
  return Math.max(2, Math.round(10 / Math.max(1, goalCount)));
}

/* 정원 탭에서 한 작심이 세울 수 있는 탑의 수.
 *
 * 여기는 오랫동안 무제한이었다. "한 채도 빼지 않는다"가 이 탭을 따로 만든
 * 이유였으니 당연한 선택 같았는데, 10년치를 넣고 재 보니 그렇지 않았다.
 * 작심 여섯이 10년을 다니면 탑이 1458채, SVG 요소가 4만 개가 된다. 개발용
 * 컴퓨터에서도 정원을 여는 데 1초가 걸렸고 폰이라면 몇 배다. 그러면서도
 * 정작 보이는 것은 없다 — 탑 하나가 1px도 되지 않아 한 덩어리로 뭉친다.
 * 지키려던 '전부 서 있다'가 그 지점에서는 지켜지지도, 보이지도 않는 셈이다.
 *
 * 한 화면에 몇 채까지 '탑'으로 읽히는지 그려 보며 재 봤다. 여든 채쯤이
 * 경계였다. 그보다 많아지면 앞뒤로 겹쳐 기둥처럼 이어지고, 백스무 채부터는
 * 그냥 벽이다.
 *
 * 처음에는 거기서 그냥 끊으려 했다. 그러면 오래 다닌 사람의 옛 탑이 그림에서
 * 영영 사라지는데, 그건 이 탭을 만든 이유와 정면으로 어긋난다.
 *
 * 그래서 끊는 대신 넘긴다. 한 쪽에는 읽히는 만큼만 세우고, 옆으로 밀면 그
 * 이전 탑들이 나온다. 한 채도 빠지지 않으면서 한 화면은 늘 가볍다.
 *
 * 한 쪽의 양은 재 보고 정했다. 한계는 화면 전체가 아니라 **한 줄**에 있다.
 * 한 작심의 탑은 같은 자리에서 뒤로 물러나며 서므로, 열 채를 넘기면 좌우로
 * 흔들어 놓아도 두 가닥으로 땋인 밧줄처럼 보인다 — 작심이 하나뿐이어서 화면이
 * 통째로 비어 있어도 그렇다. 그래서 한 줄에 열 채가 상한이고, 작심이 많아지면
 * 자리를 나눠 쓰느라 그보다 줄어든다(여섯이면 각 일곱 채).
 *
 * 쪽수가 늘어나는 것은 값으로 치지 않았다. 사람이 들여다보는 것은 거의 늘
 * 첫 쪽이고, 예전 쪽은 가끔 넘겨 보는 것이다. 첫 쪽이 아름다운 편이 낫다. */
function towersPerPage(goalCount) {
  return Math.max(6, Math.min(10, Math.round(40 / Math.max(1, goalCount))));
}

/* 정원이 몇 쪽인가. 가장 많이 쌓은 작심이 쪽수를 정한다 — 그 작심의 탑이
   다 보이면 나머지는 이미 다 보인 뒤다. */
function gardenPageCount(goals) {
  const lanes = goals.slice(0, GARDEN_MAX);
  if (!lanes.length) return 1;
  const deepest = Math.max(...lanes.map((g) => towersOf(g).done + 1));
  return Math.max(1, Math.ceil(deepest / towersPerPage(lanes.length)));
}

function gardenSVG(goals, opts = {}) {
  /* full 모드 — 정원 탭에서 쓴다. 홈의 정원은 화면 한 귀퉁이라 탑을 몇 채만
     추려 그리는데, 오래 다닌 사람은 그걸 "예전 탑이 사라졌다"로 읽는다.
     맞는 읽기다. 그래서 전부 보여 주는 자리를 따로 만들고, 여기서는 한
     작심이 세운 탑을 한 채도 빼지 않는다 — 한 화면에 다 세우는 대신
     쪽을 나눠서(opts.page), 옆으로 넘기면 그 이전 탑들이 나온다.

     다만 '작심의 수'는 full에서도 GARDEN_MAX까지다 — 땅에 깔아 둔 줄이
     그만큼뿐이라 그 이상은 놓을 자리가 없다. 그래서 만들기도 같은 수로
     막아 두었다(goalsAtCap). 여섯을 넘는 경우는 예전에 만들었거나 가져온
     기록뿐이고, 그때는 정원 문구가 그림에 다 담기지 않았다고 말한다. */
  const full = !!opts.full;
  const uid = ++stoneDefsSeq;
  const lanesAll = goals.slice(0, GARDEN_MAX);
  const deepest = Math.max(1, ...lanesAll.map((g) => towersOf(g).done + 1), 1);

  /* 좌표계는 '땅'을 기준으로 잡는다. W·H는 그림을 다 그린 뒤에 정한다 —
     아래 auto-fit 참고. 여기서 쓰는 수는 전부 이 가상의 땅 위의 값이다. */
  const W = 340;
  const groundY = 0;
  /* 뒤로 물러나는 깊이. 홈이든 정원이든 같은 규칙으로 눕히되, 탑이 많으면
     간격만 촘촘해진다 — 맨 뒤 탑이 점처럼 작아지거나 화면 밖으로 나가지
     않게 깊이 범위 자체는 늘 같다. */
  const drawn = full ? towersPerPage(lanesAll.length) : towersDrawn(lanesAll.length);
  /* 이 쪽이 담는 구간. t=0이 지금 쌓는 탑이고 커질수록 예전 탑이므로,
     쪽이 넘어갈수록 과거로 간다. 원근은 쪽 안에서만 세므로(아래 slot),
     몇 쪽을 넘겨도 정원은 늘 같은 깊이로 보인다. */
  const first = full ? Math.max(0, opts.page || 0) * drawn : 0;
  const rows = Math.min(deepest, drawn);
  const depthStep = 0.86 / Math.max(1, rows - 1);
  /* 물러남의 값 두 개는 따로 놀면 안 된다.
   *
   * 처음에는 '뒤로 갈수록 얼마나 위에 놓이나'와 '얼마나 작아지나'를 각각
   * 눈대중으로 잡았다. 그랬더니 뒤 탑이 땅에서 떠서 공중에 뜬 것처럼
   * 보였다 — 사람 눈은 이 둘의 비율로 거리를 읽기 때문에, 비율이 어긋나면
   * 곧바로 '멀리 있다'가 아니라 '떠 있다'가 된다.
   *
   * 그래서 하나만 정하고 나머지는 계산한다. 작아지는 만큼만 올라간다:
   *   올라간 높이 = HORIZON × (1 − 축소율)
   * HORIZON은 눈높이까지의 거리로, 이 값이 클수록 정원이 넓게 펼쳐진다. */
  const SHRINK = 0.42; // 맨 뒤 줄은 앞줄의 58% 크기
  /* 정원 탭은 화면을 통째로 쓰므로 눈높이를 훨씬 멀리 둔다.
   *
   * 이 값이 그림의 세로 길이를 정한다. 205일 때는 폭에 맞춰 그리면 높이가
   * 160px 남짓한 납작한 띠가 되어, 홈 귀퉁이의 요약과 구분이 되지 않았다.
   * 멀리 둘수록 앞뒤 줄이 세로로 벌어져 뜰이 깊어지고, 그만큼 그림도 커진다.
   * 높이를 CSS로 늘리면 남는 자리가 빈칸으로 남을 뿐이라 여기서 정한다.
   *
   * 660은 눈대중이 아니라 세 가지 화면에서 재 보고 고른 값이다. 아래
   * LANE_SPREAD로 폭을 좁혀 두면 그림의 가로세로 비가 화면의 그것에
   * 가까워지는 지점이 생기고, 거기서 정원이 위아래로 꽉 찬다.
   *
   * 더 멀리 둘수록 흔한 화면(390×844)의 채움은 96%에서 98%로 조금 나아지지만,
   * 작은 화면(360×640)에서는 세로가 먼저 닿아 좌우가 남는다 — 그 화면의 탑은
   * 660에서 60px, 720에서 57px로 오히려 작아졌다. 2%를 얻자고 작은 기기를
   * 깎을 이유가 없어서 660에서 멈췄다. */
  const HORIZON = full ? 660 : 150;

  /* 정원 탭에서는 좌우를 좁히고 앞뒤를 늘린다.
   *
   * 홈과 같은 폭으로 여섯 줄을 벌려 놓으면 그림이 가로로 길고 납작해진다.
   * 그런 그림을 세로로 긴 화면에 넣으면 폭이 먼저 닿아, 위아래는 비는데
   * 탑은 작아지는 최악이 된다 — 실제로 그렇게 보였다.
   *
   * 그래서 자리를 가운데로 모으고, 대신 앞뒤 간격을 늘려 벌어진 만큼을
   * 깊이로 돌린다. 그림이 세로로 길어지니 화면에 맞을 때 배율이 커지고,
   * 같은 자리에 더 큰 탑이 선다. 줄이 겹치지 않는 것은 이제 좌우 간격이
   * 아니라 앞뒤 간격이 맡는다. */
  const LANE_SPREAD = full ? 0.62 : 1;
  const LANE_DEPTH_MUL = full ? 2.2 : 1;
  /* 아무리 많이 쌓아도 여기서 멈춘다 — 그 너머는 지평선이다.
   *
   * 뒤쪽에서 딱 자르지 말고 간격을 좁혀 가며 붙여 볼까 했는데, 재 보니
   * 오히려 탑이 더 겹쳤다(겹침 0.27 → 0.53). 뒤가 촘촘해지는 만큼 서로
   * 파고들기 때문이다. 자르는 편이 낫다. */
  const DEPTH_MAX = 0.94;

  /* 작심마다 정원의 자리가 정해져 있다 — 만든 순서대로.
   *
   * 예전에는 많이 쌓은 순서로 자리를 줬는데, 그러면 어제까지 가운데 있던
   * 탑이 오늘 옆으로 밀린다. 정원의 지형이 바뀌면 "왼쪽 저건 내 걷기 탑"
   * 같은 기억이 만들어지지 않는다. 자리는 고정이어야 내 정원이 된다. */
  const drawList = [];
  lanesAll.forEach((goal, gi) => {
    const ch = characterOf(gi);
    const held = heldGoalId === goal.id;
    const { done, current } = towersOf(goal, held);
    const st = goalStatus(goal);
    // 이번 3일이 도는 동안에는 쌓는 중인 돌 자리를 계속 지킨다.
    const running = st === "fresh" || st === "active";
    const checks = held ? goal.checks.length - 1 : goal.checks.length;
    const building = held || running ? { done: checks, waiting: running && !checkedToday(goal) } : null;

    const baseX = 0.5 + (GOAL_LANES[gi] - 0.5) * LANE_SPREAD;
    const shown = Math.min(done, first + drawn - 1);
    for (let t = first; t <= shown; t++) {
      /* t는 이 작심 전체에서의 자리(0이 지금 쌓는 탑), slot은 이 쪽 안에서의
         자리다. 원근·흔들림은 전부 slot으로 센다 — 그래야 스무 쪽을 넘겨도
         정원이 늘 같은 깊이로 서고, 뒤쪽 쪽만 지평선에 눌리지 않는다. */
      const slot = t - first;
      /* 자리마다 다른 밑깊이를 더해 앞뒤를 흩는다 — 그래야 여섯이 한 줄로
         서지 않는다. 작심이 하나뿐이면 0에 가까워 그대로 앞이다. */
      const laneDepth = LANE_DEPTH[gi % LANE_DEPTH.length] * LANE_DEPTH_MUL;
      const depth = Math.min(DEPTH_MAX, laneDepth + slot * depthStep);
      /* 뒤로 갈수록 좌우로도 벌어진다. 줄마다 반 칸씩 어긋나게 밀어
         앞 탑이 뒤 탑을 정면으로 가리지 않는다 — 바둑판처럼 줄을 맞추면
         정원이 아니라 진열대가 된다. */
      const sway =
        (slot % 2 === 0 ? -1 : 1) * (0.05 + 0.02 * Math.floor(slot / 2)) * LANE_SPREAD;
      /* 흔들림은 자연스러움을 주려는 것이지 자리를 바꾸려는 게 아니다.
         예전 폭(±0.03)은 이웃한 두 자리를 최대 0.06(20px)까지 좁혀서,
         자리를 아무리 벌려 놔도 앞줄이 붙어 버릴 수 있었다.
         여기만 t를 쓰는 이유: 같은 탑은 몇 쪽에서 보든 같은 자리에 서야 한다. */
      const jitter = wobble(gi * 17 + t, 2) * 0.008;
      const x = Math.min(0.97, Math.max(0.03, baseX + sway + jitter)) * W;
      const shrink = 1 - SHRINK * depth;
      const scale = shrink * 0.70;
      // 작아진 만큼만 눈높이 쪽으로 올라간다 — 그래야 땅 위에 선 것으로 읽힌다
      const y = groundY - HORIZON * (1 - shrink);
      // 멀어질수록 공기에 잠긴다 — 옅어지고 대비도 함께 낮아진다
      /* 투명도로 거리를 주지 않는다 — 탑이 옆으로 겹치면 뒤 돌이 비쳐
         보여서 돌이 유리처럼 읽혔다. 거리는 크기(shrink)와 자리(위로 갈수록
         뒤)와 그리는 순서(뒤부터 그려 앞이 덮음)로만 준다. 돌은 늘 불투명. */
      const opacity = "1";
      drawList.push({
        goal, ch,
        // 쌓는 중인 탑은 첫 쪽에만 있다 — 그 뒤 쪽은 이미 완성된 것들이다
        current: t === 0,
        stones: t === 0 ? current : STONES_PER_TOWER,
        building: t === 0 ? building : null,
        depth, x, y, scale, opacity,
      });
    }
  });

  // 뒤에 있는 탑부터 그려야 앞 탑이 위에 겹친다
  drawList.sort((a, b) => b.depth - a.depth);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  /* 맨 앞 탑과 맨 뒤 탑이 선 땅. 틀의 아래끝과 땅 타원이 이 둘을 따라간다.
     예전에는 둘 다 '가상의 땅(groundY=0)'과 고정 수식으로 잡았는데, 자리마다
     밑깊이가 다른 지금은 맨 앞 탑이 groundY보다 한참 위에 선다. 그 차이가
     그림 아래쪽의 빈 띠로 남아 있었다. */
  let frontY = -Infinity;
  let backY = Infinity;
  const groups = drawList.map((t) => {
    frontY = Math.max(frontY, t.y);
    backY = Math.min(backY, t.y);
    /* 그라데이션을 탑 안쪽에 둔다 — 정원의 모든 탑이 defs 하나를 공유하면
       작심마다 다른 돌빛(.stone-tone-N이 쥔 CSS 변수)이 defs까지 닿지 못해
       여섯 색이 전부 같은 회색으로 묻는다. 탑마다 제 uid로 제 그라데이션을
       갖게 하면, 그 defs가 tone 클래스 아래에 놓여 변수가 제대로 내려온다. */
    const tuid = ++stoneDefsSeq;
    const { markup, top, foot } = stoneStack(
      t.stones, t.building, STONES_PER_TOWER, 0, tuid, t.ch
    );
    minX = Math.min(minX, t.x - foot * t.scale);
    maxX = Math.max(maxX, t.x + foot * t.scale);
    minY = Math.min(minY, t.y + top * t.scale);
    return `<g class="tower ${t.ch.toneClass}${t.current ? " tower-current" : ""}" data-goal-id="${t.goal.id}"
      transform="translate(${t.x.toFixed(1)} ${t.y.toFixed(1)}) scale(${t.scale.toFixed(3)})"
      opacity="${t.opacity}"><defs>${stoneDefs(tuid)}</defs><g class="tower-inner">${markup}</g></g>`;
  });

  /* 틀을 그림에 맞춘다.
   *
   * 예전에는 340×152 고정이었다. 그래서 돌 두 개짜리 탑 하나는 허허벌판
   * 한가운데 점처럼 놓였고, 스무 채가 서면 서로 밀려 잘렸다. 실기기에서
   * "탑이 사라진다"고 느낀 것도 절반은 이 틀 때문이다.
   *
   * 지금은 다 그린 뒤에 실제로 차지한 자리를 재서 그만큼만 담는다. 대신
   * 최소 폭을 두어, 탑 하나뿐일 때 그 하나가 화면을 가득 채우며 우스꽝
   * 스러워지는 것은 막는다. */
  if (!drawList.length) {
    minX = W * 0.35;
    maxX = W * 0.65;
    minY = -60;
    frontY = groundY;
    backY = groundY;
  }
  const padX = 16;
  const padTop = 12;
  const padBottom = 20;
  let vx = minX - padX;
  let vw = maxX - minX + padX * 2;
  const minW = full ? 210 : 190;
  if (vw < minW) {
    vx -= (minW - vw) / 2;
    vw = minW;
  }
  const vy = minY - padTop;
  const vh = frontY + padBottom - vy;

  /* 땅은 탑들이 실제로 선 자리를 따라 깔린다. 늘 화면 한가운데 큰 타원을
     두면 탑이 한쪽에 몰렸을 때 빈 땅만 넓게 보인다. */
  const gx = (minX + maxX) / 2;
  /* 그라데이션이 다 사라진 뒤에 틀이 와야 한다. 색이 남은 채로 잘리면
     땅이 아니라 밝은 사각형 띠로 보인다 — 어두운 화면에서 특히 눈에 띈다.
     아래 r="62%"와 짝이므로 한쪽만 바꾸면 그 띠가 다시 생긴다. */
  const gw = Math.max((maxX - minX) / 2 + 40, 74);
  /* 땅은 맨 앞 발치부터 맨 뒤 발치까지 덮는다. 늘 같은 자리에 같은 크기로
     깔면 뒤쪽 탑 아래가 비어서 탑이 떠 보인다 — 실제로 그렇게 보였다.
     맨 앞·맨 뒤는 위에서 실제로 잰 값을 쓴다. 수식으로 짐작하면 자리마다
     밑깊이가 다른 지금은 어긋나서, 땅이 탑보다 앞이나 뒤에서 끝난다. */
  const gcy = (frontY + backY) / 2 - 4;
  const gry = Math.max((frontY - backY) / 2 + 30, 34);
  const ground =
    `<ellipse cx="${gx.toFixed(1)}" cy="${gcy.toFixed(1)}" ` +
    `rx="${gw.toFixed(1)}" ry="${gry.toFixed(1)}" fill="url(#gardenGround-${uid})"/>`;

  return `<svg viewBox="${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}"
    xmlns="http://www.w3.org/2000/svg">
    <defs>
      ${stoneDefs(uid)}
      <!-- 땅은 '있다'는 것만 알면 되는 것이라 아주 옅게, 그리고 끝까지
           천천히 사라지게 둔다. 예전에는 60%에서 투명해졌는데, 그 지점이
           호(弧)로 보여서 어두운 화면에서 정원 뒤를 가로지르는 띠가 됐다. -->
      <radialGradient id="gardenGround-${uid}" cx="50%" cy="48%" r="62%">
        <stop offset="0%" stop-color="var(--garden-ground)" stop-opacity="0.42"/>
        <stop offset="38%" stop-color="var(--garden-ground)" stop-opacity="0.3"/>
        <stop offset="68%" stop-color="var(--garden-ground)" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="var(--garden-ground)" stop-opacity="0"/>
      </radialGradient>
    </defs>
    ${ground}
    ${groups.join("\n")}
  </svg>`;
}

function stoneCount(goal) {
  return goal.completedCycles + (goal.checks.length >= 3 ? 1 : 0);
}

/* frameTop을 주면 실제 탑 높이와 상관없이 그 높이의 틀로 그린다.
 * 안내 화면처럼 여러 장을 넘겨 보는 곳에서는 이게 필요하다. 틀을 탑에
 * 딱 맞추면 돌 한 개짜리 장과 다섯 개짜리 장의 확대율이 달라져서,
 * 같은 돌인데도 장마다 크기가 널뛰고 돌 하나짜리 장은 바닥 그림자만
 * 커다랗게 보인다. */
function cairnSVG(stones, building, ghost = 0, max = MAX_STONES, frameTop = 0, ch = STONE_CHARACTERS[0]) {
  // 정원의 탑과 같은 돌을 쓴다 — 축하 화면과 홈이 같은 재질로 보이도록
  const uid = ++stoneDefsSeq;
  const { markup, top } = stoneStack(stones, building, max, ghost, uid, ch);
  const pad = 12;
  const y = Math.min(top, frameTop) - pad;
  const height = pad - y;
  return `<svg viewBox="-58 ${y.toFixed(1)} 116 ${height.toFixed(1)}" xmlns="http://www.w3.org/2000/svg">
    <defs>${stoneDefs(uid)}</defs>
    ${markup}
  </svg>`;
}

/* ── 렌더링 ─────────────────────────── */

const $ = (id) => document.getElementById(id);

function render() {
  renderStats();
  renderGoals();
  /* 지금 열려 있는 탭도 함께 다시 그린다.
   *
   * 오랫동안 여기서 홈과 숫자만 갱신했다. 정원과 기록은 탭을 열 때
   * (switchView) 한 번 그리고 마는 구조라, 그 탭에 머문 채로 무언가를 바꾸면
   * 화면이 옛 상태로 남았다. '오늘 표시 지우기'가 그 자리다 — 정원 탭에서
   * 탑을 눌러 지우면 아래 숫자는 하나 줄어드는데 탑의 3일 테두리는 그대로였고,
   * 기록 탭에서 지우면 달력에 오늘이 그대로 칠해져 있었다. 지운 사람 눈에는
   * 지워진 것과 안 지워진 것이 한 화면에 같이 있는 셈이다.
   *
   * 숨어 있는 탭까지 그릴 필요는 없다 — 열 때 어차피 다시 그린다. */
  if (currentView === "garden") renderGarden();
  if (currentView === "record") renderRecord();
  runPendingAnim();
  // 상태가 바뀌면 앞으로 보낼 알림도 다시 짠다 (네이티브에서만 동작)
  if (typeof rescheduleNotifications === "function") rescheduleNotifications();
}

function renderStats() {
  const goals = state.goals;
  const hasGoals = goals.length > 0;

  /* 숫자가 사는 곳은 정원 탭 하나지만, 값을 채우는 일은 여기서 한다.
     탭을 열 때만 갱신하면 홈에서 체크하고 정원으로 넘어가기 전까지
     옛 수가 남아 있게 된다. 어느 화면에 있든 값은 늘 지금이어야 한다.
     '해낸 날'은 체크 횟수의 합이 아니라 실제로 무언가를 해낸 날의 수 —
     작심 셋을 하루에 다 해도 하루로 센다. */
  $("stat-total-days").textContent = totalDaysWithTower();
  $("stat-cycles").textContent = totalStones();
  $("stat-restarts").textContent = goals.reduce((s, g) => s + g.restarts, 0);

  $("stats").hidden = !hasGoals;
  $("section-head").hidden = !hasGoals;
  $("empty").hidden = hasGoals;
  // 아직 아무것도 없을 땐 추가 버튼이 유일한 할 일이므로 눈에 띄게 둔다
  $("btn-add").classList.toggle("first-cta", !hasGoals);

  /* 자리가 다 찼으면 버튼이 미리 말한다.
   *
   * disabled로 두지 않는 이유가 있다. <button>을 비활성으로 만들면 색이
   * 브라우저 기본값으로 넘어가는데, 이 앱은 예전에 바로 그 UA 기본색
   * 때문에 흰 카드 위에 흰 글자가 난 적이 있다. 눌리긴 하되 누르면
   * 왜 안 되는지 말해 주는 편이 안전하고 친절하다. */
  const atCap = goals.length >= GARDEN_MAX;
  $("btn-add").querySelector("b").textContent = atCap
    ? "작심 자리가 다 찼어요"
    : "새 작심 만들기";
  $("btn-add").querySelector(".add-sub").textContent = atCap
    ? ` — 하나를 지우면 자리가 나요`
    : " — 딱 3일만 약속해요";

  /* 홈의 정원은 그림 하나뿐이다.
   *
   * 숫자(해낸 날·쌓은 돌·다시 쌓음)는 정원 탭에만 산다. 예전에는 홈·기록·
   * 정원·상세 네 곳에 같은 수가 흩어져 있었는데, 같은 것을 네 번 말하면
   * 정보가 네 배가 되는 게 아니라 어느 것도 눈에 안 들어온다.
   *
   * 홈이 답하는 질문은 '오늘 뭘 하지' 하나다. 그림을 남긴 이유는 하나뿐 —
   * 앱을 열자마자 내가 쌓은 게 보이고, 그 아래에서 오늘 것을 누르는
   * 순서가 좋아서다. 탭을 갈아타지 않고 눈으로 훑어 내려가면 된다.
   * 자세히 보고 싶으면 그림을 누른다. */
  $("hero-garden").innerHTML = gardenSVG(goals);
  /* 홈의 정원은 통째로 한 덩어리다 — 어디를 눌러도 정원 탭으로 간다.
   *
   * 한때는 탑 하나를 콕 집으면 그 작심의 기록이 열리게도 해 봤다. 그런데
   * 이만한 그림 안에서는 탑들이 화면 대부분을 덮고 있어서, '그림을 눌러
   * 정원 보기'가 사실상 눌리지 않는 길이 됐다. 좁은 자리에 목적지가 둘이면
   * 둘 다 안 눌린다. 작심 하나하나로 가는 길은 이미 두 군데 있다 —
   * 아래 카드의 윗부분, 그리고 정원 탭의 목록. */

  const emptyCairn = document.querySelector(".empty-cairn");
  if (emptyCairn && !hasGoals) emptyCairn.innerHTML = cairnSVG(0, true, 2);

  /* 홈에 남은 유일한 문장.
   *
   * '3일을 채워야 돌 하나'는 짐작으로 알 수 없는 규칙이고, 한 번 읽고
   * 외워지지도 않는다. 그래서 첫 돌을 얹기 전까지는 눈앞의 칸 세 개를
   * 가리키며 계속 말해 준다. 돌을 하나 얹고 나면 스스로 알게 되므로 걷는다.
   *
   * 예전에는 여기에 '다시 쌓음 N회', '작심삼일 N번 = N일' 같은 줄도
   * 돌아가며 떴는데, 그건 정원 탭의 숫자를 문장으로 한 번 더 말하는
   * 것뿐이었다. 같은 것을 두 번 말하면 둘 다 흐려진다. */
  const note = $("note");
  const teaching = hasGoals && totalStones() === 0;
  note.hidden = !teaching;
  if (teaching) {
    /* 두 문장 다 규칙 설명이었을 때는('오늘 해내면 칸이 하나 채워져요.
     * 세 칸을 다 채우면 돌 하나가 쌓입니다') 홈에서 이 앱이 다른 습관 앱과
     * 갈리는 말이 한 마디도 없었다. 칸을 채우고 보상을 모으는 규칙은 여느
     * 트래커와 같은 말이라, 처음 온 사람 눈에는 첫날 화면이 통째로 남들과
     * 같아 보인다. 돌 하나를 얹기 전까지 홈에 뜨는 유일한 문장이므로,
     * 절반은 규칙에 쓰되 나머지 절반은 이 앱의 약속에 쓴다. */
    note.innerHTML = "3일을 채우면 돌 하나가 쌓여요. <b>며칠 빠뜨려도 쌓은 돌은 그대로</b>입니다.";
  }
}

function renderGoals() {
  const list = $("goal-list");
  list.innerHTML = "";
  for (const goal of state.goals) {
    list.appendChild(renderGoalCard(goal));
  }
}

/* 상태줄은 한 줄에 들어가야 한다 — 위로하는 말은 버튼과 아래 배너가 맡는다.
 *
 * 순서가 곧 우선순위다. 이 줄에 들어갈 폭은 360px 기기에서 124px뿐이라
 * 두 가지를 나란히 놓을 수 없다. 한때 '다시 4번' 칩을 앞에 붙여 봤는데
 * 뒤에 무슨 말이 오든 전부 말줄임표에 잘렸다.
 *
 * 그래서 겹칠 때 무엇을 남길지 정해 둔다.
 *
 * 1. 쉬는 중 · 끊김 — 지금 돌아오라고 말해야 하는 자리다.
 * 2. 완주 — 그 순간의 말이 다른 무엇보다 먼저다.
 * 3. 다시 쌓는 중 — 습관 앱을 써 본 사람은 여기서 '🔥 12일 연속'을 찾는다.
 *    그 자리가 그냥 비어 있으면 스트릭을 일부러 버린 앱이 아니라 스트릭이
 *    아직 없는 앱으로 읽힌다. 버렸다는 것을 보이려면 그 자리에 다른 것이
 *    서 있어야 하고, 이 앱이 세기로 한 수는 restarts다.
 * 4. 나머지 — 지금 며칠째인지.
 *
 * 4번을 3번에 내주는 것이 아깝지 않은 이유: 며칠째인지는 바로 옆 칸 세
 * 개가 이미 말하고 있고, 셋째 날의 '오늘이면 돌 하나 완성'은 그 아래
 * 버튼이 '오늘 해내고 돌 완성하기'로 더 크게 말한다. 같은 것을 두 번
 * 말하느라 한 번도 안 한 말을 못 하고 있었다. */
function statusLine(goal, status) {
  const n = goal.checks.length;
  if (status === "lapsed") return `<span class="ok">${daysSinceLastCheck(goal)}일째 쉬는 중</span>`;
  if (status === "broken") return `<span class="ok">쌓아둔 ${goal.totalDays}일은 그대로예요</span>`;
  if (status === "complete") return `<b>돌 하나 완성!</b>`;
  if (goal.restarts >= 1) return `<span class="ok">${goal.restarts}번 다시 쌓는 중</span>`;
  if (status === "resting") return `어제 완성 · <b>오늘 이어서</b>`;
  if (checkedToday(goal) && n === 0) return `내일 새 돌을 시작해요`;
  if (checkedToday(goal)) return `${DAY_KO[n - 1]} 날 완료`;
  if (n === 2) return `<b>오늘이면 돌 하나 완성</b>`;
  if (n === 1) return `${DAY_KO[n]} 날이에요`;
  return `오늘이 첫날`;
}

/* 길게 눌러 삭제는 없앴다.
 *
 * 발견 가능성이 0인데 사고 가능성은 0이 아닌, 최악의 조합이었다. 아무도
 * 찾지 못하는 기능이 어쩌다 한 번 100일치 기록을 지운다. 지우기는 상세
 * 시트에 이름을 달고 서 있으면 충분하다. */

function renderGoalCard(goal) {
  const status = goalStatus(goal);
  /* 끊긴 것은 누르는 순간이 없다 — 아무것도 안 한 결과라서, 셀 수 있는
     자리가 '그 상태를 화면에 그리는 때'뿐이다. 홈을 열 때마다 세면
     '무너진 횟수'가 아니라 '앱을 연 횟수'가 되므로 사이클당 한 번만 센다. */
  if (status === "broken") trackBrokenOnce(goal);
  const card = document.createElement("article");
  card.className = `goal-card state-${status}`;
  card.dataset.goalId = goal.id;
  if (goal.id === newGoalId) {
    card.classList.add("appear");
    newGoalId = null;
  }

  const top = document.createElement("div");
  top.className = "goal-top";

  const ico = document.createElement("div");
  ico.className = "goal-ico";
  ico.innerHTML = iconSVG(goalIcon(goal), 22);
  top.appendChild(ico);

  const tt = document.createElement("div");
  tt.className = "goal-tt";
  const title = document.createElement("div");
  title.className = "goal-title";
  title.textContent = goal.title;
  const sub = document.createElement("div");
  sub.className = "goal-status";
  sub.innerHTML = statusLine(goal, status);
  tt.appendChild(title);
  tt.appendChild(sub);
  top.appendChild(tt);

  const dots = document.createElement("div");
  dots.className = "dots";
  // 완주 다음 날부터는 지난 사이클의 ✓ 대신 비어 있는 세 칸을 보여 준다.
  // 다 채워진 칸이 남아 있으면 "이미 끝났다"로 읽혀 다음 걸음이 보이지 않는다.
  const showPrevChecks = status !== "resting" && status !== "lapsed";
  for (let i = 0; i < 3; i++) {
    const d = document.createElement("span");
    const done = showPrevChecks && i < goal.checks.length;
    const isNext =
      i === goal.checks.length &&
      (status === "fresh" || status === "active") &&
      !checkedToday(goal);
    d.className = "dot" + (done ? " done" : "") + (isNext ? " today" : "");
    d.textContent = done ? "✓" : i + 1;
    dots.appendChild(d);
  }
  top.appendChild(dots);

  // 카드 윗부분을 누르면 이 작심이 걸어온 기록이 열린다
  top.setAttribute("role", "button");
  top.setAttribute("tabindex", "0");
  top.setAttribute("aria-label", `${goal.title} 기록 보기`);
  top.addEventListener("click", () => openDetail(goal));
  top.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      openDetail(goal);
    }
  });

  card.appendChild(top);

  const btn = document.createElement("button");
  btn.className = "btn";

  if (status === "complete") {
    btn.classList.add("btn-success");
    btn.textContent = "또 작심하기 — 다음 돌 쌓기";
    btn.addEventListener("click", () => nextCycle(goal));
  } else if (status === "resting") {
    // 어제 완주 — 오늘 바로 이어 가는 게 가장 쉬운 다음 걸음이다
    btn.classList.add("btn-primary");
    btn.textContent = "오늘부터 다음 3일";
    btn.addEventListener("click", () => nextCycle(goal));
  } else if (status === "lapsed") {
    btn.classList.add("btn-rest");
    btn.textContent = "다시 쌓기 시작";
    // 다시 오는 것은 묻고 나서 — askReturn이 시트를 띄우고, 누르면 그때 시작한다
    btn.addEventListener("click", () => askReturn(goal, "lapsed"));
  } else if (status === "broken") {
    btn.classList.add("btn-rest");
    btn.textContent = "괜찮아요, 다시 쌓기";
    btn.addEventListener("click", () => askReturn(goal, "broken"));
  } else if (checkedToday(goal) && goal.checks.length === 0) {
    btn.classList.add("btn-done");
    btn.textContent = "내일 첫 칸부터 시작해요";
    btn.disabled = true;
  } else if (checkedToday(goal)) {
    btn.classList.add("btn-done");
    btn.textContent = "오늘은 다 했어요";
    btn.disabled = true;
  } else {
    // '오늘의 돌 얹기'라고 하면 안 된다. 돌 하나는 사흘이지 하루가 아니다.
    // 하루치는 칸 하나이고, 그 칸 셋이 모여야 돌이 된다.
    btn.classList.add("btn-primary");
    btn.textContent = goal.checks.length === 2 ? "오늘 해내고 돌 완성하기" : "오늘 해냈어요";
    btn.addEventListener("click", () => checkToday(goal));
  }
  card.appendChild(btn);

  return card;
}

/* ── 손맛: 진동 · 토스트 · 돌 얹기 애니메이션 ── */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* 촉감은 상황에 따라 세기를 나눈다. 전부 같은 세기로 울리면
 * 앱 전체가 투박한 진동기처럼 느껴진다.
 *   6 이하  → 딸깍(탭 전환, 칩 선택)
 *   7~14   → 가볍게(오늘의 체크, 버튼)
 *   15 이상 → 착지(돌이 탑에 닿는 순간)
 *   배열    → 완주 (OS의 성공 패턴)
 * 웹에서는 진동 모터밖에 없으므로 값을 훨씬 짧게 잡아 둔다. */
function haptic(ms) {
  const kind = Array.isArray(ms) ? "success" : ms <= 6 ? "select" : ms >= 15 ? "land" : "light";
  if (typeof nativeHaptic === "function" && nativeHaptic(kind)) return;
  if (!navigator.vibrate) return;
  const web = { select: 8, light: 12, land: 18, success: [10, 40, 16] }[kind];
  navigator.vibrate(web);
}

let toastTimer = null;

function toast(iconKey, text) {
  const el = $("toast");
  el.innerHTML = `<span class="toast-icon">${iconSVG(iconKey, 18)}</span><span class="toast-text"></span>`;
  el.querySelector(".toast-text").textContent = text;
  el.hidden = false;
  // 재생 중이던 애니메이션을 끊고 처음부터 다시
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("show");
    toastTimer = setTimeout(() => (el.hidden = true), 300);
  }, 2200);
}

/* 렌더 직후 실행할 애니메이션 예약 */
let pendingAnim = null;
let newGoalId = null;
/* 돌이 공중에 떠 있는 동안 그 작심의 id — 해당 탑만 자라지 않고 기다린다 */
let heldGoalId = null;
/* 축하 화면이 보고 있는 목표 */
let cheerGoalId = null;

function runPendingAnim() {
  const job = pendingAnim;
  pendingAnim = null;
  if (!job) return;

  const card = document.querySelector(`.goal-card[data-goal-id="${job.goalId}"]`);
  const dot = card && card.querySelectorAll(".dot")[job.dotIndex];

  if (dot) {
    dot.classList.add("just-done");
    dot.addEventListener("animationend", () => dot.classList.remove("just-done"), { once: true });
  }

  if (job.completed) {
    haptic([12, 60, 24]);
    const goal = state.goals.find((g) => g.id === job.goalId);
    flyStoneToTower(dot, job.goalId, () => {
      // 돌이 얹힌 뒤에 축하 화면 — 탑이 자라는 걸 먼저 보게 한다
      if (goal) setTimeout(() => showCheer(goal), 420);
    });
  } else {
    haptic(12);
    if (!job.silent) {
      const left = 3 - job.dotIndex - 1;
      const msg = left === 1 ? "하루만 더 하면 돌 하나 완성" : "좋아요, 오늘도 해냈어요";
      setTimeout(() => toast("stone", msg), 180);
    }
  }

  /* 첫 칸을 채운 직후가 알림을 권할 자리다. 방금 뭔가를 해냈고,
   * 내일도 하고 싶은 마음이 가장 클 때.
   * 토스트가 완전히 사라진 뒤에 띄운다 — 겹치면 시트의 아래쪽 버튼을 가린다. */
  if (!job.silent) setTimeout(askNotify, job.completed ? 3200 : 2600);
}

/* ── 기록을 잃지 않게 ──────────────────
 *
 * 기록은 localStorage에만 있다. 안드로이드가 저장소를 정리하거나 앱을
 * 지우면 그대로 사라진다. '쌓아온 것'이 전부인 앱에서 그걸 잃는 건 재앙인데,
 * 백업은 설정 깊숙한 곳의 수동 버튼 하나뿐이었다 — 아무도 누르지 않는.
 *
 * 그래서 탑 한 채를 세운 날 한 번 권한다. 잃으면 가장 아까워지는 시점이자,
 * 방금 뭔가를 해내서 귀를 열어 둔 시점이다. 거절하면 다음 탑까지 묻지 않는다.
 */
const BACKUP_ASKED_KEY = "jaksim3.backupAskedAt";

function maybeOfferBackup() {
  const towers = state.goals.reduce((n, g) => n + towersOf(g).done, 0);
  const asked = Number(localStorage.getItem(BACKUP_ASKED_KEY) || 0);
  if (towers <= asked) return;
  localStorage.setItem(BACKUP_ASKED_KEY, String(towers));
  // 축하를 먼저 보게 하고, 그 뒤에 조용히 띄운다
  setTimeout(() => {
    if (!$("cheer").hidden) $("backup-note").hidden = false;
  }, 1800);
}

/* ── 기록 지키기 ──────────────────────
 * 이 앱의 자산은 쌓인 기록인데 브라우저 저장소는 지워질 수 있다.
 * 서버가 생기기 전까지는 파일로 꺼내 두는 것이 유일한 안전장치다.
 */

async function exportData() {
  const payload = JSON.stringify({ app: "jaksim3", exportedAt: new Date().toISOString(), ...state }, null, 2);
  // 파일명에 한글을 쓰면 브라우저가 통째로 무시하고 확장자 없는 'download'로
  // 저장해 버린다 — 나중에 다시 가져올 수 없게 되므로 ASCII로 둔다
  const name = `jaksimsamil-${todayStr()}.json`;

  /* 앱으로 감쌌을 때는 공유 시트로 내보낸다.
     <a download>는 안드로이드 WebView 안에서 아무 일도 하지 않아서,
     예전에는 "저장했어요"라고만 하고 파일은 어디에도 없었다. */
  if (typeof nativeSaveText === "function") {
    const ok = await nativeSaveText(payload, name, "application/json");
    if (ok) {
      haptic(10);
      toast("stone", `${name} — 저장할 곳을 골라 주세요`);
      return;
    }
  }

  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  haptic(10);
  toast("stone", `${name} 으로 저장했어요`);
}

/* 남의 손을 탄 파일도 앱을 깨뜨리지 않게 필요한 모양으로 다듬는다 */
function normalizeGoal(raw, index) {
  const checks = Array.isArray(raw.checks) ? raw.checks.filter((d) => typeof d === "string").slice(-3) : [];
  const history = Array.isArray(raw.history)
    ? [...new Set(raw.history.filter((d) => typeof d === "string"))].sort()
    : [...checks];
  const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : `imported-${index}-${Math.random().toString(36).slice(2, 6)}`,
    title: String(raw.title).slice(0, 30),
    icon: ICONS[raw.icon] ? raw.icon : goalIcon(raw),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    checks,
    history,
    lastCheckDate: typeof raw.lastCheckDate === "string" ? raw.lastCheckDate : checks[checks.length - 1] || null,
    totalDays: num(raw.totalDays) || history.length,
    completedCycles: num(raw.completedCycles),
    restarts: num(raw.restarts),
  };
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let goals;
    try {
      const data = JSON.parse(String(reader.result));
      if (!data || !Array.isArray(data.goals)) throw new Error("shape");
      goals = data.goals
        .filter((g) => g && typeof g.title === "string" && g.title.trim())
        .map(normalizeGoal);
    } catch (e) {
      alert("이 파일은 셋돌하나 기록이 아닌 것 같아요.");
      return;
    }
    if (!goals.length) {
      alert("파일에서 불러올 작심을 찾지 못했어요.");
      return;
    }
    const now = state.goals.length;
    const warn = now ? `\n\n지금 앱에 있는 작심 ${now}개는 이 기록으로 대체됩니다.` : "";
    if (!confirm(`작심 ${goals.length}개를 불러올까요?${warn}`)) return;
    state = { goals };
    save();
    render();
    haptic(12);
    toast("stone", `작심 ${goals.length}개를 불러왔어요`);
  };
  reader.onerror = () => alert("파일을 읽지 못했어요.");
  reader.readAsText(file);
}

/* ── 달력 ────────────────────────────
 * 예전에는 12주 히트맵(작은 네모들)이었는데, 실사용 피드백에서
 * "네모만 여러 개라 뭔지 한눈에 안 들어온다"는 지적을 받았다.
 * 누구나 읽을 줄 아는 모양 — 날짜 숫자가 있는 월 달력 — 으로 바꾼다.
 */

/* offset: 0 = 이번 달, -1 = 지난달 … */
function monthOf(offset) {
  const d = now();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return { y: d.getFullYear(), m: d.getMonth() };
}

/* marks를 주면 '어느 작심이었는지'까지 그린다 — 날짜 아래 작은 점.
   기록 탭처럼 여러 작심이 한 달력에 겹칠 때만 쓴다. 상세 화면은 작심이
   하나뿐이라 점이 필요 없고, 그때는 칸을 통째로 칠하는 편이 잘 읽힌다. */
function monthCalHTML(doneSet, y, m, marks) {
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayKey = todayStr();
  const parts = [];
  for (let i = 0; i < first.getDay(); i++) parts.push(`<span class="mcal-cell blank"></span>`);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const done = doneSet.has(key);
    const cls = [
      "mcal-cell",
      done ? "done" : "",
      marks ? "marked" : "",
      key === todayKey ? "today" : "",
      key > todayKey ? "future" : "",
    ]
      .filter(Boolean)
      .join(" ");
    /* 점은 만들 수 있는 작심 수(GARDEN_MAX)만큼 다 찍는다.
       예전에는 네 개에서 잘랐는데, 여섯을 만들 수 있게 된 뒤로는 하루에
       여섯을 다 해도 둘이 사라져 '기록이 빠졌다'로 보였다. */
    const marked = marks ? (marks.get(key) || []).slice(0, GARDEN_MAX) : [];
    const dots = marked.map((i) => `<b class="gdot g${i}"></b>`).join("");
    // 넷부터는 두 줄로 접는다 — 한 줄로 세우면 칸이 벌어져 달력이 화면을 넘는다
    const dotCls = "gdots" + (marked.length > 3 ? " folded" : "");
    parts.push(`<span class="${cls}"><i>${d}</i>${dots ? `<em class="${dotCls}">${dots}</em>` : ""}</span>`);
  }
  return parts.join("");
}

/* 달력 하나(제목 + 격자 + 이동 버튼)를 통째로 관리한다 */
function paintMonthCal(prefix, offset, doneSet, marks) {
  const { y, m } = monthOf(offset);
  $(`${prefix}-cal-title`).textContent = `${y}년 ${m + 1}월`;
  $(`${prefix}-mcal`).innerHTML = monthCalHTML(doneSet, y, m, marks);
  // 미래 달로는 넘어가지 않는다
  $(`${prefix}-cal-next`).disabled = offset >= 0;
  const ym = `${y}-${String(m + 1).padStart(2, "0")}`;
  let count = 0;
  for (const d of doneSet) if (d.startsWith(ym)) count += 1;
  return count;
}

/* 기록에서 읽어 낸 한마디 — 숫자보다 이야기를 돌려준다 */
function historyWord(goal) {
  const h = [...(goal.history || [])].sort();
  if (h.length === 0) return "아직 첫 돌 전이에요.";
  /* 멈춘 횟수는 세지 않는다. '3번 멈췄다가 다시 왔어요'는 위로하는 모양을
     하고서 실패를 앞세우는 문장이고, 스트릭을 버리면서 같이 버리기로 한
     것이 그것이다. restarts의 정의 자체가 '다시 쌓기를 시작한 횟수'이므로
     문장도 그것만 말하면 된다. 복귀 시트는 이미 이렇게 고쳤는데 여기만
     옛 어법으로 남아 있었다. */
  if (goal.restarts > 0) {
    return `${goal.restarts}번 다시 돌아왔어요. 그게 이 탑의 진짜 기록이에요.`;
  }
  const built = towersOf(goal);
  if (built.done > 0) {
    return `돌탑 ${built.done}채를 세웠어요. 한 채가 ${STONES_PER_TOWER * 3}일이니 ${built.done * STONES_PER_TOWER * 3}일이에요.`;
  }
  if (goal.completedCycles > 0) {
    return `${goal.completedCycles}번의 3일이 쌓여 ${goal.totalDays}일이 됐어요.`;
  }
  return "지금 첫 3일을 쌓는 중이에요.";
}

let detailGoalId = null;
let detailMonth = 0; // 0 = 이번 달

function paintDetailCal() {
  const goal = state.goals.find((g) => g.id === detailGoalId);
  if (!goal) return;
  const done = new Set(goal.history || []);
  const count = paintMonthCal("detail", detailMonth, done);
  $("detail-word").textContent =
    count > 0 ? `이 달에 ${count}일 돌을 얹었어요` : historyWord(goal);
}

function openDetail(goal) {
  detailGoalId = goal.id;
  detailMonth = 0;
  $("detail-ico").innerHTML = iconSVG(goalIcon(goal), 20);
  $("detail-title").textContent = goal.title;
  const built = towersOf(goal);
  $("detail-stats").innerHTML =
    `<div><b>${goal.totalDays}</b><span>해낸 날</span></div>` +
    `<div><b>${stoneCount(goal)}</b><span>쌓은 돌</span></div>` +
    // 완성한 탑은 돌 다섯 개(15일)마다 하나 — 돌보다 큰 단위의 성취다
    (built.done ? `<div><b>${built.done}</b><span>완성한 탑</span></div>` : "") +
    // 다시 쌓은 횟수는 다른 종류의 성취라 색을 따로 준다
    `<div class="again"><b>${goal.restarts}</b><span>다시 쌓음</span></div>`;
  $("detail-undo").hidden = !canUndoToday(goal);
  paintDetailCal();
  $("detail").hidden = false;
}

function closeDetail() {
  $("detail").hidden = true;
  detailGoalId = null;
}

/* ── 기록 탭 ─────────────────────────
 * 모든 작심을 합친 달력 하나 + 작심별 요약.
 * 홈이 '오늘'이라면 여기는 '지나온 길'이다.
 */

let recordMonth = 0;

/* 이 작심의 자리 번호 — 돌 성격, 정원 자리, 기록 탭 색이 모두 이 번호를
   공유한다. 목록에서의 순서라 목표를 지우면 뒤가 한 칸씩 당겨진다. */
function goalIndex(goal) {
  const i = state.goals.findIndex((g) => g.id === goal.id);
  return (i < 0 ? 0 : i) % 6;
}

function paintRecordCal() {
  const done = new Set();
  /* 어느 날 어느 작심을 했는지까지 모은다. 합쳐 놓기만 하면 '뭔가 하긴 한 날'
     밖에 안 보이는데, 대개 알고 싶은 건 '그날 무엇을 했나'다. */
  const marks = new Map();
  for (const g of state.goals) {
    const gi = goalIndex(g);
    for (const d of g.history || []) {
      done.add(d);
      if (!marks.has(d)) marks.set(d, []);
      if (!marks.get(d).includes(gi)) marks.get(d).push(gi);
    }
  }
  for (const list of marks.values()) list.sort((a, b) => a - b);
  const count = paintMonthCal("record", recordMonth, done, marks);
  const note = $("record-cal-note");
  if (state.goals.length === 0) {
    note.textContent = "첫 작심을 만들면 여기에 기록이 쌓여요.";
  } else if (count === 0) {
    note.textContent = "이 달에는 아직 얹은 돌이 없어요.";
  } else {
    note.textContent = `이 달에 ${count}일 돌을 얹었어요.`;
  }
}

/* 기록 탭은 '언제 했나'에 답한다 — 달력, 그리고 그 달력을 읽는 열쇠.
   숫자는 정원 탭에만 둔다. 같은 줄을 두 화면에 두지 않는다. */
function renderRecord() {
  paintRecordCal();
  paintGoalKey();
}

/* 달력의 점과 작심을 잇는 줄.
 *
 * 이 줄은 원래 정원 탭에 있었다. 정원이 돌탑만 세우는 화면이 되면서
 * 갈 곳을 잃었는데, 지울 수는 없었다 — 달력의 점이 작심마다 다른 색인데
 * 그 색이 무엇인지 말해 주는 곳이 앱 어디에도 없어지기 때문이다.
 * 색을 쓰는 화면 바로 아래가 그 열쇠가 있어야 할 자리다. */
function paintGoalKey() {
  const list = $("record-goals");
  list.innerHTML = "";
  for (const goal of state.goals) {
    const t = towersOf(goal);
    const row = document.createElement("button");
    row.type = "button";
    row.className = `record-row g${goalIndex(goal)}`;
    row.innerHTML =
      `<span class="record-ico">${iconSVG(goalIcon(goal), 20)}</span>` +
      `<span class="record-tt"><b></b><span></span></span>` +
      `<span class="record-num">${t.done}<i>채</i></span>`;
    row.querySelector("b").textContent = goal.title;
    row.querySelector(".record-tt span").textContent =
      t.done > 0
        ? `완성한 탑 ${t.done}채 · 지금 탑 ${t.current}/${STONES_PER_TOWER}`
        : `지금 탑 ${t.current}/${STONES_PER_TOWER}`;
    row.addEventListener("click", () => openDetail(goal));
    list.appendChild(row);
  }
}

/* ── 정원 탭 ─────────────────────────
 *
 * 이 앱에서 가장 중요한 그림은 돌탑이다. 그런데 그 그림이 홈 화면 위쪽
 * 152px 안에만 있었고, 자리가 좁으니 탑을 몇 채만 추려 그려야 했다.
 * 오래 다닌 사람에게는 그게 "예전에 세운 탑이 사라졌다"로 보인다 —
 * 가장 자랑스러워야 할 것이 가장 조용히 지워지고 있던 셈이다.
 *
 * 그래서 정원에 제 화면을 준다. 홈의 정원은 그대로 두되, 이제 그건 요약이고
 * 진짜는 여기다. 한 화면에 다 세우지는 않는다 — towersPerPage가 정한 만큼만
 * 서고, 옆으로 밀면 그 이전 탑들이 나온다. 그래서 빠지는 탑은 없다.
 *
 * 이 화면에는 그림 말고 아무것도 두지 않는다. 한동안 아래에 작심 목록을
 * 한 벌 더 달아 두었는데, 그건 홈에 이미 있는 줄이라 두 탭이 사실상 같은
 * 화면으로 보였다. 탑 하나에 대해 알고 싶으면 그 탑을 누른다.
 */
/* 지금 보고 있는 쪽. 0이 가장 최근이고, 커질수록 예전 탑이다. */
let gardenPage = 0;

function renderGarden() {
  const goals = state.goals;
  const pages = gardenPageCount(goals);
  // 돌을 지우거나 작심을 지우면 쪽수가 줄어든다 — 보던 쪽이 사라지면 당겨 온다
  gardenPage = Math.min(Math.max(0, gardenPage), pages - 1);
  $("garden-page").innerHTML = gardenSVG(goals, { full: true, page: gardenPage });
  /* 탑 하나하나가 그 작심으로 들어가는 문이다.
   *
   * 예전에는 아래에 작심 목록을 한 벌 더 두었는데, 그건 홈에 이미 있는
   * 줄이라 두 탭이 같은 화면처럼 보였다. 목록을 지우고 나면 탑을 누르는
   * 것이 유일한 길이므로, 눌러도 되는 것으로 보이게 해야 한다 — 손가락
   * 모양, 키보드로도 닿는 자리, 읽어 주는 이름까지. */
  $("garden-page").querySelectorAll(".tower").forEach((el) => {
    const goal = goals.find((g) => g.id === el.dataset.goalId);
    if (!goal) return;
    const t = towersOf(goal);
    el.style.cursor = "pointer";
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute(
      "aria-label",
      `${goal.title} — 완성한 탑 ${t.done}채, 지금 탑 ${t.current}/${STONES_PER_TOWER}. 기록 보기`
    );
    const open = () => openDetail(goal);
    el.addEventListener("click", open);
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        open();
      }
    });
  });

  /* 쪽 넘기는 자리. 한 쪽으로 끝나면 아예 두지 않는다 — 대부분의 사람에게는
     넘길 것이 없고, 없는 길을 보여 주면 그것대로 물음이 된다. */
  $("garden-nav").hidden = pages < 2;
  if (pages > 1) {
    $("garden-page-label").textContent = `${gardenPage + 1} / ${pages}`;
    // 첫 쪽에서는 더 최근이 없고, 끝 쪽에서는 더 예전이 없다
    $("garden-next").disabled = gardenPage === 0;
    $("garden-prev").disabled = gardenPage >= pages - 1;
  }

  const stones = totalStones();
  const towers = goals.reduce((s, g) => s + towersOf(g).done, 0);
  /* 그림이 작심을 다 담지 못하는 경우가 있다 — GARDEN_MAX를 넘는 기록(예전에
     만들었거나 가져온 것)이다. 그때 "전부 서 있어요"라고 하면 눈앞에서
     거짓말이 된다. 탑 쪽은 이제 넘기면 다 나오므로 빠지는 것이 없다. */
  const overGoals = goals.length > GARDEN_MAX;
  /* 목록을 없앴으므로, 탑을 눌러 보라는 말을 여기서 한 번 해 준다.
     아무 안내가 없으면 그림이 그냥 그림으로만 보인다. */
  const note = overGoals
    ? `그림에는 앞의 작심 ${GARDEN_MAX}개가 서 있어요.`
    : pages > 1
      ? gardenPage === 0
        ? "옆으로 밀면 그 이전 탑이 나와요."
        : "예전에 세운 탑들이에요."
      : "탑을 누르면 그 기록이 열려요.";
  $("garden-word").textContent =
    goals.length === 0
      ? "작심을 하나 만들면 여기에 첫 탑이 섭니다."
      : towers > 0
        ? `탑 ${towers}채 · 돌 ${stones}개 — ${note}`
        : `돌 ${stones}개를 쌓았어요. ${STONES_PER_TOWER}개가 모이면 탑 한 채가 됩니다.`;
}

/* 쪽을 옮긴다. delta가 +1이면 과거로, -1이면 최근으로. */
function turnGarden(delta) {
  const pages = gardenPageCount(state.goals);
  const next = Math.min(Math.max(gardenPage + delta, 0), pages - 1);
  if (next === gardenPage) return;
  gardenPage = next;
  renderGarden();
  /* 넘어간 것이 보이도록 그림이 들어오는 방향을 준다. 과거로 갈 때는 왼쪽에서,
     최근으로 돌아올 때는 오른쪽에서 — 민 방향과 반대로 들어와야 종이 한 장이
     넘어간 것으로 읽힌다. */
  const page = $("garden-page");
  page.classList.remove("slide-back", "slide-fore");
  // 클래스를 지웠다 바로 붙이면 같은 프레임이라 애니메이션이 다시 돌지 않는다
  void page.offsetWidth;
  page.classList.add(delta > 0 ? "slide-back" : "slide-fore");
  haptic(6);
}

/* 정원을 옆으로 밀어 넘기기.
 *
 * 탑 하나하나가 누르면 열리는 버튼이라, 미는 것과 누르는 것을 갈라야 한다.
 * 손가락이 가로로 충분히(28px) 움직였고 그 움직임이 세로보다 뚜렷할 때만
 * 쪽을 넘기고, 그 경우에는 뒤따라오는 click을 한 번 삼킨다 — 안 그러면
 * 밀어 놓고 손을 뗀 자리의 탑이 함께 열린다. */
function setupGardenSwipe() {
  const page = $("garden-page");
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let swiped = false;

  page.addEventListener("pointerdown", (e) => {
    startX = e.clientX;
    startY = e.clientY;
    tracking = true;
    swiped = false;
  });

  page.addEventListener("pointerup", (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) < 28 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    swiped = true;
    // 왼쪽으로 밀면 다음(예전) 쪽이 따라온다 — 종이를 왼쪽으로 넘기는 것과 같다
    turnGarden(dx < 0 ? 1 : -1);
  });

  page.addEventListener("pointercancel", () => { tracking = false; });

  // 캡처 단계에서 잡아야 탑에 붙은 click보다 먼저 온다
  page.addEventListener(
    "click",
    (e) => {
      if (!swiped) return;
      swiped = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true
  );
}

/* ── 화면 전환 ─────────────────────── */

let currentView = "home";

function switchView(name) {
  currentView = name;
  for (const v of ["home", "garden", "record", "settings"]) {
    $(`view-${v}`).hidden = v !== name;
  }
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.view === name;
    t.classList.toggle("on", on);
    t.setAttribute("aria-current", on ? "page" : "false");
  });
  // 정원은 늘 가장 최근 쪽에서 시작한다 — 예전 쪽을 보다 나갔다 돌아왔을 때
  // 거기 그대로 있으면 "내 탑이 어디 갔지"가 된다
  if (name === "garden") {
    gardenPage = 0;
    renderGarden();
  }
  if (name === "record") renderRecord();
  window.scrollTo({ top: 0 });
  haptic(6);
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    const key = { home: "home", garden: "stone", record: "calendar", settings: "gear" }[tab.dataset.view];
    tab.querySelector(".tab-ico").innerHTML = iconSVG(key, 22);
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  for (const [prefix, get, set, paint] of [
    ["detail", () => detailMonth, (v) => (detailMonth = v), paintDetailCal],
    ["record", () => recordMonth, (v) => (recordMonth = v), paintRecordCal],
  ]) {
    $(`${prefix}-cal-prev`).addEventListener("click", () => {
      set(get() - 1);
      paint();
      haptic(6);
    });
    $(`${prefix}-cal-next`).addEventListener("click", () => {
      if (get() >= 0) return;
      set(get() + 1);
      paint();
      haptic(6);
    });
  }

  // 달력과 같은 손짓으로 — ‹는 과거로, ›는 최근으로
  $("garden-prev").addEventListener("click", () => turnGarden(1));
  $("garden-next").addEventListener("click", () => turnGarden(-1));
  setupGardenSwipe();
}

/* ── 다시 온 순간 ───────────────────────
 *
 * 이 앱이 다른 습관 앱과 갈리는 지점은 '안 끊기게 하는 것'이 아니라
 * '끊긴 뒤에 돌아오게 하는 것'이다. 그런데 오랫동안 완주는 화면을 통째로
 * 쓰는 축하를 받고 돌아온 순간은 토스트 한 줄로 지나갔다. 제품이 말하는
 * 것과 제품이 실제로 보상하는 행동이 어긋나 있던 셈이다.
 *
 * 그렇다고 완주 축하를 한 벌 더 만들지는 않는다. 두 순간의 감정이 다르다 —
 * 완주는 '해냈다'는 성취고 이쪽은 '돌아왔다'는 안도다. 같은 크기로 터뜨리면
 * 둘 다 뭉개지므로, 여기는 아래에서 조용히 올라오는 작은 시트다.
 *
 * 이 시트는 다시 시작하기 **전에** 뜬다. 처음에는 restart를 먼저 하고
 * 알려 주기만 했는데, 그러면 '좋아, 다시 해볼게'라는 버튼이 거짓말이 된다 —
 * 누르기 전에 이미 시작돼 있고, 바깥을 눌러 닫아도 되돌릴 방법이 없다.
 * 복귀가 이 앱에서 가장 중요한 행동이라면 사용자가 실제로 그 순간을 골라야
 * 하므로, 묻고 나서 누른 그때 상태가 바뀐다. 바깥을 누르면 아무 일도
 * 일어나지 않는다.
 *
 * 덕분에 comeback_started도 시트를 본 횟수가 아니라 실제로 다시 시작한
 * 횟수를 세게 됐다. 이 앱의 판정 지표라 그 차이가 크다.
 *
 * 자동으로 사라지게 하지 않은 이유도 같다. 1초 뒤에 지나가면 읽기도 전에
 * 끝나고, 무엇보다 사용자가 아무것도 고르지 않은 것이 된다. */
let returnGoalId = null;
let returnFrom = null;

function askReturn(goal, from) {
  returnGoalId = goal.id;
  returnFrom = from;
  const stones = stoneCount(goal);
  const ch = goalCharacter(goal);
  const { current } = towersOf(goal);
  /* 지금 쌓는 중인 탑을 그대로 보여 준다 — 이 사람이 두고 간 자리가
     그대로 있다는 것이 이 화면이 하는 말의 전부다. 돌이 하나도 없으면
     빈 탑이라도 세운다(막 시작해서 끊긴 사람). */
  $("return-cairn").innerHTML = cairnSVG(current, true, 0, STONES_PER_TOWER, 0, ch);
  $("return-cairn").className = "return-cairn " + ch.toneClass;

  /* 지난 3일과의 관계를 말하지 않는 이유는 안내 넷째 장에 적어 둔 것과 같다.
     이 시트는 두 자리에서 함께 뜬다 — 3일을 채우고 오래 쉰 사람(lapsed)과
     두 칸에서 멈춘 사람(broken). '다음 3일'은 앞엣사람에게만 참이다.
     앞으로 할 일만 말하면 두 사람에게 같은 문장이 맞는다. */
  $("return-word").textContent = stones > 0
    ? `멈춘 건 괜찮아요. 쌓아 둔 돌 ${stones}개는 그대로예요.\n오늘부터 3일이면 돌이 하나 더예요.`
    : "멈춘 건 괜찮아요.\n오늘부터 3일이면 첫 돌이에요.";

  /* 세는 것은 멈춘 횟수가 아니라 돌아온 횟수다.
   *
   * 한동안 '3번 멈췄지만 3번 돌아왔어요'라고 적어 두었는데, 위로하는 모양을
   * 하고서 실패 횟수를 앞세우는 문장이었다. 이 앱이 세기로 한 것은 restarts —
   * '다시 쌓기를 시작한 횟수' 하나뿐이니 문장도 그것만 말하면 된다.
   *
   * 시트가 다시 시작하기 '전에' 뜨므로 이 수는 지난 복귀들을 가리킨다.
   * 그래서 '지금까지'를 붙인다 — 아직 누르지 않은 이번 것까지 세면 거짓말이
   * 되고, 무엇보다 "전에도 해냈잖아"가 지금 필요한 말이다. */
  const back = goal.restarts;
  $("return-count").hidden = back < 1;
  if (back >= 1) $("return-count").textContent = `지금까지 ${back}번 다시 돌아왔어요`;

  const el = $("return");
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("show"));
}

/* 닫기만 한다 — 물어보기만 하고 만 것이므로 아무 일도 일어나지 않는다 */
function closeReturn() {
  const el = $("return");
  el.classList.remove("show");
  setTimeout(() => (el.hidden = true), 220);
  returnGoalId = null;
  returnFrom = null;
}

/* '좋아, 다시 해볼게'를 누른 그때 실제로 다시 시작한다 */
function acceptReturn() {
  const goal = state.goals.find((g) => g.id === returnGoalId);
  const from = returnFrom;
  closeReturn();
  if (!goal) return;
  if (from === "lapsed") nextCycle(goal, "lapsed");
  else restart(goal);
}

/* ── 완주 축하 ─────────────────────── */

/* 돌을 얹은 날의 수 — 같은 날 여러 작심을 해도 하루로 센다 */
function totalDaysWithTower() {
  const days = new Set();
  for (const g of state.goals) for (const d of g.history || []) days.add(d);
  return days.size;
}

function totalStones() {
  return (
    state.goals.reduce((s, g) => s + g.completedCycles, 0) +
    state.goals.filter((g) => g.checks.length >= 3).length
  );
}

function cheerWord(stones, restarts, isFirst) {
  if (isFirst) return "첫 3일을 해냈어요. 이 감각만 기억하면 돼요.";
  // '하나만 더'는 지금 이 순간에만 쓸모 있는 말이라 다른 것보다 앞세운다
  const left = STONES_PER_TOWER - (stones % STONES_PER_TOWER);
  if (left === 1) return "돌 하나만 더 얹으면 이 탑이 완성돼요.";
  if (restarts > 0) return "멈췄다가 다시 쌓은 탑이라, 더 단단해요.";
  if (stones % 10 === 0) return `돌 ${stones}개. 이만큼 쌓은 사람은 흔치 않아요.`;
  return `작심삼일 ${stones}번 = ${stones * 3}일. 이렇게 평생 가는 거예요.`;
}

function showCheer(goal) {
  // 축하는 이 작심의 탑 이야기 — 정원 전체가 아니라 방금 자란 탑을 보여 준다
  const stones = stoneCount(goal);
  const restarts = goal.restarts;
  const days = goal.totalDays;

  // 방금 얹은 돌이 들어간 '지금 그 탑'을 보여 준다. 지금까지 쌓은 돌 전체가
  // 아니라 — 돌 예순 개짜리 탑은 화면에 담기지도 않고, 방금의 성취가
  // 어디에 얹혔는지도 안 보인다.
  const { done: towersDone, current: inTower } = towersOf(goal);
  const ch = goalCharacter(goal);
  // 방금 얹은 돌이 꼭대기에 있는 그 탑을 그대로 보여 준다
  const shownStones = inTower || STONES_PER_TOWER;
  $("cheer-cairn").innerHTML = cairnSVG(shownStones, false, 0, STONES_PER_TOWER, 0, ch);
  $("cheer-cairn").className = "cheer-cairn " + ch.toneClass;
  /* 탑 하나를 다 채운 날은 그냥 넘어가서는 안 되는 날이다.
   * 돌 다섯 개 = 15일 — 이 앱에서 가장 큰 매듭이라 축하도 달라야 한다. */
  const towerDone = inTower === 0 && stones > 0;
  $("cheer-kicker").textContent = towerDone
    ? `돌탑 ${towersDone}채 완성 · ${STONES_PER_TOWER * 3}일`
    : "3일 완주";
  $("cheer-kicker").classList.toggle("big", towerDone);
  $("cheer-title").textContent = towerDone
    ? `탑 하나를 다 쌓았어요`
    : `${ordinal(stones)} 돌을 얹었어요`;
  $("cheer-goal").innerHTML = `<span class="cheer-goal-ico">${iconSVG(goalIcon(goal), 16)}</span>`;
  $("cheer-goal").appendChild(document.createTextNode(goal.title));
  $("cheer-stats").innerHTML =
    `<span>함께한 날 <b>${days}</b></span><span>쌓은 돌 <b>${stones}</b></span>` +
    (restarts ? `<span>다시 쌓음 <b>${restarts}</b></span>` : "");
  $("cheer-word").textContent = towerDone
    ? "다음 돌부터는 이 탑 옆에 새 탑이 섭니다."
    : cheerWord(stones, restarts, stones === 1);

  /* 공유는 자랑할 만한 순간에만 권한다.
   *
   * Wordle이 마케팅비 0원으로 퍼진 이유는 공유물 자체가 유입 경로였기
   * 때문이다. 매번 권하면 소음이 되고 아무도 누르지 않는다. 탑 한 채를
   * 세운 날 — 15일 — 이 이 앱에서 자랑이 성립하는 유일한 순간이다.
   *
   * 예전에는 여기서 버튼 문구를 두 갈래로 나눴는데, 한쪽은 버튼이 숨겨진
   * 상태에서만 쓰이는 문구라 화면에 나온 적이 없었다. 갈래를 지운다. */
  $("cheer-share").hidden = !towerDone;
  $("cheer-share").textContent = "이 탑 자랑하기";

  cheerGoalId = goal.id;
  const el = $("cheer");
  el.hidden = false;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");

  /* 탑 완성은 이 앱에서 가장 큰 매듭이라 촉감도 축하 연출도 3일 완주와
     다르게 둔다 — 조금 더 긴 성공 패턴, 그리고 빛 번짐. */
  if (towerDone) {
    haptic([12, 45, 20, 45, 30]);
    cheerBloom();
    maybeOfferBackup();
  } else {
    haptic([10, 40, 18]);
  }
}

/* 탑 한 채를 완성한 순간에만 켜지는 축하 연출. 완성한 탑 뒤로 빛이 한 번
   번지고(글로) 돌빛 부스러기 몇 개가 천천히 떠오른다(모트). 젠 톤을 지키려
   수를 적게, 느리게 둔다. 요소는 전부 장식이라 aria-hidden으로 붙였다가
   애니메이션이 끝나면 지운다. */
function cheerBloom() {
  if (reduceMotion) return;
  const card = document.querySelector("#cheer .cheer");
  if (!card) return;

  const glow = document.createElement("span");
  glow.className = "cheer-glow";
  glow.setAttribute("aria-hidden", "true");
  card.insertBefore(glow, card.firstChild); // z-index:-1 — 내용 뒤로 깔린다
  setTimeout(() => glow.remove(), 1400);

  for (let i = 0; i < 6; i++) {
    const m = document.createElement("span");
    m.className = "cheer-mote";
    m.setAttribute("aria-hidden", "true");
    m.style.left = 50 + (Math.random() * 2 - 1) * 18 + "%";
    m.style.top = 92 + Math.random() * 24 + "px";
    m.style.setProperty("--mx", (Math.random() * 2 - 1) * 44 + "px");
    m.style.setProperty("--my", -(40 + Math.random() * 34) + "px");
    m.style.animationDelay = i * 0.06 + "s";
    card.appendChild(m); // 마지막 자식 — 탑 앞쪽에 떠오른다
    setTimeout(() => m.remove(), 1600);
  }
}

function closeCheer() {
  const el = $("cheer");
  el.classList.remove("show");
  setTimeout(() => (el.hidden = true), 220);
  $("backup-note").hidden = true;
  cheerGoalId = null;
}

/* 완주한 돌이 카드에서 그 작심의 탑으로 날아가 얹힌다 */
function flyStoneToTower(fromEl, goalId, onLanded) {
  // 착지점 = 그 작심의 탑 꼭대기에 비어 있는 점선 자리
  const tower = document.querySelector(`#hero-garden .tower-current[data-goal-id="${goalId}"]`);
  const slot = tower && tower.querySelector(".building-stone");
  if (!fromEl || !slot || reduceMotion) {
    landStone();
    if (onLanded) onLanded();
    return;
  }

  const from = fromEl.getBoundingClientRect();
  const to = slot.getBoundingClientRect();
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);

  const stone = document.createElement("div");
  stone.className = "flying-stone";
  const goal = state.goals.find((g) => g.id === goalId);
  if (goal) stone.classList.add(goalCharacter(goal).toneClass);
  stone.style.left = from.left + from.width / 2 + "px";
  stone.style.top = from.top + from.height / 2 + "px";
  document.body.appendChild(stone);

  const anim = stone.animate(
    [
      { transform: "translate(-50%, -50%) scale(0.5) rotate(0deg)", opacity: 0.2 },
      {
        transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.45 - 54}px)) scale(1.15) rotate(-8deg)`,
        opacity: 1,
        offset: 0.5,
      },
      {
        transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.85) rotate(3deg)`,
        opacity: 1,
      },
    ],
    { duration: 640, easing: "cubic-bezier(.36,.7,.35,1)", fill: "forwards" }
  );

  anim.onfinish = () => {
    stone.remove();
    landStone(to.left + to.width / 2, to.top + to.height / 2);
    if (onLanded) onLanded();
  };
}

/* 돌이 닿는 순간: 점선 자리가 진짜 돌로 바뀌고, 그 탑이 한 번 눌렸다 편다 */
function landStone(x, y) {
  const grown = heldGoalId;
  heldGoalId = null;
  renderStats();
  bumpTower(grown);
  if (x != null) stoneDust(x, y);
  haptic(18);
}

/* 돌이 얹힌 탑만 눌렸다 펴진다 — 정원의 나머지는 가만히 있는다 */
function bumpTower(goalId) {
  const tower = goalId
    ? document.querySelector(`#hero-garden .tower-current[data-goal-id="${goalId}"]`)
    : $("hero-garden");
  if (!tower) return;
  tower.classList.remove("bump");
  void tower.getBoundingClientRect();
  tower.classList.add("bump");
}

/* 착지 지점에서 흙먼지가 짧게 퍼진다 */
function stoneDust(x, y) {
  if (reduceMotion) return;
  const layer = $("confetti");
  for (let i = 0; i < 14; i++) {
    const p = document.createElement("span");
    p.className = "dust";
    const angle = (Math.PI * (i / 14)) + Math.PI; // 위쪽 반원으로 퍼짐
    const dist = 22 + Math.random() * 30;
    p.style.left = x + "px";
    p.style.top = y + "px";
    p.style.setProperty("--dx", Math.cos(angle) * dist + "px");
    p.style.setProperty("--dy", Math.sin(angle) * dist * 0.7 + "px");
    p.style.animationDelay = Math.random() * 0.08 + "s";
    if (i % 4 === 0) p.classList.add("spark");
    layer.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }
}

/* ── 처음 만나는 안내 ─────────────────
 * 실사용에서 "체크 칸 3개가 곧 돌 3개인 줄 알았다"는 오해가 나왔다.
 * 규칙을 글로만 적지 않고, 각 장에 실제와 같은 그림을 그려 보여 준다.
 *
 * 다섯 장이 한 줄기로 읽히도록 짰다.
 *   3일을 약속한다 → 하루에 한 칸 → 세 칸이 모여 돌 하나 → 돌이 쌓여 탑
 *   → 멈춰도 돌은 남는다
 * 마지막 두 장은 같은 탑(돌 5개)을 같은 자리·같은 크기로 다시 보여 준다.
 * 달라지는 건 '다음 3일' 점선 자리 하나뿐이라, 멈춰도 쌓아 둔 것은
 * 그대로라는 말이 글이 아니라 그림으로 전해진다.
 */

const ONBOARD_SEEN_KEY = "jaksim3.onboarded";

// 안내의 모든 돌탑이 같은 크기로 보이도록 쓰는 공통 틀 (돌 5개 + 점선 자리 높이)
const OB_FRAME_TOP = -136;

function obDots(filled, todayIdx) {
  return (
    `<div class="ob-dots-demo">` +
    [0, 1, 2]
      .map((i) => {
        const cls = i < filled ? "dot done" : i === todayIdx ? "dot today" : "dot";
        return `<span class="${cls}">${i < filled ? "✓" : i + 1}</span>`;
      })
      .join("") +
    `</div>`
  );
}

function obDotsArt(filled, todayIdx, cap) {
  return `<div class="ob-art ob-art-dots">
    <div class="ob-demo">
      ${obDots(filled, todayIdx)}
      <span class="ob-cap">${cap}</span>
    </div>
  </div>`;
}

/* '끊겨도 돌은 그대로'를 한 장의 그림으로.
 *
 * 이 한 줄이 이 앱이 다른 습관 앱과 갈리는 유일한 지점인데, 오래도록
 * 삽화가 그냥 돌탑이었다 — 다음 장과 똑같은 그림이었으니 사실상 주장만
 * 있고 근거는 없는 장이었다. 스트릭 앱을 써 본 사람은 '끊긴다'는 말에서
 * 0으로 돌아가는 장면을 떠올리므로, 안 돌아간다는 것은 말이 아니라
 * 그림으로 보여 줘야 한다.
 *
 * 그래서 끊긴 3일 · 쉼 · 새로 시작한 3일을 한 줄에 늘어놓고, 그 위에
 * 탑을 그대로 세워 둔다. 가운데가 비었는데 위가 안 낮아졌다는 것이
 * 이 장에서 읽혀야 할 전부다.
 *
 * 왼쪽 칸은 둘만 채운다. 한동안 셋을 다 채워 두었는데, 그건 3일을 끝내고
 * 쉰 경우라 이 장이 말하려는 '끊김'이 아니다. 사람이 실제로 멈추는 자리는
 * 두 칸째이고, 그 장면이 무섭지 않다는 걸 보여야 이 장이 일을 한다.
 * 채운 두 칸을 지우지 않고 ✓로 남겨 두는 것도 그래서다 — 못 채웠어도
 * 한 날은 한 날이다. */
function obBreakArt() {
  return `<div class="ob-art ob-art-break">
    <div class="ob-break-stone">${cairnSVG(3, false, 0, 9)}</div>
    <div class="ob-break-line">
      <span class="ob-break-seg">${obDots(2, -1)}</span>
      <span class="ob-break-gap" aria-label="며칠 쉼">쉼</span>
      <span class="ob-break-seg">${obDots(0, 0)}</span>
    </div>
    <span class="ob-cap">비어도 탑은 낮아지지 않아요</span>
  </div>`;
}

/* '칸 세 개 → 돌 하나'를 한 장의 그림으로. 이 앱에서 가장 헷갈리는
 * 규칙이라 글로 설명하지 않고 위아래로 나란히 놓아 보여 준다. */
function obRuleArt() {
  return `<div class="ob-art ob-art-rule">
    <div class="ob-demo">
      ${obDots(3, -1)}
      <span class="ob-cap">3일을 다 채우면</span>
    </div>
    <span class="ob-arrow" aria-hidden="true">↓</span>
    <div class="ob-demo">
      <div class="ob-rule-stone">${cairnSVG(1, false, 0, 9)}</div>
      <span class="ob-cap">돌 하나</span>
    </div>
  </div>`;
}

/* 안내 다섯 장의 순서는 문제 → 방법 → 증거 → 회복 → 시작이다.
 *
 * 예전에는 앞 네 장을 전부 3일 규칙 설명에 쓰고 '쉬어도 돌은 그대로'를
 * 맨 뒤에 붙여 두었다. 그런데 그 한 장이 이 앱이 다른 습관 앱과 갈리는
 * 유일한 지점인데, 하필 가장 안 읽히는 자리에 있었다. 처음 온 사람이
 * "아, 또 매일 체크하는 앱이구나"라고 판단을 끝내기 전에 차이를 보여야 한다.
 *
 * 그래서 회복을 앞으로 당겼다. 다만 맨 앞에 두지는 않았다 — "쌓아 둔 돌은
 * 그대로"라고 말하려면 돌이 무엇인지가 먼저 서 있어야 하기 때문이다.
 *
 * 첫 장은 방법이 아니라 문제로 연다. "약속은 3일치만 / 한 달 계획은 쉽게
 * 무너져요"는 짧게 끊어 하자는 마이크로 습관 앱이 전부 하는 말이라, 그
 * 문장으로 시작하면 첫 줄부터 남들과 같은 자리에 선다. 이 앱이 답하기로 한
 * 물음은 '어떻게 잘게 쪼갤까'가 아니라 '왜 항상 며칠 뒤에 멈추지'다.
 *
 * 다만 규정하는 것은 사람이 아니라 상황이다. "의지가 약해서"가 아니라
 * "루틴은 원래 끊긴다" — 앱이 먼저 사용자에게 라벨을 붙이면 안 된다. */
const ONBOARD = [
  {
    art: () => obDotsArt(0, 0, "3일짜리 약속 하나"),
    title: "루틴은 원래 끊겨요",
    body: "3일쯤 하다 멈추는 건 흔한 일이에요.\n그래서 여기선 <b>약속을 3일치만</b> 합니다.",
  },
  {
    art: () => obDotsArt(2, 2, "이틀째 · 한 칸 남았어요"),
    title: "하루에 한 칸씩",
    body: "오늘 해내면 칸이 하나 채워져요.\n이 <b>세 칸이 이번 3일</b>이에요.",
  },
  {
    art: obRuleArt,
    title: "3일을 채워야 돌 하나",
    body: "칸 세 개는 돌 세 개가 아니라 <b>돌 하나</b>예요.\n3일을 끝낸 날에만 탑이 한 칸 높아져요.",
  },
  {
    art: obBreakArt,
    title: "끊겨도 돌은 그대로",
    /* 지난 3일과의 관계를 말하지 않는다 — 앞으로 할 일만 말한다.
     *
     * '다시 3일'도 '다음 3일'도 '그대로 이어져요'도 다 걸린다. 앞이 어땠는지에
     * 따라 참이 되기도 거짓이 되기도 하기 때문이다. 3일을 다 채우고 쉰
     * 사람에게는 '다음 3일'이 맞지만, 두 칸에서 멈춘 사람에게는 다음도
     * 이어짐도 아니다 — restart()가 checks를 비우므로 그 두 칸은 새 사이클로
     * 넘어오지 않는다. 넘어오는 것은 탑이고, 세 칸은 0부터 다시 센다.
     *
     * 그렇다고 두 칸을 이어받게 할 수는 없다. 하루 하고 한 달 쉬고 이틀 더
     * 해서 돌이 하나가 되면 '3일'이라는 단위가 없어지고, 그러면 이 앱이 세는
     * 것이 그냥 '아무 때나 세 번'이 된다.
     *
     * 그래서 과거를 가리키는 말(다시·다음·이어서)을 아예 빼면, 어느 자리에서
     * 멈췄든 남는 말이 같아진다. 돌아와서 3일을 채우면 된다, 그게 다다. */
    body: "며칠 빠뜨려도 쌓아 둔 돌은 없어지지 않아요.\n<b>돌아와서 3일만 채우면 돼요.</b>",
  },
  {
    art: () => `<div class="ob-art">${cairnSVG(5, true, 0, 9, OB_FRAME_TOP)}</div>`,
    title: "그렇게 계속 이어져요",
    // 120 × 3 = 360일이다. '1년'이라고 쓰면 반올림이 아니라 그냥 틀린 말이다
    body: "3일씩 <b>120번이면 360일</b>이 됩니다.\n연속이 아니어도 괜찮아요.",
    last: true,
  },
];

let obIndex = 0;

function paintOnboard() {
  const page = ONBOARD[obIndex];
  $("ob-body").innerHTML =
    page.art() +
    `<h2 class="ob-title"></h2>` +
    `<p class="ob-text">${page.body.replace(/\n/g, "<br />")}</p>`;
  $("ob-body").querySelector(".ob-title").textContent = page.title;
  $("ob-body").classList.remove("in");
  void $("ob-body").offsetWidth;
  $("ob-body").classList.add("in");

  $("ob-dots").innerHTML = ONBOARD.map(
    (_, i) => `<i class="${i === obIndex ? "on" : ""}"></i>`
  ).join("");
  $("ob-next").textContent = page.last ? "시작하기" : "다음";
  $("ob-skip").hidden = !!page.last;
  // 첫 장에서는 돌아갈 곳이 없다. 자리를 비워 두면 '다음'이 좌우로
  // 튀므로, 버튼은 그대로 두고 눌리지 않게만 한다.
  $("ob-prev").disabled = obIndex === 0;
}

function openOnboard() {
  obIndex = 0;
  $("onboard").hidden = false;
  paintOnboard();
}

function closeOnboard() {
  const first = !localStorage.getItem(ONBOARD_SEEN_KEY);
  $("onboard").hidden = true;
  localStorage.setItem(ONBOARD_SEEN_KEY, "1");
  /* 안내를 막 끝낸 사람은 아직 아무것도 없다. 규칙을 읽은 직후가 만들기
     가장 쉬운 순간이라, 설명에서 곧바로 첫 작심으로 이어 준다. */
  if (first && state.goals.length === 0) setTimeout(() => openModal({ first: true }), 240);
}

/* 안내에서는 진동을 쓰지 않는다. 아직 아무것도 해내지 않은 사람에게
 * 손끝 반응부터 주면 촉감이 '해냈다'는 신호가 아니라 그냥 소음이 된다.
 * 진동은 돌을 얹는 순간을 위해 아껴 둔다. */
function setupOnboard() {
  $("ob-next").addEventListener("click", () => {
    if (obIndex >= ONBOARD.length - 1) {
      closeOnboard();
      return;
    }
    obIndex += 1;
    paintOnboard();
  });
  // 놓친 장을 다시 보러 갈 수 있어야 한다 — 특히 '칸 셋이 돌 하나' 장은
  // 한 번 읽고 넘어가면 다시 볼 방법이 없었다
  $("ob-prev").addEventListener("click", () => {
    if (obIndex === 0) return;
    obIndex -= 1;
    paintOnboard();
  });
  $("ob-skip").addEventListener("click", closeOnboard);
  $("btn-show-onboard").addEventListener("click", () => {
    switchView("home");
    openOnboard();
  });
}

/* ── 바텀시트 ─────────────────────── */

let selectedIcon = ICON_KEYS[0];

function selectIcon(key) {
  selectedIcon = key;
  $("icon-row")
    .querySelectorAll(".icon-option")
    .forEach((el) => el.classList.toggle("selected", el.dataset.icon === key));
}

function setupModal() {
  const row = $("icon-row");
  for (const key of ICON_KEYS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "icon-option" + (key === selectedIcon ? " selected" : "");
    b.dataset.icon = key;
    b.innerHTML = iconSVG(key, 28);
    b.setAttribute("aria-label", ICONS[key].label);
    b.addEventListener("click", () => selectIcon(key));
    row.appendChild(b);
  }

  // 빈 입력창 앞에서 막히지 않도록 추천 문구를 눌러 바로 채운다
  const sug = $("suggest-row");
  for (const s of SUGGESTIONS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "suggest-chip";
    b.textContent = s.title;
    b.addEventListener("click", () => {
      // 한 번 더 누르면 선택이 풀린다 — 잘못 눌렀을 때 지우러 갈 곳이 없으면 답답하다
      const already = $("input-title").value.trim() === s.title;
      $("input-title").value = already ? "" : s.title;
      if (!already) selectIcon(s.icon);
      syncTitleState();
      haptic(6);
    });
    sug.appendChild(b);
  }

  $("input-title").addEventListener("input", syncTitleState);

  // 정원 그림을 누르면 전부 서 있는 정원으로 (탑을 콕 집으면 그 작심 기록으로)
  $("stats").addEventListener("click", () => switchView("garden"));

  $("btn-add").addEventListener("click", () => openModal());
  $("btn-empty-add").addEventListener("click", () => openModal({ first: true }));
  $("btn-cancel").addEventListener("click", closeModal);

  $("form-add").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const title = $("input-title").value.trim();
    if (!title) return;
    if (editingGoalId) {
      const goal = state.goals.find((g) => g.id === editingGoalId);
      if (goal) {
        goal.title = title;
        goal.icon = selectedIcon;
        save();
        render();
        haptic(8);
        toast(selectedIcon, "고쳤어요");
      }
    } else {
      addGoal(title, selectedIcon);
    }
    $("input-title").value = "";
    syncTitleState();
    closeModal();
  });

  setupThemeToggle();
  setupNotifyToggle();
  setupAskNotify();
  setupDevTools();

  $("btn-export").addEventListener("click", exportData);
  $("btn-import").addEventListener("click", () => $("file-import").click());
  $("file-import").addEventListener("change", (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (file) importData(file);
    ev.target.value = ""; // 같은 파일을 다시 골라도 동작하도록
  });

  $("backup-note").addEventListener("click", () => {
    $("backup-note").hidden = true;
    exportData();
  });

  $("detail-close").addEventListener("click", closeDetail);
  $("detail").addEventListener("click", (ev) => {
    if (ev.target === $("detail")) closeDetail();
  });
  $("detail-delete").addEventListener("click", () => {
    const goal = state.goals.find((g) => g.id === detailGoalId);
    closeDetail();
    if (goal) removeGoal(goal);
  });

  $("detail-edit").addEventListener("click", () => {
    const goal = state.goals.find((g) => g.id === detailGoalId);
    if (!goal) return;
    closeDetail();
    openModal({ edit: goal });
  });

  // 잘못 누른 오늘을 지운다. 되돌릴 곳이 늘 같은 자리에 있어야 믿을 수 있다
  $("detail-undo").addEventListener("click", () => {
    const goal = state.goals.find((g) => g.id === detailGoalId);
    if (!goal || !undoToday(goal)) return;
    closeDetail();
    toast("sleep", "오늘 표시를 지웠어요");
  });

  $("cheer-share").addEventListener("click", async (ev) => {
    const goal = state.goals.find((g) => g.id === cheerGoalId);
    if (!goal) return;
    // 누른 것까지만 센다. 실제로 어디에 올렸는지는 OS가 알려 주지도 않는다
    track("share_tapped");
    const btn = ev.currentTarget;
    btn.disabled = true;
    try {
      const built = towersOf(goal);
      const res = await shareCard({
        kicker: built.current === 0 && stoneCount(goal) > 0
          ? `돌 탑   ${built.done} 채   완 성`
          : "3 일   완 주",
        inTower: built.current || STONES_PER_TOWER,
        title: built.current === 0 && stoneCount(goal) > 0
          ? `${STONES_PER_TOWER * 3}일을 쌓았어요`
          : `${ordinal(stoneCount(goal))} 돌을 얹었어요`,
        goalTitle: goal.title,
        stones: stoneCount(goal),
        days: goal.totalDays,
        restarts: goal.restarts,
        word: cheerWord(stoneCount(goal), goal.restarts, stoneCount(goal) === 1),
        dateKey: todayStr(),
      });
      if (res.ok && res.how !== "cancelled") toast("stone", "이 순간을 이미지로 저장했어요");
    } catch (e) {
      toast("stone", "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요");
    } finally {
      btn.disabled = false;
    }
  });

  $("cheer-close").addEventListener("click", closeCheer);
  $("cheer-next").addEventListener("click", () => {
    const goal = state.goals.find((g) => g.id === cheerGoalId);
    closeCheer();
    if (goal) nextCycle(goal);
  });

  $("return-ok").addEventListener("click", acceptReturn);
  // 바깥을 눌러도 닫힌다 — 붙잡아 두는 화면이 아니다
  $("return").addEventListener("click", (ev) => {
    if (ev.target === $("return")) closeReturn();
  });
}

/* 알림은 앱으로 감쌌을 때만 의미가 있으므로 그때만 노출한다 */
/* 화면 밝기 — 기기 설정을 따를지, 밝게/어둡게 고정할지.
 *
 * 기기 설정만 따르게 두면 낮에도 어두운 화면을 좋아하는 사람, 밤에도
 * 밝은 화면이 편한 사람이 갈 곳이 없다. 앱 안에서 따로 정할 수 있어야 한다.
 * 실제 색을 입히는 일은 <head>의 applyTheme가 하고, 여기서는 고른 값을
 * 저장하고 화면 상태만 맞춘다. */
const THEME_LABEL = {
  auto: "기기 설정을 따라가요",
  light: "언제나 밝은 화면으로",
  dark: "언제나 어두운 화면으로",
};

function themePref() {
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" ? v : "auto";
}

function setupThemeToggle() {
  const seg = $("theme-seg");
  if (!seg) return;

  const paint = () => {
    const pref = themePref();
    seg.querySelectorAll(".seg-item").forEach((el) => {
      const on = el.dataset.themePref === pref;
      el.classList.toggle("on", on);
      el.setAttribute("aria-checked", on ? "true" : "false");
    });
    /* '기기 설정 따르기'가 기본값이다. 그래서 어두운 폰에서는 앱도 어둡게
       열리는데, 그걸 "왜 어두운 게 기본이지?"로 읽는 사람이 있었다.
       지금 어느 쪽으로 풀렸는지를 함께 적어 두면 물어볼 일이 없다. */
    $("theme-sub").textContent =
      pref === "auto"
        ? `${THEME_LABEL.auto} · 지금은 ${document.documentElement.dataset.theme === "dark" ? "어두움" : "밝음"}`
        : THEME_LABEL[pref];
  };
  paint();
  // 기기가 해질녘에 알아서 어두워지면 설명도 같이 따라가야 한다
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (themePref() === "auto") setTimeout(paint, 0);
  });

  seg.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".seg-item");
    if (!btn || btn.dataset.themePref === themePref()) return;
    localStorage.setItem(THEME_KEY, btn.dataset.themePref);
    applyTheme();
    paint();
    haptic(6);
    // 돌탑은 CSS 변수로 색을 받으므로 알아서 따라오지만,
    // 네이티브 상태바는 따로 알려 줘야 같이 바뀐다
    if (typeof applyStatusBarTheme === "function") applyStatusBarTheme();
  });
}

/* ── 알림을 권하는 순간 ─────────────────
 *
 * 이 앱에만 있는 기능은 '돌아올 명분을 주는 알림'이다. 며칠 쉰 사람에게
 * "쌓아 둔 돌 3개는 그대로예요" 하고 말을 거는 것 — 다른 습관 앱은 연속
 * 기록이 끊긴 사용자에게 할 말이 없지만 이 앱은 그 순간을 위해 만들어졌다.
 *
 * 그런데 그게 설정 탭 안 토글로만 켜졌다. 설정에 들어가는 사람은 드물다.
 * 제품의 심장이 기본값 꺼짐에, 발견되지도 않는 자리에 있었던 셈이다.
 *
 * 그래서 첫 체크인 직후에 묻는다. 방금 뭔가를 해낸 순간이라 동기가
 * 가장 높고, 왜 필요한지가 설명 없이도 통하는 유일한 자리다.
 * OS 권한 창을 바로 띄우지 않는 이유: 한 번 거절당하면 다시 물을 수 없다.
 * 먼저 우리 화면으로 이유를 말하고, '네'를 누른 사람에게만 진짜로 묻는다.
 *
 * 뜨는 조건을 한자리에 적어 둔다 (shouldAskNotify):
 *   1. 앱으로 감싼 상태일 것 — 웹에는 예약할 알림이 없다
 *   2. 아직 한 번도 안 물었을 것 (jaksim3.notifyAsked)
 *   3. 알림이 아직 꺼져 있을 것
 * 세 가지가 다 맞으면, 체크한 뒤 토스트가 지나가고 2.6초(돌을 완성한
 * 날은 3.2초) 뒤에 한 번 뜬다. 네든 아니요든 그걸로 끝이고, 이후로는
 * 설정에서만 켜고 끈다.
 */
const NOTIFY_ASKED_KEY = "jaksim3.notifyAsked";

function shouldAskNotify() {
  if (typeof IS_NATIVE === "undefined" || !IS_NATIVE) return false;
  if (localStorage.getItem(NOTIFY_ASKED_KEY)) return false;
  return !notifyEnabled();
}

function askNotify() {
  if (!shouldAskNotify()) return;
  /* 축하 화면이 떠 있으면 그 뒤에 깔려 보이지도 않은 채 '물어봤다'로
     기록된다 — 다시 물을 수 없는 질문이라 그건 잃는 것이다. 축하가
     걷힐 때까지 기다린다. */
  if (!$("cheer").hidden) {
    setTimeout(askNotify, 900);
    return;
  }
  localStorage.setItem(NOTIFY_ASKED_KEY, "1");
  // 시간 계산이 어긋나도 토스트가 버튼을 가리지 않도록 확실히 걷는다
  $("toast").hidden = true;
  $("ask-notify-time").textContent =
    `${friendlyTime(notifyHour(), notifyMinute())} · 언제든 바꿀 수 있어요`;
  $("ask-notify").hidden = false;
}

function closeAskNotify() {
  $("ask-notify").hidden = true;
}

function setupAskNotify() {
  const sheet = $("ask-notify");
  if (!sheet) return;

  $("ask-notify-yes").addEventListener("click", async () => {
    const ok = await setNotifyEnabled(true);
    closeAskNotify();
    toast(ok ? "stone" : "sleep",
      ok ? `${friendlyTime(notifyHour(), notifyMinute())}에 알려드릴게요` : "설정에서 언제든 다시 켤 수 있어요");
  });

  // 거절도 존중한다 — 다시 묻지 않고, 설정에 자리는 남겨 둔다
  $("ask-notify-no").addEventListener("click", () => {
    closeAskNotify();
    toast("sleep", "알림 없이 갈게요. 설정에서 언제든 켤 수 있어요");
  });
}

/* ── 개발자 도구 ────────────────────
 * 이 앱은 '며칠째인가'로 돌아간다. 그래서 돌이 정말 쌓이는지 눈으로
 * 확인하려면 사흘을 기다려야 하고, 무너지는 흐름을 보려면 더 걸린다.
 * 확인할 수 없는 것은 고칠 수도 없으니 날짜를 밀 수단을 둔다.
 *
 * 안드로이드가 빌드 번호를 다루는 방식을 따랐다 — 정보 줄을 다섯 번
 * 누르면 열린다. 평소에는 눈에 띄지 않고, 찾는 사람은 찾을 수 있다.
 */
function setupDevTools() {
  const about = $("row-about");
  const card = $("dev-card");
  const banner = $("dev-banner");
  if (!about || !card || !banner) return;

  const build = window.BUILD || { channel: "dev", commit: "" };

  /* 어느 빌드가 깔렸는지 여기서 바로 보인다. "그 기능이 없다"는 말을 들었을 때
   * 제일 먼저 확인해야 하는 것이 '그게 든 빌드가 맞느냐'인데, 그동안은
   * 앱 안에서 확인할 길이 없었다. */
  if (build.commit) {
    $("about-sub").textContent = `기록은 이 기기에만 저장돼요 · v1.0 · ${build.commit}`;
  }

  /* 테스트하라고 만든 빌드에서 테스트 도구를 숨겨 두는 건 앞뒤가 맞지 않는다.
   * 스토어에 올리는 빌드(release)에서만 숨기고, 그때도 정보 줄을 다섯 번
   * 누르면 열린다 — 안드로이드가 빌드 번호를 다루는 방식과 같다. */
  const openly = build.channel !== "release";
  if (openly) card.hidden = false;

  let taps = 0;
  let tapTimer = null;

  const paintBanner = () => {
    const shift = devDays();
    banner.hidden = shift === 0;
    if (shift !== 0) {
      const when = shift > 0 ? `${shift}일 뒤` : `${-shift}일 전`;
      banner.textContent = `개발자 모드 · 앱이 ${when}(${todayStr()})라고 믿는 중 — 눌러서 원래대로`;
    }
    $("dev-sub").textContent =
      shift === 0
        ? "돌이 실제로 쌓이는지 하루를 넘겨 가며 확인해요"
        : `지금 ${todayStr()} 기준으로 돌아가고 있어요`;
  };
  paintBanner();

  // 날짜를 밀면 화면 전체가 다시 판단돼야 한다
  const refresh = () => {
    paintBanner();
    render();
    renderRecord();
  };

  about.addEventListener("click", () => {
    if (openly) {
      // 대놓고 보이는 빌드에서는 접었다 폈다 하는 스위치로만 쓴다
      card.hidden = !card.hidden;
      haptic(6);
      return;
    }
    taps += 1;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => (taps = 0), 1500);
    if (taps < 5) {
      if (taps >= 3) toast("stone", `${5 - taps}번 더 누르면 개발자 도구가 열려요`);
      return;
    }
    taps = 0;
    card.hidden = !card.hidden;
    haptic(6);
    if (!card.hidden) card.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  banner.addEventListener("click", () => {
    setDevDays(0);
    refresh();
    toast("sun", "원래 날짜로 돌아왔어요");
  });

  $("dev-next-day").addEventListener("click", () => {
    setDevDays(devDays() + 1);
    refresh();
    haptic(8);
    toast("stone", `${todayStr()} — 하루 보냈어요`);
  });

  $("dev-prev-day").addEventListener("click", () => {
    setDevDays(devDays() - 1);
    refresh();
    haptic(8);
    toast("stone", `${todayStr()} — 하루 되돌렸어요`);
  });

  // 오늘 남은 작심을 한 번에 해낸다 (돌이 완성되면 축하 화면까지 그대로 뜬다)
  $("dev-check-all").addEventListener("click", () => {
    const todo = state.goals.filter((g) => {
      const st = goalStatus(g);
      return (st === "fresh" || st === "active") && !checkedToday(g);
    });
    if (!todo.length) {
      toast("sleep", "오늘 남은 작심이 없어요");
      return;
    }
    switchView("home");
    // 마지막 하나만 애니메이션·축하를 그대로 보여 준다
    todo.slice(0, -1).forEach((g) => checkToday(g, { silent: true }));
    checkToday(todo[todo.length - 1]);
  });

  /* 3일을 한 바퀴 돌린다 — 돌 하나가 실제로 얹히는지 가장 빠르게 보는 길.
   * 하루를 밀고 체크하는 것을 세 번 반복하되, 마지막 날만 애니메이션과
   * 축하를 그대로 태워야 '얹히는 순간'을 볼 수 있다. */
  $("dev-run-cycle").addEventListener("click", async () => {
    const goal = state.goals.find((g) => {
      const st = goalStatus(g);
      return st === "fresh" || st === "active";
    });
    if (!goal) {
      toast("stone", "진행 중인 작심이 없어요. '연습용 작심 넣기'를 먼저 눌러 주세요");
      return;
    }
    switchView("home");
    const left = 3 - goal.checks.length;
    for (let i = 0; i < left; i++) {
      if (checkedToday(goal)) {
        setDevDays(devDays() + 1);
        paintBanner();
      }
      const last = i === left - 1;
      checkToday(goal, { silent: !last });
      if (!last) await new Promise((r) => setTimeout(r, 700));
    }
    paintBanner();
  });

  $("dev-seed").addEventListener("click", () => {
    // 돌 셋을 쌓고 한 번 무너졌다 돌아온 사람 — 정원이 어떻게 보이는지 확인용
    const history = [];
    for (let d = 14; d >= 6; d--) history.push(todayStr(-d));
    state.goals.push({
      id: "dev" + Date.now().toString(36),
      title: "연습용 · 아침에 물 한 잔",
      icon: "water",
      createdAt: now().toISOString(),
      checks: [],
      history,
      lastCheckDate: todayStr(-6),
      totalDays: history.length,
      completedCycles: 3,
      restarts: 1,
    });
    save();
    switchView("home");
    refresh();
    toast("water", "돌 3개짜리 연습용 작심을 넣었어요");
  });

  /* 알림이 오는지 확인하는 가장 빠른 길. 저녁 9시까지 기다려 볼 수는 없고,
     안 오는 이유는 대개 앱이 아니라 기기 설정(알림 차단·절전)에 있다. */
  $("dev-test-notify").addEventListener("click", async () => {
    if (typeof sendTestNotification !== "function") {
      toast("sleep", "앱으로 설치했을 때만 확인할 수 있어요");
      return;
    }
    const ok = await sendTestNotification(5);
    toast(ok ? "stone" : "sleep", ok ? "5초 뒤에 알림이 옵니다" : "알림 권한이 없어요");
  });

  /* 매일 알림이 실제로 몇 통 예약됐는지, 실패했다면 왜인지.
     "테스트 알림은 오는데 매일 알림은 안 온다"를 이걸로 잡았다. */
  $("dev-notify-state").addEventListener("click", async () => {
    if (typeof rescheduleNotifications !== "function") {
      toast("sleep", "앱으로 설치했을 때만 확인할 수 있어요");
      return;
    }
    await rescheduleNotifications();
    const d = typeof notifyDebug === "object" ? notifyDebug : { tried: 0, scheduled: 0, error: "" };
    toast(
      d.scheduled ? "stone" : "sleep",
      d.error
        ? `${d.tried}통 중 ${d.scheduled}통 · ${d.error}`.slice(0, 120)
        : `${d.tried}통 넣어 ${d.scheduled}통 예약됨`
    );
  });

  $("dev-reset").addEventListener("click", () => {
    if (!confirm("날짜를 원래대로 돌리고 기록을 전부 지울까요?\n(개발자 도구 전용 — 되돌릴 수 없어요)")) return;
    setDevDays(0);
    state.goals = [];
    save();
    refresh();
    toast("stone", "처음 상태로 돌아왔어요");
  });
}

/* 알림 시각은 몇 개 중에 고르는 게 아니라 분 단위로 자유롭게 정한다.
 * 사람마다 하루가 끝나는 시각이 다르고(교대 근무, 새벽형), 알림은 그
 * 시각에 맞아야만 잔소리가 아니라 도움이 된다. 입력은 OS 시계 다이얼을
 * 그대로 띄우는 <input type="time">에 맡기고, 화면에는 '밤 9시 30분'처럼
 * 사람 말로 적어 둔다. */
function setupNotifyToggle() {
  const row = $("notify-row");
  const btn = $("btn-notify");
  const hourRow = $("notify-hour-row");
  const timeInput = $("notify-hour");
  if (!row || !btn || typeof IS_NATIVE === "undefined" || !IS_NATIVE) return;

  row.hidden = false;
  hourRow.hidden = false;
  timeInput.value = timeValue(notifyHour(), notifyMinute());

  const label = () => friendlyTime(notifyHour(), notifyMinute());

  /* 예약이 진짜로 잡혔는지를 화면에 적는다.
     "알림이 안 온다"를 확인할 방법이 앱 안에 없어서, 켜 두면 온다고 믿는
     수밖에 없었다. 다음 알림 시각이 보이면 그것만으로 절반은 진단이 된다. */
  const showNext = async () => {
    if (!notifyEnabled() || typeof nextNotificationAt !== "function") return;
    const at = await nextNotificationAt();
    if (!notifyEnabled()) return;
    $("notify-sub").textContent = at
      ? `다음 알림 · ${at.getMonth() + 1}월 ${at.getDate()}일 ${friendlyTime(at.getHours(), at.getMinutes())}`
      : "예약된 알림이 없어요 — 껐다 켜 보세요";
  };

  const paint = () => {
    const on = notifyEnabled();
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-checked", on ? "true" : "false");
    hourRow.classList.toggle("off", !on);
    $("notify-hour-label").textContent = label();
    $("notify-sub").textContent = on
      ? `${label()}에 조용히 알려드려요`
      : "정해둔 시각에 한 번만 알려드려요";
    showNext();
  };
  paint();

  btn.addEventListener("click", async () => {
    const turningOn = !notifyEnabled();
    const ok = await setNotifyEnabled(turningOn);
    paint();
    if (turningOn && !ok) {
      toast("stone", "설정에서 알림을 허용해 주세요");
    } else if (turningOn) {
      toast("stone", `${label()}에 알려드릴게요`);
    }
  });

  // 투명하게 겹쳐 둔 입력창을 눌렀을 때 시계가 확실히 열리도록
  hourRow.querySelector(".time-pick").addEventListener("click", () => {
    if (typeof timeInput.showPicker !== "function") return;
    try {
      timeInput.showPicker();
    } catch (e) {
      /* 브라우저가 막으면 기본 동작에 맡긴다 */
    }
  });

  timeInput.addEventListener("change", async () => {
    const t = parseTimeValue(timeInput.value);
    // 시계를 열었다가 비운 채로 닫으면 빈 값이 온다 — 쓰던 시각을 지킨다
    if (!t) {
      timeInput.value = timeValue(notifyHour(), notifyMinute());
      return;
    }
    setNotifyTime(t.h, t.m);
    paint();
    if (notifyEnabled()) {
      await rescheduleNotifications();
      toast("stone", `${label()}로 옮겼어요`);
    }
  });
}

/* ── 인트로 ──────────────────────────
 * 돌이 하나씩 내려앉는 걸 보고 시작한다. 매일 여러 번 여는 앱이라
 * 길면 방해가 되므로 짧게 두고, 아무 데나 누르면 바로 건너뛴다.
 */
function setupIntro() {
  const el = $("intro");
  if (!el) return;
  let done = false;
  const dismiss = () => {
    if (done) return;
    done = true;
    el.classList.add("gone");
    setTimeout(() => el.remove(), 500);

    /* 인트로가 끝나면 사용법부터 보여 준다.
     *
     * 한동안은 반대로 했다 — 읽을거리를 세워 두면 첫 세션에서 떠난다는
     * 걱정에 곧바로 '무엇을 3일 해볼까요?'를 띄웠다. 그런데 실제로 써 보니
     * 규칙을 모른 채 목표부터 만들게 되고, 3일에 돌 하나라는 이 앱의 유일한
     * 규칙을 알려 줄 자리가 계속 어정쩡해졌다. 만든 뒤에 띄워도 봤지만
     * 그건 그것대로 '만들자마자 읽으라고 한다'가 된다.
     *
     * 다섯 장은 그림 위주라 넘기는 데 오래 걸리지 않고, 건너뛰기도 있다.
     * 안내가 끝나면 그 자리에서 바로 첫 작심을 만들게 이어 준다. */
    if (!localStorage.getItem(ONBOARD_SEEN_KEY)) {
      setTimeout(openOnboard, 160);
    }
  };
  el.addEventListener("click", dismiss);
  setTimeout(dismiss, reduceMotion ? 300 : 2300);
}

/* 열려 있는 시트 중 가장 위의 것을 닫는다.
 * 안드로이드 뒤로가기와 ESC가 같은 규칙을 쓰도록 한곳에 모아 둔다. */
function closeTopLayer() {
  if (!$("return").hidden) {
    closeReturn();
    return true;
  }
  if (!$("ask-notify").hidden) {
    closeAskNotify();
    return true;
  }
  if (!$("onboard").hidden) {
    closeOnboard();
    return true;
  }
  if (!$("cheer").hidden) {
    closeCheer();
    return true;
  }
  if (!$("detail").hidden) {
    closeDetail();
    return true;
  }
  if (!$("modal").hidden) {
    closeModal();
    return true;
  }
  return false;
}

/* 열자마자 키보드를 올리지 않는다.
 *
 * 예전에는 시트가 올라온 뒤 키보드를 자동으로 띄웠는데, 화면 아래에
 * 붙어 있는 시트가 키보드에 밀려 다시 튀어 오르면서 열 때마다 화면이
 * 두 번 덜컹였다. 게다가 첫 화면이 빈 입력창과 커서라 '뭐라고 써야 하지'
 * 앞에서 멈추게 된다.
 *
 * 그래서 두 가지를 바꿨다. 하나, 약속 버튼을 시트 바닥에 고정한다 —
 * 키보드가 올라와도 버튼은 키보드 바로 위에 그대로 있다. 둘, 추천 칩을
 * 먼저 둔다. 칩 하나를 누르면 제목과 아이콘이 함께 채워져서 키보드를 아예
 * 만나지 않고도 작심을 만들 수 있다. 직접 쓰고 싶은 사람만 입력창을
 * 누르면 된다.
 *
 * (한동안은 화면을 통째로 쓰기도 했는데, 그러면 아이콘 줄 아래가 텅 비어
 * 보였다. 지금은 내용만큼만 높이를 갖는다.) */
/* editingGoalId가 있으면 이 시트는 '만들기'가 아니라 '고치기'다.
 *
 * 고치는 길이 없던 동안에는 제목에 오타 하나만 나도 지우고 다시 만들어야
 * 했고, 그러면 쌓은 돌이 전부 사라졌다. 100일을 쌓은 사람이 그걸 만나면
 * 그날로 앱을 지운다. 만드는 화면과 고치는 화면이 같은 이유는, 같은 것을
 * 정하는 자리이므로 두 벌을 두면 반드시 한쪽만 고쳐지기 때문이다. */
let editingGoalId = null;

function openModal(opts = {}) {
  const edit = opts.edit || null;
  /* 자리가 없는데 시트부터 열면, 제목을 다 적고 아이콘까지 고른 뒤에야
     안 된다는 말을 듣는다. 열기 전에 말한다. 고치기는 자리와 무관하므로
     막지 않는다. */
  if (!edit && goalsAtCap()) {
    toast("stone", `작심은 한 번에 ${GARDEN_MAX}개까지예요. 하나를 지우면 자리가 나요`);
    return;
  }
  editingGoalId = edit ? edit.id : null;
  selectIcon(edit ? goalIcon(edit) : ICON_KEYS[0]);
  $("input-title").value = edit ? edit.title : "";
  syncTitleState();
  /* 처음 여는 사람에게는 '새 작심'이 아니라 질문으로 말을 건다.
   *
   * 예전 물음은 "무엇을 3일 해볼까요?"였는데, 그러면 3일짜리 도전을 고르는
   * 것처럼 읽힌다. 그 자리에 '취업하기'나 '토익 900점'을 적어 넣어도 이상하지
   * 않고, 그 순간 이 앱이 목표 관리 앱인지 투두인지 모호해진다. 담는 것은
   * 목표가 아니라 매일 반복하고 싶은 행동 하나라는 게 물음에서 드러나야 한다. */
  $("modal-title").textContent = edit
    ? "작심 수정하기"
    : opts.first
      ? "매일 하고 싶은 일이 있나요?"
      : "새 작심";
  $("modal-sub").textContent = edit
    ? "이름과 아이콘만 바뀌어요. 쌓은 돌은 그대로입니다."
    : opts.first
      ? "운동, 공부, 작업처럼 매일 반복할 것 하나면 충분해요."
      : "매일 반복하고 싶은 것 하나면 돼요.";
  $("btn-submit-goal").textContent = edit ? "수정하기" : "3일 약속하기";
  // 고칠 때는 추천 칩 덩어리를 통째로 감춘다 — 이미 정한 것을 고르는 자리가 아니다
  $("suggest-field").hidden = !!edit;
  $("btn-cancel").hidden = !!opts.first;
  $("modal").hidden = false;
  document.body.classList.add("sheet-open");
  const scroll = $("sheet-scroll");
  if (scroll) {
    scroll.scrollTop = 0;
    // 실제로 넘칠 때에만 바닥 경계선을 긋는다 (레이아웃이 잡힌 뒤에 잰다)
    requestAnimationFrame(() => {
      scroll.closest(".sheet-page").classList.toggle("scrolls", scroll.scrollHeight > scroll.clientHeight + 1);
    });
  }
}

function closeModal() {
  $("input-title").blur();
  $("modal").hidden = true;
  editingGoalId = null;
  document.body.classList.remove("sheet-open");
}

/* 제목이 있어야 약속 버튼이 열린다 — 빈 채로 눌러 아무 일도 안 일어나는
 * 경험보다, 버튼이 조용히 살아나는 편이 낫다. */
function syncTitleState() {
  const value = $("input-title").value.trim();
  $("btn-submit-goal").disabled = !value;
  $("title-count").textContent = `${$("input-title").value.length}/30`;
  $("suggest-row")
    .querySelectorAll(".suggest-chip")
    .forEach((el) => el.classList.toggle("on", el.textContent === value));
}

/* ── 시작 ─────────────────────────── */

setupModal();
setupTabs();
setupOnboard();
setupIntro();
render();

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") closeTopLayer();
});

// 자정을 넘겨 열어둔 화면도 날짜에 맞게 갱신
setInterval(() => {
  if (document.visibilityState === "visible") render();
}, 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") render();
});
