"""메인 허브(600g.net) 앱 배포 — exe/dmg/apk 업로드 & 다운로드.

파일 실체는 GitHub Releases 에 두고(gh_releases.py), 여기서는 메타데이터
(server/apps.json)만 관리한다. 허브는 다운로드 버튼만 노출.

- GET    /api/apps                  공개. visible:true 만 order 순
- GET    /api/apps?all=1            admin. 전체
- GET    /api/apps/_status          admin. 배포 저장소 진단
- POST   /api/apps/upload           admin. multipart 업로드 (CF 터널 100MB 제한). replace=true + app_id = 기존 앱 파일 교체
- POST   /api/apps/upload-local     admin + loopback 전용. 로컬 경로 → 대용량 우회
- PUT    /api/apps                  admin. 메타데이터 일괄 교체 (파일 정보는 서버가 보존)
- DELETE /api/apps/{app_id}         admin. GitHub 릴리스까지 삭제
- GET    /api/apps/{app_id}/download 공개. 카운트 후 GitHub 로 302 (잠긴 앱은 코드 입력 페이지)
- POST   /api/apps/{app_id}/download 잠긴 앱 코드 확인 → GitHub 로 303
- POST   /api/apps/link           admin. 외부 GitHub 저장소의 최신 릴리스에 연결 (업로드 없음 · 항상 최신)

인증은 admin_gate (X-Admin-Password 또는 manage_showcase capability) 공유.
"""
from __future__ import annotations

import hashlib
import hmac
import html
import json
import logging
import os
import re
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse

import gh_releases
from admin_gate import require_admin

logger = logging.getLogger(__name__)
router = APIRouter(tags=["apps"])

APPS_PATH = Path(__file__).resolve().parent.parent / "apps.json"

# 관리자가 편집 가능한 필드 — 파일 관련 필드는 절대 클라이언트 입력을 믿지 않는다
EDITABLE_FIELDS = {"id", "name", "version", "description", "platform", "icon", "color", "visible", "order"}
# 다운로드 잠금 — 관리자가 켜고 코드를 정한다. 공개 응답에는 locked 여부만 나간다 (코드는 절대 X)
LOCK_CODE_MAX = 32
# 서버만 쓰는 필드 (업로드 시 채워지고 PUT 으로는 못 바꿈)
FILE_FIELDS = {
    "filename", "size", "content_type", "sha256",
    "release_tag", "release_id", "asset_id", "download_url",
    "uploaded_at", "downloads",
}
# 외부 GitHub 저장소의 "최신 릴리스" 에 연결된 앱 — 파일 업로드 대신 그 저장소가 진실.
# 예: 600-g/shutdown-timer 는 태그 push 마다 Actions 가 Release 를 만들고, 허브는 항상 최신을 가리킨다.
# 이 필드도 PUT 으로는 못 바꾼다 (link 엔드포인트로만 설정).
LINK_FIELDS = {"source_repo", "source_asset", "source_private"}
LINK_REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
LINK_ASSET_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
LATEST_TTL = int(os.environ.get("APPS_LATEST_TTL", "600"))  # 최신 릴리스 조회 캐시(초)
LATEST_FAIL_TTL = 60  # 조회 실패 후 재시도 간격(초) — GitHub 장애 때 요청마다 때리지 않게
GITHUB_API = "https://api.github.com"

ALLOWED_EXT = {
    ".exe", ".msi", ".zip", ".7z", ".dmg", ".pkg", ".apk", ".aab",
    ".jar", ".deb", ".rpm", ".appimage", ".gz", ".tgz", ".xz", ".ipa",
}

PLATFORM_BY_EXT = {
    ".exe": "windows", ".msi": "windows",
    ".dmg": "mac", ".pkg": "mac",
    ".apk": "android", ".aab": "android",
    ".ipa": "ios",
    ".deb": "linux", ".rpm": "linux", ".appimage": "linux",
}

# CF 무료 플랜은 프록시 요청 본문을 100MB 로 자른다 → 여유 두고 95MB
MAX_UPLOAD_BYTES = int(os.environ.get("APPS_MAX_UPLOAD_MB", "95")) * 1024 * 1024
CHUNK = 1024 * 1024


# ── 저장소 ────────────────────────────────────────────

def _load() -> dict:
    if not APPS_PATH.exists():
        return {"items": []}
    try:
        with APPS_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict) or not isinstance(data.get("items"), list):
            return {"items": []}
        return data
    except Exception as e:
        logger.warning(f"apps.json load failed: {e}")
        return {"items": []}


