"""GitHub 레포 자동 관리 — 신규 레포 생성, 클론, CLAUDE.md 자동 생성"""

import os
import subprocess
from datetime import datetime
from github import Github, GithubException
from dotenv import load_dotenv

load_dotenv()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_USERNAME = os.getenv("GITHUB_USERNAME", "600-g")
PROJECTS_ROOT = os.path.expanduser(os.getenv("PROJECTS_ROOT", "~/Developer/my-company"))

# ── 프로젝트 타입별 템플릿 ─────────────────────────────
PROJECT_TYPES = {
    "webapp": {
        "label": "웹앱",
        "tech": "Next.js 14, TypeScript, Tailwind CSS",
        "structure": "app/ (페이지), components/ (컴포넌트), lib/ (유틸), api/ (서버)",
        "skills": [
            "프론트엔드 UI/UX 구현 및 개선",
            "API 엔드포인트 설계 및 구현",
            "반응형 디자인, 접근성 관리",
            "SEO 최적화, 성능 튜닝",
            "배포 (Vercel/로컬)",
        ],
        "tools": "Next.js App Router, Tailwind, fetch/axios",
    },
    "bot": {
        "label": "봇/자동화",
        "tech": "Python 3.12, asyncio, 외부 API 연동",
        "structure": "main.py (진입점), strategy/ (전략), utils/ (유틸), config/ (설정)",
        "skills": [
            "자동화 스크립트 작성 및 스케줄링",
            "외부 API 연동 (거래소, 메신저, 크롤링 등)",
            "전략 로직 분석 및 개선",
            "에러 핸들링, 재시도 로직",
            "로그 분석 및 성능 모니터링",
        ],
        "tools": "Python asyncio, requests/httpx, APScheduler",
    },
    "game": {
        "label": "게임/인터랙티브",
        "tech": "TypeScript, Phaser.js / Canvas API, 픽셀아트",
        "structure": "scenes/ (씬), sprites/ (스프라이트), assets/ (리소스), systems/ (게임시스템)",
        "skills": [
            "게임 로직 설계 및 구현",
            "스프라이트/애니메이션 관리",
            "물리엔진, 충돌 감지",
            "레벨 디자인, 밸런싱",
            "사운드/이펙트 연출",
        ],
        "tools": "Phaser.js, Tiled Map Editor, Aseprite",
    },
    "api": {
        "label": "API 서버",
        "tech": "Python FastAPI, SQLAlchemy/Prisma, PostgreSQL",
        "structure": "routes/ (엔드포인트), models/ (DB모델), services/ (비즈니스로직), schemas/ (검증)",
        "skills": [
            "RESTful API 설계 및 구현",
            "DB 스키마 설계, 마이그레이션",
            "인증/인가 (JWT, OAuth)",
            "입력 검증, 에러 핸들링",
            "API 문서화 (OpenAPI/Swagger)",
        ],
        "tools": "FastAPI, SQLAlchemy, Alembic, Pydantic",
    },
    "mobile": {
        "label": "모바일 앱",
        "tech": "React Native / Flutter, TypeScript/Dart",
        "structure": "screens/ (화면), components/ (공통), navigation/ (라우팅), services/ (API)",
        "skills": [
            "크로스플랫폼 UI 구현",
            "네이티브 모듈 연동",
            "상태관리 (Zustand/Riverpod)",
            "푸시 알림, 딥링크",
            "앱스토어 배포",
        ],
        "tools": "React Native CLI, Expo, 또는 Flutter SDK",
    },
    "data": {
        "label": "데이터/분석",
        "tech": "Python, Pandas, Jupyter, Matplotlib/Plotly",
        "structure": "notebooks/ (분석), scripts/ (ETL), data/ (원본), reports/ (결과)",
        "skills": [
            "데이터 수집, 정제, 변환 (ETL)",
            "탐색적 데이터 분석 (EDA)",
            "시각화 및 대시보드 제작",
            "통계 분석, 예측 모델링",
            "보고서 자동 생성",
        ],
        "tools": "Pandas, NumPy, Matplotlib, Plotly, Jupyter",
    },
    "tool": {
        "label": "CLI/도구",
        "tech": "Python / Node.js, Click/Commander",
        "structure": "cli.py (진입점), commands/ (서브커맨드), utils/ (유틸)",
        "skills": [
            "CLI 인터페이스 설계",
            "파일 시스템 처리",
            "외부 서비스 연동",
            "설정 관리 (dotenv, YAML)",
            "패키지 배포 (pip/npm)",
        ],
        "tools": "Click/Typer (Python), Commander (Node)",
    },
    "general": {
        "label": "범용",
        "tech": "프로젝트 요구사항에 맞춰 선택",
        "structure": "src/ (소스), tests/ (테스트), docs/ (문서)",
        "skills": [
            "요구사항 분석 및 설계",
            "코드 구현 및 리팩토링",
            "테스트 작성 및 품질 관리",
            "문서화",
            "배포 및 운영",
        ],
        "tools": "프로젝트에 적합한 도구 선택",
    },
}


