#!/bin/bash
# ============================================
# ☀️ claude_daily_report.sh - 매일 아침 서버 상태 요약 보고
# launchd로 매일 08:00 자동 실행
# 프로세스 / CPU·MEM / 디스크 / 서비스 헬스 → 텔레그램 발송
# ============================================

LOG="$HOME/claude_daily_report.log"
TG_TOKEN="8307093690:AAHKw3Daqey7QtH43oSnc0XDex55zi-_JVU"
TG_CHAT_ID="8440882806"
HQ_API="http://localhost:8000"
HQ_SERVER_DIR="$HOME/Developer/my-company/company-hq/server"
UPBIT_BOT_DIR="$HOME/Developer/my-company/upbit-auto-trading-bot"

# 로그 크기 관리 (2MB 초과 시 로테이션)
if [ -f "$LOG" ]; then
    LOG_SIZE=$(stat -f%z "$LOG" 2>/dev/null || echo 0)
    if [ "$LOG_SIZE" -gt 2097152 ]; then
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
        --data-urlencode "text=$1" > /dev/null 2>&1
}

log_msg "아침 보고 시작"

NOW=$(date '+%m/%d(%a) %H:%M')

# ========================================
# 1. Claude 프로세스 현황
# ========================================
CLAUDE_COUNT=$(ps -eo command | grep -E "claude " | grep -v grep | grep -v "Claude.app" | grep -v "Claude Helper" | grep -v crashpad | wc -l | tr -d ' ')
CLAUDE_COUNT=$((10#${CLAUDE_COUNT:-0}))

NPM_COUNT=$(ps -eo command | grep "npm exec.*claude-code" | grep -v grep | wc -l | tr -d ' ')
NPM_COUNT=$((10#${NPM_COUNT:-0}))

TOTAL_CLAUDE=$(( CLAUDE_COUNT + NPM_COUNT ))

# CPU/MEM 합산
CPU_TOTAL=0
MEM_TOTAL_KB=0
for pid in $(ps -eo pid,command | grep -E "claude " | grep -v grep | grep -v "Claude.app" | grep -v "Claude Helper" | grep -v crashpad | awk '{print $1}'); do
    STATS=$(ps -o %cpu=,rss= -p "$pid" 2>/dev/null)
    if [ -n "$STATS" ]; then
        CPU=$(echo "$STATS" | awk '{print int($1)}')
        MEM=$(echo "$STATS" | awk '{print $2}')
        CPU_TOTAL=$(( CPU_TOTAL + CPU ))
        MEM_TOTAL_KB=$(( MEM_TOTAL_KB + MEM ))
    fi
done
MEM_TOTAL_MB=$(( MEM_TOTAL_KB / 1024 ))

# ========================================
# 2. 시스템 전체 CPU / MEM
# ========================================
SYS_CPU=$(top -l 1 -n 0 2>/dev/null | grep "CPU usage" | awk '{print $3}' | tr -d '%')
SYS_MEM_FREE=$(vm_stat 2>/dev/null | awk '/Pages free/{print $3}' | tr -d '.')
SYS_MEM_INACTIVE=$(vm_stat 2>/dev/null | awk '/Pages inactive/{print $3}' | tr -d '.')
if [ -n "$SYS_MEM_FREE" ] && [ -n "$SYS_MEM_INACTIVE" ]; then
    SYS_MEM_AVAIL_MB=$(( (SYS_MEM_FREE + SYS_MEM_INACTIVE) * 4096 / 1024 / 1024 ))
else
    SYS_MEM_AVAIL_MB="?"
fi

# ========================================
# 3. 디스크 사용률
# ========================================
DISK_INFO=$(df -h / 2>/dev/null | tail -1)
DISK_USED=$(echo "$DISK_INFO" | awk '{print $3}')
DISK_AVAIL=$(echo "$DISK_INFO" | awk '{print $4}')
DISK_PCT=$(echo "$DISK_INFO" | awk '{print $5}')

# ========================================
# 4. 서비스 헬스 체크
# ========================================

# company-hq 서버 (FastAPI)
SERVER_STATUS="❌ DOWN"
if curl -s --max-time 3 "${HQ_API}/api/teams" > /dev/null 2>&1; then
    SERVER_STATUS="✅ UP"
fi

# Cloudflare Tunnel
TUNNEL_STATUS="❌ DOWN"
if pgrep -f "cloudflared" > /dev/null 2>&1; then
    TUNNEL_STATUS="✅ UP"
fi

# 업비트 매매봇
BOT_STATUS="❌ DOWN"
if pgrep -f "trading_bot\|upbit.*bot\|bot.*main.py" > /dev/null 2>&1; then
    BOT_STATUS="✅ UP"
elif [ -f "${UPBIT_BOT_DIR}/trading_bot.py" ]; then
    if pgrep -f "${UPBIT_BOT_DIR}" > /dev/null 2>&1; then
        BOT_STATUS="✅ UP"
    fi
fi

# 텔레그램 봇
TG_BOT_STATUS="❌ DOWN"
if pgrep -f "telegram_bot\|python.*bot.py" > /dev/null 2>&1; then
    TG_BOT_STATUS="✅ UP"
fi

# ========================================
# 5. 최근 119/112 알람 횟수 (오늘)
# ========================================
TODAY=$(date '+%Y-%m-%d')
GUARD_119_TODAY=$(grep -c "\[🚒 119\]" "$HOME/claude_guard.log" 2>/dev/null | tr -d ' ')
GUARD_112_TODAY=$(grep -c "\[🚔 112\]" "$HOME/claude_112.log" 2>/dev/null | tr -d ' ')
GUARD_119_TODAY=$((10#${GUARD_119_TODAY:-0}))
GUARD_112_TODAY=$((10#${GUARD_112_TODAY:-0}))

# ========================================
# 6. CPU 지속 카운터 확인
# ========================================
CPU_HIGH_COUNT=$(cat "$HOME/.claude_guard_cpu_high" 2>/dev/null || echo 0)
CPU_HIGH_COUNT=$((10#${CPU_HIGH_COUNT:-0}))
if [ "$CPU_HIGH_COUNT" -gt 0 ]; then
    CPU_STATUS_NOTE=" ⚠️ 고CPU ${CPU_HIGH_COUNT}회 지속중"
else
    CPU_STATUS_NOTE=""
fi

# ========================================
# 텔레그램 보고 메시지 작성
# ========================================

# 전반적 상태 판단
ALL_SERVICES_OK=true
if [ "$SERVER_STATUS" = "❌ DOWN" ]; then ALL_SERVICES_OK=false; fi
if [ "$TUNNEL_STATUS" = "❌ DOWN" ]; then ALL_SERVICES_OK=false; fi

if [ "$ALL_SERVICES_OK" = true ]; then
    HEADER="☀️ <b>아침 보고</b> — 이상 없음"
else
    HEADER="⚠️ <b>아침 보고</b> — 점검 필요"
fi

MSG="${HEADER} (${NOW})

🤖 <b>Claude 프로세스</b>
  실행 중: ${TOTAL_CLAUDE}개 | CPU: ${CPU_TOTAL}%${CPU_STATUS_NOTE} | MEM: ${MEM_TOTAL_MB}MB

💻 <b>시스템 리소스</b>
  CPU 사용률: ${SYS_CPU:-?}% | 여유 메모리: ${SYS_MEM_AVAIL_MB}MB
  디스크(/) 사용: ${DISK_USED} / 여유: ${DISK_AVAIL} (${DISK_PCT})

🏢 <b>서비스 상태</b>
  HQ 서버: ${SERVER_STATUS}
  CF Tunnel: ${TUNNEL_STATUS}
  매매봇: ${BOT_STATUS}
  TG봇: ${TG_BOT_STATUS}

🚨 <b>어제 알람</b>
  119(프로세스): ${GUARD_119_TODAY}회 | 112(서비스): ${GUARD_112_TODAY}회

<i>맥미니 정상 동작 중 — 좋은 아침! ☕</i>"

tg_send "$MSG"
log_msg "아침 보고 발송 완료 (Claude: ${TOTAL_CLAUDE}개, 서버: ${SERVER_STATUS}, 터널: ${TUNNEL_STATUS})"

exit 0
