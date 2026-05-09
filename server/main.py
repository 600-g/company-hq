"""AI Company 본부 — FastAPI 메인 서버 (포트 8000)"""

import os
import sys
import asyncio
import time
import shutil
import json
import logging
import uuid
import subprocess

logger = logging.getLogger("main")
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

# 안정화 2026-05-08 — main.py 분할 1·2차: admin 라우터들
from routers.admin_patch import router as admin_patch_router
from routers.admin_ops import router as admin_ops_router
from routers.office_layout import router as office_layout_router
from routers.furniture import router as furniture_router
from routers.diag import router as diag_router
from routers.system import router as system_router
from routers.agents import router as agents_router
from routers.teams import router as teams_router
from routers.auth import router as auth_router
from routers.push import router as push_router
from routers.trading import router as trading_router
from routers.dispatch import router as dispatch_router
from routers.doogeun_state import router as doogeun_state_router
from routers.dashboard import router as dashboard_router
app.include_router(admin_patch_router)
app.include_router(admin_ops_router)
app.include_router(office_layout_router)
app.include_router(furniture_router)
app.include_router(diag_router)
app.include_router(system_router)
app.include_router(agents_router)
app.include_router(teams_router)
app.include_router(auth_router)
app.include_router(push_router)
app.include_router(trading_router)
app.include_router(dispatch_router)
app.include_router(doogeun_state_router)
app.include_router(dashboard_router)

from routers.naver_proxy import router as naver_proxy_router  # noqa: E402
app.include_router(naver_proxy_router)

from routers.odsay_proxy import router as odsay_proxy_router  # noqa: E402
app.include_router(odsay_proxy_router)


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



# ── 인증 API ─────────────────────────────────────────


