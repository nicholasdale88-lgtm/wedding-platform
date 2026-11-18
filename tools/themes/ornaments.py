"""
Line-art ornaments for the invitation looks (apps/web/src/guest/looks.css): drawn here as one-colour masks, so
each takes the design's own foil colour (--fgo) and any couple's colours. Prints the CSS mask values.
  python tools/themes/ornaments.py
"""
import math
import urllib.parse


def f(x):
    return f'{x:.1f}'.rstrip('0').rstrip('.')


def enc(svg):
    return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe=" ='/:,.-") + '")'


def leaf(x, y, L, w, ang, vein=True):
    """An outlined leaf with a midrib and two side veins (stroke only: line art)."""
    a = math.radians(ang)
    tx, ty = x + math.cos(a) * L, y + math.sin(a) * L
    nx, ny = -math.sin(a) * w, math.cos(a) * w
    mx, my = x + math.cos(a) * L * .45, y + math.sin(a) * L * .45
    d = f"M{f(x)} {f(y)} Q{f(mx + nx)} {f(my + ny)} {f(tx)} {f(ty)} Q{f(mx - nx)} {f(my - ny)} {f(x)} {f(y)}Z"
    if vein:
        d += f" M{f(x)} {f(y)} L{f(tx - math.cos(a) * L * .12)} {f(ty - math.sin(a) * L * .12)}"
        for t in (.35, .6):
            px, py = x + math.cos(a) * L * t, y + math.sin(a) * L * t
            for s in (1, -1):
                d += f" M{f(px)} {f(py)} L{f(px + math.cos(a) * L * .16 + s * nx * .55)} {f(py + math.sin(a) * L * .16 + s * ny * .55)}"
    return d


def rose_line(cx, cy, r):
    """An open rose in line art: an inner spiral, two rings of cupped petals."""
    d = ''
    pts = []
    for i in range(46):
        t = i / 45 * 3.2 * math.pi
        rr = r * .08 + r * .34 * i / 45
        pts.append((cx + math.cos(t) * rr, cy + math.sin(t) * rr * .86))
    d += 'M' + ' L'.join(f'{f(x)} {f(y)}' for x, y in pts)
    for ring, (n, rr, rot) in enumerate(((5, .72, 10), (6, 1, 40))):
        for i in range(n):
            a0 = math.radians(rot + i * 360 / n)
            a1 = math.radians(rot + (i + 1) * 360 / n)
            x0, y0 = cx + math.cos(a0) * r * rr * .62, cy + math.sin(a0) * r * rr * .55
            x1, y1 = cx + math.cos(a1) * r * rr * .62, cy + math.sin(a1) * r * rr * .55
            am = (a0 + a1) / 2
            qx, qy = cx + math.cos(am) * r * rr * 1.05, cy + math.sin(am) * r * rr * .95
            d += f" M{f(x0)} {f(y0)} Q{f(qx)} {f(qy)} {f(x1)} {f(y1)}"
    return d


def romantic():
    W, H = 180, 60
    d = rose_line(90, 30, 19)
    for s in (1, -1):  # stems sweeping out each side, leaves, a bud at each end
        x0 = 90 + s * 16
        d += f" M{f(x0)} 34 C{f(90 + s * 40)} 46 {f(90 + s * 62)} 18 {f(90 + s * 84)} 28"
        d += f" M{f(90 + s * 46)} 37 C{f(90 + s * 54)} 44 {f(90 + s * 64)} 46 {f(90 + s * 72)} 42"
        for (lx, ly, ang) in ((40, 39, -150 if s > 0 else -30), (58, 26, -110 if s > 0 else -70), (70, 24, 20 if s > 0 else 160), (55, 41, 60 if s > 0 else 120)):
            d += ' ' + leaf(90 + s * lx, ly, 13, 4.2, ang)
        bx = 90 + s * 84
        d += f" M{f(bx)} 28 Q{f(bx + s * 7)} 20 {f(bx + s * 3)} 14 Q{f(bx - s * 4)} 20 {f(bx)} 28Z M{f(bx)} 28 Q{f(bx + s * 2)} 22 {f(bx + s * 1)} 17"
    svg = f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {W} {H}'><path d='{d}' fill='none' stroke='#000' stroke-width='1.1' stroke-linecap='round' stroke-linejoin='round'/></svg>"
    return svg


def garden():
    W = H = 100
    d = 'M96 96 C70 76 44 52 20 12'
    for i in range(9):  # leaflets alternating along the frond, shorter towards the tip
        t = .12 + i * .095
        x = 96 - 76 * t - 6 * math.sin(t * 3)
        y = 96 - 84 * t
        L = 20 - i * 1.5
        d += ' ' + leaf(x, y, L, L * .3, -160 + (i % 2) * 110 - i * 3, vein=i < 6)
    # A small five-petal flower and a bud on a side stem.
    cx, cy = 66, 40
    d += f' M74 58 Q70 50 {cx} {cy + 6}'
    for i in range(5):
        a = math.radians(-90 + i * 72)
        x1, y1 = cx + math.cos(a - .5) * 3, cy + math.sin(a - .5) * 3
        x2, y2 = cx + math.cos(a + .5) * 3, cy + math.sin(a + .5) * 3
        qx, qy = cx + math.cos(a) * 11, cy + math.sin(a) * 11
        d += f" M{f(x1)} {f(y1)} Q{f(qx)} {f(qy)} {f(x2)} {f(y2)}"
    d += f' M{cx + 1.6} {cy} A1.6 1.6 0 1 1 {cx - 1.6} {cy} A1.6 1.6 0 1 1 {cx + 1.6} {cy}'
    d += ' M84 70 Q86 62 90 58 M90 58 Q95 54 93 49 Q88 52 90 58Z'
    svg = f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {W} {H}'><path d='{d}' fill='none' stroke='#000' stroke-width='1.15' stroke-linecap='round' stroke-linejoin='round'/></svg>"
    return svg


def luxe():
    d = 'M3 3 L3 58 M3 3 L58 3 M9 52 L9 9 L52 9'
    for r in (16, 34):  # a fan: two arcs from the corner
        d += f' M3 {3 + r} A{r} {r} 0 0 0 {3 + r} 3'
    for i in range(1, 8):  # a sunburst between them, alternating long and short
        a = math.radians(i * 11.25)
        r1 = 30 if i % 2 else 25
        d += f' M{f(3 + math.cos(a) * 19)} {f(3 + math.sin(a) * 19)} L{f(3 + math.cos(a) * r1)} {f(3 + math.sin(a) * r1)}'
    d += ' M40 9 L40 15 L46 15 M9 40 L15 40 L15 46'  # stepped deco returns
    d += ' M30 30 L33 27 L36 30 L33 33Z'  # a small diamond
    svg = f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><path d='{d}' fill='none' stroke='#000' stroke-width='1.1' stroke-linecap='square'/></svg>"
    return svg


if __name__ == '__main__':
    for name, fn in (('romantic', romantic), ('garden', garden), ('luxe', luxe)):
        print(name, enc(fn()))
