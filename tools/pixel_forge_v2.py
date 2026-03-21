#!/usr/bin/env python3
"""
🔨 Pixel Forge V2 — 고품질 리마스터
두근컴퍼니 오리지널 픽셀아트 생성기 (전면 개선판)

개선사항:
- 캐릭터 두상/비율 대폭 개선 (LimeZu 수준)
- 실제 워크 애니메이션 (다리 교차 3프레임)
- 사이드/백 뷰에도 워크 프레임 추가
- 여성 캐릭터 긴 머리 표현
- 수트 캐릭터 넥타이/재킷 라펠 추가
- 기술적 버그 수정 (모드, 불완전 스프라이트)

사용법:
  python3 pixel_forge_v2.py chars      # 캐릭터 전체 재생성
  python3 pixel_forge_v2.py fix        # 기술적 버그 수정
  python3 pixel_forge_v2.py buildings  # 건물 개선
  python3 pixel_forge_v2.py all        # 전부
"""
from PIL import Image
from pathlib import Path
import sys
import random

ASSETS = Path("/Users/600mac/Developer/my-company/company-hq/ui/public/assets")
OUT_CHARS = ASSETS / "original" / "chars"
OUT_BUILDINGS = ASSETS / "original" / "buildings"

# ═══════════════════════════════════════
# 유틸
# ═══════════════════════════════════════

def px(img: Image.Image, x: int, y: int, color: tuple, w: int = 1, h: int = 1):
    for dy in range(h):
        for dx in range(w):
            if 0 <= x + dx < img.width and 0 <= y + dy < img.height:
                if len(color) == 3:
                    img.putpixel((x + dx, y + dy), color + (255,))
                else:
                    img.putpixel((x + dx, y + dy), color)


def shade(c, a=0.8):
    return tuple(max(0, int(v * a)) for v in c[:3])


def hi(c, a=1.25):
    return tuple(min(255, int(v * a)) for v in c[:3])


def mix(a, b, t=0.5):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))


# ═══════════════════════════════════════
# 팔레트
# ═══════════════════════════════════════

SKIN_TONES = [
    # (lit, mid, shadow)
    ((252, 217, 168), (232, 197, 148), (200, 168, 120)),  # 밝은 피부
    ((240, 195, 145), (218, 175, 125), (188, 148, 100)),  # 중간 피부
    ((190, 140, 95),  (165, 118, 78),  (138, 96,  60)),   # 어두운 피부
]

HAIR_COLORS = [
    # (main, shadow, highlight)
    ((35, 30, 30),   (25, 20, 20),   (60, 55, 55)),    # 검정
    ((80, 50, 35),   (60, 38, 26),   (110, 75, 55)),   # 짙은갈색
    ((130, 80, 45),  (100, 62, 35),  (165, 112, 70)),  # 갈색
    ((55, 55, 75),   (40, 40, 60),   (80, 80, 105)),   # 짙은회색
    ((170, 130, 60), (138, 105, 48), (210, 168, 88)),  # 밝은갈색
]

SHIRT_COLORS = [
    # (light, main, dark)
    ((80, 130, 210),  (55, 105, 180),  (38, 78, 148)),   # 파랑
    ((80, 185, 110),  (55, 158, 85),   (38, 128, 62)),    # 초록
    ((210, 80, 80),   (185, 58, 58),   (148, 42, 42)),    # 빨강
    ((148, 80, 210),  (120, 55, 185),  (95, 38, 148)),    # 보라
    ((210, 148, 58),  (185, 120, 38),  (148, 95, 28)),    # 주황
    ((88, 95, 110),   (68, 75, 90),    (50, 58, 72)),     # 회색
    ((62, 148, 148),  (42, 120, 120),  (28, 95, 95)),     # 청록
    ((35, 35, 42),    (28, 28, 35),    (20, 20, 28)),     # 검정(수트)
]

PANTS_COLORS = [
    # (light, main, dark)
    ((60, 60, 85),   (45, 45, 68),   (32, 32, 52)),   # 남색
    ((48, 48, 48),   (35, 35, 35),   (22, 22, 22)),   # 검정
    ((95, 78, 58),   (78, 62, 45),   (60, 48, 34)),   # 갈색
    ((68, 80, 95),   (52, 62, 78),   (38, 48, 62)),   # 슬레이트
]


# ═══════════════════════════════════════
# 캐릭터 드로잉 — V2 (고품질)
# ═══════════════════════════════════════