@app.post("/api/teams")
async def add_team(body: dict):
    """신규 팀 추가: GitHub 레포 생성 + 로컬 클론 + CLAUDE.md + 시스템프롬프트 자동 등록.

    [안정화 2026-05-08] 4단계 트랜잭션화:
    1. GitHub 레포 생성 → 실패 시 즉시 반환 (rollback 불가, 만들어진 게 없음)
    2. TEAMS 등록 + 저장 → 실패 시 반환 (GitHub repo 는 사용자에게 안내)
    3. 시스템프롬프트 등록 → 실패 시 TEAMS 롤백
    4. floor_layout 동기화 → 실패 시 prompts/TEAMS 롤백
    GitHub repo 자체 삭제는 안전상 자동 X — 부분 실패 시 사용자가 수동 정리.
    """
    name = body.get("name", "").strip()
    repo_name = body.get("repo", name).strip()
    emoji = body.get("emoji", "🆕")
    description = body.get("description", "")
    project_type = body.get("project_type", "general")

    if not name or not repo_name:
        return {"ok": False, "error": "name과 repo는 필수입니다."}

    # ─ 단계 1: GitHub 레포 생성 ─
    result = create_repo(repo_name, description, project_type=project_type, emoji=emoji)
    if not result["ok"]:
        return result

    # 트랜잭션 롤백 헬퍼 (GitHub 레포는 보존, 그 외만 되돌림)
    def _rollback(stage: str, err: Exception, *, teams_added: bool = False, prompt_set: bool = False) -> dict:
        global TEAMS, FLOOR_LAYOUT
        try:
            if prompt_set:
                from claude_runner import TEAM_SYSTEM_PROMPTS as _TSP, _SAVED_PROMPTS as _SP, _save_prompts as _save_p
                _TSP.pop(repo_name, None)
                _SP.pop(repo_name, None)
                try: _save_p(_SP)
                except Exception: pass
            if teams_added:
                TEAMS = [t for t in TEAMS if t["id"] != repo_name]
                try: _save_teams(TEAMS); set_team_lookup(TEAMS)
                except Exception: pass
        except Exception as roll_err:
            logger.warning("[create-team] 롤백 실패 (%s): %s", stage, roll_err)
        logger.error("[create-team] %s 단계 실패: %s — GitHub 레포는 보존됨 (%s)",
                     stage, err, result.get("repo_url"))
        return {
            "ok": False,
            "error": f"{stage} 실패: {err}",
            "stage": stage,
            "rolled_back": True,
            "github_repo_remaining": result.get("repo_url"),
            "warning": f"GitHub 레포는 자동 삭제 안 됨. 필요 시 직접 삭제: {result.get('repo_url')}",
        }

    # ─ 단계 2: TEAMS 등록 + 저장 ─
    category = body.get("category", "product")
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
    try:
        if not any(t["id"] == repo_name for t in TEAMS):
            TEAMS.append(new_team)
            _save_teams(TEAMS)
            set_team_lookup(TEAMS)
    except Exception as e:
        return _rollback("TEAMS 등록", e)

    # ─ 단계 3: 시스템프롬프트 등록 + 저장 ─
    try:
        from claude_runner import TEAM_SYSTEM_PROMPTS, _save_prompts, _SAVED_PROMPTS
        if result.get("system_prompt"):
            TEAM_SYSTEM_PROMPTS[repo_name] = result["system_prompt"]
            _SAVED_PROMPTS[repo_name] = result["system_prompt"]
            _save_prompts(_SAVED_PROMPTS)
    except Exception as e:
        return _rollback("시스템 프롬프트 등록", e, teams_added=True)

    # ─ 단계 4: 층 배치 동기화 ─
    global FLOOR_LAYOUT
    try:
        FLOOR_LAYOUT = _sync_layout_with_teams(TEAMS, FLOOR_LAYOUT)
        _save_layout(FLOOR_LAYOUT)
    except Exception as e:
        return _rollback("층 배치", e, teams_added=True, prompt_set=True)

    # ─ 단계 5 (선택): 서브도메인 자동 발급 (subdomain 입력 시) ─
    public_url: str | None = None
    subdomain_info: dict | None = None
    subdomain = (body.get("subdomain") or "").strip().lower()
    # category: "web" | "game" | "other" — 토큰 라벨링용. 없으면 서브도메인 키워드로 자동 추정.
    sub_category = (body.get("subdomain_category") or "").strip().lower() or None
    if subdomain:
        try:
            from cf_dns import add_subdomain, add_cname_file_to_repo, suggest_category
            local_path = os.path.expanduser(new_team["localPath"])
            if not sub_category:
                sub_category = suggest_category(subdomain)
            # 5-1: CF DNS CNAME 등록 (카테고리별 토큰 우선)
            dns_result = add_subdomain(subdomain, category=sub_category)
            if not dns_result.get("ok"):
                logger.warning("[create-team] 서브도메인 DNS 등록 실패: %s", dns_result.get("error"))
                subdomain_info = {"ok": False, "stage": "dns", "error": dns_result.get("error")}
            else:
                # 5-2: repo 에 CNAME 파일 추가 + push (GitHub Pages 인식용)
                cname_result = add_cname_file_to_repo(local_path, dns_result["full_name"])
                if not cname_result.get("ok"):
                    logger.warning("[create-team] CNAME 파일 푸시 실패: %s", cname_result.get("error"))
                    subdomain_info = {
                        "ok": False, "stage": "cname_file",
                        "error": cname_result.get("error"),
                        "dns": dns_result,
                    }
                else:
                    public_url = dns_result["url"]
                    subdomain_info = {
                        "ok": True,
                        "url": public_url,
                        "full_name": dns_result["full_name"],
                        "category_used": dns_result.get("category_used", sub_category),
                        "note": "SSL 발급 5분~1시간 — 그동안 https 접속 시 잠시 경고 가능",
                    }
                    logger.info("[create-team] ✅ 서브도메인 %s 자동 발급 완료", public_url)
        except Exception as e:
            logger.warning("[create-team] 서브도메인 자동화 실패: %s", e)
            subdomain_info = {"ok": False, "stage": "exception", "error": str(e)}

    logger.info("[create-team] ✅ %s 생성 완료 (repo=%s, public_url=%s)",
                repo_name, result.get("repo_url"), public_url or "n/a")
    return {
        "ok": True,
        "team": new_team,
        "repo_url": result["repo_url"],
        "project_type": project_type,
        "claude_md": True,
        "public_url": public_url,
        "subdomain_info": subdomain_info,
    }


