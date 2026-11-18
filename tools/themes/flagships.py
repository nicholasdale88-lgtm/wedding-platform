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


def vine_leaf(x, y, s, angle, fill, rim, turn=1.0):
    """A grape leaf: five rounded, pointed lobes, a deep notch where the stalk joins, curved veins and a soft lit
    edge. `turn` (0..1) squashes it across, as a leaf seen turning over in the air."""
    # Points round the leaf (angle from straight up, clockwise; radius as a share of s): base, then lobe tips and
    # the sinuses between them, then back to the base.
    ring = [(-150, .34), (-108, .62), (-80, .4), (-52, .86), (-24, .5), (0, 1.0), (24, .5), (52, .86), (80, .4),
            (108, .62), (150, .34)]

    def at(deg, r):
        t = math.radians(deg)
        return (math.sin(t) * r, -math.cos(t) * r)
    base = (0.0, .1)
    d = f'M{f(base[0] * 100)},{f(base[1] * 100)}'
    half = ''
    seq = [(None, base)] + [((dg, r), at(dg, r)) for dg, r in ring] + [(None, base)]
    for i in range(1, len(seq)):
        (k0, p0), (k1, p1) = seq[i - 1], seq[i]
        if k0 and k1:  # bulge outwards between a sinus and a lobe tip
            md = (k0[0] + k1[0]) / 2
            mr = max(k0[1], k1[1]) * .9
            c = at(md, mr)
        else:  # the notch at the stalk
            c = ((p0[0] + p1[0]) / 2 * .5, (p0[1] + p1[1]) / 2 * .5 + .02)
        d += f' Q{f(c[0] * 100)},{f(c[1] * 100)} {f(p1[0] * 100)},{f(p1[1] * 100)}'
        if k1 and k1[0] == 0:  # the left half ends at the tip and runs back down the midrib
            half = d + ' L0,10Z'
    d += 'Z'
    veins = ''.join(
        f"M0,10 Q{f(at(dg, r * .5)[0] * 100 + 4 * math.copysign(1, dg or 1))},{f(at(dg, r * .5)[1] * 100)} "
        f"{f(at(dg, r * .86)[0] * 100)},{f(at(dg, r * .86)[1] * 100)} "
        for dg, r in ((-108, .62), (-52, .86), (0, 1.0), (52, .86), (108, .62)))
    sc = s / 100
    tr = f"translate({f(x)} {f(y)}) rotate({f(angle)}) scale({sc:.3f} {sc * max(.25, turn):.3f})"
    return (f"<g transform='{tr}'>"
            f"<path d='M0,10 L0,40' stroke='{fill}' stroke-width='3.5' stroke-linecap='round'/>"
            f"<path d='{d}' fill='{fill}'/>"
            # One half a touch darker: the leaf is folded slightly along its midrib.
            f"<path d='{half}' fill='#000' opacity='.16'/>"
            f"<path d='{d}' fill='none' stroke='{rim}' stroke-width='2.2' stroke-linejoin='round' opacity='.45'/>"
            f"<path d='{veins}' fill='none' stroke='{rim}' stroke-width='1.6' stroke-linecap='round' opacity='.38'/>"
            f"</g>")


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




def ridge(y0, amp, seed, step=20, x0=-20, x1=W + 20):
    """A hill line: a few gentle waves at y0 (deterministic)."""
    R = random.Random(seed)
    ph = [R.uniform(0, 6.3) for _ in range(3)]
    fr = [R.uniform(.004, .007), R.uniform(.009, .014), R.uniform(.02, .03)]
    am = [amp, amp * .45, amp * .15]
    return [(x, y0 - sum(a * math.sin(x * q + p) for a, q, p in zip(am, fr, ph))) for x in range(x0, x1 + step, step)]


def poly(top, bottom_y):
    return 'M' + ' '.join(f'{f(x)},{f(y)}' for x, y in top) + f' L{top[-1][0]},{bottom_y} L{top[0][0]},{bottom_y}Z'


# ------------------------------------------------------------------------------- Hunter Valley Vineyard Sunset

