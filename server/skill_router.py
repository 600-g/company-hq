"""두근컴퍼니 역할 자동 라우터 (TeamMaker skill-router.ts 포팅).

사용자 요청 + 팀 역할을 분석해서 적절한 SOP(`server/skills/*.md`)를 선택해 반환.
CPO가 요청 받을 때 호출: "어떤 팀에 어떤 SOP로 넘길지" 결정.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

SKILLS_DIR = Path(__file__).parent / "skills"

RoleId = Literal["planning", "design", "dev-web-nextjs", "dev-backend", "qa"]


@dataclass(frozen=True)
class RoleMatch:
    role: RoleId
    score: int
    reason: str


# ── 역할 분류 규칙 (TeamMaker 패턴 + 두근 확장) ─────────────

ROLE_PATTERNS: dict[RoleId, tuple[str, ...]] = {
    "planning": (
        "기획", "전략", "분석", "리서치", "조사", "스펙", "프로덕트", "로드맵",
        "plan", "spec", "strategy", "research", "requirements", "prd",
    ),
    "design": (
        "디자인", "ux", "ui", "레이아웃", "와이어프레임", "목업", "색상", "팔레트",
        "에셋", "스프라이트", "타일", "마을", "사무실",
        "design", "layout", "wireframe", "mockup", "asset", "sprite", "tileset",
    ),
    "dev-web-nextjs": (
        "프론트", "프런트", "react", "next", "nextjs", "ui 구현", "컴포넌트",
        "phaser", "tailwind", "typescript", "tsx",
        "frontend", "component", "jsx",
    ),
    "dev-backend": (
        "백엔드", "api", "서버", "db", "데이터베이스", "fastapi", "websocket",
        "python", "엔드포인트",
        "backend", "endpoint", "server", "database",
    ),
    "qa": (
        "테스트", "qa", "검증", "품질", "회귀", "보안", "playwright", "pytest",
        "test", "regression", "security", "verify",
    ),
}


def classify_roles(text: str) -> list[RoleMatch]:
    """텍스트에서 관련 역할들을 점수순으로 반환.

    - 키워드 1개 매칭당 +1점
    - 강한 키워드(3글자 이상 한국어)는 +2점
    - 여러 역할이 동시에 매칭될 수 있음 (파이프라인 구성에 활용)
    """
    lower = text.lower()
    matches: list[RoleMatch] = []
    for role, keywords in ROLE_PATTERNS.items():
        score = 0
        hits: list[str] = []
        for kw in keywords:
            if kw in lower:
                score += 2 if len(kw) >= 3 else 1
                hits.append(kw)
        if score > 0:
            matches.append(RoleMatch(
                role=role,
                score=score,
                reason=f"matched: {', '.join(hits[:3])}",
            ))
    matches.sort(key=lambda m: m.score, reverse=True)
    return matches


def load_skill(role: RoleId) -> str:
    """해당 역할의 SOP 마크다운 내용 반환."""
    path = SKILLS_DIR / f"{role}.md"
    if not path.exists():
        return f"# {role}\n\n(SOP 파일 없음: {path})"
    return path.read_text(encoding="utf-8")


# ── 파이프라인 조립 (pipelineStore 패턴) ─────────────

def build_pipeline(request: str) -> list[RoleId]:
    """요청 분석 → 실행 순서 제안.

    기본 순서: planning → design → dev → qa
    요청 내용에 따라 생략/추가.
    """
    matches = classify_roles(request)
    if not matches:
        # 애매한 요청은 기획 → QA 2단계
        return ["planning", "qa"]

    matched_roles = {m.role for m in matches}
    pipeline: list[RoleId] = []

    # 기획이 필요한 신호가 있으면 먼저
    if "planning" in matched_roles or len(request) > 100:
        pipeline.append("planning")

    # 디자인 필요 신호
    if "design" in matched_roles:
        pipeline.append("design")

    # 개발 (프론트/백엔드 둘 다 가능)
    if "dev-web-nextjs" in matched_roles:
        pipeline.append("dev-web-nextjs")
    if "dev-backend" in matched_roles:
        pipeline.append("dev-backend")

    # 개발 매칭 없었지만 기획도 없으면 기본 프론트
    if not any(r.startswith("dev") for r in pipeline) and "planning" not in pipeline:
        pipeline.append("dev-web-nextjs")

    # 마지막은 항상 QA
    if "qa" not in pipeline:
        pipeline.append("qa")

    return pipeline


# ── 핸드오프 승인 구조 (handoffStore 패턴) ─────────────

@dataclass
class Handoff:
    """팀 간 결과물 전달 + 승인 대기."""
    from_role: RoleId
    to_role: RoleId
    artifact_summary: str
    status: Literal["pending", "approved", "rejected"] = "pending"
    feedback: str = ""


def format_handoff_message(handoff: Handoff) -> str:
    """사용자에게 보여줄 승인 메시지 (한국어 템플릿)."""
    return f"""
