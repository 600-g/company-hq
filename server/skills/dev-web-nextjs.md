# 웹 개발 SOP (Next.js + React)

## 역할
Next.js/Phaser/Tailwind/React 프론트엔드 구현 전담.

## 전제 확인

### 1단계: 프로젝트 구조 파악
- `ls ui/app/` 로 현재 라우트/컴포넌트 구조 확인
- `ui/package.json` 의존성 확인
- `ui/CLAUDE.md` 프로젝트 규칙 숙지

### 2단계: 스택 버전 고정 (두근컴퍼니 현재)
- Next.js 16.1.6 (App Router)
- React 19.2.3
- TypeScript 5.x
- Tailwind CSS 4.x
- Phaser 3.90.0
- **버전 변경 금지** (`npm install next@...` 실행 금지)

### 3단계: 이전 산출물 검토
- `chat_history/`, `plans/*.md` 에서 관련 작업 확인
- 디자인 팀 산출물 (색상/폰트/에셋 경로) 적용

## 구현 규칙

### 타입 안전
- 모든 컴포넌트 props는 `interface` 로 타입 정의
- `any` 금지, 불명확 시 `unknown` + narrowing
- 훅/콜백도 타입 명시

### App Router (Next.js 15+)
- `params`/`searchParams` 는 Promise → `await` 필수
- `cookies()`/`headers()` 도 async
- 기본 fetch는 `no-store`

### Phaser 씬 규칙
- `pixelArt: false`, `antialias: true` (텍스트 선명)
- 스프라이트는 `tex.setFilter(0)` (NEAREST)
- 텍스트 `resolution: 8`
- 폰트: `Pretendard Variable` (FONT 상수)
- **sprites.ts 의 `load.image` 경로 전부 `ls`로 존재 확인** (missing-texture 빗금 방지)

### 파일 크기
- 컴포넌트 300줄 이하 (초과 시 분리)
- 씬 파일은 400-500줄 가이드

### 금지
- `console.log` 프로덕션 남기기
- 인라인 스타일 남용 (Phaser 외)
- `position: absolute` 남용 (`flex` 우선)

## 검증 (커밋 전 필수)

```bash
cd ~/Developer/my-company/company-hq/ui && npx next build
```

- [ ] 빌드 성공 (errors 0)
- [ ] TypeScript 컴파일 성공
- [ ] 브라우저 콘솔 에러 0
- [ ] 데스크탑(1280px) + 모바일(375px) 양쪽 확인
- [ ] `DESIGN.md` 팔레트 준수
- [ ] Phaser 기존 씬(Office/Login/TankShooter) 회귀 없음

## 배포

```bash
bash deploy.sh
```

- `out/version.json` 에 BUILD_ID 자동 주입됨
- Cloudflare Pages 배포 후 BuildStamp 우측 하단 해시 확인

## 핸드오프 → QA
완료 시 다음 산출:
- 변경 파일 전체 경로 목록
- 빌드 결과 스니펫 (`next build` tail)
- 수동 확인한 시나리오 리스트
- 남은 이슈/리스크 (있으면)
- `RESULT: done | files: [...] | next: qa`
