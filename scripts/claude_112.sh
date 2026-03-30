#!/bin/bash
# ============================================
# 🚔 112 (claude_112.sh) - 서비스 상태 감시 + 자동 복구
# 3분마다 실행, 서비스 다운 감지 시:
#   1) 자동 복구 시도
#   2) N회 연속 실패(기본 2회=6분) 시에만 알림 발송
#   3) 두근컴퍼니 푸시알림 + 텔레그램 상황 보고
# ============================================

LOG="$HOME/claude_112.log"
ALERT_COOLDOWN_FILE="$HOME/.claude_112_cooldown"
ALERT_COOLDOWN=1800   # 30분 쿨다운 (자가복구 여유 충분히)
FAIL_THRESHOLD=2      # 연속 2회(=6분) 실패 시에만 알림

# 서비스별 연속 실패 카운터 파일
HQ_FAIL_FILE="$HOME/.claude_112_hq_fail"
TUNNEL_FAIL_FILE="$HOME/.claude_112_tunnel_fail"
UPBIT_FAIL_FILE="$HOME/.claude_112_upbit_fail"

# 두근컴퍼니 서버
HQ_API="http://localhost:8000"
HQ_SERVER_DIR="$HOME/Developer/my-company/company-hq/server"

# 텔레그램 (백업)
TG_TOKEN="8307093690:AAHKw3Daqey7QtH43oSnc0XDex55zi-_JVU"
TG_CHAT_ID="8440882806"

# 로그 크기 관리
if [ -f "$LOG" ]; then
    LOG_SIZE=$(stat -f%z "$LOG" 2>/dev/null || echo 0)
    if [ "$LOG_SIZE" -gt 5242880 ]; then
        mv "$LOG" "${LOG}.old"
    fi
fi

log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"
}

tg_send() {
    curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
        -d "chat_id=${TG_CHAT_ID}" \
        -d "parse_mode=HTML" \
        -d "text=$1" > /dev/null 2>&1
}

hq_push() {
    curl -s -X POST "${HQ_API}/api/push/119" \
        -H "Content-Type: application/json" \
        -d "{\"title\":\"$1\",\"body\":\"$2\"}" \
        > /dev/null 2>&1
}

check_alert_cooldown() {
    if [ -f "$ALERT_COOLDOWN_FILE" ]; then
        LAST_ALERT=$(cat "$ALERT_COOLDOWN_FILE" 2>/dev/null | tr -d '[:space:]' || echo 0)
        LAST_ALERT=${LAST_ALERT:-0}
        NOW=$(date +%s)
        ELAPSED=$(( NOW - LAST_ALERT ))
        if [ "$ELAPSED" -lt "$ALERT_COOLDOWN" ]; then
            return 1
        fi
    fi
    return 0
}

set_alert_cooldown() {
    date +%s > "$ALERT_COOLDOWN_FILE"
}

# 연속 실패 카운터 헬퍼
get_fail_count() {
    local file="$1"
    local count
    count=$(cat "$file" 2>/dev/null | tr -d '[:space:]')
    echo "${count:-0}"
}

increment_fail() {
    local file="$1"
    local count
    count=$(get_fail_count "$file")
    count=$(( count + 1 ))
    printf '%d\n' "$count" > "$file"
    echo "$count"
}

reset_fail() {
    printf '0\n' > "$1"
}

# ========================================
# 서비스 상태 체크 + 자동 복구
# ========================================

ISSUES=""
RECOVERED=""

