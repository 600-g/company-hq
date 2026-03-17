"""Claude Code CLI 실행기 — 세션 영구 유지 + 역할 시스템프롬프트"""

import asyncio
import json
import os
import uuid
from pathlib import Path

# ── 세션 영구 저장 ─────────────────────────────────────
_SESSIONS_FILE = Path(__file__).parent / "team_sessions.json"

def _load_sessions() -> dict:
    try:
        return json.loads(_SESSIONS_FILE.read_text())
    except Exception:
        return {}

def _save_sessions(sessions: dict):
    _SESSIONS_FILE.write_text(json.dumps(sessions, indent=2))

TEAM_SESSIONS: dict[str, str] = _load_sessions()

# ── 모델 설정 ──────────────────────────────────────────
TEAM_MODELS: dict[str, str] = {
    "cpo-claude": "opus",
}

# ── 팀별 시스템프롬프트 ────────────────────────────────
TEAM_SYSTEM_PROMPTS: dict[str, str] = {
    "cpo-claude": (
        "당신은 두근컴퍼니의 CPO(Chief Product Officer) 클로드입니다. "
        "회사의 모든 프로젝트(매매봇, 데이트지도, AI900, 클로드비서 등)를 총괄하며 "
        "개발, 코드리뷰, 아키텍처 설계, 배포까지 직접 수행합니다. "
        "파일 수정·생성·삭제, bash 실행, git 조작 모두 가능합니다. "
        "자연스럽고 친근하게 대화하되, 기술적 작업은 정확하게 수행하세요. "
        "한국어로 소통하고, 코드는 필요할 때만 보여주세요."
    ),
    "server-monitor": (
        "당신은 두근컴퍼니 서버실 담당 에이전트입니다. "
        "서버 상태 모니터링, 프로세스 관리, 로그 분석, 포트 확인을 전담합니다. "
        "이상 징후를 발견하면 즉시 보고하고 원인을 분석하세요."
    ),
    "trading-bot": (
        "당신은 두근컴퍼니 매매봇 담당 에이전트입니다. "
        "업비트 자동매매 봇(upbit_bot_v3_0_complete.py) 운영과 개선을 담당합니다. "
        "수익률 분석, 전략 개선, 버그 수정을 수행하세요."
    ),
}

DEFAULT_SYSTEM_PROMPT = (
    "당신은 두근컴퍼니의 AI 에이전트입니다. "
    "담당 프로젝트의 개발, 분석, 운영 작업을 수행합니다. "
    "한국어로 소통하세요."
)


async def run_claude(prompt: str, project_path: str | None = None, team_id: str = ""):
    """Claude Code CLI 실행 — 세션 영구 유지"""
    cmd = ["claude", "--dangerously-skip-permissions"]

    # ── 세션 유지 ──
    session_id = TEAM_SESSIONS.get(team_id)
    if session_id:
        cmd.extend(["--resume", session_id])
    else:
        new_id = str(uuid.uuid4())
        TEAM_SESSIONS[team_id] = new_id
        _save_sessions(TEAM_SESSIONS)
        cmd.extend(["--session-id", new_id])

    # ── 시스템프롬프트 ──
    system_prompt = TEAM_SYSTEM_PROMPTS.get(team_id, DEFAULT_SYSTEM_PROMPT)
    cmd.extend(["--append-system-prompt", system_prompt])

    # ── 모델 + 프롬프트 ──
    cmd.extend(["-p", prompt])
    cmd.extend(["--model", TEAM_MODELS.get(team_id, "sonnet")])

    env = os.environ.copy()
    cwd = os.path.expanduser(project_path) if project_path else None

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
        env=env,
    )

    while True:
        chunk = await proc.stdout.read(256)
        if not chunk:
            break
        text = chunk.decode("utf-8", errors="replace")
        if text.strip():
            yield text

    await proc.wait()

    if proc.returncode != 0:
        stderr = await proc.stderr.read()
        err_msg = stderr.decode("utf-8", errors="replace").strip()
        if err_msg:
            yield f"\n⚠️ 오류: {err_msg}"
