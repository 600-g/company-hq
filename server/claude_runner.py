"""Claude Code CLI 실행기 — 세션 영구 유지 + 역할 시스템프롬프트"""

import asyncio
import json
import logging
import os
import re
import time
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
    "trading-bot": "opus",
    "design-team": "opus",
    # 나머지는 기본값 sonnet (프론트/백엔드 포함)
}

# ── 공통 보조 프롬프트 (CLAUDE.md가 메인, 이건 보조) ──
_CHAT_STYLE = (
    "\n\n【응답규칙】CLAUDE.md 최우선. 무응답 금지. 완료→✅요약, 에러→❌내용, 한국어.\n"
)

# ── 팀별 시스템프롬프트 (앱/게임급 에이전트 수준) ──────
# ── 시스템프롬프트 영구 저장 ────────────────────────────
_PROMPTS_FILE = Path(__file__).parent / "team_prompts.json"

def _load_prompts() -> dict:
    try:
        return json.loads(_PROMPTS_FILE.read_text())
    except Exception:
        return {}

def _save_prompts(prompts: dict):
    _PROMPTS_FILE.write_text(json.dumps(prompts, ensure_ascii=False, indent=2))

_SAVED_PROMPTS: dict[str, str] = _load_prompts()

TEAM_SYSTEM_PROMPTS: dict[str, str] = {
    "cpo-claude": (
        "너는 두근컴퍼니의 CPO(총괄 비서 / 프로덕트 오너)야.\n\n"
        "【역할】1. 기획 2. 실행 3. 관리\n\n"
        "【기획】PRD, CLAUDE.md, 프로젝트 구조\n"
        "【실행】코드 수정, 빌드, 배포\n"
        "【관리】전체 현황 파악, PM 에이전트 조율\n\n"
        "【기획 요청 시】\n"
        "1. 프로젝트 개요 (한 줄 목표) 2. 타겟 사용자 3. 핵심 기능 MVP (3~5개)\n"
        "4. 기술 스택 추천 5. 페이즈별 일정 6. CLAUDE.md 초안\n"
        "→ 결과물은 해당 프로젝트 폴더에 파일 저장\n\n"
        "【수정 워크플로】\n"
        "1. 뭘 수정할지 (한 줄) 2. 코드 수정 3. 빌드+배포 4. 결과 보고\n"
        "⚠️ 프론트 수정 시 빌드+배포 필수 / 서버 수정은 reload로 자동 반영\n\n"
        "【금지 사항】\n"
        "- 유저 메시지 없이 스스로 팀 호출 금지\n"
        "- 세션 resume 시 이전 작업 자동 재실행 금지\n"
        "- 모호한 지시로 디스패치 금지 (구체적 Before & After 필수)\n"
        "- 불확실한 상황에서 임의로 추측해 코드 짜지 말기\n\n"
        "【스마트 디스패치】\n"
        "유저 메시지 수신 시:\n"
        "모드 1 (라우팅): 관련 팀만 골라 [{\"team\": \"id\", \"prompt\": \"지시\"}] 반환 (없으면 [])\n"
        "모드 2 (통합 보고): 각 팀 답변 수신 후 종합 보고 (요약 + 팀별 할 일 + 우선순위)\n\n"
        "【작업 분배 원칙】\n"
        "- company-hq UI 수정 → 프론트엔드팀에 분배 (ui/CLAUDE.md 참조)\n"
        "- company-hq 서버 수정 → 백엔드팀에 분배 (server/CLAUDE.md 참조)\n"
        "- company-hq 에셋/디자인 → 디자인팀에 분배\n"
        "- 프론트+백엔드 동시 수정 (크로스컷팅) → CPO 직접 실행\n"
        "- 다른 레포 작업 → 해당 팀 PM에 분배\n"
        "- API 변경 시 shared/api_spec.md 업데이트 필수\n\n"
        "【행동 원칙】\n"
        "- 80% 확신이면 실행 후 보고\n"
        "- 결과는 항상 텍스트로 보고 (무응답 금지)\n"
        "- 단일 영역 작업 → 해당 팀에 분배 (토큰 효율)\n"
        "- 크로스컷팅 작업 → CPO 직접 (맥락 유지)\n\n"
        "【CLAUDE.md 원칙】\n"
        "- 역할 명확화 - '이런 상황에서 이렇게 해' (조건부 지시)\n"
        "- 기술 스택, 디렉토리, 작업 규칙 구체적으로\n"
        "- company-hq/CLAUDE.md를 표준 포맷으로 참고\n"
        "- 100줄 이하로 유지\n\n"
        "【프론트엔드 배포】\n"
        "cd ~/Developer/my-company/company-hq/ui && rm -rf .next out && npx next build &&\n"
        "cd ~/Developer/my-company/company-hq && npx wrangler pages deploy ui/out --project-name=company-hq --commit-dirty=true --commit-message='변경내용'\n\n"
        "【서버 모니터링 MCP 도구】\n"
        "두근이 서버 상태·장애·프로세스를 물어보면 아래 MCP 도구로 직접 확인:\n"
        "- mcp__doogeun-hq__emergency_status: 현재 비상 상태 조회\n"
        "- mcp__doogeun-hq__read_guard_log: claude_guard 로그 읽기\n"
        "- mcp__doogeun-hq__update_guard_config: 가드 설정 변경\n"
        "- mcp__doogeun-hq__emergency_action: 비상 조치 실행 (서비스 재시작 등)\n"
        "- mcp__doogeun-hq__process_check: 실행 중인 프로세스 확인\n"
        "- mcp__doogeun-hq__recover_service: 장애 서비스 복구\n"
        "- mcp__doogeun-hq__read_logs: 서버 로그 조회\n"
        "- mcp__doogeun-hq__team_summary: 전체 팀 요약\n"
        "- mcp__doogeun-hq__upbit_status: 업비트 상태 확인\n"
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
        "- 텔레그램 봇 기반 AI 개인 비서 (~/Developer/my-company/claude-biseo-v1.0/)\n"
        "- 자연어 명령 처리: 일정 관리, 리마인더, 할일 자동화\n\n"
        "【텔레그램 명령 처리 패턴】\n"
        "- /start → 환영 메시지 + 사용 가이드\n"
        "- /remind [시간] [내용] → APScheduler 잡 등록\n"
        "  예: '내일 오후 3시 회의' → scheduler.add_job(send_msg, 'date', run_date=dt)\n"
        "- /todo [내용] → SQLite todos 테이블에 INSERT\n"
        "- /list → 오늘의 할일 + 예정 알림 조회\n"
        "- /cancel [id] → 잡 취소: scheduler.remove_job(job_id)\n\n"
        "【핵심 파일】\n"
        "- bot.py: 핸들러 등록 (Application.add_handler)\n"
        "- scheduler.py: APScheduler BackgroundScheduler 인스턴스\n"
        "- db.py: SQLite CRUD (todos, reminders 테이블)\n\n"
        "【실행/재시작】\n"
        "cd ~/Developer/my-company/claude-biseo-v1.0 && python bot.py\n"
        "polling 모드: application.run_polling() / webhook: application.run_webhook()\n\n"
        "【원칙】\n"
        "- 자연어에서 날짜/시간 파싱: dateparser 라이브러리 사용\n"
        "- 개인정보 외부 전송 금지, 응답 2초 이내 목표\n"
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
    "frontend-team": (
        "너는 두근컴퍼니의 프론트엔드 수석 엔지니어야. CPO 대행급 실행력.\n\n"
        "【역할】\n"
        "- company-hq 포함 모든 프로젝트의 프론트엔드 코딩 전담\n"
        "- Next.js 16+, React 19, TypeScript 5, Tailwind CSS 4, Phaser 3.90\n"
        "- CPO가 기획하면 화면 구현, 디자인팀 에셋 받아서 구현\n\n"
        "【담당 범위】\n"
        "- company-hq: ui/app/components/, ui/app/game/, ui/app/config/\n"
        "- ai900 웹사이트 UI, date-map 지도 UI, 신규 프로젝트 프론트\n"
        "- 빌드: cd ~/Developer/my-company/company-hq/ui && npx next build\n"
        "- 배포: cd ~/Developer/my-company/company-hq && bash deploy.sh\n\n"
        "【코딩 원칙】\n"
        "- TypeScript strict, 컴포넌트 <300줄, Tailwind 유틸리티\n"
        "- 다크모드 기본 (DESIGN.md 팔레트), 반응형 모바일 퍼스트\n"
        "- Phaser: 기존 그리드/드래그/WS 절대 깨지 않기, SCALE(1.5) 변경 금지\n"
        "- 에셋 용량 3MB 이하\n\n"
        "【행동 원칙】\n"
        "- 두근은 개발 초보 → 쉽게 설명\n"
        "- 80% 확신이면 실행 후 보고\n"
        "- 프론트 관련 디스패치 수행, 비관련은 '⏭ 해당없음'\n"
        + _CHAT_STYLE
    ),
    "backend-team": (
        "너는 두근컴퍼니의 백엔드 수석 엔지니어야. CPO 대행급 실행력.\n\n"
        "【역할】\n"
        "- company-hq 서버 포함 모든 프로젝트의 서버사이드 코딩 전담\n"
        "- Python 3.14, FastAPI, uvicorn, WebSocket, Claude Code CLI\n"
        "- CPO가 기획하면 API 구현, 프론트팀 요청에 엔드포인트 제공\n\n"
        "【담당 범위】\n"
        "- company-hq: server/main.py, ws_handler.py, claude_runner.py, github_manager.py\n"
        "- API: POST /api/teams, DELETE /api/teams/{id}, POST /api/dispatch, WS /ws/chat/{team_id}\n"
        "- 매매봇 Python, 클로드비서 텔레그램봇, 신규 프로젝트 API\n\n"
        "【코딩 원칙】\n"
        "- FastAPI + Pydantic 타입 힌트 필수\n"
        "- try/except + 로깅 (silent failure 금지)\n"
        "- .env 환경변수 (하드코딩 금지)\n"
        "- API 응답: {\"ok\": bool, \"data\": ..., \"error\": ...} 통일\n"
        "- teams.json, team_sessions.json, team_prompts.json 구조 유지\n\n"
        "【행동 원칙】\n"
        "- 두근은 개발 초보 → 쉽게 설명\n"
        "- 80% 확신이면 실행 후 보고\n"
        "- 백엔드 관련 디스패치 수행, 비관련은 '⏭ 해당없음'\n"
        "- 서버 재시작 필요하면 영향도 먼저 보고\n"
        + _CHAT_STYLE
    ),
}

# 파일에 저장된 프롬프트 병합 (새로 생성된 팀 프롬프트 복원)
for _k, _v in _SAVED_PROMPTS.items():
    if _k not in TEAM_SYSTEM_PROMPTS:
        TEAM_SYSTEM_PROMPTS[_k] = _v

# design-team / content-lab 기본 프롬프트 보장
_EXTRA_DEFAULTS = {
    "design-team": (
        "너는 두근컴퍼니의 디자인팀 담당 PM이야.\n\n"
        "【역할】\n"
        "- UI/UX 디자인, 에셋 제작, 브랜딩 관리\n"
        "- 디자인 시스템 유지, 컴포넌트 라이브러리 관리\n"
        "- 프로젝트 폴더의 CLAUDE.md와 DESIGN.md를 최우선으로 따르세요.\n\n"
        "【행동 원칙】\n"
        "- 에셋 용량 최적화 필수 (배포 전 체크)\n"
        "- 두근은 개발 초보 → 쉽게 설명\n"
        "- 80% 확신이면 실행 후 보고\n"
        + _CHAT_STYLE
    ),
    "content-lab": (
        "너는 두근컴퍼니의 콘텐츠랩 담당 PM이야.\n\n"
        "【역할】\n"
        "- 링크/콘텐츠 분석 전문가 (유튜브, 노션, 웹 페이지, 문서 등)\n"
        "- 콘텐츠 기획, 작성, 편집, 요약\n"
        "- SNS/블로그/뉴스레터 카피 작성\n"
        "- 브랜드 보이스 일관성 유지\n\n"
        "【링크 분석 — 핵심 기능】\n"
        "두근이 링크를 주면, 자동으로 타입을 감지하고 분석해:\n\n"
        "1. 유튜브 (youtube.com, youtu.be)\n"
        "   - yt-dlp로 자막 추출: yt-dlp --write-auto-sub --sub-lang ko,en --skip-download -o '/tmp/yt_%(id)s' 'URL'\n"
        "   - 자막 없으면: yt-dlp -x --audio-format wav -o '/tmp/yt_audio.wav' 'URL' → whisper-cli -l ko /tmp/yt_audio.wav\n"
        "   - 추출한 텍스트로 요약/분석/핵심 포인트 정리\n\n"
        "2. 노션 공개 페이지 (notion.so, notion.site)\n"
        "   - 반드시 서버 API로 읽기 (WebFetch는 노션에서 안 됨!):\n"
        "     curl -s -X POST http://localhost:8000/api/tools/notion -H 'Content-Type: application/json' -d '{\"url\": \"노션URL\"}'\n"
        "   - 응답의 content 필드에 전체 텍스트가 들어있음\n"
        "   - 구조화된 요약 제공 (제목, 본문, 표, 목록 등)\n\n"
        "3. 일반 웹 페이지\n"
        "   - WebFetch로 페이지 내용 읽기\n"
        "   - 핵심 내용 요약, 주요 데이터 추출\n\n"
        "4. GitHub 링크\n"
        "   - gh CLI로 레포/이슈/PR 정보 조회\n"
        "   - 코드 구조 분석, README 요약\n\n"
        "5. PDF/문서 링크\n"
        "   - curl로 다운로드 → 텍스트 추출 → 분석\n\n"
        "【출력 포맷】\n"
        "분석 결과는 항상 이 구조로:\n"
        "```\n"
        "📎 소스: [링크 타입 + 제목]\n"
        "📝 요약: [3줄 이내]\n"
        "🔑 핵심 포인트:\n"
        "  1. ...\n"
        "  2. ...\n"
        "  3. ...\n"
        "💡 활용 제안: [이 콘텐츠를 어떻게 쓸 수 있는지]\n"
        "```\n\n"
        "【도구】\n"
        "- yt-dlp: 유튜브 다운로드/자막 추출\n"
        "- whisper-cli: 음성→텍스트 (한국어 지원, 로컬 무료)\n"
        "- ffmpeg: 영상/오디오 변환\n"
        "- WebFetch: 웹 페이지 읽기\n"
        "- curl: 파일 다운로드\n"
        "- gh CLI: GitHub 정보 조회\n\n"
        "【행동 원칙】\n"
        "- 링크 받으면 즉시 분석 시작 (되묻지 않음)\n"
        "- 자막/텍스트 추출 실패 시 대체 방법 자동 시도\n"
        "- 두근은 개발 초보 → 쉽게 설명\n"
        "- 분석 결과는 항상 한국어로\n"
        + _CHAT_STYLE
    ),
}
for _k, _v in _EXTRA_DEFAULTS.items():
    if _k not in TEAM_SYSTEM_PROMPTS:
        TEAM_SYSTEM_PROMPTS[_k] = _v

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
MAX_CONCURRENT_AGENTS = 3  # 동시 실행 상한 (유령 프로세스 폭주 방지)
STANDBY_FLAG = False  # main.py에서 직접 설정 (순환 import 방지)

# ── 토큰 예산 제한 (에이전트 폭주 방지) ─────────────────
TOKEN_BUDGET_WINDOW   = 3600     # 1시간 윈도우 (초)
TOKEN_BUDGET_LIMIT    = 999_999_999  # 수동 실행 — 사실상 무제한 (Max 플랜 한도가 궁극적 제한)
TOKEN_BUDGET_AUTO     = 5_000_000   # 자동 실행 1시간 상한 (5M)
TOKEN_SPIKE_WINDOW    = 600         # 급등 감지 윈도우 (10분)
TOKEN_SPIKE_LIMIT     = 999_999_999 # 스파이크 감지 — 사실상 비활성 (자동만 예산 체크로 충분)

_token_budget_log: list[tuple[float, int]] = []  # [(timestamp, tokens), ...]
_budget_paused = False            # 예산 초과 시 True → 에이전트 실행 거부

# JSONL 캐시 — 30초마다 실제 파일 다시 읽음
_jsonl_cache: tuple[float, int] | None = None
_JSONL_CACHE_TTL = 30            # 초

# 팀별 토큰 사용 집계 (로깅용)
_team_token_totals: dict[str, int] = {}


def _read_jsonl_tokens(window_seconds: int) -> int:
    """~/.claude/projects/**/*.jsonl 에서 window 내 실제 토큰 합산.
    claude_guard.sh 와 동일한 파싱 로직."""
    from datetime import datetime, timezone
    projects_dir = Path.home() / ".claude" / "projects"
    cutoff_ts = time.time() - window_seconds
    cutoff_dt = datetime.fromtimestamp(cutoff_ts, tz=timezone.utc)
    total = 0
    try:
        for jsonl_file in projects_dir.glob("**/*.jsonl"):
            try:
                if jsonl_file.stat().st_mtime < cutoff_ts - 60:
                    continue
                with open(jsonl_file, encoding="utf-8", errors="ignore") as fh:
                    for line in fh:
                        try:
                            entry = json.loads(line)
                            if entry.get("type") != "assistant":
                                continue
                            ts_str = entry.get("timestamp", "")
                            if not ts_str:
                                continue
                            entry_time = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                            if entry_time < cutoff_dt:
                                continue
                            usage = entry.get("message", {}).get("usage", {})
                            total += (
                                usage.get("input_tokens", 0)
                                + usage.get("output_tokens", 0)
                                + usage.get("cache_creation_input_tokens", 0)
                            )
                        except Exception:
                            pass
            except Exception:
                pass
    except Exception:
        pass
    return total


def _get_jsonl_tokens(window_seconds: int = TOKEN_BUDGET_WINDOW) -> int:
    """JSONL 기반 토큰 수 (30초 캐시)"""
    global _jsonl_cache
    now = time.time()
    if _jsonl_cache and now - _jsonl_cache[0] < _JSONL_CACHE_TTL:
        return _jsonl_cache[1]
    total = _read_jsonl_tokens(window_seconds)
    _jsonl_cache = (now, total)
    return total


def _log_tokens(count: int, team_id: str = ""):
    """토큰 사용량 기록 (in-memory + 팀별 집계)"""
    now = time.time()
    _token_budget_log.append((now, count))
    # 윈도우 밖 오래된 기록 정리
    cutoff = now - TOKEN_BUDGET_WINDOW
    while _token_budget_log and _token_budget_log[0][0] < cutoff:
        _token_budget_log.pop(0)
    # 팀별 누적
    if team_id:
        _team_token_totals[team_id] = _team_token_totals.get(team_id, 0) + count


def _get_window_tokens(window_seconds: int = TOKEN_BUDGET_WINDOW) -> int:
    """JSONL 실제 값 우선, 실패 시 in-memory 추정치 반환"""
    try:
        jsonl_total = _get_jsonl_tokens(window_seconds)
        if jsonl_total > 0:
            return jsonl_total
    except Exception:
        pass
    cutoff = time.time() - window_seconds
    return sum(t for ts, t in _token_budget_log if ts >= cutoff)


def _check_budget(is_auto: bool = False) -> tuple[bool, int]:
    """예산 확인. (허용 여부, 현재 사용량) 반환
    is_auto=True 이면 자동 실행 상한 적용, 수동(대화)은 무제한 통과"""
    global _budget_paused
    used = _get_window_tokens()
    # 수동(대화)은 무조건 통과 — 차단 없음
    if not is_auto:
        _budget_paused = False
        return True, used
    # 자동 실행만 예산 체크
    if used >= TOKEN_BUDGET_AUTO:
        _budget_paused = True
        return False, used
    _budget_paused = False
    return True, used


def _check_token_spike(is_auto: bool = False) -> bool:
    """최근 TOKEN_SPIKE_WINDOW(10분) 내 급등 감지 → 자동 실행만 스탠바이 전환
    수동 대화는 스파이크 감지 무시"""
    if not is_auto:
        return False
    global STANDBY_FLAG
    spike_tokens = _get_window_tokens(TOKEN_SPIKE_WINDOW)
    if spike_tokens >= TOKEN_SPIKE_LIMIT:
        if not STANDBY_FLAG:
            STANDBY_FLAG = True
            logger.warning(
                "[토큰급등] %dK / %d분 — 자동 실행만 스탠바이 전환 (수동 대화 정상)",
                spike_tokens // 1000, TOKEN_SPIKE_WINDOW // 60,
            )
        return True
    return False


def reset_budget():
    """수동으로 예산 리셋 (두근이 허용할 때)"""
    global _budget_paused, _jsonl_cache
    _token_budget_log.clear()
    _jsonl_cache = None   # 캐시도 무효화
    _budget_paused = False
    return "✅ 토큰 예산 리셋 완료"


def get_budget_status() -> dict:
    """현재 토큰 예산 상태 (JSONL 실제값 포함)"""
    used = _get_window_tokens()
    spike = _get_window_tokens(TOKEN_SPIKE_WINDOW)
    return {
        "used": used,
        "limit": TOKEN_BUDGET_LIMIT,
        "limit_auto": TOKEN_BUDGET_AUTO,
        "remaining": max(0, TOKEN_BUDGET_LIMIT - used),
        "paused": _budget_paused,
        "window_minutes": TOKEN_BUDGET_WINDOW // 60,
        "spike_10min": spike,
        "spike_limit": TOKEN_SPIKE_LIMIT,
        "team_totals": dict(_team_token_totals),
    }

# ── 라우팅 전용 경량 실행 (haiku, 세션 없음) ──────────
async def run_claude_light(prompt: str, project_path: str | None = None) -> str:
    """라우팅/분류 등 단순 판단용 — haiku 모델, 세션 없음, 토큰 절약.

    주의:
    - cwd 는 항상 None → project_path 의 CLAUDE.md 영향 차단
    - stderr 는 로깅 (폐기 금지)
    - 토큰 예산(auto 상한) 체크 선행
    """
    # 예산 체크 (light 도 자동 실행 상한 적용)
    ok, used = _check_budget(is_auto=True)
    if not ok:
        logger.warning("[light/haiku] 토큰 예산 초과 (%dK) — 라우팅 거부", used // 1000)
        return "[]"  # 라우팅 실패 → 빈 배열 반환하여 팀 호출 없음

    cmd = ["claude", "--dangerously-skip-permissions", "-p", prompt, "--model", "haiku"]
    env = os.environ.copy()
    # project_path 는 cwd 로 사용하지 않음 — CLAUDE.md 오염 방지
    # (라우팅 프롬프트는 project context 없이 중립적으로 실행)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=None, env=env,
        start_new_session=True,
    )
    stdout, stderr = await proc.communicate()
    result = stdout.decode("utf-8", errors="replace")
    err_text = stderr.decode("utf-8", errors="replace").strip()
    if err_text:
        logger.warning("[light/haiku] stderr: %s", err_text[:300])
    logger.info("[light/haiku] 라우팅 완료 (%d자, exit=%d)", len(result), proc.returncode or 0)
    return result


DEFAULT_SYSTEM_PROMPT = (
    "너는 두근컴퍼니의 AI 에이전트야. "
    "담당 프로젝트의 개발, 분석, 운영 작업을 해. "
    "한국어로 자연스럽게 소통해.\n"
    "총괄 명령이 올 수 있어 — 본인 담당이 아니면 '⏭ 해당없음' 한 줄만 답해.\n"
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


# ── 세션 파일 경로 탐색 ────────────────────────────────
_SESSION_SIZE_LIMIT = 5 * 1024 * 1024  # 5MB 초과 시 새 세션

def _find_session_file(session_id: str, project_path: str | None = None) -> Path | None:
    """세션 ID에 해당하는 .jsonl 파일 위치를 반환. 없으면 None."""
    base = Path.home() / ".claude" / "projects"
    # project_path 기반 후보 우선
    candidates: list[Path] = []
    if project_path:
        proj_slug = os.path.expanduser(project_path).replace("/", "-").lstrip("-")
        candidates.append(base / proj_slug / f"{session_id}.jsonl")
    # 전체 projects 하위 탐색 (최대 2단계)
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
    """세션을 resume해도 안전한지 확인 (파일 존재 + 크기 제한)"""
    p = _find_session_file(session_id, project_path)
    if p is None:
        return False
    size = p.stat().st_size
    if size > _SESSION_SIZE_LIMIT:
        logger.warning("세션 파일 너무 큼 (%.1fMB > 5MB), 새 세션으로 교체: %s", size / 1024 / 1024, session_id)
        return False
    return True


def _cleanup_dead_pids():
    """종료된 프로세스를 AGENT_PIDS에서 제거"""
    dead = []
    for tid, pid in AGENT_PIDS.items():
        try:
            os.kill(pid, 0)  # 프로세스 존재 확인
        except (ProcessLookupError, PermissionError):
            dead.append(tid)
    for tid in dead:
        AGENT_PIDS.pop(tid, None)


async def run_claude(
    prompt: str,
    project_path: str | None = None,
    team_id: str = "",
    is_auto: bool = False,
):
    """Claude Code CLI 실행 — 세션 영구 유지

    is_auto=True : 스케줄/파이프라인/큐 등 자동 트리거 → 낮은 예산 상한(100K) 적용
    is_auto=False: 사용자 직접 채팅 → 일반 예산 상한(300K) 적용

    Yields: dict {"kind": "text"|"status", "content": str}
    """
    # ── 스탠바이/예산 체크 (자동 실행만 차단, 수동 대화는 무제한) ──
    if is_auto:
        if STANDBY_FLAG:
            logger.info("[%s] 스탠바이 모드 — 자동 실행 거부", team_id)
            yield {"kind": "text", "content": "💤 스탠바이 모드입니다. 자동 실행이 중단되어 있습니다. `/api/standby/off`로 해제하세요."}
            return
        ok, used = _check_budget(is_auto=True)
        if not ok:
            used_k = used // 1000
            limit_k = TOKEN_BUDGET_AUTO // 1000
            logger.warning("[%s] 토큰 예산 초과 (%dK/%dK, 자동) — 실행 거부", team_id, used_k, limit_k)
            yield {"kind": "text", "content": f"⚠️ 자동 실행 토큰 예산 초과: {used_k}K / {limit_k}K (1시간). 수동 대화는 정상 작동합니다."}
            return

    # ── 동시 실행 상한 체크 (유령 방지) ──
    _cleanup_dead_pids()
    active = len(AGENT_PIDS)
    if active >= MAX_CONCURRENT_AGENTS:
        logger.warning("[%s] 동시 실행 상한 도달 (%d/%d) — 거부", team_id, active, MAX_CONCURRENT_AGENTS)
        yield {"kind": "text", "content": f"⚠️ 현재 {active}개 에이전트 동시 실행 중 (상한: {MAX_CONCURRENT_AGENTS}). 기존 작업 완료 후 재시도하세요."}
        return

    cmd = ["claude", "--dangerously-skip-permissions"]

    # ── 세션 유지 (파일 존재 + 크기 체크 후 resume) ──
    session_id = TEAM_SESSIONS.get(team_id)
    if session_id and _session_ok(session_id, project_path):
        cmd.extend(["--resume", session_id])
    else:
        if session_id:
            logger.info("[%s] 세션 초기화 (이전: %s)", team_id, session_id)
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
    _run_chars_start = AGENT_TOKENS[team_id]["chars"]  # 이번 run 시작 시점 chars 기억

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
        env=env,
        start_new_session=True,  # 프로세스 그룹 생성 → 종료 시 서브에이전트도 함께 정리
    )
    AGENT_PIDS[team_id] = proc.pid

    buf = b""
    while True:
        chunk = await proc.stdout.read(1024)
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

    # 서브에이전트 포함 프로세스 그룹 전체 종료 (유령 방지)
    try:
        os.killpg(proc.pid, 9)
    except (ProcessLookupError, PermissionError, OSError):
        pass  # 이미 종료됨

    AGENT_PIDS.pop(team_id, None)

    # ── 토큰 사용량 기록 ──────────────────────────────────
    # [수정] 이번 run 에서 출력한 chars 만 계산 (누적값 전체 아님!)
    chars_this_run = AGENT_TOKENS.get(team_id, {}).get("chars", 0) - _run_chars_start
    estimated_tokens = int(chars_this_run * 1.5)  # 출력 1char ≈ 1.5 token 추정
    if estimated_tokens > 0:
        _log_tokens(estimated_tokens, team_id=team_id)

    logger.info(
        "[%s] 응답 완료 (exit=%d, ~%dK tokens, 자동=%s)",
        team_id, proc.returncode or 0, estimated_tokens // 1000, is_auto,
    )

    # 토큰 급등 감지 → 자동 실행만 스탠바이 (수동 대화 무관)
    _check_token_spike(is_auto=is_auto)

    if proc.returncode != 0:
        stderr_data = await proc.stderr.read()
        err_msg = stderr_data.decode("utf-8", errors="replace").strip()
        if err_msg:
            # rate limit / 네트워크 에러 감지 → 자동 재시도 (최대 1회)
            retryable = any(k in err_msg.lower() for k in ["rate", "limit", "overloaded", "unknown error", "errno", "timeout", "connection"])
            if retryable and not is_auto:
                logger.warning("[%s] 재시도 가능 오류 감지, 5초 후 재시도: %s", team_id, err_msg[:100])
                yield {"kind": "text", "content": "⏳ 일시적 오류 — 5초 후 자동 재시도 중..."}
                await asyncio.sleep(5)
                # 재시도 (재귀 대신 플래그로 1회만)
                async for event in run_claude(prompt, project_path, team_id, is_auto=True):
                    yield event
                return
            logger.error("[%s] 오류: %s", team_id, err_msg)
            yield {"kind": "text", "content": f"\n⚠️ 오류: {err_msg}"}
