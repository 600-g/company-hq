"""
시스템 운영 엔드포인트 — main.py 분할 6차 (안정화 2026-05-08).

이동:
- /api/standby/on, /off, GET   — 스탠바이 모드 (claude_runner.STANDBY_FLAG 직접 토글)
- /api/internal/notify-update  — post-commit hook 푸시 알림 (10분 dedup)
- /api/budget, /api/budget/reset — 토큰 예산 (claude_runner 위임)
- /api/staff/stats             — 무료 LLM 사용 비율 (staff_engine 위임)

자체 완결: notify dedup 캐시는 모듈 내부.
"""
from __future__ import annotations

import logging
import os
import signal
import time

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(tags=["system"])


# ── 스탠바이 모드 ──────────────────────────────────────────────
@router.post("/api/standby/on")
async def standby_on():
    """스탠바이 모드 ON — 에이전트 실행 중단 (서버는 유지)"""
    import claude_runner as _cr
    _cr.STANDBY_FLAG = True
    for team_id, pid in list(_cr.AGENT_PIDS.items()):
        try:
            pgid = os.getpgid(pid)
            os.killpg(pgid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass
    _cr.AGENT_PIDS.clear()
    return {"ok": True, "standby": True, "message": "스탠바이 모드 ON — 에이전트 실행이 중단됩니다"}


@router.post("/api/standby/off")
async def standby_off():
    """스탠바이 모드 OFF — 에이전트 실행 재개"""
    import claude_runner as _cr
    _cr.STANDBY_FLAG = False
    return {"ok": True, "standby": False, "message": "스탠바이 모드 OFF — 에이전트 실행 재개"}


@router.get("/api/standby")
async def standby_status():
    """스탠바이 모드 상태 조회"""
    import claude_runner as _cr
    return {"ok": True, "standby": _cr.STANDBY_FLAG}


# ── post-commit hook 알림 ────────────────────────────────────
_LAST_NOTIFIED_SHA: dict[str, float] = {}


@router.post("/api/internal/notify-update")
async def internal_notify_update(body: dict) -> dict:
    """post-commit hook 이 호출 — 새 commit push 직후 OS 알림 발송.
    같은 sha 10분 내 중복 차단. 알림 클릭 시 /hub?openUpdate=1 → 모달 자동 열림.
    """
    sha = str(body.get("sha", ""))[:64]
    if not sha:
        return {"ok": False, "error": "sha 필요"}
    short = str(body.get("short_sha", ""))[:12] or sha[:9]
    subject = str(body.get("subject", ""))[:200] or f"새 커밋 {short}"
    now = time.time()
    last = _LAST_NOTIFIED_SHA.get(sha, 0)
    if now - last < 600:
        return {"ok": True, "skipped": "dedup"}
    _LAST_NOTIFIED_SHA[sha] = now
    try:
        from push_notifications import send_push
        send_push(
            title=f"🆕 새 업데이트",
            body=f"{subject}\n탭하면 업데이트 모달 열림",
            tag=f"update-{short}",
            url="/hub?openUpdate=1",
            team_id="",
        )
        return {"ok": True, "sha": short}
    except Exception as e:
        logger.warning("[notify-update] 실패: %s", e)
        return {"ok": False, "error": str(e)}


# ── 토큰 예산 ─────────────────────────────────────────────────
@router.get("/api/budget")
async def budget_status():
    """토큰 예산 현황 + 무료 LLM 사용 통계 (Claude/Gemini/Gemma 분리)"""
    from claude_runner import get_budget_status
    base = get_budget_status()
    try:
        from free_llm import get_usage as _free_usage
        free = _free_usage()
    except Exception:
        free = {}
    return {"ok": True, **base, "free_llm_usage": free}


@router.post("/api/budget/reset")
async def budget_reset():
    """토큰 예산 리셋 (두근 전용)"""
    from claude_runner import reset_budget
    msg = reset_budget()
    return {"ok": True, "message": msg}


# ── 스태프 통계 ───────────────────────────────────────────────
@router.get("/api/staff/stats")
async def staff_stats():
    """스태프 누적 사용 통계 — 무료 LLM 비율, Claude 절감 추정, 의도/언어 분포"""
    try:
        from staff_engine import get_stats
        s = get_stats()
        total = s.get("total_handled", 0) or 1
        provider = s.get("by_provider", {})
        free_count = sum(v for k, v in provider.items() if k != "claude_fallback")
        return {
            "ok": True,
            "total_handled": s.get("total_handled", 0),
            "free_llm_ratio": round(free_count / total * 100, 1),
            "claude_fallback_count": provider.get("claude_fallback", 0),
            "claude_tokens_saved": s.get("claude_tokens_saved_estimate", 0),
            "by_provider": provider,
            "by_intent": s.get("by_intent", {}),
            "by_language": s.get("by_language", {}),
            "last_updated": s.get("last_updated"),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}
