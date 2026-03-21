#!/usr/bin/env python3
"""
🔨 Pixel Forge — 두근컴퍼니 오리지널 픽셀아트 생성기

레퍼런스 에셋의 색감/비율/구조를 참고하되,
완전히 새로운 고유 픽셀아트를 코드로 생성합니다.

사용법:
  python3 pixel_forge.py chars      # 캐릭터 생성
  python3 pixel_forge.py buildings   # 건물 생성
  python3 pixel_forge.py props       # 소품 생성
  python3 pixel_forge.py tiles       # 타일 생성
  python3 pixel_forge.py all         # 전부 생성
"""
from PIL import Image, ImageDraw
from pathlib import Path
import random
import sys

OUT_BASE = Path("/Users/600mac/Developer/my-company/company-hq/ui/public/assets/original")

# ═══════════════════════════════════════
# 두근컴퍼니 고유 팔레트
# ═══════════════════════════════════════

SKIN = [(252, 217, 168), (232, 200, 152), (212, 176, 136)]
HAIR = [
    (51, 51, 51),     # 검정
    (90, 58, 42),     # 짙은갈색
    (136, 68, 34),    # 갈색
    (170, 102, 51),   # 밝은갈색
    (60, 60, 80),     # 짙은회색
]
SHIRTS = [
    ((51, 102, 170), (40, 80, 136)),     # 파랑
    ((68, 170, 102), (54, 136, 82)),     # 초록
    ((204, 68, 68), (163, 54, 54)),      # 빨강
    ((136, 68, 170), (109, 54, 136)),    # 보라
    ((221, 136, 51), (177, 109, 41)),    # 주황
    ((85, 85, 102), (68, 68, 82)),       # 회색
    ((170, 136, 51), (136, 109, 41)),    # 카키
    ((51, 136, 136), (41, 109, 109)),    # 청록
]
PANTS = [
    ((42, 42, 58), (34, 34, 46)),        # 어두운남색
    ((58, 58, 90), (46, 46, 72)),        # 남색
    ((90, 74, 58), (72, 59, 46)),        # 갈색
    ((42, 42, 42), (34, 34, 34)),        # 검정
]
SHOES = [(34, 34, 34), (51, 34, 20), (60, 60, 60)]

# 건물 팔레트
WALL_COLORS = [
    ((130, 140, 155), (110, 120, 135)),  # 회색-파랑
    ((155, 140, 120), (135, 120, 100)),  # 베이지
    ((120, 135, 145), (100, 115, 125)),  # 청회색
    ((145, 130, 130), (125, 110, 110)),  # 분홍회색
]
ROOF_COLORS = [
    ((100, 70, 55), (80, 56, 44)),       # 갈색
    ((70, 85, 100), (56, 68, 80)),       # 청색
    ((85, 65, 80), (68, 52, 64)),        # 보라
]
WINDOW_COLORS = {
    "frame": (80, 80, 90),
    "glass_day": (140, 190, 220),
    "glass_lit": (255, 220, 130),
    "glass_dark": (50, 60, 75),
}


def px(img: Image.Image, x: int, y: int, color: tuple, w: int = 1, h: int = 1):
    """픽셀 단위 그리기"""
    for dy in range(h):
        for dx in range(w):
            if 0 <= x + dx < img.width and 0 <= y + dy < img.height:
                img.putpixel((x + dx, y + dy), color + (255,))


def shade(color: tuple, amount: float = 0.8) -> tuple:
    """색상 어둡게"""
    return tuple(max(0, int(c * amount)) for c in color)


def highlight(color: tuple, amount: float = 1.2) -> tuple:
    """색상 밝게"""
    return tuple(min(255, int(c * amount)) for c in color)


# ═══════════════════════════════════════
# 캐릭터 생성
# ═══════════════════════════════════════

