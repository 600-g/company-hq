#!/bin/bash
# ============================================
# QA 체크 스크립트 — 패치 후 반드시 실행 (토큰 0)
# 사용법: bash scripts/qa_check.sh
# ============================================

API="http://localhost:8000"
PASS=0
FAIL=0
TOTAL=0

check() {
    TOTAL=$((TOTAL + 1))
    local name="$1"
    local result="$2"
    local expected="$3"
    if echo "$result" | grep -q "$expected"; then
        echo "  ✅ $name"
        PASS=$((PASS + 1))
    else
        echo "  ❌ $name — 기대: '$expected' / 실제: '$(echo "$result" | head -1 | cut -c1-80)'"
        FAIL=$((FAIL + 1))
    fi
}

echo "🔍 QA 체크 시작..."
echo ""

# 1. 서버 살아있나
echo "[1/6] 서버 상태"
R=$(curl -s --max-time 3 "$API/api/standby" 2>&1)
check "서버 응답" "$R" '"ok":true'

# 2. 대시보드
echo "[2/6] 대시보드"
R=$(curl -s --max-time 5 "$API/api/dashboard" 2>&1)
check "대시보드 응답" "$R" '"agents"'

# 3. 멘션 → haiku 스킵 확인 (CPO 통합보고 없어야 함)
echo "[3/6] 멘션 라우팅 (핵심)"
R=$(curl -s -N --max-time 30 -X POST "$API/api/dispatch/smart" \
  -H "Content-Type: application/json" \
  -d '{"message":"@CPO 테스트"}' 2>&1)
check "멘션 → 직접 실행" "$R" "summary_chunk"
# haiku 라우팅이 안 거쳐야 함
if echo "$R" | grep -q "light/haiku"; then
    echo "  ❌ 멘션인데 haiku 라우팅 발생! 서버 코드가 최신이 아님"
    FAIL=$((FAIL + 1))
else
    echo "  ✅ haiku 스킵 확인"
    PASS=$((PASS + 1))
fi
TOTAL=$((TOTAL + 1))

# 4. 빌드 확인
echo "[4/6] 프론트 빌드"
if [ -d "$HOME/Developer/my-company/company-hq/ui/.next" ] || [ -d "$HOME/Developer/my-company/company-hq/ui/out" ]; then
    check "빌드 산출물" "exists" "exists"
else
    check "빌드 산출물" "missing" "exists"
fi

# 5. ttyd
echo "[5/6] ttyd"
R=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:7681" 2>&1)
check "ttyd 응답" "$R" "200"

# 6. 외부 접속
echo "[6/6] 외부 접속"
R=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "https://api.600g.net/api/standby" 2>&1)
check "api.600g.net" "$R" "200"

echo ""
echo "════════════════════════════════"
echo "  결과: $PASS/$TOTAL 통과 ($FAIL 실패)"
if [ "$FAIL" -eq 0 ]; then
    echo "  ✅ QA 통과 — 배포 가능"
else
    echo "  ❌ QA 실패 — 배포 금지"
fi
echo "════════════════════════════════"
exit $FAIL
