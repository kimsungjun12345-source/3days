/* 웹 소스를 www/ 로 모은다.
 *
 * 소스는 저장소 루트에 그대로 두고(그래야 GitHub Pages 같은 정적 호스팅에
 * 바로 올릴 수 있다), Capacitor가 네이티브 앱에 넣을 자산만 www/ 로 복사한다.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "www");

const FILES = [
  "index.html",
  "build-info.js",
  "style.css",
  "app.js",
  "icons.js",
  "share.js",
  "pwa.js",
  "native.js",
  "sw.js",
  "manifest.webmanifest",
];

const DIRS = ["icons", "fonts"];

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

/* 어느 빌드가 깔려 있는지 앱 안에서 알 수 있어야 한다.
 *
 * "개발자 도구가 없다"는 말을 들었을 때 제일 먼저 확인해야 하는 건
 * 그 기능이 든 빌드가 맞느냐인데, 지금까지는 확인할 길이 없었다.
 * 설정 화면에 커밋을 적어 두면 한눈에 끝난다.
 *
 * channel 은 개발자 도구를 대놓고 보여 줄지도 정한다. 테스트하라고 만든
 * 빌드에서 테스트 도구를 숨겨 두는 건 앞뒤가 맞지 않는다. */
function buildInfo() {
  let commit = process.env.GITHUB_SHA || "";
  if (!commit) {
    try {
      commit = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
    } catch (e) {
      commit = "";
    }
  }
  return {
    channel: process.env.BUILD_CHANNEL || "dev",
    commit: commit.slice(0, 7),
    date: new Date().toISOString().slice(0, 10),
  };
}

const info = buildInfo();
fs.writeFileSync(
  path.join(ROOT, "build-info.js"),
  `/* 빌드할 때 자동으로 만들어집니다 — 직접 고치지 마세요 (scripts/build.js) */\n` +
    `window.BUILD = ${JSON.stringify(info)};\n`
);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let copied = 0;
for (const file of FILES) {
  const src = path.join(ROOT, file);
  if (!fs.existsSync(src)) {
    console.warn(`  건너뜀 (없음): ${file}`);
    continue;
  }
  fs.copyFileSync(src, path.join(OUT, file));
  copied += 1;
}
for (const dir of DIRS) {
  const src = path.join(ROOT, dir);
  if (fs.existsSync(src)) copyDir(src, path.join(OUT, dir));
}

console.log(`www/ 준비 완료 — 파일 ${copied}개 + ${DIRS.join(", ")} · ${info.channel} ${info.commit}`);
