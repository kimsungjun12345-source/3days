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

function todayStr(offsetDays = 0) {
  const d = new Date();
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
    createdAt: new Date().toISOString(),
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
    toast("sleep", "내일 첫 돌에서 만나요");
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
const STONE_GRADIENT = `<radialGradient id="stoneSide" cx="33%" cy="20%" r="92%">
    <stop offset="0%" stop-color="#ded8cc"/>
    <stop offset="34%" stop-color="#bdb4a2"/>
    <stop offset="72%" stop-color="#8f8674"/>
    <stop offset="100%" stop-color="#655d4e"/>
  </radialGradient>
  <radialGradient id="stoneTop" cx="32%" cy="24%" r="86%">
    <stop offset="0%" stop-color="#e3ddd1"/>
    <stop offset="46%" stop-color="#c7bfae"/>
    <stop offset="100%" stop-color="#a19885"/>
  </radialGradient>
  <filter id="softShadow" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="2.2"/>
  </filter>
  <filter id="groundShadow" x="-60%" y="-120%" width="220%" height="340%">
    <feGaussianBlur stdDeviation="3.4"/>
  </filter>`;

/* 돌 하나 — 납작한 조약돌을 위에서 비스듬히 본 모습.
 * 같은 타원을 두께(t)만큼 아래에 한 번 더 깔아 측면이 초승달처럼 드러나게 하고,
 * 그 위에 밝은 윗면을 얹는다. 이 두께가 있어야 쌓인 것으로 보인다. */
function stonePiece(cx, cy, rx, ry, tilt) {
  const t = ry * 0.66;
  const rot = `rotate(${tilt} ${cx} ${cy})`;
  return `<g transform="${rot}">
    <ellipse cx="${(cx + rx * 0.09).toFixed(1)}" cy="${(cy + t + ry * 0.42).toFixed(1)}"
      rx="${(rx * 0.95).toFixed(1)}" ry="${(ry * 0.52).toFixed(1)}"
      fill="rgba(52,44,33,0.38)" filter="url(#softShadow)"/>
    <ellipse cx="${cx.toFixed(1)}" cy="${(cy + t).toFixed(1)}"
      rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#stoneSide)"/>
    <ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}"
      rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#stoneTop)"/>
    <ellipse cx="${(cx - rx * 0.26).toFixed(1)}" cy="${(cy - ry * 0.32).toFixed(1)}"
      rx="${(rx * 0.28).toFixed(1)}" ry="${(ry * 0.24).toFixed(1)}"
      fill="rgba(255,252,244,0.26)"/>
  </g>`;
}

/* ── 돌탑 정원 ────────────────────────
 * 작심 하나가 탑 하나. 홈에는 그 탑들이 원근을 두고 함께 서 있다.
 * 앞쪽 탑은 크고 진하게, 뒤쪽 탑은 작고 흐리게 — 뒤로 갈수록 공기에
 * 잠기는 것처럼 보이게 해서 정원처럼 읽히게 한다.
 */

/* 바닥 중심을 원점으로 위로 쌓는 돌 무더기 */
function stoneStack(stones, building, max = MAX_STONES, ghost = 0) {
  const shown = Math.min(stones, max);
  let y = -4;
  let rx = 40;
  let ry = 13.5;
  let top = 0;
  // 바닥에 드리운 그림자는 빛 반대쪽(오른쪽 아래)으로 살짝 밀어 둔다
  const parts = [
    `<ellipse cx="4" cy="2" rx="47" ry="8" fill="rgba(74,64,48,0.20)" filter="url(#groundShadow)"/>`,
  ];

  for (let i = 0; i < shown; i++) {
    y -= ry * 1.5;
    const tilt = i % 2 === 0 ? -1.6 : 1.7;
    const cx = i % 2 === 0 ? -1.5 : 1.5;
    parts.push(stonePiece(cx, y, rx, ry, tilt));
    top = Math.min(top, y - ry);
    y -= ry * 0.4;
    rx *= 0.85;
    ry *= 0.93;
  }

  for (let i = 0; i < ghost; i++) {
    y -= ry * 1.5;
    parts.push(
      `<ellipse class="ghost-stone" style="animation-delay:${i * 0.5}s"
        cx="0" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="rgba(168,159,142,0.14)"/>`
    );
    top = Math.min(top, y - ry);
    y -= ry * 0.4;
    rx *= 0.85;
    ry *= 0.93;
  }

  if (building) {
    const by = y - ry * 1.3;
    const brx = Math.max(rx * 0.92, 15);
    const bry = Math.max(ry * 0.88, 6);
    parts.push(
      `<ellipse class="building-stone" cx="0" cy="${by}" rx="${brx}" ry="${bry}"
        fill="rgba(232,93,61,0.10)" stroke="#e85d3d" stroke-width="1.6" stroke-dasharray="4.5 3.5"/>`
    );
    top = Math.min(top, by - bry);
  }

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
    // 점선 자리는 '오늘 아직 남은 일'일 때만 — 오늘 할 걸 다 하면 정원이 말끔해진다
    const waiting = (st === "fresh" || st === "active") && !checkedToday(goal);
    const building = held || waiting;
    const drawn = held ? Math.max(0, stones - 1) : stones;
    const { markup } = stoneStack(drawn, building, 4);

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
  const ground = `<ellipse cx="${W / 2}" cy="${groundY - 8}" rx="${W * 0.64}" ry="46" fill="url(#gardenGround)"/>`;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      ${STONE_GRADIENT}
      <radialGradient id="gardenGround" cx="50%" cy="46%" r="60%">
        <stop offset="0%" stop-color="#ece5d7" stop-opacity="0.5"/>
        <stop offset="55%" stop-color="#ece5d7" stop-opacity="0.26"/>
        <stop offset="100%" stop-color="#ece5d7" stop-opacity="0"/>
      </radialGradient>
    </defs>
    ${ground}
    ${groups.join("\n")}
  </svg>`;
}

function stoneCount(goal) {
  return goal.completedCycles + (goal.checks.length >= 3 ? 1 : 0);
}

function cairnSVG(stones, building, ghost = 0, max = MAX_STONES) {
  // 정원의 탑과 같은 돌을 쓴다 — 축하 화면과 홈이 같은 재질로 보이도록
  const { markup, top } = stoneStack(stones, building, max, ghost);
  const pad = 12;
  const height = pad - (top - pad);
  return `<svg viewBox="-58 ${(top - pad).toFixed(1)} 116 ${height.toFixed(1)}" xmlns="http://www.w3.org/2000/svg">
    <defs>${STONE_GRADIENT}</defs>
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
    // 오늘의 돌 얹기 같은 버튼을 꾹 눌렀다가 삭제되는 일은 없어야 한다
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
    btn.textContent = "내일 첫 돌에서 만나요";
    btn.disabled = true;
  } else if (checkedToday(goal)) {
    btn.classList.add("btn-done");
    btn.textContent = "오늘은 다 했어요";
    btn.disabled = true;
  } else {
    btn.classList.add("btn-primary");
    btn.textContent = "오늘의 돌 얹기";
    btn.addEventListener("click", () => checkToday(goal));
  }
  card.appendChild(btn);

  return card;
}

