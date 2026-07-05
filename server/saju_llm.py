"""사주 풀이 LLM 클라이언트.

폴백 체인:
1) Claude Max (Sonnet 4.6) — Claude Code CLI subprocess. Max 토큰 소비. 30~60초.
2) Gemini 2.5 Flash — 무료, thinkingBudget:0 필수. 한도 시 fail.
3) qwen2.5:7b — Ollama 로컬, 3~4분. 후처리 normalize 로 양식 강제.
4) gemma4:e4b — 최후 빠른 보루.
"""
import json
import logging
import os
import re
import subprocess
import time

import requests

from saju_prompts import SYSTEM_PROMPT, build_user_message, build_intro

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
)
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
CLAUDE_MAX_MODEL = "sonnet"  # 사용자 Max 플랜 활용. opus 는 비용 8배라 오버킬.

# 12개 표준 항목 X — 6개로 변경 (골든 견본 기준).
STANDARD_HEADERS = (
    "1. 타고난 성격과 그릇",
    "2. 평생 운의 큰 흐름",
    "3. 돈과 일",
    "4. 사랑과 결혼",
    "5. 건강과 사람 관계",
    "6. 마지막으로 드리는 말씀",
)
MIN_HEADERS = 5
MISSING_PLACEHOLDER = "(이 부분은 이번 풀이에서 빠졌어요. 새로 청해주시면 다시 채워드릴게요.)"


def _count_headers(text: str) -> int:
    n = 0
    for line in text.splitlines():
        m = re.match(r"^##\s+(\d+)\.\s", line)
        if m and 1 <= int(m.group(1)) <= 6:
            n += 1
    return n


_HR_LINE = re.compile(r"^[\s>]*(?:[-—–=*_·•]\s*){3,}\s*$")
_TABLE_LINE = re.compile(r"^\s*\|.*\|\s*$")
_TABLE_SEP = re.compile(r"^\s*\|?\s*:?-{2,}:?(?:\s*\|\s*:?-{2,}:?)+\s*\|?\s*$")
_BOX_DRAW = re.compile(r"[┌┐└┘├┤┬┴┼─━│┃═║╔╗╚╝╠╣╦╩╬]+")

# LLM 이 자주 흘리는 한국어 띄어쓰기/오타 패턴
_TYPO_FIXES: list[tuple[re.Pattern, str]] = [
    # 돈을/돈은/돈이 + 좇/쫓 (띄어쓰기 누락)
    (re.compile(r"돈([을은이])(좇|쫓)"), r"돈\1 \2"),
    # 일반 명사+조사+동사 패턴 일부 (자주 등장)
    (re.compile(r"기회([을를이가는도])(좇|쫓|찾|잡)"), r"기회\1 \2"),
    (re.compile(r"꿈([을은이를])(좇|쫓)"), r"꿈\1 \2"),
    # ~로 부터/~에 게/~으로 부터 등 잘못된 분리
    (re.compile(r"으로 부터"), "으로부터"),
    (re.compile(r"에 게서"), "에게서"),
    # 중복 공백
    (re.compile(r"[ \t]{2,}"), " "),
    # 문장 부호 앞 공백
    (re.compile(r"\s+([,.!?。、])"), r"\1"),
    # 마침표 뒤 공백 보장 (한글-마침표-한글)
    (re.compile(r"([가-힣])\.([가-힣])"), r"\1. \2"),
    # **굵게** 안 띄어쓰기 — `**돈을좇지**` → `**돈을 좇지**`
    (re.compile(r"\*\*돈([을은이])(좇|쫓)"), r"**돈\1 \2"),
]


def _fix_korean_typos(text: str) -> str:
    """LLM 한국어 출력의 자주 발생하는 띄어쓰기·오타 패턴 후처리."""
    for pat, repl in _TYPO_FIXES:
        text = pat.sub(repl, text)
    return text


def _strip_table_and_rules(text: str) -> str:
    """본문에서 `---` 가로줄·Markdown 표·박스 그리기 문자 일괄 제거.

    표는 행을 ` · ` 로 풀어 한 줄 텍스트로 변환, 분리 행은 폐기.
    """
    out: list[str] = []
    for line in text.splitlines():
        # 박스 그리기 문자 제거
        line = _BOX_DRAW.sub("", line)
        # 가로 구분선 (---, ***, ===, ··· 등) 제거
        if _HR_LINE.match(line):
            continue
        # Markdown 표 헤더 분리 행 (|---|---| 등) 폐기
        if _TABLE_SEP.match(line):
            continue
        # 표 데이터 행 (| a | b |) → 셀 추출해 ` · ` 로 연결
        if _TABLE_LINE.match(line):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            cells = [c for c in cells if c]
            line = " · ".join(cells) if cells else ""
        out.append(line)
    # 연속 빈 줄 2개로 압축
    result: list[str] = []
    blank = 0
    for line in out:
        if not line.strip():
            blank += 1
            if blank <= 1:
                result.append("")
        else:
            blank = 0
            result.append(line)
    return "\n".join(result)


