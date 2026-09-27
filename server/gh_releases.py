"""GitHub Releases 를 파일 배포 백엔드로 쓰는 얇은 클라이언트.

메인 허브(600g.net)의 앱 배포용 — exe/dmg/apk 같은 큰 바이너리를 GitHub CDN 에
올려두고 허브는 다운로드 링크만 노출한다. 집 맥 회선으로 다운로드 트래픽이
흐르지 않고, 파일당 2GB 까지 무료.

앱 1개 = 릴리스 1개 (tag `app-{id}`). 버전 갱신 시 새 에셋 업로드 후 옛 에셋 삭제.

필요 환경변수:
- GITHUB_TOKEN   : repo 스코프 PAT
- APPS_GH_REPO   : "owner/repo" (기본 600-g/app-releases) — 2026-09-28 부터 **비공개**. 다운로드는
                   routers/apps.py 가 토큰으로 에셋 서명 URL 을 받아 넘긴다 (사이트 경유만)
"""
from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)

API_ROOT = "https://api.github.com"
UPLOAD_ROOT = "https://uploads.github.com"
DEFAULT_REPO = "600-g/app-releases"

# 업로드는 수십 MB 가 오갈 수 있어 넉넉히
UPLOAD_TIMEOUT = httpx.Timeout(600.0, connect=15.0)
API_TIMEOUT = httpx.Timeout(30.0, connect=10.0)


class GitHubError(RuntimeError):
    """GitHub API 호출 실패 — 호출부가 사용자 메시지로 변환한다."""


def repo() -> str:
    return (os.environ.get("APPS_GH_REPO") or DEFAULT_REPO).strip()


def _token() -> str:
    tok = (os.environ.get("GITHUB_TOKEN") or "").strip()
    if not tok:
        raise GitHubError("GITHUB_TOKEN 이 설정되지 않았습니다 (server/.env)")
    return tok


def _headers(extra: dict | None = None) -> dict:
    h = {
        "Authorization": f"Bearer {_token()}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if extra:
        h.update(extra)
    return h


def _fail(resp: httpx.Response, what: str) -> GitHubError:
    detail = ""
    try:
        detail = resp.json().get("message", "")
    except Exception:
        detail = (resp.text or "")[:200]
    return GitHubError(f"{what} 실패 (HTTP {resp.status_code}) {detail}".strip())


async def repo_status() -> dict:
    """배포 저장소 존재/공개 여부 확인 — 진단용."""
    async with httpx.AsyncClient(timeout=API_TIMEOUT) as c:
        r = await c.get(f"{API_ROOT}/repos/{repo()}", headers=_headers())
    if r.status_code == 404:
        return {"exists": False, "repo": repo(), "private": None}
    if r.status_code >= 400:
        raise _fail(r, "저장소 조회")
    d = r.json()
    return {"exists": True, "repo": repo(), "private": bool(d.get("private"))}


async def ensure_release(tag: str, title: str) -> dict:
    """tag 에 해당하는 릴리스를 가져오고, 없으면 만든다."""
    async with httpx.AsyncClient(timeout=API_TIMEOUT) as c:
        r = await c.get(f"{API_ROOT}/repos/{repo()}/releases/tags/{tag}", headers=_headers())
        if r.status_code == 200:
            return r.json()
        if r.status_code != 404:
            raise _fail(r, "릴리스 조회")

        r = await c.post(
            f"{API_ROOT}/repos/{repo()}/releases",
            headers=_headers(),
            json={
                "tag_name": tag,
                "name": title or tag,
                "body": "메인 허브(600g.net) 앱 배포용 릴리스 — 자동 생성.",
                "draft": False,
                "prerelease": False,
            },
        )
    if r.status_code >= 400:
        raise _fail(r, "릴리스 생성")
    return r.json()


async def upload_asset(release_id: int, filename: str, content: bytes, content_type: str) -> dict:
    """릴리스에 에셋 업로드. 같은 이름이 이미 있으면 먼저 지우고 올린다."""
    existing = await list_assets(release_id)
    for a in existing:
        if a.get("name") == filename:
            await delete_asset(int(a["id"]))

    async with httpx.AsyncClient(timeout=UPLOAD_TIMEOUT) as c:
        r = await c.post(
            f"{UPLOAD_ROOT}/repos/{repo()}/releases/{release_id}/assets",
            headers=_headers({"Content-Type": content_type or "application/octet-stream"}),
            params={"name": filename},
            content=content,
        )
    if r.status_code >= 400:
        raise _fail(r, "파일 업로드")
    return r.json()


async def list_assets(release_id: int) -> list[dict]:
    async with httpx.AsyncClient(timeout=API_TIMEOUT) as c:
        r = await c.get(
            f"{API_ROOT}/repos/{repo()}/releases/{release_id}/assets",
            headers=_headers(),
            params={"per_page": 100},
        )
    if r.status_code >= 400:
        raise _fail(r, "에셋 목록 조회")
    return r.json()


async def delete_asset(asset_id: int) -> bool:
    """에셋 삭제. 이미 없으면(404) 성공으로 친다."""
    async with httpx.AsyncClient(timeout=API_TIMEOUT) as c:
        r = await c.delete(
            f"{API_ROOT}/repos/{repo()}/releases/assets/{asset_id}", headers=_headers()
        )
    if r.status_code in (204, 404):
        return True
    logger.warning(f"에셋 삭제 실패 asset_id={asset_id} status={r.status_code}")
    return False


async def delete_release(release_id: int) -> bool:
    async with httpx.AsyncClient(timeout=API_TIMEOUT) as c:
        r = await c.delete(
            f"{API_ROOT}/repos/{repo()}/releases/{release_id}", headers=_headers()
        )
    return r.status_code in (204, 404)
