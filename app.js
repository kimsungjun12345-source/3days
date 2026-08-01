/* 작심삼일 — 3일마다 돌 하나, 무너지면 다시 쌓는 습관 앱 */

const STORAGE_KEY = "jaksim3.v1";

const EMOJIS = ["🪨", "💧", "📚", "🏃", "🧘", "✍️", "🌅", "🥗", "💪", "💤"];

const DAY_KO = ["첫째", "둘째", "셋째"];

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/* ── 저장소 ─────────────────────────── */

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    /* 손상된 데이터는 새로 시작 */
  }
  return { goals: [] };
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = load();

/* ── 상태 판정 ──────────────────────────
 * fresh    : 이번 사이클 체크 0개 → 오늘 시작 가능
 * active   : 1~2개 체크, 아직 안 끊김 → 진행 중
 * complete : 3개 체크 → 돌 하나 완성, 다음 작심 대기
 * broken   : 1~2개 체크했지만 하루를 건너뜀 → 다시 쌓기 대기
 */
function goalStatus(goal) {
  const checks = goal.checks;
  if (checks.length === 0) return "fresh";
  if (checks.length >= 3) return "complete";
  const last = checks[checks.length - 1];
  if (last < todayStr(-1)) return "broken";
  return "active";
}

function checkedToday(goal) {
  return goal.lastCheckDate === todayStr();
}

/* ── 액션 ─────────────────────────── */

function addGoal(title, emoji) {
  const goal = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title,
    emoji,
    createdAt: new Date().toISOString(),
    checks: [],          // 이번 사이클에서 체크한 날짜들 (최대 3개)
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
  toast(emoji, "약속했어요. 딱 3일만 가봐요!");
}

function checkToday(goal, opts = {}) {
  if (checkedToday(goal) || goal.checks.length >= 3) return;
  goal.checks.push(todayStr());
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
  if (completed && !reduceMotion) heroStoneHeld = true;

  save();
  render();
}