def draw_head_front(img, ox, oy, skin, hair, is_female=False):
    """정면 머리 — 버그픽스판
    Fix1: 얼굴을 먼저 그리고 머리카락이 덮음 (여성 앞머리 가시성)
    Fix2: 사이드 머리카락 y=2~7 (이전 y=2~5, 하관 투명 버그)
    Fix3: 입술 색을 피부 기반으로 절제 (이전 고정 빨간색 버그)
    """
    sk_lit, sk_mid, sk_drk = skin
    hr_main, hr_shd, hr_hi = hair

    # ─── 1단계: 얼굴 먼저 ───
    px(img, ox+4, oy+2, sk_lit, 6, 1)   # 이마

    px(img, ox+4, oy+3, sk_lit, 6, 1)   # 눈썹 줄 바탕
    px(img, ox+5, oy+3, (40,30,28), 1, 1)   # 왼 눈썹
    px(img, ox+8, oy+3, (40,30,28), 1, 1)   # 오른 눈썹

    px(img, ox+4, oy+4, sk_lit, 6, 1)   # 눈 줄 바탕
    px(img, ox+5, oy+4, (240,240,240), 1, 1)  # 왼 흰자
    px(img, ox+6, oy+4, (28,22,35),    1, 1)  # 왼 동공
    px(img, ox+8, oy+4, (240,240,240), 1, 1)  # 오른 흰자
    px(img, ox+9, oy+4, (28,22,35),    1, 1)  # 오른 동공

    px(img, ox+4, oy+5, sk_mid, 6, 1)   # 코 줄
    px(img, ox+7, oy+5, sk_drk, 1, 1)   # 콧구멍

    # Fix3: 입술 = 피부 sk_mid 에 28%만 분홍 혼합 → 자연스럽게
    mouth_c = mix(sk_mid, (190, 95, 85), 0.28)
    px(img, ox+4, oy+6, sk_mid,   6, 1)   # 입 줄 바탕
    px(img, ox+6, oy+6, mouth_c,  2, 1)   # 입술 (절제된 색)

    px(img, ox+4, oy+7, sk_mid, 6, 1)   # 턱 바탕
    px(img, ox+5, oy+7, sk_lit, 4, 1)   # 턱 하이라이트

    # 귀
    px(img, ox+3, oy+4, sk_mid, 1, 2)
    px(img, ox+10,oy+4, sk_mid, 1, 2)

    # ─── 2단계: 머리카락이 얼굴 위를 덮음 ───
    # 윗면 (y=0)
    px(img, ox+3, oy+0, hr_hi,   2, 1)
    px(img, ox+5, oy+0, hr_main, 4, 1)
    px(img, ox+9, oy+0, hr_shd,  1, 1)

    # 두번째 줄 (y=1)
    px(img, ox+2, oy+1, hr_shd, 1, 1)
    px(img, ox+3, oy+1, hr_hi,  1, 1)
    px(img, ox+4, oy+1, hr_main, 5, 1)
    px(img, ox+9, oy+1, hr_shd,  2, 1)

    # Fix2: 사이드 머리카락 y=2~7 (6줄, 이전엔 4줄로 하관이 투명했음)
    for dy in range(6):
        px(img, ox+2,  oy+2+dy, hr_shd,  1, 1)
        px(img, ox+3,  oy+2+dy, hr_main, 1, 1)
        px(img, ox+10, oy+2+dy, hr_main, 1, 1)
        px(img, ox+11, oy+2+dy, hr_shd,  1, 1)

    if is_female:
        # 귀 아래 긴 머리 (y=3~9, 목까지)
        for dy in range(7):
            px(img, ox+2,  oy+3+dy, hr_shd,  1, 1)
            px(img, ox+3,  oy+3+dy, hr_main, 1, 1)
            px(img, ox+10, oy+3+dy, hr_main, 1, 1)
            px(img, ox+11, oy+3+dy, hr_shd,  1, 1)
        # Fix1: 앞머리를 얼굴 이후에 그려야 보임
        px(img, ox+4, oy+2, hr_main, 3, 1)   # 앞머리 이마 줄
        px(img, ox+5, oy+3, hr_main, 2, 1)   # 앞머리 눈썹 줄
        # 속눈썹 (앞머리 뒤에)
        px(img, ox+5, oy+3, (20,15,25), 2, 1)
        px(img, ox+8, oy+3, (20,15,25), 2, 1)


def draw_neck_body_front(img, ox, oy, skin, shirt, is_suit=False, has_tie=False):
    """정면 몸통 (y=8~17)"""
    sk_lit, sk_mid, sk_drk = skin
    sh_lit, sh_main, sh_drk = shirt

    # ─── 목 ───
    px(img, ox+6, oy+8, sk_mid, 3, 2)

    # ─── 셔츠/재킷 ───
    if is_suit:
        # 재킷: 어두운 몸통 + 흰 셔츠 안
        body_c = sh_main
        body_hi = sh_lit
        body_shd = sh_drk
        # 라펠 (V 형)
        lapel = (230, 228, 220)
        px(img, ox+3, oy+10, body_c, 9, 8)     # 재킷 기본
        px(img, ox+4, oy+10, body_hi,1, 8)     # 좌 하이라이트
        px(img, ox+4, oy+11, lapel,  2, 5)     # 왼 라펠
        px(img, ox+9, oy+11, lapel,  2, 5)     # 오른 라펠
        # 넥타이 (있으면)
        if has_tie:
            px(img, ox+7, oy+10, (200,50,50),  1, 8)   # 빨간 넥타이
            px(img, ox+6, oy+14, (200,50,50),  3, 1)   # 넥타이 퍼짐
    else:
        px(img, ox+3, oy+10, sh_main, 9, 8)     # 셔츠 기본
        px(img, ox+4, oy+10, sh_lit,  1, 7)     # 좌 하이라이트
        px(img, ox+11,oy+10, sh_drk,  1, 7)     # 우 그림자

    # 칼라
    px(img, ox+5, oy+9,  (240,238,232), 5, 2)  # 흰 칼라
    px(img, ox+6, oy+9,  sh_main,       3, 1)  # 셔츠와 자연스럽게

    # ─── 팔 ───
    # 왼팔
    px(img, ox+2, oy+11, sh_drk, 1, 5)
    px(img, ox+3, oy+11, sh_main,1, 5)
    # 오른팔
    px(img, ox+12,oy+11, sh_main,1, 5)
    px(img, ox+13,oy+11, sh_drk, 1, 5)
    # 손
    px(img, ox+2, oy+15, sk_mid, 2, 2)
    px(img, ox+12,oy+15, sk_mid, 2, 2)

    # 벨트라인
    px(img, ox+3, oy+17, shade(sh_drk, 0.7), 9, 1)


