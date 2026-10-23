#!/usr/bin/env python3
"""Crop a screenshot region and enlarge it with nearest-neighbour so pixel art can be inspected.
usage: python3 scripts/crop.py IN.png x y w h [scale=4] [OUT.png]"""
import sys
from PIL import Image
a = sys.argv[1:]
src, x, y, w, h = a[0], *map(int, a[1:5])
s = int(a[5]) if len(a) > 5 else 4
out = a[6] if len(a) > 6 else src.replace('.png', f'_crop{x}_{y}.png')
Image.open(src).crop((x, y, x + w, y + h)).resize((w * s, h * s), Image.NEAREST).save(out)
print(out)