def gen_char_front(skin, hair_color, shirt, pants, shoe, img, ox, oy):
    """정면 캐릭터 1프레임 (16×32)"""
    s_main, s_shade = shirt
    p_main, p_shade = pants

    # 머리카락 (윗부분)
    for dx in range(-1, 6):
        px(img, ox + 5 + dx, oy + 6, hair_color)
        px(img, ox + 5 + dx, oy + 7, hair_color)
    px(img, ox + 4, oy + 8, hair_color)
    px(img, ox + 10, oy + 8, hair_color)

    # 얼굴
    for dy in range(4):
        for dx in range(5):
            px(img, ox + 5 + dx, oy + 8 + dy, skin)

    # 눈
    px(img, ox + 6, oy + 9, (30, 30, 40))
    px(img, ox + 9, oy + 9, (30, 30, 40))
    px(img, ox + 6, oy + 9, (255, 255, 255))  # 눈 하이라이트 (좌상단)

    # 입
    px(img, ox + 7, oy + 11, shade(skin, 0.85))
    px(img, ox + 8, oy + 11, shade(skin, 0.85))

    # 목
    px(img, ox + 7, oy + 12, shade(skin, 0.9))
    px(img, ox + 8, oy + 12, shade(skin, 0.9))

    # 셔츠 몸통
    for dy in range(6):
        for dx in range(8):
            c = s_shade if dx == 0 or dx == 7 or dy == 5 else s_main
            px(img, ox + 4 + dx, oy + 13 + dy, c)

    # 셔츠 하이라이트
    px(img, ox + 6, oy + 14, highlight(s_main))
    px(img, ox + 7, oy + 14, highlight(s_main))

    # 팔 (셔츠 색)
    for dy in range(4):
        px(img, ox + 3, oy + 13 + dy, s_shade)
        px(img, ox + 12, oy + 13 + dy, s_shade)
    # 손 (피부)
    px(img, ox + 3, oy + 17, skin)
    px(img, ox + 12, oy + 17, skin)

    # 바지
    for dy in range(5):
        for dx in range(3):
            px(img, ox + 4 + dx, oy + 19 + dy, p_main)
            px(img, ox + 9 + dx, oy + 19 + dy, p_main)
    # 바지 그림자
    px(img, ox + 4, oy + 19, p_shade, 1, 5)
    px(img, ox + 11, oy + 19, p_shade, 1, 5)
    # 바지 사이 간격
    for dy in range(5):
        px(img, ox + 7, oy + 19 + dy, shade(p_main, 0.7))
        px(img, ox + 8, oy + 19 + dy, shade(p_main, 0.7))

    # 신발
    px(img, ox + 4, oy + 24, shoe, 3, 2)
    px(img, ox + 9, oy + 24, shoe, 3, 2)


def gen_char_back(skin, hair_color, shirt, pants, shoe, img, ox, oy):
    """뒷모습 캐릭터 1프레임"""
    s_main, s_shade = shirt
    p_main, p_shade = pants

    # 머리카락 (뒷모습이라 더 넓게)
    for dy in range(5):
        for dx in range(-1, 7):
            px(img, ox + 5 + dx, oy + 6 + dy, hair_color)
    # 머리 측면
    px(img, ox + 4, oy + 8, shade(hair_color, 0.85))
    px(img, ox + 11, oy + 8, shade(hair_color, 0.85))

    # 목 (피부 살짝)
    px(img, ox + 7, oy + 12, shade(skin, 0.9))
    px(img, ox + 8, oy + 12, shade(skin, 0.9))

    # 셔츠 (뒷면이라 그림자 다르게)
    for dy in range(6):
        for dx in range(8):
            c = s_shade if dx == 0 or dx == 7 else shade(s_main, 0.95)
            px(img, ox + 4 + dx, oy + 13 + dy, c)

    # 팔
    for dy in range(4):
        px(img, ox + 3, oy + 13 + dy, s_shade)
        px(img, ox + 12, oy + 13 + dy, s_shade)
    px(img, ox + 3, oy + 17, shade(skin, 0.9))
    px(img, ox + 12, oy + 17, shade(skin, 0.9))

    # 바지
    for dy in range(5):
        for dx in range(3):
            px(img, ox + 4 + dx, oy + 19 + dy, shade(p_main, 0.95))
            px(img, ox + 9 + dx, oy + 19 + dy, shade(p_main, 0.95))
    for dy in range(5):
        px(img, ox + 7, oy + 19 + dy, shade(p_main, 0.7))
        px(img, ox + 8, oy + 19 + dy, shade(p_main, 0.7))

    # 신발
    px(img, ox + 4, oy + 24, shoe, 3, 2)
    px(img, ox + 9, oy + 24, shoe, 3, 2)


