# TeamMaker Classic (복제본)

원본 TeamMaker 소스를 완전 복제한 폴더. 두근컴퍼니와 별개 Next.js 프로젝트로 독립 실행하여 **side-by-side 비교** 가능.

## 출처
- 원본: `~/Desktop/teammaker/` (TeamMaker.exe 0.2.1 패키지에서 추출)
- 복사일: 2026-04-15
- 라이선스: 원본 확인 필요 (상용 가능성, 외부 공개 X)

## 디렉토리
```
teammaker-classic/
├── src/                # Next.js 16 + React 19 + Pixi.js + Zustand
├── public/             # 캐릭터 8명, 타일 284개, 레이아웃 JSON
├── electron/           # Electron 메인 프로세스 (실행 X — 우리는 웹만)
├── scripts/            # 빌드 스크립트
├── messages/           # next-intl 다국어
├── server.js           # Next.js 커스텀 서버
├── package.json        # 별도 의존성 (pixi.js, gsap 등)
└── ...
```

## 실행 방법 (별도 포트 4827)

```bash
cd ~/Developer/my-company/company-hq/teammaker-classic
npm install                   # 첫 1회만 (수 분 소요)
npm run dev                   # → http://localhost:4827
```

두근컴퍼니(`localhost:3000`)와 동시 실행 가능. 비교용.

## ⚠️ 주의

### 1. Claude API 키 필요
TeamMaker는 본인 Anthropic API 키를 사용자가 입력하는 BYO-API 모델.
온보딩 화면에서 키 입력 단계가 나옴.

→ 우리는 Max 플랜 → 추후 `src/lib/claude.ts` 어댑터로 대체 예정 (Phase B).

### 2. Electron 실행 X
이 복사본은 **Next.js 웹 모드만** 사용. Electron 실행은 무시.

### 3. node_modules 미포함
첫 실행 시 `npm install` 자동 다운로드. ~500MB 수준.

### 4. git 추가 정책
- `.gitignore` 에 `node_modules/`, `.next/`, `dist-electron/`, `out/` 포함됨
- 소스만 git에 보존, 빌드 산출물 제외

## 단계별 통합 로드맵

| Phase | 상태 | 작업 |
|---|---|---|
| **A. 복제** | ✅ 완료 (이 폴더) | 소스 542 파일 보존 |
| **B. 백엔드 어댑터** | ⏳ 다음 | `lib/claude.ts` → 우리 `/api/dispatch/smart` 경유 변경 |
| **C. 라우팅 통합** | ⏳ | 두근컴퍼니 메인에서 `/teammaker-classic` 진입 라우트 |
| **D. 비교 평가** | ⏳ | 양쪽 동시 실행해서 기능/UX 직접 비교 |
| **E. 우리꺼 누락 보완** | ⏳ | TeamMaker에만 있는 좋은 기능 우리 시스템에 이식 |

## 비교 체크리스트 (D 단계용)

- [ ] 채팅 응답 표시 일관성
- [ ] 핸드오프 승인 UX
- [ ] 사무실 시각 (Pixi vs Phaser)
- [ ] 캐릭터 애니메이션 다양성 (idle/run/sit/reading/phone)
- [ ] 세션 분리 / 전환 / 검색
- [ ] 터미널 출력 표시
- [ ] 가구 편집 / Undo·Redo
- [ ] 설정 / 키 관리
- [ ] 온보딩 흐름

각 항목 어느 쪽이 우수한지 메모 → 우리꺼에 이식 결정.
