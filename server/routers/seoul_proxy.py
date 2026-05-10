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


def _bus_key() -> str:
    k = os.getenv("DATA_GO_KR_KEY", "").strip()
    if not k:
        raise HTTPException(503, "DATA_GO_KR_KEY 미설정")
    return k


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


# ── 서울 버스 (ws.bus.go.kr) ──
import xml.etree.ElementTree as ET

_bus_cache: dict[str, tuple[float, dict]] = {}
BUS_API = "http://ws.bus.go.kr/api/rest"


def _xml_to_items(xml_text: str) -> list[dict]:
    """ws.bus.go.kr XML 응답 → list[dict]"""
    try:
        root = ET.fromstring(xml_text)
        body = root.find("msgBody")
        items = body.findall("itemList") if body is not None else []
        result = []
        for it in items:
            d = {child.tag: (child.text or "").strip() for child in it}
            result.append(d)
        return result
    except Exception as e:
        logger.warning("[bus] XML parse 실패: %s", e)
        return []


@router.get("/api/seoul/bus/station_by_pos")
async def bus_station_by_pos(
    lat: float = Query(...),
    lng: float = Query(...),
    radius: int = Query(300, description="검색 반경 m"),
):
    """좌표 근처 버스 정류소 (서울 wsbus). 활용신청 후 작동."""
    cache_key = f"sbp:{lat:.4f},{lng:.4f},{radius}"
    now = time.time()
    cached = _bus_cache.get(cache_key)
    if cached and now - cached[0] < 600:  # 10분 캐시 (정류소 위치는 변동 적음)
        return cached[1]
    try:
        r = requests.get(
            f"{BUS_API}/stationinfo/getStationByPos",
            params={"serviceKey": _bus_key(), "tmX": lng, "tmY": lat, "radius": radius},
            timeout=6,
        )
    except requests.RequestException as e:
        raise HTTPException(502, f"호출 실패: {e}")
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text[:200])
    if "SERVICE KEY IS NOT REGISTERED" in r.text:
        return {"ok": False, "error": "서울 버스 API 활용신청 필요 (data.go.kr)"}
    items = _xml_to_items(r.text)
    stations = [{
        "ars_id": it.get("arsId"),
        "station_id": it.get("stationId"),
        "name": it.get("stationNm"),
        "lat": float(it.get("gpsY", 0) or 0),
        "lng": float(it.get("gpsX", 0) or 0),
        "dist_m": int(it.get("dist", 0) or 0),
    } for it in items]
    result = {"ok": True, "stations": stations[:10]}
    _bus_cache[cache_key] = (now, result)
    return result


@router.get("/api/seoul/bus/arrival")
async def bus_arrival(ars_id: str = Query(..., description="정류소 고유번호 (5자리 ARS ID)")):
    """정류소 도착정보 — 곧 도착하는 버스 N대."""
    cache_key = f"ba:{ars_id}"
    now = time.time()
    cached = _bus_cache.get(cache_key)
    if cached and now - cached[0] < 30:  # 30초 캐시
        return cached[1]
    try:
        r = requests.get(
            f"{BUS_API}/stationinfo/getStationByUid",
            params={"serviceKey": _bus_key(), "arsId": ars_id},
            timeout=6,
        )
    except requests.RequestException as e:
        raise HTTPException(502, f"호출 실패: {e}")
    if "SERVICE KEY IS NOT REGISTERED" in r.text:
        return {"ok": False, "error": "서울 버스 API 활용신청 필요"}
    items = _xml_to_items(r.text)
    arrivals = [{
        "bus_no": it.get("rtNm"),
        "route_id": it.get("busRouteId"),
        "bus_type": it.get("routeType"),  # 1=공항 3=마을 4=대형 5=학생 6=공항 7=대형 11=일반시내
        "msg1": it.get("arrmsg1"),       # 첫 번째 도착 자연어
        "msg2": it.get("arrmsg2"),       # 두 번째 도착
        "first_eta_sec": int(it.get("traTime1", 0) or 0),
        "next_eta_sec": int(it.get("traTime2", 0) or 0),
        "first_stops_away": int(it.get("staOrd", 0) or 0),
    } for it in items[:10]]
    result = {"ok": True, "ars_id": ars_id, "arrivals": arrivals}
    _bus_cache[cache_key] = (now, result)
    return result
