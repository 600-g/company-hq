"""
브라우저 진단 로그 + 버그 리포트 + 자동 복구 ticket — main.py 분할 5차 (안정화 2026-05-08).

이동:
- DIAG_DIR / DIAG_LOG_PATH / DIAG_REPORTS_PATH 상수
- _append_jsonl / _trim_jsonl / _find_duplicate_report 헬퍼
- _record_auto_recovery_ticket / _mark_auto_recovery_critical (ws_handler 가 import)
- POST /api/diag/log              — 브라우저 콘솔 포워드
- GET  /api/diag/logs             — 로그 조회
- POST /api/diag/report           — 버그 리포트 (GitHub Issue 자동 생성 + dup 머지)
- POST /api/diag/report/status    — open/in_progress/resolved 상태 전환
- POST /api/diag/cleanup          — closed 이슈 자동 resolved + 첨부 삭제
- POST /api/diag/auto-fix/{ts}    — 사용자 버그 → CPO 자동 위임 (run_claude lazy import)
- GET  /api/diag/reports          — 리포트 조회

자체 완결: TEAMS / FLOOR_LAYOUT 무관. JSONL + gh CLI + claude_runner(lazy).
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/diag", tags=["diag"])

# ── 경로 ────────────────────────────────────────────────────────
_BASE = Path(__file__).parent.parent
DIAG_DIR = str(_BASE / "diag")
os.makedirs(DIAG_DIR, exist_ok=True)
DIAG_LOG_PATH = os.path.join(DIAG_DIR, "client_logs.jsonl")
DIAG_REPORTS_PATH = os.path.join(DIAG_DIR, "bug_reports.jsonl")
_DIAG_LOG_MAX_LINES = 5000


# ── JSONL 헬퍼 ──────────────────────────────────────────────────
def _append_jsonl(path: str, row: dict) -> None:
    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    except Exception as e:
        logger.warning("diag append failed: %s", e)


def _trim_jsonl(path: str, max_lines: int) -> None:
    try:
        if not os.path.exists(path):
            return
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        if len(lines) <= max_lines:
            return
        with open(path, "w", encoding="utf-8") as f:
            f.writelines(lines[-max_lines:])
    except Exception:
        pass


def _find_duplicate_report(title: str, note: str) -> dict | None:
    """최근 open 리포트 중 title/note 유사도 높으면 반환 (F4 dup detect)"""
    if not os.path.exists(DIAG_REPORTS_PATH):
        return None
    try:
        from difflib import SequenceMatcher
        t_norm = (title or "").strip().lower()
        n_norm = (note or "").strip().lower()
        if not t_norm and not n_norm:
            return None
        with open(DIAG_REPORTS_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()[-40:]
        for line in reversed(lines):
            try:
                r = json.loads(line)
            except Exception:
                continue
            if r.get("status") == "resolved":
                continue
            if not r.get("issue_number"):
                continue
            t2 = (r.get("title") or "").strip().lower()
            n2 = (r.get("note") or "").strip().lower()
            if t_norm and t2:
                ratio = SequenceMatcher(None, t_norm, t2).ratio()
                if ratio >= 0.75:
                    return r
            if n_norm and n2 and len(n_norm) > 10 and len(n2) > 10:
                if n_norm in n2 or n2 in n_norm:
                    return r
                r2 = SequenceMatcher(None, n_norm, n2).ratio()
                if r2 >= 0.8:
                    return r
    except Exception:
        pass
    return None


# ── 자동 복구 ticket (ws_handler 가 직접 import) ────────────────
def _record_auto_recovery_ticket(
    team_id: str,
    team_name: str,
    error_summary: str,
    original_prompt: str,
) -> str:
    """자동 복구 ticket 기록 → ts 반환. CPO 가 완료 시 같은 ts 로 resolved 마킹."""
    ts = datetime.utcnow().isoformat()
    row = {
        "ts": ts,
        "title": f"[자동복구] {team_name} ({team_id}): {error_summary[:120]}",
        "note": (
            f"**원본 사용자 요청**: {original_prompt[:600]}\n\n"
            f"**에러 요약**: {error_summary[:600]}\n\n"
            f"**상태**: CPO 자동 진단/수정/재시도 진행 중. 완료되면 자동 resolved.\n"
        ),
        "user": "auto-recovery",
        "priority": "normal",
        "source": "auto_recovery",
        "team_id": team_id,
        "status": "open",
        "logs": [],
        "meta": {"kind": "auto_recovery"},
        "attachments": [],
    }
    _append_jsonl(DIAG_REPORTS_PATH, row)
    return ts


def _mark_auto_recovery_critical(ts: str) -> bool:
    """5분 내 재발 — CPO 자동 복구도 실패 → status=critical 마킹."""
    try:
        with open(DIAG_REPORTS_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except FileNotFoundError:
        return False
    updated = False
    new_lines: list[str] = []
    for line in lines:
        try:
            row = json.loads(line)
        except Exception:
            new_lines.append(line); continue
        if row.get("ts") == ts:
            row["status"] = "critical"
            row["critical_at"] = datetime.utcnow().isoformat()
            updated = True
        new_lines.append(json.dumps(row, ensure_ascii=False) + "\n")
    if updated:
        with open(DIAG_REPORTS_PATH, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    return updated


# ── 엔드포인트 ──────────────────────────────────────────────────

@router.post("/log")
async def diag_log(body: dict) -> dict:
    """브라우저 console.info/warn/error 포워드. body: {entries: [{level,msg,ts,ua,url,user}]}"""
    entries = body.get("entries") or []
    if not isinstance(entries, list):
        return {"ok": False, "error": "entries 배열 필요"}
    server_ts = datetime.utcnow().isoformat()
    for e in entries[-200:]:
        if not isinstance(e, dict):
            continue
        row = {
            "ts": server_ts,
            "level": str(e.get("level", "info"))[:10],
            "msg": str(e.get("msg", ""))[:4000],
            "ua": str(e.get("ua", ""))[:300],
            "url": str(e.get("url", ""))[:300],
            "user": str(e.get("user", ""))[:80],
            "client_ts": str(e.get("ts", "")),
        }
        _append_jsonl(DIAG_LOG_PATH, row)
    _trim_jsonl(DIAG_LOG_PATH, _DIAG_LOG_MAX_LINES)
    return {"ok": True, "count": len(entries)}


@router.get("/logs")
async def diag_logs(limit: int = 200, level: str | None = None) -> dict:
    """최근 로그 N개 반환. level 필터(info/warn/error) 선택."""
    rows: list[dict] = []
    try:
        if os.path.exists(DIAG_LOG_PATH):
            with open(DIAG_LOG_PATH, "r", encoding="utf-8") as f:
                for line in f:
                    try:
                        r = json.loads(line)
                        if level and r.get("level") != level:
                            continue
                        rows.append(r)
                    except Exception:
                        continue
    except Exception:
        pass
    return {"ok": True, "rows": rows[-limit:]}


@router.post("/report")
async def diag_report(body: dict) -> dict:
    """버그 리포트 제출: {title, note, logs, meta, attachments}"""
    import subprocess
    priority = "urgent" if str(body.get("priority", "")).lower() == "urgent" else "normal"
    # F4: 중복 탐지
    dup = _find_duplicate_report(str(body.get("title", "")), str(body.get("note", "")))
    if dup and dup.get("issue_number"):
        try:
            gh = "/opt/homebrew/bin/gh" if os.path.exists("/opt/homebrew/bin/gh") else "gh"
            user = str((body.get("meta") or {}).get("user", ""))[:80]
            att = (body.get("attachments") or [])[:5]
            att_md = ("\n\n**추가 첨부**:\n" + "\n".join(f"- `{p}`" for p in att)) if att else ""
            comment = (
                f"**추가 리포트** from {user} @ {datetime.utcnow().isoformat()}\n\n"
                f"{str(body.get('note',''))[:1500]}{att_md}"
            )
            subprocess.run(
                [gh, "issue", "comment", str(dup["issue_number"]), "--body", comment],
                cwd="/Users/600mac/Developer/my-company/company-hq",
                capture_output=True, text=True, timeout=10,
            )
            _append_jsonl(DIAG_REPORTS_PATH, {
                "ts": datetime.utcnow().isoformat(),
                "title": f"[dup → #{dup['issue_number']}] {body.get('title', '')}"[:200],
                "note": str(body.get("note", ""))[:1000],
                "user": user,
                "priority": priority,
                "status": "merged",
                "merged_into": dup["issue_number"],
                "merged_into_url": dup.get("issue_url"),
                "attachments": [str(p)[:500] for p in att],
            })
            return {"ok": True, "issue_url": dup.get("issue_url"), "merged": True, "merged_into": dup["issue_number"]}
        except Exception as e:
            logger.warning("dup merge failed: %s", e)
    row = {
        "ts": datetime.utcnow().isoformat(),
        "title": str(body.get("title", ""))[:200],
        "note": str(body.get("note", ""))[:4000],
        "logs": (body.get("logs") or [])[-500:],
        "meta": body.get("meta") or {},
        "user": str((body.get("meta") or {}).get("user", ""))[:80],
        "attachments": [str(p)[:500] for p in (body.get("attachments") or [])][:10],
        "priority": priority,
    }
    _append_jsonl(DIAG_REPORTS_PATH, row)
    issue_url: str | None = None
    try:
        gh = "/opt/homebrew/bin/gh" if os.path.exists("/opt/homebrew/bin/gh") else "gh"
        title = row["title"] or "[auto] 버그 리포트"
        att_md = ""
        if row["attachments"]:
            att_md = "\n\n**Attachments (server paths)**:\n" + "\n".join(f"- `{p}`" for p in row["attachments"])
        body_md = (
            f"**User**: {row['user']}  |  **Priority**: `{priority}`\n\n"
            f"**Note**:\n{row['note']}\n\n"
            f"**UA**: `{row['meta'].get('ua', '')}`\n"
            f"**URL**: `{row['meta'].get('url', '')}`\n"
            f"**Build**: `{row['meta'].get('build', '')}`"
            + att_md + "\n\n"
            + f"<details><summary>최근 로그 {len(row['logs'])}줄</summary>\n\n```\n"
            + "\n".join(f"[{l.get('level','?')}] {l.get('msg','')[:300]}" for l in row['logs'][-80:])
            + "\n```\n</details>"
        )
        labels = "bug,auto,urgent" if priority == "urgent" else "bug,auto"
        cp = subprocess.run(
            [gh, "issue", "create", "--title", title, "--body", body_md, "--label", labels],
            cwd="/Users/600mac/Developer/my-company/company-hq",
            capture_output=True, text=True, timeout=15,
        )
        if cp.returncode == 0:
            issue_url = (cp.stdout or "").strip().splitlines()[-1] if cp.stdout else None
    except Exception as e:
        logger.warning("gh issue create failed: %s", e)
    try:
        import re as _re
        m = _re.search(r"/issues/(\d+)", issue_url or "")
        issue_number = int(m.group(1)) if m else None
        row["issue_url"] = issue_url
        row["issue_number"] = issue_number
        row["status"] = "open"
        with open(DIAG_REPORTS_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()
        if lines:
            lines[-1] = json.dumps(row, ensure_ascii=False) + "\n"
            with open(DIAG_REPORTS_PATH, "w", encoding="utf-8") as f:
                f.writelines(lines)
    except Exception as e:
        logger.warning("report issue linking failed: %s", e)
    return {"ok": True, "issue_url": issue_url}


@router.post("/report/status")
async def diag_set_status(body: dict) -> dict:
    """버그 리포트 상태 변경 — 체크박스 토글로 resolved/open 직접 전환."""
    ts = body.get("ts")
    new_status = body.get("status", "open")
    if not ts:
        return {"ok": False, "error": "ts 필요"}
    if new_status not in ("open", "in_progress", "resolved", "closed"):
        return {"ok": False, "error": "잘못된 status"}
    try:
        with open(DIAG_REPORTS_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except FileNotFoundError:
        return {"ok": False, "error": "리포트 파일 없음"}

    updated = False
    new_lines: list[str] = []
    for line in lines:
        try:
            row = json.loads(line)
        except Exception:
            new_lines.append(line)
            continue
        if row.get("ts") == ts:
            row["status"] = new_status
            if new_status == "resolved":
                row["resolved_at"] = datetime.utcnow().isoformat()
            updated = True
        new_lines.append(json.dumps(row, ensure_ascii=False) + "\n")

    if updated:
        with open(DIAG_REPORTS_PATH, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        return {"ok": True, "status": new_status}
    return {"ok": False, "error": "ts 일치하는 리포트 없음"}


@router.post("/cleanup")
async def diag_cleanup() -> dict:
    """gh CLI로 closed 이슈 확인 → 연결된 report status=resolved + 첨부 이미지 삭제"""
    import subprocess
    gh = "/opt/homebrew/bin/gh" if os.path.exists("/opt/homebrew/bin/gh") else "gh"
    try:
        cp = subprocess.run(
            [gh, "issue", "list", "--repo", "600-g/company-hq", "--state", "closed",
             "--label", "bug,auto", "--limit", "200", "--json", "number"],
            cwd="/Users/600mac/Developer/my-company/company-hq",
            capture_output=True, text=True, timeout=15,
        )
        if cp.returncode != 0:
            return {"ok": False, "error": "gh list failed", "stderr": cp.stderr[:300]}
        closed_numbers = {int(item["number"]) for item in json.loads(cp.stdout or "[]")}
    except Exception as e:
        return {"ok": False, "error": str(e)}

    if not closed_numbers:
        return {"ok": True, "resolved": 0, "deleted_images": 0}

    resolved_count = 0
    deleted_images = 0
    try:
        with open(DIAG_REPORTS_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except FileNotFoundError:
        lines = []

    new_lines: list[str] = []
    for line in lines:
        try:
            row = json.loads(line)
        except Exception:
            new_lines.append(line)
            continue
        num = row.get("issue_number")
        if num and num in closed_numbers and row.get("status") != "resolved":
            row["status"] = "resolved"
            row["resolved_at"] = datetime.utcnow().isoformat()
            resolved_count += 1
            for p in row.get("attachments", []):
                try:
                    if p and os.path.exists(p):
                        os.unlink(p)
                        deleted_images += 1
                except Exception:
                    pass
            row["attachments"] = []
        new_lines.append(json.dumps(row, ensure_ascii=False) + "\n")

    if resolved_count > 0:
        with open(DIAG_REPORTS_PATH, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    return {"ok": True, "resolved": resolved_count, "deleted_images": deleted_images}


@router.post("/auto-fix/{ts}")
async def diag_auto_fix(ts: str) -> dict:
    """사용자가 등록한 버그를 CPO 에 자동 위임. /bugs 페이지의 [AI에 수정 위임] 버튼."""
    import asyncio
    try:
        with open(DIAG_REPORTS_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except FileNotFoundError:
        return {"ok": False, "error": "리포트 파일 없음"}
    target: dict | None = None
    for line in lines:
        try:
            row = json.loads(line)
        except Exception:
            continue
        if row.get("ts") == ts:
            target = row
            break
    if not target:
        return {"ok": False, "error": "ts 일치 리포트 없음"}
    if target.get("status") == "in_progress":
        return {"ok": False, "error": "이미 AI 수정 진행 중"}
    try:
        from claude_runner import run_claude
        prompt = (
            f"[사용자 버그 자동 수정 위임]\n"
            f"ts: {ts}\n"
            f"제목: {target.get('title', '')[:200]}\n"
            f"상세:\n{target.get('note', '')[:2000]}\n\n"
            f"━━━━━ 절차 ━━━━━\n"
            f"1. 진단: 어느 모듈/파일/팀 영역인지 판단\n"
            f"2. 수정: 코드/설정 변경 (배포는 사용자가 [업데이트]로 결정)\n"
            f"3. 필요 시 dispatch block 으로 적합 팀에 위임\n"
            f"   ```dispatch\n"
            f"   [{{\"team\": \"<팀id>\", \"prompt\": \"<작업>\"}}]\n"
            f"   ```\n"
            f"4. 완료 시 반드시 다음 호출로 ticket resolved 처리:\n"
            f"   POST http://localhost:8000/api/diag/report/status\n"
            f"   body: {{\"ts\": \"{ts}\", \"status\": \"resolved\"}}\n"
            f"   ```bash\n"
            f"   curl -s -X POST http://localhost:8000/api/diag/report/status \\\n"
            f"     -H 'Content-Type: application/json' \\\n"
            f"     -d '{{\"ts\":\"{ts}\",\"status\":\"resolved\"}}'\n"
            f"   ```\n"
            f"━━━━━━━━━━━━━━━━━\n"
        )
        await diag_set_status({"ts": ts, "status": "in_progress"})
        cpo_path = "~/Developer/my-company/company-hq"
        async def _bg():
            try:
                async for _ in run_claude(prompt, cpo_path, "cpo-claude"):
                    pass
            except Exception as e:
                logger.warning("[auto-fix] CPO 호출 실패: %s", e)
        asyncio.create_task(_bg())
        return {"ok": True, "ts": ts, "status": "in_progress"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/reports")
async def diag_reports(limit: int = 50, status: str = "") -> dict:
    """버그 리포트 조회. status=open|in_progress|resolved|critical|all|"" (빈문자열=all)"""
    rows: list[dict] = []
    try:
        if os.path.exists(DIAG_REPORTS_PATH):
            with open(DIAG_REPORTS_PATH, "r", encoding="utf-8") as f:
                for line in f:
                    try: rows.append(json.loads(line))
                    except Exception: continue
    except Exception:
        pass
    if status and status != "all":
        rows = [r for r in rows if (r.get("status") or "open") == status]
    return {"ok": True, "rows": rows[-limit:]}
