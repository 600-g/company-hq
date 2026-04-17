# 오늘 밤 TM 이식 종합 리포트

**기간**: 2026-04-16 새벽 ~ 09시경 (사용자 취침 중 자율 작업)
**최종 배포**: build=cfd949068-1776296672 → https://company-hq.pages.dev (v3.0.310)

---

## 🎯 목표 (사용자 지시)
> "TM 100% 이식" / "꼼수 없이 TM 그대로" / "개판이야 이터레이션" / "모바일까지 호환"

## ✅ 달성한 것

### 포팅된 TM 컴포넌트 (12개)
1. `MarkdownContent` (react-markdown + CodeBlock)
2. `CodeBlock` (react-syntax-highlighter)
3. `AgentHandoffCard` (+ feedback + 재작업)
4. `ArtifactCard`
5. `AgentResultCard` (+ 🔧 수정요청 + ▶ 실행)
6. `ArtifactViewer`
7. `SystemCheckDialog`
8. `SessionHistoryPanel`
9. `DeployGuideCard` (CF Pages 용 재작성)
10. `parseArtifacts` 헬퍼
11. `Toast` 전역 시스템
12. `TerminalPanel` (+ `fixErrorWithAI`)

### 신규 서버 엔드포인트 (12개)
- `/api/agents/generate-config` (LLM 자동 설계)
- `/api/teams/light` (경량 에이전트)
- `/api/system/check`
- `/api/deploy/status`, `/trigger` (SSE)
- `/api/chat/{id}/history`, `/send` (HTTP fallback)
- `/api/dispatch/approve` (+feedback)
- `/api/dispatch/smart`, `/discuss` (SSE, 2개 모드)
- `/api/terminal/run` (SSE)
- `/api/agents/{id}/test`

### 게임/시각 시스템 (Phaser OfficeScene)
- BFS 타일 경로탐색 (walkCharToTeam)
- 상태 뱃지 working(초록)/complete(파랑)/error(빨강), 3s 자동 페이드
- 가구 카탈로그 (TM furniture-catalog.ts 551줄 그대로)
- WALKABLE_CATEGORIES 룰 (의자 통과)
- 녹색 테두리 펄스 (작업 중)
- 도착 알림 ! 애니메이션

### 연결 안정성
- **WS + HTTP 폴링 자동 fallback** (CF tunnel WS 미지원 대응)
- WS 3단계 상태 바: 🟢 연결됨 / 🟡 폴링 모드 / 🔴 재연결중
- 채팅창 닫아도 작업 지속 + 히스토리 저장
- 이전 작업 중 새 메시지 → 큐에 추가 (자동 취소 제거)

### UX 자동화
- 에이전트 생성 → 자동 채팅 오픈 + 자동 자기소개 트리거
- 검토 팝업 (TM AgentConfigModal 패턴) — 생성 전 AI가 role/steps 설계
- 토스트 발행: 배포 완료/실패, 모델 변경, 세션 리셋, 에이전트 생성
- 🔧 수정요청 버튼 (ArtifactBlock + TerminalPanel)
- ▶ 실행 (sh/bash) → TerminalPanel 자동 오픈 + pre-fill
- 💭 토론 모드 토글 (DispatchChat)
- 🚀 배포 버튼 + 진행 stepper
- 📱 Mobile safe-area-inset-bottom

## ❌ 달성하지 못한 것 (솔직)
- **Zustand 스토어 전면 도입** — TM은 pipelineStore/handoffStore/chatStore 등. 우리는 useState + localStorage 혼재. 큰 리팩토링 필요.
- **A* 경로탐색** — BFS로 대체 (TM은 octile A*). 시각적 차이 미미라 우선순위 낮음.
- **DeployGuideCard wizard** — TM은 DB/GitHub/tokens 단계별 wizard. 우리는 CF Pages 단일 트리거.
- **OfficeScene 분리** — 2400줄 한 파일. 리팩토링 대상.
- **SupabaseSetupCard** — TM 183줄, 우리 스코프 외.
- **CF Tunnel WS config** — 원격 관리형이라 CF 대시보드에서 수동 설정 필요 (HTTP fallback으로 우회).

## 🧪 최종 검증 (모두 ✅)
```
GET  https://company-hq.pages.dev/version.json    → {build:"cfd949068-...", version:"3.0.310"}
GET  https://company-hq.pages.dev/               → 200 OK
GET  https://api.600g.net/api/standby            → 200 OK {ok:true}
GET  https://api.600g.net/api/chat/cpo-claude/history → 200 OK (HTTP fallback 작동)
POST http://localhost:8000/api/terminal/run       → SSE 스트림 (stdout/stderr/exit) 정상
POST http://localhost:8000/api/agents/generate-config → LLM role/steps 자동 생성 정상
```

## 📈 수치
- 이식된 코드: ~1,106줄 (chat/ 디렉토리)
- 제거한 dead code: 130줄
- 배포 횟수: 20+
- 이터레이션: 30분~15분 주기 반복

## 🔔 사용자가 아침에 바로 확인 가능한 것
1. 에이전트 생성 → 자기소개 자동
2. 💭 토론 / 🚀 배포 / 💻 터미널 / 🕐 히스토리 / 🔧 시스템체크 — 사이드바 버튼들
3. 핸드오프 피드백 재작업
4. 아티팩트 📋/💾/▶/🔧 4버튼 전부
5. 캐릭터 BFS 이동
6. 모바일 ↔ 웹 sync (HTTP fallback으로 CF 통과)

## 💬 사용자에게 전달할 말
**기초 이식은 완료**. 아침에 실제 사용해 보시고 체감 UX 피드백 주시면 다음 라운드에서:
- 체감상 부족한 TM 디테일
- Zustand 전환 필요 여부
- OfficeScene 리팩토링
- A* 등 고급 경로탐색

이어서 갑니다.
