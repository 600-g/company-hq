"""앱별 공유 페이지 — 카톡/인스타에 붙였을 때 미리보기가 뜨는 링크.

정적 사이트(600g.net)는 앱마다 다른 OG 태그를 못 만든다. 그래서 백엔드가
앱 1개짜리 페이지를 서버 렌더링해서 내려준다.

- GET /a/{app_id}         공유 페이지 (앱 이름·설명·[받기] + OG 태그)
- GET /a/{app_id}/og.png  미리보기 카드 이미지 (1200×630, 서버 생성)

숨김(visible=false) 앱은 404 — 공유 링크로도 노출되지 않는다.
"""
from __future__ import annotations

import html
import io
import json
import logging
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, Response

logger = logging.getLogger(__name__)
router = APIRouter(tags=["app-share"])

APPS_PATH = Path(__file__).resolve().parent.parent / "apps.json"

PUBLIC_BASE = "https://api.600g.net"
HUB_URL = "https://600g.net"
BRAND = "#002f6c"

PLATFORM_LABEL = {
    "windows": "Windows", "mac": "macOS", "linux": "Linux",
    "android": "Android", "ios": "iOS", "other": "",
}

# macOS 기본 한글 폰트 — OG 카드 렌더용
FONT_CANDIDATES = [
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
]


def _load_visible(app_id: str) -> dict:
    """공개 상태인 앱만 돌려준다. 없거나 숨김이면 404."""
    try:
        with APPS_PATH.open("r", encoding="utf-8") as f:
            items = json.load(f).get("items", [])
    except Exception:
        items = []
    for it in items:
        if it.get("id") == app_id and it.get("visible"):
            return it
    raise HTTPException(status_code=404, detail="공개된 앱이 아닙니다")


def _fmt_size(b: int) -> str:
    b = int(b or 0)
    if b >= 1073741824:
        return f"{b / 1073741824:.1f}GB"
    if b >= 1048576:
        return f"{b / 1048576:.1f}MB"
    if b >= 1024:
        return f"{round(b / 1024)}KB"
    return f"{b}B"


def _icon_html(icon: str) -> str:
    """허브와 같은 3형식 지원: inline SVG / 절대 URL / Iconify prefix."""
    icon = (icon or "lucide:package").strip()
    if re.match(r"^\s*<svg[\s>]", icon, re.I):
        return re.sub(r"currentColor", "#ffffff", icon)
    if re.match(r"^https?://", icon):
        return f'<img src="{html.escape(icon, quote=True)}" alt="">'
    return f'<img src="https://api.iconify.design/{html.escape(icon, quote=True)}.svg?color=%23ffffff" alt="">'


def _meta_line(app: dict) -> str:
    bits = []
    if app.get("version"):
        bits.append(f"v{app['version']}")
    plat = PLATFORM_LABEL.get(app.get("platform", ""), "")
    if plat:
        bits.append(plat)
    bits.append(_fmt_size(app.get("size", 0)))
    return " · ".join(bits)


@router.get("/a/{app_id}", response_class=HTMLResponse)
async def share_page(app_id: str) -> HTMLResponse:
    app = _load_visible(app_id)

    name = app.get("name") or app_id
    desc = app.get("description") or f"{name} 내려받기"
    meta = _meta_line(app)
    color = app.get("color") or BRAND
    share_url = f"{PUBLIC_BASE}/a/{app_id}"
    og_image = f"{share_url}/og.png"
    dl_url = f"{PUBLIC_BASE}/api/apps/{app_id}/download"

    e = lambda s: html.escape(str(s), quote=True)  # noqa: E731

    page = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(name)} — 두근 컴퍼니</title>
<meta name="description" content="{e(desc)}">

<meta property="og:type" content="website">
<meta property="og:site_name" content="두근 컴퍼니">
<meta property="og:title" content="{e(name)}">
<meta property="og:description" content="{e(desc)} · {e(meta)}">
<meta property="og:url" content="{e(share_url)}">
<meta property="og:image" content="{e(og_image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(name)}">
<meta name="twitter:description" content="{e(desc)} · {e(meta)}">
<meta name="twitter:image" content="{e(og_image)}">

