"""AI Company 본부 — FastAPI 메인 서버 (포트 8000)"""

import os
import sys
import asyncio
import time
import shutil
import json
import uuid
import subprocess
from pathlib import Path
from datetime import datetime, timedelta
from fastapi import FastAPI, WebSocket, UploadFile, File, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from ws_handler import (
    handle_chat, AGENT_STATUS, RECENT_ACTIVITY, _log_activity, set_team_lookup,
    collab_broadcast, CHAR_STATE, ACTIVE_COLLABS, get_char_state,
    manager as ws_manager,
)
from project_scanner import scan_all
from github_manager import create_repo, list_repos, _generate_system_prompt, PROJECT_TYPES
from system_monitor import get_all as get_system, get_process_stats
from notion_reader import fetch_notion_page
from claude_runner import TEAM_SESSIONS, TEAM_MODELS, AGENT_PIDS, MODEL_IDS, get_claude_version, _save_sessions, AGENT_TOKENS, run_claude, run_claude_light, get_budget_status, reset_budget
from auth import (
    register_user, verify_token, create_invite_code,
    get_all_codes, get_all_users, ensure_owner_code, ROLES, owner_login,
)
from push_notifications import (
    get_vapid_public_key, add_subscription, remove_subscription,
    send_push, send_agent_complete, send_server_error,
    get_notifications, get_unread_count, mark_read, mark_all_read, mark_team_read, delete_notification,
)
from task_queue import task_queue, pipeline_engine, debouncer
from ttyd_manager import start_team_terminal, stop_team_terminal, get_session_info
from trading_stats import get_trading_stats

load_dotenv()

# 서버 시작 시 오너 초대코드 확인
ensure_owner_code()

PROJECTS_ROOT = os.path.expanduser(os.getenv("PROJECTS_ROOT", "~/Developer/my-company"))

# 팀 목록 — teams.json에서 로드 (동적 추가 영구 반영)
TEAMS_FILE = os.path.join(os.path.dirname(__file__), "teams.json")

# 고정 순서 팀 — order 변경 불가
_PINNED_ORDERS: dict[str, int] = {
    "server-monitor": 0,
    "cpo-claude": 1,
}

_DEFAULT_TEAMS = [
    {"id": "server-monitor", "name": "서버실", "emoji": "🖥", "repo": "company-hq",
     "localPath": "~/Developer/my-company/company-hq", "status": "운영중",
     "order": 0, "layer": 0, "pinned": True},
    {"id": "cpo-claude", "name": "CPO", "emoji": "🧠", "repo": "company-hq",
     "localPath": "~/Developer/my-company/company-hq", "status": "운영중", "model": "opus",
     "order": 1, "layer": 0, "pinned": True},
    {"id": "trading-bot", "name": "매매봇", "emoji": "🤖", "repo": "upbit-auto-trading-bot",
     "localPath": "~/Developer/my-company/upbit-auto-trading-bot", "status": "운영중",
     "order": 2, "layer": 1},
    {"id": "date-map", "name": "데이트지도", "emoji": "🗺️", "repo": "date-map",
     "localPath": "~/Developer/my-company/date-map", "status": "운영중",
     "order": 3, "layer": 1},
    {"id": "claude-biseo", "name": "클로드비서", "emoji": "🤵", "repo": "claude-biseo-v1.0",
     "localPath": "~/Developer/my-company/claude-biseo-v1.0", "status": "은퇴",
     "order": 4, "layer": 1, "hidden": True},
    {"id": "ai900", "name": "AI900", "emoji": "📚", "repo": "ai900",
     "localPath": "~/Developer/my-company/ai900", "status": "운영중",
     "order": 5, "layer": 1},
    {"id": "cl600g", "name": "CL600G", "emoji": "⚡", "repo": "cl600g",
     "localPath": "~/Developer/my-company/cl600g", "status": "운영중",
     "order": 6, "layer": 1},
    {"id": "design-team", "name": "디자인팀", "emoji": "🎨", "repo": "design-team",
     "localPath": "~/Developer/my-company/design-team", "status": "운영중",
     "order": 7, "layer": 1},
    {"id": "content-lab", "name": "콘텐츠랩", "emoji": "🔬", "repo": "content-lab",
     "localPath": "~/Developer/my-company/content-lab", "status": "운영중",
     "order": 8, "layer": 2},
    {"id": "frontend-team", "name": "프론트엔드", "emoji": "🖼", "repo": "frontend-team",
     "localPath": "~/Developer/my-company/frontend-team", "status": "운영중",
     "order": 9, "layer": 2},
    {"id": "backend-team", "name": "백엔드", "emoji": "⚙️", "repo": "backend-team",
     "localPath": "~/Developer/my-company/backend-team", "status": "운영중",
     "order": 10, "layer": 2},
]

def _migrate_team_fields(team: dict, auto_order: int) -> dict:
    """order/layer/pinned 필드가 없는 기존 팀에 기본값 주입 (마이그레이션)"""
    tid = team.get("id", "")
    if "order" not in team:
        team["order"] = _PINNED_ORDERS.get(tid, auto_order)
    if "layer" not in team:
        team["layer"] = 0 if tid in _PINNED_ORDERS else 1
    if "pinned" not in team and tid in _PINNED_ORDERS:
        team["pinned"] = True
    # 고정 팀 order는 항상 강제 유지
    if tid in _PINNED_ORDERS:
        team["order"] = _PINNED_ORDERS[tid]
        team["pinned"] = True
    return team

def _load_teams() -> list:
    if os.path.isfile(TEAMS_FILE):
        with open(TEAMS_FILE, "r", encoding="utf-8") as f:
            teams = json.load(f)
        # 마이그레이션: order/layer 없는 팀 처리
        needs_save = False
        auto_order = 2  # pinned 2개 다음부터
        for t in teams:
            if t.get("id") not in _PINNED_ORDERS:
                auto_order += 1
            before = dict(t)
            _migrate_team_fields(t, auto_order)
            if t != before:
                needs_save = True
        if needs_save:
            _save_teams(teams)
        return sorted(teams, key=lambda t: t.get("order", 999))
    # 최초 실행 시 기본값 저장
    _save_teams(_DEFAULT_TEAMS)
    return list(_DEFAULT_TEAMS)

def _save_teams(teams: list):
    with open(TEAMS_FILE, "w", encoding="utf-8") as f:
        json.dump(teams, f, ensure_ascii=False, indent=2)

def _next_order(teams: list) -> int:
    """신규 팀에 부여할 order 값 (기존 최대 + 1, 최소 2)"""
    orders = [t.get("order", 0) for t in teams if not t.get("pinned")]
    return max(orders, default=1) + 1

TEAMS = _load_teams()
set_team_lookup(TEAMS)  # 푸시 알림용 팀 정보 초기화

# ── 층 배치 (floor_layout.json) ───────────────────────
_LAYOUT_FILE = os.path.join(os.path.dirname(__file__), "floor_layout.json")

# 기본 층 배치 (teams.json에서 서버실·CPO 제외한 팀 순서대로 배분)
_DEFAULT_LAYOUT: dict[str, list[str]] = {
    "1": ["trading-bot", "date-map", "claude-biseo", "ai900", "design-team"],
    "2": ["content-lab", "frontend-team", "backend-team"],
}

