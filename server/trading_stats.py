"""매매봇 트레이딩 통계 조회 — status.json(primary) + SQLite DB(backup/deep query)"""

import json
import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger("company-hq")

# ── 경로 설정 (코인봇 v10.1, 2026-04-25 ~ 마이그레이션) ────
# 구버전 ~/Desktop/업비트자동/ 은 retired (2026-04). 신버전 ~/coinbot/ 사용.
STATUS_JSON_PATH = Path.home() / "coinbot" / "docs" / "status.json"
TRADING_DB_PATH = Path.home() / "coinbot" / "data" / "bot.db"
# 주식봇 데이터 (KR/US)
STOCK_STATUS_JSON_PATH = Path.home() / "Desktop" / "주식 자동봇" / "docs" / "status.json"
STOCK_DB_PATH = Path.home() / "Desktop" / "주식 자동봇" / "data" / "demo.db"

# ── 매매 관련 키워드 ───────────────────────────────────
TRADING_KEYWORDS: list[str] = [
    "승률", "매매봇", "거래", "손익", "포지션",
    "수익", "매매", "트레이딩", "봇 상태", "봇상태",
    "매수", "매도", "모멘텀", "코인", "PnL", "pnl",
    "잔고", "자산", "오늘 실적", "오늘실적",
    "trading", "trade", "win rate",
]


def has_trading_keywords(text: str) -> bool:
    """텍스트에 매매 관련 키워드가 포함되어 있는지 확인"""
    lower = text.lower()
    return any(kw.lower() in lower for kw in TRADING_KEYWORDS)


def _read_status_json() -> dict[str, Any] | None:
    """status.json 파일 읽기 (primary source)"""
    try:
        if STATUS_JSON_PATH.exists():
            data = json.loads(STATUS_JSON_PATH.read_text(encoding="utf-8"))
            return data
    except Exception as e:
        logger.warning("status.json 읽기 실패: %s", e)
    return None


def _query_db_recent_trades(limit: int = 10) -> list[dict]:
    """SQLite DB에서 최근 거래 조회 (backup)"""
    try:
        if not TRADING_DB_PATH.exists():
            return []
        conn = sqlite3.connect(str(TRADING_DB_PATH), timeout=5)
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            "SELECT * FROM trades ORDER BY rowid DESC LIMIT ?", (limit,)
        )
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return rows
    except Exception as e:
        logger.warning("trading DB 조회 실패: %s", e)
        return []


def _query_db_positions() -> list[dict]:
    """SQLite DB에서 현재 보유 포지션 조회 (backup) — 코인봇 v10.1 positions 테이블"""
    try:
        if not TRADING_DB_PATH.exists():
            return []
        conn = sqlite3.connect(str(TRADING_DB_PATH), timeout=5)
        conn.row_factory = sqlite3.Row
        # v10.1: active_positions → positions (테이블명 변경)
        cursor = conn.execute("SELECT * FROM positions")
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return rows
    except Exception as e:
        logger.warning("positions 조회 실패: %s", e)
        return []


