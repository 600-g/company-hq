"""오늘의 운세 문구 풀 생성기.

매일 KST 06:00 launchd `com.doogeun.saju-fortune-gen` 로 실행.
로컬 Ollama `gemma4:26b` 로 오늘 문구 60개 생성 → `saju_fortune_pool.json` 저장.
API `GET /api/saju/fortune/today` 는 이 파일에서 seed 기반 픽만 (LLM 호출 0, <10ms).

톤 원칙:
- 친구가 툭 던지는 실용 조언 (반말 살짝, 명령형 세게 X)
- 오컬트/예언/기운/색깔/신호 요소 전부 X
- 인터넷체 (ㅇㅇ, ㄹㅇ, ㅋㅋ) X, 파이팅/화이팅 X
"""
from __future__ import annotations

import json
import logging
import random
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Iterable, Sequence

import requests

logger = logging.getLogger("saju-fortune-gen")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

KST = timezone(timedelta(hours=9))
BASE_DIR = Path(__file__).parent
POOL_PATH = BASE_DIR / "saju_fortune_pool.json"
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_PRIMARY = "gemma4:26b"
MODEL_FALLBACK = "gemma4:e4b"
TARGET_COUNT = 100
BATCH_SIZE = 8

# 절대 포함하면 안 되는 어휘 (톤 파괴)
BANNED_TOKENS = (
    "기운", "신호", "오행", "별자리", "천간", "지지",
    "예언", "예감", "점괘", "신령", "부적",
    "파이팅", "화이팅", "홧팅",
    "ㅇㅇ", "ㄹㅇ", "ㅋㅋ", "ㅎㅎ", "ㅠㅠ",
    "당신", "본인",  # "너" 톤이라 "당신" 나오면 이질감
)

# 길이 컷 — 너무 짧으면 재미없고, 너무 길면 포츈쿠키 감성 깨짐
MIN_LEN = 15
MAX_LEN = 100

BULLET_RE = re.compile(r"^[\s\-*·•]+")
QUOTE_RE = re.compile(r'^["\'‘’“”「」『』]+|["\'‘’“”「」『』]+$')

TONE_RULES = """톤 규칙 (엄수):
- 반말 살짝: "~해봐 / ~일걸 / ~인 듯 / ~자 / ~맞음 / ~인 것 같아 / ~일지도" 정도
- 명령형 세게 (~해라, ~하지마) 는 피하고 친구 조언 느낌으로
- 인터넷체 (ㅇㅇ, ㄹㅇ, ㅋㅋ, ㅎㅎ) 절대 금지
- 오컬트/예언/기운/별자리/색깔/신호 요소 전면 금지
- "파이팅", "화이팅", "힘내" 같은 상투구 금지
- "당신", "본인" 같은 격식 지칭 금지 (친구니까 그런 말 안 씀)
- 길이 15~80자, 한 문장 또는 짧은 두 문장"""

# 카테고리별 프롬프트 5종 — 매 배치 랜덤 pick 해서 pool 다양성 확보.
# 각 프롬프트는 소재를 좁게 지정하고, 예시로 그 소재만 노출 → 반복 회피.

