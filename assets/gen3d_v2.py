# -*- coding: utf-8 -*-
"""v2: locate the figure band precisely, crop front view, submit image-to-3D."""
import sys, base64, importlib.util
from PIL import Image

IMG = r"D:\缓存\2026-10-25-16-34-43\lulu-game\assets\character-ref.jpg"
OUT = r"D:\缓存\2026-10-25-16-34-43\lulu-game\assets\character-front.png"
SKILL = r"D:\WorkBuddy\resources\app.asar.unpacked\resources\plugins\workbuddy-builtin\skills\buddy-multimodal-generation\scripts\buddy-multimodal-generation.py"

TOKEN = sys.argv[1]

img = Image.open(IMG).convert("RGB")
w, h = img.size
px = img.load()
print(f"[INFO] source size: {w}x{h}", file=sys.stderr)

def is_bg_pixel(r, g, b):
    return (r > 235 and g > 235 and b > 235) or (r < 45 and g < 45 and b < 45)

# ---- 1. 按行统计，找出人物所在的连续内容带（排除黑边/纯白区） ----
def row_content_ratio(y):
    cnt = total = 0
    for x in range(0, w, 3):
        r, g, b = px[x, y]
        total += 1
        if not is_bg_pixel(r, g, b):
            cnt += 1
    return cnt / total

bands, start = [], None
for y in range(h):
    if row_content_ratio(y) > 0.06:
        if start is None:
            start = y
    else:
        if start is not None:
            bands.append((start, y)); start = None
if start is not None:
    bands.append((start, h))

y0, y1 = max(bands, key=lambda b: b[1] - b[0])
print(f"[INFO] figure band: y {y0}..{y1} (height {y1-y0})", file=sys.stderr)

# ---- 2. 在内容带 + 中间三分之一的范围内，框出非白像素 ----
x0, x1 = int(w * 0.33), int(w * 0.67)
minx, miny, maxx, maxy = x1, y1, x0, y0
for y in range(y0, y1, 2):
    for x in range(x0, x1, 2):
        r, g, b = px[x, y]
        if r > 238 and g > 238 and b > 238:
            continue
        minx = min(minx, x); maxx = max(maxx, x)
        miny = min(miny, y); maxy = max(maxy, y)

pad = 16
box = (max(0, minx - pad), max(0, miny - pad),
       min(w, maxx + pad), min(h, maxy + pad))
crop = img.crop(box)
cw, ch = crop.size
# 补成接近正方形画布（避免细长条导致生成平面片）
side = max(cw, ch)
canvas = Image.new("RGB", (side, side), (245, 245, 245))
canvas.paste(crop, ((side - cw) // 2, (side - ch) // 2))
canvas.save(OUT)
print(f"[INFO] cropped front view: {cw}x{ch} -> padded {side}x{side}", file=sys.stderr)

# ---- 3. 提交图生 3D ----
b64 = base64.b64encode(open(OUT, "rb").read()).decode()
spec = importlib.util.spec_from_file_location("mmgen", SKILL)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
sys.argv = ["gen3d", "3d", "--image-base64", b64,
            "--enable-pbr", "--token", TOKEN]
mod.main()
