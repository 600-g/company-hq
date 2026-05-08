"""
대시보드 + 토큰 사용량 + 서비스 헬스 — main.py 분할 14차 (안정화 2026-05-08).

이동:
- 서비스 헬스체크: _svc_cache, _check_services_sync, _check_services
- 토큰 사용량: MODEL_CONTEXT_WINDOW, _get_context_window, _get_context_pct_from_folder
- _parse_token_usage_today
- GET /api/dashboard
- GET /api/token-usage

Lazy import:
- main.TEAMS / RECENT_ACTIVITY (ws_handler) / AGENT_STATUS (ws_handler)
- claude_runner.{TEAM_SESSIONS, TEAM_MODELS, AGENT_PIDS, AGENT_TOKENS, MODEL_IDS, get_claude_version}
- system_monitor.{get_all, get_process_stats}
"""
from __future__ import annotations

import asyncio
import glob as _glob
import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(tags=["dashboard"])

# ── 서비스 헬스체크 ──────────────────────────────────────────────
_svc_cache: dict = {"data": []}


def _check_services_sync():
    """별도 스레드에서 실행 — 메인 루프 블로킹 없음"""
    import urllib.request
    import urllib.error
    import socket

    checks = [
        ("Cloudflare Pages", "https://600g.net", "프론트엔드"),
        ("Upbit API", "https://api.upbit.com/v1/market/all", "매매봇 데이터"),
    ]
    results = []
    for name, url, desc in checks:
        try:
            req = urllib.request.Request(url, method="GET")
            req.add_header("User-Agent", "health-check/1.0")
            resp = urllib.request.urlopen(req, timeout=3)
            results.append({"name": name, "desc": desc, "status": "ok", "code": resp.getcode(), "error": None})
        except urllib.error.HTTPError as e:
            results.append({"name": name, "desc": desc, "status": "warn", "code": e.code, "error": str(e.reason)})
        except Exception as e:
            results.append({"name": name, "desc": desc, "status": "down", "code": None, "error": str(e)[:40]})

    for name, port, desc in [("FastAPI", 8000, "백엔드")]:
        try:
            s = socket.create_connection(("127.0.0.1", port), timeout=1)
            s.close()
            results.append({"name": name, "desc": desc, "status": "ok", "code": None, "error": None})
        except Exception:
            results.append({"name": name, "desc": desc, "status": "down", "code": None, "error": "연결 불가"})

    _svc_cache["data"] = results


async def _check_services() -> list:
    """논블로킹: 별도 스레드에서 헬스체크 실행"""
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _check_services_sync)  # fire-and-forget
    return _svc_cache["data"]


# ── 토큰 컨텍스트 ────────────────────────────────────────────────
MODEL_CONTEXT_WINDOW = {
    "claude-opus-4-6": 200_000,
    "claude-opus-4-5": 200_000,
    "claude-sonnet-4-6": 200_000,
    "claude-sonnet-4-5": 200_000,
    "claude-haiku-4-5": 200_000,
    "default": 200_000,
}


def _get_context_window(model: str) -> int:
    for key, size in MODEL_CONTEXT_WINDOW.items():
        if key in model:
            return size
    return MODEL_CONTEXT_WINDOW["default"]


