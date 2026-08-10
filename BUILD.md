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

- Node.js 22 이상 (Capacitor 8 CLI가 요구하는 버전 — `package.json`의
  `engines`와 CI가 모두 22를 쓴다)
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

### 고칠 때마다 다시 설치하지 않기

화면 문구 하나 고칠 때마다 4.5MB APK를 다시 받아 설치하면 피드백 주기가
통째로 잡아먹힙니다. 다시 설치하지 않는 길이 세 가지 있습니다.

**1. 라이브 리로드 (내 컴퓨터가 있을 때 — 가장 빠름)**

```bash
npm run build
npx cap run android --livereload --external
```

폰과 컴퓨터가 같은 Wi-Fi에 있으면, 앱이 컴퓨터의 개발 서버에서 화면을
받아옵니다. 파일을 고치는 즉시 앱이 새로고침됩니다. 설치는 처음 한 번뿐입니다.

원격에서 작업한 내용을 받아 볼 때도 같습니다. 서버를 켜 둔 채로

```bash
git pull
npm run build
```

하면 앱이 알아서 새 화면을 집어 옵니다. 개발 서버를 끄면 앱은 마지막으로
받아 둔 화면을 그대로 씁니다(서비스 워커 덕분입니다).

**2. USB로 바로 설치 (컴퓨터는 있지만 라이브 리로드까지는 필요 없을 때)**

폰에서 개발자 옵션 → USB 디버깅을 켜고 연결한 뒤 Android Studio의 실행
버튼을 누릅니다. 받아서 여는 과정이 없어 몇 초면 끝납니다.

**3. 화면만 웹에 올려 두기 (컴퓨터 없이, 폰만으로)**

`.github/workflows/pages.yml`이 화면을 정적 호스팅에 올립니다. 그 주소를
저장소 변수 `LIVE_URL`에 넣어 두면 `android.yml`이 '살아있는 빌드'
(`jaksimsamil-live-*.apk`)를 함께 만듭니다. 이걸 한 번만 설치하면 그 뒤로는
**앱을 다시 여는 것만으로** 최신 화면이 뜹니다.

이 워크플로는 **손으로 돌릴 때만** 실행됩니다 (Actions 탭 → 웹 배포 →
Run workflow). Pages 준비가 안 된 상태에서 푸시마다 돌면 실패 알림만
쌓이고, 그러다 보면 진짜 실패도 같이 묻히기 때문입니다. 준비가 끝나면
파일 안의 push 트리거 주석을 풀면 자동으로 올라갑니다.

- 저장소 Settings → Pages → Source 를 "GitHub Actions"로
- 비공개 저장소라면 GitHub Pro 이상이 필요합니다 (또는 저장소를 공개로)
- 주소를 Settings → Secrets and variables → Actions → Variables 에
  `LIVE_URL`로 저장

이 설정은 스토어 빌드에 절대 들어가지 않습니다. CI가 빌드 직전에만
`scripts/live-config.js`로 덮어쓰고 곧바로 되돌립니다.

> 주의: 화면을 앱 안에서 읽던 빌드와 웹에서 받아오는 빌드는 출처(origin)가
> 달라서 저장된 기록을 공유하지 않습니다. 옮기기 전에 설정 → 기록 내보내기로
> 파일을 받아 두고, 새 빌드에서 가져오기 하세요.

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

### 안드로이드 — 맥 없이도 됩니다

안드로이드는 윈도우·리눅스에서 그대로 빌드됩니다. 로컬에 아무것도 깔지
않고 **GitHub Actions로만** 낼 수도 있습니다.

#### 1. 서명 키 만들기 (한 번만)

```bash
keytool -genkey -v -keystore jaksimsamil.keystore \
  -alias jaksimsamil -keyalg RSA -keysize 2048 -validity 10000
```

**이 파일과 비밀번호를 잃어버리면 같은 앱으로 업데이트할 수 없습니다.**
비밀번호 관리자에 함께 보관하세요.

#### 2. GitHub Actions로 빌드 (권장)

저장소 Settings → Secrets and variables → Actions에 네 가지를 넣습니다.

| 이름 | 값 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 jaksimsamil.keystore` 결과 (macOS는 `base64 -i`) |
| `ANDROID_KEYSTORE_PASSWORD` | 키스토어 비밀번호 |
| `ANDROID_KEY_ALIAS` | `jaksimsamil` |
| `ANDROID_KEY_PASSWORD` | 키 비밀번호 |

그다음 릴리스 태그를 밀면 서명된 AAB가 나옵니다.

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Actions 탭 → 해당 실행 → Artifacts에서 `jaksimsamil-release-aab`를 받아
Play Console에 올리면 됩니다.

#### 폰에 설치해 보기 (시크릿 없이도 됩니다)

푸시할 때마다 디버그 APK가 만들어지고, **저장소 Releases의
`latest-debug`가 최신 빌드로 갱신**됩니다.

폰에서:

1. 브라우저로 저장소 → **Releases** → **최신 테스트 빌드**
2. 목록의 `.apk` 파일을 누르면 바로 내려받아집니다
3. 알림을 눌러 설치 (처음 한 번 "이 출처의 앱 설치 허용" 필요)

> **깃허브 모바일 앱에서는 Actions 아티팩트를 받을 수 없습니다.**
> 앱은 빌드 상태만 보여 주고 다운로드를 제공하지 않습니다.
> 그래서 릴리스에 올려 두는 것이고, 앱에서도 Releases 화면의 파일을 누르면
> 브라우저로 넘어가 받아집니다. PC에서 받을 때는 Actions → Artifacts를
> 쓰셔도 됩니다(zip으로 받아 풀어야 합니다).

#### 3. 로컬에서 빌드하려면

Android Studio를 설치한 뒤 `npm run android` → Build → Generate Signed Bundle.

#### 4. Play Console

등록비 1회 $25. 첫 출시 전에 준비할 것:

- 앱 아이콘 512×512 (`icons/icon-512.png`)
- 스크린샷 최소 2장 (`store/screenshots/android/`)
- 짧은 설명·전체 설명 (`store/LISTING.md`)
- 개인정보 처리방침 URL (`store/privacy.html`을 호스팅)
- 데이터 안전 양식: **수집 항목 없음**으로 신고

#### 버전 올리기

`android/app/build.gradle`의 `versionCode`(정수, 매번 +1)와
`versionName`(사람이 읽는 버전)을 함께 올립니다. Play는 같은
`versionCode`를 두 번 받지 않습니다.

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
npm test        # 앱 흐름 · 설치와 오프라인 · 글자 명암비
```

세 벌로 나뉘어 있습니다.

| 파일 | 보는 것 |
|---|---|
| `test/smoke.js` | 앱 흐름 전체 — 돌 쌓기, 무너짐, 다시 쌓기, 안내, 정원, 개발자 도구 |
| `test/pwa.js` | 설치·오프라인 — 서비스 워커, 매니페스트, 네트워크 없이 열리는지 |
| `test/contrast.js` | 밝은/어두운 화면 16장의 모든 글자가 읽히는지 (WCAG AA) |
