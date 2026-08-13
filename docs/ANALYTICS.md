# 측정

## 지금 어디까지 되어 있나

**1단계 — 계측 계층 (완료).** `analytics.js`가 이벤트 허용목록과 파라미터
타입 제한을 들고 있고, `app.js`·`native.js`에서 부르고 있다. Firebase
플러그인이 없으면 조용히 버린다.

**2단계 — 실제 전송 (완료, Android).** `@capacitor-firebase/analytics`를
붙였고 `android/app/google-services.json`이 들어와 있다. 개인정보 처리방침도
같은 커밋에서 함께 바꿨다. iOS는 `GoogleService-Info.plist`가 준비되면
같은 방식으로 켜진다(아래 참고).

## 무엇을 알고 싶은가

이 앱이 다른 습관 앱과 다르다고 주장하는 지점은 하나다 — **무너진
다음에 돌아오는가.** 그러니 가장 중요한 수도 그것이다.

```
first_open → goal_created → day_checked(1) → day_checked(2)
           → cycle_completed → next_cycle_started   ← 진짜 관문
                            ↘ cycle_broken → comeback_started
```

1. **첫 3일 완료율** — 만든 사람 중 몇이 돌 하나를 얹는가
2. **완주 후 다음 사이클 진입률** — 1번보다 중요하다. 이게 낮으면 이 앱은
   '3일짜리 앱'이지 습관 앱이 아니다
3. **끊긴 뒤 돌아온 비율** — 제품의 주장이 사실인지 여부

## 이벤트 (구현된 그대로)

| 이름 | 언제 | 파라미터 | 부르는 곳 |
|---|---|---|---|
| `first_open` | 처음 연 날 한 번 | — | **Firebase 자동** (아래 참고) |
| `goal_created` | 작심을 만들었을 때 | — | `addGoal()` |
| `day_checked` | 칸 하나를 채웠을 때 | `day_number` (1·2·3) | `checkToday()` |
| `cycle_completed` | 세 칸을 다 채웠을 때 | — | `checkToday()` |
| `next_cycle_started` | 완주 뒤 이어서 시작 | — | `nextCycle()` |
| `cycle_broken` | 끊긴 상태를 처음 그릴 때 | — | `renderGoalCard()` |
| `comeback_started` | 끊긴 뒤 / 오래 쉰 뒤 다시 시작 | — | `restart()`, `nextCycle("lapsed")` |
| `notification_opt_in` | 알림을 켰을 때 | — | `native.js` |
| `share_tapped` | 공유를 눌렀을 때 | — | `app.js` |

**`first_open`은 우리가 보내지 않는다.** Firebase가 첫 실행을 자동으로
세고, `first_open`은 예약어라 손으로 `logEvent`를 부르면 SDK가 거부한다.
두 번 세지 않으려고 자동 수집에 맡긴다 — 콘솔의 퍼널 첫 칸은 그대로
채워진다. 같은 이유로 `session_start`, `user_engagement`도 Firebase가
알아서 붙인다.

**이어 간 것과 돌아온 것을 파라미터가 아니라 이름으로 갈랐다.** 이 둘이
이 앱에서 가장 자주 들여다볼 수라, 볼 때마다 조건을 붙이는 것보다 처음부터
따로 서는 편이 낫다.

`cycle_broken`은 누르는 순간이 없다 — 아무것도 안 한 결과라서, 셀 수 있는
자리가 그 상태를 화면에 그리는 때뿐이다. 홈을 열 때마다 세면 '무너진 횟수'가
아니라 '앱을 연 횟수'가 되므로, 사이클당 한 번만 센다
(`jaksim3.brokenSeen`).

## 보내지 않는 것

- **작심 제목** — 사용자가 직접 쓴 글이다
- 이름 · 이메일 · 전화번호 · 그 밖의 자유 입력
- 날짜 원본(`history`, `checks`)
- 기기 식별자를 앱이 따로 만들어 붙이는 일
- 광고 SDK와 맞춤형 광고 — **이번 버전에 넣지 않는다**

### 광고 ID(AD_ID)는 우리가 넣은 것이 아니다

우리 `AndroidManifest.xml`에는 `AD_ID` 선언이 없다. 그런데 최종 APK에는
들어간다 — Firebase Analytics의 measurement SDK가 자기 매니페스트에 그
권한을 들고 있고, 빌드할 때 병합되기 때문이다.

그래서 Play Console의 '광고 ID' 선언은 **예**로 답한다. 실제 빌드에 권한이
있는데 아니라고 하면 선언과 아티팩트가 어긋나 버전이 차단된다. 대신 사용
목적에서는 **애널리틱스만** 체크하고 광고·마케팅은 체크하지 않는다 —
구글도 광고 ID를 분석 용도로 쓰는 경우를 인정한다.

#### 끄는 길도 있다 — 못 하는 게 아니라 안 한 것

Firebase는 Analytics를 그대로 두고 **광고 ID 수집만 끄는 공식 설정**을
제공한다. 매니페스트의 `<application>` 안에 이 한 줄이면 된다.

```xml
<meta-data android:name="google_analytics_adid_collection_enabled"
           android:value="false" />
```

이렇게 하면 Analytics는 계속 돌고 광고 ID만 안 쓴다. 그러면 Play 선언도
'아니요'가 되고 방침 문장도 다시 단순해진다(필요하면 병합된 AD_ID 권한도
`tools:node="remove"`로 뺀다). 구글도 광고가 아닌 분석 용도라면 App Set ID
같은 대안을 권한다.

이번에 택하지 않은 이유는 기술적 위험이 아니라 **시점** 하나다. 베타
테스터가 이미 받은 빌드가 있고, 이걸 바꾸려면 새 AAB를 올리고 테스트
흐름을 다시 건드려야 한다. 지금 그 값어치가 크지 않다.

