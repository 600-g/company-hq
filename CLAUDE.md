# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**두근컴퍼니 HQ** — 픽셀아트 사무실 위에 여러 AI 에이전트(팀)를 시각화하는 멀티 에이전트 플랫폼 (600g.net). 사용자가 웹/모바일에서 스태프·CPO·프론트엔드·백엔드·디자인·QA·콘텐츠랩 등에게 말을 걸면, 각 팀이 Claude Code CLI 또는 무료 LLM(Gemini/Gemma 4)을 통해 실제 코드/문서/대화 작업을 수행한다.

### 핵심 구조
- **메인 프론트엔드**: `doogeun-hq/` (Next.js 16 + React 19 + Phaser 3, CF Pages → 600g.net)
- **백엔드**: `server/` (FastAPI + Python 3.14 + Claude Runner + 무료 LLM 라우터, port 8000, `com.company-hq-server` launchd)
- (2026-04-27 정리) `ui/` (deprecated 레거시) + `teammaker-classic/` (별개 dev 도구) 둘 다 삭제. 핵심 기능은 모두 `doogeun-hq/` 로 흡수됨. 복원 필요 시 GitHub `600-g/company-hq` 의 `e2a02a6eb` 이전 commit 들에 보존.

### 멀티 LLM 절감 구조
- Claude Max 플랜은 코드 작업 + CPO 결정에만
- 일상 응답·라우팅·요약·분류는 **Gemini 2.5 Flash** (무료, 분15/일1500) → **Gemma 4 26B/E4B** (로컬 무한) 폴백
- 평균 Claude 토큰 40-60% 절감 (`/api/staff/stats` 로 확인)

## 일상 명령어

```bash
# 메인 프론트엔드 dev
cd doogeun-hq && npm run dev                 # localhost:3000

# 빌드 검증 (커밋 전 필수)
cd doogeun-hq && npx next build              # TypeScript 통과 + static export

# 배포 (빌드 + CF Pages + 백엔드 자동 재시작)
bash deploy.sh                                # 루트에서
# → out/version.json 에 BUILD_ID 주입
# → wrangler pages deploy
# → launchctl kickstart com.company-hq-server (백엔드 코드 변경 반영)

# 백엔드 import sanity check
cd server && source venv/bin/activate && python3 -c "import main; print('OK')"

# 백엔드 수동 재시작 (코드 변경 적용)
launchctl kickstart -k "gui/$(id -u)/com.company-hq-server"

# 백엔드 헬스
curl -s http://localhost:8000/api/teams | head -c 200

# 무료 LLM 통계 (스태프 사용량)
curl -s http://localhost:8000/api/staff/stats | python3 -m json.tool

# Gemini 2.5 Flash 직접 호출 (.env 의 GEMINI_API_KEY 사용)
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY" -H "Content-Type: application/json" -d '{"contents":[{"parts":[{"text":"hi"}]}]}'

# Gemma 4 로컬 (Ollama)
ollama list                                  # gemma4:26b + gemma4:e4b + qwen2.5:14b (코인봇)
curl http://localhost:11434/api/generate -d '{"model":"gemma4:26b","prompt":"안녕","stream":false}'
```

### uvicorn은 `--reload` 제거됨
`scripts/hq_server_start.sh` 가 `--reload` 없이 실행. 코드 편집은 디스크에만 적용 — 사용자 WS 안 끊김. **`bash deploy.sh` 또는 `launchctl kickstart`** 만 재시작 트리거. 의도된 배포 시점에만 ~2초 끊김.

## 아키텍처 핵심

### 멀티 LLM 라우터 (`server/free_llm.py`)
모든 라우팅·분류·요약·일상 응답은 `smart_call(task_type, prompt)` 통과:

```
사용자 요청 → smart_call (server/free_llm.py)
                ├─ 1순위: Gemini 2.5 Flash (cloud, 1500/day)
                ├─ 2순위: Gemma 4 26B (로컬 Ollama, 무한)
                └─ 3순위: Gemma 4 E4B (로컬 Ollama, 빠름)

ROUTING_CHAINS:
  routing/refine/summarize → ["gemini", "gemma_e4b", "claude"]
  classify                → ["gemma_e4b", "gemini", "claude"]   (로컬 우선)
  default                 → ["gemini", "gemma_main", "claude"]

claude_runner.run_claude_light()  → smart_call("routing", ...)  (Claude haiku 폴백)
claude_runner.run_claude()        → 팀 모델이 gemini_flash/gemma_main/gemma_e4b 면 free_llm 직접
```