PROMPT_VARIANTS: tuple[str, ...] = (
    # A. 몸·컨디션
    """친구가 툭 던지는 실용 잔소리를 {n}개 써줘. 소재는 오늘 몸 컨디션 관리 (물 마시기, 낮잠, 스트레칭, 자세 교정, 눈 피로, 배고픔·과식, 카페인, 저녁 소화).

{tone}

같은 소재 반복하지 말고 {n}개 각기 다른 결로. 예시 (그대로 쓰지 말고 결만 참고):
- 낮잠 15분이 오늘 저녁을 살릴 거야.
- 스트레칭 안 한 지 오래됐지. 목 한 번 돌려봐.
- 지금 배고픈 거 아니라 그냥 심심한 걸지도 몰라.

{avoid}

{n}개 각 줄 시작에 - 붙이고 문구만 출력.""",

    # B. 인간관계
    """친구가 툭 던지는 인간관계 조언을 {n}개 써줘. 소재는 오늘 사람 관계 (답장 지연, 오해, 확대해석, 부탁 거절, 사과, 안부, 칭찬, 부모·가족).

{tone}

같은 상황 반복 X, {n}개 다 다른 관계 상황으로. 예시 (그대로 X, 결만 참고):
- 답장 늦는 거에 너무 의미 두지 마. 그냥 폰 안 보는 중일 거야.
- 부모님한테 오늘 한 번만 안부 톡. 별거 아니어도 좋아.
- 부탁 거절 못 해서 힘든 거면, 오늘은 한 번만 정중히 no 해봐.

{avoid}

{n}개 각 줄 시작에 - 붙이고 문구만 출력.""",

    # C. 지출·시간
    """친구가 툭 던지는 지출·시간 관리 조언을 {n}개 써줘. 소재는 오늘 씀씀이·시간 (충동구매, 3초 규칙, 배달·외식, 커피, 미룸, 우선순위, 쇼츠·SNS 시간).

{tone}

같은 소재 반복 X. 예시 (결만 참고):
- 결제하기 전에 딱 3초만 더 봐봐. 결국 안 쓰게 될지도.
- 오늘 미룬 일 하나만 지금 끝내자. 나머지는 내일 나눠도 돼.
- 배달앱 열기 전에 냉장고 한 번 열어봐. 뭐라도 있을 거야.

{avoid}

{n}개 각 줄 시작에 - 붙이고 문구만 출력.""",

    # D. 감정·자기돌봄
    """친구가 툭 던지는 감정·자기돌봄 조언을 {n}개 써줘. 소재는 오늘 마음 상태 (걱정, 후회, 서두름, 자책, 완벽주의 놓기, 힘 빼기, 결정 미루기, 비교).

{tone}

같은 감정 반복 X, {n}개 다 다른 결로. 예시 (결만 참고):
- 걱정하던 거 대부분 안 일어나. 오늘은 그냥 접어둬.
- 지나간 실수 되감기 그만. 이미 배운 걸로 치자.
- 남 SNS 보고 비교 시작하려는 거 알지. 창 닫자.

{avoid}

{n}개 각 줄 시작에 - 붙이고 문구만 출력.""",

    # E. 관찰유머·습관
    """친구가 툭 던지는 관찰 유머·습관 잔소리를 {n}개 써줘. 소재는 오늘 하루 실수 방지 (충전기, 우산, 가스불, 문 잠금, 지갑·카드, 집 나오기 5분 전, 자기 전 폰 시간, 정리 정돈).

{tone}

같은 소재 반복 X. 예시 (결만 참고):
- 집 나오기 전에 창문 한 번 더 봐. 늦으면 다행이지.
- 우산 없는 날에 꼭 소나기 오지. 폰으로 날씨 한 번만.
- 자기 전 폰 15분만 이라 해놓고 결국 1시간이야.

{avoid}

{n}개 각 줄 시작에 - 붙이고 문구만 출력.""",
)


def _build_avoid_line(seen: list[str]) -> str:
    """이미 pool에 있는 문구 중 몇 개 뽑아 '이 소재 피해' 라인 생성."""
    if not seen:
        return "이 소재는 피해: (첫 배치라 회피 대상 없음)"
    sample = random.sample(seen, min(6, len(seen)))
    joined = " / ".join(sample)
    return f"이 소재는 이미 있어서 피해: {joined}"


@dataclass(frozen=True)
class GenResult:
    items: tuple[str, ...]
    model_used: str


