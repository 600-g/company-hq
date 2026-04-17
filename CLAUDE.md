# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**두근컴퍼니 HQ** — 포켓몬 풍 픽셀아트 사무실 위에 여러 AI 에이전트(팀)를 시각화하는 멀티 에이전트 플랫폼. 사용자가 웹/텔레그램으로 CPO·프론트엔드·백엔드·디자인·QA·콘텐츠랩 등에게 말을 걸면, 각 팀이 Claude Code CLI를 통해 실제 코드/문서 작업을 수행한다.

- **배포**: Cloudflare Pages (`company-hq.pages.dev`, 600g.net) — `deploy.sh`로 자동
- **게이트웨이 서버**: 로컬 FastAPI (port 8000) + launchd 자동 실행 (`com.company-hq-server`)
- **팀메이커 자회사**: 로컬 Next.js (port 4827) + launchd (`com.teammaker-classic`) — 새 탭으로 분리 구동 (`USE_MAX_PLAN=1`)
- **버전 규칙** (deploy.sh 자동): `3.MINOR.PATCH` 에서 **MINOR = 커밋수/10, PATCH = 커밋수%10**. 중간 규모 수동 승격 시 `MANUAL_MINOR_BUMP=1 bash deploy.sh`

## 모노레포 구조

```
company-hq/
├── ui/         Next.js 16 + React 19 + Phaser 3 (프론트엔드)  → ui/CLAUDE.md
├── server/     FastAPI + Python 3.14 + Claude Runner (백엔드) → server/CLAUDE.md
├── shared/     API 스펙 / 에셋 changelog / 스프린트 보드 (팀 간 협업 프로토콜)
├── plans/      빌드 계획 + 테스트 케이스 (MD로 버전 관리)
├── tools/      슬라이싱 스크립트 등 재사용 유틸
├── scripts/    배포/시작 래퍼 스크립트
├── DESIGN.md   디자인 시스템 (팔레트/타이포/팀 스타일 단일 근원)
├── ROADMAP.md  디스패치/에이전트 통신/메모리 로드맵 + 현재-목표 gap
└── SESSION_STATE.md  세션 크래시 체크포인트 (새 세션 시작 시 먼저 읽기)
```

**서브디렉토리 CLAUDE.md** (`ui/CLAUDE.md`, `server/CLAUDE.md`)는 해당 영역 작업 시 자동 로드된다. 루트 CLAUDE.md가 공통 원칙이고, 서브가 기술 상세를 담당.

## 일상 명령어

```bash
# 프론트엔드 개발
cd ui && npx next dev                   # localhost:3000

# 빌드 검증 (커밋 전 필수)
cd ui && npx next build                  # TypeScript 컴파일 포함

# 백엔드 개발 (launchd로 자동 실행 중이지만 수동 재실행 시)
cd server && source venv/bin/activate && python main.py

# 백엔드 헬스 체크 (import 로드만)
cd server && source venv/bin/activate && python3 -c "import main; print('OK')"

# 전체 배포 (빌드 + Cloudflare Pages push)
bash deploy.sh                           # 루트에서
# → out/version.json에 BUILD_ID(git SHA + timestamp) 주입
# → Cloudflare 20K 파일 한도 대응: sliced/ 자동 제거

# MINOR 수동 승격 (중간 규모 변경)
MANUAL_MINOR_BUMP=1 bash deploy.sh

# launchd 서비스 재시작
launchctl kickstart -k gui/$(id -u)/com.company-hq-server
launchctl kickstart -k gui/$(id -u)/com.teammaker-classic
```

### uvicorn reload 주의
`scripts/hq_server_start.sh` 는 `--reload-include "*.py"` + `chat_history/* logs/* *.json *.log` 제외로 **파일 저장 시마다 재시작을 방지**. 이전에는 `chat_history/*.json` 쓸 때마다 uvicorn이 재시작해 WS 끊김 → 사용자 눈엔 "새로고침"처럼 보이던 문제의 범인.

## 아키텍처 핵심

