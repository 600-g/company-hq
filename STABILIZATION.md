# 안정화 트랙커

> 시작: 2026-05-08 · 목표: 1개월 기능 동결 + 코드 최소화 + 테스트 토대 구축

## 베이스라인 (2026-05-08)

### 코드 크기 (위험 신호 = 800줄 초과)

| 파일 | 줄수 | 위험도 |
|---|---|---|
| `server/main.py` | **4,681** | 🔴 CRITICAL — 모든 endpoint 한 파일 |
| `doogeun-hq/src/app/hub/page.tsx` | **1,996** | 🔴 |
| `doogeun-hq/src/components/HubOffice.tsx` | **1,585** | 🔴 |
| `server/claude_runner.py` | **1,388** | 🔴 |
| `server/ws_handler.py` | **1,188** | 🔴 |
| `doogeun-hq/src/game/tm-furniture-catalog.ts` | 742 | 🟡 (데이터 — OK) |

### 커밋 패턴 (최근 30일)

| 타입 | 건수 | 비고 |
|---|---|---|
| fix | **104** | 본질적 이슈 누적 |
| feat | **111** | 1:1 ratio — 짓는 만큼 고침 |

→ 새 기능 1줄 추가 = 평균 1개의 fix 발생.

### 자동 테스트 커버리지

| 영역 | 커버리지 |
|---|---|
| 프론트엔드 | **0%** (Playwright/Jest 미설치) |
| 백엔드 | **0%** (pytest 미설치) |
| 빌드 검증 | 수동 (`npx next build`) |

### 자동 복구가 가린 누적 버그 사례

- SQLite connection 누수 → **1개월 누적** (5/5 발견)
- `ws_handler.py` logger NameError → **silent 실패** (5/3 발견)
- 스태프 버튼 누락 → **3일 누적** (5/8 발견, 사용자 신고)

→ 자동 복구가 *retry* 로 덮어쓰면서 진짜 원인 발견 지연.

---

## 실행 순서

### 1단계 — 분할 (위험 0, 동작 변경 0)
- [x] **AgentSelector 분할** — `page.tsx` 1996줄 → `components/AgentSelector.tsx` 분리. 5/8 스태프 버튼 누락이 일어난 영역
- [ ] **HubOffice 분할** — `buildBlockedCells / buildSeatCells / pickSpriteKey` 등 헬퍼를 `lib/office-helpers.ts` 로
- [ ] **main.py 라우터 분할** — `routers/admin.py`, `routers/agents.py`, `routers/dispatch.py` 등으로
- [ ] **claude_runner.py 분할** — runner 로직 vs 모델 라우팅 분리

### 2단계 — 테스트 토대
- [ ] Playwright 설치 + 5 smoke test (로그인/채팅/에이전트생성/디스패치/빌드)
- [ ] pytest 설치 + 백엔드 5 smoke test (헬스/팀목록/dispatch/state/SQLite read)
- [ ] git pre-push hook — 빌드 + smoke test 통과 안 하면 push 차단

### 3단계 — 자동 복구 audit
- [ ] `_auto_recovery_dispatch` flag화 — `AUTO_RECOVERY=0` 기본
- [ ] 실패 시 사용자 채팅창에 `❌ 실패: <원인>` 직접 노출 (retry 없이)
- [ ] 1주 운영 후 drift 측정 → 진짜 원인 잡고 → 다시 자동 복구 켤지 결정

### 4단계 — 에이전트 생성 트랜잭션화
- [ ] teams.json + team_prompts.json + GitHub repo + clone 4단계 → 단일 트랜잭션
- [ ] 한 단계 실패 시 자동 롤백
- [ ] `/api/teams/light` 와 `/api/teams` 통합 검토

---

## 동결 규칙 (1개월)

- 🚫 새 기능 추가 금지 (`feat:` 커밋 금지)
- 🚫 새 에이전트 추가 금지 (기존 에이전트 동작 안정화 먼저)
- ✅ `fix:` `refactor:` `test:` `docs:` 만 허용
- ✅ 응급 보안 패치는 예외

---

## 진행 기록

