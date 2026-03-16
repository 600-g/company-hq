"""프로젝트 현황 스캐너 — 각 팀 레포의 최근 커밋, 상태 등을 수집"""

import os
from datetime import datetime, timezone
from git import Repo, InvalidGitRepositoryError


def scan_project(local_path: str) -> dict:
    """로컬 git 레포의 현황을 딕셔너리로 반환한다."""
    path = os.path.expanduser(local_path)

    info = {
        "path": path,
        "exists": os.path.isdir(path),
        "last_commit": None,
        "last_commit_date": None,
        "branch": None,
        "dirty": False,
        "commit_count_30d": 0,
    }

    if not info["exists"]:
        return info

    try:
        repo = Repo(path)
    except InvalidGitRepositoryError:
        return info

    if repo.head.is_detached:
        info["branch"] = "(detached)"
    else:
        info["branch"] = repo.active_branch.name

    info["dirty"] = repo.is_dirty(untracked_files=True)

    try:
        last = repo.head.commit
        info["last_commit"] = last.message.strip()
        info["last_commit_date"] = last.committed_datetime.isoformat()

        # 최근 30일 커밋 수
        since = datetime.now(timezone.utc).timestamp() - (30 * 86400)
        count = 0
        for c in repo.iter_commits(max_count=200):
            if c.committed_date >= since:
                count += 1
            else:
                break
        info["commit_count_30d"] = count
    except Exception:
        pass

    return info


def scan_all(projects_root: str, teams: list[dict]) -> list[dict]:
    """모든 팀의 프로젝트를 스캔해서 결과 리스트를 반환한다."""
    results = []
    for team in teams:
        local_path = team.get("localPath", "")
        if not local_path:
            local_path = os.path.join(projects_root, team.get("repo", ""))
        scan = scan_project(local_path)
        results.append({**team, "scan": scan})
    return results
