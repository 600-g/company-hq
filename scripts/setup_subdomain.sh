#!/usr/bin/env bash
# 기존 GitHub 레포에 서브도메인 retroactive 적용
# 사용:
#   bash scripts/setup_subdomain.sh exam-hub exam       # exam.600g.net
#   bash scripts/setup_subdomain.sh date-map datemap    # datemap.600g.net
#
# 동작:
# 1. CF DNS CNAME 추가 (server/cf_dns.py 사용)
# 2. 레포에 CNAME 파일 push
# 3. SSL 발급 대기 (~5분~1시간)

set -e

REPO_NAME="$1"
SUBDOMAIN="$2"

if [ -z "$REPO_NAME" ] || [ -z "$SUBDOMAIN" ]; then
    echo "사용: bash scripts/setup_subdomain.sh <repo-name> <subdomain>"
    echo "예:   bash scripts/setup_subdomain.sh exam-hub exam"
    exit 1
fi

# .env 로드
HQ_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$HQ_ROOT/server/.env" ]; then
    export $(grep -v '^#' "$HQ_ROOT/server/.env" | xargs)
fi

if [ -z "$CF_TOKEN" ]; then
    echo "❌ CF_TOKEN 미설정. server/.env 에 CF_TOKEN=... 추가 필요"
    exit 1
fi

# 1. CF DNS CNAME 추가
echo "▶ CF DNS: ${SUBDOMAIN}.600g.net CNAME → 600-g.github.io"
cd "$HQ_ROOT/server"
source venv/bin/activate
python3 -c "
from cf_dns import add_subdomain
r = add_subdomain('$SUBDOMAIN')
print(r)
import sys
sys.exit(0 if r.get('ok') else 1)
"

# 2. 레포 위치 찾기 (~/Developer/my-company/<repo>)
REPO_PATH="$HOME/Developer/my-company/$REPO_NAME"
if [ ! -d "$REPO_PATH/.git" ]; then
    echo "❌ git 레포 아님: $REPO_PATH"
    exit 1
fi

# 3. CNAME 파일 추가 + push
cd "$REPO_PATH"
echo "${SUBDOMAIN}.600g.net" > CNAME
git add CNAME

if git diff --cached --quiet; then
    echo "⊘ CNAME 변경 없음 (이미 동일)"
else
    git commit -m "chore: add CNAME (${SUBDOMAIN}.600g.net) for GitHub Pages" -q
    git push
    echo "✅ CNAME 파일 푸시 완료"
fi

# 4. 안내
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 자동화 완료. 5분~1시간 후 다음 URL 활성:"
echo ""
echo "   https://${SUBDOMAIN}.600g.net"
echo ""
echo "확인:"
echo "   curl -I https://${SUBDOMAIN}.600g.net"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
