#!/bin/bash
# 서버 강제 재시작 — 코드 변경 후 반드시 실행
echo "🔄 서버 재시작 중..."
pkill -f "python.*main.py" 2>/dev/null
pkill -f "uvicorn.*main" 2>/dev/null
sleep 2

cd ~/Developer/my-company/company-hq/server
source venv/bin/activate
nohup python main.py > /tmp/hq-server.log 2>&1 &
sleep 3

# 확인
STATUS=$(curl -s --max-time 3 http://localhost:8000/api/standby 2>/dev/null)
if echo "$STATUS" | grep -q '"ok":true'; then
    echo "✅ 서버 정상 가동 (PID: $(lsof -ti :8000 | head -1))"
else
    echo "❌ 서버 시작 실패"
    cat /tmp/hq-server.log | tail -5
    exit 1
fi
