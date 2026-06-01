# 공유 (카카오 공유) 설정

동호회 상세의 **🔗 공유** 버튼은 `js/share.js`의 `shareClub()`이 처리한다.
**폴백 순서: ① OS 네이티브 공유(`navigator.share`) → ② 카카오 공유 카드(`Kakao.Share.sendDefault`) → ③ 링크 복사.**

공유 링크 형식: `https://nulloongzi.github.io/null_oongzi-do/?club=<id>`
링크를 열면 `js/app.js`의 `openDeepLinkClub()`이 `?club=` 파라미터를 읽어 해당 동호회 상세를 자동으로 연다.

## 왜 OS 공유(navigator.share)를 먼저 쓰나

`navigator.share`로 카톡에 보내면 **일반 링크**로 전송되어 **도메인 등록과 무관하게 탭하면 바로 열린다.**
반면 `Kakao.Share.sendDefault`의 **리치 카드**는 링크(`mobileWebUrl`/`webUrl`)의 도메인이 콘솔에
등록돼 있어야만 카톡이 탭 이동을 허용한다. **미등록이면 카드는 떠도 탭해도 브라우저가 안 열린다.**
그래서 모바일에서는 안전한 일반 링크 공유를 우선한다(미리보기는 일반 링크 미리보기로 표시됨).

## ⚠️ 리치 카드를 쓰려면: 카카오 "사이트 도메인" 등록

리치 카드의 링크가 탭에서 동작하려면, **메시지 링크 검증 목록**에 도메인이 있어야 한다.
이 목록은 아래 위치이며, **`플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인`과는 별개일 수 있다**
(JS SDK 도메인은 SDK 실행/카드 전송용, 메시지 링크 탭 검증은 `[플랫폼] → Web 사이트 도메인`을 봄).

1. https://developers.kakao.com → **내 애플리케이션** → 해당 앱
2. **[앱 설정] → [플랫폼] → [Web] → 사이트 도메인**에 추가:
   ```
   https://nulloongzi.github.io
   ```
   - **맨 끝 슬래시(`/`)는 넣지 않는다.** origin 단위 매칭이라 `/null_oongzi-do/` 경로까지 커버됨.
   - 별도 커스텀/Netlify 도메인을 쓰면 그 도메인도 추가.
3. (권장) **[앱 설정] → [일반] → 앱 대표 도메인**이 비어 있으면 같은 도메인으로 설정.
4. 저장 후 수 분 대기. 카톡 인앱 브라우저 캐시가 남아 있으면 카톡 재실행.

> 같은 도메인 등록은 **카카오맵에도 필요**하다. 배포 사이트에서 지도가 뜨는지 확인하면
> 도메인 등록 여부를 교차검증할 수 있다.

도메인 등록을 확인한 뒤 리치 카드를 모바일에서도 우선 쓰고 싶다면,
`js/share.js`의 `shareClub()`에서 카카오 블록을 `navigator.share`보다 앞에 두면 된다.

## 참고
- 정적 SPA(GitHub Pages)라 크롤러용 **동호회별(per-club) OG 미리보기**는 불가능하다(프리렌더 필요).
- 딥링크 착지는 데이터 로딩 지연(특히 Firestore 전용 팀)에 대비해 `openDeepLinkClub()`이 1회 재시도하고,
  `openClubDetail()`의 지도 이동은 `try/catch`로 감싸 맵 미준비 시에도 상세는 정상 노출된다.