def gen_char_side(skin, hair_color, shirt, pants, shoe, img, ox, oy, facing_right=True):
    """옆모습 캐릭터"""
    s_main, s_shade = shirt
    p_main, p_shade = pants
    flip = 1 if facing_right else -1
    cx = ox + 8  # center x

    # 머리카락
    for dy in range(4):
        for dx in range(-2, 4):
            hx = cx + dx * flip - (1 if facing_right else -1)
            px(img, hx, oy + 6 + dy, hair_color)

    # 얼굴 (한쪽만 보임)
    face_x = cx + (1 if facing_right else -3)
    for dy in range(3):
        for dx in range(3):
            px(img, face_x + dx, oy + 8 + dy, skin)
    # 눈
    eye_x = face_x + (2 if facing_right else 0)
    px(img, eye_x, oy + 9, (30, 30, 40))

    # 셔츠
    for dy in range(6):
        for dx in range(6):
            c = s_shade if dy == 5 else s_main
            px(img, cx - 3 + dx, oy + 13 + dy, c)

    # 팔 (앞쪽 하나만)
    arm_x = cx + (3 if facing_right else -4)
    for dy in range(4):
        px(img, arm_x, oy + 13 + dy, s_shade)
    px(img, arm_x, oy + 17, skin)

    # 바지
    for dy in range(5):
        for dx in range(5):
            px(img, cx - 2 + dx, oy + 19 + dy, p_main)
    px(img, cx - 2, oy + 19, p_shade, 1, 5)

    # 신발
    px(img, cx - 2, oy + 24, shoe, 5, 2)


def gen_walk_frames(skin, hair_color, shirt, pants, shoe, img, ox, oy, gen_fn, **kwargs):
    """걷기 3프레임 생성 (다리 위치 변형)"""
    # frame 0: 기본 (idle과 동일)
    gen_fn(skin, hair_color, shirt, pants, shoe, img, ox, oy, **kwargs)

    # frame 1: 왼발 앞 (1px 차이)
    gen_fn(skin, hair_color, shirt, pants, shoe, img, ox + 16, oy, **kwargs)
    # 왼발 1px 앞으로
    p_main, _ = pants
    px(img, ox + 16 + 5, oy + 24, shoe, 3, 2)  # 왼발 앞
    px(img, ox + 16 + 9, oy + 23, shoe, 3, 2)  # 오른발 뒤(올라감)

    # frame 2: 오른발 앞
    gen_fn(skin, hair_color, shirt, pants, shoe, img, ox + 32, oy, **kwargs)
    px(img, ox + 32 + 4, oy + 23, shoe, 3, 2)
    px(img, ox + 32 + 10, oy + 24, shoe, 3, 2)


def generate_characters():
    """오리지널 캐릭터 스프라이트시트 생성"""
    out_dir = OUT_BASE / "chars"
    out_dir.mkdir(parents=True, exist_ok=True)

    random.seed(42)  # 재현 가능

    CHAR_DEFS = [
        ("office_man_1", 0, 0, 0, 0),
        ("office_man_2", 0, 1, 1, 1),
        ("office_woman_1", 1, 2, 2, 0),
        ("office_woman_2", 2, 3, 3, 1),
        ("casual_1", 0, 4, 4, 2),
        ("casual_2", 1, 0, 5, 0),
        ("suit_1", 0, 0, 6, 3),
        ("suit_2", 2, 1, 7, 1),
    ]

    for name, skin_i, hair_i, shirt_i, pants_i in CHAR_DEFS:
        skin = SKIN[skin_i % len(SKIN)]
        hair = HAIR[hair_i % len(HAIR)]
        shirt = SHIRTS[shirt_i % len(SHIRTS)]
        pants_c = PANTS[pants_i % len(PANTS)]
        shoe = SHOES[skin_i % len(SHOES)]

        # 7cols × 6rows, 16×32 per frame
        img = Image.new("RGBA", (112, 192), (0, 0, 0, 0))

        # Row 0: 정면 idle + walk
        gen_char_front(skin, hair, shirt, pants_c, shoe, img, 0, 0)
        gen_walk_frames(skin, hair, shirt, pants_c, shoe, img, 16, 0, gen_char_front)

        # Row 1: 왼쪽
        gen_char_side(skin, hair, shirt, pants_c, shoe, img, 0, 32, facing_right=False)

        # Row 2: 오른쪽
        gen_char_side(skin, hair, shirt, pants_c, shoe, img, 0, 64, facing_right=True)

        # Row 3: 뒷면
        gen_char_back(skin, hair, shirt, pants_c, shoe, img, 0, 96)

        # Row 4: 앉기 (정면 + 약간 변형)
        gen_char_front(skin, hair, shirt, pants_c, shoe, img, 0, 128)

        # Row 5: idle 변형 (약간 다른 포즈)
        gen_char_front(skin, hair, shirt, pants_c, shoe, img, 0, 160)

        path = out_dir / f"{name}.png"
        img.save(path, "PNG")
        print(f"  ✅ {name} → {path.name}")

    print(f"\n캐릭터 {len(CHAR_DEFS)}종 생성 완료!")


