"""두근 컴퍼니 MCP 서버 — CPO 클로드 전용 도구 모음"""

import json
import os
import sqlite3
import subprocess
from datetime import datetime, date
from pathlib import Path

from fastmcp import FastMCP

mcp = FastMCP("두근컴퍼니-HQ")

PROJECTS_ROOT = Path.home() / "Developer" / "my-company"
UPBIT_ROOT = Path.home() / "Desktop" / "업비트자동"
UPBIT_DB = UPBIT_ROOT / "trading_bot_v3.db"

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
    """전체 팀 현황을 한번에 요약 — 커밋/프로세스/봇 상태"""
    lines = [f"🏢 두근 컴퍼니 현황 ({datetime.now().strftime('%m/%d %H:%M')})", "━" * 40]

    for team_id, path in TEAM_PATHS.items():
        if not path.exists():
            lines.append(f"  ❓ {team_id}: 경로 없음")
            continue

        # 최근 커밋
        r = subprocess.run(
            ["git", "log", "-1", "--pretty=format:%ad %s", "--date=short"],
            cwd=path, capture_output=True, text=True, timeout=5
        )
        commit = r.stdout.strip() if r.returncode == 0 else "커밋 없음"

        lines.append(f"\n  📁 {team_id}")
        lines.append(f"     최근: {commit}")

    # 업비트 봇 간략 상태
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
                lines.append(f"\n  🤖 매매봇: 잔고 {balance:,.0f}원 | 오늘 {profit:+,.0f}원")
        finally:
            conn.close()

    return "\n".join(lines)


if __name__ == "__main__":
    mcp.run()
