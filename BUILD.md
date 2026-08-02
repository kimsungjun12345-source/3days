# 앱으로 빌드하기

웹 코드 한 벌로 웹·iOS·안드로이드를 모두 냅니다. Capacitor가 웹 자산을
네이티브 앱 안에 담고, 햅틱·알림·공유 같은 것만 OS 기능으로 연결합니다.

## 구조

```
index.html, app.js, style.css …   ← 앱 본체 (웹에 그대로 올려도 동작)
native.js                          ← 앱으로 감쌌을 때만 켜지는 다리
scripts/build.js                   ← 웹 자산을 www/ 로 모음
capacitor.config.json              ← 앱 이름·아이디·플러그인 설정
android/, ios/                     ← 네이티브 프로젝트
```

`npm run build`가 `www/`를 만들고, `npx cap sync`가 그것을 네이티브 프로젝트로
복사합니다. **네이티브 코드를 직접 만질 일은 거의 없습니다.**

## 준비물

- Node.js 18 이상
- **iOS**: macOS + Xcode 15 이상, CocoaPods (`sudo gem install cocoapods`)
- **안드로이드**: Android Studio (JDK 17 포함)

```bash
npm install
```

## 실행

```bash
npm run ios       # www 빌드 → 동기화 → Xcode 열기
npm run android   # www 빌드 → 동기화 → Android Studio 열기
```

Xcode/Android Studio가 열리면 기기를 고르고 실행 버튼을 누르면 됩니다.
웹 코드만 고쳤을 때는 `npm run sync` 후 다시 실행하면 반영됩니다.

## 아이콘과 실행 화면

돌탑 그림을 각 플랫폼 크기로 다시 뽑습니다. 웹 아이콘과 같은 그림입니다.

```bash
node scripts/make-native-assets.js
```

Chromium 경로가 다르면 `CHROMIUM_PATH` 환경변수로 알려 주세요.
(Playwright를 설치했다면 `npx playwright install chromium` 후 그 경로를 씁니다.)

## 스토어에 올리기 전에

### 공통

- `capacitor.config.json`의 `appId`를 본인 도메인 기준으로 바꾸세요
  (지금은 `com.jaksimsamil.app`). 한번 정하면 바꾸기 어렵습니다.
- 버전은 `package.json`이 아니라 각 네이티브 프로젝트에서 관리합니다.

### iOS

1. Xcode → 프로젝트 설정 → Signing & Capabilities에서 팀 선택
2. **Push Notifications는 켜지 않아도 됩니다** — 이 앱은 서버 없이
   기기 안에서 예약하는 로컬 알림만 씁니다
3. Info.plist에 한국어를 기본 언어로 두면 심사에서 설명이 매끄럽습니다
4. Product → Archive → App Store Connect 업로드
5. 애플 개발자 프로그램 연 $99

### 안드로이드

1. 서명 키 만들기
   ```bash
   keytool -genkey -v -keystore jaksimsamil.keystore \
     -alias jaksimsamil -keyalg RSA -keysize 2048 -validity 10000
   ```
   **이 파일과 비밀번호를 잃어버리면 같은 앱으로 업데이트할 수 없습니다.**
2. Android Studio → Build → Generate Signed Bundle (AAB)
3. Play Console 등록비 1회 $25

### 심사에서 자주 걸리는 것

- **알림 권한**: 왜 필요한지 앱 안에서 먼저 설명해야 합니다. 이 앱은
  설정 줄에 "저녁 9시에 조용히 알려드려요"라고 적어 두고, 사용자가
  토글을 켤 때만 권한을 요청합니다.
- **개인정보 처리방침**: 기록이 기기 안에만 있고 서버로 보내지 않더라도
  스토어에는 방침 URL이 필요합니다. "수집하는 정보 없음"이라도 문서는
  있어야 합니다.
- **데이터 안전 양식**(Play): 수집 항목 없음으로 신고하면 됩니다.

## 알림이 동작하는 방식

서버가 없어도 리텐션 장치가 돌아갑니다. 앱을 열 때마다 예약된 알림을
전부 지우고 지금 상태를 보고 다시 짭니다(`native.js`의
`rescheduleNotifications`).

- 오늘 얹을 돌이 남았고 저녁 9시가 지나지 않았으면 → 오늘 한 번
- 내일부터 사흘간 잔잔한 리마인더
- 마지막으로 돌을 얹은 뒤 3일 / 7일 / 16일째 → **돌아올 명분을 주는 알림**
  ("쌓아 둔 돌 N개는 그대로예요")

마지막 것이 이 앱의 핵심입니다. 다른 습관 앱은 연속 기록이 끊긴 사용자에게
보낼 말이 없지만, 이 앱은 무너진 다음을 위해 만들어졌으므로 그 알림이
잔소리가 아니라 제품 경험의 일부가 됩니다.

## 웹으로도 그대로

저장소 루트를 정적 호스팅에 올리면 그대로 PWA로 동작합니다
(GitHub Pages, Netlify, Vercel 등). `manifest.webmanifest`의 경로가
상대 경로라 하위 경로에 올려도 됩니다.

```bash
npx serve .     # 로컬 확인 (서비스 워커는 http/https에서만 등록됩니다)
```

## 테스트

```bash
npm test        # 앱 흐름 59개 + 설치·오프라인 18개
```
