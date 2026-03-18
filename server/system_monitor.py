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


def get_network_status() -> dict:
    """네트워크 상태 — 유선/WiFi 자동 감지, 품질 표시"""
    result = {"connected": False, "type": "unknown", "quality": "끊김"}
    try:
        # 기본 게이트웨이로 활성 인터페이스 감지
        r = subprocess.run(["route", "-n", "get", "default"],
                           capture_output=True, text=True, timeout=2)
        iface_m = re.search(r"interface:\s*(\S+)", r.stdout)
        if not iface_m:
            return result
        result["connected"] = True
        iface = iface_m.group(1)

        # 인터페이스 종류 판별 (유선/WiFi)
        r2 = subprocess.run(["networksetup", "-listallhardwareports"],
                            capture_output=True, text=True, timeout=2)
        lines = r2.stdout.splitlines()
        for i, line in enumerate(lines):
            if f"Device: {iface}" in line and i > 0:
                port = lines[i - 1]
                if "Wi-Fi" in port or "AirPort" in port:
                    result["type"] = "wifi"
                else:
                    result["type"] = "ethernet"
                break

        # 품질 판정
        if result["type"] == "ethernet":
            result["quality"] = "안정"  # 유선 = 기본 안정
        elif result["type"] == "wifi":
            try:
                r3 = subprocess.run(
                    ["/System/Library/PrivateFrameworks/Apple80211.framework"
                     "/Versions/Current/Resources/airport", "-I"],
                    capture_output=True, text=True, timeout=2)
                m = re.search(r"agrCtlRSSI:\s*(-?\d+)", r3.stdout)
                if m:
                    rssi = int(m.group(1))
                    if rssi > -50:   result["quality"] = "안정"
                    elif rssi > -70: result["quality"] = "보통"
                    else:            result["quality"] = "불안"
                else:
                    result["quality"] = "보통"
            except Exception:
                result["quality"] = "보통"
        else:
            result["quality"] = "안정"
    except Exception:
        pass
    return result


def get_all() -> dict:
    return {
        "cpu": get_cpu_percent(),
        "memory": get_memory_percent(),
        "disk": get_disk_percent(),
        "network": get_network_status(),
    }
