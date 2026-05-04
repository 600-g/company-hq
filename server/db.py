"""두근컴퍼니 SQLite 저장소.

목적: chat_history JSON 파일 누적 → SQLite 단일 DB 로 통합.
- 매 메시지마다 전체 JSON 재작성하던 패턴 제거 → row 단위 INSERT/UPDATE
- 디스크 I/O ~1/100, 검색 인덱스 가능, 백업 단순화

스키마:
    messages         — 모든 채팅 메시지 (team_id, session_id, role, content, ts, tools_json, ...)
    sessions         — 세션 메타 (id, team_id, label, created_at, ...)
    state_kv         — doogeun_state (agents, layout) 단일 KV (다음 단계에서 활용)

외부 의존성 0 (Python 3.x 표준 `sqlite3`).
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Iterable

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent / "doogeun.db"
_lock = threading.Lock()
_initialized = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    id           TEXT PRIMARY KEY,            -- 클라 또는 서버 측 UUID
    team_id      TEXT NOT NULL,
    session_id   TEXT NOT NULL,
    role         TEXT NOT NULL,               -- user | agent | system
    content      TEXT NOT NULL DEFAULT '',
    ts           INTEGER NOT NULL,            -- ms epoch
    agent_name   TEXT,
    agent_emoji  TEXT,
    images_json  TEXT,                        -- JSON array of base64 data urls
    tools_json   TEXT,                        -- JSON array of tool entries
    handoff_json TEXT,                        -- JSON object (handoff payload)
    extra_json   TEXT                         -- 그 외 필드 (retry, streaming flag 등)
);
CREATE INDEX IF NOT EXISTS ix_messages_team_session_ts
    ON messages(team_id, session_id, ts);
CREATE INDEX IF NOT EXISTS ix_messages_team_ts
    ON messages(team_id, ts);

CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT NOT NULL,
    team_id     TEXT NOT NULL,
    label       TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (team_id, id)
);
CREATE INDEX IF NOT EXISTS ix_sessions_team_updated
    ON sessions(team_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS state_kv (
    key         TEXT PRIMARY KEY,
    value_json  TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
);
"""


