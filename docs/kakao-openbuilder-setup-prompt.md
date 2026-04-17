# 카카오 i 오픈빌더 챗봇 설정 프롬프트

아래 내용을 Claude (컴퓨터 사용 모드)에게 붙여넣어 크롬에서 오픈빌더 설정을 진행하세요.

---

## 프롬프트 시작

```
너는 지금 크롬 브라우저에서 카카오 i 오픈빌더(https://chatbot.kakao.com)에 접속하여 챗봇을 설정하는 작업을 수행할 거야.

### 목적
"누룽지도" 앱의 팀 인증 관리용 카카오톡 챗봇을 설정한다.
관리자가 카카오톡 챗봇에서 "인증관리"를 입력하면 대기 중인 인증 요청을 사진과 함께 카드로 보여주고, 승인/거절 버튼으로 처리할 수 있어야 한다.
거절 시에는 사유를 입력받아 저장한다.

### 사전 조건
- 카카오 계정으로 로그인되어 있어야 함
- 카카오톡 채널이 이미 생성되어 있음 (기존 채널 사용)

### 전체 플로우

1. 관리자: "인증관리" 입력 → 대기 중 인증 요청 카드 목록 (사진 + 승인/거절 버튼)
2. 관리자: "승인" 버튼 클릭 → 승인 처리 완료 메시지
3. 관리자: "거절" 버튼 클릭 → "거절 사유를 입력해주세요" 안내
4. 관리자: 거절 사유 텍스트 입력 → 거절 처리 완료 메시지

---

## 단계별 설정 가이드

### STEP 1: 오픈빌더 접속 및 챗봇 생성

1. https://chatbot.kakao.com 접속
2. 로그인 후, 이미 챗봇이 있으면 해당 챗봇 선택. 없으면 "+ 챗봇 만들기" 클릭
3. 챗봇 이름: "누룽지도 관리봇"
4. 기존 카카오톡 채널과 연결

### STEP 2: 스킬(Skill) 등록 — 4개 생성

왼쪽 메뉴에서 "스킬" 클릭 → 아래 4개 스킬을 각각 생성한다.

#### 스킬 1: 인증목록조회
- 스킬명: 인증목록조회
- URL: https://us-central1-nulloongzi-do.cloudfunctions.net/chatbotPending
- Method: POST
- 설명: 대기 중인 인증 요청 목록을 카드 형태로 반환

#### 스킬 2: 승인처리
- 스킬명: 승인처리
- URL: https://us-central1-nulloongzi-do.cloudfunctions.net/chatbotApprove
- Method: POST
- 설명: 인증 요청 승인 처리

#### 스킬 3: 거절사유요청
- 스킬명: 거절사유요청
- URL: https://us-central1-nulloongzi-do.cloudfunctions.net/chatbotRejectAsk
- Method: POST
- 설명: 거절 사유 입력 안내 및 컨텍스트 설정

#### 스킬 4: 거절확정
- 스킬명: 거절확정
- URL: https://us-central1-nulloongzi-do.cloudfunctions.net/chatbotRejectConfirm
- Method: POST
- 설명: 거절 사유와 함께 거절 처리 확정

각 스킬 등록 후 하단의 "스킬 서버 연결 테스트" 버튼을 눌러 200 OK 응답이 오는지 확인.

### STEP 3: 컨텍스트(Context) 생성 — 1개

왼쪽 메뉴에서 "컨텍스트" 클릭 → 새 컨텍스트 생성

- 컨텍스트명: reject_context
- 수명(lifeSpan): 1
- 파라미터:
  - request_id (string)
  - club_name (string)

### STEP 4: 블록(Block) 생성 — 4개

왼쪽 메뉴에서 "블록" 클릭 → 아래 4개 블록을 각각 생성한다.

#### 블록 1: 인증관리
- 블록명: 인증관리
- 사용자 발화 패턴 (인텐트):
  - "인증관리"
  - "인증 관리"
  - "인증목록"
  - "인증 목록"
  - "관리자"
- 파라미터 설정: 없음
- 봇 응답 → "스킬 데이터 사용" 체크 → 스킬 선택: "인증목록조회"

#### 블록 2: 승인처리
- 블록명: 승인처리
- 사용자 발화 패턴:
  - "승인 #{sys.any}"
  (여기서 #{sys.any}는 request_id를 캡처하기 위한 것. 실제로는 "승인"으로 시작하는 모든 발화를 매칭)
  - 패턴 등록이 어려우면 "승인"을 포함하는 발화로 설정
- 봇 응답 → "스킬 데이터 사용" 체크 → 스킬 선택: "승인처리"

#### 블록 3: 거절사유요청
- 블록명: 거절사유요청
- 사용자 발화 패턴:
  - "거절 #{sys.any}"
  (거절로 시작하는 모든 발화 매칭)
  - 패턴 등록이 어려우면 "거절"을 포함하는 발화로 설정
- 봇 응답 → "스킬 데이터 사용" 체크 → 스킬 선택: "거절사유요청"
- 출력 컨텍스트: reject_context (수명 1)

#### 블록 4: 거절확정
- 블록명: 거절확정
- 입력 컨텍스트: reject_context (이 컨텍스트가 활성화된 상태에서만 동작)
- 사용자 발화 패턴:
  - "#{sys.any}" (아무 텍스트 = 거절 사유)
  - 또는 폴백 형태로 설정
- 파라미터 설정:
  - request_id: 컨텍스트에서 가져오기 (reject_context.request_id)
  - club_name: 컨텍스트에서 가져오기 (reject_context.club_name)
- 봇 응답 → "스킬 데이터 사용" 체크 → 스킬 선택: "거절확정"

### STEP 5: 블록 우선순위 확인

블록 4(거절확정)는 입력 컨텍스트(reject_context)가 있어야만 동작하므로,
일반 발화와 충돌하지 않는다. 하지만 우선순위를 확인:

1. 거절확정 (입력 컨텍스트 있을 때만)
2. 인증관리
3. 승인처리
4. 거절사유요청

### STEP 6: 배포

1. 오른쪽 상단 "배포" 버튼 클릭
2. 배포 환경 선택 후 배포
3. 카카오톡에서 해당 채널의 챗봇에 "인증관리" 입력하여 테스트

---

## 주의사항

- 스킬 URL은 HTTPS여야 하며, 위 URL들은 이미 Firebase Cloud Functions에 배포 완료됨
- 카카오 오픈빌더 스킬의 응답 시간 제한은 5초 → Cloud Functions 콜드스타트 주의
- 컨텍스트(reject_context)의 수명을 1로 설정하면 다음 1턴 동안만 유효
- 블록 4의 입력 컨텍스트가 제대로 설정되지 않으면 거절 사유가 다른 블록으로 매칭될 수 있음
- Firebase Storage 이미지 URL이 카카오 카드 썸네일로 표시됨

## 스킬 URL 요약

| 스킬명       | URL                                                                          |
|-------------|------------------------------------------------------------------------------|
| 인증목록조회 | https://us-central1-nulloongzi-do.cloudfunctions.net/chatbotPending          |
| 승인처리     | https://us-central1-nulloongzi-do.cloudfunctions.net/chatbotApprove          |
| 거절사유요청 | https://us-central1-nulloongzi-do.cloudfunctions.net/chatbotRejectAsk        |
| 거절확정     | https://us-central1-nulloongzi-do.cloudfunctions.net/chatbotRejectConfirm    |
```

---

프롬프트 끝
