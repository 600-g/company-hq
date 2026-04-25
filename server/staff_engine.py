"""스태프 엔진 — 두근(사용자) 1차 진입점.

모든 사용자 메시지를 받아서:
1. 직접 답할 수 있으면 → Gemini/Gemma 즉답 (Claude 토큰 0)
2. 코드/배포/디스패치 필요 → CPO에 멘션 위임 (자동 디스패치 트리거)

사용 통계 누적 (build savings dashboard).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests

from free_llm import smart_call, OLLAMA_URL, _bump

logger = logging.getLogger("staff")

# ── 사용량 통계 (영속) ────────────────────────────────
STATS_PATH = os.path.join(os.path.dirname(__file__), "staff_stats.json")


def _load_stats() -> dict:
    try:
        if os.path.exists(STATS_PATH):
            with open(STATS_PATH, encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {
        "total_handled": 0,
        "by_provider": {"gemini": 0, "gemma_e4b": 0, "gemma_main": 0, "claude_fallback": 0},
        "by_intent": {"chat": 0, "status": 0, "lookup": 0, "calc": 0, "summarize": 0, "escalate": 0},
        "by_language": {"ko": 0, "en": 0, "ja": 0, "zh": 0, "other": 0},
        "claude_tokens_saved_estimate": 0,  # 처리 건당 평균 4K 입력 + 1K 출력 = 5K saved
        "last_updated": None,
    }


def _save_stats(s: dict):
    try:
        s["last_updated"] = datetime.utcnow().isoformat()
        with open(STATS_PATH, "w", encoding="utf-8") as f:
            json.dump(s, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning("staff_stats save failed: %s", e)


def _bump_stat(provider: str, intent: str, language: str = "ko"):
    s = _load_stats()
    s["total_handled"] += 1
    s["by_provider"][provider] = s["by_provider"].get(provider, 0) + 1
    s["by_intent"][intent] = s["by_intent"].get(intent, 0) + 1
    if language not in s["by_language"]:
        language = "other"
    s["by_language"][language] += 1
    if provider != "claude_fallback":
        s["claude_tokens_saved_estimate"] += 5000  # 보수적 추정
    _save_stats(s)


def get_stats() -> dict:
    return _load_stats()


# ── 의도 분류 ─────────────────────────────────────────
ESCALATE_KEYWORDS = re.compile(
    r"\b(deploy|커밋|commit|푸시|push|@\S+|디스패치|dispatch|배포해)\b|"
    r"코드.*수정|코드.*만들|코드.*추가|리팩터|refactor|"
    r"버그.*고쳐|에러.*수정|구현해|기능.*추가|기능.*만들",
    re.IGNORECASE,
)


async def classify_intent(text: str) -> str:
    """의도 분류. chat/status/lookup/calc/summarize/escalate 중 하나 반환."""
    if ESCALATE_KEYWORDS.search(text):
        return "escalate"
    prompt = (
        f'다음 한국어 메시지의 의도 한 단어로 분류:\n"{text}"\n'
        f"옵션: chat, status, lookup, calc, summarize, escalate\n"
        f"escalate = 코드/배포/팀 협업 필요\n답:"
    )
    cat_text, _ = await smart_call("classify", prompt, max_out=20)
    cat = re.sub(r"[^a-z]", "", (cat_text or "").lower())[:20]
    if cat in ("chat", "status", "lookup", "calc", "summarize", "escalate"):
        return cat
    return "chat"  # 기본 친근 응답


# ── 즉답 핸들러 ───────────────────────────────────────
def _quick_status() -> str:
    parts = []
    try:
        out = subprocess.run(["pgrep", "-cf", "claude"], capture_output=True, text=True, timeout=2).stdout.strip()
        parts.append(f"claude {out}개")
    except Exception:
        pass
    try:
        out = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=2).stdout
        free = re.search(r"Pages free:\s+(\d+)", out)
        if free:
            free_gb = int(free.group(1)) * 4096 / 1024 / 1024 / 1024
            parts.append(f"여유메모리 {free_gb:.1f}GB")
    except Exception:
        pass
    try:
        r = requests.get(f"{OLLAMA_URL}/api/version", timeout=1)
        if r.status_code == 200:
            parts.append("ollama OK")
    except Exception:
        parts.append("ollama X")
    return " · ".join(parts) if parts else "정상 가동"


# ── 메인 처리 ─────────────────────────────────────────
async def handle(text: str, language: str = "ko") -> dict:
    """메시지 처리. 반환: {handled: bool, reply: str, intent: str, provider: str, escalate: bool}"""
    text = text.strip()
    if not text:
        return {"handled": False, "reply": "", "intent": "empty", "provider": "", "escalate": False}

    intent = await classify_intent(text)

    # CPO 위임 필요
    if intent == "escalate":
        _bump_stat("claude_fallback", "escalate", language)
        return {
            "handled": True,
            "reply": "이건 CPO에 부탁드릴게요. 잠시만요...",
            "intent": "escalate",
            "provider": "staff_relay",
            "escalate": True,
            "escalate_prompt": text,
        }

    # 시스템 상태 즉답
    if intent == "status":
        sysstat = _quick_status()
        prompt = f"시스템 현황: {sysstat}\n질문: \"{text}\"\n위 데이터로 1-2줄 한국어 친근하게 답."
        reply, provider = await smart_call("default", prompt, max_out=300)
        if reply:
            _bump_stat(provider, "status", language)
            return {"handled": True, "reply": reply.strip(), "intent": intent, "provider": provider, "escalate": False}

    # 일반 자연어 — Gemini 자유 응답
    lang_hint = {"ko": "한국어로", "en": "in English", "ja": "日本語で", "zh": "用中文"}.get(language, "한국어로")
    prompt = (
        f"두근컴퍼니 스태프(친근한 AI 비서)로서 다음 메시지에 {lang_hint} "
        f"3줄 이내로 간결하고 친절히 답하세요.\n"
        f'메시지: "{text}"'
    )
    reply, provider = await smart_call("default", prompt, max_out=500)
    if not reply or not reply.strip():
        # 무료 LLM 다 실패 → CPO 폴백
        _bump_stat("claude_fallback", "chat", language)
        return {
            "handled": True,
            "reply": "잠시 생각이 막혔네요. CPO에 패스할게요.",
            "intent": "chat",
            "provider": "claude_fallback",
            "escalate": True,
            "escalate_prompt": text,
        }

    _bump_stat(provider, intent, language)
    return {
        "handled": True,
        "reply": reply.strip(),
        "intent": intent,
        "provider": provider,
        "escalate": False,
    }