def _save(data: dict) -> None:
    """atomic write — 파일 손상 방지 (showcase.json 과 같은 패턴)."""
    APPS_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".apps-", dir=str(APPS_PATH.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, APPS_PATH)
    except Exception:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise


def _public_view(it: dict) -> dict:
    """공개 응답 — 내부 식별자(release_id/asset_id)는 숨긴다."""
    return {
        "id": it.get("id"),
        "name": it.get("name"),
        "version": it.get("version", ""),
        "description": it.get("description", ""),
        "platform": it.get("platform", "other"),
        "icon": it.get("icon", "lucide:package"),
        "color": it.get("color", "#002f6c"),
        "filename": it.get("filename", ""),
        "size": it.get("size", 0),
        "sha256": it.get("sha256", ""),
        "uploaded_at": it.get("uploaded_at", ""),
        "downloads": it.get("downloads", 0),
        "order": it.get("order", 999),
        "locked": _is_locked(it),
    }


def _is_locked(it: dict) -> bool:
    """잠금이 켜져 있고 코드가 있어야 잠금 — 코드 없는 잠금은 아무도 못 받으니 저장 단계에서 막는다."""
    return bool(it.get("locked")) and bool(str(it.get("lock_code") or ""))


def _slugify(raw: str) -> str:
    s = re.sub(r"[^a-z0-9-]+", "-", (raw or "").strip().lower()).strip("-")
    return s[:48] or ("app-" + uuid.uuid4().hex[:8])


def _file_ext(raw: str) -> str:
    """원본 파일명에서 확장자만 뽑는다.

    확장자는 **ASCII 정규화 전에** 원본에서 떼어내야 한다. 스템과 함께 치환하면
    한글 파일명이 통째로 날아간다 ('내앱.zip' → 'zip' → 확장자 없음 → 400).
    """
    ext = os.path.splitext(os.path.basename(raw or ""))[1].lower()
    return re.sub(r"[^a-z0-9.]", "", ext)[:12]


def _ascii_stem(raw: str) -> str:
    """파일명 스템을 ASCII 안전하게. 한글만으로 된 이름이면 빈 문자열이 된다."""
    stem = os.path.splitext(os.path.basename(raw or ""))[0]
    return re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-._")[:100]


def _build_filename(raw: str, app_id: str, ext: str) -> str:
    """GitHub 에셋 이름 — ASCII 안전. 스템이 비면(한글 등) 앱 id 로 대체."""
    return (_ascii_stem(raw) or app_id or "app") + ext


def _check_ext(ext: str) -> str:
    if ext not in ALLOWED_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"지원하지 않는 확장자: {ext or '(없음)'} — 허용: {', '.join(sorted(ALLOWED_EXT))}",
        )
    return ext


# ── 외부 릴리스 연동 ───────────────────────────────────

_latest_cache: dict[str, tuple[float, dict | None]] = {}


def _linked_download_url(repo: str, asset: str) -> str:
    """항상 최신 릴리스 에셋을 가리키는 고정 주소 — API 호출 없이 GitHub 가 302 로 안내한다."""
    return f"https://github.com/{repo}/releases/latest/download/{asset}"


def _download_target(item: dict) -> str:
    """302 목적지. 연동 앱은 저장값과 무관하게 항상 최신 고정 주소, 아니면 업로드 때 받은 URL."""
    if item.get("source_repo") and item.get("source_asset"):
        return _linked_download_url(item["source_repo"], item["source_asset"])
    return str(item.get("download_url") or "")


def _github_headers() -> dict:
    """토큰이 있으면 인증(시간당 5000회), 없으면 익명(60회). public 저장소 조회라 둘 다 된다."""
    try:
        return gh_releases._headers()
    except gh_releases.GitHubError:
        return {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}


def _parse_release(d: dict) -> dict:
    return {
        "tag_name": str(d.get("tag_name") or ""),
        "published_at": str(d.get("published_at") or ""),
        "assets": [
            {"name": str(a.get("name") or ""), "size": int(a.get("size") or 0), "id": int(a.get("id") or 0)}
            for a in (d.get("assets") or [])
        ],
    }


def _has_asset(rel: dict | None, asset: str) -> bool:
    return bool(rel) and any(a.get("name") == asset for a in rel.get("assets", []))


