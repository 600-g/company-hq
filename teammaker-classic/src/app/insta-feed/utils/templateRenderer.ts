import { TemplateId, PaletteKey, PALETTES, FeedState } from '@/types/insta-feed';

const CANVAS_SIZE = 1080;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / boxRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawImageCircle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  radius: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  drawImageCover(ctx, img, cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3
): number {
  const words = text.split(' ');
  let line = '';
  let currentY = y;
  let lineCount = 0;
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + ' ';
    if (ctx.measureText(testLine).width > maxWidth && i > 0) {
      ctx.fillText(line.trim(), x, currentY);
      line = words[i] + ' ';
      currentY += lineHeight;
      lineCount++;
      if (lineCount >= maxLines) break;
    } else {
      line = testLine;
    }
  }
  if (lineCount < maxLines && line.trim()) {
    ctx.fillText(line.trim(), x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

// T01: Minimal Clean
async function renderT01(
  ctx: CanvasRenderingContext2D,
  state: FeedState,
  palette: typeof PALETTES[PaletteKey]
) {
  const s = CANVAS_SIZE;
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, s, s);

  if (state.imageUrl) {
    try {
      const img = await loadImage(state.imageUrl);
      drawImageCover(ctx, img, 0, 0, s, s);
    } catch {}
  } else {
    ctx.fillStyle = '#E0E0E0';
    ctx.fillRect(0, 0, s, s);
  }

  // Bottom gradient overlay
  const grad = ctx.createLinearGradient(0, s * 0.6, 0, s);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(255,255,255,0.92)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, s * 0.6, s, s * 0.4);

  // Headline
  ctx.fillStyle = palette.text;
  ctx.textAlign = 'center';
  if (state.headline) {
    ctx.font = `bold 80px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    wrapText(ctx, state.headline, s / 2, s * 0.72, s - 128, 96, 2);
  }
  if (state.subCopy) {
    ctx.font = `400 44px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    ctx.fillStyle = palette.text;
    wrapText(ctx, state.subCopy, s / 2, s * 0.88, s - 128, 56, 2);
  }

  // Logo
  if (state.showLogo && state.logoText) {
    ctx.font = `600 24px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.textAlign = 'right';
    ctx.fillText(state.logoText, s - 48, s - 40);
  }
}

// T02: Bold Headline
async function renderT02(
  ctx: CanvasRenderingContext2D,
  state: FeedState,
  palette: typeof PALETTES[PaletteKey]
) {
  const s = CANVAS_SIZE;
  // Top 50% dark block
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, s, s);

  // Bottom 50% image
  if (state.imageUrl) {
    try {
      const img = await loadImage(state.imageUrl);
      drawImageCover(ctx, img, 0, s * 0.5, s, s * 0.5);
    } catch {}
  } else {
    ctx.fillStyle = '#444';
    ctx.fillRect(0, s * 0.5, s, s * 0.5);
  }

  // Overlap gradient
  const grad = ctx.createLinearGradient(0, s * 0.4, 0, s * 0.65);
  grad.addColorStop(0, palette.background);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, s * 0.4, s, s * 0.25);

  // Headline (large, overlapping midpoint)
  if (state.headline) {
    ctx.fillStyle = palette.text;
    ctx.textAlign = 'center';
    ctx.font = `bold 110px "Noto Serif KR", Georgia, serif`;
    wrapText(ctx, state.headline, s / 2, s * 0.28, s - 80, 130, 2);
  }
  if (state.subCopy) {
    ctx.font = `400 46px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    ctx.fillStyle = palette.text + 'CC';
    ctx.textAlign = 'center';
    wrapText(ctx, state.subCopy, s / 2, s * 0.56, s - 120, 60, 2);
  }

  if (state.showLogo && state.logoText) {
    ctx.font = `600 24px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    ctx.fillStyle = palette.text + '88';
    ctx.textAlign = 'right';
    ctx.fillText(state.logoText, s - 48, s - 40);
  }
}

// T03: Warm Story
async function renderT03(
  ctx: CanvasRenderingContext2D,
  state: FeedState,
  palette: typeof PALETTES[PaletteKey]
) {
  const s = CANVAS_SIZE;
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, s, s);

  // Right circular image
  const cx = s * 0.68;
  const cy = s * 0.5;
  const radius = 240;

  if (state.imageUrl) {
    try {
      const img = await loadImage(state.imageUrl);
      drawImageCircle(ctx, img, cx, cy, radius);
    } catch {}
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#D0C8B8';
    ctx.fill();
    ctx.restore();
  }

  // Left text
  ctx.textAlign = 'left';
  const leftX = 80;
  if (state.headline) {
    ctx.fillStyle = palette.text;
    ctx.font = `bold 80px "Noto Serif KR", Georgia, serif`;
    wrapText(ctx, state.headline, leftX, s * 0.28, s * 0.5 - 40, 96, 3);
  }
  if (state.subCopy) {
    ctx.fillStyle = palette.accent;
    ctx.font = `400 40px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    wrapText(ctx, state.subCopy, leftX, s * 0.58, s * 0.5 - 40, 52, 3);
  }

  // Accent line
  ctx.fillStyle = palette.accent;
  ctx.fillRect(leftX, s * 0.23, 60, 6);

  if (state.showLogo && state.logoText) {
    ctx.font = `600 24px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    ctx.fillStyle = palette.text + '66';
    ctx.textAlign = 'left';
    ctx.fillText(state.logoText, leftX, s - 48);
  }
}

// T04: Ocean Frame
async function renderT04(
  ctx: CanvasRenderingContext2D,
  state: FeedState,
  palette: typeof PALETTES[PaletteKey]
) {
  const s = CANVAS_SIZE;
  const border = 32;
  const bannerH = 80;

  ctx.fillStyle = palette.accent;
  ctx.fillRect(0, 0, s, s);

  const innerH = s - border * 2 - bannerH;
  if (state.imageUrl) {
    try {
      const img = await loadImage(state.imageUrl);
      drawImageCover(ctx, img, border, border, s - border * 2, innerH);
    } catch {}
  } else {
    ctx.fillStyle = palette.background;
    ctx.fillRect(border, border, s - border * 2, innerH);
  }

  // Bottom banner
  ctx.fillStyle = palette.accent;
  ctx.fillRect(border, s - border - bannerH, s - border * 2, bannerH);

  ctx.textAlign = 'center';
  if (state.headline) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 48px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    ctx.fillText(
      state.headline.length > 32 ? state.headline.slice(0, 32) + '…' : state.headline,
      s / 2,
      s - border - bannerH + bannerH / 2 + 16
    );
  }

  if (state.subCopy) {
    ctx.fillStyle = palette.accent;
    ctx.font = `400 48px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    ctx.textAlign = 'center';
    wrapText(ctx, state.subCopy, s / 2, border + innerH * 0.7, s - border * 4, 62, 2);
  }

  if (state.showLogo && state.logoText) {
    ctx.font = `600 24px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.textAlign = 'right';
    ctx.fillText(state.logoText, s - border - 16, s - border - bannerH + bannerH / 2 + 16);
  }
}

// T05: Blush Grid
async function renderT05(
  ctx: CanvasRenderingContext2D,
  state: FeedState,
  palette: typeof PALETTES[PaletteKey]
) {
  const s = CANVAS_SIZE;
  const gap = 8;
  const half = (s - gap) / 2;

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, s, s);

  const positions = [
    [0, 0],
    [half + gap, 0],
    [0, half + gap],
  ];

  for (const [x, y] of positions) {
    if (state.imageUrl) {
      try {
        const img = await loadImage(state.imageUrl);
        drawImageCover(ctx, img, x, y, half, half);
      } catch {}
    } else {
      ctx.fillStyle = '#E8D8DC';
      ctx.fillRect(x, y, half, half);
    }
  }

  // Text quadrant (bottom-right)
  const tx = half + gap;
  const ty = half + gap;
  ctx.fillStyle = palette.accent;
  ctx.fillRect(tx, ty, half, half);

  ctx.textAlign = 'center';
  const centerX = tx + half / 2;
  if (state.headline) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 72px "Noto Serif KR", Georgia, serif`;
    wrapText(ctx, state.headline, centerX, ty + half * 0.3, half - 40, 86, 2);
  }
  if (state.subCopy) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `400 38px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    wrapText(ctx, state.subCopy, centerX, ty + half * 0.68, half - 48, 48, 2);
  }

  if (state.showLogo && state.logoText) {
    ctx.font = `600 22px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'center';
    ctx.fillText(state.logoText, centerX, ty + half - 32);
  }
}

