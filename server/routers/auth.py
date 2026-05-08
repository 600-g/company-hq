"""인증 엔드포인트 — main.py 분할 9차 (안정화 2026-05-08).

이동: /api/auth/owner, /register, /verify, /create-code, /codes, /users, /roles
자체 완결: auth 모듈 위임만, 공유 상태 0.
"""
from __future__ import annotations

from fastapi import APIRouter

from auth import (
    register_user, verify_token, create_invite_code,
    get_all_codes, get_all_users, ROLES, owner_login,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/owner")
async def auth_owner(body: dict):
    """오너 비밀번호 로그인"""
    password = body.get("password", "")
    result = owner_login(password)
    if not result:
        return {"ok": False, "error": "비밀번호가 틀렸습니다."}
    return {"ok": True, **result}


@router.post("/register")
async def auth_register(body: dict):
    """초대코드로 회원가입"""
    nickname = body.get("nickname", "").strip()
    code = body.get("code", "").strip()
    if not nickname or not code:
        return {"ok": False, "error": "닉네임과 초대코드를 입력하세요."}
    result = register_user(nickname, code)
    if not result:
        return {"ok": False, "error": "초대코드가 유효하지 않습니다."}
    return {"ok": True, **result}


@router.post("/verify")
async def auth_verify(body: dict):
    """토큰 검증"""
    token = body.get("token", "")
    user = verify_token(token)
    if not user:
        return {"ok": False}
    return {"ok": True, **user}


@router.post("/create-code")
async def auth_create_code(body: dict):
    """초대코드 생성 (오너/관리자만)"""
    token = body.get("token", "")
    user = verify_token(token)
    if not user or ROLES.get(user["role"], {}).get("level", 0) < 4:
        return {"ok": False, "error": "권한이 없습니다."}
    role = body.get("role", "member")
    max_uses = body.get("max_uses", 1)
    code = create_invite_code(role=role, created_by=user["nickname"], max_uses=max_uses)
    return {"ok": True, "code": code, "role": role}


@router.get("/codes")
async def auth_list_codes():
    """초대코드 목록 (관리용)"""
    return get_all_codes()


@router.get("/users")
async def auth_list_users():
    """사용자 목록 (관리용)"""
    return get_all_users()


@router.get("/roles")
async def auth_roles():
    """역할 목록"""
    return ROLES