def get_trading_stats() -> dict[str, Any]:
    """매매봇 통계 반환 — status.json 우선, 없으면 DB 직접 조회

    Returns:
        {
            "ok": True/False,
            "source": "status.json" | "db" | "unavailable",
            "win_rate": float,
            "today_pnl": float,
            "total_pnl": float,
            "total_trades": int,
            "wins": int,
            "losses": int,
            "today_trades": int,
            "today_wr": float,
            "balance": float,
            "positions": [...],
            "recent_trades": [...],
            "momentum_top10": [...],
            "market": {...},
            "bot_running": bool,
            "bot_mode": str,
            "updated": str,
        }
    """
    status = _read_status_json()
    if status:
        return {
            "ok": True,
            "source": "status.json",
            "win_rate": status.get("win_rate", 0),
            "today_pnl": status.get("today_pnl", 0),
            "total_pnl": status.get("total_pnl", 0),
            "total_trades": status.get("total_trades", 0),
            "wins": status.get("wins", 0),
            "losses": status.get("losses", 0),
            "draws": status.get("draws", 0),
            "today_trades": status.get("today_trades", 0),
            "today_wr": status.get("today_wr", 0),
            "balance": status.get("balance", 0),
            "krw_balance": status.get("krw_balance", 0),
            "pos_value": status.get("pos_value", 0),
            "positions": status.get("positions", []),
            "recent_trades": status.get("recent", [])[:10],
            "momentum_top10": status.get("momentum", {}).get("top10", []),
            "market": status.get("market", {}),
            "bot_running": status.get("bot_running", False),
            "bot_mode": status.get("bot_mode", "unknown"),
            "daily": status.get("daily", []),
            "updated": status.get("updated", ""),
        }

    # fallback: DB 직접 조회
    positions = _query_db_positions()
    recent = _query_db_recent_trades(10)
    if positions or recent:
        return {
            "ok": True,
            "source": "db",
            "win_rate": 0,
            "today_pnl": 0,
            "total_pnl": 0,
            "total_trades": len(recent),
            "wins": 0,
            "losses": 0,
            "draws": 0,
            "today_trades": 0,
            "today_wr": 0,
            "balance": 0,
            "krw_balance": 0,
            "pos_value": 0,
            "positions": positions,
            "recent_trades": recent,
            "momentum_top10": [],
            "market": {},
            "bot_running": False,
            "bot_mode": "unknown",
            "daily": [],
            "updated": "",
        }

    return {"ok": False, "source": "unavailable", "error": "status.json과 DB 모두 접근 불가"}


def format_trading_context() -> str:
    """CPO 채팅에 주입할 매매봇 컨텍스트 문자열 생성"""
    stats = get_trading_stats()
    if not stats.get("ok"):
        return ""

    # 포지션 요약
    pos_lines = []
    for p in stats.get("positions", [])[:5]:
        coin = p.get("coin", "?")
        rate = p.get("profit_rate", 0)
        batch = p.get("batch", "")
        amount = p.get("cur_amount", p.get("amount", 0))
        pos_lines.append(f"  - {coin} ({batch}): {rate:+.2f}% / {amount:,.0f}원")

    # 최근 거래 요약 (5건)
    trade_lines = []
    for t in stats.get("recent_trades", [])[:5]:
        coin = t.get("coin", "?")
        profit = t.get("profit", 0)
        rate = t.get("profit_rate", 0)
        time_str = t.get("time", "")
        icon = "+" if profit >= 0 else ""
        trade_lines.append(f"  - {time_str} {coin}: {icon}{profit:,.0f}원 ({rate:+.2f}%)")

    # 모멘텀 top 10
    momentum_lines = []
    for m in stats.get("momentum_top10", []):
        momentum_lines.append(f"  - {m.get('coin', '?')}: {m.get('score', 0):.1f}점")

    # 시장 상태
    market = stats.get("market", {})
    market_str = f"{market.get('grade', '?')} (BTC {market.get('btc_chg', 0):+.1f}%, ALT {market.get('alt_chg', 0):+.1f}%)"

    lines = [
        f"[매매봇 실시간 데이터 — {stats.get('updated', '?')} 기준]",
        f"모드: {stats.get('bot_mode', '?')} | 봇 실행: {'ON' if stats.get('bot_running') else 'OFF'}",
        f"총 자산: {stats.get('balance', 0):,.0f}원 (현금 {stats.get('krw_balance', 0):,.0f} + 보유 {stats.get('pos_value', 0):,.0f})",
        f"총 손익: {stats.get('total_pnl', 0):+,.0f}원 | 오늘 손익: {stats.get('today_pnl', 0):+,.0f}원",
        f"전체 승률: {stats.get('win_rate', 0)}% ({stats.get('wins', 0)}승 {stats.get('losses', 0)}패 {stats.get('draws', 0)}무) / 총 {stats.get('total_trades', 0)}건",
        f"오늘 거래: {stats.get('today_trades', 0)}건 (승률 {stats.get('today_wr', 0)}%)",
        f"시장: {market_str}",
    ]

    if pos_lines:
        lines.append(f"보유 포지션 ({len(stats.get('positions', []))}개):")
        lines.extend(pos_lines)

    if trade_lines:
        lines.append("최근 거래:")
        lines.extend(trade_lines)

    if momentum_lines:
        lines.append("모멘텀 TOP 10:")
        lines.extend(momentum_lines)

    return "\n".join(lines)
