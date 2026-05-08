"""웹 푸시 알림 — VAPID 구독 + 알림 저장소 + 배지 카운트"""

import os
import json
import logging
import typing
import uuid
from datetime import datetime
from pathlib import Path
from pywebpush import webpush, WebPushException

_log = logging.getLogger(__name__)

# ── 웹 접속 상태 체크 (WS 활성 연결 유무) ──────────────────
# ws_handler 등 외부에서 콜백 등록 → 순환 import 회피
_is_user_online: typing.Callable[[], bool] | None = None

def set_online_checker(fn: typing.Callable[[], bool]):
    """웹소켓 활성 연결 여부를 반환하는 콜백 등록"""
    global _is_user_online
    _is_user_online = fn

def _user_is_online() -> bool:
    """유저가 현재 웹에서 접속 중인지 확인"""
    if _is_user_online is not None:
        try:
            return _is_user_online()
        except Exception:
            pass
    return False

# ── VAPID 설정 (lazy load — main.py의 load_dotenv() 이후 읽힘) ──
def _get_vapid():
    return {
        "private": os.getenv("VAPID_PRIVATE_KEY", ""),
        "public": os.getenv("VAPID_PUBLIC_KEY", ""),
        "email": os.getenv("VAPID_EMAIL", "mailto:admin@600g.net"),
    }

# ── 구독 저장소 ─────────────────────────────────────────
_SUBS_FILE = Path(__file__).parent / "push_subscriptions.json"

