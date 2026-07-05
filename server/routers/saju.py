"""사주 라우터 — company-hq 내장형 (v2).

옛 /Users/600mac/Desktop/saju/backend/ 폴더는 macOS 권한 차단으로 사용 불가.
모든 사주 코드를 company-hq/server/ 안으로 이동(Developer 폴더, 권한 OK).

엔드포인트:
- POST /api/saju/interpret  — 풀이 시작 (캐시 적중 시 즉시, 신규는 job 폴링)
- GET  /api/saju/interpret/{job_id} — job 상태/결과 조회
- POST /api/saju/manse      — 만세력만 (LLM 없음, 무료)
- GET  /api/saju/fortune/today — 오늘의 운세 (포츈쿠키, 무료·즉시·무제한)
- GET  /api/saju/stats      — 통계
- GET  /api/saju/health     — 헬스

오너 토큰: X-Owner-Token 또는 ?owner_token= 일치 시 quota 우회 + Claude Max 우선.
"""
import hashlib
import json
import logging
import os
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import saju_cache
import saju_llm
from saju_engine import SajuInput, calculate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/saju", tags=["saju"])

STATS_PATH = Path(__file__).parent.parent / "saju_stats.json"
QUOTA_DB_PATH = Path(__file__).parent.parent / "saju_quota.db"
FORTUNE_POOL_PATH = Path(__file__).parent.parent / "saju_fortune_pool.json"
DAILY_LIMIT_PER_IP = 3
JOB_TTL_SEC = 1800
FORTUNE_POOL_STALE_HOURS = 36  # 매일 06:00 갱신, 36h 넘으면 stale 로그
KST = timezone(timedelta(hours=9))

OWNER_TOKEN = os.getenv("SAJU_OWNER_TOKEN", "")


class InterpretRequest(BaseModel):
    year: int = Field(..., ge=1900, le=2100)
    month: int = Field(..., ge=1, le=12)
    day: int = Field(..., ge=1, le=31)
    hour: Optional[int] = Field(None, ge=0, le=23)
    minute: int = Field(0, ge=0, le=59)
    gender: str = Field("male", pattern="^(male|female)$")
    calendar: str = Field("solar", pattern="^(solar|lunar)$")
    is_leap_month: bool = False
    birth_city: str = "Seoul"
    use_solar_time: bool = False  # 입력 호환용 (v2 엔진은 무시)
    use_korean_yazi: bool = False  # 입력 호환용


# ---------- 쿼타 ----------

