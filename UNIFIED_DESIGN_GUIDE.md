# 두근컴퍼니 통일 디자인 가이드라인
> company-hq(사무실) + teammaker-classic(팀메이커) UI/UX 통합 규격
> v1.0 | 2026-04-16 | 디자인팀

---

## 1. 현재 상태 분석 요약

### 차이점 (통일 전)

| 항목 | company-hq (사무실) | teammaker-classic (팀메이커) |
|------|---------------------|---------------------------|
| **색상 시스템** | 하드코딩 HEX (`#1a1a2e`) | OKLch CSS 변수 (`oklch(0.145 0 0)`) |
| **테마** | 다크 모드 전용 | 라이트/다크 둘 다 지원 |
| **게임 엔진** | Phaser 3 (832×576) | Pixi.js 8 (동적 캔버스) |
| **컴포넌트** | 커스텀 Tailwind 클래스 | shadcn/ui + Radix UI |
| **브레이크포인트** | 768px 단일 | sm(640px), md(768px) |
| **Primary 컬러** | yellow-400 (`#f5c842`) | neutral (흑/백) |
| **버튼** | 작은 사이즈 (h-6~h-8) | 표준 사이즈 (h-8~h-10) |
| **폰트 크기** | 7px~14px (CSS 강제 확대) | 12px~16px (표준) |
| **아이콘** | 없음 (이모지 사용) | Lucide React |
| **상태관리** | React useState/Context | Zustand |
| **Electron** | 없음 (웹 전용) | Electron 지원 |

### 공통점 (이미 통일됨)
- **프레임워크**: Next.js 16 + React 19 + TypeScript 5
- **CSS**: Tailwind CSS 4
- **폰트**: Pretendard Variable
- **UI 라이브러리**: Radix UI (company-hq도 Dialog/Tooltip 사용)
- **애니메이션**: GSAP
- **클래스 유틸**: clsx + tailwind-merge + CVA

---

## 2. 통일 색상 팔레트

### 원칙
- **다크 모드 기본** (두근컴퍼니 브랜드 아이덴티티)
- **CSS 변수로 통일** (하드코딩 HEX 금지)
- **OKLch 기반** (시각적 균일성) + HEX 폴백

### 2.1 기본 배경/표면

| 토큰명 | 용도 | OKLch (다크) | HEX 근사값 |
|--------|------|-------------|-----------|
| `--bg-base` | 앱 배경 | `oklch(0.15 0.02 270)` | `#1a1a2e` |
| `--bg-surface` | 카드/패널 | `oklch(0.10 0.02 270)` | `#0f0f1f` |
| `--bg-input` | 입력 필드 | `oklch(0.12 0.015 270)` | `#12122a` |
| `--bg-elevated` | 모달/팝업 | `oklch(0.08 0.015 270)` | `#0a0a18` |
| `--bg-hover` | 호버 상태 | `oklch(0.20 0.02 270)` | `#2a2a3a` |

### 2.2 테두리

| 토큰명 | 용도 | OKLch (다크) | HEX 근사값 |
|--------|------|-------------|-----------|
| `--border-default` | 기본 테두리 | `oklch(0.30 0.02 270)` | `#2a2a5a` |
| `--border-subtle` | 약한 테두리 | `oklch(0.25 0.015 270)` | `#1a1a3a` |
| `--border-strong` | 강한 테두리 | `oklch(0.35 0.025 270)` | `#3a3a5a` |
| `--border-focus` | 포커스 링 | `oklch(0.80 0.15 85 / 50%)` | `#f5c842/50%` |

### 2.3 텍스트

| 토큰명 | 용도 | OKLch (다크) | HEX 근사값 |
|--------|------|-------------|-----------|
| `--text-primary` | 본문 | `oklch(0.95 0 0)` | `#f0f0f0` |
| `--text-secondary` | 보조 텍스트 | `oklch(0.65 0 0)` | `#999999` |
| `--text-muted` | 비활성 텍스트 | `oklch(0.45 0 0)` | `#666666` |
| `--text-inverse` | 밝은 배경 위 | `oklch(0.15 0 0)` | `#1a1a2e` |

### 2.4 강조/액센트 (두근컴퍼니 시그니처)