# --- 1. company-hq 백엔드 (uvicorn, 포트 8000) ---
# ⚠️  서버 재시작은 launchd(com.company-hq-server)에 위임.
#     112는 API 응답 + launchd 등록 여부만 감시하는 2차 감시자 역할.
HQ_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${HQ_API}/api/teams" --max-time 5 2>/dev/null)
if [ "$HQ_STATUS" != "200" ]; then
    HQ_FAIL=$(increment_fail "$HQ_FAIL_FILE")
    log_msg "[DOWN] company-hq 서버 다운 (응답: ${HQ_STATUS}) — ${HQ_FAIL}/${FAIL_THRESHOLD}회 연속"

    # launchd가 서비스를 등록하고 있는지 확인
    LAUNCHD_STATUS=$(launchctl list 2>/dev/null | grep "com.company-hq-server")
    if [ -z "$LAUNCHD_STATUS" ]; then
        log_msg "[WARN] launchd에 com.company-hq-server 미등록 — launchctl load 필요"
        if [ "$HQ_FAIL" -ge "$FAIL_THRESHOLD" ]; then
            ISSUES="${ISSUES}❌ company-hq 서버 ${HQ_FAIL}회 연속 다운 + launchd 미등록 (수동 확인 필요)\n"
        fi
    else
        # launchd가 관리 중이면 재시작 중일 가능성이 높음 — 알림 임계치까지 대기
        log_msg "[INFO] launchd가 재시작 처리 중 (${LAUNCHD_STATUS})"
        if [ "$HQ_FAIL" -ge "$FAIL_THRESHOLD" ]; then
            ISSUES="${ISSUES}❌ company-hq 서버 ${HQ_FAIL}회 연속 다운 (launchd 재시작 반복 중, 수동 확인 필요)\n"
        fi
    fi
else
    # 정상 복귀 시 카운터 리셋
    PREV=$(get_fail_count "$HQ_FAIL_FILE")
    if [ "$PREV" -gt 0 ]; then
        log_msg "[OK] company-hq 정상 복귀 (이전 연속 실패: ${PREV}회)"
        reset_fail "$HQ_FAIL_FILE"
    fi
fi

# --- 2. Cloudflare Tunnel (외부 접근) ---
TUNNEL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://api.600g.net/api/teams" --max-time 10 2>/dev/null)
if [ "$TUNNEL_STATUS" != "200" ]; then
    TUNNEL_FAIL=$(increment_fail "$TUNNEL_FAIL_FILE")
    log_msg "[DOWN] Cloudflare Tunnel 다운 (응답: ${TUNNEL_STATUS}) — ${TUNNEL_FAIL}/${FAIL_THRESHOLD}회 연속"

    # 복구 시도
    if command -v cloudflared &>/dev/null; then
        pkill -f cloudflared 2>/dev/null
        sleep 2
        cloudflared tunnel run 2>/dev/null &
        sleep 5
        TUNNEL_RETRY=$(curl -s -o /dev/null -w "%{http_code}" "https://api.600g.net/api/teams" --max-time 10 2>/dev/null)
        if [ "$TUNNEL_RETRY" = "200" ]; then
            log_msg "[RECOVERED] Tunnel 복구 성공 (연속 ${TUNNEL_FAIL}회 후)"
            if [ "$TUNNEL_FAIL" -ge "$FAIL_THRESHOLD" ]; then
                RECOVERED="${RECOVERED}✅ Cloudflare Tunnel 복구 완료 (${TUNNEL_FAIL}회 다운 후)\n"
            fi
            reset_fail "$TUNNEL_FAIL_FILE"
        else
            log_msg "[FAIL] Tunnel 복구 실패"
            if [ "$TUNNEL_FAIL" -ge "$FAIL_THRESHOLD" ]; then
                ISSUES="${ISSUES}❌ Cloudflare Tunnel ${TUNNEL_FAIL}회 연속 다운 + 복구 실패\n"
            fi
        fi
    else
        # cloudflared 없으면 카운터만 관리
        if [ "$TUNNEL_FAIL" -ge "$FAIL_THRESHOLD" ]; then
            ISSUES="${ISSUES}❌ Cloudflare Tunnel ${TUNNEL_FAIL}회 연속 다운 (cloudflared 없음)\n"
        fi
    fi
else
    PREV=$(get_fail_count "$TUNNEL_FAIL_FILE")
    if [ "$PREV" -gt 0 ]; then
        log_msg "[OK] Tunnel 정상 복귀 (이전 연속 실패: ${PREV}회)"
        reset_fail "$TUNNEL_FAIL_FILE"
    fi
