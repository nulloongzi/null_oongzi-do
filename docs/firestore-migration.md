# Firestore 전환 작업 기록

## 배경

- 기존 구조: Google Sheets → GitHub Actions (6시간마다) → `data/volleyball_clubs_kakao.json` → 앱
- 앱 내 팀 등록 기능은 Firestore `clubs` 컬렉션에 직접 저장
- `data.js`에서 JSON + Firestore를 병합해 지도에 표시
- Google Sheets 기반 파이프라인을 제거하고 Firestore 단일 소스로 전환 결정

## 데이터 현황 (2026-05-07 기준)

| 소스 | 클럽 수 |
|------|--------|
| `data/volleyball_clubs_kakao.json` | 51개 |
| Firestore `clubs` 컬렉션 | 48개 |

### JSON에만 있던 클럽 → 마이그레이션 대상

| 이름 | ID | 상태 |
|------|----|------|
| 평택BLANK | 24cc56787b76 | ✅ 마이그레이션 완료 |
| 피터팬 | 946b791a9d19 | ✅ 마이그레이션 완료 |
| TVT | eb51c870a0c3 | ✅ 마이그레이션 완료 |
| 챔스 | 908ceb689179 | ✅ 마이그레이션 완료 |
| 시흥 픽업게임 (격주) — 장곡로70번길 8 | a974f57817d9 | ⏳ 미완료 |
| 시흥 픽업게임 (격주) — 포도원로 50 | 9edf0b3eea75 | ⏳ 미완료 |

### Firestore에서 삭제할 항목

| 이름 | ID | 상태 |
|------|----|------|
| 시흥 수요배구회 픽업게임 | 587d9b25876e | ⏳ 미완료 (구버전, 이름/장소 변경된 클럽) |

## 마이그레이션 스크립트

`pipeline/migrate_to_firestore.js` — 앱에 **관리자 계정으로 로그인**한 상태에서 브라우저 콘솔에 붙여넣어 실행.

- 6개 클럽 Firestore 마이그레이션 (이미 존재하면 덮어쓰기)
- `시흥 수요배구회 픽업게임` 삭제

## 남은 작업

1. **브라우저 콘솔에서 `migrate_to_firestore.js` 실행** (시흥 픽업게임 2개 + 삭제)
2. `update_data.yml` GitHub Actions 워크플로우 비활성화 또는 삭제
3. `js/data.js`에서 JSON fetch 코드 제거, Firestore 단독 로드로 변경
4. `data/volleyball_clubs_kakao.json` 삭제
5. `pipeline/` 디렉토리 정리 (main.py 등 불필요 파일 삭제)
