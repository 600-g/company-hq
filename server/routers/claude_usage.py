"""Claude Max 플랜 사용량 — admin 전용.

- GET /api/claude-usage  — admin(레벨 4) 이상만. 2분 캐시.

공개 노출 금지: 잔량·리셋 시각은 오너 개인 계정의 과금 정보다.
`auth.require_user(min_level=4)` = owner(5) / admin(4) 만 통과 — 프론트 `useAuthStore.isAdmin()` 과 같은 경계.
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request

import claude_usage as usage_core
from auth import AuthError, extract_token_from_request, require_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["claude-usage"])

ADMIN_MIN_LEVEL = 4


@router.get("/api/claude-usage")
async def get_claude_usage(request: Request) -> dict:
    token = extract_token_from_request(dict(request.headers), dict(request.query_params))
    try:
        require_user(token, min_level=ADMIN_MIN_LEVEL)
    except AuthError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    # 키체인 subprocess + HTTP 호출 → 블로킹. 이벤트 루프 밖으로 뺀다.
    return await asyncio.to_thread(usage_core.get_usage)
