# TeamMaker Design Specification

**Version**: 1.0
**Date**: 2026-02-10
**Framework**: React + TypeScript + shadcn/ui + PixiJS + Zustand + GSAP

---

## 1. Design Token System

### 1.1 Color Tokens

shadcn/ui의 CSS 변수 시스템을 확장하여 TeamMaker 전용 시맨틱 토큰을 정의합니다.

#### Base Layer (shadcn/ui 기본)

```css
:root {
  /* shadcn/ui default tokens (oklch) */
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}
```

#### TeamMaker Semantic Layer (확장 토큰)

```css
:root {
  /* === Office Canvas === */
  --canvas-bg: oklch(0.97 0.005 240);           /* 연한 블루그레이 바닥 */
  --canvas-grid: oklch(0.92 0.008 240);          /* 그리드 라인 */
  --canvas-grid-snap: oklch(0.85 0.03 240);      /* 스냅 가이드 라인 */

  /* === Desk Status Colors === */
  --desk-idle: oklch(0.95 0.01 240);             /* 대기 중 - 옅은 회색 */
  --desk-idle-border: oklch(0.88 0.015 240);
  --desk-working: oklch(0.75 0.15 145);          /* 작업 중 - 녹색 */
  --desk-working-glow: oklch(0.8 0.18 145 / 40%);
  --desk-complete: oklch(0.7 0.12 250);          /* 완료 - 블루 */
  --desk-complete-border: oklch(0.6 0.15 250);
  --desk-error: oklch(0.65 0.2 25);              /* 오류 - 레드 */

  /* === Agent Status === */
  --agent-active: oklch(0.75 0.15 145);          /* 활성 에이전트 */
  --agent-idle: oklch(0.7 0.02 240);             /* 비활성 에이전트 */
  --agent-pending: oklch(0.8 0.15 85);           /* 대기 에이전트 - 옐로 */

  /* === Collaboration Flow === */
  --flow-particle: oklch(0.75 0.18 280);         /* 이동 파티클 - 퍼플 */
  --flow-line: oklch(0.7 0.1 280 / 50%);         /* 연결 라인 */
  --flow-highlight: oklch(0.85 0.2 85);          /* 하이라이트 - 골드 */

  /* === Chat === */
  --chat-user-bg: oklch(0.93 0.03 250);          /* 사용자 메시지 배경 */
  --chat-ai-bg: oklch(0.97 0.005 145);           /* AI 메시지 배경 */
  --chat-system-bg: oklch(0.95 0.01 85);         /* 시스템 메시지 배경 */

  /* === Onboarding === */
  --onboarding-highlight: oklch(0.75 0.15 250);  /* 온보딩 하이라이트 */
  --onboarding-pulse: oklch(0.8 0.2 250 / 30%);  /* 펄스 애니메이션 */
}

.dark {
  --canvas-bg: oklch(0.18 0.01 240);
  --canvas-grid: oklch(0.25 0.015 240);
  --canvas-grid-snap: oklch(0.35 0.03 240);

  --desk-idle: oklch(0.25 0.01 240);
  --desk-idle-border: oklch(0.35 0.015 240);
  --desk-working: oklch(0.55 0.15 145);
  --desk-working-glow: oklch(0.6 0.18 145 / 40%);
  --desk-complete: oklch(0.5 0.12 250);
  --desk-complete-border: oklch(0.45 0.15 250);
  --desk-error: oklch(0.55 0.2 25);

  --agent-active: oklch(0.6 0.15 145);
  --agent-idle: oklch(0.4 0.02 240);
  --agent-pending: oklch(0.65 0.15 85);

  --flow-particle: oklch(0.65 0.18 280);
  --flow-line: oklch(0.5 0.1 280 / 50%);
  --flow-highlight: oklch(0.75 0.2 85);

  --chat-user-bg: oklch(0.25 0.03 250);
  --chat-ai-bg: oklch(0.22 0.01 145);
  --chat-system-bg: oklch(0.23 0.01 85);

  --onboarding-highlight: oklch(0.55 0.15 250);
  --onboarding-pulse: oklch(0.6 0.2 250 / 30%);
}
```

### 1.2 Typography Tokens

```css
:root {
  /* Font Family */
  --font-sans: "Pretendard Variable", "Pretendard", -apple-system, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;

  /* Font Sizes (Tailwind scale) */
  --text-xs: 0.75rem;      /* 12px - 캡션, 배지 */
  --text-sm: 0.875rem;     /* 14px - 보조 텍스트, 채팅 */
  --text-base: 1rem;       /* 16px - 본문 */
  --text-lg: 1.125rem;     /* 18px - 서브헤딩 */
  --text-xl: 1.25rem;      /* 20px - 모달 제목 */
  --text-2xl: 1.5rem;      /* 24px - 페이지 제목 */
  --text-3xl: 1.875rem;    /* 30px - 히어로 */

  /* Line Heights */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;
}
```

### 1.3 Spacing Tokens