### 팀(에이전트) 모델
- **source of truth**: `server/teams.json` — `id`(영문, GitHub 레포명) + `name`(한글 표시) + `emoji` + `layer` + `category`
- **시스템 프롬프트**: `server/team_prompts.json` — 팀별 역할/행동 원칙
- **세션 (Legacy)**: `server/team_sessions.json` — team_id → claude_session_id 1:1 (하위 호환)
- **세션 (v2, 멀티 세션)**: `server/sessions_store.py` + `server/chat_history/{team_id}/` — 한 팀 안에 여러 대화 세션. `_meta.json`, `_active.json`, `{session_id}.json`. 기존 `chat_history/{team_id}.json` 은 자동으로 default 세션으로 마이그레이션 (`.json.bak` 백업)
- **층 배치**: `server/floor_layout.json` — 게임 씬에서 팀이 어느 층/좌표에 배치되는지
- **ECC 미러**: `~/.claude/agents/doogeun-<role>.md` — Claude Code Task tool에서 네이티브 subagent_type으로 호출 가능 (세션 재시작 필요)

### 특수 팀 (캐릭터 없는 팀)
`cpo-claude`, `server-monitor` 는 게임 캐릭터 렌더링에서 제외된다. 새 특수 팀 추가 시 3곳 필터 필요:
1. `/api/layout/floors` 응답 제외
2. `floor_layout.json` 미포함
3. 프론트 `ALL_FLOORS` 하드코딩 미포함

### 채팅 플로우
```
유저 (웹/모바일/텔레그램 @doogeun_hq_bot)
  ↓ WS 우선, 실패 시 HTTP fallback
  → FastAPI /ws/chat/{team_id}?session_id=xxx (ws_handler.py)
  또는 → POST /api/chat/{team_id}/send {session_id}  (HTTP)
        GET /api/chat/{team_id}/history?session_id=xxx (15초 폴링)
  → claude_runner.run_claude(session_id) — stream-json 모드
  → 응답 스트리밍 → chat_history/{team_id}/{session_id}.json 자동 저장
```
- **stream-json 모드** (`--output-format stream-json --verbose`): 구조화된 이벤트(`assistant`/`user`/`tool_use`/`tool_result`/`rate_limit_event`/`result`) readline 파싱. UI에 도구 호출 실시간 카드(노랑→초록→빨강) 표시.
- **idle timeout 15분** (`_CLAUDE_IDLE_TIMEOUT = 900`): 이벤트 수신 시마다 타이머 리셋. 장시간 작업(파일 탐색/리팩터)도 안 끊김.
- **세션 분리 API**: `GET/POST/DELETE/PATCH /api/sessions/{team_id}`, WS 액션 `switch_session` / `create_session` / `delete_session` / `rename_session`.
- **이전 작업 유지**: 새 메시지 오면 취소하지 않고 task_queue/debouncer로 이어서 처리 (TM 패턴).
- **WS 끊겨도 작업 계속**: `send_json` 호출 전부 try/except — 재접속 시 `history_sync`로 복원.
- **CF Tunnel WS 미지원**: `api.600g.net/ws/chat/*` → 404. 프로덕션 모바일은 HTTP 폴링 자동 fallback.
- **실패 이어하기**: 마지막 응답이 빈/타임아웃/한도 초과 시 ChatPanel에 **"⟳ 직전 작업 이어하기"** 버튼 노출 → `claude --resume` 로 동일 claude session 재개.
- 취소: `action: "cancel"` → SIGTERM → SIGKILL (프로세스 그룹)
- 토큰 예산: 수동 대화 무제한, 자동(cron) 실행만 1M/시간 제한

### TM 이식 완료 컴포넌트 (ui/app/components/chat/)
1. `MarkdownContent` / `CodeBlock` (react-markdown + react-syntax-highlighter)
2. `AgentHandoffCard` — 핸드오프 + 피드백 재작업 flow
3. `ArtifactCard` / `ArtifactViewer` / `AgentResultCard` — AI 응답 파싱 → 아티팩트 자동 감지 (parseArtifacts)
4. `SystemCheckDialog` — node/git/cloudflared/claude 설치 체크
5. `SessionHistoryPanel` — 팀별 대화 수 + 최근 미리보기
6. `DeployGuideCard` — `bash deploy.sh` SSE 트리거 + 5단계 stepper
7. `TerminalPanel` — 쉘 SSE 실행 + fixErrorWithAI (exit≠0 시 CPO 수정 요청 버튼)
8. `Toast` (`components/Toast.tsx`) — `window.dispatchEvent(new CustomEvent("hq:toast", {detail:{text, variant}}))`

### 핸드오프/디스패치 (smart vs discuss)
- `/api/dispatch/smart` — CPO haiku 라우팅 → DAG 실행 (deps 기반 병렬/순차)
- `/api/dispatch/discuss` — 소크라테스식 6단계 (analyzing → opinions_start → opinion_collected → synthesizing → qa_review → final_decision)
- `/api/dispatch/approve` (+feedback) — 인라인 핸드오프 승인 시 피드백 있으면 routed_steps prompt 앞에 `[유저 피드백]` 주입하여 재작업

