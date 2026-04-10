#!/usr/bin/env python3
"""
🎮 Pixel Forge Pokemon — 포켓몬 스타일 오리지널 픽셀아트 생성기

포켓몬 다이아몬드/펄 오버월드 트레이너 스타일의
2등신 캐릭터 스프라이트시트를 코드로 생성합니다.

사용법:
  python3 pixel_forge_pokemon.py chars      # 캐릭터 생성
  python3 pixel_forge_pokemon.py office     # 사무실 에셋 생성
  python3 pixel_forge_pokemon.py buildings  # 건물 생성
  python3 pixel_forge_pokemon.py props      # 소품 생성
  python3 pixel_forge_pokemon.py all        # 전부 생성
"""
from PIL import Image
from pathlib import Path
import sys

OUT_BASE = Path("/Users/600mac/Developer/my-company/company-hq/ui/public/assets/original")
CHARS_OUT = Path("/Users/600mac/Developer/my-company/company-hq/ui/public/assets")

# ═══════════════════════════════════════
# 포켓몬 스타일 팔레트 — 밝고 선명한 색감
# ═══════════════════════════════════════

# 피부색 (밝고 따뜻한)
SKIN = [
    (255, 224, 189),   # 밝은 살구
    (245, 210, 175),   # 중간
    (225, 190, 155),   # 어두운
]
SKIN_SHADOW = [
    (235, 195, 155),
    (220, 180, 140),
    (200, 165, 125),
]

# 머리카락 — 포켓몬답게 선명한 색상
HAIR = [
    (40, 40, 55),       # 짙은 남색 (기본)
    (180, 60, 50),      # 선명한 빨강
    (60, 100, 180),     # 선명한 파랑
    (90, 65, 45),       # 갈색
    (245, 190, 60),     # 금발
    (100, 70, 150),     # 보라
]
HAIR_SHADOW = [
    (25, 25, 40),
    (140, 40, 35),
    (40, 70, 140),
    (65, 45, 30),
    (210, 155, 35),
    (70, 45, 115),
]

# 옷 — 포켓몬 트레이너처럼 밝고 포인트 있는
TOPS = [
    ((70, 130, 220), (50, 100, 180)),     # 파란 재킷
    ((220, 70, 70), (180, 50, 50)),       # 빨간 재킷
    ((80, 190, 120), (55, 155, 90)),      # 초록 후디
    ((240, 170, 50), (205, 140, 30)),     # 노란 조끼
    ((180, 80, 200), (145, 55, 165)),     # 보라 후디
    ((60, 180, 200), (40, 145, 165)),     # 하늘 재킷
    ((255, 130, 80), (220, 100, 55)),     # 주황 재킷
    ((100, 100, 120), (75, 75, 95)),      # 회색 슈트
]

# 바지
BOTTOMS = [
    ((55, 55, 75), (40, 40, 58)),         # 남색
    ((100, 80, 60), (75, 58, 42)),        # 갈색
    ((70, 70, 85), (52, 52, 65)),         # 진회색
    ((55, 85, 55), (40, 65, 40)),         # 카키
]

# 신발 — 약간 포인트
SHOES_COLORS = [
    (220, 60, 50),     # 빨간 운동화
    (55, 55, 65),      # 검정
    (240, 240, 250),   # 흰색
    (70, 130, 220),    # 파란
]

# 아웃라인 색상 (검정이 아닌 어두운 채도색)
OUTLINE = (35, 30, 50)
OUTLINE_HAIR = (25, 20, 40)
OUTLINE_SKIN = (180, 140, 110)
OUTLINE_BODY = (30, 28, 48)


def px(img, x, y, color, w=1, h=1):
    """픽셀 단위 그리기 (RGBA)"""
    if len(color) == 3:
        color = color + (255,)
    for dy in range(h):
        for dx in range(w):
            if 0 <= x + dx < img.width and 0 <= y + dy < img.height:
                img.putpixel((x + dx, y + dy), color)


def shade(color, amount=0.8):
    return tuple(max(0, int(c * amount)) for c in color[:3])


def bright(color, amount=1.2):
    return tuple(min(255, int(c * amount)) for c in color[:3])


# ═══════════════════════════════════════
# 포켓몬 스타일 캐릭터 — 정면 (16×32)
# ═══════════════════════════════════════

