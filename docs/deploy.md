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

## 방법 3: PC

```bash
git pull origin <브랜치>
firebase deploy --only functions --project nulloongzi-do
```

## 주의: 배포 브랜치와 삭제 사고

Functions 배포는 **"배포하는 브랜치의 소스"를 프로젝트 전체의 정답으로 취급한다.** main에 머지되지 않은 브랜치에만 있는 함수는 다른 브랜치에서 전체 배포할 때 삭제 대상이 된다.

실제로 `geocodeAddress` / `nearestStation` 이 이렇게 삭제됐고, Flutter 앱의 주소→좌표 자동입력이 죽었다. 두 함수는 이후 `functions/index.js` 로 옮겨 고정했다.

작업 브랜치에서 배포했다면 **가능한 한 빨리 main에 머지할 것.** 안 그러면 다음 배포가 그 수정을 되돌린다.
