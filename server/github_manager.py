"""GitHub 레포 자동 관리 — 신규 레포 생성, 클론, teams 설정 연동"""

import os
import subprocess
from github import Github, GithubException
from dotenv import load_dotenv

load_dotenv()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_USERNAME = os.getenv("GITHUB_USERNAME", "600-g")
PROJECTS_ROOT = os.path.expanduser(os.getenv("PROJECTS_ROOT", "~/Developer/my-company"))


def get_github() -> Github:
    if not GITHUB_TOKEN:
        raise RuntimeError("GITHUB_TOKEN이 설정되지 않았습니다. server/.env를 확인하세요.")
    return Github(GITHUB_TOKEN)


def create_repo(name: str, description: str = "", private: bool = False) -> dict:
    """GitHub에 새 레포를 만들고 로컬에 클론한다."""
    g = get_github()
    user = g.get_user()

    try:
        repo = user.create_repo(
            name=name,
            description=description,
            private=private,
            auto_init=True,
        )
    except GithubException as e:
        if e.status == 422:
            return {"ok": False, "error": f"레포 '{name}'이 이미 존재합니다."}
        raise

    # 로컬 클론
    local_path = os.path.join(PROJECTS_ROOT, name)
    if not os.path.isdir(local_path):
        subprocess.run(
            ["git", "clone", repo.clone_url, local_path],
            check=True,
            capture_output=True,
        )

    return {
        "ok": True,
        "repo_url": repo.html_url,
        "local_path": local_path,
    }


def list_repos() -> list[dict]:
    """600-g 계정의 모든 public 레포 목록을 반환한다."""
    g = get_github()
    user = g.get_user()
    repos = []
    for r in user.get_repos():
        repos.append({
            "name": r.name,
            "url": r.html_url,
            "description": r.description or "",
            "private": r.private,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        })
    return repos