def pokemon_char_front(img, ox, oy, skin_i, hair_i, top_i, bottom_i, shoe_i):
    """포켓몬 스타일 정면 캐릭터 (2등신, 큰 머리 큰 눈)"""
    skin = SKIN[skin_i % len(SKIN)]
    skin_s = SKIN_SHADOW[skin_i % len(SKIN_SHADOW)]
    hair = HAIR[hair_i % len(HAIR)]
    hair_s = HAIR_SHADOW[hair_i % len(HAIR_SHADOW)]
    top_m, top_s = TOPS[top_i % len(TOPS)]
    bot_m, bot_s = BOTTOMS[bottom_i % len(BOTTOMS)]
    shoe = SHOES_COLORS[shoe_i % len(SHOES_COLORS)]

    # === 머리카락 (큰 둥근 머리) ===
    # 머리 윤곽 (아웃라인)
    px(img, ox+5, oy+2, OUTLINE_HAIR, 6, 1)      # 윗 아웃라인
    px(img, ox+4, oy+3, OUTLINE_HAIR, 1, 2)       # 좌 아웃라인
    px(img, ox+11, oy+3, OUTLINE_HAIR, 1, 2)      # 우 아웃라인
    px(img, ox+3, oy+5, OUTLINE_HAIR, 1, 6)       # 좌 아웃라인 아래
    px(img, ox+12, oy+5, OUTLINE_HAIR, 1, 6)      # 우 아웃라인 아래

    # 머리카락 채우기
    px(img, ox+5, oy+3, hair, 6, 2)               # 윗부분
    px(img, ox+4, oy+5, hair, 8, 2)               # 중간
    px(img, ox+4, oy+7, hair_s, 8, 1)             # 머리카락 아래 그림자
    # 머리 옆 볼륨
    px(img, ox+4, oy+5, hair_s, 1, 2)
    px(img, ox+11, oy+5, hair_s, 1, 2)
    # 머리 하이라이트 (광택)
    px(img, ox+6, oy+3, bright(hair), 2, 1)

    # === 얼굴 ===
    px(img, ox+4, oy+8, skin, 8, 5)               # 얼굴 전체
    px(img, ox+4, oy+8, skin_s, 1, 5)             # 좌측 그림자
    px(img, ox+11, oy+8, skin_s, 1, 5)            # 우측 그림자
    px(img, ox+4, oy+12, skin_s, 8, 1)            # 턱 그림자

    # 앞머리 (이마 위에 걸치기)
    px(img, ox+4, oy+7, hair, 8, 2)               # 앞머리
    px(img, ox+5, oy+7, bright(hair), 3, 1)       # 앞머리 하이라이트

    # === 눈 (포켓몬 스타일: 크고 동그란) ===
    # 눈 흰자
    px(img, ox+5, oy+9, (255, 255, 255), 2, 2)
    px(img, ox+9, oy+9, (255, 255, 255), 2, 2)
    # 눈동자 (검정)
    px(img, ox+6, oy+9, (30, 30, 45), 1, 2)
    px(img, ox+9, oy+9, (30, 30, 45), 1, 2)
    # 눈 하이라이트 (포켓몬 특유의 별빛)
    px(img, ox+5, oy+9, (255, 255, 255))
    px(img, ox+10, oy+9, (255, 255, 255))

    # === 입 (작은 미소) ===
    px(img, ox+7, oy+12, shade(skin, 0.8))
    px(img, ox+8, oy+12, shade(skin, 0.8))

    # === 볼 터치 (포켓몬/귀여운 느낌) ===
    px(img, ox+4, oy+11, (255, 180, 160))          # 왼볼 홍조
    px(img, ox+11, oy+11, (255, 180, 160))         # 오른볼 홍조

    # === 목 ===
    px(img, ox+7, oy+13, skin_s, 2, 1)

    # === 몸통 (작고 단단한) ===
    # 아웃라인
    px(img, ox+4, oy+14, OUTLINE_BODY, 8, 1)      # 어깨 아웃라인
    px(img, ox+3, oy+15, OUTLINE_BODY, 1, 5)      # 좌 아웃라인
    px(img, ox+12, oy+15, OUTLINE_BODY, 1, 5)     # 우 아웃라인

    # 셔츠/재킷 채우기
    px(img, ox+4, oy+14, top_m, 8, 6)
    # 셔츠 그림자
    px(img, ox+4, oy+14, top_s, 1, 6)
    px(img, ox+11, oy+14, top_s, 1, 6)
    # 셔츠 하이라이트
    px(img, ox+7, oy+15, bright(top_m), 2, 2)
    # 칼라/지퍼 라인 (포켓몬 트레이너 디테일)
    px(img, ox+7, oy+14, bright(top_m, 1.3), 2, 1)

    # === 팔 ===
    px(img, ox+3, oy+14, top_s, 1, 5)             # 왼팔
    px(img, ox+12, oy+14, top_s, 1, 5)            # 오른팔
    # 손
    px(img, ox+3, oy+19, skin, 1, 1)
    px(img, ox+12, oy+19, skin, 1, 1)

    # === 바지 ===
    px(img, ox+4, oy+20, bot_m, 3, 5)             # 왼다리
    px(img, ox+9, oy+20, bot_m, 3, 5)             # 오른다리
    px(img, ox+4, oy+20, bot_s, 1, 5)             # 왼 그림자
    px(img, ox+11, oy+20, bot_s, 1, 5)            # 우 그림자
    # 다리 사이
    px(img, ox+7, oy+20, shade(bot_m, 0.6), 2, 5)

    # === 신발 ===
    px(img, ox+4, oy+25, shoe, 3, 2)
    px(img, ox+9, oy+25, shoe, 3, 2)
    # 신발 하이라이트
    px(img, ox+5, oy+25, bright(shoe), 1, 1)
    px(img, ox+10, oy+25, bright(shoe), 1, 1)


