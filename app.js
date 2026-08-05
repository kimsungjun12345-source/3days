/* 작심삼일 — 3일마다 돌 하나, 무너지면 다시 쌓는 습관 앱 */

const STORAGE_KEY = "jaksim3.v1";

const DAY_KO = ["첫째", "둘째", "셋째"];

const ORDINAL_KO = [
  "첫", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열",
  "열한", "열두", "열세", "열네", "열다섯",
];

function ordinal(n) {
  return (ORDINAL_KO[n - 1] || n) + " 번째";
}

/* 처음 온 사람이 빈 입력창 앞에서 멈추지 않도록 */
const SUGGESTIONS = [
  { title: "아침에 물 한 잔", icon: "water" },
  { title: "10분 걷기", icon: "run" },
  { title: "자기 전 스트레칭", icon: "meditate" },
  { title: "책 10쪽 읽기", icon: "book" },
  { title: "일기 세 줄 쓰기", icon: "pen" },
  { title: "12시 전에 눕기", icon: "sleep" },
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

function addGoal(title, icon) {
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
    restarts: 0,
  };
  state.goals.push(goal);
  newGoalId = goal.id;
  save();
  render();
  haptic(10);
  toast(icon, "약속했어요. 딱 3일만 가봐요!");
}

function checkToday(goal, opts = {}) {
  if (checkedToday(goal) || goal.checks.length >= 3) return;
  goal.checks.push(todayStr());
  if (!goal.history.includes(todayStr())) goal.history.push(todayStr());
  goal.lastCheckDate = todayStr();
  goal.totalDays += 1;

  // 방금 채워진 칸과 완주 여부를 렌더 후 애니메이션에 넘긴다
  const completed = goal.checks.length === 3;
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
  haptic(10);
  // 완성한 날 바로 누르면 오늘은 이미 카운트됐으므로 내일부터 첫째 날
  if (!checkedToday(goal)) {
    checkToday(goal, { silent: true });
    // 쉬다가 돌아온 사람에게는 다른 인사가 필요하다
    toast("stone", from === "lapsed" ? "돌아왔네요. 그거면 충분해요" : "또 하나 쌓기 시작!");
  } else {
    save();
    render();
    toast("sleep", "내일 첫 칸부터 시작해요");
  }
}

/* 끊긴 뒤 다시 쌓기 — 쌓은 날은 유지, 사이클만 새로 */
function restart(goal) {
  goal.restarts += 1;
  goal.checks = [];
  haptic(10);
  if (!checkedToday(goal)) {
    checkToday(goal, { silent: true });
  } else {
    save();
    render();
  }
  toast("run", `다시 쌓기 ${goal.restarts}번째. 이게 진짜 실력이에요`);
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
  return `<radialGradient id="stoneSide-${uid}" cx="33%" cy="20%" r="92%">
    <stop offset="0%" stop-color="var(--stone-side-1)"/>
    <stop offset="34%" stop-color="var(--stone-side-2)"/>
    <stop offset="72%" stop-color="var(--stone-side-3)"/>
    <stop offset="100%" stop-color="var(--stone-side-4)"/>
  </radialGradient>
  <radialGradient id="stoneTop-${uid}" cx="32%" cy="24%" r="86%">
    <stop offset="0%" stop-color="var(--stone-top-1)"/>
    <stop offset="46%" stop-color="var(--stone-top-2)"/>
    <stop offset="100%" stop-color="var(--stone-top-3)"/>
  </radialGradient>
  <filter id="softShadow-${uid}" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="2.2"/>
  </filter>
  <filter id="groundShadow-${uid}" x="-60%" y="-120%" width="220%" height="340%">
    <feGaussianBlur stdDeviation="3.4"/>
  </filter>`;
}

/* 돌 하나 — 납작한 조약돌을 위에서 비스듬히 본 모습.
 * 같은 타원을 두께(t)만큼 아래에 한 번 더 깔아 측면이 초승달처럼 드러나게 하고,
 * 그 위에 밝은 윗면을 얹는다. 이 두께가 있어야 쌓인 것으로 보인다. */
