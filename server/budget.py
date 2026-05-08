"""
토큰 예산 관리 — main.py / claude_runner.py 분할 (안정화 2026-05-08).

분리 이유:
- claude_runner.py 1388줄 → 모델 라우팅 + runner + 예산 + 세션 혼재
- 예산 로직은 자체 완결 (~160줄) — 가장 안전한 첫 추출

공개 API (claude_runner 가 re-export):
- TOKEN_BUDGET_WINDOW / TOKEN_BUDGET_LIMIT / TOKEN_BUDGET_AUTO / TOKEN_SPIKE_*
- _read_jsonl_tokens / _get_jsonl_tokens / _log_tokens / _get_window_tokens
- _check_budget(is_auto) -> (allowed, used)
- _check_token_spike(is_auto) -> bool   (caller 가 STANDBY 토글 결정)
- reset_budget()
- get_budget_status()
- set_rate_limit_event(event)   (run_claude 가 rate_limit_event 수신 시 호출)

STANDBY_FLAG 는 claude_runner.py 에 유지 (main.py 호환):
- 외부 main.py 가 `_cr.STANDBY_FLAG = True` 로 직접 설정
- 스파이크 감지는 bool 반환만, claude_runner 가 STANDBY_FLAG 본인 토글
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

# ── 토큰 예산 상수 ────────────────────────────────────────────────
TOKEN_BUDGET_WINDOW = 3600       # 1시간 윈도우 (초)
TOKEN_BUDGET_LIMIT = 999_999_999 # 수동 실행 — 사실상 무제한 (Max 플랜 한도가 궁극적 제한)
TOKEN_BUDGET_AUTO = 5_000_000    # 자동 실행 1시간 상한 (5M)
TOKEN_SPIKE_WINDOW = 600         # 급등 감지 윈도우 (10분)
TOKEN_SPIKE_LIMIT = 999_999_999  # 스파이크 감지 — 사실상 비활성

# ── 내부 상태 ─────────────────────────────────────────────────────
_token_budget_log: list[tuple[float, int]] = []  # [(timestamp, tokens), ...]
_budget_paused = False
_last_rate_limit: dict | None = None             # Claude Max 플랜 5h 세션 한도 이벤트

# JSONL 캐시
_jsonl_cache: tuple[float, int] | None = None
_JSONL_CACHE_TTL = 30  # 초

# 팀별 토큰 사용 집계
_team_token_totals: dict[str, int] = {}


# ── JSONL 토큰 파싱 ──────────────────────────────────────────────
def _read_jsonl_tokens(window_seconds: int) -> int:
    """~/.claude/projects/**/*.jsonl 에서 window 내 실제 토큰 합산.
    claude_guard.sh 와 동일한 파싱 로직."""
    projects_dir = Path.home() / ".claude" / "projects"
    cutoff_ts = time.time() - window_seconds
    cutoff_dt = datetime.fromtimestamp(cutoff_ts, tz=timezone.utc)
    total = 0
    try:
        for jsonl_file in projects_dir.glob("**/*.jsonl"):
            try:
                if jsonl_file.stat().st_mtime < cutoff_ts - 60:
                    continue
                with open(jsonl_file, encoding="utf-8", errors="ignore") as fh:
                    for line in fh:
                        try:
                            entry = json.loads(line)
                            if entry.get("type") != "assistant":
                                continue
                            ts_str = entry.get("timestamp", "")
                            if not ts_str:
                                continue
                            entry_time = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                            if entry_time < cutoff_dt:
                                continue
                            usage = entry.get("message", {}).get("usage", {})
                            total += (
                                usage.get("input_tokens", 0)
                                + usage.get("output_tokens", 0)
                                + usage.get("cache_creation_input_tokens", 0)
                            )
                        except Exception:
                            pass
            except Exception:
                pass
    except Exception:
        pass
    return total


def _get_jsonl_tokens(window_seconds: int = TOKEN_BUDGET_WINDOW) -> int:
    """JSONL 기반 토큰 수 (30초 캐시)"""
    global _jsonl_cache
    now = time.time()
    if _jsonl_cache and now - _jsonl_cache[0] < _JSONL_CACHE_TTL:
        return _jsonl_cache[1]
    total = _read_jsonl_tokens(window_seconds)
    _jsonl_cache = (now, total)
    return total


def _log_tokens(count: int, team_id: str = "") -> None:
    """토큰 사용량 기록 (in-memory + 팀별 집계)"""
    now = time.time()
    _token_budget_log.append((now, count))
    cutoff = now - TOKEN_BUDGET_WINDOW
    while _token_budget_log and _token_budget_log[0][0] < cutoff:
        _token_budget_log.pop(0)
    if team_id:
        _team_token_totals[team_id] = _team_token_totals.get(team_id, 0) + count


def _get_window_tokens(window_seconds: int = TOKEN_BUDGET_WINDOW) -> int:
    """JSONL 실제 값 우선, 실패 시 in-memory 추정치 반환"""
    try:
        jsonl_total = _get_jsonl_tokens(window_seconds)
        if jsonl_total > 0:
            return jsonl_total
    except Exception:
        pass
    cutoff = time.time() - window_seconds
    return sum(t for ts, t in _token_budget_log if ts >= cutoff)


def _check_budget(is_auto: bool = False) -> tuple[bool, int]:
    """예산 확인. (허용 여부, 현재 사용량) 반환.
    is_auto=True 이면 자동 실행 상한 적용, 수동(대화)은 무제한 통과"""
    global _budget_paused
    used = _get_window_tokens()
    if not is_auto:
        _budget_paused = False
        return True, used
    if used >= TOKEN_BUDGET_AUTO:
        _budget_paused = True
        return False, used
    _budget_paused = False
    return True, used


def _check_token_spike(is_auto: bool = False) -> bool:
    """최근 TOKEN_SPIKE_WINDOW(10분) 내 급등 감지 — bool 반환만.
    STANDBY 전환은 caller(claude_runner) 책임."""
    if not is_auto:
        return False
    spike_tokens = _get_window_tokens(TOKEN_SPIKE_WINDOW)
    if spike_tokens >= TOKEN_SPIKE_LIMIT:
        logger.warning(
            "[토큰급등] %dK / %d분 — caller 가 standby 결정",
            spike_tokens // 1000, TOKEN_SPIKE_WINDOW // 60,
        )
        return True
    return False


def reset_budget() -> str:
    """수동으로 예산 리셋"""
    global _budget_paused, _jsonl_cache
    _token_budget_log.clear()
    _jsonl_cache = None
    _budget_paused = False
    return "✅ 토큰 예산 리셋 완료"


def set_rate_limit_event(event: dict | None) -> None:
    """run_claude 가 Claude CLI rate_limit_event 수신 시 호출"""
    global _last_rate_limit
    _last_rate_limit = event


def get_budget_status() -> dict:
    """현재 토큰 예산 상태 (JSONL 실제값 포함) + Max 플랜 세션 한도"""
    used = _get_window_tokens()
    spike = _get_window_tokens(TOKEN_SPIKE_WINDOW)
    return {
        "used": used,
        "limit": TOKEN_BUDGET_LIMIT,
        "limit_auto": TOKEN_BUDGET_AUTO,
        "remaining": max(0, TOKEN_BUDGET_LIMIT - used),
        "paused": _budget_paused,
        "window_minutes": TOKEN_BUDGET_WINDOW // 60,
        "spike_10min": spike,
        "spike_limit": TOKEN_SPIKE_LIMIT,
        "team_totals": dict(_team_token_totals),
        "max_plan_rate_limit": _last_rate_limit,
    }
