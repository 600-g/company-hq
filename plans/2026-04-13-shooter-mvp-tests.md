# 슈팅게임 MVP — 테스트 케이스

## 스모크 테스트 (필수 통과)

### T1. 진입 플로우
- [ ] Office 로드 시 우측 상단에 아케이드 기계 보임
- [ ] 아케이드에 커서 올리면 pointer 변경
- [ ] 클릭 시 TankShooterScene 로드, Office 일시정지
- [ ] 콘솔 에러 0

### T2. 게임 조작
- [ ] 각도 슬라이더 0-90도
- [ ] 파워 슬라이더 20-100
- [ ] 발사 버튼 클릭 시 포탄 발사 (포물선 궤적)
- [ ] 포탄이 블록에 닿으면 블록 파괴 + 점수 +10
- [ ] 모든 블록 파괴 시 "승리" 메시지 + 리트라이 버튼

### T3. 종료/복귀
- [ ] ESC 키 → OfficeScene 복귀
- [ ] 종료 버튼 UI → OfficeScene 복귀
- [ ] 복귀 후 기존 Office WebSocket 연결/그리드 드래그 정상

### T4. 반응형
- [ ] 1280px 데스크탑 — 마우스 조작
- [ ] 375px 모바일 — 터치 조작
- [ ] 슬라이더 반응 확인

### T5. 빌드 검증
- [ ] `npx next build` 통과 (warnings OK, errors 0)
- [ ] TypeScript 컴파일 에러 0

## 회귀 테스트 (기존 기능 영향 없음)

### R1. Office 기능
- [ ] 팀 아이콘 드래그/드롭 정상
- [ ] 서버모니터 진입 정상
- [ ] LoginScene 전환 정상

### R2. 에셋 무결성
- [ ] pokemon_assets 파일 손상/이동 없음
- [ ] sprites.ts 기존 키 유지

## 수동 QA 체크리스트
- [ ] 시각적으로 DESIGN.md 팔레트 준수
- [ ] 아케이드 기계가 사무실 테마와 어울림
- [ ] 8bit 탱크가 포켓몬 스타일과 이질감 적음

## Playwright 자동화 (qa 팀 작성)
파일: `ui/tests/shooter-mvp.spec.ts`
