# 팀 소유권 클레임 (Claims)

## 개요
초기 51개 팀은 구글시트로 접수했다(`PHILOSOPHY.md`). 그 팀들은 `registered_by`
가 비어 있어서 **아무도 정보를 못 고친다**. 시트에서 받아둔 담당자 메일과 같은
메일로 가입한 사람이 나타나면, 그 사람을 그 팀의 주인으로 이어주는 통로다.

판단은 전부 서버가 한다. 메일 주소는 클라이언트로 내려가지 않는다.

## 데이터 흐름

```
club_claims/{clubId}          시트에서 옮겨둔 담당자 메일 (운영자만 씀)
        │  email 일치
        ▼
claimMyClubs (onCall)         로그인할 때마다 불린다
        │  Auth 레코드에서 메일 확인 → 일치하면
        ▼
club_claim_requests/{clubId}__{uid}    status: pending
        │  카카오 알림 → 챗봇 '클레임관리'
        ▼
운영자 승인 → clubs/{clubId}.registered_by = uid
```

| 컬렉션 | 문서 id | 쓰는 주체 |
|---|---|---|
| `club_claims` | 팀 문서 id | 운영자(import 스크립트) |
| `club_claim_requests` | `{clubId}__{uid}` | `claimMyClubs` |

## 문서 id 를 (팀, 사람)으로 고정하는 이유

예전에는 `add()` 로 자동 id 를 쓰고, 중복은 "pending 인 요청이 있나" **조회**로
막았다. 조회와 쓰기 사이가 비어 있어서 같은 사람의 호출이 겹치면 둘 다 "없다"를
보고 각자 문서를 만든다. 실제로 새로고침 한 번에 `claimMyClubs` 가 같은 초에 두
번 불린 기록이 있다(2026-09-16 05:44:02 UTC, Cloud Run 요청 로그). 그러면 운영자의
'클레임관리' 목록에 같은 건이 두 장 뜬다.

id 를 고정하면 겹쳐 불려도 같은 문서를 건드리므로 Firestore 가 직렬화한다.
쓰기는 `runTransaction` 안에서 한다.

**거절도 막는다.** 예전에는 `pending` 만 봐서, 거절당한 사람이 로그인할 때마다
요청이 새로 생겼다 — 운영자가 내린 판단이 무한히 되살아난다는 뜻이다. 잘못
거절한 경우에는 '관리자 신청'(사진 증빙)이라는 다른 통로가 이미 있으므로
사람이 갇히지는 않는다.

| 기존 문서 상태 | 결과 |
|---|---|
| 없음 | 생성 |
| `pending` | `already_requested` |
| `rejected` | `already_rejected` |
| `approved` | `already_yours` |

## ⚠️ IAM: 런타임 서비스 계정에 Auth 조회 권한이 필요하다

`claimMyClubs` 는 메일을 **Auth 레코드에서** 읽는다(`admin.auth().getUser`).
클라이언트가 준 값을 믿으면 남의 팀을 가져갈 수 있기 때문이다.

그런데 Functions v2 는 App Engine 기본 SA 가 아니라 **Compute 기본 SA**
(`{projectNumber}-compute@developer.gserviceaccount.com`)로 돈다. 이쪽은
`firebase.sdkAdminServiceAgent` 를 자동으로 받지 않아서, 아무것도 안 하면
`admin.auth()` 호출이 전부 실패한다:

```
Credential implementation provided to initializeApp() via the "credential"
property has insufficient permission to access the requested resource.
```

이 때문에 2026-09-11 ~ 09-16 사이 `claimMyClubs` 호출 9건이 **전부 HTTP 500**
이었다. 성공 0건. 시트 import 는 끝나 있었는데 클레임이 하나도 안 생겼다.
같은 원인으로 `adminReassignOwner` 도 죽어 있었다.

**필요한 역할**: `roles/firebaseauth.viewer`
(포함 권한 중 필요한 건 `firebaseauth.users.get` 하나뿐이다. `firebaseauth.admin`
은 create/delete/update 까지 열려서 과하다.)

```
gcloud projects add-iam-policy-binding <project-id> \
  --member="serviceAccount:<projectNumber>-compute@developer.gserviceaccount.com" \
  --role="roles/firebaseauth.viewer"
```

재배포는 필요 없다. IAM 은 호출 시점에 평가된다.

`admin.auth()` 를 쓰는 함수를 새로 추가할 때 이 역할이 있는지 먼저 확인할 것.
현재 사용처는 `claimMyClubs`, `adminReassignOwner` 두 곳이다.

## 인증 승인은 팀이 있을 때만

`chatbotApprove` 는 `clubs/{id}` 에 `set({ is_verified: true }, { merge: true })`
를 썼다. `merge` 는 문서가 없으면 **만든다** — 삭제된 팀의 인증 요청을 승인하면
`is_verified` 하나만 든 문서가 새로 생겼다. 이름도 좌표도 없어 지도엔 안 뜨고
목록에만 남는다.

실제로 `clubs` 62건 중 2건이 그렇게 생긴 것이었다. `wp4qeje5fac` 는 테스트 인증
요청(`[테스트팀] S4검증용`)을 승인한 **1초 뒤**에 만들어졌다.

```
인증 승인   2026-08-19T01:24:13.058Z
클럽 생성   2026-08-19T01:24:14.203Z
```

이제 `markClubVerified()` 가 트랜잭션 안에서 `snap.exists` 를 보고, 팀이 없으면
요청을 `rejected` + `reject_reason: "club_missing"` 으로 닫는다. 이메일 링크
경로도 같다 — 그쪽은 `update()` 라 유령은 안 생겼지만 요청을 `approved` 로 바꾼
**뒤에** 팀을 써서, 팀이 없으면 요청만 승인된 채 남았다. 순서도 뒤집었다.

`grantClubAdmin()` 이 처음부터 같은 모양이었다(없으면 `not_found`).

## 관련 파일

| 파일 | 역할 |
|---|---|
| `functions/index.js` `claimMyClubs` | 매칭 · 요청 생성 |
| `functions/index.js` `chatbotClaims` / `resolveClaim` | 챗봇 목록 · 승인/거절 |
| `functions/lib/pure.js` `claimRequestId` / `claimReuseReason` / `claimBlockReason` | 순수 판단 |
| `js/auth.js` `checkClubClaims` | 로그인 직후 호출 · 결과 안내 |
| `tests/claim-dedupe.test.js` | 중복 방지 검증 |
| `docs/chatbot-blocks.md` | 카카오 콘솔 블록 설정 |