```css
:root {
  /* Layout Spacing */
  --space-topbar: 48px;          /* 상단 바 높이 */
  --space-palette-collapsed: 60px; /* 팔레트 접힌 너비 */
  --space-palette-expanded: 200px; /* 팔레트 펼친 너비 */
  --space-chatbar: 56px;          /* 채팅 바 높이 */
  --space-detail-panel: 360px;    /* 상세 패널 너비 */
  --space-chat-panel: 380px;      /* 채팅 패널 너비 */

  /* Grid */
  --grid-cell: 64px;              /* 오피스 그리드 셀 크기 */
  --grid-gap: 2px;                /* 그리드 간격 */

  /* Desk */
  --desk-width: 192px;            /* 데스크 너비 (3 grid cells) */
  --desk-height: 128px;           /* 데스크 높이 (2 grid cells) */
}
```

### 1.4 Animation Tokens

```css
:root {
  /* Durations */
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;
  --duration-desk-glow: 2000ms;   /* 데스크 글로우 사이클 */
  --duration-particle: 1500ms;    /* 파티클 이동 */
  --duration-celebration: 1000ms; /* 축하 이펙트 */

  /* Easings */
  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-gentle: cubic-bezier(0.25, 0.1, 0.25, 1);
}
```

### 1.5 Shadow Tokens

```css
:root {
  --shadow-desk: 0 2px 8px oklch(0 0 0 / 8%);
  --shadow-desk-hover: 0 4px 16px oklch(0 0 0 / 12%);
  --shadow-desk-active: 0 8px 24px oklch(0 0 0 / 16%);
  --shadow-panel: 0 8px 32px oklch(0 0 0 / 10%);
  --shadow-modal: 0 16px 48px oklch(0 0 0 / 20%);
  --shadow-glow-working: 0 0 24px var(--desk-working-glow);
  --shadow-glow-onboarding: 0 0 16px var(--onboarding-pulse);
}
```

---

## 2. Component Architecture

### 2.1 전체 컴포넌트 트리

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # RootLayout (ThemeProvider, fonts)
│   ├── page.tsx                  # Redirect to /setup or /office
│   ├── setup/
│   │   └── page.tsx              # S1: API Key 입력
│   ├── office/
│   │   └── page.tsx              # S2: 메인 오피스 (핵심)
│   └── settings/
│       └── page.tsx              # S7: 설정
│
├── components/
│   ├── ui/                       # shadcn/ui 컴포넌트 (자동 생성)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── scroll-area.tsx
│   │   ├── separator.tsx
│   │   ├── sheet.tsx
│   │   ├── badge.tsx
│   │   ├── tooltip.tsx
│   │   ├── avatar.tsx
│   │   ├── tabs.tsx
│   │   ├── textarea.tsx
│   │   ├── sidebar.tsx
│   │   └── skeleton.tsx
│   │
│   ├── layout/                   # 레이아웃 컴포넌트
│   │   ├── TopBar.tsx
│   │   ├── Palette.tsx
│   │   ├── ChatBar.tsx
│   │   ├── ChatPanel.tsx
│   │   └── OfficeLayout.tsx
│   │
│   ├── canvas/                   # PixiJS 캔버스 컴포넌트
│   │   ├── OfficeCanvas.tsx      # 메인 PixiJS 래퍼
│   │   ├── Grid.tsx              # 그리드 렌더링
│   │   ├── Desk.tsx              # 팀 데스크 스프라이트
│   │   ├── DeskLabel.tsx         # 데스크 위 라벨
│   │   ├── StatusIndicator.tsx   # 상태 표시 (대기/작업/완료)
│   │   ├── AgentIcon.tsx         # 에이전트 아이콘
│   │   ├── ParticleFlow.tsx      # 팀 간 파티클 이동
│   │   ├── GlowEffect.tsx       # 데스크 글로우 이펙트
│   │   └── CelebrationEffect.tsx # 축하 파티클
│   │
│   ├── team/                     # 팀 관련 컴포넌트
│   │   ├── TeamCreateModal.tsx   # S3: 팀 생성 모달
│   │   ├── AgentConfigModal.tsx  # S4: AI 구성 제안 모달
│   │   ├── TeamDetailPanel.tsx   # S5: 팀 상세 패널
│   │   ├── AgentCard.tsx         # 에이전트 카드
│   │   ├── AgentStatusRow.tsx    # 에이전트 진행 상태 행
│   │   └── TaskHistoryList.tsx   # 작업 히스토리
│   │
│   ├── chat/                     # 채팅 관련 컴포넌트
│   │   ├── ChatInput.tsx         # 메시지 입력
│   │   ├── MessageList.tsx       # 메시지 목록
│   │   ├── UserMessage.tsx       # 사용자 메시지 버블
│   │   ├── AIMessage.tsx         # AI 응답 메시지 버블
│   │   ├── SystemMessage.tsx     # 시스템 알림 메시지
│   │   └── ResultCard.tsx        # 결과물 카드
│   │
│   ├── setup/                    # 설정 관련 컴포넌트
│   │   ├── ApiKeyForm.tsx        # API Key 입력 폼
│   │   └── ApiKeySection.tsx     # 설정 페이지 내 API Key 섹션
│   │
│   └── onboarding/               # 온보딩 관련 컴포넌트
│       ├── WelcomeOverlay.tsx    # 환영 오버레이
│       ├── PulseHighlight.tsx    # 하이라이트 펄스
│       └── StepGuide.tsx         # 단계별 가이드
│
├── stores/                       # Zustand 스토어
│   ├── officeStore.ts
│   ├── teamStore.ts
│   ├── chatStore.ts
│   ├── uiStore.ts
│   └── settingsStore.ts
│
├── hooks/                        # 커스텀 훅
│   ├── useCanvasInteraction.ts   # 캔버스 줌/패닝
│   ├── useDragAndDrop.ts         # 드래그 앤 드롭
│   ├── usePixiApp.ts             # PixiJS 앱 인스턴스 관리
│   └── useClaudeApi.ts           # Claude API 호출
│
├── lib/                          # 유틸리티
│   ├── utils.ts                  # cn() 등 shadcn 유틸
│   ├── claude.ts                 # Claude API 클라이언트
│   ├── grid.ts                   # 그리드 좌표 계산
│   └── animation.ts             # GSAP 애니메이션 프리셋
│
└── types/                        # TypeScript 타입
    ├── team.ts
    ├── agent.ts
    ├── task.ts
    ├── chat.ts
    └── canvas.ts
