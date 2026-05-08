"""
가구 카탈로그 관리자 오버라이드 — main.py 분할 4차 (안정화 2026-05-08).

이동:
- FURNITURE_OVERRIDES_PATH 상수
- _load_furniture_overrides / _save_furniture_overrides 헬퍼
- GET /api/furniture/overrides
- PUT /api/furniture/overrides  (안전장치: 기존 50% 이하 시 confirm_replace 필요)

자체 완결: furniture_overrides.json 단일 파일만 다룸.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/furniture", tags=["furniture"])

FURNITURE_OVERRIDES_PATH = os.path.join(os.path.dirname(__file__), "..", "furniture_overrides.json")


def _load_furniture_overrides() -> dict:
    if os.path.exists(FURNITURE_OVERRIDES_PATH):
        try:
            with open(FURNITURE_OVERRIDES_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                return data
        except Exception as e:
            logger.warning("furniture_overrides.json load failed: %s", e)
    return {}


def _save_furniture_overrides(data: dict) -> None:
    try:
        with open(FURNITURE_OVERRIDES_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error("furniture_overrides.json save failed: %s", e)


@router.get("/overrides")
async def get_furniture_overrides() -> dict:
    """카탈로그 라벨/카테고리/숨김 오버라이드 — 모든 기기 동기화"""
    return {"ok": True, "overrides": _load_furniture_overrides()}


@router.put("/overrides")
async def update_furniture_overrides(body: dict) -> dict:
    """관리자 전용 — 가구 카탈로그 오버라이드 전체 덮어쓰기.

    🛡 안전장치: 기존 override가 있고 새 payload가 `confirm_replace` 없이
    기존보다 50% 이상 적으면 거부 (실수 덮어쓰기 방지).
    """
    overrides = body.get("overrides") or {}
    if not isinstance(overrides, dict):
        return {"ok": False, "error": "overrides 객체 필요"}
    prev = _load_furniture_overrides()
    prev_count = len(prev.get("overrides", {})) if isinstance(prev.get("overrides"), dict) else 0
    new_count = len(overrides)
    if prev_count >= 10 and new_count < prev_count * 0.5 and not body.get("confirm_replace"):
        return {
            "ok": False,
            "error": "기존 override보다 크게 적음 — 실수 덮어쓰기 방지. 맞다면 confirm_replace:true 추가",
            "prev_count": prev_count,
            "new_count": new_count,
        }
    cleaned: dict = {
        "version": 1,
        "overrides": overrides,
        "poke_labels": body.get("poke_labels") or {},
        "poke_hidden": body.get("poke_hidden") or [],
        "tile_labels": body.get("tile_labels") or {},
        "tile_hidden": body.get("tile_hidden") or [],
        "updated_at": datetime.utcnow().isoformat(),
    }
    _save_furniture_overrides(cleaned)
    return {"ok": True, "saved": cleaned}
