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
