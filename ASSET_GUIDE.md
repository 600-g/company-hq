# 두근컴퍼니 에셋 생성 가이드
> 버전: v1.0 | 업데이트: 2026-03-19

## 모델 & 설정

| 항목 | 값 |
|------|-----|
| **모델** | `fal-ai/nano-banana` |
| **API Key 환경변수** | `FAL_KEY` (.env에 저장) |
| **기본 크기** | 768x512 (일반), 1280x256 (파노라마), 512x512 (개별 에셋) |

## 스타일 프롬프트 공식

모든 이미지 생성 시 아래 스타일 접미사를 반드시 붙인다:

```
semi-pixel art style, clean detailed illustration with retro game aesthetic, vibrant warm colors, crisp lines
```

### 뷰별 추가 키워드
- **로그인 (정면뷰)**: `front view, Seoul Korea city street, evening warm lighting`
- **사무실 (탑뷰)**: `top-down view, modern office interior, warm bright lighting`
- **창밖 (파노라마)**: `wide panoramic view, Seoul skyline with Namsan Tower, horizontal seamless`

## 계절별 키워드

| 계절 | 추가 키워드 |
|------|------------|
| 봄 (3~5월) | `cherry blossom trees, pink petals, fresh green, spring` |
| 여름 (6~8월) | `lush green trees, bright blue sky, vivid sunlight, summer` |
| 가을 (9~11월) | `orange red autumn trees, falling leaves, golden hour, autumn` |
| 겨울 (12~2월) | `snow covered, bare trees, cold blue tones, snowflakes, winter` |

## 시간대별 키워드

| 시간대 | 추가 키워드 |
|--------|------------|
| 낮 (6~17시) | `daytime, blue sky, bright` |
| 석양 (17~20시) | `sunset, orange purple sky, golden warm light` |
| 밤 (20~6시) | `night, dark blue sky, stars, moon, warm window lights glowing, streetlights` |

## 날씨 키워드

| 날씨 | 추가 키워드 |
|------|------------|
| 맑음 | `clear sky, clouds` |
| 비 | `rainy, wet streets, gray clouds, rain drops` |
| 눈 | `snowy, snowflakes falling, white ground` |
| 흐림 | `overcast, gray sky, moody` |

## 에셋 목록

### 로그인 화면 (정면뷰, 768x512)
- `login_spring.png` — 봄 거리
- `login_summer.png` — 여름 거리
- `login_autumn.png` — 가을 거리
- `login_winter.png` — 겨울 거리
- `login_night.png` — 야간 거리

### 성장 건물 (정면뷰, 512x512~512x768)
- `building_1f.png` — 1층 (초기)
- `building_2f.png` — 2층
- `building_3f.png` — 3층
- `building_5f.png` — 5층 (대기업)

### 창밖 풍경 (파노라마, 1280x256)
- `skyline_day.png` — 낮 서울 스카이라인
- `skyline_sunset.png` — 석양
- `skyline_night.png` — 야경

### 사무실 내부 요소 (탑뷰, 개별)
- 바닥, 벽, 가구 등은 Phaser Graphics + 기존 Pixel Agents 에셋 유지
- AI 생성은 배경/풍경에만 사용

## 생성 코드 예시

```python
import fal_client

STYLE = "semi-pixel art style, clean detailed illustration with retro game aesthetic, vibrant warm colors, crisp lines"

result = fal_client.subscribe(
    "fal-ai/nano-banana",
    arguments={
        "prompt": f"front view of modern city street with office building, trees, people walking, Seoul Korea, spring cherry blossoms, {STYLE}",
        "image_size": {"width": 768, "height": 512},
    },
)
url = result["images"][0]["url"]
```

## 규칙
1. **일관성**: 같은 장면은 같은 프롬프트 공식 사용
2. **모델 고정**: 반드시 `fal-ai/nano-banana` 사용
3. **스타일 접미사 필수**: 위 공식 빠지면 스타일 깨짐
4. **크기 통일**: 같은 용도는 같은 해상도
5. **파일 경로**: `ui/public/assets/gen/` 에 저장
6. **캐릭터/가구**: AI 생성 X, 기존 스프라이트시트 유지 (애니메이션 필요)
