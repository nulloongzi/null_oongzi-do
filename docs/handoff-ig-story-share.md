# 인수인계 — 인스타 스토리 공유 (탭하면 딥링크로, 스포티파이式)

> **이 문서를 여는 다음 세션에게:** 이건 *두 레포를 동시에* 만지는 작업이다.
> 시작 전 `docs/PHILOSOPHY.md` → `docs/OPEN-QUESTIONS.md`를 먼저 읽어라.
> 작성: 2026-06-05 (이전 세션에서 픽업 탭 + 공유/딥링크까지 main 머지 완료한 직후).

---

## 0. 한 줄 목표

픽업 스팟(그리고 선택적으로 클럽)을 **예쁜 9:16 카드로 인스타 스토리에 공유**하고, 보는 사람이 **탭하면 앱(`?spot=` 딥링크)으로** 들어오게 한다. = 누룽지 인스타 깔때기(North Star의 핵심 메커니즘)의 자동화.

---

## 1. 선결 조건 (사람이 먼저 해야 — 코드로 못 함)

1. **GitHub App 접근권**: Claude GitHub App의 Repository access에 `nulloongzi/null_oongzi-do-app` 추가(또는 All). → 그래야 한 세션에서 **두 레포 클론**됨. (안 되면 "select repositories" 제한 때문. GitHub → Settings → Applications → Claude → Configure.)
2. **Facebook(Meta) 앱 ID 발급**: developers.facebook.com → 앱 생성 → App ID 확보. **탭=링크의 필수 조건**(이게 없으면 네이티브 스토리 공유에서 스티커 탭 링크가 안 붙는다). 무료.
3. (선택) iOS면 Apple 개발자 계정 — iOS 네이티브 공유까지 갈 때만.

---

## 2. 두 레포 구조 (둘 다 클론할 것)

| 레포 | 정체 | 역할 |
|---|---|---|
| `nulloongzi/null_oongzi-do` | **웹앱** (Vanilla JS + Firebase compat + Kakao Maps, GitHub Pages) | 본체(=the wedge). 카드 이미지 생성 + 딥링크. |
| `nulloongzi/null_oongzi-do-app` | **Flutter 앱** = `webview_flutter` 셸 | 위 웹앱을 WebView로 띄워 Play Store 배포. 네이티브 IG 공유는 여기서. |

- 앱 레포 `pubspec.yaml` 현재 의존성: `webview_flutter`, `webview_flutter_android`, `google_sign_in`, `url_launcher`, `permission_handler`, `flutter_launcher_icons`. (맵/Firebase/공유 플러그인 **없음** — 즉 맵을 새로 짠 게 아니라 웹앱을 그대로 띄우는 셸.)

---

## 3. 왜 이 구조인가 (핵심 제약)

- **인스타 스토리의 "탭=링크"는 웹에서 불가능하다.** 브라우저 JS는 인스타가 읽는 특수 페이스트보드(iOS)/인텐트(Android) 데이터를 못 쓴다. 스포티파이/유튜브뮤직이 되는 건 *네이티브 앱*이라서.
- 우리 앱은 **Flutter**(네이티브) WebView 셸 → **거기선 가능**. TWA였으면 불가였는데 Flutter라 다행.
- 그래서: **웹이 카드 이미지를 만들고 → JS 채널로 Flutter에 넘기고 → Flutter가 네이티브 IG 공유 플러그인 호출.** 일반 브라우저(셸 아님)에선 **QR 카드로 폴백**.

```
[웹앱 share.js]  9:16 카드 PNG(html2canvas) + ?spot= URL 생성
      │  window.NativeShare 있으면 → postMessage(JSON)         ← 셸 안
      │  없으면 → 카드 다운로드/navigator.share + QR            ← 브라우저
      ▼
[Flutter 셸]  JavaScriptChannel('NativeShare') 수신
      │  base64 → 임시 PNG, appinio_social_share 호출
      ▼
  인스타 스토리: 카드(스티커) + 탭 → ?spot= 딥링크
```

**점진적 강화 원칙**: 한 코드베이스, 셸 안에서만 네이티브 경로가 켜짐. 브라우저는 항상 QR 폴백.

---

## 4. 작업 A — 웹 (`null_oongzi-do`)

상태: **미착수.** (이전 세션에서 `sharePickup`은 카카오/웹공유/링크복사 폴백까지 구현됨 — 여기에 "스토리 카드" 모드를 얹는 것.)