@app.post("/api/agents/generate-config")
async def generate_agent_config(body: dict):
    """TM generateAgentConfig + Skill Router + LLM 도메인 강화 (2026-05-09 업그레이드).

    body: {name?, description, project_type?, framework?}
      - project_type: "web" / "backend" / "general" (기본 추론)
      - framework: "nextjs" / "fastapi" 등 (선택)

    합성 흐름:
      1) LLM 으로 role/description/outputHint/steps 자동 생성 (기존)
      2) skill_router.select_skill_md() — 5개 SOP MD 중 매칭 1개 선택 (TeamMaker)
      3) skill_router.select_references() — 프레임워크별 reference 최대 3개 첨부 (TeamMaker)
      4) skill_router.enhance_sop_with_llm() — 무료 LLM 으로 도메인 특화 가이드 동적 생성 (NEW)
      5) compose_system_prompt() — 페르소나 + SOP + 강화 + reference + 격리/협업 합성

    returns: {ok, role, description, outputHint, steps, system_prompt,
              skill_key, refs_used, enhanced_sop_len}
    """
    from skill_router import (
        select_skill_md, select_references, enhance_sop_with_llm,
        compose_system_prompt,
    )

    agent_name = (body.get("name") or "").strip() or "새 에이전트"
    desc = (body.get("description") or "").strip()
    project_type = (body.get("project_type") or "").strip() or None
    framework = (body.get("framework") or "").strip() or None
    if not desc:
        return {"ok": False, "error": "description 필요"}

    # 1) 기본 config LLM 생성 (기존 로직 보존)
    cfg_prompt = (
        "너는 AI 에이전트 역할 설계 전문가다. 유저가 설명한 역할에 맞는 단일 AI 에이전트를 설계해.\n\n"
        "반드시 아래 JSON 형식으로만 응답. 다른 텍스트 금지.\n\n"
        "{\n"
        '  "role": "역할명 (한국어, 간결, ~담당 형식)",\n'
        '  "description": "이 에이전트가 뭘 하는지 쉬운 한국어 1-2문장",\n'
        '  "outputHint": "산출물 형식 (쉼표구분 2~4개)",\n'
        '  "steps": ["1단계", "2단계", "3단계"]\n'
        "}\n\n"
        "규칙: 단일 에이전트, role='~담당', description은 평이한 말, steps 2~4개."
    )
    user_msg = f"에이전트 이름: {agent_name}\n에이전트 설명: {desc}\n\n이 에이전트를 설계해줘."
    try:
        result = await run_claude_light(
            f"{cfg_prompt}\n\n{user_msg}",
            os.path.expanduser("~/Developer/my-company/company-hq"),
        )
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

    role = cfg.get("role", "담당자")

    # 2) skill MD 자동 선택 (TeamMaker)
    skill_key, skill_md = select_skill_md(
        role=role,
        description=cfg.get("description", desc),
        project_type=project_type,
        framework=framework,
    )

    # 3) reference 자동 선택 (TeamMaker)
    refs = select_references(
        role=role,
        description=cfg.get("description", desc),
        project_type=project_type,
        framework=framework,
        task_description=desc,
        max_refs=3,
    )

    # 4) 무료 LLM 도메인 특화 강화 (TeamMaker 초과)
    enhanced_sop = await enhance_sop_with_llm(agent_name, role, desc, skill_key)

    # 5) 페르소나 베이스
    steps_text = "\n".join(f"{i+1}. {s}" for i, s in enumerate(cfg.get("steps", [])))
    base_persona = (
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
        "없으면 이 프롬프트가 최상위 지침."
    )

    # 6) 최종 system_prompt 합성
    sys_prompt = compose_system_prompt(
        name=agent_name,
        role=role,
        base_persona=base_persona,
        skill_key=skill_key,
        skill_md=skill_md,
        enhanced_sop=enhanced_sop,
        references=refs,
    )

    return {
        "ok": True,
        "role": role,
        "description": cfg.get("description", desc),
        "outputHint": cfg.get("outputHint", ""),
        "steps": cfg.get("steps", []),
        "system_prompt": sys_prompt,
        # ── 메타 (TeamMaker 흡수 + LLM 강화 검증용) ──
        "skill_key": skill_key,
        "refs_used": [k for k, _ in refs],
        "enhanced_sop_len": len(enhanced_sop),
    }


