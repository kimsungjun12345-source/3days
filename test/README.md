# 테스트

실제 브라우저로 앱을 띄워 확인하는 검사들입니다.

```bash
npm install
npm test              # 셋 다 (커밋 전 필수)

node test/smoke.js    # 앱 흐름 59개
node test/pwa.js      # 설치·오프라인 18개 (임시 서버를 직접 띄웁니다)
node test/contrast.js # 밝기 조합 4가지 × 모든 화면의 글자 명암비
```

Chromium은 `scripts/chrome.js`가 알아서 찾습니다 — playwright-core가 받아 둔
것을 먼저 보고, 없으면 브라우저 보관함을 뒤집니다. 다른 것을 쓰게 하려면
`CHROMIUM_PATH=/실행/파일/경로`로 지정하세요.

- `smoke.js` — 작심 추가/삭제, 하루 1회 체크, 3일 완주와 축하 화면,
  완주 후 상태 흐름(당일 / 다음 날 / 방치), 돌탑 정원, 기록 화면,
  내보내기·가져오기, 공유 카드
- `pwa.js` — 매니페스트와 아이콘, 서비스 워커 등록, 앱 셸 캐싱,
  네트워크가 끊긴 상태에서의 실행·기록·재실행, iOS 설치 안내
