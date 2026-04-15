# Step 3.1: Design-to-Dev Bridge

**Date**: 2026-02-19
**Status**: Complete

---

## 1. Design-to-Code Mapping

### 1.1 Design Tokens -> CSS Variables

디자인 명세의 토큰 시스템을 `globals.css`에 CSS 변수로 직접 매핑합니다.

| Design Token | CSS Variable | Implementation |
|---|---|---|
| Canvas Background | `--canvas-bg` | `globals.css` `:root` |
| Desk Status Colors | `--desk-idle`, `--desk-working`, etc. | `globals.css` + PixiJS hex 변환 |
| Animation Tokens | `--duration-*`, `--ease-*` | GSAP timeline에서 참조 |
| Typography | `--font-sans`, `--font-mono` | Tailwind config + Next.js fonts |
| Spacing | `--space-*`, `--grid-cell` | Tailwind config custom values |

### 1.2 Component Architecture -> File Structure

디자인 명세 Section 2.1의 컴포넌트 트리를 그대로 파일 구조로 사용합니다.

```
src/
├── app/                    # Next.js App Router pages
├── components/
│   ├── ui/                 # shadcn/ui (auto-generated)
│   ├── layout/             # TopBar, Palette, ChatBar, etc.
│   ├── canvas/             # PixiJS components
│   ├── team/               # Team modals and panels
│   ├── chat/               # Chat components
│   ├── setup/              # API Key setup
│   └── onboarding/         # Onboarding overlays
├── stores/                 # Zustand stores (5 stores)
├── hooks/                  # Custom React hooks
├── lib/                    # Utilities
└── types/                  # TypeScript type definitions
```

### 1.3 PixiJS vs DOM Boundary

| Layer | Rendering | Technology |
|---|---|---|
| Office Grid + Desks + Animations | PixiJS Canvas | @pixi/react + GSAP |
| TopBar, Palette, ChatBar | React DOM | shadcn/ui + Tailwind |
| Modals, Panels, Chat | React DOM | shadcn/ui + Tailwind |
| Drag & Drop (palette -> canvas) | HTML5 DnD -> PixiJS coordinate transform | Custom hook |

### 1.4 State Management Strategy

Zustand를 Single Source of Truth로 사용합니다.

| Store | Responsibility | Persistence |
|---|---|---|
| `officeStore` | Viewport, drag state, grid occupancy | No |
| `teamStore` | Teams, agents, selection | No |
| `chatStore` | Messages, typing state | No |
| `uiStore` | Modal/panel states, onboarding | No |
| `settingsStore` | API key | localStorage |

---

## 2. Screen Implementation Priority

MVP Sprint 1 기준으로 구현 순서:

1. **Project Setup** - Next.js + shadcn/ui + PixiJS 초기화
2. **S1 API Key** - 가장 단순한 화면부터
3. **S2 Office Canvas** - 그리드 + 줌/패닝
4. **Drag & Drop** - 팔레트 -> 캔버스
5. **S3 Team Create Modal** - 팀 정보 입력
6. **Claude API Integration** - 팀 구성 제안
7. **S4 Agent Config Modal** - 구성 확인/수정
8. **S6 Chat (Basic)** - 채팅 입력/표시
9. **S5 Team Detail Panel** - 상세 정보
10. **S7 Settings** - 설정 페이지

---

## 3. Key Technical Decisions

### 3.1 PixiJS Integration with Next.js

- `@pixi/react` v8을 사용하여 선언적 렌더링
- PixiJS는 CSR only -> `dynamic import`로 SSR 방지
- Canvas wrapper 컴포넌트에 `"use client"` 지시자

### 3.2 Drag & Drop Cross-Layer

- HTML5 Drag API로 팔레트에서 드래그 시작
- 캔버스 위 `dragover` 이벤트에서 PixiJS 좌표로 변환
- Grid snap: `Math.round(x / GRID_CELL) * GRID_CELL`

### 3.3 Claude API Integration

- 클라이언트 사이드에서 직접 호출 (사용자 API Key 사용)
- Next.js API Route를 프록시로 사용하여 CORS 문제 해결
- Tool Use로 구조화된 에이전트 구성 응답

---

## 4. Pixel Art Assets

프로젝트에 이미 포함된 픽셀 아트 에셋:
- `desk.png` - 데스크 스프라이트
- `man.png` - 남성 캐릭터
- `woman.png` - 여성 캐릭터
- `office.png` - 오피스 배경
- `title.png` - 타이틀 이미지

이 에셋들을 PixiJS 스프라이트로 활용합니다.