fi

# --- 3. 업비트 매매봇 ---
UPBIT_DIR="$HOME/Desktop/업비트자동"
if [ -f "$UPBIT_DIR/bot.pid" ]; then
    BOT_PID=$(cat "$UPBIT_DIR/bot.pid" 2>/dev/null | tr -d '[:space:]')
    if [ -n "$BOT_PID" ] && ! kill -0 "$BOT_PID" 2>/dev/null; then
        UPBIT_FAIL=$(increment_fail "$UPBIT_FAIL_FILE")
        log_msg "[DOWN] 업비트 매매봇 다운 (PID: ${BOT_PID}) — ${UPBIT_FAIL}/${FAIL_THRESHOLD}회 연속"
        if [ "$UPBIT_FAIL" -ge "$FAIL_THRESHOLD" ]; then
            ISSUES="${ISSUES}❌ 업비트 매매봇 ${UPBIT_FAIL}회 연속 다운 (watchdog 확인 필요)\n"
        fi
    else
        reset_fail "$UPBIT_FAIL_FILE"
    fi
fi

# --- 4. MCP 서버 — 알림 없음 (Claude 세션 시작 시 자동 시작) ---
MCP_PID=$(pgrep -f "mcp_server.py" 2>/dev/null)
if [ -z "$MCP_PID" ]; then
    log_msg "[INFO] MCP 서버 미실행 (정상 — 다음 Claude 세션에서 자동 시작)"
fi

# ========================================
# 정상이면 종료
# ========================================

if [ -z "$ISSUES" ] && [ -z "$RECOVERED" ]; then
    MINUTE=$(date +%-M)
    MINUTE=$(( 10#$MINUTE + 0 ))  # 안전한 십진수 변환
    if [ $(( MINUTE % 5 )) -eq 0 ]; then
        log_msg "[OK] 전 서비스 정상"
    fi
    exit 0
fi

# ========================================
# 🚔 112 출동 — 보고 + 알림
# ========================================

log_msg "[🚔 112] 이상 감지: $ISSUES"

if check_alert_cooldown; then
    NOW=$(date '+%m/%d %H:%M')

    # 푸시알림 본문
    PUSH_BODY=""
    if [ -n "$ISSUES" ]; then
        PUSH_BODY=$(echo -e "$ISSUES" | tr '\n' ' ' | sed 's/\\n/ /g' | head -c 180)
    fi
    if [ -n "$RECOVERED" ]; then
        REC_TEXT=$(echo -e "$RECOVERED" | tr '\n' ' ' | sed 's/\\n/ /g')
        PUSH_BODY="${PUSH_BODY} ${REC_TEXT}"
    fi

    # 복구 성공 여부에 따라 상태 메시지
    if [ -n "$RECOVERED" ] && [ -z "$(echo -e "$ISSUES" | grep '복구 실패')" ]; then
        STATUS_MSG="자동 복구 완료"
    elif [ -n "$RECOVERED" ]; then
        STATUS_MSG="일부 복구 완료. 잔여 이슈 수동 확인 필요"
    else
        STATUS_MSG="자동 복구 실패 — 수동 확인 필요"
    fi

    PUSH_BODY="${PUSH_BODY} | ${STATUS_MSG}"

    # 1) 두근컴퍼니 푸시알림
    hq_push "🚔 112 서비스 점검" "$PUSH_BODY"

    # 2) 텔레그램 (항상 동작 — 메인 알림)
    TG_MSG="🚔 <b>112 서비스 점검</b> (${NOW})

${ISSUES}"
    if [ -n "$RECOVERED" ]; then
        TG_MSG="${TG_MSG}
${RECOVERED}"
    fi
    TG_MSG="${TG_MSG}
📋 ${STATUS_MSG}"

    tg_send "$TG_MSG"
    set_alert_cooldown
    log_msg "[🚔 112] 알림 발송 완료"
else
    log_msg "[🚔 112] 쿨다운 중 — 알림 미발송"
fi

exit 0
