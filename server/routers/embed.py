"""두근컴퍼니가 만든 외부 사이트 (date-map, ai900 등) 에 임베드되는 위젯의 백엔드.

흐름:
1. 사용자 자체 사이트(예: datemap.600g.net)에서 widget.js 가 ⚙️ 버튼 표시
2. 클릭 → 개발자모드 비번 프롬프트 → POST /api/embed/dev-auth
3. 통과 시 .600g.net HttpOnly 쿠키 set (모든 *.600g.net 서브도메인 공유)
4. 이후 GET /api/embed/me 로 위젯이 풀 기능 (채팅/터미널/패치노트) 노출
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import subprocess
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response

logger = logging.getLogger(__name__)

router = APIRouter()

_COOKIE_NAME = "doogeun-embed-auth"
_COOKIE_DOMAIN = ".600g.net"
_COOKIE_MAX_AGE = 60 * 60 * 24 * 14  # 14 일
_SECRET = os.getenv("EMBED_COOKIE_SECRET") or os.getenv("OWNER_PASSWORD", "fallback-dev-secret")


def _sign(payload: str) -> str:
    return hmac.new(_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def _make_token(now_ts: int) -> str:
    payload = f"owner|{now_ts}"
    sig = _sign(payload)
    return f"{payload}|{sig}"


def _verify_token(token: str) -> bool:
    try:
        parts = token.split("|")
        if len(parts) != 3:
            return False
        role, ts_str, sig = parts
        payload = f"{role}|{ts_str}"
        expected = _sign(payload)
        if not hmac.compare_digest(sig, expected):
            return False
        ts = int(ts_str)
        if time.time() - ts > _COOKIE_MAX_AGE:
            return False
        return True
    except Exception:
        return False


def _is_authed(request: Request) -> bool:
    token = request.cookies.get(_COOKIE_NAME)
    return bool(token and _verify_token(token))


@router.post("/api/embed/dev-auth")
async def embed_dev_auth(body: dict, response: Response) -> dict:
    """개발자모드 비밀번호 검증 → .600g.net 쿠키 발행."""
    password = (body or {}).get("password") or ""
    owner_pw = os.getenv("OWNER_PASSWORD", "")
    if not owner_pw:
        raise HTTPException(500, "OWNER_PASSWORD 미설정")
    if password != owner_pw:
        # 단순 brute-force 방어: 응답 지연 0.5s
        time.sleep(0.5)
        raise HTTPException(401, "비밀번호 불일치")

    token = _make_token(int(time.time()))
    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        domain=_COOKIE_DOMAIN,
        max_age=_COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    return {"ok": True}


@router.post("/api/embed/dev-logout")
async def embed_dev_logout(response: Response) -> dict:
    response.delete_cookie(key=_COOKIE_NAME, domain=_COOKIE_DOMAIN, path="/")
    return {"ok": True}


@router.get("/api/embed/me")
async def embed_me(request: Request) -> dict:
    """위젯이 마운트 시 호출 — 쿠키 유효성만 확인."""
    return {"authed": _is_authed(request)}


@router.get("/api/embed/patch-log")
async def embed_patch_log(team_id: str, request: Request, limit: int = 20) -> dict:
    """해당 팀 repo 의 git log — 패치 히스토리 표시용."""
    if not _is_authed(request):
        raise HTTPException(401, "개발자 인증 필요")

    import main as _main

    team = next((t for t in _main.TEAMS if t.get("id") == team_id), None)
    if not team:
        raise HTTPException(404, f"팀 없음: {team_id}")

    local_path_raw = team.get("localPath", "")
    if not local_path_raw:
        return {"ok": True, "team_id": team_id, "commits": [], "warn": "localPath 미설정"}

    local_path = Path(os.path.expanduser(local_path_raw))
    if not (local_path / ".git").exists():
        return {"ok": True, "team_id": team_id, "commits": [], "warn": "git repo 아님"}

    limit = max(1, min(limit, 100))
    try:
        result = subprocess.run(
            [
                "git",
                "-C",
                str(local_path),
                "log",
                f"-n{limit}",
                "--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ct",
            ],
            capture_output=True,
            text=True,
            timeout=5,
            check=True,
        )
    except subprocess.CalledProcessError as e:
        logger.warning("[embed/patch-log] git 실패 %s: %s", team_id, e.stderr)
        return {"ok": False, "error": "git log 실패"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "git log 타임아웃"}

    commits = []
    for line in result.stdout.strip().split("\n"):
        if not line:
            continue
        parts = line.split("\x1f")
        if len(parts) != 5:
            continue
        commits.append(
            {
                "sha": parts[0],
                "short_sha": parts[1],
                "subject": parts[2],
                "author": parts[3],
                "ts": int(parts[4]),
            }
        )

    return {"ok": True, "team_id": team_id, "commits": commits, "repo_path": str(local_path)}