| 토큰명 | 용도 | OKLch | HEX | Tailwind |
|--------|------|-------|-----|----------|
| `--accent-primary` | 주요 액션 | `oklch(0.82 0.15 85)` | `#f5c842` | `yellow-400` |
| `--accent-success` | 성공/정상 | `oklch(0.70 0.18 145)` | `#50d070` | `green-400` |
| `--accent-danger` | 위험/오류 | `oklch(0.65 0.22 25)` | `#ef4444` | `red-400` |
| `--accent-info` | 정보/링크 | `oklch(0.68 0.15 250)` | `#60a0e0` | `blue-400` |
| `--accent-purple` | 보조/모델 | `oklch(0.60 0.20 300)` | `#a080f0` | `purple-400` |

### 2.5 상태 표시 (공통)

| 상태 | 색상 토큰 | 애니메이션 | 설명 |
|------|----------|-----------|------|
| 작업중 | `--accent-primary` | `animate-pulse` | 노란 점 깜빡 |
| 정상/완료 | `--accent-success` | 없음 | 초록 점 |
| 대기 | `--text-muted` | 없음 | 회색 점 |
| 오류 | `--accent-danger` | `animate-pulse` | 빨간 점 깜빡 |

### 2.6 캔버스 전용 (Phaser / Pixi.js)

| 토큰명 | 용도 | HEX |
|--------|------|-----|
| `--canvas-bg` | 캔버스 배경 | `#1a1a2e` |
| `--canvas-grid` | 그리드 라인 | `#2a2a5a` |
| `--canvas-grid-snap` | 스냅 그리드 | `#3a3a6a` |
| `--desk-idle` | 비활성 책상 | `#2a2a4a` |
| `--desk-working` | 작업중 책상 | `#3a6a3a` |
| `--desk-complete` | 완료 책상 | `#3a4a7a` |
| `--desk-error` | 에러 책상 | `#6a3a3a` |

---

## 3. 타이포그래피

### 3.1 폰트 스택

```css
/* 본문 (공통) */
--font-sans: 'Pretendard Variable', Pretendard, -apple-system,
             BlinkMacSystemFont, system-ui, sans-serif;

/* 코드/터미널 */
--font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono',
             ui-monospace, monospace;

/* 게임 내 (Phaser) */
--font-game: 'PokemonClear', 'Pretendard Variable', system-ui, sans-serif;
```

### 3.2 사이즈 시스템 (통일)

> **규칙**: 7px~8px 같은 극소 사이즈를 CSS로 강제 확대하는 기존 패턴을 폐기하고,
> 실제 렌더링되는 크기를 기준으로 통일한다.

| 토큰 | 크기 | 용도 | Tailwind |
|------|------|------|----------|
| `--text-3xs` | 10px | 태그, 뱃지, 미세 정보 | `text-[10px]` |
| `--text-2xs` | 11px | 라벨, 캡션 | `text-[11px]` |
| `--text-xs` | 12px | 본문 (Dense UI) | `text-xs` |
| `--text-sm` | 14px | 본문 (기본), 제목 (Dense) | `text-sm` |
| `--text-base` | 16px | 제목, 강조 본문 | `text-base` |
| `--text-lg` | 18px | 큰 제목 | `text-lg` |
| `--text-xl` | 20px | 페이지 제목 | `text-xl` |

### 3.3 타이포그래피 용도별 매핑

| 용도 | company-hq | teammaker | **통일** |
|------|-----------|-----------|---------|
| 페이지 제목 | `text-sm` (14px) | `text-base` (16px) | `text-base` (16px) |
| 섹션 제목 | `text-xs` (12px) | `text-sm` (14px) | `text-sm` (14px) |
| 본문 | `text-[11px]` | `text-sm` (14px) | **모바일**: `text-xs` (12px), **데스크탑**: `text-sm` (14px) |
| 라벨/캡션 | `text-[9px]` → 13.5px 강제 | `text-xs` (12px) | `text-[11px]` (11px) |
| 뱃지/태그 | `text-[8px]` → 13px 강제 | `text-xs` (12px) | `text-[10px]` (10px) |
| 코드/터미널 | `text-[11px]` | `text-xs` (12px) | `text-xs font-mono` (12px) |

### 3.4 텍스트 렌더링

```css
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: "kern" 1, "liga" 1, "calt" 1;
  letter-spacing: -0.01em;
}
```

---

## 4. 컴포넌트 통일 규격

### 4.1 버튼

