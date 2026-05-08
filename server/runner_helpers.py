"""
claude_runner 헬퍼 — 분할 2차 (안정화 2026-05-08).

이동 (자체 완결 순수 함수):
- _log_error_lesson + _LESSONS_FILE
- _TOOL_EMOJI / _TOOL_RE / _parse_status / _summarize_tool_input
- _SESSION_SIZE_LIMIT / _find_session_file / _session_ok

KEEP in claude_runner.py:
- _cleanup_dead_pids (AGENT_PIDS 의존)
- run_claude / run_claude_light (메인 로직)
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("company-hq")

# ── 에러 자가 학습 (토큰 미사용) ──────────────────────
_LESSONS_FILE = Path(__file__).parent.parent / "lessons.md"


def _log_error_lesson(team_id: str, err_msg: str, retried: bool = False) -> None:
    """에러 발생 시 lessons.md에 자동 기록 (토큰 미사용, 파일 쓰기만)"""
    try:
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        short_err = err_msg[:120].replace("\n", " ")
        retry_note = " (자동 재시도 성공)" if retried else ""
        line = f"- [{now}] {team_id}: {short_err}{retry_note}\n"
        with open(_LESSONS_FILE, "a", encoding="utf-8") as f:
            if f.tell() == 0:
                f.write("# 에러 자가 학습 로그\n> 자동 기록 — 반복 패턴 분석용\n\n")
            f.write(line)
    except Exception:
        pass


# ── 툴 상태 파싱 ───────────────────────────────────────
_TOOL_EMOJI = {
    "Bash": "💻", "bash": "💻",
    "Read": "📖", "Write": "✏️", "Edit": "✏️",
    "Glob": "📁", "Grep": "🔍",
    "WebFetch": "🌐", "WebSearch": "🔍",
    "TodoWrite": "📝", "TodoRead": "📝",
    "Task": "🤖", "Agent": "🤖",
}

# Claude CLI 출력에서 툴 사용 패턴
_TOOL_RE = re.compile(r"[⏺●]\s+(\w+)\((.{0,80})\)")


def _parse_status(text: str) -> str | None:
    """텍스트에서 툴 사용 상태 추출"""
    m = _TOOL_RE.search(text)
    if not m:
        return None
    tool = m.group(1)
    args = m.group(2).strip()
    emoji = _TOOL_EMOJI.get(tool, "⚙️")
    if len(args) > 50:
        args = args[:47] + "..."
    return f"{emoji} {tool}({args})"


def _summarize_tool_input(tool_name: str, tinput: dict) -> str:
    """stream-json tool_use input 한 줄 요약."""
    if not isinstance(tinput, dict):
        return str(tinput)[:80]
    key_map = {
        "Read": "file_path",
        "Write": "file_path",
        "Edit": "file_path",
        "NotebookEdit": "notebook_path",
        "Bash": "command",
        "Glob": "pattern",
        "Grep": "pattern",
        "WebFetch": "url",
        "WebSearch": "query",
        "Task": "description",
        "TaskCreate": "subject",
        "TaskUpdate": "taskId",
        "Skill": "skill",
    }
    key = key_map.get(tool_name)
    if key and key in tinput:
        val = str(tinput[key])
        if len(val) > 70:
            val = val[:67] + "..."
        return val
    for v in tinput.values():
        if isinstance(v, (str, int, float)):
            s = str(v)
            if len(s) > 70:
                s = s[:67] + "..."
            return s
    return ""


# ── 세션 파일 ─────────────────────────────────────────
_SESSION_SIZE_LIMIT = 10 * 1024 * 1024  # 10MB


def _find_session_file(session_id: str, project_path: str | None = None) -> Path | None:
    """세션 ID에 해당하는 .jsonl 파일 위치를 반환. 없으면 None."""
    base = Path.home() / ".claude" / "projects"
    candidates: list[Path] = []
    if project_path:
        proj_slug = os.path.expanduser(project_path).replace("/", "-").lstrip("-")
        candidates.append(base / proj_slug / f"{session_id}.jsonl")
    try:
        for proj_dir in base.iterdir():
            p = proj_dir / f"{session_id}.jsonl"
            if p not in candidates:
                candidates.append(p)
    except Exception:
        pass
    for p in candidates:
        if p.exists():
            return p
    return None


def _session_ok(session_id: str, project_path: str | None = None) -> bool:
    """세션 resume 안전한지 확인 (파일 존재 + 크기 제한)"""
    p = _find_session_file(session_id, project_path)
    if p is None:
        return False
    size = p.stat().st_size
    if size > _SESSION_SIZE_LIMIT:
        logger.warning("세션 파일 너무 큼 (%.1fMB), 새 세션으로 교체: %s", size / 1024 / 1024, session_id)
        return False
    return True
