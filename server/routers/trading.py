"""매매봇 엔드포인트 — main.py 분할 11차 (안정화 2026-05-08).

이동: /api/trading-bot/{mode,status} + /api/trading/stats
자체 완결.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter

from trading_stats import get_trading_stats

router = APIRouter(tags=["trading"])


@router.post("/api/trading-bot/mode")
async def switch_trading_bot_mode(request: dict):
    """매매봇 데모/리얼 모드 전환 — Firebase upbit_control에 기록"""
    import requests as req_lib
    target = request.get("mode", "")
    pin = request.get("pin", "")
    if target not in ("demo", "real"):
        return {"ok": False, "error": "mode must be 'demo' or 'real'"}
    if target == "real" and (not pin or len(pin) != 4):
        return {"ok": False, "error": "PIN 4자리 필요"}
    fb_url = "https://firestore.googleapis.com/v1/projects/datemap-759bf/databases/(default)/documents/upbit_control"
    fields: dict = {
        "action": {"stringValue": "switch"},
        "mode": {"stringValue": target},
        "ts": {"timestampValue": datetime.now().strftime('%Y-%m-%dT%H:%M:%S.000Z')},
    }
    if pin:
        fields["pin"] = {"stringValue": pin}
    try:
        resp = req_lib.post(fb_url, json={"fields": fields}, timeout=10)
        if resp.status_code in (200, 201):
            return {"ok": True, "message": f"{target} 모드 전환 요청 전송됨"}
        return {"ok": False, "error": f"Firebase 응답 {resp.status_code}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/api/trading-bot/status")
async def get_trading_bot_status():
    """매매봇 status.json 프록시 — 대시보드 팝업용"""
    status_path = Path.home() / "Desktop" / "업비트자동" / "docs" / "status.json"
    if not status_path.exists():
        return {"ok": False, "error": "status.json not found"}
    try:
        data = json.loads(status_path.read_text(encoding="utf-8"))
        return {"ok": True, **data}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/api/trading/stats")
async def get_trading_stats_api():
    """매매봇 통계 API — 승률, 손익, 포지션, 모멘텀 등 통합 조회"""
    return get_trading_stats()
