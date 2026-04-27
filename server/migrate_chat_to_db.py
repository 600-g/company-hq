"""기존 chat_history/*.json → SQLite 일괄 마이그레이션.

사용법:
    cd ~/Developer/my-company/company-hq/server && source venv/bin/activate
    python3 migrate_chat_to_db.py [--dry-run]

idempotent: 여러 번 실행해도 같은 결과 (REPLACE 기반).
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import db

CHAT_DIR = Path(__file__).parent / "chat_history"


def main(dry_run: bool = False) -> None:
    if not CHAT_DIR.exists():
        print(f"❌ {CHAT_DIR} 없음")
        return

    db.init_db()
    teams = sorted([p for p in CHAT_DIR.iterdir() if p.is_dir()])
    print(f"📋 {len(teams)}개 팀 디렉토리 발견")

    total_msgs = 0
    total_sess = 0

    for team_dir in teams:
        team_id = team_dir.name
        meta_file = team_dir / "_meta.json"
        if meta_file.exists():
            try:
                meta = json.loads(meta_file.read_text(encoding="utf-8"))
            except Exception as e:
                print(f"  ⚠ {team_id} _meta.json 파싱 실패: {e}")
                continue
        else:
            # legacy: {team_id}.json 또는 디렉토리 안의 JSON 파일들 — 단일 default 세션
            meta = [{"id": "default", "title": "default", "createdAt": int(time.time() * 1000), "updatedAt": int(time.time() * 1000), "messageCount": 0}]

        for session_meta in meta:
            session_id = session_meta["id"]
            session_file = team_dir / f"{session_id}.json"
            if not session_file.exists():
                continue
            try:
                msgs = json.loads(session_file.read_text(encoding="utf-8"))
                if not isinstance(msgs, list):
                    continue
            except Exception as e:
                print(f"  ⚠ {team_id}/{session_id} 파싱 실패: {e}")
                continue

            if dry_run:
                print(f"  [dry] {team_id}/{session_id}: {len(msgs)}개 메시지 → DB")
            else:
                db.replace_session_messages(team_id, session_id, msgs)
                print(f"  ✓ {team_id}/{session_id}: {len(msgs)}개 → DB")

            total_msgs += len(msgs)
            total_sess += 1

    print()
    print(f"📊 결과: {total_sess}개 세션, {total_msgs}개 메시지")
    if not dry_run:
        s = db.stats()
        print(f"   DB 통계: {s}")


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    main(dry_run=dry)
