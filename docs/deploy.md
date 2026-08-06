# 배포 (PC 없이 하는 법 포함)

## 방법 1: GitHub Actions — 폰에서 탭 두 번 (권장)

`.github/workflows/deploy-functions.yml` 이 수동 트리거 워크플로다.

1. 폰 브라우저로 리포지토리 → **Actions** 탭
2. 왼쪽 **Deploy Functions** 선택 → **Run workflow**
3. 브랜치 고르고 `target` 은 기본값 `functions` 그대로 → 실행

`target` 에 다른 값을 넣으면 그것만 배포된다: `functions:kakaoCustomToken`, `hosting`, `firestore:rules` 등.

배포 전에 functions 관련 테스트가 먼저 돌고, 실패하면 배포가 중단된다.

**`--force` 를 주지 않는다.** 로컬 소스에 없는 함수가 프로젝트에 남아 있으면 조용히 지우지 않고 워크플로가 실패한다. 실패하면 "그 함수가 어느 브랜치에만 있는지" 부터 확인할 것 — 과거에 `geocodeAddress` / `nearestStation` 이 이렇게 삭제된 적이 있다.

### 최초 1회 설정: GCP_SA_KEY 시크릿

이 설정도 PC 없이 할 수 있다. **Google Cloud Shell**(`shell.cloud.google.com`)을 폰 브라우저로 열고 아래를 붙여넣는다.

```bash
PROJECT=nulloongzi-do
SA=github-deployer

gcloud config set project $PROJECT
gcloud iam service-accounts create $SA --display-name="GitHub Actions deployer"

EMAIL=$SA@$PROJECT.iam.gserviceaccount.com
for ROLE in \
  roles/cloudfunctions.admin \
  roles/run.admin \
  roles/cloudbuild.builds.editor \
  roles/artifactregistry.admin \
  roles/secretmanager.admin \
  roles/iam.serviceAccountUser \
  roles/serviceusage.serviceUsageAdmin \
  roles/firebase.admin ; do
  gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$EMAIL" --role="$ROLE" --condition=None
done

gcloud iam service-accounts keys create key.json --iam-account=$EMAIL
cat key.json
```

서비스 계정으로 배포하려면 **Cloud Billing API도 켜져 있어야 한다.**

```bash
gcloud services enable cloudbilling.googleapis.com --project=nulloongzi-do
```

Firebase CLI는 배포 전 프로젝트가 Blaze 요금제인지 확인하는데, 사용자 계정으로 로그인했을 때와
달리 서비스 계정에서는 Cloud Billing API를 직접 호출한다. 이 API가 꺼져 있으면 배포가
`403 Cloud Billing API has not been used in project ...` 로 실패한다.
API를 켜는 것 자체는 무료이고 요금제도 바뀌지 않는다 (결제 정보를 읽기만 한다).

출력된 JSON 전체를 복사 → GitHub 리포지토리 **Settings → Secrets and variables → Actions → New repository secret** → 이름 `GCP_SA_KEY`, 값에 붙여넣기.

그 다음 Cloud Shell에서 `rm key.json` 으로 지운다. 이 키는 만료가 없는 자격증명이라 유출되면 프로젝트가 통째로 넘어간다 — 채팅·이슈·커밋에 절대 붙여넣지 말 것.

## 방법 2: Cloud Shell에서 직접 — 설정 없이 지금 당장

`shell.cloud.google.com` 을 폰 브라우저로 열고:

```bash
git clone https://github.com/nulloongzi/null_oongzi-do.git
cd null_oongzi-do
git checkout <브랜치>
npm ci --prefix functions
npx firebase-tools deploy --only functions --project nulloongzi-do
```

Cloud Shell은 이미 구글 계정으로 인증돼 있어 `firebase login` 이 필요 없다. 시크릿 설정도 필요 없다. 대신 매번 clone 해야 하고 폰 화면에서 터미널을 다루는 게 불편하다.

한 번 쓰고 나면 홈 디렉터리가 유지되므로 다음부터는 `cd null_oongzi-do && git pull` 만 하면 된다.

