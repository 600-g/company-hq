"""Claude Max 플랜 사용량 조회 — macOS 키체인 토큰 + Anthropic usage API.

외부 의존 0 (stdlib only) — `routers/claude_usage.py` 와 `mcp_server.py` 양쪽에서 import.
db.py 와 같은 원칙: 서버 라우터 계층과 MCP 계층이 같은 로직을 공유하되 FastAPI 에 묶이지 않는다.

게이지 산출은 응답의 `limits[]` 배열을 1순위로 쓴다. `five_hour` / `seven_day` 최상위 필드는
같은 값을 중복 노출할 뿐이고, 모델별 주간 한도(예: Fable)는 `limits[].scope.model.display_name`
에만 존재한다 — 최상위에는 `fable` 같은 키가 없다. 최상위 필드는 limits 가 비었을 때만 폴백.

보안: accessToken 은 어떤 경로로도 로그·응답에 실리지 않는다.
"""
from __future__ import annotations

import json
import logging
import subprocess
import threading
import time
import urllib.error
import urllib.request
from typing import Any

logger = logging.getLogger(__name__)

USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
KEYCHAIN_SERVICE = "Claude Code-credentials"

CACHE_TTL_SEC = 120
HTTP_TIMEOUT_SEC = 10
KEYCHAIN_TIMEOUT_SEC = 5

_cache: dict[str, Any] = {"data": None, "ts": 0.0}
_cache_lock = threading.Lock()


class UsageError(Exception):
    """사용자에게 그대로 보여줘도 안전한 실패 사유 (토큰·내부 경로 미포함)."""


# ── 토큰 ──────────────────────────────────────────────────────────
def _read_access_token() -> str:
    """키체인에서 OAuth accessToken 을 읽는다.

    토큰은 ~5시간마다 만료되므로 캐시하지 않고 매 조회마다 새로 읽는다.
    """
    try:
        proc = subprocess.run(
            ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
            capture_output=True,
            text=True,
            timeout=KEYCHAIN_TIMEOUT_SEC,
        )
    except subprocess.TimeoutExpired as e:
        raise UsageError("키체인 응답이 없습니다 (잠금 상태일 수 있어요).") from e
    except OSError as e:
        raise UsageError("키체인에 접근할 수 없습니다.") from e

    if proc.returncode != 0:
        raise UsageError("키체인에 Claude Code 자격증명이 없습니다.")

    try:
        token = json.loads(proc.stdout)["claudeAiOauth"]["accessToken"]
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        raise UsageError("키체인 자격증명 형식이 예상과 다릅니다.") from e

    if not isinstance(token, str) or not token:
        raise UsageError("accessToken 이 비어 있습니다.")
    return token


