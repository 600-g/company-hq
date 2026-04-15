# Phase 2 + 2.5 변경 이력서

> Phase 2 (에이전트 지능 강화) + Phase 2.5 (Skill & Reference 레이어)에서 변경된 내부 로직을 전/후 비교로 정리한 문서

---

## 1. 에이전트 시스템 프롬프트 구성

### Before (Phase 1)

```
executeAgentTask()
  ↓
inferOutputGuidelines(role, description, projectType, framework)
  ↓
하드코딩된 5개 분기 (디자인/개발-nextjs/개발-범용/기획/QA)
  ↓
시스템 프롬프트 = 기본 JSON 형식 + outputGuidelines (정적 문자열)
```

`inferOutputGuidelines()`는 역할을 regex로 판별하고 하드코딩된 문자열을 반환했다. 새 프레임워크나 역할을 추가하려면 이 함수 내부를 직접 수정해야 했다.

```typescript
// Before: 하드코딩된 가이드라인
function inferOutputGuidelines(role, description, projectType, framework): string {
  if (isDev && framework === "nextjs") return "산출물 가이드라인 (개발 역할 - Next.js)...";
  if (isDev) return "산출물 가이드라인 (개발 역할)...";
  if (isDesign) return "산출물 가이드라인 (디자인 역할)...";
  // ...
}

const systemPrompt = `당신은 "${agentRole}" 역할의 AI 에이전트입니다.
...JSON 형식...
${outputGuidelines}`;  // ← 정적 문자열 하나만 주입
```

### After (Phase 2.5)

```
executeAgentTask()
  ↓
selectSkill(role, description, projectType, framework)     → 작업 절차 (Layer 2)
selectReferences(role, description, pType, fw, taskDesc)   → 지식 문서 (Layer 3)
getToolsForRole(role, description)                         → 도구 목록 (Layer 1)
  ↓
시스템 프롬프트 = 기본 JSON 형식 + skillSection + referenceSection + toolInstructions
```

3개 레이어가 독립적으로 동작하고, 시스템 프롬프트에 동적으로 조립된다.

```typescript
// After: 동적 라우팅 + 주입
const skill = selectSkill(agentRole, agentDescription, projectType, framework);
const references = selectReferences(agentRole, agentDescription, projectType, framework, taskDescription);
const tools = options?.enableTools ? getToolsForRole(agentRole, agentDescription) : undefined;

const skillSection = skill ? `\n\n## 작업 가이드\n${skill}` : "";
const referenceSection = references.length > 0
  ? `\n\n## 참고 자료\n${references.join("\n\n---\n\n")}`
  : "";

const systemPrompt = `당신은 "${agentRole}" 역할의 AI 에이전트입니다.
...JSON 형식...
${skillSection}${referenceSection}${toolInstructions}`;
```

**핵심 변화**: `inferOutputGuidelines()` 삭제. 새 역할/프레임워크 추가 시 `skill-router.ts`의 SKILLS/REFERENCES 맵에 항목 추가만 하면 됨.

---

## 2. 에이전트 도구 사용 (Tool Use)

### Before (Phase 1)

```
사용자 → 매니저(refine) → 에이전트(텍스트 생성만) → 산출물
```

에이전트는 `callClaude()`로 텍스트만 생성했다. 기존 프로젝트 파일을 읽거나 명령을 실행하는 것이 불가능했다.

```typescript
// Before: 도구 없음
const raw = await callClaude(
  [{ role: "user", content: userContent }],
  systemPrompt,
  4096,  // maxTokens 고정
);
```

### After (Phase 2)

```
사용자 → 매니저(refine) → 에이전트(도구 사용 + 텍스트 생성) → 산출물
                              ↓
                         read_file("src/app/page.tsx")
                         list_directory("src/components/")
                         run_command("npx tsc --noEmit")
                         read_previous_artifacts()
