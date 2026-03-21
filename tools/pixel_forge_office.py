#!/usr/bin/env python3
"""
🔨 Pixel Forge Office — 사무실 전용 오리지널 픽셀아트

사무실 씬에 필요한 가구/장비를 코드로 생성:
노트북, 데스크, 사무의자, 서버랙, 모니터, 책장, 창문,
화이트보드, 정수기, 커피머신, 에어컨, 시계 등
"""
from PIL import Image
from pathlib import Path

OUT = Path("/Users/600mac/Developer/my-company/company-hq/ui/public/assets/original/office")


def px(img, x, y, color, w=1, h=1):
    for dy in range(h):
        for dx in range(w):
            if 0 <= x + dx < img.width and 0 <= y + dy < img.height:
                img.putpixel((x + dx, y + dy), color if len(color) == 4 else color + (255,))


def shade(c, a=0.8):
    return tuple(max(0, int(v * a)) for v in c)


def hi(c, a=1.2):
    return tuple(min(255, int(v * a)) for v in c)


# ═══════════════════════════════════
# 사무실 가구
# ═══════════════════════════════════

def gen_desk():
    """사무용 책상 — 정면 (48×32)"""
    img = Image.new("RGBA", (48, 32), (0, 0, 0, 0))
    top = (160, 140, 110)       # 상판
    leg = (120, 105, 85)        # 다리
    edge = shade(top, 0.85)

    # 상판
    px(img, 0, 8, edge, 48, 1)        # 앞면 그림자
    px(img, 0, 4, top, 48, 4)         # 상판
    px(img, 0, 3, hi(top), 48, 1)     # 상판 하이라이트
    # 앞판
    px(img, 0, 9, (140, 125, 100), 48, 3)
    # 서랍
    px(img, 2, 13, (130, 115, 90), 20, 10)
    px(img, 3, 14, (140, 125, 100), 18, 8)
    px(img, 10, 18, (180, 170, 140), 4, 1)   # 손잡이
    # 빈 공간 (다리 사이)
    px(img, 24, 12, (30, 30, 35, 80), 22, 12)
    # 다리
    px(img, 1, 12, leg, 2, 18)
    px(img, 45, 12, leg, 2, 18)
    px(img, 23, 12, leg, 2, 18)
    # 바닥 그림자
    px(img, 2, 30, (0, 0, 0, 30), 44, 2)

    return img


def gen_desk_side():
    """책상 옆면 (16×32)"""
    img = Image.new("RGBA", (16, 32), (0, 0, 0, 0))
    top = (150, 130, 100)
    leg = (120, 105, 85)

    px(img, 0, 4, top, 16, 4)
    px(img, 0, 3, hi(top), 16, 1)
    px(img, 0, 8, shade(top), 16, 1)
    px(img, 1, 9, leg, 2, 21)
    px(img, 13, 9, leg, 2, 21)
    px(img, 2, 30, (0, 0, 0, 30), 12, 2)

    return img


def gen_laptop():
    """노트북 — 정면, 열린 상태 (24×20)"""
    img = Image.new("RGBA", (24, 20), (0, 0, 0, 0))
    body = (55, 55, 60)
    screen_frame = (40, 40, 45)
    screen = (30, 45, 70)

    # 화면부 (뒤쪽, 세워진)
    px(img, 2, 0, screen_frame, 20, 12)
    px(img, 3, 1, screen, 18, 10)
    # 화면 내용
    px(img, 5, 3, (80, 200, 120), 8, 1)    # 초록 텍스트
    px(img, 5, 5, (100, 160, 220), 12, 1)  # 파란 텍스트
    px(img, 5, 7, (80, 200, 120), 6, 1)
    px(img, 5, 9, (200, 180, 80), 10, 1)   # 노란 텍스트
    # 화면 반사
    px(img, 4, 2, (60, 80, 110), 2, 4)

    # 키보드부 (앞쪽, 눕혀진)
    px(img, 1, 12, body, 22, 7)
    px(img, 2, 13, (70, 70, 75), 20, 5)    # 키보드 영역
    # 키 줄
    for row in range(3):
        for col in range(8):
            px(img, 3 + col * 2, 13 + row * 2, (85, 85, 90), 1, 1)
    # 터치패드
    px(img, 8, 17, (65, 65, 70), 8, 1)
    # 힌지
    px(img, 3, 12, (45, 45, 50), 18, 1)

    return img


