"""
admin patch-log / release-notes 엔드포인트 — main.py 분할 1차 (안정화 2026-05-08).

분리 이유:
- main.py 4681줄 → 단일 거대 파일 = 매 fix 사이클 근원
- patch-log 관련 엔드포인트는 git log 처리 외 main.py 상태와 결합도 0
- commit parsing 헬퍼(_RELEASE_TYPE_MAP/_SCOPE_MAP/_TITLE_REPLACEMENTS/_parse_commit_subject)
  도 함께 이동 → 자체 완결

엔드포인트:
- GET /api/admin/patch-log         — 책장 회독
- GET /api/admin/patch-log/{sha}   — 단일 commit 상세
- GET /api/admin/release-notes     — 패치노트 (production → HEAD)
"""
from __future__ import annotations

import json
import logging
import os
import re as _re
import subprocess
from datetime import datetime, timedelta

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])

# ── 상수 ────────────────────────────────────────────────────────────────
_HQ_ROOT = os.path.expanduser("~/Developer/my-company/company-hq")
PATCH_LOG_PATH = os.path.join(os.path.dirname(__file__), "..", "patch_log.jsonl")

# Conventional commit 카테고리 → 한국어 라벨/이모지
_RELEASE_TYPE_MAP = {
    "fix":       {"emoji": "🐛", "label": "버그 수정"},
    "feat":      {"emoji": "✨", "label": "기능 추가"},
    "perf":      {"emoji": "⚡", "label": "성능 개선"},
    "refactor":  {"emoji": "🔧", "label": "코드 정리"},
    "ux":        {"emoji": "🎨", "label": "UX 개선"},
    "style":     {"emoji": "💄", "label": "스타일"},
    "docs":      {"emoji": "📝", "label": "문서"},
    "chore":     {"emoji": "🧹", "label": "점검"},
    "test":      {"emoji": "🧪", "label": "테스트"},
    "build":     {"emoji": "📦", "label": "빌드"},
    "ci":        {"emoji": "🤖", "label": "CI"},
    "security":  {"emoji": "🔒", "label": "보안"},
    "revert":    {"emoji": "⏪", "label": "되돌림"},
}

# scope 영어 → 한국어 매핑 (사용자 친화 라벨)
_SCOPE_MAP = {
    "deploy": "배포", "deploy-ux": "배포", "release-notes": "릴리즈노트",
    "critical": "긴급", "auth": "인증", "ux": "UX", "memory": "메모리", "db": "DB",
    "isolation": "격리", "orchestration": "오케스트레이션", "auto-recovery": "자동복구",
    "agents": "에이전트", "retry": "재시도",
    "frontend": "프론트엔드", "backend": "백엔드", "design": "디자인",
    "qa": "QA", "content": "콘텐츠", "cpo": "CPO", "staff": "스태프",
    "phaser": "Phaser", "websocket": "WS", "ws": "WS",
    "api": "API", "ui": "UI", "build": "빌드", "config": "설정",
    "docs": "문서", "i18n": "다국어", "perf": "성능", "security": "보안",
    "session": "세션", "chat": "채팅", "memory-optimize": "메모리정리",
    "version": "버전", "legacy": "레거시", "sandbox": "샌드박스", "policy": "정책",
}

# 패치노트 본문 흔한 영어 → 한국어 자동 치환
_TITLE_REPLACEMENTS = [
    ("reload", "새로고침"), ("Reload", "새로고침"),
    ("propagation", "전파"), ("cooldown", "대기시간"),
    ("graceful", "정상"), ("hydration", "초기화"),
    ("dispatch", "디스패치"), ("rollback", "롤백"),
    ("session", "세션"), ("hook", "훅"),
    ("race", "경합"), ("backoff", "재시도 지연"),
    ("polling", "폴링"), ("preview", "미리보기"),
    ("Cloudflare Pages", "CF 페이지"), ("CF edge", "CF 엣지"),
]


def _parse_commit_subject(h: str, subject: str) -> dict:
    """ 'feat(scope): title — 부연' → {type, emoji, label, scope, scope_ko, title}.
    공식 패치노트용 정제: em-dash 이후 자연어 부연 제거, 영어 scope 한국어 매핑.
    """
    m = _re.match(r"^(\w+)(\([^)]+\))?\s*:\s*(.+)$", subject)
    if m:
        commit_type = m.group(1).lower()
        scope = (m.group(2) or "").strip("()")
        title = m.group(3).strip()
    else:
        commit_type = "other"
        scope = ""
        title = subject.strip()
    info = _RELEASE_TYPE_MAP.get(commit_type, {"emoji": "📌", "label": "기타"})
    title = title.split("\n")[0]
    for sep in [" — ", " -- ", "— ", " · "]:
        if sep in title:
            title = title.split(sep)[0].strip()
            break
    for en, ko in _TITLE_REPLACEMENTS:
        title = title.replace(en, ko)
    title = title.rstrip(".").strip()
    scope_ko = _SCOPE_MAP.get(scope.lower(), scope)
    return {
        "hash": h,
        "type": commit_type,
        "emoji": info["emoji"],
        "label": info["label"],
        "scope": scope_ko,
        "scope_raw": scope,
        "title": title[:100],
    }