**원칙**: `smart_call` 거치는 작업은 Claude 토큰 0. 진짜 코드 작업만 Claude (sonnet/opus).

### 스태프 에이전트 (`server/staff_engine.py`)
모든 사용자 입력을 1차 받아서 즉답 또는 CPO 위임:

```
사용자 → /ws/chat/staff
        ↓
        의도 분류 (Gemini): chat / status / lookup / calc / summarize / escalate
        ├─ 즉답 가능: Gemini/Gemma 직접 응답 (Claude 0)
        └─ escalate (코드/배포 키워드): "CPO에 부탁드릴게요" + 백그라운드 CPO Claude 호출
```

`staff_stats.json` 누적 — `/api/staff/stats` 로 무료 LLM 사용 비율, 추정 절감 토큰 노출.

### 자가 개선 + 다중 시점 (`server/multi_llm.py`)
복잡 질문(키워드 매칭)에 대해:
- **Phase 1**: `critic_refine_loop` — Gemini 비평 → Gemini 개선 (max 1 iter)
- **Phase 2**: `perspective_consensus` — 기술/사용자/비용 3 관점 병렬 → 종합
- **Phase 3 (`server/daily_llm.py`)**: 매일 03시 launchd `com.doogeun.daily-llm` — Gemma 4 26B 로 어제 chat_history/staff_stats/logs 분석 → `server/llm_insights.json` + 텔레그램 알림

### 팀(에이전트) 모델
- **source of truth**: `server/teams.json` — id(영문, GitHub 레포명) + name(한글) + emoji + category
- **시스템 프롬프트**: `server/team_prompts.json` — 팀별 역할
- **세션**: `server/sessions_store.py` + `server/chat_history/{team_id}/{session_id}.json` (멀티 세션, `_meta.json` / `_active.json`)
- **층 배치**: `server/floor_layout.json`
- **AI 모델 per-agent**: `TEAM_MODELS` (`claude_runner.py`) — `haiku|sonnet|opus|gemini_flash|gemma_main|gemma_e4b` 6종. AgentConfigModal UI 에서 변경

### 특수 팀 (캐릭터 없는 팀)
`cpo-claude`, `server-monitor`, `staff` — 게임 캐릭터 렌더링 분기.
- `cpo-claude`: 매니저 데스크 (별도 그래픽)
- `server-monitor`: 서버실 그래픽
- `staff`: 일반 캐릭으로 렌더 (특별 그래픽 없음)
- 사이드바: `staff` 는 CPO 직후 강제 prepend (없으면 가상 항목)

### 채팅 플로우
```
유저 (웹/모바일)
  ↓ WS 우선, 실패 시 HTTP fallback
  → FastAPI /ws/chat/{team_id}?session_id=xxx (server/ws_handler.py)
  → team_id == "staff" 면 staff_engine.handle()
  → 그 외는 claude_runner.run_claude() — 팀 모델 따라 Claude 또는 free_llm 직접
  → ai_start / ai_chunk / ai_end 이벤트 스트리밍 (chunk 단위)
  → chat_history/{team_id}/{session_id}.json 자동 저장
```

- **stream-json 모드** (`--output-format stream-json --verbose`): tool_use/tool_result/rate_limit 실시간
- **idle timeout 15분**: 이벤트 수신 시마다 리셋
- **이전 작업 유지**: 새 메시지 오면 task_queue/debouncer 큐잉
- **WS 끊겨도 작업 계속**: 재접속 시 `history_sync`
- **CF Tunnel WS 미지원**: `api.600g.net/ws/*` 일부 → 404. HTTP 폴링 fallback
- 취소: `action: "cancel"` → SIGTERM → SIGKILL (프로세스 그룹)

### 핸드오프/디스패치
- `/api/dispatch/smart` — CPO haiku 라우팅 → DAG 실행 (deps 기반 병렬/순차)
- `/api/dispatch/discuss` — 6팀 의견 수렴 (Gemini 우선 → Claude 폴백, 토큰 50% 절감)
- `/api/dispatch/approve` (+feedback) — 인라인 핸드오프 승인 시 `[유저 피드백]` 주입