```

### 2.2 화면별 shadcn/ui 컴포넌트 매핑

#### S1: API Key 입력 (`/setup`)

| 영역 | shadcn/ui 컴포넌트 | 용도 |
|------|---------------------|------|
| 전체 레이아웃 | `Card`, `CardHeader`, `CardContent`, `CardFooter` | 중앙 정렬 카드 폼 |
| API Key 입력 | `Label`, `Input` (type=password) | API Key 입력 필드 |
| 시작 버튼 | `Button` (variant="default", size="lg") | "시작하기" CTA |
| 에러 메시지 | `Alert`, `AlertDescription` (variant="destructive") | Key 검증 실패 피드백 |
| 로딩 | `Button` + `Loader2` icon (animate-spin) | 검증 중 로딩 |
| 가이드 링크 | `Button` (variant="link") | API Key 발급 방법 링크 |

```tsx
// S1 컴포넌트 구조
<div className="flex min-h-screen items-center justify-center">
  <Card className="w-[420px]">
    <CardHeader className="text-center">
      <Logo />
      <CardTitle>AI 팀을 만들어보세요</CardTitle>
      <CardDescription>시작하려면 Anthropic API Key가 필요해요</CardDescription>
    </CardHeader>
    <CardContent>
      <ApiKeyForm />
    </CardContent>
    <CardFooter className="justify-center">
      <Button variant="link">API Key가 없으신가요? 발급 방법 →</Button>
    </CardFooter>
  </Card>
</div>
```

#### S2: 메인 오피스 (`/office`) - 핵심 화면

| 영역 | shadcn/ui 컴포넌트 | 용도 |
|------|---------------------|------|
| **상단 바** | - | 커스텀 (flex 레이아웃) |
| 메뉴 | `Button` (variant="ghost", size="icon") | 햄버거 메뉴 |
| 줌 컨트롤 | `Button` (variant="outline", size="icon") x 3 | +, -, 맞춤 버튼 |
| 설정 | `Button` (variant="ghost", size="icon") | 설정 이동 |
| 줌 표시 | `Badge` (variant="secondary") | 현재 줌 레벨 |
| **팔레트** | - | 커스텀 사이드바 |
| 팔레트 컨테이너 | `Sidebar` (collapsible="icon") | 접기/펼치기 팔레트 |
| 빈 책상 아이템 | `Card` (draggable) | 드래그 소스 |
| 팔레트 토글 | `SidebarTrigger` | 접기/펼치기 버튼 |
| **캔버스** | `<OfficeCanvas />` (PixiJS) | 가상 오피스 (React 외부) |
| **채팅 바** | - | 커스텀 하단 바 |
| 입력 | `Input` | 메시지 입력 |
| 전송 | `Button` (variant="default", size="icon") | 전송 버튼 |
| **채팅 패널** | `Sheet` (side="right") | 확장된 채팅 |
| 메시지 스크롤 | `ScrollArea` | 메시지 목록 스크롤 |
| 메시지 입력 | `Textarea` | 멀티라인 입력 |

```tsx
// S2 메인 레이아웃 구조
<SidebarProvider>
  <div className="flex h-screen flex-col">
    {/* TopBar */}
    <header className="flex h-12 items-center border-b px-4">
      <SidebarTrigger />
      <span className="ml-2 font-semibold">TeamMaker</span>
      <div className="ml-auto flex items-center gap-1">
        <ZoomControls />
        <Button variant="ghost" size="icon"><Settings /></Button>
      </div>
    </header>

    {/* Main Area */}
    <div className="flex flex-1 overflow-hidden">
      {/* Palette Sidebar */}
      <Sidebar collapsible="icon" className="border-r">
        <SidebarContent>
          <PaletteItems />
        </SidebarContent>
      </Sidebar>

      {/* Canvas */}
      <main className="relative flex-1">
        <OfficeCanvas />

        {/* Overlays */}
        <TeamCreateModal />
        <AgentConfigModal />
      </main>

      {/* Detail Panel (conditional) */}
      <Sheet>
        <SheetContent side="right" className="w-[360px]">
          <TeamDetailPanel />
        </SheetContent>
      </Sheet>

      {/* Chat Panel (conditional) */}
      <Sheet>
        <SheetContent side="right" className="w-[380px]">
          <ChatPanel />
        </SheetContent>
      </Sheet>
    </div>

    {/* ChatBar */}
    <footer className="flex h-14 items-center border-t px-4 gap-2">
      <ChatInput />
    </footer>
  </div>