```

에이전트가 Claude API의 `tool_use` 기능으로 실제 도구를 호출한다.

```typescript
// After: 도구 전달 + maxTokens 증가
const raw = await callClaude(
  [{ role: "user", content: userContent }],
  systemPrompt,
  tools && tools.length > 0 ? 8192 : 4096,  // 도구 사용 시 토큰 증가
  tools,         // ← NEW: Claude API tool 정의
  toolContext,   // ← NEW: workingDirectory + previousArtifacts
);
```

**서버 사이드 도구 실행 루프** (`src/app/api/claude/route.ts`):

```
Claude API 호출
  ↓ stop_reason === "tool_use"?
  YES → tool_use 블록 추출 → executeTool() 실행 → 결과를 대화에 추가 → 다시 호출
  NO  → 최종 응답 반환
  (최대 10회 반복)
```

```typescript
// After: Tool use 루프 (서버 사이드)
while (iterations < MAX_TOOL_ITERATIONS) {
  response = await callAnthropic(apiKey, currentMessages, systemPrompt, maxTokens, tools);

  if (response.stop_reason !== "tool_use") return NextResponse.json(response);

  const toolUseBlocks = response.content.filter(b => b.type === "tool_use");
  const toolResults = [];
  for (const block of toolUseBlocks) {
    const result = await executeTool(block.name, block.input, context);
    toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
  }

  currentMessages.push(
    { role: "assistant", content: response.content },
    { role: "user", content: toolResults },
  );
}
```

**역할별 도구 접근 제어**:

| 역할 | read_file | list_directory | run_command | read_previous_artifacts |
|------|-----------|----------------|-------------|------------------------|
| 개발 | O | O | O | O |
| QA | O | X | O | O |
| 디자인/기획 | X | X | X | O |

**보안**:
- `run_command`: allowlist 기반 (npm, npx, node, tsc, eslint, prettier, next, cat, ls, pwd)
- `read_file`: 프로젝트 디렉토리 내부만 접근 (path traversal 방지: `..` 포함 시 차단)
- 모든 도구: 30초 타임아웃

---

## 3. 요청 라우팅

### Before (Phase 1)

```
사용자 입력 → refineRequirements() → type: "ready"만 존재
  ↓
항상 전체 파이프라인 실행 (모든 팀 × 모든 에이전트)
```

"버튼 색상 바꿔줘" 같은 사소한 수정도 기획 → 디자인 → 개발 → QA 전체가 순차 실행되었다.

### After (Phase 2)

```
사용자 입력 → refineRequirements() → type: "ready" | "ready_direct"
  ↓
"ready"        → 전체 파이프라인 (executePipeline)
"ready_direct" → 특정 에이전트 1명만 (executeDirectAgent)
```

매니저가 요청을 분석해서 전체 파이프라인 vs 특정 에이전트 직접 호출을 자동 결정한다.

```typescript
// After: 라우팅 분기
if (result.type === "ready") {
  await executePipeline(result.spec, result.pipeline, result.projectType, result.framework);
} else if (result.type === "ready_direct") {
  await executeDirectAgent(result.spec, result.target, result.projectType, result.framework);
}
```

**`ready_direct` 판단 기준** (매니저 시스템 프롬프트에 포함):
- 이전 대화에서 이미 결과물이 생성된 상태
- 사용자가 작은 수정 요청 (색상 변경, 텍스트 수정, 버그 수정 등)
- → 관련 에이전트 1명만 직접 호출

---

## 4. 파이프라인 상태 관리

### Before (Phase 1)

```
executePipeline() → 순차 실행 → 완료 또는 에러 throw
```

파이프라인 상태가 메모리에만 존재했다. 브라우저 새로고침 시 상태 소실. 어디까지 실행되었는지 추적 불가.

### After (Phase 2)

```
executePipeline()
  ↓
pipelineStore.createPipeline() → localStorage에 상태 저장
  ↓
각 에이전트 실행 전: updateAgentStep(i, idx, "running")
  ↓
각 에이전트 실행 후: updateAgentStep(i, idx, "completed" | "failed", result, error)
  ↓
