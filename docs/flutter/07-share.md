# 07. 공유 — 포장하기 · 스토리 카드 · 카카오/IG · 인스타 임베드

> 원본: `js/share.js`, `js/insta-embed.js`. 시각은 [design.md §11](../design.md).

## 1. 딥링크 URL
- 베이스: `https://nulloongzi.github.io/null_oongzi-do/`
- 클럽: `buildClubShareUrl(id)` → `?club=<id>`
- 픽업: `buildSpotShareUrl(id)` → `?spot=<id>`

## 2. 통합 공유 메뉴 — `openShareMenu(kind, item)`
바텀 액션시트: `📸 스토리`(primary,+힌트) · `💬 카카오` · `🔗 링크 복사` · `📤 더보기`(navigator.share) · `취소`. kind=`'club'|'spot'`.

## 3. 카카오 공유 — `initKakaoShare()` + `shareClub/sharePickup`
- 카카오 JS SDK init(appkey `69f821ba943db5e3532ac90ea5ca1080`, 지도와 공유).
- 폴백 체인: ① 카카오 feed 카드(title/desc/imageUrl=로고/link=딥링크) → ② `navigator.share` → ③ 링크 클립보드 복사. 각 단계 `track('share',{method:'kakao'|'web'|'copy', club_id|spot_id})`.
- **Flutter**: 카카오 SDK(`kakao_flutter_sdk`) 또는 OS 공유시트(`share_plus`)로 대체. 폴백 체인 동일.

## 4. 스토리 카드 (캔버스 1080×1920) — `generateStoryCard(data)`
인스타 스토리용 세로 카드를 **코드로 직접 그림**. 레이어:
1. 배경: 크림 그라데이션(`#fff7e3→#ffe9b8→#f7d27e`) + 점 텍스처(520개).
2. 로고 + 브랜드 텍스트.
3. 지도 일러스트 패널: 추상 동네 블록 + 강 + 핀(클럽 옐로 `#fac710` / 픽업 틸 `#13a89e`) + **가까운 지하철역 칩**(`storyFindNearestStation` — Kakao Places `SW8` 카테고리, **2.5s 타임아웃**, 실패 시 venue/region).
4. 정보 카드: 타이틀(최대2줄,인증 체크) + 태그칩(최대4) + 이번주 배너 + 🗓💰📍 행.
5. 푸터: QR 250px(`qrcode-generator`, 미로드 시 텍스트 폴백) + CTA + URL.
- 데이터: `storyClubData(club)`/`storySpotData(spot)` 로 정규화(아래 필드).

```
{ title, url, lat, lng, verified, accent, icon, tags:[{t,bg,fg}], thisWeek, thisWeekBadge, schedule, fee, venue, address }
```

## 5. 포장하기 카드 (프로필+도시락) — `generateShareImage(mode)`
- DOM 클론 후 html2canvas 캡처. 모드:
  - `'story'`(1080×1920): 네임카드+도시락 세로.
  - `'feed'`(1600×1200): 좌 네임카드+도시락 / 우 주간 식단표, brown 프레임.
- 식단표 이벤트는 픽셀top/height → %로 변환(리사이즈 오버플로 방지).
- 캡처 전 500ms 지연(DOM 안정화).
- 결과는 프리뷰 오버레이 → `downloadImage()`(`nulloong_YYYYMMDD_HHMM.png`).

## 6. 인스타그램 스토리 공유 + 네이티브 브리지
- `shareClubToStory/shareSpotToStory` → 스토리 카드 dataURL 생성 → `shareStory(dataUrl, contentUrl, {id})`.
- **네이티브 브리지(앱 전용)**: `window.NativeShare.postMessage(JSON)`:
  ```json
  {"type":"ig_story","stickerImage":"data:image/png;base64,...","contentUrl":"https://...?club=ID","topColor":"#fff8e1","bottomColor":"#fac710"}
  ```
  → 네이티브가 인스타 스토리에 스티커+링크로 공유.
- 브라우저 폴백: 프리뷰 + 다운로드.
- **1회성 코치 다이얼로그**: `localStorage['nurungji_story_coach']` 없으면 사용법(사진→크롭→링크 스티커) 안내 후 플래그 저장. 링크는 조용히 클립보드 복사(IG 붙여넣기용).
- `track('share',{method:'ig_story'|'story_card', ...})`.

> **Flutter 매핑(중요)**: 웹의 `NativeShare.postMessage` 브리지는 **앱에서는 네이티브가 직접** 처리하면 된다 — 스토리 카드 이미지를 `CustomPainter`(또는 `RepaintBoundary` 캡처)로 만들고, 인스타 스토리 공유는 IG의 story share intent(스티커 이미지 + `content_url`)로 보낸다. 1080×1920 레이아웃·색·QR 동일. 코치 다이얼로그는 네이티브 권한/공유 흐름으로 대체하거나 생략 가능.

## 7. 인스타 임베드 — `insta-embed.js`
- `renderInstaEmbed(container, url)`: `sanitizeInstaPostUrl` 통과 시 `blockquote.instagram-media`(`data-instgrm-permalink`) 삽입 + `embed.js` 1회 로드 → `instgrm.Embeds.process()`. 무효/없음 → 컨테이너 숨김.
- 같은 URL 재렌더 방지(`dataset.reelUrl` 중복가드, 언어변경 깜빡임 방지).
- 폭 제한(max 360px), 가운데. cross-origin iframe 이라 자동재생/세로몰입 불가(공개 임베드 한계).
- **Flutter**: `WebView` 로 동일 blockquote+embed.js 임베드하거나, 썸네일+외부오픈으로 대체. URL 검증 동일.

## 8. Flutter 매핑 요약
- 딥링크 URL 포맷 동일(웹과 공유).
- 스토리 카드는 네이티브 페인팅(1080×1920) — 가장 충실한 재현.
- 카카오/OS 공유 폴백 체인.
- 인스타 스토리 공유는 OS intent + 링크 스티커.
- 애널리틱스 `share` method 값 동일.
