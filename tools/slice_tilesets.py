#!/usr/bin/env python3
"""
Pokemon tileset slicer — reusable tool.
- Slices 32x32 tiles from all PNGs in ROOT/Tilesets/
- Skips fully transparent tiles
- Dedupes by content hash within sheet
- Generates composite (multi-tile object) extraction via connected components
- Creates grid-overlay preview (3x scale, row,col labels)

Usage: python3 slice_tilesets.py [--root PATH]
"""
import os, json, hashlib, argparse
from PIL import Image, ImageDraw, ImageFont
import numpy as np
from scipy.ndimage import label as cclabel

TILE = 32

def slice_individual(src_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    total = 0
    for fname in sorted(os.listdir(src_dir)):
        if not fname.lower().endswith(('.png','.jpg')): continue
        im = Image.open(os.path.join(src_dir, fname)).convert('RGBA')
        w, h = im.size
        cols, rows = w // TILE, h // TILE
        if cols == 0 or rows == 0: continue
        stem = os.path.splitext(fname)[0]
        d = os.path.join(out_dir, stem)
        os.makedirs(d, exist_ok=True)
        seen = set(); tiles = []
        for r in range(rows):
            for c in range(cols):
                tile = im.crop((c*TILE, r*TILE, (c+1)*TILE, (r+1)*TILE))
                if tile.getchannel('A').getextrema() == (0,0): continue
                hb = hashlib.md5(tile.tobytes()).hexdigest()[:10]
                if hb in seen: continue
                seen.add(hb)
                name = f'r{r:03d}_c{c:02d}.png'
                tile.save(os.path.join(d, name), optimize=True)
                tiles.append({'row':r,'col':c,'file':name,'hash':hb})
        with open(os.path.join(d,'_meta.json'),'w',encoding='utf-8') as f:
            json.dump({'source':fname,'width':w,'height':h,'tile_size':TILE,'tiles':tiles}, f, ensure_ascii=False, indent=2)
        total += len(tiles)
    return total

def extract_composites(src_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    total = 0
    for fname in sorted(os.listdir(src_dir)):
        if not fname.lower().endswith(('.png','.jpg')): continue
        im = Image.open(os.path.join(src_dir, fname)).convert('RGBA')
        arr = np.array(im)
        mask = arr[:,:,3] > 0
        lbl, n = cclabel(mask, structure=np.ones((3,3)))
        stem = os.path.splitext(fname)[0]
        d = os.path.join(out_dir, stem)
        os.makedirs(d, exist_ok=True)
        objs = []
        for i in range(1, n+1):
            ys, xs = np.where(lbl == i)
            y0,y1 = int(ys.min()), int(ys.max())+1
            x0,x1 = int(xs.min()), int(xs.max())+1
            if y1-y0 < 8 or x1-x0 < 8: continue
            if y1-y0 > TILE*8 or x1-x0 > TILE*8: continue
            sx0 = (x0//TILE)*TILE; sy0 = (y0//TILE)*TILE
            sx1 = ((x1+TILE-1)//TILE)*TILE; sy1 = ((y1+TILE-1)//TILE)*TILE
            crop = im.crop((sx0,sy0,sx1,sy1))
            tw = (sx1-sx0)//TILE; th = (sy1-sy0)//TILE
            name = f'obj_r{sy0//TILE:03d}_c{sx0//TILE:02d}_{th}x{tw}.png'
            crop.save(os.path.join(d, name), optimize=True)
            objs.append({'file':name,'row':sy0//TILE,'col':sx0//TILE,'h':th,'w':tw})
        with open(os.path.join(d,'_meta.json'),'w',encoding='utf-8') as f:
            json.dump({'source':fname,'objects':objs}, f, ensure_ascii=False, indent=2)
        total += len(objs)
    return total

def make_grid_preview(src_dir, out_dir, scale=3, max_height=4000):
    os.makedirs(out_dir, exist_ok=True)
    font = None
    for fp in ['/System/Library/Fonts/Supplemental/Arial.ttf']:
        if os.path.exists(fp):
            try: font = ImageFont.truetype(fp, 18); break
            except: pass
    if font is None: font = ImageFont.load_default()
    total = 0
    for fname in sorted(os.listdir(src_dir)):
        if not fname.lower().endswith(('.png','.jpg')): continue
        im = Image.open(os.path.join(src_dir, fname)).convert('RGBA')
        w, h = im.size
        if h > max_height: im = im.crop((0,0,w,max_height)); w,h = im.size
        cols, rows = w // TILE, h // TILE
        big = im.resize((w*scale, h*scale), Image.NEAREST)
        draw = ImageDraw.Draw(big)
        T = TILE * scale
        for c in range(cols+1): draw.line([(c*T,0),(c*T,h*scale)], fill=(255,0,255,180), width=1)
        for r in range(rows+1): draw.line([(0,r*T),(w*scale,r*T)], fill=(255,0,255,180), width=1)
        for r in range(rows):
            for c in range(cols):
                draw.text((c*T+2, r*T+2), f'{r},{c}', fill=(0,255,255,255), font=font, stroke_width=2, stroke_fill=(0,0,0,255))
        stem = os.path.splitext(fname)[0]
        big.save(os.path.join(out_dir, f'{stem}_grid.png'), optimize=True)
        total += 1
    return total

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default='/Users/600mac/Developer/my-company/company-hq/ui/public/assets/pokemon_assets')
    args = ap.parse_args()
    src = os.path.join(args.root, 'Tilesets')
    print(f'[1/3] Slicing 32x32 tiles...')
    t1 = slice_individual(src, os.path.join(args.root, 'sliced'))
    print(f'  → {t1} tiles')
    print(f'[2/3] Extracting composite objects...')
    t2 = extract_composites(src, os.path.join(args.root, 'composites'))
    print(f'  → {t2} composites')
    print(f'[3/3] Generating grid previews...')
    t3 = make_grid_preview(src, os.path.join(args.root, 'sliced_preview'))
    print(f'  → {t3} previews')
    print('DONE')