def draw_legs_front(img, ox, oy, pants, shoe, walk_phase=0):
    """정면 다리 (y=18~31) — walk_phase: 0=idle, 1=L forward, 2=R forward"""
    pt_lit, pt_main, pt_drk = pants
    sh_c = shoe

    base_y = oy + 18

    # 바지 상단 (같이 붙어있는 부분)
    px(img, ox+3, base_y+0, pt_main, 9, 2)
    px(img, ox+4, base_y+0, pt_lit,  1, 2)

    if walk_phase == 0:  # 아이들
        # 왼발 y=20~29, x=3-6
        px(img, ox+3, base_y+2, pt_main, 4, 8)
        px(img, ox+4, base_y+2, pt_lit,  1, 8)
        px(img, ox+6, base_y+2, pt_drk,  1, 8)
        # 오른발 y=20~29, x=8-11
        px(img, ox+8, base_y+2, pt_main, 4, 8)
        px(img, ox+9, base_y+2, pt_lit,  1, 8)
        px(img, ox+11,base_y+2, pt_drk,  1, 8)
        # 왼쪽 신발
        px(img, ox+2, base_y+10, sh_c, 5, 2)
        px(img, ox+3, base_y+11, sh_c, 5, 1)  # 앞코
        # 오른쪽 신발
        px(img, ox+8, base_y+10, sh_c, 5, 2)
        px(img, ox+9, base_y+11, sh_c, 5, 1)

    elif walk_phase == 1:  # 왼발 앞
        # 왼발 (앞으로 나옴, 1px 낮게)
        px(img, ox+2, base_y+2, pt_main, 4, 8)
        px(img, ox+3, base_y+2, pt_lit,  1, 8)
        px(img, ox+5, base_y+2, pt_drk,  1, 8)
        px(img, ox+1, base_y+10, sh_c, 6, 2)
        px(img, ox+2, base_y+11, sh_c, 5, 1)

        # 오른발 (뒤로, 1px 높게)
        px(img, ox+9, base_y+1, pt_main, 4, 8)
        px(img, ox+10,base_y+1, pt_lit,  1, 8)
        px(img, ox+12,base_y+1, pt_drk,  1, 8)
        px(img, ox+9, base_y+9, sh_c, 4, 2)

    elif walk_phase == 2:  # 오른발 앞
        # 왼발 (뒤로, 1px 높게)
        px(img, ox+3, base_y+1, pt_main, 4, 8)
        px(img, ox+4, base_y+1, pt_lit,  1, 8)
        px(img, ox+6, base_y+1, pt_drk,  1, 8)
        px(img, ox+3, base_y+9, sh_c, 4, 2)

        # 오른발 (앞으로 나옴)
        px(img, ox+9, base_y+2, pt_main, 4, 8)
        px(img, ox+10,base_y+2, pt_lit,  1, 8)
        px(img, ox+12,base_y+2, pt_drk,  1, 8)
        px(img, ox+9, base_y+10, sh_c, 6, 2)
        px(img, ox+10,base_y+11, sh_c, 5, 1)

    elif walk_phase == 3:  # 중간 bob
        # 양발이 약간 벌어짐
        px(img, ox+3, base_y+2, pt_main, 4, 8)
        px(img, ox+4, base_y+2, pt_lit,  1, 8)
        px(img, ox+6, base_y+2, pt_drk,  1, 8)
        px(img, ox+8, base_y+2, pt_main, 4, 8)
        px(img, ox+9, base_y+2, pt_lit,  1, 8)
        px(img, ox+11,base_y+2, pt_drk,  1, 8)
        px(img, ox+2, base_y+10, sh_c, 5, 2)
        px(img, ox+8, base_y+10, sh_c, 5, 2)


def draw_full_front(img, ox, oy, skin, hair, shirt, pants, shoe,
                    is_female=False, is_suit=False, has_tie=False, walk_phase=0):
    draw_head_front(img, ox, oy, skin, hair, is_female)
    draw_neck_body_front(img, ox, oy, skin, shirt, is_suit, has_tie)
    draw_legs_front(img, ox, oy, pants, shoe, walk_phase)


# ─────────────────────────────────
# 사이드 뷰 (프로파일)
# ─────────────────────────────────