> **기준**: shadcn/ui 패턴을 기반으로, 두근컴퍼니 다크 테마에 맞게 커스텀

#### Variants

| Variant | 스타일 | 용도 |
|---------|--------|------|
| `default` | `bg-[--accent-primary] text-black` | 주요 액션 (CTA) |
| `secondary` | `bg-[--bg-hover] text-[--text-primary] border-[--border-default]` | 보조 액션 |
| `ghost` | `text-[--text-secondary] hover:bg-[--bg-hover]` | 최소 강조 |
| `outline` | `border-[--border-strong] text-[--text-secondary] hover:border-[--accent-primary]` | 테두리 버튼 |
| `destructive` | `bg-[--accent-danger] text-white` | 삭제/위험 |
| `link` | `text-[--accent-primary] underline-offset-2 hover:underline` | 텍스트 링크 |

#### Sizes (통일)

| Size | 높이 | 패딩 | 폰트 | 용도 |
|------|------|------|------|------|
| `xs` | 24px (h-6) | `px-2` | `text-[10px]` | Dense UI, 태그 |
| `sm` | 32px (h-8) | `px-3` | `text-xs` | 기본 버튼 |
| `md` | 36px (h-9) | `px-4` | `text-sm` | 중요 액션 |
| `lg` | 40px (h-10) | `px-5` | `text-sm` | 모달 CTA |
| `icon-sm` | 24px | - | - | 작은 아이콘 |
| `icon` | 32px | - | - | 기본 아이콘 |
| `icon-lg` | 40px | - | - | 큰 아이콘 |

#### 공통 속성
```
rounded-md
transition-colors duration-150
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--border-focus]
disabled:pointer-events-none disabled:opacity-50
```

### 4.2 입력 (Input)

```css
/* 통일 규격 */
.input-unified {
  height: 36px;                        /* h-9 */
  padding: 0 12px;                     /* px-3 */
  font-size: 14px;                     /* text-sm, 모바일: text-base (16px) */
  background: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);     /* 8px */
  color: var(--text-primary);
  transition: border-color 150ms, box-shadow 150ms;
}
.input-unified:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px oklch(0.80 0.15 85 / 20%);
  outline: none;
}
.input-unified::placeholder {
  color: var(--text-muted);
}
```

> **모바일 주의**: `font-size: 16px` 이상 사용해야 iOS Safari 자동 줌 방지

### 4.3 카드 (Card)

```
bg-[--bg-surface] border border-[--border-default] rounded-lg p-4
```

| 구성요소 | 스타일 |
|---------|--------|
| CardHeader | `px-4 py-3 gap-2` |
| CardTitle | `text-sm font-semibold text-[--text-primary]` |
| CardDescription | `text-xs text-[--text-secondary]` |
| CardContent | `px-4 py-3` |
| CardFooter | `px-4 py-3 flex items-center justify-end gap-2` |

### 4.4 모달/다이얼로그

```css
/* 오버레이 */
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: oklch(0 0 0 / 70%);
  backdrop-filter: blur(4px);
}

/* 컨텐츠 */
.dialog {
  width: min(90vw, 400px);             /* 모바일: 90vw, 데스크탑: 400px */
  max-height: 85vh;
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);     /* 10px */
  box-shadow: var(--shadow-modal);
  padding: 20px;
}
```

### 4.5 뱃지/태그

```
inline-flex items-center rounded-full border px-2 py-0.5
text-[10px] font-medium
```

| Variant | 스타일 |
|---------|--------|
| default | `bg-[--accent-primary]/10 text-[--accent-primary] border-[--accent-primary]/20` |
| success | `bg-[--accent-success]/10 text-[--accent-success] border-[--accent-success]/20` |
| danger | `bg-[--accent-danger]/10 text-[--accent-danger] border-[--accent-danger]/20` |
| info | `bg-[--accent-info]/10 text-[--accent-info] border-[--accent-info]/20` |
| muted | `bg-[--bg-hover] text-[--text-secondary] border-[--border-default]` |

---

## 5. 간격 & 레이아웃 시스템

### 5.1 Spacing Scale (통일)

> 4px 기반 그리드. 두 프로젝트 모두 Tailwind 기본 스케일 사용.

