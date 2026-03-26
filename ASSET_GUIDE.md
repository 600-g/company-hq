# 두근컴퍼니 에셋 생성 가이드
> 버전: v2.0 | 업데이트: 2026-03-27

## 모델 & 설정

| 항목 | 값 |
|------|-----|
| **모델** | `fal-ai/nano-banana` |
| **API Key 환경변수** | `FAL_KEY` (.env에 저장) |
| **기본 크기** | 768x512 (일반), 1280x256 (파노라마), 512x512 (개별 에셋) |

## 스타일 프롬프트 공식

모든 이미지 생성 시 아래 스타일 접미사를 반드시 붙인다:

```
modern pixel art style, clean and polished, Stardew Valley meets Pokemon aesthetic, soft warm palette, no heavy outlines, subtle shading, cozy indie game feel
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

STYLE = "modern pixel art style, clean and polished, Stardew Valley meets Pokemon aesthetic, soft warm palette, no heavy outlines, subtle shading, cozy indie game feel"

result = fal_client.subscribe(
    "fal-ai/nano-banana",
    arguments={
        "prompt": f"front view of modern city street with office building, trees, people walking, Seoul Korea, spring cherry blossoms, {STYLE}",
        "image_size": {"width": 768, "height": 512},
    },
)
url = result["images"][0]["url"]
```

### 캐릭터 스프라이트시트 (Gemini/전용 도구)
- **크기**: 224x384 (32x64 프레임, 7열x6행)
- **행0**: 아래(정면) idle + walk 3프레임
- **행1**: 왼쪽 walk 3프레임
- **행2**: 오른쪽 walk 3프레임
- **행3**: 위(뒷모습) walk 3프레임
- **행4**: 타이핑 좌/우
- **행5**: 기타
- **스타일**: 2등신(머리:몸=1:1), 귀여운 사무실 직원
- **프롬프트 예시**: `pixel art character sprite sheet, 7x6 grid, 32x64 per frame, cute chibi office worker, 2-head-tall proportions, walk cycle animation, typing pose, transparent background, modern clean pixel art`
- **현재 파일**: `ui/public/assets/char_0.png` ~ `char_6.png`

### 가구 (탑뷰 3/4, 개별 PNG)
- **프롬프트 예시**: `pixel art office desk with monitor, 3/4 top-down view, 64x64, transparent background, modern clean style, warm colors`
- **현재 위치**: `ui/public/assets/furniture/`

## 교체 우선순위
1. 로그인 배경 (계절/시간대별 5장) — 가장 첫인상
2. 캐릭터 (7장) — 가장 눈에 띔
3. 창밖 파노라마 (3장) — 사무실 분위기
4. 가구 (10종) — 사무실 디테일

## 생성 도구
| 도구 | 용도 | 무료 |
|------|------|------|
| **fal.ai (nano-banana)** | 배경/건물/풍경 | O (제한적) |
| **Gemini** | 캐릭터/스프라이트 | O |
| **Piskel/Aseprite** | 스프라이트 편집/조정 | O/유료 |

## 규칙
1. **일관성**: 같은 장면은 같은 프롬프트 공식 사용
2. **스타일 접미사 필수**: 위 공식 빠지면 스타일 깨짐
3. **크기 통일**: 같은 용도는 같은 해상도
4. **파일 경로**: `ui/public/assets/gen/` (생성), `ui/public/assets/` (적용)
5. **점진적 교체**: 한번에 다 안 바꿈, 우선순위대로 하나씩
6. **용량 체크**: 개별 에셋 50KB, 배경 200KB 이내
