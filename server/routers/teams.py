"""
팀 목록 + 순서 + 층 배치 — main.py 분할 8차 (안정화 2026-05-08).

이동:
- GET  /api/teams                       — 팀 목록 + scan_all
- GET  /api/teams/info                  — 경량 폴링용
- GET  /api/project-types               — 프로젝트 타입 목록
- PUT  /api/teams/{id}/order            — 단일 팀 순서/층
- PUT  /api/teams/reorder               — 다수 팀 일괄 순서
- GET  /api/layout/floors               — 층 배치
- GET  /api/layout/positions            — 그리드 위치
- PUT  /api/layout/positions            — 위치 저장
- PUT  /api/layout/floors               — 층 배치 업데이트

주의:
- TEAMS / FLOOR_LAYOUT 은 main.py 모듈 상태 → main as _main 으로 lazy access
- list 변경은 in-place (append/sort) — main.TEAMS 동일 객체 참조됨
- dict 재할당이 필요한 경우 _main.FLOOR_LAYOUT = ... 로 명시
"""
from __future__ import annotations

import logging
import os

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(tags=["teams"])


@router.get("/api/teams")
async def get_teams():
    """팀 목록 + 프로젝트 현황(버전, 최근 커밋일 포함) — order 순 정렬"""
    import main as _main
    from project_scanner import scan_all
    sorted_teams = sorted(_main.TEAMS, key=lambda t: t.get("order", 999))
    return scan_all(_main.PROJECTS_ROOT, sorted_teams)


@router.get("/api/teams/info")
async def get_teams_info():
    """팀 목록 + 버전/업데이트일 간략 정보 (폴링용 경량 API)"""
    import main as _main
    from project_scanner import scan_project
    result = []
    for team in sorted(_main.TEAMS, key=lambda t: t.get("order", 999)):
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


@router.get("/api/project-types")
async def get_project_types():
    """프로젝트 타입 목록 반환 (UI 선택지용)"""
    from github_manager import PROJECT_TYPES
    return [
        {"id": k, "label": v["label"], "tech": v["tech"]}
        for k, v in PROJECT_TYPES.items()
    ]


@router.put("/api/teams/{team_id}/order")
async def update_team_order(team_id: str, body: dict):
    """단일 팀의 order(순서)와 layer(층) 변경. pinned 팀은 변경 불가."""
    import main as _main
    from ws_handler import _log_activity
    team = next((t for t in _main.TEAMS if t["id"] == team_id), None)
    if not team:
        return {"ok": False, "error": "팀을 찾을 수 없습니다."}
    if team.get("pinned"):
        return {"ok": False, "error": f"{team['name']}은(는) 고정 팀이라 순서를 변경할 수 없습니다."}

    new_order = body.get("order")
    new_layer = body.get("layer")

    if new_order is not None:
        if int(new_order) < 2:
            return {"ok": False, "error": "order 0, 1은 고정 팀 전용입니다."}
        team["order"] = int(new_order)

    if new_layer is not None:
        team["layer"] = int(new_layer)

    _main._save_teams(_main.TEAMS)
    _log_activity(team_id, f"🔀 순서 변경 → order:{team['order']} layer:{team['layer']}")
    return {"ok": True, "team_id": team_id, "order": team["order"], "layer": team["layer"]}


@router.put("/api/teams/reorder")
async def reorder_teams(body: dict):
    """다수 팀 순서 일괄 변경 (드래그 앤 드롭 후 저장). pinned 팀은 무시."""
    import main as _main
    orders: list[dict] = body.get("orders", [])
    if not orders:
        return {"ok": False, "error": "orders 필드가 필요합니다."}

    team_map = {t["id"]: t for t in _main.TEAMS}
    updated = []
    for item in orders:
        tid = item.get("id", "")
        team = team_map.get(tid)
        if not team or team.get("pinned"):
            continue
        new_order = item.get("order")
        new_layer = item.get("layer")
        if new_order is not None and int(new_order) >= 2:
            team["order"] = int(new_order)
        if new_layer is not None:
            team["layer"] = int(new_layer)
        updated.append(tid)

    _main._save_teams(_main.TEAMS)
    return {"ok": True, "updated": updated}


@router.get("/api/layout/floors")
async def get_floor_layout():
    """층 배치 반환 — 각 층에 어떤 팀이 있는지 + 팀 메타 포함."""
    import main as _main
    team_map = {t["id"]: t for t in _main.TEAMS}
    floors = []
    for floor_str, team_ids in sorted(_main.FLOOR_LAYOUT.items(), key=lambda x: int(x[0])):
        teams_in_floor = []
        for tid in team_ids:
            if tid in ("cpo-claude", "server-monitor"):
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


@router.get("/api/layout/positions")
async def get_team_positions():
    """팀별 그리드 위치 반환 — 웹/모바일 동기화용"""
    import main as _main
    return {"ok": True, "positions": _main._load_positions()}


@router.put("/api/layout/positions")
async def update_team_positions(body: dict):
    """팀 위치 저장 — 프론트 드래그 후 호출."""
    import main as _main
    incoming = body.get("positions") or {}
    current = _main._load_positions()
    for tid, pos in incoming.items():
        if isinstance(pos, dict) and "gx" in pos and "gy" in pos:
            current[tid] = {
                "floor": int(pos.get("floor", 1)),
                "gx": int(pos["gx"]),
                "gy": int(pos["gy"]),
            }
    _main._save_positions(current)
    return {"ok": True, "positions": current}


