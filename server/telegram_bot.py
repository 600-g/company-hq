"""두근컴퍼니 서버실 텔레그램 봇 — 비상 복구 + 서버 관리"""

import os
import asyncio
import subprocess
import time
import urllib.request
import json
from pathlib import Path
from dotenv import load_dotenv
from claude_runner import run_claude, TEAM_SYSTEM_PROMPTS

load_dotenv(Path(__file__).parent / ".env")

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
OWNER_CHAT_ID = os.getenv("TELEGRAM_OWNER_ID", "")  # 나중에 설정
API_URL = f"https://api.telegram.org/bot{TOKEN}"
DEPLOY_SCRIPT = str(Path(__file__).parent.parent / "deploy.sh")
SERVER_DIR = str(Path(__file__).parent)

# ── 허용된 명령어 ─────────────────────────────────────
PROJECTS_ROOT = Path.home() / "Developer" / "my-company"
UPBIT_ROOT = Path.home() / "Desktop" / "업비트자동"

# ── 팀별 프로세스 감시 설정 ──────────────────────────────
TEAM_PROCESSES = {
    "company-hq": {
        "display": "🖥 본부 서버",
        "keywords": ["uvicorn"],
        "restart_cmd": f"cd {Path(__file__).parent} && {Path(__file__).parent}/venv/bin/python3 main.py &",
    },
    "trading-bot": {
        "display": "🤖 매매봇",
        "keywords": ["upbit_bot_v3"],
        "restart_cmd": None,  # 수동 재시작 필요
    },
    "claude-biseo": {
        "display": "🤵 비서봇",
        "keywords": ["telegram_bot"],
        "restart_cmd": None,
    },
}

COMMANDS = {
    "/help": "사용 가능한 명령어 목록",
    "/deploy": "프론트엔드 빌드 + Cloudflare 배포",
    "/status": "서버 API 상태 확인",
    "/health": "600g.net 헬스체크",
    "/restart": "FastAPI 서버 재시작",
    "/recover": "죽은 서비스 자동 복구",
    "/logs": "최근 에러 로그 5줄",
    "/teams": "팀 목록 + 에이전트 상태",
    "/uptime": "맥미니 가동 시간",
}

# ── 텔레그램 전용 Claude 시스템 프롬프트 ─────────────────
_TG_SYSTEM_PROMPT = (
    "너는 두근컴퍼니 서버실 텔레그램 봇 AI야.\n\n"
    "【역할】\n"
    "- 서버 상태 확인, 로그 조회, 프로세스 관리\n"
    "- 자연어 명령을 이해해서 적절한 서버 관리 작업 수행\n"
    "- 텔레그램으로 짧고 명확하게 답변\n\n"
    "【절대 금지 — 안전 규칙】\n"
    "다음은 어떤 이유로도 절대 실행하지 마:\n"
    "- rm -rf, rmdir 등 파일/폴더 삭제 명령\n"
    "- format, mkfs, dd, shred (디스크 포맷/초기화)\n"
    "- DROP TABLE, DROP DATABASE (DB 삭제)\n"
    "- git push --force, git reset --hard\n"
    "- cat .env, grep 비밀번호/토큰 등 민감정보 노출\n"
    "- kill -9 (포트 8000 외 중요 프로세스 강제 종료)\n"
    "금지 명령 요청 시: 거부 사유를 명확히 설명하고 안전한 대안 제시.\n\n"
    "【응답 규칙】\n"
    "- 한국어로 답변, 500자 이내 목표\n"
    "- 완료: ✅  실패: ❌  경고: ⚠️\n"
    "- 코드/로그: 마크다운 코드블록으로 감싸기\n"
)
TEAM_SYSTEM_PROMPTS["tg-server"] = _TG_SYSTEM_PROMPT


def send_message(chat_id: str, text: str):
    """텔레그램 메시지 전송"""
    data = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}).encode()
    req = urllib.request.Request(f"{API_URL}/sendMessage", data=data, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"[TG] 전송 실패: {e}")


