# TeamMaker → 두근컴퍼니 이식 현황

## ✅ 완료된 TM 컴포넌트 (12개)

| # | 컴포넌트 | 출처 (TM 파일) | 우리 경로 | 상태 |
|---|---------|---------------|-----------|------|
| 1 | MarkdownContent | chat/MarkdownContent.tsx | ui/app/components/chat/ | ✅ |
| 2 | CodeBlock | chat/CodeBlock.tsx | 동일 | ✅ |
| 3 | AgentHandoffCard (+feedback) | chat/AgentHandoffCard.tsx | 동일 | ✅ |
| 4 | ArtifactCard | chat/ArtifactCard.tsx | 동일 | ✅ |
| 5 | AgentResultCard (+🔧수정 +▶실행) | chat/AgentResultCard.tsx | 동일 | ✅ |
| 6 | ArtifactViewer | chat/ArtifactViewer.tsx | 동일 | ✅ |
| 7 | SystemCheckDialog | setup/SystemCheckDialog.tsx | chat/SystemCheckDialog.tsx | ✅ |
| 8 | SessionHistoryPanel | layout/SessionHistoryPanel.tsx | chat/SessionHistoryPanel.tsx | ✅ |
| 9 | DeployGuideCard | chat/DeployGuideCard.tsx | 동일 (CF Pages 용 재작성) | ✅ |
| 10 | parseArtifacts (헬퍼) | lib/artifacts.ts | chat/parse-artifacts.ts | ✅ |
| 11 | Toast | (신규) | components/Toast.tsx | ✅ |
| 12 | TerminalPanel (+fixErrorWithAI) | terminal/TerminalPanel.tsx | chat/TerminalPanel.tsx | ✅ |

## ✅ 완료된 서버 엔드포인트 (12개)

| # | 경로 | 메소드 | 목적 |
|---|------|--------|------|
| 1 | `/api/agents/generate-config` | POST | TM generateAgentConfig — LLM이 role/steps 자동 설계 |
| 2 | `/api/teams/light` | POST | 경량 에이전트 생성 (GitHub 없이) |
| 3 | `/api/system/check` | GET | node/git/npm/cloudflared/claude 버전 체크 |
| 4 | `/api/deploy/status` | GET | git + build 상태 |
| 5 | `/api/deploy/trigger` | POST SSE | `bash deploy.sh` 실행 + 스트림 |
| 6 | `/api/chat/{id}/history` | GET | HTTP 폴링 fallback (WS 대체) |
| 7 | `/api/chat/{id}/send` | POST | HTTP 전송 fallback (이미지 지원) |
| 8 | `/api/dispatch/approve` (+feedback) | POST | 핸드오프 승인 + 피드백 재작업 |
| 9 | `/api/dispatch/smart` | POST SSE | CPO 기본 디스패치 |
| 10 | `/api/dispatch/discuss` | POST SSE | 소크라테스식 토론 |
| 11 | `/api/terminal/run` | POST SSE | 쉘 명령 실행 스트림 |
| 12 | `/api/agents/{id}/test` | POST | 에이전트 스모크 테스트 |

## ✅ 게임/시각 시스템
- **BFS 타일 경로탐색** (walkCharToTeam) — TM pathfinding.ts 패턴
- **상태 뱃지** working(초록)/complete(파랑)/error(빨강) — 3s 자동 페이드
- **녹색 테두리 펄스** 작업 중 표시
- **가구 카탈로그** (TM furniture-catalog.ts 551줄 그대로 포팅)
- **WALKABLE_CATEGORIES** 룰 적용 (의자 통과 가능)
- **도착 알림** ! 텍스트 페이드

## ✅ 연결 안정성
- **WS + HTTP 폴링 fallback** (CF tunnel WS 미지원 대응)
- **WS 3단계 상태** 연결됨/폴링모드/재연결중
- **자동 재연결** with exponential backoff
- **채팅 연속성** 창 닫아도 작업 지속, 히스토리 저장

## ✅ UX
- 신규 에이전트 생성 → **자동 채팅 오픈** + **자동 자기소개 트리거**
- **검토 팝업** (TM AgentConfigModal) — 생성 전 AI가 역할/스텝 설계해 확인받기
- **🔧 수정요청** (ArtifactBlock) — 에러 붙여넣기 → 같은 팀에 재질의
- **▶ 실행** (sh/bash 아티팩트) → TerminalPanel 자동 오픈
- **💭 토론 모드** 토글 (DispatchChat)
- **📱 모바일** safe-area-inset-bottom 지원

## ⏳ 남은 이식 (nice-to-have)
- Zustand 스토어 도입 (chatStore, pipelineStore, handoffStore)
- DeployGuideCard wizard UI (DB 선택, GitHub 연동 등 TM 원본 단계)
- SupabaseSetupCard (TM 183줄)
- AgentConfigModal 전체 — TM은 생성 후에도 설정 수정 가능
- TM FurnitureLayer 클래스화 (현재 함수 기반 renderTMLayoutFull)
- 타일 단위 A* 경로탐색 (현재 BFS) — TM은 octile A*

## 누적 개선 요약
| 항목 | 수치 |
|------|-----|
| TM 컴포넌트 | 12개 |
| 서버 신규 엔드포인트 | 12개 |
| chat/ 컴포넌트 총 라인 | 1,106줄 |
| Dead code 제거 | 130줄 |
| 배포 빌드 수 (이식 기간) | 20+ |
| 프로덕션 검증 | https://company-hq.pages.dev build=cfd949068-1776296672 ✅ |

## 최종 검증 (Smoke Test)
- CF Pages frontend: 200 OK
- api.600g.net/api/standby: 200 OK
- api.600g.net/api/chat/cpo-claude/history: 200 OK (HTTP fallback 작동)
- /api/system/check: 5개 도구 전부 ✅
- /api/terminal/run SSE: stdout/exit 스트림 정상
- /api/agents/generate-config: LLM이 role/description/steps 자동 생성 정상

## 한계 & 현실적 판단
- **Zustand 미도입**: TM은 pipelineStore/handoffStore/chatStore 등 상태 레이어가 Zustand. 우리는 useState + localStorage 혼재. 큰 리팩토링이라 향후 과제.
- **A* 경로탐색 미완**: 현재 BFS (4방향). TM은 octile A* (8방향 + 대각선 cost). 시각적 차이 미미.
- **Cloudflare Tunnel WS**: CF 대시보드에서 ingress WS 명시 안 돼 있어 `/ws/chat/*` 404. HTTP 폴링 fallback으로 우회 — 모바일 정상 동작.
- **OfficeScene 2400줄**: 한 파일. TM OfficeCanvas 3900줄 (PixiJS). 둘 다 분리 필요한 legacy.