# ── 엔드포인트 ──────────────────────────────────────────────────────────

@router.get("/patch-log")
async def admin_patch_log(
    limit: int = 100,
    since_sha: str = "",
    since_days: int = 0,
    type: str = "",
    scope: str = "",
    group: str = "type",
) -> dict:
    """git post-commit hook 이 기록한 patch_log.jsonl 회독."""
    if not os.path.exists(PATCH_LOG_PATH):
        return {"ok": True, "total": 0, "rows": [], "groups": {}, "note": "patch_log.jsonl 없음 — bash scripts/install_hooks.sh 실행"}
    rows: list[dict] = []
    try:
        with open(PATCH_LOG_PATH, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    rows.append(json.loads(line))
                except Exception:
                    continue
    except Exception as e:
        return {"ok": False, "error": str(e)}

    if since_sha:
        idx = next((i for i, r in enumerate(rows) if (r.get("sha") or "").startswith(since_sha) or r.get("short_sha") == since_sha), -1)
        if idx >= 0:
            rows = rows[idx + 1:]

    if since_days > 0:
        cutoff = datetime.utcnow() - timedelta(days=since_days)
        filtered: list[dict] = []
        for r in rows:
            ts_str = (r.get("ts") or "").replace("Z", "")
            try:
                ts_dt = datetime.fromisoformat(ts_str)
                if ts_dt >= cutoff:
                    filtered.append(r)
            except Exception:
                filtered.append(r)
        rows = filtered

    if type:
        rows = [r for r in rows if (r.get("type") or "").lower() == type.lower()]
    if scope:
        rows = [r for r in rows if (r.get("scope") or "").lower() == scope.lower()]

    total = len(rows)
    rows = rows[-limit:]
    rows = list(reversed(rows))

    groups: dict[str, list[dict]] = {}
    if group == "type":
        for r in rows:
            t = (r.get("type") or "other").lower()
            info = _RELEASE_TYPE_MAP.get(t, {"emoji": "📌", "label": "기타"})
            key = f"{info['emoji']} {info['label']}"
            groups.setdefault(key, []).append(r)
    elif group == "scope":
        for r in rows:
            sc = (r.get("scope") or "").lower()
            key = _SCOPE_MAP.get(sc, sc) or "(미분류)"
            groups.setdefault(key, []).append(r)

    return {"ok": True, "total": total, "rows": rows, "groups": groups}


@router.get("/patch-log/{sha}")
async def admin_patch_log_detail(sha: str) -> dict:
    """단일 commit 상세 — 책장 클릭 시 그때 무엇을 했고 어느 파일이 변경됐는지 전부 표시."""
    if not os.path.exists(PATCH_LOG_PATH):
        return {"ok": False, "error": "patch_log.jsonl 없음"}
    target: dict | None = None
    try:
        with open(PATCH_LOG_PATH, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    r = json.loads(line)
                except Exception:
                    continue
                if (r.get("sha") or "").startswith(sha) or r.get("short_sha") == sha:
                    target = r
                    break
    except Exception as e:
        return {"ok": False, "error": str(e)}
    if not target:
        return {"ok": False, "error": "sha 일치 commit 없음"}
    try:
        full_sha = target.get("sha", sha)
        cp = subprocess.run(
            ["git", "show", "--stat", "--pretty=format:%B", full_sha],
            cwd=_HQ_ROOT, capture_output=True, text=True, timeout=8,
        )
        if cp.returncode == 0:
            target["full_text"] = cp.stdout[:8000]
    except Exception:
        pass
    return {"ok": True, "row": target}


@router.get("/release-notes")
async def admin_release_notes(from_commit: str = "") -> dict:
    """production build commit 부터 HEAD 까지 commit 들을 카테고리별 패치노트로 변환."""
    if not from_commit:
        return {"ok": False, "error": "from_commit 파라미터 필요"}
    try:
        out = subprocess.run(
            ["git", "log", f"{from_commit}..HEAD", "--format=%h|%s"],
            cwd=_HQ_ROOT, capture_output=True, text=True, timeout=5,
        )
        if out.returncode != 0:
            out = subprocess.run(
                ["git", "log", "-10", "--format=%h|%s"],
                cwd=_HQ_ROOT, capture_output=True, text=True, timeout=5,
            )
        commits: list[dict] = []
        for line in out.stdout.strip().split("\n"):
            if "|" not in line:
                continue
            h, s = line.split("|", 1)
            commits.append(_parse_commit_subject(h.strip(), s.strip()))
        groups: dict[str, dict] = {}
        for c in commits:
            key = c["type"]
            if key not in groups:
                groups[key] = {
                    "type": key,
                    "emoji": c["emoji"],
                    "label": c["label"],
                    "items": [],
                }
            groups[key]["items"].append({
                "hash": c["hash"],
                "title": c["title"],
                "scope": c["scope"],
            })
        priority = {"fix": 0, "feat": 1, "perf": 2, "ux": 3, "refactor": 4, "security": 5}
        ordered = sorted(groups.values(), key=lambda g: (priority.get(g["type"], 10), g["type"]))
        return {
            "ok": True,
            "from_commit": from_commit,
            "total_commits": len(commits),
            "groups": ordered,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}