def _quota_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(QUOTA_DB_PATH)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS quota (
            ip TEXT, date TEXT, count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (ip, date)
        )"""
    )
    conn.commit()
    return conn


def _today() -> str:
    return time.strftime("%Y-%m-%d", time.localtime())


def _check_quota(ip: str) -> tuple[bool, int]:
    conn = _quota_conn()
    try:
        cur = conn.execute("SELECT count FROM quota WHERE ip=? AND date=?", (ip, _today()))
        row = cur.fetchone()
        count = row[0] if row else 0
        return count < DAILY_LIMIT_PER_IP, max(0, DAILY_LIMIT_PER_IP - count)
    finally:
        conn.close()


def _bump_quota(ip: str) -> None:
    conn = _quota_conn()
    try:
        conn.execute(
            """INSERT INTO quota (ip, date, count) VALUES (?, ?, 1)
               ON CONFLICT(ip, date) DO UPDATE SET count=count+1""",
            (ip, _today()),
        )
        conn.commit()
    finally:
        conn.close()


# ---------- 통계 ----------

def _load_stats() -> dict:
    if STATS_PATH.exists():
        return json.loads(STATS_PATH.read_text(encoding="utf-8"))
    return {
        "total_requests": 0, "cache_hits": 0, "llm_calls": 0,
        "by_model": {}, "quota_blocks": 0, "job_errors": 0,
    }


def _save_stats(stats: dict) -> None:
    STATS_PATH.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")


def _bump_stat(event: str, model_used: str = "") -> None:
    stats = _load_stats()
    stats["total_requests"] += 1
    if event == "cache_hit":
        stats["cache_hits"] += 1
    elif event == "llm_call":
        stats["llm_calls"] += 1
        stats["by_model"][model_used] = stats["by_model"].get(model_used, 0) + 1
    elif event == "quota_block":
        stats["quota_blocks"] += 1
    elif event == "job_error":
        stats["job_errors"] = stats.get("job_errors", 0) + 1
    _save_stats(stats)


# ---------- job 큐 (메모리) ----------

_JOBS: dict[str, dict] = {}
_JOBS_LOCK = threading.Lock()


def _put_job(job_id: str, data: dict) -> None:
    with _JOBS_LOCK:
        _JOBS[job_id] = {**data, "updated_at": time.time()}
        cutoff = time.time() - JOB_TTL_SEC
        for jid in list(_JOBS.keys()):
            if _JOBS[jid].get("updated_at", 0) < cutoff:
                _JOBS.pop(jid, None)


def _get_job(job_id: str) -> Optional[dict]:
    with _JOBS_LOCK:
        return _JOBS.get(job_id)


def _run_bg(job_id: str, key: str, manse: dict, ip: str, prefer_max: bool) -> None:
    try:
        text, model_used = saju_llm.interpret(manse, prefer_max=prefer_max)
        saju_cache.put(key, manse, text, model_used)
        if ip:
            _bump_quota(ip)
        _bump_stat("llm_call", model_used)
        _put_job(job_id, {
            "status": "done", "manse": manse,
            "interpretation": text, "model_used": model_used, "from_cache": False,
        })
    except Exception as e:
        logger.exception("saju job %s 실패", job_id)
        _bump_stat("job_error")
        _put_job(job_id, {"status": "error", "error": str(e)})


# ---------- 헬퍼 ----------

def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _is_owner(request: Request) -> bool:
    if not OWNER_TOKEN:
        return False
    token = (
        request.headers.get("x-owner-token")
        or request.query_params.get("owner_token", "")
    )
    return bool(token) and token == OWNER_TOKEN


# ---------- 엔드포인트 ----------

@router.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "gemini_configured": bool(saju_llm.GEMINI_API_KEY),
        "claude_max": True,
        "daily_limit_per_ip": DAILY_LIMIT_PER_IP,
        "active_jobs": len(_JOBS),
    }


@router.get("/stats")
def stats() -> dict:
    return {**_load_stats(), "cache": saju_cache.stats()}


# ---------- 오늘의 운세 (포츈쿠키) ----------

_FORTUNE_CACHE: dict = {"mtime": 0.0, "data": None}


def _load_fortune_pool() -> Optional[dict]:
    """디스크 pool 파일 로드 + mtime 캐시 (재읽기 회피)."""
    if not FORTUNE_POOL_PATH.exists():
        return None
    mtime = FORTUNE_POOL_PATH.stat().st_mtime
    if _FORTUNE_CACHE["data"] is not None and _FORTUNE_CACHE["mtime"] == mtime:
        return _FORTUNE_CACHE["data"]
    try:
        data = json.loads(FORTUNE_POOL_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("fortune pool 파일 읽기 실패: %s", e)
        return None
    if not isinstance(data.get("items"), list) or not data["items"]:
        return None
    _FORTUNE_CACHE["mtime"] = mtime
    _FORTUNE_CACHE["data"] = data
    return data


def _kst_today_str() -> str:
    return datetime.now(KST).date().isoformat()


@router.get("/fortune/today")
def fortune_today(request: Request, spin: int = 0) -> dict:
    """오늘의 운세 — 포츈쿠키 픽 (무료·즉시·무제한).

    seed = KST 오늘 날짜 + IP 해시 + spin(다시 흔들기 카운트).
    같은 seed 는 같은 결과 → 사용자가 새로고침해도 처음 뽑은 게 유지.
    다른 spin 값 주면 다른 문구 (다시 흔들기).
    """
    pool = _load_fortune_pool()
    if pool is None:
        raise HTTPException(
            status_code=503,
            detail="오늘의 운세 준비 중이에요. 잠시 후 다시 열어봐주세요.",
        )

    items: list[str] = pool["items"]
    ip = _client_ip(request)
    today = _kst_today_str()
    seed_raw = f"{today}|{ip}|{spin}".encode("utf-8")
    seed_hex = hashlib.sha256(seed_raw).hexdigest()
    idx = int(seed_hex[:12], 16) % len(items)

    # pool 이 오래됐으면 로그 (그래도 반환은 함 — 사용자 경험 우선)
    pool_age_h = (time.time() - FORTUNE_POOL_PATH.stat().st_mtime) / 3600
    if pool_age_h > FORTUNE_POOL_STALE_HOURS:
        logger.warning("fortune pool stale: %.1fh old (limit=%dh)", pool_age_h, FORTUNE_POOL_STALE_HOURS)

    _bump_stat("fortune_pick")
    return {
        "ok": True,
        "item": items[idx],
        "spin": spin,
        "pool_date": pool.get("date", today),
        "pool_size": len(items),
    }


@router.post("/manse")
def manse_only(req: InterpretRequest) -> dict:
    inp = SajuInput(
        year=req.year, month=req.month, day=req.day,
        hour=req.hour, minute=req.minute,
        gender=req.gender, calendar=req.calendar,
        is_leap_month=req.is_leap_month, birth_city=req.birth_city,
    )
    return calculate(inp)


@router.post("/interpret")
def interpret_start(req: InterpretRequest, request: Request) -> dict:
    ip = _client_ip(request)
    is_owner = _is_owner(request)
    inp = SajuInput(
        year=req.year, month=req.month, day=req.day,
        hour=req.hour, minute=req.minute,
        gender=req.gender, calendar=req.calendar,
        is_leap_month=req.is_leap_month, birth_city=req.birth_city,
    )

    try:
        manse = calculate(inp)
    except Exception as e:
        logger.exception("saju manse 실패")
        raise HTTPException(status_code=400, detail=f"만세력 계산 실패: {e}")

    key = saju_cache.make_key(req.model_dump())
    cached = saju_cache.get(key)
    if cached:
        _bump_stat("cache_hit")
        return {
            "status": "done",
            "manse": cached["manse"],
            "interpretation": cached["interpretation"],
            "model_used": cached["model_used"],
            "from_cache": True,
        }

    # 신규 호출
    if is_owner:
        remaining_after = -1
    else:
        allowed, remaining = _check_quota(ip)
        if not allowed:
            _bump_stat("quota_block")
            raise HTTPException(
                status_code=429,
                detail="오늘 새로운 사주 풀이는 하루 3번까지 봐주고 있어요. 내일 다시 와주세요.",
            )
        remaining_after = remaining - 1

    job_id = uuid.uuid4().hex[:16]
    _put_job(job_id, {"status": "pending", "manse": manse, "started_at": time.time()})
    quota_ip = "" if is_owner else ip
    # 오너만 Claude Max 우선 사용 (Max 토큰 보호). 일반 사용자는 Gemini→Ollama.
    threading.Thread(
        target=_run_bg,
        args=(job_id, key, manse, quota_ip, is_owner),
        daemon=True,
    ).start()

    return {
        "status": "pending",
        "job_id": job_id,
        "manse": manse,
        "quota_remaining_after": remaining_after,
        "owner_bypass": is_owner,
    }


@router.get("/interpret/{job_id}")
def interpret_poll(job_id: str) -> dict:
    job = _get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없어요.")
    return job
