/* Apps in Toss SDK 연결.
 *
 * 토스 안에서는 Capacitor의 기기 로컬 알림을 쓸 수 없다. 대신 콘솔에서
 * 예약한 스마트 발송의 수신 동의를 Toss SDK로 받아야 한다. 이 파일은
 * scripts/build.js가 브라우저용 한 파일(toss-sdk.js)로 묶는다.
 *
 * 행동 분석도 같은 SDK로 보낸다. 이벤트 허용목록과 파라미터 검사는
 * analytics.js에서 먼저 끝내므로 여기에는 사용자가 입력한 글이 들어오지 않는다. */
import { Analytics, Notification } from "@apps-in-toss/web-framework";

const TEMPLATE_CODE = "setdolhana-daily-goal";

function isSupported() {
  try {
    return Notification.requestAgreement.isSupported();
  } catch (e) {
    return false;
  }
}

function requestAgreement() {
  return new Promise((resolve) => {
    let cleanup = () => {};
    const finish = (result) => {
      cleanup();
      resolve(result);
    };

    try {
      cleanup = Notification.requestAgreement({
        options: { templateCode: TEMPLATE_CODE },
        onEvent: ({ type }) => finish(type),
        onError: () => finish("error"),
      });
    } catch (e) {
      finish("error");
    }
  });
}

/* build.js가 토스 번들에만 data-platform="toss"를 넣는다. SDK 번들은 공통
 * 웹 자산으로 같이 복사되지만, Android·웹에서는 토스 알림/분석 객체를 아예
 * 열지 않아 잘못된 브리지를 호출할 여지를 없앤다. */
const IS_TOSS_PLATFORM = document.documentElement.dataset.platform === "toss";

if (IS_TOSS_PLATFORM) {
  window.TossNotification = { isSupported, requestAgreement };
}

function logEvent(name, params) {
  try {
    const sent = Analytics.log({
      log_type: "event",
      log_name: name,
      params,
    });
    // 지원하지 않는 토스 버전이나 브리지 오류가 앱 동작에 영향을 주지 않게 한다.
    if (sent && typeof sent.catch === "function") sent.catch(() => {});
  } catch (e) {
    // 분석은 부가 기능이다. 실패해도 사용자의 작심 기록 흐름은 계속되어야 한다.
  }
}

if (IS_TOSS_PLATFORM) {
  window.TossAnalytics = { logEvent };
}