### 2026-05-08
- 베이스라인 측정 완료
- ✅ **1단계-1: AgentSelector 분할** — `page.tsx` 1996→1769 (-227)
- ✅ **1단계-2: HubOffice 헬퍼 분할** — `HubOffice.tsx` 1585→1465 (-120) → `lib/office-helpers.ts` 134줄
- ✅ **2단계: smoke_test.sh** — 6종 회귀 검증 30초, 종료코드로 CI 가능
- ✅ **3단계: 자동복구 flag화** — `AUTO_RECOVERY=0` 으로 끄기 + 트리거 빈도 logger.warning
- 🟡 **남음**: main.py 4681 분할, claude_runner.py 분할, 에이전트 생성 트랜잭션화

### 누적 효과
- 단일 거대 파일 2개 분할 (-347 줄, 동작 변경 0)
- 회귀 검증 자동화 (30초 안에 5종 그린/레드)
- 자동복구 가시성 확보 (이젠 로그에서 빈도 측정 가능)
- 다음 스파이크 발생 시 진짜 원인 가시화 옵션 (`AUTO_RECOVERY=0`)
- ✅ **1단계-3: main.py 분할 1차** — `main.py` 4681→4394 (-287, -6.1%)
  - `routers/admin_patch.py` 247줄 (patch-log/release-notes + commit 파싱 헬퍼)
- ✅ **1단계-4: main.py 분할 2차** — `main.py` 4394→4099 (-299, 누적 -12.4%)
  - `routers/admin_ops.py` 309줄 (git-head/deploy/memory + 모듈 상태)
  - APIRouter 패턴 정착 — 다음 분할 표준
- ✅ **1단계-5: claude_runner.py 분할 1차** — `claude_runner.py` 1388→1232 (-156, -11.2%)
  - `budget.py` 187줄 (토큰 예산 + JSONL 파싱 + rate limit 추적)
  - STANDBY_FLAG는 claude_runner 유지 (main.py 호환)
- ✅ **1단계-6: main.py 분할 3차** — office_layout 라우터 (-47)
- ✅ **1단계-7: main.py 분할 4차** — furniture 라우터 (-63)
- ✅ **1단계-8: main.py 분할 5차** — diag 라우터 (-451, ws_handler import 갱신)
- ✅ **1단계-9: main.py 분할 6차** — system 라우터 (-108) standby/budget/staff/notify
- ✅ **1단계-10: page.tsx 분할 2차** — Bugs.tsx (-345)
- ✅ **1단계-11: page.tsx 분할 3차** — Lab.tsx + AgentsModal.tsx (-137)
- ✅ **1단계-12: page.tsx 분할 4차** — Sidebar.tsx (-87)
- ✅ **1단계-13: main.py 분할 7차** — agents 라우터 (-169) lazy import 패턴
- ✅ **4단계: 에이전트 생성 트랜잭션화** — `/api/teams/light` 4단계 롤백

### 누적 효과 (2026-05-08 끝)

| 파일 | 시작 | 현재 | 감소 |
|---|---|---|---|
| `server/main.py` | 4,681 | **3,495** | **-1,186 (-25.3%)** |
| `server/claude_runner.py` | 1,388 | **1,232** | -156 (-11.2%) |
| `doogeun-hq/src/app/hub/page.tsx` | 1,996 | **1,288** | **-708 (-35.5%)** |
| `doogeun-hq/src/components/HubOffice.tsx` | 1,585 | **1,465** | -120 (-7.6%) |
| **합계** | 9,650 | **7,480** | **-2,170 줄** |

신규 자체 완결 모듈 (이번 세션 +5):
- `routers/office_layout.py` 68줄
- `routers/furniture.py` 84줄
- `routers/diag.py` 463줄 (ws_handler 도 import)
- `routers/system.py` 134줄
- `components/hub/Bugs.tsx` 248줄
- `components/hub/Lab.tsx` 111줄
- `components/hub/AgentsModal.tsx` 154줄
  - sandbox/TEAMS/prompts/layout 단계별 try/except + 자동 롤백
  - 어느 단계 실패하든 ghost 에이전트 안 생김
  - 사용자 "에이전트 1개도 못 만든다" 체감 직접 해소