🔄 핸드오프 승인 요청

{handoff.from_role} → {handoff.to_role}

산출:
{handoff.artifact_summary}

진행하시겠습니까?
[✅ 승인] [❌ 취소] [💬 피드백]
""".strip()


# ── 진입점 (CPO가 호출) ─────────────

def route_request(user_text: str) -> dict:
    """CPO가 사용자 요청 받으면 호출.

    Returns:
        {
            "pipeline": [...],   # 실행 순서
            "matches": [...],     # 점수 top-3
            "skills": {role: content} # 해당 역할의 SOP
        }
    """
    matches = classify_roles(user_text)[:3]
    pipeline = build_pipeline(user_text)
    skills = {role: load_skill(role) for role in pipeline}

    return {
        "pipeline": pipeline,
        "matches": [
            {"role": m.role, "score": m.score, "reason": m.reason}
            for m in matches
        ],
        "skills": skills,
    }


# ════════════════════════════════════════════════════════════════
# Agent generate-config 강화 (TeamMaker 흡수 + LLM 도메인 강화)
# 2026-05-09 추가
# ════════════════════════════════════════════════════════════════

def select_skill_md(
    role: str,
    description: str,
    project_type: str | None = None,
    framework: str | None = None,
) -> tuple[str, str]:
    """역할 + 프로젝트 타입 → 단일 skill MD 선택. (key, content) 반환."""
    matches = classify_roles(f"{role} {description}")
    if not matches:
        return "", ""

    top_role = matches[0].role
    # 프로젝트 타입으로 dev 영역 세분
    if top_role.startswith("dev"):
        if project_type == "web" or framework == "nextjs":
            top_role = "dev-web-nextjs"
        elif project_type == "backend" or framework in ("fastapi", "express"):
            top_role = "dev-backend"
        elif (SKILLS_DIR / "dev-generic.md").exists():
            top_role = "dev-generic"  # type: ignore[assignment]

    content = load_skill(top_role)  # type: ignore[arg-type]
    return top_role, content


# ── Reference 자동 주입 (TeamMaker selectReferences 패턴 + 한국어 추가) ───
_REF_TEMPLATES: dict[str, str] = {
    "nextjs-app-router": """# Next.js App Router 핵심
- Server Component 기본, useState/useEffect 쓸 땐 'use client' 명시
- Next.js 15+: params/searchParams는 Promise — `const { id } = await params`
- cookies(), headers() async — `const cookieStore = await cookies()`
- 기본 fetch cache 는 no-store
- pages/와 app/ 동시 사용 금지
- CSS는 layout.tsx 에서만 import""",

    "tailwind-v4": """# Tailwind CSS v4 핵심
- postcss.config.mjs: `{ plugins: { '@tailwindcss/postcss': {} } }`
- globals.css: `@import 'tailwindcss'`
- tailwind.config.js 불필요 (v4 CSS 기반 설정)
- 의존성: tailwindcss@^4 + @tailwindcss/postcss@^4 + postcss@^8
- @theme 블록으로 CSS 변수 커스터마이즈
- cn() 유틸: clsx + tailwind-merge""",

    "shadcn-ui": """# shadcn/ui 핵심