def pokemon_char_back(img, ox, oy, skin_i, hair_i, top_i, bottom_i, shoe_i):
    """포켓몬 스타일 뒷모습"""
    skin_s = SKIN_SHADOW[skin_i % len(SKIN_SHADOW)]
    hair = HAIR[hair_i % len(HAIR)]
    hair_s = HAIR_SHADOW[hair_i % len(HAIR_SHADOW)]
    top_m, top_s = TOPS[top_i % len(TOPS)]
    bot_m, bot_s = BOTTOMS[bottom_i % len(BOTTOMS)]
    shoe = SHOES_COLORS[shoe_i % len(SHOES_COLORS)]

    # === 뒷머리 (더 넓고 둥글게) ===
    px(img, ox+5, oy+2, OUTLINE_HAIR, 6, 1)
    px(img, ox+4, oy+3, OUTLINE_HAIR, 1, 2)
    px(img, ox+11, oy+3, OUTLINE_HAIR, 1, 2)
    px(img, ox+3, oy+5, OUTLINE_HAIR, 1, 8)
    px(img, ox+12, oy+5, OUTLINE_HAIR, 1, 8)

    # 뒷머리 채우기 (넓게)
    px(img, ox+5, oy+3, hair, 6, 2)
    px(img, ox+4, oy+5, hair, 8, 7)
    px(img, ox+4, oy+10, hair_s, 8, 2)            # 아래쪽 그림자
    # 머리 하이라이트
    px(img, ox+7, oy+4, bright(hair), 2, 1)
    # 볼륨감
    px(img, ox+4, oy+5, hair_s, 1, 7)
    px(img, ox+11, oy+5, hair_s, 1, 7)

    # === 목 ===
    px(img, ox+7, oy+13, skin_s, 2, 1)

    # === 몸통 (뒷면) ===
    px(img, ox+4, oy+14, shade(top_m, 0.9), 8, 6)
    px(img, ox+4, oy+14, top_s, 1, 6)
    px(img, ox+11, oy+14, top_s, 1, 6)
    # 뒷면 디테일 (등 라인)
    px(img, ox+7, oy+15, shade(top_m, 0.8), 2, 4)

    # 팔
    px(img, ox+3, oy+14, top_s, 1, 5)
    px(img, ox+12, oy+14, top_s, 1, 5)
    px(img, ox+3, oy+19, skin_s, 1, 1)
    px(img, ox+12, oy+19, skin_s, 1, 1)

    # 바지
    px(img, ox+4, oy+20, shade(bot_m, 0.9), 3, 5)
    px(img, ox+9, oy+20, shade(bot_m, 0.9), 3, 5)
    px(img, ox+7, oy+20, shade(bot_m, 0.6), 2, 5)

    # 신발
    px(img, ox+4, oy+25, shade(shoe, 0.9), 3, 2)
    px(img, ox+9, oy+25, shade(shoe, 0.9), 3, 2)


def pokemon_char_left(img, ox, oy, skin_i, hair_i, top_i, bottom_i, shoe_i):
    """포켓몬 스타일 왼쪽 (얼굴 왼쪽 보임)"""
    skin = SKIN[skin_i % len(SKIN)]
    skin_s = SKIN_SHADOW[skin_i % len(SKIN_SHADOW)]
    hair = HAIR[hair_i % len(HAIR)]
    hair_s = HAIR_SHADOW[hair_i % len(HAIR_SHADOW)]
    top_m, top_s = TOPS[top_i % len(TOPS)]
    bot_m, bot_s = BOTTOMS[bottom_i % len(BOTTOMS)]
    shoe = SHOES_COLORS[shoe_i % len(SHOES_COLORS)]

    # === 머리 (옆모습, 왼쪽) ===
    px(img, ox+4, oy+2, OUTLINE_HAIR, 6, 1)
    px(img, ox+3, oy+3, OUTLINE_HAIR, 1, 9)
    px(img, ox+10, oy+3, OUTLINE_HAIR, 1, 4)

    px(img, ox+4, oy+3, hair, 6, 2)
    px(img, ox+4, oy+5, hair, 7, 3)
    px(img, ox+4, oy+7, hair_s, 3, 1)             # 앞머리 끝
    px(img, ox+5, oy+3, bright(hair), 2, 1)

    # 얼굴 (왼쪽)
    px(img, ox+4, oy+8, skin, 6, 5)
    px(img, ox+4, oy+8, skin_s, 1, 5)
    px(img, ox+4, oy+12, skin_s, 6, 1)

    # 눈 (한쪽만)
    px(img, ox+5, oy+9, (255, 255, 255), 2, 2)
    px(img, ox+5, oy+9, (30, 30, 45), 1, 2)
    px(img, ox+6, oy+9, (255, 255, 255))

    # 볼 홍조
    px(img, ox+4, oy+11, (255, 180, 160))

    # 입
    px(img, ox+5, oy+12, shade(skin, 0.8))

    # 목
    px(img, ox+6, oy+13, skin_s, 2, 1)

    # 몸통
    px(img, ox+5, oy+14, top_m, 6, 6)
    px(img, ox+5, oy+14, top_s, 1, 6)
    px(img, ox+7, oy+15, bright(top_m), 2, 2)

    # 팔 (앞쪽)
    px(img, ox+4, oy+14, top_s, 1, 5)
    px(img, ox+4, oy+19, skin)

    # 바지
    px(img, ox+5, oy+20, bot_m, 5, 5)
    px(img, ox+5, oy+20, bot_s, 1, 5)

    # 신발
    px(img, ox+5, oy+25, shoe, 4, 2)
    px(img, ox+6, oy+25, bright(shoe), 1, 1)


