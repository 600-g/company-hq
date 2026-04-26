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
# 안정화 정책 (2026-04):
# - --reload 제거 — 코드 편집 중 사용자 WS 끊김 방지
# - 코드 변경 적용은 deploy.sh 끝의 `launchctl kickstart -k com.company-hq-server` 로만
# - 결과: 사용자가 작업 중일 때 절대 안 끊김. 의도된 배포 시점에만 ~2초 끊김
# - 로컬 dev: launchctl kickstart 한 줄로 즉시 반영
exec python -m uvicorn main:app --host 0.0.0.0 --port 8000
