/* 웹 소스를 www/ 로 모은다.
 *
 * 소스는 저장소 루트에 그대로 두고(그래야 GitHub Pages 같은 정적 호스팅에
 * 바로 올릴 수 있다), Capacitor가 네이티브 앱에 넣을 자산만 www/ 로 복사한다.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "www");

const FILES = [
  "index.html",
  "style.css",
  "app.js",
  "icons.js",
  "share.js",
  "pwa.js",
  "native.js",
  "sw.js",
  "manifest.webmanifest",
];

const DIRS = ["icons"];

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
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
  fs.copyFileSync(src, path.join(OUT, file));
  copied += 1;
}
for (const dir of DIRS) {
  const src = path.join(ROOT, dir);
  if (fs.existsSync(src)) copyDir(src, path.join(OUT, dir));
}

console.log(`www/ 준비 완료 — 파일 ${copied}개 + ${DIRS.join(", ")}`);