def gen_laptop_closed():
    """노트북 — 닫힌 상태 (24×8)"""
    img = Image.new("RGBA", (24, 8), (0, 0, 0, 0))
    body = (55, 55, 60)

    px(img, 1, 1, body, 22, 4)
    px(img, 1, 0, hi(body), 22, 1)      # 상단 하이라이트
    px(img, 1, 5, shade(body), 22, 1)    # 하단 그림자
    # 로고 (작은 점)
    px(img, 11, 2, (100, 100, 110), 2, 2)

    return img


def gen_monitor():
    """모니터 — 정면 (20×24)"""
    img = Image.new("RGBA", (20, 24), (0, 0, 0, 0))
    frame = (40, 40, 45)
    screen = (25, 40, 65)

    # 화면
    px(img, 0, 0, frame, 20, 16)
    px(img, 1, 1, screen, 18, 14)
    # 화면 내용
    px(img, 3, 3, (70, 180, 110), 10, 1)
    px(img, 3, 5, (90, 150, 210), 14, 1)
    px(img, 3, 7, (70, 180, 110), 7, 1)
    px(img, 3, 9, (210, 170, 70), 12, 1)
    px(img, 3, 11, (90, 150, 210), 9, 1)
    # 반사
    px(img, 2, 2, (50, 70, 100), 1, 5)

    # 스탠드 목
    px(img, 9, 16, (60, 60, 65), 2, 4)
    # 스탠드 받침
    px(img, 5, 20, (50, 50, 55), 10, 3)
    px(img, 6, 20, (65, 65, 70), 8, 1)

    return img


def gen_monitor_back():
    """모니터 — 뒷면 (20×24)"""
    img = Image.new("RGBA", (20, 24), (0, 0, 0, 0))
    back = (50, 50, 55)

    px(img, 0, 0, back, 20, 16)
    px(img, 1, 1, (60, 60, 65), 18, 14)
    # 통풍구
    for i in range(4):
        px(img, 6, 4 + i * 3, (45, 45, 50), 8, 1)
    # 스탠드
    px(img, 9, 16, (60, 60, 65), 2, 4)
    px(img, 5, 20, (50, 50, 55), 10, 3)

    return img


def gen_office_chair_front():
    """사무용 의자 — 정면 (16×24)"""
    img = Image.new("RGBA", (16, 24), (0, 0, 0, 0))
    seat = (50, 50, 60)
    frame_c = (70, 70, 75)

    # 등받이
    px(img, 3, 0, seat, 10, 8)
    px(img, 4, 1, hi(seat), 8, 6)
    # 좌석
    px(img, 2, 9, seat, 12, 5)
    px(img, 3, 10, hi(seat), 10, 3)
    # 팔걸이
    px(img, 1, 6, frame_c, 2, 8)
    px(img, 13, 6, frame_c, 2, 8)
    # 기둥
    px(img, 7, 14, (60, 60, 60), 2, 4)
    # 바퀴 (5개)
    px(img, 3, 18, (50, 50, 50), 2, 2)
    px(img, 7, 19, (50, 50, 50), 2, 2)
    px(img, 11, 18, (50, 50, 50), 2, 2)
    # 바퀴 다리
    px(img, 4, 18, (65, 65, 65), 8, 1)

    return img


def gen_office_chair_back():
    """사무용 의자 — 뒷면 (16×24)"""
    img = Image.new("RGBA", (16, 24), (0, 0, 0, 0))
    seat = (45, 45, 55)
    frame_c = (65, 65, 70)

    px(img, 3, 0, shade(seat), 10, 8)
    px(img, 4, 1, seat, 8, 6)
    px(img, 2, 9, shade(seat), 12, 5)
    px(img, 1, 6, frame_c, 2, 8)
    px(img, 13, 6, frame_c, 2, 8)
    px(img, 7, 14, (55, 55, 55), 2, 4)
    px(img, 3, 18, (50, 50, 50), 2, 2)
    px(img, 7, 19, (50, 50, 50), 2, 2)
    px(img, 11, 18, (50, 50, 50), 2, 2)
    px(img, 4, 18, (60, 60, 60), 8, 1)

    return img


