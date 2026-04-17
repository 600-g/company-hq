#!/bin/bash
# TeamMaker Classic 자동 기동 래퍼 (launchd 경유).
# Max 플랜(claude CLI)으로 동작하도록 USE_MAX_PLAN=1 주입.

set -e

# PATH 보장 (launchd 환경에서는 homebrew 경로가 누락됨)
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin:$PATH"

# Node 버전 매니저 (nvm / fnm) 쓰고 있으면 자동 로드
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
fi
if [ -s "$HOME/.fnm/env" ]; then
  eval "$($HOME/.fnm/env --shell bash 2>/dev/null || true)"
fi

cd "$HOME/Developer/my-company/company-hq/teammaker-classic"

# node_modules 부재 시 자동 설치
if [ ! -d "node_modules" ]; then
  echo "[teammaker] node_modules 없음 → npm install"
  npm install --no-audit --no-fund
fi

# Max 플랜 어댑터로 TeamMaker 내부 Claude 호출 전환
export USE_MAX_PLAN=1
# 로그 덜 시끄럽게
export NEXT_TELEMETRY_DISABLED=1

exec npm run dev
