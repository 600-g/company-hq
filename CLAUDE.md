# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**두근컴퍼니 HQ** — 포켓몬 풍 픽셀아트 사무실 위에 여러 AI 에이전트(팀)를 시각화하는 멀티 에이전트 플랫폼. 사용자가 웹/텔레그램으로 CPO·프론트엔드·백엔드·디자인·QA·콘텐츠랩 등에게 말을 걸면, 각 팀이 Claude Code CLI를 통해 실제 코드/문서 작업을 수행한다.

- **배포**: Cloudflare Pages (`company-hq.pages.dev`) — `deploy.sh`로 자동
- **게이트웨이 서버**: 로컬 FastAPI (port 8000) + launchd 자동 실행 (`com.company-hq-server`)
- **버전 규칙**: MAJOR.MINOR.PATCH (현재 v3.0.0). 대형 변경 = MAJOR, 중간 = MINOR, 버그 = PATCH

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

# 백엔드 헬스 체크
python3 -c "import main; print('OK')"    # server/ 안에서 venv 활성화 후

# 전체 배포 (빌드 + Cloudflare Pages push)
bash deploy.sh                           # 루트에서
# → out/version.json에 BUILD_ID(git SHA + timestamp) 주입
# → Cloudflare 20K 파일 한도 대응: sliced/ 자동 제거

# launchd 서비스 재시작
launchctl kickstart -k gui/$(id -u)/com.company-hq-server
```

## 아키텍처 핵심

### 팀(에이전트) 모델
- **source of truth**: `server/teams.json` — `id`(영문, GitHub 레포명) + `name`(한글 표시) + `emoji` + `layer` + `category`
- **시스템 프롬프트**: `server/team_prompts.json` — 팀별 역할/행동 원칙
- **세션**: `server/team_sessions.json` — Claude Code CLI `--resume` 용 세션 ID 영속
- **층 배치**: `server/floor_layout.json` — 게임 씬에서 팀이 어느 층/좌표에 배치되는지
- **ECC 미러**: `~/.claude/agents/doogeun-<role>.md` — Claude Code Task tool에서 네이티브 subagent_type으로 호출 가능 (세션 재시작 필요)

### 특수 팀 (캐릭터 없는 팀)
`cpo-claude`, `server-monitor` 는 게임 캐릭터 렌더링에서 제외된다. 새 특수 팀 추가 시 3곳 필터 필요:
1. `/api/layout/floors` 응답 제외
2. `floor_layout.json` 미포함
3. 프론트 `ALL_FLOORS` 하드코딩 미포함

### 채팅 플로우
```
유저 (웹 채팅 or 텔레그램 @doogeun_hq_bot)
  → FastAPI /ws/chat/{team_id} (WebSocket, ws_handler.py)
  → claude_runner.run_claude() — claude -p 서브프로세스, 세션 유지
  → 응답 스트리밍 → 히스토리 `chat_history/{team_id}.json` 자동 저장
```
- 취소: `action: "cancel"` → SIGTERM → SIGKILL (프로세스 그룹)
- 토큰 예산: 수동 대화 무제한, 자동(cron) 실행만 1M/시간 제한
- 에러 3회 실패 시 옵션 2개 제시 후 대기 (각 팀 프롬프트 규칙)

### Phaser 씬 구조 (ui/app/game/)
- `LoginScene.ts` — 외부 마을/시티뷰 (로그인 화면)
- `OfficeScene.ts` — 내부 사무실 (층별, 팀 아이콘 드래그, 캐릭터 애니메이션)
- `TankShooterScene.ts` — 사무실 아케이드 진입 미니게임
- `OfficeGame.tsx` / `LoginGame.tsx` — Phaser 초기화 래퍼 (Next.js `dynamic import({ ssr: false })`)
- `sprites.ts` — 에셋 프리로드 (key → 파일 매핑 단일 근원)

### 버전/캐시 무효화
- 빌드 시 `deploy.sh`가 `out/version.json`에 `BUILD_ID` 주입
- `components/VersionCheck.tsx` 60초 폴링, 변경 감지 시 caches/SW 자동 정리 + 리로드
- `components/BuildStampInline.tsx` 사이드바 하단 `v3.0.0 · <hash> · 🔄` 시각 확인 + 수동 캐시 클리어 버튼
- localStorage 키: `hq-build-id`, `hq-floor-teams-order`, `hq-chat-history`, `hq-floor-layout`, `hq-arcade-pos`, `hq-server-pos`

## 에이전트 생성 시 주의 (현재 구조)

- **표시 이름**: 한글 OK (예: `회고`, `매매봇`)
- **레포 이름**: 영문 소문자/숫자/하이픈만 (GitHub 레포명으로 직결)
- 모달은 표시명에서 레포명 자동 제안하되 사용자가 편집 가능
- 서버가 자동으로: GitHub 레포 생성 → 로컬 클론 → CLAUDE.md 자동 작성 → `team_prompts.json` 등록

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