| 토큰 | px | Tailwind | 용도 |
|------|-----|---------|------|
| `--space-1` | 4px | `1` | 아이콘-텍스트 간격 |
| `--space-1.5` | 6px | `1.5` | 인라인 요소 간격 |
| `--space-2` | 8px | `2` | 컴포넌트 내부 패딩 (소) |
| `--space-3` | 12px | `3` | 컴포넌트 내부 패딩 (중) |
| `--space-4` | 16px | `4` | 카드 패딩, 섹션 간격 |
| `--space-5` | 20px | `5` | 모달 패딩 |
| `--space-6` | 24px | `6` | 큰 섹션 간격 |
| `--space-8` | 32px | `8` | 페이지 패딩 |

### 5.2 Border Radius (통일)

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--radius-sm` | 6px | 뱃지, 태그 |
| `--radius-md` | 8px | 버튼, 입력 |
| `--radius-lg` | 10px | 카드, 모달 |
| `--radius-xl` | 14px | 큰 모달 |
| `--radius-full` | 9999px | 원형 (아바타, 토글) |

### 5.3 그림자 (통일)

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--shadow-sm` | `0 1px 2px oklch(0 0 0 / 10%)` | 버튼 |
| `--shadow-md` | `0 4px 12px oklch(0 0 0 / 15%)` | 카드, 드롭다운 |
| `--shadow-lg` | `0 8px 24px oklch(0 0 0 / 20%)` | 패널, 시트 |
| `--shadow-modal` | `0 16px 48px oklch(0 0 0 / 30%)` | 모달 |

### 5.4 Z-Index 스택 (통일)

| Z-Index | 용도 | 비고 |
|---------|------|------|
| 0 | 게임 캔버스 | 기본 레이어 |
| 10 | 캔버스 위 오버레이 | 리사이즈 핸들 |
| 20 | 플로팅 패널 | 사이드 패널, 채팅 |
| 30-39 | 드래그 윈도우 | 동적 할당 |
| 40 | 고정 UI (사이드바, 탑바) | |
| 50 | 드래그 중 요소 | 최상위 드래그 |
| 100 | 모달 오버레이 | `bg-black/70` |
| 101 | 모달 컨텐츠 | |
| 9999 | 빌드 스탬프/디버그 | |

### 5.5 레이아웃 슬롯 (통일)

```
┌────────────────────────────────────────────┐
│ TopBar (h-12, 48px)                        │  ← --space-topbar
├──────┬─────────────────────┬───────────────┤
│      │                     │               │
│ Side │   Main Canvas /     │ Detail Panel  │  ← --space-detail: 360px
│ bar  │   Game Area         │ (optional)    │
│      │                     │               │
│60px  │   flex-1            │               │
│~200px│                     │               │
├──────┴─────────────────────┴───────────────┤
│ BottomBar / Terminal (동적 높이)             │  ← --space-chatbar: 56px
└────────────────────────────────────────────┘
```

---

## 6. 모바일 반응형 시스템

### 6.1 브레이크포인트 (통일)

| 이름 | 픽셀 | Tailwind | 대상 디바이스 | 레이아웃 변화 |
|------|------|----------|-------------|-------------|
| **mobile** | 0~374px | (default) | 소형 폰 | 1열, 풀스크린 |
| **mobile-lg** | 375px+ | `min-[375px]:` | 표준 폰 (iPhone 14) | 1열, 약간 여유 |
| **tablet** | 768px+ | `md:` | 태블릿, 작은 노트북 | 2열 가능, 사이드바 출현 |
| **desktop** | 1024px+ | `lg:` | 노트북, 데스크탑 | 풀 레이아웃 |
| **wide** | 1280px+ | `xl:` | 와이드 모니터 | 최대 너비 제한 |

### 6.2 모바일 대응 규칙

#### 레이아웃

| 요소 | 모바일 (< 768px) | 데스크탑 (≥ 768px) |
|------|------------------|-------------------|
| 사이드바 | 숨김, 바텀시트로 전환 | 60px(축소) / 200px(확장) |
| 탑바 | 간소화 (로고+햄버거) | 전체 네비게이션 |
| 게임 캔버스 | 화면 전체, 터치 지원 | 메인 영역 FIT |
| 채팅 패널 | 풀스크린 모달 (h-[85vh]) | 사이드 시트 (w-[380px]) |
| 디테일 패널 | 풀스크린 모달 | 사이드 패널 (w-[360px]) |
| 모달 | `w-[calc(100%-2rem)]` | `max-w-[400px]` |
| 버튼 | 터치 영역 최소 44px | 32-36px |