# ── API 호출 ──────────────────────────────────────────────────────
def _fetch_raw() -> dict:
    req = urllib.request.Request(
        USAGE_URL,
        headers={"Authorization": f"Bearer {_read_access_token()}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SEC) as resp:  # noqa: S310 — 상수 https URL
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise UsageError("토큰이 만료됐습니다. Claude Code 에 다시 로그인해주세요.") from e
        raise UsageError(f"Anthropic API 오류 (HTTP {e.code}).") from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise UsageError("Anthropic API 에 연결할 수 없습니다.") from e
    except json.JSONDecodeError as e:
        raise UsageError("Anthropic API 응답을 해석할 수 없습니다.") from e

    if not isinstance(payload, dict):
        raise UsageError("Anthropic API 응답 형식이 예상과 다릅니다.")
    return payload


# ── 정규화 ────────────────────────────────────────────────────────
_KIND_LABELS = {
    "session": "5시간 세션",
    "weekly_all": "주간 전체",
    "weekly_scoped": "주간",  # scope 모델명을 뒤에 붙여 "주간 Fable" 로 완성
}


def _clamp_percent(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return max(0.0, min(100.0, float(value)))


def _gauge(key: str, label: str, used: float, *, severity: str = "normal",
           resets_at: str | None = None, is_active: bool = False,
           model: str | None = None) -> dict:
    return {
        "key": key,
        "label": label,
        "model": model,
        "used_percent": round(used, 1),
        "remaining_percent": round(100.0 - used, 1),
        "severity": severity,
        "resets_at": resets_at,
        "is_active": is_active,
    }


def _gauge_from_limit(limit: dict) -> dict | None:
    used = _clamp_percent(limit.get("percent"))
    if used is None:
        return None

    kind = str(limit.get("kind") or "unknown")
    model = ((limit.get("scope") or {}).get("model") or {}).get("display_name")
    label = _KIND_LABELS.get(kind, kind)
    # 모델별 주간 한도는 모델명이 곧 라벨 — Anthropic 이 이름을 바꿔도 따라간다.
    if kind == "weekly_scoped" and model:
        label = f"주간 {model}"

    return _gauge(
        kind, label, used,
        severity=str(limit.get("severity") or "normal"),
        resets_at=limit.get("resets_at"),
        is_active=bool(limit.get("is_active")),
        model=model if isinstance(model, str) else None,
    )


_FALLBACK_BLOCKS = (("five_hour", "session", "5시간 세션"), ("seven_day", "weekly_all", "주간 전체"))


def _normalize(raw: dict) -> dict:
    """limits[] 우선. 비어 있으면 최상위 five_hour / seven_day 로 폴백."""
    limits = raw.get("limits")
    gauges: list[dict] = []
    if isinstance(limits, list):
        gauges = [g for g in (_gauge_from_limit(x) for x in limits if isinstance(x, dict)) if g]

    if not gauges:
        for field, key, label in _FALLBACK_BLOCKS:
            block = raw.get(field)
            if not isinstance(block, dict):
                continue
            used = _clamp_percent(block.get("utilization"))
            if used is None:
                continue
            gauges.append(_gauge(key, label, used, resets_at=block.get("resets_at")))

    return {"gauges": gauges, "fetched_at": time.time()}


# ── 공개 API ──────────────────────────────────────────────────────
def get_usage(*, max_age_sec: int = CACHE_TTL_SEC) -> dict:
    """사용량 조회. 2분 캐시 → 만료 시 재조회 → 실패하면 stale 캐시로 graceful fallback.

    항상 dict 를 돌려주고 예외를 던지지 않는다. 실패는 `ok: False` + `error` 로 표현.
    """
    now = time.time()
    with _cache_lock:
        cached, age = _cache["data"], now - _cache["ts"]
    if cached and age < max_age_sec:
        return {**cached, "ok": True, "cached": True, "stale": False, "age_sec": round(age, 1)}

    try:
        # 네트워크 호출은 락 밖에서 — 동시 요청이 잠깐 중복 조회할 수 있으나 이벤트 루프를 막지 않는다.
        fresh = _normalize(_fetch_raw())
    except UsageError as e:
        if cached:
            logger.warning("claude usage 갱신 실패 — 이전 캐시로 응답: %s", e)
            return {**cached, "ok": True, "cached": True, "stale": True,
                    "age_sec": round(age, 1), "error": str(e)}
        logger.warning("claude usage 조회 실패: %s", e)
        return {"ok": False, "error": str(e), "gauges": []}

    with _cache_lock:
        _cache["data"], _cache["ts"] = fresh, time.time()
    return {**fresh, "ok": True, "cached": False, "stale": False, "age_sec": 0.0}


def _humanize_age(seconds: float) -> str:
    if seconds < 60:
        return f"{int(seconds)}초"
    if seconds < 3600:
        return f"{int(seconds // 60)}분"
    return f"{int(seconds // 3600)}시간"


def format_usage_text() -> str:
    """MCP 도구용 사람이 읽는 요약."""
    result = get_usage()
    if not result["ok"]:
        return f"❌ 사용량 조회 실패: {result['error']}"
    if not result["gauges"]:
        return "사용량 정보가 비어 있습니다."

    lines = []
    for g in result["gauges"]:
        remaining = g["remaining_percent"]
        icon = "🟢" if remaining >= 50 else "🟡" if remaining >= 20 else "🔴"
        line = f"{icon} {g['label']}: {remaining}% 남음 ({g['used_percent']}% 사용)"
        if g["resets_at"]:
            line += f" · 리셋 {g['resets_at']}"
        lines.append(line)

    if result.get("stale"):
        lines.append(f"⚠️ 갱신 실패로 {_humanize_age(result['age_sec'])} 전 캐시입니다 — {result.get('error', '')}")
    return "\n".join(lines)
