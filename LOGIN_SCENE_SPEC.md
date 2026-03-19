# 로그인 야외 씬 스펙
> 두근컴퍼니 로그인 화면 — 게임형 인터랙티브 씬

## 컨셉

포켓몬/도트 타이쿤 느낌의 **게임 화면**. 정지 이미지가 아닌, 각 요소가 독립적으로 움직이는 살아있는 거리.

## 뷰

**정면뷰 (Front View)** — 서울 도심 거리, 두근컴퍼니 건물이 가운데.

## 레이어 구조 (뒤→앞)

```
depth 0: 하늘 (그라디언트 + 구름 스프라이트 흘러감)
depth 1: 뒤쪽 빌딩 스카이라인 (정적 이미지 또는 스프라이트)
depth 2: 메인 건물 (두근컴퍼니, 성장하는 스프라이트)
depth 3: 좌우 건물 (정적 스프라이트)
depth 4: 나무 (개별 스프라이트, 바람에 흔들림)
depth 5: 가로등 (야간 빛 효과)
depth 6: 인도 + 도로 (정적 배경)
depth 7: 걸어다니는 사람들 (개별 스프라이트, 양방향)
depth 8: 날씨 파티클 (비/눈/꽃잎/낙엽)
depth 9: 로그인 UI 오버레이
```

## 필요 에셋 목록

### AI 생성 (Nano Banana, 개별 스프라이트)

| 에셋명 | 크기 | 설명 | 프롬프트 키워드 |
|--------|------|------|----------------|
| `sky_day` | 960x200 | 낮 하늘 (구름 없이) | blue sky gradient, no clouds |
| `sky_sunset` | 960x200 | 석양 하늘 | orange purple sunset sky |
| `sky_night` | 960x200 | 밤 하늘 (별 포함) | dark night sky with stars and moon |
| `cloud_1~3` | 128x64 | 구름 3종 (투명배경 어려우면 하늘색 배경) | fluffy white cloud, simple |
| `skyline_back` | 960x180 | 뒤쪽 서울 빌딩 실루엣 | Seoul city buildings silhouette, distant |
| `building_main_1f` | 200x250 | 메인 건물 1층 | modern glass office building, 1 floor, front view |
| `building_main_2f` | 200x350 | 메인 건물 2층 | modern glass office building, 2 floors |
| `building_main_3f` | 200x450 | 메인 건물 3층 | modern glass office building, 3 floors |
| `building_left` | 150x300 | 좌측 건물 | modern city building, front view |
| `building_right` | 150x280 | 우측 건물 | modern city building, slightly different |
| `tree_1~3` | 64x96 | 나무 3종 (다른 형태) | city tree, front view, green |
| `streetlight` | 16x80 | 가로등 | street lamp post, front view |
| `ground` | 960x120 | 인도 + 도로 | sidewalk and road, front view, city |
| `person_1~6` | 32x48 | 걸어다니는 사람 6종 | small person walking, side view, office worker |

### 코드로 처리

| 효과 | 방식 |
|------|------|
| 구름 이동 | cloud 스프라이트 tween (좌→우 반복) |
| 나무 흔들림 | tree 스프라이트 rotation tween (미세 좌우) |
| 사람 걷기 | person 스프라이트 x 이동 + y 바운스 |
| 비 | Graphics API 선 파티클 |
| 눈 | Graphics API 원 파티클 |
| 꽃잎 (봄) | Graphics API 핑크 원 파티클 |
| 낙엽 (가을) | Graphics API 주황 사각 파티클 |
| 별 반짝임 (밤) | Graphics alpha tween |
| 가로등 빛 (밤) | Graphics fillCircle + alpha tween |
| 계절 색조 | 전체 카메라 또는 개별 스프라이트 setTint |
| 건물 성장 | 팀 수에 따라 building_main_Xf 교체 |

## 계절/시간대 처리

### 시간대 (자동 감지)
- **낮 (6~17시)**: sky_day, 원본 색상
- **석양 (17~20시)**: sky_sunset, 따뜻한 tint
- **밤 (20~6시)**: sky_night, 파란 tint, 별 반짝임, 가로등 ON, 건물 창문 노랑빛

### 계절 (자동 감지)
- **봄 (3~5월)**: 나무에 핑크 tint, 꽃잎 파티클
- **여름 (6~8월)**: 원본, 강한 햇빛
- **가을 (9~11월)**: 나무에 오렌지 tint, 낙엽 파티클
- **겨울 (12~2월)**: 나무에 블루 tint (앙상), 눈 파티클, 바닥 흰색 오버레이

### 날씨 (실시간 API)
- **맑음**: 구름 적게
- **흐림**: 구름 많이, 약간 어두운 오버레이
- **비**: 빗줄기 파티클, 어두운 오버레이
- **눈**: 눈송이 파티클
- **천둥**: 비 + 간헐적 화면 번쩍임

## 상호작용

- 건물 입구 클릭 → 로그인 카드 표시 (또는 항상 표시)
- 사람 클릭 → 작은 말풍선 (선택적)
- 배경 마우스 패럴랙스 (선택적, 뒤쪽 레이어 미세 이동)

## 기술

- **엔진**: Phaser 3
- **해상도**: 960x540
- **스프라이트 로드**: preload()에서 전부 로드
- **AI 생성 모델**: `fal-ai/nano-banana`
- **스타일 프롬프트**: `semi-pixel art style, clean detailed illustration with retro game aesthetic, vibrant warm colors, crisp lines`
- **파일 경로**: `ui/public/assets/gen/login/`

## 우선순위

1. 하늘 + 구름 이동
2. 건물들 배치 (메인 + 좌우)
3. 바닥 (인도/도로)
4. 나무 흔들림
5. 사람 걷기
6. 날씨/계절 효과
7. 상호작용
