"""AI Company 본부 — FastAPI 메인 서버 (포트 8000)"""

import os
import sys
import asyncio
import time
import shutil
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
    get_all_codes, get_all_users, ensure_owner_code, ROLES, owner_login,
)

load_dotenv()

# 서버 시작 시 오너 초대코드 확인
ensure_owner_code()

PROJECTS_ROOT = os.path.expanduser(os.getenv("PROJECTS_ROOT", "~/Developer/my-company"))

# 팀 목록 — teams.json에서 로드 (동적 추가 영구 반영)
TEAMS_FILE = os.path.join(os.path.dirname(__file__), "teams.json")

_DEFAULT_TEAMS = [
    {"id": "server-monitor", "name": "서버실", "emoji": "🖥", "repo": "company-hq",
     "localPath": "~/Developer/my-company/company-hq", "status": "운영중"},
    {"id": "cpo-claude", "name": "CPO", "emoji": "🧠", "repo": "company-hq",
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
    {"id": "design-team", "name": "디자인팀", "emoji": "🎨", "repo": "design-team",
     "localPath": "~/Developer/my-company/design-team", "status": "운영중"},
]

def _load_teams() -> list:
    import json
    if os.path.isfile(TEAMS_FILE):
        with open(TEAMS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    # 최초 실행 시 기본값 저장
    _save_teams(_DEFAULT_TEAMS)
    return list(_DEFAULT_TEAMS)

def _save_teams(teams: list):
    import json
    with open(TEAMS_FILE, "w", encoding="utf-8") as f:
        json.dump(teams, f, ensure_ascii=False, indent=2)

TEAMS = _load_teams()

app = FastAPI(title="AI Company HQ", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
        "status": "운영중",
    }
    # 중복 체크
    if not any(t["id"] == repo_name for t in TEAMS):
        TEAMS.append(new_team)
        _save_teams(TEAMS)  # JSON 영구 저장

    # 시스템프롬프트 자동 등록 (claude_runner에 동적 추가 + 파일 영구 저장)
    from claude_runner import TEAM_SYSTEM_PROMPTS, _save_prompts, _SAVED_PROMPTS
    if result.get("system_prompt"):
        TEAM_SYSTEM_PROMPTS[repo_name] = result["system_prompt"]
        _SAVED_PROMPTS[repo_name] = result["system_prompt"]
        _save_prompts(_SAVED_PROMPTS)

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
    if team_id in ("server-monitor", "cpo-claude"):
        return {"ok": False, "error": "서버실과 CPO는 삭제할 수 없습니다."}
    before = len(TEAMS)
    TEAMS = [t for t in TEAMS if t["id"] != team_id]
    if len(TEAMS) == before:
        return {"ok": False, "error": "팀을 찾을 수 없습니다."}
    _save_teams(TEAMS)

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

    _log_activity(team_id, "🗑️ 에이전트 완전 삭제됨 (로컬+GitHub+프롬프트)")
    return {"ok": True, "team_id": team_id}


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

    # 로컬 포트 체크
    for name, port, desc in [("FastAPI", 8000, "백엔드"), ("Next.js", 3000, "프론트 Dev")]:
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


# ── 서버 실행 ─────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
# reload Sat Mar 21 02:45:11 KST 2026
