/* 웹 소스를 www/ 로 모은다.
 *
 * 소스는 저장소 루트에 그대로 두고(그래야 GitHub Pages 같은 정적 호스팅에
 * 바로 올릴 수 있다), Capacitor가 네이티브 앱에 넣을 자산만 www/ 로 복사한다.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "www");

const FILES = [
  "index.html",
  "build-info.js",
  "toss-sdk.js",
  "analytics.js",
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
const BUNDLES = [["toss-notification.js", "toss-sdk.js"]];

/* 스토어가 요구하는 것은 파일이 아니라 '열리는 주소'다.
 *
 * 개인정보 처리방침은 store/ 안에 있어서 웹으로 올라가는 www/ 에는 담기지
 * 않았다. 그대로 두면 Pages를 켜도 그 주소가 404가 되고, 두 스토어 모두
 * 등록 양식에 방침 URL을 요구한다 — 애플은 링크가 깨진 것을 거절 사유로
 * 따로 적어 두고 있다. 심사 전날 발견하면 늦는 종류의 일이라 빌드가 늘
 * 함께 옮기게 한다. */
const PAGES = [["store/privacy.html", "privacy.html"]];

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

/* 커밋 전 실기기 확인도 새 배포다.
 *
 * 캐시 이름을 커밋만으로 정하면 같은 커밋에서 CSS를 고쳐 여러 번 만든
 * 테스트 번들이 모두 같은 서비스워커를 쓴다. 그러면 새 .ait를 열어도
 * 캐시에 남은 전 화면이 먼저 나와, 고친 UI를 고치지 않은 것처럼 보인다.
 * 실제로 내보내는 소스 전체의 지문을 붙이면 내용이 달라질 때만 새 캐시가
 * 생기고, 커밋하지 않은 실기기 빌드도 서로 정확히 구분된다. */
function addToHash(hash, src, label) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(src).sort()) {
      addToHash(hash, path.join(src, name), `${label}/${name}`);
    }
    return;
  }
  hash.update(label);
  hash.update("\0");
  hash.update(fs.readFileSync(src));
  hash.update("\0");
}

function cacheVersion() {
  const hash = crypto.createHash("sha256");
  for (const file of FILES) {
    if (file === "build-info.js" || BUNDLES.some(([, to]) => to === file)) continue;
    addToHash(hash, path.join(ROOT, file), file);
  }
  for (const dir of DIRS) addToHash(hash, path.join(ROOT, dir), dir);
  for (const [from] of BUNDLES) addToHash(hash, path.join(ROOT, from), from);
  for (const [from] of PAGES) addToHash(hash, path.join(ROOT, from), from);
  return `${info.commit || "dev"}-${hash.digest("hex").slice(0, 10)}`;
}

const cacheTag = cacheVersion();
fs.writeFileSync(
  path.join(ROOT, "build-info.js"),
  `/* 빌드할 때 자동으로 만들어집니다 — 직접 고치지 마세요 (scripts/build.js) */\n` +
    `window.BUILD = ${JSON.stringify(info)};\n`
);

/* 로컬에서 index.html을 직접 열어도 SDK 파일이 빠지지 않게 루트에 만든 뒤,
 * 다른 웹 자산과 똑같이 www/로 복사한다. 생성물은 git에 넣지 않는다. */
for (const [from, to] of BUNDLES) {
  esbuild.buildSync({
    entryPoints: [path.join(ROOT, from)],
    outfile: path.join(ROOT, to),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    minify: true,
  });
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let copied = 0;
for (const file of FILES) {
  const src = path.join(ROOT, file);
  if (!fs.existsSync(src)) {
    console.warn(`  건너뜀 (없음): ${file}`);
    continue;
  }
  if (file === "sw.js") {
    /* 서비스워커의 캐시 이름(VERSION)을 배포 소스 지문으로 박는다.
     *
     * VERSION이 그대로면 sw.js가 바이트 단위로 같아 브라우저가 '새 워커'로
     * 알아채지 못하고, 그러면 install/activate가 다시 돌지 않아 옛 캐시가
     * 남는다. 배포마다 사람이 손으로 v5→v6로 올리는 걸 잊으면 사용자가
     * 옛 화면에 갇힌다. 소스 지문을 박으면 실제 내용이 달라진 배포마다 새
     * 워커가 돌고 옛 캐시가 정리된다. 소스의 리터럴은 그대로 둬(직접 열어
     * 보는 개발용), www/로 나갈 때만 바꾼다. */
    const sw = fs.readFileSync(src, "utf8");
    fs.writeFileSync(
      path.join(OUT, file),
      sw.replace(/const VERSION = "[^"]*";/, `const VERSION = "${cacheTag}";`)
    );
  } else {
    fs.copyFileSync(src, path.join(OUT, file));
  }
  copied += 1;
}
for (const dir of DIRS) {
  const src = path.join(ROOT, dir);
  if (fs.existsSync(src)) copyDir(src, path.join(OUT, dir));
}

for (const [from, to] of PAGES) {
  const src = path.join(ROOT, from);
  if (!fs.existsSync(src)) {
    console.warn(`  건너뜀 (없음): ${from}`);
    continue;
  }
  fs.copyFileSync(src, path.join(OUT, to));
  copied += 1;
}

console.log(`www/ 준비 완료 — 파일 ${copied}개 + ${DIRS.join(", ")} · ${info.channel} ${info.commit}`);