def draw_side(img, ox, oy, skin, hair, shirt, pants, shoe,
              facing_right=True, walk_phase=0, is_female=False):
    """옆면 캐릭터 — 프로파일 실루엣"""
    sk_lit, sk_mid, sk_drk = skin
    hr_main, hr_shd, hr_hi = hair
    sh_lit, sh_main, sh_drk = shirt
    pt_lit, pt_main, pt_drk = pants
    sh_c = shoe

    # 방향에 따라 미러
    def X(x):
        if facing_right:
            return ox + x
        else:
            return ox + (15 - x)

    # ─── 머리 (사이드) ───
    # 두상 top
    px(img, X(4), oy+0, hr_hi,  1, 1)
    px(img, X(5), oy+0, hr_main,5, 1)
    px(img, X(4), oy+1, hr_main,6, 1)
    px(img, X(3), oy+2, hr_shd, 1, 4)   # 뒤통수 그림자
    px(img, X(4), oy+2, hr_main,3, 4)   # 머리 옆면
    if is_female:
        # 앞머리
        px(img, X(7), oy+2, hr_main,1, 3)
        for dy in range(5):
            px(img, X(3), oy+3+dy, hr_shd, 1, 1)
            px(img, X(4), oy+3+dy, hr_main,2, 1)

    # ─── 얼굴 (사이드) ───
    # 이마
    px(img, X(7), oy+2, sk_lit, 3, 1)
    px(img, X(7), oy+3, sk_lit, 3, 1)
    # 눈
    px(img, X(9), oy+3, (28,22,35), 1, 1)   # 동공
    px(img, X(8), oy+3, (240,240,240),1,1)  # 흰자
    # 코 (1픽셀 돌출)
    px(img, X(7), oy+4, sk_mid, 3, 1)
    px(img, X(10),oy+5, sk_drk, 1, 1)  # 코 끝 돌출
    # 입
    px(img, X(7), oy+5, sk_mid, 3, 1)
    px(img, X(9), oy+6, (195,120,110),1,1)  # 입술
    # 턱
    px(img, X(7), oy+6, sk_mid, 3, 1)
    px(img, X(7), oy+7, sk_mid, 2, 1)
    # 귀
    px(img, X(4), oy+4, sk_mid, 1, 2)

    # ─── 목 ───
    px(img, X(7), oy+8, sk_mid, 2, 2)

    # ─── 몸통 (사이드, 좁음) ───
    px(img, X(5), oy+10, sh_main, 5, 8)
    px(img, X(6), oy+10, sh_lit,  1, 7)
    px(img, X+9, oy+10, sh_drk, 1, 7) if callable(X) else None
    # 팔 (앞쪽만 보임)
    arm_x = 10 if facing_right else 5
    px(img, ox+arm_x, oy+11, sh_drk, 1, 5)
    px(img, ox+arm_x, oy+15, sk_mid, 1, 2)

    # ─── 다리 (사이드) ───
    base_y = oy + 18
    if walk_phase == 0:
        # 양발 겹쳐보임 (사이드이므로 앞발만 확실히)
        px(img, X(5), base_y+0, pt_main, 4, 10)
        px(img, X(6), base_y+0, pt_lit,  1, 10)
        px(img, X(4), base_y+10, sh_c, 6, 2)
    elif walk_phase == 1:  # 앞발 나옴
        # 앞발 (더 앞)
        px(img, X(4), base_y+0, pt_main, 4, 10)
        px(img, X(5), base_y+0, pt_lit,  1, 10)
        px(img, X(3), base_y+10, sh_c, 6, 2)
        px(img, X(4), base_y+11, sh_c, 5, 1)
        # 뒷발 (살짝 보임, 1px 위)
        px(img, X(6), base_y-1, pt_drk, 3, 9)
        px(img, X(6), base_y+8, shade(sh_c,0.7), 4, 1)
    elif walk_phase == 2:  # 반대
        # 앞발
        px(img, X(6), base_y+0, pt_main, 4, 10)
        px(img, X(7), base_y+0, pt_lit,  1, 10)
        px(img, X(6), base_y+10, sh_c, 5, 2)
        # 뒷발
        px(img, X(4), base_y-1, pt_drk, 3, 9)
        px(img, X(3), base_y+8, shade(sh_c,0.7), 4, 1)
    elif walk_phase == 3:
        px(img, X(5), base_y+0, pt_main, 4, 10)
        px(img, X(6), base_y+0, pt_lit,  1, 10)
        px(img, X(4), base_y+10, sh_c, 6, 2)


def X_flip(ox, x, facing_right):
    if facing_right:
        return ox + x
    return ox + (15 - x)


def draw_side_right(img, ox, oy, skin, hair, shirt, pants, shoe,
                    walk_phase=0, is_female=False):
    """오른쪽 향하는 사이드 뷰 — 명시적 좌표 (버그 없음)"""
    sk_lit, sk_mid, sk_drk = skin
    hr_main, hr_shd, hr_hi = hair
    sh_lit, sh_main, sh_drk = shirt
    pt_lit, pt_main, pt_drk = pants
    sh_c = shoe

    # ─── 머리카락 (오른쪽 향함: 얼굴이 오른쪽) ───
    # 뒤통수 왼쪽
    px(img, ox+2, oy+0, hr_shd, 1, 1)
    px(img, ox+3, oy+0, hr_hi,  3, 1)
    px(img, ox+6, oy+0, hr_main,3, 1)
    px(img, ox+2, oy+1, hr_shd, 1, 1)
    px(img, ox+3, oy+1, hr_main,6, 1)
    for dy in range(5):
        px(img, ox+2, oy+2+dy, hr_shd,  1, 1)
        px(img, ox+3, oy+2+dy, hr_main, 3, 1)
    if is_female:
        # 앞머리 (오른쪽 = 앞)
        px(img, ox+7, oy+2, hr_main, 1, 1)
        px(img, ox+7, oy+3, hr_main, 1, 1)
        # 긴 뒷머리
        for dy in range(4):
            px(img, ox+2, oy+5+dy, hr_shd,  1, 1)
            px(img, ox+3, oy+5+dy, hr_main, 2, 1)

    # ─── 얼굴 (오른쪽 향함) ───
    px(img, ox+6, oy+2, sk_lit, 3, 1)   # 이마
    px(img, ox+6, oy+3, sk_lit, 3, 1)
    # 눈
    px(img, ox+7, oy+4, (245,245,245), 1, 1)  # 흰자
    px(img, ox+8, oy+4, (28,22,35),    1, 1)  # 동공
    if is_female:
        px(img, ox+8, oy+3, (20,15,25), 2, 1)   # 속눈썹
    px(img, ox+6, oy+4, sk_mid, 2, 1)
    # 코 (오른쪽 돌출)
    px(img, ox+9, oy+5, sk_drk, 1, 1)
    px(img, ox+6, oy+5, sk_mid, 3, 1)
    # 입
    px(img, ox+6, oy+6, sk_mid, 3, 1)
    px(img, ox+8, oy+6, (190,115,105), 1, 1)
    # 턱
    px(img, ox+6, oy+7, sk_mid, 2, 1)
    # 귀 (왼쪽 = 보이는 쪽)
    px(img, ox+3, oy+4, sk_mid, 1, 2)

    # ─── 목 ───
    px(img, ox+5, oy+8, sk_mid, 3, 2)

    # ─── 몸통 (사이드, 오른 향함) ───
    # x=3~9 범위 (7px 넓이)
    for dy in range(8):
        px(img, ox+3, oy+10+dy, sh_drk,  1, 1)   # 좌(뒤) 그림자
        px(img, ox+4, oy+10+dy, sh_main, 4, 1)   # 몸통 메인
        px(img, ox+5, oy+10+dy, sh_lit,  1, 1)   # 하이라이트
        px(img, ox+8, oy+10+dy, sh_drk,  1, 1)   # 우(앞) 그림자
    # 칼라
    px(img, ox+5, oy+9, (240,238,232), 3, 2)

    # 팔 (앞쪽: 오른쪽 x=9)
    px(img, ox+9,  oy+11, sh_drk, 1, 5)
    px(img, ox+10, oy+11, sh_drk, 1, 5)
    px(img, ox+9,  oy+16, sk_mid, 2, 2)
    # 뒷팔 흔적 (살짝)
    px(img, ox+2,  oy+12, sh_drk, 1, 3)
    px(img, ox+2,  oy+15, sk_mid, 1, 2)

    # ─── 허리/벨트 ───
    px(img, ox+3, oy+17, shade(sh_drk, 0.7), 6, 1)

    # ─── 다리 (사이드 워크) ───
    base_y = oy + 18
    # 허벅지 연결
    px(img, ox+3, base_y+0, pt_main, 6, 2)
    px(img, ox+4, base_y+0, pt_lit,  1, 2)

    if walk_phase == 0:  # 아이들 — 양발 겹침
        px(img, ox+3, base_y+2, pt_main, 6, 8)
        px(img, ox+4, base_y+2, pt_lit,  1, 8)
        px(img, ox+8, base_y+2, pt_drk,  1, 8)
        px(img, ox+2, base_y+10, sh_c, 7, 2)
        px(img, ox+3, base_y+11, sh_c, 6, 1)

    elif walk_phase == 1:  # 앞발(오른) 내딛음
        # 앞발 (x=4~9, y 아래)
        px(img, ox+4, base_y+2, pt_main, 5, 8)
        px(img, ox+5, base_y+2, pt_lit,  1, 8)
        px(img, ox+9, base_y+2, pt_drk,  1, 8)
        px(img, ox+4, base_y+10, sh_c, 6, 2)
        px(img, ox+5, base_y+11, sh_c, 6, 1)
        # 뒷발 (x=2~5, y 위)
        px(img, ox+2, base_y+0, shade(pt_main,0.75), 4, 8)
        px(img, ox+2, base_y+8, shade(sh_c,0.65), 5, 1)

    elif walk_phase == 2:  # 뒷발(왼) 내딛음
        # 앞발 (뒤에 있음)
        px(img, ox+5, base_y+2, pt_main, 5, 8)
        px(img, ox+6, base_y+2, pt_lit,  1, 8)
        px(img, ox+10,base_y+2, pt_drk,  1, 8)
        px(img, ox+5, base_y+10, sh_c, 6, 2)
        px(img, ox+6, base_y+11, sh_c, 5, 1)
        # 뒷발 (앞쪽에 보임)
        px(img, ox+2, base_y+0, shade(pt_main,0.75), 4, 8)
        px(img, ox+2, base_y+8, shade(sh_c,0.65), 4, 1)

    elif walk_phase == 3:  # 중간 bob
        px(img, ox+3, base_y+2, pt_main, 6, 8)
        px(img, ox+4, base_y+2, pt_lit,  1, 8)
        px(img, ox+2, base_y+10, sh_c, 7, 2)


