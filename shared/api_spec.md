# API 스펙 (백엔드 → 프론트 공유)
> 백엔드팀이 관리, 프론트팀이 참조
> 엔드포인트 추가/변경 시 반드시 여기에 기록
> Base URL: 로컬 `http://localhost:8000` / 외부 `https://api.600g.net`

---

## 인증

| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| POST | /api/auth/owner | `{password: str}` | `{ok, token, role}` |
| POST | /api/auth/register | `{nickname: str, code: str}` | `{ok, token, user}` |
| POST | /api/auth/verify | `{token: str}` | `{ok, user}` |
| POST | /api/auth/create-code | `{role: str, memo?: str}` | `{ok, code}` |
| GET | /api/auth/codes | - | `{ok, codes: [...]}` |
| GET | /api/auth/users | - | `{ok, users: [...]}` |
| GET | /api/auth/roles | - | `{ok, roles: {...}}` |

## 스탠바이 모드

| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| POST | /api/standby/on | - | `{ok, standby: true}` |
| POST | /api/standby/off | - | `{ok, standby: false}` |
| GET | /api/standby | - | `{ok, standby: bool}` |

## 팀 관리

| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| GET | /api/teams | - | `[{id, name, emoji, repo, scan: {...}}]` |
| GET | /api/teams/info | - | `[{id, name, emoji, version, last_commit}]` (경량 폴링용) |
| POST | /api/teams | `{name, emoji, desc, type}` | `{ok, team}` (GitHub+클론+CLAUDE.md 자동) |
| DELETE | /api/teams/{id} | - | `{ok}` |
| GET | /api/teams/{id}/guide | - | `{ok, claude_md, system_prompt}` |
| PUT | /api/teams/{id}/guide | `{claude_md: str}` | `{ok}` |

## 팀 순서 / 층 배치

| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| PUT | /api/teams/{id}/order | `{order: int, layer: int}` | `{ok}` |
| PUT | /api/teams/reorder | `{teams: [{id, order, layer}]}` | `{ok}` |
| GET | /api/layout/floors | - | `{ok, floors: [{floor, teams: [...]}]}` |
| PUT | /api/layout/floors | `{layout: {"1": [ids], "2": [ids]}}` | `{ok}` |

> ⚠️ floors API에서 `cpo-claude`, `server-monitor`는 자동 필터 (게임 별도 렌더링)

## 에이전트

| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| GET | /api/agents/status | - | `{ok, agents: [{id, working, tool, pid, ...}]}` |
| POST | /api/agents/{id}/restart | - | `{ok}` |

## 대시보드

| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| GET | /api/dashboard | - | `{agents, system, services, activity, version}` |
| GET | /api/token-usage | - | `{ok, today: {...}}` |
| GET | /api/project-types | - | `{ok, types: [...]}` |
| GET | /api/repos | - | `{ok, repos: [...]}` |

## 디스패치 (CPO 주도)

| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| POST | /api/dispatch/smart | `{message: str}` | SSE 스트림 (phase 이벤트) |
| POST | /api/dispatch | `{message, teams: [ids]}` | SSE 스트림 |
| GET | /api/dispatch | - | `[{id, status, teams, ...}]` |
| GET | /api/dispatch/{id} | - | `{id, status, results}` |

### SSE 이벤트 (dispatch/smart)
```
data: {"phase": "routing"}           — CPO 분석 중
data: {"phase": "routed", "teams": [...]}  — 팀 배정 완료
data: {"phase": "team_done", "teams": [...]}  — 팀 완료
data: {"phase": "summarizing"}       — CPO 통합 보고 중
data: {"phase": "summary_chunk", "content": "..."}  — 보고 스트리밍
data: {"phase": "done", "summary": "...", "team_results": {...}}  — 완료
data: {"phase": "error", "error": "..."}  — 에러
```

## 푸시 알림

| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| GET | /api/push/vapid-key | - | `{ok, key: str}` |
| POST | /api/push/subscribe | `{subscription: PushSubscription}` | `{ok}` |
| POST | /api/push/unsubscribe | `{endpoint: str}` | `{ok}` |
| POST | /api/push/test | - | `{ok}` |
| POST | /api/push/119 | `{message: str}` | `{ok}` (긴급 알림) |

## 인앱 알림

| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| GET | /api/notifications | - | `{ok, notifications: [...], unread: int}` |
| POST | /api/notifications/{id}/read | - | `{ok}` |
| POST | /api/notifications/read-all | - | `{ok, unread: 0}` |
| POST | /api/notifications/team/{team_id}/read | - | `{ok, unread: int}` |
| DELETE | /api/notifications/{id} | - | `{ok}` |

## 토큰 예산

| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| GET | /api/budget | - | `{ok, used, limit, remaining, paused, ...}` |
| POST | /api/budget/reset | - | `{ok}` |

## 작업 큐 / 파이프라인

| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| POST | /api/queue/enqueue | `{team_id, message, priority?}` | `{ok, task_id}` |
| GET | /api/queue/status | - | `{ok, queues: {...}}` |
| GET | /api/queue/status/{team_id} | - | `{ok, queue: [...]}` |
| POST | /api/queue/cancel/{task_id} | - | `{ok}` |
| POST | /api/pipeline/run | `{steps: [{team_id, message}]}` | `{ok, pipeline_id}` |
| GET | /api/pipeline/{id} | - | `{ok, status, steps: [...]}` |
| GET | /api/debounce/status | - | `{ok, buffers: {...}}` |

## 웹터미널

| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| POST | /api/terminal/{team_id}/start | - | `{port, status}` |
| DELETE | /api/terminal/{team_id}/stop | - | `{status: "stopped"}` |
| GET | /api/terminal/{team_id}/status | - | `{status, port?, dir?}` |

## 파일 업로드

| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| POST | /api/upload/image | `multipart/form-data (file)` | `{ok, path}` |

## 도구

| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| POST | /api/tools/notion | `{url: str}` | `{ok, content}` |

## 실시간 (WebSocket)

| 타입 | 경로 | 설명 |
|------|------|------|
| WS | /ws/chat/{team_id} | 팀별 실시간 채팅 |

### WebSocket 메시지 형식
```json
// 클라이언트 → 서버
{"message": "텍스트", "images": ["path1"]}
{"action": "cancel"}

// 서버 → 클라이언트
{"type": "text", "content": "응답 텍스트"}
{"type": "status", "content": "도구 사용 중..."}
{"type": "working", "value": true/false}
{"type": "history_sync", "messages": [...]}
```

---

## 변경 기록

| 날짜 | 변경 | 담당 |
|------|------|------|
| 2026-04-06 | 전체 54개 엔드포인트 문서화, SSE/WS 스키마 추가 | CPO |
| 2026-03-29 | 초기 스펙 문서화 (10개) | 고도화 작업 |