def pokemon_char_right(img, ox, oy, skin_i, hair_i, top_i, bottom_i, shoe_i):
    """포켓몬 스타일 오른쪽 (좌우 반전)"""
    skin = SKIN[skin_i % len(SKIN)]
    skin_s = SKIN_SHADOW[skin_i % len(SKIN_SHADOW)]
    hair = HAIR[hair_i % len(HAIR)]
    hair_s = HAIR_SHADOW[hair_i % len(HAIR_SHADOW)]
    top_m, top_s = TOPS[top_i % len(TOPS)]
    bot_m, bot_s = BOTTOMS[bottom_i % len(BOTTOMS)]
    shoe = SHOES_COLORS[shoe_i % len(SHOES_COLORS)]

    # === 머리 (오른쪽) ===
    px(img, ox+6, oy+2, OUTLINE_HAIR, 6, 1)
    px(img, ox+12, oy+3, OUTLINE_HAIR, 1, 9)
    px(img, ox+5, oy+3, OUTLINE_HAIR, 1, 4)

    px(img, ox+6, oy+3, hair, 6, 2)
    px(img, ox+5, oy+5, hair, 7, 3)
    px(img, ox+9, oy+7, hair_s, 3, 1)
    px(img, ox+9, oy+3, bright(hair), 2, 1)

    # 얼굴 (오른쪽)
    px(img, ox+6, oy+8, skin, 6, 5)
    px(img, ox+11, oy+8, skin_s, 1, 5)
    px(img, ox+6, oy+12, skin_s, 6, 1)

    # 눈
    px(img, ox+9, oy+9, (255, 255, 255), 2, 2)
    px(img, ox+10, oy+9, (30, 30, 45), 1, 2)
    px(img, ox+9, oy+9, (255, 255, 255))

    # 볼 홍조
    px(img, ox+11, oy+11, (255, 180, 160))

    # 입
    px(img, ox+10, oy+12, shade(skin, 0.8))

    # 목
    px(img, ox+8, oy+13, skin_s, 2, 1)

    # 몸통
    px(img, ox+5, oy+14, top_m, 6, 6)
    px(img, ox+10, oy+14, top_s, 1, 6)
    px(img, ox+7, oy+15, bright(top_m), 2, 2)

    # 팔
    px(img, ox+11, oy+14, top_s, 1, 5)
    px(img, ox+11, oy+19, skin)

    # 바지
    px(img, ox+6, oy+20, bot_m, 5, 5)
    px(img, ox+10, oy+20, bot_s, 1, 5)

    # 신발
    px(img, ox+7, oy+25, shoe, 4, 2)
    px(img, ox+9, oy+25, bright(shoe), 1, 1)


# ═══════════════════════════════════════
# 걷기 애니메이션 프레임
# ═══════════════════════════════════════

def pokemon_walk_front(img, ox, oy, skin_i, hair_i, top_i, bottom_i, shoe_i, frame=0):
    """정면 걷기 프레임 (frame: 0=기본, 1=왼발, 2=오른발)"""
    pokemon_char_front(img, ox, oy, skin_i, hair_i, top_i, bottom_i, shoe_i)
    bot_m = BOTTOMS[bottom_i % len(BOTTOMS)][0]
    shoe = SHOES_COLORS[shoe_i % len(SHOES_COLORS)]

    if frame == 1:
        # 왼발 앞으로 — 다리 위치 1px 시프트
        px(img, ox+4, oy+25, shoe, 3, 2)          # 왼발 유지
        px(img, ox+10, oy+24, shoe, 3, 2)         # 오른발 올라감
        px(img, ox+9, oy+24, (0, 0, 0, 0), 1, 1) # 기존 위치 지우기
    elif frame == 2:
        # 오른발 앞으로
        px(img, ox+3, oy+24, shoe, 3, 2)          # 왼발 올라감
        px(img, ox+9, oy+25, shoe, 3, 2)          # 오른발 유지
        px(img, ox+12, oy+25, (0, 0, 0, 0), 1, 1)


def pokemon_walk_back(img, ox, oy, skin_i, hair_i, top_i, bottom_i, shoe_i, frame=0):
    """뒷면 걷기"""
    pokemon_char_back(img, ox, oy, skin_i, hair_i, top_i, bottom_i, shoe_i)
    shoe = SHOES_COLORS[shoe_i % len(SHOES_COLORS)]

    if frame == 1:
        px(img, ox+4, oy+25, shade(shoe, 0.9), 3, 2)
        px(img, ox+10, oy+24, shade(shoe, 0.9), 3, 2)
    elif frame == 2:
        px(img, ox+3, oy+24, shade(shoe, 0.9), 3, 2)
        px(img, ox+9, oy+25, shade(shoe, 0.9), 3, 2)


