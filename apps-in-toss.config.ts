/* App in Toss(토스 미니앱) 패키징 설정.
 *
 * 셋돌하나는 빌드 도구 없는 정적 웹앱이고, `npm run build`가 www/에 웹·PWA용
 * 정적 번들을 이미 만든다. App in Toss는 그 정적 번들을 WebView 미니앱으로
 * 감싸 배포한다 — 그래서 webBundleDir를 새로 만들지 않고 www/를 그대로 가리킨다.
 *
 * 흐름:  npm run build   → www/ 생성 (기존)
 *        npx ait build   → www/를 토스 WebView 번들로 감쌈
 *        npx ait deploy  → 콘솔로 업로드 (토스 로그인 필요)
 *
 * appName은 App in Toss 콘솔에 등록한 앱 식별자와 같아야 한다(콘솔에서
 * 정한 값으로 맞출 것). primaryColor는 앱 accent(코랄)와 맞췄다.
 */
import { defineConfig } from "@apps-in-toss/web-framework/config";

/* SDK 3.x의 공개 타입은 primaryColor만 적고 있지만, 번들 검수에서는
 * 내비게이션 바 브랜드명이 콘솔의 앱 정보와 같은지 bundle metadata로도
 * 확인한다. 별도 변수로 두면 3.x 타입과 구조적으로 호환되면서, 빌드 결과에는
 * 콘솔에 승인된 표시 이름과 아이콘이 그대로 포함된다. */
const brand = {
  displayName: "셋돌하나",
  primaryColor: "#ce4a3a",
  icon: "https://static.toss.im/appsintoss/80911/d6914d91-d0ab-4af7-b580-d3ab2de584d6.png",
};

export default defineConfig({
  appName: "setdolhana",
  brand,
  navigationBar: {
    withBackButton: true,
    withHomeButton: false,
    withTitle: true,
    transparentBackground: false,
  },
  webView: {},
  permissions: [],
  webBundleDir: "www",
});