/* ── 손맛: 진동 · 토스트 · 돌 얹기 애니메이션 ── */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* 앱으로 감쌌을 때는 OS 햅틱 엔진을, 웹에서는 진동을 쓴다 */
function haptic(ms) {
  const kind = Array.isArray(ms) ? "success" : ms >= 16 ? "heavy" : "light";
  if (typeof nativeHaptic === "function" && nativeHaptic(kind)) return;
  if (navigator.vibrate) navigator.vibrate(ms);
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

/* ── 기록 화면 ─────────────────────── */

const WEEKS = 12;

/* 지난 12주를 주 단위로 — 무너진 구간과 다시 쌓은 구간이 한눈에 보인다 */
function renderCalendar(goal) {
  const done = new Set(goal.history || []);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 이번 주 일요일까지 채워서 격자를 맞춘다
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const cells = [];
  const total = WEEKS * 7;
  for (let i = total - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    const isFuture = d > today;
    const isToday = d.getTime() === today.getTime();
    const cls = [
      "cal-cell",
      done.has(key) ? "on" : "",
      isFuture ? "future" : "",
      isToday ? "today" : "",
    ]
      .filter(Boolean)
      .join(" ");
    cells.push(`<i class="${cls}" title="${key}"></i>`);
  }
  return cells.join("");
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

function openDetail(goal) {
  detailGoalId = goal.id;
  $("detail-ico").innerHTML = iconSVG(goalIcon(goal), 20);
  $("detail-title").textContent = goal.title;
  $("detail-stats").innerHTML =
    `<div><b>${goal.totalDays}</b><span>함께한 날</span></div>` +
    `<div><b>${goal.completedCycles + (goal.checks.length >= 3 ? 1 : 0)}</b><span>쌓은 돌</span></div>` +
    // 다시 쌓은 횟수는 다른 종류의 성취라 색을 따로 준다
    `<div class="again"><b>${goal.restarts}</b><span>다시 쌓음</span></div>`;
  $("detail-cal").innerHTML = renderCalendar(goal);
  $("detail-word").textContent = historyWord(goal);
  $("detail").hidden = false;
}

function closeDetail() {
  $("detail").hidden = true;
  detailGoalId = null;
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
      $("input-title").value = s.title;
      selectIcon(s.icon);
      haptic(6);
    });
    sug.appendChild(b);
  }

  $("btn-add").addEventListener("click", openModal);
  $("btn-cancel").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (ev) => {
    if (ev.target === $("modal")) closeModal();
  });

  $("form-add").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const title = $("input-title").value.trim();
    if (!title) return;
    addGoal(title, selectedIcon);
    $("input-title").value = "";
    closeModal();
  });

  setupNotifyToggle();

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
function setupNotifyToggle() {
  const row = $("notify-row");
  const btn = $("btn-notify");
  if (!row || !btn || typeof IS_NATIVE === "undefined" || !IS_NATIVE) return;

  row.hidden = false;
  const paint = () => {
    const on = notifyEnabled();
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-checked", on ? "true" : "false");
  };
  paint();

  btn.addEventListener("click", async () => {
    const turningOn = !notifyEnabled();
    const ok = await setNotifyEnabled(turningOn);
    paint();
    if (turningOn && !ok) {
      toast("stone", "설정에서 알림을 허용해 주세요");
    } else if (turningOn) {
      toast("stone", "저녁 9시에 알려드릴게요");
    }
  });
}

function openModal() {
  selectIcon(ICON_KEYS[0]);
  $("modal").hidden = false;
  $("input-title").focus();
}

function closeModal() {
  $("modal").hidden = true;
}

/* ── 시작 ─────────────────────────── */

setupModal();
render();

// 자정을 넘겨 열어둔 화면도 날짜에 맞게 갱신
setInterval(() => {
  if (document.visibilityState === "visible") render();
}, 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") render();
});
