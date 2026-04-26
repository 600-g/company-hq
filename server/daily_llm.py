"""자율 정기 작업 — Gemma 4 26B 로 매일 03:00 백그라운드 분석.

토큰 0. launchd com.doogeun.daily-llm 으로 자동 실행.

작업:
1. 어제 chat_history 패턴 분석 → FAQ 후보 추출
2. staff_stats 변화 → 절감 효과 측정
3. 시스템 로그 이상 패턴 검출
4. 결과 → server/llm_insights.json (UI 노출)
5. 중요 발견 시 텔레그램 알림
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# server/ 디렉토리 sys.path 추가 (직접 실행 가능)
SERVER_DIR = Path(__file__).parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from free_llm import call_ollama, OLLAMA_MODEL_MAIN  # type: ignore[import-untyped]

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(message)s")
logger = logging.getLogger("daily_llm")

INSIGHTS_PATH = SERVER_DIR / "llm_insights.json"
CHAT_DIR = SERVER_DIR / "chat_history"
STATS_PATH = SERVER_DIR / "staff_stats.json"
LOGS_DIR = SERVER_DIR / "logs"

TG_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TG_CHAT_ID = os.getenv("TELEGRAM_OWNER_ID", "")


def _save_insights(insights: dict) -> None:
    try:
        INSIGHTS_PATH.write_text(
            json.dumps(insights, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as e:
        logger.error("insights 저장 실패: %s", e)


def _load_yesterday_messages() -> list[dict]:
    """어제 chat_history 의 모든 user/agent 메시지 모으기."""
    yesterday = (datetime.now() - timedelta(days=1)).date()
    messages = []
    if not CHAT_DIR.exists():
        return messages
    for team_dir in CHAT_DIR.iterdir():
        if not team_dir.is_dir():
            continue
        for session_file in team_dir.glob("*.json"):
            if session_file.name.startswith("_"):
                continue
            try:
                data = json.loads(session_file.read_text(encoding="utf-8"))
                for m in data if isinstance(data, list) else []:
                    ts = m.get("ts") or m.get("timestamp")
                    if not ts:
                        continue
                    try:
                        msg_date = datetime.fromtimestamp(int(ts) / 1000).date() if isinstance(ts, (int, float)) else datetime.fromisoformat(str(ts)).date()
                    except Exception:
                        continue
                    if msg_date == yesterday:
                        messages.append({
                            "team": team_dir.name,
                            "role": m.get("type") or m.get("role"),
                            "content": (m.get("content") or "")[:500],
                            "ts": ts,
                        })
            except Exception:
                continue
    return messages


async def analyze_faq_patterns(messages: list[dict]) -> str:
    """Gemma 26B로 FAQ 패턴 추출."""
    user_msgs = [m["content"] for m in messages if m.get("role") == "user"][:50]
    if len(user_msgs) < 5:
        return "(유저 메시지 5개 미만 — 패턴 분석 스킵)"
    sample = "\n".join(f"- {m[:200]}" for m in user_msgs)
    prompt = (
        f"어제 두근컴퍼니 사용자가 보낸 메시지 {len(user_msgs)}건:\n\n{sample}\n\n"
        f"위 메시지들에서 반복되는 패턴 / 자주 묻는 질문 카테고리를 한국어로 3-5줄로 정리. "
        f"각 카테고리별 빈도 추정 + 자동화/FAQ화 제안 가능한 항목 강조."
    )
    text = await call_ollama(prompt, model=OLLAMA_MODEL_MAIN, max_out=600, timeout=120)
    return text or "(분석 실패)"


async def analyze_savings(stats: dict) -> str:
    """Gemma 26B로 토큰 절감 효과 분석."""
    prompt = (
        f"두근컴퍼니 스태프 LLM 통계 (누적):\n"
        f"- 총 처리: {stats.get('total_handled', 0)}건\n"
        f"- 무료 LLM: {stats.get('by_provider', {})}\n"
        f"- 의도별: {stats.get('by_intent', {})}\n"
        f"- 추정 절감: {stats.get('claude_tokens_saved_estimate', 0):,} 토큰\n\n"
        f"위 데이터에서 인사이트 3가지를 한국어 짧게 (각 1줄). "
        f"전반적 효과 / 주의할 패턴 / 다음 단계 추천."
    )
    text = await call_ollama(prompt, model=OLLAMA_MODEL_MAIN, max_out=400, timeout=90)
    return text or "(분석 실패)"


def _scan_log_anomalies() -> list[str]:
    """server/logs 에서 ERROR/Traceback 패턴 검출."""
    anomalies = []
    if not LOGS_DIR.exists():
        return anomalies
    cutoff = datetime.now() - timedelta(days=1)
    for log_file in LOGS_DIR.glob("*.log"):
        try:
            with log_file.open("r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if "ERROR" in line or "Traceback" in line or "CRITICAL" in line:
                        anomalies.append(f"{log_file.name}: {line.strip()[:200]}")
        except Exception:
            continue
        if len(anomalies) >= 20:
            break
    return anomalies


async def tg_notify(text: str) -> None:
    if not TG_TOKEN or not TG_CHAT_ID:
        return
    try:
        import urllib.parse
        import urllib.request
        url = f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage"
        body = urllib.parse.urlencode({
            "chat_id": TG_CHAT_ID,
            "text": text[:4000],
            "parse_mode": "HTML",
        }).encode()
        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: urllib.request.urlopen(url, data=body, timeout=10),
        )
    except Exception as e:
        logger.warning("텔레그램 실패: %s", e)


async def main():
    logger.info("=== daily_llm 시작 ===")
    insights: dict = {
        "run_at": datetime.utcnow().isoformat(),
        "model": OLLAMA_MODEL_MAIN,
    }

    # 1. 어제 메시지 분석
    msgs = _load_yesterday_messages()
    insights["yesterday_message_count"] = len(msgs)
    if msgs:
        logger.info("어제 메시지 %d건 분석", len(msgs))
        insights["faq_patterns"] = await analyze_faq_patterns(msgs)

    # 2. 절감 통계 분석
    if STATS_PATH.exists():
        try:
            stats = json.loads(STATS_PATH.read_text(encoding="utf-8"))
            insights["staff_stats_summary"] = stats
            insights["savings_analysis"] = await analyze_savings(stats)
        except Exception:
            pass

    # 3. 로그 이상 검출
    anomalies = _scan_log_anomalies()
    insights["log_anomalies_count"] = len(anomalies)
    insights["log_anomalies_sample"] = anomalies[:10]

    # 4. 저장
    _save_insights(insights)
    logger.info("=== llm_insights.json 저장 완료 ===")

    # 5. 중요 발견 시 텔레그램
    summary_lines = [
        "📊 <b>daily_llm 일일 요약</b>",
        f"어제 메시지: {len(msgs)}건",
        f"로그 이상: {len(anomalies)}건" if anomalies else "로그 정상",
    ]
    if insights.get("faq_patterns"):
        summary_lines.append("")
        summary_lines.append(f"🔁 FAQ 패턴:\n{insights['faq_patterns'][:600]}")
    if anomalies:
        summary_lines.append("")
        summary_lines.append("⚠️ 로그 샘플 (5):")
        for a in anomalies[:5]:
            summary_lines.append(f"  • {a[:150]}")
    await tg_notify("\n".join(summary_lines))


if __name__ == "__main__":
    asyncio.run(main())