async def _fetch_latest_release(repo: str, *, force: bool = False, asset: str = "") -> dict | None:
    """repo 의 최신 릴리스 {tag_name, published_at, assets:[{name, size, id}]}. TTL 캐시, 실패는 None.

    asset 을 주면 그 에셋이 든 **가장 최근** 릴리스를 돌려준다 — 한 저장소에 성격이 다른
    릴리스(서버 zip · 클라 설치파일)가 섞여 있어 /latest 에 원하는 에셋이 없을 수 있다.
    비공개 저장소도 GITHUB_TOKEN 으로 조회된다.
    """
    key = f"{repo}|{asset}"
    now = time.monotonic()
    cached = _latest_cache.get(key)
    if cached and not force:
        ts, rel = cached
        if now - ts < (LATEST_TTL if rel is not None else LATEST_FAIL_TTL):
            return rel

    rel: dict | None = None
    try:
        async with httpx.AsyncClient(timeout=gh_releases.API_TIMEOUT) as c:
            r = await c.get(f"{GITHUB_API}/repos/{repo}/releases/latest", headers=_github_headers())
            if r.status_code == 200:
                rel = _parse_release(r.json())
            if asset and not _has_asset(rel, asset):
                r = await c.get(f"{GITHUB_API}/repos/{repo}/releases?per_page=30", headers=_github_headers())
                if r.status_code == 200:
                    rel = next(
                        (_parse_release(d) for d in r.json()
                         if not d.get("draft") and _has_asset(_parse_release(d), asset)),
                        rel,
                    )
        if rel is None:
            logger.warning(f"최신 릴리스 조회 실패 {repo}: HTTP {r.status_code}")
    except Exception as e:
        logger.warning(f"최신 릴리스 조회 실패 {repo}: {e}")
    _latest_cache[key] = (now, rel)
    return rel


async def _repo_is_private(repo: str) -> bool:
    """연동 등록 시 한 번 — 비공개면 다운로드를 토큰으로 서명 URL 을 받아 넘긴다."""
    try:
        async with httpx.AsyncClient(timeout=gh_releases.API_TIMEOUT) as c:
            r = await c.get(f"{GITHUB_API}/repos/{repo}", headers=_github_headers())
        return r.status_code == 200 and bool(r.json().get("private"))
    except Exception as e:
        logger.warning(f"저장소 공개 여부 조회 실패 {repo}: {e}")
        return False


async def _private_asset_url(repo: str, asset: str) -> str:
    """비공개 저장소 에셋 → GitHub 가 발급하는 수 분짜리 서명 URL. 파일은 맥을 거치지 않는다."""
    rel = await _fetch_latest_release(repo, asset=asset)
    found = next((a for a in (rel or {}).get("assets", []) if a.get("name") == asset), None)
    if not found or not found.get("id"):
        return ""
    return await _asset_location(repo, int(found["id"]))


async def _asset_location(repo: str, asset_id: int) -> str:
    """에셋 id → GitHub 가 발급하는 수 분짜리 서명 URL.

    tag/파일명 주소(releases/download/...)는 GitHub 가 한동안 캐시해서, 같은 이름으로 교체한
    직후 옛 파일이 내려가는 일이 있었다. 에셋 id 로 받으면 항상 지금 올라가 있는 파일이다.
    """
    try:
        async with httpx.AsyncClient(timeout=gh_releases.API_TIMEOUT, follow_redirects=False) as c:
            r = await c.get(
                f"{GITHUB_API}/repos/{repo}/releases/assets/{asset_id}",
                headers={**_github_headers(), "Accept": "application/octet-stream"},
            )
        if r.status_code in (301, 302, 303, 307, 308):
            return r.headers.get("location", "")
        logger.warning(f"에셋 URL 발급 실패 {repo}#{asset_id}: HTTP {r.status_code}")
    except Exception as e:
        logger.warning(f"에셋 URL 발급 실패 {repo}#{asset_id}: {e}")
    return ""


def _tag_version(tag: str) -> str:
    """태그 → 표시 버전. v1.0.2 → 1.0.2, client-v1.5 → 1.5 (숫자가 없으면 태그 그대로)."""
    m = re.search(r"\d[0-9A-Za-z.+-]*", tag)
    return (m.group(0) if m else tag.lstrip("vV"))[:32]


def _apply_latest(item: dict, release: dict | None) -> dict:
    """연동 앱 레코드에 최신 릴리스 정보를 입힌 **새** dict. 릴리스나 에셋이 없으면 원본 그대로."""
    repo, asset = item.get("source_repo"), item.get("source_asset")
    if not repo or not asset or not release:
        return item
    found = next((a for a in release.get("assets", []) if a.get("name") == asset), None)
    if not found:
        return item
    return {
        **item,
        "version": _tag_version(release.get("tag_name") or "") or item.get("version", ""),
        "filename": asset,
        "size": int(found.get("size") or 0),
        "content_type": "application/octet-stream",
        "sha256": "",  # 외부 빌드라 허브는 해시를 모른다
        "download_url": _linked_download_url(repo, asset),
        "uploaded_at": release.get("published_at") or item.get("uploaded_at", ""),
    }