**다음 앱에서는 이 설정을 처음부터 켜고 시작하는 편이 낫다.** 광고를 붙일
계획이 없는 앱이라면 방침도, 스토어 선언도 처음부터 단순해진다. 이 앱도
베타가 끝나고 손댈 일이 생기면 그때 같이 정리하면 된다.

### 다짐이 아니라 코드로 막는다

'조심해서 쓰자'는 반년 뒤에 반드시 깨진다. 급할 때 파라미터 하나 얹는
것은 너무 쉬운 일이라서. 그래서 `analytics.js`가 세 겹으로 막는다.

1. 허용목록에 없는 **이벤트 이름**은 나가지 않는다
2. 이벤트마다 허용된 **파라미터 키**만 통과한다
3. 값은 **숫자와 참·거짓만** 된다 — 문자열은 타입에서 막힌다

3번이 핵심이다. 사용자가 쓴 것은 전부 문자열이므로, 문자열을 통째로 막아
두면 실수로 제목을 실어 보내는 일 자체가 성립하지 않는다. 이 세 겹은
`test/smoke.js`가 검사한다 — 제목을 허용된 키에 실어도 빈 객체가 나오는지까지.

## 붙이는 절차

### Android — 끝났다

- `@capacitor-firebase/analytics`와 `firebase`를 설치했다
- `android/app/google-services.json`이 들어와 있다 (패키지 `com.trevicode.setdolhana`)
- `npx cap sync android`로 플러그인을 배선했다
- `store/privacy.html`을 같은 흐름에서 함께 고쳤다 (분석 도구 문단·리드·수집 항목)

`google-services.json`은 비밀 키가 아니라 앱에 박혀 배포되는 설정이므로
저장소에 커밋한다. 다만 **키스토어와 헷갈리지 말 것** — 그쪽은 절대
커밋하면 안 된다.

`android/app/build.gradle`에는 `google-services.json`이 있을 때만 플러그인을
켜는 블록이 들어 있다(Capacitor가 만들어 둔 것). 파일이 있으니 켜졌다.

`analytics.js`는 `window.Capacitor.Plugins.FirebaseAnalytics`가 보이면
그쪽으로 넘긴다. 웹(브라우저)에서는 이 플러그인이 없으므로 그대로 no-op다 —
검사가 브라우저에서 도는데도 깨지지 않는 이유다.

### iOS — 나중에

TestFlight 준비가 될 때:

1. Firebase 콘솔에서 **iOS 앱 추가** → 번들 ID `com.trevicode.setdolhana`
   → `GoogleService-Info.plist` 내려받기 → `ios/App/App/`에 놓기
2. `npx cap sync ios`
3. iOS는 SPM을 쓰므로, 플러그인이 Firebase iOS SDK를 함께 끌어온다.
   `AppDelegate`에서 `FirebaseApp.configure()`가 필요한지 그때 확인한다
   (플러그인이 자동 초기화하면 생략)

## 스토어 신고

SDK를 붙이는 순간 두 스토어의 답변이 달라진다. **지금 상태(SDK 없음)에서는
'수집 항목 없음'이 사실이고, 붙인 뒤에는 아래대로 바꿔야 한다.**

### Google Play — 데이터 보안 (Data Safety)

| 질문 | 답 |
|---|---|
| 데이터를 수집·공유하는가 | **예** (Firebase Analytics) |
| 앱 활동 → 앱 상호작용 | 수집함. 목적: 분석 |
| 기기 또는 기타 ID | 수집함 (Firebase의 앱 인스턴스 ID). 목적: 분석 |
| 위치(대략적) | Firebase가 IP로 도시 수준을 유추한다 — 콘솔에서 끄지 않았다면 **수집함**으로 신고 |
| 전송 중 암호화 | 예 |
| 삭제 요청 경로 | 있음 (문의 이메일로 접수) |
| 제3자 공유 | Google을 처리자로 사용. '공유'가 아니라 '수집'으로 신고 |
| 광고 목적 사용 | **아니오** |
| 광고 ID 선언 (별도 폼) | **예** — 빌드에 AD_ID 권한이 병합돼 있다(위 참고). 목적은 **애널리틱스만** 체크, 광고·마케팅은 체크하지 않는다 |

> Google이 Firebase 전용 데이터 보안 안내 문서를 따로 낸다. 제출 직전에
> 그 문서와 대조할 것 — 위 표는 우리 구현 기준의 초안이고, 양식의 문구는
> 종종 바뀐다.

### Apple — App Privacy

| 항목 | 답 |
|---|---|
| Usage Data → Product Interaction | 수집. 용도: Analytics. **사용자에 연결되지 않음** |
| Identifiers → Device ID | 수집(앱 인스턴스 ID). 용도: Analytics. 사용자에 연결되지 않음 |
| Tracking (ATT) | **아니오** — 광고 SDK도 IDFA도 쓰지 않는다 |

**AdSupport / IDFA를 링크하지 말 것.** Firebase Analytics만 쓰고 광고를
붙이지 않으면 ATT 동의 창을 띄울 이유가 없다. 광고 관련 프레임워크가
딸려 들어오면 그 순간 ATT가 필요해지고, 심사 답변도 전부 달라진다.

## 지켜야 할 것

**측정이 제품을 바꾸면 안 된다.** 이 앱은 조용한 것이 장점이라, 이벤트를
붙인다고 화면에 무언가가 늘어나서는 안 된다.

**꺼져도 앱이 돌아가야 한다.** 네트워크가 없어도 앱은 완전히 동작하고
(PWA·오프라인이 그 근거다), 분석이 실패해도 그대로여야 한다. `track()`이
예외를 삼키는 이유다.
