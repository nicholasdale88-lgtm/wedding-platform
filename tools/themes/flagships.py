"""
The three flagship opening scenes, drawn by us (no traced art, no stock): Hunter Valley Vineyard Sunset,
Botanical Ivory Arch and Coastal Garden. Each is three layers in apps/web/public/themes/<slug>/:
  bg.svg  the whole closed scene, lit (the only file the closed invitation loads);
  mid.svg light and drifting detail (petals, leaves, glints), loaded on the tap;
  fg.svg  near, out-of-focus framing foliage that sweeps past as the camera pushes in, loaded on the tap.
Deterministic (seeded), portrait 900x1600, sliced to fill any screen.
  python tools/themes/flagships.py
"""
import math
import os
import random

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'apps', 'web', 'public', 'themes')
W, H = 900, 1600


def f(x):
    return f'{x:.1f}'.rstrip('0').rstrip('.')


def svg(body, defs=''):
    return (f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {W} {H}' preserveAspectRatio='xMidYMid slice'>"
            f"<defs>{defs}</defs>{body}</svg>")


def grain(id_, alpha=0.06, freq=0.85):
    """Paper/film grain laid over a whole scene (lighter and darker specks)."""
    return (f"<filter id='{id_}' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='{freq}' "
            f"numOctaves='2' seed='3' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 .5  0 0 0 0 .45  0 0 0 0 .4  0 0 0 {alpha * 6} {-alpha * 2}'/></filter>")


def blur(id_, s):
    return f"<filter id='{id_}' x='-30%' y='-30%' width='160%' height='160%'><feGaussianBlur stdDeviation='{s}'/></filter>"


def lin(id_, stops, x1=0, y1=0, x2=0, y2=1):
    s = ''.join(f"<stop offset='{o}' stop-color='{c}'{'' if a == 1 else f' stop-opacity={chr(39)}{a}{chr(39)}'}/>" for o, c, a in stops)
    return f"<linearGradient id='{id_}' x1='{x1}' y1='{y1}' x2='{x2}' y2='{y2}'>{s}</linearGradient>"


def rad(id_, stops, cx=.5, cy=.5, r=.5, fx=None, fy=None):
    s = ''.join(f"<stop offset='{o}' stop-color='{c}' stop-opacity='{a}'/>" for o, c, a in stops)
    extra = f" fx='{fx}' fy='{fy}'" if fx is not None else ''
    return f"<radialGradient id='{id_}' cx='{cx}' cy='{cy}' r='{r}'{extra}>{s}</radialGradient>"


def leaf(x, y, length, width, angle, fill, vein=None, op=1):
    """A pointed leaf from (x, y), its tip `length` away at `angle` degrees, with a curved midrib."""
    a = math.radians(angle)
    tx, ty = x + math.cos(a) * length, y + math.sin(a) * length
    nx, ny = -math.sin(a) * width, math.cos(a) * width
    mx, my = x + math.cos(a) * length * .45, y + math.sin(a) * length * .45
    d = (f"M{f(x)},{f(y)} Q{f(mx + nx)},{f(my + ny)} {f(tx)},{f(ty)} Q{f(mx - nx * .8)},{f(my - ny * .8)} {f(x)},{f(y)}Z")
    out = f"<path d='{d}' fill='{fill}'{'' if op == 1 else f' opacity={chr(39)}{op}{chr(39)}'}/>"
    if vein:
        out += f"<path d='M{f(x)},{f(y)} Q{f(mx + nx * .25)},{f(my + ny * .25)} {f(tx)},{f(ty)}' stroke='{vein}' stroke-width='{f(max(.6, width * .06))}' fill='none' opacity='.55'/>"
    return out


