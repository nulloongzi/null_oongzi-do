# 인증 시스템 (Authentication)

## 개요
Google OAuth 및 이메일/비밀번호 기반 Firebase Auth 인증을 처리한다.
신규 가입 시 "밥 닉네임"이 자동 생성되며, localStorage 데이터가 Firestore로 병합된다.

## 주요 함수

| 함수 | 설명 |
|------|------|
| `loginWithGoogle()` | Google 팝업 로그인 |
| `registerWithEmail()` | 이메일/비밀번호 회원가입 |
| `loginWithEmail()` | 이메일/비밀번호 로그인 |
| `logout()` | 로그아웃 (프로필/도시락 오버레이 닫기) |
| `loadOrCreateUserProfile(user)` | Firestore에서 프로필 조회 또는 신규 생성 |
| `setupAuthListener()` | `onAuthStateChanged` 리스너 등록 |

## 밥 닉네임 시스템 (profile.js)
- `generateRiceName()`: 가중치 기반 랜덤 밥 이름 + 3자리 코드 생성 (예: `현미밥-a3k`)
- `checkDuplicateNickname()`: Firestore `users` 컬렉션에서 중복 확인
- 최대 10회 재시도 후 타임스탬프 suffix 추가로 유니크 보장
- `editNickname()`: 수동 닉네임 변경 (하이픈 사용 불가)

## 데이터 흐름
1. `setupAuthListener()` -> `onAuthStateChanged` 콜백 실행
2. 로그인 시: `loadOrCreateUserProfile()` -> Firestore `users/{uid}` 조회/생성
3. localStorage 북마크/커스텀팀이 있으면 Firestore로 병합 후 localStorage 삭제
4. `renderProfileCard()` 호출하여 UI 반영

## Firestore 스키마 (`users/{uid}`)
```
nickname, suffix, full_nickname, color, created_at, email, bookmarks[], customTeams{}
```

## 관련 파일
- `js/auth.js` - 인증 로직, localStorage 병합
- `js/profile.js` - 밥 닉네임 생성, 프로필 카드 렌더링
- `js/firebase-init.js` - Firebase SDK 초기화 및 래퍼 함수

## 소셜 로그인 (카카오/네이버) 트러블슈팅

### KOE001 / 406 not_acceptable — code→토큰 교환 실패
증상: `kakaoCustomToken` 로그에 `카카오 code 교환 실패: 406 {"error":"not_acceptable","error_code":"KOE001"}`.
인가 코드는 정상 발급되는데 서버의 `POST kauth.kakao.com/oauth/token` 만 실패한다.

원인: Node 22 전역 `fetch`(undici)가 요청에 `accept-language: *`, `sec-fetch-mode: cors`,
`user-agent: node` 를 자동으로 붙인다. 406은 원래 Accept-* 협상 실패 코드로, 카카오 엣지가
이 헤더 조합을 거부한다. 로컬 curl/axios는 성공하고 배포본만 실패하는 이유가 이것.
`fetch`에 User-Agent만 추가해도 `sec-fetch-mode`는 지울 수 없어(forbidden header) 해결되지 않는다.

해결: `functions/social-auth.js`는 카카오 호출을 `node:https`로 직접 보내 헤더를 통제한다.
`Content-Type` / `Content-Length` / `Accept` / `User-Agent` 만 나간다.

교환이 다시 실패하면 실패 로그 다음 줄의 `카카오 엣지 프로브:` 결과로 원인이 갈린다.
- 프로브도 406 → 엣지가 런타임 요청 자체를 차단 (헤더/IP 문제)
- 프로브가 정상 JSON 에러(KOE320 등) → authorization_code 파라미터 또는 앱 설정 문제
  (Redirect URI 등록 여부, REST 키 일치 여부부터 확인)

### 체크리스트
- 카카오 콘솔 Redirect URI에 `https://nulloongzi.github.io/null_oongzi-do/` 등록 (경로 완전 일치)
- `js/social-auth.js`의 `KAKAO_REST_KEY` = 시크릿 `KAKAO_REST_API_KEY` (authorize/token 클라이언트 일치)
- 시크릿 끝 개행 주의 — `functions:secrets:set` 붙여넣기로 `\n` 이 섞이면 요청이 통째로 거부된다
  (코드에서 `.trim()` 하지만 값 자체를 깨끗하게 넣는 게 맞다)