### 프론트엔드 상태 동기화 (`doogeun-hq/src/lib/useStateSync.ts`)
HTTP-only (CF Tunnel WS 미지원으로 WS 제거):
- 마운트: `GET /api/doogeun/state` → applyRemote (빈 데이터 보호 — 빈 server state 가 로컬 덮어쓰지 않음)
- 로컬 변경: 디바운스 1초 → `PUT /api/doogeun/state` (atomic write — tmp + os.replace + fsync)
- 30초 폴링으로 멀티디바이스 동기화
- 시간별 백업 로테이션 (`server/doogeun_state_backups/` 24시간 보존)
- 마이그레이션: 깨진 spriteKey 자동 리셋 (`migrationDoneRef` 가드, 마운트 1회)

### Phaser 씬 (`doogeun-hq/src/components/HubOffice.tsx`)
1000+ 줄 메인 씬 (구 ui/OfficeScene.ts 의 핵심 패턴 모두 흡수):
- `agentGroup`: 캐릭 컨테이너. `streamingByTeam`/`a.status` 기반 작업 인디케이터 (walk_down 애니 + Y 바운스)
- `lastBubbleByTeam`: 채팅 메시지 머리 위 말풍선 (chatStore.messagesByTeam 변경 시 자동 갱신, 응답 완료 후 6초 자동 사라짐)
- `setBubbleText(teamId, text, autoHideMs)`: 외부에서 말풍선 텍스트 설정
- 캐릭 풀: `CHAR_COUNT = 241` (char_0~240, 모두 128×192). 신규 캐릭 추가 시 비표준 해상도 필터링 필수 (160×192/192×192/129×192 = 우측 잘림 유발)
- spriteKey 자동 영속화 + 깨진 참조 마이그레이션 (마운트 1회)
- 우클릭 컨텍스트 메뉴: `pointerdown` → `hq:agent-ctx` CustomEvent → AgentContextMenu (armed 가드 150ms — 우클릭 직후 click 즉시 닫힘 방지)

### 페이지 라우트 (`doogeun-hq/src/app/`)
- `/hub` (메인 사무실, HubOffice)
- `/auth` (로그인 — 초대 코드 / 오너)
- `/settings` (테마 / 언어 / API 키 / 외부 토큰)
- `/bugs` (버그 티켓 — 체크박스 토글로 해결됨 이동)
- `/agents`, `/server`, `/chat`, `/setup`, `/office`

### AuthGuard (`doogeun-hq/src/components/AuthGuard.tsx`)
zustand persist 의 `onFinishHydration` 콜백으로 정확한 hydration 대기. 이전 `setTimeout(50ms)` race condition 으로 매 배포 후 로그인 풀리던 문제 수정됨. authStore version=1 + partialize(token, user).

### 스피드 / 안정화
- CF Pages `_headers` (doogeun-hq/public/_headers): `_next/static` 1년 immutable, `/assets/*` 1달
- 첫 진입 로딩 오버레이: `PhaserLoadingOverlay` (load.on('progress') 이벤트)
- 채팅 입력 영속화: `localStorage["doogeun-hq-draft-input"]`
- doogeun_state.json 원자적 쓰기 (tmp + fsync + os.replace) — 쓰기 도중 재시작에도 무결성 보장

## 매니저별 AI 모델 (`AgentConfigModal.tsx`)

```
AI 모델 (에이전트마다 독립)

Claude (Max 플랜 — 토큰 소비)
  ⚡ Haiku  / 🧠 Sonnet  / ✨ Opus

🆓 무료 LLM (토큰 0)
  🌐 Gemini Flash    — 클라우드, 분15/일1500
  🧠 Gemma 4 26B    — 로컬, 깊이 추론
  ⚡ Gemma 4 E4B    — 로컬, 빠름
```

서버측 `claude_runner.run_claude()` 진입 시 팀 모델이 무료 LLM 이면 `free_llm.call_*` 직접 호출 → Claude subprocess 미시작.

## 에이전트 생성 (2가지 모드)

### ⚡ 빠르게 만들기 (경량)
- 이름 + 한 줄 설명만
- `POST /api/agents/generate-config` — Gemini가 role/description/outputHint/steps 자동 설계
- 검토 팝업 → 확인 → `POST /api/teams/light` (teams.json + team_prompts.json만)