def gen_bookshelf():
    """사무실 책장 (32×48) — 불규칙한 책 배치"""
    import random
    random.seed(77)
    img = Image.new("RGBA", (32, 48), (0, 0, 0, 0))
    wood = (100, 75, 55)
    wood_s = shade(wood)

    px(img, 0, 0, wood_s, 32, 48)
    px(img, 1, 1, wood, 30, 46)

    book_colors = [
        (70, 130, 200), (200, 70, 70), (70, 170, 100), (200, 170, 60),
        (150, 80, 180), (100, 100, 120), (180, 100, 60), (80, 80, 140),
        (160, 60, 100), (100, 150, 140), (200, 140, 80), (120, 80, 60),
    ]

    for shelf in range(4):
        sy = 2 + shelf * 11
        px(img, 1, sy + 10, wood_s, 30, 1)

        x = 3
        while x < 28:
            c = random.choice(book_colors)
            bw = random.randint(2, 5)
            bh = random.randint(5, 10)
            gap = random.randint(0, 1)
            if x + bw > 29:
                break
            py = sy + (10 - bh)
            # 약간 기울어진 책 (1px 오프셋)
            tilt = random.choice([0, 0, 0, -1, 1])
            px(img, x, py + tilt, c, bw, bh - abs(tilt))
            px(img, x, py + tilt, hi(c), 1, bh - abs(tilt))
            # 가끔 빈 공간 또는 눕힌 책
            if random.random() < 0.15:
                x += bw + random.randint(2, 4)
            else:
                x += bw + gap

    return img


def gen_server_rack():
    """서버랙 (32×64)"""
    img = Image.new("RGBA", (32, 64), (0, 0, 0, 0))
    body = (35, 35, 40)
    panel = (45, 45, 50)

    # 본체
    px(img, 0, 0, (25, 25, 30), 32, 64)
    px(img, 1, 1, body, 30, 62)

    # 서버 유닛 6개
    for u in range(6):
        uy = 3 + u * 10
        px(img, 3, uy, panel, 26, 8)
        px(img, 4, uy + 1, (55, 55, 60), 24, 6)

        # LED 표시등
        px(img, 5, uy + 2, (50, 220, 80), 2, 1)   # 녹색 (정상)
        px(img, 5, uy + 4, (50, 180, 220), 2, 1)  # 파랑 (활동)

        # 통풍구 패턴
        for vx in range(8, 26, 3):
            px(img, vx, uy + 2, (40, 40, 45), 2, 4)

        # 핫스왑 베이
        px(img, 24, uy + 1, (60, 60, 65), 4, 6)

    # 하단 케이블 관리
    px(img, 3, 63, (30, 30, 35), 26, 1)

    return img


def gen_server_rack_small():
    """작은 서버/NAS (16×32)"""
    img = Image.new("RGBA", (16, 32), (0, 0, 0, 0))
    body = (35, 35, 40)

    px(img, 0, 0, (25, 25, 30), 16, 32)
    px(img, 1, 1, body, 14, 30)

    for u in range(3):
        uy = 3 + u * 9
        px(img, 3, uy, (50, 50, 55), 10, 7)
        px(img, 4, uy + 1, (40, 200, 70), 1, 1)
        px(img, 4, uy + 3, (40, 160, 200), 1, 1)
        for vx in range(6, 12, 2):
            px(img, vx, uy + 1, (40, 40, 45), 1, 5)

    return img