관련 기존 코드:
- `js/share.js` — `generateShareImage('story'|'feed')`가 이미 **1080×1920 스토리 카드**를 html2canvas로 생성(프로필+도시락용). `#captureStage` + CSS `.capture-mode-story` 패턴 재사용 가능. `window.sharePickup(spot)` / `window.buildSpotShareUrl(id)`(=`?spot=`) 존재.
- `js/pickup-detail.js` — 픽업 상세 바텀시트. 공유 버튼이 `window.sharePickup(spot)` 호출. (`renderSheet`에서 `ps-share-btn`.)
- `index.html` — html2canvas CDN 이미 로드됨. 로컬 자산은 `?v=3` 캐시버스팅 중(**JS/CSS 추가·수정하면 `?v=4`로 올릴 것**).
- `js/i18n.js` — KO/EN. 새 문자열은 DICT에 키 추가(영어 우선 진입은 이미 적용됨).

구현할 것:
1. **스팟 스토리 카드 생성** `window.generateSpotStoryCard(spot)` → 9:16 PNG dataURL.
   - 내용: 제목 · `🌐 English OK`/`🌱 초보환영` 태그 · 일정(`spot.schedule || spot.schedule_text`) · `이번주`(있으면 강조) · 게임비 정보 · 누룽지 로고 · 하단에 **`?spot=` URL + QR코드**.
   - 톤: 따뜻한 누룽지색(`--nurungji-yellow #fac710`, `--nurungji-dark`, bg `#fff8e1`). 가치필터 #3(따뜻함).
2. **QR 코드**: 작고 의존성 없는 라이브러리 vendoring 권장 (예: `qrcode-generator`(kazuhikoarase, MIT) 1파일을 `js/vendor/`에 두고 `index.html`에 `?v=4`로 추가). CDN도 가능하나 캐시/오프라인 고려 시 vendor가 안전.
3. **네이티브 브리지 감지 + 분기** `window.shareSpotToStory(spot)`:
   ```js
   if (window.NativeShare && window.NativeShare.postMessage) {
     var img = window.generateSpotStoryCard(spot);            // dataURL
     window.NativeShare.postMessage(JSON.stringify({
       type: 'ig_story',
       stickerImage: img,                                     // 'data:image/png;base64,...'
       contentUrl: window.buildSpotShareUrl(spot.id),         // ?spot= 딥링크
       topColor: '#fff8e1', bottomColor: '#fac710'
     }));
     if (window.track) window.track('share', { method: 'ig_story', spot_id: spot.id });
   } else {
     // 폴백: 카드 미리보기/다운로드 + (이미 있는) sharePickup 카카오/링크
   }
   ```
4. 픽업 상세 공유 UI에 "📸 스토리 카드" 옵션 추가(기존 `sharePickup`과 병렬, 또는 셸이면 스토리 우선).
5. **검증**: jsdom으로 `generateSpotStoryCard`가 캔버스/dataURL 만드는지 + 브리지 분기(채널 mock) 테스트. (이전 세션은 `/tmp/pkverify`에 jsdom/규칙 에뮬 하네스를 썼다 — 동일 패턴.)

**웹↔Flutter 계약(이 JSON 포맷을 양쪽이 맞춰야 함):**
```json
{ "type": "ig_story",
  "stickerImage": "data:image/png;base64,<9:16 PNG>",
  "contentUrl": "https://nulloongzi.github.io/null_oongzi-do/?spot=<ID>",
  "topColor": "#fff8e1", "bottomColor": "#fac710" }
```

---

## 5. 작업 B — Flutter (`null_oongzi-do-app`)

구현할 것:
1. **플러그인 추가** (`pubspec.yaml`): `appinio_social_share`(권장 — IG 스토리 `stickerImage`+`attributionURL`+`appId` 지원) 또는 `social_share`. `path_provider`(임시파일 저장)도 추가.
2. **WebView 컨트롤러에 JS 채널 등록** (`webview_flutter` v4 기준):
   ```dart
   controller.addJavaScriptChannel(
     'NativeShare',
     onMessageReceived: (JavaScriptMessage m) async {
       final data = jsonDecode(m.message) as Map<String, dynamic>;
       if (data['type'] != 'ig_story') return;
       // 1) base64 → 임시 PNG
       final b64 = (data['stickerImage'] as String).split(',').last;
       final bytes = base64Decode(b64);
       final dir = await getTemporaryDirectory();
       final f = await File('${dir.path}/story_${DateTime.now().millisecondsSinceEpoch}.png').writeAsBytes(bytes);
       // 2) IG 스토리 공유 (appinio_social_share 예시)
       await AppinioSocialShare().shareToInstagramStory(
         '<FACEBOOK_APP_ID>',                 // ← 발급한 FB App ID
         stickerImage: f.path,
         backgroundTopColor: data['topColor'] ?? '#FFFFFF',
         backgroundBottomColor: data['bottomColor'] ?? '#FFFFFF',
         attributionURL: data['contentUrl'],  // ← 스티커 탭 시 이 링크로
       );
     });
   ```
   (플러그인별 메서드명/인자는 최신 문서 확인. 핵심은 stickerImage + attributionURL(content URL) + appId.)
