/* 작심삼일 — 3일씩 약속하고, 무너지면 또 작심하는 습관 앱 */

const STORAGE_KEY = "jaksim3.v1";

const EMOJIS = ["🔥", "💪", "📚", "🏃", "💧", "🧘", "✍️", "🌅", "🥗", "💤"];

const MESSAGES = {
  fresh: [
    "오늘이 Day 1이에요. 딱 3일만 가봐요.",
    "시작이 반, 3일이면 완주예요.",
    "부담 갖지 마세요. 약속은 3일뿐이니까.",
  ],
  day1: [
    "좋아요, 하루 해냈어요. 이제 이틀!",
    "Day 1 완료. 내일 또 만나요.",
  ],
  day2: [
    "이틀째! 내일이면 작심삼일 완성이에요.",
    "하루만 더 하면 완주예요. 거의 다 왔어요.",
  ],
  complete: [
    "작심삼일 완주! 3일을 해냈어요.",
    "약속한 3일, 전부 지켰어요. 대단해요.",
  ],
  broken: [
    "쉬어간 것도 과정이에요. 지금까지 쌓은 날들은 그대로예요.",
    "포기가 아니라 잠깐 멈춘 거예요. 또 작심하면 돼요.",
    "괜찮아요. 작심삼일은 원래 여러 번 하는 거예요.",
  ],
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

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
 * complete : 3개 체크 → 완주, 다음 작심 대기
 * broken   : 1~2개 체크했지만 하루를 건너뜀 → 다시 작심 대기
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
  state.goals.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title,
    emoji,
    createdAt: new Date().toISOString(),
    checks: [],          // 이번 사이클에서 체크한 날짜들 (최대 3개)
    lastCheckDate: null, // 같은 날 중복 카운트 방지
    totalDays: 0,
    completedCycles: 0,
    restarts: 0,
  });
  save();
  render();
}

function checkToday(goal) {
  if (checkedToday(goal) || goal.checks.length >= 3) return;
  goal.checks.push(todayStr());
  goal.lastCheckDate = todayStr();
  goal.totalDays += 1;
  save();
  render();
  if (goal.checks.length === 3) celebrate();
}

/* 완주 후 다음 3일 시작 */
function nextCycle(goal) {
  goal.completedCycles += 1;
  goal.checks = [];
  // 완주한 날 바로 누르면 오늘은 이미 카운트됐으므로 내일부터 Day 1
  if (!checkedToday(goal)) checkToday(goal);
  else {
    save();
    render();
  }
}