def pokemon_walk_left(img, ox, oy, skin_i, hair_i, top_i, bottom_i, shoe_i, frame=0):
    """왼쪽 걷기"""
    pokemon_char_left(img, ox, oy, skin_i, hair_i, top_i, bottom_i, shoe_i)
    shoe = SHOES_COLORS[shoe_i % len(SHOES_COLORS)]

    if frame == 1:
        px(img, ox+4, oy+25, shoe, 4, 2)
        px(img, ox+6, oy+24, shoe, 3, 1)
    elif frame == 2:
        px(img, ox+5, oy+25, shoe, 5, 2)
        px(img, ox+4, oy+24, shoe, 3, 1)


def pokemon_walk_right(img, ox, oy, skin_i, hair_i, top_i, bottom_i, shoe_i, frame=0):
    """오른쪽 걷기"""
    pokemon_char_right(img, ox, oy, skin_i, hair_i, top_i, bottom_i, shoe_i)
    shoe = SHOES_COLORS[shoe_i % len(SHOES_COLORS)]

    if frame == 1:
        px(img, ox+8, oy+25, shoe, 4, 2)
        px(img, ox+7, oy+24, shoe, 3, 1)
    elif frame == 2:
        px(img, ox+7, oy+25, shoe, 5, 2)
        px(img, ox+9, oy+24, shoe, 3, 1)


# ═══════════════════════════════════════
# 스프라이트시트 생성
# ═══════════════════════════════════════

def generate_spritesheet(name, skin_i, hair_i, top_i, bottom_i, shoe_i, out_dir):
    """
    7열 × 6행 스프라이트시트 (16×32 per frame = 112×192)

    Row 0: 정면(DOWN) — idle + walk 3프레임
    Row 1: 왼쪽(LEFT) — idle + walk 3프레임
    Row 2: 오른쪽(RIGHT) — idle + walk 3프레임
    Row 3: 뒷면(BACK) — idle + walk 3프레임
    Row 4: 앉기 (정면 기반)
    Row 5: 기타/예비
    """
    W, H = 112, 192  # 7cols × 6rows, 16×32 each
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    args = (skin_i, hair_i, top_i, bottom_i, shoe_i)

    # Row 0: 정면 idle + walk
    pokemon_char_front(img, 0, 0, *args)                    # col0: idle
    pokemon_walk_front(img, 16, 0, *args, frame=0)          # col1: walk0
    pokemon_walk_front(img, 32, 0, *args, frame=1)          # col2: walk1
    pokemon_walk_front(img, 48, 0, *args, frame=2)          # col3: walk2

    # Row 1: 왼쪽 idle + walk
    pokemon_char_left(img, 0, 32, *args)
    pokemon_walk_left(img, 16, 32, *args, frame=0)
    pokemon_walk_left(img, 32, 32, *args, frame=1)
    pokemon_walk_left(img, 48, 32, *args, frame=2)

    # Row 2: 오른쪽 idle + walk
    pokemon_char_right(img, 0, 64, *args)
    pokemon_walk_right(img, 16, 64, *args, frame=0)
    pokemon_walk_right(img, 32, 64, *args, frame=1)
    pokemon_walk_right(img, 48, 64, *args, frame=2)

    # Row 3: 뒷면 idle + walk
    pokemon_char_back(img, 0, 96, *args)
    pokemon_walk_back(img, 16, 96, *args, frame=0)
    pokemon_walk_back(img, 32, 96, *args, frame=1)
    pokemon_walk_back(img, 48, 96, *args, frame=2)

    # Row 4: 앉기 포즈 (정면 상반신만)
    pokemon_char_front(img, 0, 128, *args)
    # 하반신을 앉은 자세로 덮어쓰기
    bot_m = BOTTOMS[bottom_i % len(BOTTOMS)][0]
    px(img, 4, 148, bot_m, 8, 3)
    px(img, 4, 151, shade(bot_m, 0.8), 8, 2)

    # Row 5: 예비 (빈 행)

    path = out_dir / f"{name}.png"
    img.save(path, "PNG", optimize=True)
    print(f"  ✅ {name}.png ({img.width}×{img.height}, {path.stat().st_size} bytes)")
    return img


# ═══════════════════════════════════════
# 캐릭터 정의 — 두근컴퍼니 멤버
# ═══════════════════════════════════════

POKEMON_CHARS = [
    # (name, skin, hair, top, bottom, shoe)
    ("char_pokemon_0", 0, 0, 0, 0, 0),   # 파란재킷+빨간운동화 (주인공 느낌)
    ("char_pokemon_1", 0, 1, 1, 0, 2),   # 빨간재킷+흰운동화 (라이벌 느낌)
    ("char_pokemon_2", 1, 4, 3, 3, 3),   # 금발+노란조끼 (밝은 캐릭)
    ("char_pokemon_3", 0, 2, 2, 1, 0),   # 파란머리+초록후디 (쿨한 캐릭)
    ("char_pokemon_4", 2, 3, 7, 2, 1),   # 갈색머리+회색슈트 (시니어)
    ("char_pokemon_5", 0, 5, 4, 0, 3),   # 보라머리+보라후디 (크리에이티브)
]


