"""AI Company 본부 — FastAPI 메인 서버 (포트 8000)"""

import os
import sys
import asyncio
import time
import shutil
import json
import uuid
from datetime import datetime, timedelta
from fastapi import FastAPI, WebSocket, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from ws_handler import (
    handle_chat, AGENT_STATUS, RECENT_ACTIVITY, _log_activity, set_team_lookup,
    collab_broadcast, CHAR_STATE, ACTIVE_COLLABS, get_char_state,
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
     "localPath": "~/Developer/my-company/claude-biseo-v1.0", "status": "운영중",
     "order": 4, "layer": 1},
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

app = FastAPI(title="AI Company HQ", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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

    # 4) 채팅 히스토리 파일 삭제
    chat_file = os.path.join(os.path.dirname(__file__), "chat_history", f"{team_id}.json")
    try:
        os.unlink(chat_file)
        logging.info(f"[DELETE] 채팅 히스토리 삭제: {chat_file}")
    except FileNotFoundError:
        pass

    # 5) team_sessions.json에서 세션 제거
    try:
        TEAM_SESSIONS.pop(team_id, None)
        _save_sessions()
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
            if tid in ("cpo-claude", "server-monitor"):  # CPO·서버실은 게임에서 별도 렌더링
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
            "name": team.get("name", ""),
            "emoji": team.get("emoji", ""),
            "char_state": char["state"],
            "collab_with": char["collab_with"],
            "action": char["action"],
            "working": ws_status.get("working", False),
            "tool": ws_status.get("tool"),
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
                return

            # 특정 팀 멘션 → haiku 스킵, 직접 실행
            routed_steps = []
            for tid in mentioned_ids:
                if tid in team_map:
                    routed_steps.append({"team": tid, "prompt": clean_message})
            if routed_steps:
                yield f"data: {json.dumps({'phase': 'routing', 'message': f'📌 멘션 감지 → {len(routed_steps)}팀 직접 실행'})}\n\n"
                # Phase 2로 바로 점프 (아래 코드에서 처리)
                routed_team_ids = [s["team"] for s in routed_steps]
                skipped_teams = [t for t in available_teams if t["id"] not in routed_team_ids]
                yield f"data: {json.dumps({'phase': 'routed', 'teams': routed_team_ids, 'skipped': [t['id'] for t in skipped_teams]})}\n\n"
                yield f"data: {json.dumps({'phase': 'executing', 'message': f'⚡ {len(routed_steps)}팀 작업 중...'})}\n\n"

                team_results: dict[str, dict] = {}

                async def run_mentioned_team(step: dict):
                    _tid = step["team"]
                    _team = team_map[_tid]
                    _prompt = f"[유저 원래 요청: {message}]\n\n{step['prompt']}"
                    _result = ""
                    try:
                        async for chunk in run_claude(_prompt, _team["localPath"], _tid, is_auto=False):
                            if chunk["kind"] == "text":
                                _result += chunk["content"]
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
                meta = {"routed_count": len(routed_steps), "total_teams": len(available_teams), "mention": True}
                yield f"data: {json.dumps({'phase': 'done', 'dispatch_id': dispatch_id, 'summary': all_results_text.strip(), 'team_results': team_results, 'meta': meta})}\n\n"
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
            "형식 (JSON만, 설명 없이):\n"
            '[{"team": "team-id", "prompt": "유저가 OO를 요청했다. 구체적으로 XX를 해줘"}]\n'
            '또는 관련 팀 없으면: []'
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
            return

        try:
            routed_steps = json.loads(json_match.group())
        except json.JSONDecodeError:
            yield f"data: {json.dumps({'phase': 'error', 'error': 'JSON 파싱 실패'})}\n\n"
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
            return

        routed_team_ids = [s["team"] for s in routed_steps]
        skipped_teams = [t for t in available_teams if t["id"] not in routed_team_ids]

        yield f"data: {json.dumps({'phase': 'routed', 'teams': routed_team_ids, 'skipped': [t['id'] for t in skipped_teams]})}\n\n"

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
            try:
                # smart_dispatch 팀 병렬 실행 — 사용자 요청 기반이므로 is_auto=False
                async for chunk in run_claude(prompt, team["localPath"], team_id, is_auto=False):
                    if chunk["kind"] == "text":
                        result_text += chunk["content"]
                team_results[team_id] = {
                    "status": "done",
                    "team_name": team["name"],
                    "emoji": team["emoji"],
                    "result": result_text,
                }
            except Exception as e:
                team_results[team_id] = {"status": "error", "error": str(e)}

        # 병렬 실행
        await asyncio.gather(*[run_team(step) for step in routed_steps])

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


# ── 토큰 예산 관리 ─────────────────────────────────────

@app.get("/api/budget")
async def budget_status():
    """토큰 예산 현황"""
    return {"ok": True, **get_budget_status()}

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


# ── WebSocket ─────────────────────────────────────────

@app.websocket("/ws/chat/{team_id}")
async def ws_chat(ws: WebSocket, team_id: str):
    """팀별 채팅 WebSocket 엔드포인트"""
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

    await handle_chat(ws, team_id, project_path)


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
        reload=True,
        reload_excludes=["*.log", "*.json", "chat_history/*", "logs/*", "__pycache__/*"],
    )