function stonePiece(cx, cy, rx, ry, tilt, uid) {
  const t = ry * 0.66;
  const rot = `rotate(${tilt} ${cx} ${cy})`;
  return `<g transform="${rot}">
    <ellipse cx="${(cx + rx * 0.09).toFixed(1)}" cy="${(cy + t + ry * 0.42).toFixed(1)}"
      rx="${(rx * 0.95).toFixed(1)}" ry="${(ry * 0.52).toFixed(1)}"
      fill="var(--stone-shadow)" filter="url(#softShadow-${uid})"/>
    <ellipse cx="${cx.toFixed(1)}" cy="${(cy + t).toFixed(1)}"
      rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#stoneSide-${uid})"/>
    <ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}"
      rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#stoneTop-${uid})"/>
    <ellipse cx="${(cx - rx * 0.26).toFixed(1)}" cy="${(cy - ry * 0.32).toFixed(1)}"
      rx="${(rx * 0.28).toFixed(1)}" ry="${(ry * 0.24).toFixed(1)}"
      fill="var(--stone-shine)"/>
  </g>`;
}

/* ── 돌탑 정원 ────────────────────────
 * 작심 하나가 탑 하나. 홈에는 그 탑들이 원근을 두고 함께 서 있다.
 * 앞쪽 탑은 크고 진하게, 뒤쪽 탑은 작고 흐리게 — 뒤로 갈수록 공기에
 * 잠기는 것처럼 보이게 해서 정원처럼 읽히게 한다.
 */

