"""AI Company 본부 — FastAPI 메인 서버 (포트 8000)"""

import os
import sys
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from ws_handler import handle_chat, AGENT_STATUS, RECENT_ACTIVITY, _log_activity
from project_scanner import scan_all
from github_manager import create_repo, list_repos, _generate_system_prompt, PROJECT_TYPES
from system_monitor import get_all as get_system, get_process_stats
from claude_runner import TEAM_SESSIONS, TEAM_MODELS, AGENT_PIDS, MODEL_IDS, get_claude_version, _save_sessions, AGENT_TOKENS
from auth import (
    register_user, verify_token, create_invite_code,
    get_all_codes, get_all_users, ensure_owner_code, ROLES,
)

load_dotenv()

# 서버 시작 시 오너 초대코드 확인
ensure_owner_code()

PROJECTS_ROOT = os.path.expanduser(os.getenv("PROJECTS_ROOT", "~/Developer/my-company"))

# 팀 목록 (teams.ts와 동기화)
TEAMS = [
    {"id": "server-monitor", "name": "서버실", "emoji": "🖥", "repo": "company-hq",
     "localPath": "~/Developer/my-company/company-hq", "status": "운영중"},
    {"id": "cpo-claude", "name": "CPO 클로드", "emoji": "🧠", "repo": "company-hq",
     "localPath": "~/Developer/my-company/company-hq", "status": "운영중", "model": "opus"},
    {"id": "trading-bot", "name": "매매봇", "emoji": "🤖", "repo": "upbit-auto-trading-bot",
     "localPath": "~/Developer/my-company/upbit-auto-trading-bot", "status": "운영중"},
    {"id": "date-map", "name": "데이트지도", "emoji": "🗺️", "repo": "date-map",
     "localPath": "~/Developer/my-company/date-map", "status": "운영중"},
    {"id": "claude-biseo", "name": "클로드비서", "emoji": "🤵", "repo": "claude-biseo-v1.0",
     "localPath": "~/Developer/my-company/claude-biseo-v1.0", "status": "운영중"},
    {"id": "ai900", "name": "AI900", "emoji": "📚", "repo": "ai900",
     "localPath": "~/Developer/my-company/ai900", "status": "운영중"},
    {"id": "cl600g", "name": "CL600G", "emoji": "⚡", "repo": "cl600g",
     "localPath": "~/Developer/my-company/cl600g", "status": "운영중"},
]

app = FastAPI(title="AI Company HQ", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 인증 API ─────────────────────────────────────────

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
    """팀 목록 + 프로젝트 현황(버전, 최근 커밋일 포함) 반환"""
    return scan_all(PROJECTS_ROOT, TEAMS)


@app.get("/api/teams/info")
async def get_teams_info():
    """팀 목록 + 버전/업데이트일 간략 정보 (폴링용 경량 API)"""
    from project_scanner import scan_project
    result = []
    for team in TEAMS:
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

    new_team = {
        "id": repo_name,
        "name": name,
        "emoji": emoji,
        "repo": repo_name,
        "localPath": f"~/Developer/my-company/{repo_name}",
        "status": "신규",
    }
    TEAMS.append(new_team)

    # 시스템프롬프트 자동 등록 (claude_runner에 동적 추가)
    from claude_runner import TEAM_SYSTEM_PROMPTS
    if result.get("system_prompt"):
        TEAM_SYSTEM_PROMPTS[repo_name] = result["system_prompt"]

    return {
        "ok": True,
        "team": new_team,
        "repo_url": result["repo_url"],
        "project_type": project_type,
        "claude_md": True,
    }


@app.get("/api/repos")
async def get_repos():
    """GitHub 레포 목록"""
    return list_repos()


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


@app.get("/api/dashboard")
async def get_dashboard():
    """대시보드 전체 상태 반환"""
    agents = []
    for team in TEAMS:
        tid = team["id"]
        if tid == "server-monitor":
            continue  # 서버실 자신은 에이전트 목록에서 제외
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


# ── WebSocket ─────────────────────────────────────────

@app.websocket("/ws/chat/{team_id}")
async def ws_chat(ws: WebSocket, team_id: str):
    """팀별 채팅 WebSocket 엔드포인트"""
    team = next((t for t in TEAMS if t["id"] == team_id), None)
    project_path = team["localPath"] if team else None
    await handle_chat(ws, team_id, project_path)


# ── 서버 실행 ─────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
