"""팀별 세션 스토어 — 한 팀 안에서 여러 대화 세션 분리.

구조
----
chat_history/
  {team_id}/
    _meta.json             # 세션 메타 [{id, title, createdAt, updatedAt, messageCount, claudeSessionId?}]
    _active.json           # 현재 active 세션 id
    {session_id}.json      # 세션별 메시지 배열

하위 호환
--------
- 기존 chat_history/{team_id}.json 단일 파일이 있으면 "default" 세션으로 자동 마이그레이션
- session_id가 없는 호출은 해당 팀의 active 세션(없으면 default 생성)을 사용

TeamMaker sessionStore.ts 패턴 차용. persist는 파일시스템.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

_BASE_DIR = Path(__file__).parent / "chat_history"
_BASE_DIR.mkdir(exist_ok=True)

_DEFAULT_TITLE = "기본 세션"
_MAX_MESSAGES_PER_SESSION = 200
_MAX_SESSIONS_PER_TEAM = 20


# ── 경로 헬퍼 ──────────────────────────────────────

def _team_dir(team_id: str) -> Path:
    d = _BASE_DIR / team_id
    d.mkdir(exist_ok=True)
    return d


def _meta_path(team_id: str) -> Path:
    return _team_dir(team_id) / "_meta.json"


def _active_path(team_id: str) -> Path:
    return _team_dir(team_id) / "_active.json"


def _session_path(team_id: str, session_id: str) -> Path:
    return _team_dir(team_id) / f"{session_id}.json"


def _legacy_path(team_id: str) -> Path:
    return _BASE_DIR / f"{team_id}.json"


# ── 메타 I/O ───────────────────────────────────────

def _load_meta(team_id: str) -> list[dict]:
    p = _meta_path(team_id)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning("[sessions] meta load 실패 %s: %s", team_id, e)
    return []


def _save_meta(team_id: str, meta: list[dict]) -> None:
    _meta_path(team_id).write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _load_active(team_id: str) -> str | None:
    p = _active_path(team_id)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8")).get("sessionId")
        except Exception:
            pass
    return None


def _save_active(team_id: str, session_id: str) -> None:
    _active_path(team_id).write_text(
        json.dumps({"sessionId": session_id}, ensure_ascii=False), encoding="utf-8"
    )


# ── 메시지 I/O ─────────────────────────────────────

def _load_messages(team_id: str, session_id: str) -> list[dict]:
    p = _session_path(team_id, session_id)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning("[sessions] messages load 실패 %s/%s: %s", team_id, session_id, e)
    return []


def _save_messages(team_id: str, session_id: str, messages: list[dict]) -> None:
    trimmed = messages[-_MAX_MESSAGES_PER_SESSION:]
    _session_path(team_id, session_id).write_text(
        json.dumps(trimmed, ensure_ascii=False), encoding="utf-8"
    )


# ── 마이그레이션 ───────────────────────────────────

def _ensure_default_session(team_id: str) -> str:
    """팀에 세션이 하나도 없으면 default 생성.
    기존 legacy 파일(chat_history/{team_id}.json)이 있으면 그 메시지를 옮겨준다.
    """
    meta = _load_meta(team_id)
    if meta:
        return meta[0]["id"]

    session_id = "default"
    now = int(time.time() * 1000)

    # legacy 파일 마이그레이션
    legacy = _legacy_path(team_id)
    legacy_messages: list[dict] = []
    if legacy.exists():
        try:
            legacy_messages = json.loads(legacy.read_text(encoding="utf-8"))
            logger.info("[sessions] %s legacy → default 세션으로 이전 (%d개 메시지)",
                        team_id, len(legacy_messages))
        except Exception as e:
            logger.warning("[sessions] legacy 로드 실패 %s: %s", team_id, e)

    meta = [{
        "id": session_id,
        "title": _DEFAULT_TITLE,
        "createdAt": now,
        "updatedAt": now,
        "messageCount": len(legacy_messages),
    }]
    _save_meta(team_id, meta)
    _save_messages(team_id, session_id, legacy_messages)
    _save_active(team_id, session_id)

    # legacy 파일은 백업 후 제거
    if legacy.exists():
        try:
            backup = legacy.with_suffix(".json.bak")
            legacy.rename(backup)
        except Exception:
            pass

    return session_id


# ── 공개 API ───────────────────────────────────────

def list_sessions(team_id: str, *, include_resume_state: bool = True) -> list[dict]:
    """팀의 세션 목록 (최신 순). 없으면 default 1개 자동 생성.

    include_resume_state=True면 각 세션에 `resumable`(bool) 필드 추가 —
    claudeSessionId의 .jsonl 파일이 실제로 남아있어 --resume 가능한지 여부.
    """
    _ensure_default_session(team_id)
    meta = _load_meta(team_id)
    ordered = sorted(meta, key=lambda s: s.get("updatedAt", 0), reverse=True)
    if include_resume_state:
        for s in ordered:
            s["resumable"] = _is_resumable(s.get("claudeSessionId"))
    return ordered


def _is_resumable(claude_sid: str | None) -> bool:
    """claude session jsonl 파일이 실제로 남아있고 크기 상한 이내인지 확인.
    circular import 방지를 위해 여기서 직접 검사 (claude_runner._session_ok와 동일 기준).
    """
    if not claude_sid:
        return False
    try:
        from pathlib import Path as _P
        base = _P.home() / ".claude" / "projects"
        for proj_dir in base.iterdir():
            p = proj_dir / f"{claude_sid}.jsonl"
            if p.exists():
                size = p.stat().st_size
                return size <= 10 * 1024 * 1024
    except Exception:
        pass
    return False


def get_active_session_id(team_id: str) -> str:
    """현재 active 세션 id. 없으면 default 생성 후 반환."""
    active = _load_active(team_id)
    meta = _load_meta(team_id)
    meta_ids = {s["id"] for s in meta}

    if active and active in meta_ids:
        return active

    if meta:
        # active가 유효하지 않으면 가장 최근 세션으로
        fallback = sorted(meta, key=lambda s: s.get("updatedAt", 0), reverse=True)[0]["id"]
        _save_active(team_id, fallback)
        return fallback

    return _ensure_default_session(team_id)


def resolve_session_id(team_id: str, session_id: str | None) -> str:
    """None이면 active 세션을 반환, 주어진 id가 유효하지 않으면 active로 폴백."""
    if not session_id:
        return get_active_session_id(team_id)
    meta = _load_meta(team_id)
    if any(s["id"] == session_id for s in meta):
        return session_id
    return get_active_session_id(team_id)


def create_session(team_id: str, title: str | None = None) -> dict:
    """새 세션 생성. 상한 초과 시 가장 오래된 세션 자동 삭제."""
    meta = list_sessions(team_id)

    if len(meta) >= _MAX_SESSIONS_PER_TEAM:
        # 가장 오래된 세션 삭제
        oldest = sorted(meta, key=lambda s: s.get("updatedAt", 0))[0]
        delete_session(team_id, oldest["id"])
        meta = _load_meta(team_id)

    now = int(time.time() * 1000)
    session_id = str(uuid.uuid4())
    session = {
        "id": session_id,
        "title": title or f"세션 {len(meta) + 1}",
        "createdAt": now,
        "updatedAt": now,
        "messageCount": 0,
    }
    meta.append(session)
    _save_meta(team_id, meta)
    _save_messages(team_id, session_id, [])
    _save_active(team_id, session_id)
    logger.info("[sessions] 새 세션 %s/%s (%s)", team_id, session_id, session["title"])
    return session


def delete_session(team_id: str, session_id: str) -> bool:
    """세션 삭제. default 세션만 남는 경우 default는 삭제 불가(빈 세션으로 리셋)."""
    meta = _load_meta(team_id)
    target = next((s for s in meta if s["id"] == session_id), None)
    if not target:
        return False

    # 마지막 세션이면 삭제 대신 리셋
    if len(meta) <= 1:
        _save_messages(team_id, session_id, [])
        target["messageCount"] = 0
        target["updatedAt"] = int(time.time() * 1000)
        target["claudeSessionId"] = None
        _save_meta(team_id, meta)
        logger.info("[sessions] 마지막 세션이라 삭제 대신 리셋: %s/%s", team_id, session_id)
        return True

    # 메시지 파일 제거
    try:
        _session_path(team_id, session_id).unlink()
    except FileNotFoundError:
        pass

    # 메타 업데이트
    new_meta = [s for s in meta if s["id"] != session_id]
    _save_meta(team_id, new_meta)

    # active였으면 다른 세션으로 전환
    active = _load_active(team_id)
    if active == session_id:
        new_active = sorted(new_meta, key=lambda s: s.get("updatedAt", 0), reverse=True)[0]["id"]
        _save_active(team_id, new_active)

    logger.info("[sessions] 삭제 %s/%s", team_id, session_id)
    return True


def rename_session(team_id: str, session_id: str, new_title: str) -> bool:
    meta = _load_meta(team_id)
    target = next((s for s in meta if s["id"] == session_id), None)
    if not target:
        return False
    target["title"] = new_title.strip()[:80] or _DEFAULT_TITLE
    target["updatedAt"] = int(time.time() * 1000)
    _save_meta(team_id, meta)
    return True


def switch_session(team_id: str, session_id: str) -> bool:
    """active 세션 변경. 주어진 id가 없으면 False."""
    meta = _load_meta(team_id)
    if not any(s["id"] == session_id for s in meta):
        return False
    _save_active(team_id, session_id)
    return True


def get_messages(team_id: str, session_id: str | None = None) -> list[dict]:
    sid = resolve_session_id(team_id, session_id)
    return _load_messages(team_id, sid)


def add_message(
    team_id: str,
    msg_type: str,
    content: str,
    session_id: str | None = None,
) -> str:
    """메시지 추가. 사용된 session_id를 반환(호출 측이 WS 라우팅에 사용)."""
    sid = resolve_session_id(team_id, session_id)
    messages = _load_messages(team_id, sid)
    messages.append({"type": msg_type, "content": content})
    if len(messages) > _MAX_MESSAGES_PER_SESSION:
        messages = messages[-_MAX_MESSAGES_PER_SESSION:]
    _save_messages(team_id, sid, messages)
    _touch_session(team_id, sid, message_count=len(messages))
    return sid


def set_messages(team_id: str, session_id: str, messages: list[dict]) -> None:
    """메시지 리스트 강제 교체 (취소/트림 시)."""
    sid = resolve_session_id(team_id, session_id)
    _save_messages(team_id, sid, messages)
    _touch_session(team_id, sid, message_count=len(messages))


def clear_session(team_id: str, session_id: str | None = None) -> str:
    """세션의 메시지만 비움(세션 자체는 유지)."""
    sid = resolve_session_id(team_id, session_id)
    _save_messages(team_id, sid, [])
    _touch_session(team_id, sid, message_count=0, claude_session_id=None)
    return sid


def _touch_session(
    team_id: str,
    session_id: str,
    *,
    message_count: int | None = None,
    claude_session_id: str | None | object = ...,
) -> None:
    meta = _load_meta(team_id)
    target = next((s for s in meta if s["id"] == session_id), None)
    if not target:
        return
    target["updatedAt"] = int(time.time() * 1000)
    if message_count is not None:
        target["messageCount"] = message_count
    if claude_session_id is not ...:
        if claude_session_id is None:
            target.pop("claudeSessionId", None)
        else:
            target["claudeSessionId"] = claude_session_id
    _save_meta(team_id, meta)


def get_claude_session_id(team_id: str, session_id: str | None = None) -> str | None:
    sid = resolve_session_id(team_id, session_id)
    meta = _load_meta(team_id)
    target = next((s for s in meta if s["id"] == sid), None)
    return target.get("claudeSessionId") if target else None


def set_claude_session_id(team_id: str, session_id: str | None, claude_sid: str | None) -> None:
    sid = resolve_session_id(team_id, session_id)
    _touch_session(team_id, sid, claude_session_id=claude_sid)


def delete_all_for_team(team_id: str) -> None:
    """팀 자체가 삭제될 때 호출 — 팀 디렉토리 통째로 제거."""
    d = _BASE_DIR / team_id
    if not d.exists():
        return
    for p in d.iterdir():
        try:
            p.unlink()
        except Exception:
            pass
    try:
        d.rmdir()
    except Exception:
        pass
    # legacy 파일도 함께 정리
    legacy = _legacy_path(team_id)
    legacy_bak = legacy.with_suffix(".json.bak")
    for p in (legacy, legacy_bak):
        if p.exists():
            try:
                p.unlink()
            except Exception:
                pass