/* 바닥 중심을 원점으로 위로 쌓는 돌 무더기 */
function stoneStack(stones, building, max = MAX_STONES, ghost = 0, uid = 0) {
  const shown = Math.min(stones, max);
  let y = -4;
  let rx = 40;
  let ry = 13.5;
  let top = 0;
  // 바닥 그림자는 마지막에 앞쪽으로 끼워 넣는다 — 크기가 실제로 서 있는
  // 것의 발 너비를 따라야 하는데, 그건 다 그려 보기 전에는 알 수 없다.
  // 늘 같은 크기로 두면 돌이 하나도 없는 탑에서 그림자만 커다랗게 남아
  // 정원이 얼룩 하나처럼 보인다.
  const parts = [];
  let foot = 0;

  for (let i = 0; i < shown; i++) {
    y -= ry * 1.5;
    const tilt = i % 2 === 0 ? -1.6 : 1.7;
    const cx = i % 2 === 0 ? -1.5 : 1.5;
    parts.push(stonePiece(cx, y, rx, ry, tilt, uid));
    foot = Math.max(foot, rx);
    top = Math.min(top, y - ry);
    y -= ry * 0.4;
    rx *= 0.85;
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
    rx *= 0.85;
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
    const by = y - ry * 1.3;
    const brx = Math.max(rx * 0.92, 15);
    const bry = Math.max(ry * 0.88, 6);
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

  return { markup: parts.join("\n"), top };
}

/* 탑이 설 자리 — 앞에서 뒤로, 좌우로 흩어지게 미리 잡아 둔 구도 */
const GARDEN_SPOTS = [
  { x: 0.5, depth: 0 },
  { x: 0.21, depth: 0.52 },
  { x: 0.79, depth: 0.44 },
  { x: 0.36, depth: 0.88 },
  { x: 0.65, depth: 0.98 },
  { x: 0.12, depth: 0.78 },
];

const GARDEN_MAX = GARDEN_SPOTS.length;

function gardenSVG(goals) {
  const W = 340;
  const H = 152;
  const groundY = 132;
  const uid = ++stoneDefsSeq;

  // 큰 탑이 앞에 오도록 — 가장 많이 쌓은 작심이 정원의 주인공이 된다
  const towers = goals
    .map((g) => ({ goal: g, stones: stoneCount(g) }))
    .sort((a, b) => b.stones - a.stones)
    .slice(0, GARDEN_MAX);

  // 뒤에 있는 탑부터 그려야 앞 탑이 위에 겹친다
  const drawOrder = towers.map((t, i) => ({ ...t, spot: GARDEN_SPOTS[i] }));
  drawOrder.sort((a, b) => b.spot.depth - a.spot.depth);

  const groups = drawOrder.map(({ goal, stones, spot }) => {
    const held = heldGoalId === goal.id;
    const st = goalStatus(goal);
    // 이번 3일이 도는 동안에는 쌓는 중인 돌 자리를 계속 지킨다.
    // 점선이 깜빡이는 것은 '오늘 아직 남았다'는 뜻이라, 오늘 할 걸 다 하면
    // 깜빡임만 멎고 자리는 그대로 남는다.
    const running = st === "fresh" || st === "active";
    // 돌이 공중에 떠 있는 동안에는 자리도 착지 직전(이틀째) 모습으로 둔다
    const done = held ? goal.checks.length - 1 : goal.checks.length;
    const building = held || running ? { done, waiting: running && !checkedToday(goal) } : null;
    const drawn = held ? Math.max(0, stones - 1) : stones;
    const { markup } = stoneStack(drawn, building, 4, 0, uid);

    const scale = (1 - 0.44 * spot.depth) * 0.62;
    const x = spot.x * W;
    const y = groundY - spot.depth * 26;
    const opacity = (1 - 0.42 * spot.depth).toFixed(2);

    // 안쪽 g를 한 겹 더 두는 이유: 바깥 g의 transform(위치·크기)을
    // CSS 애니메이션이 덮어쓰지 않도록 흔들림은 안쪽에서만 준다
    return `<g class="tower" data-goal-id="${goal.id}"
      transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)})"
      opacity="${opacity}"><g class="tower-inner">${markup}</g></g>`;
  });

  // 탑들이 허공이 아니라 땅 위에 선 것처럼 보이도록 옅은 지면을 깔아 둔다
  // 뒤쪽 탑의 발까지 덮도록 세로로 넉넉하게, 경계가 드러나지 않을 만큼 옅게
  const ground = `<ellipse cx="${W / 2}" cy="${groundY - 8}" rx="${W * 0.64}" ry="46" fill="url(#gardenGround-${uid})"/>`;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      ${stoneDefs(uid)}
      <radialGradient id="gardenGround-${uid}" cx="50%" cy="46%" r="60%">
        <stop offset="0%" stop-color="var(--garden-ground)" stop-opacity="0.5"/>
        <stop offset="55%" stop-color="var(--garden-ground)" stop-opacity="0.26"/>
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
function cairnSVG(stones, building, ghost = 0, max = MAX_STONES, frameTop = 0) {
  // 정원의 탑과 같은 돌을 쓴다 — 축하 화면과 홈이 같은 재질로 보이도록
  const uid = ++stoneDefsSeq;
  const { markup, top } = stoneStack(stones, building, max, ghost, uid);
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
  runPendingAnim();
  // 상태가 바뀌면 앞으로 보낼 알림도 다시 짠다 (네이티브에서만 동작)
  if (typeof rescheduleNotifications === "function") rescheduleNotifications();
}

function renderStats() {
  const goals = state.goals;
  // '함께한 날'은 체크 횟수의 합이 아니라 실제로 돌을 얹은 날의 수.
  // 목표 3개를 하루에 다 체크했다고 3일이 되면 안 된다.
  const totalDays = totalDaysWithTower();

  const cycles =
    goals.reduce((s, g) => s + g.completedCycles, 0) +
    goals.filter((g) => g.checks.length >= 3).length;
  const restarts = goals.reduce((s, g) => s + g.restarts, 0);
  const hasGoals = goals.length > 0;
  $("stats").hidden = !hasGoals;
  $("section-head").hidden = !hasGoals;
  $("empty").hidden = hasGoals;
  // 아직 아무것도 없을 땐 추가 버튼이 유일한 할 일이므로 눈에 띄게 둔다
  $("btn-add").classList.toggle("first-cta", !hasGoals);

  $("stat-total-days").textContent = totalDays;
  $("stat-cycles").textContent = cycles;
  $("stat-restarts").textContent = restarts;
  $("hero-garden").innerHTML = gardenSVG(goals);

  const emptyCairn = document.querySelector(".empty-cairn");
  if (emptyCairn && !hasGoals) emptyCairn.innerHTML = cairnSVG(0, true, 2);

  const note = $("note");
  if (hasGoals && restarts >= 1) {
    note.hidden = false;
    note.innerHTML = `<b>다시 쌓음 ${restarts}회.</b> 무너지고도 돌아온 사람이 결국 탑을 완성해요.`;
  } else if (hasGoals && cycles >= 1) {
    note.hidden = false;
    note.innerHTML = `작심삼일 <b>${cycles}번 = ${cycles * 3}일.</b> 이렇게 평생 가는 거예요.`;
  } else {
    note.hidden = true;
  }
}

function renderGoals() {
  const list = $("goal-list");
  list.innerHTML = "";
  for (const goal of state.goals) {
    list.appendChild(renderGoalCard(goal));
  }
}

function statusLine(goal, status) {
  const n = goal.checks.length;
  if (status === "complete") return `<b>돌 하나 완성!</b>`;
  // 상태줄은 한 줄에 들어가야 한다 — 위로하는 말은 버튼과 아래 배너가 맡는다
  if (status === "resting") return `어제 완성 · <b>오늘 이어서</b>`;
  if (status === "lapsed") return `<span class="ok">${daysSinceLastCheck(goal)}일째 쉬는 중</span>`;
  if (status === "broken") return `<span class="ok">쌓아둔 ${goal.totalDays}일은 그대로예요</span>`;
  if (checkedToday(goal) && n === 0) return `내일 새 돌을 시작해요`;
  if (checkedToday(goal)) return `${DAY_KO[n - 1]} 날 완료`;
  if (n === 2) return `<b>오늘이면 돌 하나 완성</b>`;
  if (n === 1) return `${DAY_KO[n]} 날이에요`;
  return `오늘이 첫날`;
}

/* 카드를 길게 누르면 삭제 — 상시 노출되는 ✕ 없이 화면을 비워둔다 */
function attachLongPressDelete(card, goal) {
  let timer = null;
  let fired = false;

  const start = (ev) => {
    // 오늘 해냈어요 같은 버튼을 꾹 눌렀다가 삭제되는 일은 없어야 한다
    if (ev.target.closest("button")) return;
    clearTimeout(timer);
    fired = false;
    timer = setTimeout(() => {
      fired = true;
      card.classList.remove("pressing");
      removeGoal(goal);
    }, 650);
    card.classList.add("pressing");
  };
  const cancel = () => {
    clearTimeout(timer);
    card.classList.remove("pressing");
  };

  card.addEventListener("pointerdown", start);
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) =>
    card.addEventListener(ev, cancel)
  );
  card.addEventListener("contextmenu", (ev) => ev.preventDefault());
  // 길게 눌러 삭제한 뒤에 따라오는 클릭이 기록 화면을 열지 않도록
  card.addEventListener(
    "click",
    (ev) => {
      if (fired) {
        ev.stopPropagation();
        fired = false;
      }
    },
    true
  );
}

