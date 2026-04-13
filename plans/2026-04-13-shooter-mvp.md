# 사무실 내 아케이드 슈팅게임 MVP — 실행 계획

- **생성**: 2026-04-13
- **범위**: 옵션 A (초미니 MVP)
- **시간 예산**: 40분
- **CPO**: doogeun-cpo (의사결정 담당)

## PRD
OfficeScene 우측 상단 구석에 아케이드 기계 오브젝트 배치, 클릭 시 8bit 탱크 슈팅 미니게임 씬(TankShooterScene)을 Phaser scene.launch로 띄운다. 기존 서버모니터 트리거 패턴 재사용.

## 사용자 결정 (기본값 적용)
- **Q1. 아케이드 위치**: ⓑ 우측 상단 구석 (서버 반대편)
- **Q2. 게임 종료**: ⓑ ESC + 종료 버튼 UI
- **Q3. 탱크 스프라이트**: ⓑ Pokemon Items (테마 통일)

## 버튼/진입 위치
- **Scene**: OfficeScene
- **좌표 힌트**: x≈WORLD_W-60, y≈WALL_H*TILE+40 (우측 상단 벽 코너)
- **오브젝트**: composites/Game Corner interior/obj_r014_c04_2x1.png (아케이드 캐비닛)
- **라벨**: "ARCADE" (yellow-400)
- **hitzone**: `this.add.zone(x, y+16, 40, 60).setInteractive({useHandCursor:true})`

## 트리거 패턴
Phaser `scene.launch('TankShooterScene')` + `scene.pause('OfficeScene')`. 종료 시 `scene.stop` + `scene.resume('OfficeScene')`. Next router 이동 X — Phaser 내부 씬 전환.

## 사용 에셋
| 용도 | 경로/구현 |
|---|---|
| 아케이드 기계 | `ui/public/assets/pokemon_assets/composites/Game Corner interior/obj_r014_c04_2x1.png` |
| 작은 게임기 | `ui/public/assets/pokemon_assets/composites/Game Corner interior/obj_r018_c04_1x1.png` |
| 탱크 바디 | `ui/public/assets/pokemon_assets/Items/IRONBALL.png` |
| 포탄 | `ui/public/assets/pokemon_assets/Items/BEASTBALL.png` (축소) |
| 파괴 블록 | `composites/Factory interior/` 금속 블록 3-5개 |
| 배경 | 단색 `#0f0f1f` + 그리드 `#2a2a5a` |

## 실행 단계 (8)

| # | 팀 | 작업 | 산출 |
|---|---|---|---|
| 1 | design | 아케이드 3개 + 블록 3개 스크린샷 preview | asset_preview.png + 경로 리스트 |
| 2 | frontend | `sprites.ts`에 arcade_machine 키 추가 | 파일 수정 |
| 3 | frontend | `OfficeScene.ts` drawOfficeDetails()에 이미지+라벨+hitzone, pointerdown 핸들러 | 파일 수정 |
| 4 | frontend | `TankShooterScene.ts` 신규 (탱크/발사/AI/블록/점수/ESC) | 신규 파일 |
| 5 | frontend | `OfficeGame.tsx` scene 배열에 TankShooterScene 등록 | 파일 수정 |
| 6 | design | DESIGN.md 팔레트 준수 색상 상수 (아군 green-400, 적 red-400, 총알 yellow-400) | 상수 값 |
| 7 | qa | 데스크탑+모바일 터치, ESC 복귀 시 WebSocket/그리드, `npx next build` | QA 리포트 |
| 8 | frontend | `deploy.sh` 실행 | 배포 완료 |

## 리스크
1. 아케이드 스프라이트 톤이 사무실 Celadopole 시트와 혼용 가능 → design 팀 톤 체크
2. 모바일 터치 조작 시간 부족 → 스와이프 최소 조작으로 축소
3. Phaser scene pause 시 WebSocket/드래그 상태 보존 검증 필요
4. 탱크 게임 로직 팽창 위험 → MVP 고정 (1 레벨, 적 3대, 블록 20개, 점수)

## 품질 게이트 (QA 필수 통과)
- [ ] 골든 패스: Office → 아케이드 클릭 → 슈팅 게임 → 발사 → 블록 파괴 → ESC → Office 복귀
- [ ] 1280px / 375px 양쪽 동작
- [ ] 콘솔 에러 0
- [ ] `npx next build` 통과
- [ ] ESC 복귀 후 WebSocket/그리드 정상
- [ ] DESIGN.md 팔레트 준수

## 변경 이력
- 2026-04-13 v1: 좌측 메뉴 버튼 → 수정됨
- 2026-04-13 v2: 사무실 내 아케이드 오브젝트 + Pokemon 에셋 활용 (확정)
