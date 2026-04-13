# 두근컴퍼니 HQ — 프로젝트 규칙

## 에셋 작업 (마을/사무실 꾸미기)

**반드시 먼저 읽기**: `ui/public/assets/pokemon_assets/ASSET_GUIDE.md`

### 핵심 규칙
1. 원본 `Tilesets/*.png` 직접 크롭 절대 금지
2. `sliced/`, `composites/`, `pokemon_furniture/` 정제된 파일만 사용
3. 파일 경로 사용 전 `ls` 존재 확인 (추측 금지)
4. 같은 장면 내 시트 혼용 금지 (Celadopole + Johto 섞지 말기)
5. 완료 전 자가 체크리스트 통과 필수

### 자가 체크리스트
- [ ] 모든 파일 경로 `ls` 확인
- [ ] 원본 Tilesets 직접 크롭 없음
- [ ] 시트 스타일 혼용 없음
- [ ] 바닥/배경 구멍 없음
- [ ] composite 크기 `HxW` 일치
- [ ] Before/After 비교 생성
- [ ] layout 데이터 업데이트

### 작업 절차
1. `sliced_preview/<시트>_grid.png`로 좌표 파악
2. `composites/` 우선 → `sliced/` 보조
3. 후보 3-5개 제시 후 사용자 선택 대기 (자동 결정 금지)
4. 선택 후 배치 + 스크린샷
5. 자가 체크리스트 → 응답

### 응답 시 필수 포함
- 사용 파일 전체 경로 목록
- 각 파일 카테고리
- 체크리스트 결과
- 최종 스크린샷/diff 경로

### 금지 응답 패턴
- "32x32로 잘라서 쓰겠습니다" (이미 슬라이스됨)
- "대략 이 영역이...같아" (정확 파일명 확인 후 사용)
- "예쁘게 배치했습니다" (근거 없는 완료 선언)

## 세션 복원

이 프로젝트 작업 이어할 때:
1. `CLAUDE.md` (이 파일) 자동 로드
2. `ui/public/assets/pokemon_assets/ASSET_GUIDE.md` 확인
3. 사용자 메모리 `project_doogeun_assets.md` 트리거 매칭