def draw_side_v2(img, ox, oy, skin, hair, shirt, pants, shoe,
                 facing_right=True, walk_phase=0, is_female=False):
    """사이드 뷰 — 오른쪽 그린 후 필요시 좌우 플립"""
    # 임시 16x32 프레임에 그리기
    frame = Image.new("RGBA", (16, 32), (0, 0, 0, 0))
    draw_side_right(frame, 0, 0, skin, hair, shirt, pants, shoe,
                    walk_phase=walk_phase, is_female=is_female)
    # 왼쪽 향할 때 플립
    if not facing_right:
        frame = frame.transpose(Image.FLIP_LEFT_RIGHT)
    img.paste(frame, (ox, oy), frame)


# ─────────────────────────────────
# 백 뷰
# ─────────────────────────────────

def draw_back(img, ox, oy, skin, hair, shirt, pants, shoe,
              walk_phase=0, is_female=False):
    """뒷면 캐릭터"""
    sk_lit, sk_mid, sk_drk = skin
    hr_main, hr_shd, hr_hi = hair
    sh_lit, sh_main, sh_drk = shirt
    pt_lit, pt_main, pt_drk = pants
    sh_c = shoe

    # ─── 뒤통수 ───
    px(img, ox+3, oy+0, hr_shd, 1, 1)
    px(img, ox+4, oy+0, hr_hi,  3, 1)
    px(img, ox+7, oy+0, hr_main,3, 1)
    px(img, ox+10,oy+0, hr_shd, 2, 1)

    px(img, ox+2, oy+1, hr_shd, 2, 1)
    px(img, ox+4, oy+1, hr_main,7, 1)
    px(img, ox+11,oy+1, hr_shd, 2, 1)

    for dy in range(7):
        px(img, ox+2, oy+2+dy, hr_shd, 1, 1)
        px(img, ox+3, oy+2+dy, hr_main,7, 1)
        px(img, ox+10,oy+2+dy, hr_main,1, 1)
        px(img, ox+11,oy+2+dy, hr_shd, 1, 1)

    if is_female:
        # 긴 뒷머리
        for dy in range(4):
            px(img, ox+2, oy+5+dy, hr_shd,  1, 1)
            px(img, ox+3, oy+5+dy, hr_main, 7, 1)
            px(img, ox+10,oy+5+dy, hr_main, 1, 1)
            px(img, ox+11,oy+5+dy, hr_shd,  1, 1)

    # 뒷목
    px(img, ox+6, oy+8, sk_mid, 3, 2)

    # ─── 등 (셔츠 뒷면) ───
    for dy in range(8):
        px(img, ox+3, oy+10+dy, sh_drk,  1, 1)  # 좌 그림자
        px(img, ox+4, oy+10+dy, shade(sh_main,0.95), 7, 1)
        px(img, ox+11,oy+10+dy, sh_drk,  1, 1)  # 우 그림자
    px(img, ox+5, oy+9, (220,218,212), 5, 2)  # 칼라 뒷면

    # 팔 (뒷면, 양쪽)
    px(img, ox+2, oy+11, sh_drk, 1, 5)
    px(img, ox+3, oy+11, sh_main,1, 5)
    px(img, ox+12,oy+11, sh_main,1, 5)
    px(img, ox+13,oy+11, sh_drk, 1, 5)
    px(img, ox+2, oy+15, sk_mid, 2, 2)
    px(img, ox+12,oy+15, sk_mid, 2, 2)

    # ─── 다리 뒷면 ───
    base_y = oy + 18
    px(img, ox+3, base_y+0, shade(pt_main,0.9), 9, 2)

    if walk_phase == 0:
        px(img, ox+3, base_y+2, pt_main, 4, 8)
        px(img, ox+4, base_y+2, pt_lit,  1, 8)
        px(img, ox+6, base_y+2, pt_drk,  1, 8)
        px(img, ox+8, base_y+2, pt_main, 4, 8)
        px(img, ox+9, base_y+2, pt_lit,  1, 8)
        px(img, ox+11,base_y+2, pt_drk,  1, 8)
        px(img, ox+2, base_y+10, sh_c, 5, 2)
        px(img, ox+8, base_y+10, sh_c, 5, 2)
    elif walk_phase == 1:
        # 왼발 앞
        px(img, ox+2, base_y+2, pt_main, 4, 8)
        px(img, ox+3, base_y+2, pt_lit,  1, 8)
        px(img, ox+1, base_y+10, sh_c, 5, 2)
        # 오른발 뒤
        px(img, ox+9, base_y+1, pt_main, 4, 8)
        px(img, ox+10,base_y+1, pt_lit,  1, 8)
        px(img, ox+9, base_y+9, sh_c, 4, 1)
    elif walk_phase == 2:
        # 오른발 앞
        px(img, ox+3, base_y+1, pt_main, 4, 8)
        px(img, ox+4, base_y+1, pt_lit,  1, 8)
        px(img, ox+3, base_y+9, sh_c, 4, 1)
        # 왼발 뒤
        px(img, ox+9, base_y+2, pt_main, 4, 8)
        px(img, ox+10,base_y+2, pt_lit,  1, 8)
        px(img, ox+9, base_y+10, sh_c, 5, 2)
    elif walk_phase == 3:
        px(img, ox+3, base_y+2, pt_main, 4, 8)
        px(img, ox+8, base_y+2, pt_main, 4, 8)
        px(img, ox+2, base_y+10, sh_c, 5, 2)
        px(img, ox+8, base_y+10, sh_c, 5, 2)


