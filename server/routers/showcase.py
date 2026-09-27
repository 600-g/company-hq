"""메인 허브(aimaker-hub) 노출 카드 관리.

- GET  /api/showcase           — 공개. visible:true 만 order 순으로 반환 (CORS 허용)
- GET  /api/showcase?all=1     — manage_showcase 보유자 또는 admin 비번. visible 무관 전체
- PUT  /api/showcase           — manage_showcase 보유자 또는 admin 비번. 전체 items 교체

admin 비번 인증 (메인 허브 600g.net 에서 사용):
- Header: X-Admin-Password: <pwd>  또는  body.admin_password
- 비밀번호: 환경변수 SHOWCASE_ADMIN_PASSWORD (없으면 비번 인증 비활성)
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from admin_gate import require_admin as _require_admin

logger = logging.getLogger(__name__)
router = APIRouter(tags=["showcase"])

SHOWCASE_PATH = Path(__file__).resolve().parent.parent / "showcase.json"

ALLOWED_FIELDS = {"id", "title", "subtitle", "url", "icon", "color", "visible", "order"}



def _load() -> dict:
    if not SHOWCASE_PATH.exists():
        return {"items": []}
    try:
        with SHOWCASE_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict) or not isinstance(data.get("items"), list):
            return {"items": []}
        return data
    except Exception as e:
        logger.warning(f"showcase.json load failed: {e}")
        return {"items": []}


def _save(data: dict) -> None:
    # atomic write — 파일 손상 방지
    SHOWCASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".showcase-", dir=str(SHOWCASE_PATH.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, SHOWCASE_PATH)
    except Exception:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise


def _sanitize_item(raw: dict) -> dict | None:
    if not isinstance(raw, dict):
        return None
    item = {k: v for k, v in raw.items() if k in ALLOWED_FIELDS}
    iid = str(item.get("id", "")).strip()
    title = str(item.get("title", "")).strip()
    if not iid or not title:
        return None
    return {
        "id": iid[:64],
        "title": title[:64],
        "subtitle": str(item.get("subtitle", "")).strip()[:120],
        "url": str(item.get("url", "")).strip()[:512],
        "icon": str(item.get("icon", "")).strip()[:4096] or "lucide:square",
        "color": str(item.get("color", "")).strip()[:32] or "#64748b",
        "visible": bool(item.get("visible", False)),
        "order": int(item.get("order", 999)) if str(item.get("order", "")).lstrip("-").isdigit() else 999,
    }


@router.get("/api/showcase")
async def get_showcase(request: Request, all: int = 0):
    data = _load()
    items = data.get("items", [])
    if all:
        # admin 용 — 권한/비번 확인 후 전체 반환
        _require_admin(request, None)
        items_sorted = sorted(items, key=lambda x: (x.get("order", 999), x.get("id", "")))
        return {"items": items_sorted}
    # 공개 — visible 만
    visible = [x for x in items if x.get("visible")]
    visible.sort(key=lambda x: (x.get("order", 999), x.get("id", "")))
    return {"items": visible}


@router.put("/api/showcase")
async def put_showcase(request: Request, body: dict):
    _require_admin(request, body)
    raw_items = body.get("items")
    if not isinstance(raw_items, list):
        raise HTTPException(status_code=400, detail="items 배열 필요")
    cleaned = []
    seen = set()
    for r in raw_items:
        it = _sanitize_item(r)
        if not it:
            continue
        if it["id"] in seen:
            continue
        seen.add(it["id"])
        cleaned.append(it)
    if not cleaned:
        raise HTTPException(status_code=400, detail="유효한 카드 없음")
    _save({"items": cleaned})
    return {"ok": True, "count": len(cleaned)}
