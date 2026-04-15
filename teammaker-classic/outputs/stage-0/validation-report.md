# Step 0.4: Validation Report

## 검증 항목: Gather 스타일 2D 캔버스 기술 타당성

### 종합 평가: 8/10 (매우 가능)

## 1. Gather.town은 어떻게 구현했는가?
- **렌더링 엔진**: PixiJS (WebGL 기반 2D 렌더링)
- **애니메이션**: GSAP (GreenSock Animation Platform)
- **캔버스 구조**: 다중 HTML5 Canvas 레이어 (배경, 캐릭터, 인터랙티브 요소 분리)
- **백엔드**: Go + Lua
- **채팅**: Rocket.Chat

## 2. 추천 기술 스택

| 레이어 | 기술 | 이유 |
|--------|------|------|
| 캔버스 렌더링 | **PixiJS v8** | Gather.town이 사용. Phaser 대비 3배 작고(450KB vs 1.2MB), 2배 빠름 |
| React 연동 | **@pixi/react v8** | 공식 React 바인딩, JSX로 선언적 작성 |
| 애니메이션 | **GSAP** | Gather.town과 동일. 상태 전환 애니메이션 최적 |
| 실시간 통신 | **Socket.io** | 재연결, 룸, 폴백 트랜스포트 기본 지원 |
| 프레임워크 | **React + TypeScript** | @pixi/react와 자연스럽게 연결 |
| 상태 관리 | **Zustand** 또는 **Jotai** | 경량, 실시간 상태에 적합 |

### 왜 PixiJS인가?
- **Phaser**: 물리엔진, 오디오 등 불필요한 기능 포함. 750KB 추가 코드
- **Konva.js**: 정적 다이어그램에 좋지만 연속 애니메이션과 WebGL에 약함
- **Raw Canvas**: 너무 저수준. PixiJS가 제공하는 것을 다시 만들게 됨

## 3. 성능 검증
- PixiJS는 **1,000+ 스프라이트를 60fps**로 처리 가능
- 가상 오피스의 50-200개 데스크 규모는 충분히 여유
- **최적화 전략**: 캔버스 레이어링, 스프라이트 배칭, 더티 플래그 렌더링, 뷰포트 컬링

## 4. 오픈소스 레퍼런스

| 프로젝트 | 스택 | 특징 |
|----------|------|------|
| [WorkAdventure](https://github.com/workadventure/workadventure) | Phaser, TypeScript, Docker | 가장 성숙한 오픈소스 Gather 대안 |
| [gather-clone](https://github.com/trevorwrightdev/gather-clone) | Next.js, Pixi.js, Socket.io, Supabase | **가장 유사한 레퍼런스** |
| [virtual-office](https://github.com/ashutoshpaliwal26/virtual-office) | Socket.IO, 2D canvas | 간단한 구현 참고용 |

## 5. MVP 개발 예상 (1-2명 기준, 총 8-10주)

| 기능 | 복잡도 | 소요 |
|------|--------|------|
| 그리드 기반 오피스 캔버스 (PixiJS) | 중 | 1-2주 |
| 책상 드래그앤드롭 배치 | 중 | 1주 |
| 줌/패닝 | 낮음 | 2-3일 |
| 활성/비활성 상태 애니메이션 | 중하 | 3-5일 |
| WebSocket 서버 (실시간 업데이트) | 중 | 1주 |
| 에이전트 상태 브로드캐스팅/동기화 | 중 | 1주 |
| 오피스 레이아웃 저장/로드 | 낮음 | 2-3일 |
| UI (사이드바, 컨트롤, 상태 패널) | 중 | 1-2주 |
| 폴리싱, 테스팅, 엣지 케이스 | 중 | 2-3주 |

## 6. 핵심 리스크 & 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| PixiJS 학습 곡선 | 중 | @pixi/react v8이 크게 줄여줌. gather-clone 참고 |
| WebSocket 상태 동기화 버그 | 높음 | 초기엔 전체 상태 스냅샷 브로드캐스트. 나중에 최적화 |
| 드래그앤드롭 어색함 | 중 | 그리드 스냅 사용. 초기에 모바일/트랙패드 테스트 |
| 많은 애니메이션 요소 성능 | 낮음 | MVP 규모(<200 요소)에서는 문제없음. 스프라이트 시트와 레이어링으로 보험 |
| 비디오/오디오 스코프 크립 | 높음 | MVP에서 명시적 제외. 필요시 써드파티(Agora, LiveKit) 활용 |
| React + PixiJS 상태 충돌 | 중 | PixiJS 상태와 React 상태 분리. 공유 스토어(Zustand)로 통신 |

## 7. 결론
비디오/오디오 없이 **가상 오피스 시각화 + 실시간 상태 표시**에 집중한다면, PixiJS v8 + @pixi/react + Socket.io 스택으로 **1-2명이 2-3개월 내 MVP 구현이 충분히 가능**하다. 기존 Gather.town이 같은 기술을 사용하고 있고, 오픈소스 레퍼런스도 다수 존재하여 기술적 불확실성은 낮은 편이다.