def gen_window():
    """사무실 창문 — 통창 (48×32)"""
    img = Image.new("RGBA", (48, 32), (0, 0, 0, 0))
    frame = (180, 180, 185)
    glass = (140, 190, 220)

    # 프레임
    px(img, 0, 0, frame, 48, 32)
    # 유리 (4칸)
    for i in range(4):
        gx = 2 + i * 12
        px(img, gx, 2, glass, 10, 28)
        px(img, gx + 1, 3, hi(glass), 2, 10)  # 반사

    return img


def gen_window_night():
    """사무실 창문 — 야경 (48×32)"""
    img = Image.new("RGBA", (48, 32), (0, 0, 0, 0))
    frame = (100, 100, 110)
    glass = (20, 25, 45)

    px(img, 0, 0, frame, 48, 32)
    for i in range(4):
        gx = 2 + i * 12
        px(img, gx, 2, glass, 10, 28)
        # 먼 건물 불빛
        px(img, gx + 3, 8, (255, 220, 100, 180), 2, 2)
        px(img, gx + 7, 14, (255, 200, 80, 150), 1, 1)
        px(img, gx + 2, 20, (255, 230, 120, 120), 2, 1)
        # 별
        px(img, gx + 5, 4, (255, 255, 255, 100), 1, 1)

    return img


def gen_whiteboard():
    """화이트보드 (40×32)"""
    img = Image.new("RGBA", (40, 32), (0, 0, 0, 0))
    frame_c = (180, 180, 185)
    board = (240, 240, 235)

    # 프레임
    px(img, 0, 0, frame_c, 40, 32)
    # 보드
    px(img, 2, 2, board, 36, 26)
    # 낙서/메모
    px(img, 5, 5, (60, 60, 200), 12, 1)    # 파란 글씨
    px(img, 5, 8, (200, 60, 60), 18, 1)    # 빨간 글씨
    px(img, 5, 11, (60, 60, 200), 8, 1)
    px(img, 20, 14, (60, 180, 60), 10, 8)  # 초록 사각형(다이어그램)
    px(img, 21, 15, board, 8, 6)
    # 트레이
    px(img, 4, 28, (160, 160, 165), 32, 3)
    # 마커
    px(img, 8, 28, (200, 50, 50), 4, 2)
    px(img, 14, 28, (50, 50, 200), 4, 2)
    px(img, 20, 28, (50, 50, 50), 4, 2)

    return img


def gen_water_cooler():
    """정수기 (16×32)"""
    img = Image.new("RGBA", (16, 32), (0, 0, 0, 0))

    # 물통
    px(img, 4, 0, (100, 160, 210), 8, 8)
    px(img, 5, 1, (130, 190, 230), 6, 6)
    px(img, 6, 2, (160, 210, 240), 2, 3)   # 반사

    # 본체
    px(img, 3, 8, (210, 210, 215), 10, 18)
    px(img, 4, 9, (220, 220, 225), 8, 16)
    # 버튼
    px(img, 5, 12, (60, 60, 220), 3, 2)    # 차가운물
    px(img, 9, 12, (220, 60, 60), 3, 2)    # 뜨거운물
    # 배수구
    px(img, 6, 16, (80, 80, 85), 4, 2)

    # 받침대
    px(img, 2, 26, (180, 180, 185), 12, 5)
    px(img, 3, 27, (190, 190, 195), 10, 3)

    return img


def gen_coffee_machine():
    """커피머신 (16×20)"""
    img = Image.new("RGBA", (16, 20), (0, 0, 0, 0))
    body = (50, 50, 55)

    # 본체
    px(img, 2, 0, body, 12, 16)
    px(img, 3, 1, (60, 60, 65), 10, 14)
    # 상단 (원두통)
    px(img, 4, 1, (80, 50, 30), 8, 4)
    px(img, 5, 2, (100, 65, 40), 6, 2)
    # 디스플레이
    px(img, 5, 6, (40, 80, 40), 6, 3)
    # 추출구
    px(img, 6, 11, (40, 40, 40), 4, 3)
    # 컵 받침
    px(img, 4, 14, (70, 70, 75), 8, 2)
    # 컵
    px(img, 6, 12, (230, 230, 230), 3, 3)
    # 받침대
    px(img, 1, 16, (60, 60, 65), 14, 4)

    return img