# ═══════════════════════════════════════
# 건물 생성
# ═══════════════════════════════════════

def gen_building(name: str, width: int, height: int, floors: int,
                 wall_color: tuple, roof_color: tuple,
                 has_sign: bool = False, sign_text_color: tuple = (255, 255, 255)):
    """오리지널 건물 생성"""
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    w_main, w_shade = wall_color
    r_main, r_shade = roof_color

    floor_h = (height - 16) // max(floors, 1)  # 지붕 16px 제외

    # 벽 기본
    for y in range(16, height):
        for x in range(width):
            edge = (x == 0 or x == width - 1)
            px(img, x, y, w_shade if edge else w_main)

    # 각 층별 창문
    for f in range(floors):
        base_y = 16 + f * floor_h
        win_count = max(1, (width - 8) // 20)
        win_gap = width // (win_count + 1)

        for w in range(win_count):
            wx = win_gap * (w + 1) - 5
            wy = base_y + 4

            # 창틀
            fc = WINDOW_COLORS["frame"]
            px(img, wx, wy, fc, 10, 1)
            px(img, wx, wy + 11, fc, 10, 1)
            px(img, wx, wy, fc, 1, 12)
            px(img, wx + 9, wy, fc, 1, 12)
            px(img, wx + 4, wy, fc, 1, 12)  # 중간 칸막이

            # 유리
            gc = WINDOW_COLORS["glass_day"]
            for dy in range(1, 11):
                for dx in range(1, 4):
                    px(img, wx + dx, wy + dy, gc)
                    px(img, wx + 5 + dx, wy + dy, gc)
            # 유리 반사
            px(img, wx + 2, wy + 2, highlight(gc), 1, 3)
            px(img, wx + 7, wy + 2, highlight(gc), 1, 3)

        # 층 구분선
        if f < floors - 1:
            line_y = base_y + floor_h - 1
            px(img, 1, line_y, shade(w_main, 0.9), width - 2, 1)

    # 지붕
    for y in range(16):
        inset = max(0, 8 - y)
        for x in range(inset, width - inset):
            top = y < 2
            px(img, x, y, r_shade if top else r_main)
    # 지붕 하이라이트
    for x in range(4, width - 4):
        px(img, x, 3, highlight(r_main))

    # 입구 (1층 중앙)
    door_x = width // 2 - 5
    door_y = height - 16
    px(img, door_x, door_y, shade(w_shade, 0.6), 10, 16)
    px(img, door_x + 1, door_y + 1, (60, 50, 45), 8, 14)
    # 문 손잡이
    px(img, door_x + 7, door_y + 8, (200, 180, 100), 1, 2)

    # 간판
    if has_sign:
        sx = width // 2 - 12
        sy = 16 + 2
        px(img, sx, sy, (40, 40, 50), 24, 8)
        px(img, sx + 1, sy + 1, (50, 50, 65), 22, 6)

    return img


def generate_buildings():
    """오리지널 건물 세트 생성"""
    out_dir = OUT_BASE / "buildings"
    out_dir.mkdir(parents=True, exist_ok=True)

    buildings = [
        ("main_1f", 64, 80, 1, WALL_COLORS[0], ROOF_COLORS[0], True),
        ("main_2f", 64, 112, 2, WALL_COLORS[0], ROOF_COLORS[0], True),
        ("main_3f", 64, 144, 3, WALL_COLORS[0], ROOF_COLORS[0], True),
        ("shop_left", 48, 96, 2, WALL_COLORS[1], ROOF_COLORS[1], False),
        ("shop_right", 48, 80, 2, WALL_COLORS[2], ROOF_COLORS[2], False),
        ("apartment", 56, 128, 3, WALL_COLORS[3], ROOF_COLORS[0], False),
        ("cafe", 48, 80, 1, WALL_COLORS[1], ROOF_COLORS[2], True),
    ]

    for name, w, h, floors, wall, roof, sign in buildings:
        img = gen_building(name, w, h, floors, wall, roof, sign)
        path = out_dir / f"{name}.png"
        img.save(path, "PNG")
        print(f"  ✅ {name}: {w}×{h} ({floors}F) → {path.name}")

    print(f"\n건물 {len(buildings)}종 생성 완료!")


# ═══════════════════════════════════════
# 소품 생성
# ═══════════════════════════════════════

def generate_props():
    """오리지널 소품 세트 생성"""
    out_dir = OUT_BASE / "props"
    out_dir.mkdir(parents=True, exist_ok=True)

    # 가로등 (16×48)
    img = Image.new("RGBA", (16, 48), (0, 0, 0, 0))
    pole = (80, 80, 90)
    px(img, 7, 8, pole, 2, 38)       # 기둥
    px(img, 4, 2, (60, 60, 70), 8, 6)  # 등갓
    px(img, 5, 3, (255, 240, 180), 6, 4)  # 빛
    px(img, 6, 46, (60, 60, 60), 4, 2)  # 받침
    img.save(out_dir / "streetlight.png")
    print("  ✅ streetlight")

    # 나무 4계절 (24×40)
    seasons = {
        "spring": ((220, 140, 180), (200, 120, 160)),    # 벚꽃 핑크
        "summer": ((60, 150, 60), (45, 120, 45)),         # 초록
        "autumn": ((200, 120, 40), (170, 90, 30)),         # 단풍
        "winter": ((140, 140, 150), (120, 120, 130)),      # 회색
    }
    trunk = (90, 60, 40)
    trunk_shade = (70, 45, 30)

    for season, (leaf, leaf_shade) in seasons.items():
        img = Image.new("RGBA", (24, 40), (0, 0, 0, 0))
        # 나무줄기
        px(img, 10, 20, trunk, 4, 18)
        px(img, 10, 20, trunk_shade, 1, 18)
        px(img, 9, 36, trunk_shade, 6, 4)  # 뿌리

        # 잎 (원형 뭉치)
        for dy in range(-8, 10):
            for dx in range(-9, 10):
                dist = (dx * dx + dy * dy * 1.3)
                if dist < 80:
                    c = leaf_shade if dist > 55 else leaf
                    if dist < 25:
                        c = highlight(leaf)
                    px(img, 12 + dx, 14 + dy, c)

        img.save(out_dir / f"tree_{season}.png")
        print(f"  ✅ tree_{season}")

    # 벤치 (32×16)
    img = Image.new("RGBA", (32, 16), (0, 0, 0, 0))
    wood = (140, 100, 60)
    wood_s = (110, 80, 48)
    px(img, 2, 4, wood, 28, 3)       # 좌판
    px(img, 2, 4, wood_s, 28, 1)     # 윗면 그림자
    px(img, 2, 0, wood, 28, 2)       # 등받이
    px(img, 4, 7, (70, 70, 70), 2, 8)   # 다리
    px(img, 26, 7, (70, 70, 70), 2, 8)
    img.save(out_dir / "bench.png")
    print("  ✅ bench")

    # 우체통 (16×24)
    img = Image.new("RGBA", (16, 24), (0, 0, 0, 0))
    px(img, 4, 0, (200, 50, 50), 8, 14)    # 몸체
    px(img, 4, 0, (170, 40, 40), 8, 2)     # 윗면
    px(img, 5, 1, (230, 80, 80), 6, 2)     # 하이라이트
    px(img, 5, 7, (40, 40, 40), 6, 2)      # 투입구
    px(img, 6, 14, (80, 80, 80), 4, 10)    # 기둥
    img.save(out_dir / "mailbox.png")
    print("  ✅ mailbox")

    # 화분 (16×16)
    for i, leaf_c in enumerate([(80, 160, 80), (60, 140, 100), (140, 100, 60)]):
        img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        pot = (180, 100, 60)
        px(img, 4, 10, pot, 8, 5)           # 화분
        px(img, 5, 9, shade(pot), 6, 1)     # 테두리
        px(img, 5, 15, shade(pot, 0.8), 6, 1)
        # 식물
        px(img, 6, 3, leaf_c, 4, 7)
        px(img, 5, 5, leaf_c, 6, 4)
        px(img, 7, 2, highlight(leaf_c), 2, 2)
        img.save(out_dir / f"potplant_{i}.png")
        print(f"  ✅ potplant_{i}")

    print(f"\n소품 생성 완료!")


# ═══════════════════════════════════════
# 타일 생성
# ═══════════════════════════════════════

def generate_tiles():
    """오리지널 타일 세트 생성"""
    out_dir = OUT_BASE / "tiles"
    out_dir.mkdir(parents=True, exist_ok=True)

    # 보도 (16×16)
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    base = (190, 185, 175)
    for y in range(16):
        for x in range(16):
            noise = random.randint(-5, 5)
            c = tuple(max(0, min(255, v + noise)) for v in base)
            px(img, x, y, c)
    # 보도 블록 경계
    for x in range(16):
        px(img, x, 0, shade(base, 0.92))
        px(img, x, 15, shade(base, 0.88))
    for y in range(16):
        px(img, 0, y, shade(base, 0.92))
        px(img, 8, y, shade(base, 0.95))
    img.save(out_dir / "sidewalk.png")
    print("  ✅ sidewalk")

    # 도로 (16×16)
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    road = (60, 60, 65)
    for y in range(16):
        for x in range(16):
            noise = random.randint(-3, 3)
            c = tuple(max(0, min(255, v + noise)) for v in road)
            px(img, x, y, c)
    img.save(out_dir / "road.png")
    print("  ✅ road")

    # 도로 중앙선 (16×16)
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    for y in range(16):
        for x in range(16):
            noise = random.randint(-3, 3)
            c = tuple(max(0, min(255, v + noise)) for v in road)
            px(img, x, y, c)
    px(img, 7, 0, (240, 210, 80), 2, 10)   # 노란 중앙선 (점선)
    img.save(out_dir / "road_line.png")
    print("  ✅ road_line")

    # 나무바닥 (16×16)
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    wood_base = (160, 120, 80)
    for y in range(16):
        for x in range(16):
            stripe = 1.0 if (y % 4 < 3) else 0.92
            noise = random.randint(-4, 4)
            c = tuple(max(0, min(255, int(v * stripe) + noise)) for v in wood_base)
            px(img, x, y, c)
    img.save(out_dir / "floor_wood.png")
    print("  ✅ floor_wood")

    # 대리석 (16×16)
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    marble = (220, 215, 210)
    for y in range(16):
        for x in range(16):
            noise = random.randint(-8, 8)
            c = tuple(max(0, min(255, v + noise)) for v in marble)
            px(img, x, y, c)
    # 미세한 결
    px(img, 3, 5, shade(marble, 0.95), 4, 1)
    px(img, 8, 10, shade(marble, 0.93), 5, 1)
    img.save(out_dir / "floor_marble.png")
    print("  ✅ floor_marble")

    # 벽돌 (16×16)
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    brick = (160, 90, 70)
    mortar = (180, 170, 155)
    for y in range(16):
        for x in range(16):
            is_mortar = (y % 4 == 0) or ((x + (y // 4) * 8) % 8 == 0 and y % 4 != 0)
            base_c = mortar if is_mortar else brick
            noise = random.randint(-5, 5)
            c = tuple(max(0, min(255, v + noise)) for v in base_c)
            px(img, x, y, c)
    img.save(out_dir / "wall_brick.png")
    print("  ✅ wall_brick")

    print(f"\n타일 생성 완료!")


# ═══════════════════════════════════════
# 메인
# ═══════════════════════════════════════

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "all"

    print("🔨 Pixel Forge — 두근컴퍼니 오리지널 에셋 생성기\n")

    if target in ("chars", "all"):
        print("=== 캐릭터 ===")
        generate_characters()
        print()

    if target in ("buildings", "all"):
        print("=== 건물 ===")
        generate_buildings()
        print()

    if target in ("props", "all"):
        print("=== 소품 ===")
        generate_props()
        print()

    if target in ("tiles", "all"):
        print("=== 타일 ===")
        generate_tiles()
        print()

    print(f"📁 출력: {OUT_BASE}")


if __name__ == "__main__":
    main()
