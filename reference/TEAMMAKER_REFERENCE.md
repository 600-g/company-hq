# TEAMMAKER_REFERENCE.md
# TeamMaker 소스 분석 및 두근 AI Company 접목 지침

## 이 문서의 목적
TeamMaker 윈도우 앱의 소스코드를 분석하여,
두근의 AI Company 타이쿤(company-hq)에 장점은 흡수하고
단점은 개선하여 더 나은 시스템을 만드는 것이 목표다.

---

## TeamMaker 소스 위치
```
~/Developer/my-company/company-hq/reference/teammaker-src/
├── stores/
│   ├── officeStore.ts     ← 사무실 레이아웃/타일/가구 시스템
│   ├── agentStore.ts      ← 에이전트(팀원) 관리
│   ├── pipelineStore.ts   ← PM→디자인→개발→QA 파이프라인
│   ├── chatStore.ts       ← 채팅 상태 관리
│   ├── sessionStore.ts    ← 세션/대화 이력 관리
│   └── pipelineStore.ts   ← 단계별 작업 파이프라인
└── lib/
    ├── skill-router.ts    ← 역할별 작업 SOP 자동 선택
    └── skills/
        ├── planning.md    ← 기획 에이전트 절차
        ├── design.md      ← 디자인 에이전트 절차
        ├── dev-web-nextjs.md ← 개발 에이전트 절차
        └── qa.md          ← QA 에이전트 절차
```

---

## TeamMaker 핵심 구조 분석

### 1. 사무실 UI (officeStore.ts)
TeamMaker가 잘 만든 것:
- 타일 기반 격자 사무실 레이아웃 (TileType: FLOOR, WALL, VOID)
- 가구 배치/이동/회전/레이어 순서 조정
- Undo/Redo 히스토리 (최대 10단계)
- 뷰포트 줌인/줌아웃 (0.3x ~ 2.0x)
- 레이아웃 Import/Export (JSON)

우리가 개선할 것:
- TeamMaker는 로컬 앱 → 우리는 웹앱 (맥미니 로컬 서버)
- 가구 배치 대신 각 팀 방이 실제 GitHub 프로젝트와 연결됨
- 타일 에디터 대신 팀 방 클릭 → 채팅창 열림

### 2. 에이전트 시스템 (agentStore.ts)
TeamMaker가 잘 만든 것:
- 에이전트별 상태 관리 (idle / working / done / error)
- 에이전트 위치 추적 (사무실 내 이동)
- 에이전트 선택/포커스

우리가 개선할 것:
- TeamMaker 에이전트 = 가상의 AI 캐릭터
- 우리 에이전트 = 실제 GitHub 프로젝트 + Claude Code CLI 연결
- 상태가 실제 git 커밋/배포 상태와 연동됨

### 3. 파이프라인 (pipelineStore.ts)
TeamMaker가 잘 만든 것:
- PM → 디자인 → 백엔드 → 프론트 → QA 순서 실행
- 각 단계 핸드오프 시 사용자 승인 요청
- 실패 시 자동 재시도 (retryCount)
- 파이프라인 일시정지/재개

우리가 개선할 것:
- TeamMaker는 Claude API 호출 → 비용 발생
- 우리는 Claude Code CLI로 대체 → 무료 (Max 구독 활용)
- 핸드오프 승인을 두근의 QA 보고 양식으로 통일

### 4. 역할별 SOP (skill-router.ts + skills/*.md)
TeamMaker가 잘 만든 것:
- 에이전트 역할에 따라 자동으로 다른 작업 절차 적용
- 기획/디자인/개발/QA 각각 상세한 단계별 지침
- Next.js, Supabase 등 프레임워크별 세분화

우리가 개선할 것:
- 두근 선호 스타일 가이드 반영 (다크모드, 정보 밀도 높은 UI)
- 한국어 커밋 메시지 규칙 추가
- 비용 원칙 (무료 우선) 반영

### 5. 채팅/세션 (chatStore.ts + sessionStore.ts)
TeamMaker가 잘 만든 것:
- 채팅 phase 관리 (idle → refining → executing)
- 세션별 대화 이력 분리 저장
- 세션 전환 시 이전 대화 복원

우리가 개선할 것:
- TeamMaker는 단일 앱 → 우리는 팀(프로젝트)별 채팅 분리
- WebSocket으로 실시간 스트리밍 (터미널처럼)

---

## 접목 작업 지시

### Phase 1 — 사무실 UI 구축
참고 파일: officeStore.ts