def vineyard():
    R = random.Random(11)
    sunx, suny = 600, 640
    defs = (lin('sky', [(0, '#262c4e', 1), (.3, '#5d4a72', 1), (.55, '#c27a6e', 1), (.74, '#efa86e', 1), (.9, '#f8cf8c', 1), (1, '#fbe2a8', 1)])
            + rad('sun', [(0, '#fffbe8', 1), (.08, '#ffeab0', .95), (.3, '#f6b26e', .45), (1, '#f08a5a', 0)], .5, .5, .5)
            + rad('vig', [(0, '#000', 0), (.6, '#000', 0), (1, '#160c06', .66)], .5, .44, .76)
            + lin('lightL', [(0, '#ffd59a', .42), (1, '#ffd59a', 0)], 1, 0, 0, 0)
            + blur('b3', 3) + blur('b8', 8) + blur('b22', 22) + blur('b50', 50) + grain('gr', .05))
    b = [f"<rect width='{W}' height='{H}' fill='url(#sky)'/>",
         f"<circle cx='{sunx}' cy='{suny}' r='620' fill='url(#sun)'/>",
         f"<circle cx='{sunx}' cy='{suny}' r='40' fill='#fffaf0' filter='url(#b3)'/>"]
    for i in range(10):  # long clouds, gold underneath
        cy, cx, w = 210 + i * 42 + R.uniform(-14, 14), R.uniform(40, 860), R.uniform(140, 380)
        b.append(f"<ellipse cx='{f(cx)}' cy='{f(cy)}' rx='{f(w)}' ry='{f(R.uniform(5, 11))}' fill='#f3b892' opacity='{f(.16 + i * .045)}' filter='url(#b8)'/>")
        b.append(f"<ellipse cx='{f(cx + 20)}' cy='{f(cy + 5)}' rx='{f(w * .7)}' ry='3' fill='#ffe6b8' opacity='{f(.1 + i * .035)}' filter='url(#b3)'/>")
    # Hill bands, far to near: each lighter and bluer with distance, with a haze in the valley in front.
    bands = [  # (top y, amplitude, colour top, colour bottom, rows?)
        (668, 40, '#9a7c99', '#a98a92', 0),
        (720, 34, '#8b7a6e', '#7d6c55', 0),
        (790, 46, '#7b744d', '#5f5c37', 1),
        (930, 70, '#6d6a3c', '#46482a', 1),
    ]
    for n, (y0, amp, c1, c2, rows) in enumerate(bands):
        top = ridge(y0, amp, 40 + n)
        gid = f'band{n}'
        b.insert(0, '')  # keep order simple
        defs += lin(gid, [(0, c1, 1), (1, c2, 1)])
        d = poly(top, H)
        b.append(f"<path d='{d}' fill='url(#{gid})'/>")
        # Sunlit crest on each hill.
        b.append(f"<path d='M" + ' '.join(f'{f(x)},{f(y)}' for x, y in top) + f"' stroke='#ffd08a' stroke-width='{2 + n}' fill='none' opacity='{f(.55 - n * .08)}' filter='url(#b3)'/>")
        if rows:
            # Vine rows over the hill, running down its slope, closer together with distance.
            cid = f'clip{n}'
            defs += f"<clipPath id='{cid}'><path d='{d}'/></clipPath>"
            g = []
            # Rows follow the hill's contours (as a vineyard on rolling ground looks from afar): copies of the
            # ridge line stepping down the slope, further apart as they near; each row a dark canopy with its
            # sun side caught in gold, broken into vines.
            k, y = 0, 0.0
            while y < H - y0 + amp:
                y = 10 + (6 if n == 2 else 14) * k ** 1.35
                w_ = 3 + (2.2 if n == 2 else 4.5) * k ** .6
                pts = ' '.join(f'{f(x)},{f(yy + y + math.sin(x * .011 + k) * 3)}' for x, yy in top)
                g.append(f"<polyline points='{pts}' stroke='#2c3a1d' stroke-width='{f(w_)}' fill='none' stroke-dasharray='{f(w_ * 2.2)} {f(w_ * .5)}' stroke-linecap='round'/>")
                g.append(f"<polyline points='{pts}' stroke='#e2b462' stroke-width='{f(w_ * .28)}' fill='none' opacity='.55' transform='translate({f(w_ * .2)} {f(-w_ * .35)})' stroke-dasharray='{f(w_ * 2.2)} {f(w_ * .5)}'/>")
                k += 1
            b.append(f"<g clip-path='url(#{cid})'>{''.join(g)}</g>")
            b.append(f"<path d='{d}' fill='url(#lightL)' opacity='.35'/>")
        # Golden haze sitting in the valley in front of each band.
        b.append(f"<rect x='0' y='{f(y0 - amp * .2)}' width='{W}' height='{f(40 + n * 16)}' fill='#f7c084' opacity='{f(.32 - n * .06)}' filter='url(#b22)'/>")
    # A lone tree on the second ridge, back-lit.
    tx, ty = 250, 700
    b.append(f"<path d='M{tx},{ty} C{tx + 2},{ty - 26} {tx - 5},{ty - 44} {tx - 1},{ty - 70} M{tx},{ty - 36} C{tx + 12},{ty - 50} {tx + 19},{ty - 58} {tx + 26},{ty - 72}' stroke='#2e2420' stroke-width='3' fill='none'/>")
    for _ in range(16):
        b.append(f"<ellipse cx='{f(tx - 18 + R.uniform(0, 52))}' cy='{f(ty - 72 - R.uniform(0, 28))}' rx='{f(R.uniform(9, 17))}' ry='{f(R.uniform(6, 10))}' fill='#36301f'/>")
    b.append(f"<ellipse cx='{tx + 8}' cy='{ty - 86}' rx='40' ry='22' fill='#ffcf8a' opacity='.28' filter='url(#b8)'/>")
    # The near row: a trellis running in from the right, posts and wire, the canopy lit gold on its sun side.
    def near(t):  # t 0 at the far end (mid screen), 1 at the bottom left
        return 760 - 820 * t ** 1.2, 1010 + 640 * t ** 1.5
    for i in range(7):  # posts
        x, y = near(i / 6)
        h = 40 + 220 * (i / 6) ** 1.6
        b.append(f"<rect x='{f(x - 2 - 6 * i / 6)}' y='{f(y - h)}' width='{f(4 + 12 * i / 6)}' height='{f(h)}' fill='#4a3826'/>")
    for k in (.55, .8):
        pts = [near(i / 20) for i in range(21)]
        b.append("<path d='M" + ' '.join(f'{f(x)},{f(y - (40 + 220 * (i / 20) ** 1.6) * k)}' for i, (x, y) in enumerate(pts)) + "' stroke='#c9b48a' stroke-width='1.2' fill='none' opacity='.6'/>")
    for i in range(70):
        t = (i / 70) ** .9
        x, y = near(t)
        s = 6 + 70 * t ** 1.5
        top = y - (40 + 220 * t ** 1.6) * .75
        for _ in range(2):
            cx, cy = x + R.uniform(-s, s * .6), top + R.uniform(-s * .5, s * .6)
            b.append(vine_leaf(cx, cy, s * R.uniform(.5, .8), R.uniform(0, 360), R.choice(['#334022', '#3d4c27', '#2b361c']), '#d8a552'))
        if i % 9 == 4 and t > .4:
            b.append(grapes(x + s * .2, top + s * .4, s * .12, '#3b2235', '#c792b3'))
    # Light raking across the near canopy, and the sun's bloom over everything.
    b.append(f"<ellipse cx='{sunx}' cy='{suny}' rx='520' ry='260' fill='#ffd79c' opacity='.22' filter='url(#b50)'/>")
    b.append(f"<rect width='{W}' height='{H}' fill='url(#vig)'/>")
    b.append(f"<rect width='{W}' height='{H}' filter='url(#gr)' opacity='.9'/>")
    write('vineyard-sunset', 'bg.svg', svg(''.join(b), defs))

    m = []  # mid: motes in the sun, a few leaves turning
    for _ in range(50):
        x, y, r = sunx + R.gauss(0, 220), R.uniform(380, 1250), R.uniform(1.4, 4.2)
        m.append(f"<circle cx='{f(x)}' cy='{f(y)}' r='{f(r)}' fill='#ffe2a0' opacity='{f(R.uniform(.35, .85))}' filter='url(#b2)'/>")
    for _ in range(9):
        m.append(vine_leaf(R.uniform(80, 820), R.uniform(500, 1300), R.uniform(22, 34), R.uniform(0, 360), R.choice(['#7d6a2a', '#8a5a26', '#6e6b30']), '#f2c477', turn=R.uniform(.35, 1)))
    write('vineyard-sunset', 'mid.svg', svg(''.join(m), blur('b2', 1.6)))

    g = []  # fg: close vine either side, out of focus
    for side, x0 in ((-1, -30), (1, W + 30)):
        g.append(f"<path d='M{x0},{H} C{x0 - side * 120},{H - 360} {x0 - side * 60},{H - 640} {x0 - side * 200},{H - 900}' stroke='#2e2216' stroke-width='22' fill='none'/>")
        for i in range(16):
            t = i / 15
            g.append(vine_leaf(x0 - side * (60 + 150 * t + R.uniform(-40, 60)), H - 120 - 760 * t + R.uniform(-40, 40), R.uniform(44, 78), R.uniform(0, 360), '#34411f' if i % 3 else '#4a5728', '#c99a48'))
        for i in range(3):
            g.append(grapes(x0 - side * R.uniform(120, 200), H - 420 - i * 230, 13, '#3b2235', '#d9a7c0'))
    write('vineyard-sunset', 'fg.svg', svg(f"<g filter='url(#b9)'>{''.join(g)}</g>", blur('b9', 7)))


