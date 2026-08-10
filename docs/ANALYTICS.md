# 측정 설계 — 아직 구현하지 않음

이 문서는 **설계만** 적는다. 코드에는 아직 아무것도 들어가 있지 않고,
`package.json`에도 분석 SDK가 없다. 넣을 때가 되면 이 문서가 명세다.

## 왜 지금 정해 두는가

베타를 30명에게 돌리고 나면 "왜 남았고 왜 지웠는지"를 물어야 하는데,
그때 이벤트를 새로 설계하기 시작하면 이미 그 30명의 첫 3일은 지나가 있다.
측정하려는 것을 먼저 적어 두고, 붙이는 일은 한 번에 한다.

## 무엇을 알고 싶은가

이 앱이 다른 습관 앱과 다르다고 주장하는 지점은 하나다 — **무너진
다음에 돌아오는가.** 그러니 가장 중요한 수도 그것이다.

1. **첫 3일 완료율** — 만든 사람 중 몇이 돌 하나를 얹는가
2. **완주 후 48시간 안에 다음 3일을 시작한 비율** — 1번보다 중요하다.
   이게 낮으면 이 앱은 '3일짜리 앱'이지 습관 앱이 아니다
3. **끊긴 뒤 돌아온 비율** — 제품의 주장이 사실인지 여부

## 퍼널

```
app_first_open
  → goal_created
    → day_checked (day=1)
      → day_checked (day=2)
        → cycle_completed          ← 돌 하나
          → next_cycle_started     ← 여기가 진짜 관문
```

`day_checked`는 `day` 속성으로 1·2·3을 구분한다. 이벤트 이름을 셋으로
쪼개면 나중에 사이클 길이를 바꿀 때 이름까지 갈아야 한다.

## 이벤트

| 이름 | 언제 | 속성 |
|---|---|---|
| `app_first_open` | 첫 실행 (온보딩 전) | — |
| `onboard_done` | 안내를 끝까지 봤을 때 | `skipped`(bool), `last_page`(int) |
| `goal_created` | 작심을 만들었을 때 | `goal_count`(만든 뒤 총 개수), `from_suggestion`(bool) |
| `goal_cap_hit` | 6개가 차서 만들기가 막혔을 때 | — |
| `day_checked` | '오늘 해냈어요' | `day`(1\|2\|3), `restarts_so_far` |
| `day_undone` | '오늘 표시 지우기' | — |
| `stone_picked` | 돌 모양을 골랐을 때 | `shape`(0\|1\|2), `stone_index` |
| `cycle_completed` | 3일을 채웠을 때 | `stone_index`, `restarts_so_far` |
| `next_cycle_started` | 다음 3일 시작 | `from`(`complete`\|`resting`\|`lapsed`), `hours_since_complete` |
| `cycle_broken` | 끊긴 상태(`broken`)를 처음 본 순간 | `checks_had`(1\|2), `days_missed` |
| `comeback_started` | 끊긴 뒤/오래 쉰 뒤 다시 시작 | `from`(`broken`\|`lapsed`), `days_away` |
| `tower_completed` | 돌 5개로 탑 한 채 | `tower_index` |
| `notification_opt_in` | 알림 토글을 켰을 때 | `granted`(bool) |
| `notification_opened` | 알림을 눌러 앱에 들어옴 | `kind`(`today`\|`last_day`\|`comeback`) |
| `share_tapped` | 공유 버튼 | `stones`, `restarts` |
| `goal_deleted` | 작심 지우기 | `total_days`, `stones` |
| `data_exported` / `data_imported` | 백업 | `goal_count` |

`comeback_started`는 `next_cycle_started`와 겹친다(`from=lapsed`인 경우).
겹치게 두는 이유는 이 앱에서 가장 중요한 수라 따로 세는 편이 질의가
단순하기 때문이다. 중복 집계에 주의할 것.

## 보내지 않는 것

- **작심 제목** — 사용자가 직접 쓴 글이다. 절대 보내지 않는다.
  아이콘 키(`water`, `run` 같은 고정 목록)는 보내도 된다.
- 날짜 원본(`history`, `checks`) — 기간 계산만 보낸다
- 기기 식별자, 광고 ID, 위치, 연락처
- 내보낸 파일의 내용

## 지켜야 할 것

**측정이 제품을 바꾸면 안 된다.** 이 앱은 조용한 것이 장점이라, 이벤트를
붙인다고 화면에 무언가가 늘어나서는 안 된다.

**꺼도 앱이 돌아가야 한다.** 네트워크가 없어도 앱은 완전히 동작하고
(PWA·오프라인이 그 근거다), 분석이 실패해도 그대로여야 한다. 큐에 쌓아
두고 실패하면 조용히 버린다.

**동의 없이는 켜지 않는다.** 현재 `store/privacy.html`은 "광고 SDK, 분석
도구, 추적 기술을 쓰지 않는다"고 적고 있다. 하나라도 붙이는 순간
**개인정보처리방침을 먼저 고쳐야 한다.** 문서가 거짓이 되는 것은 기능
하나 늦추는 것보다 훨씬 큰 문제다.

## 붙일 때 확인할 것

- [ ] `store/privacy.html`의 "분석 도구를 쓰지 않는다" 문단 수정
- [ ] Play 데이터 안전 양식 다시 신고 (지금은 '수집 항목 없음')
- [ ] App Store 개인정보 라벨 갱신
- [ ] 이벤트에 제목·자유 입력이 섞여 들어가지 않는지 검사로 못 박기
