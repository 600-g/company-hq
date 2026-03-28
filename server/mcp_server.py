"""두근 컴퍼니 MCP 서버 — CPO 클로드 전용 도구 모음"""

import json
import os
import sqlite3
import subprocess
import time
from datetime import datetime, date
from pathlib import Path

from fastmcp import FastMCP

mcp = FastMCP("두근컴퍼니-HQ")

PROJECTS_ROOT = Path.home() / "Developer" / "my-company"
UPBIT_ROOT = Path.home() / "Desktop" / "업비트자동"
UPBIT_DB = UPBIT_ROOT / "trading_bot_v3.db"
SERVER_DIR = PROJECTS_ROOT / "company-hq" / "server"

TEAM_PATHS = {
    "trading-bot":   UPBIT_ROOT,
    "date-map":      PROJECTS_ROOT / "date-map",
    "claude-biseo":  PROJECTS_ROOT / "claude-biseo-v1.0",
    "ai900":         PROJECTS_ROOT / "ai900",
    "cl600g":        PROJECTS_ROOT / "cl600g",
    "company-hq":    PROJECTS_ROOT / "company-hq",
}

TEAM_LOG_FILES = {
    "trading-bot":  UPBIT_ROOT / "logs" / "bot.log",
    "claude-biseo": PROJECTS_ROOT / "claude-biseo-v1.0" / "claude_task.log",
}

# ── 서비스 프로세스 관리 설정 ──────────────────────────────
SERVICE_REGISTRY = {
    "company-hq": {
        "display": "본부 서버 (uvicorn)",
        "keywords": ["uvicorn"],
        "restart": f"cd {SERVER_DIR} && {SERVER_DIR}/venv/bin/python3 main.py &",
        "pre_restart": "lsof -ti:8000 | xargs kill -9 2>/dev/null",
    },
    "trading-bot": {
        "display": "업비트 매매봇",
        "keywords": ["upbit_bot_v3"],
        "restart": f"cd {UPBIT_ROOT} && {UPBIT_ROOT}/venv/bin/python3 upbit_bot_v3_0_complete.py &",
        "pre_restart": None,
    },
    "claude-biseo": {
        "display": "비서 텔레그램봇",
        "keywords": ["telegram_bot"],
        "restart": None,
    },
}


def _check_keyword(keyword: str) -> bool:
    r = subprocess.run(["pgrep", "-f", keyword], capture_output=True, text=True)
    return bool(r.stdout.strip())


def _is_service_alive(service_id: str) -> bool:
    cfg = SERVICE_REGISTRY.get(service_id)
    if not cfg:
        return False
    return any(_check_keyword(kw) for kw in cfg["keywords"])


# ── 1. 업비트 봇 현황 ─────────────────────────────────