/* 돌 하나 완성 후 다음 3일 시작 */
function nextCycle(goal) {
  goal.completedCycles += 1;
  goal.checks = [];
  haptic(10);
  // 완성한 날 바로 누르면 오늘은 이미 카운트됐으므로 내일부터 첫째 날
  if (!checkedToday(goal)) {
    checkToday(goal, { silent: true });
    toast("🪨", "또 하나 쌓기 시작!");
  } else {
    save();
    render();
    toast("🌙", "내일 첫 돌에서 만나요");
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
  toast("💪", `다시 쌓기 ${goal.restarts}번째. 이게 진짜 실력이에요`);
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

function cairnSVG(stones, building, ghost = 0) {
  const shown = Math.min(stones, MAX_STONES);
  const groundY = 122;
  let y = groundY - 4;
  let rx = 40;
  let ry = 13.5;
  let minY = groundY;
  const parts = [`<ellipse cx="60" cy="${groundY}" rx="46" ry="6" fill="rgba(90,80,60,0.09)"/>`];

  for (let i = 0; i < shown; i++) {
    y -= ry * 1.5;
    const tilt = i % 2 === 0 ? -1.6 : 1.7;
    const cx = 60 + (i % 2 === 0 ? -1.5 : 1.5);
    parts.push(
      `<ellipse cx="${cx}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#stone)" transform="rotate(${tilt} ${cx} ${y})"/>`
    );
    minY = Math.min(minY, y - ry);
    y -= ry * 0.4;
    rx *= 0.85;
    ry *= 0.93;
  }

  for (let i = 0; i < ghost; i++) {
    y -= ry * 1.5;
    parts.push(
      `<ellipse class="ghost-stone" style="animation-delay:${i * 0.5}s"
        cx="60" cy="${y}" rx="${rx}" ry="${ry}" fill="rgba(168,159,142,0.12)"/>`
    );
    minY = Math.min(minY, y - ry);
    y -= ry * 0.4;
    rx *= 0.85;
    ry *= 0.93;
  }

  if (building) {
    const by = y - ry * 1.3;
    const brx = Math.max(rx * 0.92, 15);
    const bry = Math.max(ry * 0.88, 6);
    parts.push(
      `<ellipse class="building-stone" cx="60" cy="${by}" rx="${brx}" ry="${bry}"
        fill="rgba(232,93,61,0.10)" stroke="#e85d3d" stroke-width="1.6" stroke-dasharray="4.5 3.5"/>`
    );
    minY = Math.min(minY, by - bry);
  }

  const top = minY - 7;
  return `<svg viewBox="0 ${top} 120 ${groundY + 10 - top}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="stone" cx="38%" cy="26%" r="85%">
        <stop offset="0%" stop-color="#cdc6b8"/>
        <stop offset="62%" stop-color="#a89f8e"/>
        <stop offset="100%" stop-color="#8d8371"/>
      </radialGradient>
    </defs>
    ${parts.join("\n")}
  </svg>`;
}

/* ── 렌더링 ─────────────────────────── */

const $ = (id) => document.getElementById(id);

function render() {
  renderStats();
  renderGoals();
  runPendingAnim();
}

function renderStats() {
  const goals = state.goals;
  const totalDays = goals.reduce((s, g) => s + g.totalDays, 0);
  const cycles =
    goals.reduce((s, g) => s + g.completedCycles, 0) +
    goals.filter((g) => g.checks.length >= 3).length;
  const restarts = goals.reduce((s, g) => s + g.restarts, 0);
  let building = goals.some((g) => {
    const st = goalStatus(g);
    return st === "fresh" || st === "active";
  });

  // 돌이 날아가는 동안 탑은 아직 자라지 않은 상태로 두고, 빈 점선 자리를 남겨둔다.
  // 돌이 착지하는 순간 그 자리에 진짜 돌이 채워지며 탑이 한 칸 자란다.
  let drawnStones = cycles;
  if (heroStoneHeld) {
    drawnStones = Math.max(0, cycles - 1);
    building = true;
  }

  const hasGoals = goals.length > 0;
  $("stats").hidden = !hasGoals;
  $("section-head").hidden = !hasGoals;
  $("empty").hidden = hasGoals;

  $("stat-total-days").textContent = totalDays;
  $("stat-cycles").textContent = cycles;
  $("stat-restarts").textContent = restarts;
  $("hero-cairn").innerHTML = cairnSVG(drawnStones, building);

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
  const start = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
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
  ico.textContent = goal.emoji;
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
  for (let i = 0; i < 3; i++) {
    const d = document.createElement("span");
    const done = i < goal.checks.length;
    const isNext =
      i === goal.checks.length &&
      (status === "fresh" || status === "active") &&
      !checkedToday(goal);
    d.className = "dot" + (done ? " done" : "") + (isNext ? " today" : "");
    d.textContent = done ? "✓" : i + 1;
    dots.appendChild(d);
  }
  top.appendChild(dots);

  card.appendChild(top);
  attachLongPressDelete(card, goal);

  const btn = document.createElement("button");
  btn.className = "btn";

  if (status === "complete") {
    btn.classList.add("btn-success");
    btn.textContent = "또 작심하기 — 다음 돌 쌓기";
    btn.addEventListener("click", () => nextCycle(goal));
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

function haptic(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

let toastTimer = null;

function toast(emoji, text) {
  const el = $("toast");
  el.innerHTML = `<span class="toast-emoji"></span><span class="toast-text"></span>`;
  el.querySelector(".toast-emoji").textContent = emoji;
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
/* 돌이 공중에 떠 있는 동안 true — 그동안 히어로 돌탑은 자라지 않고 기다린다 */
let heroStoneHeld = false;

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
    flyStoneToTower(dot);
    if (!job.silent) {
      setTimeout(() => toast("🎉", "돌 하나 완성! 3일을 해냈어요"), 620);
    }
  } else {
    haptic(12);
    if (!job.silent) {
      const left = 3 - job.dotIndex - 1;
      const msg = left === 1 ? "하루만 더 하면 돌 하나 완성" : "좋아요, 오늘도 해냈어요";
      setTimeout(() => toast("✨", msg), 180);
    }
  }
}

/* 완주한 돌이 카드에서 히어로 돌탑으로 날아가 얹힌다 */
function flyStoneToTower(fromEl) {
  const hero = $("hero-cairn");
  const cairnSvg = hero && hero.querySelector("svg");
  // 착지점 = 탑 꼭대기에 비어 있는 점선 자리
  const slot = cairnSvg && cairnSvg.querySelector(".building-stone");
  if (!fromEl || !hero || !slot || reduceMotion) {
    landStone();
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
  };
}

/* 돌이 닿는 순간: 점선 자리가 진짜 돌로 바뀌고, 탑이 한 번 눌렸다 편다 */
function landStone(x, y) {
  heroStoneHeld = false;
  renderStats();
  bumpTower();
  if (x != null) stoneDust(x, y);
  haptic(18);
}

/* 돌이 얹힐 때 탑 전체가 한 번 눌렸다 펴진다 */
function bumpTower() {
  const hero = $("hero-cairn");
  if (!hero) return;
  hero.classList.remove("bump");
  void hero.offsetWidth;
  hero.classList.add("bump");
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

let selectedEmoji = EMOJIS[0];

function setupModal() {
  const row = $("emoji-row");
  for (const e of EMOJIS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "emoji-option" + (e === selectedEmoji ? " selected" : "");
    b.textContent = e;
    b.addEventListener("click", () => {
      selectedEmoji = e;
      row.querySelectorAll(".emoji-option").forEach((el) => el.classList.remove("selected"));
      b.classList.add("selected");
    });
    row.appendChild(b);
  }

  $("btn-add").addEventListener("click", () => {
    $("modal").hidden = false;
    $("input-title").focus();
  });
  $("btn-cancel").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (ev) => {
    if (ev.target === $("modal")) closeModal();
  });

  $("form-add").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const title = $("input-title").value.trim();
    if (!title) return;
    addGoal(title, selectedEmoji);
    $("input-title").value = "";
    closeModal();
  });
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