async def _refresh_linked(items: list[dict]) -> list[dict]:
    """연동 앱들을 최신 릴리스로 갱신한 새 목록. 달라진 게 있으면 apps.json 에도 반영한다."""
    refreshed = [
        _apply_latest(it, await _fetch_latest_release(it["source_repo"], asset=it["source_asset"]))
        if it.get("source_repo") and it.get("source_asset") else it
        for it in items
    ]
    if refreshed != items:
        try:
            _save({"items": refreshed})
        except Exception as e:
            logger.warning(f"연동 앱 갱신 저장 실패: {e}")
    return refreshed


def _sanitize_meta(raw: dict, fallback_id: str = "") -> dict:
    """관리자 입력 메타데이터 정규화."""
    name = str(raw.get("name", "")).strip()[:64]
    app_id = _slugify(str(raw.get("id", "")) or fallback_id or name)
    order_raw = str(raw.get("order", ""))
    platform = str(raw.get("platform", "other")).strip().lower()
    if platform not in ("windows", "mac", "linux", "android", "ios", "other"):
        platform = "other"
    return {
        "id": app_id,
        "name": name or app_id,
        "version": str(raw.get("version", "")).strip()[:32],
        "description": str(raw.get("description", "")).strip()[:200],
        "platform": platform,
        "icon": str(raw.get("icon", "")).strip()[:4096] or "lucide:package",
        "color": str(raw.get("color", "")).strip()[:32] or "#002f6c",
        "visible": bool(raw.get("visible", False)),
        "order": int(order_raw) if order_raw.lstrip("-").isdigit() else 999,
    }


def _merge_lock(old: dict, raw: dict) -> dict:
    """PUT 의 잠금 필드 정규화. payload 에 없는 필드는 기존값 유지 (옛 관리 화면이 잠금을 풀지 않게)."""
    locked = bool(raw["locked"]) if "locked" in raw else bool(old.get("locked"))
    code = str(raw["lock_code"]).strip()[:LOCK_CODE_MAX] if "lock_code" in raw else str(old.get("lock_code") or "")
    if locked and not code:
        raise HTTPException(status_code=400, detail=f"'{old.get('name') or old.get('id')}' 잠금에는 다운로드 코드가 필요합니다")
    return {"locked": locked, "lock_code": code}


def _require_loopback(request: Request) -> None:
    host = (request.client.host if request.client else "") or ""
    if host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="이 엔드포인트는 로컬에서만 호출할 수 있습니다")