### 🏗 고도화 (프로젝트 팀)
- 영문 레포명 (GitHub 레포로 직결)
- MD 시스템 프롬프트 직접 기입 (CLAUDE.md 자동 생성)
- `POST /api/teams` — GitHub 레포 + 로컬 클론 + team_prompts.json 등록

## 에셋 작업 (마을/사무실 꾸미기)

**참고**: 에셋 가이드는 GitHub 레포 히스토리(commit `e2a02a6eb` 이전)에서 `ui/public/assets/pokemon_assets/ASSET_GUIDE.md` 로 조회. 신규 정제 에셋은 `doogeun-hq/public/assets/` 안에서 관리.

### 핵심 규칙
1. 원본 `Tilesets/*.png` 직접 크롭 절대 금지
2. `sliced/`, `composites/`, `pokemon_furniture/` 정제된 파일만 사용
3. 파일 경로 사용 전 `ls` 존재 확인 (sprites.ts 에서 missing 파일 → Phaser 빗금 텍스처)
4. 같은 장면 내 시트 혼용 금지
5. 캐릭 추가 시 **128×192 만** (다른 해상도는 우측 잘림 발생)

## 정책 자동 주입 (`server/policies.md`)

모든 팀 시스템 프롬프트 앞에 자동 합류. 한국어 답변 강제 + 오피스 씬 정책 + 디스패치 정책. 정책 변경은 매 다음 호출에 즉시 반영 (재시작 불필요).

## 품질 게이트 (커밋 전)

1. `cd doogeun-hq && npx next build` 성공
2. 백엔드 import: `python3 -c "import main"` 성공
3. 데스크탑(1280px) + 모바일(375px) 양쪽 동작
4. Phaser 씬 기존 기능 정상 (편집 / 드래그 / 말풍선)
5. 콘솔 에러 0
6. WS streaming 정상 (스태프 즉답 + CPO 풀세션)

## 민감 파일 (`.gitignore`)

코드는 푸시, 런타임 데이터는 제외:
- `server/teams.json`, `team_prompts.json`, `team_sessions.json`, `team_evolution.json`
- `server/chat_history/`, `notifications.json`, `push_subscriptions.json`
- `server/doogeun_state.json`, `staff_stats.json`, `llm_insights.json`
- `server/doogeun_state_backups/`, `furniture_overrides.json`
- `server/.env` (Gemini/Anthropic/Telegram 키)

새 백엔드 상태 파일 추가 시: 사용자 데이터·토큰·자주 변경되는 state 면 gitignore.

## 운영 노트 (반복 발생 패턴)

### 8000 포트 squatter
다른 터미널에서 `python -m http.server 8000` 띄우면 FastAPI 시작 실패. `~/claude_112.sh` 가 자동 감지·kill (3분 내 복구). 즉시 복구는 `lsof -ti:8000 | xargs kill -9`.

### state 복구
`doogeun_state.json` 손상 시:
```bash
cp server/doogeun_state_backups/doogeun_state.YYYYMMDD-HH.json server/doogeun_state.json
```
24시간 보존.

### Phaser/TS 빌드 깨짐
HubOffice.tsx 수정 시 `npx next build` 필수 검증. 흔한 에러:
- `setMaxParallelDownloads` 같은 존재하지 않는 Phaser API → `this.load.maxParallelDownloads = N`
- container 외부 변수 참조 → `container.getData("sprite")` 사용

### 캐릭 풀 무결성
`doogeun-hq/public/assets/chars/` 만 관리 (ui/ 삭제 후 단일 디렉토리). 모든 PNG **128×192**. **CHAR_COUNT = 241** (HubOffice.tsx) 와 일치 필수. 비표준 해상도(160×192/192×192/129×192) 는 우측 잘림 발생 → 추가 시 필터링.

## 세션 복원

이 프로젝트 작업 이어할 때:
1. `SESSION_STATE.md` (있으면) — 직전 크래시/작업 맥락
2. `CLAUDE.md` (이 파일) — 공통 원칙
3. `doogeun-hq/CLAUDE.md` (메인 프론트), `server/CLAUDE.md` (백엔드)
4. `~/.claude/projects/-Users-600mac/memory/MEMORY.md` (자동 로드 — 프로젝트 맥락)