### Phaser 씬 구조 (ui/app/game/)
- `LoginScene.ts` — 외부 마을/시티뷰 (로그인 + `/village` 독립 페이지)
- `OfficeScene.ts` — 내부 사무실. **WORLD 32×23 (1024×736px)**. TM default.json 1:1 렌더 + 통창/서버실 오버레이
- `OfficeGame.tsx` / `LoginGame.tsx` — Phaser 초기화 래퍼 (Next.js `dynamic import({ ssr: false })`)
- `sprites.ts` — 에셋 프리로드 (key → 파일 매핑 단일 근원)
- `tm-furniture-catalog.ts` — TM 원본 가구 카탈로그. **서버 override 시스템** 포함 (`fetchAndApplyFurnitureOverrides`, 60초 폴링, `hq:furniture-overrides-applied` 이벤트)
- `tm-tiles.json` / `tm-label-ko.ts` — TM 오피스 타일 + 영→한 라벨 맵
- `bubbles.ts` / `walk-tracker.ts` — 말풍선 / walk promise 추적

### 페이지 라우트
- `/` (메인 사무실, OfficeGame)
- `/village` (독립 외부 마을 — 사이드바 메뉴 "🏙 마을" 클릭 시 같은 창 전환. HQ 클릭 시 `window.location.href = "/"` 로 복귀)
- `/game-preview`, `/office-preview`, `/teammaker-preview` — 디버그 라우트

### Z-sort 정책 (TM FurnitureLayer.ts 공식)
```
가구 depth  = baseZ + (row + heightCells) * 100 + col * 0.1
캐릭 container depth = 3000 + (gridY + gridH) * 100 - 1
baseZ 계층:
  -10000 floor tile
  -9000  floor_decor (카펫)
  -8000  floor_item (가방/쓰레기통)
  -5000  wall_tile
  -3000  wall_decor
  -2000  "쇼파" 라벨 (사람이 앞에 보이는 구도)
  -1000  chair 앞/옆 (isBackView=false)
  0      기본 가구 (책상)
  3000   사람(캐릭 container)
  3500   chair "뒤" (isBackView — label "뒤|back" 포함, 등받이가 사람을 가림)
  5000   stackable (모니터/노트북/키보드)
  5500   tall stack (스탠드)
  10000  divider / 외벽 가림막
```
- **의자 label 기반 분기**: "뒤"/"back" 포함 & "구멍" 미포함 → 3500 (사람 앞 렌더), 그 외 → -1000
- **쇼파 특수**: label "쇼파|sofa" 매칭 시 baseZ=-2000 (무조건 사람 뒤)
- **주의**: `\b뒤\b` 는 한글 단어 경계 인식 안 됨 — substring 매칭 필요
- **walkableCells**: `FurnitureDef.walkableCells?: [col,row][]` 로 footprint 내부 일부 통과 허용 (L-Desk 등)

### 복도 (하단 3줄, row ROWS-3 이상)
- **에이전트 통과/배치 허용** — bfsPath에 복도 예외
- `renderUserLayout` 끝과 `buildFloor` 끝 + 200ms 지연으로 `_clearCorridorGrid()` 호출 → 가구 점유된 grid 강제 해제

### 관리자 가구 카탈로그 편집 (권한 Lv.4+)
- OfficeEditor 팔레트 우클릭 → "이름 변경 / 팔레트에서 숨김"
- 대상 3종: 카탈로그 아이템 / 포켓몬 소품(`poke:`) / 바닥·벽 타일
- localStorage 키: `teammaker-furniture-overrides`, `hq-poke-label-overrides`, `hq-poke-hidden`, `hq-tile-label-overrides`, `hq-tile-hidden`
- 서버 동기화: `GET/PUT /api/furniture/overrides` (`server/furniture_overrides.json`) — 모든 기기 공유. PUT 디바운스 600ms, GET 60초 폴링 + visibilitychange 훅