# ------------------------------------------------------------------------------------ Botanical Ivory Arch

def rose(x, y, s, base, deep, hi):
    """A garden rose: a shadow, then rings of cupped petals, deeper at the heart, lit on the upper edge."""
    out = f"<circle cx='{f(x + s * .1)}' cy='{f(y + s * .18)}' r='{f(s * 1.02)}' fill='#4a3226' opacity='.22' filter='url(#b4)'/>"
    for ring, (n, rr, col) in enumerate(((8, 1, base), (7, .78, mix(base, deep, .35)), (6, .56, mix(base, deep, .65)), (5, .34, deep))):
        for i in range(n):
            t = math.radians(i * 360 / n + ring * 21)
            px, py = x + math.cos(t) * s * rr * .42, y + math.sin(t) * s * rr * .42
            out += (f"<ellipse cx='{f(px)}' cy='{f(py)}' rx='{f(s * rr * .6)}' ry='{f(s * rr * .46)}' transform='rotate({f(math.degrees(t))} {f(px)} {f(py)})' "
                    f"fill='{col}' stroke='{hi}' stroke-width='{f(s * .035)}' stroke-opacity='.75'/>")
    out += f"<circle cx='{f(x)}' cy='{f(y)}' r='{f(s * .13)}' fill='{mix(deep, '#5a2a2a', .4)}'/>"
    return out + f"<ellipse cx='{f(x - s * .3)}' cy='{f(y - s * .38)}' rx='{f(s * .4)}' ry='{f(s * .16)}' fill='#fff' opacity='.28' filter='url(#b2)'/>"