def generate_characters():
    """포켓몬 스타일 캐릭터 전체 생성"""
    out_dir = OUT_BASE / "chars"
    out_dir.mkdir(parents=True, exist_ok=True)

    print("\n🎮 포켓몬 스타일 캐릭터 생성 시작!\n")

    for name, skin_i, hair_i, top_i, bottom_i, shoe_i in POKEMON_CHARS:
        generate_spritesheet(name, skin_i, hair_i, top_i, bottom_i, shoe_i, out_dir)

    # char_0~5.png로도 복사 (Phaser 호환)
    print("\n📦 Phaser 호환 파일 생성 (char_0~5.png)...")
    for i, (name, *_) in enumerate(POKEMON_CHARS):
        src = out_dir / f"{name}.png"
        dst = CHARS_OUT / f"char_{i}.png"
        if src.exists():
            img = Image.open(src)
            img.save(dst, "PNG", optimize=True)
            print(f"  📋 {name}.png → char_{i}.png")

    print("\n✅ 캐릭터 생성 완료!")


# ═══════════════════════════════════════
# 사무실 에셋 — 포켓몬 센터 느낌
# ═══════════════════════════════════════

def gen_pokemon_desk():
    """포켓몬센터 스타일 책상 (48×32) — 둥근 모서리, 밝은 색상"""
    img = Image.new("RGBA", (48, 32), (0, 0, 0, 0))
    top = (240, 235, 245)        # 밝은 흰색 상판
    body = (200, 210, 230)       # 파란 회색 본체
    accent = (70, 150, 220)      # 파란 악센트
    ol = (50, 60, 85)            # 아웃라인

    # 아웃라인
    px(img, 1, 3, ol, 46, 1)
    px(img, 0, 4, ol, 1, 8)
    px(img, 47, 4, ol, 1, 8)

    # 상판
    px(img, 1, 4, top, 46, 3)
    px(img, 1, 4, bright(top), 46, 1)    # 하이라이트
    # 상판 악센트 라인
    px(img, 1, 6, accent, 46, 1)

    # 앞판
    px(img, 1, 7, body, 46, 5)
    px(img, 1, 7, shade(body, 0.95), 46, 1)

    # 서랍
    px(img, 3, 9, shade(body, 0.9), 18, 8)
    px(img, 4, 10, body, 16, 6)
    px(img, 10, 13, (255, 220, 80), 4, 1)  # 금색 손잡이

    # 빈 공간
    px(img, 24, 12, (20, 25, 40, 60), 22, 8)

    # 다리 (둥근 느낌)
    px(img, 2, 12, shade(body, 0.8), 2, 18)
    px(img, 44, 12, shade(body, 0.8), 2, 18)
    px(img, 22, 12, shade(body, 0.8), 2, 18)

    # 바닥 그림자
    px(img, 3, 30, (0, 0, 0, 25), 42, 2)

    return img


def gen_pokemon_monitor():
    """포켓몬 PC 스타일 모니터 (24×24)"""
    img = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    frame = (65, 70, 90)         # 어두운 프레임
    screen = (40, 55, 85)        # 화면 배경
    accent = (70, 200, 150)      # 민트 악센트

    # 프레임 아웃라인
    px(img, 2, 0, (40, 45, 65), 20, 1)
    px(img, 1, 1, (40, 45, 65), 1, 14)
    px(img, 22, 1, (40, 45, 65), 1, 14)

    # 프레임
    px(img, 2, 1, frame, 20, 14)
    # 화면
    px(img, 3, 2, screen, 18, 11)
    # 화면 내용 (포켓몬 PC 느낌)
    px(img, 5, 4, accent, 8, 1)
    px(img, 5, 6, (100, 180, 240), 12, 1)
    px(img, 5, 8, accent, 6, 1)
    px(img, 5, 10, (240, 200, 80), 10, 1)
    # 화면 반사
    px(img, 4, 3, (80, 100, 140), 2, 3)

    # 전원 LED
    px(img, 11, 14, (80, 255, 120))

    # 스탠드
    px(img, 10, 15, (80, 85, 100), 4, 4)
    # 받침대
    px(img, 7, 19, (80, 85, 100), 10, 2)
    px(img, 6, 21, (90, 95, 110), 12, 2)
    # 받침 하이라이트
    px(img, 7, 19, bright(frame), 10, 1)

    return img