def normalize_interpretation(raw: str, manse_json: dict) -> str:
    """LLM 응답을 도입부 + 6항목 표준 양식으로 정규화. 모델 무관 같은 모양."""
    # 0) 표·박스·`---` 가로줄 일괄 제거
    text = _strip_table_and_rules(raw)
    # 0b) 한국어 띄어쓰기/오타 후처리
    text = _fix_korean_typos(text)
    # 1) ### 등 비표준 헤더 → **굵게** 로
    text = re.sub(r"^#{3,6}\s+(.+?)\s*$", r"**\1**", text, flags=re.MULTILINE)

    # 2) 라인 단위 파싱
    intro_lines: list[str] = []
    sections: dict[int, list[str]] = {}
    current_idx: int | None = None
    current_body: list[str] = []

    for line in text.splitlines():
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            title = m.group(1).strip()
            num_m = re.match(r"^(\d+)[.\s]", title)
            if num_m:
                num = int(num_m.group(1))
                if 1 <= num <= 6:
                    if current_idx is None and current_body:
                        intro_lines = current_body
                    elif current_idx is not None:
                        sections.setdefault(current_idx, []).extend(current_body)
                    current_idx = num
                    current_body = []
                    continue
            current_body.append(f"**{title}**")
        else:
            current_body.append(line)

    if current_idx is None and current_body:
        intro_lines = current_body
    elif current_idx is not None:
        sections.setdefault(current_idx, []).extend(current_body)

    # 3) 자동 도입부 prepend + 6개 표준 헤더 재조립 (LLM 인사말은 폐기)
    out: list[str] = [build_intro(manse_json)]
    for i, std in enumerate(STANDARD_HEADERS, 1):
        out.append(f"## {std}")
        body = "\n".join(sections.get(i, [])).strip()
        out.append(body if body else MISSING_PLACEHOLDER)
        out.append("")
    return "\n".join(out).strip()


# ---------- Claude Max (Code CLI subprocess) ----------

def call_claude_max(manse_json: dict, timeout: int = 600) -> tuple[str, str]:
    user_msg = build_user_message(manse_json)
    cmd = [
        "claude", "--dangerously-skip-permissions",
        "--model", CLAUDE_MAX_MODEL,
        "--append-system-prompt", SYSTEM_PROMPT,
        "-p", user_msg,
    ]
    env = os.environ.copy()
    path = env.get("PATH", "")
    for p in ["/opt/homebrew/bin", "/usr/local/bin"]:
        if p not in path:
            path = p + ":" + path
    env["PATH"] = path

    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout, env=env,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"claude CLI exit {result.returncode}: {result.stderr[:300]}"
        )
    text = result.stdout.strip()
    if not text:
        raise RuntimeError(f"claude CLI 빈 응답. stderr: {result.stderr[:300]}")
    return text, f"claude-max-{CLAUDE_MAX_MODEL}"


# ---------- Gemini 2.5 Flash ----------

def call_gemini(manse_json: dict, timeout: int = 180) -> tuple[str, str]:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY 미설정")
    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": build_user_message(manse_json)}]}],
        "generationConfig": {
            "temperature": 0.6,
            "maxOutputTokens": 6000,
            "thinkingConfig": {"thinkingBudget": 0},  # 빈 응답 방지 필수
        },
    }
    r = requests.post(f"{GEMINI_URL}?key={GEMINI_API_KEY}", json=body, timeout=timeout)
    r.raise_for_status()
    data = r.json()
    candidates = data.get("candidates", [])
    if not candidates:
        raise RuntimeError(f"Gemini 빈 응답: {json.dumps(data)[:300]}")
    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts).strip()
    if not text:
        raise RuntimeError(f"Gemini 텍스트 비어있음")
    return text, GEMINI_MODEL


# ---------- Ollama 로컬 폴백 ----------

OLLAMA_FALLBACK_MODELS = ["qwen2.5:7b", "gemma4:e4b"]


def call_ollama(manse_json: dict, model: str, timeout: int = 1200) -> tuple[str, str]:
    body = {
        "model": model,
        "system": SYSTEM_PROMPT,
        "prompt": build_user_message(manse_json),
        "stream": False,
        "think": False,  # gemma4·qwen thinking 끄기
        "keep_alive": 0,  # 호출 끝나면 즉시 unload (RAM 회수)
        "options": {
            "temperature": 0.6,
            "num_predict": 5000,
            "num_ctx": 16384,
        },
    }
    r = requests.post(f"{OLLAMA_URL}/api/generate", json=body, timeout=timeout)
    r.raise_for_status()
    data = r.json()
    text = data.get("response", "").strip()
    if not text:
        raise RuntimeError(f"Ollama({model}) 빈 응답")
    return text, model


# ---------- 폴백 체인 ----------

def interpret(manse_json: dict, prefer_max: bool = True) -> tuple[str, str]:
    """1) Claude Max → 2) Gemini → 3) qwen2.5:7b → 4) gemma4:e4b.

    prefer_max=False 면 Claude Max 건너뜀 (일반 사용자용).
    각 단계 헤더 5개 미만이면 부족으로 보고 다음 폴백. 모두 부족하면 가장 좋은 것 채택.
    """
    chain: list[tuple[str, callable]] = []
    if prefer_max:
        chain.append(("claude-max", lambda: call_claude_max(manse_json)))
    chain.append(("gemini", lambda: call_gemini(manse_json)))
    for m in OLLAMA_FALLBACK_MODELS:
        chain.append((m, lambda m=m: call_ollama(manse_json, m)))

    last_err: Exception | None = None
    best: tuple[str, str, int] | None = None

    for name, fn in chain:
        try:
            t0 = time.time()
            text, used = fn()
            elapsed = time.time() - t0
            headers = _count_headers(text)
            logger.info(
                "[saju-llm] %s — %d자, %d/6 항목, %.1f초",
                used, len(text), headers, elapsed,
            )
            if headers >= MIN_HEADERS:
                return normalize_interpretation(text, manse_json), used
            if best is None or headers > best[2]:
                best = (text, used, headers)
            logger.info("[saju-llm] %s 헤더 부족(%d/6) → 다음", used, headers)
        except Exception as e:
            last_err = e
            logger.warning("[saju-llm] %s 실패 → 다음: %s", name, str(e)[:200])

    if best is not None:
        return normalize_interpretation(best[0], manse_json), best[1] + f"-partial-{best[2]}of6"
    raise RuntimeError(f"모든 LLM 폴백 실패. 마지막: {last_err}")
