#!/usr/bin/env bash
# smoke test — 핵심 회귀 5종 30초 안에 검증
# 사용: bash scripts/smoke_test.sh
# 종료코드: 0 = 모두 통과, 1+ = 실패한 테스트 수

set -u
BASE="${BASE:-http://localhost:8000}"
PASS=0
FAIL=0
FAIL_LIST=()

color() { printf "\033[%sm%s\033[0m" "$1" "$2"; }
ok()    { PASS=$((PASS+1)); echo "$(color "32" "✓") $1"; }
fail()  { FAIL=$((FAIL+1)); FAIL_LIST+=("$1"); echo "$(color "31" "✗") $1"; [ -n "${2:-}" ] && echo "    └ $2"; }

# ── 1. 백엔드 헬스 ──────────────────────────────────────────────
http_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/teams" || echo "000")
if [ "$http_code" = "200" ]; then
    ok "백엔드 헬스 (/api/teams 200)"
else
    fail "백엔드 헬스 (/api/teams)" "HTTP $http_code"
fi

# ── 2. 팀 목록 형식 검증 ───────────────────────────────────────
teams_json=$(curl -s "$BASE/api/teams" 2>/dev/null || echo "{}")
team_count=$(echo "$teams_json" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d) if isinstance(d, list) else (len(d.get('teams',[])) if isinstance(d, dict) else -1))" 2>/dev/null || echo "-1")
if [ "$team_count" -gt 0 ] 2>/dev/null; then
    ok "팀 목록 형식 ($team_count 팀)"
else
    fail "팀 목록 형식" "응답 길이 $team_count"
fi

# ── 3. SQLite read cutover (state) ────────────────────────────
state_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/doogeun/state" || echo "000")
if [ "$state_code" = "200" ]; then
    ok "SQLite state read"
else
    fail "SQLite state read" "HTTP $state_code"
fi

# ── 4. git-head endpoint (배포 모달용) ─────────────────────────
git_resp=$(curl -s "$BASE/api/admin/git-head" 2>/dev/null || echo "{}")
ok_flag=$(echo "$git_resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print('yes' if d.get('ok') else 'no')" 2>/dev/null || echo "err")
if [ "$ok_flag" = "yes" ]; then
    ok "git-head endpoint"
else
    fail "git-head endpoint" "응답: $(echo "$git_resp" | head -c 100)"
fi

# ── 5. 프론트엔드 빌드 (next build) ────────────────────────────
if [ "${SKIP_BUILD:-0}" = "1" ]; then
    echo "  ⊘ 빌드 검증 스킵 (SKIP_BUILD=1)"
else
    pushd "$(dirname "$0")/../doogeun-hq" > /dev/null
    if npx next build > /tmp/smoke-build.log 2>&1; then
        ok "프론트엔드 빌드"
    else
        fail "프론트엔드 빌드" "tail /tmp/smoke-build.log: $(tail -3 /tmp/smoke-build.log | tr '\n' ' ')"
    fi
    popd > /dev/null
fi

# ── 6. Python import 헬스 (백엔드 코드 무결성) ──────────────────
pushd "$(dirname "$0")/../server" > /dev/null
if [ -d venv ]; then
    if venv/bin/python3 -c "import main" > /tmp/smoke-import.log 2>&1; then
        ok "백엔드 import 무결성"
    else
        fail "백엔드 import" "$(head -3 /tmp/smoke-import.log)"
    fi
else
    echo "  ⊘ Python venv 없음 — 스킵"
fi
popd > /dev/null

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
total=$((PASS + FAIL))
if [ "$FAIL" = "0" ]; then
    echo "$(color "32" "✅ ALL GREEN") $PASS / $total"
    exit 0
else
    echo "$(color "31" "❌ FAILED") $FAIL / $total — 실패 리스트:"
    for t in "${FAIL_LIST[@]}"; do echo "   • $t"; done
    exit "$FAIL"
fi