</SidebarProvider>
```

#### S3: 팀 생성 모달

| 영역 | shadcn/ui 컴포넌트 | 용도 |
|------|---------------------|------|
| 모달 | `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` | 팀 정보 입력 오버레이 |
| 팀 이름 | `Label`, `Input` | 이름 입력 |
| 팀 설명 | `Label`, `Textarea` | 설명 입력 (multiline) |
| 예시 텍스트 | `p` (className="text-sm text-muted-foreground") | 플레이스홀더 예시 |
| 버튼 | `Button` (variant="default") | "팀 만들기" |
| 닫기 | `DialogClose` | X 버튼 |

```tsx
// S3 팀 생성 모달 구조
<Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
  <DialogContent className="sm:max-w-[480px]">
    <DialogHeader>
      <DialogTitle>이 팀은 어떤 일을 하나요?</DialogTitle>
      <DialogDescription>팀의 역할을 자유롭게 설명해주세요</DialogDescription>
    </DialogHeader>
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="team-name">팀 이름</Label>
        <Input id="team-name" placeholder="마케팅팀" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="team-desc">팀 설명</Label>
        <Textarea
          id="team-desc"
          placeholder="SNS 콘텐츠를 기획하고 작성하는 팀"
          rows={3}
        />
      </div>
      <div className="rounded-md bg-muted p-3">
        <p className="text-sm text-muted-foreground">
          💡 예시: "고객 문의에 답변하는 팀", "데이터를 분석하고 보고서를 만드는 팀"
        </p>
      </div>
    </div>
    <DialogFooter>
      <Button type="submit" className="w-full">팀 만들기 →</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

#### S4: AI 구성 제안 모달

| 영역 | shadcn/ui 컴포넌트 | 용도 |
|------|---------------------|------|
| 모달 | `Dialog`, `DialogContent` | 에이전트 구성 제안 |
| 뒤로 가기 | `Button` (variant="ghost", size="sm") | 이전 단계로 |
| 팀명 표시 | `Badge` + `DialogTitle` | 팀 이름 + 제목 |
| 에이전트 카드 | `Card`, `CardContent` | 각 에이전트 정보 |
| 역할명 | `CardTitle` (text-base) | 에이전트 역할명 |
| 설명 | `CardDescription` | 역할 설명 |
| 수정/삭제 | `Button` (variant="ghost", size="icon") | 편집/삭제 아이콘 |
| 에이전트 추가 | `Button` (variant="outline") | "+ 에이전트 추가" |
| 다시 제안 | `Button` (variant="outline") | AI 재생성 |
| 확인 | `Button` (variant="default") | "이대로 확인" |
| 로딩 상태 | `Skeleton` (반복) | AI 분석 중 스켈레톤 |

```tsx
// S4 AI 구성 제안 모달 구조
<Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
  <DialogContent className="sm:max-w-[520px]">
    <DialogHeader>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <DialogTitle>
            <Badge variant="secondary" className="mr-2">🎯</Badge>
            {teamName} 구성 제안
          </DialogTitle>
          <DialogDescription>AI가 이렇게 팀을 구성했어요</DialogDescription>
        </div>
      </div>
    </DialogHeader>

    <ScrollArea className="max-h-[400px]">
      <div className="space-y-3 py-4">
        {isLoading ? (
          /* 스켈레톤 */
          Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-full" />
              </CardContent>
            </Card>
          ))
        ) : (
          /* 에이전트 카드 목록 */
          agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)
        )}
      </div>
    </ScrollArea>

    <div className="space-y-3">
      <Button variant="outline" className="w-full">
        <Plus className="mr-2 h-4 w-4" /> 에이전트 추가
      </Button>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1">다시 제안</Button>
        <Button variant="default" className="flex-1">이대로 확인 ✓</Button>
      </div>
    </div>
  </DialogContent>
</Dialog>
```

#### S5: 팀 상세 패널 (우측 사이드)

| 영역 | shadcn/ui 컴포넌트 | 용도 |
|------|---------------------|------|
| 패널 | `Sheet`, `SheetContent` (side="right") | 사이드 슬라이드인 |
| 헤더 | `SheetHeader`, `SheetTitle` | 팀명 + 닫기 |
| 상태 뱃지 | `Badge` (variant에 따라) | 대기/작업중/완료 |
| 섹션 구분 | `Separator` | 현재 작업 / 히스토리 / 구성 구분 |
| 에이전트 상태 | `Avatar` + `Badge` + `p` | 에이전트 진행 상태 행 |
| 히스토리 | `ScrollArea` + 커스텀 리스트 | 작업 히스토리 목록 |
| 팀 수정 버튼 | `Button` (variant="outline") | "팀 수정" |
| 탭 | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | 현재 작업 / 히스토리 / 구성 탭 |

