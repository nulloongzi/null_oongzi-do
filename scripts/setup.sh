#!/usr/bin/env bash
#
# scripts/setup.sh — Claude Code on the web 세션 셋업 스크립트
#
# 목적: 클라우드 세션은 임시 컨테이너라 매번 초기화된다.
#       Firebase 배포 CLI(firebase-tools)를 세션 시작 시 자동으로 준비한다.
# 연결: 환경 설정 > "Setup script" 칸에  `bash scripts/setup.sh`  를 넣으면
#       세션이 시작되기 전에 실행된다.
# 인증: 환경변수 FIREBASE_TOKEN(환경 설정에서 주입)을 firebase CLI가 자동 사용한다.
#       배포: firebase deploy --only firestore:rules,functions --project nulloongzi-do
#
set -euo pipefail

# 로컬(개발자 머신) 세션에선 전역 패키지를 건드리지 않도록 클라우드에서만 실행.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  echo "[setup] 로컬 세션 — firebase-tools 전역 설치 건너뜀."
  exit 0
fi

# firebase-tools: 이미 있으면 재설치하지 않음 (idempotent).
if command -v firebase >/dev/null 2>&1; then
  echo "[setup] firebase-tools 이미 설치됨: $(firebase --version)"
else
  echo "[setup] firebase-tools 설치 중..."
  npm install -g firebase-tools
  echo "[setup] 설치 완료: $(firebase --version)"
fi

# 인증 토큰 주입 여부 안내 (값은 출력하지 않음).
if [ -n "${FIREBASE_TOKEN:-}" ]; then
  echo "[setup] FIREBASE_TOKEN 감지됨 — 비대화식 배포 준비 완료."
else
  echo "[setup] 경고: FIREBASE_TOKEN 없음 — 배포하려면 환경변수로 토큰을 주입하세요."
fi