#### 터치 대응

```css
/* 모바일 터치 최적화 */
@media (max-width: 767px) {
  button, [role="button"], a {
    min-height: 44px;              /* Apple HIG 최소 터치 영역 */
    min-width: 44px;
  }

  input, textarea, select {
    font-size: 16px !important;    /* iOS 자동 줌 방지 */
  }
}

/* 게임 캔버스 */
canvas {
  touch-action: none;              /* 브라우저 기본 제스처 차단 */
  -webkit-touch-callout: none;
}
```

#### 텍스트 반응형

| 요소 | 모바일 | 데스크탑 |
|------|--------|---------|
| 페이지 제목 | `text-sm` (14px) | `text-base` (16px) |
| 본문 | `text-xs` (12px) | `text-sm` (14px) |
| 라벨 | `text-[10px]` | `text-[11px]` |
| 입력 폰트 | `text-base` (16px, 줌방지) | `text-sm` (14px) |

### 6.3 게임 씬(Phaser/Pixi.js) 반응형 규칙

#### 공통 캔버스 설정

```typescript
// 통일 게임 캔버스 설정
const CANVAS_CONFIG = {
  // 기준 해상도 (디자인 기준)
  BASE_WIDTH: 832,
  BASE_HEIGHT: 576,

  // 스케일 모드
  scaleMode: 'FIT',               // 비율 유지하며 맞춤
  autoCenter: 'CENTER_BOTH',

  // DPR 대응
  zoom: Math.min(window.devicePixelRatio, 2),

  // 최소/최대 크기
  MIN_WIDTH: 320,
  MIN_HEIGHT: 240,
  MAX_WIDTH: 1920,
  MAX_HEIGHT: 1080,
};
```

#### 모바일 게임 대응

| 항목 | 규칙 |
|------|------|
| 스케일 모드 | `FIT` (비율 유지, 레터박스) |
| DPR 제한 | `Math.min(dpr, 2)` (성능) |
| 터치 입력 | `touch-action: none` 필수 |
| 줌/핀치 | 직접 핸들링 (브라우저 줌 차단) |
| 텍스트 해상도 | `resolution: Math.min(dpr * 2, 8)` |
| 픽셀아트 렌더링 | `image-rendering: pixelated` |
| UI 텍스트 최소 크기 | 10px (게임 내), 12px (웹 UI) |
| 세로 모드 | 가로 회전 유도 or 세로 레이아웃 |

#### Viewport 메타

```html
<meta name="viewport"
  content="width=device-width, initial-scale=1, maximum-scale=1,
           user-scalable=no, viewport-fit=cover" />
```

---

## 7. 애니메이션 & 트랜지션 (통일)

### 7.1 Duration 토큰

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--duration-fast` | 150ms | 호버, 포커스, 색상 변경 |
| `--duration-normal` | 300ms | 패널 슬라이드, 페이드 |
| `--duration-slow` | 500ms | 모달 진입, 페이지 전환 |

### 7.2 Easing

| 용도 | 값 |
|------|-----|
| 일반 전환 | `ease-out` / `cubic-bezier(0.16, 1, 0.3, 1)` |
| 바운스 | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| 스프링 | GSAP `back.out(1.7)` |

### 7.3 공통 애니메이션

| 이름 | 용도 | 정의 |
|------|------|------|
| `fadeIn` | 요소 출현 | `opacity: 0→1, 300ms` |
| `fadeInUp` | 카드/목록 출현 | `opacity: 0→1 + translateY(10px→0), 500ms` |
| `slideInRight` | 패널 슬라이드 | `translateX(100%→0), 200ms ease-out` |
| `pulse` | 상태 표시 | `opacity: 1→0.5→1, 2s infinite` |
| `scaleIn` | 모달 진입 | `scale(0.95→1) + opacity: 0→1, 300ms` |

---

## 8. 아이콘 시스템 (통일)

### 기준: Lucide React

| 항목 | 규격 |
|------|------|
| 라이브러리 | `lucide-react` |
| 기본 크기 | `16px` (`h-4 w-4`) |
| 작은 아이콘 | `14px` (`h-3.5 w-3.5`) |
| 큰 아이콘 | `20px` (`h-5 w-5`) |
| 색상 | `currentColor` (부모 텍스트 색상 상속) |
| stroke-width | 2 (기본) |

> company-hq에서 이모지를 아이콘 대용으로 쓰던 것은 점진적으로 Lucide로 전환.
> 게임 내 UI에서는 이모지 허용 (스프라이트 아이콘이 없는 경우).

---

## 9. 스크롤바 & 유틸리티 (통일)

### 스크롤바

```css
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: 2px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--border-strong);
}

