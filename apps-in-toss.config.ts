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

export default defineConfig({
  appName: "setdolhana",
  brand: {
    primaryColor: "#ce4a3a",
  },
  webView: {},
  permissions: [],
  webBundleDir: "www",
});
