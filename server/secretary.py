"""전담 비서 LLM — CPO 채팅 1차 처리. Claude 토큰 절감.

분류 → 즉답 가능하면 Gemini/Gemma로 응답, 복잡하면 Claude로 패스.
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

from free_llm import smart_call, OLLAMA_URL

logger = logging.getLogger("secretary")

# ── 즉답 가능 카테고리 ─────────────────────────────────
INSTANT_CATEGORIES = {"status", "calc", "lookup", "greeting", "summarize", "confirm"}

# 명백한 코드/배포 작업만 Claude로 직행 (다른 자연어는 LLM이 의도 파악)
SKIP_KEYWORDS = re.compile(
    r"\b(deploy|커밋|commit|푸시|push|@\S+|디스패치|dispatch)\b|"
    r"코드.*수정|코드.*만들|배포해|리팩터|refactor|"
    r"버그.*고쳐|에러.*수정|실제로.*만들",
    re.IGNORECASE,
)

# 즉답 키워드 (복잡 키워드 없을 때만 매칭) — 바로 분류 스킵하고 처리
GREETING_PATTERN = re.compile(
    r"^(안녕|hello|hi|반가워|좋은\s*아침|좋은\s*저녁|굿모닝|굿나잇)[\s!?.~]*$",
    re.IGNORECASE,
)
STATUS_PATTERN = re.compile(
    r"(상태|현황|괜찮|정상|살아|작동|뭐\s*해|뭐하|어떻게.*돼|status)\s*[?？!]*$",
    re.IGNORECASE,
)


# ── 시스템 상태 조회 (FastAPI 내부 데이터) ─────────────
def _quick_status() -> str:
    """현재 시스템 상태 한줄 요약 — Claude 0 토큰."""
    parts = []
    try:
        # Claude 프로세스 수
        out = subprocess.run(
            ["pgrep", "-cf", "claude"], capture_output=True, text=True, timeout=2,
        ).stdout.strip()
        parts.append(f"claude {out}개")
    except Exception:
        pass
    try:
        # 메모리 여유 (vm_stat)
        out = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=2).stdout
        free = re.search(r"Pages free:\s+(\d+)", out)
        if free:
            free_gb = int(free.group(1)) * 4096 / 1024 / 1024 / 1024
            parts.append(f"여유메모리 {free_gb:.1f}GB")
    except Exception:
        pass
    try:
        # Ollama 상태
        r = requests.get(f"{OLLAMA_URL}/api/version", timeout=1)
        if r.status_code == 200:
            parts.append("ollama OK")
    except Exception:
        parts.append("ollama X")
    return " · ".join(parts) if parts else "정상"


# ── 메인 진입점 ────────────────────────────────────────
async def try_secretary(user_input: str, max_classify_chars: int = 200) -> Optional[str]:
    """즉답 가능하면 응답 텍스트 반환, 아니면 None (Claude로 패스).

    무료 LLM(Gemini → Gemma) 사용. Claude 토큰 0.
    """
    text = user_input.strip()
    if not text:
        return None

    # 1. 빠른 키워드 검사 — 명백한 복잡 작업은 패스
    if SKIP_KEYWORDS.search(text):
        return None

    # 2. 길이 제한 — 200자 넘으면 복잡 작업으로 간주
    if len(text) > max_classify_chars:
        return None

    # 3. 패턴 즉답 (LLM 안 거치고 즉시 응답)
    if GREETING_PATTERN.match(text):
        return _greeting_reply()
    if STATUS_PATTERN.search(text):
        status = _quick_status()
        return f"✅ {status}"

    # 4. LLM 분류 (Gemini Flash, 짧은 프롬프트)
    classify_prompt = (
        f"다음 사용자 메시지를 분류하세요. 한 단어만 출력.\n"
        f'메시지: "{text}"\n'
        f"카테고리:\n"
        f"- chat: 인사/잡담/짧은 응답 (즉답 가능)\n"
        f"- status: 상태/현황 조회 (지금 뭐해 등)\n"
        f"- calc: 계산/변환\n"
        f"- lookup: 기록/이력 조회 (어제 뭐 했어)\n"
        f"- summarize: 요약 부탁\n"
        f"- confirm: 확인 (됐어, 올렸어)\n"
        f"- complex: 그 외 — 코드/배포/판단 (Claude 필요)\n"
        f"답: 단어 하나만"
    )
    cat_text, _provider = await smart_call("classify", classify_prompt, max_out=20)
    cat = re.sub(r"[^a-z]", "", cat_text.lower().strip())[:20] if cat_text else "complex"

    if cat not in INSTANT_CATEGORIES and cat != "chat":
        return None  # Claude로 패스

    # 5. 카테고리별 즉답 생성
    reply_prompt = (
        f"두근컴퍼니 CPO 비서로서 다음 메시지에 한국어로 친근하게 답하세요. "
        f"1-3줄, 간결하게. 모르는 건 모른다고.\n"
        f'메시지: "{text}"'
    )
    if cat == "status":
        sysstat = _quick_status()
        reply_prompt = (
            f"시스템 현황: {sysstat}\n"
            f'사용자 질문: "{text}"\n'
            f"위 현황 기반으로 1-2줄 한국어 답변. 친근하게."
        )
    elif cat == "summarize":
        reply_prompt = (
            f'사용자가 요약을 부탁했습니다: "{text}"\n'
            f"하지만 비서는 즉답만 처리하므로, 1줄로 다음을 안내: "
            f'"요약 작업은 CPO가 직접 처리합니다. 자세히 말씀해 주시면 디스패치하겠습니다."'
        )

    reply, provider = await smart_call("default", reply_prompt, max_out=400)
    if not reply or not reply.strip():
        return None  # 응답 실패 → Claude로 패스
    logger.info("[secretary] 즉답 (%s, cat=%s, %d자)", provider, cat, len(reply))
    return f"🤖 비서: {reply.strip()}"


def _greeting_reply() -> str:
    """인사 응답 — 시간대 기반."""
    h = datetime.now().hour
    if 5 <= h < 12:
        tod = "좋은 아침"
    elif 12 <= h < 18:
        tod = "안녕하세요"
    elif 18 <= h < 22:
        tod = "좋은 저녁"
    else:
        tod = "늦은 시간"
    return f"🤖 비서: {tod}이에요. 두근컴퍼니 가동 중입니다. 시킬 일 있으세요?"
