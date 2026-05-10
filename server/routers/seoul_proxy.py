"""서울시 공공데이터 프록시 — 지하철 실시간 도착정보.

- 무료 1,000건/일 (data.seoul.go.kr)
- 캐시 60초 (같은 역 반복 호출 시)

엔드포인트:
- GET /api/seoul/subway/arrival?station={역명}
"""
from __future__ import annotations

import logging
import os
import time
import urllib.parse

import requests
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)
router = APIRouter(tags=["seoul-proxy"])

SEOUL_SUBWAY_BASE = "http://swopenAPI.seoul.go.kr/api/subway"

# 서울 지하철 노선 코드 (subwayId) → 노선명
_LINE_NAMES = {
    "1001": "1호선", "1002": "2호선", "1003": "3호선", "1004": "4호선",
    "1005": "5호선", "1006": "6호선", "1007": "7호선", "1008": "8호선",
    "1009": "9호선", "1063": "경의중앙선", "1065": "공항철도", "1067": "경춘선",
    "1075": "수인분당선", "1077": "신분당선", "1092": "우이신설선",
    "1093": "서해선", "1081": "경강선", "1032": "GTX-A",
}

# 도착 코드 → 자연어
_ARVL_CD = {
    "0": "진입중", "1": "도착", "2": "출발", "3": "전역출발",
    "4": "전역진입", "5": "전역도착", "99": "운행중",
}


def _key() -> str:
    k = os.getenv("SEOUL_SUBWAY_KEY", "").strip()
    if not k:
        raise HTTPException(503, "SEOUL_SUBWAY_KEY 미설정")
    return k


def _key_realtime() -> str:
    """위치정보 등 별도 키. 미설정 시 SEOUL_SUBWAY_KEY 폴백."""
    return os.getenv("SEOUL_SUBWAY_KEY_REALTIME", "").strip() or _key()


# 단순 메모리 캐시: {station: (ts, data)}
_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 60  # 60초 (열차는 ~1분 단위로 변동)


@router.get("/api/seoul/subway/arrival")
async def subway_arrival(station: str = Query(..., description="역명 (예: 강남, 서울, 종로3가)")):
    """특정 역의 다음 열차 도착정보 (양방향 합산)."""
    station = station.strip().replace("역", "")
    now = time.time()
    cached = _cache.get(station)
    if cached and now - cached[0] < _CACHE_TTL:
        return cached[1]

    try:
        url = f"{SEOUL_SUBWAY_BASE}/{_key()}/json/realtimeStationArrival/0/10/{urllib.parse.quote(station)}"
        r = requests.get(url, timeout=6)
    except requests.RequestException as e:
        logger.warning("[seoul-subway] 호출 실패: %s", e)
        raise HTTPException(502, f"호출 실패: {e}")

    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text[:200])
    data = r.json()
    err = data.get("errorMessage", {})
    if err.get("status") != 200:
        return {"ok": False, "error": err.get("message", "unknown"), "station": station}

    items = data.get("realtimeArrivalList") or []
    arrivals = []
    for it in items[:8]:
        sid = it.get("subwayId", "")
        secs = int(it.get("barvlDt", "0") or 0)
        arrivals.append({
            "line": _LINE_NAMES.get(sid, f"노선{sid}"),
            "subway_id": sid,
            "direction": it.get("updnLine", ""),  # 상행/하행 또는 내선/외선
            "destination": it.get("trainLineNm", "").split(" - ")[0] if it.get("trainLineNm") else "",
            "barvl_sec": secs,
            "barvl_min": secs // 60 if secs else None,
            "msg": it.get("arvlMsg2", ""),
            "current_station": it.get("arvlMsg3", ""),
            "arrival_status": _ARVL_CD.get(it.get("arvlCd", "99"), ""),
            "is_express": it.get("btrainSttus") == "급행",
        })

    result = {"ok": True, "station": station, "arrivals": arrivals, "fetched_at": int(now)}
    _cache[station] = (now, result)
    return result


_pos_cache: dict[str, tuple[float, dict]] = {}


@router.get("/api/seoul/subway/position")
async def subway_position(line: str = Query(..., description="노선명 (예: 2호선, 9호선, 신분당선)")):
    """특정 노선의 모든 운행 열차 위치 (realtimePosition)."""
    line = line.strip()
    now = time.time()
    cached = _pos_cache.get(line)
    if cached and now - cached[0] < _CACHE_TTL:
        return cached[1]

    try:
        url = f"{SEOUL_SUBWAY_BASE}/{_key_realtime()}/json/realtimePosition/0/200/{urllib.parse.quote(line)}"
        r = requests.get(url, timeout=8)
    except requests.RequestException as e:
        raise HTTPException(502, f"호출 실패: {e}")
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text[:200])
    data = r.json()
    err = data.get("errorMessage", {})
    if err.get("status") != 200:
        return {"ok": False, "error": err.get("message", "unknown")}
    items = data.get("realtimePositionList") or []
    trains = [{
        "train_no": it.get("trainNo"),
        "current_station": it.get("statnNm"),
        "status": it.get("trainSttus"),  # 0=진입, 1=도착, 2=출발, 3=전역출발
        "updn_line": it.get("updnLine"),
        "is_express": it.get("directAt") == "1",
    } for it in items]
    result = {"ok": True, "line": line, "trains": trains, "count": len(trains), "fetched_at": int(now)}
    _pos_cache[line] = (now, result)
    return result