async def _store_asset(app_id: str, name: str, filename: str, content: bytes, ext: str) -> dict:
    """GitHub 릴리스에 업로드하고 파일 메타를 돌려준다."""
    # id 가 이미 app- 로 시작하면(한글 이름 자동생성 id) app-app- 중복을 피한다
    tag = app_id if app_id.startswith("app-") else f"app-{app_id}"
    try:
        release = await gh_releases.ensure_release(tag, name or app_id)
        asset = await gh_releases.upload_asset(
            int(release["id"]), filename, content, "application/octet-stream"
        )
    except gh_releases.GitHubError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {
        "filename": asset.get("name", filename),
        "size": len(content),
        "content_type": "application/octet-stream",
        "sha256": hashlib.sha256(content).hexdigest(),
        "release_tag": tag,
        "release_id": int(release["id"]),
        "asset_id": int(asset["id"]),
        "download_url": asset.get("browser_download_url", ""),
        "uploaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def _upsert(item: dict) -> int:
    """apps.json 에 병합 저장. 반환값은 전체 개수."""
    data = _load()
    items = data.get("items", [])
    for i, existing in enumerate(items):
        if existing.get("id") == item["id"]:
            # 옛 에셋 id 는 호출부가 이미 정리했다고 가정 — 다운로드 카운트·순서는 이어받는다
            item["downloads"] = existing.get("downloads", 0)
            item["order"] = existing.get("order", item.get("order", 999))
            items[i] = item
            break
    else:
        item["downloads"] = 0
        item["order"] = len(items) + 1
        items.append(item)
    _save({"items": items})
    return len(items)


# ── 조회 ──────────────────────────────────────────────

@router.get("/api/apps")
async def get_apps(request: Request, all: int = 0):
    data = _load()
    items = await _refresh_linked(data.get("items", []))
    if all:
        require_admin(request, None)
        items_sorted = sorted(items, key=lambda x: (x.get("order", 999), x.get("id", "")))
        return {"items": items_sorted, "repo": gh_releases.repo(), "max_upload_mb": MAX_UPLOAD_BYTES // (1024 * 1024)}
    visible = [_public_view(x) for x in items if x.get("visible")]
    visible.sort(key=lambda x: (x.get("order", 999), x.get("id", "")))
    return {"items": visible}


@router.get("/api/apps/_status")
async def apps_status(request: Request):
    """배포 저장소가 존재하는지 / 공개 여부 — 관리 UI 진단용.

    비공개도 정상이다 (2026-09-28 부터 app-releases 는 비공개): 다운로드는 백엔드가
    GITHUB_TOKEN 으로 에셋 서명 URL 을 받아 넘기므로 사이트 [받기] 로만 받아진다.
    """
    require_admin(request, None)
    try:
        st = await gh_releases.repo_status()
    except gh_releases.GitHubError as e:
        return {"ok": False, "error": str(e), "repo": gh_releases.repo()}
    st["ok"] = bool(st["exists"])
    if not st["exists"]:
        st["error"] = "배포 저장소가 없습니다"
    return st


# ── 업로드 ────────────────────────────────────────────

@router.post("/api/apps/upload")
async def upload_app(
    request: Request,
    file: UploadFile = File(...),
    name: str = Form(""),
    app_id: str = Form(""),
    version: str = Form(""),
    description: str = Form(""),
    platform: str = Form(""),
    icon: str = Form(""),
    color: str = Form(""),
    visible: str = Form("true"),
    locked: str = Form(""),
    lock_code: str = Form(""),
    replace: str = Form(""),
):
    require_admin(request, None)
    is_replace = str(replace).strip().lower() in ("true", "1", "on", "yes")

    ext = _check_ext(_file_ext(file.filename or ""))

    # 스트리밍으로 읽으면서 크기 초과를 조기에 잡는다 (거대 바디를 메모리에 다 올리지 않음)
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"파일이 너무 큽니다 (최대 {MAX_UPLOAD_BYTES // (1024*1024)}MB). "
                    "더 큰 파일은 맥에서 upload-app.py 로 올려주세요."
                ),
            )
        chunks.append(chunk)
    content = b"".join(chunks)
    if not content:
        raise HTTPException(status_code=400, detail="빈 파일입니다")

    meta = _sanitize_meta(
        {
            "id": app_id,
            "name": name,
            "version": version,
            "description": description,
            "platform": platform or PLATFORM_BY_EXT.get(ext, "other"),
            "icon": icon,
            "color": color,
            "visible": str(visible).lower() not in ("false", "0", ""),
        },
        fallback_id=_ascii_stem(file.filename or ""),
    )
    if is_replace and not app_id.strip():
        raise HTTPException(status_code=400, detail="교체할 앱 id 가 필요합니다")
    lock = _prepare_upload(meta["id"], is_replace, _form_lock(locked, lock_code))
    filename = _build_filename(file.filename or "", meta["id"], ext)

    await _delete_old_asset(meta["id"])
    meta.update(await _store_asset(meta["id"], meta["name"], filename, content, ext))
    meta.update(lock)
    count = _upsert(meta)
    return {"ok": True, "item": meta, "count": count}


@router.post("/api/apps/upload-local")
async def upload_app_local(request: Request, body: dict):
    """로컬 파일 경로로 업로드 — CF 터널 100MB 제한 우회용 (loopback 전용)."""
    _require_loopback(request)
    require_admin(request, body)

    src = str(body.get("path", "")).strip()
    if not src:
        raise HTTPException(status_code=400, detail="path 필드가 필요합니다")
    p = Path(os.path.expanduser(src)).resolve()
    if not p.is_file():
        raise HTTPException(status_code=400, detail=f"파일을 찾을 수 없습니다: {p}")

    ext = _check_ext(_file_ext(p.name))
    content = p.read_bytes()
    if not content:
        raise HTTPException(status_code=400, detail="빈 파일입니다")

    meta = _sanitize_meta(
        {**body, "platform": body.get("platform") or PLATFORM_BY_EXT.get(ext, "other")},
        fallback_id=_ascii_stem(p.name),
    )
    lock = _prepare_upload(meta["id"], bool(body.get("replace")), {k: body[k] for k in ("locked", "lock_code") if k in body})
    filename = _build_filename(p.name, meta["id"], ext)
    await _delete_old_asset(meta["id"])
    meta.update(await _store_asset(meta["id"], meta["name"], filename, content, ext))
    meta.update(lock)
    count = _upsert(meta)
    return {"ok": True, "item": meta, "count": count}


