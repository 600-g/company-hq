"""ODSAY LAB 대중교통 길찾기 프록시.

한국 대중교통(지하철+버스+도보) 통합 길찾기.
키 발급: https://lab.odsay.com (이메일만, 카드 X)
무료 한도: 5,000건/일

엔드포인트:
- GET /api/odsay/transit  — 출발/도착 좌표 → 추천 경로
"""
from __future__ import annotations

import logging
import os

import requests
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)
router = APIRouter(tags=["odsay-proxy"])

ODSAY_BASE = "https://api.odsay.com/v1/api"


def _api_key() -> str:
    k = os.getenv("ODSAY_API_KEY", "").strip()
    if not k:
        raise HTTPException(503, "ODSAY_API_KEY 미설정 — lab.odsay.com 에서 발급 후 .env 추가")
    return k


def _parse_subpath(sp: dict) -> dict | None:
    """ODSAY subPath 1개 파싱. trafficType=1(지하철) 2(버스) 3(도보)"""
    ttype = sp.get("trafficType")
    common = {
        "section_time_min": sp.get("sectionTime", 0),
        "start_x": sp.get("startX"),
        "start_y": sp.get("startY"),
        "end_x": sp.get("endX"),
        "end_y": sp.get("endY"),
    }
    if ttype == 3:
        return {**common, "type": "WALK", "distance_m": sp.get("distance", 0)}
    if ttype == 1:
        lane = (sp.get("lane") or [{}])[0]
        stations = sp.get("passStopList", {}).get("stations") if isinstance(sp.get("passStopList"), dict) else None
        return {
            **common,
            "type": "SUBWAY",
            "lane": lane.get("name", "지하철"),
            "subway_code": lane.get("subwayCode", 0),
            "start_station": sp.get("startName"),
            "end_station": sp.get("endName"),
            "stations": [s.get("stationName") for s in (stations or [])],
        }
    if ttype == 2:
        lane = (sp.get("lane") or [{}])[0]
        stops = sp.get("passStopList", {}).get("stations") if isinstance(sp.get("passStopList"), dict) else None
        return {
            **common,
            "type": "BUS",
            "bus_no": lane.get("busNo", "버스"),
            "bus_type": lane.get("type", 0),
            "start_stop": sp.get("startName"),
            "end_stop": sp.get("endName"),
            "stops": [s.get("stationName") for s in (stops or [])],
        }
    return None


def _parse_path(p: dict) -> dict:
    info = p.get("info", {})
    subs = [s for s in (_parse_subpath(sp) for sp in p.get("subPath", [])) if s]
    return {
        "total_time_min": info.get("totalTime", 0),
        "total_walk_m": info.get("totalWalk", 0),
        "transfer_count": info.get("subwayTransitCount", 0) + info.get("busTransitCount", 0),
        "fare": info.get("payment", 0),
        "subpath": subs,
    }


@router.get("/api/odsay/transit")
async def odsay_transit(
    sx: float = Query(..., description="출발지 longitude"),
    sy: float = Query(..., description="출발지 latitude"),
    ex: float = Query(..., description="목적지 longitude"),
    ey: float = Query(..., description="목적지 latitude"),
    opt: int = Query(0, description="0=권장 1=환승최소 2=시간최소"),
):
    """ODSAY 대중교통 경로 — 추천 + 대안 0~3개."""
    try:
        r = requests.get(
            f"{ODSAY_BASE}/searchPubTransPathT",
            params={
                "SX": sx, "SY": sy, "EX": ex, "EY": ey,
                "apiKey": _api_key(),
                "OPT": opt,
                "lang": 0,  # 0=한국어 (default), 1=영어
                "output": "json",
            },
            headers={"Referer": "https://datemap.600g.net"},
            timeout=8,
        )
    except requests.RequestException as e:
        logger.warning("[odsay] 호출 실패: %s", e)
        raise HTTPException(502, f"ODSAY API 호출 실패: {e}")
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text[:300])
    data = r.json()
    if data.get("error") or not data.get("result"):
        return {"ok": False, "error": str(data.get("error") or data)[:200]}
    paths = data["result"].get("path", [])
    if not paths:
        return {"ok": False, "error": "경로 없음 (출발↔도착이 너무 가깝거나 대중교통 안 다님)"}
    return {
        "ok": True,
        "best": _parse_path(paths[0]),
        "alternatives": [_parse_path(p) for p in paths[1:4]],
    }
