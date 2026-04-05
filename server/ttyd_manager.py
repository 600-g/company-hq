"""팀별 ttyd 웹터미널 세션 관리"""

import subprocess
import json
import signal
from pathlib import Path

TEAMS_FILE = Path(__file__).parent / "teams.json"
BASE_DIR = Path.home() / "Developer" / "my-company"
BASE_PORT = 7700  # 팀별 포트: 7700, 7701, 7702...

# 실행 중인 팀별 ttyd 프로세스
_sessions: dict[str, dict] = {}


def load_teams() -> list[dict]:
    with open(TEAMS_FILE, encoding="utf-8") as f:
        return json.load(f)


def get_team_port(team_id: str) -> int:
    teams = load_teams()
    for i, t in enumerate(teams):
        if t["id"] == team_id:
            return BASE_PORT + i
    return BASE_PORT


def get_team_dir(team_id: str) -> str:
    teams = load_teams()
    for t in teams:
        if t["id"] == team_id:
            repo = t.get("repo", t.get("github_repo", team_id))
            path = BASE_DIR / repo
            if path.exists():
                return str(path)
    return str(BASE_DIR)


def start_team_terminal(team_id: str) -> dict:
    """팀별 ttyd 세션 시작. 이미 있으면 기존 포트 반환."""
    if team_id in _sessions:
        proc = _sessions[team_id]["process"]
        if proc.poll() is None:  # 살아있음
            return {"port": _sessions[team_id]["port"], "status": "running"}

    port = get_team_port(team_id)
    team_dir = get_team_dir(team_id)

    # 팀 디렉토리에서 bash 시작하는 init 스크립트
    init_script = (
        f'cd {team_dir} && echo "✓ {team_id} 팀 디렉토리: {team_dir}" '
        f'&& echo "✓ claude 명령어로 에이전트 시작" && bash'
    )

    proc = subprocess.Popen([
        "/opt/homebrew/bin/ttyd",
        "-p", str(port),
        "-W",
        "-t", "fontSize=14",
        "-t", 'theme={"background":"#080818","foreground":"#c8c8d8","cursor":"#f5c842"}',
        "bash", "-c", init_script,
    ])

    _sessions[team_id] = {"process": proc, "port": port, "dir": team_dir}
    return {"port": port, "status": "started"}


def stop_team_terminal(team_id: str) -> None:
    if team_id in _sessions:
        proc = _sessions[team_id]["process"]
        if proc.poll() is None:
            proc.terminate()
        del _sessions[team_id]


def get_session_info(team_id: str) -> dict:
    if team_id not in _sessions:
        return {"status": "stopped"}
    proc = _sessions[team_id]["process"]
    if proc.poll() is not None:
        del _sessions[team_id]
        return {"status": "stopped"}
    return {
        "status": "running",
        "port": _sessions[team_id]["port"],
        "dir": _sessions[team_id]["dir"],
    }