@mcp.tool()
def upbit_status() -> str:
    """업비트 매매봇 현재 상태 조회 — 잔고, 보유 종목, 오늘 손익, 최근 거래"""
    if not UPBIT_DB.exists():
        return "❌ 업비트 DB를 찾을 수 없음"

    conn = sqlite3.connect(UPBIT_DB)
    try:
        cur = conn.cursor()

        # 잔고 + 보유 종목
        cur.execute("SELECT balance, positions_json, updated_at FROM active_positions ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        if not row:
            return "❌ active_positions 데이터 없음"

        balance, positions_json, updated_at = row
        positions = json.loads(positions_json).get("positions", {})

        # 오늘 손익
        today = date.today().isoformat()
        cur.execute("""
            SELECT COALESCE(SUM(profit), 0), COUNT(*)
            FROM trades
            WHERE action='sell' AND timestamp LIKE ?
        """, (f"{today}%",))
        today_profit, today_trades = cur.fetchone()

        # 최근 거래 5건
        cur.execute("""
            SELECT coin, action, price, amount, profit, profit_rate, timestamp
            FROM trades ORDER BY id DESC LIMIT 5
        """)
        recent = cur.fetchall()

        # 포지션 요약
        pos_lines = []
        for coin, batches in positions.items():
            total_qty = sum(b["quantity"] for b in batches.values())
            total_amt = sum(b["amount"] for b in batches.values())
            avg_price = total_amt / total_qty if total_qty > 0 else 0
            pos_lines.append(f"  {coin}: {len(batches)}배치, 평균 {avg_price:,.0f}원, 총 {total_amt:,.0f}원")

        pos_text = "\n".join(pos_lines) if pos_lines else "  없음"

        # 최근 거래 요약
        trade_lines = []
        for coin, action, price, amount, profit, profit_rate, ts in recent:
            icon = "🔴매수" if action == "buy" else "🔵매도"
            profit_str = f" | 손익 {profit:+,.0f}원 ({profit_rate:+.2f}%)" if action == "sell" else ""
            trade_lines.append(f"  {icon} {coin} {price:,.0f}원 {amount:,.0f}원{profit_str}  [{ts[11:16]}]")

        result = f"""📊 업비트 봇 현황 ({updated_at[5:16]})
━━━━━━━━━━━━━━━━━━━━
💰 가용 잔고: {balance:,.0f}원
📦 보유 종목:
{pos_text}

📅 오늘 손익: {today_profit:+,.0f}원 (매도 {today_trades}건)

🕐 최근 거래:
{"".join(f"{t}{chr(10)}" for t in trade_lines)}"""

        return result.strip()

    finally:
        conn.close()


# ── 2. 팀 Git 로그 ───────────────────────────────────

@mcp.tool()
def git_log(team_id: str, n: int = 7) -> str:
    """팀의 최근 Git 커밋 내역 조회

    Args:
        team_id: 팀 ID (trading-bot, date-map, claude-biseo, ai900, cl600g, company-hq)
        n: 조회할 커밋 수 (기본 7)
    """
    path = TEAM_PATHS.get(team_id)
    if not path or not path.exists():
        return f"❌ '{team_id}' 경로 없음: {path}"

    try:
        result = subprocess.run(
            ["git", "log", f"-{n}", "--pretty=format:%h %ad %s", "--date=short"],
            cwd=path, capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            return f"❌ git log 실패: {result.stderr.strip()}"
        if not result.stdout.strip():
            return f"ℹ️ '{team_id}' 커밋 없음"

        lines = result.stdout.strip().split("\n")
        formatted = "\n".join(f"  {l}" for l in lines)
        return f"📝 {team_id} 최근 커밋:\n{formatted}"

    except subprocess.TimeoutExpired:
        return f"❌ git log 타임아웃"


# ── 3. 프로세스 실행 여부 확인 ────────────────────────

@mcp.tool()
def process_check(team_id: str) -> str:
    """팀 봇/서버 프로세스 실행 중인지 확인

    Args:
        team_id: 팀 ID (trading-bot, claude-biseo, company-hq)
    """
    checks = {
        "trading-bot": {
            "pid_file": UPBIT_ROOT / "bot.pid",
            "keywords": ["upbit_bot_v3", "trading_bot"],
        },
        "claude-biseo": {
            "pid_file": PROJECTS_ROOT / "claude-biseo-v1.0" / "bot.pid",
            "keywords": ["mybot_autoexecutor", "telegram_bot"],
        },
        "company-hq": {
            "pid_file": None,
            "keywords": ["uvicorn", "company-hq"],
        },
    }

    cfg = checks.get(team_id)
    if not cfg:
        return f"ℹ️ '{team_id}'는 프로세스 감시 대상이 아님"

    lines = []

    # PID 파일 체크
    pid_file = cfg.get("pid_file")
    if pid_file and pid_file.exists():
        pid = pid_file.read_text().strip()
        try:
            subprocess.run(["kill", "-0", pid], check=True, capture_output=True)
            lines.append(f"  ✅ PID {pid} 실행 중")
        except subprocess.CalledProcessError:
            lines.append(f"  ⚠️ PID {pid} (파일 있지만 프로세스 없음)")
    elif pid_file:
        lines.append(f"  ❌ PID 파일 없음")

    # 키워드로 프로세스 검색
    for kw in cfg["keywords"]:
        r = subprocess.run(["pgrep", "-f", kw], capture_output=True, text=True)
        if r.stdout.strip():
            pids = r.stdout.strip().replace("\n", ", ")
            lines.append(f"  ✅ '{kw}' 프로세스 발견 (PID: {pids})")
        else:
            lines.append(f"  ❌ '{kw}' 프로세스 없음")

    status = "\n".join(lines)
    return f"🔍 {team_id} 프로세스 상태:\n{status}"


# ── 4. 로그 조회 ─────────────────────────────────────

@mcp.tool()
def read_logs(team_id: str, lines: int = 50) -> str:
    """팀 로그 파일 최근 N줄 조회

    Args:
        team_id: 팀 ID
        lines: 조회할 줄 수 (기본 50)
    """
    log_path = TEAM_LOG_FILES.get(team_id)

    # 로그 경로 없으면 bot_output.log 시도
    if not log_path:
        fallback = TEAM_PATHS.get(team_id)
        if fallback:
            for candidate in ["bot_output.log", "app.log", "server.log"]:
                p = fallback / candidate
                if p.exists():
                    log_path = p
                    break

    if not log_path or not log_path.exists():
        return f"❌ '{team_id}' 로그 파일 없음"

    try:
        result = subprocess.run(
            ["tail", f"-{lines}", str(log_path)],
            capture_output=True, text=True, timeout=5
        )
        content = result.stdout.strip()
        if not content:
            return f"ℹ️ '{team_id}' 로그 비어 있음"

        size = log_path.stat().st_size
        mtime = datetime.fromtimestamp(log_path.stat().st_mtime).strftime("%m/%d %H:%M")
        return f"📋 {team_id} 로그 (최근 {lines}줄 | {size/1024:.1f}KB | {mtime}):\n\n{content}"

    except subprocess.TimeoutExpired:
        return "❌ 로그 읽기 타임아웃"


# ── 5. 전체 팀 요약 ──────────────────────────────────

@mcp.tool()
def team_summary() -> str:
    """전체 팀 현황을 한번에 요약 — 프로세스 상태 + 커밋 + 봇 상태"""
    lines = [f"🏢 두근 컴퍼니 현황 ({datetime.now().strftime('%m/%d %H:%M')})", "━" * 40]

    # ── 서비스 프로세스 상태 ──
    lines.append("\n⚡ 서비스 상태")
    for svc_id, cfg in SERVICE_REGISTRY.items():
        alive = _is_service_alive(svc_id)
        icon = "✅" if alive else "❌"
        lines.append(f"  {icon} {cfg['display']} ({svc_id})")

    # ── 팀별 최근 커밋 ──
    lines.append("\n📁 팀 커밋")
    for team_id, path in TEAM_PATHS.items():
        if not path.exists():
            lines.append(f"  ❓ {team_id}: 경로 없음")
            continue

        r = subprocess.run(
            ["git", "log", "-1", "--pretty=format:%ad %s", "--date=short"],
            cwd=path, capture_output=True, text=True, timeout=5
        )
        commit = r.stdout.strip() if r.returncode == 0 else "커밋 없음"
        lines.append(f"  {team_id}: {commit}")

    # ── 업비트 봇 간략 상태 ──
    if UPBIT_DB.exists():
        conn = sqlite3.connect(UPBIT_DB)
        try:
            cur = conn.cursor()
            cur.execute("SELECT balance, updated_at FROM active_positions ORDER BY id DESC LIMIT 1")
            row = cur.fetchone()
            if row:
                balance, updated_at = row
                today = date.today().isoformat()
                cur.execute("SELECT COALESCE(SUM(profit),0) FROM trades WHERE action='sell' AND timestamp LIKE ?", (f"{today}%",))
                profit = cur.fetchone()[0]
                lines.append(f"\n  💰 매매봇: 잔고 {balance:,.0f}원 | 오늘 {profit:+,.0f}원")
        finally:
            conn.close()

    return "\n".join(lines)


# ── 6. 서비스 복구 ──────────────────────────────────────

@mcp.tool()
def recover_service(service_id: str = "all") -> str:
    """죽은 서비스를 감지하고 자동으로 재시작한다

    Args:
        service_id: 복구할 서비스 ID (company-hq, trading-bot, claude-biseo) 또는 'all'로 전체 복구
    """
    targets = SERVICE_REGISTRY if service_id == "all" else {service_id: SERVICE_REGISTRY.get(service_id)}

    if not any(targets.values()):
        return f"❌ '{service_id}'는 등록된 서비스가 아님. 가능: {', '.join(SERVICE_REGISTRY.keys())}, all"

    lines = ["🔧 서비스 복구 시작\n"]
    recovered = 0
    failed = 0

    for svc_id, cfg in targets.items():
        if not cfg:
            continue

        alive = _is_service_alive(svc_id)
        if alive:
            lines.append(f"  ✅ {cfg['display']} — 이미 정상")
            continue

        if not cfg.get("restart"):
            lines.append(f"  ⚠️ {cfg['display']} — 죽어 있음, 자동 재시작 미지원")
            failed += 1
            continue

        lines.append(f"  🔄 {cfg['display']} — 재시작 시도...")

        if cfg.get("pre_restart"):
            subprocess.run(cfg["pre_restart"], shell=True, capture_output=True, timeout=5)
            time.sleep(1)

        subprocess.run(cfg["restart"], shell=True, capture_output=True, timeout=10)
        time.sleep(3)

        if _is_service_alive(svc_id):
            lines.append(f"  ✅ {cfg['display']} — 복구 완료!")
            recovered += 1
        else:
            time.sleep(3)
            if _is_service_alive(svc_id):
                lines.append(f"  ✅ {cfg['display']} — 복구 완료! (지연 시작)")
                recovered += 1
            else:
                lines.append(f"  ❌ {cfg['display']} — 복구 실패, 수동 확인 필요")
                failed += 1

    lines.append(f"\n📊 결과: 복구 {recovered}건 / 실패 {failed}건")
    return "\n".join(lines)


# ── 7. 119/112 감시 시스템 관리 ────────────────────────────

GUARD_SCRIPTS = {
    "119": {
        "name": "🚒 119 (프로세스 폭주 감시)",
        "script": Path.home() / "claude_guard.sh",
        "log": Path.home() / "claude_guard.log",
        "plist": "com.claude-guard",
    },
    "112": {
        "name": "🚔 112 (서비스 상태 감시)",
        "script": Path.home() / "claude_112.sh",
        "log": Path.home() / "claude_112.log",
        "plist": "com.claude-112",
    },
}


@mcp.tool()
def emergency_status() -> str:
    """119/112 감시 시스템 상태 + 최근 로그 + Claude 프로세스 현황 확인

    토큰 소모 모니터링, 프로세스 폭주 여부, 서비스 상태를 한번에 파악한다.
    """
    lines = [f"🏥 긴급 시스템 현황 ({datetime.now().strftime('%m/%d %H:%M')})", "━" * 40]

    # 119/112 launchd 상태
    for code, cfg in GUARD_SCRIPTS.items():
        r = subprocess.run(["launchctl", "list", cfg["plist"]], capture_output=True, text=True)
        active = "✅ 가동중" if r.returncode == 0 else "❌ 중지됨"
        lines.append(f"  {cfg['name']}: {active}")

        # 최근 로그 5줄
        log_path = cfg["log"]
        if log_path.exists():
            log_lines = log_path.read_text().strip().split("\n")
            recent = log_lines[-5:] if len(log_lines) >= 5 else log_lines
            for ll in recent:
                lines.append(f"    {ll}")
        lines.append("")

    # Claude 프로세스 현황
    r = subprocess.run(
        ["bash", "-c", "ps -eo pid,tty,%cpu,rss,command | grep -E 'claude ' | grep -v grep | grep -v 'Claude.app' | grep -v 'Claude Helper' | grep -v crashpad"],
        capture_output=True, text=True
    )
    procs = [l.strip() for l in r.stdout.strip().split("\n") if l.strip()]
    lines.append(f"⚡ Claude 프로세스: {len(procs)}개")
    for p in procs:
        parts = p.split()
        if len(parts) >= 4:
            lines.append(f"  PID:{parts[0]} TTY:{parts[1]} CPU:{parts[2]}% MEM:{int(int(parts[3])/1024)}MB")

    return "\n".join(lines)


@mcp.tool()
def read_guard_log(code: str = "119", lines: int = 20) -> str:
    """119 또는 112 로그를 읽는다

    Args:
        code: '119' (프로세스 감시) 또는 '112' (서비스 감시)
        lines: 읽을 줄 수 (기본 20)
    """
    cfg = GUARD_SCRIPTS.get(code)
    if not cfg:
        return f"❌ '{code}'는 없음. 119 또는 112만 가능"

    log_path = cfg["log"]
    if not log_path.exists():
        return f"⚠️ {cfg['name']} 로그 없음: {log_path}"

    all_lines = log_path.read_text().strip().split("\n")
    recent = all_lines[-lines:]
    return f"📋 {cfg['name']} 최근 {len(recent)}줄\n\n" + "\n".join(recent)


@mcp.tool()
def update_guard_config(code: str, key: str, value: str) -> str:
    """119/112 설정값을 수정한다 (임계값, 쿨다운 등)

    Args:
        code: '119' 또는 '112'
        key: 변경할 설정 키 (MAX_CLAUDE_PROCS, MAX_CPU_TOTAL, CPU_SUSTAINED_RUNS, MAX_MEM_TOTAL_MB, ALERT_COOLDOWN 등)
        value: 새 값
    """
    cfg = GUARD_SCRIPTS.get(code)
    if not cfg:
        return f"❌ '{code}'는 없음. 119 또는 112만 가능"

    script_path = cfg["script"]
    if not script_path.exists():
        return f"❌ 스크립트 없음: {script_path}"

    content = script_path.read_text()
    import re
    pattern = rf'^({re.escape(key)}=)\S+(.*)$'
    match = re.search(pattern, content, re.MULTILINE)
    if not match:
        return f"❌ '{key}' 설정을 찾을 수 없음"

    old_line = match.group(0)
    new_line = f"{key}={value}{match.group(2)}"
    content = content.replace(old_line, new_line)
    script_path.write_text(content)

    return f"✅ {cfg['name']} 설정 변경: {old_line.strip()} → {new_line.strip()}"


@mcp.tool()
def emergency_action(action: str) -> str:
    """🚒 119/112 긴급 조치를 직접 실행한다

    Args:
        action: 실행할 조치
            - 'kill_orphans': 유령 Claude 프로세스 자동 종료
            - 'kill_all': 모든 Claude CLI 프로세스 종료 (현재 대화 포함 주의)
            - 'restart_server': company-hq 서버 재시작
            - 'restart_tunnel': Cloudflare Tunnel 재시작
            - 'restart_bot': 업비트 매매봇 재시작
            - 'run_119': 119 수동 실행
            - 'run_112': 112 수동 실행
            - 'status': 전체 현황만 확인
    """
    lines = [f"🚨 긴급 조치: {action} ({datetime.now().strftime('%H:%M:%S')})"]

    if action == "status":
        return emergency_status()

    elif action == "kill_orphans":
        r = subprocess.run(
            ["bash", "-c", "ps -eo pid,tty,command | grep -E 'claude |npm exec.*claude-code' | grep -v grep | grep -v 'Claude.app' | grep -v antigravity | awk '$2 == \"??\" {print $1}'"],
            capture_output=True, text=True
        )
        pids = [p.strip() for p in r.stdout.strip().split("\n") if p.strip()]
        killed = 0
        for pid in pids:
            subprocess.run(["kill", pid], capture_output=True)
            killed += 1
        lines.append(f"🧹 유령 프로세스 {killed}개 종료")

    elif action == "kill_all":
        r = subprocess.run(
            ["bash", "-c", "ps -eo pid,command | grep -E 'claude ' | grep -v grep | grep -v 'Claude.app' | grep -v 'Claude Helper' | grep -v crashpad | awk '{print $1}'"],
            capture_output=True, text=True
        )
        pids = [p.strip() for p in r.stdout.strip().split("\n") if p.strip()]
        for pid in pids:
            subprocess.run(["kill", pid], capture_output=True)
        lines.append(f"⚠️ Claude 프로세스 {len(pids)}개 전체 종료")

    elif action == "restart_server":
        subprocess.run("lsof -ti:8000 | xargs kill -9 2>/dev/null", shell=True, capture_output=True, timeout=5)
        time.sleep(2)
        subprocess.run(
            f"cd {SERVER_DIR} && {SERVER_DIR}/venv/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &",
            shell=True, capture_output=True, timeout=5
        )
        time.sleep(3)
        alive = _is_service_alive("company-hq")
        lines.append(f"{'✅ 서버 복구 완료' if alive else '❌ 서버 복구 실패'}")

    elif action == "restart_tunnel":
        subprocess.run("pkill -f cloudflared 2>/dev/null", shell=True, capture_output=True)
        time.sleep(2)
        subprocess.run("cloudflared tunnel run &", shell=True, capture_output=True)
        lines.append("🔄 Tunnel 재시작 시도")

    elif action == "restart_bot":
        cfg = SERVICE_REGISTRY.get("trading-bot")
        if cfg and cfg.get("restart"):
            subprocess.run(cfg["restart"], shell=True, capture_output=True, timeout=10)
            time.sleep(3)
            alive = _is_service_alive("trading-bot")
            lines.append(f"{'✅ 매매봇 복구 완료' if alive else '❌ 매매봇 복구 실패'}")
        else:
            lines.append("❌ 매매봇 재시작 설정 없음")

    elif action == "run_119":
        r = subprocess.run(["bash", str(Path.home() / "claude_guard.sh")], capture_output=True, text=True, timeout=30)
        lines.append(f"119 실행 완료 (exit: {r.returncode})")
        if r.stdout.strip():
            lines.append(r.stdout.strip()[-200:])

    elif action == "run_112":
        r = subprocess.run(["bash", str(Path.home() / "claude_112.sh")], capture_output=True, text=True, timeout=30)
        lines.append(f"112 실행 완료 (exit: {r.returncode})")
        if r.stdout.strip():
            lines.append(r.stdout.strip()[-200:])

    else:
        return f"❌ 알 수 없는 조치: {action}\n가능: kill_orphans, kill_all, restart_server, restart_tunnel, restart_bot, run_119, run_112, status"

    return "\n".join(lines)


if __name__ == "__main__":
    mcp.run()