중단 시: getResumePoint() → 재개 지점 반환
  ↓
완료 시: clearPipeline()
```

```typescript
// After: 파이프라인 상태 타입
interface PipelineState {
  id: string;
  sessionId: string;
  spec: string;
  steps: TeamStep[];           // 팀별 상태
  status: StepStatus;          // 전체 파이프라인 상태
  createdAt: number;
  updatedAt: number;
}

interface TeamStep {
  teamId: string;
  teamName: string;
  status: StepStatus;          // pending → running → completed | failed
  agents: AgentStep[];
}

interface AgentStep {
  agentId: string;
  agentRole: string;
  status: StepStatus;
  retryCount: number;          // 재시도 횟수
  result?: { summary: string; artifacts: Artifact[] };
  error?: string;
}
```

Zustand + `persist` 미들웨어로 `localStorage`에 자동 저장되어 새로고침 후에도 상태 유지.

---

## 5. 출력 검증 + 자동 재시도

### Before (Phase 1)

```
에이전트 실행 → 결과 그대로 사용자에게 전달
```

에이전트가 빈 summary, 빈 content, 잘못된 JSON을 반환해도 그대로 표시되었다.

### After (Phase 2)

```
에이전트 실행 → validateAgentOutput() → 실패 시 재시도 (최대 2회)
                                         ↓
                                    이슈를 피드백으로 전달
                                         ↓
                                    에이전트 재호출
```

```typescript
// After: 검증 규칙
function validateAgentOutput(result: AgentTaskResult): ValidationResult {
  // 1. summary 비어있는지
  // 2. artifact content 비어있는지
  // 3. code artifact의 language 필드 누락
  // 4. JSON 파일의 JSON.parse 검증
}

// After: 재시도 루프
let retries = 0;
let validation = validateAgentOutput(result);
while (!validation.valid && retries < MAX_RETRIES) {
  retries++;
  pipelineStore.incrementRetry(teamIndex, agentIndex);
  // 이슈를 에이전트에게 피드백으로 전달하며 재호출
  result = await executeWithRetry(..., validation.issues);
  validation = validateAgentOutput(result);
}
```

---

## 6. HR 에이전트

### Before (Phase 1)

팀 구성은 사용자가 수동으로만 변경 가능했다.

### After (Phase 2)

```
파이프라인 완료
  ↓
analyzeTeamPerformance(pipelineState, teams)
  ↓
Claude가 파이프라인 결과 분석
  ↓
HRSuggestion[] 반환
  ↓
HRSuggestionPanel에서 승인/거절 UI 표시
  ↓
승인 시: teamStore.addAgentToTeam() / removeAgentFromTeam()
```

**HR 분석 기준**:
- 실패/재시도 많은 에이전트 → 역할 세분화 또는 보조 에이전트 추가 제안
- QA 에이전트 없는 개발 팀 → QA 추가 제안
- 역할 중복 → 제거 또는 역할 변경 제안
- 모든 에이전트 성공 → 빈 배열 (제안 없음)

---

## 7. 에러 수정 (fixErrorWithAI)

### Before (Phase 1)

```typescript
// Before: 하드코딩된 Next.js 가이드
const frameworkGuide = detectedFramework === "nextjs"
  ? "## Next.js 관련 주의사항\n- App Router vs Pages Router 혼용 금지\n..."
  : "";
```

### After (Phase 2.5)

```typescript
// After: Reference 파일에서 동적 로드
const errorRefs = selectErrorFixReferences(projectType, detectedFramework, errorOutput);
const referenceSection = errorRefs.length > 0
  ? `\n## 참고 자료\n${errorRefs.join("\n\n---\n\n")}`
  : "";
```

에러 내용에 `tailwind`, `postcss`, `css` 키워드가 있으면 Tailwind v4 레퍼런스도 자동 추가. 프레임워크별 지식이 일원화되어 `executeAgentTask()`와 `fixErrorWithAI()` 모두 동일한 Reference 소스를 참조한다.

---

## 전체 아키텍처 변화 요약

### Before (Phase 1)

```
사용자
  ↓