.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
```

### 전역 유틸리티

```css
/* 선택 방지 (게임/UI) */
body {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior: none;
}

/* 입력 필드는 선택 허용 */
input, textarea, [contenteditable] {
  -webkit-user-select: text;
  user-select: text;
  touch-action: auto;
}
```

---

## 10. 마이그레이션 체크리스트

### company-hq → 통일 규격

- [ ] 하드코딩 HEX → CSS 변수 토큰 전환
- [ ] `text-[7px]`~`text-[8px]` + CSS 강제 확대 → 실제 크기로 변경
- [ ] 커스텀 버튼 → shadcn/ui Button 컴포넌트 도입
- [ ] 이모지 아이콘 → Lucide React 전환
- [ ] 768px 단일 브레이크포인트 → 375/768/1024 3단계 추가
- [ ] 모바일 터치 영역 44px 최소화 적용
- [ ] `input font-size: 16px` 모바일 적용 (줌 방지)

### teammaker-classic → 통일 규격

- [ ] 라이트 모드 제거 → 다크 모드 전용
- [ ] neutral primary → `--accent-primary` (yellow) 통일
- [ ] OKLch 토큰 값 → 두근컴퍼니 남색 기반으로 조정
- [ ] 상태 색상 → 통일 상태 팔레트 적용
- [ ] 캔버스 배경 → `#1a1a2e` 통일

### 공통 작업

- [ ] 공유 CSS 변수 파일 생성 (`tokens.css`)
- [ ] 공유 컴포넌트 패키지 고려 (monorepo 패턴)
- [ ] Phaser/Pixi.js 캔버스 설정 통일 함수 작성
- [ ] 모바일 반응형 테스트 (375px, 768px, 1024px)
- [ ] DESIGN.md 업데이트

---

## 부록: CSS 변수 전체 목록

```css
:root {
  /* 배경 */
  --bg-base: oklch(0.15 0.02 270);
  --bg-surface: oklch(0.10 0.02 270);
  --bg-input: oklch(0.12 0.015 270);
  --bg-elevated: oklch(0.08 0.015 270);
  --bg-hover: oklch(0.20 0.02 270);

  /* 테두리 */
  --border-default: oklch(0.30 0.02 270);
  --border-subtle: oklch(0.25 0.015 270);
  --border-strong: oklch(0.35 0.025 270);
  --border-focus: oklch(0.80 0.15 85 / 50%);

  /* 텍스트 */
  --text-primary: oklch(0.95 0 0);
  --text-secondary: oklch(0.65 0 0);
  --text-muted: oklch(0.45 0 0);
  --text-inverse: oklch(0.15 0 0);

  /* 강조 */
  --accent-primary: oklch(0.82 0.15 85);     /* #f5c842 */
  --accent-success: oklch(0.70 0.18 145);    /* #50d070 */
  --accent-danger: oklch(0.65 0.22 25);      /* #ef4444 */
  --accent-info: oklch(0.68 0.15 250);       /* #60a0e0 */
  --accent-purple: oklch(0.60 0.20 300);     /* #a080f0 */

  /* 폰트 */
  --font-sans: 'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', ui-monospace, monospace;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --radius-xl: 14px;
  --radius-full: 9999px;

  /* 그림자 */
  --shadow-sm: 0 1px 2px oklch(0 0 0 / 10%);
  --shadow-md: 0 4px 12px oklch(0 0 0 / 15%);
  --shadow-lg: 0 8px 24px oklch(0 0 0 / 20%);
  --shadow-modal: 0 16px 48px oklch(0 0 0 / 30%);

  /* 레이아웃 */
  --space-topbar: 48px;
  --space-sidebar-collapsed: 60px;
  --space-sidebar-expanded: 200px;
  --space-chatbar: 56px;
  --space-detail-panel: 360px;
  --space-chat-panel: 380px;

  /* 애니메이션 */
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;
}
```
