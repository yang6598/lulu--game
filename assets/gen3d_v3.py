# -*- coding: utf-8 -*-
"""v3: crop front+back refs, submit multi-view image-to-3D."""
import sys, base64, importlib.util
from PIL import Image

DIR = r"D:\缓存\2026-10-25-16-34-43\lulu-game\assets"
FRONT = DIR + r"\ref-front.jpg"
BACK = DIR + r"\ref-back.jpg"
OUT_FRONT = DIR + r"\char-front.png"
OUT_BACK = DIR + r"\char-back.png"
SKILL = r"D:\WorkBuddy\resources\app.asar.unpacked\resources\plugins\workbuddy-builtin\skills\buddy-multimodal-generation\scripts\buddy-multimodal-generation.py"

TOKEN = sys.argv[1]

def is_bg(r, g, b):
    return (r > 235 and g > 235 and b > 235) or (r < 45 and g < 45 and b < 45)

def crop_square(src, dst):
    img = Image.open(src).convert("RGB")
    w, h = img.size
    px = img.load()
    # 1. 按行找人物内容带（排除黑边和纯白）
    def row_ratio(y):
        cnt = total = 0
        for x in range(0, w, 3):
            r, g, b = px[x, y]
            total += 1
            if not is_bg(r, g, b):
                cnt += 1
        return cnt / total
    bands, start = [], None
    for y in range(h):
        if row_ratio(y) > 0.06:
            if start is None: start = y
        else:
            if start is not None: bands.append((start, y)); start = None
    if start is not None: bands.append((start, h))
    y0, y1 = max(bands, key=lambda b: b[1] - b[0])
    # 2. 带内框非白像素（全宽，因为单视图居中）
    minx, miny, maxx, maxy = w, y1, 0, y0
    for y in range(y0, y1, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            if r > 238 and g > 238 and b > 238: continue
            minx = min(minx, x); maxx = max(maxx, x)
            miny = min(miny, y); maxy = max(maxy, y)
    pad = 16
    crop = img.crop((max(0, minx - pad), max(0, miny - pad),
                     min(w, maxx + pad), min(h, maxy + pad)))
    cw, ch = crop.size
    side = max(cw, ch)
    canvas = Image.new("RGB", (side, side), (248, 248, 248))
    canvas.paste(crop, ((side - cw) // 2, (side - ch) // 2))
    canvas.save(dst)
    print(f"[INFO] {src} -> {dst} ({cw}x{ch} -> {side}x{side})", file=sys.stderr)
    return dst

f = crop_square(FRONT, OUT_FRONT)
b = crop_square(BACK, OUT_BACK)

def b64(path):
    return base64.b64encode(open(path, "rb").read()).decode()

spec = importlib.util.spec_from_file_location("mmgen", SKILL)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

multiview = '[{"ViewType":"back","ViewImageUrl":"data:image/png;base64,' + b64(b) + '"}]'
sys.argv = ["gen3d", "3d", "--image-base64", b64(f),
            "--multi-view", multiview,
            "--enable-pbr", "--token", TOKEN]
mod.main()
