# -*- coding: utf-8 -*-
"""Crop front-view character from reference sheet and submit image-to-3D job."""
import sys, os, base64, importlib.util
from PIL import Image

IMG = r"D:\缓存\2026-10-25-16-34-43\lulu-game\assets\character-ref.jpg"
OUT = r"D:\缓存\2026-10-25-16-34-43\lulu-game\assets\character-front.png"
SKILL = r"D:\WorkBuddy\resources\app.asar.unpacked\resources\plugins\workbuddy-builtin\skills\buddy-multimodal-generation\scripts\buddy-multimodal-generation.py"

TOKEN = sys.argv[1]

# ---- 1. crop center figure ----
img = Image.open(IMG).convert("RGB")
w, h = img.size
region = img.crop((int(w * 0.33), 0, int(w * 0.67), h))
px = region.load()
rw, rh = region.size
minx, miny, maxx, maxy = rw, rh, 0, 0
for y in range(0, rh, 2):
    for x in range(0, rw, 2):
        r, g, b = px[x, y]
        if r > 235 and g > 235 and b > 235:
            continue  # white bg
        if r < 40 and g < 40 and b < 40:
            continue  # black bars
        minx = min(minx, x); maxx = max(maxx, x)
        miny = min(miny, y); maxy = max(maxy, y)
pad = 14
crop = region.crop((max(0, minx - pad), max(0, miny - pad),
                    min(rw, maxx + pad), min(rh, maxy + pad)))
crop.save(OUT)
print("[INFO] cropped front view saved:", OUT, crop.size, file=sys.stderr)

# ---- 2. submit image-to-3D ----
b64 = base64.b64encode(open(OUT, "rb").read()).decode()
spec = importlib.util.spec_from_file_location("mmgen", SKILL)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
sys.argv = ["gen3d", "3d", "--image-base64", b64,
            "--enable-pbr", "--token", TOKEN]
mod.main()