def vine_leaf(x, y, s, angle, fill, rim):
    """A five-lobed grape leaf, its sunlit edge picked out."""
    pts = []
    for i in range(10):
        r = s * (1 if i % 2 == 0 else .55)
        t = math.radians(angle - 90 + i * 36)
        pts.append((x + math.cos(t) * r, y + math.sin(t) * r))
    d = 'M' + ' '.join(f'{f(px)},{f(py)}' for px, py in pts) + 'Z'
    return (f"<path d='{d}' fill='{fill}' stroke='{rim}' stroke-width='{f(s * .06)}' stroke-linejoin='round'/>"
            f"<path d='M{f(x)},{f(y)} L{f(pts[0][0])},{f(pts[0][1])} M{f(x)},{f(y)} L{f(pts[4][0])},{f(pts[4][1])} M{f(x)},{f(y)} L{f(pts[6][0])},{f(pts[6][1])}' stroke='{rim}' stroke-width='{f(s * .03)}' opacity='.5'/>")


def grapes(x, y, s, base, hi):
    out = ''
    rows = [4, 4, 3, 3, 2, 1]
    for r, n in enumerate(rows):
        for k in range(n):
            gx = x + (k - (n - 1) / 2) * s * 1.7
            gy = y + r * s * 1.5
            out += f"<circle cx='{f(gx)}' cy='{f(gy)}' r='{f(s)}' fill='{base}'/><circle cx='{f(gx - s * .35)}' cy='{f(gy - s * .35)}' r='{f(s * .32)}' fill='{hi}' opacity='.7'/>"
    return out


