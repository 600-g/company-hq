# ROADMAP

## 개요
Electron IPC 기반 아키텍처를 Next.js API Routes로 전환하고, 에이전트 지능 강화 / 픽셀 캐릭터 비주얼 / FS 직접 접근 + 빌드 에러 핑퐁 / 사용자 레벨별 모드를 단계적으로 구현한다. Phase 0~2.5 완료 상태. 다음: Phase 2.9 (픽셀 캐릭터).

## Phase 0: Electron 데스크탑 전환 (완료)
> 목표: Next.js 앱을 Electron으로 감싸고 IPC로 FS/터미널/API 연동
> 상태: **전체 완료**

- [x] Electron 셸 (BrowserWindow + custom protocol)
- [x] Claude API IPC 전환
- [x] 파일 시스템 IPC 연동
- [x] 터미널 IPC 연동

---

## Phase 1: 아키텍처 마이그레이션 (완료)
> 목표: Electron IPC를 전부 걷어내고, Next.js API Routes로 서버사이드 기능을 통일한다
> 기여하는 핵심 목표: #1 (Electron IPC 의존 제거 + API Routes 전환)
> 상태: **전체 완료** (PR #9)

- [x] Step 1.1: `next.config.ts`에서 `output: "export"` 제거
- [x] Step 1.2: `src/lib/server/config.ts` 생성 — API 키 메모리 캐시 + `.env.local` 영속화
- [x] Step 1.3: `src/lib/server/processes.ts` 생성 — 실행 중 프로세스 Map (터미널 run/kill 간 공유)
- [x] Step 1.4: `src/app/api/claude/route.ts` 생성 — Claude API 프록시 (서버사이드 API 키)
- [x] Step 1.5: `src/app/api/settings/route.ts` 생성 — API 키 GET(마스킹)/PUT/DELETE
- [x] Step 1.6: `src/app/api/fs/*/route.ts` 생성 — save-artifacts, read-file, read-project, create-project, select-directory
- [x] Step 1.7: `src/app/api/terminal/run/route.ts` 생성 — SSE 스트리밍으로 stdout/stderr/exit
- [x] Step 1.8: `src/app/api/terminal/kill/route.ts` 생성 — 프로세스 종료
- [x] Step 1.9: `src/lib/claude.ts` 리팩터 — `callClaudeViaIPC`/`callClaudeViaFetch` 삭제, `/api/claude` 단일 경로. 모든 함수에서 `apiKey` 파라미터 제거
- [x] Step 1.10: `src/lib/download.ts` 리팩터 — `window.electronAPI.fs.*` → `/api/fs/*` fetch 호출
- [x] Step 1.11: `src/components/terminal/TerminalPanel.tsx` 리팩터 — IPC 이벤트 리스너 → SSE 스트림 리더, `isElectron()` 가드 제거
- [x] Step 1.12: `src/components/chat/ArtifactViewer.tsx`, `ArtifactCard.tsx`, `TeamResultCard.tsx` — `isElectron()` 조건부 렌더링 제거
- [x] Step 1.13: `src/stores/settingsStore.ts` 리팩터 — localStorage API 키 → `/api/settings` 호출
- [x] Step 1.14: `src/hooks/useChatSend.ts` — `apiKey` 파라미터 제거
- [x] Step 1.15: `electron/main.ts` — IPC 핸들러 전부 제거, `app://` 프로토콜 제거. 프로덕션: `next start` 자식 프로세스 실행 + BrowserWindow. 개발: `localhost:4827` 로드
- [x] Step 1.16: `electron/preload.ts` 삭제, `src/lib/electron.ts` 삭제
- [x] Step 1.17: `package.json` 스크립트 업데이트 — `dev`(브라우저, 포트 4827), `electron:dev`(Electron), `electron:build`(`.next/` 번들)

**완료 기준**: 모두 충족
- `npm run dev` → 브라우저에서 팀 생성, 채팅, 산출물 저장, 터미널 실행 모두 동작
- `npm run electron:dev` → Electron 창에서 동일 기능 동작
- 프로젝트 내 `isElectron` 검색 결과 0건

**알려진 이슈** (후속 Phase에서 해결):
- 터미널 환경변수가 최소화됨 (`HOME`, `USER`, `LANG`, `TERM`, `SHELL`만 전달) — `-li` 플래그로 `.zshrc` 로드하지만, 커스텀 환경변수 누락 가능
- 네이티브 폴더 선택 다이얼로그가 `prompt()` 텍스트 입력으로 대체됨 — UX 하락

---

## Phase 2: 에이전트 지능 강화 (완료)
> 목표: 전체 파이프라인 재실행 없이 필요한 에이전트만 호출하고, 팀 구성을 동적으로 관리한다
> 기여하는 핵심 목표: #3 (부분 파이프라인 + HR 에이전트)
> 상태: **전체 완료**

### 왜 이 Phase를 먼저 했는가
- 현재 가장 큰 사용성 문제: 사소한 수정 요청에도 전체 파이프라인이 재실행됨
- FS 직접 접근/빌드 에러 루프(구 Phase 2)는 이미 `fixErrorWithAI`와 터미널 SSE가 기반으로 존재하므로, 에이전트 라우팅이 먼저 정교해져야 에러 수정 루프도 효율적으로 동작함
- 기존 `claude.ts`의 `routeTaskToTeam`, `executeAgentTask`, `useChatSend.ts`의 `executePipeline`만 수정하면 되므로 FS API 추가 없이 착수 가능

- [x] Step 2.1: 에이전트 단위 라우팅
  - `RefineResult`에 `ready_direct` 타입 추가하여 단일 에이전트 직접 호출 지원
  - `refineRequirements()` 시스템 프롬프트에 에이전트 목록 포함 + 라우팅 판단 기준 추가
  - `useChatSend.ts`에 `executeDirectAgent()` 함수 추가
  - 변경 파일: `src/lib/claude.ts`, `src/hooks/useChatSend.ts`

- [x] Step 2.2: 에이전트 도구 사용 (Tool Use)
  - 4개 도구 정의: `read_file`, `list_directory`, `run_command`, `read_previous_artifacts`
  - 역할별 도구 매핑 (개발 → 4개, QA → 3개, 디자인/기획 → 1개)
  - 서버 사이드 tool use 루프 (최대 10회 반복)
  - 보안: allowlist 기반 명령 실행, path traversal 방지, 30초 타임아웃
  - 신규 파일: `src/lib/agent-tools.ts`, `src/lib/server/tool-executor.ts`
  - 변경 파일: `src/app/api/claude/route.ts`, `src/lib/claude.ts`

- [x] Step 2.3: 파이프라인 상태 영속 및 재개
  - `PipelineState`, `TeamStep`, `AgentStep` 타입 정의
  - Zustand + persist 기반 파이프라인 스토어
  - `createPipeline()`, `updateAgentStep()`, `getResumePoint()`, `clearPipeline()` 구현
  - 중단된 파이프라인 감지 및 재개 지원
  - 신규 파일: `src/types/pipeline.ts`, `src/stores/pipelineStore.ts`
  - 변경 파일: `src/hooks/useChatSend.ts`

- [x] Step 2.4: 에이전트 출력 검증 및 자동 재시도
  - `validateAgentOutput()` — 빈 summary, 빈 content, 잘못된 JSON, language 누락 검증
  - 검증 실패 시 이슈를 피드백으로 전달하며 최대 2회 재시도
  - 변경 파일: `src/lib/claude.ts`, `src/hooks/useChatSend.ts`

- [x] Step 2.5: HR 에이전트
  - `analyzeTeamPerformance()` — 파이프라인 완료 후 팀 구조 개선 제안
  - `HRSuggestionPanel.tsx` — 제안 UI (승인/거절 버튼)
  - `teamStore`에 `addAgentToTeam()`, `removeAgentFromTeam()` 추가
  - 신규 파일: `src/lib/hr.ts`, `src/components/team/HRSuggestionPanel.tsx`
  - 변경 파일: `src/stores/teamStore.ts`

**완료 기준**: 모두 충족
- "이 버그 수정해줘" → 관련 에이전트 1~2명만 동작, 전체 파이프라인 미실행
- HR 에이전트가 "QA 에이전트 추가 필요" 등 제안하고 사용자 승인 시 팀 변경

---

## Phase 2.5: Skill & Reference 레이어 (완료)
> 목표: 에이전트에게 작업 절차(Skill)와 도메인 지식(Reference)을 동적으로 주입하여 orchestrator 수준의 에이전트 자율성 확보
> 기여하는 핵심 목표: #3 (에이전트 지능 강화 — orchestrator 패턴 완성)
> 상태: **전체 완료**

### 배경
- Phase 2에서 Layer 1 (Tool Use: 에이전트의 "손")을 구현했으나, orchestrator에는 추가로 Skill(작업 절차)과 Reference(지식 문서) 레이어가 있음
- 기존 `inferOutputGuidelines()` 함수에 역할별 지침이 하드코딩 → 확장 불가능
- `.md` 파일 기반 시스템으로 교체하여 코드 수정 없이 새 역할/프레임워크 추가 가능

- [x] Step 2.5.1: Skill 파일 5개 작성
  - 역할별 단계적 작업 절차 정의 (도구 사용 순서 포함)
  - `dev-web-nextjs.md`, `dev-generic.md`, `design.md`, `planning.md`, `qa.md`
  - 신규 디렉토리: `src/lib/skills/`

- [x] Step 2.5.2: Reference 파일 6개 작성
  - 프레임워크/패턴별 지식 베이스 (코드 예시, 주의사항, 설정 가이드)
  - `nextjs-app-router.md`, `react-patterns.md`, `tailwind-v4.md`, `shadcn-ui.md`, `auth-patterns.md`, `api-patterns.md`
  - 신규 디렉토리: `src/lib/references/{frameworks,styling,patterns}/`

- [x] Step 2.5.3: Skill/Reference 라우터
  - `selectSkill()` — 역할 + projectType + framework → 적절한 스킬 반환
  - `selectReferences()` — 역할 + framework + taskDescription 키워드 매칭 → 최대 3개 레퍼런스 (예: "로그인" 키워드 → auth-patterns 자동 추가)
  - `selectErrorFixReferences()` — 에러 수정 시 프레임워크/에러 내용 기반 레퍼런스 반환
  - 신규 파일: `src/lib/skill-router.ts`

- [x] Step 2.5.4: `executeAgentTask()` 통합
  - `inferOutputGuidelines()` 삭제 → `selectSkill()` + `selectReferences()`로 교체
  - 시스템 프롬프트: 기본 지침 + 작업 가이드(skill) + 참고 자료(references) + 도구 안내
  - 변경 파일: `src/lib/claude.ts`

- [x] Step 2.5.5: `fixErrorWithAI()`에도 Reference 적용
  - 하드코딩된 `frameworkGuide` → `selectErrorFixReferences()`로 교체
  - 변경 파일: `src/lib/claude.ts`

**완료 기준**: 모두 충족
- 에이전트 시스템 프롬프트에 Skill 절차 + Reference 내용이 동적 주입됨
- `inferOutputGuidelines()` 완전 제거, 신규 에러 0건
- 3개 레이어 완성: Layer 1 (Tool Use) + Layer 2 (Skill) + Layer 3 (Reference)

---

## Phase 2.9: 픽셀 캐릭터 & 스프라이트 애니메이션
> 목표: 에이전트/매니저 캐릭터를 32×32 픽셀 에셋으로 교체하고, 상태별 스프라이트 애니메이션을 적용한다
> 기여하는 핵심 목표: UX 향상 — 에이전트 상태를 시각적으로 즉각 인지 가능
> 상태: **미착수**

### 배경
- 현재 `OfficeCanvas.tsx`에 에이전트 개별 캐릭터가 없음 (책상 + 텍스트 뱃지만 표시)
- 매니저는 `/man.png` 단일 이미지, 스프라이트 애니메이션 없음
- `assets/2_Characters/Old/Single_Characters_Legacy/32x32/`에 100+개 캐릭터 에셋 보유
- 각 캐릭터에 `idle_anim`, `run`, `sit`, `reading`, `phone` 등 동작별 스프라이트 시트 포함
- PixiJS 8의 `AnimatedSprite`로 바로 활용 가능

### 별도 페이지에서 개발
- `/pixel` 라우트에 독립 페이지 생성 → 기존 오피스 캔버스에 영향 없이 개발/테스트
- 완성 후 `OfficeCanvas.tsx`에 통합

- [ ] Step 2.9.1: 스프라이트 시트 파서 유틸리티
  - 1행 스프라이트 시트 → 프레임 배열 분할 (32×32 기준)
  - 4방향(아래/위/좌/우) × N프레임 구조 파싱
  - 신규 파일: `src/lib/sprite-parser.ts`

- [ ] Step 2.9.2: 캐릭터 에셋 레지스트리
  - 사용할 캐릭터 목록 정의 (역할별 매핑: 개발→Bob, QA→Lucy 등)
  - 캐릭터별 사용 가능한 동작 목록 관리
  - 신규 파일: `src/lib/character-registry.ts`

- [ ] Step 2.9.3: `/pixel` 페이지 생성
  - 캐릭터 선택 + 애니메이션 미리보기 UI
  - 스프라이트 렌더링 테스트 환경
  - 신규 파일: `src/app/pixel/page.tsx`

- [ ] Step 2.9.4: AnimatedSprite 기반 캐릭터 컴포넌트
  - PixiJS `AnimatedSprite` 활용, 상태별 애니메이션 전환
  - 에이전트 상태 매핑: idle→`idle_anim`, working→`reading`, running→`run`, complete→`sit`
  - 신규 파일: `src/components/canvas/PixelCharacter.ts`

- [ ] Step 2.9.5: 매니저 캐릭터 픽셀 교체
  - `/man.png` → 픽셀 스프라이트로 교체
  - phase별 애니메이션: idle→`idle_anim`, refining→`phone`, dispatching→`run`

- [ ] Step 2.9.6: 에이전트 캐릭터를 데스크 위에 렌더링
  - `OfficeCanvas.tsx`의 팀 데스크 렌더링에 에이전트별 픽셀 캐릭터 추가
  - 2×2 그리드 배치 (기존 말풍선 anchorPoint 활용)

- [ ] Step 2.9.7: 상태 전환 애니메이션 연결
  - teamStore/pipelineStore 상태 변경 → 캐릭터 애니메이션 자동 전환
  - 작업 완료 시 파티클 + 캐릭터 동작 연동

**완료 기준**:
- `/pixel` 페이지에서 캐릭터 선택 및 애니메이션 미리보기 동작
- 오피스 캔버스에 에이전트별 픽셀 캐릭터가 표시되고, 상태에 따라 애니메이션 전환
- 매니저 캐릭터도 픽셀 스프라이트로 교체되어 상태별 동작 표시

---

## Phase 3: FS 직접 접근 + 빌드 에러 핑퐁
> 목표: 에이전트가 파일을 지속적으로 읽고 쓰며, 빌드 에러를 자동 감지/수정하는 루프를 구현한다
> 기여하는 핵심 목표: #2 (FS 직접 접근 + 빌드 에러 핑퐁)
> 상태: **일부 선행 완료**

### Phase 2(에이전트 지능)와의 시너지
- Phase 2에서 구현한 에이전트 단위 라우팅 덕분에, 빌드 에러 발생 시 전체 팀이 아닌 담당 에이전트만 호출하여 수정 가능
- Phase 2의 tool use (read_file, list_directory, run_command)가 이미 에이전트에게 파일 시스템 접근 능력을 부여함 — Phase 3에서는 이를 확장하여 자동화된 빌드 에러 루프에 통합

- [x] Step 3.1: `src/app/api/fs/create-project/route.ts` 생성 — `~/TeamMaker/<project-name>/` 자동 생성 (Phase 1에서 선행 완료)
- [ ] Step 3.2: `src/app/api/fs/list/route.ts` 생성 — 디렉토리 목록 조회
- [ ] Step 3.3: `src/app/api/fs/watch/route.ts` 생성 — 파일 변경 감시 (SSE)
- [ ] Step 3.4: `src/app/api/system/check/route.ts` 생성 — Node.js, npm 등 설치 확인
- [ ] Step 3.5: `src/components/setup/SystemCheckPanel.tsx` 생성 — 필요 도구 설치 안내
- [ ] Step 3.6: `src/stores/fileStore.ts` 생성 — 프로젝트 파일 트리 상태
- [ ] Step 3.7: 파이프라인 실행 시 산출물을 프로젝트 디렉토리에 자동 저장하도록 `useChatSend.ts` 수정
- [ ] Step 3.8: `src/lib/errorLoop.ts` 생성 — 터미널 출력 파싱 → 에러 감지 → 관련 에이전트에게 수정 요청 → 파일 쓰기 → 재빌드 루프 (Phase 2의 에이전트 단위 라우팅 활용)
- [ ] Step 3.9: 빌드 에러 핑퐁 UI — 루프 진행 상태 표시 (몇 번째 시도, 에러 내용, 수정 내용)

**완료 기준**:
- 첫 실행 시 프로젝트 디렉토리가 자동 생성되고 산출물이 저장됨
- 빌드 실패 시 에이전트가 에러를 읽고 수정 → 재빌드 → 성공까지 반복 (최대 N회)
- 파일 트리에서 프로젝트 파일 목록 확인 가능

---

## Phase 4: UX 완성
> 목표: 투명성, 편집 가능성, 사용자 수준별 경험을 완성한다
> 기여하는 핵심 목표: #4 (모드별 경험)

- [ ] Step 4.1: `src/types/chat.ts`에 내부 메시지 타입 추가, `useChatSend.ts`에서 매니저→팀 위임 메시지 emit
- [ ] Step 4.2: `src/components/chat/InternalMessageCard.tsx` 생성 — 매니저↔팀 메시지 렌더링
- [ ] Step 4.3: `src/components/team/TeamDetailPanel.tsx` 수정 — 에이전트 추가/삭제/역할 변경 편집 모드
- [ ] Step 4.4: 초/중/고급 모드 구현 — `settingsStore`에 `mode` 추가, 시스템 프롬프트/UI 복잡도 분기
  - 초급(문과): 질문 많이, 자동 결정, 터미널 숨김, 설명 친절
  - 중급(컴공생): 현재 수준 기능, 적당한 자율성
  - 고급(개발자): 최소 질문, 빠른 실행, raw 출력, 프롬프트 편집

**완료 기준**:
- 매니저→팀 지시 메시지가 채팅에 실시간 표시
- 팀 상세 패널에서 에이전트 편집 가능
- 첫 실행 시 모드 선택 → 모드에 따라 UI/프롬프트가 달라짐

---

## Orchestrator 패턴 달성률

| 패턴 | 달성률 | 구현 위치 |
|------|--------|----------|
| State Persistence | 90% | Phase 2.3: pipelineStore (Zustand + localStorage) |
| Smart Resume | 85% | Phase 2.3: getResumePoint() |
| Tool Use | 70% | Phase 2.2: 4개 도구 (read_file, list_directory, run_command, read_previous_artifacts) |
| Output Validation | 95% | Phase 2.4: validateAgentOutput() + 자동 재시도 |
| Task Routing | 75% | Phase 2.1: ready vs ready_direct 분기 |
| Team Management | 80% | Phase 2.5: HR 에이전트 제안 + 승인 |
| Skill (작업 절차) | 90% | Phase 2.5: 5개 스킬 파일 + selectSkill() |
| Reference (지식) | 85% | Phase 2.5: 6개 레퍼런스 파일 + selectReferences() |
| **전체** | **~80%** | Phase 3 완료 시 90%+ 예상 |

---
마지막 업데이트: 2026-03-06
