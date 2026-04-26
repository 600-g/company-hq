"""다중 LLM 토론·자가 개선 모듈.

Phase 1: 자가 비평 (Critic-Refiner)
Phase 2: 다중 시점 합의 (Multi-Perspective Consensus)
Phase 3: 자율 정기 작업 (별도 스크립트 daily_llm.py 에서 호출)

토큰 0 — Claude 미사용. 최종 결정만 Claude (호출자가 판단).
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Optional

from free_llm import smart_call, _bump

logger = logging.getLogger("multi_llm")

# ── 자가 비평 (Phase 1) ────────────────────────────────
async def self_critique(prompt: str, draft: str, *, max_chars: int = 1000) -> str:
    """초안을 비평. 문제 있으면 비평 반환, 없으면 빈 문자열."""
    if len(draft) < 40:
        return ""  # 너무 짧으면 비평 무의미 (인사 등)
    crit_prompt = (
        f"다음 답변을 비평해줘. 한국어로, 2-3줄 이내.\n"
        f"- 사실 오류 / 논리 비약\n"
        f"- 누락된 핵심\n"
        f"- 개선 가능 포인트\n"
        f"문제 없으면 정확히 'OK' 만 출력.\n\n"
        f"질문: {prompt[:500]}\n"
        f"답변: {draft[:max_chars]}"
    )
    text, _ = await smart_call("classify", crit_prompt, max_out=300)
    if not text:
        return ""
    text = text.strip()
    if text == "OK" or "문제없음" in text or "수정 사항 없" in text:
        return ""
    return text


async def refine_with_critique(prompt: str, draft: str, critique: str) -> str:
    """비평 반영한 개선 응답."""
    refine_prompt = (
        f"원본 질문: {prompt[:500]}\n\n"
        f"기존 답변: {draft[:1500]}\n\n"
        f"비평: {critique[:500]}\n\n"
        f"위 비평을 반영해 개선된 답변을 한국어로 작성. 5줄 이내."
    )
    text, provider = await smart_call("default", refine_prompt, max_out=600)
    if text and provider in ("gemini", "gemma_e4b", "gemma_main"):
        _bump(provider)
    return text or draft


async def critic_refine_loop(prompt: str, draft: str, *, max_iters: int = 1) -> tuple[str, dict]:
    """비평 + 개선 루프. 토큰 절감 위해 기본 1회만.

    반환: (final_text, meta) — meta = {iters, critiques, improved}
    """
    text = draft
    critiques = []
    improved = False
    for _ in range(max_iters):
        critique = await self_critique(prompt, text)
        if not critique:
            break
        critiques.append(critique)
        new_text = await refine_with_critique(prompt, text, critique)
        if new_text and new_text != text and len(new_text) > 10:
            text = new_text
            improved = True
        else:
            break
    return text, {"iters": len(critiques), "critiques": critiques, "improved": improved}


# ── 다중 시점 합의 (Phase 2) ──────────────────────────
DEFAULT_PERSPECTIVES = [
    {"name": "기술", "hint": "기술 관점에서 — 구현 가능성, 확장성, 의존성"},
    {"name": "사용자", "hint": "사용자 경험 관점에서 — 직관성, 학습 곡선, 만족도"},
    {"name": "비용", "hint": "비용·리소스 관점에서 — 시간, 토큰, 인프라"},
]


async def perspective_consensus(question: str, perspectives: Optional[list[dict]] = None) -> dict:
    """N개 관점에서 의견 수렴 후 종합. 토큰 0 (무료 LLM)."""
    pers = perspectives or DEFAULT_PERSPECTIVES

    async def opinion(p: dict) -> dict:
        prompt = (
            f"질문: {question[:600]}\n\n"
            f"너는 '{p['name']}' 관점의 전문가다. {p['hint']}\n"
            f"3-4줄 한국어 의견. 결론·근거 명확히."
        )
        text, provider = await smart_call("default", prompt, max_out=400)
        if text and provider != "claude_fallback":
            _bump(provider)
        return {"name": p["name"], "opinion": text or "(응답 없음)", "provider": provider}

    opinions = await asyncio.gather(*(opinion(p) for p in pers))

    # 종합
    combined = "\n\n".join(f"[{o['name']}] {o['opinion']}" for o in opinions)
    synth_prompt = (
        f"질문: {question[:600]}\n\n"
        f"전문가 {len(opinions)}명 의견:\n{combined}\n\n"
        f"위 의견 종합해서 5줄 이내 한국어로 정리. 공통점 + 핵심 권고 + 고려사항."
    )
    consensus, _ = await smart_call("summarize", synth_prompt, max_out=600)
    return {
        "question": question,
        "perspectives": opinions,
        "consensus": consensus or "(종합 실패)",
    }


# ── 복잡도 판정 (자가 개선 적용 여부) ──────────────────
COMPLEX_PATTERNS = re.compile(
    r"어떻게|왜|이유|차이|비교|장단점|영향|전략|기획|설계|아키텍처|"
    r"방법|계획|추천|판단|고민|결정|분석|평가",
    re.IGNORECASE,
)


def needs_deep_thinking(text: str) -> bool:
    """깊은 사고 필요한지 판정. 복잡 키워드 + 길이 30자+."""
    if len(text) < 30:
        return False
    return bool(COMPLEX_PATTERNS.search(text))


# ── 최종 결정 단계 (Claude 1회 호출) ──────────────────
def needs_final_claude(text: str, opinions_summary: str = "") -> bool:
    """Claude 최종 결정 필요한가? — 사용자 명시 요청 또는 코드/배포 작업."""
    final_keywords = re.compile(
        r"실제로.*만들|구현해|배포해|커밋|결정해|최종.*판단|클로드.*결정",
        re.IGNORECASE,
    )
    return bool(final_keywords.search(text + " " + opinions_summary))