def gen_pokemon_chair():
    """포켓몬센터 스타일 의자 (16×24)"""
    img = Image.new("RGBA", (16, 24), (0, 0, 0, 0))
    seat = (220, 80, 70)          # 빨간 시트 (포켓몬센터)
    frame_c = (90, 90, 105)       # 금속 프레임

    # 등받이 아웃라인
    px(img, 3, 0, (40, 30, 50), 10, 1)
    px(img, 2, 1, (40, 30, 50), 1, 8)
    px(img, 13, 1, (40, 30, 50), 1, 8)

    # 등받이
    px(img, 3, 1, seat, 10, 8)
    px(img, 4, 2, bright(seat), 4, 2)    # 하이라이트
    px(img, 3, 7, shade(seat, 0.85), 10, 2)  # 하단 그림자

    # 시트
    px(img, 2, 9, seat, 12, 4)
    px(img, 3, 9, bright(seat), 8, 1)    # 하이라이트
    px(img, 2, 12, shade(seat, 0.8), 12, 1)

    # 다리
    px(img, 3, 13, frame_c, 2, 9)
    px(img, 11, 13, frame_c, 2, 9)
    # 바퀴
    px(img, 2, 22, (60, 60, 70), 3, 2)
    px(img, 11, 22, (60, 60, 70), 3, 2)
    px(img, 6, 22, (60, 60, 70), 4, 2)

    return img


def gen_pokemon_bookshelf():
    """포켓몬 스타일 책장 (32×48) — 밝은 나무, 알록달록 책"""
    img = Image.new("RGBA", (32, 48), (0, 0, 0, 0))
    wood = (200, 170, 120)
    wood_s = shade(wood, 0.8)

    # 프레임
    px(img, 0, 0, wood_s, 32, 2)          # 상단
    px(img, 0, 0, wood_s, 2, 48)          # 좌
    px(img, 30, 0, wood_s, 2, 48)         # 우
    px(img, 0, 46, wood_s, 32, 2)         # 하단
    # 선반
    px(img, 0, 15, wood, 32, 2)
    px(img, 0, 31, wood, 32, 2)

    # 책들 (포켓몬답게 알록달록)
    book_colors = [
        (220, 70, 70), (70, 130, 220), (80, 190, 120),
        (240, 170, 50), (180, 80, 200), (60, 180, 200),
    ]
    # 1단 책
    bx = 3
    for i, c in enumerate(book_colors[:4]):
        w = 5 + (i % 2)
        px(img, bx, 3, c, w, 12)
        px(img, bx, 3, bright(c), 1, 12)  # 책 등 하이라이트
        bx += w + 1

    # 2단 책
    bx = 3
    for i, c in enumerate(book_colors[1:5]):
        w = 4 + (i % 3)
        px(img, bx, 18, c, w, 13)
        px(img, bx, 18, bright(c), 1, 13)
        bx += w + 1

    # 3단 (소품)
    px(img, 4, 34, (220, 200, 80), 6, 8)    # 몬스터볼 모양 장식
    px(img, 4, 37, (220, 60, 50), 6, 2)     # 빨간 위
    px(img, 4, 39, (240, 240, 250), 6, 3)   # 흰 아래
    px(img, 6, 38, (40, 40, 50), 2, 1)      # 중앙 라인

    px(img, 16, 34, (120, 200, 240), 5, 10)  # 파란 화분

    return img


def gen_pokemon_server():
    """포켓몬 스타일 서버랙 (24×48) — PC 박스 느낌"""
    img = Image.new("RGBA", (24, 48), (0, 0, 0, 0))
    body = (70, 75, 95)
    panel = (55, 60, 80)

    # 본체 아웃라인
    px(img, 1, 0, (40, 42, 60), 22, 1)
    px(img, 0, 1, (40, 42, 60), 1, 46)
    px(img, 23, 1, (40, 42, 60), 1, 46)

    # 본체
    px(img, 1, 1, body, 22, 46)

    # 패널들 (3단)
    for row in range(3):
        y = 3 + row * 14
        px(img, 3, y, panel, 18, 11)
        # LED 표시등
        px(img, 5, y + 2, (80, 255, 120), 2, 1)    # 초록 LED
        px(img, 5, y + 4, (80, 255, 120), 2, 1)
        px(img, 5, y + 6, (255, 200, 80), 2, 1)    # 노란 LED
        # 통풍구
        for i in range(4):
            px(img, 10 + i * 3, y + 2, (45, 50, 70), 2, 7)

    # 상단 브랜드 라인
    px(img, 3, 1, (220, 70, 70), 18, 1)  # 빨간 악센트

    return img


def generate_office():
    """포켓몬 스타일 사무실 에셋 전체 생성"""
    out_dir = OUT_BASE / "office"
    out_dir.mkdir(parents=True, exist_ok=True)

    print("\n🏢 포켓몬 스타일 사무실 에셋 생성!\n")

    assets = {
        "desk_front": gen_pokemon_desk(),
        "monitor_front": gen_pokemon_monitor(),
        "chair_front": gen_pokemon_chair(),
        "bookshelf": gen_pokemon_bookshelf(),
        "server_rack": gen_pokemon_server(),
    }

    for name, img in assets.items():
        path = out_dir / f"{name}.png"
        img.save(path, "PNG", optimize=True)
        size = path.stat().st_size
        print(f"  ✅ {name}.png ({img.width}×{img.height}, {size} bytes)")

    print("\n✅ 사무실 에셋 생성 완료!")


# ═══════════════════════════════════════
# 건물 — 포켓몬 마을 스타일
# ═══════════════════════════════════════

