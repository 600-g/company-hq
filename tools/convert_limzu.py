#!/usr/bin/env python3
"""
LimeZu Modern Interiors 캐릭터 → 두근컴퍼니 게임 포맷 변환기 v3
2× nearest-neighbor 업스케일 → 32×64 프레임 (고화질 픽셀아트)

LimeZu 실제 레이아웃 (확인됨):
  Idle row 0: col0=오른쪽, col1=뒤, col2=왼쪽, col3=정면(DOWN)
  Walk row 1: 오른쪽 걷기 (24프레임)
  Walk row 2: 왼쪽 걷기 (24프레임)
  Walk row 3: 뒤(UP) 걷기 (24프레임)
  Walk row 4: 왼뒤 걷기 (24프레임)
  Walk row 5: 오른쪽 변형 (12프레임)
  Walk row 6: 정면(DOWN) 걷기 (9프레임)

게임 출력 (7cols × 6rows, 32×64 프레임 — 2× 업스케일):
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

# 입력 프레임 크기 (LimeZu 원본)
IN_FRAME_W = 16
IN_FRAME_H = 32

# 출력 프레임 크기 (2× 업스케일)
SCALE = 2
FRAME_W = IN_FRAME_W * SCALE   # 32
FRAME_H = IN_FRAME_H * SCALE   # 64

# LimeZu 실제 방향 매핑 (확인됨)
IDLE_COL_DOWN  = 3   # 정면
IDLE_COL_UP    = 1   # 뒤
IDLE_COL_RIGHT = 0   # 오른쪽
IDLE_COL_LEFT  = 2   # 왼쪽

WALK_ROW_DOWN  = 6   # 정면 걷기 (9프레임)
WALK_ROW_LEFT  = 3   # 왼쪽 걷기 (24프레임) — 얼굴 왼쪽 보임
WALK_ROW_RIGHT = 4   # 오른쪽 걷기 (24프레임) — 얼굴 오른쪽 보임
WALK_ROW_UP    = 1   # 뒤 걷기 (24프레임)


def extract_frame(sheet: Image.Image, col: int, row: int) -> Image.Image:
    """LimeZu 원본에서 16×32 프레임 추출 후 2× 업스케일"""
    x = col * IN_FRAME_W
    y = row * IN_FRAME_H
    frame = sheet.crop((x, y, x + IN_FRAME_W, y + IN_FRAME_H))
    # nearest-neighbor 업스케일 → 선명한 픽셀아트 유지
    return frame.resize((FRAME_W, FRAME_H), Image.NEAREST)


def fill_walk_row(walk_sheet: Image.Image, output: Image.Image,
                  idle_col: int, walk_row: int, out_row: int, max_frames: int = 24):
    """idle + 걷기 프레임을 출력 row에 채움 (2× 업스케일 적용)"""
    def paste(frame, oc, orow):
        x, y = oc * FRAME_W, orow * FRAME_H
        output.paste(frame, (x, y), frame)

    # col 0: idle
    idle = extract_frame(walk_sheet, idle_col, 0)
    paste(idle, 0, out_row)

    # col 1, 2: 걷기 핵심 프레임 (발 교차 포즈)
    if max_frames <= 9:
        walk_indices = [1, 3]      # 9프레임용
        extra_indices = [5, 7, 8, 0]
    else:
        walk_indices = [3, 9]      # 24프레임용
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
    walk_path  = LIMZU_DIR / f"{name}_16x16.png"
    sit_path   = LIMZU_DIR / f"{name}_sit_16x16.png"
    phone_path = LIMZU_DIR / f"{name}_phone_16x16.png"

    walk_sheet  = Image.open(walk_path).convert("RGBA")
    sit_sheet   = Image.open(sit_path).convert("RGBA")  if sit_path.exists()   else None
    phone_sheet = Image.open(phone_path).convert("RGBA") if phone_path.exists() else None

    out_w = OUT_COLS * FRAME_W   # 7 * 32 = 224
    out_h = OUT_ROWS * FRAME_H   # 6 * 64 = 384
    output = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))

    def paste(frame, oc, orow):
        x, y = oc * FRAME_W, orow * FRAME_H
        output.paste(frame, (x, y), frame)

    # Row 0: 정면(DOWN) idle + walk
    fill_walk_row(walk_sheet, output, IDLE_COL_DOWN, WALK_ROW_DOWN, 0, max_frames=9)

    # Row 1: 왼쪽 walk  (얼굴 왼쪽 보임 — 정면뷰 거리씬에도 사용)
    fill_walk_row(walk_sheet, output, IDLE_COL_LEFT, WALK_ROW_LEFT, 1, max_frames=24)

    # Row 2: 오른쪽 walk
    fill_walk_row(walk_sheet, output, IDLE_COL_RIGHT, WALK_ROW_RIGHT, 2, max_frames=24)

    # Row 3: 뒤(UP) walk
    fill_walk_row(walk_sheet, output, IDLE_COL_UP, WALK_ROW_UP, 3, max_frames=24)

    # Row 4: Sit/Typing
    # sit: 짝수col=RIGHT향(왼쪽 책상용), 홀수col=LEFT향(오른쪽 책상용)
    if sit_sheet:
        sit_cols   = sit_sheet.size[0] // IN_FRAME_W
        right_frms = list(range(0, sit_cols, 2))  # 0,2,4,...
        left_frms  = list(range(1, sit_cols, 2))  # 1,3,5,...
        for i in range(min(3, len(right_frms))):
            paste(extract_frame(sit_sheet, right_frms[i], 0), i, 4)
        for i in range(min(3, len(left_frms))):
            paste(extract_frame(sit_sheet, left_frms[i], 0), i + 3, 4)
    else:
        paste(extract_frame(walk_sheet, IDLE_COL_DOWN, 0), 0, 4)

    # Row 5: Phone/Extra
    if phone_sheet:
        phone_cols = phone_sheet.size[0] // IN_FRAME_W
        for i in range(min(OUT_COLS, phone_cols)):
            paste(extract_frame(phone_sheet, i, 0), i, 5)
    else:
        paste(extract_frame(walk_sheet, IDLE_COL_DOWN, 0), 0, 5)

    return output


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"2× 업스케일: {IN_FRAME_W}×{IN_FRAME_H} → {FRAME_W}×{FRAME_H} 프레임")
    print(f"출력 시트: {OUT_COLS * FRAME_W}×{OUT_ROWS * FRAME_H} (7cols × 6rows)")
    print()

    for i, name in enumerate(CHARACTERS):
        print(f"[{i}] {name} 변환 중...")
        try:
            sheet = build_char_sheet(name)
            out_path = OUTPUT_DIR / f"char_{i}.png"
            sheet.save(out_path, "PNG")
            print(f"  ✅ {out_path} ({sheet.size[0]}×{sheet.size[1]})")
        except Exception as e:
            print(f"  ❌ {e}")

    print()
    print("완료! 프레임 크기: 32×64 (2× 업스케일)")
    print("sprites.ts 업데이트 필요: frameWidth: 32, frameHeight: 64")


if __name__ == "__main__":
    main()