매니저 (refineRequirements)
  ↓ type: "ready" (전체만 가능)
팀1 에이전트들 (텍스트만 생성)
  ↓
팀2 에이전트들 (텍스트만 생성)
  ↓
결과 표시
```

### After (Phase 2 + 2.5)

```
사용자
  ↓
매니저 (refineRequirements) ──→ type: "ready_direct" ──→ executeDirectAgent()
  ↓ type: "ready"                                          (에이전트 1명만)
  ↓
pipelineStore.createPipeline()          ← 상태 영속 (Layer 0)
  ↓
팀1 에이전트들
  ├─ selectSkill() → 작업 절차 주입     ← Skill (Layer 2)
  ├─ selectReferences() → 지식 주입     ← Reference (Layer 3)
  ├─ getToolsForRole() → 도구 부여      ← Tool Use (Layer 1)
  ├─ executeAgentTask() + tool use 루프
  ├─ validateAgentOutput() → 재시도     ← 출력 검증
  └─ updateAgentStep() → 상태 기록
  ↓
팀2 에이전트들 (동일 프로세스)
  ↓
analyzeTeamPerformance()                ← HR 분석
  ↓
HRSuggestionPanel → 승인/거절          ← 팀 동적 관리
  ↓
clearPipeline()
```

---

## 신규/수정 파일 목록

### 신규 파일 (18개)

| 파일 | 역할 |
|------|------|
| `src/lib/skill-router.ts` | Skill/Reference 선택 라우터 |
| `src/lib/agent-tools.ts` | 도구 정의 + 역할별 매핑 |
| `src/lib/server/tool-executor.ts` | 서버 사이드 도구 실행기 |
| `src/lib/hr.ts` | HR 분석 함수 |
| `src/types/pipeline.ts` | 파이프라인 상태 타입 |
| `src/stores/pipelineStore.ts` | 파이프라인 Zustand 스토어 |
| `src/components/team/HRSuggestionPanel.tsx` | HR 제안 UI |
| `src/lib/skills/dev-web-nextjs.md` | 개발(Next.js) 스킬 |
| `src/lib/skills/dev-generic.md` | 개발(범용) 스킬 |
| `src/lib/skills/design.md` | 디자인 스킬 |
| `src/lib/skills/planning.md` | 기획 스킬 |
| `src/lib/skills/qa.md` | QA 스킬 |
| `src/lib/references/frameworks/nextjs-app-router.md` | Next.js 레퍼런스 |
| `src/lib/references/frameworks/react-patterns.md` | React 레퍼런스 |
| `src/lib/references/styling/tailwind-v4.md` | Tailwind v4 레퍼런스 |
| `src/lib/references/styling/shadcn-ui.md` | shadcn/ui 레퍼런스 |
| `src/lib/references/patterns/auth-patterns.md` | 인증 패턴 레퍼런스 |
| `src/lib/references/patterns/api-patterns.md` | API 패턴 레퍼런스 |

### 수정 파일 (5개)

| 파일 | 변경 내용 |
|------|----------|
| `src/lib/claude.ts` | `inferOutputGuidelines()` 삭제, `selectSkill()`/`selectReferences()` 주입, `validateAgentOutput()` 추가, `fixErrorWithAI()` Reference 적용 |
| `src/app/api/claude/route.ts` | tool use 루프 추가 (최대 10회), `executeTool()` 연동 |
| `src/hooks/useChatSend.ts` | `executeDirectAgent()` 추가, 파이프라인 상태 추적 통합, 검증/재시도 루프, HR 분석 호출 |
| `src/stores/teamStore.ts` | `addAgentToTeam()`, `removeAgentFromTeam()` 추가 |
| `outputs/roadmap/roadmap.md` | Phase 2 + 2.5 완료 반영 |

---
마지막 업데이트: 2026-03-05
