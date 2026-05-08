# 두근컴퍼니 HQ

픽셀아트 사무실 위에 여러 AI 에이전트(팀)를 시각화하는 **멀티 에이전트 플랫폼**.
사용자가 웹/모바일에서 스태프·CPO·프론트엔드·백엔드·디자인·QA 등에게 말을 걸면, 각 팀이 Claude Code CLI 또는 무료 LLM(Gemini/Gemma)을 통해 실제 코드/문서/대화 작업을 수행합니다.

**라이브 데모**: [600g.net](https://600g.net) (이두근 개인 인스턴스)

## ✨ 주요 기능

- **픽셀 사무실 UI** — Phaser 3 기반, 에이전트가 캐릭터로 등장 + 가구 배치
- **멀티 LLM 라우팅** — Gemini(무료) → Gemma 4 로컬(무한) → Claude(유료) 폴백으로 토큰 절감
- **CPO 주도 디스패치** — 한 메시지로 여러 팀 자동 라우팅 + 통합 보고
- **실시간 채팅** — WebSocket 스트리밍, 팀별 세션 분리
- **버그 티켓 + GitHub Issue 자동 연동** — 이미지 첨부, 중복 탐지
- **무중단 배포** — 사용자 [업데이트] 클릭 → 백그라운드 deploy.sh + 진행률
- **자동 복구** — 빈 응답/예외 시 CPO 자동 진단 (옵션, AUTO_RECOVERY=0 으로 끄기)

## 🏗 아키텍처

```
┌─────────────────────┐         ┌─────────────────────┐
│  Frontend (Next 16) │         │  Backend (FastAPI)  │
│  doogeun-hq/        │ ◀───WS─▶│  server/            │
│  Phaser 3 사무실     │   HTTP  │  Claude Code CLI    │
└─────────────────────┘         │  ↓                  │
                                │  Gemini / Gemma 4   │
                                │  GitHub API         │
                                └─────────────────────┘
                                          ↓
                                    SQLite + JSON
```

## 🚀 빠른 시작 (외부 검증용 Docker)

```bash
git clone https://github.com/600-g/company-hq.git
cd company-hq

# 1. 환경 변수 세팅
cp .env.example .env
# → GEMINI_API_KEY 입력 (필수)
#   https://aistudio.google.com/app/apikey 에서 무료 발급

# 2. 백엔드만 컨테이너 실행 (프론트엔드는 별도)
docker-compose up -d

# 3. 헬스체크
curl http://localhost:8000/api/teams
```

**제약사항**: 컨테이너에는 Claude Code CLI 가 없으므로 Claude 풀세션은 비활성. 무료 LLM(Gemini/Gemma) 만 사용 가능. Claude Code 도 쓰려면 host 에서 직접 venv 실행 필요 (아래 ⤵).

## 💻 로컬 개발 (Mac mini 권장 환경)

```bash
# 백엔드
cd server
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env  # 키 입력
python3 main.py             # localhost:8000

# 프론트엔드 (별도 터미널)
cd doogeun-hq
npm install
npm run dev                 # localhost:3000
```

## 📁 디렉토리 구조

```
company-hq/
├── server/                       # FastAPI 백엔드
│   ├── main.py                   # FastAPI 앱 (분할 진행 중, 1500줄)
│   ├── routers/                  # 라우터 12개 (admin, dispatch, teams, ...)
│   ├── claude_runner.py          # Claude CLI 실행기 + 세션
│   ├── budget.py                 # 토큰 예산 추적
│   ├── runner_helpers.py         # CLI 출력 파싱 헬퍼
│   ├── ws_handler.py             # WebSocket 채팅
│   ├── staff_engine.py           # 스태프 라우팅 (무료 LLM 우선)
│   ├── free_llm.py               # Gemini/Gemma 라우터
│   ├── github_manager.py         # GitHub repo 생성/CLAUDE.md
│   └── requirements.txt
├── doogeun-hq/                   # Next.js 프론트엔드 (메인)
│   ├── src/app/hub/page.tsx      # 메인 hub
│   ├── src/components/HubOffice.tsx  # Phaser 씬
│   └── src/components/hub/       # 모달/사이드바 컴포넌트
├── scripts/
│   ├── smoke_test.sh             # 6종 회귀 검증 30초
│   └── post_commit_hook.sh       # patch_log.jsonl 자동 기록
├── deploy.sh                     # CF Pages 배포
├── docker-compose.yml            # 외부 검증용
├── Dockerfile                    # 백엔드 컨테이너
├── .env.example                  # 환경 변수 템플릿
├── STABILIZATION.md              # 안정화 트래커
└── CLAUDE.md                     # 운영자 가이드 (본인 인스턴스)
```

## 🛡 안정화 (2026-05-08 진행 중)

`STABILIZATION.md` 참조. 단일 거대 파일 분할 + APIRouter 패턴 + lazy import 전환:
- `main.py` 4,681 → ~1,500 (**-67.7%**)
- `page.tsx` 1,996 → ~1,200 (**-39.8%**)
- 신규 자체 완결 모듈 16+ (라우터 12 / 컴포넌트 5)
- 회귀 검증: `bash scripts/smoke_test.sh` (6종 30초)

## 🧪 검증

```bash
# 백엔드 헬스 + 빌드 + import 무결성 한방 점검
bash scripts/smoke_test.sh

# 빌드만 빠르게
SKIP_BUILD=0 bash scripts/smoke_test.sh

# 백엔드 import 직접
cd server && source venv/bin/activate && python3 -c "import main; print('OK')"

# 프론트엔드 빌드
cd doogeun-hq && npx next build
```

## 🔑 핵심 환경 변수

| 변수 | 필수 | 용도 |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | 무료 LLM 라우터 (토큰 절감 핵심) |
| `ANTHROPIC_API_KEY` | △ | Claude API 직접 호출 시 (Max 플랜 사용자는 CLI 인증으로 대체) |
| `TELEGRAM_BOT_TOKEN` | ❌ | 일일 리포트 알림 (선택) |
| `AUTO_RECOVERY` | ❌ | `0` 으로 설정 시 자동 복구 OFF (디버깅용) |
| `DAILY_TOKEN_LIMIT` | ❌ | Claude Max 일일 토큰 추정 한도 |

## 📜 라이선스

내부 프로젝트 (이두근 / 두근컴퍼니). 외부 검증용 코드 공개 — 상업 사용 시 문의.

## 🔗 관련

- [STABILIZATION.md](./STABILIZATION.md) — 코드 안정화 진행 트래커
- [CLAUDE.md](./CLAUDE.md) — Claude Code 운영자 가이드
- [scripts/smoke_test.sh](./scripts/smoke_test.sh) — 회귀 검증
