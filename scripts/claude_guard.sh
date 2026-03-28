#!/bin/bash
# ============================================
# 🚒 119 (claude_guard.sh) - Claude 프로세스 폭주 감시 + 자동 정리
# 3분마다 실행, 비정상 감지 시:
#   1) 유령 프로세스 자동 종료
#   2) 두근컴퍼니 푸시알림 + 텔레그램 상황 보고
# ============================================

LOG="$HOME/claude_guard.log"
ALERT_COOLDOWN_FILE="$HOME/.claude_guard_cooldown"
CPU_HIGH_COUNT_FILE="$HOME/.claude_guard_cpu_high"  # CPU 지속성 카운터

# 임계값
MAX_CLAUDE_PROCS=15      # Claude 프로세스 15개 초과 시 경고 (8개 이상 에이전트 운영 중)
MAX_CPU_TOTAL=200        # Claude 총 CPU 200% 초과 시 경고 (합산, 코어당 100%)
CPU_SUSTAINED_RUNS=3     # 몇 회 연속 고CPU 시 알람 (3회 × 3분 = 9분 지속 시)
MAX_MEM_TOTAL_MB=3072    # Claude 총 메모리 3GB 초과 시 경고
ALERT_COOLDOWN=600       # 알림 쿨다운 10분 (중복 알림 방지)

# 두근컴퍼니 서버
HQ_API="http://localhost:8000"

# 텔레그램 (백업 알림)
TG_TOKEN="8307093690:AAHKw3Daqey7QtH43oSnc0XDex55zi-_JVU"
TG_CHAT_ID="8440882806"

# 로그 크기 관리 (5MB 초과 시 로테이션)
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

# 두근컴퍼니 푸시알림 (인앱 + 웹 푸시)
hq_push() {
    local title="$1"
    local body="$2"
    curl -s -X POST "${HQ_API}/api/push/119" \
        -H "Content-Type: application/json" \
        -d "{\"title\":\"$title\",\"body\":\"$body\",\"tag\":\"119-alert\",\"team_id\":\"server-monitor\"}" \
        > /dev/null 2>&1
}

# 알림 쿨다운 확인 (중복 알림 방지)
check_alert_cooldown() {
    if [ -f "$ALERT_COOLDOWN_FILE" ]; then
        LAST_ALERT=$(cat "$ALERT_COOLDOWN_FILE" 2>/dev/null || echo 0)
        NOW=$(date +%s)
        ELAPSED=$(( NOW - LAST_ALERT ))
        if [ "$ELAPSED" -lt "$ALERT_COOLDOWN" ]; then
            return 1  # 쿨다운 중
        fi
    fi
    return 0  # 알림 가능
}

set_alert_cooldown() {
    date +%s > "$ALERT_COOLDOWN_FILE"
}

# ========================================
# Claude 프로세스 수집
# ========================================

