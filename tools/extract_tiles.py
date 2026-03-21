#!/usr/bin/env python3
"""
LimeZu Interiors 타일셋에서 유용한 가구/소품 추출
16x16 타일 기준 좌표로 잘라서 개별 PNG로 저장
"""
from PIL import Image
from pathlib import Path

TILE = 16
TILESET = Path("/Users/600mac/Desktop/버킷리스트 타이쿤/Modern tiles_Free/Interiors_free/16x16/Interiors_free_16x16.png")
ROOM_BUILDER = Path("/Users/600mac/Desktop/버킷리스트 타이쿤/Modern tiles_Free/Interiors_free/16x16/Room_Builder_free_16x16.png")
OUTPUT = Path("/Users/600mac/Developer/my-company/company-hq/ui/public/assets/limzu")

# 추출할 에셋 정의: (이름, col, row, width_tiles, height_tiles)
# 타일셋 이미지를 16x16 그리드로 보고 좌표 지정
EXTRACTS = [
    # === Interiors_free_16x16.png ===
    # 상단 영역: 가전/인테리어
    ("fridge_big", 0, 0, 2, 3),        # 큰 냉장고
    ("fridge_small", 2, 0, 2, 3),      # 작은 냉장고
    ("sink", 4, 0, 2, 3),              # 싱크대
    ("shower", 8, 0, 2, 3),            # 샤워기

    # 침대 영역
    ("bed_single", 0, 3, 2, 3),        # 싱글 침대
    ("bed_double", 4, 3, 3, 3),        # 더블 침대

    # 테이블/의자
    ("table_wood_sm", 0, 6, 2, 2),     # 작은 나무 테이블
    ("table_wood_lg", 2, 6, 3, 2),     # 큰 나무 테이블

    # 책장 영역 (약 row 18-22 근처)
    ("bookshelf_tall", 0, 18, 2, 3),   # 큰 책장
    ("shelf_deco", 2, 18, 2, 2),       # 장식 선반

    # 소파 영역
    ("sofa_blue", 0, 41, 3, 2),        # 파란 소파
    ("sofa_purple", 4, 41, 3, 2),      # 보라 소파

    # 화분/식물
    ("plant_pot_1", 0, 46, 1, 1),      # 화분1
    ("plant_pot_2", 1, 46, 1, 1),      # 화분2
    ("plant_pot_3", 2, 46, 1, 1),      # 화분3
    ("plant_big", 10, 41, 2, 3),       # 큰 식물

    # 램프
    ("lamp_floor_1", 0, 50, 1, 2),     # 플로어 램프1
    ("lamp_desk", 2, 50, 1, 1),        # 데스크 램프

    # 자판기/키오스크 (하단부)
    ("vending_1", 0, 72, 2, 3),        # 자판기1
    ("vending_2", 2, 72, 2, 3),        # 자판기2

    # 커피테이블/작은 소품
    ("coffee_machine", 4, 72, 1, 2),   # 커피머신

    # 소파 (하단 영역)
    ("couch_gray", 0, 78, 3, 2),       # 회색 소파
    ("couch_brown", 4, 78, 3, 2),      # 갈색 소파

    # 책장 (하단)
    ("bookcase_large", 8, 78, 3, 3),   # 대형 책장
]

# Room_Builder에서 추출할 바닥/벽 타일
ROOM_EXTRACTS = [
    ("floor_wood_1", 0, 5, 1, 1),     # 나무바닥1
    ("floor_wood_2", 1, 5, 1, 1),     # 나무바닥2
    ("floor_tile_1", 8, 5, 1, 1),     # 타일바닥1
    ("floor_marble", 8, 7, 1, 1),     # 대리석 바닥
    ("wall_white", 0, 2, 1, 1),       # 흰벽
    ("wall_cream", 1, 2, 1, 1),       # 크림벽
    ("wall_blue", 2, 2, 1, 1),        # 파란벽
]


def extract(src: Image.Image, name: str, col: int, row: int, w: int, h: int, output_dir: Path):
    """타일 좌표로 영역을 추출하여 PNG로 저장"""
    x1 = col * TILE
    y1 = row * TILE
    x2 = x1 + w * TILE
    y2 = y1 + h * TILE

    # 범위 체크
    if x2 > src.size[0] or y2 > src.size[1]:
        print(f"  ⚠️  {name}: 범위 초과 ({x2}>{src.size[0]} or {y2}>{src.size[1]}), 건너뜀")
        return False

    tile = src.crop((x1, y1, x2, y2))

    # 완전 투명이면 건너뜀
    if tile.mode == "RGBA":
        alpha_data = tile.split()[3]
        if alpha_data.getextrema() == (0, 0):
            print(f"  ⚠️  {name}: 완전 투명, 건너뜀")
            return False

    out_path = output_dir / f"{name}.png"
    tile.save(out_path, "PNG")
    print(f"  ✅ {name}: {w*TILE}×{h*TILE}px → {out_path.name}")
    return True


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)

    # Interiors 타일셋에서 추출
    print("=== Interiors 타일셋 추출 ===")
    tileset = Image.open(TILESET).convert("RGBA")
    print(f"타일셋 크기: {tileset.size}")

    ok, skip = 0, 0
    for name, col, row, w, h in EXTRACTS:
        if extract(tileset, name, col, row, w, h, OUTPUT):
            ok += 1
        else:
            skip += 1

    print(f"\nInteriors: {ok}개 추출, {skip}개 건너뜀")

    # Room Builder에서 바닥/벽 타일 추출
    print("\n=== Room Builder 타일 추출 ===")
    room = Image.open(ROOM_BUILDER).convert("RGBA")
    print(f"타일셋 크기: {room.size}")

    ok2, skip2 = 0, 0
    for name, col, row, w, h in ROOM_EXTRACTS:
        if extract(room, name, col, row, w, h, OUTPUT):
            ok2 += 1
        else:
            skip2 += 1

    print(f"\nRoom Builder: {ok2}개 추출, {skip2}개 건너뜀")
    print(f"\n총 {ok + ok2}개 에셋 → {OUTPUT}")


if __name__ == "__main__":
    main()