```tsx
// S5 팀 상세 패널 구조
<Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
  <SheetContent side="right" className="w-[360px] p-0">
    <SheetHeader className="p-4 pb-0">
      <div className="flex items-center justify-between">
        <SheetTitle>{team.name}</SheetTitle>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{team.description}</p>
    </SheetHeader>

    <Separator className="my-3" />

    <Tabs defaultValue="current" className="px-4">
      <TabsList className="w-full">
        <TabsTrigger value="current" className="flex-1">현재 작업</TabsTrigger>
        <TabsTrigger value="history" className="flex-1">히스토리</TabsTrigger>
        <TabsTrigger value="config" className="flex-1">팀 구성</TabsTrigger>
      </TabsList>

      <TabsContent value="current">
        <CurrentTaskView task={currentTask} agents={team.agents} />
      </TabsContent>

      <TabsContent value="history">
        <ScrollArea className="h-[calc(100vh-280px)]">
          <TaskHistoryList history={team.history} />
        </ScrollArea>
      </TabsContent>

      <TabsContent value="config">
        <AgentList agents={team.agents} />
        <Button variant="outline" className="mt-4 w-full">팀 수정</Button>
      </TabsContent>
    </Tabs>
  </SheetContent>
</Sheet>
```

#### S6: 채팅

| 영역 | shadcn/ui 컴포넌트 | 용도 |
|------|---------------------|------|
| **채팅 바** (접힌 상태) | - | 하단 고정 |
| 입력 | `Input` (placeholder) | 한 줄 입력 |
| 전송 | `Button` (variant="default", size="icon") | 전송 아이콘 |
| 확장 트리거 | 입력 포커스 or 채팅 아이콘 클릭 | Sheet 오픈 |
| **채팅 패널** (펼친 상태) | `Sheet` (side="right") | 전체 채팅 |
| 메시지 목록 | `ScrollArea` | 자동 스크롤 |
| 사용자 메시지 | `div` (bg-chat-user-bg) | 우측 정렬 |
| AI 메시지 | `div` (bg-chat-ai-bg) + `Avatar` | 좌측 정렬 |
| 시스템 메시지 | `Badge` + `p` | 중앙 정렬 알림 |
| 결과 카드 | `Card`, `CardContent` | 작업 결과물 |
| 입력 | `Textarea` + `Button` | 멀티라인 + 전송 |

#### S7: 설정 (`/settings`)

| 영역 | shadcn/ui 컴포넌트 | 용도 |
|------|---------------------|------|
| 뒤로가기 | `Button` (variant="ghost") | "← 오피스로 돌아가기" |
| 페이지 제목 | `h1` | "설정" |
| API Key 섹션 | `Card`, `CardHeader`, `CardContent` | API Key 관리 |
| Key 표시 | `Input` (disabled, masked) | 마스킹된 Key |
| 변경 버튼 | `Button` (variant="outline") | "변경" |
| 데이터 관리 | `Card`, `CardHeader`, `CardContent` | 오피스 초기화 |
| 초기화 버튼 | `Button` (variant="destructive") | "오피스 초기화" |
| 확인 다이얼로그 | `AlertDialog` | 삭제 확인 |

---

## 3. shadcn/ui 컴포넌트 전체 목록 (설치 필요)

```bash
npx shadcn@latest add \
  button card dialog input label textarea \
  badge tooltip avatar separator tabs \
  sheet scroll-area sidebar skeleton \
  alert alert-dialog dropdown-menu
```

| 컴포넌트 | 사용처 | 빈도 |
|----------|--------|------|
| `Button` | 모든 화면 | 매우 높음 |
| `Card` | 에이전트 카드, 결과 카드, 설정 섹션, 팔레트 아이템 | 높음 |
| `Dialog` | S3 팀 생성, S4 AI 구성 제안 | 높음 |
| `Input` | API Key, 팀 이름, 채팅 바 | 높음 |
| `Label` | 폼 필드 라벨 | 중간 |
| `Textarea` | 팀 설명, 채팅 입력 (확장) | 중간 |
| `Badge` | 상태 표시, 팀명 뱃지, 줌 레벨 | 높음 |
| `Tooltip` | 아이콘 버튼 설명, 온보딩 힌트 | 중간 |
| `Avatar` | 에이전트 아이콘, AI 채팅 아바타 | 중간 |
| `Separator` | 섹션 구분선 | 중간 |
| `Tabs` | S5 상세 패널 탭 | 중간 |
| `Sheet` | S5 상세 패널, S6 채팅 패널 | 높음 |
| `ScrollArea` | 채팅 메시지, 에이전트 목록, 히스토리 | 높음 |
| `Sidebar` | 왼쪽 팔레트 | 높음 |
| `Skeleton` | AI 로딩 상태 | 중간 |
| `Alert` | API Key 에러 | 낮음 |
| `AlertDialog` | 오피스 초기화 확인 | 낮음 |
| `DropdownMenu` | 상단 바 메뉴 | 낮음 |

