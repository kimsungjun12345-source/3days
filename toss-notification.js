/* Apps in Toss 알림 동의 연결.
 *
 * 토스 안에서는 Capacitor의 기기 로컬 알림을 쓸 수 없다. 대신 콘솔에서
 * 예약한 스마트 발송의 수신 동의를 Toss SDK로 받아야 한다. 이 파일은
 * scripts/build.js가 브라우저용 한 파일(toss-sdk.js)로 묶는다. */
import { Notification } from "@apps-in-toss/web-framework";

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

window.TossNotification = { isSupported, requestAgreement };