def _generate_claude_md(
    name: str,
    description: str,
    project_type: str,
    emoji: str,
) -> str:
    """프로젝트 타입에 맞는 CLAUDE.md를 생성한다 (3단 구조: 지시→판단→실행)."""
    t = PROJECT_TYPES.get(project_type, PROJECT_TYPES["general"])
    today = datetime.now().strftime("%Y-%m-%d")

    # 타입별 배포/테스트 전략
    deploy_map = {
        "webapp": "빌드: `npm run build` | 배포: Vercel 또는 `bash deploy.sh`",
        "bot": "테스트: `python main.py --dry-run` | 실행: LaunchAgent 또는 수동",
        "game": "빌드: Unity WebGL | 배포: GitHub Pages",
        "api": "테스트: `python -c 'import main'` + curl | 배포: Cloudflare Tunnel",
        "mobile": "테스트: 에뮬레이터 | 빌드: `eas build` | 배포: App Store / Play Store",
        "data": "실행: `jupyter notebook` 또는 `python scripts/run.py`",
        "tool": "테스트: `python cli.py --help` | 배포: pip install",
        "general": "테스트: 프로젝트에 맞게 | 배포: 프로젝트에 맞게",
    }
    deploy = deploy_map.get(project_type, deploy_map["general"])

    # 타입별 MCP 도구
    mcp_map = {
        "webapp": "- gemini-image: UI 에셋/아이콘 생성\n- doogeun-hq: 서버 모니터링 연동",
        "bot": "- doogeun-hq: 프로세스 감시, 로그 조회, 긴급 조치",
        "game": "- gemini-image: 픽셀아트/에셋 생성\n- doogeun-hq: 서버 연동",
        "api": "- doogeun-hq: 서버 모니터링, 프로세스 관리",
        "mobile": "- gemini-image: 앱 아이콘/스플래시 생성",
        "data": "- gemini-image: 차트/시각화 보조",
        "tool": "- doogeun-hq: 서버 연동 (필요 시)",
        "general": "- gemini-image: 이미지 생성\n- doogeun-hq: 서버 모니터링",
    }
    mcp = mcp_map.get(project_type, mcp_map["general"])

    return f"""# CLAUDE.md — {emoji} {name}
> 두근컴퍼니 PM | 생성일: {today} | 타입: {t['label']}

---

## Layer 1 — 지시 (누구인가)

너는 두근컴퍼니의 **{name} 담당 PM**이다.
- **설명**: {description or '(두근이 구체화 예정)'}
- **레포**: `600-g/{name}` | **경로**: `~/Developer/my-company/{name}`
- **모델**: {('opus' if project_type in ('bot', 'game') else 'sonnet')}
- **기술**: {t['tech']}
- 두근은 개발 초보 → 쉽게 설명, 선택지는 장단점과 함께
- 80% 확신이면 실행 후 보고, 미만이면 먼저 질문

---

## Layer 2 — 판단 (어떻게 결정하나)

### 작업 순서
1. 요구사항 분석 → 현재 코드 읽기
2. 구현 계획 수립 (3단계 이상이면 목록 공유)
3. 최소 변경으로 구현
4. 검증: {deploy}
5. 커밋 + 보고

### 에러 대응
```
에러 → 가설 3개 (근거 한 줄씩) → 높은 확률 순 시도
├→ 성공 → 커밋 & ✅ 보고
└→ 3회 실패 → 두근에게 선택지 2개+ 제시 후 대기
```

### 비용 판단
- 무료 우선. 유료 발생 시 반드시 사전 고지
- Claude API 호출 사용 안 함 (Claude Code CLI만)

---

## Layer 3 — 실행 (무엇을 하나)

### MCP 도구
{mcp}

### Git 규칙
작업 완료 후 반드시:
```bash
git add . && git commit -m "feat/fix: 한글 작업 내용" && git push
```

### 코드 품질
- 함수 50줄 이내, 파일 800줄 이내
- 에러 핸들링 필수 (try/except)
- 시크릿 하드코딩 절대 금지 (.env 사용)

### 완료 기준
- [ ] 빌드/테스트 성공
- [ ] 핵심 동작 검증
- [ ] "이렇게 확인해봐" 가이드 제시
- [ ] GitHub 커밋 완료

### 자가 발전
실수 발생 시 `lessons.md`에 기록:
`[날짜] 문제 → 원인 → 재발 방지 규칙`

---

| 날짜 | 버전 | 변경 |
|------|------|------|
| {today} | v1.0 | 최초 생성 (자동) |
"""