# ═══════════════════════════════════════
# 캐릭터 스프라이트시트 조합
# ═══════════════════════════════════════

"""
스프라이트시트 레이아웃 (112x192 = 7cols x 6rows, 16x32 each):
  Row 0 (y=  0): Front  — [idle, L, N, R, idle2, L, N]  (7 frames)
  Row 1 (y= 32): Left   — [idle, L, N, R, idle2, L, N]
  Row 2 (y= 64): Right  — [idle, L, N, R, idle2, L, N]
  Row 3 (y= 96): Back   — [idle, L, N, R, idle2, L, N]
  Row 4 (y=128): front sit/special
  Row 5 (y=160): back sit/special
"""

WALK_PHASES = [0, 1, 3, 2, 0, 1, 3]  # 7 frames: idle-L-mid-R-idle-L-mid


def gen_character_sheet(name, skin_i, hair_i, shirt_i, pants_i, shoe_c,
                        is_female=False, is_suit=False, has_tie=False):
    skin  = SKIN_TONES[skin_i % len(SKIN_TONES)]
    hair  = HAIR_COLORS[hair_i % len(HAIR_COLORS)]
    shirt = SHIRT_COLORS[shirt_i % len(SHIRT_COLORS)]
    pants = PANTS_COLORS[pants_i % len(PANTS_COLORS)]
    shoe  = shoe_c

    img = Image.new("RGBA", (112, 192), (0, 0, 0, 0))

    # Row 0: 정면 워크
    for col, phase in enumerate(WALK_PHASES):
        draw_full_front(img, col*16, 0, skin, hair, shirt, pants, shoe,
                        is_female=is_female, is_suit=is_suit, has_tie=has_tie,
                        walk_phase=phase)

    # Row 1: 왼쪽 워크
    for col, phase in enumerate(WALK_PHASES):
        draw_side_v2(img, col*16, 32, skin, hair, shirt, pants, shoe,
                     facing_right=False, walk_phase=phase, is_female=is_female)

    # Row 2: 오른쪽 워크
    for col, phase in enumerate(WALK_PHASES):
        draw_side_v2(img, col*16, 64, skin, hair, shirt, pants, shoe,
                     facing_right=True, walk_phase=phase, is_female=is_female)

    # Row 3: 뒷면 워크
    for col, phase in enumerate(WALK_PHASES):
        draw_back(img, col*16, 96, skin, hair, shirt, pants, shoe,
                  walk_phase=phase, is_female=is_female)

    # Row 4: 앞면 앉기/특수
    draw_full_front(img, 0, 128, skin, hair, shirt, pants, shoe,
                    is_female=is_female, is_suit=is_suit, has_tie=has_tie,
                    walk_phase=0)
    # 앉기 변형 (다리 구부림 시뮬)
    for col in range(1, 7):
        draw_full_front(img, col*16, 128, skin, hair, shirt, pants, shoe,
                        is_female=is_female, is_suit=is_suit, has_tie=has_tie,
                        walk_phase=col % 4)

    # Row 5: 뒷면 앉기/특수
    for col in range(7):
        draw_back(img, col*16, 160, skin, hair, shirt, pants, shoe,
                  walk_phase=col % 4, is_female=is_female)

    out_dir = OUT_CHARS
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{name}.png"
    img.save(path, "PNG")
    print(f"  ✅ {name}.png ({img.width}×{img.height})")
    return img


