/* 공유 카드 — 완주한 순간을 이미지 한 장으로.
 * 자랑거리는 '몇 일 연속'이 아니라 '몇 번 다시 쌓았는가'다. */

const SHARE_W = 1080;
const SHARE_H = 1350; // 4:5 — 인스타그램 피드에서 가장 크게 보이는 비율

const SHARE_COLORS = {
  bg: "#f7f6f3",
  card: "#ffffff",
  ink: "#1b1a18",
  gray: "#9a938a",
  grayStrong: "#6e6860",
  accent: "#e85d3d",
  sage: "#5f7d54",
  line: "#ece8e1",
};

/* 돌 하나 — 앱 화면과 같은 규칙(두께 있는 조약돌)으로 캔버스에 직접 그린다 */
function drawStone(ctx, cx, cy, rx, ry, tilt) {
  const t = ry * 0.66;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((tilt * Math.PI) / 180);

  // 아래 돌에 드리우는 그림자
  ctx.save();
  ctx.filter = "blur(" + Math.max(2, rx * 0.05) + "px)";
  ctx.fillStyle = "rgba(52,44,33,0.34)";
  ctx.beginPath();
  ctx.ellipse(rx * 0.09, t + ry * 0.42, rx * 0.95, ry * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 측면 (그늘진 면)
  const side = ctx.createRadialGradient(-rx * 0.34, -ry * 0.6 + t, rx * 0.08, 0, t, rx * 1.1);
  side.addColorStop(0, "#ded8cc");
  side.addColorStop(0.34, "#bdb4a2");
  side.addColorStop(0.72, "#8f8674");
  side.addColorStop(1, "#655d4e");
  ctx.fillStyle = side;
  ctx.beginPath();
  ctx.ellipse(0, t, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // 윗면
  const top = ctx.createRadialGradient(-rx * 0.36, -ry * 0.52, rx * 0.06, 0, 0, rx * 1.05);
  top.addColorStop(0, "#e3ddd1");
  top.addColorStop(0.46, "#c7bfae");
  top.addColorStop(1, "#a19885");
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // 빛이 닿는 자리
  ctx.fillStyle = "rgba(255,252,244,0.26)";
  ctx.beginPath();
  ctx.ellipse(-rx * 0.26, -ry * 0.32, rx * 0.28, ry * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/* 바닥 중심을 기준으로 탑 하나 */
function drawTower(ctx, baseX, baseY, stones, scale) {
  ctx.save();
  ctx.translate(baseX, baseY);
  ctx.scale(scale, scale);

  // 바닥 그림자
  ctx.save();
  ctx.filter = "blur(9px)";
  ctx.fillStyle = "rgba(74,64,48,0.2)";
  ctx.beginPath();
  ctx.ellipse(4, 2, 47, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  let y = -4;
  let rx = 40;
  let ry = 13.5;
  for (let i = 0; i < stones; i++) {
    y -= ry * 1.5;
    drawStone(ctx, i % 2 === 0 ? -1.5 : 1.5, y, rx, ry, i % 2 === 0 ? -1.6 : 1.7);
    y -= ry * 0.4;
    rx *= 0.85;
    ry *= 0.93;
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* 완주 카드 한 장을 그린다 */
function renderShareCard(info) {
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext("2d");
  const C = SHARE_COLORS;
  const font = (size, weight) =>
    `${weight} ${size}px Pretendard, "Noto Sans KR", -apple-system, sans-serif`;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);

  // 카드 — 위아래 여백을 같게 두고 캔버스를 거의 채운다
  const pad = 64;
  const cardY = 120;
  const cardH = SHARE_H - cardY * 2;
  ctx.save();
  ctx.shadowColor = "rgba(40,35,25,0.10)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = C.card;
  roundRect(ctx, pad, cardY, SHARE_W - pad * 2, cardH, 56);
  ctx.fill();
  ctx.restore();

  ctx.textAlign = "center";

  // 글자가 카드 밖으로 나가지 않게 폭에 맞춰 크기를 줄인다
  const fitText = (text, y, size, weight, color, maxW) => {
    let s = size;
    ctx.font = font(s, weight);
    while (ctx.measureText(text).width > maxW && s > 18) {
      s -= 2;
      ctx.font = font(s, weight);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, SHARE_W / 2, y);
  };

  const innerW = SHARE_W - pad * 2 - 100;

  // 지면 — 탑의 발치에만 옅게 깔아 아래 문구를 덮지 않게
  const groundY = cardY + 440;
  const ground = ctx.createRadialGradient(SHARE_W / 2, groundY - 16, 30, SHARE_W / 2, groundY - 16, 400);
  ground.addColorStop(0, "rgba(236,229,215,0.5)");
  ground.addColorStop(1, "rgba(236,229,215,0)");
  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.ellipse(SHARE_W / 2, groundY - 12, 400, 92, 0, 0, Math.PI * 2);
  ctx.fill();

  drawTower(ctx, SHARE_W / 2, groundY, Math.min(info.stones, 9), 2.3);

  ctx.fillStyle = C.accent;
  ctx.font = font(30, 700);
  ctx.fillText("작 심 삼 일   완 주", SHARE_W / 2, cardY + 562);

  fitText(info.title, cardY + 640, 62, 800, C.ink, innerW);
  fitText(info.goalTitle, cardY + 698, 34, 500, C.grayStrong, innerW);

  // 구분선
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad + 90, cardY + 746);
  ctx.lineTo(SHARE_W - pad - 90, cardY + 746);
  ctx.stroke();

  // 숫자 세 개 — 가운데가 '다시 쌓음'이고, 이것만 색이 다르다
  const stats = [
    { n: info.days, label: "함께한 날", color: C.ink },
    { n: info.restarts, label: "다시 쌓음", color: C.sage },
    { n: info.stones, label: "쌓은 돌", color: C.ink },
  ];
  const colW = (SHARE_W - pad * 2 - 180) / 3;
  stats.forEach((s, i) => {
    const x = pad + 90 + colW * i + colW / 2;
    ctx.fillStyle = s.color;
    ctx.font = font(76, 800);
    ctx.fillText(String(s.n), x, cardY + 842);
    ctx.fillStyle = C.gray;
    ctx.font = font(28, 500);
    ctx.fillText(s.label, x, cardY + 888);
  });

  // 한마디 — 카드 안에 머물도록
  fitText(info.word, cardY + 948, 32, 500, C.grayStrong, innerW);

  // 워터마크 — 카드 안 아래쪽에
  ctx.fillStyle = C.gray;
  ctx.font = font(30, 700);
  ctx.fillText("작심삼일", SHARE_W / 2, cardY + cardH - 92);
  ctx.fillStyle = "#c6bfb4";
  ctx.font = font(26, 500);
  ctx.fillText("작심삼일도 여러 번 하면, 평생이 된다", SHARE_W / 2, cardY + cardH - 46);

  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/* 공유가 가능하면 공유 시트를, 아니면 파일로 내려받는다 */
async function shareCard(info) {
  const canvas = renderShareCard(info);
  const blob = await canvasToBlob(canvas);
  if (!blob) return { ok: false };

  const file = new File([blob], `jaksimsamil-${info.dateKey}.png`, { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: `${info.title} — 작심삼일` });
      return { ok: true, how: "share" };
    } catch (e) {
      if (e && e.name === "AbortError") return { ok: true, how: "cancelled" };
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true, how: "download" };
}