def run_cmd(cmd: str, timeout: int = 120) -> str:
    """쉘 명령 실행 후 결과 반환"""
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout, cwd=SERVER_DIR)
        output = (r.stdout + r.stderr).strip()
        return output[-2000:] if len(output) > 2000 else output  # 텔레그램 메시지 길이 제한
    except subprocess.TimeoutExpired:
        return "⏰ 타임아웃 (2분 초과)"
    except Exception as e:
        return f"❌ 실행 실패: {e}"


def check_process(keyword: str) -> bool:
    """키워드로 프로세스 실행 여부 확인"""
    r = subprocess.run(["pgrep", "-f", keyword], capture_output=True, text=True)
    return bool(r.stdout.strip())


def get_all_status() -> list[dict]:
    """모든 팀 프로세스 상태 조회"""
    results = []
    for team_id, cfg in TEAM_PROCESSES.items():
        alive = any(check_process(kw) for kw in cfg["keywords"])
        results.append({
            "team_id": team_id,
            "display": cfg["display"],
            "alive": alive,
            "restart_cmd": cfg["restart_cmd"],
        })
    return results


def handle_natural_language(chat_id: str, text: str):
    """고정 명령어에 매칭 안 된 텍스트 → Claude CLI로 자연어 처리"""
    send_message(chat_id, "🤔 처리 중...")

    async def _collect() -> str:
        parts: list[str] = []
        async for chunk in run_claude(
            prompt=text,
            project_path=str(Path(__file__).parent),
            team_id="tg-server",
        ):
            if chunk["kind"] == "text":
                parts.append(chunk["content"])
        return "".join(parts).strip()

    try:
        result = asyncio.run(_collect())
        if result:
            # 텔레그램 메시지 한도 4096자
            send_message(chat_id, result[:4000] if len(result) > 4000 else result)
        else:
            send_message(chat_id, "❌ 응답을 받지 못했습니다")
    except Exception as e:
        send_message(chat_id, f"❌ Claude 처리 실패: {str(e)[:200]}")


