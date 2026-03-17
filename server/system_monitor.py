"""시스템 리소스 모니터 — CPU / 메모리 / 디스크"""

import shutil
import subprocess
import re


def get_cpu_percent() -> float:
    try:
        import psutil
        return round(psutil.cpu_percent(interval=0.1), 1)
    except ImportError:
        pass
    try:
        r = subprocess.run(["top", "-l", "1", "-s", "0"], capture_output=True, text=True, timeout=3)
        m = re.search(r"(\d+\.?\d*)%\s+idle", r.stdout)
        if m:
            return round(100 - float(m.group(1)), 1)
    except Exception:
        pass
    return 0.0


def get_memory_percent() -> float:
    try:
        import psutil
        return round(psutil.virtual_memory().percent, 1)
    except ImportError:
        pass
    try:
        r = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=3)
        stats = {}
        for line in r.stdout.splitlines():
            m = re.match(r"(.+?):\s+(\d+)", line)
            if m:
                stats[m.group(1).strip()] = int(m.group(2))
        page = 16384  # 16KB per page on Apple Silicon
        free  = stats.get("Pages free", 0) * page
        wired = stats.get("Pages wired down", 0) * page
        actv  = stats.get("Pages active", 0) * page
        inactv= stats.get("Pages inactive", 0) * page
        total = free + wired + actv + inactv
        if total:
            return round((wired + actv) / total * 100, 1)
    except Exception:
        pass
    return 0.0


def get_disk_percent(path: str = "/") -> float:
    try:
        u = shutil.disk_usage(path)
        return round(u.used / u.total * 100, 1)
    except Exception:
        return 0.0


def get_process_stats(pid: int) -> dict | None:
    """특정 PID의 CPU/메모리 사용량"""
    try:
        import psutil
        p = psutil.Process(pid)
        return {
            "cpu": round(p.cpu_percent(interval=0.1), 1),
            "memory_mb": round(p.memory_info().rss / 1024 / 1024, 1),
        }
    except Exception:
        return None


def get_all() -> dict:
    return {
        "cpu": get_cpu_percent(),
        "memory": get_memory_percent(),
        "disk": get_disk_percent(),
    }