# Claude CLI 프로세스만 (Claude Desktop 앱 제외)
CLAUDE_PIDS=$(ps -eo pid,command | grep -E "^[[:space:]]*[0-9]+.*claude " | grep -v grep | grep -v "Claude.app" | grep -v "Claude Helper" | grep -v crashpad | awk '{print $1}')
CLAUDE_COUNT=$(echo "$CLAUDE_PIDS" | grep -c '[0-9]' 2>/dev/null || echo 0)
CLAUDE_COUNT=$((10#${CLAUDE_COUNT:-0}))

# npm exec claude-code 프로세스
NPM_PIDS=$(ps -eo pid,command | grep "npm exec.*claude-code" | grep -v grep | awk '{print $1}')
NPM_COUNT=$(echo "$NPM_PIDS" | grep -c '[0-9]' 2>/dev/null || echo 0)
NPM_COUNT=$((10#${NPM_COUNT:-0}))

TOTAL_COUNT=$(( CLAUDE_COUNT + NPM_COUNT ))

# CPU/메모리 합산
CPU_TOTAL=0
MEM_TOTAL_KB=0

for pid in $CLAUDE_PIDS $NPM_PIDS; do
    if [ -n "$pid" ]; then
        STATS=$(ps -o %cpu=,rss= -p "$pid" 2>/dev/null)
        if [ -n "$STATS" ]; then
            CPU=$(echo "$STATS" | awk '{print int($1)}')
            MEM_KB=$(echo "$STATS" | awk '{print $2}')
            CPU_TOTAL=$(( CPU_TOTAL + CPU ))
            MEM_TOTAL_KB=$(( MEM_TOTAL_KB + MEM_KB ))
        fi
    fi
done

MEM_TOTAL_MB=$(( MEM_TOTAL_KB / 1024 ))

# ========================================
# 이상 감지
# ========================================

ALERT=""
ALERT_PLAIN=""
AUTO_KILL=false

# 1. 프로세스 수 초과
if [ "$TOTAL_COUNT" -gt "$MAX_CLAUDE_PROCS" ]; then
    ALERT="${ALERT}⚠️ 프로세스 폭주: ${TOTAL_COUNT}개 (한도: ${MAX_CLAUDE_PROCS})\n"
    ALERT_PLAIN="${ALERT_PLAIN}프로세스 ${TOTAL_COUNT}개 폭주. "
    AUTO_KILL=true
fi

# 2. CPU 지속성 감지 (순간 스파이크 무시, N회 연속 고CPU만 알람)
if [ "$CPU_TOTAL" -gt "$MAX_CPU_TOTAL" ]; then
    # 카운터 증가
    PREV_COUNT=$(cat "$CPU_HIGH_COUNT_FILE" 2>/dev/null || echo 0)
    PREV_COUNT=$((10#${PREV_COUNT:-0}))
    NEW_COUNT=$(( PREV_COUNT + 1 ))
    echo "$NEW_COUNT" > "$CPU_HIGH_COUNT_FILE"
    if [ "$NEW_COUNT" -ge "$CPU_SUSTAINED_RUNS" ]; then
        SUSTAINED_MIN=$(( NEW_COUNT * 3 ))
        ALERT="${ALERT}🔥 CPU 지속 과다: ${CPU_TOTAL}% — ${SUSTAINED_MIN}분 연속 (한도: ${MAX_CPU_TOTAL}%)\n"
        ALERT_PLAIN="${ALERT_PLAIN}CPU ${CPU_TOTAL}% ${SUSTAINED_MIN}분 지속. "
    else
        log_msg "[CPU경고] ${CPU_TOTAL}% — ${NEW_COUNT}/${CPU_SUSTAINED_RUNS}회 (아직 알람 아님)"
    fi
else
    # 정상 복귀 시 카운터 리셋
    if [ -f "$CPU_HIGH_COUNT_FILE" ]; then
        OLD=$(cat "$CPU_HIGH_COUNT_FILE" 2>/dev/null || echo 0)
        OLD=$((10#${OLD:-0}))
        if [ "$OLD" -gt 0 ]; then
            log_msg "[CPU정상] ${CPU_TOTAL}% — 카운터 리셋 (이전: ${OLD}회)"
        fi
        echo "0" > "$CPU_HIGH_COUNT_FILE"
    fi
fi

# 3. 메모리 초과
if [ "$MEM_TOTAL_MB" -gt "$MAX_MEM_TOTAL_MB" ]; then
    ALERT="${ALERT}💾 메모리 과다: ${MEM_TOTAL_MB}MB (한도: ${MAX_MEM_TOTAL_MB}MB)\n"
    ALERT_PLAIN="${ALERT_PLAIN}메모리 ${MEM_TOTAL_MB}MB. "
fi

# ========================================
# 정상 상태면 종료
# ========================================

if [ -z "$ALERT" ]; then
    MINUTE=$(date +%-M)
    if [ "$((10#$MINUTE % 5))" -eq 0 ]; then
        log_msg "[OK] Claude: ${TOTAL_COUNT}개, CPU: ${CPU_TOTAL}%, MEM: ${MEM_TOTAL_MB}MB"
    fi
    exit 0
fi

# ========================================
# 🚒 119 출동 — 감지 + 정리 + 알림
# ========================================

log_msg "[🚒 119] $ALERT_PLAIN"

# 자동 정리: 유령 프로세스 종료
KILLED=0
if [ "$AUTO_KILL" = true ]; then
    # 백그라운드(tty=??) Claude/npm 프로세스 종료 (VS Code/Antigravity 본체 제외)
    for pid in $(ps -eo pid,tty,command | grep -E "claude |npm exec.*claude-code" | grep -v grep | grep -v "Claude.app" | grep -v "antigravity" | awk '$2 == "??" {print $1}'); do
        kill "$pid" 2>/dev/null
        KILLED=$(( KILLED + 1 ))
    done
    log_msg "[🚒 119] 유령 프로세스 ${KILLED}개 자동 종료"
fi

# 정리 후 남은 프로세스 수
AFTER_COUNT=$(ps -eo command | grep -E "claude " | grep -v grep | grep -v "Claude.app" | grep -v "Claude Helper" | grep -v crashpad | wc -l | tr -d ' ')

# 알림 발송 (쿨다운 확인)
if check_alert_cooldown; then
    NOW=$(date '+%m/%d %H:%M')

    # 푸시알림용 본문
    PUSH_BODY="${ALERT_PLAIN}"
    if [ "$KILLED" -gt 0 ]; then
        PUSH_BODY="${PUSH_BODY}유령 ${KILLED}개 자동 정리 완료. 현재 ${AFTER_COUNT}개 정상. (소요: 즉시)"
    else
        PUSH_BODY="${PUSH_BODY}자동 정리 불가 — 수동 확인 필요. (예상: 5~10분)"
    fi

    # 1) 두근컴퍼니 푸시알림
    hq_push "🚒 119 긴급출동" "$PUSH_BODY"

    # 2) 텔레그램 (백업)
    TG_MSG="🚒 <b>119 긴급출동</b> (${NOW})

${ALERT}
📊 프로세스: ${TOTAL_COUNT}→${AFTER_COUNT}개 | CPU: ${CPU_TOTAL}% | MEM: ${MEM_TOTAL_MB}MB"

    if [ "$KILLED" -gt 0 ]; then
        TG_MSG="${TG_MSG}
🧹 유령 ${KILLED}개 자동 정리 완료"
    fi

    tg_send "$TG_MSG"
    set_alert_cooldown
    log_msg "[🚒 119] 알림 발송 완료 (푸시+텔레그램)"
fi

exit 0