@router.get("/api/teams/{team_id}/guide")
async def get_team_guide(team_id: str):
    """팀의 CLAUDE.md + 시스템프롬프트 반환 (가이드 팝업용)"""
    import main as _main
    from claude_runner import TEAM_SYSTEM_PROMPTS, DEFAULT_SYSTEM_PROMPT
    team = next((t for t in _main.TEAMS if t["id"] == team_id), None)
    if not team:
        return {"ok": False, "error": "팀을 찾을 수 없습니다."}

    local_path = os.path.expanduser(team.get("localPath", ""))
    claude_md = ""
    claude_md_path = os.path.join(local_path, "CLAUDE.md") if local_path else ""
    if claude_md_path and os.path.isfile(claude_md_path):
        with open(claude_md_path, "r", encoding="utf-8") as f:
            claude_md = f.read()

    system_prompt = TEAM_SYSTEM_PROMPTS.get(team_id, DEFAULT_SYSTEM_PROMPT)

    return {
        "ok": True,
        "team_id": team_id,
        "name": team.get("name", ""),
        "emoji": team.get("emoji", ""),
        "claude_md": claude_md,
        "system_prompt": system_prompt,
    }


@router.put("/api/teams/{team_id}/guide")
async def update_team_guide(team_id: str, body: dict):
    """팀 CLAUDE.md 수정 — 실제 파일에 저장"""
    import main as _main
    from ws_handler import _log_activity
    team = next((t for t in _main.TEAMS if t["id"] == team_id), None)
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


@router.get("/api/teams/{team_id}/evolution")
async def get_team_evolution(team_id: str):
    """팀 자가학습 히스토리 조회"""
    from pathlib import Path as _Path
    import main as _main
    evo = _main._load_evolution()
    team_evo = evo.get(team_id, {"version": "1.0", "history": []})
    team = next((t for t in _main.TEAMS if t["id"] == team_id), None)
    lessons_count = 0
    if team:
        lp = _Path(os.path.expanduser(team.get("localPath", ""))).resolve() / "lessons.md"
        if lp.exists():
            lessons_count = sum(1 for line in lp.read_text(encoding="utf-8", errors="ignore").splitlines() if line.strip().startswith("-") or line.strip().startswith("["))
    return {"ok": True, "team_id": team_id, **team_evo, "lessons_count": lessons_count}


@router.post("/api/teams/{team_id}/setup-subdomain")
async def setup_team_subdomain(team_id: str, body: dict):
    """기존 팀에 서브도메인 자동 추가 (retroactive).

    body: {"subdomain": "exam"} → exam.600g.net CNAME → 600-g.github.io
    """
    import os as _os
    import main as _main
    team = next((t for t in _main.TEAMS if t["id"] == team_id), None)
    if not team:
        return {"ok": False, "error": "팀을 찾을 수 없음"}
    sub = (body.get("subdomain") or "").strip().lower()
    if not sub:
        return {"ok": False, "error": "subdomain 필요"}

    local_path = _os.path.expanduser(team.get("localPath", ""))
    if not _os.path.isdir(local_path):
        return {"ok": False, "error": f"로컬 경로 없음: {local_path}", "stage": "local_path"}
    if not _os.path.isdir(_os.path.join(local_path, ".git")):
        return {"ok": False, "error": f"git 레포 아님: {local_path}", "stage": "local_path"}

    try:
        from cf_dns import add_subdomain, add_cname_file_to_repo
    except Exception as e:
        return {"ok": False, "error": f"cf_dns import 실패: {e}", "stage": "import"}

    dns = add_subdomain(sub)
    if not dns.get("ok"):
        return {"ok": False, "error": dns.get("error"), "stage": "dns"}

    cname = add_cname_file_to_repo(local_path, dns["full_name"])
    if not cname.get("ok"):
        return {"ok": False, "error": cname.get("error"), "stage": "cname_file", "dns": dns}

    return {
        "ok": True,
        "url": dns["url"],
        "full_name": dns["full_name"],
        "note": "SSL 발급 5분~1시간",
    }


@router.get("/api/teams/{team_id}/activity")
async def get_team_activity(team_id: str):
    """팀 최근 활동 — 커밋, 작업 상태"""
    from pathlib import Path as _Path
    import main as _main
    from ws_handler import AGENT_STATUS
    team = next((t for t in _main.TEAMS if t["id"] == team_id), None)
    if not team:
        return {"ok": False, "error": "팀 없음"}
    local = _Path(os.path.expanduser(team.get("localPath", ""))).resolve()
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
    status = AGENT_STATUS.get(team_id, {})
    return {
        "ok": True,
        "team_id": team_id,
        "commits": commits,
        "status": status.get("state", "idle"),
        "current_tool": status.get("tool"),
        "last_active": status.get("last_active"),
    }


@router.put("/api/layout/floors")
async def update_floor_layout(body: dict):
    """층 배치 업데이트 — 프론트에서 팀 드래그 후 저장 시 호출."""
    import main as _main
    new_layout: dict[str, list[str]] = body.get("layout", {})
    if not new_layout:
        return {"ok": False, "error": "layout 필드가 필요합니다"}
    valid_ids = {t["id"] for t in _main.TEAMS}
    cleaned: dict[str, list[str]] = {}
    for floor_str, ids in new_layout.items():
        filtered = [tid for tid in ids if tid in valid_ids]
        if filtered:
            cleaned[floor_str] = filtered
    _main.FLOOR_LAYOUT = cleaned
    _main._save_layout(_main.FLOOR_LAYOUT)
    return {"ok": True, "layout": _main.FLOOR_LAYOUT}