### 버전/캐시 무효화 (배포 중 튕김 방지)
- 빌드 시 `deploy.sh`가 `out/version.json`에 `BUILD_ID` 주입
- `components/VersionCheck.tsx` 60초 폴링 → 변경 감지 시 **즉시 리로드 안 함**. `hq:toast` 이벤트로 "새 버전 배포됨" 알림 후 **15초 지연** 리로드 (CF Pages 전파 시간 확보 → 이전 버전 빈 페이지 튕김 방지)
- `components/BuildStampInline.tsx` 사이드바 하단 `v3.0.0 · <hash> · 🔄` 시각 확인 + 수동 캐시 클리어 버튼
- localStorage 키: `hq-build-id`, `hq-floor-teams-order`, `hq-chat-history`, `hq-floor-layout`, `hq-arcade-pos`, `hq-server-pos`

## 에이전트 생성 (2가지 모드)

### ⚡ 빠르게 만들기 (경량)
- 이름 + 한 줄 설명만
- `POST /api/agents/generate-config` — haiku가 role/description/outputHint/steps 자동 설계
- 검토 팝업 → 확인 → `POST /api/teams/light` — teams.json + team_prompts.json만 씀 (GitHub/클론 스킵)
- 생성된 시스템 프롬프트에 **10년차 시니어 페르소나** 자동 포함
- 실패 지점 거의 없음

### 🏗 고도화 에이전트 (프로젝트 팀)
- **표시 이름**: 한글 OK (예: `회고`, `매매봇`)
- **레포 이름**: 영문 소문자/숫자/하이픈만 (GitHub 레포명으로 직결)
- **시스템 프롬프트**: 사용자가 MD 형식으로 직접 기입 (CLAUDE.md로도 자동 사용)
- `POST /api/teams` — GitHub 레포 생성 → 로컬 클론 → CLAUDE.md 자동 → `team_prompts.json` 등록

### 공통
- 생성 후 **자동 채팅 오픈 + 자동 자기소개 트리거** (`POST /api/chat/{id}/send` "안녕, 자기소개해줘")
- 협업 여부 토글 제거됨 — 기본 협업 (필요 시 단독은 프롬프트로 제어)

## 에셋 작업 (마을/사무실 꾸미기)

**반드시 먼저 읽기**: `ui/public/assets/pokemon_assets/ASSET_GUIDE.md`

### 핵심 규칙
1. 원본 `Tilesets/*.png` 직접 크롭 절대 금지
2. `sliced/`, `composites/`, `pokemon_furniture/` 정제된 파일만 사용
3. 파일 경로 사용 전 `ls` 존재 확인 (추측 금지) — **sprites.ts에서 존재하지 않는 파일 로드 시 Phaser가 빗금친 missing-texture 렌더**
4. 같은 장면 내 시트 혼용 금지 (Celadopole + Johto 섞지 말기)
5. 완료 전 자가 체크리스트 통과 필수

### 자가 체크리스트
- [ ] 모든 파일 경로 `ls` 확인 (특히 `sprites.ts`의 `load.image` 경로)
- [ ] 원본 Tilesets 직접 크롭 없음
- [ ] 시트 스타일 혼용 없음
- [ ] 바닥/배경 구멍 없음
- [ ] composite 크기 `HxW` 일치
- [ ] Before/After 비교 생성
- [ ] layout 데이터 업데이트

### 작업 절차
1. `sliced_preview/<시트>_grid.png`로 좌표 파악
2. `composites/` 우선 → `sliced/` 보조
3. 후보 3-5개 제시 후 사용자 선택 대기 (자동 결정 금지)
4. 선택 후 배치 + 스크린샷
5. 자가 체크리스트 → 응답

### 금지 응답 패턴
- "32x32로 잘라서 쓰겠습니다" (이미 슬라이스됨)
- "대략 이 영역이...같아" (정확 파일명 확인 후 사용)
- "예쁘게 배치했습니다" (근거 없는 완료 선언)

## 품질 게이트 (커밋 전)

1. `cd ui && npx next build` 성공 — TypeScript 에러 0
2. 빌드 후 `deploy.sh`로 배포 시 `version.json` 갱신 확인
3. 데스크탑(1280px) + 모바일(375px) 양쪽 동작
4. Phaser 씬 기존 기능 정상 (서버모니터, 아케이드, 팀 드래그)
5. 브라우저 콘솔 에러 0
6. `shared/api_spec.md` 업데이트 (새 엔드포인트 추가 시)

## 세션 복원

이 프로젝트 작업 이어할 때:
1. `SESSION_STATE.md` 읽기 — 직전 크래시/작업 맥락
2. `CLAUDE.md` (이 파일) — 공통 원칙
3. 해당 영역 서브 CLAUDE.md (`ui/`, `server/`)
4. 필요 시 `shared/decisions.md` — 과거 아키텍처 결정 이유