def _form_lock(locked: str, lock_code: str) -> dict:
    """업로드 폼의 잠금 입력 → _merge_lock 용 dict. 빈 칸은 '안 보냄'(기존값 유지)."""
    raw: dict = {}
    if str(locked).strip():
        raw["locked"] = str(locked).strip().lower() in ("true", "1", "on", "yes")
    if str(lock_code).strip():
        raw["lock_code"] = lock_code
    return raw


def _prepare_upload(app_id: str, replace: bool, lock_raw: dict) -> dict:
    """업로드 직전 검증. 교체면 기존 앱이 있어야 하고 GitHub 연동 앱은 거부. 반환 = 잠금 필드."""
    existing = next((x for x in _load().get("items", []) if x.get("id") == app_id), None)
    if replace and not existing:
        raise HTTPException(status_code=404, detail=f"교체할 앱이 없습니다: {app_id}")
    if existing and existing.get("source_repo"):
        raise HTTPException(
            status_code=400,
            detail="GitHub 연동 앱은 파일을 올려 바꿀 수 없습니다 — 연동 저장소에 새 릴리스를 올리세요",
        )
    return _merge_lock(existing or {"id": app_id}, lock_raw)


async def _delete_old_asset(app_id: str) -> None:
    """같은 id 로 재업로드할 때 옛 에셋을 지운다 (릴리스 안에 잔재가 쌓이지 않게)."""
    for it in _load().get("items", []):
        if it.get("id") == app_id and it.get("asset_id"):
            try:
                await gh_releases.delete_asset(int(it["asset_id"]))
            except Exception as e:
                logger.warning(f"옛 에셋 삭제 실패 app_id={app_id}: {e}")
            return


# ── 메타 편집 / 삭제 ──────────────────────────────────

@router.put("/api/apps")
async def put_apps(request: Request, body: dict):
    """이름/설명/순서/공개여부 편집.

    **누락으로는 삭제되지 않는다** — payload 에 없는 앱은 그대로 남는다.
    파일이 딸린 레코드를 목록 누락만으로 지우면 GitHub 릴리스가 고아로 남기 때문에,
    삭제는 DELETE /api/apps/{id} 한 경로로만 한다. 파일 정보도 서버 값을 유지한다.
    """
    require_admin(request, body)
    raw_items = body.get("items")
    if not isinstance(raw_items, list):
        raise HTTPException(status_code=400, detail="items 배열 필요")

    existing = _load().get("items", [])
    current = {x.get("id"): x for x in existing}

    cleaned = []
    seen = set()
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        meta = _sanitize_meta({k: v for k, v in raw.items() if k in EDITABLE_FIELDS})
        old = current.get(meta["id"])
        if not old or meta["id"] in seen:
            # 파일 없는 항목은 만들 수 없다 (업로드로만 생성)
            continue
        seen.add(meta["id"])
        lock = _merge_lock(old, raw)
        cleaned.append({**meta, **lock, **{k: old.get(k) for k in FILE_FIELDS | LINK_FIELDS if k in old}})

    # payload 에 안 실린 기존 앱은 뒤에 그대로 보존
    for old in existing:
        if old.get("id") not in seen:
            cleaned.append(old)

    for i, x in enumerate(cleaned):
        x["order"] = i + 1

    _save({"items": cleaned})
    return {"ok": True, "count": len(cleaned), "updated": len(seen)}