def _get_context_pct_from_folder(folder_path: str) -> float:
    """해당 프로젝트 폴더의 가장 최근 JSONL에서 마지막 assistant 메시지의 컨텍스트 사용률(%) 반환"""
    jsonl_files = sorted(
        _glob.glob(f"{folder_path}/*.jsonl"),
        key=os.path.getmtime,
        reverse=True
    )
    for jsonl_path in jsonl_files[:3]:
        try:
            last_usage = None
            last_model = "default"
            with open(jsonl_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    if obj.get("type") != "assistant":
                        continue
                    msg = obj.get("message") or {}
                    usage = msg.get("usage") or {}
                    if usage:
                        last_usage = usage
                        last_model = msg.get("model", "default")
            if last_usage:
                ctx_size = _get_context_window(last_model)
                used = (
                    last_usage.get("input_tokens", 0)
                    + last_usage.get("cache_read_input_tokens", 0)
                    + last_usage.get("cache_creation_input_tokens", 0)
                )
                return round(min(used / ctx_size * 100, 100), 1)
        except Exception:
            continue
    return 0.0


def _parse_token_usage_today() -> dict:
    """~/.claude/projects/ 아래 JSONL 파일에서 최근 5시간 슬라이딩 윈도우 기준 토큰 사용량 파싱"""
    projects_root = os.path.expanduser("~/.claude/projects")
    now_utc = datetime.now(timezone.utc)
    window_start = now_utc - timedelta(hours=5)
    today = now_utc.strftime("%Y-%m-%d")

    PROJECT_LABEL_MAP: dict[str, tuple[str, str]] = {
        "-Users-600mac-Developer-my-company-company-hq": ("company-hq", "🖥"),
        "-Users-600mac-Developer-my-company-upbit-auto-trading-bot": ("매매봇", "🤖"),
        "-Users-600mac-Developer-my-company-date-map": ("데이트지도", "🗺️"),
        "-Users-600mac-Developer-my-company-claude-biseo-v1-0": ("클로드비서", "🤵"),
        "-Users-600mac-Developer-my-company-ai900": ("AI900", "📚"),
        "-Users-600mac-Developer-my-company-design-team": ("디자인팀", "🎨"),
        "-Users-600mac-Developer-my-company-content-lab": ("콘텐츠랩", "🔬"),
    }

    totals: dict[str, dict] = {}

    for jsonl_path in _glob.glob(f"{projects_root}/**/*.jsonl", recursive=True):
        rel = os.path.relpath(jsonl_path, projects_root)
        folder = rel.split(os.sep)[0]

        if folder in PROJECT_LABEL_MAP:
            label, emoji = PROJECT_LABEL_MAP[folder]
        elif "company-hq--claude-worktrees" in folder or "company-hq-server" in folder:
            label, emoji = "company-hq", "🖥"
        else:
            label = folder.split("-")[-1] if "-" in folder else folder
            emoji = "💻"

        if label not in totals:
            totals[label] = {"input": 0, "output": 0, "cache_read": 0, "cache_create": 0, "emoji": emoji, "folders": set()}
        totals[label]["folders"].add(os.path.join(projects_root, folder))

        try:
            with open(jsonl_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    ts_str = obj.get("timestamp", "")
                    if not ts_str:
                        continue
                    try:
                        ts_dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                        if ts_dt < window_start:
                            continue
                    except Exception:
                        continue
                    if obj.get("type") != "assistant":
                        continue
                    usage = (obj.get("message") or {}).get("usage") or {}
                    if not usage:
                        continue
                    totals[label]["input"] += usage.get("input_tokens", 0)
                    totals[label]["output"] += usage.get("output_tokens", 0)
                    totals[label]["cache_read"] += usage.get("cache_read_input_tokens", 0)
                    totals[label]["cache_create"] += (
                        usage.get("cache_creation_input_tokens", 0)
                        + (usage.get("cache_creation") or {}).get("ephemeral_1h_input_tokens", 0)
                        + (usage.get("cache_creation") or {}).get("ephemeral_5m_input_tokens", 0)
                    )
        except Exception:
            continue

    context_pcts: dict[str, float] = {}
    for label, vals in totals.items():
        best_pct = 0.0
        for folder_path in vals.get("folders", set()):
            pct = _get_context_pct_from_folder(folder_path)
            if pct > best_pct:
                best_pct = pct
        context_pcts[label] = best_pct

    grand = {"input": 0, "output": 0, "cache_read": 0, "cache_create": 0}
    projects = []
    for label, vals in sorted(totals.items(), key=lambda x: -(x[1]["input"] + x[1]["output"])):
        total_tokens = vals["input"] + vals["output"]
        if total_tokens == 0:
            continue
        projects.append({
            "label": label,
            "emoji": vals["emoji"],
            "input": vals["input"],
            "output": vals["output"],
            "cache_read": vals["cache_read"],
            "cache_create": vals["cache_create"],
            "total": total_tokens,
            "context_pct": context_pcts.get(label, 0.0),
        })
        for k in ("input", "output", "cache_read", "cache_create"):
            grand[k] += vals[k]

    grand["total"] = grand["input"] + grand["output"]

    daily_total = {"input": 0, "output": 0, "cache_read": 0, "cache_create": 0}
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)

    for jsonl_path in _glob.glob(f"{projects_root}/**/*.jsonl", recursive=True):
        try:
            with open(jsonl_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    if obj.get("type") != "assistant":
                        continue
                    ts_str = obj.get("timestamp", "")
                    if not ts_str:
                        continue
                    try:
                        ts_dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                        if ts_dt < today_start:
                            continue
                    except Exception:
                        continue
                    usage = (obj.get("message") or {}).get("usage") or {}
                    if not usage:
                        continue
                    daily_total["input"] += usage.get("input_tokens", 0)
                    daily_total["output"] += usage.get("output_tokens", 0)
                    daily_total["cache_read"] += usage.get("cache_read_input_tokens", 0)
                    daily_total["cache_create"] += (
                        usage.get("cache_creation_input_tokens", 0)
                        + (usage.get("cache_creation") or {}).get("ephemeral_1h_input_tokens", 0)
                        + (usage.get("cache_creation") or {}).get("ephemeral_5m_input_tokens", 0)
                    )
        except Exception:
            continue

    daily_total["total"] = daily_total["input"] + daily_total["output"] + daily_total["cache_create"]

    daily_limit = int(os.getenv("DAILY_TOKEN_LIMIT", "50000000"))
    usage_pct = round(daily_total["total"] / daily_limit * 100, 1) if daily_limit > 0 else 0.0

    window_limit = int(os.getenv("WINDOW_TOKEN_LIMIT", "800000"))
    window_pct = round(grand["total"] / window_limit * 100, 1) if window_limit > 0 else 0.0
    window_label = window_start.strftime("%H:%M") + " ~ " + now_utc.strftime("%H:%M") + " UTC"

    return {
        "today": today,
        "window_label": window_label,
        "projects": projects,
        "grand": grand,
        "daily_total": daily_total,
        "daily_limit": daily_limit,
        "usage_pct": usage_pct,
        "window_pct": window_pct,
    }


# ── 엔드포인트 ──────────────────────────────────────────────────
@router.get("/api/dashboard")
async def get_dashboard():
    """대시보드 전체 상태 반환"""
    import main as _main
    from ws_handler import AGENT_STATUS, RECENT_ACTIVITY
    from claude_runner import (
        TEAM_SESSIONS, TEAM_MODELS, AGENT_PIDS, AGENT_TOKENS, MODEL_IDS,
        get_claude_version,
    )
    from system_monitor import get_all as get_system, get_process_stats

    agents = []
    for team in _main.TEAMS:
        tid = team["id"]
        status = AGENT_STATUS.get(tid, {})
        session = TEAM_SESSIONS.get(tid)
        model_key = TEAM_MODELS.get(tid, "sonnet")
        model_id = MODEL_IDS.get(model_key, model_key)

        pid = AGENT_PIDS.get(tid)
        proc_stats = get_process_stats(pid) if pid else None

        agents.append({
            "id": tid,
            "name": team["name"],
            "emoji": team["emoji"],
            "model_key": model_key,
            "model_id": model_id,
            "working": status.get("working", False),
            "tool": status.get("tool"),
            "last_active": status.get("last_active"),
            "last_prompt": status.get("last_prompt", ""),
            "session": session[:8] if session else None,
            "pid": pid,
            "tokens": AGENT_TOKENS.get(tid, {"prompts": 0, "chars": 0}),
            "cpu": proc_stats["cpu"] if proc_stats else None,
            "memory_mb": proc_stats["memory_mb"] if proc_stats else None,
        })

    return {
        "agents": agents,
        "system": get_system(),
        "services": await _check_services(),
        "activity": list(reversed(RECENT_ACTIVITY)),
        "version": {
            "server": "1.0.0",
            "python": sys.version.split()[0],
            "claude_cli": get_claude_version(),
        },
    }


@router.get("/api/token-usage")
async def get_token_usage():
    """오늘 날짜 Claude 토큰 사용량 반환"""
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _parse_token_usage_today)
    return result