- 의존성: class-variance-authority, clsx, tailwind-merge, lucide-react, @radix-ui/react-slot
- Button: variant=(default|destructive|outline|secondary|ghost|link) size=(sm|default|lg)
- Card: Card > CardHeader > CardTitle + CardDescription > CardContent > CardFooter
- 컴포넌트 위치: src/components/ui/*.tsx
- src/lib/utils.ts 의 cn() 헬퍼 활용""",

    "fastapi-patterns": """# FastAPI 핵심
- async def 라우트 권장 (블로킹 작업은 run_in_executor)
- Pydantic 모델로 body 검증
- 응답 envelope 통일: `{'ok': bool, ...}`
- WebSocket: ws.accept() + receive_json/send_json
- BackgroundTasks: 응답 후 백그라운드 실행
- 의존성 주입: Depends(get_db) 패턴""",

    "auth-patterns": """# 인증 핵심
- 비밀번호: bcrypt 해싱 (절대 평문 X)
- 쿠키: httpOnly + secure + sameSite=lax/strict
- 세션 토큰: JWT 또는 random + DB 세션
- Rate limiting: 로그인 5/min
- CSRF: 토큰 + same-origin
- 입력 검증: Zod / Pydantic schema 강제""",

    "api-patterns": """# REST API 핵심
- 응답 envelope: `{ok, data?, error?, meta?}`
- 검증 → 비즈니스 로직 → 응답 순서
- 페이지네이션: ?page=1&limit=20 → meta: {total, page, limit}
- SSE 스트리밍: ReadableStream + Content-Type: text/event-stream""",

    "react-patterns": """# React 핵심
- 단일 책임 + composition first
- Props는 TypeScript interface 명시
- 파생 값: useMemo (state로 변환 X)
- 폼: object state + handleChange
- 리스트 key: 안정적 ID (인덱스 X)""",

    "korean-commit": """# 한국어 커밋 메시지
- 형식: `<type>(<scope>): <한 줄 요약>`
- type: feat / fix / refactor / docs / test / chore / perf / ci / style / security
- scope: 한국어 OK (예: 채팅, 백엔드)
- 본문 비어있어도 OK. 있으면 빈 줄 후 작성""",
}


def select_references(
    role: str,
    description: str,
    project_type: str | None = None,
    framework: str | None = None,
    task_description: str | None = None,
    max_refs: int = 3,
) -> list[tuple[str, str]]:
    """프레임워크 + task 기반 reference 자동 선택 (최대 max_refs)."""
    text = f"{role} {description}".lower()
    is_dev = bool(re.search(r"개발|엔지니어|구현|코딩|frontend|backend|dev", text))
    if not is_dev:
        return []

    refs: list[tuple[str, str]] = []

    if framework == "nextjs":
        refs.append(("nextjs-app-router", _REF_TEMPLATES["nextjs-app-router"]))
        refs.append(("tailwind-v4", _REF_TEMPLATES["tailwind-v4"]))
        refs.append(("shadcn-ui", _REF_TEMPLATES["shadcn-ui"]))
    elif framework == "fastapi":
        refs.append(("fastapi-patterns", _REF_TEMPLATES["fastapi-patterns"]))
        refs.append(("api-patterns", _REF_TEMPLATES["api-patterns"]))
    elif project_type == "web":
        refs.append(("react-patterns", _REF_TEMPLATES["react-patterns"]))
        refs.append(("tailwind-v4", _REF_TEMPLATES["tailwind-v4"]))

    if task_description:
        task = task_description.lower()
        if len(refs) < max_refs and re.search(r"인증|로그인|회원가입|auth|login|signup|jwt", task):
            refs.append(("auth-patterns", _REF_TEMPLATES["auth-patterns"]))
        if len(refs) < max_refs and re.search(r"\bapi\b|엔드포인트|endpoint|rest|crud", task):
            if not any(k == "api-patterns" for k, _ in refs):
                refs.append(("api-patterns", _REF_TEMPLATES["api-patterns"]))

    # 한국어 커밋 규칙은 모든 dev 에이전트에 자동 첨부
    if len(refs) < max_refs:
        refs.append(("korean-commit", _REF_TEMPLATES["korean-commit"]))

    return refs[:max_refs]


# ── LLM 도메인 특화 강화 (TeamMaker 초과 차별점) ────────────────
async def enhance_sop_with_llm(
    name: str,
    role: str,
    description: str,
    skill_key: str,
) -> str:
    """무료 LLM(Gemini/Gemma)으로 이 에이전트 고유 도메인 특화 가이드 생성.

    정적 MD(skill_md)와 별개로, 사용자가 묘사한 구체적 도메인/목적에 맞춰
    도구·함정·체크리스트를 동적 생성. TeamMaker 와의 결정적 차이.

    실패 시 빈 문자열 반환 → system_prompt 합성에 영향 X.
    """
    prompt = (
        f"[에이전트 도메인 분석 + 특화 가이드]\n"
        f"에이전트: {name} ({role})\n"
        f"설명: {description}\n"
        f"적용 SOP: {skill_key or '없음'}\n\n"
        "이 에이전트의 **도메인 특화 가이드**를 작성해.\n"
        "기본 SOP에 없는, 이 도메인 특유의 핵심만 짧게:\n\n"
        "## 도구·라이브러리\n"
        "- 자주 쓰는 핵심 3개 (한 줄씩)\n\n"
        "## 흔한 함정\n"
        "- 도메인 특유 실수 2-3개 + 회피법\n\n"
        "## 산출물 체크리스트\n"
        "- [ ] 항목 4-5개\n\n"
        "조건: 한국어. 마크다운만 출력 (서론/감탄/메타 금지). 200~300자."
    )
    try:
        from claude_runner import run_claude_light
        result = await run_claude_light(prompt, task_type="default")
        return (result or "").strip()
    except Exception:
        return ""


# ── 최종 system_prompt 합성 ──────────────────────────────────
def compose_system_prompt(
    name: str,
    role: str,
    base_persona: str,
    skill_key: str,
    skill_md: str,
    enhanced_sop: str,
    references: list[tuple[str, str]],
    isolation_block: str = "",
    collab_line: str = "",
) -> str:
    """SOP + 도메인 강화 + reference + 격리/협업 합쳐 최종 system_prompt 반환."""
    parts: list[str] = [base_persona.rstrip()]

    if skill_md:
        parts.append(f"\n## 기본 SOP ({skill_key})\n{skill_md.strip()}")

    if enhanced_sop:
        parts.append(f"\n## 도메인 특화 가이드 (LLM 동적 생성)\n{enhanced_sop.strip()}")

    if references:
        parts.append("\n## 참고 문서")
        for k, v in references:
            parts.append(f"\n### {k}\n{v.strip()}")

    if isolation_block:
        parts.append("\n" + isolation_block.rstrip())
    if collab_line:
        parts.append("\n## 협업\n" + collab_line.rstrip())

    return "\n".join(parts) + "\n"


if __name__ == "__main__":
    # 간단 smoke test
    test_cases = [
        "데이트맵에 다크모드 토글 추가해줘",
        "포트리스 같은 슈팅게임 미니 MVP 만들자",
        "업비트봇 API 응답 속도 개선 필요",
        "마을 광장 디자인 새로 짜줘",
        "이 기능 테스트 좀 돌려봐",
    ]
    for t in test_cases:
        result = route_request(t)
        print(f"\n요청: {t}")
        print(f"  파이프라인: {' → '.join(result['pipeline'])}")
        summary = [f"{m['role']}({m['score']})" for m in result['matches']]
        print(f"  매칭: {summary}")
        # 새 select_skill_md 테스트
        sk_key, sk_md = select_skill_md(role="frontend", description=t, project_type="web", framework="nextjs")
        print(f"  selected skill: {sk_key} ({len(sk_md)} 글자)")
        refs = select_references(role="frontend", description=t, framework="nextjs", task_description=t)
        print(f"  references: {[k for k, _ in refs]}")