---

## 4. State Management (Zustand)

### 4.1 Store 구조

```typescript
// ==========================================
// types/team.ts
// ==========================================

type DeskStatus = 'idle' | 'working' | 'complete' | 'error';
type AgentStatus = 'idle' | 'active' | 'pending' | 'complete';

interface Agent {
  id: string;
  role: string;        // "콘텐츠 기획 담당"
  description: string; // "주제 선정과 글 구조를 잡아요"
  status: AgentStatus;
  currentTask?: string;
}

interface Team {
  id: string;
  name: string;
  description: string;
  agents: Agent[];
  status: DeskStatus;
  position: { x: number; y: number }; // 그리드 좌표
  currentTaskId?: string;
}

// ==========================================
// types/task.ts
// ==========================================

type TaskStatus = 'queued' | 'routing' | 'in_progress' | 'complete' | 'error';

interface SubTask {
  id: string;
  teamId: string;
  agentId: string;
  description: string;
  status: TaskStatus;
  result?: string;
}

interface Task {
  id: string;
  input: string;        // 사용자 원본 입력
  teamIds: string[];     // 매칭된 팀 ID들
  subTasks: SubTask[];
  status: TaskStatus;
  result?: string;
  createdAt: number;
  completedAt?: number;
}

// ==========================================
// types/chat.ts
// ==========================================

type MessageType = 'user' | 'ai' | 'system';

interface ChatMessage {
  id: string;
  type: MessageType;
  content: string;
  timestamp: number;
  taskId?: string;      // 연결된 태스크 ID
  teamName?: string;    // 매칭된 팀 이름 (시스템 메시지용)
}

// ==========================================
// types/canvas.ts
// ==========================================

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface DragState {
  isDragging: boolean;
  source: 'palette' | 'canvas' | null;
  position: { x: number; y: number } | null;
}
```

### 4.2 Store 분리 설계

```typescript
// ==========================================
// stores/officeStore.ts - 오피스 캔버스 상태
// ==========================================
interface OfficeState {
  // State
  viewport: Viewport;
  dragState: DragState;
  gridCells: Map<string, string>; // "x,y" → teamId (점유 상태)

  // Actions
  setViewport: (viewport: Partial<Viewport>) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
  startDrag: (source: 'palette' | 'canvas') => void;
  updateDrag: (position: { x: number; y: number }) => void;
  endDrag: () => void;
  occupyCell: (x: number, y: number, teamId: string) => void;
  freeCell: (x: number, y: number) => void;
  isCellOccupied: (x: number, y: number) => boolean;
}

// ==========================================
// stores/teamStore.ts - 팀/에이전트 상태
// ==========================================
interface TeamState {
  // State
  teams: Map<string, Team>;
  selectedTeamId: string | null;

  // Actions
  addTeam: (team: Team) => void;
  removeTeam: (teamId: string) => void;
  updateTeam: (teamId: string, updates: Partial<Team>) => void;
  moveTeam: (teamId: string, position: { x: number; y: number }) => void;
  selectTeam: (teamId: string | null) => void;
  setTeamStatus: (teamId: string, status: DeskStatus) => void;
  setAgentStatus: (teamId: string, agentId: string, status: AgentStatus) => void;

  // Selectors
  getTeam: (teamId: string) => Team | undefined;
  getTeamByPosition: (x: number, y: number) => Team | undefined;
  getTeamsByStatus: (status: DeskStatus) => Team[];
}

// ==========================================
// stores/chatStore.ts - 채팅 상태
// ==========================================
interface ChatState {
  // State
  messages: ChatMessage[];
  isExpanded: boolean;
  isTyping: boolean;

  // Actions
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setExpanded: (expanded: boolean) => void;
  setTyping: (typing: boolean) => void;
  clearMessages: () => void;
}

// ==========================================
// stores/uiStore.ts - UI 상태
// ==========================================
interface UIState {
  // Modal States
  isTeamCreateOpen: boolean;
  isAgentConfigOpen: boolean;
  isDetailPanelOpen: boolean;

  // Onboarding
  onboardingStep: number | null; // null = 완료
  hasCompletedOnboarding: boolean;

  // Palette
  isPaletteCollapsed: boolean;

  // Actions
  openTeamCreate: () => void;
  closeTeamCreate: () => void;
  openAgentConfig: () => void;
  closeAgentConfig: () => void;
  openDetailPanel: () => void;
  closeDetailPanel: () => void;
  togglePalette: () => void;
  advanceOnboarding: () => void;
  completeOnboarding: () => void;
}

// ==========================================
// stores/settingsStore.ts - 설정 (persist)
// ==========================================
interface SettingsState {
  // State (persisted to localStorage)
  apiKey: string | null;
  isApiKeyValid: boolean;

  // Actions
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  validateApiKey: () => Promise<boolean>;
}
```

