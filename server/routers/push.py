"""푸시 알림 + 인앱 알림 — main.py 분할 10차 (안정화 2026-05-08).

이동: /api/push/* (9개) + /api/notifications/* (2개)
자체 완결: push_notifications 모듈 위임만, 공유 상태 0.
"""
from __future__ import annotations

from fastapi import APIRouter

from push_notifications import (
    get_vapid_public_key, add_subscription, remove_subscription, send_push,
    get_notifications, get_unread_count, mark_read, mark_all_read, mark_team_read,
    delete_notification,
)

router = APIRouter(tags=["push"])


# ── 푸시 알림 ────────────────────────────────────────────────
@router.get("/api/push/vapid-key")
async def push_vapid_key():
    """VAPID 공개키 반환 (프론트에서 구독 시 사용)"""
    return {"ok": True, "publicKey": get_vapid_public_key()}


@router.post("/api/push/subscribe")
async def push_subscribe(body: dict):
    """푸시 알림 구독 등록 — body.topics 로 구독 채널 지정 (기본: hq+trading)"""
    sub_info = body.get("subscription")
    if not sub_info or not sub_info.get("endpoint"):
        return {"ok": False, "error": "subscription 정보가 필요합니다"}
    topics = body.get("topics") or None  # add_subscription 가 None 이면 기본 ['hq','trading']
    ok = add_subscription(sub_info, topics=topics)
    return {"ok": ok}


@router.post("/api/push/subscribe-trading")
async def push_subscribe_trading(body: dict):
    """트레이딩 전용 PWA (trading.600g.net) 의 push 구독 — topic=['trading'] 만 등록.
    두근컴퍼니 알림 안 받음."""
    sub_info = body.get("subscription")
    if not sub_info or not sub_info.get("endpoint"):
        return {"ok": False, "error": "subscription 정보가 필요합니다"}
    ok = add_subscription(sub_info, topics=["trading"])
    return {"ok": ok, "topics": ["trading"]}


@router.post("/api/push/unsubscribe")
async def push_unsubscribe(body: dict):
    """푸시 알림 구독 해제"""
    endpoint = body.get("endpoint", "")
    if not endpoint:
        return {"ok": False, "error": "endpoint가 필요합니다"}
    ok = remove_subscription(endpoint)
    return {"ok": ok}


@router.post("/api/push/test")
async def push_test():
    """테스트 푸시 발송"""
    count = send_push(
        title="🏢 두근컴퍼니 알림 테스트",
        body="푸시 알림이 정상적으로 작동합니다!",
        tag="test",
    )
    return {"ok": True, "sent": count}


@router.post("/api/push/119")
async def push_119(req: dict):
    """🚒 119 긴급 알림 — claude_guard.sh에서 호출"""
    title = req.get("title", "🚒 119 긴급출동")
    body = req.get("body", "")
    count = send_push(
        title=title,
        body=body[:200],
        tag="119-alert",
        url="/",
        team_id="cpo-claude",
    )
    return {"ok": True, "sent": count}


@router.post("/api/push/trading")
async def push_trading(req: dict):
    """📈 코인봇/주식봇 알림.
    분리 정책 (2026-05-10):
      - 단순 매매 (side=buy/sell, severity=info) → 인앱 기록만, 푸시 X
      - 서버 오류 / 긴급 / 경고 (side=system, severity=danger/warn) → 푸시 발송
    """
    from push_notifications import add_trading_notif
    bot = req.get("bot", "trading")
    side = req.get("side", "")
    severity = req.get("severity", "info")
    title = req.get("title", f"{bot} 알림")
    body = req.get("body", "")
    icon_map = {"buy": "🟢", "sell": "🔴", "danger": "🚨", "warn": "⚠️", "info": "💹"}
    icon = icon_map.get(side, icon_map.get(severity, "💹"))

    # 단순 매매(buy/sell) + info 면 푸시 안 보내고 인앱만 기록 (사용자 요구)
    silent = side in ("buy", "sell") and severity == "info"
    if silent:
        try:
            add_trading_notif(f"{icon} {title}", body, severity=severity)
        except Exception: pass
        return {"ok": True, "sent": 0, "silent": True, "side": side, "logged": True}

    # 그 외 (system/danger/warn) — 푸시 발송 + 인앱
    count = send_push(
        title=f"{icon} {title}",
        body=body[:200],
        tag=f"trading-{bot}-{side}",
        url="/",
        team_id="trading-bot",
        topic="trading",
    )
    return {"ok": True, "sent": count, "bot": bot, "side": side, "topic": "trading"}


@router.post("/api/push/topics")
async def push_update_topics(body: dict):
    """구독자 topic 변경 — 두근컴퍼니/트레이딩 알림 on/off 토글."""
    from push_notifications import update_topics
    endpoint = body.get("endpoint", "")
    topics = body.get("topics") or ["hq", "trading"]
    if not endpoint:
        return {"ok": False, "error": "endpoint 필요"}
    ok = update_topics(endpoint, topics)
    return {"ok": ok, "topics": topics}


@router.get("/api/push/topics")
async def push_get_topics(endpoint: str = ""):
    from push_notifications import get_topics
    return {"endpoint": endpoint, "topics": get_topics(endpoint)}


# ── 트레이딩봇 전용 인앱 알림 (두근컴퍼니 인앱창과 분리) ──
@router.get("/api/push/trading-notifications")
async def push_trading_notif_list(limit: int = 50):
    """트레이딩봇 알림만 조회 (두근컴퍼니 알림창에 안 섞임)"""
    from push_notifications import get_trading_notif
    return {"items": get_trading_notif(limit)}


@router.post("/api/push/trading-notifications/read")
async def push_trading_notif_read():
    from push_notifications import mark_trading_notif_read
    mark_trading_notif_read()
    return {"ok": True}


# ── 인앱 알림 ────────────────────────────────────────────────
@router.get("/api/notifications")
async def get_notifs():
    """알림 목록 + 안 읽은 수"""
    return {"ok": True, "notifications": get_notifications(), "unread": get_unread_count()}


@router.post("/api/notifications/{notif_id}/read")
async def read_notif(notif_id: str):
    """개별 알림 읽음 처리"""
    ok = mark_read(notif_id)
    return {"ok": ok, "unread": get_unread_count()}


@router.post("/api/notifications/read-all")
async def read_all_notifs():
    """전체 읽음 처리"""
    count = mark_all_read()
    return {"ok": True, "marked": count, "unread": 0}


@router.post("/api/notifications/team/{team_id}/read")
async def read_team_notifs(team_id: str):
    """특정 팀 알림 일괄 읽음 처리 (채팅창 열 때 자동 호출)"""
    count = mark_team_read(team_id)
    return {"ok": True, "marked": count, "unread": get_unread_count()}


@router.delete("/api/notifications/{notif_id}")
async def del_notif(notif_id: str):
    """알림 삭제"""
    ok = delete_notification(notif_id)
    return {"ok": ok, "unread": get_unread_count()}