def _generate_system_prompt(
    name: str,
    description: str,
    project_type: str,
) -> str:
    """프로젝트에 맞는 풍부한 시스템프롬프트를 생성한다."""
    t = PROJECT_TYPES.get(project_type, PROJECT_TYPES["general"])
    skills_str = ", ".join(t["skills"][:3])

    return (
        f"너는 두근컴퍼니의 '{name}' 담당 PM이야.\n\n"
        f"【프로젝트】 {description or '두근이 구체화 예정'}\n"
        f"【타입】 {t['label']} | 【기술】 {t['tech']}\n"
        f"【역량】 {skills_str}\n\n"
        f"【행동 원칙】\n"
        f"- 이 프로젝트의 설계·개발·테스트·배포·운영 전체 담당\n"
        f"- 두근은 개발 초보 → 쉽게 설명, 선택지는 장단점과 함께\n"
        f"- 80% 확신이면 실행 후 보고, 되묻지 않음\n"
        f"- 수정 요청 → 코드 수정 → 결과 보고 (무응답 절대 금지)\n"
        f"- 에러 3회 실패 시 선택지 2개+ 제시 후 대기\n\n"
        f"【필수 응답 규칙】\n"
        f"- 프로젝트 폴더의 CLAUDE.md를 최우선으로 따르세요.\n"
        f"- ⚠️ 절대 무응답 금지! 어떤 작업이든 반드시 텍스트로 결과를 알려주세요.\n"
        f"- 작업 완료 시: '✅ (뭘 했는지 한 줄 요약)'\n"
        f"- 에러 발생 시: '❌ (에러 내용)'\n"
        f"- 한국어로 자연스럽게 대화하세요.\n\n"
        f"【자가 발전】실수/수정 발생 시 lessons.md에 기록 (날짜, 문제, 원인, 방지 규칙). 새 대화 시작 시 lessons.md 읽기.\n"
        f"【완료 전 검증】빌드/테스트 성공 확인 없이 완료 보고 금지. '이렇게 확인해봐' 가이드 필수.\n"
        f"【계획 우선】3단계 이상 작업은 할 일 목록 먼저 작성 후 진행. 단순 작업은 바로 실행 OK.\n"
    )


def get_github() -> Github:
    if not GITHUB_TOKEN:
        raise RuntimeError("GITHUB_TOKEN이 설정되지 않았습니다. server/.env를 확인하세요.")
    return Github(GITHUB_TOKEN)


