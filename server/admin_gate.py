"""메인 허브(600g.net) 관리 기능 공통 인증 게이트.

2-track 인증 — showcase / apps 라우터가 공유한다.
1. X-Admin-Password 헤더 (또는 body.admin_password)
   → 환경변수 SHOWCASE_ADMIN_PASSWORD (없으면 비번 경로 비활성). 600g.net 푸터 5-탭 게이트용.
2. 두근컴퍼니 토큰 + capability
   → aimaker.600g.net 로그인 사용자용.
"""
from __future__ import annotations

import hmac
import logging
import os
import time

from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

ADMIN_PASSWORD_DEFAULT = ""  # 공개 저장소 — 기본 비번을 두지 않는다. .env 에 반드시 설정

# 무차별 대입 방어 — 비번이 짧고(기본 4자리), 이 게이트가 GitHub 공개 저장소
# 파일 게시 권한까지 지키게 되어 실패 시도를 IP 단위로 조인다.
_FAIL_WINDOW = 300          # 5분
_FAIL_LIMIT = 8             # 창 안에서 8회 실패하면
_LOCKOUT = 900              # 15분 잠금
_failures: dict[str, list[float]] = {}
_locked: dict[str, float] = {}


def _client_ip(request: Request) -> str:
    return (request.client.host if request.client else "") or "unknown"


def _check_lockout(request: Request) -> None:
    ip = _client_ip(request)
    until = _locked.get(ip, 0)
    if until > time.time():
        raise HTTPException(
            status_code=429,
            detail=f"인증 시도가 너무 많습니다. {int(until - time.time()) // 60 + 1}분 후 다시 시도하세요.",
        )
    if until:
        _locked.pop(ip, None)


def _record_failure(request: Request) -> None:
    ip = _client_ip(request)
    now = time.time()
    hits = [t for t in _failures.get(ip, []) if now - t < _FAIL_WINDOW]
    hits.append(now)
    _failures[ip] = hits
    if len(hits) >= _FAIL_LIMIT:
        _locked[ip] = now + _LOCKOUT
        _failures.pop(ip, None)
        logger.warning(f"admin_gate: {ip} 인증 실패 {_FAIL_LIMIT}회 → {_LOCKOUT}s 잠금")


def _record_success(request: Request) -> None:
    _failures.pop(_client_ip(request), None)


def check_admin_password(request: Request, body: dict | None) -> bool:
    """X-Admin-Password 헤더 또는 body.admin_password 가 일치하면 True."""
    expected = os.environ.get("SHOWCASE_ADMIN_PASSWORD", ADMIN_PASSWORD_DEFAULT)
    if not expected:
        return False
    supplied = (
        request.headers.get("x-admin-password", "")
        or (body or {}).get("admin_password", "")
    )
    # timing-safe 비교 (비번이 짧아 brute-force 표면이 좁음 → 최소한의 방어)
    return bool(supplied) and hmac.compare_digest(str(supplied), str(expected))


def require_admin(request: Request, body: dict | None, capability: str = "manage_showcase") -> None:
    """admin 비번 또는 지정 capability 둘 중 하나면 통과, 아니면 HTTPException."""
    _check_lockout(request)

    # 우선 비번 — 600g.net 메인 허브용 빠른 경로
    if check_admin_password(request, body):
        _record_success(request)
        return

    # 그 외 → 두근컴퍼니 토큰 + capability
    from auth import AuthError, extract_token_from_request, require_capability

    token = extract_token_from_request(
        dict(request.headers), dict(request.query_params), (body or {}).get("token", "")
    )
    try:
        require_capability(token, capability)
    except AuthError as e:
        _record_failure(request)
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    _record_success(request)
