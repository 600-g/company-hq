"""무료 LLM 통합 (Gemini Flash + Ollama Gemma 4) — Claude 토큰 절감용.

작업 종류별 라우팅:
- 라우팅/분류/요약 → Gemini 2.5 Flash 우선 (한도 분15/일1500)
- 한도 초과 시 → Gemma 4 26B 로컬 (무한)
- 모두 실패 시 → Claude haiku 폴백
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Optional

import requests

logger = logging.getLogger("free_llm")

# ── 설정 ─────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL_FAST = "gemma4:e4b"     # 임베딩/분류/즉답 (3GB)
OLLAMA_MODEL_MAIN = "gemma4:26b"     # 비서/요약/QA (14GB)


# ── Gemini 호출 ───────────────────────────────────────
async def call_gemini(prompt: str, max_out: int = 800, timeout: int = 30) -> Optional[str]:
    """Gemini 2.5 Flash 호출. 실패 시 None."""
    if not GEMINI_API_KEY:
        return None
    try:
        loop = asyncio.get_event_loop()
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "maxOutputTokens": max_out,
                "temperature": 0.3,
                "thinkingConfig": {"thinkingBudget": 0},  # thinking 끄기 (무료한도 보호)
            },
        }
        resp = await loop.run_in_executor(
            None,
            lambda: requests.post(
                f"{GEMINI_URL}?key={GEMINI_API_KEY}",
                json=body, timeout=timeout,
            ),
        )
        if resp.status_code != 200:
            logger.warning("[gemini] HTTP %d: %s", resp.status_code, resp.text[:200])
            return None
        data = resp.json()
        if "candidates" not in data:
            logger.warning("[gemini] no candidates: %s", str(data)[:200])
            return None
        text = data["candidates"][0]["content"]["parts"][0].get("text", "")
        logger.info("[gemini] %d자 응답", len(text))
        return text
    except Exception as e:
        logger.warning("[gemini] 실패: %s", e)
        return None


# ── Ollama 호출 (Gemma 4) ────────────────────────────
async def call_ollama(prompt: str, model: str = OLLAMA_MODEL_FAST, max_out: int = 800, timeout: int = 60) -> Optional[str]:
    """Ollama 로컬 모델 호출. 실패 시 None."""
    try:
        loop = asyncio.get_event_loop()
        body = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"num_predict": max_out, "temperature": 0.3},
        }
        resp = await loop.run_in_executor(
            None,
            lambda: requests.post(f"{OLLAMA_URL}/api/generate", json=body, timeout=timeout),
        )
        if resp.status_code != 200:
            logger.warning("[ollama:%s] HTTP %d: %s", model, resp.status_code, resp.text[:200])
            return None
        data = resp.json()
        text = data.get("response", "")
        logger.info("[ollama:%s] %d자 응답", model, len(text))
        return text
    except Exception as e:
        logger.warning("[ollama:%s] 실패: %s", model, e)
        return None


# ── 라우터 (작업별 우선순위 chain) ──────────────────
ROUTING_CHAINS = {
    "routing":   ["gemini", "gemma_e4b", "claude"],   # CPO 라우팅 — 짧고 정확
    "classify":  ["gemma_e4b", "gemini", "claude"],   # 로컬 우선 (저비용)
    "refine":    ["gemini", "gemma_e4b", "claude"],   # 요청 정제
    "summarize": ["gemini", "gemma_main", "claude"],  # 요약
    "introduce": ["gemini", "gemma_main", "claude"],  # 자기소개
    "default":   ["gemini", "gemma_main", "claude"],
}


async def smart_call(task_type: str, prompt: str, max_out: int = 800) -> tuple[str, str]:
    """작업 종류별 자동 라우팅. 반환: (응답, 사용_provider).

    실패 시 Claude haiku 폴백 (호출자가 처리).
    """
    chain = ROUTING_CHAINS.get(task_type, ROUTING_CHAINS["default"])
    for provider in chain:
        if provider == "gemini":
            text = await call_gemini(prompt, max_out=max_out)
            if text is not None and text.strip():
                return text, "gemini"
        elif provider == "gemma_e4b":
            text = await call_ollama(prompt, model=OLLAMA_MODEL_FAST, max_out=max_out)
            if text is not None and text.strip():
                return text, "gemma_e4b"
        elif provider == "gemma_main":
            text = await call_ollama(prompt, model=OLLAMA_MODEL_MAIN, max_out=max_out)
            if text is not None and text.strip():
                return text, "gemma_main"
        elif provider == "claude":
            # 호출자가 run_claude_light 직접 호출 (이 모듈은 무료 LLM 전용)
            return "", "claude_fallback"
    return "", "all_failed"


# ── 사용량 카운터 (선택, /api/budget 통합용) ────────
USAGE_COUNT = {"gemini": 0, "gemma_e4b": 0, "gemma_main": 0, "claude_fallback": 0}


def get_usage() -> dict:
    return dict(USAGE_COUNT)


def _bump(provider: str):
    USAGE_COUNT[provider] = USAGE_COUNT.get(provider, 0) + 1