### 4.3 PixiJS ↔ React 상태 동기화 전략

```
┌─────────────────────────────────────────────────────┐
│                  React (shadcn/ui)                    │
│                                                      │
│  [TopBar] [Palette] [Modals] [Panels] [ChatBar]     │
│       │       │         │        │         │         │
│       └───────┴────┬────┴────────┴─────────┘         │
│                    │                                  │
│            ┌───────┴───────┐                          │
│            │  Zustand Store │ ◀── Single Source of    │
│            │               │     Truth                │
│            └───────┬───────┘                          │
│                    │                                  │
│         ┌──────────┴──────────┐                       │
│         │                     │                       │
│  useEffect + subscribe  event emit                    │
│         │                     │                       │
│  ┌──────┴──────┐    ┌────────┴────────┐              │
│  │ React →     │    │ PixiJS →        │              │
│  │ PixiJS      │    │ React           │              │
│  │ (store sub) │    │ (event emitter) │              │
│  └─────────────┘    └─────────────────┘              │
│                                                      │
└──────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│                  PixiJS Canvas                        │
│                                                      │
│  [Grid] [Desks] [GlowEffects] [ParticleFlow]        │
│                                                      │
│  - Zustand subscribe()로 상태 변경 감지               │
│  - 클릭/드래그 이벤트 → Zustand action 호출           │
│  - GSAP으로 애니메이션 독립 관리                       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**동기화 규칙**:

1. **Zustand = Single Source of Truth**: 모든 비즈니스 상태는 Zustand에 저장
2. **React → PixiJS**: `store.subscribe()`로 상태 변경 시 PixiJS 스프라이트 업데이트
3. **PixiJS → React**: PixiJS 이벤트(클릭, 드래그 완료) → Zustand action 직접 호출
4. **애니메이션**: GSAP은 PixiJS 스프라이트 속성을 직접 조작 (Zustand 거치지 않음)
5. **@pixi/react**: 선언적 렌더링으로 간단한 상태 반영 (복잡한 애니메이션은 imperative)

```typescript
// 예시: PixiJS에서 Zustand 상태 구독
// canvas/Desk.tsx (PixiJS 컴포넌트 내부)

import { useApp } from '@pixi/react';
import { useTeamStore } from '@/stores/teamStore';

function DeskSprite({ teamId }: { teamId: string }) {
  const app = useApp();
  const team = useTeamStore((s) => s.getTeam(teamId));
  const selectTeam = useTeamStore((s) => s.selectTeam);

  // React 상태 → PixiJS 스프라이트 업데이트
  useEffect(() => {
    if (!team) return;
    // GSAP으로 상태 변경 애니메이션
    if (team.status === 'working') {
      gsap.to(spriteRef.current, {
        alpha: 1,
        duration: 0.3,
        repeat: -1,
        yoyo: true,
      });
    }
  }, [team?.status]);

  // PixiJS 이벤트 → Zustand action
  const handleClick = () => {
    selectTeam(teamId);
    // UI store에서 상세 패널 열기
    useUIStore.getState().openDetailPanel();
  };

  return (
    <Container
      eventMode="static"
      pointerdown={handleClick}
      position={[team.position.x * GRID_CELL, team.position.y * GRID_CELL]}
    >
      {/* PixiJS 렌더링 */}
    </Container>
  );
}
```

---

## 5. 데이터 흐름 다이어그램

### 5.1 팀 생성 플로우

```
[User]
  │ 빈 책상 드래그
  ▼
[Palette] ──drag start──▶ officeStore.startDrag('palette')
  │
  │ 드래그 이동
  ▼
[OfficeCanvas] ──drag move──▶ officeStore.updateDrag(pos)
  │                           └→ PixiJS: 미리보기 스프라이트 이동
  │ 드롭
  ▼
[OfficeCanvas] ──drop──▶ officeStore.endDrag()
  │                       officeStore.occupyCell(x, y, tempId)
  │                       uiStore.openTeamCreate()
  ▼
[TeamCreateModal] ◀── Dialog 오픈 (shadcn/ui)
  │
  │ 팀 이름 + 설명 입력 → "팀 만들기" 클릭
  ▼
[Claude API] ◀── useClaudeApi.generateTeamConfig(name, desc)
  │               └→ uiStore.openAgentConfig()
  ▼
[AgentConfigModal] ◀── 에이전트 구성 표시 (shadcn/ui)
  │
  │ "이대로 확인" 클릭
  ▼
[teamStore] ──addTeam(team)──▶ PixiJS: 데스크 스프라이트 생성
  │                              └→ GSAP: 축하 이펙트
  ▼
[uiStore] ──closeAgentConfig()──▶ 모달 닫기
            advanceOnboarding()    채팅 포커스
```

### 5.2 업무 지시 플로우

```
[User]
  │ 채팅에 "인스타 포스팅 3개 만들어줘" 입력
  ▼
[ChatInput] ──send──▶ chatStore.addMessage({ type: 'user', content })
  │
  ▼
