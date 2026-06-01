# 공유 (카카오 공유 카드) 설정

동호회 상세의 **🔗 공유** 버튼은 `js/share.js`의 `shareClub()`이 처리한다.
폴백 순서: ① 카카오 공유 카드(`Kakao.Share.sendDefault`) → ② OS 공유 시트(`navigator.share`) → ③ 링크 복사.

공유 링크 형식: `https://nulloongzi.github.io/null_oongzi-do/?club=<id>`
링크를 열면 `js/app.js`의 `openDeepLinkClub()`이 `?club=` 파라미터를 읽어 해당 동호회 상세를 자동으로 연다.

## ⚠️ 카카오 사이트 도메인 등록 (필수)

카카오 공유 카드는 도메인 등록과 **무관하게 전송**되지만,
카톡에서 카드를 **탭**하면 카카오톡 앱이 링크(`link.mobileWebUrl`)의 도메인을 콘솔 등록 목록과 대조한다.
**미등록이면 카드는 떠도 탭 시 아무 동작도 하지 않는다.** (카카오는 개발용 `localhost`만 자동 허용)

### 등록 방법
1. https://developers.kakao.com → **내 애플리케이션** → 해당 앱 선택
2. **앱 설정 → 앱 키**에서 JavaScript 키가 코드의 앱키와 일치하는지 확인
   - `js/share.js`의 `Kakao.init('...')`
   - `index.html`의 Kakao Maps SDK `appkey=...`
3. **앱 설정 → 플랫폼 → Web → 사이트 도메인**에 추가:
   ```
   https://nulloongzi.github.io
   ```
   (origin 단위 매칭이라 `/null_oongzi-do/` 경로까지 커버된다. 커스텀 도메인을 쓰면 그 도메인도 추가)
4. 저장 후 수 분 대기. 카톡 인앱 브라우저 캐시가 남아 있으면 카톡 재실행/캐시 비우기.

> 같은 도메인 등록은 **카카오맵에도 동일하게 필요**하다.
> 배포 사이트(GitHub Pages)에서 지도가 정상적으로 뜨는지 확인하면 도메인 등록 여부를 교차검증할 수 있다.
> (`localhost`에서만 테스트했다면 지도는 떠도 배포 도메인은 미등록일 수 있음)

## 참고
- 정적 SPA(GitHub Pages)라서 크롤러용 **동호회별(per-club) OG 미리보기**는 불가능하다(프리렌더 필요).
  단, 카카오 공유 카드는 `sendDefault`가 제목/설명/이미지/버튼을 직접 지정하므로 OG 메타태그와 무관하다.
- 딥링크 착지는 데이터 로딩 지연(특히 Firestore 전용 팀)에 대비해 `openDeepLinkClub()`이 1회 재시도한다.
