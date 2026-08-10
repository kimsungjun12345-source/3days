/* 검사와 그림 생성에 쓸 Chromium을 어디서 찾을지 한 곳에서 정한다.
 *
 * 전에는 다섯 파일이 저마다 `/opt/pw-browsers/chromium_headless_shell-1194/…`를
 * 통째로 박아 두고 있었다. 경로에 브라우저 빌드 번호가 들어 있어서, 환경이
 * 조금만 달라지면 — 새 컨테이너에서 브라우저 번호가 바뀌기만 해도 — 다섯
 * 군데를 손으로 맞춰야 npm test가 다시 돌았다. 한 군데를 빠뜨리면 두 검사는
 * 통과하고 하나만 깨지는, 원인을 짐작하기 어려운 상태가 된다.
 *
 * playwright-core에게 물어보는 것(chromium.executablePath())만으로는 부족하다.
 * 그 답은 '이 playwright 버전이 받았어야 할 빌드'의 경로라서, 컨테이너에 미리
 * 깔린 브라우저의 빌드 번호와 어긋나면 있지도 않은 파일을 가리킨다. 그래서
 * 물어본 답이 실제로 있을 때만 쓰고, 없으면 브라우저 보관함을 직접 뒤진다.
 *
 * 순서는 CHROMIUM_PATH(사람이 정한 것) → playwright의 답 → 보관함 뒤지기다.
 * 앞의 것이 항상 이긴다.
 */

const fs = require("fs");
const path = require("path");

/* 플랫폼마다 실행 파일 위치가 다르다. headless_shell은 창 없는 경량판으로,
 * 컨테이너에는 이쪽만 깔려 있는 경우가 있어 함께 본다. */
const BINARIES = [
  ["chrome-linux64", "chrome"],
  ["chrome-linux", "chrome"],
  ["chrome-linux", "headless_shell"],
  ["chrome-headless-shell-linux64", "chrome-headless-shell"],
  ["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"],
  ["chrome-mac-arm64", "Chromium.app", "Contents", "MacOS", "Chromium"],
];

function firstBinaryIn(dir) {
  for (const parts of BINARIES) {
    const p = path.join(dir, ...parts);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/* 보관함 안의 chromium* 디렉터리를 빌드 번호 큰 것부터 본다. 여러 벌이
 * 깔려 있으면 새 것이 playwright-core와 맞을 확률이 높다. */
function scanStore(store) {
  let entries;
  try {
    entries = fs.readdirSync(store);
  } catch {
    return null;
  }
  const dirs = entries
    .filter((name) => name.startsWith("chromium"))
    .sort((a, b) => (parseInt(b.replace(/\D+/g, ""), 10) || 0) - (parseInt(a.replace(/\D+/g, ""), 10) || 0));
  for (const name of dirs) {
    const found = firstBinaryIn(path.join(store, name));
    if (found) return found;
  }
  return null;
}

function chromePath() {
  const chosen = process.env.CHROMIUM_PATH;
  if (chosen) return chosen; // 사람이 지정했으면 존재 여부를 따지지 않고 그대로 쓴다

  try {
    const { chromium } = require("playwright-core");
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch {
    // playwright-core가 없거나 답하지 못하면 아래에서 직접 찾는다
  }

  const stores = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    "/opt/pw-browsers",
    path.join(require("os").homedir(), ".cache", "ms-playwright"),
    path.join(require("os").homedir(), "Library", "Caches", "ms-playwright"),
  ].filter(Boolean);

  for (const store of stores) {
    const found = scanStore(store);
    if (found) return found;
  }

  /* 여기까지 왔으면 어디에도 없다. launch()가 뱉는 playwright 기본 오류
   * 대신, 무엇을 하면 되는지 알려 주고 멈춘다. */
  throw new Error(
    "Chromium을 찾지 못했습니다.\n" +
      "  npx playwright install chromium\n" +
      "  또는 CHROMIUM_PATH=/실행/파일/경로 로 직접 지정하세요.\n" +
      `  찾아본 곳: ${stores.join(", ")}`,
  );
}

module.exports = { chromePath };
