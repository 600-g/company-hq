#!/bin/bash
# ============================================================
# company-hq 서버 시작 스크립트
# launchd(com.company-hq-server)에서 호출하는 래퍼
# .env 로드 → venv 활성화 → uvicorn 실행
# ============================================================

SERVER_DIR="$HOME/Developer/my-company/company-hq/server"
ENV_FILE="$SERVER_DIR/.env"

# PATH 보장 — launchd 환경에서 node, git, claude 등 찾을 수 있도록
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin:$PATH"

# .env 로드 (값 자동 export)
if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

cd "$SERVER_DIR" || exit 1
source "$SERVER_DIR/venv/bin/activate"

# exec으로 교체: launchd가 이 프로세스를 직접 추적
# --reload는 *.py만 감시 — chat_history/*.json, logs/*.log 저장 시 재시작 방지
# (기존: .json/.log 저장마다 uvicorn 재시작 → WS 끊김 → 클라가 "새로고침"처럼 체감)
exec python -m uvicorn main:app \
    --host 0.0.0.0 --port 8000 \
    --reload \
    --reload-include "*.py" \
    --reload-exclude "chat_history/*" \
    --reload-exclude "logs/*" \
    --reload-exclude "*.json" \
    --reload-exclude "*.log" \
    --reload-exclude ".claude/*"