def write(slug, name, body):
    d = os.path.join(OUT, slug)
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, name)
    with open(p, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(body)
    print(f'{slug}/{name}: {len(body.encode()) // 1024} KB')


# ------------------------------------------------------------------------------- Hunter Valley Vineyard Sunset

def vineyard():
    R = random.Random(11)
    horizon = 742
    vx, vy = 470, horizon + 6  # where the rows meet
    defs = (lin('sky', [(0, '#2f3658', 1), (.34, '#7b5a78', 1), (.58, '#d98a6a', 1), (.78, '#f2b678', 1), (1, '#fbd99a', 1)])
            + rad('sun', [(0, '#fff6dc', 1), (.12, '#ffe7a8', .95), (.35, '#f9b874', .45), (1, '#f08a5a', 0)], .55, .45, .5)
            + lin('ridge', [(0, '#8d6f8c', 1), (1, '#b38a86', 1)])
            + lin('hill', [(0, '#7a6a52', 1), (1, '#4e4a33', 1)])
            + lin('ground', [(0, '#a9874f', 1), (.4, '#6d6236', 1), (1, '#2f321f', 1)])
            + lin('haze', [(0, '#f6c78e', 0), (1, '#f6c78e', .55)])
            + rad('vig', [(0, '#000', 0), (.62, '#000', 0), (1, '#1a0f08', .62)], .5, .46, .75)
            + blur('b6', 6) + blur('b18', 18) + blur('b40', 40) + grain('gr', .05))
    b = [f"<rect width='{W}' height='{H}' fill='url(#sky)'/>"]
    # The sun low over the range, and its bloom.
    b.append(f"<circle cx='560' cy='{horizon - 70}' r='520' fill='url(#sun)'/>")
    b.append(f"<circle cx='560' cy='{horizon - 70}' r='46' fill='#fff4d6' filter='url(#b6)'/>")
    # Long thin clouds, lit from below.
    for i in range(9):
        cy = 250 + i * 48 + R.uniform(-18, 18)
        cx = R.uniform(80, 820)
        w = R.uniform(160, 420)
        b.append(f"<ellipse cx='{f(cx)}' cy='{f(cy)}' rx='{f(w)}' ry='{f(R.uniform(6, 13))}' fill='#f7c79a' opacity='{f(.18 + i * .045)}' filter='url(#b6)'/>")
        b.append(f"<ellipse cx='{f(cx)}' cy='{f(cy + 6)}' rx='{f(w * .8)}' ry='4' fill='#ffe3b0' opacity='{f(.12 + i * .03)}' filter='url(#b6)'/>")
    # The far range, hazy; a nearer ridge.
    pts = ' '.join(f'{f(x)},{f(horizon - 38 - 26 * math.sin(x / 120) - 18 * math.sin(x / 47 + 1) - (60 if 120 < x < 380 else 0) * math.sin((x - 120) / 260 * math.pi))}' for x in range(0, W + 31, 30))
    b.append(f"<polygon points='0,{horizon} {pts} {W},{horizon}' fill='url(#ridge)' opacity='.85'/>")
    b.append(f"<rect x='0' y='{horizon - 140}' width='{W}' height='150' fill='url(#haze)'/>")
    pts = ' '.join(f'{f(x)},{f(horizon - 6 - 16 * math.sin(x / 90 + 2) - 10 * math.sin(x / 33))}' for x in range(0, W + 31, 30))
    b.append(f"<polygon points='0,{horizon + 20} {pts} {W},{horizon + 20}' fill='url(#hill)'/>")
    # A lone tree on the rise (our own drawing: trunk, then soft canopy clumps).
    tx, ty = 735, horizon - 22
    b.append(f"<path d='M{tx},{ty} C{tx + 2},{ty - 30} {tx - 6},{ty - 50} {tx - 2},{ty - 78} M{tx},{ty - 40} C{tx + 14},{ty - 55} {tx + 22},{ty - 64} {tx + 30},{ty - 80}' stroke='#3a2c26' stroke-width='3.4' fill='none'/>")
    for i in range(14):
        b.append(f"<ellipse cx='{f(tx - 20 + R.uniform(0, 60))}' cy='{f(ty - 80 - R.uniform(0, 34))}' rx='{f(R.uniform(10, 20))}' ry='{f(R.uniform(7, 12))}' fill='#3e3a2a' opacity='.92'/>")
    # The ground, then the rows running to the sun.
    b.append(f"<rect x='0' y='{horizon}' width='{W}' height='{H - horizon}' fill='url(#ground)'/>")
    for k in range(-14, 15):
        # Each row: a band from the vanishing point to the foot of the screen, widening as it nears.
        foot = vx + k * 120
        def at(t, side):
            y = vy + (H + 60 - vy) * t ** 1.55
            x = vx + (foot - vx) * t ** 1.55 + side * (1.2 + 26 * t ** 1.8)
            return x, y
        left = [at(i / 30, -1) for i in range(31)]
        right = [at(i / 30, 1) for i in range(30, -1, -1)]
        d = 'M' + ' '.join(f'{f(x)},{f(y)}' for x, y in left + right) + 'Z'
        b.append(f"<path d='{d}' fill='#2e3a22'/>")
        # Foliage clumps along the row, lit on the sun's side.
        for i in range(4, 34):
            t = (i / 34) ** 1.05
            x, y = at(t, 0)
            s = 2 + 30 * t ** 1.9
            rim = '#e2b45c' if foot < vx + 200 else '#c79a4c'
            b.append(f"<ellipse cx='{f(x + R.uniform(-s * .3, s * .3))}' cy='{f(y - s * .55)}' rx='{f(s * 1.1)}' ry='{f(s * .8)}' fill='#3d4a28'/>")
            b.append(f"<ellipse cx='{f(x - s * .35 * (1 if foot > vx else -1))}' cy='{f(y - s * .85)}' rx='{f(s * .6)}' ry='{f(s * .35)}' fill='{rim}' opacity='{f(.25 + .45 * (1 - t))}'/>")
    # Warm light pooling down the middle row, and haze over the far vines.
    b.append(f"<path d='M{vx},{vy} L{vx - 160},{H} L{vx + 220},{H}Z' fill='#f4c27c' opacity='.13' filter='url(#b40)'/>")
    b.append(f"<rect x='0' y='{horizon}' width='{W}' height='90' fill='#f3b77c' opacity='.28' filter='url(#b18)'/>")
    b.append(f"<rect width='{W}' height='{H}' fill='url(#vig)'/>")
    b.append(f"<rect width='{W}' height='{H}' filter='url(#gr)' opacity='.9'/>")
    write('vineyard-sunset', 'bg.svg', svg(''.join(b), defs))

    # mid: gold motes and a few drifting leaves, lit by the sun.
    m = []
    for i in range(46):
        x, y, r = R.uniform(60, 840), R.uniform(380, 1250), R.uniform(1.4, 4.2)
        m.append(f"<circle cx='{f(x)}' cy='{f(y)}' r='{f(r)}' fill='#ffe2a0' opacity='{f(R.uniform(.35, .85))}' filter='url(#b2)'/>")
    for i in range(9):
        m.append(vine_leaf(R.uniform(80, 820), R.uniform(500, 1300), R.uniform(14, 24), R.uniform(0, 360), '#7a6a2c', '#e6b65e'))
    write('vineyard-sunset', 'mid.svg', svg(''.join(m), blur('b2', 1.6)))

    # fg: close vine branches either side, out of focus, with grapes catching the light.
    g = []
    for side, x0 in ((-1, -30), (1, W + 30)):
        g.append(f"<path d='M{x0},{H} C{x0 - side * 120},{H - 360} {x0 - side * 60},{H - 640} {x0 - side * 200},{H - 900}' stroke='#3a2a1c' stroke-width='22' fill='none'/>")
        for i in range(16):
            t = i / 15
            lx = x0 - side * (60 + 150 * t + R.uniform(-40, 60))
            ly = H - 120 - 760 * t + R.uniform(-40, 40)
            g.append(vine_leaf(lx, ly, R.uniform(44, 78), R.uniform(0, 360), '#3f4d25' if i % 3 else '#55622e', '#c99a48'))
        for i in range(3):
            g.append(grapes(x0 - side * R.uniform(120, 200), H - 420 - i * 230, 13, '#4a2a44', '#d9a7c0'))
    write('vineyard-sunset', 'fg.svg', svg(f"<g filter='url(#b9)'>{''.join(g)}</g>", blur('b9', 7)))


# ------------------------------------------------------------------------------------ Botanical Ivory Arch

def rose(x, y, s, base, deep, hi):
    """A garden rose from above: rings of soft petals, darker at the heart, a highlight on the near edge."""
    out = f"<circle cx='{f(x)}' cy='{f(y + s * .12)}' r='{f(s * 1.04)}' fill='#6b4a3a' opacity='.18' filter='url(#b4)'/>"
    for ring, (n, rr, col) in enumerate(((7, 1, base), (6, .74, base), (5, .5, deep), (4, .28, deep))):
        for i in range(n):
            t = math.radians(i * 360 / n + ring * 23)
            px, py = x + math.cos(t) * s * rr * .45, y + math.sin(t) * s * rr * .45
            out += f"<ellipse cx='{f(px)}' cy='{f(py)}' rx='{f(s * rr * .62)}' ry='{f(s * rr * .5)}' transform='rotate({f(math.degrees(t))} {f(px)} {f(py)})' fill='{col}' stroke='{hi}' stroke-width='{f(s * .03)}' stroke-opacity='.6'/>"
    return out + f"<circle cx='{f(x)}' cy='{f(y)}' r='{f(s * .12)}' fill='{deep}'/>"


def eucalyptus(x, y, length, angle, R, col='#8fa596', hi='#c7d5c9'):
    """A trailing stem of round silver-green leaves."""
    out = ''
    a = math.radians(angle)
    pts = [(x + math.cos(a) * length * t + math.sin(t * 5) * 8, y + math.sin(a) * length * t) for t in [i / 12 for i in range(13)]]
    out += "<path d='M" + ' '.join(f'{f(px)},{f(py)}' for px, py in pts) + "' stroke='#6d7c62' stroke-width='2.2' fill='none'/>"
    for i, (px, py) in enumerate(pts[1:], 1):
        r = 15 * (1 - i / 16)
        for side in (-1, 1):
            cx, cy = px + side * r * .9, py + r * .2
            out += f"<circle cx='{f(cx)}' cy='{f(cy)}' r='{f(r)}' fill='{col}'/><circle cx='{f(cx - r * .3)}' cy='{f(cy - r * .3)}' r='{f(r * .55)}' fill='{hi}' opacity='.45'/>"
    return out


def arch():
    R = random.Random(23)
    ax, aw, top, foot = W / 2, 520, 300, 1360  # the arch: centre, width, springing height, floor
    defs = (lin('wall', [(0, '#f8f2e7', 1), (1, '#ede2d0', 1)])
            + lin('niche', [(0, '#e6d8c2', 1), (.6, '#efe4d2', 1), (1, '#f6efe3', 1)])
            + rad('key', [(0, '#fffaf0', .9), (1, '#fffaf0', 0)], .22, .1, .7)
            + rad('vig', [(0, '#000', 0), (.66, '#000', 0), (1, '#3a2a1c', .32)], .5, .45, .78)
            + lin('floor', [(0, '#e8dcc8', 1), (1, '#d6c6ad', 1)])
            + blur('b4', 4) + blur('b14', 14) + blur('b30', 30) + grain('gr', .045, .7))
    r = aw / 2
    archd = f"M{ax - r},{foot} L{ax - r},{top + r} A{r},{r} 0 0 1 {ax + r},{top + r} L{ax + r},{foot}Z"
    b = [f"<rect width='{W}' height='{H}' fill='url(#wall)'/>",
         # Plaster: soft mottling.
         ''.join(f"<ellipse cx='{f(R.uniform(0, W))}' cy='{f(R.uniform(0, H))}' rx='{f(R.uniform(60, 180))}' ry='{f(R.uniform(40, 120))}' fill='#e9dcc6' opacity='.25' filter='url(#b30)'/>" for _ in range(14)),
         f"<rect x='0' y='{foot}' width='{W}' height='{H - foot}' fill='url(#floor)'/>",
         # The arch: a recessed niche, shaded inside its top edge, a moulded rim catching the light.
         f"<path d='{archd}' fill='url(#niche)'/>",
         f"<path d='{archd}' fill='none' stroke='#cbb89c' stroke-width='26' opacity='.35' filter='url(#b14)'/>",
         f"<path d='M{ax - r - 22},{foot} L{ax - r - 22},{top + r} A{r + 22},{r + 22} 0 0 1 {ax + r + 22},{top + r} L{ax + r + 22},{foot}' fill='none' stroke='#fbf7ef' stroke-width='16'/>",
         f"<path d='M{ax - r - 22},{foot} L{ax - r - 22},{top + r} A{r + 22},{r + 22} 0 0 1 {ax + r + 22},{top + r} L{ax + r + 22},{foot}' fill='none' stroke='#d9c8ac' stroke-width='3' transform='translate(4 4)' opacity='.8'/>",
         # Contact shadow where the arch meets the floor.
         f"<ellipse cx='{ax}' cy='{foot + 8}' rx='{r + 70}' ry='18' fill='#6d5a42' opacity='.18' filter='url(#b14)'/>"]
    # Greenery and roses trailing over the arch, heavier on the left, a cascade down the right.
    def on_arch(t):  # 0 = left foot, .5 = crown, 1 = right foot
        if t < .3:
            return ax - r - 22, foot - (foot - top - r) * (t / .3)
        if t > .7:
            return ax + r + 22, top + r + (foot - top - r) * ((t - .7) / .3)
        th = math.pi * (1 - (t - .3) / .4)
        return ax + math.cos(th) * (r + 22), top + r - math.sin(th) * (r + 22)
    spots = [i / 60 for i in range(8, 38)] + [i / 60 for i in range(46, 53)]
    for t in spots:
        x, y = on_arch(t)
        for _ in range(3):
            b.append(leaf(x, y, R.uniform(34, 70), R.uniform(9, 16), R.uniform(0, 360), R.choice(['#7f9a6e', '#6b8a5c', '#9db08a', '#5d7a52']), '#3f5536'))
    for t in [i / 40 for i in range(6, 26, 2)] + [.78, .84]:
        x, y = on_arch(t)
        b.append(eucalyptus(x, y, R.uniform(90, 180), R.uniform(70, 120), R))
    for t, s in [(.2, 30), (.26, 40), (.33, 34), (.38, 26), (.45, 22), (.55, 20), (.62, 28), (.7, 36), (.76, 26), (.29, 18), (.41, 16)]:
        x, y = on_arch(t)
        b.append(rose(x + R.uniform(-10, 10), y + R.uniform(-10, 10), s, '#f2cfc4', '#d99e92', '#fff3ee'))
    for t in [i / 30 for i in range(4, 24)]:
        x, y = on_arch(t)
        b.append(f"<circle cx='{f(x + R.uniform(-30, 30))}' cy='{f(y + R.uniform(-30, 30))}' r='{f(R.uniform(3, 6))}' fill='#fffaf2'/>")
    # A floor arrangement at each foot.
    for side in (-1, 1):
        fx = ax + side * (r + 22)
        for _ in range(16):
            b.append(leaf(fx, foot - 10, R.uniform(60, 130), R.uniform(12, 20), R.uniform(190, 350), R.choice(['#6b8a5c', '#7f9a6e', '#9db08a']), '#3f5536'))
        for k in range(5):
            b.append(rose(fx + R.uniform(-60, 60), foot - 40 - R.uniform(0, 90), R.uniform(24, 40), '#f2cfc4', '#d99e92', '#fff3ee'))
    # Daylight from the top left, and the room's edges falling off.
    b.append(f"<rect width='{W}' height='{H}' fill='url(#key)'/>")
    b.append(f"<rect width='{W}' height='{H}' fill='url(#vig)'/>")
    b.append(f"<rect width='{W}' height='{H}' filter='url(#gr)' opacity='.8'/>")
    write('ivory-arch', 'bg.svg', svg(''.join(b), defs))

    # mid: blush petals turning in the air, and a soft shaft of light through the arch.
    m = [f"<path d='M{ax - 120},0 L{ax + 40},0 L{ax + 260},{H} L{ax - 60},{H}Z' fill='#fff8ec' opacity='.28' filter='url(#b30)'/>"]
    for _ in range(34):
        x, y, s = R.uniform(60, 840), R.uniform(200, 1400), R.uniform(9, 18)
        m.append(f"<ellipse cx='{f(x)}' cy='{f(y)}' rx='{f(s)}' ry='{f(s * .55)}' transform='rotate({f(R.uniform(0, 180))} {f(x)} {f(y)})' fill='{R.choice(['#f4d2c8', '#efc1b4', '#fbe3dc'])}' opacity='.9'/>")
    write('ivory-arch', 'mid.svg', svg(''.join(m), blur('b30', 30)))

    # fg: near, soft foliage and a rose at the corners.
    g = []
    for cx, cy in ((-40, 220), (W + 40, 260), (-60, H - 200), (W + 60, H - 160)):
        for _ in range(14):
            g.append(leaf(cx, cy, R.uniform(120, 230), R.uniform(24, 40), R.uniform(0, 360), R.choice(['#6b8a5c', '#86a174', '#5d7a52']), '#3f5536'))
        g.append(rose(cx + (90 if cx < 0 else -90), cy + 40, 58, '#f2cfc4', '#d99e92', '#fff3ee'))
    write('ivory-arch', 'fg.svg', svg(f"<g filter='url(#b8)'>{''.join(g)}</g>", blur('b8', 8)))


# ----------------------------------------------------------------------------------------- Coastal Garden

def grass(x, y, h, lean, col, w=2.2):
    return f"<path d='M{f(x)},{f(y)} Q{f(x + lean * .3)},{f(y - h * .6)} {f(x + lean)},{f(y - h)}' stroke='{col}' stroke-width='{f(w)}' fill='none' stroke-linecap='round'/>"


def coastal():
    R = random.Random(37)
    horizon = 640
    defs = (lin('sky', [(0, '#bcd6df', 1), (.55, '#e3ecea', 1), (1, '#f7efe0', 1)])
            + lin('sea', [(0, '#5f97a6', 1), (.45, '#4f8f97', 1), (.8, '#6fb7b2', 1), (1, '#a9d8cc', 1)])
            + lin('sand', [(0, '#ead8b6', 1), (1, '#d9c193', 1)])
            + lin('dune', [(0, '#c9b07e', 1), (1, '#a88e5e', 1)])
            + rad('sun', [(0, '#fffbea', .95), (.3, '#fff3d0', .4), (1, '#fff3d0', 0)], .7, .2, .55)
            + rad('vig', [(0, '#000', 0), (.64, '#000', 0), (1, '#1d2a2c', .4)], .5, .45, .78)
            + blur('b3', 3) + blur('b10', 10) + blur('b26', 26) + grain('gr', .04))
    b = [f"<rect width='{W}' height='{H}' fill='url(#sky)'/>",
         f"<rect width='{W}' height='{H}' fill='url(#sun)'/>"]
    for i in range(7):
        cx, cy = R.uniform(0, W), R.uniform(140, 520)
        b.append(f"<ellipse cx='{f(cx)}' cy='{f(cy)}' rx='{f(R.uniform(90, 220))}' ry='{f(R.uniform(16, 34))}' fill='#ffffff' opacity='.55' filter='url(#b10)'/>")
    # A headland on the left, faint with distance.
    b.append(f"<path d='M0,{horizon} L0,{horizon - 90} C90,{horizon - 120} 180,{horizon - 60} 300,{horizon - 18} L330,{horizon}Z' fill='#7f9c9c' opacity='.55'/>")
    b.append(f"<rect x='0' y='{horizon}' width='{W}' height='{H - horizon}' fill='url(#sea)'/>")
    # Swell lines and the sun's glitter on the water.
    for i in range(26):
        y = horizon + 8 + (i ** 1.5) * 3.2
        b.append(f"<path d='M0,{f(y)} Q{W / 4},{f(y - 3)} {W / 2},{f(y)} T{W},{f(y)}' stroke='#d8f0ec' stroke-width='{f(.6 + i * .08)}' fill='none' opacity='{f(.18 + i * .01)}'/>")
    for _ in range(70):
        x = 640 + R.gauss(0, 70)
        y = horizon + R.uniform(6, 220)
        b.append(f"<ellipse cx='{f(x)}' cy='{f(y)}' rx='{f(R.uniform(3, 12))}' ry='1.2' fill='#fffbe8' opacity='{f(R.uniform(.4, .9))}'/>")
    # The shore: a line of foam, then sand.
    shore = 930
    b.append(f"<path d='M0,{shore} C200,{shore - 18} 420,{shore + 14} 620,{shore - 6} S{W},{shore + 4} {W},{shore + 4} L{W},{H} L0,{H}Z' fill='url(#sand)'/>")
    b.append(f"<path d='M0,{shore} C200,{shore - 18} 420,{shore + 14} 620,{shore - 6} S{W},{shore + 4} {W},{shore + 4}' stroke='#ffffff' stroke-width='7' fill='none' opacity='.8' filter='url(#b3)'/>")
    # Dunes either side of a sandy path down to the beach.
    b.append(f"<path d='M0,{shore + 60} C140,{shore + 10} 260,{shore + 40} 360,{H} L0,{H}Z' fill='url(#dune)'/>")
    b.append(f"<path d='M{W},{shore + 40} C{W - 160},{shore} {W - 300},{shore + 70} {W - 380},{H} L{W},{H}Z' fill='url(#dune)'/>")
    # Dune grass, lit from the right, denser and taller as it nears.
    for _ in range(900):
        side = R.choice((-1, 1))
        x = R.uniform(0, 360) if side < 0 else R.uniform(W - 380, W)
        y = R.uniform(shore + 30, H + 40)
        k = (y - shore) / (H - shore)
        h = 20 + 150 * k ** 1.4 * R.uniform(.6, 1.2)
        col = R.choice(['#9a9a5c', '#b7ad6c', '#7f8a4e', '#d6c98a', '#6f7b45'])
        b.append(grass(x, y, h, R.uniform(-40, 25) * (1 + k), col, .8 + 2.4 * k))
    # Garden flowers among the grass: white round heads and coastal purple spikes.
    for _ in range(26):
        side = R.choice((-1, 1))
        x = R.uniform(20, 320) if side < 0 else R.uniform(W - 330, W - 20)
        y = R.uniform(shore + 160, H - 80)
        k = (y - shore) / (H - shore)
        s = 10 + 26 * k
        b.append(f"<path d='M{f(x)},{f(y)} L{f(x + R.uniform(-8, 8))},{f(y - s * 3)}' stroke='#6f7b45' stroke-width='{f(1 + k * 2)}'/>")
        if R.random() < .5:
            for i in range(12):
                t = math.radians(i * 30)
                b.append(f"<circle cx='{f(x + math.cos(t) * s * .7)}' cy='{f(y - s * 3 + math.sin(t) * s * .7)}' r='{f(s * .28)}' fill='#f6f4ee'/>")
            b.append(f"<circle cx='{f(x)}' cy='{f(y - s * 3)}' r='{f(s * .35)}' fill='#e8e1c8'/>")
        else:
            for i in range(9):
                b.append(f"<ellipse cx='{f(x + R.uniform(-2, 2))}' cy='{f(y - s * 2.2 - i * s * .32)}' rx='{f(s * .22)}' ry='{f(s * .16)}' fill='{R.choice(['#8d79b6', '#a493c9', '#7a68a6'])}'/>")
    b.append(f"<rect width='{W}' height='{H}' fill='url(#vig)'/>")
    b.append(f"<rect width='{W}' height='{H}' filter='url(#gr)' opacity='.8'/>")
    write('coastal-garden', 'bg.svg', svg(''.join(b), defs))

    # mid: sea spray glints and drifting white petals on the breeze.
    m = []
    for _ in range(40):
        x, y = R.uniform(40, 860), R.uniform(300, 1300)
        m.append(f"<circle cx='{f(x)}' cy='{f(y)}' r='{f(R.uniform(1.4, 3.6))}' fill='#ffffff' opacity='{f(R.uniform(.4, .9))}' filter='url(#b1)'/>")
    for _ in range(16):
        x, y, s = R.uniform(60, 840), R.uniform(400, 1300), R.uniform(6, 11)
        m.append(f"<ellipse cx='{f(x)}' cy='{f(y)}' rx='{f(s)}' ry='{f(s * .5)}' transform='rotate({f(R.uniform(0, 180))} {f(x)} {f(y)})' fill='#fbf8f0'/>")
    write('coastal-garden', 'mid.svg', svg(''.join(m), blur('b1', 1.2)))

    # fg: tall near grass at the corners, soft with closeness.
    g = []
    for _ in range(140):
        side = R.choice((-1, 1))
        x = R.uniform(-60, 200) if side < 0 else R.uniform(W - 200, W + 60)
        g.append(grass(x, H + 30, R.uniform(300, 760), side * -R.uniform(40, 160), R.choice(['#8a8a52', '#a7a064', '#6f7b45', '#c3b678']), R.uniform(4, 8)))
    write('coastal-garden', 'fg.svg', svg(f"<g filter='url(#b7)'>{''.join(g)}</g>", blur('b7', 7)))


if __name__ == '__main__':
    vineyard()
    arch()
    coastal()