/* 끊긴 뒤 다시 작심 — 쌓은 날은 유지, 사이클만 새로 */
function restart(goal) {
  goal.restarts += 1;
  goal.checks = [];
  if (!checkedToday(goal)) checkToday(goal);
  else {
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

/* ── 렌더링 ─────────────────────────── */

const $ = (id) => document.getElementById(id);

function render() {
  renderStats();
  renderGoals();
}

function renderStats() {
  const goals = state.goals;
  const totalDays = goals.reduce((s, g) => s + g.totalDays, 0);
  const cycles = goals.reduce((s, g) => s + g.completedCycles, 0) +
    goals.filter((g) => g.checks.length >= 3).length;
  const restarts = goals.reduce((s, g) => s + g.restarts, 0);

  const hasGoals = goals.length > 0;
  $("stats").hidden = !hasGoals;
  $("empty").hidden = hasGoals;

  $("stat-total-days").textContent = totalDays;
  $("stat-cycles").textContent = cycles;
  $("stat-restarts").textContent = restarts;

  const note = $("stats-note");
  if (!hasGoals || totalDays === 0) {
    note.hidden = true;
  } else {
    note.hidden = false;
    if (cycles > 0) {
      note.textContent = `작심삼일 ${cycles}번 = 벌써 ${cycles * 3}일. 이렇게 평생 가는 거예요.`;
    } else {
      note.textContent = "첫 3일을 향해 가는 중이에요.";
    }
    if (restarts >= 3) {
      note.textContent += ` 그리고 ${restarts}번이나 다시 일어났어요. 그게 진짜 실력이에요.`;
    }
  }
}

function renderGoals() {
  const list = $("goal-list");
  list.innerHTML = "";
  for (const goal of state.goals) {
    list.appendChild(renderGoalCard(goal));
  }
}

function renderGoalCard(goal) {
  const status = goalStatus(goal);
  const card = document.createElement("article");
  card.className = `goal-card state-${status}`;

  // 헤더
  const head = document.createElement("div");
  head.className = "goal-head";
  head.innerHTML = `<span class="goal-emoji"></span><span class="goal-title"></span>`;
  head.querySelector(".goal-emoji").textContent = goal.emoji;
  head.querySelector(".goal-title").textContent = goal.title;
  const del = document.createElement("button");
  del.className = "btn-delete";
  del.textContent = "✕";
  del.setAttribute("aria-label", "작심 삭제");
  del.addEventListener("click", () => removeGoal(goal));
  head.appendChild(del);
  card.appendChild(head);

  // 3일 점
  const days = document.createElement("div");
  days.className = "days";
  for (let i = 0; i < 3; i++) {
    const d = document.createElement("div");
    const done = i < goal.checks.length;
    const isNext = i === goal.checks.length && (status === "fresh" || status === "active");
    d.className = "day" + (done ? " done" : "") + (isNext && !checkedToday(goal) ? " today" : "");
    d.innerHTML = `<span class="day-num">${done ? "✓" : i + 1}</span><span>Day ${i + 1}</span>`;
    days.appendChild(d);
  }
  card.appendChild(days);

  // 상태 메시지
  const msg = document.createElement("p");
  msg.className = "goal-message";
  card.appendChild(msg);

  // 액션 버튼
  const btn = document.createElement("button");
  btn.className = "btn";

  if (status === "complete") {
    msg.innerHTML = `<strong>작심삼일 완주!</strong> ${pick(MESSAGES.complete)}`;
    btn.classList.add("btn-success");
    btn.textContent = "또 작심하기 → 3일 더 🔥";
    btn.addEventListener("click", () => nextCycle(goal));
  } else if (status === "broken") {
    msg.innerHTML = `<strong>괜찮아요.</strong> ${pick(MESSAGES.broken)}`;
    btn.classList.add("btn-rest");
    btn.textContent = "오늘부터 다시 작심삼일 🌅";
    btn.addEventListener("click", () => restart(goal));
  } else if (checkedToday(goal) && goal.checks.length === 0) {
    // 완주 직후 '또 작심하기'를 누른 날 — 오늘은 이미 카운트됐으므로 내일부터 Day 1
    msg.innerHTML = "<strong>다음 작심 예약 완료!</strong> 새로운 3일은 내일부터 시작해요.";
    btn.classList.add("btn-done");
    btn.textContent = "내일 Day 1에서 만나요 🌙";
    btn.disabled = true;
  } else if (checkedToday(goal)) {
    msg.textContent = pick(goal.checks.length === 1 ? MESSAGES.day1 : MESSAGES.day2);
    btn.classList.add("btn-done");
    btn.textContent = "오늘 완료 ✓ 내일 또 만나요";
    btn.disabled = true;
  } else {
    msg.textContent =
      status === "fresh" ? pick(MESSAGES.fresh) : `Day ${goal.checks.length + 1}, 오늘도 가볼까요?`;
    btn.classList.add("btn-primary");
    btn.textContent = `오늘 해냈어요 (Day ${goal.checks.length + 1})`;
    btn.addEventListener("click", () => checkToday(goal));
  }
  card.appendChild(btn);

  // 누적 기록
  if (goal.totalDays > 0) {
    const rec = document.createElement("p");
    rec.className = "goal-record";
    const parts = [`누적 ${goal.totalDays}일`];
    if (goal.completedCycles > 0) parts.push(`완주 ${goal.completedCycles}회`);
    if (goal.restarts > 0) parts.push(`다시 일어남 ${goal.restarts}회`);
    rec.textContent = parts.join(" · ");
    card.appendChild(rec);
  }

  return card;
}

/* ── 축하 색종이 ────────────────────── */

function celebrate() {
  const layer = $("confetti");
  const colors = ["#e8590c", "#f59f00", "#2f9e44", "#4c6ef5", "#e64980"];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = 1.8 + Math.random() * 1.5 + "s";
    p.style.animationDelay = Math.random() * 0.4 + "s";
    layer.appendChild(p);
  }
  setTimeout(() => (layer.innerHTML = ""), 4000);
}

/* ── 모달 ─────────────────────────── */

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
