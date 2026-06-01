# 공유 (카카오 공유) 설정

동호회 상세의 **🔗 공유** 버튼은 `js/share.js`의 `shareClub()`이 처리한다.
**폴백 순서: ① 카카오 공유 카드(`Kakao.Share.sendDefault`) → ② OS 네이티브 공유(`navigator.share`) → ③ 링크 복사.**

공유 링크 형식: `https://nulloongzi.github.io/null_oongzi-do/?club=<id>`
링크를 열면 `js/app.js`의 `openDeepLinkClub()`이 `?club=` 파라미터를 읽어 해당 동호회 상세를 자동으로 연다.

## ⚠️ 카카오 도메인 등록 — 두 곳 모두 필요

카카오 리치 카드가 **전송**되는 것과, 카드를 **탭했을 때 링크가 열리는** 것은 **검증하는 도메인 목록이 다르다.**
둘 중 하나라도 비면 증상이 다르게 나타난다.

| 등록 위치 | 역할 | 비우면 |
|---|---|---|
| **플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인** | SDK 실행 + 카드 **전송** | 카드 자체가 안 보내짐 |
| **앱 → 제품 링크 관리 → 웹 도메인(대표 도메인)** | 카드 **링크 탭** 검증 | **카드는 떠도 탭해도 안 열림** ← 실제 겪은 증상 |

> 실제 사례: JS SDK 도메인에는 `https://nulloongzi.github.io`가 있었지만 **대표 도메인이 비어 있어서**,
> 카드는 정상 전송되는데 탭하면 아무 페이지도 안 열렸다. **대표 도메인을 채우자 해결됨.**

### 등록 방법 (누룽지도 앱 = JS 키 `69f821…`)
1. https://developers.kakao.com → **내 애플리케이션 → 누룽지도**
2. **플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인**: `https://nulloongzi.github.io` (끝 슬래시 없이)
3. **앱 → 제품 링크 관리 → 웹 도메인 → "웹 도메인 수정" → 대표 도메인**: `https://nulloongzi.github.io` (끝 슬래시 없이) ← **이게 링크 탭의 핵심**
4. 저장 후 수 분 대기. 옛날에 보낸 카드는 캐시라 안 열리니 **새로 보낸 카드**로 확인.

> 참고: 어느 키/앱인지 헷갈리면, 도메인을 등록한 앱의 **JavaScript 키가 코드의 `Kakao.init(...)` 값과 같은지** 확인.
> REST API/네이티브 앱 키는 웹 공유와 무관(각각 서버용/모바일 앱용).

## 폴백/착지 동작
- `navigator.share`(일반 링크)는 도메인 등록과 무관하게 열리므로, 카카오 SDK 미초기화 등일 때의 안전한 폴백.
- 딥링크 착지는 데이터 지연(특히 Firestore 전용 팀)에 대비해 `openDeepLinkClub()`이 1회 재시도하고,
  `openClubDetail()`의 지도 이동은 `try/catch`로 감싸 맵 미준비 시에도 상세는 정상 노출된다.
- 정적 SPA라 크롤러용 per-club OG 미리보기는 불가(프리렌더 필요). 단 카카오 카드는 `sendDefault`가 직접 내용을 지정하므로 무관.
