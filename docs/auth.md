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
