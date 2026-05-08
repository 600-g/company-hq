"""
admin 운영 엔드포인트 — main.py 분할 2차 (안정화 2026-05-08).

이동 항목:
- /api/admin/git-head           — production 미반영 커밋 감지
- /api/admin/deploy             — 무중단 배포 트리거 (백그라운드 deploy.sh)
- /api/admin/deploy/status      — 진행률 폴링
- /api/admin/memory/status      — vm_stat + 앱 RSS 분류
- /api/admin/memory/optimize    — 안전 화이트리스트 외부 앱 graceful quit

상태:
- _DEPLOY_STATE / _DEPLOY_LOCK 모듈 내부 상태 (단일 동시 배포 보장)
- main.py 와 결합도 0 (subprocess + asyncio 만 의존)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re as _re
import subprocess
import time

from fastapi import APIRouter, BackgroundTasks

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])

_HQ_ROOT = os.path.expanduser("~/Developer/my-company/company-hq")

# ── 배포 상태 ──────────────────────────────────────────────────────
_DEPLOY_STATE: dict = {
    "running": False,
    "started_at": None,
    "log_tail": [],
    "last_result": None,
    "error": None,
}
_DEPLOY_LOCK = asyncio.Lock()


def _git_head_info() -> dict:
    """현재 main 브랜치 HEAD commit + subject + 적용 시 부여될 version 숫자."""
    try:
        sha = subprocess.run(
            ["git", "log", "-1", "--format=%h"],
            cwd=_HQ_ROOT, capture_output=True, text=True, timeout=3,
        ).stdout.strip()
        subject = subprocess.run(
            ["git", "log", "-1", "--format=%s"],
            cwd=_HQ_ROOT, capture_output=True, text=True, timeout=3,
        ).stdout.strip()
        ts = subprocess.run(
            ["git", "log", "-1", "--format=%ct"],
            cwd=_HQ_ROOT, capture_output=True, text=True, timeout=3,
        ).stdout.strip()
        count_raw = subprocess.run(
            ["git", "rev-list", "--count", "HEAD"],
            cwd=_HQ_ROOT, capture_output=True, text=True, timeout=3,
        ).stdout.strip()
        total = int(count_raw) if count_raw.isdigit() else 0
        next_version = f"4.{total // 10}.{total % 10}"
        return {
            "ok": True,
            "commit": sha,
            "subject": subject[:200],
            "commit_ts": int(ts) if ts.isdigit() else 0,
            "next_version": next_version,
            "total_commits": total,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/git-head")
async def admin_git_head():
    """현재 git HEAD — VersionBanner 가 production build 와 비교해 미반영 변경 감지."""
    return _git_head_info()


# ── 무중단 배포 ────────────────────────────────────────────────────

@router.get("/deploy/status")
async def admin_deploy_status():
    """진행 중 배포 + 마지막 결과 + 최근 로그 (사용자가 적용 클릭 후 진행률 폴링)."""
    return {
        "ok": True,
        "running": _DEPLOY_STATE["running"],
        "started_at": _DEPLOY_STATE["started_at"],
        "log_tail": _DEPLOY_STATE["log_tail"][-20:],
        "last_result": _DEPLOY_STATE["last_result"],
        "error": _DEPLOY_STATE["error"],
    }


async def _run_deploy_bg() -> None:
    """백그라운드 배포 작업 — bash deploy.sh 실행 + 로그 캡처."""
    _DEPLOY_STATE["running"] = True
    _DEPLOY_STATE["started_at"] = int(time.time())
    _DEPLOY_STATE["log_tail"] = []
    _DEPLOY_STATE["error"] = None

    try:
        proc = await asyncio.create_subprocess_exec(
            "bash", os.path.join(_HQ_ROOT, "deploy.sh"),
            cwd=_HQ_ROOT,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env={**os.environ, "PATH": "/opt/homebrew/bin:/usr/local/bin:" + os.environ.get("PATH", "")},
        )
        assert proc.stdout is not None
        async for line in proc.stdout:
            decoded = line.decode("utf-8", errors="replace").rstrip()
            if decoded:
                _DEPLOY_STATE["log_tail"].append(decoded)
                if len(_DEPLOY_STATE["log_tail"]) > 200:
                    _DEPLOY_STATE["log_tail"] = _DEPLOY_STATE["log_tail"][-200:]

        rc = await proc.wait()
        if rc == 0:
            try:
                vpath = os.path.join(_HQ_ROOT, "doogeun-hq", "out", "version.json")
                if os.path.exists(vpath):
                    with open(vpath, encoding="utf-8") as f:
                        _DEPLOY_STATE["last_result"] = json.load(f)
            except Exception:
                _DEPLOY_STATE["last_result"] = {"ok": True}
        else:
            _DEPLOY_STATE["error"] = f"deploy.sh exit code {rc}"
    except Exception as e:
        _DEPLOY_STATE["error"] = str(e)
    finally:
        _DEPLOY_STATE["running"] = False


@router.post("/deploy")
async def admin_deploy_trigger(background_tasks: BackgroundTasks):
    """사용자 [적용] 클릭 — 백그라운드로 deploy.sh 실행. 즉시 반환, 진행은 status 폴링."""
    if _DEPLOY_LOCK.locked() or _DEPLOY_STATE["running"]:
        return {"ok": False, "error": "이미 배포 진행 중", "running": True}

    async def _run():
        async with _DEPLOY_LOCK:
            await _run_deploy_bg()

    background_tasks.add_task(_run)
    return {"ok": True, "started": True}


# ── 메모리 최적화 ──────────────────────────────────────────────────

# 절대 종료 금지 — 우리 시스템 + macOS 코어
_PROTECTED_APP_KEYWORDS = {
    "Claude", "claude", "Python", "python", "uvicorn", "ollama", "cloudflared",
    "Terminal", "iTerm", "iTerm2", "bash", "zsh", "Finder",
    "WindowServer", "kernel_task", "launchd", "loginwindow", "Dock",
    "Spotlight", "SystemUIServer", "ControlCenter", "NotificationCenter",
    "ps", "top", "Activity Monitor",
    "company-hq", "doogeun", "coinbot", "trading",
}

# 종료 가능 화이트리스트 (사용자 일반 앱)
_TERMINATABLE_APP_KEYWORDS = {
    "Google Chrome", "Chrome", "Whale", "Safari", "Firefox", "Edge", "Brave",
    "Steam", "Slack", "Discord", "Spotify", "Music", "Photos", "Notion",
    "Figma", "Code", "VSCode", "Mail", "Calendar", "Notes", "Reminders",
    "Sketch", "Photoshop", "Illustrator", "Zoom", "Teams",
}


def _categorize_app(name: str) -> str:
    """protected / terminable / other 분류."""
    for k in _PROTECTED_APP_KEYWORDS:
        if k.lower() in name.lower():
            return "protected"
    for k in _TERMINATABLE_APP_KEYWORDS:
        if k.lower() in name.lower():
            return "terminable"
    return "other"


def _list_app_processes(min_rss_mb: float = 30.0) -> list[dict]:
    """RSS 30MB 이상 프로세스를 앱 단위로 집계."""
    try:
        result = subprocess.run(
            ["ps", "axo", "pid,rss,comm"],
            capture_output=True, text=True, timeout=5,
        )
        apps: dict[str, dict] = {}
        for line in result.stdout.strip().split("\n")[1:]:
            parts = line.split(None, 2)
            if len(parts) < 3:
                continue
            try:
                pid = int(parts[0])
                rss_mb = int(parts[1]) / 1024
            except ValueError:
                continue
            comm = parts[2].strip()
            app_name = comm
            if ".app/" in comm:
                seg = comm.split(".app/")[0]
                app_name = seg.split("/")[-1]
            elif "/" in comm:
                app_name = comm.split("/")[-1]
            if app_name in apps:
                apps[app_name]["rss_mb"] += rss_mb
                apps[app_name]["pids"].append(pid)
            else:
                apps[app_name] = {
                    "name": app_name,
                    "rss_mb": rss_mb,
                    "pids": [pid],
                }
        out = []
        for a in apps.values():
            if a["rss_mb"] < min_rss_mb:
                continue
            out.append({
                "name": a["name"],
                "rss_mb": round(a["rss_mb"], 1),
                "pids": a["pids"][:10],
                "category": _categorize_app(a["name"]),
            })
        out.sort(key=lambda x: -x["rss_mb"])
        return out
    except Exception as e:
        logger.warning("[memory] ps 실패: %s", e)
        return []


def _read_vm_stats() -> dict:
    """vm_stat + sysctl 로 시스템 메모리 + 스왑."""
    try:
        vm = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=3).stdout
        page_size = 16384  # Apple Silicon
        free = active = inactive = wired = compressed = 0
        for line in vm.split("\n"):
            if ":" not in line:
                continue
            label, val = line.split(":", 1)
            try:
                num = int(val.strip().rstrip("."))
            except Exception:
                continue
            if "Pages free" in label: free = num
            elif "Pages active" in label: active = num
            elif "Pages inactive" in label: inactive = num
            elif "Pages wired down" in label: wired = num
            elif "Pages occupied by compressor" in label: compressed = num
        used_bytes = (active + wired + compressed) * page_size
        free_bytes = (free + inactive) * page_size
        swap_out = subprocess.run(["sysctl", "vm.swapusage"], capture_output=True, text=True, timeout=3).stdout
        m = _re.search(r"used\s*=\s*([\d.]+)M", swap_out)
        swap_mb = float(m.group(1)) if m else 0
        return {
            "used_mb": round(used_bytes / 1024 / 1024, 1),
            "free_mb": round(free_bytes / 1024 / 1024, 1),
            "total_mb": round((used_bytes + free_bytes) / 1024 / 1024, 1),
            "swap_used_mb": round(swap_mb, 1),
        }
    except Exception as e:
        logger.warning("[memory] vm_stat 실패: %s", e)
        return {"error": str(e)}


@router.get("/memory/status")
async def admin_memory_status():
    """현재 메모리 + 분류된 앱 RSS 리스트."""
    return {
        "ok": True,
        "system": _read_vm_stats(),
        "apps": _list_app_processes(),
    }


@router.post("/memory/optimize")
async def admin_memory_optimize(body: dict):
    """body: {names: [...앱 이름]} — 안전 화이트리스트 통과한 앱만 graceful quit."""
    names = body.get("names", [])
    if not isinstance(names, list):
        return {"ok": False, "error": "names 배열 필요"}

    before = _read_vm_stats()
    killed: list[dict] = []
    skipped: list[dict] = []
    for name in names:
        cat = _categorize_app(name)
        if cat == "protected":
            skipped.append({"name": name, "reason": "보호된 시스템 앱"})
            continue
        try:
            proc = subprocess.run(
                ["osascript", "-e", f'tell application "{name}" to quit'],
                capture_output=True, text=True, timeout=10,
            )
            killed.append({
                "name": name,
                "method": "applescript_quit",
                "ok": proc.returncode == 0,
                "stderr": proc.stderr.strip()[:120] if proc.stderr else "",
            })
        except Exception as e:
            killed.append({"name": name, "method": "failed", "error": str(e)[:120]})

    await asyncio.sleep(5)
    after = _read_vm_stats()
    freed = (before.get("used_mb", 0) - after.get("used_mb", 0)) if before and after else 0
    return {
        "ok": True,
        "killed": killed,
        "skipped": skipped,
        "before": before,
        "after": after,
        "freed_mb": round(freed, 1),
    }
