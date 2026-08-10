/* 크로미움을 어디서 찾을지 정하는 곳 — 여기 한 군데다.
 *
 * 예전에는 세 검사 파일 상단에 실행 파일 경로가 그대로 박혀 있었다.
 * 그러면 환경이 바뀔 때마다 세 곳을 같이 고쳐야 하고, 실제로 한 곳만
 * 고쳐 두면 나머지 둘이 조용히 죽는다. 무엇보다 남의 컴퓨터나 CI에서는
 * 그 경로가 아예 없어서 `npm test`가 첫 줄에서 멈춘다.
 *
 * 찾는 순서는 좁은 것부터 넓은 것으로 간다.
 *   1. CHROMIUM_PATH — 사람이 직접 알려 준 것이니 가장 먼저 믿는다
 *      (scripts/make-native-assets.js도 같은 이름을 쓴다)
 *   2. 브라우저 보관함 안을 뒤진다. playwright-core는 버전에 맞는 빌드만
 *      찾는데, 미리 깔려 있는 환경은 빌드 번호가 어긋나기 일쑤다.
 *      번호를 묻지 않고 있는 것을 쓴다.
 *   3. 못 찾으면 아무것도 넘기지 않는다 — playwright가 제 것을 찾는다.
 *      `npx playwright-core install chromium`을 돌린 CI가 이 길로 온다.
 *
 * 그래도 없으면 launch()가 던지는 예외 대신 무엇을 하면 되는지 알려 준다.
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

/* 보관함 안의 실행 파일 후보. headless_shell을 chrome보다 앞에 두는 이유는
 * 검사가 전부 화면 없이 돌기 때문이다 — 더 가볍고 빨리 뜬다. */
const CANDIDATES = [
  ["chromium_headless_shell-*", "chrome-linux", "headless_shell"],
  ["chromium-*", "chrome-linux", "chrome"],
  ["chromium-*", "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"],
  ["chromium-*", "chrome-win", "chrome.exe"],
];

function browsersHome() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return null;
  // playwright가 기본으로 쓰는 자리 (플랫폼마다 다르지만 리눅스 기준으로만 본다)
  return path.join(home, ".cache", "ms-playwright");
}

function findInHome() {
  const home = browsersHome();
  if (!home || !fs.existsSync(home)) return null;
  let entries;
  try {
    entries = fs.readdirSync(home);
  } catch {
    return null;
  }
  for (const [dirGlob, ...rest] of CANDIDATES) {
    const prefix = dirGlob.replace(/\*$/, "");
    // 같은 이름이 여러 벌이면 최신 빌드를 쓴다 (뒤 숫자가 큰 쪽)
    const matches = entries.filter((e) => e.startsWith(prefix)).sort().reverse();
    for (const dir of matches) {
      const full = path.join(home, dir, ...rest);
      if (fs.existsSync(full)) return full;
    }
  }
  return null;
}

function resolveChromium() {
  const told = process.env.CHROMIUM_PATH;
  if (told && fs.existsSync(told)) return told;
  if (told) {
    console.warn(`CHROMIUM_PATH가 가리키는 파일이 없습니다: ${told}`);
  }
  return findInHome();
}

async function launchBrowser(opts = {}) {
  const executablePath = resolveChromium();
  try {
    return await chromium.launch(executablePath ? { ...opts, executablePath } : opts);
  } catch (err) {
    console.error(
      "\n크로미움을 찾지 못했습니다. 아래 중 하나로 해결됩니다.\n" +
        "  npx playwright-core install chromium   (권장 — 알맞은 빌드를 받아 둡니다)\n" +
        "  CHROMIUM_PATH=/실행/파일/경로 npm test  (이미 있는 것을 쓸 때)\n"
    );
    throw err;
  }
}

module.exports = { launchBrowser, resolveChromium };
