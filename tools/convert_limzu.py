#!/usr/bin/env python3
"""
LimeZu Modern Interiors 캐릭터 → 두근컴퍼니 게임 포맷 변환기 v2

LimeZu 실제 레이아웃 (확인됨):
  Idle row 0: col0=오른쪽, col1=뒤, col2=왼쪽, col3=정면(DOWN)
  Walk row 1: 오른쪽 걷기 (24프레임)
  Walk row 2: 왼쪽 걷기 (24프레임)
  Walk row 3: 뒤(UP) 걷기 (24프레임)
  Walk row 4: 왼뒤 걷기 (24프레임)
  Walk row 5: 오른쪽 변형 (12프레임)
  Walk row 6: 정면(DOWN) 걷기 (9프레임)

게임 출력 (7cols × 6rows, 16×32 프레임):
  Row 0: down(정면) idle + walk
  Row 1: left walk
  Row 2: right walk
  Row 3: up(뒤) walk
  Row 4: sit/typing
  Row 5: phone/extra
"""
from PIL import Image
from pathlib import Path

LIMZU_DIR = Path("/Users/600mac/Desktop/pixel_asset_refs/버킷리스트 타이쿤/Modern tiles_Free/Characters_free")
OUTPUT_DIR = Path("/Users/600mac/Developer/my-company/company-hq/ui/public/assets")

CHARACTERS = ["Adam", "Alex", "Amelia", "Bob"]

OUT_COLS = 7
OUT_ROWS = 6
FRAME_W = 16
FRAME_H = 32

# LimeZu 실제 방향 매핑 (확인됨)
IDLE_COL_DOWN = 3   # 정면
IDLE_COL_UP = 1     # 뒤
IDLE_COL_RIGHT = 0  # 오른쪽
IDLE_COL_LEFT = 2   # 왼쪽

WALK_ROW_DOWN = 6   # 정면 걷기 (9프레임)
WALK_ROW_LEFT = 3   # 왼쪽 걷기 (24프레임) — 얼굴 왼쪽 보임
WALK_ROW_RIGHT = 4  # 오른쪽 걷기 (24프레임) — 얼굴 오른쪽 보임
WALK_ROW_UP = 1     # 뒤 걷기 (24프레임)


def extract_frame(sheet: Image.Image, col: int, row: int) -> Image.Image:
    x = col * FRAME_W
    y = row * FRAME_H
    return sheet.crop((x, y, x + FRAME_W, y + FRAME_H))


def fill_walk_row(walk_sheet: Image.Image, output: Image.Image,
                  idle_col: int, walk_row: int, out_row: int, max_frames: int = 24):
    """idle + 걷기 프레임을 출력 row에 채움"""
    def paste(frame, oc, orow):
        x, y = oc * FRAME_W, orow * FRAME_H
        output.paste(frame, (x, y), frame)

    # col 0: idle
    idle = extract_frame(walk_sheet, idle_col, 0)
    paste(idle, 0, out_row)

    # col 1, 2: 걷기 핵심 프레임 (발 교차 포즈)
    # 9프레임이면 간격 좁게, 24프레임이면 넓게
    if max_frames <= 9:
        walk_indices = [1, 3]  # 9프레임용
        extra_indices = [5, 7, 8, 0]
    else:
        walk_indices = [3, 9]  # 24프레임용
        extra_indices = [6, 12, 18, 0]

    for i, wi in enumerate(walk_indices):
        wi = min(wi, max_frames - 1)
        paste(extract_frame(walk_sheet, wi, walk_row), i + 1, out_row)

    # col 3~6: 추가 프레임
    for i, wi in enumerate(extra_indices):
        if 3 + i >= OUT_COLS:
            break
        wi = min(wi, max_frames - 1)
        paste(extract_frame(walk_sheet, wi, walk_row), 3 + i, out_row)


def build_char_sheet(name: str) -> Image.Image:
    walk_path = LIMZU_DIR / f"{name}_16x16.png"
    sit_path = LIMZU_DIR / f"{name}_sit_16x16.png"
    phone_path = LIMZU_DIR / f"{name}_phone_16x16.png"

    walk_sheet = Image.open(walk_path).convert("RGBA")
    sit_sheet = Image.open(sit_path).convert("RGBA") if sit_path.exists() else None
    phone_sheet = Image.open(phone_path).convert("RGBA") if phone_path.exists() else None

    out_w = OUT_COLS * FRAME_W
    out_h = OUT_ROWS * FRAME_H
    output = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))

    def paste(frame, oc, orow):
        x, y = oc * FRAME_W, orow * FRAME_H
        output.paste(frame, (x, y), frame)

    # Row 0: 정면(DOWN) idle + walk
    fill_walk_row(walk_sheet, output, IDLE_COL_DOWN, WALK_ROW_DOWN, 0, max_frames=9)

    # Row 1: 왼쪽 walk
    fill_walk_row(walk_sheet, output, IDLE_COL_LEFT, WALK_ROW_LEFT, 1, max_frames=24)

    # Row 2: 오른쪽 walk
    fill_walk_row(walk_sheet, output, IDLE_COL_RIGHT, WALK_ROW_RIGHT, 2, max_frames=24)

    # Row 3: 뒤(UP) walk
    fill_walk_row(walk_sheet, output, IDLE_COL_UP, WALK_ROW_UP, 3, max_frames=24)

    # Row 4: Sit/Typing
    if sit_sheet:
        sit_cols = sit_sheet.size[0] // FRAME_W
        # sit sheet 방향: 보통 right, back, left, front 순
        # 정면 앉기를 찾아야 함 — sit sheet의 마지막 6프레임이 정면인 경우가 많음
        # 우선 첫 몇 프레임 사용 (조정 가능)
        for i in range(min(OUT_COLS, sit_cols)):
            paste(extract_frame(sit_sheet, i, 0), i, 4)
    else:
        paste(extract_frame(walk_sheet, IDLE_COL_DOWN, 0), 0, 4)

    # Row 5: Phone/Extra
    if phone_sheet:
        phone_cols = phone_sheet.size[0] // FRAME_W
        for i in range(min(OUT_COLS, phone_cols)):
            paste(extract_frame(phone_sheet, i, 0), i, 5)
    else:
        paste(extract_frame(walk_sheet, IDLE_COL_DOWN, 0), 0, 5)

    return output


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for i, name in enumerate(CHARACTERS):
        print(f"[{i}] {name} 변환 중...")
        try:
            sheet = build_char_sheet(name)
            out_path = OUTPUT_DIR / f"char_{i}.png"
            sheet.save(out_path, "PNG")
            print(f"  ✅ {out_path} ({sheet.size})")
        except Exception as e:
            print(f"  ❌ {e}")

    print(f"\n완료! 정면(DOWN)=idle_col3+walk_row6, 뒤(UP)=row3")


if __name__ == "__main__":
    main()