3. **플랫폼 설정** (플러그인 README 따라):
   - **Android** `AndroidManifest.xml`: `<queries>`에 `com.instagram.android`, FacebookContentProvider authority(`com.facebook.app.FacebookContentProvider<APPID>`), FB App ID 메타.
   - **iOS** `Info.plist`: `LSApplicationQueriesSchemes`에 `instagram-stories`, `FacebookAppID`.
4. **딥링크 수신(선택, 권장)**: `?spot=` 링크 탭 시 *앱*이 열리게 하려면 Android App Links / iOS Universal Links 설정. *최소한* 브라우저로 열려도 웹앱 `js/app.js`의 `openDeepLinkSpot()`이 `?spot=`을 처리해 픽업 상세를 연다(이미 구현됨). 앱이 자기 자신을 열게 하려면 도메인 연결(assetlinks.json / apple-app-site-association) 추가.
5. (참고) 이미지 base64 페이로드가 1~3MB일 수 있음 — JS 채널 문자열로 전달 OK. 성능 우려 시 파일경로 방식으로 바꾸는 것도 가능.

---

## 6. 철학 체크 (가치필터 통과?)

- **인스타 깔때기 = North Star 핵심**("앱 = 누룽지 DM 자동화", app↔insta 깔때기). → wedge 정렬 ✓.
- **접근성>위상 / 따뜻함 / opt-in** → 카드는 따뜻한 누룽지 톤, 랭킹·별점 금지, 공유는 사용자 자발. ✓
- **과하게 네이티브로 가지 말 것** → 웹 QR이 80/20. 네이티브는 *셸에 얹는 강화*지, 풀 네이티브 전환이 아니다. 지도가 여전히 wedge.

---

## 7. 워크플로 / 규칙 (둘 다 적용)

- **main 직접 push 금지.** 각 레포에서 feature 브랜치 + PR. Conventional Commits.
- 클라우드 세션 프록시는 push를 "현재 작업 브랜치"로 제한.
- 웹: JS/CSS 변경 시 `index.html`의 `?v=` **버전 올리기**(현재 3 → 4). 안 올리면 returning user가 옛/새 JS 혼합으로 깨진다(과거 실제 발생).
- 이 기능은 **Firestore 규칙 변경 없음**(공유는 클라/네이티브만). 규칙 만질 일 생기면 `firebase deploy --only firestore:rules` (이 환경엔 `FIREBASE_TOKEN` 있음, project `nulloongzi-do`).
- 검증 하네스: `@firebase/rules-unit-testing`(에뮬, Java 필요) + `jsdom`(UI 로직). 브라우저 헤드리스는 이 샌드박스에서 불가(크로미움 다운로드 차단)였음 — jsdom + 실기기 수동으로.

---

## 8. 이미 완료되어 main에 있는 것 (배경, 다시 만들지 말 것)

- **픽업 탭(발견형)**: `pickup_games` 스팟 컬렉션, 무로그인=익명 인증 등록, 단톡 링크(들어가는 문), "이번주" 메모, 지도 피커, 구조화 일정(요일·시간)+메모.
- **English-OK 속성** + 리스트 필터 + **비한국어 브라우저 영어 우선 진입**.
- **물꼬 계측**: 픽업 단톡 클릭 `pickup_contact`, 클럽 인스타/링크/길찾기 `club_contact`. North Star Metric = 주당 first-contact (OPEN-QUESTIONS 결정 로그).
- **픽업 공유/딥링크**: `sharePickup`(카카오/웹/링크 폴백) + `?spot=` 딥링크(`openDeepLinkSpot`). ← **스토리 카드는 여기 위에 얹으면 됨.**
- 정적 자산 **캐시버스팅 `?v=3`**.

핵심 파일: `js/share.js`, `js/pickup-detail.js`, `js/pickup-ui.js`, `js/pickup-data.js`, `js/pickup-host.js`, `js/app.js`, `index.html`, `firestore.rules`.

---

## 9. 추천 실행 순서 (새 세션)

1. 두 레포 클론 확인(앱 레포 접근권 OK?) + FB App ID 확보됐는지 확인.
2. **웹 A**: `generateSpotStoryCard` + QR + 브리지 분기 → PR(웹 레포). `?v=4`. jsdom 검증.
3. **Flutter B**: 플러그인 + JS 채널 + 플랫폼 설정 → PR(앱 레포). 실기기에서 IG 공유 확인.
4. 계약 JSON 포맷(§4)이 양쪽 일치하는지 대조.
5. 실기기: 픽업 상세 → 📸 스토리 카드 → 인스타 스토리에 카드 뜨고 **스티커 탭 → `?spot=` 딥링크** 확인.
6. 브라우저(셸 아님): 같은 버튼이 **QR 카드 폴백**으로 동작하는지.

> 막히면: FB App ID 없으면 탭링크 안 켜짐(2번까진 됨). 앱 레포 접근 안 되면 §1.1 GitHub App access부터.