def gen_pokemon_building():
    """포켓몬 마을 스타일 본사 건물 (64×80)"""
    img = Image.new("RGBA", (64, 80), (0, 0, 0, 0))
    wall = (235, 230, 240)          # 밝은 벽
    wall_s = (210, 205, 220)
    roof = (220, 70, 60)            # 빨간 지붕 (포켓몬센터)
    roof_s = (180, 50, 45)
    door_c = (180, 140, 80)
    window_f = (80, 85, 100)
    glass = (140, 200, 240)

    # 지붕 (삼각형 느낌)
    for i in range(10):
        w = 64 - i * 2
        x = i
        px(img, x, 5 + i, roof if i < 7 else roof_s, w, 1)
    px(img, 2, 6, bright(roof), 30, 2)  # 지붕 하이라이트

    # 벽
    px(img, 4, 15, wall, 56, 55)
    px(img, 4, 15, wall_s, 2, 55)       # 좌측 그림자
    px(img, 58, 15, wall_s, 2, 55)      # 우측 그림자

    # 창문들 (2×3 격자)
    for row in range(2):
        for col in range(3):
            wx = 10 + col * 18
            wy = 20 + row * 22
            px(img, wx, wy, window_f, 10, 12)
            px(img, wx + 1, wy + 1, glass, 8, 10)
            px(img, wx + 1, wy + 1, bright(glass), 2, 4)  # 반사

    # 문 (하단 중앙)
    px(img, 24, 55, door_c, 16, 15)
    px(img, 25, 56, bright(door_c), 14, 13)
    px(img, 31, 55, shade(door_c, 0.7), 2, 15)    # 문 중앙선
    # 문 손잡이
    px(img, 29, 63, (255, 220, 80), 2, 2)
    px(img, 35, 63, (255, 220, 80), 2, 2)

    # 간판 (두근컴퍼니 느낌)
    px(img, 20, 48, (250, 240, 220), 24, 6)
    px(img, 21, 49, (220, 70, 60), 22, 4)         # 빨간 간판
    # 간판 하이라이트
    px(img, 22, 49, (255, 100, 90), 8, 1)

    # 지붕 장식 (몬스터볼 모양)
    px(img, 29, 2, (220, 60, 50), 6, 3)
    px(img, 29, 5, (240, 240, 250), 6, 2)
    px(img, 31, 4, (40, 40, 50), 2, 1)

    return img


def gen_pokemon_tree():
    """포켓몬 스타일 나무 (24×32) — 둥글고 밝은"""
    img = Image.new("RGBA", (24, 32), (0, 0, 0, 0))
    trunk = (140, 100, 60)
    leaf = (80, 190, 100)
    leaf_s = (55, 150, 70)

    # 줄기
    px(img, 10, 20, trunk, 4, 10)
    px(img, 10, 20, shade(trunk), 1, 10)
    px(img, 13, 20, bright(trunk), 1, 10)

    # 잎 (큰 둥근 형태)
    px(img, 5, 2, leaf, 14, 4)
    px(img, 3, 6, leaf, 18, 8)
    px(img, 4, 14, leaf, 16, 6)
    px(img, 6, 20, leaf, 12, 2)

    # 잎 그림자
    px(img, 3, 12, leaf_s, 18, 2)
    px(img, 4, 18, leaf_s, 16, 2)

    # 잎 하이라이트
    px(img, 7, 3, bright(leaf, 1.3), 5, 2)
    px(img, 5, 8, bright(leaf, 1.2), 4, 3)

    return img


def generate_buildings():
    """건물/자연물 생성"""
    out_dir = OUT_BASE / "buildings"
    out_dir.mkdir(parents=True, exist_ok=True)

    props_dir = OUT_BASE / "props"
    props_dir.mkdir(parents=True, exist_ok=True)

    print("\n🏘️ 포켓몬 스타일 건물/소품 생성!\n")

    building = gen_pokemon_building()
    path = out_dir / "main_hq.png"
    building.save(path, "PNG", optimize=True)
    print(f"  ✅ main_hq.png ({building.width}×{building.height}, {path.stat().st_size} bytes)")

    tree = gen_pokemon_tree()
    path = props_dir / "tree_pokemon.png"
    tree.save(path, "PNG", optimize=True)
    print(f"  ✅ tree_pokemon.png ({tree.width}×{tree.height}, {path.stat().st_size} bytes)")

    print("\n✅ 건물/소품 생성 완료!")


# ═══════════════════════════════════════
# 메인
# ═══════════════════════════════════════

def main():
    if len(sys.argv) < 2:
        print("사용법: python3 pixel_forge_pokemon.py [chars|office|buildings|all]")
        return

    cmd = sys.argv[1].lower()

    if cmd == "chars":
        generate_characters()
    elif cmd == "office":
        generate_office()
    elif cmd == "buildings":
        generate_buildings()
    elif cmd == "all":
        generate_characters()
        generate_office()
        generate_buildings()
    else:
        print(f"❌ 알 수 없는 명령: {cmd}")
        print("사용법: python3 pixel_forge_pokemon.py [chars|office|buildings|all]")


if __name__ == "__main__":
    main()