@app.post("/api/teams/light")
async def add_light_agent(body: dict):
    """경량 에이전트 — GitHub/레포 없이 빠르게 추가 (단독 / 협업 가능)

    [안정화 2026-05-08] 4단계 트랜잭션화:
    1. sandbox 폴더 생성    → 실패 시 즉시 반환
    2. TEAMS 등록 + 저장    → 실패 시 sandbox 삭제 후 반환
    3. 시스템 프롬프트 등록  → 실패 시 TEAMS 롤백 + sandbox 삭제
    4. floor_layout 동기화  → 실패 시 prompts/TEAMS 롤백 + sandbox 삭제
    각 단계 실패 시 이전 모든 단계 자동 롤백 → ghost 에이전트 제거.
    """
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

    # 트랜잭션 롤백 헬퍼 — 어느 단계든 실패 시 이전 단계 모두 되돌리기
    def _rollback(stage: str, err: Exception, *, sandbox_created: bool = False,
                   teams_added: bool = False, prompt_set: bool = False) -> dict:
        global TEAMS, FLOOR_LAYOUT
        try:
            if prompt_set:
                from claude_runner import TEAM_SYSTEM_PROMPTS as _TSP, _SAVED_PROMPTS as _SP, _save_prompts as _save_p
                _TSP.pop(team_id, None)
                _SP.pop(team_id, None)
                try: _save_p(_SP)
                except Exception: pass
            if teams_added:
                TEAMS = [t for t in TEAMS if t["id"] != team_id]
                try: _save_teams(TEAMS); set_team_lookup(TEAMS)
                except Exception: pass
            if sandbox_created:
                import shutil as _sh
                _sh.rmtree(os.path.expanduser(f"~/Developer/agents/{team_id}"), ignore_errors=True)
        except Exception as roll_err:
            logger.warning("[create-light] 롤백 자체 실패 (%s): %s", stage, roll_err)
        logger.error("[create-light] %s 단계 실패: %s — 이전 단계 롤백 완료", stage, err)
        return {"ok": False, "error": f"{stage} 실패: {err}", "stage": stage, "rolled_back": True}

    # ─ 단계 1: sandbox 폴더 생성 ─
    sandbox = os.path.expanduser(f"~/Developer/agents/{team_id}")
    try:
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
    except Exception as e:
        return _rollback("sandbox 폴더 생성", e)
    local_path = sandbox

    # ─ 단계 2: TEAMS 등록 + 저장 ─
    new_team = {
        "id": team_id, "name": name, "emoji": emoji,
        "repo": "", "localPath": local_path,
        "status": "운영중", "category": "product",
        "order": _next_order(TEAMS), "layer": 1,
        "lightweight": True, "collaborative": collaborative,
    }
    try:
        TEAMS.append(new_team)
        _save_teams(TEAMS)
        set_team_lookup(TEAMS)
    except Exception as e:
        return _rollback("TEAMS 등록", e, sandbox_created=True)

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
    # ─ 단계 3: 시스템 프롬프트 등록 + 저장 ─
    try:
        TEAM_SYSTEM_PROMPTS[team_id] = sys_prompt
        _SAVED_PROMPTS[team_id] = sys_prompt
        _save_prompts(_SAVED_PROMPTS)
    except Exception as e:
        return _rollback("시스템 프롬프트 등록", e, sandbox_created=True, teams_added=True)

    # ─ 단계 4: 층 배치 동기화 ─
    global FLOOR_LAYOUT
    try:
        FLOOR_LAYOUT = _sync_layout_with_teams(TEAMS, FLOOR_LAYOUT)
        _save_layout(FLOOR_LAYOUT)
    except Exception as e:
        return _rollback("층 배치", e, sandbox_created=True, teams_added=True, prompt_set=True)

    logger.info("[create-light] ✅ %s (%s) 생성 완료 — 4/4 단계", team_id, name)
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




    return result