def mix(a, b, t):
    pa = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    pb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#' + ''.join(f'{round(x + (y - x) * t):02x}' for x, y in zip(pa, pb))


def arch():
    R = random.Random(23)
    ax, aw, top, foot = W / 2, 500, 330, 1330
    r = aw / 2
    defs = (lin('wall', [(0, '#e7dccb', 1), (1, '#d8c8ae', 1)])
            + lin('floor', [(0, '#d9c9ae', 1), (1, '#c4b08f', 1)])
            + lin('view', [(0, '#f7f1df', 1), (.45, '#cfd8b8', 1), (1, '#7f9367', 1)])
            + rad('glow', [(0, '#fffaf0', .95), (1, '#fffaf0', 0)], .5, .4, .5)
            + rad('key', [(0, '#fff6e6', .45), (1, '#fff6e6', 0)], .15, .05, .7)
            + rad('vig', [(0, '#000', 0), (.62, '#000', 0), (1, '#2e2216', .42)], .5, .45, .78)
            + blur('b2', 2) + blur('b4', 4) + blur('b10', 10) + blur('b16', 16) + blur('b30', 30) + grain('gr', .05, .7))
    inner = f"M{ax - r},{foot} L{ax - r},{top + r} A{r},{r} 0 0 1 {ax + r},{top + r} L{ax + r},{foot}Z"
    defs += f"<clipPath id='in'><path d='{inner}'/></clipPath>"
    b = [f"<rect width='{W}' height='{H}' fill='url(#wall)'/>",
         ''.join(f"<ellipse cx='{f(R.uniform(0, W))}' cy='{f(R.uniform(0, H))}' rx='{f(R.uniform(60, 200))}' ry='{f(R.uniform(40, 130))}' fill='{R.choice(['#efe5d4', '#d6c5a8'])}' opacity='.35' filter='url(#b30)'/>" for _ in range(18)),
         f"<rect x='0' y='{foot}' width='{W}' height='{H - foot}' fill='url(#floor)'/>",
         f"<rect x='0' y='{foot}' width='{W}' height='3' fill='#b9a481' opacity='.7'/>"]
    # Through the arch: a soft garden in morning light, out of focus (depth and the focal glow).
    view = [f"<rect x='0' y='0' width='{W}' height='{H}' fill='url(#view)'/>",
            f"<ellipse cx='{ax}' cy='{top + r * .9}' rx='{r * 1.2}' ry='{r}' fill='url(#glow)'/>"]
    for _ in range(12):
        view.append(f"<ellipse cx='{f(R.uniform(ax - r, ax + r))}' cy='{f(R.uniform(top + r * 1.9, foot))}' rx='{f(R.uniform(60, 140))}' ry='{f(R.uniform(40, 90))}' fill='{R.choice(['#8aa274', '#9fb788', '#7a9468', '#b5c79c'])}' opacity='.55'/>")
    for _ in range(18):
        view.append(f"<circle cx='{f(R.uniform(ax - r, ax + r))}' cy='{f(R.uniform(top + r * 1.6, foot))}' r='{f(R.uniform(5, 11))}' fill='{R.choice(['#f6d9d0', '#fff7ef', '#e9b9ad'])}'/>")
    view.append(f"<rect x='{ax - r}' y='{foot - 140}' width='{aw}' height='140' fill='#c9b893' opacity='.55'/>")
    b.append(f"<g clip-path='url(#in)'><g filter='url(#b16)'>{''.join(view)}</g>"
             # The arch's depth: its inner edge in shade.
             f"<path d='{inner}' fill='none' stroke='#6b5a40' stroke-width='60' opacity='.28' filter='url(#b16)'/></g>")
    # The arch's moulding: an ivory frame lit from the top left, its shadow cast down and right on the wall.
    frame = f"M{ax - r - 30},{foot} L{ax - r - 30},{top + r} A{r + 30},{r + 30} 0 0 1 {ax + r + 30},{top + r} L{ax + r + 30},{foot}"
    b.append(f"<path d='{frame}' fill='none' stroke='#5a4630' stroke-width='42' opacity='.22' transform='translate(10 14)' filter='url(#b10)'/>")
    b.append(f"<path d='{frame}' fill='none' stroke='#f7f1e6' stroke-width='40'/>")
    b.append(f"<path d='{frame}' fill='none' stroke='#fffdf8' stroke-width='10' transform='translate(-7 -6)' opacity='.85'/>")
    b.append(f"<path d='{frame}' fill='none' stroke='#c9b796' stroke-width='3' transform='translate(16 10)' opacity='.8'/>")
    b.append(f"<ellipse cx='{ax}' cy='{foot + 10}' rx='{r + 90}' ry='20' fill='#5a4630' opacity='.25' filter='url(#b10)'/>")

    def on(t):
        if t < .3:
            return ax - r - 30, foot - (foot - top - r) * (t / .3)
        if t > .7:
            return ax + r + 30, top + r + (foot - top - r) * ((t - .7) / .3)
        th = math.pi * (1 - (t - .3) / .4)
        return ax + math.cos(th) * (r + 30), top + r - math.sin(th) * (r + 30)
    greens = ['#3f5a36', '#4e6b42', '#5d7d4f', '#344b2e', '#6f8f5c']
    # An asymmetric arrangement: heavy over the left shoulder, a lighter cascade on the right.
    for t in [i / 120 for i in range(28, 84)] + [i / 120 for i in range(92, 104)]:
        x, y = on(t)
        dense = 1.0 if t < .5 else .55
        for _ in range(int(4 * dense) + 1):
            b.append(leaf(x + R.uniform(-20, 20), y + R.uniform(-20, 20), R.uniform(40, 86), R.uniform(10, 18), R.uniform(0, 360), R.choice(greens), '#24331f'))
    for t in [i / 60 for i in range(14, 42, 3)]:  # trailing tendrils
        x, y = on(t)
        L = R.uniform(80, 200)
        pts = [(x + math.sin(k / 3) * 10, y + k * L / 10) for k in range(11)]
        b.append("<path d='M" + ' '.join(f'{f(px)},{f(py)}' for px, py in pts) + "' stroke='#4e6b42' stroke-width='1.6' fill='none'/>")
        for px, py in pts[2::2]:
            b.append(leaf(px, py, R.uniform(14, 24), 6, R.uniform(60, 120), R.choice(greens)))
    blush = [('#f0c4b8', '#c8796f', '#fff1ec'), ('#f6d6cc', '#d79a8e', '#fff7f3'), ('#ead0c0', '#b98a74', '#fff5ee')]
    for t, s in [(.28, 46), (.33, 58), (.37, 40), (.41, 34), (.31, 30), (.45, 26), (.24, 34), (.66, 30), (.72, 42), (.76, 28), (.5, 22)]:
        x, y = on(t)
        b.append(rose(x + R.uniform(-14, 14), y + R.uniform(-14, 14), s, *R.choice(blush)))
    for t in [i / 40 for i in range(10, 30)]:  # tiny white sprays
        x, y = on(t)
        for _ in range(3):
            b.append(f"<circle cx='{f(x + R.uniform(-40, 40))}' cy='{f(y + R.uniform(-40, 40))}' r='{f(R.uniform(2.5, 5))}' fill='#fffaf3'/>")
    for side in (-1, 1):  # floor urns of greenery and roses at each foot
        fx = ax + side * (r + 30)
        for _ in range(22):
            b.append(leaf(fx, foot - 20, R.uniform(70, 160), R.uniform(14, 24), R.uniform(190, 350), R.choice(greens), '#24331f'))
        for _ in range(6 if side < 0 else 4):
            b.append(rose(fx + R.uniform(-70, 70), foot - 50 - R.uniform(0, 110), R.uniform(26, 46), *R.choice(blush)))
    b.append(f"<rect width='{W}' height='{H}' fill='url(#key)'/>")
    b.append(f"<rect width='{W}' height='{H}' fill='url(#vig)'/>")
    b.append(f"<rect width='{W}' height='{H}' filter='url(#gr)' opacity='.8'/>")
    write('ivory-arch', 'bg.svg', svg(''.join(b), defs))

    m = [f"<path d='M{ax - 140},0 L{ax + 20},0 L{ax + 260},{H} L{ax - 80},{H}Z' fill='#fff8ec' opacity='.3' filter='url(#b30)'/>"]
    for _ in range(34):
        x, y, s = R.uniform(60, 840), R.uniform(200, 1400), R.uniform(9, 18)
        m.append(f"<ellipse cx='{f(x)}' cy='{f(y)}' rx='{f(s)}' ry='{f(s * .55)}' transform='rotate({f(R.uniform(0, 180))} {f(x)} {f(y)})' fill='{R.choice(['#f0c4b8', '#f6d6cc', '#fbe6de'])}'/>")
    write('ivory-arch', 'mid.svg', svg(''.join(m), blur('b30', 30)))

    g = []
    for cx, cy in ((-40, 220), (W + 40, 260), (-60, H - 200), (W + 60, H - 160)):
        for _ in range(14):
            g.append(leaf(cx, cy, R.uniform(120, 230), R.uniform(24, 40), R.uniform(0, 360), R.choice(greens), '#24331f'))
        g.append(rose(cx + (90 if cx < 0 else -90), cy + 40, 58, *blush[0]))
    write('ivory-arch', 'fg.svg', svg(f"<g filter='url(#b8)'>{''.join(g)}</g>", blur('b8', 8) + blur('b4', 4) + blur('b2', 2)))


