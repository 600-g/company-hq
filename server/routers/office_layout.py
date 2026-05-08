"""
사무실 가구 배치 동기화 — main.py 분할 3차 (안정화 2026-05-08).

이동:
- OFFICE_LAYOUT_PATH 상수
- _load_office_layout / _save_office_layout 헬퍼
- GET  /api/layout/office  — 배치 조회
- PUT  /api/layout/office  — 배치 저장 (PC/모바일 동기화)

자체 완결: TEAMS / FLOOR_LAYOUT / 채팅 상태와 무관 — JSON 단일 파일만 다룸.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/layout", tags=["layout"])

OFFICE_LAYOUT_PATH = Path(__file__).parent.parent / "office_layout.json"


def _load_office_layout() -> dict:
    if OFFICE_LAYOUT_PATH.exists():
        try:
            with open(OFFICE_LAYOUT_PATH, encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning("office_layout.json load failed: %s", e)
    return {"version": 2, "items": [], "removed": []}


def _save_office_layout(layout: dict) -> None:
    try:
        with open(OFFICE_LAYOUT_PATH, "w", encoding="utf-8") as f:
            json.dump(layout, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error("office_layout.json save failed: %s", e)


@router.get("/office")
async def get_office_layout() -> dict:
    """사무실 가구 배치 — 모든 기기 공유 (PC/모바일 동기화)"""
    return {"ok": True, "layout": _load_office_layout()}


@router.put("/office")
async def update_office_layout(body: dict) -> dict:
    """사무실 가구 배치 저장 — 에디터에서 placement 변경 시 호출

    body: {"layout": {"version": 2, "items": [...], "removed": [...]}}
    """
    layout = body.get("layout") or {}
    items = layout.get("items")
    if not isinstance(items, list):
        return {"ok": False, "error": "layout.items 배열이 필요합니다"}
    cleaned = {
        "version": 2,
        "items": items,
        "removed": layout.get("removed") or [],
        "updated_at": datetime.utcnow().isoformat(),
    }
    _save_office_layout(cleaned)
    return {"ok": True, "layout": cleaned}