@router.delete("/api/apps/{app_id}")
async def delete_app(app_id: str, request: Request):
    require_admin(request, None)
    data = _load()
    items = data.get("items", [])
    target = next((x for x in items if x.get("id") == app_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="해당 앱이 없습니다")

    # GitHub 릴리스 통째로 삭제 (에셋 포함). 실패해도 메타는 지운다.
    if target.get("release_id"):
        try:
            await gh_releases.delete_release(int(target["release_id"]))
        except Exception as e:
            logger.warning(f"릴리스 삭제 실패 app_id={app_id}: {e}")

    remaining = [x for x in items if x.get("id") != app_id]
    for i, x in enumerate(remaining):
        x["order"] = i + 1
    _save({"items": remaining})
    return {"ok": True, "count": len(remaining)}


# ── 외부 릴리스 연동 (파일 업로드 없이 등록) ─────────────

async def link_release_source(raw: dict) -> dict:
    """앱을 외부 GitHub 저장소의 최신 릴리스에 연결한다 (엔드포인트와 일회성 스크립트가 공유).

    - 비공개 source_repo 도 된다 — 다운로드 때 토큰으로 서명 URL 을 받아 넘긴다 (잠금과 함께 쓰는 용도)
    - 등록 시점에 최신 릴리스와 에셋이 실제로 있는지 확인한다 (없으면 400)
    - 같은 id 로 올려둔 app-releases 파일이 있으면 그 릴리스는 지운다 (고아 방지) · 다운로드 수는 승계
    """
    repo = str(raw.get("source_repo", "")).strip()
    asset = str(raw.get("source_asset", "")).strip()
    if not LINK_REPO_RE.match(repo):
        raise HTTPException(status_code=400, detail="source_repo 는 owner/repo 형식이어야 합니다")
    if not LINK_ASSET_RE.match(asset):
        raise HTTPException(status_code=400, detail="source_asset 은 ASCII 파일명이어야 합니다 (예: MyApp.zip)")

    release = await _fetch_latest_release(repo, force=True, asset=asset)
    if not release:
        raise HTTPException(status_code=400, detail=f"{repo} 에 최신 릴리스가 없거나 조회할 수 없습니다")
    if not any(a.get("name") == asset for a in release.get("assets", [])):
        names = ", ".join(a.get("name", "") for a in release.get("assets", [])) or "(없음)"
        raise HTTPException(
            status_code=400,
            detail=f"최신 릴리스 {release.get('tag_name')} 에 {asset} 이(가) 없습니다 — 에셋: {names}",
        )

    app_id = _slugify(str(raw.get("id", "")) or _ascii_stem(asset))
    existing = next((x for x in _load().get("items", []) if x.get("id") == app_id), None)
    base = {k: existing[k] for k in EDITABLE_FIELDS if existing and k in existing}
    overrides = {k: v for k, v in raw.items() if k in EDITABLE_FIELDS and v not in (None, "")}
    merged = {**base, **overrides, "id": app_id}
    merged.setdefault("visible", True)
    meta = _sanitize_meta(merged, fallback_id=app_id)
    lock = _merge_lock(existing or {"id": app_id}, raw)  # 링크 body 로도 잠금 설정 가능, 없으면 기존값

    if existing and existing.get("release_id"):
        try:
            await gh_releases.delete_release(int(existing["release_id"]))
        except Exception as e:
            logger.warning(f"연동 전환 중 옛 릴리스 삭제 실패 app_id={app_id}: {e}")

    private = await _repo_is_private(repo)
    item = _apply_latest(
        {**meta, **lock, "source_repo": repo, "source_asset": asset, "source_private": private}, release
    )
    count = _upsert(item)
    return {"ok": True, "item": item, "count": count}


@router.post("/api/apps/link")
async def link_app(request: Request, body: dict):
    """파일 업로드 없이 외부 GitHub 저장소의 최신 릴리스를 앱으로 등록하거나, 업로드 앱을 연동으로 전환."""
    require_admin(request, body)
    return await link_release_source(body)


# ── 다운로드 ──────────────────────────────────────────

# 잠금 코드 무차별 대입 방어 — 4자리 코드라 IP 단위로 조인다 (관리자 게이트와 카운터 분리)
_DL_FAIL_WINDOW = 300
_DL_FAIL_LIMIT = 8
_DL_LOCKOUT = 900
_dl_failures: dict[str, list[float]] = {}
_dl_locked: dict[str, float] = {}


def _dl_ip(request: Request) -> str:
    return (request.client.host if request.client else "") or "unknown"


def _dl_lockout_left(request: Request) -> int:
    until = _dl_locked.get(_dl_ip(request), 0)
    return max(0, int(until - time.time()))


def _dl_record_failure(request: Request) -> None:
    ip, now = _dl_ip(request), time.time()
    hits = [t for t in _dl_failures.get(ip, []) if now - t < _DL_FAIL_WINDOW] + [now]
    _dl_failures[ip] = hits
    if len(hits) >= _DL_FAIL_LIMIT:
        _dl_locked[ip] = now + _DL_LOCKOUT
        _dl_failures.pop(ip, None)
        logger.warning(f"apps download: {ip} 코드 실패 {_DL_FAIL_LIMIT}회 → {_DL_LOCKOUT}s 잠금")


def _find_visible(app_id: str) -> tuple[list[dict], dict | None]:
    items = _load().get("items", [])
    return items, next((x for x in items if x.get("id") == app_id and x.get("visible")), None)


async def _resolve_url(item: dict) -> str:
    if item.get("source_private") and item.get("source_repo") and item.get("source_asset"):
        return await _private_asset_url(item["source_repo"], item["source_asset"])
    if item.get("asset_id") and not item.get("source_repo"):
        # 업로드 앱 — 교체 직후 옛 파일 캐시를 피하려고 에셋 id 로 받는다. 실패하면 고정 주소로
        return await _asset_location(gh_releases.repo(), int(item["asset_id"])) or _download_target(item)
    return _download_target(item)


def _count(items: list[dict], item: dict) -> None:
    try:
        item["downloads"] = int(item.get("downloads", 0)) + 1
        _save({"items": items})
    except Exception as e:
        logger.warning(f"다운로드 카운트 갱신 실패 {item.get('id')}: {e}")


def _lock_page(item: dict, error: str = "", status: int = 200) -> HTMLResponse:
    """잠긴 앱 코드 입력 페이지 — 허브·공유 링크의 [받기] 가 여기로 온다."""
    name = html.escape(str(item.get("name") or item.get("id")))
    color = html.escape(str(item.get("color") or "#002f6c"))
    err = f'<p class="err">{html.escape(error)}</p>' if error else ""
    body = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>{name} · 다운로드 코드</title><style>
:root{{color-scheme:light dark}}body{{margin:0;min-height:100vh;display:grid;place-items:center;
font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;background:#f4f5f7;color:#111}}
@media (prefers-color-scheme:dark){{body{{background:#111;color:#eee}}.box{{background:#1c1c1e!important}}input{{background:#2c2c2e;color:#eee;border-color:#444!important}}}}
.box{{background:#fff;padding:28px 24px;border-radius:16px;width:min(340px,calc(100vw - 32px));box-shadow:0 8px 30px rgba(0,0,0,.12);text-align:center}}
h1{{font-size:18px;margin:0 0 6px}}p{{margin:0 0 16px;font-size:14px;opacity:.75}}
input{{width:100%;box-sizing:border-box;font-size:22px;letter-spacing:6px;text-align:center;padding:12px;border:1px solid #ccc;border-radius:10px;margin-bottom:12px}}
button{{width:100%;padding:13px;border:0;border-radius:10px;background:{color};color:#fff;font-size:16px;font-weight:600;cursor:pointer}}
.err{{color:#e5484d;opacity:1;font-weight:600}}</style></head><body>
<form class="box" method="post"><h1>🔒 {name}</h1><p>다운로드 코드를 입력하세요</p>{err}
<input name="code" type="password" autocomplete="off" autofocus required maxlength="{LOCK_CODE_MAX}">
<button type="submit">받기</button></form></body></html>"""
    return HTMLResponse(body, status_code=status, headers={"Cache-Control": "no-store"})


@router.get("/api/apps/{app_id}/download")
async def download_app(app_id: str):
    """카운트 증가 후 GitHub 로 302 — 트래픽은 GitHub 가 감당. 잠긴 앱은 코드 입력 페이지."""
    items, target = _find_visible(app_id)
    if not target:
        raise HTTPException(status_code=404, detail="해당 앱이 없습니다")
    if _is_locked(target):
        return _lock_page(target)
    url = await _resolve_url(target)
    if not url:
        raise HTTPException(status_code=502, detail="다운로드 주소를 만들 수 없습니다")
    _count(items, target)
    return RedirectResponse(url=url, status_code=302)


@router.post("/api/apps/{app_id}/download")
async def download_locked_app(app_id: str, request: Request, code: str = Form("")):
    """잠긴 앱 — 코드가 맞으면 GitHub 로 303 (브라우저가 GET 으로 따라가 바로 받는다)."""
    items, target = _find_visible(app_id)
    if not target:
        raise HTTPException(status_code=404, detail="해당 앱이 없습니다")
    if _is_locked(target):
        left = _dl_lockout_left(request)
        if left:
            return _lock_page(target, f"시도가 너무 많습니다. {left // 60 + 1}분 후 다시 해주세요.", 429)
        if not hmac.compare_digest(code.strip().encode(), str(target.get("lock_code")).encode()):
            _dl_record_failure(request)
            return _lock_page(target, "코드가 맞지 않습니다", 401)
        _dl_failures.pop(_dl_ip(request), None)
    url = await _resolve_url(target)
    if not url:
        return _lock_page(target, "지금은 파일을 가져올 수 없습니다. 잠시 후 다시 해주세요.", 502)
    _count(items, target)
    return RedirectResponse(url=url, status_code=303)