[Claude API] ◀── useClaudeApi.routeTask(message, teams)
  │                 │
  │                 ├→ chatStore.addMessage({ type: 'system', content: '마케팅팀에게 전달!' })
  │                 ├→ teamStore.setTeamStatus(teamId, 'working')
  │                 └→ PixiJS: 데스크 글로우 시작 (GSAP)
  ▼
[Claude API] ◀── 에이전트 순차 실행 (Tool Use)
  │                 │
  │                 ├→ teamStore.setAgentStatus(teamId, agentId, 'active')
  │                 └→ PixiJS: 에이전트 아이콘 활성화
  │
  │ (각 에이전트 완료 시)
  │                 ├→ teamStore.setAgentStatus(teamId, agentId, 'complete')
  │                 └→ (다음 에이전트 시작 또는 팀 완료)
  ▼
[Complete] ──▶ teamStore.setTeamStatus(teamId, 'complete')
               chatStore.addMessage({ type: 'ai', content: 결과물 })
               PixiJS: 글로우 해제, 완료 이펙트
```

---

## 6. 프로젝트 초기화 명령

```bash
# 프로젝트 생성
npx create-next-app@latest teammaker --typescript --tailwind --eslint --app --src-dir

# shadcn/ui 초기화
npx shadcn@latest init

# shadcn/ui 컴포넌트 설치
npx shadcn@latest add button card dialog input label textarea \
  badge tooltip avatar separator tabs sheet scroll-area \
  sidebar skeleton alert alert-dialog dropdown-menu

# 핵심 라이브러리
npm install pixi.js @pixi/react gsap zustand

# 아이콘
npm install lucide-react

# 유틸리티
npm install clsx tailwind-merge

# 폰트 (선택)
npm install pretendard
```

---

## 7. 폴더 구조 vs 화면 매핑 요약

| 화면 | 경로 | 주요 컴포넌트 | shadcn/ui 핵심 |
|------|------|---------------|----------------|
| S1 API Key | `/setup` | `ApiKeyForm` | Card, Input, Button, Alert |
| S2 메인 오피스 | `/office` | `OfficeLayout`, `OfficeCanvas` | Sidebar, Button, Badge |
| S3 팀 생성 | `/office` (overlay) | `TeamCreateModal` | Dialog, Input, Textarea, Button |
| S4 AI 제안 | `/office` (overlay) | `AgentConfigModal` | Dialog, Card, ScrollArea, Skeleton |
| S5 팀 상세 | `/office` (side) | `TeamDetailPanel` | Sheet, Tabs, Badge, Avatar, Separator |
| S6 채팅 | `/office` (bottom/side) | `ChatBar`, `ChatPanel` | Input/Textarea, Sheet, ScrollArea |
| S7 설정 | `/settings` | `ApiKeySection` | Card, Input, Button, AlertDialog |

---

## 8. 핵심 설계 결정 사항

### 8.1 PixiJS vs DOM 경계

| 영역 | 렌더링 | 이유 |
|------|--------|------|
| 오피스 그리드 + 데스크 + 애니메이션 | **PixiJS** | 60fps 성능, Gather 스타일 |
| 상단 바, 팔레트 | **React DOM (shadcn/ui)** | 표준 UI, 접근성 |
| 모달/패널/채팅 | **React DOM (shadcn/ui)** | 폼 입력, 접근성, 반응형 |
| 글로우/파티클 이펙트 | **PixiJS + GSAP** | GPU 가속 필요 |
| 드래그 앤 드롭 (팔레트→캔버스) | **HTML5 DnD → PixiJS 좌표 변환** | 크로스 레이어 상호작용 |

### 8.2 반응형 전략 (데스크톱 전용 MVP)

- 최소 해상도: 1280 x 720px
- 팔레트: 200px ↔ 60px (접기)
- 캔버스: `flex-1` (남은 공간 전체)
- 상세 패널: 360px (Sheet, right)
- 채팅 패널: 380px (Sheet, right)
- 동시에 상세 패널 + 채팅 패널은 열리지 않음 (택 1)

### 8.3 접근성

- shadcn/ui 기본 접근성 (Radix UI 기반) 활용
- Dialog: 포커스 트랩, ESC 닫기
- Sheet: 키보드 내비게이션
- 캔버스: 클릭 가능한 영역에 aria-label 제공 (PixiJS accessible 속성)
- 색상 대비: WCAG AA 기준 충족

---

## 9. 다음 단계

1. **Stage 3: Implementation** - TDD 방식으로 구현 시작
   - Sprint 1: 프로젝트 셋업 → 캔버스 → 팀 생성 플로우
   - Sprint 2: 채팅 → 업무 지시 → 시각화
   - Sprint 3: 협업 시각화 → 온보딩 → 폴리싱

2. **구현 우선순위** (plan.md로 관리):
   - 프로젝트 초기화 (Next.js + shadcn/ui + PixiJS)
   - Zustand 스토어 설정
   - S1 API Key 화면
   - S2 기본 캔버스 + 그리드
   - 드래그 앤 드롭
   - S3 팀 생성 모달
   - Claude API 연동
   - S4 AI 구성 제안
   - ...
