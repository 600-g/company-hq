"""사주 풀이 결과 캐시 — SHA-256 키 SQLite. 같은 사주 = 같은 결과 보장."""
import hashlib
import json
import sqlite3
import time
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent / "saju_cache.db"

KEY_FIELDS = [
    "calendar", "year", "month", "day", "hour", "minute",
    "gender", "is_leap_month", "birth_city",
]


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""CREATE TABLE IF NOT EXISTS saju_cache (
        key TEXT PRIMARY KEY,
        manse_json TEXT NOT NULL,
        interpretation TEXT NOT NULL,
        model_used TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        hit_count INTEGER NOT NULL DEFAULT 0
    )""")
    conn.commit()
    return conn


def make_key(input_dict: dict) -> str:
    canon = {k: input_dict.get(k) for k in KEY_FIELDS}
    blob = json.dumps(canon, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def get(key: str) -> Optional[dict]:
    conn = _conn()
    try:
        cur = conn.execute(
            "SELECT manse_json, interpretation, model_used FROM saju_cache WHERE key=?",
            (key,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        conn.execute("UPDATE saju_cache SET hit_count=hit_count+1 WHERE key=?", (key,))
        conn.commit()
        return {
            "manse": json.loads(row[0]),
            "interpretation": row[1],
            "model_used": row[2],
        }
    finally:
        conn.close()


def put(key: str, manse: dict, interpretation: str, model_used: str) -> None:
    conn = _conn()
    try:
        conn.execute(
            """INSERT OR REPLACE INTO saju_cache
               (key, manse_json, interpretation, model_used, created_at, hit_count)
               VALUES (?, ?, ?, ?, ?, COALESCE(
                   (SELECT hit_count FROM saju_cache WHERE key=?), 0))""",
            (key, json.dumps(manse, ensure_ascii=False), interpretation, model_used,
             int(time.time()), key),
        )
        conn.commit()
    finally:
        conn.close()


def stats() -> dict:
    conn = _conn()
    try:
        cur = conn.execute("SELECT COUNT(*), COALESCE(SUM(hit_count), 0) FROM saju_cache")
        total, hits = cur.fetchone()
        cur2 = conn.execute("SELECT model_used, COUNT(*) FROM saju_cache GROUP BY model_used")
        by_model = dict(cur2.fetchall())
        return {"entries": total, "total_hits": hits, "by_model": by_model}
    finally:
        conn.close()