# ----------------------------------------------------------------------------------------- Coastal Garden

def grass(x, y, h, lean, col, w=2.2):
    return f"<path d='M{f(x)},{f(y)} Q{f(x + lean * .3)},{f(y - h * .6)} {f(x + lean)},{f(y - h)}' stroke='{col}' stroke-width='{f(w)}' fill='none' stroke-linecap='round'/>"


def coastal():
    R = random.Random(37)
    horizon, shore = 610, 930
    defs = (lin('sky', [(0, '#9fc3d1', 1), (.5, '#d6e6e6', 1), (1, '#f8efdc', 1)])
            + lin('sea', [(0, '#3f7f93', 1), (.35, '#3f8a92', 1), (.75, '#4fa7a3', 1), (1, '#8fd0c3', 1)])
            + lin('wet', [(0, '#c9b58f', 1), (1, '#e7d5b0', 1)])
            + lin('sand', [(0, '#ecdcbb', 1), (1, '#d6bd8f', 1)])
            + lin('duneL', [(0, '#e2c995', 1), (1, '#a4895a', 1)], 1, 0, 0, 1)
            + lin('duneR', [(0, '#f0dcae', 1), (1, '#b29667', 1)], 0, 0, 1, 1)
            + rad('sun', [(0, '#fffbea', .95), (.3, '#fff3d0', .4), (1, '#fff3d0', 0)], .72, .18, .55)
            + rad('vig', [(0, '#000', 0), (.64, '#000', 0), (1, '#14262a', .42)], .5, .45, .78)
            + blur('b2', 2) + blur('b3', 3) + blur('b10', 10) + blur('b26', 26) + grain('gr', .045))
    b = [f"<rect width='{W}' height='{H}' fill='url(#sky)'/>", f"<rect width='{W}' height='{H}' fill='url(#sun)'/>"]
    for _ in range(8):
        cx, cy = R.uniform(0, W), R.uniform(120, 480)
        b.append(f"<ellipse cx='{f(cx)}' cy='{f(cy)}' rx='{f(R.uniform(90, 230))}' ry='{f(R.uniform(14, 30))}' fill='#ffffff' opacity='.6' filter='url(#b10)'/>")
    # Two headlands, the far one fainter; a lighthouse-free horizon (ours, not a landmark).
    b.append(f"<path d='M0,{horizon} L0,{horizon - 80} C80,{horizon - 112} 170,{horizon - 64} 280,{horizon - 16} L320,{horizon}Z' fill='#86a4a6' opacity='.6'/>")
    b.append(f"<path d='M{W},{horizon} L{W},{horizon - 46} C{W - 70},{horizon - 58} {W - 140},{horizon - 30} {W - 220},{horizon}Z' fill='#9bb5b4' opacity='.45'/>")
    b.append(f"<rect x='0' y='{horizon}' width='{W}' height='{shore - horizon + 30}' fill='url(#sea)'/>")
    # Swell: broken, uneven strokes, wider and bolder towards the shore.
    for _ in range(420):
        y = horizon + 4 + (shore - horizon) * R.random() ** 1.6
        k = (y - horizon) / (shore - horizon)
        x = R.uniform(-40, W)
        L = 20 + 120 * k
        col = R.choice(['#d6f0ea', '#2f6f80', '#7cc3bb'])
        b.append(f"<path d='M{f(x)},{f(y)} q{f(L / 2)},{f(-2 - 3 * k)} {f(L)},0' stroke='{col}' stroke-width='{f(.6 + 2.2 * k)}' fill='none' opacity='{f(.25 + .35 * k)}'/>")
    for _ in range(90):  # the sun's track on the water
        x, y = 650 + R.gauss(0, 60), horizon + R.uniform(4, 200)
        b.append(f"<ellipse cx='{f(x)}' cy='{f(y)}' rx='{f(R.uniform(3, 14))}' ry='1.3' fill='#fffbe8' opacity='{f(R.uniform(.45, .95))}'/>")
    # A breaking wave line, its foam, the wet sand mirror, then dry sand.
    wave = f"M-20,{shore - 20} C180,{shore - 44} 380,{shore - 6} 560,{shore - 30} S{W + 20},{shore - 18} {W + 20},{shore - 18}"
    b.append(f"<path d='{wave} L{W + 20},{shore + 60} L-20,{shore + 60}Z' fill='url(#wet)'/>")
    b.append(f"<path d='{wave}' stroke='#ffffff' stroke-width='14' fill='none' opacity='.85' filter='url(#b3)'/>")
    for _ in range(60):
        x = R.uniform(0, W)
        b.append(f"<ellipse cx='{f(x)}' cy='{f(shore - 14 + R.uniform(-8, 22))}' rx='{f(R.uniform(10, 40))}' ry='{f(R.uniform(2, 5))}' fill='#ffffff' opacity='{f(R.uniform(.35, .8))}'/>")
    b.append(f"<rect x='0' y='{shore + 12}' width='{W}' height='26' fill='#f4e6c6' opacity='.5' filter='url(#b3)'/>")
    b.append(f"<path d='M-20,{shore + 40} C300,{shore + 26} 600,{shore + 50} {W + 20},{shore + 34} L{W + 20},{H} L-20,{H}Z' fill='url(#sand)'/>")
    # Dunes either side of the path: a lit face towards the sun, a shaded face, a crest.
    dl = f"M-20,{shore + 70} C120,{shore - 10} 250,{shore + 30} 380,{H} L-20,{H}Z"
    dr = f"M{W + 20},{shore + 50} C{W - 140},{shore - 30} {W - 300},{shore + 60} {W - 400},{H} L{W + 20},{H}Z"
    b.append(f"<path d='{dl}' fill='url(#duneL)'/><path d='{dr}' fill='url(#duneR)'/>")
    b.append(f"<path d='M-20,{shore + 70} C120,{shore - 10} 250,{shore + 30} 380,{H}' stroke='#fff2cf' stroke-width='5' fill='none' opacity='.6' filter='url(#b3)'/>")
    b.append(f"<path d='M{W + 20},{shore + 50} C{W - 140},{shore - 30} {W - 300},{shore + 60} {W - 400},{H}' stroke='#fff6da' stroke-width='5' fill='none' opacity='.7' filter='url(#b3)'/>")
    # Footprints down the path.
    for i in range(9):
        t = i / 8
        x = 450 + math.sin(i * 1.3) * 30 + (i % 2) * 18
        y = shore + 80 + t ** 1.4 * 560
        s = 5 + 12 * t
        b.append(f"<ellipse cx='{f(x)}' cy='{f(y)}' rx='{f(s * .5)}' ry='{f(s)}' fill='#b99e70' opacity='.55'/>")
    # Grass in tufts on the dunes (a tuft: blades fanning from one root), denser and taller near.
    for _ in range(170):
        side = R.choice((-1, 1))
        x = R.uniform(-10, 330) if side < 0 else R.uniform(W - 360, W + 10)
        y = R.uniform(shore + 20, H + 40)
        k = (y - shore) / (H - shore)
        for j in range(R.randint(5, 11)):
            h = (24 + 170 * k ** 1.3) * R.uniform(.55, 1.15)
            col = R.choice(['#8d8d55', '#b2a868', '#76824a', '#d6c98a', '#65723f'])
            b.append(grass(x + R.uniform(-4, 4), y, h, R.uniform(-30, 30) - 14 + j * 4, col, .8 + 2.6 * k))
    for _ in range(30):  # garden flowers among the grass
        side = R.choice((-1, 1))
        x = R.uniform(20, 300) if side < 0 else R.uniform(W - 320, W - 20)
        y = R.uniform(shore + 180, H - 80)
        k = (y - shore) / (H - shore)
        s = 10 + 26 * k
        b.append(f"<path d='M{f(x)},{f(y)} L{f(x + R.uniform(-8, 8))},{f(y - s * 3)}' stroke='#65723f' stroke-width='{f(1 + k * 2)}'/>")
        if R.random() < .5:
            for i in range(12):
                t = math.radians(i * 30)
                b.append(f"<ellipse cx='{f(x + math.cos(t) * s * .62)}' cy='{f(y - s * 3 + math.sin(t) * s * .62)}' rx='{f(s * .32)}' ry='{f(s * .14)}' transform='rotate({f(i * 30)} {f(x + math.cos(t) * s * .62)} {f(y - s * 3 + math.sin(t) * s * .62)})' fill='#f8f6f0'/>")
            b.append(f"<circle cx='{f(x)}' cy='{f(y - s * 3)}' r='{f(s * .3)}' fill='#e8c95a'/>")
        else:
            for i in range(10):
                b.append(f"<ellipse cx='{f(x + R.uniform(-2, 2))}' cy='{f(y - s * 2.2 - i * s * .3)}' rx='{f(s * .2 * (1 - i / 14))}' ry='{f(s * .15)}' fill='{R.choice(['#8d79b6', '#a493c9', '#7a68a6'])}'/>")
    b.append(f"<rect width='{W}' height='{H}' fill='url(#vig)'/>")
    b.append(f"<rect width='{W}' height='{H}' filter='url(#gr)' opacity='.8'/>")
    write('coastal-garden', 'bg.svg', svg(''.join(b), defs))

    m = []
    for _ in range(40):
        x, y = R.uniform(40, 860), R.uniform(300, 1300)
        m.append(f"<circle cx='{f(x)}' cy='{f(y)}' r='{f(R.uniform(1.4, 3.6))}' fill='#ffffff' opacity='{f(R.uniform(.4, .9))}' filter='url(#b1)'/>")
    for _ in range(16):
        x, y, s = R.uniform(60, 840), R.uniform(400, 1300), R.uniform(6, 11)
        m.append(f"<ellipse cx='{f(x)}' cy='{f(y)}' rx='{f(s)}' ry='{f(s * .5)}' transform='rotate({f(R.uniform(0, 180))} {f(x)} {f(y)})' fill='#fbf8f0'/>")
    write('coastal-garden', 'mid.svg', svg(''.join(m), blur('b1', 1.2)))

    g = []
    for _ in range(140):
        side = R.choice((-1, 1))
        x = R.uniform(-60, 200) if side < 0 else R.uniform(W - 200, W + 60)
        g.append(grass(x, H + 30, R.uniform(300, 760), side * -R.uniform(40, 160), R.choice(['#7f8049', '#a39c60', '#65723f', '#c3b678']), R.uniform(4, 8)))
    write('coastal-garden', 'fg.svg', svg(f"<g filter='url(#b7)'>{''.join(g)}</g>", blur('b7', 7)))


if __name__ == '__main__':
    vineyard()
    arch()
    coastal()