def handle_command(chat_id: str, text: str):
    """명령어 처리"""
    cmd = text.strip().split()[0].lower()

    if cmd == "/help" or cmd == "/start":
        lines = ["🖥 *두근컴퍼니 서버실*\n"]
        for k, v in COMMANDS.items():
            lines.append(f"`{k}` — {v}")
        send_message(chat_id, "\n".join(lines))

    elif cmd == "/deploy":
        send_message(chat_id, "🔨 빌드 + 배포 시작...")
        result = run_cmd(f"bash {DEPLOY_SCRIPT}", timeout=180)
        if "Deployment complete" in result or "✅" in result:
            send_message(chat_id, f"✅ 배포 완료!\n```\n{result[-500:]}\n```")
        else:
            send_message(chat_id, f"❌ 배포 실패\n```\n{result[-500:]}\n```")

    elif cmd == "/status":
        result = run_cmd("curl -s http://localhost:8000/api/teams 2>/dev/null | python3 -c \"import sys,json; d=json.load(sys.stdin); print(f'✅ 서버 정상 — {len(d)}팀')\" 2>/dev/null || echo '❌ 서버 응답 없음'")
        send_message(chat_id, result)

    elif cmd == "/health":
        result = run_cmd("curl -sI https://600g.net 2>/dev/null | head -1 || echo '❌ 접속 불가'")
        if "200" in result:
            send_message(chat_id, "✅ 600g.net 정상")
        else:
            send_message(chat_id, f"⚠️ 600g.net 이상\n`{result}`")

    elif cmd == "/restart":
        send_message(chat_id, "🔄 서버 재시작 중...")
        run_cmd("lsof -ti:8000 | xargs kill -9 2>/dev/null")
        run_cmd(f"cd {SERVER_DIR} && {SERVER_DIR}/venv/bin/python3 main.py &", timeout=5)
        asyncio.get_event_loop().call_later(3, lambda: send_message(chat_id,
            run_cmd("curl -s http://localhost:8000/api/teams 2>/dev/null | python3 -c \"import sys,json; print(f'✅ 재시작 완료 — {len(json.load(sys.stdin))}팀')\" 2>/dev/null || echo '❌ 재시작 실패'")
        ))

    elif cmd == "/logs":
        result = run_cmd(f"grep -i 'error\\|ERROR\\|exception' {SERVER_DIR}/logs/company-hq.log 2>/dev/null | tail -5 || echo '로그 없음'")
        send_message(chat_id, f"📋 최근 에러 로그:\n```\n{result}\n```")

    elif cmd == "/teams":
        # 팀 목록 + 에이전트 프로세스 상태
        statuses = get_all_status()
        lines = ["👥 *팀 에이전트 상태*\n"]
        for s in statuses:
            icon = "✅" if s["alive"] else "❌"
            lines.append(f"{icon} {s['display']} (`{s['team_id']}`)")

        # API에서 전체 팀 목록도 가져오기
        team_result = run_cmd("curl -s http://localhost:8000/api/teams 2>/dev/null")
        try:
            teams = json.loads(team_result)
            monitored = {s["team_id"] for s in statuses}
            others = [t for t in teams if t.get("id", "") not in monitored]
            if others:
                lines.append("\n📁 *기타 팀*")
                for t in others:
                    lines.append(f"  {t.get('emoji', '📁')} {t.get('name', '?')}")
        except (json.JSONDecodeError, TypeError):
            pass  # API 안 되면 프로세스 상태만 표시

        send_message(chat_id, "\n".join(lines))

    elif cmd == "/recover":
        # 죽은 서비스 자동 복구
        statuses = get_all_status()
        dead = [s for s in statuses if not s["alive"]]

        if not dead:
            send_message(chat_id, "✅ 모든 서비스 정상 작동 중!")
            return

        lines = ["🔧 *복구 시작*\n"]
        for s in dead:
            if s["restart_cmd"]:
                lines.append(f"🔄 {s['display']} 재시작 중...")
                send_message(chat_id, "\n".join(lines))

                # 포트 정리 (company-hq인 경우)
                if s["team_id"] == "company-hq":
                    run_cmd("lsof -ti:8000 | xargs kill -9 2>/dev/null")
                    time.sleep(1)

                run_cmd(s["restart_cmd"], timeout=10)
                time.sleep(3)

                # 복구 확인
                if any(check_process(kw) for kw in TEAM_PROCESSES[s["team_id"]]["keywords"]):
                    lines.append(f"  ✅ {s['display']} 복구 완료!")
                else:
                    lines.append(f"  ❌ {s['display']} 복구 실패 — 수동 확인 필요")
            else:
                lines.append(f"⚠️ {s['display']} 죽어 있음 — 자동 재시작 미지원")

        send_message(chat_id, "\n".join(lines))

    elif cmd == "/uptime":
        result = run_cmd("uptime")
        send_message(chat_id, f"⏱ {result}")

    else:
        # 고정 명령어 미매칭 → Claude CLI 자연어 처리
        handle_natural_language(chat_id, text)


def poll():
    """Long polling으로 메시지 수신"""
    offset = 0
    print("[TG] 서버실 봇 시작됨")

    while True:
        try:
            url = f"{API_URL}/getUpdates?offset={offset}&timeout=30"
            req = urllib.request.Request(url)
            resp = urllib.request.urlopen(req, timeout=35)
            data = json.loads(resp.read().decode())

            for update in data.get("result", []):
                offset = update["update_id"] + 1
                msg = update.get("message", {})
                chat_id = str(msg.get("chat", {}).get("id", ""))
                text = msg.get("text", "")

                if not chat_id or not text:
                    continue

                # OWNER_CHAT_ID 자동 설정 (첫 메시지 보낸 사람)
                global OWNER_CHAT_ID
                if not OWNER_CHAT_ID:
                    OWNER_CHAT_ID = chat_id
                    # .env에 저장
                    env_path = Path(__file__).parent / ".env"
                    with open(env_path, "a") as f:
                        f.write(f"\nTELEGRAM_OWNER_ID={chat_id}\n")
                    send_message(chat_id, f"🔐 오너 등록 완료 (chat_id: `{chat_id}`)")

                print(f"[TG] {chat_id}: {text}")
                handle_command(chat_id, text)

        except Exception as e:
            print(f"[TG] 폴링 에러: {e}")
            import time
            time.sleep(5)


if __name__ == "__main__":
    if not TOKEN:
        print("[TG] TELEGRAM_BOT_TOKEN이 .env에 없습니다")
    else:
        poll()