def _call_ollama(model: str, prompt: str, num_predict: int = 800, temperature: float = 0.95) -> str:
    resp = requests.post(
        OLLAMA_URL,
        json={
            "model": model,
            "prompt": prompt,
            "stream": False,
            "think": False,  # gemma4 는 thinking 모델 계열 — think:false 필수
            "options": {
                "temperature": temperature,
                "num_predict": num_predict,
            },
        },
        timeout=300,
    )
    resp.raise_for_status()
    return resp.json().get("response", "").strip()


def _parse_bullets(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        line = BULLET_RE.sub("", line).strip()
        line = QUOTE_RE.sub("", line).strip()
        if line:
            lines.append(line)
    return lines


def _passes_filter(line: str) -> bool:
    if not (MIN_LEN <= len(line) <= MAX_LEN):
        return False
    for banned in BANNED_TOKENS:
        if banned in line:
            return False
    # 문장 끝이 마침표/물음표/느낌표 로 안 끝나면 미완성 취급
    if not line.endswith((".", "?", "!", "야", "어", "지", "봐", "자", "음", "듯", "걸")):
        return False
    return True


def _dedup(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for it in items:
        key = re.sub(r"\s+", "", it)[:20]  # 앞 20자 기준 근사 dedup
        if key in seen:
            continue
        seen.add(key)
        out.append(it)
    return out


def generate_pool(target: int = TARGET_COUNT) -> GenResult:
    """카테고리 프롬프트 5종을 라운드로빈 + 회피 목록 progressive 로 배치 생성.

    각 라운드에서 A~E 5개 프롬프트 순서 셔플 → 카테고리 골고루.
    회피 목록은 매 배치마다 지금까지 pool 에서 6개 랜덤 발췌 → 반복 소재 회귀 방지.
    """
    collected: list[str] = []
    model_used = MODEL_PRIMARY
    attempts = 0
    max_attempts = 20

    variant_cycle: list[int] = []

    while len(collected) < target and attempts < max_attempts:
        if not variant_cycle:
            variant_cycle = list(range(len(PROMPT_VARIANTS)))
            random.shuffle(variant_cycle)
        v_idx = variant_cycle.pop()
        template = PROMPT_VARIANTS[v_idx]
        prompt = template.format(
            n=BATCH_SIZE,
            tone=TONE_RULES,
            avoid=_build_avoid_line(collected),
        )
        attempts += 1
        try:
            text = _call_ollama(model_used, prompt)
        except requests.RequestException as e:
            logger.warning("ollama call failed (attempt %d, model=%s): %s", attempts, model_used, e)
            if model_used == MODEL_PRIMARY:
                logger.info("falling back to %s", MODEL_FALLBACK)
                model_used = MODEL_FALLBACK
                continue
            time.sleep(5)
            continue

        lines = _parse_bullets(text)
        good = [ln for ln in lines if _passes_filter(ln)]
        collected.extend(good)
        collected = _dedup(collected)
        logger.info(
            "attempt %d (variant=%s): got %d/%d valid (total %d/%d)",
            attempts, "ABCDE"[v_idx], len(good), len(lines), len(collected), target,
        )

    if len(collected) < target:
        logger.warning(
            "generated only %d/%d items after %d attempts",
            len(collected), target, attempts,
        )

    random.shuffle(collected)
    return GenResult(items=tuple(collected[:target]), model_used=model_used)


def save_pool(result: GenResult) -> Path:
    now = datetime.now(KST)
    payload = {
        "generated_at": now.isoformat(),
        "date": now.date().isoformat(),
        "model": result.model_used,
        "count": len(result.items),
        "items": list(result.items),
    }
    tmp = POOL_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(POOL_PATH)
    logger.info("saved %d items to %s (model=%s)", len(result.items), POOL_PATH, result.model_used)
    return POOL_PATH


def main() -> int:
    logger.info("starting fortune pool generation (target=%d, model=%s)", TARGET_COUNT, MODEL_PRIMARY)
    result = generate_pool()
    if not result.items:
        logger.error("no items generated; keeping existing pool file if any")
        return 1
    save_pool(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
