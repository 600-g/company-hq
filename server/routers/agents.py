"""
에이전트 관리 엔드포인트 — main.py 분할 7차 (안정화 2026-05-08).

이동:
- POST /api/agents/{team_id}/model     — AI 모델 변경
- GET  /api/agents/{team_id}/info      — 세션/모델 정보
- GET  /api/agents/{team_id}/activity  — 최근 커밋/메시지/상태
- POST /api/agents/{team_id}/test      — 30초 스모크 테스트
- POST /api/agents/{team_id}/restart   — 세션 초기화 + 프로세스 종료

Lazy import 패턴: main.py 의 TEAMS state 와 ws_handler 의 _log_activity / AGENT_STATUS
는 함수 내부에서 import — 모듈 로드 시점 순환 import 회피.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import time
from pathlib import Path

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agents", tags=["agents"])

VALID_MODELS = {
    "haiku", "sonnet", "opus",
    "gemini_flash",
    "gemma_main", "gemma_e4b",
}


@router.post("/{team_id}/model")
async def set_agent_model(team_id: str, body: dict):
    """팀 AI 모델 변경. Claude: haiku|sonnet|opus / 무료: gemini_flash|gemma_main|gemma_e4b"""
    from claude_runner import TEAM_MODELS
    from ws_handler import _log_activity
    model = body.get("model", "")
    if model not in VALID_MODELS:
        return {"ok": False, "error": f"model 은 {sorted(VALID_MODELS)} 중 하나"}
    TEAM_MODELS[team_id] = model
    _log_activity(team_id, f"🔧 모델 변경: {model}")
    return {"ok": True, "team_id": team_id, "model": model}


@router.get("/{team_id}/info")
async def get_agent_info(team_id: str):
    """팀 세션/모델 정보."""
    from claude_runner import TEAM_MODELS, TEAM_SESSIONS
    return {
        "ok": True,
        "team_id": team_id,
        "model": TEAM_MODELS.get(team_id, "sonnet"),
        "session_id": TEAM_SESSIONS.get(team_id),
        "has_session": team_id in TEAM_SESSIONS,
    }


@router.get("/{team_id}/activity")
async def get_agent_activity(team_id: str):
    """에이전트 활동 로그 — 최근 커밋/메시지/상태 집계."""
    import main as _main
    from ws_handler import AGENT_STATUS
    team = next((t for t in _main.TEAMS if t["id"] == team_id), None)
    if not team:
        return {"ok": False, "error": "팀 없음"}
    local = Path(os.path.expanduser(team.get("localPath", ""))).resolve()

    commits: list[dict] = []
    if (local / ".git").exists():
        import subprocess
        try:
            out = subprocess.run(
                ["git", "log", "--oneline", "-10", "--format=%h|%s|%ar|%an"],
                capture_output=True, text=True, cwd=str(local), timeout=5
            )
            for line in out.stdout.strip().splitlines():
                parts = line.split("|", 3)
                if len(parts) == 4:
                    commits.append({
                        "hash": parts[0], "message": parts[1],
                        "ago": parts[2], "author": parts[3],
                    })
        except Exception:
            pass

    recent_messages: list[dict] = []
    try:
        history_dir = Path("chat_history") / team_id
        if history_dir.exists():
            session_files = sorted(
                history_dir.glob("*.json"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            for sf in session_files[:1]:
                try:
                    data = json.loads(sf.read_text(encoding="utf-8"))
                    msgs = data.get("messages", []) if isinstance(data, dict) else data
                    for m in reversed(msgs):
                        role = m.get("type") or m.get("role", "")
                        if role in ("ai", "assistant"):
                            content = str(m.get("content", ""))[:120].replace("\n", " ")
                            recent_messages.append({
                                "role": "assistant",
                                "preview": content,
                                "ts": m.get("ts") or m.get("timestamp"),
                            })
                            if len(recent_messages) >= 5:
                                break
                except Exception:
                    pass
    except Exception:
        pass

    status = AGENT_STATUS.get(team_id, {})

    return {
        "ok": True,
        "team_id": team_id,
        "commits": commits,
        "recent_messages": recent_messages,
        "status": status.get("state", "idle"),
        "current_tool": status.get("tool"),
        "last_active": status.get("last_active"),
    }


@router.post("/{team_id}/test")
async def test_agent(team_id: str):
    """에이전트 스모크 테스트 — CLI가 실제로 응답하는지 30초 안에 확인."""
    import main as _main
    from claude_runner import run_claude
    team = next((t for t in _main.TEAMS if t["id"] == team_id), None)
    if not team:
        return {"ok": False, "error": "팀을 찾을 수 없음"}
    local_path = os.path.expanduser(team.get("localPath", ""))
    if not os.path.isdir(local_path):
        return {"ok": False, "error": f"로컬 경로 없음: {local_path}"}

    prompt = "테스트입니다. 정확히 '작동함'이라는 두 글자로만 답해주세요."
    started = time.time()
    collected = ""
    try:
        async def _collect():
            nonlocal collected
            async for chunk in run_claude(prompt, team["localPath"], team_id, is_auto=True):
                if chunk.get("kind") == "text":
                    collected += chunk.get("content", "")
                    if len(collected) > 200:
                        break
        await asyncio.wait_for(_collect(), timeout=30)
    except asyncio.TimeoutError:
        return {"ok": False, "error": "30초 타임아웃", "duration_ms": int((time.time() - started) * 1000)}
    except Exception as e:
        return {"ok": False, "error": f"CLI 에러: {e}", "duration_ms": int((time.time() - started) * 1000)}

    duration_ms = int((time.time() - started) * 1000)
    resp = collected.strip()
    passed = bool(resp) and ("작동" in resp or "동작" in resp or "ok" in resp.lower())
    return {"ok": passed, "response": resp[:300], "duration_ms": duration_ms}


@router.post("/{team_id}/restart")
async def restart_agent(team_id: str):
    """에이전트 세션 초기화 (재부팅)"""
    from claude_runner import AGENT_PIDS, TEAM_SESSIONS, _save_sessions
    from ws_handler import AGENT_STATUS, _log_activity

    pid = AGENT_PIDS.get(team_id)
    if pid:
        try:
            os.kill(pid, signal.SIGTERM)
        except Exception:
            pass
        AGENT_PIDS.pop(team_id, None)

    if team_id in TEAM_SESSIONS:
        del TEAM_SESSIONS[team_id]
        _save_sessions(TEAM_SESSIONS)

    AGENT_STATUS[team_id] = {"working": False, "tool": None, "last_active": None, "last_prompt": ""}
    _log_activity(team_id, "🔄 재부팅됨 (세션 초기화)")

    return {"ok": True, "team_id": team_id}