# ── 웹 푸시 알림 ──────────────────────────────────────



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
    """외부 서비스 토큰이 서버 .env 에 설정됐는지 여부 (값은 노출 안 함).

    CF_TOKEN 은 카테고리별 (web/game/other) 분리 + 폴백 표시.
    """
    import shutil
    import subprocess
    names = ["GITHUB_TOKEN", "CF_TOKEN", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]
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
    # 카테고리별 CF 토큰 상태 추가 (UI 에서 어떤 카테고리가 비어있는지 보여줌)
    try:
        from cf_dns import list_token_status
        result["CF_TOKEN_BY_CATEGORY"] = list_token_status()
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
        from routers.dashboard import _svc_cache as _dash_cache
        dash = _dash_cache.get("data", [])
        checks.append({"name": "대시보드", "pass": True})
    except Exception:
        checks.append({"name": "대시보드", "pass": False})

    # 3. 멘션 코드 존재 확인 (코드 레벨 체크)
    import inspect
    from routers.dispatch import smart_dispatch
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


# ── 트레이딩 대시보드 proxy ─────────────
# api.600g.net/trading/*  → :9000/{path}        (기존 호환)
# trading.600g.net/{path} → :9000/{path}        (신규, 별도 도메인)
import httpx as _httpx_trading
from fastapi import Response as _Response_trading

async def _trading_proxy_impl(path: str, request: Request):
    target = f"http://127.0.0.1:9000/{path}"
    body = await request.body() if request.method == "POST" else None
    try:
        async with _httpx_trading.AsyncClient(timeout=10.0) as client:
            r = await client.request(
                request.method, target,
                content=body,
                params=dict(request.query_params),
                headers={
                    "content-type": request.headers.get("content-type", "application/json"),
                    "accept": request.headers.get("accept", "*/*"),
                },
            )
        return _Response_trading(
            content=r.content,
            status_code=r.status_code,
            media_type=r.headers.get("content-type", "text/html"),
        )
    except _httpx_trading.ConnectError:
        return _Response_trading("trading-dashboard offline (port 9000)",
                        status_code=503, media_type="text/plain")

@app.api_route("/trading/{path:path}", methods=["GET", "POST"])
async def trading_proxy(path: str, request: Request):
    """기존 api.600g.net/trading/* — 호환 유지."""
    return await _trading_proxy_impl(path, request)

@app.middleware("http")
async def _trading_subdomain_proxy(request: Request, call_next):
    """trading.600g.net 으로 들어온 요청은 :9000 으로 proxy.
    예외: /api/push/* 는 두근컴퍼니 자체 router (vapid-key/subscribe-trading/topics) 처리."""
    host = request.headers.get("host", "").lower().split(":")[0]
    if host == "trading.600g.net":
        path = request.url.path
        # /api/push/* 는 두근컴퍼니 자체 처리 (proxy 안 함)
        if path.startswith("/api/push/") or path == "/api/push":
            return await call_next(request)
        # 그 외 → :9000 system-api proxy. root → index.html (트레이딩 홈)
        proxy_path = path.lstrip("/") or "index.html"
        return await _trading_proxy_impl(proxy_path, request)
    return await call_next(request)


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
