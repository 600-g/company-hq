# Step 3.2: Tech Stack Selection

**Date**: 2026-02-19
**Status**: Complete (디자인 명세에서 확정)

---

## Final Tech Stack

| Category | Technology | Version | Rationale |
|---|---|---|---|
| Framework | Next.js (App Router) | 15.x | React 기반, SSR/SSG, API Routes |
| Language | TypeScript | 5.x | 타입 안전성 |
| UI Components | shadcn/ui | latest | Radix UI 기반, 접근성, 커스터마이징 |
| Styling | Tailwind CSS | 4.x | 유틸리티 퍼스트, shadcn/ui 통합 |
| Canvas | PixiJS | 8.x | Gather.town과 동일, 60fps 성능 |
| Canvas React | @pixi/react | 8.x | JSX 선언적 캔버스 |
| Animation | GSAP | 3.x | 고성능 애니메이션 |
| State | Zustand | 5.x | 경량, PixiJS 통합 용이 |
| AI | Anthropic Claude API | latest | Tool Use, 구조화된 응답 |
| Icons | Lucide React | latest | shadcn/ui 기본 아이콘 |
| Font | Pretendard | latest | 한글 최적화 |

## Development Tools

| Tool | Purpose |
|---|---|
| ESLint | 코드 린팅 |
| Prettier | 코드 포매팅 |
| Docker Compose | 개발/배포 컨테이너화 |

## Not Using (MVP)

- Database (클라이언트 localStorage로 충분)
- ORM (DB 없음)
- Authentication (API Key만)
- Real-time (Socket.io는 Sprint 2+)
