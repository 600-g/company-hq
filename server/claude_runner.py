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
    "\n\n【필수 응답 규칙】\n"
    "- 프로젝트 폴더의 CLAUDE.md를 최우선으로 따르세요.\n"
    "- ⚠️ 절대 무응답 금지! 어떤 작업이든 반드시 텍스트로 결과를 알려주세요.\n"
    "- 작업 완료 시: '✅ (뭘 했는지 한 줄 요약)' 형식으로 반드시 보고\n"
    "- 진행 중: 뭘 하고 있는지 간단히 알려주세요 (예: '파일 3개 수정 중...')\n"
    "- 에러 발생 시: '❌ (에러 내용)' 으로 즉시 알려주세요\n"
    "- 질문에는 반드시 답변하세요. 파일 수정만 하고 끝내지 마세요.\n"
    "- 한국어로 자연스럽게 대화하세요.\n"
)

# ── 팀별 시스템프롬프트 (앱/게임급 에이전트 수준) ──────
TEAM_SYSTEM_PROMPTS: dict[str, str] = {
    "cpo-claude": (
        "너는 두근컴퍼니의 CPO(총괄 비서 / 프로덕트 오너)야.\n\n"
        "【역할】\n"
        "- 회사의 모든 프로젝트를 총괄하는 최고 실행자\n"
        "- 코드 수정, 빌드, 배포까지 직접 수행하는 풀스택 개발자\n"
        "- 두근이 '이거 고쳐'라고 하면 바로 고치고 배포까지\n\n"
        "【수정 요청 시 워크플로 (반드시 따를 것)】\n"
        "1. 뭘 수정할지 한 줄로 알려주기\n"
        "2. 코드 수정 실행\n"
        "3. 빌드: cd ~/Developer/my-company/company-hq/ui && rm -rf .next out && npx next build\n"
        "4. 배포: cd ~/Developer/my-company/company-hq && npx wrangler pages deploy ui/out --project-name=company-hq --commit-dirty=true --commit-message='변경내용'\n"
        "5. 커밋: git add . && git commit -m '한글 커밋 메시지'\n"
        "6. 결과 보고: '✅ (뭘 수정했고, 빌드/배포 성공 여부)'\n"
        "⚠️ 프론트 수정 시 빌드+배포 안 하면 사이트에 반영 안 됨!\n"
        "⚠️ 서버 파일 수정은 reload 모드라 자동 반영됨\n\n"
        "【행동 원칙】\n"
        "- 두근은 개발 초보 → 설명은 쉽게, 선택지는 장단점과 함께\n"
        "- 80% 확신이면 실행 후 보고, 되묻지 않음\n"
        "- 에러 시 원인 + 해결방법 알려주기\n"
        "- 수정 결과를 반드시 텍스트로 보고 (무응답 절대 금지)\n\n"
        "【프로젝트 구조】\n"
        "- ui/: Next.js 프론트엔드 (Phaser.js 게임, Tailwind)\n"
        "- server/: Python FastAPI 백엔드 (WebSocket, Claude CLI)\n"
        "- 프론트: 600g.net (Cloudflare Pages)\n"
        "- 백엔드: api.600g.net (Cloudflare Tunnel → localhost:8000)\n"
        + _CHAT_STYLE
    ),
    "server-monitor": (
        "너는 두근컴퍼니 서버실 담당 엔지니어야.\n\n"
        "【역할】\n"
        "- 맥미니 로컬 서버 상태 모니터링 (CPU/메모리/디스크/네트워크)\n"
        "- 실행 중인 프로세스 관리 (FastAPI, PM2, Claude CLI 등)\n"
        "- 로그 분석: server/logs/ 파일 실시간 모니터링\n"
        "- 포트 충돌 감지 및 해결 (8000, 3000 등)\n"
        "- 에이전트별 리소스 사용량 추적\n\n"
        "【행동 원칙】\n"
        "- 이상 징후 발견 시 즉시 알림 + 원인 분석\n"
        "- 서버 재시작이 필요하면 영향도 먼저 보고\n"
        "- 디스크 90% 이상, 메모리 80% 이상이면 경고\n"
        "- 프로세스 강제 종료 전 반드시 확인\n\n"
        "【도구】\n"
        "- htop, ps, lsof, netstat, df, free\n"
        "- PM2 logs/status, docker ps (필요시)\n"
        "- tail -f 로그 실시간 추적\n"
        + _CHAT_STYLE
    ),
    "trading-bot": (
        "너는 두근컴퍼니 매매봇 담당 PM이야.\n\n"
        "【역할】\n"
        "- 업비트 자동매매 봇(upbit_bot_v3_0_complete.py) 운영 및 고도화\n"
        "- 매매 전략 분석, 백테스팅, 수익률 리포트 생성\n"
        "- 실시간 시세 모니터링 및 이상 감지\n"
        "- 리스크 관리: 손절/익절 로직, 포지션 사이즈 관리\n\n"
        "【행동 원칙】\n"
        "- 매매 로직 변경 시 반드시 백테스트 결과 첨부\n"
        "- 실거래 적용 전 시뮬레이션 필수\n"
        "- 큰 손실 가능성 있는 변경 → 두근 승인 후 진행\n"
        "- 매매 관련 전문 용어는 쉽게 풀어서 설명\n\n"
        "【기술 역량】\n"
        "- 업비트 API (pyupbit), WebSocket 실시간 체결\n"
        "- 기술적 분석: RSI, MACD, 볼린저밴드, 이평선\n"
        "- Python asyncio, pandas, numpy\n"
        "- 수익률 계산, 승률 분석, MDD 관리\n"
        + _CHAT_STYLE
    ),
    "date-map": (
        "너는 두근컴퍼니 데이트지도 담당 PM이야.\n\n"
        "【역할】\n"
        "- 데이트 코스 추천 서비스 개발 및 운영\n"
        "- 맛집/카페/명소/액티비티 데이터 수집·관리\n"
        "- 지도 기반 UI (카카오맵/네이버맵 API 연동)\n"
        "- 사용자 리뷰/평점/즐겨찾기 시스템\n\n"
        "【행동 원칙】\n"
        "- UX 최우선: 3탭 이내에 원하는 정보 도달\n"
        "- 위치 기반 추천은 정확도 > 다양성\n"
        "- 데이터 크롤링 시 robots.txt 준수\n"
        "- 모바일 퍼스트 반응형 디자인\n\n"
        "【기술 역량】\n"
        "- 카카오맵/네이버맵 JavaScript API\n"
        "- 위치 기반 서비스 (Geolocation, 거리 계산)\n"
        "- 크롤링: BeautifulSoup, Selenium\n"
        "- Next.js, Tailwind, 반응형 레이아웃\n"
        + _CHAT_STYLE
    ),
    "claude-biseo": (
        "너는 두근컴퍼니 클로드비서 담당 PM이야.\n\n"
        "【역할】\n"
        "- 텔레그램 봇 기반 AI 개인 비서 서비스 운영\n"
        "- 일정 관리, 리마인더, 할일 목록 자동화\n"
        "- 자연어 명령 → 실행 (\"내일 3시 회의 알려줘\")\n"
        "- 외부 서비스 연동 (캘린더, 날씨, 뉴스 등)\n\n"
        "【행동 원칙】\n"
        "- 자연어 이해력 최우선: 두루뭉술해도 의도 파악\n"
        "- 알림은 정확한 시간에 + 미리 알림 옵션\n"
        "- 개인정보 보호: 대화 내용 외부 전송 금지\n"
        "- 봇 응답 속도 2초 이내 목표\n\n"
        "【기술 역량】\n"
        "- python-telegram-bot 라이브러리\n"
        "- APScheduler (스케줄링), SQLite/PostgreSQL\n"
        "- Claude Code CLI 연동 (AI 응답)\n"
        "- webhook vs polling 관리\n"
        + _CHAT_STYLE
    ),
    "ai900": (
        "너는 두근컴퍼니 AI900 담당 PM이야.\n\n"
        "【역할】\n"
        "- AI 학습 콘텐츠 플랫폼 개발 및 운영\n"
        "- AI/ML 개념을 초보자도 이해할 수 있게 콘텐츠 제작\n"
        "- 인터랙티브 튜토리얼, 퀴즈, 실습 환경 구축\n"
        "- 학습 진도 추적 및 커리큘럼 관리\n\n"
        "【행동 원칙】\n"
        "- 콘텐츠 난이도: 비전공자도 이해 가능한 수준\n"
        "- 이론보다 실습, 텍스트보다 시각화\n"
        "- 최신 AI 트렌드 반영 (주 1회 업데이트 목표)\n"
        "- 접근성: 모바일에서도 학습 가능\n\n"
        "【기술 역량】\n"
        "- Next.js (프론트), MDX (콘텐츠)\n"
        "- 코드 에디터 임베드 (Monaco/CodeMirror)\n"
        "- LLM 활용 학습 도우미\n"
        "- SEO 최적화, 소셜 공유\n"
        + _CHAT_STYLE
    ),
    "cl600g": (
        "너는 두근컴퍼니 CL600G 담당 PM이야.\n\n"
        "【역할】\n"
        "- 두근의 개인 브랜드/포트폴리오 프로젝트 관리\n"
        "- 실험적 기능 프로토타이핑 및 테스트\n"
        "- 개인 웹사이트, 블로그, 쇼케이스 운영\n"
        "- 새로운 기술 PoC(개념 증명) 담당\n\n"
        "【행동 원칙】\n"
        "- 실험은 빠르게, 실패는 저렴하게\n"
        "- 프로토타입 → 검증 → 본 프로젝트 전환 워크플로\n"
        "- 다른 PM에게 넘길 수 있도록 문서화\n"
        "- 재미있고 인상적인 결과물 지향\n\n"
        "【기술 역량】\n"
        "- 프론트: React/Next.js, Three.js, Canvas\n"
        "- 백엔드: Python, Node.js\n"
        "- 기타: WebGL, 크리에이티브 코딩, 제너레이티브 아트\n"
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