다음을 구현한다:
1. TeamMaker의 타일 기반 격자 시스템을 참고하여 사무실 레이아웃 구현
2. 각 팀 방은 타일이 아닌 고정 크기 방(RoomCard)으로 구성
3. 방 안에 표시할 정보:
   - 팀 이름 + 이모지
   - 현재 상태 (운영중 / 작업중 / 오류)
   - 최근 커밋 메시지
   - 최근 커밋 시간
4. 줌인/줌아웃은 officeStore의 viewport 로직 그대로 활용
5. 픽셀아트 도트 스타일 CSS 적용 (다크모드)

TeamMaker 대비 개선점:
- 가구 배치 에디터 불필요 → 제거
- 방 위치는 자동 그리드 배치
- 신규 팀 추가 시 자동으로 빈 자리에 배치

### Phase 2 — 팀 관리 시스템
참고 파일: agentStore.ts

다음을 구현한다:
1. agentStore의 구조를 참고하여 teamStore 구현
2. 각 팀(Team) 데이터 구조:
```typescript
interface Team {
  id: string;
  name: string;
  emoji: string;
  repo: string;              // GitHub 레포명 (600-g/레포명)
  localPath: string;         // 로컬 경로
  status: TeamStatus;        // idle | working | error | deployed
  lastCommit: string;        // 최근 커밋 메시지
  lastCommitAt: string;      // 최근 커밋 시간
  deployUrl?: string;        // 배포 URL (있으면)
}
```
3. GitHub API로 실제 커밋 정보 주기적으로 동기화 (5분마다)

TeamMaker 대비 개선점:
- 에이전트 위치 이동 불필요 → 제거
- 실제 GitHub 데이터와 연동 (가상 상태 아님)

### Phase 3 — 파이프라인 (QA 승인 시스템)
참고 파일: pipelineStore.ts + skills/*.md

다음을 구현한다:
1. pipelineStore의 핸드오프 승인 구조 그대로 활용
2. 단계 순서: PM확인 → 개발 → QA보고 → 두근승인 → 배포
3. QA 보고 양식 (채팅창에 자동 출력):
```
🔍 현재 문제:
[한 줄 설명]

🔧 수정 계획:
[한 줄 설명]
수정 파일: [목록]

⏱️ 예상 시간: [10분 / 30분 / 1시간]

진행할까요? [✅ 승인] [❌ 취소]
```
4. 승인 버튼 클릭 → Claude Code CLI 실행
5. 실패 시 자동 재시도 (최대 3회)

TeamMaker 대비 개선점:
- Claude API 호출 제거 → Claude Code CLI로 대체 (무료)
- 승인 UI를 채팅 메시지 안에 인라인 버튼으로 구현

### Phase 4 — 채팅 + WebSocket 스트리밍
참고 파일: chatStore.ts + sessionStore.ts

다음을 구현한다:
1. chatStore의 phase 관리 (idle → refining → executing) 그대로 활용
2. 팀별 독립 채팅 세션 (sessionStore 구조 참고)
3. WebSocket으로 Claude Code CLI 출력 실시간 스트리밍
4. 터미널처럼 한 글자씩 출력되는 효과

TeamMaker 대비 개선점:
- 로컬 앱 IPC 통신 → WebSocket으로 교체
- 팀별 채팅 이력 분리 (sessionStore 구조 활용)

### Phase 5 — 역할별 SOP 적용
참고 파일: skill-router.ts + skills/*.md

다음을 구현한다:
1. skill-router의 역할 분류 로직 그대로 활용
2. 두근 스타일에 맞게 SOP 내용 커스터마이징:
   - 한국어 커밋 메시지 규칙 추가
   - 다크모드/정보밀도 높은 UI 선호 반영
   - 무료 도구 우선 원칙 반영
3. directives/ 폴더에 각 역할별 .md 파일로 저장

---

## 최종 기술 스택 (TeamMaker 분석 반영)

| 항목 | TeamMaker | 우리 (개선) |
|------|-----------|------------|
| 플랫폼 | Electron (윈도우) | Next.js 웹앱 (맥미니 서버) |
| 상태관리 | Zustand | Zustand (동일) |
| AI 처리 | Claude API (유료) | Claude Code CLI (무료) |
| 통신 | Electron IPC | WebSocket |
| 저장 | localStorage | localStorage + GitHub API |
| 배포 | 설치파일 | Vercel or localhost |

---

## 작업 시작 전 확인사항 (QA 규칙)

각 Phase 시작 전 반드시 아래 양식으로 보고:

```
🔍 현재 문제:
[한 줄 설명]

🔧 수정 계획:
[한 줄 설명]
수정 파일: [목록]

⏱️ 예상 시간: [10분 / 30분 / 1시간]

진행할까요?
```

두근 승인 없이 절대 작업 시작하지 않는다.

---

## Git 규칙
```bash
git add .
git commit -m "한글 커밋 메시지"
git push
```