def gen_wall_clock():
    """벽시계 (12×12)"""
    img = Image.new("RGBA", (12, 12), (0, 0, 0, 0))
    frame_c = (60, 60, 65)
    face = (240, 240, 235)

    # 원형 프레임 (사각형으로 근사)
    px(img, 2, 0, frame_c, 8, 12)
    px(img, 0, 2, frame_c, 12, 8)
    px(img, 1, 1, frame_c, 10, 10)
    # 시계면
    px(img, 2, 1, face, 8, 10)
    px(img, 1, 2, face, 10, 8)
    px(img, 3, 3, face, 6, 6)
    # 시침
    px(img, 6, 3, (40, 40, 40), 1, 3)
    # 분침
    px(img, 6, 6, (40, 40, 40), 3, 1)
    # 중심점
    px(img, 6, 6, (200, 50, 50), 1, 1)

    return img


def gen_ac_unit():
    """에어컨 실외기/실내기 (32×12)"""
    img = Image.new("RGBA", (32, 12), (0, 0, 0, 0))
    body = (230, 230, 235)

    px(img, 0, 0, body, 32, 10)
    px(img, 1, 1, (240, 240, 245), 30, 8)
    # 통풍구
    for i in range(12):
        px(img, 3 + i * 2, 6, (200, 200, 205), 1, 3)
    # LED
    px(img, 28, 2, (50, 200, 80), 1, 1)
    # 하단
    px(img, 0, 10, shade(body, 0.9), 32, 2)

    return img


def gen_fire_extinguisher():
    """소화기 (8×20)"""
    img = Image.new("RGBA", (8, 20), (0, 0, 0, 0))

    # 손잡이
    px(img, 2, 0, (50, 50, 50), 4, 3)
    px(img, 3, 0, (60, 60, 60), 2, 2)
    # 몸통
    px(img, 1, 3, (210, 40, 40), 6, 14)
    px(img, 2, 4, (230, 60, 60), 4, 12)
    px(img, 2, 5, (240, 90, 90), 1, 6)   # 하이라이트
    # 라벨
    px(img, 2, 8, (240, 240, 230), 4, 3)
    # 받침
    px(img, 1, 17, (180, 30, 30), 6, 2)

    return img


# ═══════════════════════════════════
# 메인
# ═══════════════════════════════════

GENERATORS = {
    "desk_front": (gen_desk, "사무용 책상 정면"),
    "desk_side": (gen_desk_side, "책상 옆면"),
    "laptop_open": (gen_laptop, "노트북 열림"),
    "laptop_closed": (gen_laptop_closed, "노트북 닫힘"),
    "monitor_front": (gen_monitor, "모니터 정면"),
    "monitor_back": (gen_monitor_back, "모니터 뒷면"),
    "chair_front": (gen_office_chair_front, "사무의자 정면"),
    "chair_back": (gen_office_chair_back, "사무의자 뒷면"),
    "bookshelf": (gen_bookshelf, "책장"),
    "server_rack": (gen_server_rack, "서버랙 대"),
    "server_small": (gen_server_rack_small, "서버 소(NAS)"),
    "window_day": (gen_window, "통창 낮"),
    "window_night": (gen_window_night, "통창 밤"),
    "whiteboard": (gen_whiteboard, "화이트보드"),
    "water_cooler": (gen_water_cooler, "정수기"),
    "coffee_machine": (gen_coffee_machine, "커피머신"),
    "wall_clock": (gen_wall_clock, "벽시계"),
    "ac_unit": (gen_ac_unit, "에어컨"),
    "fire_extinguisher": (gen_fire_extinguisher, "소화기"),
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print("🔨 Pixel Forge Office — 사무실 에셋 생성\n")

    for name, (gen_fn, desc) in GENERATORS.items():
        img = gen_fn()
        path = OUT / f"{name}.png"
        img.save(path, "PNG")
        print(f"  ✅ {name} ({img.width}×{img.height}) — {desc}")

    print(f"\n총 {len(GENERATORS)}종 → {OUT}")


if __name__ == "__main__":
    main()
