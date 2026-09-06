/* 홈 화면에 두기 — 설치 안내와 서비스 워커 등록.
 *
 * 안드로이드/크롬은 beforeinstallprompt로 설치 시트를 띄울 수 있지만,
 * iOS 사파리는 그런 이벤트가 없어 '공유 → 홈 화면에 추가'를 직접 알려 줘야 한다.
 */

const INSTALL_DISMISS_KEY = "jaksim3.installDismissed";

let deferredInstall = null;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // 아이패드는 데스크톱 사파리로 위장하므로 터치 지원으로 가려낸다
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function setupInstall() {
  const card = document.getElementById("btn-install");
  const sub = document.getElementById("install-sub");
  const icon = card && card.querySelector(".install-icon");
  if (!card) return;

  if (icon && typeof iconSVG === "function") icon.innerHTML = iconSVG("stone", 20);

  // 이미 설치했거나 한 번 닫았으면 다시 권하지 않는다
  const hidden = isStandalone() || localStorage.getItem(INSTALL_DISMISS_KEY) === "1";

  window.addEventListener("beforeinstallprompt", (ev) => {
    ev.preventDefault();
    deferredInstall = ev;
    if (!hidden) card.hidden = false;
  });

  // iOS는 설치 이벤트가 없으니 방법을 글로 알려 준다
  if (isIOS() && !hidden) {
    sub.textContent = "사파리 공유 버튼 → '홈 화면에 추가'를 눌러 주세요";
    card.hidden = false;
    card.dataset.ios = "1";
  }

  card.addEventListener("click", async () => {
    if (card.dataset.ios === "1") {
      localStorage.setItem(INSTALL_DISMISS_KEY, "1");
      card.hidden = true;
      return;
    }
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const choice = await deferredInstall.userChoice;
    deferredInstall = null;
    card.hidden = true;
    if (choice && choice.outcome !== "accepted") {
      localStorage.setItem(INSTALL_DISMISS_KEY, "1");
    }
  });

  window.addEventListener("appinstalled", () => {
    card.hidden = true;
    localStorage.setItem(INSTALL_DISMISS_KEY, "1");
    if (typeof toast === "function") toast("stone", "홈 화면에 뒀어요. 내일 여기서 만나요");
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // file://로 열었을 때는 등록이 불가능하니 조용히 넘어간다
  if (location.protocol !== "http:" && location.protocol !== "https:") return;

  /* AIT는 앱 파일을 번들 자체가 제공한다. 같은 origin에서 여러 테스트
   * deployment를 여는 동안 PWA 서비스워커가 이전 CSS·JS를 먼저 반환하면
   * 새 버전의 UI가 한 번 늦게 보인다. 토스에서는 등록하지 않고, 과거에
   * 남긴 우리 서비스워커와 캐시도 정리한다. 빌드가 붙인 ?v= 지문 덕분에
   * 이 정리 전 첫 화면도 반드시 현재 번들의 파일을 읽는다. */
  if (document.documentElement.dataset.platform === "toss") {
    window.addEventListener("load", async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((key) => key.startsWith("jaksim3-")).map((key) => caches.delete(key)));
        }
      } catch {
        /* 캐시 정리에 실패해도 버전별 URL이 현재 파일을 보장한다. */
      }
    });
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* 등록에 실패해도 앱은 그대로 동작한다 */
    });
  });
}

setupInstall();
registerServiceWorker();
