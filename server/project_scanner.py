"""프로젝트 현황 스캐너 — 각 팀 레포의 최근 커밋, 상태, 버전 등을 수집

FD 누수 방지: GitPython 대신 subprocess로 git 명령 직접 실행
"""

import os
import re
import subprocess
from datetime import datetime, timezone


def _parse_claude_md_version(local_path: str) -> dict:
    """CLAUDE.md에서 버전과 업데이트 날짜를 파싱한다."""
    result = {"version": None, "updated": None}
    claude_md = os.path.join(local_path, "CLAUDE.md")
    if not os.path.isfile(claude_md):
        return result
    try:
        with open(claude_md, "r", encoding="utf-8") as f:
            head = f.read(2000)
        m = re.search(r"버전:\s*(v[\d.]+)", head)
        if m:
            result["version"] = m.group(1)
        m = re.search(r"업데이트:\s*(\d{4}-\d{2}-\d{2})", head)
        if m:
            result["updated"] = m.group(1)
    except Exception:
        pass
    return result


def _git(path: str, *args, timeout: int = 5) -> str:
    """git 명령 실행 — subprocess로 FD 누수 없이"""
    try:
        r = subprocess.run(
            ["git", *args],
            capture_output=True, text=True, cwd=path, timeout=timeout,
        )
        return r.stdout.strip()
    except Exception:
        return ""


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
        "version": None,
        "version_updated": None,
    }

    if not info["exists"]:
        return info

    if not os.path.isdir(os.path.join(path, ".git")):
        return info

    # 브랜치
    branch = _git(path, "rev-parse", "--abbrev-ref", "HEAD")
    info["branch"] = branch or "(detached)"

    # dirty 체크 (빠르게)
    status = _git(path, "status", "--porcelain", "--short")
    info["dirty"] = bool(status)

    # 최근 커밋
    log = _git(path, "log", "-1", "--format=%s|%aI")
    if "|" in log:
        parts = log.split("|", 1)
        info["last_commit"] = parts[0]
        info["last_commit_date"] = parts[1]

    # 최근 30일 커밋 수
    since = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    count_str = _git(path, "rev-list", "--count", "--since=30 days ago", "HEAD")
    try:
        info["commit_count_30d"] = int(count_str)
    except ValueError:
        pass

    # CLAUDE.md 버전 파싱
    ver = _parse_claude_md_version(path)
    info["version"] = ver["version"]
    info["version_updated"] = ver["updated"]

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
