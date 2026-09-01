/* 작심삼일 서비스 워커 — 비행기 모드에서도 오늘의 돌을 얹을 수 있게.
 *
 * 앱 파일은 캐시를 먼저 쓰되 뒤에서 새 버전을 받아 두고(다음 실행에 반영),
 * 화면 문서는 네트워크를 먼저 시도해 업데이트가 바로 보이게 한다.
 * 기록은 localStorage에 있으므로 오프라인에서도 그대로 동작한다.
 */

// 이 리터럴은 개발용 기본값이다. www/로 빌드될 때 scripts/build.js가
// 배포 커밋으로 바꿔 박아, 배포마다 새 워커로 인식되고 옛 캐시가 정리된다.
const VERSION = "v5";
const APP_CACHE = `jaksim3-app-${VERSION}`;
const FONT_CACHE = `jaksim3-font-${VERSION}`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./build-info.js",
  "./style.css",
  "./fonts/gowun-batang/gowun-batang.css",
  "./analytics.js",
  "./app.js",
  "./icons.js",
  "./share.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      // 하나가 실패해도 설치 전체가 무산되지 않도록 개별로 담는다
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("jaksim3-") && k !== APP_CACHE && k !== FONT_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isFont(url) {
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 폰트: 한 번 받아 두면 다음부터는 오프라인에서도 같은 글꼴로 보인다
  if (isFont(url)) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok || res.type === "opaque") cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || network;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // 화면 문서: 새 버전을 먼저 시도하고, 안 되면 캐시로 연다
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(APP_CACHE).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // 나머지 앱 파일: 캐시를 먼저 주고 뒤에서 조용히 갱신한다
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(APP_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