def generate_characters():
    print("=== 캐릭터 V2 생성 ===")

    shoes_dark  = (35, 30, 28)
    shoes_brown = (62, 42, 28)
    shoes_black = (20, 18, 22)

    chars = [
        # name,              sk, hr, sh,  pt, shoe,        female, suit, tie
        ("office_man_1",      0,  0,  0,   0, shoes_dark,  False, False, False),
        ("office_man_2",      1,  1,  1,   1, shoes_brown, False, False, False),
        ("office_woman_1",    0,  2,  2,   3, shoes_black, True,  False, False),
        ("office_woman_2",    1,  4,  6,   0, shoes_dark,  True,  False, False),
        ("casual_1",          0,  1,  4,   2, shoes_brown, False, False, False),
        ("casual_2",          2,  0,  3,   1, shoes_black, False, False, False),
        ("suit_1",            0,  0,  7,   1, shoes_black, False, True,  True),
        ("suit_2",            1,  3,  7,   1, shoes_black, False, True,  True),
    ]

    for c in chars:
        name, sk, hr, sh, pt, shoe, is_f, is_s, has_t = c
        gen_character_sheet(name, sk, hr, sh, pt, shoe, is_f, is_s, has_t)

    print(f"\n✅ 캐릭터 {len(chars)}종 → {OUT_CHARS}")


# ═══════════════════════════════════════
# 기술적 버그 수정
# ═══════════════════════════════════════

def fix_technical_issues():
    print("=== 기술적 버그 수정 ===")

    # 1. characters.png 마젠타 → 투명
    char_sheet = ASSETS / "characters.png"
    if char_sheet.exists():
        img = Image.open(char_sheet).convert("RGBA")
        data = img.load()
        count = 0
        for y in range(img.height):
            for x in range(img.width):
                r, g, b, a = data[x, y]
                # 마젠타 계열 (R>200, G<50, B>200)
                if r > 180 and g < 80 and b > 180:
                    data[x, y] = (0, 0, 0, 0)
                    count += 1
        img.save(char_sheet, "PNG")
        print(f"  ✅ characters.png 마젠타→투명 ({count}px 처리)")
    else:
        print(f"  ⚠️  characters.png 없음")

    # 2. floor_*.png 팔레트(P)/RGB → RGBA
    floors_dir = ASSETS / "floors"
    if floors_dir.exists():
        fixed = 0
        for f in floors_dir.glob("*.png"):
            img = Image.open(f)
            if img.mode != "RGBA":
                img = img.convert("RGBA")
                img.save(f, "PNG")
                fixed += 1
        print(f"  ✅ floors/ 모드 수정 ({fixed}개 → RGBA)")

    # 3. walls/wall_0.png RGB → RGBA
    wall = ASSETS / "walls" / "wall_0.png"
    if wall.exists():
        img = Image.open(wall)
        if img.mode != "RGBA":
            img.convert("RGBA").save(wall, "PNG")
            print(f"  ✅ wall_0.png RGB→RGBA")
        else:
            print(f"  ✓  wall_0.png 이미 RGBA")

    # 4. char_4.png, char_5.png 완성 (96→192px)
    for char_name in ["char_4", "char_5"]:
        char_path = ASSETS / f"{char_name}.png"
        if char_path.exists():
            img = Image.open(char_path).convert("RGBA")
            if img.height < 192:
                new_img = Image.new("RGBA", (112, 192), (0, 0, 0, 0))
                new_img.paste(img, (0, 0))
                # 누락된 row 4~5 채우기: row 0과 row 1 복사해서 변형
                row0 = img.crop((0, 0, 112, 32))
                row1 = img.crop((0, 32, 112, 64)) if img.height > 32 else row0
                new_img.paste(row0, (0, 128))  # row 4
                new_img.paste(row1, (0, 160))  # row 5
                new_img.save(char_path, "PNG")
                print(f"  ✅ {char_name}.png 96→192px 완성")
            else:
                print(f"  ✓  {char_name}.png 이미 완전함")

    # 5. fullbody_chars.png, female/male_fullbody.png 팔레트 → RGBA
    for fname in ["fullbody_chars.png", "female_fullbody.png", "male_fullbody.png"]:
        fp = ASSETS / fname
        if fp.exists():
            img = Image.open(fp)
            if img.mode == "P":
                img.convert("RGBA").save(fp, "PNG")
                print(f"  ✅ {fname} P→RGBA")

    print()


# ═══════════════════════════════════════
# 건물 V2 (개선판)
# ═══════════════════════════════════════

WALL_COLORS_V2 = [
    ((138, 148, 162), (118, 128, 142), (98, 108, 122)),   # 회청
    ((162, 148, 125), (142, 128, 105), (120, 108, 88)),   # 베이지
    ((125, 140, 152), (105, 120, 132), (85, 100, 112)),   # 청회
    ((152, 135, 132), (132, 115, 112), (110, 95, 92)),    # 분홍회
]

ROOF_COLORS_V2 = [
    ((105, 72, 55), (82, 56, 42), (62, 40, 30)),    # 갈색
    ((72, 88, 105), (56, 70, 85), (40, 52, 68)),    # 청색
    ((88, 68, 85),  (68, 52, 65), (50, 38, 50)),    # 보라
]


def px_b(img, x, y, color, w=1, h=1):
    """건물용 px (알파 없음)"""
    for dy in range(h):
        for dx in range(w):
            if 0 <= x+dx < img.width and 0 <= y+dy < img.height:
                c = color if len(color) == 4 else color + (255,)
                img.putpixel((x+dx, y+dy), c)


