"""Claude Code CLI 실행기 — 세션 영구 유지 + 역할 시스템프롬프트"""

import asyncio
import json
import logging
import os
import re
import uuid
from datetime import datetime
from pathlib import Path

# ── 로그 설정 ──────────────────────────────────────────
LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "company-hq.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("company-hq")

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

# ── 공통 보조 프롬프트 (CLAUDE.md가 메인, 이건 보조) ──
_CHAT_STYLE = (
    "프로젝트 폴더의 CLAUDE.md를 최우선으로 따르세요. "
    "작업 완료 시 '✅ 완료했습니다. (결과 요약)' 한 줄로 알려주세요. "
    "진행 중에는 뭘 하고 있는지 간단히 알려주세요."
)

# ── 팀별 시스템프롬프트 ────────────────────────────────
TEAM_SYSTEM_PROMPTS: dict[str, str] = {
    "cpo-claude": (
        "너는 두근컴퍼니의 CPO(총괄 비서)야. "
        "회사의 모든 프로젝트(매매봇, 데이트지도, AI900, 클로드비서 등)를 총괄하고, "
        "개발, 코드리뷰, 아키텍처 설계, 배포까지 직접 해. "
        "파일 수정·생성·삭제, bash 실행, git 조작 다 가능해. "
        "두근은 개발 초보니까 항상 쉽게 설명해주고, 선택지는 장단점과 함께 줘.\n"
        + _CHAT_STYLE
    ),
    "server-monitor": (
        "너는 두근컴퍼니 서버실 담당이야. "
        "서버 상태 모니터링, 프로세스 관리, 로그 분석, 포트 확인을 전담해. "
        "이상 징후를 발견하면 바로 알려주고 원인을 분석해줘.\n"
        + _CHAT_STYLE
    ),
    "trading-bot": (
        "너는 두근컴퍼니 매매봇 담당이야. "
        "업비트 자동매매 봇(upbit_bot_v3_0_complete.py) 운영과 개선을 맡고 있어. "
        "수익률 분석, 전략 개선, 버그 수정을 해줘. "
        "매매 관련 전문 용어는 쉽게 풀어서 설명해.\n"
        + _CHAT_STYLE
    ),
    "date-map": (
        "너는 두근컴퍼니 데이트지도 담당이야. "
        "데이트 코스 추천, 맛집/카페/명소 데이터 관리, 지도 서비스 개발을 맡고 있어. "
        "위치 기반 서비스와 UX 개선에 집중해.\n"
        + _CHAT_STYLE
    ),
    "claude-biseo": (
        "너는 두근컴퍼니 클로드비서 담당이야. "
        "텔레그램 봇 기반 개인 비서 서비스를 운영하고 개선해. "
        "일정 관리, 알림, 자동화 기능을 담당해.\n"
        + _CHAT_STYLE
    ),
    "ai900": (
        "너는 두근컴퍼니 AI900 담당이야. "
        "AI 학습 콘텐츠와 교육 플랫폼을 개발하고 운영해. "
        "초보자도 이해할 수 있는 AI 교육 자료를 만들어.\n"
        + _CHAT_STYLE
    ),
    "cl600g": (
        "너는 두근컴퍼니 CL600G 담당이야. "
        "두근의 개인 프로젝트와 실험적 기능을 개발하고 관리해.\n"
        + _CHAT_STYLE
    ),
}

# ── Claude CLI 버전 (서버 시작 시 1회) ────────────────
import subprocess as _sp
_CLAUDE_VERSION = "unknown"
try:
    _r = _sp.run(["claude", "--version"], capture_output=True, text=True, timeout=5)
    _CLAUDE_VERSION = _r.stdout.strip().split("\n")[0]
except Exception:
    pass

# 모델 ID 매핑
MODEL_IDS: dict[str, str] = {
    "opus":   "claude-opus-4-6",
    "sonnet": "claude-sonnet-4-6",
    "haiku":  "claude-haiku-4-5",
}

def get_claude_version() -> str:
    return _CLAUDE_VERSION

# ── 실행 중인 subprocess PID 추적 ─────────────────────
AGENT_PIDS: dict[str, int] = {}  # team_id -> PID (실행 중일 때만)
AGENT_TOKENS: dict[str, dict] = {}  # team_id -> {prompts: int, chars: int}

DEFAULT_SYSTEM_PROMPT = (
    "너는 두근컴퍼니의 AI 에이전트야. "
    "담당 프로젝트의 개발, 분석, 운영 작업을 해. "
    "한국어로 자연스럽게 소통해.\n"
    + _CHAT_STYLE
)

# ── 툴 상태 파싱 ───────────────────────────────────────
_TOOL_EMOJI = {
    "Bash": "💻", "bash": "💻",
    "Read": "📖", "Write": "✏️", "Edit": "✏️",
    "Glob": "📁", "Grep": "🔍",
    "WebFetch": "🌐", "WebSearch": "🔍",
    "TodoWrite": "📝", "TodoRead": "📝",
    "Task": "🤖", "Agent": "🤖",
}

# Claude CLI 출력에서 툴 사용 패턴: ⏺ ToolName(...) 또는 ● ToolName(...)
_TOOL_RE = re.compile(r"[⏺●]\s+(\w+)\((.{0,80})\)")

def _parse_status(text: str) -> str | None:
    """텍스트에서 툴 사용 상태 추출"""
    m = _TOOL_RE.search(text)
    if not m:
        return None
    tool = m.group(1)
    args = m.group(2).strip()
    emoji = _TOOL_EMOJI.get(tool, "⚙️")
    # args가 너무 길면 자름
    if len(args) > 50:
        args = args[:47] + "..."
    return f"{emoji} {tool}({args})"


async def run_claude(prompt: str, project_path: str | None = None, team_id: str = ""):
    """Claude Code CLI 실행 — 세션 영구 유지

    Yields: dict {"kind": "text"|"status", "content": str}
    """
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

    logger.info("[%s] 프롬프트 수신: %s", team_id, prompt[:100])

    if team_id not in AGENT_TOKENS:
        AGENT_TOKENS[team_id] = {"prompts": 0, "chars": 0}
    AGENT_TOKENS[team_id]["prompts"] += 1

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
        env=env,
    )
    AGENT_PIDS[team_id] = proc.pid

    buf = b""
    while True:
        chunk = await proc.stdout.read(256)
        if not chunk:
            if buf:
                text = buf.decode("utf-8", errors="replace")
                if text.strip():
                    yield {"kind": "text", "content": text}
            break
        buf += chunk
        try:
            text = buf.decode("utf-8")
            buf = b""
        except UnicodeDecodeError:
            continue

        if not text.strip():
            continue

        # 툴 사용 상태 감지
        status = _parse_status(text)
        if status:
            logger.info("[%s] 툴 사용: %s", team_id, status)
            yield {"kind": "status", "content": status}

        AGENT_TOKENS[team_id]["chars"] += len(text)
        yield {"kind": "text", "content": text}

    await proc.wait()
    AGENT_PIDS.pop(team_id, None)
    logger.info("[%s] 응답 완료 (exit=%d)", team_id, proc.returncode or 0)

    if proc.returncode != 0:
        stderr = await proc.stderr.read()
        err_msg = stderr.decode("utf-8", errors="replace").strip()
        if err_msg:
            logger.error("[%s] 오류: %s", team_id, err_msg)
            yield {"kind": "text", "content": f"\n⚠️ 오류: {err_msg}"}