// T06: Forest Quote
async function renderT06(
  ctx: CanvasRenderingContext2D,
  state: FeedState,
  palette: typeof PALETTES[PaletteKey]
) {
  const s = CANVAS_SIZE;
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, s, s);

  if (state.imageUrl) {
    try {
      const img = await loadImage(state.imageUrl);
      drawImageCover(ctx, img, 0, 0, s, s);
    } catch {}
  } else {
    ctx.fillStyle = '#C8D8C8';
    ctx.fillRect(0, 0, s, s);
  }

  // Center text box
  const boxW = 700;
  const boxH = 280;
  const boxX = (s - boxW) / 2;
  const boxY = (s - boxH) / 2;

  ctx.save();
  ctx.beginPath();
  const r = 16;
  ctx.moveTo(boxX + r, boxY);
  ctx.lineTo(boxX + boxW - r, boxY);
  ctx.quadraticCurveTo(boxX + boxW, boxY, boxX + boxW, boxY + r);
  ctx.lineTo(boxX + boxW, boxY + boxH - r);
  ctx.quadraticCurveTo(boxX + boxW, boxY + boxH, boxX + boxW - r, boxY + boxH);
  ctx.lineTo(boxX + r, boxY + boxH);
  ctx.quadraticCurveTo(boxX, boxY + boxH, boxX, boxY + boxH - r);
  ctx.lineTo(boxX, boxY + r);
  ctx.quadraticCurveTo(boxX, boxY, boxX + r, boxY);
  ctx.closePath();
  ctx.fillStyle = 'rgba(30,58,30,0.82)';
  ctx.fill();
  ctx.restore();

  // Large quotation mark
  ctx.fillStyle = palette.accent;
  ctx.font = `700 130px "Noto Serif KR", Georgia, serif`;
  ctx.textAlign = 'left';
  ctx.fillText('"', boxX + 28, boxY + 80);

  // Quote text
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  if (state.headline) {
    ctx.font = `600 52px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    wrapText(ctx, state.headline, s / 2, boxY + 100, boxW - 100, 64, 2);
  }
  if (state.subCopy) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `400 34px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    wrapText(ctx, state.subCopy, s / 2, boxY + 210, boxW - 120, 44, 1);
  }

  if (state.showLogo && state.logoText) {
    ctx.font = `600 26px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    ctx.fillStyle = palette.accent;
    ctx.textAlign = 'center';
    ctx.fillText(state.logoText, s / 2, s - 48);
  }
}

const renderers: Record<
  TemplateId,
  (ctx: CanvasRenderingContext2D, state: FeedState, palette: typeof PALETTES[PaletteKey]) => Promise<void>
> = {
  T01: renderT01,
  T02: renderT02,
  T03: renderT03,
  T04: renderT04,
  T05: renderT05,
  T06: renderT06,
};

export async function renderTemplate(
  canvas: HTMLCanvasElement,
  state: FeedState,
  size: number = CANVAS_SIZE
) {
  if (!state.selectedTemplate) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = size;
  canvas.height = size;

  const palette = PALETTES[state.palette];
  const renderer = renderers[state.selectedTemplate];
  if (renderer) {
    ctx.clearRect(0, 0, size, size);
    await renderer(ctx, state, palette);
  }
}

export async function renderPreview(canvas: HTMLCanvasElement, state: FeedState, previewSize: number) {
  await renderTemplate(canvas, state, previewSize);
}

export async function renderExport(canvas: HTMLCanvasElement, state: FeedState) {
  await renderTemplate(canvas, state, CANVAS_SIZE);
}