def _load_layout() -> dict[str, list[str]]:
    if os.path.isfile(_LAYOUT_FILE):
        try:
            with open(_LAYOUT_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    _save_layout(_DEFAULT_LAYOUT)
    return dict(_DEFAULT_LAYOUT)

def _save_layout(layout: dict[str, list[str]]):
    with open(_LAYOUT_FILE, "w", encoding="utf-8") as f:
        json.dump(layout, f, ensure_ascii=False, indent=2)


# ── 팀 위치 (team_positions.json) — 웹/모바일 동기화용 ───────────────
_POSITIONS_FILE = os.path.join(os.path.dirname(__file__), "team_positions.json")


def _load_positions() -> dict[str, dict[str, int]]:
    """teamId → {floor, gridX, gridY}"""
    if os.path.isfile(_POSITIONS_FILE):
        try:
            with open(_POSITIONS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_positions(positions: dict[str, dict[str, int]]) -> None:
    with open(_POSITIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(positions, f, ensure_ascii=False, indent=2)

def _sync_layout_with_teams(teams: list[dict], layout: dict[str, list[str]]) -> dict[str, list[str]]:
    """teams.json 변경 시 floor_layout.json에서 삭제된 팀 제거, 신규 팀 자동 배치
    pinned 팀(server-monitor, cpo-claude)은 게임에서 별도 렌더링 → layout 제외
    """
    pinned = {tid for tid, _ in _PINNED_ORDERS.items()}  # server-monitor, cpo-claude
    team_ids = {t["id"] for t in teams} - pinned
    # 레이아웃에 있는 팀 ID 수집
    assigned: set[str] = set()
    new_layout: dict[str, list[str]] = {}
    for floor, ids in sorted(layout.items(), key=lambda x: int(x[0])):
        cleaned = [tid for tid in ids if tid in team_ids]
        if cleaned:
            new_layout[floor] = cleaned
        assigned.update(cleaned)
    # 미배치 팀은 가장 적은 층에 추가
    for tid in team_ids - assigned:
        # 팀이 6개 미만인 층 찾기, 없으면 새 층 생성
        placed = False
        for floor in sorted(new_layout.keys(), key=int):
            if len(new_layout[floor]) < 6:
                new_layout[floor].append(tid)
                placed = True
                break
        if not placed:
            next_floor = str(max((int(f) for f in new_layout), default=0) + 1)
            new_layout[next_floor] = [tid]
    return new_layout

FLOOR_LAYOUT = _load_layout()
# 서버 시작 시 자동 동기화 — teams.json 의 모든 팀이 floor_layout.json에 포함되도록
try:
    FLOOR_LAYOUT = _sync_layout_with_teams(TEAMS, FLOOR_LAYOUT)
    _save_layout(FLOOR_LAYOUT)
except Exception:
    pass

app = FastAPI(title="AI Company HQ", version="1.0.0")

# CORS: allow_origins="*" + allow_credentials=True 는 Chrome에서 reject됨 (스펙 위반).
# 우리는 쿠키 인증 안 쓰므로 credentials=False 로 유지하고 와일드카드 허용.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 에이전트 워치독 (자동 복구, 토큰 0) ───────────────
_watchdog_task = None

async def _agent_watchdog():
    """60초마다 유령 에이전트 자동 복구 (토큰 미사용)
    - working=True인데 프로세스 없음 → working=False 리셋
    - working=True 5분 초과 + 프로세스 없음 → 강제 리셋
    - 세션 파일 5MB 초과 → 자동 리셋 (다음 실행 시 새 세션)
    """
    import logging
    _wd_logger = logging.getLogger("watchdog")
    while True:
        await asyncio.sleep(60)
        try:
            now = time.time()
            for team_id, status in list(AGENT_STATUS.items()):
                if not status.get("working"):
                    continue
                # 프로세스 존재 확인
                pid = AGENT_PIDS.get(team_id)
                proc_alive = False
                if pid:
                    try:
                        os.kill(pid, 0)
                        proc_alive = True
                    except (ProcessLookupError, PermissionError):
                        pass
                if not proc_alive:
                    # 프로세스 없는데 working=True → 유령 → 리셋
                    working_since = status.get("working_since", 0) or 0
                    elapsed = now - working_since if working_since else 999
                    if elapsed > 30:  # 30초 이상 유령이면 리셋
                        _wd_logger.warning("[워치독] %s 유령 상태 감지 (%.0f초) — 자동 리셋", team_id, elapsed)
                        AGENT_STATUS[team_id]["working"] = False
                        AGENT_STATUS[team_id]["tool"] = None
                        AGENT_STATUS[team_id]["working_since"] = None
                        AGENT_PIDS.pop(team_id, None)
        except Exception as e:
            _wd_logger.error("[워치독] 오류: %s", e)

@app.on_event("startup")
async def _start_watchdog():
    global _watchdog_task
    _watchdog_task = asyncio.create_task(_agent_watchdog())
    # F2: 10분마다 diag cleanup — closed 이슈 → 리포트 상태 resolved + 이미지 삭제
    asyncio.create_task(_diag_cleanup_loop())
    # 서버 재시작 시 running 상태 job들을 interrupted로 마킹 (이전 세션 크래시 복구)
    try:
        import sessions_store as _ss
        n = _ss.sweep_interrupted_jobs()
        if n > 0:
            logger.info("[startup] %d interrupted jobs swept on boot", n)
    except Exception as e:
        logger.warning("sweep_interrupted_jobs failed: %s", e)


async def _diag_cleanup_loop():
    """10분 간격 자동 cleanup (GH closed 이슈 기준)"""
    await asyncio.sleep(60)  # 부팅 후 1분 기다렸다가 시작
    while True:
        try:
            r = await diag_cleanup()
            if r.get("resolved", 0) > 0:
                logger.info("[diag_cleanup] %d resolved, %d images deleted", r["resolved"], r["deleted_images"])
        except Exception as e:
            logger.warning("[diag_cleanup] error: %s", e)
        await asyncio.sleep(600)  # 10분

# ── 서버 종료 시 Claude 프로세스 정리 ────────────
# NOTE: startup cleanup 제거됨 — uvicorn reload 시 활성 세션 kill 방지
# 고아 프로세스 정리는 119/112 감시 스크립트가 담당

@app.on_event("shutdown")
async def _shutdown_cleanup():
    """서버 종료 시 실행 중인 Claude 프로세스 종료"""
    import signal
    for team_id, pid in list(AGENT_PIDS.items()):
        try:
            pgid = os.getpgid(pid)
            os.killpg(pgid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass
    AGENT_PIDS.clear()


# ── 스탠바이 모드 (토큰 절약) ─────────────────────────
# claude_runner.STANDBY_FLAG 를 직접 설정 (순환 import 없이)
import claude_runner as _cr

@app.post("/api/standby/on")
async def standby_on():
    """스탠바이 모드 ON — 에이전트 실행 중단 (서버는 유지)"""
    _cr.STANDBY_FLAG = True
    # 현재 실행 중인 프로세스도 종료
    import signal
    for team_id, pid in list(AGENT_PIDS.items()):
        try:
            pgid = os.getpgid(pid)
            os.killpg(pgid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass
    AGENT_PIDS.clear()
    return {"ok": True, "standby": True, "message": "스탠바이 모드 ON — 에이전트 실행이 중단됩니다"}

@app.post("/api/standby/off")
async def standby_off():
    """스탠바이 모드 OFF — 에이전트 실행 재개"""
    _cr.STANDBY_FLAG = False
    return {"ok": True, "standby": False, "message": "스탠바이 모드 OFF — 에이전트 실행 재개"}

@app.get("/api/standby")
async def standby_status():
    """스탠바이 모드 상태 조회"""
    return {"ok": True, "standby": _cr.STANDBY_FLAG}


# ── 인증 API ─────────────────────────────────────────

@app.post("/api/auth/owner")
async def auth_owner(body: dict):
    """오너 비밀번호 로그인"""
    password = body.get("password", "")
    result = owner_login(password)
    if not result:
        return {"ok": False, "error": "비밀번호가 틀렸습니다."}
    return {"ok": True, **result}


@app.post("/api/auth/register")
async def auth_register(body: dict):
    """초대코드로 회원가입"""
    nickname = body.get("nickname", "").strip()
    code = body.get("code", "").strip()
    if not nickname or not code:
        return {"ok": False, "error": "닉네임과 초대코드를 입력하세요."}
    result = register_user(nickname, code)
    if not result:
        return {"ok": False, "error": "초대코드가 유효하지 않습니다."}
    return {"ok": True, **result}


@app.post("/api/auth/verify")
async def auth_verify(body: dict):
    """토큰 검증"""
    token = body.get("token", "")
    user = verify_token(token)
    if not user:
        return {"ok": False}
    return {"ok": True, **user}


@app.post("/api/auth/create-code")
async def auth_create_code(body: dict):
    """초대코드 생성 (오너/관리자만)"""
    token = body.get("token", "")
    user = verify_token(token)
    if not user or ROLES.get(user["role"], {}).get("level", 0) < 4:
        return {"ok": False, "error": "권한이 없습니다."}
    role = body.get("role", "member")
    max_uses = body.get("max_uses", 1)
    code = create_invite_code(role=role, created_by=user["nickname"], max_uses=max_uses)
    return {"ok": True, "code": code, "role": role}


@app.get("/api/auth/codes")
async def auth_list_codes():
    """초대코드 목록 (관리용)"""
    return get_all_codes()


@app.get("/api/auth/users")
async def auth_list_users():
    """사용자 목록 (관리용)"""
    return get_all_users()


@app.get("/api/auth/roles")
async def auth_roles():
    """역할 목록"""
    return ROLES


# ── REST API ──────────────────────────────────────────

@app.get("/api/teams")
async def get_teams():
    """팀 목록 + 프로젝트 현황(버전, 최근 커밋일 포함) — order 순 정렬"""
    sorted_teams = sorted(TEAMS, key=lambda t: t.get("order", 999))
    return scan_all(PROJECTS_ROOT, sorted_teams)


@app.get("/api/teams/info")
async def get_teams_info():
    """팀 목록 + 버전/업데이트일 간략 정보 (폴링용 경량 API) — order 순 정렬"""
    from project_scanner import scan_project
    result = []
    for team in sorted(TEAMS, key=lambda t: t.get("order", 999)):
        local_path = os.path.expanduser(team.get("localPath", ""))
        scan = scan_project(local_path)
        result.append({
            "id": team["id"],
            "name": team["name"],
            "emoji": team.get("emoji", ""),
            "version": scan.get("version"),
            "version_updated": scan.get("version_updated"),
            "last_commit_date": scan.get("last_commit_date"),
            "last_commit": scan.get("last_commit"),
        })
    return result


@app.get("/api/project-types")
async def get_project_types():
    """프로젝트 타입 목록 반환 (UI 선택지용)"""
    return [
        {"id": k, "label": v["label"], "tech": v["tech"]}
        for k, v in PROJECT_TYPES.items()
    ]


@app.post("/api/teams")
async def add_team(body: dict):
    """신규 팀 추가: GitHub 레포 생성 + 로컬 클론 + CLAUDE.md + 시스템프롬프트 자동 등록"""
    name = body.get("name", "").strip()
    repo_name = body.get("repo", name).strip()
    emoji = body.get("emoji", "🆕")
    description = body.get("description", "")
    project_type = body.get("project_type", "general")

    if not name or not repo_name:
        return {"ok": False, "error": "name과 repo는 필수입니다."}

    result = create_repo(repo_name, description, project_type=project_type, emoji=emoji)
    if not result["ok"]:
        return result

    # category: "dev"=개발/서포트, "product"=독자 프로젝트
    category = body.get("category", "product")  # 기본값 = 독자 프로젝트
    new_team = {
        "id": repo_name,
        "name": name,
        "emoji": emoji,
        "repo": repo_name,
        "localPath": f"~/Developer/my-company/{repo_name}",
        "status": "운영중",
        "category": category,
        "order": _next_order(TEAMS),
        "layer": 1,
    }
    # 중복 체크
    if not any(t["id"] == repo_name for t in TEAMS):
        TEAMS.append(new_team)
        _save_teams(TEAMS)  # JSON 영구 저장
        set_team_lookup(TEAMS)  # 푸시 룩업 갱신

    # 시스템프롬프트 자동 등록 (claude_runner에 동적 추가 + 파일 영구 저장)
    from claude_runner import TEAM_SYSTEM_PROMPTS, _save_prompts, _SAVED_PROMPTS
    if result.get("system_prompt"):
        TEAM_SYSTEM_PROMPTS[repo_name] = result["system_prompt"]
        _SAVED_PROMPTS[repo_name] = result["system_prompt"]
        _save_prompts(_SAVED_PROMPTS)

    # 층 배치 동기화 (신규 팀 자동 배치)
    global FLOOR_LAYOUT
    FLOOR_LAYOUT = _sync_layout_with_teams(TEAMS, FLOOR_LAYOUT)
    _save_layout(FLOOR_LAYOUT)

    return {
        "ok": True,
        "team": new_team,
        "repo_url": result["repo_url"],
        "project_type": project_type,
        "claude_md": True,
    }


@app.post("/api/agents/generate-config")
async def generate_agent_config(body: dict):
    """TM generateAgentConfig 패턴 — 설명 1줄로 LLM이 역할/스텝/산출물 자동 생성.

    body: {name?, description}
    returns: {ok, role, description, outputHint, steps, system_prompt}
    """
    agent_name = (body.get("name") or "").strip() or "새 에이전트"
    desc = (body.get("description") or "").strip()
    if not desc:
        return {"ok": False, "error": "description 필요"}

    system_prompt = (
        "너는 AI 에이전트 역할 설계 전문가다. 유저가 설명한 역할에 맞는 단일 AI 에이전트를 설계해.\n\n"
        "반드시 아래 JSON 형식으로만 응답. 다른 텍스트 금지.\n\n"
        "{\n"
        '  "role": "역할명 (한국어, 간결, ~담당 형식)",\n'
        '  "description": "이 에이전트가 뭘 하는지 쉬운 한국어 1-2문장",\n'
        '  "outputHint": "산출물 형식 (쉼표구분 2~4개, 예: 설계문서, 코드, 테스트)",\n'
        '  "steps": ["1단계 설명", "2단계 설명", "3단계 설명"]\n'
        "}\n\n"
        "규칙:\n"
        "- 단일 에이전트가 모든 책임 통합 수행\n"
        "- role은 '~담당' 형식 (예: 마케팅 담당)\n"
        "- description은 비개발자도 이해 가능한 평이한 말\n"
        "- outputHint는 구체 산출물 나열\n"
        "- steps 2~4단계, 각 한 문장"
    )
    user_msg = f"에이전트 이름: {agent_name}\n에이전트 설명: {desc}\n\n이 에이전트를 설계해줘."

    full_prompt = f"{system_prompt}\n\n{user_msg}"
    try:
        result = await run_claude_light(full_prompt, os.path.expanduser("~/Developer/my-company/company-hq"))
    except Exception as e:
        return {"ok": False, "error": f"LLM 호출 실패: {e}"}

    import re as _re
    m = _re.search(r'\{[\s\S]*\}', result)
    if not m:
        return {"ok": False, "error": "JSON 파싱 실패", "raw": result[:300]}
    try:
        cfg = json.loads(m.group())
    except json.JSONDecodeError as e:
        return {"ok": False, "error": f"JSON 파싱 에러: {e}", "raw": result[:300]}

    # 생성된 config로 system_prompt 합성
    steps_text = "\n".join(f"{i+1}. {s}" for i, s in enumerate(cfg.get("steps", [])))
    role = cfg.get("role", "담당자")
    sys_prompt = (
        f"# {agent_name} ({role})\n\n"
        f"## 페르소나\n"
        f"너는 10년 경력의 시니어 {role}다. 실무 경험 풍부, 실수 줄이고 실행력 강함.\n"
        "무엇을 모르는지 명확히 알고, 모르면 되물어서 확실히 한다.\n\n"
        f"## 역할\n{cfg.get('description', desc)}\n\n"
        f"## 산출물\n{cfg.get('outputHint', '보고서')}\n\n"
        f"## 작업 단계\n{steps_text}\n\n"
        "## 행동 원칙\n"
        "- 80% 확신이면 실행 후 보고, 불확실하면 간단히 확인 질문\n"
        "- 무응답 금지. 완료 시 `✅ (한 줄 요약)`, 에러 시 `❌ (원인)`\n"
        "- 한국어로 자연스럽게, 마크다운 활용\n"
        "- 협업 필요 시 `@팀명`으로 다른 에이전트 호출\n\n"
        "## CLAUDE.md 연계\n"
        "프로젝트 폴더에 CLAUDE.md 있으면 그걸 최우선으로 따른다.\n"
        "없으면 이 프롬프트가 최상위 지침.\n"
    )
    return {
        "ok": True,
        "role": cfg.get("role", ""),
        "description": cfg.get("description", desc),
        "outputHint": cfg.get("outputHint", ""),
        "steps": cfg.get("steps", []),
        "system_prompt": sys_prompt,
    }


@app.post("/api/teams/light")
async def add_light_agent(body: dict):
    """경량 에이전트 — GitHub/레포 없이 빠르게 추가 (단독 / 협업 가능)"""
    import re as _re
    description = (body.get("description") or "").strip()
    if not description:
        return {"ok": False, "error": "설명이 필요합니다"}
    emoji = body.get("emoji") or "🤖"
    collaborative = bool(body.get("collaborative", True))

    # 자연어 description에서 간단히 name/id 추출 (1차: 유저 제공, 2차: LLM, 3차: 해시)
    name = (body.get("name") or "").strip()
    team_id = (body.get("id") or "").strip()
    if not name:
        # description 첫 단어 사용
        first = description.split()[0] if description.split() else "agent"
        name = first[:20]
    if not team_id:
        base = _re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
        if not base or len(base) < 3:
            base = f"agent-{uuid.uuid4().hex[:6]}"
        team_id = base
    if not _re.match(r'^[a-z0-9][a-z0-9-]*$', team_id):
        return {"ok": False, "error": "id는 영문 소문자/숫자/하이픈"}

    # 중복 체크
    if any(t["id"] == team_id for t in TEAMS):
        return {"ok": False, "error": f"이미 존재하는 id: {team_id}"}

    # 🛡 light 팀 격리 — 두근컴퍼니 메인 폴더 CLAUDE.md 자동 로드 차단
    # 각 팀별 sandbox 폴더 (~/Developer/agents/{team_id}/) 자동 생성
    # 그 안에 자기 역할만 담은 CLAUDE.md 작성 → cwd 진입 시 깔끔한 컨텍스트
    sandbox = os.path.expanduser(f"~/Developer/agents/{team_id}")
    os.makedirs(sandbox, exist_ok=True)
    sandbox_md = os.path.join(sandbox, "CLAUDE.md")
    if not os.path.exists(sandbox_md):
        with open(sandbox_md, "w", encoding="utf-8") as f:
            f.write(
                f"# {name} ({team_id})\n\n"
                f"## 역할\n{description}\n\n"
                "## 작업 폴더\n"
                f"이 폴더(`~/Developer/agents/{team_id}/`) 안에서만 작업한다.\n"
                "산출물(코드/문서/에셋) 모두 여기에 저장.\n\n"
                "## 격리 정책\n"
                "- 두근컴퍼니 메인(~/Developer/my-company/company-hq/) 의 CLAUDE.md / policies.md 무시\n"
                "- 두근컴퍼니 운영 / 오피스 씬 / 멀티에이전트 시스템에 관여 금지\n"
                "- 본인 역할 외 메타 컨텍스트 (회사 정책/팀 디스패치 등) 는 사용자가 명시적으로 요청할 때만 응답\n"
            )
    local_path = sandbox

    new_team = {
        "id": team_id, "name": name, "emoji": emoji,
        "repo": "", "localPath": local_path,
        "status": "운영중", "category": "product",
        "order": _next_order(TEAMS), "layer": 1,
        "lightweight": True, "collaborative": collaborative,
    }
    TEAMS.append(new_team)
    _save_teams(TEAMS)
    set_team_lookup(TEAMS)

    # 시스템 프롬프트: 클라이언트가 generate-config로 만든 프롬프트 넘기면 그거 사용, 없으면 간단 템플릿
    from claude_runner import TEAM_SYSTEM_PROMPTS, _save_prompts, _SAVED_PROMPTS
    provided_prompt = (body.get("system_prompt") or "").strip()
    collab_line = (
        "- 다른 두근컴퍼니 팀과 협업 가능 (@태그 / 핸드오프 — 사용자가 명시 요청 시에만)"
        if collaborative else
        "- 단독 실행 전용 — 다른 팀 호출 금지"
    )
    isolation_block = (
        "\n\n【격리 — 매우 중요】\n"
        f"- 너의 작업 폴더는 `~/Developer/agents/{team_id}/` (sandbox)\n"
        "- 두근컴퍼니 메인 레포(~/Developer/my-company/company-hq/)에 절대 접근/수정 금지\n"
        "- 두근컴퍼니 운영/오피스 씬/멀티에이전트 시스템 관련 응답 금지\n"
        "- '두근컴퍼니' 라는 메타 컨텍스트는 너 자신을 정의하지 않는다 — 너는 위 역할 그 자체야\n"
        "- 사용자 요청이 본인 역할 범위 밖이면 명확히 거절: '제 역할은 X 입니다. 이건 다른 팀에 부탁드려요.'\n"
        "- 사용자 요청이 범위 안이면 즉시 실행 — 회사 정책 우회 핑계 금지\n"
    )
    if provided_prompt:
        sys_prompt = provided_prompt + isolation_block + "\n【협업】\n" + collab_line + "\n"
    else:
        sys_prompt = (
            f"너는 '{name}' 전문 에이전트다.\n\n"
            f"【역할】 {description}\n\n"
            "【행동 원칙】\n"
            f"{collab_line}\n"
            "- 80% 확신이면 실행 후 보고\n"
            "- 무응답 금지, 작업 완료 시 ✅ 요약 / 에러 시 ❌ 내용\n"
            "- 한국어로 자연스럽게 대화\n"
            + isolation_block
        )
    TEAM_SYSTEM_PROMPTS[team_id] = sys_prompt
    _SAVED_PROMPTS[team_id] = sys_prompt
    _save_prompts(_SAVED_PROMPTS)

    # 층 배치 동기화
    global FLOOR_LAYOUT
    FLOOR_LAYOUT = _sync_layout_with_teams(TEAMS, FLOOR_LAYOUT)
    _save_layout(FLOOR_LAYOUT)

    return {"ok": True, "team": new_team, "lightweight": True}


@app.delete("/api/teams/{team_id}")
async def delete_team(team_id: str):
    """에이전트 삭제 — teams.json + 로컬 폴더 + GitHub 레포 + 프롬프트 정리"""
    import json
    import logging
    global TEAMS
    if team_id in ("cpo-claude",):
        return {"ok": False, "error": "CPO는 삭제할 수 없습니다."}
    before = len(TEAMS)
    TEAMS = [t for t in TEAMS if t["id"] != team_id]
    if len(TEAMS) == before:
        return {"ok": False, "error": "팀을 찾을 수 없습니다."}
    _save_teams(TEAMS)
    set_team_lookup(TEAMS)  # 푸시 룩업 갱신

    # 1) 로컬 폴더 삭제
    local_dir = os.path.expanduser(f"~/Developer/my-company/{team_id}")
    shutil.rmtree(local_dir, ignore_errors=True)
    logging.info(f"[DELETE] 로컬 폴더 삭제: {local_dir}")

    # 2) GitHub 레포 삭제
    try:
        from github import Github
        gh_token = os.getenv("GITHUB_TOKEN", "")
        if gh_token:
            g = Github(gh_token)
            g.get_repo(f"600-g/{team_id}").delete()
            logging.info(f"[DELETE] GitHub 레포 삭제: 600-g/{team_id}")
    except Exception as e:
        logging.warning(f"[DELETE] GitHub 레포 삭제 실패: {e}")

    # 3) team_prompts.json에서 제거
    try:
        from claude_runner import _SAVED_PROMPTS, _save_prompts, TEAM_SYSTEM_PROMPTS
        if team_id in _SAVED_PROMPTS:
            del _SAVED_PROMPTS[team_id]
            _save_prompts(_SAVED_PROMPTS)
        TEAM_SYSTEM_PROMPTS.pop(team_id, None)
        logging.info(f"[DELETE] 프롬프트 정리 완료: {team_id}")
    except Exception as e:
        logging.warning(f"[DELETE] 프롬프트 정리 실패: {e}")

    # 층 배치 동기화 (삭제된 팀 제거)
    global FLOOR_LAYOUT
    FLOOR_LAYOUT = _sync_layout_with_teams(TEAMS, FLOOR_LAYOUT)
    _save_layout(FLOOR_LAYOUT)

    # 4) 채팅 히스토리 (세션 디렉토리 + 레거시 파일) 삭제
    try:
        import sessions_store
        sessions_store.delete_all_for_team(team_id)
        logging.info(f"[DELETE] 채팅 세션 디렉토리 삭제: {team_id}")
    except Exception as e:
        logging.warning(f"[DELETE] 세션 디렉토리 삭제 실패: {e}")

    # 5) team_sessions.json에서 세션 제거
    try:
        TEAM_SESSIONS.pop(team_id, None)
        _save_sessions(TEAM_SESSIONS)
        logging.info(f"[DELETE] 세션 정리 완료: {team_id}")
    except Exception as e:
        logging.warning(f"[DELETE] 세션 정리 실패: {e}")

    # 6) AGENT_STATUS 메모리 정리
    AGENT_STATUS.pop(team_id, None)

    # 7) CHAR_STATE 메모리 정리
    CHAR_STATE.pop(team_id, None)

    _log_activity(team_id, "🗑️ 에이전트 완전 삭제됨 (로컬+GitHub+프롬프트+세션+히스토리)")
    return {"ok": True, "team_id": team_id}


@app.get("/api/repos")
async def get_repos():
    """GitHub 레포 목록"""
    return list_repos()


# ── 팀 순서/층 변경 API ───────────────────────────────

@app.put("/api/teams/{team_id}/order")
async def update_team_order(team_id: str, body: dict):
    """단일 팀의 order(순서)와 layer(층) 변경

    body: {"order": 3, "layer": 1}
    - pinned 팀(server-monitor, cpo-claude)은 order 변경 불가
    - layer는 pinned 팀도 변경 불가 (layer=0 고정)
    """
    team = next((t for t in TEAMS if t["id"] == team_id), None)
    if not team:
        return {"ok": False, "error": "팀을 찾을 수 없습니다."}
    if team.get("pinned"):
        return {"ok": False, "error": f"{team['name']}은(는) 고정 팀이라 순서를 변경할 수 없습니다."}

    new_order = body.get("order")
    new_layer = body.get("layer")

    if new_order is not None:
        # order 2 미만은 pinned 전용 — 일반 팀은 2 이상만 허용
        if int(new_order) < 2:
            return {"ok": False, "error": "order 0, 1은 고정 팀 전용입니다."}
        team["order"] = int(new_order)

    if new_layer is not None:
        team["layer"] = int(new_layer)

    _save_teams(TEAMS)
    _log_activity(team_id, f"🔀 순서 변경 → order:{team['order']} layer:{team['layer']}")
    return {"ok": True, "team_id": team_id, "order": team["order"], "layer": team["layer"]}


@app.put("/api/teams/reorder")
async def reorder_teams(body: dict):
    """다수 팀 순서 일괄 변경 (드래그 앤 드롭 후 저장)

    body: {"orders": [{"id": "trading-bot", "order": 3, "layer": 1}, ...]}
    - pinned 팀(server-monitor, cpo-claude) 항목은 무시됨
    """
    orders: list[dict] = body.get("orders", [])
    if not orders:
        return {"ok": False, "error": "orders 필드가 필요합니다."}

    team_map = {t["id"]: t for t in TEAMS}
    updated = []
    for item in orders:
        tid = item.get("id", "")
        team = team_map.get(tid)
        if not team or team.get("pinned"):
            continue  # pinned 팀은 건너뜀
        new_order = item.get("order")
        new_layer = item.get("layer")
        if new_order is not None and int(new_order) >= 2:
            team["order"] = int(new_order)
        if new_layer is not None:
            team["layer"] = int(new_layer)
        updated.append(tid)

    _save_teams(TEAMS)
    return {"ok": True, "updated": updated}


# ── 층 배치 API ────────────────────────────────────────

@app.get("/api/layout/floors")
async def get_floor_layout():
    """층 배치 반환 — 각 층에 어떤 팀이 있는지 + 팀 메타 포함

    응답:
    {
      "ok": true,
      "floors": [
        {"floor": 1, "teams": [{"id":"trading-bot","name":"매매봇","emoji":"🤖",...}]},
        ...
      ]
    }
    """
    team_map = {t["id"]: t for t in TEAMS}
    floors = []
    for floor_str, team_ids in sorted(FLOOR_LAYOUT.items(), key=lambda x: int(x[0])):
        teams_in_floor = []
        for tid in team_ids:
            if tid in ("cpo-claude", "server-monitor"):  # CPO·서버실은 게임에서 별도 렌더링 (스태프는 일반 캐릭으로 렌더)
                continue
            team = team_map.get(tid)
            if team:
                teams_in_floor.append({
                    "id": team["id"],
                    "name": team.get("name", ""),
                    "emoji": team.get("emoji", ""),
                    "status": team.get("status", "운영중"),
                    "model": team.get("model", "sonnet"),
                })
        floors.append({"floor": int(floor_str), "teams": teams_in_floor})
    return {"ok": True, "floors": floors}


@app.get("/api/layout/positions")
async def get_team_positions():
    """팀별 그리드 위치 반환 — 웹/모바일 동기화용

    응답: {"ok": true, "positions": {"team-id": {"floor": 1, "gx": 5, "gy": 8}}}
    """
    return {"ok": True, "positions": _load_positions()}


@app.put("/api/layout/positions")
async def update_team_positions(body: dict):
    """팀 위치 저장 — 프론트 드래그 후 호출

    body: {"positions": {"team-id": {"floor": 1, "gx": 5, "gy": 8}}}
    """
    incoming = body.get("positions") or {}
    current = _load_positions()
    # 병합 (incoming이 우선)
    for tid, pos in incoming.items():
        if isinstance(pos, dict) and "gx" in pos and "gy" in pos:
            current[tid] = {
                "floor": int(pos.get("floor", 1)),
                "gx": int(pos["gx"]),
                "gy": int(pos["gy"]),
            }
    _save_positions(current)
    return {"ok": True, "positions": current}


@app.put("/api/layout/floors")
async def update_floor_layout(body: dict):
    """층 배치 업데이트 — 프론트에서 팀 드래그 후 저장 시 호출

    body: {"layout": {"1": ["team-a","team-b"], "2": ["team-c"]}}
    """
    global FLOOR_LAYOUT
    new_layout: dict[str, list[str]] = body.get("layout", {})
    if not new_layout:
        return {"ok": False, "error": "layout 필드가 필요합니다"}
    # 유효한 팀만 허용
    valid_ids = {t["id"] for t in TEAMS}
    cleaned: dict[str, list[str]] = {}
    for floor_str, ids in new_layout.items():
        filtered = [tid for tid in ids if tid in valid_ids]
        if filtered:
            cleaned[floor_str] = filtered
    FLOOR_LAYOUT = cleaned
    _save_layout(FLOOR_LAYOUT)
    return {"ok": True, "layout": FLOOR_LAYOUT}


# ── 사무실 가구 레이아웃 동기화 (모든 기기 공유) ──────────────────

OFFICE_LAYOUT_PATH = Path(__file__).parent / "office_layout.json"


def _load_office_layout() -> dict:
    if OFFICE_LAYOUT_PATH.exists():
        try:
            with open(OFFICE_LAYOUT_PATH, encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning("office_layout.json load failed: %s", e)
    return {"version": 2, "items": [], "removed": []}


def _save_office_layout(layout: dict) -> None:
    try:
        with open(OFFICE_LAYOUT_PATH, "w", encoding="utf-8") as f:
            json.dump(layout, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error("office_layout.json save failed: %s", e)


@app.get("/api/layout/office")
async def get_office_layout() -> dict:
    """사무실 가구 배치 — 모든 기기 공유 (PC/모바일 동기화)"""
    return {"ok": True, "layout": _load_office_layout()}


@app.put("/api/layout/office")
async def update_office_layout(body: dict) -> dict:
    """사무실 가구 배치 저장 — 에디터에서 placement 변경 시 호출

    body: {"layout": {"version": 2, "items": [...], "removed": [...]}}
    """
    layout = body.get("layout") or {}
    items = layout.get("items")
    if not isinstance(items, list):
        return {"ok": False, "error": "layout.items 배열이 필요합니다"}
    cleaned = {
        "version": 2,
        "items": items,
        "removed": layout.get("removed") or [],
        "updated_at": datetime.utcnow().isoformat(),
    }
    _save_office_layout(cleaned)
    return {"ok": True, "layout": cleaned}


# ── 브라우저 진단 로그 + 버그 리포트 ────────────────────
DIAG_DIR = os.path.join(os.path.dirname(__file__), "diag")
os.makedirs(DIAG_DIR, exist_ok=True)
DIAG_LOG_PATH = os.path.join(DIAG_DIR, "client_logs.jsonl")
DIAG_REPORTS_PATH = os.path.join(DIAG_DIR, "bug_reports.jsonl")
_DIAG_LOG_MAX_LINES = 5000


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


@app.post("/api/diag/log")
async def diag_log(body: dict) -> dict:
    """브라우저 console.info/warn/error 포워드. body: {entries: [{level,msg,ts,ua,url,user}]}"""
    entries = body.get("entries") or []
    if not isinstance(entries, list):
        return {"ok": False, "error": "entries 배열 필요"}
    server_ts = datetime.utcnow().isoformat()
    for e in entries[-200:]:  # 최대 200줄/요청
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


@app.get("/api/diag/logs")
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


def _find_duplicate_report(title: str, note: str) -> dict | None:
    """최근 open 리포트 중 title 또는 note 유사도가 높으면 반환 (F4)"""
    if not os.path.exists(DIAG_REPORTS_PATH):
        return None
    try:
        from difflib import SequenceMatcher
        t_norm = (title or "").strip().lower()
        n_norm = (note or "").strip().lower()
        if not t_norm and not n_norm:
            return None
        with open(DIAG_REPORTS_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()[-40:]  # 최근 40개만
        for line in reversed(lines):
            try:
                r = json.loads(line)
            except Exception:
                continue
            if r.get("status") == "resolved":
                continue
            if not r.get("issue_number"):
                continue
            # title 유사도 or note substring
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


@app.post("/api/diag/report")
async def diag_report(body: dict) -> dict:
    """버그 리포트 제출: {title, note, logs, meta, attachments}"""
    priority = "urgent" if str(body.get("priority", "")).lower() == "urgent" else "normal"
    # F4: 중복 탐지 — 최근 open 리포트와 유사하면 기존 이슈에 코멘트만 추가
    dup = _find_duplicate_report(str(body.get("title", "")), str(body.get("note", "")))
    if dup and dup.get("issue_number"):
        try:
            import subprocess
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
            # 로컬에도 dup 레코드 남김
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
    # GitHub Issue 자동 생성 (gh CLI 있으면)
    issue_url: str | None = None
    try:
        import subprocess
        gh = "/opt/homebrew/bin/gh"
        if not os.path.exists(gh):
            gh = "gh"
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
        # 긴급 시 urgent 라벨 추가
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
    # F1: jsonl 레코드에 issue_url + issue_number + status 삽입 (마지막 라인 교체)
    try:
        import re as _re
        m = _re.search(r"/issues/(\d+)", issue_url or "")
        issue_number = int(m.group(1)) if m else None
        row["issue_url"] = issue_url
        row["issue_number"] = issue_number
        row["status"] = "open"
        # 파일의 마지막 라인이 방금 쓴 것이므로 교체
        with open(DIAG_REPORTS_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()
        if lines:
            lines[-1] = json.dumps(row, ensure_ascii=False) + "\n"
            with open(DIAG_REPORTS_PATH, "w", encoding="utf-8") as f:
                f.writelines(lines)
    except Exception as e:
        logger.warning("report issue linking failed: %s", e)
    return {"ok": True, "issue_url": issue_url}


# ── F2: 자동 cleanup — closed 이슈의 첨부 이미지 + 상태 마킹 ──
@app.post("/api/diag/report/status")
async def diag_set_status(body: dict) -> dict:
    """버그 리포트 상태 변경 — 체크박스 토글로 resolved/open 직접 전환.

    body: { ts: "...", status: "resolved" | "open" | "in_progress" }
    """
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


@app.post("/api/diag/cleanup")
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

    # 리포트 파일 순회 → status 업데이트 + 첨부 이미지 삭제
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
            # 첨부 이미지 삭제
            for p in row.get("attachments", []):
                try:
                    if p and os.path.exists(p):
                        os.unlink(p)
                        deleted_images += 1
                except Exception:
                    pass
            row["attachments"] = []  # 경로도 비움
        new_lines.append(json.dumps(row, ensure_ascii=False) + "\n")

    if resolved_count > 0:
        with open(DIAG_REPORTS_PATH, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    return {"ok": True, "resolved": resolved_count, "deleted_images": deleted_images}


# ── 자동 복구 티켓 (AI 에이전트 self-recording) ────────────────────
# `_auto_recovery_dispatch` 가 트리거될 때 jsonl 에 자동 ticket 작성.
# CPO 가 진단/수정/재시도 완료하면 ts 받아 /api/diag/report/status 로 resolved 마킹.
# 사용자 등록 버그도 /api/diag/auto-fix/{ts} 로 CPO 에 위임 가능 (사전 준비).
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


@app.post("/api/diag/auto-fix/{ts}")
async def diag_auto_fix(ts: str) -> dict:
    """사용자가 등록한 버그를 CPO 에 자동 위임 (수정 사전 준비).
    /bugs 페이지의 [AI에 수정 위임] 버튼이 호출. CPO 가 dispatch block 으로 적합 팀에 분배.
    """
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
    # 이미 진행 중이면 중복 방지
    if target.get("status") == "in_progress":
        return {"ok": False, "error": "이미 AI 수정 진행 중"}
    # 사용자 버그를 CPO 에 background dispatch
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
        # in_progress 마킹
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


@app.get("/api/diag/reports")
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
    # status 필터링 (빈 문자열 또는 "all" 이면 전체)
    if status and status != "all":
        rows = [r for r in rows if (r.get("status") or "open") == status]
    return {"ok": True, "rows": rows[-limit:]}


# ── 가구 카탈로그 관리자 오버라이드 ────────────────────
FURNITURE_OVERRIDES_PATH = os.path.join(os.path.dirname(__file__), "furniture_overrides.json")


def _load_furniture_overrides() -> dict:
    if os.path.exists(FURNITURE_OVERRIDES_PATH):
        try:
            with open(FURNITURE_OVERRIDES_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                return data
        except Exception as e:
            logger.warning("furniture_overrides.json load failed: %s", e)
    return {}


def _save_furniture_overrides(data: dict) -> None:
    try:
        with open(FURNITURE_OVERRIDES_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error("furniture_overrides.json save failed: %s", e)


@app.get("/api/furniture/overrides")
async def get_furniture_overrides() -> dict:
    """카탈로그 라벨/카테고리/숨김 오버라이드 — 모든 기기 동기화"""
    return {"ok": True, "overrides": _load_furniture_overrides()}


@app.put("/api/furniture/overrides")
async def update_furniture_overrides(body: dict) -> dict:
    """관리자 전용 — 가구 카탈로그 오버라이드 전체 덮어쓰기.

    🛡 안전장치: 기존 override가 있고 새 payload가 `confirm_replace` 없이
    기존보다 50% 이상 적으면 거부 (실수 덮어쓰기 방지).
    """
    overrides = body.get("overrides") or {}
    if not isinstance(overrides, dict):
        return {"ok": False, "error": "overrides 객체 필요"}
    # 기존 데이터와 비교
    prev = _load_furniture_overrides()
    prev_count = len(prev.get("overrides", {})) if isinstance(prev.get("overrides"), dict) else 0
    new_count = len(overrides)
    # 10개 이상 있던 상태에서 절반 이하로 줄어드는 경우만 안전장치 (정상 사용엔 영향 없음)
    if prev_count >= 10 and new_count < prev_count * 0.5 and not body.get("confirm_replace"):
        return {
            "ok": False,
            "error": "기존 override보다 크게 적음 — 실수 덮어쓰기 방지. 맞다면 confirm_replace:true 추가",
            "prev_count": prev_count,
            "new_count": new_count,
        }
    cleaned: dict = {
        "version": 1,
        "overrides": overrides,
        "poke_labels": body.get("poke_labels") or {},
        "poke_hidden": body.get("poke_hidden") or [],
        "tile_labels": body.get("tile_labels") or {},
        "tile_hidden": body.get("tile_hidden") or [],
        "updated_at": datetime.utcnow().isoformat(),
    }
    _save_furniture_overrides(cleaned)
    return {"ok": True, "saved": cleaned}


# ── doogeun-hq 상태 동기화 (에이전트 + 레이아웃) ───────
# 로컬 localStorage + 서버 JSON + WebSocket 실시간 브로드캐스트
DOOGEUN_STATE_PATH = os.path.join(os.path.dirname(__file__), "doogeun_state.json")
_doogeun_ws_clients: set = set()


def _load_doogeun_state() -> dict:
    if os.path.exists(DOOGEUN_STATE_PATH):
        try:
            with open(DOOGEUN_STATE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                return data
        except Exception as e:
            logger.warning("doogeun_state.json load failed: %s", e)
    return {"agents": [], "layout": {"floors": {}}, "version": 0, "updated_at": None}


def _save_doogeun_state(data: dict) -> None:
    """원자적 쓰기 + 시간별 백업. 쓰기 도중 재시작/크래시 시에도 무결성 유지."""
    try:
        # 4시간 단위 백업 로테이션 (6개 = 24시간 보존, 디스크 I/O 1/4)
        if os.path.exists(DOOGEUN_STATE_PATH):
            backup_dir = os.path.join(os.path.dirname(DOOGEUN_STATE_PATH), "doogeun_state_backups")
            os.makedirs(backup_dir, exist_ok=True)
            now = datetime.utcnow()
            bucket = (now.hour // 4) * 4
            stamp = f"{now.strftime('%Y%m%d')}-{bucket:02d}"
            backup_path = os.path.join(backup_dir, f"doogeun_state.{stamp}.json")
            if not os.path.exists(backup_path):
                try:
                    shutil.copy2(DOOGEUN_STATE_PATH, backup_path)
                    import glob as _glob
                    backups = sorted(_glob.glob(os.path.join(backup_dir, "doogeun_state.*.json")))
                    while len(backups) > 6:
                        try: os.remove(backups[0])
                        except OSError: pass
                        backups.pop(0)
                except Exception as be:
                    logger.warning("doogeun_state backup failed: %s", be)
        # 원자적 쓰기 — tmp 파일에 쓰고 rename (POSIX atomic)
        # 쓰기 도중 재시작돼도 원본 파일 무결성 유지
        tmp_path = DOOGEUN_STATE_PATH + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())  # 디스크 sync 강제
        os.replace(tmp_path, DOOGEUN_STATE_PATH)  # atomic rename
    except Exception as e:
        logger.error("doogeun_state.json save failed: %s", e)


@app.get("/api/doogeun/state")
async def get_doogeun_state() -> dict:
    """전체 doogeun-hq 상태 — 에이전트 + 레이아웃.

    GET 시 teams.json 의 새 팀(예: staff)을 자동 보충 — 클라가 빠진 팀 못 받는 문제 방지.
    """
    state = _load_doogeun_state()
    existing_ids = {a.get("id") for a in state.get("agents", [])}
    server_skip = {"server-monitor"}  # 캐릭 없는 팀
    added = []
    now_ts = int(time.time() * 1000)
    for t in TEAMS:
        tid = t.get("id")
        if not tid or tid in existing_ids or tid in server_skip:
            continue
        # 새 팀 자동 추가
        new_agent = {
            "id": tid,
            "name": t.get("name", tid),
            "emoji": t.get("emoji", "🧑"),
            "role": t.get("category", ""),
            "description": t.get("status", ""),
            "systemPromptMd": "",
            "status": "idle",
            "floor": 1,
            "createdAt": now_ts,
            "updatedAt": now_ts,
            "activity": [],
        }
        state.setdefault("agents", []).append(new_agent)
        added.append(tid)
    if added:
        _save_doogeun_state(state)
        logger.info("[doogeun_state] 자동 보충: %s", added)
    return {"ok": True, "state": state}


@app.put("/api/doogeun/state")
async def update_doogeun_state(body: dict, request: Request) -> dict:
    """전체 상태 덮어쓰기 + 연결된 모든 WS 클라이언트에 브로드캐스트.
    body: { agents: [...], layout: {floors: {...}}, client_id?: str }
    client_id 를 같이 보내면 자기 자신에겐 WS push 스킵 (echo 방지).
    """
    agents = body.get("agents")
    layout = body.get("layout")
    client_id = body.get("client_id") or ""
    if agents is None and layout is None:
        return {"ok": False, "error": "agents 또는 layout 필요"}
    prev = _load_doogeun_state()
    new_state = {
        "agents": agents if agents is not None else prev.get("agents", []),
        "layout": layout if layout is not None else prev.get("layout", {"floors": {}}),
        "version": int(prev.get("version", 0)) + 1,
        "updated_at": datetime.utcnow().isoformat(),
    }
    _save_doogeun_state(new_state)
    # WS 브로드캐스트 (sender 제외)
    dead: list = []
    for ws in list(_doogeun_ws_clients):
        try:
            if getattr(ws, "_doogeun_client_id", None) == client_id:
                continue
            await ws.send_json({"type": "state_update", "state": new_state})
        except Exception:
            dead.append(ws)
    for ws in dead:
        _doogeun_ws_clients.discard(ws)
    return {"ok": True, "state": new_state}


@app.websocket("/ws/doogeun/state")
async def doogeun_state_ws(ws: WebSocket):
    """실시간 상태 동기화 WS — 다른 디바이스가 변경하면 푸시 받음."""
    await ws.accept()
    # 클라이언트가 첫 메시지로 client_id 보냄 (자기 변경 에코 방지용)
    try:
        hello = await ws.receive_json()
        ws._doogeun_client_id = hello.get("client_id") or ""  # type: ignore[attr-defined]
    except Exception:
        ws._doogeun_client_id = ""  # type: ignore[attr-defined]
    _doogeun_ws_clients.add(ws)
    try:
        # 초기 상태 전송
        await ws.send_json({"type": "state_update", "state": _load_doogeun_state()})
        # keepalive 루프 — 클라이언트는 ping 만 보냄
        while True:
            msg = await ws.receive_json()
            if msg.get("type") == "ping":
                await ws.send_json({"type": "pong"})
    except Exception:
        pass
    finally:
        _doogeun_ws_clients.discard(ws)


# ── 캐릭터 상태 API ────────────────────────────────────

@app.get("/api/agents/status")
async def get_agents_status():
    """모든 에이전트의 현재 캐릭터 상태 반환

    응답:
    {
      "ok": true,
      "agents": [
        {
          "id": "trading-bot",
          "name": "매매봇",
          "emoji": "🤖",
          "char_state": "idle",        // idle|working|collaborating|moving
          "collab_with": [],           // 협업 중인 팀 ID 목록
          "action": null,              // 협업 액션 설명
          "working": false,
          "tool": null,
        },
        ...
      ],
      "active_collabs": [...]          // 진행 중인 협업 세션
    }
    """
    agents = []
    for team in TEAMS:
        tid = team["id"]
        char = get_char_state(tid)
        ws_status = AGENT_STATUS.get(tid, {})
        agents.append({
            "id": tid,
            "team_id": tid,  # alias — 클라가 team_id로 참조하는 케이스 호환
            "name": team.get("name", ""),
            "emoji": team.get("emoji", ""),
            "char_state": char["state"],
            "collab_with": char["collab_with"],
            "action": char["action"],
            "working": ws_status.get("working", False),
            "tool": ws_status.get("tool"),
            "working_since": ws_status.get("working_since"),  # 경과초 계산용
            "last_active": ws_status.get("last_active"),
        })
    return {
        "ok": True,
        "agents": agents,
        "active_collabs": list(ACTIVE_COLLABS.values()),
    }


@app.get("/api/teams/{team_id}/guide")
async def get_team_guide(team_id: str):
    """팀의 CLAUDE.md + 시스템프롬프트 반환 (가이드 팝업용)"""
    team = next((t for t in TEAMS if t["id"] == team_id), None)
    if not team:
        return {"ok": False, "error": "팀을 찾을 수 없습니다."}

    local_path = os.path.expanduser(team.get("localPath", ""))
    claude_md = ""
    claude_md_path = os.path.join(local_path, "CLAUDE.md") if local_path else ""
    if claude_md_path and os.path.isfile(claude_md_path):
        with open(claude_md_path, "r", encoding="utf-8") as f:
            claude_md = f.read()

    from claude_runner import TEAM_SYSTEM_PROMPTS, DEFAULT_SYSTEM_PROMPT
    system_prompt = TEAM_SYSTEM_PROMPTS.get(team_id, DEFAULT_SYSTEM_PROMPT)

    return {
        "ok": True,
        "team_id": team_id,
        "name": team.get("name", ""),
        "emoji": team.get("emoji", ""),
        "claude_md": claude_md,
        "system_prompt": system_prompt,
    }


@app.put("/api/teams/{team_id}/guide")
async def update_team_guide(team_id: str, body: dict):
    """팀 CLAUDE.md 수정 — 실제 파일에 저장"""
    team = next((t for t in TEAMS if t["id"] == team_id), None)
    if not team:
        return {"ok": False, "error": "팀을 찾을 수 없습니다."}

    local_path = os.path.expanduser(team.get("localPath", ""))
    if not local_path or not os.path.isdir(local_path):
        return {"ok": False, "error": "프로젝트 경로를 찾을 수 없습니다."}

    claude_md = body.get("claude_md", "")
    claude_md_path = os.path.join(local_path, "CLAUDE.md")

    with open(claude_md_path, "w", encoding="utf-8") as f:
        f.write(claude_md)

    _log_activity(team_id, "📝 CLAUDE.md 수정됨")
    return {"ok": True, "team_id": team_id}


# ── 서비스 상태 (백그라운드 체크, 논블로킹) ──
_svc_cache: dict = {"data": []}

def _check_services_sync():
    """별도 스레드에서 실행 — 메인 루프 블로킹 없음"""
    import urllib.request
    import urllib.error
    import socket

    # 외부 서비스 (자기 자신 호출 X)
    checks = [
        ("Cloudflare Pages", "https://600g.net", "프론트엔드"),
        ("Upbit API", "https://api.upbit.com/v1/market/all", "매매봇 데이터"),
    ]
    results = []
    for name, url, desc in checks:
        try:
            req = urllib.request.Request(url, method="GET")
            req.add_header("User-Agent", "health-check/1.0")
            resp = urllib.request.urlopen(req, timeout=3)
            results.append({"name": name, "desc": desc, "status": "ok", "code": resp.getcode(), "error": None})
        except urllib.error.HTTPError as e:
            results.append({"name": name, "desc": desc, "status": "warn", "code": e.code, "error": str(e.reason)})
        except Exception as e:
            results.append({"name": name, "desc": desc, "status": "down", "code": None, "error": str(e)[:40]})

    # 로컬 포트 체크 (FastAPI만 — Next.js 개발서버는 프로덕션과 무관, Cloudflare Pages로 서비스)
    for name, port, desc in [("FastAPI", 8000, "백엔드")]:
        try:
            s = socket.create_connection(("127.0.0.1", port), timeout=1)
            s.close()
            results.append({"name": name, "desc": desc, "status": "ok", "code": None, "error": None})
        except Exception:
            results.append({"name": name, "desc": desc, "status": "down", "code": None, "error": "연결 불가"})

    _svc_cache["data"] = results

async def _check_services() -> list:
    """논블로킹: 별도 스레드에서 헬스체크 실행"""
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _check_services_sync)  # fire-and-forget
    return _svc_cache["data"]  # 이전 캐시 즉시 반환


# ── 자가학습 히스토리 API ──────────────────────────────
_EVOLUTION_PATH = Path(__file__).parent / "team_evolution.json"

def _load_evolution() -> dict:
    if _EVOLUTION_PATH.exists():
        try:
            return json.loads(_EVOLUTION_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

def _save_evolution(data: dict):
    _EVOLUTION_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

@app.get("/api/teams/{team_id}/evolution")
async def get_team_evolution(team_id: str):
    """팀 자가학습 히스토리 조회"""
    evo = _load_evolution()
    team_evo = evo.get(team_id, {"version": "1.0", "history": []})
    # lessons.md가 있으면 카운트
    team = next((t for t in TEAMS if t["id"] == team_id), None)
    lessons_count = 0
    if team:
        lp = Path(os.path.expanduser(team.get("localPath", ""))).resolve() / "lessons.md"
        if lp.exists():
            lessons_count = sum(1 for line in lp.read_text(encoding="utf-8", errors="ignore").splitlines() if line.strip().startswith("-") or line.strip().startswith("["))
    return {"ok": True, "team_id": team_id, **team_evo, "lessons_count": lessons_count}

@app.get("/api/teams/{team_id}/activity")
async def get_team_activity(team_id: str):
    """팀 최근 활동 — 커밋, 작업 상태"""
    team = next((t for t in TEAMS if t["id"] == team_id), None)
    if not team:
        return {"ok": False, "error": "팀 없음"}
    local = Path(os.path.expanduser(team.get("localPath", ""))).resolve()
    # 최근 커밋 5개
    commits = []
    if (local / ".git").exists():
        import subprocess
        try:
            out = subprocess.run(
                ["git", "log", "--oneline", "-5", "--format=%h|%s|%ar"],
                capture_output=True, text=True, cwd=str(local), timeout=5
            )
            for line in out.stdout.strip().splitlines():
                parts = line.split("|", 2)
                if len(parts) == 3:
                    commits.append({"hash": parts[0], "message": parts[1], "ago": parts[2]})
        except Exception:
            pass
    # 에이전트 상태
    from ws_handler import AGENT_STATUS
    status = AGENT_STATUS.get(team_id, {})
    return {
        "ok": True,
        "team_id": team_id,
        "commits": commits,
        "status": status.get("state", "idle"),
        "current_tool": status.get("tool"),
        "last_active": status.get("last_active"),
    }


@app.post("/api/trading-bot/mode")
async def switch_trading_bot_mode(request: dict):
    """매매봇 데모/리얼 모드 전환 — Firebase upbit_control에 기록"""
    import requests as req_lib
    target = request.get("mode", "")
    pin = request.get("pin", "")
    if target not in ("demo", "real"):
        return {"ok": False, "error": "mode must be 'demo' or 'real'"}
    if target == "real" and (not pin or len(pin) != 4):
        return {"ok": False, "error": "PIN 4자리 필요"}
    fb_url = "https://firestore.googleapis.com/v1/projects/datemap-759bf/databases/(default)/documents/upbit_control"
    fields: dict = {
        "action": {"stringValue": "switch"},
        "mode": {"stringValue": target},
        "ts": {"timestampValue": datetime.now().strftime('%Y-%m-%dT%H:%M:%S.000Z')},
    }
    if pin:
        fields["pin"] = {"stringValue": pin}
    try:
        resp = req_lib.post(fb_url, json={"fields": fields}, timeout=10)
        if resp.status_code in (200, 201):
            return {"ok": True, "message": f"{target} 모드 전환 요청 전송됨"}
        return {"ok": False, "error": f"Firebase 응답 {resp.status_code}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/trading-bot/status")
async def get_trading_bot_status():
    """매매봇 status.json 프록시 — 대시보드 팝업용"""
    status_path = Path.home() / "Desktop" / "업비트자동" / "docs" / "status.json"
    if not status_path.exists():
        return {"ok": False, "error": "status.json not found"}
    try:
        data = json.loads(status_path.read_text(encoding="utf-8"))
        return {"ok": True, **data}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/trading/stats")
async def get_trading_stats_api():
    """매매봇 통계 API — 승률, 손익, 포지션, 모멘텀 등 통합 조회"""
    return get_trading_stats()


@app.get("/api/dashboard")
async def get_dashboard():
    """대시보드 전체 상태 반환"""
    agents = []
    for team in TEAMS:
        tid = team["id"]
        status = AGENT_STATUS.get(tid, {})
        session = TEAM_SESSIONS.get(tid)
        model_key = TEAM_MODELS.get(tid, "sonnet")
        model_id = MODEL_IDS.get(model_key, model_key)

        # 실행 중인 subprocess 리소스
        pid = AGENT_PIDS.get(tid)
        proc_stats = get_process_stats(pid) if pid else None

        agents.append({
            "id": tid,
            "name": team["name"],
            "emoji": team["emoji"],
            "model_key": model_key,
            "model_id": model_id,
            "working": status.get("working", False),
            "tool": status.get("tool"),
            "last_active": status.get("last_active"),
            "last_prompt": status.get("last_prompt", ""),
            "session": session[:8] if session else None,
            "pid": pid,
            "tokens": AGENT_TOKENS.get(tid, {"prompts": 0, "chars": 0}),
            "cpu": proc_stats["cpu"] if proc_stats else None,
            "memory_mb": proc_stats["memory_mb"] if proc_stats else None,
        })

    return {
        "agents": agents,
        "system": get_system(),
        "services": await _check_services(),
        "activity": list(reversed(RECENT_ACTIVITY)),
        "version": {
            "server": "1.0.0",
            "python": sys.version.split()[0],
            "claude_cli": get_claude_version(),
        },
    }


VALID_MODELS = {
    "haiku", "sonnet", "opus",  # Claude (Max 플랜)
    "gemini_flash",              # 클라우드 무료
    "gemma_main", "gemma_e4b",   # 로컬 무한
}


@app.post("/api/agents/{team_id}/model")
async def set_agent_model(team_id: str, body: dict):
    """팀 AI 모델 변경.
    Claude: haiku|sonnet|opus
    무료 LLM: gemini_flash|gemma_main|gemma_e4b (Claude 토큰 0)
    """
    model = body.get("model", "")
    if model not in VALID_MODELS:
        return {"ok": False, "error": f"model 은 {sorted(VALID_MODELS)} 중 하나"}
    TEAM_MODELS[team_id] = model
    _log_activity(team_id, f"🔧 모델 변경: {model}")
    return {"ok": True, "team_id": team_id, "model": model}


@app.get("/api/agents/{team_id}/info")
async def get_agent_info(team_id: str):
    """팀 세션/모델 정보."""
    return {
        "ok": True,
        "team_id": team_id,
        "model": TEAM_MODELS.get(team_id, "sonnet"),
        "session_id": TEAM_SESSIONS.get(team_id),
        "has_session": team_id in TEAM_SESSIONS,
    }


@app.get("/api/agents/{team_id}/activity")
async def get_agent_activity(team_id: str):
    """에이전트 활동 로그 — 최근 커밋/메시지/상태 집계.

    프론트 '활동 로그' 뷰어용. commits + recent_messages + current_status.
    """
    team = next((t for t in TEAMS if t["id"] == team_id), None)
    if not team:
        return {"ok": False, "error": "팀 없음"}
    local = Path(os.path.expanduser(team.get("localPath", ""))).resolve()

    commits: list[dict] = []
    if (local / ".git").exists():
        import subprocess
        try:
            out = subprocess.run(
                ["git", "log", "--oneline", "-10", "--format=%h|%s|%ar|%an"],
                capture_output=True, text=True, cwd=str(local), timeout=5
            )
            for line in out.stdout.strip().splitlines():
                parts = line.split("|", 3)
                if len(parts) == 4:
                    commits.append({
                        "hash": parts[0], "message": parts[1],
                        "ago": parts[2], "author": parts[3],
                    })
        except Exception:
            pass

    # 최근 메시지 요약 (chat_history 에서 마지막 N 개 assistant 메시지)
    recent_messages: list[dict] = []
    try:
        history_dir = Path("chat_history") / team_id
        if history_dir.exists():
            # 가장 최근 수정된 세션 파일
            session_files = sorted(
                history_dir.glob("*.json"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            for sf in session_files[:1]:  # 활성 세션 하나만
                try:
                    data = json.loads(sf.read_text(encoding="utf-8"))
                    msgs = data.get("messages", []) if isinstance(data, dict) else data
                    # 마지막 assistant/ai 메시지 5개, 짧은 요약 (첫 80자)
                    for m in reversed(msgs):
                        role = m.get("type") or m.get("role", "")
                        if role in ("ai", "assistant"):
                            content = str(m.get("content", ""))[:120].replace("\n", " ")
                            recent_messages.append({
                                "role": "assistant",
                                "preview": content,
                                "ts": m.get("ts") or m.get("timestamp"),
                            })
                            if len(recent_messages) >= 5:
                                break
                except Exception:
                    pass
    except Exception:
        pass

    # 현재 상태
    from ws_handler import AGENT_STATUS
    status = AGENT_STATUS.get(team_id, {})

    return {
        "ok": True,
        "team_id": team_id,
        "commits": commits,
        "recent_messages": recent_messages,
        "status": status.get("state", "idle"),
        "current_tool": status.get("tool"),
        "last_active": status.get("last_active"),
    }


@app.post("/api/agents/{team_id}/test")
async def test_agent(team_id: str):
    """에이전트 스모크 테스트 — CLI가 실제로 응답하는지 30초 안에 확인.

    returns: {ok, response, duration_ms, error}
    """
    team = next((t for t in TEAMS if t["id"] == team_id), None)
    if not team:
        return {"ok": False, "error": "팀을 찾을 수 없음"}
    local_path = os.path.expanduser(team.get("localPath", ""))
    if not os.path.isdir(local_path):
        return {"ok": False, "error": f"로컬 경로 없음: {local_path}"}

    prompt = "테스트입니다. 정확히 '작동함'이라는 두 글자로만 답해주세요."
    started = time.time()
    collected = ""
    try:
        async def _collect():
            nonlocal collected
            async for chunk in run_claude(prompt, team["localPath"], team_id, is_auto=True):
                if chunk.get("kind") == "text":
                    collected += chunk.get("content", "")
                    if len(collected) > 200:
                        break
        await asyncio.wait_for(_collect(), timeout=30)
    except asyncio.TimeoutError:
        return {"ok": False, "error": "30초 타임아웃", "duration_ms": int((time.time() - started) * 1000)}
    except Exception as e:
        return {"ok": False, "error": f"CLI 에러: {e}", "duration_ms": int((time.time() - started) * 1000)}

    duration_ms = int((time.time() - started) * 1000)
    resp = collected.strip()
    passed = bool(resp) and ("작동" in resp or "동작" in resp or "ok" in resp.lower())
    return {"ok": passed, "response": resp[:300], "duration_ms": duration_ms}


@app.post("/api/agents/{team_id}/restart")
async def restart_agent(team_id: str):
    """에이전트 세션 초기화 (재부팅)"""
    import signal

    # 실행 중인 프로세스 종료
    pid = AGENT_PIDS.get(team_id)
    if pid:
        try:
            os.kill(pid, signal.SIGTERM)
        except Exception:
            pass
        AGENT_PIDS.pop(team_id, None)

    # 세션 초기화
    if team_id in TEAM_SESSIONS:
        del TEAM_SESSIONS[team_id]
        _save_sessions(TEAM_SESSIONS)

    # 상태 초기화
    AGENT_STATUS[team_id] = {"working": False, "tool": None, "last_active": None, "last_prompt": ""}
    _log_activity(team_id, "🔄 재부팅됨 (세션 초기화)")

    return {"ok": True, "team_id": team_id}


# ── 토큰 사용량 ──────────────────────────────────────

# 모델별 컨텍스트 윈도우 크기 (토큰)
MODEL_CONTEXT_WINDOW = {
    "claude-opus-4-6": 200_000,
    "claude-opus-4-5": 200_000,
    "claude-sonnet-4-6": 200_000,
    "claude-sonnet-4-5": 200_000,
    "claude-haiku-4-5": 200_000,
    "default": 200_000,
}

def _get_context_window(model: str) -> int:
    for key, size in MODEL_CONTEXT_WINDOW.items():
        if key in model:
            return size
    return MODEL_CONTEXT_WINDOW["default"]

def _get_context_pct_from_folder(folder_path: str) -> float:
    """해당 프로젝트 폴더의 가장 최근 JSONL에서 마지막 assistant 메시지의 컨텍스트 사용률(%) 반환"""
    import glob as _glob
    jsonl_files = sorted(
        _glob.glob(f"{folder_path}/*.jsonl"),
        key=os.path.getmtime,
        reverse=True
    )
    for jsonl_path in jsonl_files[:3]:  # 최신 3개 파일만 확인
        try:
            last_usage = None
            last_model = "default"
            with open(jsonl_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    if obj.get("type") != "assistant":
                        continue
                    msg = obj.get("message") or {}
                    usage = msg.get("usage") or {}
                    if usage:
                        last_usage = usage
                        last_model = msg.get("model", "default")
            if last_usage:
                ctx_size = _get_context_window(last_model)
                used = (
                    last_usage.get("input_tokens", 0)
                    + last_usage.get("cache_read_input_tokens", 0)
                    + last_usage.get("cache_creation_input_tokens", 0)
                )
                return round(min(used / ctx_size * 100, 100), 1)
        except Exception:
            continue
    return 0.0

def _parse_token_usage_today() -> dict:
    """~/.claude/projects/ 아래 JSONL 파일에서 최근 5시간 슬라이딩 윈도우 기준 토큰 사용량 파싱"""
    import glob as _glob
    from datetime import timezone

    projects_root = os.path.expanduser("~/.claude/projects")
    now_utc = datetime.now(timezone.utc)
    window_start = now_utc - timedelta(hours=5)
    today = now_utc.strftime("%Y-%m-%d")  # 표시용

    # 프로젝트 폴더 → (표시 이름, 이모지) 매핑
    PROJECT_LABEL_MAP: dict[str, tuple[str, str]] = {
        "-Users-600mac-Developer-my-company-company-hq": ("company-hq", "🖥"),
        "-Users-600mac-Developer-my-company-upbit-auto-trading-bot": ("매매봇", "🤖"),
        "-Users-600mac-Developer-my-company-date-map": ("데이트지도", "🗺️"),
        "-Users-600mac-Developer-my-company-claude-biseo-v1-0": ("클로드비서", "🤵"),
        "-Users-600mac-Developer-my-company-ai900": ("AI900", "📚"),
        "-Users-600mac-Developer-my-company-design-team": ("디자인팀", "🎨"),
        "-Users-600mac-Developer-my-company-content-lab": ("콘텐츠랩", "🔬"),
    }

    totals: dict[str, dict] = {}  # label -> {input, output, cache_read, cache_create, emoji, folders}

    for jsonl_path in _glob.glob(f"{projects_root}/**/*.jsonl", recursive=True):
        rel = os.path.relpath(jsonl_path, projects_root)
        folder = rel.split(os.sep)[0]

        if folder in PROJECT_LABEL_MAP:
            label, emoji = PROJECT_LABEL_MAP[folder]
        elif "company-hq--claude-worktrees" in folder or "company-hq-server" in folder:
            label, emoji = "company-hq", "🖥"
        else:
            label = folder.split("-")[-1] if "-" in folder else folder
            emoji = "💻"

        if label not in totals:
            totals[label] = {"input": 0, "output": 0, "cache_read": 0, "cache_create": 0, "emoji": emoji, "folders": set()}
        totals[label]["folders"].add(os.path.join(projects_root, folder))

        try:
            with open(jsonl_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue

                    # 최근 5시간 슬라이딩 윈도우 필터
                    ts_str = obj.get("timestamp", "")
                    if not ts_str:
                        continue
                    try:
                        ts_dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                        if ts_dt < window_start:
                            continue
                    except Exception:
                        continue

                    if obj.get("type") != "assistant":
                        continue
                    usage = (obj.get("message") or {}).get("usage") or {}
                    if not usage:
                        continue

                    totals[label]["input"] += usage.get("input_tokens", 0)
                    totals[label]["output"] += usage.get("output_tokens", 0)
                    totals[label]["cache_read"] += usage.get("cache_read_input_tokens", 0)
                    totals[label]["cache_create"] += (
                        usage.get("cache_creation_input_tokens", 0)
                        + (usage.get("cache_creation") or {}).get("ephemeral_1h_input_tokens", 0)
                        + (usage.get("cache_creation") or {}).get("ephemeral_5m_input_tokens", 0)
                    )
        except Exception:
            continue

    # 컨텍스트 사용률 계산 (각 에이전트의 가장 최근 세션 기준)
    context_pcts: dict[str, float] = {}
    for label, vals in totals.items():
        best_pct = 0.0
        for folder_path in vals.get("folders", set()):
            pct = _get_context_pct_from_folder(folder_path)
            if pct > best_pct:
                best_pct = pct
        context_pcts[label] = best_pct

    # 합계 계산
    grand = {"input": 0, "output": 0, "cache_read": 0, "cache_create": 0}
    projects = []
    for label, vals in sorted(totals.items(), key=lambda x: -(x[1]["input"] + x[1]["output"])):
        total_tokens = vals["input"] + vals["output"]
        if total_tokens == 0:
            continue
        projects.append({
            "label": label,
            "emoji": vals["emoji"],
            "input": vals["input"],
            "output": vals["output"],
            "cache_read": vals["cache_read"],
            "cache_create": vals["cache_create"],
            "total": total_tokens,
            "context_pct": context_pcts.get(label, 0.0),
        })
        for k in ("input", "output", "cache_read", "cache_create"):
            grand[k] += vals[k]

    grand["total"] = grand["input"] + grand["output"]

    # ── 오늘 전체 사용량 계산 (첫 번째 루프에서 이미 읽은 데이터 재활용 + 보충) ──
    daily_total = {"input": 0, "output": 0, "cache_read": 0, "cache_create": 0}
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)

    # 5시간 윈도우 바깥 + 오늘 안의 데이터도 포함해야 하므로 전체 재스캔
    for jsonl_path in _glob.glob(f"{projects_root}/**/*.jsonl", recursive=True):
        try:
            with open(jsonl_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    if obj.get("type") != "assistant":
                        continue
                    ts_str = obj.get("timestamp", "")
                    if not ts_str:
                        continue
                    try:
                        ts_dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                        if ts_dt < today_start:
                            continue
                    except Exception:
                        continue
                    usage = (obj.get("message") or {}).get("usage") or {}
                    if not usage:
                        continue
                    daily_total["input"] += usage.get("input_tokens", 0)
                    daily_total["output"] += usage.get("output_tokens", 0)
                    daily_total["cache_read"] += usage.get("cache_read_input_tokens", 0)
                    daily_total["cache_create"] += (
                        usage.get("cache_creation_input_tokens", 0)
                        + (usage.get("cache_creation") or {}).get("ephemeral_1h_input_tokens", 0)
                        + (usage.get("cache_creation") or {}).get("ephemeral_5m_input_tokens", 0)
                    )
        except Exception:
            continue

    daily_total["total"] = daily_total["input"] + daily_total["output"] + daily_total["cache_create"]

    # Claude Max 일일 한도 추정 (환경변수로 조정 가능)
    # 실측: cache_creation 포함 ~45M tokens/day가 89% → ~50M/day 추정
    daily_limit = int(os.getenv("DAILY_TOKEN_LIMIT", "50000000"))
    usage_pct = round(daily_total["total"] / daily_limit * 100, 1) if daily_limit > 0 else 0.0

    # 5시간 윈도우 표시용 (하위 호환)
    window_limit = int(os.getenv("WINDOW_TOKEN_LIMIT", "800000"))
    window_pct = round(grand["total"] / window_limit * 100, 1) if window_limit > 0 else 0.0
    window_label = window_start.strftime("%H:%M") + " ~ " + now_utc.strftime("%H:%M") + " UTC"

    return {
        "today": today,
        "window_label": window_label,
        "projects": projects,
        "grand": grand,
        "daily_total": daily_total,
        "daily_limit": daily_limit,
        "usage_pct": usage_pct,          # 오늘 전체 기준 (메인 게이지)
        "window_pct": window_pct,        # 5시간 윈도우 기준 (보조)
    }


@app.get("/api/token-usage")
async def get_token_usage():
    """오늘 날짜 Claude 토큰 사용량 반환"""
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _parse_token_usage_today)
    return result


# ── 디스패치 (다중 에이전트 협업) ─────────────────────

import logging as _log

# 디스패치 작업 저장소
DISPATCH_TASKS: dict[str, dict] = {}  # dispatch_id -> task info

# 핸드오프 승인 게이트 (dispatch_id -> asyncio.Event)
PENDING_APPROVALS: dict[str, asyncio.Event] = {}
APPROVAL_DECISIONS: dict[str, str] = {}  # dispatch_id -> "approve" | "cancel"


APPROVAL_FEEDBACK: dict[str, str] = {}  # dispatch_id -> optional user feedback

@app.post("/api/dispatch/approve")
async def dispatch_approve(body: dict):
    """인라인 핸드오프 승인 게이트 응답. TM 피드백+재작업 패턴 지원.

    body: { "dispatch_id": "xxxx", "decision": "approve" | "cancel", "feedback"?: str }
    feedback 있으면 각 step prompt에 추가 주입되어 에이전트가 피드백 반영해 재실행.
    """
    dispatch_id = body.get("dispatch_id", "")
    decision = body.get("decision", "")
    feedback = (body.get("feedback") or "").strip()
    if decision not in ("approve", "cancel"):
        return {"ok": False, "error": "decision은 approve|cancel"}
    ev = PENDING_APPROVALS.get(dispatch_id)
    if not ev:
        return {"ok": False, "error": "대기중인 승인 없음"}
    APPROVAL_DECISIONS[dispatch_id] = decision
    if feedback:
        APPROVAL_FEEDBACK[dispatch_id] = feedback
    ev.set()
    return {"ok": True, "feedback_applied": bool(feedback)}

@app.post("/api/dispatch")
async def dispatch_task(body: dict):
    """CPO가 여러 팀에 작업을 분배하고 결과를 수집

    body 예시:
    {
        "instruction": "매매봇 대시보드 리뉴얼해",
        "steps": [
            {"team": "trading-bot", "prompt": "현재 데이터 구조 정리해서 알려줘"},
            {"team": "frontend-team", "prompt": "이 데이터로 대시보드 만들어: {prev_result}"}
        ]
    }

    steps가 없으면 CPO가 자동으로 판단해서 분배
    """
    instruction = body.get("instruction", "")
    steps = body.get("steps", [])
    if not instruction:
        return {"ok": False, "error": "instruction이 필요합니다"}

    dispatch_id = str(uuid.uuid4())[:8]
    DISPATCH_TASKS[dispatch_id] = {
        "instruction": instruction,
        "status": "running",
        "steps": [],
        "started": datetime.now().isoformat(),
    }
    _log_activity("cpo-claude", f"📋 디스패치 시작: {instruction[:50]}")

    # steps가 없으면 haiku로 빠르게 분배 계획 생성 (토큰 절약)
    if not steps:
        plan_prompt = (
            f"다음 작업을 수행하려고 해:\n\n{instruction}\n\n"
            f"현재 팀 목록:\n"
            + "\n".join(f"- {t['emoji']} {t['name']} ({t['id']}): {t['repo']}" for t in TEAMS if t['id'] not in ('cpo-claude',))
            + "\n\n"
            "이 작업을 어떤 팀에 어떤 순서로 시킬지 JSON으로 답해줘. 형식:\n"
            '[{"team": "team-id", "prompt": "팀에게 줄 구체적 지시"}]\n'
            "JSON만 답해. 설명 없이."
        )
        cpo_path = next((t["localPath"] for t in TEAMS if t["id"] == "cpo-claude"), None)
        plan_result = await run_claude_light(plan_prompt, cpo_path)

        # JSON 파싱 시도
        import re
        json_match = re.search(r'\[.*\]', plan_result, re.DOTALL)
        if json_match:
            try:
                steps = json.loads(json_match.group())
            except json.JSONDecodeError:
                DISPATCH_TASKS[dispatch_id]["status"] = "failed"
                DISPATCH_TASKS[dispatch_id]["error"] = "CPO 분배 계획 파싱 실패"
                return {"ok": False, "dispatch_id": dispatch_id, "error": "CPO 분배 계획 파싱 실패", "raw": plan_result}
        else:
            DISPATCH_TASKS[dispatch_id]["status"] = "failed"
            return {"ok": False, "dispatch_id": dispatch_id, "error": "CPO가 분배 계획을 생성하지 못함", "raw": plan_result}

    # 순차 실행 (이전 결과를 다음 팀에 전달)
    prev_result = ""
    all_results = []

    # 참여 팀 목록 (유효한 팀만)
    valid_step_teams = [
        s.get("team", "") for s in steps
        if any(t["id"] == s.get("team") for t in TEAMS)
    ]

    # 협업 시작 이벤트 브로드캐스트 (2개 이상 팀 참여 시)
    if len(valid_step_teams) >= 2:
        await collab_broadcast(dispatch_id, "collab_start", valid_step_teams, action=instruction[:60])

    for i, step in enumerate(steps):
        team_id = step.get("team", "")
        prompt = step.get("prompt", "")

        # 팀 존재 확인
        team = next((t for t in TEAMS if t["id"] == team_id), None)
        if not team:
            step_result = {"step": i + 1, "team": team_id, "status": "skipped", "error": f"팀 '{team_id}'을 찾을 수 없음"}
            all_results.append(step_result)
            continue

        # {prev_result} 치환
        actual_prompt = prompt.replace("{prev_result}", prev_result)

        # 스텝 시작 이벤트 (현재 실행 팀 강조)
        if len(valid_step_teams) >= 2:
            await collab_broadcast(dispatch_id, "collab_step", [team_id], action=f"step {i+1}: {actual_prompt[:40]}")

        # 실행
        _log_activity(team_id, f"📨 디스패치 작업 수신: {actual_prompt[:50]}")
        result_text = ""
        project_path = team["localPath"]

        try:
            # /api/dispatch 는 CPO 자동 오케스트레이션 → is_auto=True
            async for chunk in run_claude(actual_prompt, project_path, team_id, is_auto=True):
                if chunk["kind"] == "text":
                    result_text += chunk["content"]
        except Exception as e:
            step_result = {"step": i + 1, "team": team_id, "status": "error", "error": str(e)}
            all_results.append(step_result)
            continue

        prev_result = result_text
        step_result = {
            "step": i + 1,
            "team": team_id,
            "team_name": team["name"],
            "prompt": actual_prompt[:200],
            "result": result_text[:2000],
            "status": "done",
        }
        all_results.append(step_result)
        DISPATCH_TASKS[dispatch_id]["steps"] = all_results
        _log.info(f"[DISPATCH] Step {i+1}/{len(steps)} 완료: {team_id}")

    # 협업 종료 이벤트
    if len(valid_step_teams) >= 2:
        await collab_broadcast(dispatch_id, "collab_end", valid_step_teams)

    DISPATCH_TASKS[dispatch_id]["status"] = "done"
    DISPATCH_TASKS[dispatch_id]["completed"] = datetime.now().isoformat()
    _log_activity("cpo-claude", f"✅ 디스패치 완료: {instruction[:50]}")

    return {
        "ok": True,
        "dispatch_id": dispatch_id,
        "instruction": instruction,
        "steps": all_results,
    }


@app.get("/api/dispatch/{dispatch_id}")
async def get_dispatch(dispatch_id: str):
    """디스패치 작업 상태 조회"""
    task = DISPATCH_TASKS.get(dispatch_id)
    if not task:
        return {"ok": False, "error": "디스패치를 찾을 수 없습니다"}
    return {"ok": True, **task}


@app.get("/api/dispatch")
async def list_dispatches():
    """모든 디스패치 작업 목록"""
    return [{"id": k, **v} for k, v in DISPATCH_TASKS.items()]


# ── CPO 주도 스마트 디스패치 ─────────────────────────────

@app.post("/api/dispatch/smart")
async def smart_dispatch(body: dict):
    """CPO 주도 디스패치: 필터링 → 관련 팀만 실행 → CPO 통합 보고

    body: { "message": "유저 메시지" }
    returns: SSE stream
    """
    from fastapi.responses import StreamingResponse

    message = body.get("message", "")
    if not message:
        return {"ok": False, "error": "message가 필요합니다"}

    dispatch_id = str(uuid.uuid4())[:8]
    DISPATCH_TASKS[dispatch_id] = {
        "instruction": message,
        "status": "running",
        "phase": "routing",
        "steps": [],
        "started": datetime.now().isoformat(),
    }

    async def stream():
        import re as _re

        # ── 통합채팅 진입을 CPO 채팅창에도 기록 (사용자→CPO 대화로 묶기) ──
        ws_manager.add_message("cpo-claude", "user", message)
        try:
            await ws_manager.send_json("cpo-claude", {"type": "user", "content": message})
            await ws_manager.send_json("cpo-claude", {"type": "ai_start"})
        except Exception:
            pass
        _cpo_log: list[str] = []
        _cpo_closed = {"v": False}

        async def _cpo_emit(text: str):
            """CPO 채팅창에 진행 상황 청크 전송 + 누적."""
            _cpo_log.append(text)
            try:
                await ws_manager.send_json("cpo-claude", {"type": "ai_chunk", "content": text})
            except Exception:
                pass

        async def _cpo_close(extra_text: str = ""):
            """CPO 채팅창 ai_end + 히스토리 저장 (모든 return 경로에서 호출됨)."""
            if _cpo_closed["v"]:
                return
            _cpo_closed["v"] = True
            final = "".join(_cpo_log) + (extra_text if extra_text and extra_text not in "".join(_cpo_log) else "")
            ws_manager.add_message("cpo-claude", "ai", final or "(완료)")
            try:
                await ws_manager.send_json("cpo-claude", {"type": "ai_end", "content": final})
            except Exception:
                pass

        # 팀 목록 (CPO 제외)
        available_teams = [t for t in TEAMS if t["id"] not in ("cpo-claude",)]
        team_map = {t["id"]: t for t in available_teams}
        # 이름→id 매핑 (멘션용)
        name_to_id = {}
        for t in available_teams:
            name_to_id[t["id"]] = t["id"]
            name_to_id[t["name"]] = t["id"]
            # 이모지+이름도 매핑
            name_to_id[f'{t["emoji"]}{t["name"]}'] = t["id"]
        # CPO도 멘션 가능
        for t in TEAMS:
            if t["id"] == "cpo-claude":
                name_to_id["cpo"] = "cpo-claude"
                name_to_id["CPO"] = "cpo-claude"
                name_to_id["cpo-claude"] = "cpo-claude"

        # ── 멘션 감지 (@팀명 또는 @팀id) ──
        mention_pattern = r'@(\S+)'
        mentions = _re.findall(mention_pattern, message)
        mentioned_ids = []
        for m in mentions:
            tid = name_to_id.get(m)
            if tid and tid not in mentioned_ids:
                mentioned_ids.append(tid)

        # 멘션된 메시지에서 @태그 제거한 순수 메시지
        clean_message = _re.sub(mention_pattern, '', message).strip() or message

        # ── 멘션이 있으면 haiku 라우팅 스킵 → 직접 해당 팀에 전달 (토큰 절약) ──
        if mentioned_ids:
            # CPO만 멘션 → CPO 직접 응답
            if mentioned_ids == ["cpo-claude"]:
                yield f"data: {json.dumps({'phase': 'summarizing', 'message': '🧠 CPO 직접 응답 중...'})}\n\n"
                cpo_team = next((t for t in TEAMS if t["id"] == "cpo-claude"), None)
                if not cpo_team:
                    yield f"data: {json.dumps({'phase': 'error', 'error': 'CPO 팀 없음'})}\n\n"
                    return
                direct_text = ""
                async for chunk in run_claude(clean_message, cpo_team["localPath"], "cpo-claude", is_auto=False):
                    if chunk["kind"] == "text":
                        direct_text += chunk["content"]
                        yield f"data: {json.dumps({'phase': 'summary_chunk', 'content': chunk['content']})}\n\n"
                DISPATCH_TASKS[dispatch_id]["status"] = "done"
                DISPATCH_TASKS[dispatch_id]["summary"] = direct_text
                yield f"data: {json.dumps({'phase': 'done', 'dispatch_id': dispatch_id, 'summary': direct_text, 'team_results': {}})}\n\n"
                _log_activity("cpo-claude", f"✅ @CPO 멘션 응답: {clean_message[:50]}")
                await _cpo_close(direct_text)
                return

            # 특정 팀 멘션 → haiku 스킵, 직접 실행
            routed_steps = []
            for tid in mentioned_ids:
                if tid in team_map:
                    routed_steps.append({"team": tid, "prompt": clean_message})
            if routed_steps:
                # 멘션 = 직접 전달. CPO 라우팅/요약 없음.
                # 프론트가 "CPO 흐름"이 아닌 "직접 전달" 모드로 UI 간소화할 수 있게 direct=True 플래그.
                routed_team_ids = [s["team"] for s in routed_steps]
                yield f"data: {json.dumps({'phase': 'direct_dispatch', 'direct': True, 'teams': routed_team_ids, 'message': f'→ {len(routed_steps)}팀에 직접 전달'})}\n\n"

                team_results: dict[str, dict] = {}

                async def run_mentioned_team(step: dict):
                    _tid = step["team"]
                    _team = team_map[_tid]
                    _prompt = f"[유저 원래 요청: {message}]\n\n{step['prompt']}"
                    # 1) 유저 메시지를 해당 팀 채팅 히스토리에 추가 + WS 브로드캐스트
                    ws_manager.add_message(_tid, "user", _prompt)
                    try:
                        await ws_manager.send_json(_tid, {"type": "user", "content": _prompt})
                        await ws_manager.send_json(_tid, {"type": "ai_start"})
                    except Exception:
                        pass
                    _result = ""
                    try:
                        async for chunk in run_claude(_prompt, _team["localPath"], _tid, is_auto=False):
                            if chunk["kind"] == "text":
                                _result += chunk["content"]
                                # 2) 각 청크를 해당 팀 WS에 실시간 스트림
                                try:
                                    await ws_manager.send_json(_tid, {"type": "ai_chunk", "content": chunk["content"]})
                                except Exception:
                                    pass
                        # 3) 완성된 응답을 히스토리에 저장 + 완료 알림
                        ws_manager.add_message(_tid, "assistant", _result)
                        try:
                            await ws_manager.send_json(_tid, {"type": "ai_end", "content": _result})
                        except Exception:
                            pass
                        team_results[_tid] = {"status": "done", "team_name": _team["name"], "emoji": _team["emoji"], "result": _result}
                    except Exception as e:
                        team_results[_tid] = {"status": "error", "error": str(e)}

                    # ── 에이전트 간 태깅 감지 ──
                    agent_mentions = _re.findall(r'@(\S+)', _result)
                    for am in agent_mentions:
                        next_tid = name_to_id.get(am)
                        if next_tid and next_tid != _tid and next_tid in team_map:
                            _log_activity(_tid, f"🔗 @{am} 태그 → {next_tid}에 후속 작업 전달")
                            from task_queue import task_queue
                            await task_queue.enqueue(next_tid, f"[{_team['name']}이(가) 요청] {_result[:500]}")

                await asyncio.gather(*[run_mentioned_team(s) for s in routed_steps])

                done_teams = list(team_results.keys())
                yield f"data: {json.dumps({'phase': 'team_done', 'done': len(done_teams), 'total': len(routed_steps), 'teams': done_teams})}\n\n"

                # 멘션 → 통합보고 없이 각 팀 결과 직접 전달 (토큰 절약)
                all_results_text = ""
                for tid, result in team_results.items():
                    txt = result.get("result", "")
                    all_results_text += txt + "\n"
                    yield f"data: {json.dumps({'phase': 'summary_chunk', 'content': txt})}\n\n"

                DISPATCH_TASKS[dispatch_id]["status"] = "done"
                meta = {"routed_count": len(routed_steps), "total_teams": len(available_teams), "mention": True, "direct": True}
                yield f"data: {json.dumps({'phase': 'done', 'dispatch_id': dispatch_id, 'direct': True, 'summary': all_results_text.strip(), 'team_results': team_results, 'meta': meta})}\n\n"
                # 멘션 직접 전달은 CPO 히스토리 오염 금지 — _cpo_close 호출 생략
                return

        # 카테고리별 팀 목록 구성
        dev_teams = [t for t in available_teams if t.get("category") == "dev"]
        product_teams = [t for t in available_teams if t.get("category") == "product"]
        team_list_str = "【개발/서포트팀】 company-hq 개발·디자인·콘텐츠 담당\n"
        team_list_str += "\n".join(f'- {t["id"]}: {t["emoji"]} {t["name"]}' for t in dev_teams)
        team_list_str += "\n\n【독자 프로젝트팀】 각자 독립 프로젝트 PM\n"
        team_list_str += "\n".join(f'- {t["id"]}: {t["emoji"]} {t["name"]}' for t in product_teams)

        # ── Phase 1: CPO가 관련 팀 필터링 (멘션 없을 때만) ──
        route_prompt = (
            f"유저 메시지:\n\"{message}\"\n\n"
            f"팀 목록:\n{team_list_str}\n\n"
            "이 메시지를 처리하기 위해 어떤 팀이 필요한지 판단해.\n\n"
            "규칙:\n"
            "1. company-hq UI/서버/디자인 관련 → 개발/서포트팀에서 선택\n"
            "2. 특정 프로젝트(매매봇/데이트지도 등) → 해당 독자 프로젝트팀만\n"
            "3. 개발팀과 프로젝트팀을 동시에 선택하지 마 (성격이 다름)\n"
            "4. 관련 팀이 없으면 (일반 질문, 인사) → 빈 배열 []로 답해\n"
            "5. 관련 없는 팀은 절대 포함하지 마\n\n"
            "【의존성 판단】\n"
            "- 프론트+백엔드+QA 같이 협업(동일 기능 크로스컷팅) → deps 없음 (병렬)\n"
            "- 디자인 → 프론트 (에셋 받아서 구현) → 프론트 step에 deps=[\"design-team\"]\n"
            "- 백엔드 API → 프론트 연동 → 프론트 step에 deps=[\"backend-team\"]\n"
            "- 독립된 여러 작업 (X 수정 + Y 수정) → deps 없음 (병렬)\n\n"
            "형식 (JSON만, 설명 없이):\n"
            '[{"team": "team-id", "prompt": "구체 지시", "deps": ["prev-team-id"]}]\n'
            "deps 생략 가능 (없으면 [] 또는 필드 생략 = 병렬 실행).\n"
            "deps 있으면 이전 팀 결과가 {prev_result}로 prompt에 주입됨.\n"
            "예 1 (크로스컷팅 병렬):\n"
            '  [{"team":"frontend-team","prompt":"..."},{"team":"backend-team","prompt":"..."}]\n'
            "예 2 (순차 전달):\n"
            '  [{"team":"design-team","prompt":"로고 시안 3개"},{"team":"frontend-team","prompt":"아래 시안 중 하나로 구현: {prev_result}","deps":["design-team"]}]\n'
            "관련 팀 없으면: []"
        )

        cpo_team = next((t for t in TEAMS if t["id"] == "cpo-claude"), None)
        if not cpo_team:
            yield f"data: {json.dumps({'phase': 'error', 'error': 'CPO 팀 없음'})}\n\n"
            return

        # CPO 라우팅 실행 (haiku로 빠르게 — 토큰 절약)
        yield f"data: {json.dumps({'phase': 'routing', 'message': '🧠 CPO가 관련 팀 분석 중...'})}\n\n"

        route_result = await run_claude_light(route_prompt, cpo_team["localPath"])

        # JSON 파싱
        json_match = _re.search(r'\[.*\]', route_result, _re.DOTALL)
        if not json_match:
            # JSON 파싱 실패 → CPO가 직접 응답한 것으로 간주
            yield f"data: {json.dumps({'phase': 'summary_chunk', 'content': route_result})}\n\n"
            yield f"data: {json.dumps({'phase': 'done', 'dispatch_id': dispatch_id, 'summary': route_result, 'team_results': {}})}\n\n"
            DISPATCH_TASKS[dispatch_id]["status"] = "done"
            DISPATCH_TASKS[dispatch_id]["summary"] = route_result
            await _cpo_close(route_result)
            return

        try:
            routed_steps = json.loads(json_match.group())
        except json.JSONDecodeError:
            yield f"data: {json.dumps({'phase': 'error', 'error': 'JSON 파싱 실패'})}\n\n"
            await _cpo_close("⚠️ 라우팅 JSON 파싱 실패")
            return

        # ── 빈 배열 = CPO가 직접 답변 ──
        if not routed_steps:
            yield f"data: {json.dumps({'phase': 'summarizing', 'message': '🧠 CPO가 직접 답변 중...'})}\n\n"
            direct_prompt = (
                f"유저 메시지: \"{message}\"\n\n"
                "이 메시지는 특정 팀에 전달할 필요 없이 CPO가 직접 답할 수 있다.\n"
                "유저에게 도움되는 답변을 해줘. 짧고 명확하게."
            )
            direct_text = ""
            # smart_dispatch CPO 직접 응답 — 사용자 입력이므로 is_auto=False
            async for chunk in run_claude(direct_prompt, cpo_team["localPath"], "cpo-claude", is_auto=False):
                if chunk["kind"] == "text":
                    direct_text += chunk["content"]
                    yield f"data: {json.dumps({'phase': 'summary_chunk', 'content': chunk['content']})}\n\n"

            DISPATCH_TASKS[dispatch_id]["status"] = "done"
            DISPATCH_TASKS[dispatch_id]["summary"] = direct_text
            yield f"data: {json.dumps({'phase': 'done', 'dispatch_id': dispatch_id, 'summary': direct_text, 'team_results': {}})}\n\n"
            _log_activity("cpo-claude", f"✅ CPO 직접 응답: {message[:50]}")
            await _cpo_close(direct_text)
            return

        routed_team_ids = [s["team"] for s in routed_steps]
        skipped_teams = [t for t in available_teams if t["id"] not in routed_team_ids]

        yield f"data: {json.dumps({'phase': 'routed', 'teams': routed_team_ids, 'skipped': [t['id'] for t in skipped_teams]})}\n\n"

        # ── 인라인 핸드오프 승인 게이트 (2팀 이상일 때만) ──
        if len(routed_steps) >= 2:
            preview_steps = [
                {
                    "team": s["team"],
                    "team_name": team_map.get(s["team"], {}).get("name", s["team"]),
                    "emoji": team_map.get(s["team"], {}).get("emoji", "🤖"),
                    "prompt": (s.get("prompt") or "")[:200],
                }
                for s in routed_steps
            ]
            ev = asyncio.Event()
            PENDING_APPROVALS[dispatch_id] = ev
            APPROVAL_DECISIONS.pop(dispatch_id, None)
            yield f"data: {json.dumps({'phase': 'handoff_request', 'dispatch_id': dispatch_id, 'steps': preview_steps})}\n\n"
            # CPO 채팅창에도 핸드오프 카드 표시 (WS 모든 연결에 broadcast)
            try:
                await ws_manager.send_json("cpo-claude", {
                    "type": "handoff_request", "dispatch_id": dispatch_id, "steps": preview_steps,
                })
            except Exception:
                pass
            try:
                await asyncio.wait_for(ev.wait(), timeout=180)
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'phase': 'handoff_cancelled', 'reason': 'timeout'})}\n\n"
                PENDING_APPROVALS.pop(dispatch_id, None)
                DISPATCH_TASKS[dispatch_id]["status"] = "cancelled"
                await _cpo_close("⏱️ 핸드오프 승인 시간 초과 — 취소됨")
                return
            decision = APPROVAL_DECISIONS.pop(dispatch_id, "cancel")
            fb = APPROVAL_FEEDBACK.pop(dispatch_id, "")
            PENDING_APPROVALS.pop(dispatch_id, None)
            if decision != "approve":
                yield f"data: {json.dumps({'phase': 'handoff_cancelled', 'reason': 'user_cancel'})}\n\n"
                DISPATCH_TASKS[dispatch_id]["status"] = "cancelled"
                await _cpo_close("❌ 사용자가 핸드오프를 취소했습니다")
                return
            # 피드백이 있으면 각 step prompt 앞에 주입 (에이전트가 반영해 재실행)
            if fb:
                for s in routed_steps:
                    s["prompt"] = f"[유저 피드백] {fb}\n\n{s.get('prompt','')}"
                yield f"data: {json.dumps({'phase': 'handoff_approved', 'feedback': fb})}\n\n"
            else:
                yield f"data: {json.dumps({'phase': 'handoff_approved'})}\n\n"

        # ── Phase 2: 관련 팀만 병렬 실행 ──
        yield f"data: {json.dumps({'phase': 'executing', 'message': f'⚡ {len(routed_steps)}개 팀 작업 중...'})}\n\n"

        team_results: dict[str, dict] = {}

        async def run_team(step: dict):
            team_id = step["team"]
            # 유저 원래 메시지 맥락을 팀 프롬프트에 포함
            prompt = f"[유저 원래 요청: {message}]\n\n{step['prompt']}"
            team = next((t for t in TEAMS if t["id"] == team_id), None)
            if not team:
                team_results[team_id] = {"status": "skipped", "error": "팀 없음"}
                return

            result_text = ""
            # 1) 유저 메시지를 팀 채팅 히스토리에 추가 + 브로드캐스트
            ws_manager.add_message(team_id, "user", prompt)
            try:
                await ws_manager.send_json(team_id, {"type": "user", "content": prompt})
                await ws_manager.send_json(team_id, {"type": "ai_start"})
            except Exception:
                pass
            try:
                # smart_dispatch 팀 병렬 실행 — 사용자 요청 기반이므로 is_auto=False
                async for chunk in run_claude(prompt, team["localPath"], team_id, is_auto=False):
                    if chunk["kind"] == "text":
                        result_text += chunk["content"]
                        # 2) 청크를 해당 팀 채팅창에 실시간 스트림
                        try:
                            await ws_manager.send_json(team_id, {"type": "ai_chunk", "content": chunk["content"]})
                        except Exception:
                            pass
                # 3) 완성 응답을 히스토리에 저장 + 완료 알림
                ws_manager.add_message(team_id, "assistant", result_text)
                try:
                    await ws_manager.send_json(team_id, {"type": "ai_end", "content": result_text})
                except Exception:
                    pass
                team_results[team_id] = {
                    "status": "done",
                    "team_name": team["name"],
                    "emoji": team["emoji"],
                    "result": result_text,
                }
            except Exception as e:
                team_results[team_id] = {"status": "error", "error": str(e)}

        # ── DAG 실행: deps 존중. deps 없는 step은 병렬, deps 있는 step은 이전 결과 대기 ──
        remaining = list(routed_steps)
        executed: set[str] = set()
        while remaining:
            # 현재 실행 가능한 step들 (모든 deps가 executed에 있는 것)
            runnable = [s for s in remaining if all(d in executed for d in (s.get("deps") or []))]
            if not runnable:
                # 의존성 순환 등 실행 불가 → 남은 step 에러 마킹
                for s in remaining:
                    tid = s["team"]
                    team_results[tid] = {"status": "error", "error": f"의존성 해결 불가: deps={s.get('deps')}"}
                break
            # prev_result 치환
            def _inject_prev(step: dict) -> dict:
                prev_key = "{prev_result}"
                p = step.get("prompt", "")
                if prev_key in p and step.get("deps"):
                    prev_texts = []
                    for d in step["deps"]:
                        r = team_results.get(d, {})
                        if r.get("status") == "done":
                            prev_texts.append(f"[{d} 결과]\n{r.get('result', '')}")
                    p = p.replace(prev_key, "\n\n".join(prev_texts) if prev_texts else "(이전 결과 없음)")
                return {**step, "prompt": p}
            batch = [_inject_prev(s) for s in runnable]
            yield f"data: {json.dumps({'phase': 'batch_start', 'teams': [s['team'] for s in batch], 'parallel': len(batch) > 1})}\n\n"
            await asyncio.gather(*[run_team(step) for step in batch])
            # 완료 마킹
            for s in runnable:
                executed.add(s["team"])
                remaining.remove(s)

        # 완료 알림
        done_teams = list(team_results.keys())
        yield f"data: {json.dumps({'phase': 'team_done', 'done': len(done_teams), 'total': len(routed_steps), 'teams': done_teams})}\n\n"

        # ── Phase 3: CPO 통합 보고 (2팀 이상일 때만) ──
        if len(team_results) == 1:
            # 팀 1개면 CPO 통합 보고 생략 — 팀 결과를 바로 전달 (토큰 절약)
            tid, result = next(iter(team_results.items()))
            summary_text = result.get("result", "")
            yield f"data: {json.dumps({'phase': 'summary_chunk', 'content': summary_text})}\n\n"
            _log_activity("cpo-claude", f"✅ 단일 팀 결과 직통: {tid}")
        else:
            yield f"data: {json.dumps({'phase': 'summarizing', 'message': '🧠 CPO가 통합 보고서 작성 중...'})}\n\n"

            # 각 팀 결과를 300자 요약본으로 압축하여 CPO에게 전달 (토큰 절약)
            summary_parts = []
            for tid, result in team_results.items():
                if result["status"] == "done":
                    # 결과에서 마지막 부분(보통 요약이 있음)을 우선 사용
                    full = result["result"]
                    condensed = full[-500:] if len(full) > 500 else full
                    summary_parts.append(
                        f"=== {result['emoji']} {result['team_name']} ({tid}) ===\n"
                        f"{condensed}"
                    )
                else:
                    summary_parts.append(f"=== {tid} === ❌ 실패: {result.get('error', '알 수 없음')}")

            summary_prompt = (
                f"유저의 원래 요청:\n\"{message}\"\n\n"
                f"각 팀의 답변 요약:\n\n{''.join(s + chr(10) + chr(10) for s in summary_parts)}\n"
                "위 답변들을 종합해서 유저에게 통합 보고해줘.\n"
                "형식:\n"
                "1. 전체 요약 (2-3줄)\n"
                "2. 팀별 할 일 정리 (팀이름: 할 일)\n"
                "3. 우선순위 또는 의존성 있으면 언급\n"
                "짧고 명확하게."
            )

            summary_text = ""
            # CPO 통합 보고 — 사용자 요청 기반이므로 is_auto=False
            async for chunk in run_claude(summary_prompt, cpo_team["localPath"], "cpo-claude", is_auto=False):
                if chunk["kind"] == "text":
                    summary_text += chunk["content"]
                    yield f"data: {json.dumps({'phase': 'summary_chunk', 'content': chunk['content']})}\n\n"
                    # CPO 채팅창에도 실시간 스트림
                    await _cpo_emit(chunk["content"])

        # ── CPO 채팅창 마무리 (사용자 → CPO 대화로 묶임) ──
        ws_manager.add_message("cpo-claude", "ai", summary_text)
        try:
            await ws_manager.send_json("cpo-claude", {"type": "ai_end", "content": summary_text})
        except Exception:
            pass

        # 최종 결과
        DISPATCH_TASKS[dispatch_id]["status"] = "done"
        DISPATCH_TASKS[dispatch_id]["completed"] = datetime.now().isoformat()
        DISPATCH_TASKS[dispatch_id]["steps"] = [
            {"team": tid, **r} for tid, r in team_results.items()
        ]
        DISPATCH_TASKS[dispatch_id]["summary"] = summary_text

        meta = {
            "routed_count": len(routed_steps),
            "skipped_count": len(skipped_teams),
            "total_teams": len(available_teams),
            "routing_model": "haiku",
            "summary_model": "opus" if len(team_results) > 1 else "direct",
        }
        yield f"data: {json.dumps({'phase': 'done', 'dispatch_id': dispatch_id, 'summary': summary_text, 'meta': meta, 'team_results': {tid: {'status': r['status'], 'result': r.get('result', '')[:2000]} for tid, r in team_results.items()}})}\n\n"

        _log_activity("cpo-claude", f"✅ 스마트 디스패치 완료: {message[:50]}")

    return StreamingResponse(stream(), media_type="text/event-stream")


# ── 토론 + QA 자동 관여 디스패치 ─────────────────────────

DISCUSS_TASKS: dict[str, dict] = {}

@app.post("/api/dispatch/discuss")
async def dispatch_discuss(body: dict):
    """CPO 주도 토론: 개발진 의견 수렴 → 토론 → QA 검증 → CPO 최종 결정

    flow:
    1. CPO가 작업 분석 + 관련 팀 선정
    2. 각 팀 병렬로 의견 제출
    3. CPO가 의견 종합 + 반론 유도 (소크라테스)
    4. QA가 기술적 리스크/검증 포인트 제시
    5. CPO 최종 결정 + 실행 계획

    body: { "instruction": "채팅 기능 개선해", "teams": ["frontend-team", "backend-team"] (선택) }
    """
    from fastapi.responses import StreamingResponse
    import re as _re

    instruction = body.get("instruction", "")
    forced_teams = body.get("teams", [])
    if not instruction:
        return {"ok": False, "error": "instruction이 필요합니다"}

    discuss_id = str(uuid.uuid4())[:8]
    DISCUSS_TASKS[discuss_id] = {
        "instruction": instruction,
        "status": "running",
        "phases": [],
        "started": datetime.now().isoformat(),
    }

    async def stream():
        cpo_team = next((t for t in TEAMS if t["id"] == "cpo-claude"), None)
        if not cpo_team:
            yield f"data: {json.dumps({'phase': 'error', 'error': 'CPO 없음'})}\n\n"
            return

        dev_teams = [t for t in TEAMS if t.get("category") == "dev" and t.get("status") == "운영중"]
        team_map = {t["id"]: t for t in TEAMS}

        # ── Phase 1: CPO 분석 + 팀 선정 ──
        yield f"data: {json.dumps({'phase': 'analyzing', 'message': '🧠 CPO가 작업을 분석하고 참여 팀을 선정 중...'})}\n\n"

        if forced_teams:
            selected_ids = forced_teams
        else:
            route_prompt = (
                f"작업: {instruction}\n\n"
                f"개발진 목록:\n" + "\n".join(f"- {t['id']}: {t['emoji']} {t['name']}" for t in dev_teams) + "\n\n"
                "이 작업에 참여해야 할 팀 ID만 JSON 배열로 답해. 설명 없이.\n"
                '예: ["frontend-team", "backend-team"]'
            )
            route_result = await run_claude_light(route_prompt, cpo_team["localPath"])
            json_match = _re.search(r'\[.*?\]', route_result, _re.DOTALL)
            selected_ids = json.loads(json_match.group()) if json_match else [t["id"] for t in dev_teams]

        # QA는 항상 포함
        if "qa-agent" not in selected_ids:
            selected_ids.append("qa-agent")

        selected_teams = [t for t in TEAMS if t["id"] in selected_ids]
        yield f"data: {json.dumps({'phase': 'team_selected', 'teams': [{'id': t['id'], 'name': t['name'], 'emoji': t['emoji']} for t in selected_teams]})}\n\n"

        # ── Phase 2: 각 팀 의견 수렴 (병렬) ──
        yield f"data: {json.dumps({'phase': 'opinions', 'message': f'💬 {len(selected_teams)}팀 의견 수렴 중...'})}\n\n"

        opinions: dict[str, dict] = {}

        async def get_opinion(team: dict):
            tid = team["id"]
            role = "QA 엔지니어" if tid == "qa-agent" else team["name"]
            prompt = (
                f"[토론 참여 요청]\n"
                f"작업: {instruction}\n\n"
                f"너는 {role} 역할이야. 이 작업에 대해:\n"
                f"1. 접근 방법 제안 (구체적으로)\n"
                f"2. 예상 리스크 또는 주의점\n"
                f"3. 다른 팀과의 의존성\n"
                f"한국어로 간결하게 답해 (300자 이내)."
            )
            # 무료 LLM 우선 (의견 수렴은 짧고 일반적이라 Gemini 품질 충분)
            try:
                from free_llm import smart_call, _bump
                text, provider = await smart_call("default", prompt, max_out=600)
                if provider in ("gemini", "gemma_e4b", "gemma_main") and text and len(text.strip()) > 20:
                    _bump(provider)
                    opinions[tid] = {"name": team["name"], "emoji": team["emoji"], "opinion": text.strip()}
                    return
            except Exception as e:
                logger.warning("[discuss/opinion] %s 무료 LLM 실패, Claude 폴백: %s", tid, e)

            # 폴백: Claude 풀세션 (무료 LLM 다 실패 시만)
            result = ""
            try:
                async for chunk in run_claude(prompt, team["localPath"], tid, is_auto=True):
                    if chunk["kind"] == "text":
                        result += chunk["content"]
                opinions[tid] = {"name": team["name"], "emoji": team["emoji"], "opinion": result}
            except Exception as e:
                opinions[tid] = {"name": team["name"], "emoji": team["emoji"], "opinion": f"❌ 오류: {e}"}

        await asyncio.gather(*[get_opinion(t) for t in selected_teams])

        for tid, op in opinions.items():
            yield f"data: {json.dumps({'phase': 'opinion', 'team_id': tid, **op})}\n\n"

        # ── Phase 3: CPO 토론 리딩 (소크라테스) ──
        yield f"data: {json.dumps({'phase': 'discussion', 'message': '⚖️ CPO가 토론을 주도합니다...'})}\n\n"

        opinion_summary = "\n\n".join(
            f"[{op['emoji']} {op['name']}]\n{op['opinion']}" for op in opinions.values()
        )

        discuss_prompt = (
            f"작업: {instruction}\n\n"
            f"각 팀의 의견:\n{opinion_summary}\n\n"
            "너는 CPO(프로덕트 오너)야. 위 의견을 종합해서:\n"
            "1. 각 팀 의견의 강점과 약점을 짚어줘\n"
            "2. 충돌하는 부분이 있으면 어떤 게 더 나은지 판단해\n"
            "3. QA 관점의 리스크를 반영해서 최종 실행 계획을 세워\n"
            "4. 팀별 구체적 할 일을 배정해\n\n"
            "형식:\n"
            "## 토론 요약\n(2-3줄)\n\n"
            "## 최종 결정\n(실행 계획)\n\n"
            "## 팀별 할 일\n- 팀명: 할 일\n"
        )

        decision_text = ""
        async for chunk in run_claude(discuss_prompt, cpo_team["localPath"], "cpo-claude", is_auto=False):
            if chunk["kind"] == "text":
                decision_text += chunk["content"]
                yield f"data: {json.dumps({'phase': 'decision_chunk', 'content': chunk['content']})}\n\n"

        # ── Phase 4: 결과 저장 + 학습 기록 ──
        DISCUSS_TASKS[discuss_id]["status"] = "done"
        DISCUSS_TASKS[discuss_id]["completed"] = datetime.now().isoformat()
        DISCUSS_TASKS[discuss_id]["phases"] = [
            {"phase": "opinions", "data": opinions},
            {"phase": "decision", "data": decision_text},
        ]
        DISCUSS_TASKS[discuss_id]["teams"] = selected_ids
        DISCUSS_TASKS[discuss_id]["decision"] = decision_text

        # 자가학습 히스토리에 토론 기록
        evo = _load_evolution()
        for tid in selected_ids:
            if tid not in evo:
                evo[tid] = {"version": "1.0", "history": []}
        _save_evolution(evo)

        _log_activity("cpo-claude", f"✅ 토론 완료: {instruction[:50]}")

        yield f"data: {json.dumps({'phase': 'done', 'discuss_id': discuss_id, 'decision': decision_text, 'teams': selected_ids, 'opinions': {tid: op['opinion'][:500] for tid, op in opinions.items()}})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.get("/api/dispatch/discuss/{discuss_id}")
async def get_discuss(discuss_id: str):
    """토론 결과 조회"""
    task = DISCUSS_TASKS.get(discuss_id)
    if not task:
        return {"ok": False, "error": "토론을 찾을 수 없습니다"}
    return {"ok": True, **task}


# ── 웹 푸시 알림 ──────────────────────────────────────

@app.get("/api/push/vapid-key")
async def push_vapid_key():
    """VAPID 공개키 반환 (프론트에서 구독 시 사용)"""
    return {"ok": True, "publicKey": get_vapid_public_key()}


@app.post("/api/push/subscribe")
async def push_subscribe(body: dict):
    """푸시 알림 구독 등록"""
    sub_info = body.get("subscription")
    if not sub_info or not sub_info.get("endpoint"):
        return {"ok": False, "error": "subscription 정보가 필요합니다"}
    ok = add_subscription(sub_info)
    return {"ok": ok}


@app.post("/api/push/unsubscribe")
async def push_unsubscribe(body: dict):
    """푸시 알림 구독 해제"""
    endpoint = body.get("endpoint", "")
    if not endpoint:
        return {"ok": False, "error": "endpoint가 필요합니다"}
    ok = remove_subscription(endpoint)
    return {"ok": ok}


@app.post("/api/push/test")
async def push_test():
    """테스트 푸시 발송"""
    count = send_push(
        title="🏢 두근컴퍼니 알림 테스트",
        body="푸시 알림이 정상적으로 작동합니다!",
        tag="test",
    )
    return {"ok": True, "sent": count}


@app.post("/api/push/119")
async def push_119(req: dict):
    """🚒 119 긴급 알림 — claude_guard.sh에서 호출"""
    title = req.get("title", "🚒 119 긴급출동")
    body = req.get("body", "")
    count = send_push(
        title=title,
        body=body[:200],
        tag="119-alert",
        url="/",
        team_id="cpo-claude",
    )
    return {"ok": True, "sent": count}


@app.post("/api/push/trading")
async def push_trading(req: dict):
    """📈 코인봇/주식봇 매수·매도·긴급 알림 — trader.py에서 호출"""
    bot = req.get("bot", "trading")  # coin / stock
    side = req.get("side", "")  # buy / sell / system
    severity = req.get("severity", "info")  # info / warn / danger
    title = req.get("title", f"{bot} 알림")
    body = req.get("body", "")
    icon_map = {"buy": "🟢", "sell": "🔴", "danger": "🚨", "warn": "⚠️", "info": "💹"}
    icon = icon_map.get(side, icon_map.get(severity, "💹"))
    count = send_push(
        title=f"{icon} {title}",
        body=body[:200],
        tag=f"trading-{bot}-{side}",
        url="/",
        team_id="trading-bot",
    )
    return {"ok": True, "sent": count, "bot": bot, "side": side}


# ── 무중단 배포 (staging → production 사용자 클릭 promote) ─────────────────────

# 진행 중인 배포 상태 (단일 동시 배포만 허용)
_DEPLOY_STATE: dict = {
    "running": False,
    "started_at": None,
    "log_tail": [],          # 마지막 N 줄
    "last_result": None,     # {ok, build, version, ts} 마지막 성공 배포
    "error": None,
}
_DEPLOY_LOCK = asyncio.Lock()
_HQ_ROOT = os.path.expanduser("~/Developer/my-company/company-hq")


def _git_head_info() -> dict:
    """현재 main 브랜치 HEAD commit + subject + 적용 시 부여될 version 숫자.
    version 계산은 deploy.sh 와 동일 (MAJOR=4, MINOR=count/10, PATCH=count%10).
    """
    try:
        sha = subprocess.run(
            ["git", "log", "-1", "--format=%h"],
            cwd=_HQ_ROOT, capture_output=True, text=True, timeout=3,
        ).stdout.strip()
        subject = subprocess.run(
            ["git", "log", "-1", "--format=%s"],
            cwd=_HQ_ROOT, capture_output=True, text=True, timeout=3,
        ).stdout.strip()
        ts = subprocess.run(
            ["git", "log", "-1", "--format=%ct"],
            cwd=_HQ_ROOT, capture_output=True, text=True, timeout=3,
        ).stdout.strip()
        count_raw = subprocess.run(
            ["git", "rev-list", "--count", "HEAD"],
            cwd=_HQ_ROOT, capture_output=True, text=True, timeout=3,
        ).stdout.strip()
        total = int(count_raw) if count_raw.isdigit() else 0
        next_version = f"4.{total // 10}.{total % 10}"
        return {
            "ok": True,
            "commit": sha,
            "subject": subject[:200],
            "commit_ts": int(ts) if ts.isdigit() else 0,
            "next_version": next_version,
            "total_commits": total,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/admin/git-head")
async def admin_git_head():
    """현재 git HEAD — VersionBanner 가 production build 와 비교해 미반영 변경 감지."""
    return _git_head_info()


# Conventional commit 카테고리 → 한국어 라벨/이모지
_RELEASE_TYPE_MAP = {
    "fix":       {"emoji": "🐛", "label": "버그 수정"},
    "feat":      {"emoji": "✨", "label": "기능 추가"},
    "perf":      {"emoji": "⚡", "label": "성능 개선"},
    "refactor":  {"emoji": "🔧", "label": "코드 정리"},
    "ux":        {"emoji": "🎨", "label": "UX 개선"},
    "style":     {"emoji": "💄", "label": "스타일"},
    "docs":      {"emoji": "📝", "label": "문서"},
    "chore":     {"emoji": "🧹", "label": "점검"},
    "test":      {"emoji": "🧪", "label": "테스트"},
    "build":     {"emoji": "📦", "label": "빌드"},
    "ci":        {"emoji": "🤖", "label": "CI"},
    "security":  {"emoji": "🔒", "label": "보안"},
    "revert":    {"emoji": "⏪", "label": "되돌림"},
}


# scope 영어 → 한국어 매핑 (사용자 친화 라벨)
_SCOPE_MAP = {
    "deploy": "배포",
    "deploy-ux": "배포",
    "release-notes": "릴리즈노트",
    "critical": "긴급",
    "auth": "인증",
    "ux": "UX",
    "memory": "메모리",
    "db": "DB",
    "isolation": "격리",
    "orchestration": "오케스트레이션",
    "auto-recovery": "자동복구",
    "agents": "에이전트",
    "retry": "재시도",
    "frontend": "프론트엔드",
    "backend": "백엔드",
    "design": "디자인",
    "qa": "QA",
    "content": "콘텐츠",
    "cpo": "CPO",
    "staff": "스태프",
    "phaser": "Phaser",
    "websocket": "WS",
    "ws": "WS",
    "api": "API",
    "ui": "UI",
    "build": "빌드",
    "config": "설정",
    "docs": "문서",
    "i18n": "다국어",
    "perf": "성능",
    "security": "보안",
    "session": "세션",
    "chat": "채팅",
    "memory-optimize": "메모리정리",
    "version": "버전",
    "legacy": "레거시",
    "sandbox": "샌드박스",
    "policy": "정책",
}


# 패치노트 본문 흔한 영어 → 한국어 자동 치환 (commit 작성자 의도 보존하되 사용자 친화 표현)
_TITLE_REPLACEMENTS = [
    ("reload", "새로고침"),
    ("Reload", "새로고침"),
    ("propagation", "전파"),
    ("cooldown", "대기시간"),
    ("graceful", "정상"),
    ("hydration", "초기화"),
    ("dispatch", "디스패치"),
    ("rollback", "롤백"),
    ("session", "세션"),
    ("hook", "훅"),
    ("race", "경합"),
    ("backoff", "재시도 지연"),
    ("polling", "폴링"),
    ("preview", "미리보기"),
    ("Cloudflare Pages", "CF 페이지"),
    ("CF edge", "CF 엣지"),
]


def _parse_commit_subject(h: str, subject: str) -> dict:
    """ 'feat(scope): title — 부연' → {type, emoji, label, scope, scope_ko, title}.
    공식 패치노트용 정제: em-dash 이후 자연어 부연 제거, 영어 scope 한국어 매핑.
    """
    import re as _re
    m = _re.match(r"^(\w+)(\([^)]+\))?\s*:\s*(.+)$", subject)
    if m:
        commit_type = m.group(1).lower()
        scope = (m.group(2) or "").strip("()")
        title = m.group(3).strip()
    else:
        commit_type = "other"
        scope = ""
        title = subject.strip()
    info = _RELEASE_TYPE_MAP.get(commit_type, {"emoji": "📌", "label": "기타"})
    # 제목 정제 — em-dash 이후 부연 / 자연어 제거, 첫 줄만
    title = title.split("\n")[0]
    for sep in [" — ", " -- ", "— ", " · "]:
        if sep in title:
            title = title.split(sep)[0].strip()
            break
    # 흔한 영어 → 한국어 자동 치환
    for en, ko in _TITLE_REPLACEMENTS:
        title = title.replace(en, ko)
    title = title.rstrip(".").strip()
    # scope 한국어 매핑
    scope_ko = _SCOPE_MAP.get(scope.lower(), scope)
    return {
        "hash": h,
        "type": commit_type,
        "emoji": info["emoji"],
        "label": info["label"],
        "scope": scope_ko,           # 사용자 노출용 (한국어)
        "scope_raw": scope,          # 원본 (디버깅)
        "title": title[:100],
    }


@app.get("/api/admin/release-notes")
async def admin_release_notes(from_commit: str = ""):
    """production build commit 부터 HEAD 까지 commit 들을 카테고리별 패치노트로 변환."""
    if not from_commit:
        return {"ok": False, "error": "from_commit 파라미터 필요"}
    try:
        out = subprocess.run(
            ["git", "log", f"{from_commit}..HEAD", "--format=%h|%s"],
            cwd=_HQ_ROOT, capture_output=True, text=True, timeout=5,
        )
        if out.returncode != 0:
            # from_commit 이 알 수 없으면 최근 10개로 fallback
            out = subprocess.run(
                ["git", "log", "-10", "--format=%h|%s"],
                cwd=_HQ_ROOT, capture_output=True, text=True, timeout=5,
            )
        commits: list[dict] = []
        for line in out.stdout.strip().split("\n"):
            if "|" not in line:
                continue
            h, s = line.split("|", 1)
            commits.append(_parse_commit_subject(h.strip(), s.strip()))
        # 카테고리별 그룹화
        groups: dict[str, dict] = {}
        for c in commits:
            key = c["type"]
            if key not in groups:
                groups[key] = {
                    "type": key,
                    "emoji": c["emoji"],
                    "label": c["label"],
                    "items": [],
                }
            groups[key]["items"].append({
                "hash": c["hash"],
                "title": c["title"],
                "scope": c["scope"],
            })
        # 정렬 — fix/feat/perf 우선, 그 외 사전순
        priority = {"fix": 0, "feat": 1, "perf": 2, "ux": 3, "refactor": 4, "security": 5}
        ordered = sorted(groups.values(), key=lambda g: (priority.get(g["type"], 10), g["type"]))
        return {
            "ok": True,
            "from_commit": from_commit,
            "total_commits": len(commits),
            "groups": ordered,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/admin/deploy/status")
async def admin_deploy_status():
    """진행 중 배포 + 마지막 결과 + 최근 로그 (사용자가 적용 클릭 후 진행률 폴링)."""
    return {
        "ok": True,
        "running": _DEPLOY_STATE["running"],
        "started_at": _DEPLOY_STATE["started_at"],
        "log_tail": _DEPLOY_STATE["log_tail"][-20:],
        "last_result": _DEPLOY_STATE["last_result"],
        "error": _DEPLOY_STATE["error"],
    }


async def _run_deploy_bg() -> None:
    """백그라운드 배포 작업 — bash deploy.sh 실행 + 로그 캡처."""
    _DEPLOY_STATE["running"] = True
    _DEPLOY_STATE["started_at"] = int(time.time())
    _DEPLOY_STATE["log_tail"] = []
    _DEPLOY_STATE["error"] = None

    try:
        proc = await asyncio.create_subprocess_exec(
            "bash", os.path.join(_HQ_ROOT, "deploy.sh"),
            cwd=_HQ_ROOT,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env={**os.environ, "PATH": "/opt/homebrew/bin:/usr/local/bin:" + os.environ.get("PATH", "")},
        )
        # 줄단위 캡처
        assert proc.stdout is not None
        async for line in proc.stdout:
            decoded = line.decode("utf-8", errors="replace").rstrip()
            if decoded:
                _DEPLOY_STATE["log_tail"].append(decoded)
                if len(_DEPLOY_STATE["log_tail"]) > 200:
                    _DEPLOY_STATE["log_tail"] = _DEPLOY_STATE["log_tail"][-200:]

        rc = await proc.wait()
        if rc == 0:
            # /version.json 다시 읽어 build/version 파싱
            try:
                vpath = os.path.join(_HQ_ROOT, "doogeun-hq", "out", "version.json")
                if os.path.exists(vpath):
                    with open(vpath, encoding="utf-8") as f:
                        _DEPLOY_STATE["last_result"] = json.load(f)
            except Exception:
                _DEPLOY_STATE["last_result"] = {"ok": True}
        else:
            _DEPLOY_STATE["error"] = f"deploy.sh exit code {rc}"
    except Exception as e:
        _DEPLOY_STATE["error"] = str(e)
    finally:
        _DEPLOY_STATE["running"] = False


@app.post("/api/admin/deploy")
async def admin_deploy_trigger(background_tasks: BackgroundTasks):
    """사용자 [적용] 클릭 — 백그라운드로 deploy.sh 실행. 즉시 반환, 진행은 status 폴링."""
    if _DEPLOY_LOCK.locked() or _DEPLOY_STATE["running"]:
        return {"ok": False, "error": "이미 배포 진행 중", "running": True}

    async def _run():
        async with _DEPLOY_LOCK:
            await _run_deploy_bg()

    background_tasks.add_task(_run)
    return {"ok": True, "started": True}


# ── 메모리 최적화 (외부 앱 graceful quit) ─────────────────────────────────

# 절대 종료 금지 — 우리 시스템 + macOS 코어
_PROTECTED_APP_KEYWORDS = {
    "Claude", "claude", "Python", "python", "uvicorn", "ollama", "cloudflared",
    "Terminal", "iTerm", "iTerm2", "bash", "zsh", "Finder",
    "WindowServer", "kernel_task", "launchd", "loginwindow", "Dock",
    "Spotlight", "SystemUIServer", "ControlCenter", "NotificationCenter",
    "ps", "top", "Activity Monitor",
    "company-hq", "doogeun", "coinbot", "trading",
}

# 종료 가능 화이트리스트 (사용자 일반 앱)
_TERMINATABLE_APP_KEYWORDS = {
    "Google Chrome", "Chrome", "Whale", "Safari", "Firefox", "Edge", "Brave",
    "Steam", "Slack", "Discord", "Spotify", "Music", "Photos", "Notion",
    "Figma", "Code", "VSCode", "Mail", "Calendar", "Notes", "Reminders",
    "Sketch", "Photoshop", "Illustrator", "Zoom", "Teams",
}


def _categorize_app(name: str) -> str:
    """protected / terminable / other 분류."""
    for k in _PROTECTED_APP_KEYWORDS:
        if k.lower() in name.lower():
            return "protected"
    for k in _TERMINATABLE_APP_KEYWORDS:
        if k.lower() in name.lower():
            return "terminable"
    return "other"


def _list_app_processes(min_rss_mb: float = 30.0) -> list[dict]:
    """RSS 30MB 이상 프로세스를 앱 단위로 집계."""
    try:
        result = subprocess.run(
            ["ps", "axo", "pid,rss,comm"],
            capture_output=True, text=True, timeout=5,
        )
        apps: dict[str, dict] = {}
        for line in result.stdout.strip().split("\n")[1:]:
            parts = line.split(None, 2)
            if len(parts) < 3:
                continue
            try:
                pid = int(parts[0])
                rss_mb = int(parts[1]) / 1024
            except ValueError:
                continue
            comm = parts[2].strip()
            # 앱 이름 추출 (.app 또는 마지막 단어)
            app_name = comm
            if ".app/" in comm:
                seg = comm.split(".app/")[0]
                app_name = seg.split("/")[-1]
            elif "/" in comm:
                app_name = comm.split("/")[-1]
            if app_name in apps:
                apps[app_name]["rss_mb"] += rss_mb
                apps[app_name]["pids"].append(pid)
            else:
                apps[app_name] = {
                    "name": app_name,
                    "rss_mb": rss_mb,
                    "pids": [pid],
                }
        out = []
        for a in apps.values():
            if a["rss_mb"] < min_rss_mb:
                continue
            out.append({
                "name": a["name"],
                "rss_mb": round(a["rss_mb"], 1),
                "pids": a["pids"][:10],  # 최대 10개만
                "category": _categorize_app(a["name"]),
            })
        out.sort(key=lambda x: -x["rss_mb"])
        return out
    except Exception as e:
        logger.warning("[memory] ps 실패: %s", e)
        return []


def _read_vm_stats() -> dict:
    """vm_stat + sysctl 로 시스템 메모리 + 스왑."""
    try:
        vm = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=3).stdout
        page_size = 16384  # Apple Silicon
        free = active = inactive = wired = compressed = 0
        for line in vm.split("\n"):
            if ":" not in line:
                continue
            label, val = line.split(":", 1)
            try:
                num = int(val.strip().rstrip("."))
            except Exception:
                continue
            if "Pages free" in label: free = num
            elif "Pages active" in label: active = num
            elif "Pages inactive" in label: inactive = num
            elif "Pages wired down" in label: wired = num
            elif "Pages occupied by compressor" in label: compressed = num
        used_bytes = (active + wired + compressed) * page_size
        free_bytes = (free + inactive) * page_size
        # 스왑
        swap_out = subprocess.run(["sysctl", "vm.swapusage"], capture_output=True, text=True, timeout=3).stdout
        import re as _re
        m = _re.search(r"used\s*=\s*([\d.]+)M", swap_out)
        swap_mb = float(m.group(1)) if m else 0
        return {
            "used_mb": round(used_bytes / 1024 / 1024, 1),
            "free_mb": round(free_bytes / 1024 / 1024, 1),
            "total_mb": round((used_bytes + free_bytes) / 1024 / 1024, 1),
            "swap_used_mb": round(swap_mb, 1),
        }
    except Exception as e:
        logger.warning("[memory] vm_stat 실패: %s", e)
        return {"error": str(e)}


@app.get("/api/admin/memory/status")
async def admin_memory_status():
    """현재 메모리 + 분류된 앱 RSS 리스트."""
    return {
        "ok": True,
        "system": _read_vm_stats(),
        "apps": _list_app_processes(),
    }


@app.post("/api/admin/memory/optimize")
async def admin_memory_optimize(body: dict):
    """body: {names: [...앱 이름]} — 안전 화이트리스트 통과한 앱만 graceful quit.
    - protected 카테고리는 무시 (우리 시스템 보호)
    - osascript 'tell application X to quit' (graceful)
    - 5초 대기 후 메모리 재측정 → 회수량 반환
    """
    names = body.get("names", [])
    if not isinstance(names, list):
        return {"ok": False, "error": "names 배열 필요"}

    before = _read_vm_stats()
    killed: list[dict] = []
    skipped: list[dict] = []
    for name in names:
        cat = _categorize_app(name)
        if cat == "protected":
            skipped.append({"name": name, "reason": "보호된 시스템 앱"})
            continue
        # graceful quit 우선 (osascript)
        try:
            proc = subprocess.run(
                ["osascript", "-e", f'tell application "{name}" to quit'],
                capture_output=True, text=True, timeout=10,
            )
            killed.append({
                "name": name,
                "method": "applescript_quit",
                "ok": proc.returncode == 0,
                "stderr": proc.stderr.strip()[:120] if proc.stderr else "",
            })
        except Exception as e:
            killed.append({"name": name, "method": "failed", "error": str(e)[:120]})

    # graceful quit 진행 시간 — 5초 대기
    await asyncio.sleep(5)
    after = _read_vm_stats()
    freed = (before.get("used_mb", 0) - after.get("used_mb", 0)) if before and after else 0
    return {
        "ok": True,
        "killed": killed,
        "skipped": skipped,
        "before": before,
        "after": after,
        "freed_mb": round(freed, 1),
    }


# ── 토큰 예산 관리 ─────────────────────────────────────

@app.get("/api/budget")
async def budget_status():
    """토큰 예산 현황 + 무료 LLM 사용 통계 (Claude/Gemini/Gemma 분리)"""
    base = get_budget_status()
    try:
        from free_llm import get_usage as _free_usage
        free = _free_usage()
    except Exception:
        free = {}
    return {"ok": True, **base, "free_llm_usage": free}


@app.get("/api/staff/stats")
async def staff_stats():
    """스태프 누적 사용 통계 — 무료 LLM 비율, Claude 절감 추정, 의도/언어 분포"""
    try:
        from staff_engine import get_stats
        s = get_stats()
        total = s.get("total_handled", 0) or 1
        provider = s.get("by_provider", {})
        free_count = sum(v for k, v in provider.items() if k != "claude_fallback")
        return {
            "ok": True,
            "total_handled": s.get("total_handled", 0),
            "free_llm_ratio": round(free_count / total * 100, 1),
            "claude_fallback_count": provider.get("claude_fallback", 0),
            "claude_tokens_saved": s.get("claude_tokens_saved_estimate", 0),
            "by_provider": provider,
            "by_intent": s.get("by_intent", {}),
            "by_language": s.get("by_language", {}),
            "last_updated": s.get("last_updated"),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/api/budget/reset")
async def budget_reset():
    """토큰 예산 리셋 (두근 전용)"""
    msg = reset_budget()
    return {"ok": True, "message": msg}


# ── 인앱 알림 ────────────────────────────────────────

@app.get("/api/notifications")
async def get_notifs():
    """알림 목록 + 안 읽은 수"""
    return {"ok": True, "notifications": get_notifications(), "unread": get_unread_count()}


@app.post("/api/notifications/{notif_id}/read")
async def read_notif(notif_id: str):
    """개별 알림 읽음 처리"""
    ok = mark_read(notif_id)
    return {"ok": ok, "unread": get_unread_count()}


@app.post("/api/notifications/read-all")
async def read_all_notifs():
    """전체 읽음 처리"""
    count = mark_all_read()
    return {"ok": True, "marked": count, "unread": 0}


@app.post("/api/notifications/team/{team_id}/read")
async def read_team_notifs(team_id: str):
    """특정 팀 알림 일괄 읽음 처리 (채팅창 열 때 자동 호출)"""
    count = mark_team_read(team_id)
    return {"ok": True, "marked": count, "unread": get_unread_count()}


@app.delete("/api/notifications/{notif_id}")
async def del_notif(notif_id: str):
    """알림 삭제"""
    ok = delete_notification(notif_id)
    return {"ok": ok, "unread": get_unread_count()}


# ── 층 배치 (서버 영구 저장) ──────────────────────────
_FLOOR_LAYOUT_FILE = os.path.join(os.path.dirname(__file__), "floor_layout.json")


def _load_floor_layout() -> dict:
    if os.path.isfile(_FLOOR_LAYOUT_FILE):
        try:
            with open(_FLOOR_LAYOUT_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_floor_layout(layout: dict):
    with open(_FLOOR_LAYOUT_FILE, "w", encoding="utf-8") as f:
        json.dump(layout, f, ensure_ascii=False, indent=2)


# ── 이미지 업로드 ─────────────────────────────────────
_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(_UPLOAD_DIR, exist_ok=True)

@app.post("/api/upload/image")
async def upload_image(file: UploadFile = File(...)):
    """이미지 업로드 → 서버 저장 → 경로 반환 (에이전트가 Read 도구로 분석)"""
    ext = os.path.splitext(file.filename or "img.png")[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"):
        return {"ok": False, "error": "지원하지 않는 이미지 형식"}
    fname = f"{uuid.uuid4().hex[:12]}{ext}"
    fpath = os.path.join(_UPLOAD_DIR, fname)
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB 제한
        return {"ok": False, "error": "파일이 너무 큽니다 (최대 10MB)"}
    with open(fpath, "wb") as f:
        f.write(content)
    return {"ok": True, "path": fpath, "filename": fname, "size": len(content)}


# ── 도구 (Notion 등) ──────────────────────────────────

@app.post("/api/tools/notion")
async def read_notion(body: dict):
    """공개 Notion 페이지 읽기 — URL만 보내면 콘텐츠 추출"""
    url = body.get("url", "")
    if not url:
        return {"ok": False, "error": "url 필드가 필요합니다"}
    return await fetch_notion_page(url)


@app.get("/api/settings/tokens")
async def settings_tokens():
    """외부 서비스 토큰이 서버 .env 에 설정됐는지 여부 (값은 노출 안 함)."""
    import shutil
    import subprocess
    names = ["GITHUB_TOKEN", "VERCEL_TOKEN", "CF_TOKEN", "SUPABASE_ACCESS_TOKEN", "ANTHROPIC_API_KEY"]
    result = {}
    for n in names:
        v = os.getenv(n, "") or ""
        result[n] = {
            "configured": bool(v.strip()),
            "masked": (v[:6] + "…" + v[-4:]) if len(v) >= 12 else ("설정됨" if v else ""),
        }
    # CF 는 wrangler OAuth 가 있으면 "배포 가능" 으로 표시
    if not result["CF_TOKEN"]["configured"] and shutil.which("wrangler"):
        try:
            r = subprocess.run(["wrangler", "whoami"], capture_output=True, text=True, timeout=5)
            if r.returncode == 0 and "@" in (r.stdout or ""):
                # 이메일 추출
                import re as _re
                m = _re.search(r"([\w.+-]+@[\w-]+\.[\w.-]+)", r.stdout)
                email = m.group(1) if m else "OAuth"
                result["CF_TOKEN"] = {"configured": True, "masked": f"wrangler · {email}"}
        except Exception:
            pass
    return {"ok": True, "tokens": result}


# ── WebSocket ─────────────────────────────────────────

@app.post("/api/terminal/run")
async def terminal_run(body: dict):
    """TM TerminalPanel용 — 쉘 명령 실행 + SSE stdout/stderr 스트림"""
    from fastapi.responses import StreamingResponse
    cmd = (body.get("command") or "").strip()
    cwd = body.get("cwd") or os.path.expanduser("~/Developer/my-company/company-hq")
    cwd = os.path.expanduser(cwd)
    if not cmd:
        return {"ok": False, "error": "command 필요"}
    # 간단 보안 — rm -rf / 같은 명백히 위험한 패턴 차단
    import re as _re
    dangerous = [r"\brm\s+-rf\s+/", r"\bdd\b.*of=/dev", r"\bmkfs\.", r":\(\)\{.*:\|:&"]
    if any(_re.search(p, cmd) for p in dangerous):
        return {"ok": False, "error": "위험한 명령 차단"}

    async def stream():
        yield f"data: {json.dumps({'stream':'exec','text':f'$ {cmd}'})}\n\n"
        proc = await asyncio.create_subprocess_shell(
            cmd, cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,  # stderr → stdout 통합
        )
        assert proc.stdout is not None
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            text = line.decode("utf-8", errors="replace").rstrip()
            if text:
                yield f"data: {json.dumps({'stream':'stdout','text':text})}\n\n"
        code = await proc.wait()
        yield f"data: {json.dumps({'stream':'exit','code':code})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.get("/api/deploy/status")
async def deploy_status():
    """현재 배포 상태 — git + 마지막 빌드 + 배포 URL"""
    import subprocess
    import os as _os
    root = _os.path.expanduser("~/Developer/my-company/company-hq")
    def run(cmd: list[str], cwd: str = root) -> str:
        try:
            r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=5)
            return (r.stdout or r.stderr).strip()
        except Exception:
            return ""
    branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    head = run(["git", "rev-parse", "--short", "HEAD"])
    last_msg = run(["git", "log", "-1", "--format=%s"])
    dirty_n = len([l for l in run(["git", "status", "--porcelain"]).splitlines() if l.strip()])
    # 최근 build ID (deploy.sh가 out/version.json에 씀)
    version_path = _os.path.join(root, "ui", "out", "version.json")
    build_info = {}
    try:
        import json as _json
        if _os.path.exists(version_path):
            build_info = _json.loads(open(version_path).read())
    except Exception:
        pass
    return {
        "ok": True,
        "git": {"branch": branch, "head": head, "last_msg": last_msg, "dirty": dirty_n},
        "build": build_info,
    }


@app.post("/api/deploy/trigger")
async def deploy_trigger():
    """배포 스크립트 실행 — SSE 스트림으로 진행상황 보고"""
    from fastapi.responses import StreamingResponse
    import subprocess
    import os as _os
    root = _os.path.expanduser("~/Developer/my-company/company-hq")
    async def stream():
        yield f"data: {json.dumps({'phase':'starting','message':'배포 시작...'})}\n\n"
        proc = await asyncio.create_subprocess_shell(
            "bash deploy.sh",
            cwd=root,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        assert proc.stdout is not None
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            text = line.decode("utf-8", errors="replace").rstrip()
            if not text:
                continue
            # 간단 단계 감지
            phase = "building"
            if "Compiled" in text or "Turbopack" in text:
                phase = "building"
            elif "Uploading" in text:
                phase = "uploading"
            elif "Deploying" in text or "Deployment complete" in text:
                phase = "deploying"
            elif "Done" in text:
                phase = "done"
            yield f"data: {json.dumps({'phase':phase,'line':text})}\n\n"
        code = await proc.wait()
        yield f"data: {json.dumps({'phase':'finished','exit_code':code})}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")


@app.post("/api/deploy/project/{team_id}/github")
async def deploy_project_github(team_id: str, req: Request):
    """Phase 5: 팀 프로젝트를 GitHub에 push (레포 없으면 생성).
    팀메이커 /api/deploy/github 등가물. SSE 스트림으로 진행 보고.
    Body: {"message": "commit msg"}
    """
    from fastapi.responses import StreamingResponse
    import subprocess
    import os as _os
    body = {}
    try:
        body = await req.json()
    except Exception:
        pass
    commit_msg = (body.get("message") or "").strip() or "chore: update from company-hq"
    team = next((t for t in TEAMS if t["id"] == team_id), None)
    if not team:
        return {"ok": False, "error": f"Team not found: {team_id}"}
    local_path = _os.path.expanduser(team.get("localPath") or "")
    if not local_path or not _os.path.isdir(local_path):
        return {"ok": False, "error": f"Project path not found: {local_path}"}

    async def stream():
        def _run(cmd: list[str], cwd: str = local_path) -> tuple[int, str]:
            try:
                r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=30)
                return r.returncode, (r.stdout + r.stderr).strip()
            except Exception as e:
                return -1, str(e)

        yield f"data: {json.dumps({'phase':'start','team':team_id,'path':local_path})}\n\n"

        # 1) git status
        rc, out = _run(["git", "status", "--porcelain"])
        if rc != 0:
            yield f"data: {json.dumps({'phase':'error','step':'status','message':out or 'git status 실패'})}\n\n"
            return
        dirty = bool(out.strip())
        yield f"data: {json.dumps({'phase':'status','dirty':dirty,'detail':out[:200]})}\n\n"

        # 2) git add + commit (dirty일 때만)
        if dirty:
            rc, out = _run(["git", "add", "-A"])
            if rc != 0:
                yield f"data: {json.dumps({'phase':'error','step':'add','message':out})}\n\n"
                return
            yield f"data: {json.dumps({'phase':'staged','message':'스테이징 완료'})}\n\n"

            rc, out = _run(["git", "commit", "-m", commit_msg])
            if rc != 0 and "nothing to commit" not in out.lower():
                yield f"data: {json.dumps({'phase':'error','step':'commit','message':out[:500]})}\n\n"
                return
            yield f"data: {json.dumps({'phase':'committed','message':commit_msg})}\n\n"

        # 3) remote 확인
        rc, remote_out = _run(["git", "remote", "get-url", "origin"])
        has_remote = rc == 0 and remote_out.strip()

        # 4) remote 없으면 GitHub 레포 생성 후 연결
        if not has_remote:
            yield f"data: {json.dumps({'phase':'creating_repo','message':'GitHub 레포 생성 중...'})}\n\n"
            try:
                from github_manager import create_repo
                repo_name = team.get("repo") or team_id
                result = create_repo(repo_name, private=True)
                repo_url = result.get("html_url") or result.get("url") or ""
                if not repo_url:
                    yield f"data: {json.dumps({'phase':'error','step':'create_repo','message':'레포 URL 취득 실패'})}\n\n"
                    return
                yield f"data: {json.dumps({'phase':'repo_created','url':repo_url})}\n\n"
                rc, out = _run(["git", "remote", "add", "origin", repo_url])
                if rc != 0:
                    yield f"data: {json.dumps({'phase':'error','step':'remote_add','message':out})}\n\n"
                    return
            except Exception as e:
                yield f"data: {json.dumps({'phase':'error','step':'create_repo','message':str(e)})}\n\n"
                return

        # 5) 브랜치 확인
        rc, branch = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
        branch = (branch or "main").strip()
        yield f"data: {json.dumps({'phase':'pushing','branch':branch})}\n\n"

        # 6) push
        rc, out = _run(["git", "push", "-u", "origin", branch])
        if rc != 0:
            yield f"data: {json.dumps({'phase':'error','step':'push','message':out[:500]})}\n\n"
            return
        yield f"data: {json.dumps({'phase':'pushed','message':'원격 푸시 완료','detail':out[:200]})}\n\n"

        # 7) 최종 URL 리포트
        rc, remote = _run(["git", "remote", "get-url", "origin"])
        yield f"data: {json.dumps({'phase':'done','remote':(remote or '').replace('.git','').strip()})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.get("/api/system/check")
async def system_check():
    """TM SystemCheckDialog용 — node/git/npm/cloudflared/claude 버전 확인"""
    import shutil
    import subprocess
    tools = {}
    for name in ("node", "git", "npm", "cloudflared"):
        path = shutil.which(name)
        installed = bool(path)
        version = None
        if installed:
            try:
                r = subprocess.run([name, "--version"], capture_output=True, text=True, timeout=5)
                version = (r.stdout or r.stderr).strip().splitlines()[0] if r.returncode == 0 else None
            except Exception:
                version = None
        tools[name] = {"installed": installed, "version": version, "path": path}
    # Claude CLI
    claude_path = shutil.which("claude")
    claude_ver = None
    if claude_path:
        try:
            r = subprocess.run(["claude", "--version"], capture_output=True, text=True, timeout=5)
            claude_ver = (r.stdout or r.stderr).strip() if r.returncode == 0 else None
        except Exception:
            pass
    tools["claude"] = {"installed": bool(claude_path), "version": claude_ver, "path": claude_path}
    return {"ok": True, "platform": sys.platform, "tools": tools}


@app.get("/api/chat/{team_id}/history")
async def http_chat_history(team_id: str, session_id: str | None = None):
    """HTTP 폴링 대체 — session_id 지정 시 해당 세션의 메시지.
    미지정 시 active 세션. resumable 플래그 포함 (claude jsonl 파일 존재 여부).
    """
    import sessions_store
    sid = sessions_store.resolve_session_id(team_id, session_id)
    messages = ws_manager.get_history(team_id, sid)
    claude_sid = sessions_store.get_claude_session_id(team_id, sid)
    resumable = sessions_store._is_resumable(claude_sid)
    return {
        "ok": True,
        "team_id": team_id,
        "session_id": sid,
        "resumable": resumable,
        "messages": messages,
    }


@app.post("/api/chat/{team_id}/send")
async def http_chat_send(team_id: str, body: dict):
    """HTTP 대체 — WS 없이 메시지 전송. 백그라운드로 Claude 실행. 응답은 히스토리 폴링으로 확인."""
    team = next((t for t in TEAMS if t["id"] == team_id), None)
    if not team:
        return {"ok": False, "error": "팀 없음"}
    prompt = (body.get("prompt") or "").strip()
    image_paths = body.get("images", []) or []
    if not prompt and not image_paths:
        return {"ok": False, "error": "prompt 또는 images 필요"}
    import sessions_store
    sid = sessions_store.resolve_session_id(team_id, body.get("session_id"))
    # 이미지가 있으면 프롬프트에 파일 경로 추가
    if image_paths:
        img_instruction = "\n\n[첨부된 이미지 — Read 도구로 확인]"
        for ip in image_paths:
            img_instruction += f"\n- {ip}"
        prompt = (prompt or "이 이미지를 분석해줘") + img_instruction
    display_msg = prompt.split("\n\n[첨부된 이미지")[0] if image_paths else prompt
    img_badge = f" 📷×{len(image_paths)}" if image_paths else ""
    ws_manager.add_message(team_id, "user", display_msg + img_badge, sid)
    try:
        await ws_manager.send_json(
            team_id,
            {"type": "user", "content": display_msg + img_badge, "session_id": sid},
            session_id=sid,
        )
    except Exception:
        pass
    from task_queue import task_queue
    await task_queue.enqueue(team_id, prompt, session_id=sid)
    return {"ok": True, "session_id": sid}


# ── 세션 CRUD ────────────────────────────────────────

@app.get("/api/sessions/{team_id}")
async def list_sessions_api(team_id: str):
    """팀의 세션 목록 + active 세션 id."""
    import sessions_store
    return {
        "ok": True,
        "team_id": team_id,
        "session_id": sessions_store.get_active_session_id(team_id),
        "sessions": sessions_store.list_sessions(team_id),
    }


@app.post("/api/sessions/{team_id}")
async def create_session_api(team_id: str, body: dict | None = None):
    """새 세션 생성. body: {title?: str}"""
    import sessions_store
    team = next((t for t in TEAMS if t["id"] == team_id), None)
    if not team:
        return {"ok": False, "error": "팀 없음"}
    title = ((body or {}).get("title") or "").strip() or None
    session = sessions_store.create_session(team_id, title)
    # 실시간 브로드캐스트 (해당 팀 접속자들 UI 갱신)
    try:
        await ws_manager.send_json(team_id, {
            "type": "sessions_sync",
            "sessions": sessions_store.list_sessions(team_id),
            "session_id": session["id"],
        })
    except Exception:
        pass
    return {"ok": True, "team_id": team_id, "session": session}


@app.delete("/api/sessions/{team_id}/{session_id}")
async def delete_session_api(team_id: str, session_id: str, force: bool = False):
    import sessions_store
    # 진행 중 삭제 방지 — claude 프로세스 살아있거나 세션이 active면 거부 (force=true 시 우회)
    if not force:
        # AGENT_PIDS 체크 — 이 팀의 claude가 돌고 있으면 현재 active 세션 삭제 금지
        active_sid = sessions_store.get_active_session_id(team_id)
        if AGENT_PIDS.get(team_id) and session_id == active_sid:
            return {
                "ok": False,
                "error": "세션이 작업 중입니다. 취소 후 삭제하거나 force=true 파라미터로 강제 삭제하세요.",
                "running": True,
            }
    ok = sessions_store.delete_session(team_id, session_id)
    if not ok:
        return {"ok": False, "error": "세션을 찾을 수 없습니다"}
    try:
        await ws_manager.send_json(team_id, {
            "type": "sessions_sync",
            "sessions": sessions_store.list_sessions(team_id),
            "session_id": sessions_store.get_active_session_id(team_id),
        })
    except Exception:
        pass
    return {"ok": True}


@app.patch("/api/sessions/{team_id}/{session_id}")
async def rename_session_api(team_id: str, session_id: str, body: dict):
    """세션 제목 변경 + Phase 4: workingDirectory/githubRepo/supabaseProjectId 메타 설정.
    Body:
      - {"title": "..."} → 제목 변경
      - {"workingDirectory": "...", "githubRepo": "...", "supabaseProjectId": "..."} → 프로젝트 메타
    """
    import sessions_store
    changed = False
    title = (body.get("title") or "").strip()
    if title:
        if not sessions_store.rename_session(team_id, session_id, title):
            return {"ok": False, "error": "세션을 찾을 수 없습니다"}
        changed = True
    # Phase 4: 프로젝트 필드 (팀메이커 Session 등가물)
    for key in ("workingDirectory", "githubRepo", "supabaseProjectId"):
        if key in body:
            val = body[key]
            if sessions_store.set_session_meta(team_id, session_id, key, val):
                changed = True
    if not changed:
        return {"ok": False, "error": "변경할 필드 없음"}
    try:
        await ws_manager.send_json(team_id, {
            "type": "sessions_sync",
            "sessions": sessions_store.list_sessions(team_id),
            "session_id": sessions_store.get_active_session_id(team_id),
        })
    except Exception:
        pass
    return {"ok": True}


@app.post("/api/sessions/{team_id}/{session_id}/activate")
async def activate_session_api(team_id: str, session_id: str):
    import sessions_store
    if not sessions_store.switch_session(team_id, session_id):
        return {"ok": False, "error": "세션을 찾을 수 없습니다"}
    return {"ok": True, "session_id": session_id}


@app.websocket("/ws/chat/{team_id}")
async def ws_chat(ws: WebSocket, team_id: str, session_id: str | None = None):
    """팀별 채팅 WebSocket 엔드포인트.
    쿼리스트링 session_id 로 초기 구독 세션 지정 가능 (?session_id=...).
    """
    team = next((t for t in TEAMS if t["id"] == team_id), None)
    if not team:
        await ws.accept()
        await ws.send_json({"type": "error", "content": "❌ 팀을 찾을 수 없습니다"})
        await ws.close()
        return

    project_path = team["localPath"]
    local_path = os.path.expanduser(project_path)
    if not os.path.isdir(local_path):
        await ws.accept()
        await ws.send_json({"type": "error", "content": f"❌ 프로젝트 경로를 찾을 수 없습니다: {local_path}"})
        await ws.close()
        return

    await handle_chat(ws, team_id, project_path, session_id=session_id)


# ── Task Queue / Pipeline / Debounce API ────────────────

def _get_team_path(team_id: str) -> str | None:
    team = next((t for t in TEAMS if t["id"] == team_id), None)
    return team["localPath"] if team else None

# 큐 초기화 (run_claude + 팀 경로 연결)
task_queue.init(
    run_claude_fn=run_claude,
    get_team_path_fn=_get_team_path,
)


@app.post("/api/queue/enqueue")
async def queue_enqueue(body: dict):
    """작업을 팀 큐에 추가 (대기열 관리)

    body: {"team_id": "backend-team", "prompt": "...", "priority": 0}
    """
    team_id = body.get("team_id", "")
    prompt = body.get("prompt", "")
    priority = body.get("priority", 0)
    if not team_id or not prompt:
        return {"ok": False, "error": "team_id와 prompt가 필요합니다"}
    task = await task_queue.enqueue(team_id, prompt, priority=priority)
    return {"ok": True, "task": task.to_dict()}


@app.get("/api/queue/status")
async def queue_status():
    """전체 큐 상태 조회"""
    return {"ok": True, "queues": task_queue.get_all_status()}


@app.get("/api/queue/status/{team_id}")
async def queue_team_status(team_id: str):
    """팀별 큐 상태 조회"""
    return {"ok": True, **task_queue.get_queue_status(team_id)}


@app.post("/api/queue/cancel/{task_id}")
async def queue_cancel(task_id: str):
    """대기 중인 작업 취소"""
    ok = task_queue.cancel_task(task_id)
    return {"ok": ok}


@app.post("/api/pipeline/run")
async def pipeline_run(body: dict):
    """순차 파이프라인 실행

    body: {
        "name": "기능 구현",
        "steps": [
            {"team": "backend-team", "prompt": "API 설계해"},
            {"team": "frontend-team", "prompt": "이 API로 UI 만들어: {prev_result}"}
        ]
    }
    """
    name = body.get("name", "")
    steps = body.get("steps", [])
    if not steps:
        return {"ok": False, "error": "steps가 필요합니다"}
    pipeline = await pipeline_engine.create_and_run(name, steps)
    return {"ok": True, "pipeline": pipeline.to_dict()}


@app.get("/api/pipeline/{pipeline_id}")
async def pipeline_status(pipeline_id: str):
    """파이프라인 상태 조회"""
    status = pipeline_engine.get_status(pipeline_id)
    if not status:
        return {"ok": False, "error": "파이프라인을 찾을 수 없습니다"}
    return {"ok": True, **status}


@app.get("/api/debounce/status")
async def debounce_status():
    """디바운서 상태 조회"""
    return {"ok": True, "buffers": debouncer.get_status()}


# ── 웹터미널 (ttyd) ──────────────────────────────────

@app.post("/api/terminal/{team_id}/start")
async def start_terminal(team_id: str):
    """팀별 웹터미널 세션 시작"""
    result = start_team_terminal(team_id)
    return result


@app.delete("/api/terminal/{team_id}/stop")
async def stop_terminal(team_id: str):
    """팀별 웹터미널 세션 종료"""
    stop_team_terminal(team_id)
    return {"status": "stopped"}


@app.get("/api/terminal/{team_id}/status")
async def terminal_status(team_id: str):
    """팀별 터미널 세션 상태 확인"""
    return get_session_info(team_id)


# ── QA 에이전트 (토큰 0 — bash 스크립트만 실행) ──────

@app.post("/api/qa/run")
async def run_qa():
    """QA 전체 체크 실행 (토큰 0, 서버 내부 직접 체크)"""
    import urllib.request, socket
    checks = []

    # 1. 서버 자체 — 이미 응답하고 있으니 OK
    checks.append({"name": "서버 응답", "pass": True})

    # 2. 대시보드 데이터
    try:
        dash = _svc_cache.get("data", [])
        checks.append({"name": "대시보드", "pass": True})
    except Exception:
        checks.append({"name": "대시보드", "pass": False})

    # 3. 멘션 코드 존재 확인 (코드 레벨 체크)
    import inspect
    src = inspect.getsource(smart_dispatch)
    has_mention = "mention_pattern" in src
    no_integration = "통합 요약해줘" not in src
    checks.append({"name": "멘션 haiku 스킵", "pass": has_mention})
    checks.append({"name": "멘션 통합보고 제거", "pass": no_integration})

    # 4. 프론트 빌드
    ui_out = os.path.exists(os.path.join(os.path.dirname(__file__), "..", "ui", "out")) or \
             os.path.exists(os.path.join(os.path.dirname(__file__), "..", "ui", ".next"))
    checks.append({"name": "프론트 빌드", "pass": ui_out})

    # 5. ttyd
    try:
        s = socket.create_connection(("127.0.0.1", 7681), timeout=2)
        s.close()
        checks.append({"name": "ttyd", "pass": True})
    except Exception:
        checks.append({"name": "ttyd", "pass": False})

    # 6. Cloudflare
    try:
        req = urllib.request.Request("https://api.600g.net/api/standby", method="GET")
        req.add_header("User-Agent", "qa/1.0")
        resp = urllib.request.urlopen(req, timeout=5)
        checks.append({"name": "외부 접속", "pass": resp.getcode() == 200})
    except Exception:
        checks.append({"name": "외부 접속", "pass": False})

    passed_count = sum(1 for c in checks if c["pass"])
    total = len(checks)
    # 외부 접속은 DNS 일시 문제일 수 있으므로 warning 처리 (필수 아님)
    critical_checks = [c for c in checks if c["name"] != "외부 접속"]
    all_passed = all(c["pass"] for c in critical_checks)
    output = "\n".join(f"{'✅' if c['pass'] else '❌'} {c['name']}" for c in checks)
    output += f"\n\n결과: {passed_count}/{total} {'✅ QA 통과' if all_passed else '❌ QA 실패'}"

    return {"ok": True, "passed": all_passed, "checks": checks, "output": output, "summary": f"{passed_count}/{total}"}


@app.post("/api/qa/restart-server")
async def qa_restart_server():
    """서버 재시작 (QA용)"""
    import subprocess
    script = os.path.join(os.path.dirname(__file__), "..", "scripts", "restart_server.sh")
    try:
        result = subprocess.run(
            ["bash", script], capture_output=True, text=True, timeout=30,
        )
        return {"ok": True, "output": result.stdout}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── 서버 실행 ─────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        ws_ping_interval=20,
        ws_ping_timeout=30,
    )