## 파라미터 파일 (`functions/.env.nulloongzi-do`)

`defineString` 파라미터(`KAKAO_APP_ID`, `NAVER_CLIENT_ID`) 값이 들어있다. **시크릿이 아니다** —
실제 비밀값은 전부 Secret Manager에 있고, 이 파일은 커밋되어 있다.

이 파일이 없으면 `firebase deploy` 가 값을 대화형으로 물어본다. `defineString` 에 `default: ""`
를 줘도 프롬프트는 뜨므로, 새로 클론한 PC에서 무심코 엔터를 치면 **빈 값이 그대로 배포된다.**
실제로 그렇게 `KAKAO_APP_ID` 가 빈 값으로 나간 적이 있다. 파일을 커밋해둔 이유가 이것이다.

값을 바꿨으면 파일도 같이 커밋할 것. 안 그러면 다음 사람이 다시 프롬프트를 만난다.

## 방법 3: PC

```bash
git pull origin <브랜치>
firebase deploy --only functions --project nulloongzi-do
```

## 주의: 배포 브랜치와 삭제 사고

Functions 배포는 **"배포하는 브랜치의 소스"를 프로젝트 전체의 정답으로 취급한다.** main에 머지되지 않은 브랜치에만 있는 함수는 다른 브랜치에서 전체 배포할 때 삭제 대상이 된다.

실제로 `geocodeAddress` / `nearestStation` 이 이렇게 삭제됐고, Flutter 앱의 주소→좌표 자동입력이 죽었다. 두 함수는 이후 `functions/index.js` 로 옮겨 고정했다.

작업 브랜치에서 배포했다면 **가능한 한 빨리 main에 머지할 것.** 안 그러면 다음 배포가 그 수정을 되돌린다.

## 외부 콘솔에 등록된 URL·값 (지우기 전에 여기부터 볼 것)

아래 경로들은 **이 레포 밖의 콘솔에 문자열로 박혀 있다.** 레포 안에서만 보면 "아무데서도
참조하지 않는 파일"로 보이지만, 지우거나 이름을 바꾸면 외부 심사·로그인이 조용히 깨진다.

| 파일/값 | 어디에 등록돼 있나 | 깨지면 생기는 일 |
|---|---|---|
| `privacy.html` (`https://do.nulloongzi.com/privacy.html`) | Google Play Console → 앱 콘텐츠 → 개인정보처리방침 | 심사에서 "잘못된 개인정보처리방침" 반려 |
| `data-deletion.html` | Play 데이터 안전 → 계정 삭제 요청 URL | 데이터 안전 설문 반려 |
| `com.nulloongzi.nulloongzido` (패키지명) | Play 리스팅 · 네이버 로그인 콘솔 · NCP Maps | 업데이트 업로드 불가 / 네이버 로그인·지도 실패 |
| 카카오 키해시 3종 (디버그·앱서명·업로드) | Kakao Developers → 플랫폼 → Android | 카카오 로그인·공유 실패 |
| `KAKAO_APP_ID` = `1352411` | `functions/.env.nulloongzi-do` ↔ Kakao 콘솔 앱 ID | 빈 값이면 위조 토큰 검증이 꺼짐 |
| 리다이렉트 URI `https://do.nulloongzi.com/` | Kakao / Naver 로그인 콘솔 | OAuth 콜백 거부 |

**실제 사고:** 2026-07-28에 `privacy.md`(빈 템플릿으로 보였다)를 "미사용 파일 정리"로 지웠는데,
Play Console 개인정보처리방침 URL이 정확히 그 파일을 가리키고 있어 404 → 심사 반려로 이어졌다.
레포 안에 참조가 없다는 것은 **아무도 안 쓴다는 증거가 아니다.** 공개 URL이 될 수 있는 파일
(`*.html`, `*.md`, `assets/`)을 지우거나 옮기기 전에는 이 표를 먼저 확인하고, 표에 없더라도
"외부 콘솔에 붙여넣은 적이 있는 주소인가"를 한 번 되물을 것.

값을 새로 외부에 등록했다면 **이 표에 줄을 추가하는 것까지가 그 작업의 일부다.**