def _conn() -> sqlite3.Connection:
    """매 호출마다 새 connection — sqlite3 는 thread-local 권장."""
    conn = sqlite3.connect(str(DB_PATH), timeout=10.0, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")          # 동시 read/write
    conn.execute("PRAGMA synchronous=NORMAL")        # 무결성 충분 + 빠름
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """첫 import 시 1회 실행. idempotent."""
    global _initialized
    if _initialized:
        return
    with _lock:
        if _initialized:
            return
        try:
            with _conn() as c:
                c.executescript(SCHEMA)
            _initialized = True
            logger.info("[db] SQLite 초기화 완료: %s", DB_PATH)
        except Exception as e:
            logger.error("[db] init 실패: %s", e)
            raise


# ── messages ──────────────────────────────────────────────────────

def _msg_to_row(team_id: str, session_id: str, msg: dict) -> tuple:
    """message dict → row tuple (스키마 순서). id 누락/중복 방지용 fallback 은 uuid4."""
    return (
        msg.get("id") or msg.get("uuid") or f"auto-{uuid.uuid4().hex[:16]}",
        team_id,
        session_id,
        msg.get("role") or msg.get("type") or "user",
        msg.get("content") or "",
        int(msg.get("ts") or time.time() * 1000),
        msg.get("agentName") or msg.get("agent_name"),
        msg.get("agentEmoji") or msg.get("agent_emoji"),
        json.dumps(msg["images"], ensure_ascii=False) if msg.get("images") else None,
        json.dumps(msg["tools"], ensure_ascii=False) if msg.get("tools") else None,
        json.dumps(msg["handoff"], ensure_ascii=False) if msg.get("handoff") else None,
        json.dumps({k: msg[k] for k in msg if k not in {
            "id", "uuid", "role", "type", "content", "ts",
            "agentName", "agent_name", "agentEmoji", "agent_emoji",
            "images", "tools", "handoff",
        }}, ensure_ascii=False) if msg else None,
    )


def _row_to_msg(row: sqlite3.Row) -> dict:
    """row → message dict (프론트 호환 형식)."""
    msg: dict[str, Any] = {
        "id": row["id"],
        "role": row["role"],
        "content": row["content"] or "",
        "ts": row["ts"],
    }
    if row["agent_name"]:
        msg["agentName"] = row["agent_name"]
    if row["agent_emoji"]:
        msg["agentEmoji"] = row["agent_emoji"]
    if row["images_json"]:
        try: msg["images"] = json.loads(row["images_json"])
        except Exception: pass
    if row["tools_json"]:
        try: msg["tools"] = json.loads(row["tools_json"])
        except Exception: pass
    if row["handoff_json"]:
        try: msg["handoff"] = json.loads(row["handoff_json"])
        except Exception: pass
    if row["extra_json"]:
        try:
            extra = json.loads(row["extra_json"])
            for k, v in extra.items():
                if k not in msg:
                    msg[k] = v
        except Exception: pass
    return msg


def replace_session_messages(team_id: str, session_id: str, messages: list[dict]) -> None:
    """세션의 messages 를 통째 치환 (sessions_store._save_messages 호환).
    트랜잭션 1회 — DELETE + bulk INSERT.
    """
    init_db()
    try:
        rows = [_msg_to_row(team_id, session_id, m) for m in messages]
        with _lock, _conn() as c:
            c.execute("BEGIN")
            c.execute(
                "DELETE FROM messages WHERE team_id = ? AND session_id = ?",
                (team_id, session_id),
            )
            if rows:
                c.executemany(
                    """INSERT OR REPLACE INTO messages
                       (id, team_id, session_id, role, content, ts,
                        agent_name, agent_emoji, images_json, tools_json,
                        handoff_json, extra_json)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                    rows,
                )
            c.execute("COMMIT")
    except Exception as e:
        logger.warning("[db] replace_session_messages %s/%s 실패: %s",
                       team_id, session_id, e)


def append_message(team_id: str, session_id: str, msg: dict) -> None:
    """단일 메시지 INSERT — 신규 메시지 도착 시 가장 가벼운 path."""
    init_db()
    try:
        row = _msg_to_row(team_id, session_id, msg)
        with _lock, _conn() as c:
            c.execute(
                """INSERT OR REPLACE INTO messages
                   (id, team_id, session_id, role, content, ts,
                    agent_name, agent_emoji, images_json, tools_json,
                    handoff_json, extra_json)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                row,
            )
    except Exception as e:
        logger.warning("[db] append_message %s/%s 실패: %s",
                       team_id, session_id, e)


def get_session_messages(team_id: str, session_id: str, limit: int | None = None) -> list[dict]:
    """세션 메시지 ts 오름차순. limit 지정 시 최근 N 개만 (역으로 fetch 후 reverse)."""
    init_db()
    try:
        with _conn() as c:
            if limit:
                rows = c.execute(
                    """SELECT * FROM messages
                       WHERE team_id = ? AND session_id = ?
                       ORDER BY ts DESC LIMIT ?""",
                    (team_id, session_id, limit),
                ).fetchall()
                return [_row_to_msg(r) for r in reversed(rows)]
            rows = c.execute(
                """SELECT * FROM messages
                   WHERE team_id = ? AND session_id = ?
                   ORDER BY ts ASC""",
                (team_id, session_id),
            ).fetchall()
            return [_row_to_msg(r) for r in rows]
    except Exception as e:
        logger.warning("[db] get_session_messages %s/%s 실패: %s",
                       team_id, session_id, e)
        return []


def delete_session(team_id: str, session_id: str) -> None:
    """세션 삭제 — messages + sessions row 모두 제거."""
    init_db()
    try:
        with _lock, _conn() as c:
            c.execute("BEGIN")
            c.execute(
                "DELETE FROM messages WHERE team_id = ? AND session_id = ?",
                (team_id, session_id),
            )
            c.execute(
                "DELETE FROM sessions WHERE team_id = ? AND id = ?",
                (team_id, session_id),
            )
            c.execute("COMMIT")
    except Exception as e:
        logger.warning("[db] delete_session %s/%s 실패: %s",
                       team_id, session_id, e)


# ── state_kv (doogeun_state 등 key-value 영속) ─────────────────────

def state_kv_get(key: str) -> dict | None:
    """key 로 JSON 디코드된 값 반환. 없으면 None."""
    init_db()
    try:
        with _conn() as c:
            row = c.execute("SELECT value_json FROM state_kv WHERE key = ?", (key,)).fetchone()
        if not row:
            return None
        return json.loads(row["value_json"])
    except Exception as e:
        logger.warning("[db] state_kv_get %s 실패: %s", key, e)
        return None


def state_kv_set(key: str, value: dict) -> None:
    """key 에 JSON 직렬화 값 저장 (UPSERT)."""
    init_db()
    try:
        body = json.dumps(value, ensure_ascii=False)
        ts = int(time.time() * 1000)
        with _lock, _conn() as c:
            c.execute(
                """INSERT INTO state_kv (key, value_json, updated_at)
                   VALUES (?, ?, ?)
                   ON CONFLICT(key) DO UPDATE SET
                     value_json = excluded.value_json,
                     updated_at = excluded.updated_at""",
                (key, body, ts),
            )
    except Exception as e:
        logger.warning("[db] state_kv_set %s 실패: %s", key, e)


def stats() -> dict:
    """전체 통계 — 디버깅/모니터링용."""
    init_db()
    try:
        with _conn() as c:
            msgs = c.execute("SELECT COUNT(*) AS n FROM messages").fetchone()["n"]
            sess = c.execute("SELECT COUNT(*) AS n FROM sessions").fetchone()["n"]
            db_size = DB_PATH.stat().st_size if DB_PATH.exists() else 0
        return {
            "messages": msgs,
            "sessions": sess,
            "db_bytes": db_size,
            "db_mb": round(db_size / 1024 / 1024, 2),
        }
    except Exception as e:
        return {"error": str(e)}
