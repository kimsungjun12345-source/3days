# 테스트

앱을 실제 브라우저로 띄워 주요 흐름을 확인하는 스모크 테스트입니다.

```bash
npm install playwright-core
node test/smoke.js
```

Chromium 실행 파일 경로는 `smoke.js` 상단의 `executablePath`에 맞춰 조정하세요.
검증 항목: 목표 추가/삭제, 하루 1회 체크, 3일 완주와 축하 화면,
사이클 이월, 하루를 건너뛴 뒤 재시작, 누적 기록 보존.
