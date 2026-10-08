#!/usr/bin/env python3
"""Verify the 2048 colour tokens against WCAG 2.x contrast requirements.

Nguồn: §B12 của docs/DesignSystem.md. Chép nguyên văn — mọi số [MEASURED]
trong tài liệu đó phải tái lập được từ script này.
"""
def s2l(c): return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
def hx(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c*2 for c in h)
    return tuple(int(h[i:i+2],16) for i in (0,2,4))
def lum(h):
    r,g,b = (s2l(v/255) for v in hx(h)); return 0.2126*r + 0.7152*g + 0.0722*b
def cr(a,b):
    la,lb = lum(a),lum(b); hi,lo = max(la,lb),min(la,lb); return round((hi+0.05)/(lo+0.05),2)

TILES = [(2,"#F1E8E0","#2A1C0C"),(4,"#E8DBC4","#2A1C0C"),(8,"#F4C19C","#2A1C0C"),(16,"#F6A581","#2A1C0C"),
         (32,"#F6836A","#2A1C0C"),(64,"#C54A2D","#FFF8EE"),(128,"#B34120","#FFF8EE"),(256,"#A43519","#FFF8EE"),
         (512,"#912A1D","#FFF8EE"),(1024,"#7A2531","#FFF8EE"),(2048,"#60223F","#FFF8EE"),(4096,"#442142","#FFF8EE"),
         (8192,"#271D44","#FFF8EE")]
UI = [("body text on page","#2A1C0C","#FBF6EC",4.5),("muted text on page","#5B4A38","#FBF6EC",4.5),
      ("button label","#FFFFFF","#8F4A22",4.5),("focus ring on page","#1B6EF3","#FBF6EC",3.0),
      ("focus ring on dark","#1B6EF3","#17161A",3.0),("dark body text","#F2EDE4","#17161A",4.5),
      ("dark muted text","#B9B2A6","#17161A",4.5),("contrast theme text","#FFFFFF","#000000",4.5)]
CLASSIC = [(2,"#eee4da","#776e65"),(4,"#ede0c8","#776e65"),(8,"#f2b179","#f9f6f2"),(16,"#f59563","#f9f6f2"),
           (32,"#f67c5f","#f9f6f2"),(64,"#f65e3b","#f9f6f2"),(128,"#edcf72","#f9f6f2"),(256,"#edcc61","#f9f6f2"),
           (512,"#edc850","#f9f6f2"),(1024,"#edc53f","#f9f6f2"),(2048,"#edc22e","#f9f6f2"),(4096,"#3c3a32","#f9f6f2")]

bad = []
print("PROPOSED PALETTE (numeral vs tile fill, need >= 4.5:1)")
prev = None
for v,bg,fg in TILES:
    r, l = cr(bg,fg), lum(bg)
    mono = "" if prev is None else ("ok" if l < prev else "NOT MONOTONIC")
    if r < 4.5: bad.append(f"tile {v}")
    if mono == "NOT MONOTONIC": bad.append(f"tile {v} luminance")
    print(f"  {v:<5} {bg} on {fg} = {r:>6}  lum {l:.3f}  {mono}")
    prev = l
print("\nUI PAIRS")
for label,a,b,need in UI:
    r = cr(a,b)
    if r < need: bad.append(label)
    print(f"  {label:<22} {r:>6}  (need >= {need})")
SEPARATION = [("board vs page","#B9A894","#FBF6EC"),("slot vs board","#D2C6B5","#B9A894"),
              ("lowest tile vs slot","#F1E8E0","#D2C6B5")]
DARK_EXTRA = [("dark board vs page","#2A2730","#17161A"),("dark slot vs board","#332F3A","#2A2730")]
print("\nLIGHT-THEME SURFACE PAIRS (decorative — hairline+shadow carries tile separation)")
worst = 99.0
for label,a,b in SEPARATION:
    r = cr(a,b); worst = min(worst, r)
    print(f"  {label:<24} {r:>6}  decorative")
print(f"  worst decorative adjacency (light theme): {worst}   <- must match the figure in B1.3/B4")
print("DARK-THEME SURFACE PAIRS (decorative)")
for label,a,b in DARK_EXTRA:
    print(f"  {label:<24} {cr(a,b):>6}  decorative")
hc = cr("#FFFF00","#000000")
if hc < 3.0: bad.append("high-contrast focus ring")
print(f"  {'hi-contrast focus ring':<24} {hc:>6}  need >= 3.0")

print("\nCLASSIC PALETTE — measured failures (informational)")
fails = [v for v,bg,fg in CLASSIC if cr(bg,fg) < 3.0]
print(f"  tiles below even 3:1: {fails}")
print("\nRESULT:", "FAIL: " + ", ".join(bad) if bad else "PASS — all checked pairs meet their threshold")
raise SystemExit(1 if bad else 0)