def draw_window_v2(img, wx, wy, lit=False, has_curtain=False):
    """창문 V2 — 더 디테일한 창틀"""
    frame = (72, 72, 82)
    glass = (148, 195, 228) if not lit else (255, 228, 145)

    # 외부 창틀 (10x12)
    px_b(img, wx,    wy,    frame, 10, 1)   # 위
    px_b(img, wx,    wy+11, frame, 10, 1)   # 아래
    px_b(img, wx,    wy,    frame, 1, 12)   # 좌
    px_b(img, wx+9,  wy,    frame, 1, 12)   # 우
    # 내부 십자 칸막이
    px_b(img, wx+4,  wy,    frame, 1, 12)   # 세로 중간
    px_b(img, wx,    wy+5,  frame, 10, 1)   # 가로 중간

    # 유리 (4칸)
    for gx in [1, 5]:
        for gy in [1, 6]:
            w2 = 3
            h2 = 4 if gy == 1 else 5
            px_b(img, wx+gx, wy+gy, glass, w2, h2)
            # 유리 반사 (좌상단 밝게)
            px_b(img, wx+gx, wy+gy, hi(glass[:3])+(200,), 1, 2)

    # 커튼 (옵션)
    if has_curtain:
        curtain = (200, 155, 130)
        px_b(img, wx+1, wy+1, curtain, 1, 9)
        px_b(img, wx+8, wy+1, curtain, 1, 9)


def gen_building_v2(name, width, height, floors, wall_idx, roof_idx, has_sign=False):
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    w_lit, w_main, w_drk = WALL_COLORS_V2[wall_idx]
    r_lit, r_main, r_drk = ROOF_COLORS_V2[roof_idx]
    floor_h = max(1, (height - 20) // max(floors, 1))

    # ─── 벽 ───
    for y in range(20, height):
        for x in range(width):
            if x == 0:
                c = w_drk
            elif x == width-1:
                c = w_drk
            elif x == 1 or x == width-2:
                c = w_main
            else:
                c = w_lit
            px_b(img, x, y, c)

    # 층 구분선
    for f in range(floors - 1):
        line_y = 20 + (f+1) * floor_h
        if line_y < height:
            px_b(img, 1, line_y, shade(w_main), width-2, 1)

    # ─── 창문 ───
    for f in range(floors):
        base_y = 20 + f * floor_h + 4
        win_count = max(1, (width - 16) // 22)
        if win_count == 0:
            win_count = 1
        spacing = (width - 10) // (win_count + 1)

        for w in range(win_count):
            wx = 5 + spacing * (w + 1) - 5
            wy = base_y
            lit = (f + w) % 3 == 0
            curtain = w % 2 == 0
            if wy + 12 < height - 12:
                draw_window_v2(img, wx, wy, lit=lit, has_curtain=curtain)

    # ─── 지붕 ───
    for y in range(20):
        for x in range(width):
            # 경사 지붕 (사다리꼴)
            inset = max(0, (8 - y) * width // 24)
            if x < inset or x >= width - inset:
                continue
            if y < 3:
                c = r_drk
            elif y < 6:
                c = r_main
            else:
                c = r_lit
            px_b(img, x, y, c)
    # 지붕 하이라이트 (능선)
    px_b(img, width//3, 3, hi(r_lit[:3]), width//3, 1)

    # ─── 입구 ───
    door_x = width // 2 - 6
    door_y = height - 20
    # 문틀
    px_b(img, door_x,   door_y, (55, 52, 48), 12, 20)
    px_b(img, door_x+1, door_y+1, (38, 32, 28), 10, 18)
    # 계단
    px_b(img, door_x-2, height-4, w_main, 16, 4)
    px_b(img, door_x-4, height-2, w_main, 20, 2)
    # 문 손잡이
    px_b(img, door_x+9, door_y+9, (185, 162, 88), 2, 3)

    # ─── 간판 ───
    if has_sign:
        sx = width // 2 - 15
        sy = 22
        sw = min(30, width - sx - 4)
        px_b(img, sx, sy, (38, 38, 52), sw, 10)
        px_b(img, sx+1, sy+1, (48, 48, 65), sw-2, 8)
        # 간판 테두리
        px_b(img, sx, sy, (88, 85, 108), sw, 1)
        px_b(img, sx, sy+9, (88, 85, 108), sw, 1)

    # ─── 그림자 (바닥) ───
    px_b(img, 2, height-1, (0,0,0,30), width-4, 1)

    return img


def generate_buildings():
    print("=== 건물 V2 생성 ===")
    OUT_BUILDINGS.mkdir(parents=True, exist_ok=True)

    buildings = [
        ("main_1f",   64,  80, 1, 0, 0, True),
        ("main_2f",   64, 112, 2, 0, 0, True),
        ("main_3f",   64, 144, 3, 0, 0, True),
        ("shop_left",  48,  96, 2, 1, 1, False),
        ("shop_right", 48,  80, 2, 2, 2, False),
        ("apartment",  56, 128, 3, 3, 0, False),
        ("cafe",       48,  80, 1, 1, 2, True),
    ]

    for bld in buildings:
        name, w, h, floors, wall_i, roof_i, sign = bld
        img = gen_building_v2(name, w, h, floors, wall_i, roof_i, sign)
        path = OUT_BUILDINGS / f"{name}.png"
        img.save(path, "PNG")
        print(f"  ✅ {name} ({w}×{h}, {floors}F)")

    print(f"\n✅ 건물 {len(buildings)}종 → {OUT_BUILDINGS}")


# ═══════════════════════════════════════
# 메인
# ═══════════════════════════════════════

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "all"
    print("🔨 Pixel Forge V2 — 고품질 리마스터\n")

    if target in ("fix", "all"):
        fix_technical_issues()

    if target in ("chars", "all"):
        generate_characters()
        print()

    if target in ("buildings", "all"):
        generate_buildings()
        print()

    print(f"📁 출력: {ASSETS}")


if __name__ == "__main__":
    main()
