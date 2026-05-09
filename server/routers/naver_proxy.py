"""네이버 NCP API 프록시 — datemap.600g.net 등 자체 도메인 사이트가 호출용.

CORS 차단 + 시크릿 키 노출 방지 위해 백엔드 경유.

엔드포인트:
- GET /api/naver/directions  — 길찾기 (NCP Directions 5)
"""
from __future__ import annotations

import logging
import os

import requests
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)
router = APIRouter(tags=["naver-proxy"])

# VPC 환경 endpoint (NCP Console 의 Application 이 VPC 에 있을 때 사용)
# Classic 환경이면 https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving
NCP_DIRECTIONS_URL = "https://maps.apigw.ntruss.com/map-direction/v1/driving"
ALLOWED_OPTIONS = {"trafast", "tracomfort", "traoptimal", "traavoidtoll", "traavoidcaronly"}


def _ncp_headers() -> dict[str, str]:
    """NCP 인증 헤더. .env 의 NCP_CLIENT_ID/SECRET 사용."""
    cid = os.getenv("NCP_CLIENT_ID", "").strip()
    secret = os.getenv("NCP_CLIENT_SECRET", "").strip()
    if not cid or not secret:
        raise HTTPException(503, "NCP_CLIENT_ID/SECRET 미설정 — 서버 .env 확인")
    return {
        "X-NCP-APIGW-API-KEY-ID": cid,
        "X-NCP-APIGW-API-KEY": secret,
    }


@router.get("/api/naver/directions")
async def naver_directions(
    start: str = Query(..., description="출발지 lng,lat (예: 126.978,37.5665)"),
    goal: str = Query(..., description="목적지 lng,lat"),
    waypoints: str | None = Query(None, description="경유지 lng,lat:lng,lat (최대 5)"),
    option: str = Query("trafast", description="trafast|tracomfort|traoptimal|traavoidtoll|traavoidcaronly"),
):
    """NCP Directions 5 프록시.

    응답: {ok, route: {summary: {distance, duration, ...}, path: [[lng,lat]...]}}
    """
    if option not in ALLOWED_OPTIONS:
        raise HTTPException(400, f"option must be one of {ALLOWED_OPTIONS}")
    # 좌표 형식 가벼운 검증
    for label, coord in (("start", start), ("goal", goal)):
        parts = coord.split(",")
        if len(parts) != 2:
            raise HTTPException(400, f"{label} 형식 오류: 'lng,lat'")
        try:
            float(parts[0]); float(parts[1])
        except ValueError:
            raise HTTPException(400, f"{label} 좌표는 숫자여야 함")

    params: dict[str, str] = {"start": start, "goal": goal, "option": option}
    if waypoints:
        params["waypoints"] = waypoints

    try:
        r = requests.get(NCP_DIRECTIONS_URL, headers=_ncp_headers(), params=params, timeout=8)
    except requests.RequestException as e:
        logger.warning("[naver-proxy] NCP 호출 실패: %s", e)
        raise HTTPException(502, f"NCP API 호출 실패: {e}")

    if r.status_code != 200:
        logger.warning("[naver-proxy] NCP %s: %s", r.status_code, r.text[:200])
        raise HTTPException(r.status_code, r.text[:300])

    data = r.json()
    code = data.get("code")
    if code != 0:
        # NCP code != 0 = 경로 없음 등 비즈니스 에러
        return {"ok": False, "error": data.get("message", "경로 없음"), "code": code}

    # 첫 번째 경로 (option 별 단일 경로)
    routes = data.get("route") or {}
    first_route_list = next(iter(routes.values()), [])
    if not first_route_list:
        return {"ok": False, "error": "경로 데이터 없음"}
    route = first_route_list[0]
    summary = route.get("summary", {})
    return {
        "ok": True,
        "route": {
            "distance_m": summary.get("distance", 0),
            "duration_ms": summary.get("duration", 0),
            "toll_fare": summary.get("tollFare", 0),
            "taxi_fare": summary.get("taxiFare", 0),
            "fuel_price": summary.get("fuelPrice", 0),
            "path": route.get("path", []),  # [[lng,lat], ...]
        },
        "option_used": option,
    }