function renderGoalCard(goal) {
  const status = goalStatus(goal);
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
  attachLongPressDelete(card, goal);

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
    btn.addEventListener("click", () => nextCycle(goal, "lapsed"));
  } else if (status === "broken") {
    btn.classList.add("btn-rest");
    btn.textContent = "괜찮아요, 다시 쌓기";
    btn.addEventListener("click", () => restart(goal));
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
}

/* ── 기록 지키기 ──────────────────────
 * 이 앱의 자산은 쌓인 기록인데 브라우저 저장소는 지워질 수 있다.
 * 서버가 생기기 전까지는 파일로 꺼내 두는 것이 유일한 안전장치다.
 */

function exportData() {
  const payload = JSON.stringify({ app: "jaksim3", exportedAt: new Date().toISOString(), ...state }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // 파일명에 한글을 쓰면 브라우저가 통째로 무시하고 확장자 없는 'download'로
  // 저장해 버린다 — 나중에 다시 가져올 수 없게 되므로 ASCII로 둔다
  a.download = `jaksimsamil-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  haptic(10);
  toast("stone", "기록을 파일로 저장했어요");
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
      alert("이 파일은 작심삼일 기록이 아닌 것 같아요.");
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

function monthCalHTML(doneSet, y, m) {
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayKey = todayStr();
  const parts = [];
  for (let i = 0; i < first.getDay(); i++) parts.push(`<span class="mcal-cell blank"></span>`);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const cls = [
      "mcal-cell",
      doneSet.has(key) ? "done" : "",
      key === todayKey ? "today" : "",
      key > todayKey ? "future" : "",
    ]
      .filter(Boolean)
      .join(" ");
    parts.push(`<span class="${cls}"><i>${d}</i></span>`);
  }
  return parts.join("");
}

/* 달력 하나(제목 + 격자 + 이동 버튼)를 통째로 관리한다 */
function paintMonthCal(prefix, offset, doneSet) {
  const { y, m } = monthOf(offset);
  $(`${prefix}-cal-title`).textContent = `${y}년 ${m + 1}월`;
  $(`${prefix}-mcal`).innerHTML = monthCalHTML(doneSet, y, m);
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
  if (goal.restarts > 0) {
    return `${goal.restarts}번 무너지고 ${goal.restarts}번 다시 왔어요. 그게 이 탑의 진짜 기록이에요.`;
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
  $("detail-stats").innerHTML =
    `<div><b>${goal.totalDays}</b><span>함께한 날</span></div>` +
    `<div><b>${stoneCount(goal)}</b><span>쌓은 돌</span></div>` +
    // 다시 쌓은 횟수는 다른 종류의 성취라 색을 따로 준다
    `<div class="again"><b>${goal.restarts}</b><span>다시 쌓음</span></div>`;
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

function paintRecordCal() {
  const done = new Set();
  for (const g of state.goals) for (const d of g.history || []) done.add(d);
  const count = paintMonthCal("record", recordMonth, done);
  const note = $("record-cal-note");
  if (state.goals.length === 0) {
    note.textContent = "첫 작심을 만들면 여기에 기록이 쌓여요.";
  } else if (count === 0) {
    note.textContent = "이 달에는 아직 얹은 돌이 없어요.";
  } else {
    note.textContent = `이 달에 ${count}일 돌을 얹었어요.`;
  }
}

function renderRecord() {
  $("rstat-days").textContent = totalDaysWithTower();
  $("rstat-stones").textContent = totalStones();
  $("rstat-restarts").textContent = state.goals.reduce((s, g) => s + g.restarts, 0);
  paintRecordCal();

  const list = $("record-goals");
  list.innerHTML = "";
  if (state.goals.length === 0) {
    const p = document.createElement("p");
    p.className = "record-empty";
    p.textContent = "아직 만든 작심이 없어요.";
    list.appendChild(p);
    return;
  }

  for (const goal of state.goals) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "record-row";
    row.innerHTML =
      `<span class="record-ico">${iconSVG(goalIcon(goal), 20)}</span>` +
      `<span class="record-tt"><b></b><span></span></span>` +
      `<span class="record-num">${stoneCount(goal)}<i>돌</i></span>`;
    row.querySelector("b").textContent = goal.title;
    row.querySelector(".record-tt span").textContent =
      `함께한 날 ${goal.totalDays}` + (goal.restarts ? ` · 다시 쌓음 ${goal.restarts}` : "");
    row.addEventListener("click", () => openDetail(goal));
    list.appendChild(row);
  }
}

/* ── 화면 전환 ─────────────────────── */

let currentView = "home";

function switchView(name) {
  currentView = name;
  for (const v of ["home", "record", "settings"]) {
    $(`view-${v}`).hidden = v !== name;
  }
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.view === name;
    t.classList.toggle("on", on);
    t.setAttribute("aria-current", on ? "page" : "false");
  });
  if (name === "record") renderRecord();
  window.scrollTo({ top: 0 });
  haptic(6);
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    const key = { home: "home", record: "calendar", settings: "gear" }[tab.dataset.view];
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
  if (restarts > 0) return "무너졌다 다시 쌓은 탑이라, 더 단단해요.";
  if (stones % 10 === 0) return `돌 ${stones}개. 이만큼 쌓은 사람은 흔치 않아요.`;
  return `작심삼일 ${stones}번 = ${stones * 3}일. 이렇게 평생 가는 거예요.`;
}

function showCheer(goal) {
  // 축하는 이 작심의 탑 이야기 — 정원 전체가 아니라 방금 자란 탑을 보여 준다
  const stones = stoneCount(goal);
  const restarts = goal.restarts;
  const days = goal.totalDays;

  // 축하 화면에서는 탑을 더 높이 보여 준다
  $("cheer-cairn").innerHTML = cairnSVG(stones, false, 0, 9);
  $("cheer-title").textContent = `${ordinal(stones)} 돌을 얹었어요`;
  $("cheer-goal").innerHTML = `<span class="cheer-goal-ico">${iconSVG(goalIcon(goal), 16)}</span>`;
  $("cheer-goal").appendChild(document.createTextNode(goal.title));
  $("cheer-stats").innerHTML =
    `<span>함께한 날 <b>${days}</b></span><span>쌓은 돌 <b>${stones}</b></span>` +
    (restarts ? `<span>다시 쌓음 <b>${restarts}</b></span>` : "");
  $("cheer-word").textContent = cheerWord(stones, restarts, stones === 1);

  cheerGoalId = goal.id;
  const el = $("cheer");
  el.hidden = false;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  haptic([10, 40, 18]);
}

function closeCheer() {
  const el = $("cheer");
  el.classList.remove("show");
  setTimeout(() => (el.hidden = true), 220);
  cheerGoalId = null;
}

/* 완주한 돌이 카드에서 그 작심의 탑으로 날아가 얹힌다 */
function flyStoneToTower(fromEl, goalId, onLanded) {
  // 착지점 = 그 작심의 탑 꼭대기에 비어 있는 점선 자리
  const tower = document.querySelector(`#hero-garden .tower[data-goal-id="${goalId}"]`);
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
    ? document.querySelector(`#hero-garden .tower[data-goal-id="${goalId}"]`)
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

const ONBOARD = [
  {
    art: () => obDotsArt(0, 0, "3일짜리 약속 하나"),
    title: "약속은 3일치만",
    body: "한 달 계획은 쉽게 무너지지만\n3일은 누구나 해볼 만하니까요.",
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
    art: () => `<div class="ob-art">${cairnSVG(5, true, 0, 9, OB_FRAME_TOP)}</div>`,
    title: "끝나면 또 3일",
    body: "완주하면 바로 다음 3일이 열려요.\n이렇게 <b>120번이면 1년</b>이 됩니다.",
  },
  {
    art: () => `<div class="ob-art">${cairnSVG(5, false, 0, 9, OB_FRAME_TOP)}</div>`,
    title: "쉬어도 돌은 그대로",
    body: "며칠 빠뜨려도 쌓아 둔 돌은 없어지지 않아요.\n<b>다시 3일부터 시작하면 돼요.</b>",
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
  $("onboard").hidden = true;
  localStorage.setItem(ONBOARD_SEEN_KEY, "1");
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
    b.innerHTML = iconSVG(key, 20);
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

  $("btn-add").addEventListener("click", openModal);
  $("btn-cancel").addEventListener("click", closeModal);

  $("form-add").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const title = $("input-title").value.trim();
    if (!title) return;
    addGoal(title, selectedIcon);
    $("input-title").value = "";
    syncTitleState();
    closeModal();
  });

  setupThemeToggle();
  setupNotifyToggle();
  setupDevTools();

  $("btn-export").addEventListener("click", exportData);
  $("btn-import").addEventListener("click", () => $("file-import").click());
  $("file-import").addEventListener("change", (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (file) importData(file);
    ev.target.value = ""; // 같은 파일을 다시 골라도 동작하도록
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

  $("cheer-share").addEventListener("click", async (ev) => {
    const goal = state.goals.find((g) => g.id === cheerGoalId);
    if (!goal) return;
    const btn = ev.currentTarget;
    btn.disabled = true;
    try {
      const res = await shareCard({
        title: `${ordinal(stoneCount(goal))} 돌을 얹었어요`,
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
    $("theme-sub").textContent = THEME_LABEL[pref];
  };
  paint();

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
  const paint = () => {
    const on = notifyEnabled();
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-checked", on ? "true" : "false");
    hourRow.classList.toggle("off", !on);
    $("notify-hour-label").textContent = label();
    $("notify-sub").textContent = on
      ? `${label()}에 조용히 알려드려요`
      : "쉬는 동안에도 돌아올 자리를 남겨둡니다";
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
    // 처음 온 사람에게는 인트로가 끝난 뒤 사용법을 보여 준다
    if (!localStorage.getItem(ONBOARD_SEEN_KEY)) setTimeout(openOnboard, 260);
  };
  el.addEventListener("click", dismiss);
  setTimeout(dismiss, reduceMotion ? 300 : 2300);
}

/* 열려 있는 시트 중 가장 위의 것을 닫는다.
 * 안드로이드 뒤로가기와 ESC가 같은 규칙을 쓰도록 한곳에 모아 둔다. */
function closeTopLayer() {
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
 * 그래서 두 가지를 바꿨다. 하나, 이 화면은 바텀시트가 아니라 한 화면을
 * 통째로 쓴다 — 키보드가 올라와도 밀려날 시트가 없다. 둘, 추천 칩을 먼저
 * 둔다. 칩 하나를 누르면 제목과 아이콘이 함께 채워져서 키보드를 아예
 * 만나지 않고도 작심을 만들 수 있다. 직접 쓰고 싶은 사람만 입력창을
 * 누르면 된다. */
function openModal() {
  selectIcon(ICON_KEYS[0]);
  $("input-title").value = "";
  syncTitleState();
  $("modal").hidden = false;
  document.body.classList.add("sheet-open");
  $("sheet-scroll") && ($("sheet-scroll").scrollTop = 0);
}

function closeModal() {
  $("input-title").blur();
  $("modal").hidden = true;
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
