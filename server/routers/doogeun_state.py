"""
doogeun-hq 상태 동기화 (에이전트 + 레이아웃) — main.py 분할 13차 (안정화 2026-05-08).

이동:
- DOOGEUN_STATE_PATH 상수
- _doogeun_ws_clients (WS 연결 풀)
- _load_doogeun_state / _save_doogeun_state (SQLite + JSON dual)
- GET /api/doogeun/state           — 전체 상태 + 새 팀 자동 보충
- PUT /api/doogeun/state           — 덮어쓰기 + WS 브로드캐스트
- WS  /ws/doogeun/state            — 실시간 동기화

자체 완결: SQLite db 모듈 + main.TEAMS lazy import 만 의존.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import time
from datetime import datetime

from fastapi import APIRouter, Request, WebSocket

logger = logging.getLogger(__name__)
router = APIRouter(tags=["doogeun-state"])

DOOGEUN_STATE_PATH = os.path.join(os.path.dirname(__file__), "..", "doogeun_state.json")
_doogeun_ws_clients: set = set()


def _load_doogeun_state() -> dict:
    """SQLite state_kv 우선 read (디스크 I/O 1/100). 없으면 JSON fallback (1회 마이그레이션)."""
    try:
        from db import state_kv_get, state_kv_set
        v = state_kv_get("doogeun_state")
        if isinstance(v, dict):
            return v
        if os.path.exists(DOOGEUN_STATE_PATH):
            try:
                with open(DOOGEUN_STATE_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    state_kv_set("doogeun_state", data)
                    logger.info("[doogeun_state] JSON → SQLite 마이그레이션 완료")
                    return data
            except Exception as e:
                logger.warning("doogeun_state.json load failed: %s", e)
    except Exception as e:
        logger.warning("[doogeun_state] SQLite read 실패, JSON fallback: %s", e)
        if os.path.exists(DOOGEUN_STATE_PATH):
            try:
                with open(DOOGEUN_STATE_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    return data
            except Exception as ee:
                logger.warning("doogeun_state.json load failed: %s", ee)
    return {"agents": [], "layout": {"floors": {}}, "version": 0, "updated_at": None}


def _save_doogeun_state(data: dict) -> None:
    """원자적 쓰기 + 시간별 백업 + SQLite dual-write."""
    try:
        from db import state_kv_set
        state_kv_set("doogeun_state", data)
    except Exception as e:
        logger.warning("[doogeun_state] SQLite dual-write 실패 (JSON 만 저장): %s", e)
    try:
        if os.path.exists(DOOGEUN_STATE_PATH):
            backup_dir = os.path.join(os.path.dirname(DOOGEUN_STATE_PATH), "doogeun_state_backups")
            os.makedirs(backup_dir, exist_ok=True)
            now = datetime.utcnow()
            bucket = (now.hour // 4) * 4
            stamp = f"{now.strftime('%Y%m%d')}-{bucket:02d}"
            backup_path = os.path.join(backup_dir, f"doogeun_state.{stamp}.json")
            if not os.path.exists(backup_path):
                try:
                    shutil.copy2(DOOGEUN_STATE_PATH, backup_path)
                    import glob as _glob
                    backups = sorted(_glob.glob(os.path.join(backup_dir, "doogeun_state.*.json")))
                    while len(backups) > 6:
                        try: os.remove(backups[0])
                        except OSError: pass
                        backups.pop(0)
                except Exception as be:
                    logger.warning("doogeun_state backup failed: %s", be)
        tmp_path = DOOGEUN_STATE_PATH + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, DOOGEUN_STATE_PATH)
    except Exception as e:
        logger.error("doogeun_state.json save failed: %s", e)


@router.get("/api/doogeun/state")
async def get_doogeun_state() -> dict:
    """전체 doogeun-hq 상태 — 에이전트 + 레이아웃.

    GET 시 teams.json 의 새 팀(예: staff)을 자동 보충 — 클라가 빠진 팀 못 받는 문제 방지.
    """
    import main as _main
    state = _load_doogeun_state()
    existing_ids = {a.get("id") for a in state.get("agents", [])}
    server_skip = {"server-monitor"}
    added = []
    now_ts = int(time.time() * 1000)
    for t in _main.TEAMS:
        tid = t.get("id")
        if not tid or tid in existing_ids or tid in server_skip:
            continue
        new_agent = {
            "id": tid,
            "name": t.get("name", tid),
            "emoji": t.get("emoji", "🧑"),
            "role": t.get("category", ""),
            "description": t.get("status", ""),
            "systemPromptMd": "",
            "status": "idle",
            "floor": 1,
            "createdAt": now_ts,
            "updatedAt": now_ts,
            "activity": [],
        }
        state.setdefault("agents", []).append(new_agent)
        added.append(tid)
    if added:
        _save_doogeun_state(state)
        logger.info("[doogeun_state] 자동 보충: %s", added)
    return {"ok": True, "state": state}


@router.put("/api/doogeun/state")
async def update_doogeun_state(body: dict, request: Request) -> dict:
    """전체 상태 덮어쓰기 + 연결된 모든 WS 클라이언트에 브로드캐스트."""
    agents = body.get("agents")
    layout = body.get("layout")
    client_id = body.get("client_id") or ""
    if agents is None and layout is None:
        return {"ok": False, "error": "agents 또는 layout 필요"}
    prev = _load_doogeun_state()
    new_state = {
        "agents": agents if agents is not None else prev.get("agents", []),
        "layout": layout if layout is not None else prev.get("layout", {"floors": {}}),
        "version": int(prev.get("version", 0)) + 1,
        "updated_at": datetime.utcnow().isoformat(),
    }
    _save_doogeun_state(new_state)
    dead: list = []
    for ws in list(_doogeun_ws_clients):
        try:
            if getattr(ws, "_doogeun_client_id", None) == client_id:
                continue
            await ws.send_json({"type": "state_update", "state": new_state})
        except Exception:
            dead.append(ws)
    for ws in dead:
        _doogeun_ws_clients.discard(ws)
    return {"ok": True, "state": new_state}


@router.websocket("/ws/doogeun/state")
async def doogeun_state_ws(ws: WebSocket):
    """실시간 상태 동기화 WS — 다른 디바이스가 변경하면 푸시 받음."""
    await ws.accept()
    try:
        hello = await ws.receive_json()
        ws._doogeun_client_id = hello.get("client_id") or ""  # type: ignore[attr-defined]
    except Exception:
        ws._doogeun_client_id = ""  # type: ignore[attr-defined]
    _doogeun_ws_clients.add(ws)
    try:
        await ws.send_json({"type": "state_update", "state": _load_doogeun_state()})
        while True:
            msg = await ws.receive_json()
            if msg.get("type") == "ping":
                await ws.send_json({"type": "pong"})
    except Exception:
        pass
    finally:
        _doogeun_ws_clients.discard(ws)