<link rel="stylesheet" as="style" crossorigin
      href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>
  *,*::before,*::after {{ box-sizing: border-box; }}
  body {{
    margin: 0; min-height: 100dvh; background: #fff; color: {BRAND};
    font-family: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont,
                 "Apple SD Gothic Neo", sans-serif;
    display: flex; align-items: center; justify-content: center; padding: 24px;
    -webkit-font-smoothing: antialiased;
  }}
  body::before {{
    content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none;
    background:
      radial-gradient(60vw 60vw at 12% 18%, rgba(0,47,108,0.07) 0%, transparent 60%),
      radial-gradient(55vw 55vw at 88% 82%, rgba(236,72,153,0.06) 0%, transparent 60%);
  }}
  .card {{
    width: 100%; max-width: 340px; text-align: center;
    background: #fff; border: 1px solid rgba(0,47,108,0.12);
    border-radius: 20px; padding: 32px 24px 26px;
    box-shadow: 0 4px 20px rgba(0,47,108,0.10);
  }}
  .icon {{
    width: 72px; height: 72px; margin: 0 auto 16px; padding: 16px;
    border-radius: 20px; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, {color} 0%,
      color-mix(in srgb, {color} 80%, white 20%) 100%);
    box-shadow: 0 4px 14px rgba(0,47,108,0.20), inset 0 1px 0 rgba(255,255,255,0.2);
  }}
  .icon img, .icon svg {{ width: 100%; height: 100%; display: block; color: #fff; }}
  h1 {{ margin: 0 0 6px; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }}
  .meta {{ font-size: 12px; color: rgba(0,47,108,0.55); margin-bottom: 12px; }}
  .desc {{ font-size: 13px; line-height: 1.55; color: rgba(0,47,108,0.72); margin: 0 0 22px; }}
  .dl {{
    display: flex; align-items: center; justify-content: center; gap: 7px;
    padding: 13px 20px; background: {BRAND}; color: #fff;
    border-radius: 12px; font-size: 14px; font-weight: 700; text-decoration: none;
    transition: transform .15s ease, box-shadow .2s ease;
  }}
  .dl:hover, .dl:active {{ transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,47,108,0.28); }}
  .dl svg {{ width: 16px; height: 16px; }}
  .note {{ font-size: 10.5px; line-height: 1.5; color: rgba(0,47,108,0.45); margin-top: 14px; }}
  .home {{ display: inline-block; margin-top: 18px; font-size: 11px;
           color: rgba(0,47,108,0.5); text-decoration: none; letter-spacing: 0.04em; }}
  .home:hover {{ color: {BRAND}; }}
</style>
</head>
<body>
  <main class="card">
    <div class="icon">{_icon_html(app.get("icon", ""))}</div>
    <h1>{e(name)}</h1>
    <div class="meta">{e(meta)}</div>
    <p class="desc">{e(desc)}</p>
    <a class="dl" href="{e(dl_url)}" rel="noopener">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>내려받기
    </a>
    {'<p class="note">Windows에서 “알 수 없는 게시자” 경고가 뜨면 추가 정보 → 실행을 눌러주세요.</p>'
     if app.get("platform") == "windows" else ""}
    <a class="home" href="{HUB_URL}">두근 컴퍼니 →</a>
  </main>
</body>
</html>"""
    return HTMLResponse(page, headers={"Cache-Control": "public, max-age=300"})


def _load_font(size: int):
    from PIL import ImageFont

    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    from PIL import ImageFont as IF

    return IF.load_default()


@router.get("/a/{app_id}/og.png")
async def share_og_image(app_id: str) -> Response:
    """카톡·인스타 미리보기용 1200×630 카드. 앱 색상 배경 + 이름."""
    app = _load_visible(app_id)

    from PIL import Image, ImageDraw

    W, H = 1200, 630
    color = (app.get("color") or BRAND).lstrip("#")
    try:
        rgb = tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))
    except Exception:
        rgb = (0, 47, 108)

    img = Image.new("RGB", (W, H), rgb)
    d = ImageDraw.Draw(img)

    # 대각선 밝기 그라데이션 — 단색보다 덜 밋밋하게
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(c + (255 - c) * 0.10 * t) for c in rgb))

    name = (app.get("name") or app_id)[:22]
    meta = _meta_line(app)
    desc = (app.get("description") or "")[:46]

    d.text((80, 210), name, font=_load_font(84), fill=(255, 255, 255))
    if desc:
        d.text((84, 330), desc, font=_load_font(32), fill=(255, 255, 255, 220))
    d.text((84, 392), meta, font=_load_font(28), fill=(255, 255, 255))
    d.text((84, 508), "600g.net", font=_load_font(26), fill=(255, 255, 255))

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return Response(
        buf.getvalue(),
        media_type="image/png",
        # 짧게 — 앱을 숨겨도 CDN 에 미리보기가 남는 창을 줄인다 (CF 가 더 늘려 잡을 수 있음)
        headers={"Cache-Control": "public, max-age=600"},
    )
