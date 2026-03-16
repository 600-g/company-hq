"""AI Company 본부 — FastAPI 메인 서버 (포트 8000)"""

import os
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from ws_handler import handle_chat
from project_scanner import scan_all
from github_manager import create_repo, list_repos

load_dotenv()

PROJECTS_ROOT = os.path.expanduser(os.getenv("PROJECTS_ROOT", "~/Developer/my-company"))

# 팀 목록 (teams.ts와 동기화)
TEAMS = [
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


# ── REST API ──────────────────────────────────────────

@app.get("/api/teams")
async def get_teams():
    """팀 목록 + 프로젝트 현황 반환"""
    return scan_all(PROJECTS_ROOT, TEAMS)


@app.post("/api/teams")
async def add_team(body: dict):
    """신규 팀 추가: GitHub 레포 생성 + 로컬 클론 + 팀 목록에 등록"""
    name = body.get("name", "").strip()
    repo_name = body.get("repo", name).strip()
    emoji = body.get("emoji", "🆕")
    description = body.get("description", "")

    if not name or not repo_name:
        return {"ok": False, "error": "name과 repo는 필수입니다."}

    result = create_repo(repo_name, description)
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

    return {"ok": True, "team": new_team, "repo_url": result["repo_url"]}


@app.get("/api/repos")
async def get_repos():
    """GitHub 레포 목록"""
    return list_repos()


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
