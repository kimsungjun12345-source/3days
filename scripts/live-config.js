/* 화면만 웹에서 받아오는 '살아있는 빌드'를 만든다 — 테스트 전용.
 *
 * 왜 필요한가: 글자 하나 고칠 때마다 4.5MB APK를 다시 받아 설치하는 건
 * 피드백 주기를 통째로 잡아먹는다. 앱 껍데기(네이티브 플러그인·알림·햅틱)는
 * 그대로 두고 화면만 웹에서 불러오게 하면, 한 번 설치한 뒤로는 앱을 다시
 * 열기만 해도 최신 화면이 뜬다.
 *
 * 스토어에 올릴 빌드에는 절대 쓰지 않는다. 이 설정이 들어간 앱은 화면을
 * 네트워크에서 받으므로, 심사 기준으로도 사용자 경험으로도 맞지 않는다.
 * 그래서 설정 파일을 영구히 고치지 않고, CI에서 빌드 직전에만 덮어쓴다.
 *
 *   node scripts/live-config.js https://example.com/3days/
 *   node scripts/live-config.js --revert
 */

const fs = require("fs");
const path = require("path");

const CONFIG = path.resolve(__dirname, "..", "capacitor.config.json");
const arg = process.argv[2];

if (!arg) {
  console.error("쓸 주소가 없습니다.  node scripts/live-config.js <url>");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));

if (arg === "--revert") {
  delete config.server;
  fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2) + "\n");
  console.log("화면을 다시 앱 안에서 읽습니다.");
  process.exit(0);
}

let url;
try {
  url = new URL(arg);
} catch (e) {
  console.error(`주소를 알아볼 수 없습니다: ${arg}`);
  process.exit(1);
}

// http로 열어 두면 중간에서 화면을 갈아끼울 수 있다. 테스트 빌드라도 막는다.
if (url.protocol !== "https:") {
  console.error(`https만 받습니다: ${arg}`);
  process.exit(1);
}

config.server = {
  url: url.href,
  // 첫 실행에 네트워크가 없으면 빈 화면이 된다. 한 번 열고 나면
  // 서비스 워커가 받아 둔 것으로 오프라인에서도 그대로 동작한다.
  cleartext: false,
};

fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2) + "\n");
console.log(`화면을 ${url.href} 에서 받아옵니다.`);
