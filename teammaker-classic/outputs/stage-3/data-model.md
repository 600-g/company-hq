# Step 3.6: Data Modeling

**Date**: 2026-02-19
**Status**: Complete

---

## Entity Relationship

```
Team (1) ---> (*) Agent
Task (1) ---> (*) SubTask
Task (*) ---> (*) Team (via teamIds)
ChatMessage (*) ---> (0..1) Task (via taskId)
```

## Core Types

### Team
| Field | Type | Description |
|---|---|---|
| id | string (UUID) | 팀 고유 ID |
| name | string | 팀 이름 (e.g., "마케팅팀") |
| description | string | 팀 설명 |
| agents | Agent[] | 소속 에이전트 목록 |
| status | DeskStatus | idle / working / complete / error |
| position | {x, y} | 그리드 좌표 |
| currentTaskId? | string | 현재 실행 중인 태스크 |

### Agent
| Field | Type | Description |
|---|---|---|
| id | string (UUID) | 에이전트 고유 ID |
| role | string | 역할명 (e.g., "콘텐츠 기획 담당") |
| description | string | 역할 설명 |
| status | AgentStatus | idle / active / pending / complete |
| currentTask? | string | 현재 작업 설명 |

### Task
| Field | Type | Description |
|---|---|---|
| id | string (UUID) | 태스크 고유 ID |
| input | string | 사용자 원본 입력 |
| teamIds | string[] | 매칭된 팀 ID들 |
| subTasks | SubTask[] | 하위 작업 목록 |
| status | TaskStatus | queued / routing / in_progress / complete / error |
| result? | string | 최종 결과 |

### ChatMessage
| Field | Type | Description |
|---|---|---|
| id | string (UUID) | 메시지 고유 ID |
| type | MessageType | user / ai / system |
| content | string | 메시지 내용 |
| timestamp | number | 생성 시각 |
| taskId? | string | 연결된 태스크 |
| teamName? | string | 매칭된 팀명 |

## State Stores

| Store | Key State | Persistence |
|---|---|---|
| settingsStore | apiKey, isApiKeyValid | localStorage |
| officeStore | viewport, dragState, occupiedCells | memory |
| teamStore | teams (Map), selectedTeamId | memory |
| chatStore | messages, isExpanded, isTyping | memory |
| uiStore | modal/panel states, onboarding | memory |

## Files
- `src/types/team.ts`
- `src/types/task.ts`
- `src/types/chat.ts`
- `src/types/canvas.ts`
- `src/stores/*.ts`