def create_repo(
    name: str,
    description: str = "",
    private: bool = False,
    project_type: str = "general",
    emoji: str = "🆕",
) -> dict:
    """GitHub에 새 레포를 만들고 로컬에 클론 + CLAUDE.md 자동 생성."""
    g = get_github()
    user = g.get_user()

    # GitHub API는 latin-1 인코딩 → 이모지/비ASCII 제거
    safe_desc = description.encode("ascii", "ignore").decode("ascii").strip() or name

    # GitHub 레포 이름은 영문/숫자/하이픈만 허용 → 한글이면 로마자 변환
    import re as _re
    if not _re.match(r'^[a-zA-Z0-9._-]+$', name):
        # 한글 이름을 영문 kebab-case로 변환 시도
        ascii_name = name.encode("ascii", "ignore").decode("ascii").strip()
        if not ascii_name or len(ascii_name) < 2:
            # ASCII 변환 불가 → 타임스탬프 기반 이름 생성
            from datetime import datetime as _dt
            ascii_name = f"project-{_dt.now().strftime('%Y%m%d-%H%M%S')}"
        name = _re.sub(r'[^a-zA-Z0-9-]', '-', ascii_name).strip('-').lower()
        if not name:
            name = f"project-{_dt.now().strftime('%Y%m%d-%H%M%S')}"

    try:
        repo = user.create_repo(
            name=name,
            description=safe_desc,
            private=private,
            auto_init=True,
        )
    except GithubException as e:
        if e.status == 422:
            # 이미 존재하면 기존 레포를 사용
            try:
                repo = user.get_repo(name)
            except Exception:
                return {"ok": False, "error": f"레포 '{name}'이 이미 존재하지만 접근할 수 없습니다."}
        else:
            raise

    # 로컬 클론
    local_path = os.path.join(PROJECTS_ROOT, name)
    if not os.path.isdir(local_path):
        try:
            subprocess.run(
                ["git", "clone", repo.clone_url, local_path],
                check=True,
                capture_output=True,
            )
        except subprocess.CalledProcessError as e:
            # 클론 실패 시 GitHub 레포 삭제 (orphan 방지)
            try:
                repo.delete()
            except Exception:
                pass
            return {"ok": False, "error": f"로컬 클론 실패: {e.stderr.decode('utf-8', errors='replace') if e.stderr else str(e)}"}

    # CLAUDE.md 자동 생성
    claude_md_path = os.path.join(local_path, "CLAUDE.md")
    claude_md = _generate_claude_md(name, description, project_type, emoji)
    # 항상 최신 템플릿으로 덮어쓰기 (기존 파일 있어도)
    with open(claude_md_path, "w", encoding="utf-8") as f:
        f.write(claude_md)

    # git config (커밋 에러 방지)
    subprocess.run(["git", "config", "user.name", "두근컴퍼니"], cwd=local_path, capture_output=True)
    subprocess.run(["git", "config", "user.email", "admin@600g.net"], cwd=local_path, capture_output=True)

    # git commit + push (실패해도 에이전트 생성은 성공 — push는 나중에 해도 됨)
    import logging as _log
    try:
        subprocess.run(["git", "add", "CLAUDE.md"], cwd=local_path, capture_output=True, check=True)
        subprocess.run(
            ["git", "commit", "-m", f"feat: CLAUDE.md 자동 생성 ({project_type})"],
            cwd=local_path, capture_output=True, check=True,
        )
    except subprocess.CalledProcessError:
        pass  # 변경 없으면 커밋 실패 — 정상

    try:
        subprocess.run(["git", "push"], cwd=local_path, capture_output=True, check=True)
    except subprocess.CalledProcessError as e:
        _log.getLogger("company-hq").warning(
            "CLAUDE.md push 실패 (에이전트는 정상 생성): %s",
            e.stderr.decode("utf-8", errors="replace")[:100] if e.stderr else str(e),
        )

    # 시스템프롬프트 생성
    system_prompt = _generate_system_prompt(name, description, project_type)

    return {
        "ok": True,
        "repo_url": repo.html_url,
        "local_path": local_path,
        "system_prompt": system_prompt,
        "project_type": project_type,
    }


def list_repos() -> list[dict]:
    """600-g 계정의 모든 public 레포 목록을 반환한다."""
    g = get_github()
    user = g.get_user()
    repos = []
    for r in user.get_repos():
        repos.append({
            "name": r.name,
            "url": r.html_url,
            "description": r.description or "",
            "private": r.private,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        })
    return repos
