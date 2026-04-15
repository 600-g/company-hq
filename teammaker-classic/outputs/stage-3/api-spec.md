# Step 3.7: API Design

**Date**: 2026-02-19
**Status**: Complete

---

## API Architecture

MVP에서는 서버 없이 클라이언트에서 직접 Claude API를 호출합니다.

```
Browser -> Claude API (사용자 API Key)
```

## API Functions (`src/lib/claude.ts`)

### 1. `generateTeamConfig(apiKey, teamName, teamDescription) -> Agent[]`

팀 이름/설명을 받아 AI 에이전트 구성을 제안합니다.

- **Input**: 팀 이름, 팀 설명
- **Output**: Agent[] (2~4개 에이전트)
- **Used by**: S3 -> S4 (팀 생성 -> AI 구성 제안)

### 2. `routeTaskToTeam(apiKey, userMessage, teams) -> { teamId, teamName, explanation }`

사용자 메시지를 가장 적합한 팀에 라우팅합니다.

- **Input**: 사용자 메시지, 팀 목록
- **Output**: 선택된 팀 ID + 이유
- **Used by**: 채팅에서 업무 지시 시

### 3. `executeAgentTask(apiKey, agentRole, agentDescription, taskDescription, previousResults?) -> string`

개별 에이전트가 작업을 수행합니다.

- **Input**: 에이전트 정보, 작업 설명, 이전 결과
- **Output**: 작업 결과 텍스트
- **Used by**: 업무 실행 시 에이전트 순차 호출

## Notes

- `anthropic-dangerous-direct-browser-access` 헤더로 브라우저 직접 호출
- JSON 형식 응답을 파싱하여 구조화된 데이터로 변환
- 에러 처리: API 호출 실패 시 에러 메시지 반환