def _load_subscriptions() -> list[dict]:
    if _SUBS_FILE.exists():
        try:
            return json.loads(_SUBS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []

def _save_subscriptions(subs: list[dict]):
    _SUBS_FILE.write_text(json.dumps(subs, ensure_ascii=False, indent=2), encoding="utf-8")

_subscriptions: list[dict] = _load_subscriptions()

# ── 알림 저장소 (인앱 알림 목록) ────────────────────────
_NOTIF_FILE = Path(__file__).parent / "notifications.json"
_MAX_NOTIFICATIONS = 50

def _load_notifications() -> list[dict]:
    if _NOTIF_FILE.exists():
        try:
            return json.loads(_NOTIF_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []

def _save_notifications(notifs: list[dict]):
    trimmed = notifs[-_MAX_NOTIFICATIONS:]
    _NOTIF_FILE.write_text(json.dumps(trimmed, ensure_ascii=False, indent=None), encoding="utf-8")

_notifications: list[dict] = _load_notifications()


def _add_notification(title: str, body: str, team_id: str = "", tag: str = "default") -> dict:
    """인앱 알림 저장 → 목록에 추가"""
    notif = {
        "id": uuid.uuid4().hex[:8],
        "title": title,
        "body": body[:200],
        "team_id": team_id,
        "tag": tag,
        "read": False,
        "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    _notifications.append(notif)
    # 최대 개수 유지
    if len(_notifications) > _MAX_NOTIFICATIONS:
        del _notifications[:len(_notifications) - _MAX_NOTIFICATIONS]
    _save_notifications(_notifications)
    return notif


# ── 알림 API 함수들 ─────────────────────────────────────

def get_notifications() -> list[dict]:
    """알림 목록 반환 (최신순)"""
    return list(reversed(_notifications))

def get_unread_count() -> int:
    """안 읽은 알림 수"""
    return sum(1 for n in _notifications if not n["read"])

def mark_read(notif_id: str) -> bool:
    """개별 알림 읽음 처리"""
    for n in _notifications:
        if n["id"] == notif_id:
            n["read"] = True
            _save_notifications(_notifications)
            return True
    return False

def mark_all_read() -> int:
    """전체 읽음 처리"""
    count = 0
    for n in _notifications:
        if not n["read"]:
            n["read"] = True
            count += 1
    if count > 0:
        _save_notifications(_notifications)
    return count

def mark_team_read(team_id: str) -> int:
    """특정 팀의 미읽은 알림 일괄 읽음 처리"""
    count = 0
    for n in _notifications:
        if n.get("team_id") == team_id and not n["read"]:
            n["read"] = True
            count += 1
    if count > 0:
        _save_notifications(_notifications)
    return count


def delete_notification(notif_id: str) -> bool:
    """알림 삭제"""
    before = len(_notifications)
    remaining = [n for n in _notifications if n["id"] != notif_id]
    if len(remaining) == before:
        return False
    _notifications.clear()
    _notifications.extend(remaining)
    _save_notifications(_notifications)
    return True


# ── VAPID / 구독 ────────────────────────────────────────

def get_vapid_public_key() -> str:
    return _get_vapid()["public"]

def add_subscription(sub_info: dict, topics: list[str] | None = None) -> bool:
    """sub_info 에 topics 필드 추가. 기본 ['hq','trading'] 둘 다 받음."""
    endpoint = sub_info.get("endpoint", "")
    if not endpoint:
        return False
    if topics is None:
        topics = sub_info.get("topics") or ["hq", "trading"]
    sub_info["topics"] = topics
    for i, s in enumerate(_subscriptions):
        if s.get("endpoint") == endpoint:
            _subscriptions[i] = sub_info
            _save_subscriptions(_subscriptions)
            return True
    _subscriptions.append(sub_info)
    _save_subscriptions(_subscriptions)
    _log.info(f"[PUSH] 새 구독 등록 topics={topics} (총 {len(_subscriptions)}개)")
    return True

def update_topics(endpoint: str, topics: list[str]) -> bool:
    """기존 구독자의 topics 변경 (사용자가 토글로 on/off)."""
    for s in _subscriptions:
        if s.get("endpoint") == endpoint:
            s["topics"] = topics
            _save_subscriptions(_subscriptions)
            _log.info(f"[PUSH] topics 변경: {topics}")
            return True
    return False

def get_topics(endpoint: str) -> list[str]:
    for s in _subscriptions:
        if s.get("endpoint") == endpoint:
            return s.get("topics") or ["hq", "trading"]
    return []

# ── 트레이딩봇 전용 인앱 알림 저장소 ─────────────
_TRADING_NOTIF_FILE = Path(__file__).resolve().parent / "trading_notifications.json"
def _load_trading_notif() -> list[dict]:
    if _TRADING_NOTIF_FILE.exists():
        try: return json.loads(_TRADING_NOTIF_FILE.read_text(encoding="utf-8"))
        except Exception: return []
    return []
def _save_trading_notif(items: list[dict]):
    _TRADING_NOTIF_FILE.write_text(json.dumps(items[-200:], ensure_ascii=False, indent=2), encoding="utf-8")
def add_trading_notif(title: str, body: str, severity: str = "info") -> dict:
    items = _load_trading_notif()
    item = {
        "id": f"tr_{int(datetime.now().timestamp() * 1000)}",
        "title": title, "body": body, "severity": severity,
        "ts": datetime.now().isoformat(), "read": False,
    }
    items.append(item)
    _save_trading_notif(items)
    return item
def get_trading_notif(limit: int = 50) -> list[dict]:
    return list(reversed(_load_trading_notif()))[:limit]
def mark_trading_notif_read():
    items = _load_trading_notif()
    for it in items: it["read"] = True
    _save_trading_notif(items)

def remove_subscription(endpoint: str) -> bool:
    before = len(_subscriptions)
    subs = [s for s in _subscriptions if s.get("endpoint") != endpoint]
    if len(subs) == before:
        return False
    _subscriptions.clear()
    _subscriptions.extend(subs)
    _save_subscriptions(_subscriptions)
    return True


# ── 푸시 발송 (+ 인앱 알림 자동 저장) ───────────────────

def send_push(title: str, body: str, tag: str = "default", url: str = "/", team_id: str = "", topic: str = "hq") -> int:
    """푸시 발송 + 인앱 알림 저장. topic 매칭 구독자에만 발송.
    topic: 'hq' (두근컴퍼니, 인앱창에 표시) | 'trading' (트레이딩봇, 두근컴퍼니 인앱 분리 + 항상 푸시)
    """
    is_trading = (topic == "trading")

    if is_trading:
        # 트레이딩봇 — 별도 저장소 (두근컴퍼니 인앱창과 분리)
        try:
            sev = "danger" if any(x in title for x in ("🚨","❌")) else ("warn" if "⚠️" in title else "info")
            add_trading_notif(title, body, severity=sev)
        except Exception as e:
            _log.warning(f"[PUSH] trading notif 저장 실패: {e}")
    else:
        # 두근컴퍼니 — 기존 인앱 알림창
        _add_notification(title, body, team_id=team_id, tag=tag)

    # trading 토픽은 두근컴퍼니 _user_is_online 무시 — 사용자가 두근컴퍼니 보고 있어도 트레이딩 푸시는 받아야 함
    if not is_trading and _user_is_online():
        _log.info(f"[PUSH] 유저 온라인 — 푸시 스킵 (인앱만 저장): {title}")
        return 0

    vapid = _get_vapid()
    if not vapid["private"] or not _subscriptions:
        return 0

    unread = get_unread_count()
    payload = json.dumps({
        "title": title,
        "body": body[:200],
        "tag": tag,
        "url": url,
        "team_id": team_id,
        "topic": topic,
        "badge_count": unread,
        "timestamp": datetime.now().isoformat(),
    }, ensure_ascii=False)

    success = 0
    expired = []

    for sub in _subscriptions:
        # topic 매칭 — 구독자가 해당 topic 구독 중이어야 발송
        sub_topics = sub.get("topics") or ["hq", "trading"]  # 기본: 둘 다
        if topic not in sub_topics:
            continue
        try:
            webpush(
                subscription_info=sub,
                data=payload,
                vapid_private_key=vapid["private"],
                vapid_claims={"sub": vapid["email"]},
            )
            success += 1
        except WebPushException as e:
            if hasattr(e, "response") and e.response is not None and e.response.status_code == 410:
                expired.append(sub.get("endpoint"))
            else:
                _log.warning(f"[PUSH] 발송 실패: {e}")
        except Exception as e:
            _log.warning(f"[PUSH] 예외: {e}")

    if expired:
        subs = [s for s in _subscriptions if s.get("endpoint") not in expired]
        _subscriptions.clear()
        _subscriptions.extend(subs)
        _save_subscriptions(_subscriptions)

    return success


# ── 편의 함수들 ─────────────────────────────────────────

def send_agent_complete(team_name: str, team_emoji: str, preview: str, team_id: str = ""):
    """에이전트 응답 완료 알림"""
    send_push(
        title=f"{team_emoji} {team_name} 응답 완료",
        body=preview[:150],
        tag=f"agent-{team_id or team_name}",
        url="/",
        team_id=team_id,
    )

def send_server_error(error_msg: str):
    """서버 오류 알림"""
    send_push(
        title="⚠️ 서버 오류 감지",
        body=error_msg[:150],
        tag="server-error",
        url="/",
        team_id="server-monitor",
    )

def send_schedule_notify(title: str, message: str):
    """스케줄/기타 알림"""
    send_push(
        title=title,
        body=message[:150],
        tag="schedule",
        url="/",
    )
