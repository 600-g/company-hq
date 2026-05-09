"""
Cloudflare DNS 자동화 — 신규 에이전트 사이트의 서브도메인 자동 발급/제거.

설정 (한 번만):
1. dash.cloudflare.com → My Profile → API Tokens → Create Token
2. 템플릿: "Edit zone DNS" + Zone Resources = 600g.net
3. .env 에 추가:
   CF_TOKEN=<발급된 토큰>
   CF_ZONE_NAME=600g.net  # (선택, 기본값 600g.net)

자동 흐름:
- add_subdomain("puzzle") → puzzle.600g.net CNAME → 600-g.github.io 자동 등록
- delete_subdomain("puzzle") → 레코드 자동 제거 (에이전트 삭제 시)

zone_id 는 첫 호출 시 토큰으로 자동 조회 + 메모리 캐시.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import requests

logger = logging.getLogger(__name__)

CF_API = "https://api.cloudflare.com/client/v4"
DEFAULT_TARGET = "600-g.github.io"  # GitHub Pages 기본 타겟

# 카테고리 정의 — 사용자가 토큰을 라벨링해서 관리
TOKEN_CATEGORIES = ("web", "game", "other")

# 서브도메인 키워드 → 추천 카테고리 매핑 (자동 추천용)
CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "game": ("puzzle", "game", "play", "arcade", "rpg", "quiz", "tetris", "match"),
    "web": ("blog", "shop", "exam", "map", "doc", "wiki", "portfolio", "lab", "study", "edu"),
    "other": ("trading", "bot", "api", "admin", "dash", "cron", "tool", "mon", "ops"),
}

# zone_id 캐시 — 같은 zone_name 재조회 방지
_zone_id_cache: dict[str, str] = {}


def _get_token(category: str | None = None) -> str:
    """카테고리별 토큰 우선, 없으면 CF_TOKEN 폴백.

    category="web" → CF_TOKEN_WEB → CF_TOKEN
    category=None → CF_TOKEN
    """
    if category:
        cat = category.strip().lower()
        if cat in TOKEN_CATEGORIES:
            scoped = os.getenv(f"CF_TOKEN_{cat.upper()}", "").strip()
            if scoped:
                return scoped
    return os.getenv("CF_TOKEN", "").strip()


def suggest_category(subdomain: str) -> str:
    """서브도메인 이름에서 카테고리 추정. 매칭 없으면 'web' 기본."""
    s = subdomain.lower().strip()
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if any(k in s for k in keywords):
            return cat
    return "web"


def list_token_status() -> dict[str, dict]:
    """각 카테고리별 토큰 + 폴백 상태. /api/settings/tokens 에서 사용."""
    status: dict[str, dict] = {}
    for cat in TOKEN_CATEGORIES:
        v = os.getenv(f"CF_TOKEN_{cat.upper()}", "").strip()
        status[cat] = {
            "configured": bool(v),
            "masked": (v[:6] + "…" + v[-4:]) if len(v) >= 12 else "",
        }
    fallback = os.getenv("CF_TOKEN", "").strip()
    status["_fallback"] = {
        "configured": bool(fallback),
        "masked": (fallback[:6] + "…" + fallback[-4:]) if len(fallback) >= 12 else "",
    }
    return status


def _get_zone_name() -> str:
    return os.getenv("CF_ZONE_NAME", "600g.net").strip()


def _headers(category: str | None = None) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_get_token(category)}",
        "Content-Type": "application/json",
    }


def get_zone_id(zone_name: str | None = None, category: str | None = None) -> str | None:
    """Zone 이름으로 zone_id 조회 (캐시됨). 토큰 또는 zone 없으면 None."""
    zone = zone_name or _get_zone_name()
    if zone in _zone_id_cache:
        return _zone_id_cache[zone]
    if not _get_token(category):
        logger.warning("[cf_dns] CF_TOKEN%s 미설정", f"_{category.upper()}" if category else "")
        return None
    try:
        r = requests.get(f"{CF_API}/zones?name={zone}", headers=_headers(category), timeout=8)
        r.raise_for_status()
        result = r.json().get("result") or []
        if not result:
            logger.warning("[cf_dns] zone '%s' 못 찾음 (토큰 권한 확인)", zone)
            return None
        zone_id = result[0]["id"]
        _zone_id_cache[zone] = zone_id
        return zone_id
    except Exception as e:
        logger.warning("[cf_dns] get_zone_id 실패: %s", e)
        return None


def find_record(prefix: str, zone_name: str | None = None, category: str | None = None) -> dict | None:
    """기존 CNAME 레코드 조회. {prefix}.{zone} 매칭."""
    zone_id = get_zone_id(zone_name, category)
    if not zone_id:
        return None
    full_name = f"{prefix}.{zone_name or _get_zone_name()}"
    try:
        r = requests.get(
            f"{CF_API}/zones/{zone_id}/dns_records?name={full_name}&type=CNAME",
            headers=_headers(category), timeout=8,
        )
        r.raise_for_status()
        result = r.json().get("result") or []
        return result[0] if result else None
    except Exception as e:
        logger.warning("[cf_dns] find_record(%s) 실패: %s", prefix, e)
        return None


def add_subdomain(
    prefix: str,
    target: str = DEFAULT_TARGET,
    zone_name: str | None = None,
    proxied: bool = False,
    category: str | None = None,
) -> dict[str, Any]:
    """{prefix}.{zone} CNAME → target 추가.

    category: "web" | "game" | "other" — 카테고리별 토큰 우선 사용 (라벨링)
    proxied=False (기본): GitHub Pages 직접 (GH 가 SSL 자동 발급)
    proxied=True: CF Proxy 경유 (DDoS 방어 + 캐싱, 단 GH Pages 인증 충돌 가능)

    반환: {ok, record_id?, full_name?, url?, category_used?, error?}
    """
    if not _get_token(category):
        cat_msg = f"CF_TOKEN_{category.upper()}" if category else "CF_TOKEN"
        return {"ok": False, "error": f"{cat_msg} 미설정 (.env 또는 설정 페이지에서 추가)"}

    zone = zone_name or _get_zone_name()
    zone_id = get_zone_id(zone, category)
    if not zone_id:
        return {"ok": False, "error": f"zone '{zone}' 조회 실패 — 토큰 권한 확인"}

    full_name = f"{prefix}.{zone}"
    cat_used = category or "default"

    # 이미 있으면 skip (idempotent)
    existing = find_record(prefix, zone, category)
    if existing:
        return {
            "ok": True,
            "skipped": "이미 존재",
            "record_id": existing.get("id"),
            "full_name": full_name,
            "url": f"https://{full_name}",
            "category_used": cat_used,
        }

    payload = {
        "type": "CNAME",
        "name": prefix,
        "content": target,
        "ttl": 1,  # auto
        "proxied": proxied,
    }
    try:
        r = requests.post(
            f"{CF_API}/zones/{zone_id}/dns_records",
            headers=_headers(category), json=payload, timeout=8,
        )
        data = r.json()
        if not data.get("success"):
            return {"ok": False, "error": str(data.get("errors") or data)[:300]}
        record = data.get("result") or {}
        logger.info("[cf_dns] %s CNAME → %s 등록 완료 (category=%s)", full_name, target, cat_used)
        return {
            "ok": True,
            "record_id": record.get("id"),
            "full_name": full_name,
            "url": f"https://{full_name}",
            "category_used": cat_used,
        }
    except Exception as e:
        return {"ok": False, "error": f"CF API 호출 실패: {e}"}


def delete_subdomain(prefix: str, zone_name: str | None = None, category: str | None = None) -> dict[str, Any]:
    """{prefix}.{zone} CNAME 레코드 제거. 없으면 OK 반환 (idempotent)."""
    if not _get_token(category):
        return {"ok": False, "error": "CF_TOKEN 미설정"}

    zone = zone_name or _get_zone_name()
    zone_id = get_zone_id(zone, category)
    if not zone_id:
        return {"ok": False, "error": f"zone '{zone}' 조회 실패"}

    existing = find_record(prefix, zone, category)
    if not existing:
        return {"ok": True, "skipped": "없음"}

    record_id = existing["id"]
    try:
        r = requests.delete(
            f"{CF_API}/zones/{zone_id}/dns_records/{record_id}",
            headers=_headers(category), timeout=8,
        )
        if r.status_code != 200:
            return {"ok": False, "error": f"삭제 실패 status={r.status_code}"}
        logger.info("[cf_dns] %s.%s 레코드 삭제 완료", prefix, zone)
        return {"ok": True, "deleted_record_id": record_id}
    except Exception as e:
        return {"ok": False, "error": f"CF API 호출 실패: {e}"}


def add_cname_file_to_repo(repo_local_path: str, full_domain: str) -> dict[str, Any]:
    """GitHub Pages 가 인식하도록 repo 루트에 CNAME 파일 추가 + 자동 커밋/푸시.

    repo_local_path: 클론된 로컬 경로
    full_domain: 'puzzle.600g.net' 같은 전체 도메인
    """
    import subprocess
    if not os.path.isdir(repo_local_path):
        return {"ok": False, "error": f"경로 없음: {repo_local_path}"}
    cname_path = os.path.join(repo_local_path, "CNAME")
    try:
        with open(cname_path, "w", encoding="utf-8") as f:
            f.write(full_domain + "\n")
        # git add + commit + push
        subprocess.run(["git", "add", "CNAME"], cwd=repo_local_path, capture_output=True, timeout=5)
        subprocess.run(
            ["git", "commit", "-m", f"chore: add CNAME ({full_domain}) for GitHub Pages"],
            cwd=repo_local_path, capture_output=True, timeout=5,
        )
        push = subprocess.run(
            ["git", "push"], cwd=repo_local_path, capture_output=True, text=True, timeout=15,
        )
        if push.returncode != 0:
            return {"ok": False, "error": f"git push 실패: {push.stderr[:200]}"}
        return {"ok": True, "cname_path": cname_path, "domain": full_domain}
    except Exception as e:
        return {"ok": False, "error": str(e)}
