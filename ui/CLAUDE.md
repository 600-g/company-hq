# CLAUDE.md — company-hq 프론트엔드
> 이 파일은 company-hq/ui/ 디렉토리 전용 규칙이다.
> 프론트엔드팀이 이 영역을 수정할 때 자동 로드된다.
> 상위 CLAUDE.md(CPO 헌법)와 함께 적용된다.

---

## 역할

너는 company-hq의 **프론트엔드 담당**이다.
`ui/` 디렉토리의 모든 컴포넌트, 게임 씬, 스타일을 관리한다.

---

## 기술 스택

| 기술 | 버전 | 용도 |
|------|------|------|
| Next.js | 16.1.6 | SSR + 라우팅 |
| React | 19.2.3 | UI 컴포넌트 |
| TypeScript | 5.x | 타입 안전 |
| Tailwind CSS | 4.x | 스타일링 |
| Phaser | 3.90.0 | 픽셀아트 사무실/로그인 씬 |
| WebSocket | - | 실시간 채팅 클라이언트 |

---

## 파일 구조

```
ui/
├── app/
│   ├── page.tsx              ← 메인 페이지
│   ├── globals.css           ← 글로벌 스타일 (Pretendard 폰트)
│   ├── components/
│   │   ├── Office.tsx        ← 메인 레이아웃 + 사이드바 + DispatchChat
│   │   ├── ChatPanel.tsx     ← 채팅 입력/출력 (WebSocket)
│   │   ├── ChatWindow.tsx    ← 드래그/리사이즈 채팅 윈도우
│   │   ├── ServerDashboard.tsx ← 서버 모니터링 대시보드
│   │   ├── LoginPage.tsx     ← 로그인
│   │   ├── DevTerminal.tsx   ← 웹터미널 (ttyd)
│   │   └── WeatherBoard.tsx  ← 날씨 위젯
│   ├── game/
│   │   ├── OfficeScene.ts    ← Phaser 사무실 씬
│   │   ├── OfficeGame.tsx    ← Phaser 게임 초기화
│   │   ├── LoginScene.ts     ← 로그인 씬
│   │   ├── LoginGame.tsx     ← 로그인 게임 초기화
│   │   └── sprites.ts        ← 에셋 프리로드 + 애니메이션
│   └── config/
│       └── teams.ts          ← 팀 목록 (프론트 폴백)
└── public/assets/            ← 픽셀아트 에셋
```

---

## 코딩 규칙

### 필수
- TypeScript strict mode
- 컴포넌트 300줄 이하 (넘으면 분리)
- Tailwind 유틸리티 클래스 사용
- 다크모드 기본 (DESIGN.md 팔레트 준수)
- 웹/모바일 동일 스펙 (한쪽만 구현 = 버그)

### 금지
- `position: absolute/sticky` 남용 → `flex` 아이템 사용
- 인라인 스타일 (Phaser 씬 제외)
- `console.log` 프로덕션 코드에 남기기
- `any` 타입 사용

### Phaser 씬 규칙
- `pixelArt: false`, `antialias: true` (텍스트 선명도)
- 스프라이트는 `tex.setFilter(0)` (NEAREST) 로 픽셀 유지
- 텍스트 `resolution: 8` (최고 해상도)
- 폰트: Pretendard Variable (FONT 상수)
- OfficeScene 수정 시 기존 그리드/드래그/WebSocket 절대 깨지 않기
- 에셋 추가 → sprites.ts preload에도 등록

---

## 디자인 팔레트 (DESIGN.md 기준)

| 용도 | 색상 |
|------|------|
| 배경 (메인) | #1a1a2e |
| 배경 (짙은) | #0f0f1f |
| 테두리 | #2a2a5a |
| 강조 (노랑) | yellow-400 (#f5c842) |
| 성공 (초록) | green-400 (#50d070) |
| 에러 (빨강) | red-400 (#ff6b6b) |
| 텍스트 (기본) | #e5e7eb |
| 텍스트 (보조) | #888 |
| 폰트 (기본) | Pretendard Variable, 16px |
| 폰트 (코드) | JetBrains Mono |

---

## API 연동

### API Base 규칙
```typescript
function getApiBase(): string {
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h === "127.0.0.1" || h.endsWith(".local");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}
```

### WebSocket 연결
```typescript
function getWsBase(): string {
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h.startsWith("192.168.");
  return isLocal ? `ws://${h}:8000` : `wss://api.600g.net`;
}
// 경로: /ws/chat/{team_id}
```

### API 스펙 참조
- 전체 API 목록: `company-hq/shared/api_spec.md`
- 새 API 필요 시: `company-hq/shared/api_requests.md`에 기록

---

## 검증 체크리스트 (커밋 전 필수)

```bash
# 1. 빌드
cd ~/Developer/my-company/company-hq/ui && npx next build

# 2. 타입 체크 (빌드에 포함되지만 별도 확인)
npx tsc --noEmit

# 3. 배포
cd ~/Developer/my-company/company-hq && bash deploy.sh
```

- [ ] `npx next build` 성공
- [ ] TypeScript 에러 0개
- [ ] 모바일(375px) + 데스크탑(1280px) 동작 확인
- [ ] DESIGN.md 팔레트만 사용
- [ ] Phaser 씬 기존 기능 정상
- [ ] 브라우저 콘솔 에러 0개

---

## 팀 간 협업

| 대상 | 참조 파일 | 프로토콜 |
|------|----------|---------|
| 백엔드팀 | `shared/api_spec.md` | API 스펙 참조, 새 API 요청 시 `api_requests.md` |
| 디자인팀 | `shared/asset_changelog.md` | 에셋 변경 확인, 새 에셋 요청 시 디스패치 |
| CPO | 상위 `CLAUDE.md` | 전체 정책 준수 |
