"""
Builds The Yes List launch ad kit: docs/marketing/ads/*.svg, a PNG beside each (when Edge or Chrome is
installed, which renders the real fonts), and docs/marketing/index.html (every ad with its copy from
AD_COPY.md, for looking through on a phone).

Run from anywhere:  python docs/marketing/build_kit.py
Edit the words in AD_COPY.md or the ADS list below, then run it again.
"""
from __future__ import annotations

import html
import math
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ADS_DIR = HERE / "ads"

# Brand
D1, D2, D3 = "#1b2218", "#263021", "#3f4f39"
GOLD, GOLD_L = "#c8a46a", "#e6cf9e"
CREAM, CREAM_2 = "#f6f0e2", "#fbf8f2"
INK, SOFT = "#33402f", "#5b6a52"
SEAL = "#9e4f33"
TXT_L = "#f3ecd6"
MUTED_L = "#d9d2bf"

FONTS = (
    "@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400"
    "&amp;family=DM+Sans:wght@400;500;600&amp;display=swap');"
    ".s{font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif}"
    ".n{font-family:'DM Sans','Helvetica Neue',Arial,sans-serif}"
)


def e(t: str) -> str:
    return html.escape(t, quote=False)


# ---------------------------------------------------------------- pieces


def defs(k: str) -> str:
    return f"""<defs>
<radialGradient id="{k}-bg" cx="80%" cy="10%" r="120%"><stop offset="0" stop-color="{D3}"/><stop offset=".55" stop-color="{D2}"/><stop offset="1" stop-color="{D1}"/></radialGradient>
<radialGradient id="{k}-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="{GOLD}" stop-opacity=".35"/><stop offset="1" stop-color="{GOLD}" stop-opacity="0"/></radialGradient>
<radialGradient id="{k}-seal" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#c8714d"/><stop offset=".6" stop-color="{SEAL}"/><stop offset="1" stop-color="#6f321f"/></radialGradient>
<linearGradient id="{k}-front" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ece3cd"/><stop offset="1" stop-color="#ddcfae"/></linearGradient>
<linearGradient id="{k}-flap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1e9d5"/><stop offset="1" stop-color="#d6c7a3"/></linearGradient>
<linearGradient id="{k}-screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{CREAM_2}"/><stop offset="1" stop-color="#efe6d3"/></linearGradient>
<linearGradient id="{k}-foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3e2b5"/><stop offset=".5" stop-color="{GOLD}"/><stop offset="1" stop-color="#a9843f"/></linearGradient>
<filter id="{k}-sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="24" stdDeviation="26" flood-color="#000" flood-opacity=".42"/></filter>
<filter id="{k}-sh2" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#33402f" flood-opacity=".22"/></filter>
</defs>"""


def background(k: str, w: int, h: int) -> str:
    sprig = sprig_path(w - 150, h * 0.18, 1.0, 0.22) + sprig_path(90, h * 0.86, -1.0, 0.18)
    return (
        f'<rect width="{w}" height="{h}" fill="url(#{k}-bg)"/>'
        f'<circle cx="{w*0.12}" cy="{h*0.08}" r="{w*0.42}" fill="url(#{k}-glow)"/>'
        f'<circle cx="{w*0.9}" cy="{h*0.95}" r="{w*0.35}" fill="url(#{k}-glow)" opacity=".6"/>'
        + sprig
    )


def sprig_path(x: float, y: float, d: float, op: float) -> str:
    """A thin eucalyptus sprig: one stem and paired leaves."""
    leaves = []
    for i in range(6):
        t = i / 5
        cx, cy = x + d * 18 * i, y - 34 * i
        for s in (-1, 1):
            rot = (-35 if s < 0 else 35) * d
            leaves.append(
                f'<ellipse cx="{cx + s*16:.0f}" cy="{cy:.0f}" rx="{15 - t*5:.0f}" ry="{8 - t*2:.0f}" '
                f'transform="rotate({rot} {cx + s*16:.0f} {cy:.0f})" fill="#8a9670"/>'
            )
    stem = f'<path d="M{x} {y+20} Q{x + d*50} {y-90} {x + d*95} {y-185}" stroke="#8a9670" stroke-width="3" fill="none"/>'
    return f'<g opacity="{op}">{stem}{"".join(leaves)}</g>'


def logo_mark(x: float, y: float, size: float) -> str:
    s = size / 40
    return f"""<g transform="translate({x} {y}) scale({s})">
<rect x="6" y="5" width="24" height="30" rx="4" fill="{CREAM}" stroke="{INK}" stroke-width="2"/>
<path d="M10.5 13.5 l2.6 2.6 l5-5.4" fill="none" stroke="{GOLD}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M21 13.5 h5.5 M10.5 21 h16 M10.5 27 h11" stroke="{INK}" stroke-width="2" stroke-linecap="round" opacity=".75"/>
<circle cx="31" cy="30" r="6.2" fill="none" stroke="{GOLD}" stroke-width="2.4"/>
<path d="M28.6 23.6 l2.4 -2.6 l2.4 2.6" fill="{GOLD}"/></g>"""


def wordmark(cx: float, y: float, size: float = 46, light: bool = True, anchor: str = "middle") -> str:
    """Mark plus 'The Yes List'; (cx, y) is the centre of the line (or its left edge with anchor=start)."""
    col = TXT_L if light else INK
    mark = size * 1.45
    text_w = size * 4.55
    total = mark + 12 + text_w
    x0 = cx - total / 2 if anchor == "middle" else cx
    return (
        logo_mark(x0, y - mark * 0.62, mark)
        + f'<text x="{x0 + mark + 12}" y="{y + size*0.3}" class="s" font-size="{size}" fill="{col}">'
        f'The <tspan font-style="italic" fill="{GOLD_L if light else "#a9843f"}">Yes</tspan> List</text>'
    )


def seal(cx: float, cy: float, r: float, k: str, mono: str = "A&amp;S") -> str:
    pts = []
    for i in range(96):
        a = i / 96 * 2 * math.pi
        rr = r * (1 + 0.055 * math.sin(7 * a + 0.4) + 0.03 * math.sin(13 * a))
        pts.append(f"{cx + rr*math.cos(a):.1f},{cy + rr*math.sin(a):.1f}")
    return (
        f'<polygon points="{" ".join(pts)}" fill="url(#{k}-seal)" filter="url(#{k}-sh2)"/>'
        f'<circle cx="{cx}" cy="{cy}" r="{r*0.7}" fill="none" stroke="#f6e2d2" stroke-opacity=".35" stroke-width="{r*0.05}"/>'
        f'<text x="{cx}" y="{cy + r*0.2}" text-anchor="middle" class="s" font-size="{r*0.62}" fill="#f6e2d2">{mono}</text>'
    )


def envelope_closed(x: float, y: float, w: float, k: str) -> str:
    h = w * 2 / 3
    return f"""<g filter="url(#{k}-sh)">
<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{w*0.02}" fill="#e6dcc4"/>
<polygon points="{x},{y} {x+w/2},{y+h*0.58} {x+w},{y} {x+w},{y+h} {x},{y+h}" fill="url(#{k}-front)"/>
<polygon points="{x},{y} {x+w},{y} {x+w/2},{y+h*0.62}" fill="url(#{k}-flap)" stroke="#cdbb92" stroke-width="1.5"/>
</g>""" + seal(x + w / 2, y + h * 0.62, w * 0.12, k)


def invite_card(x: float, y: float, w: float, h: float, scale: float = 1.0, button: bool = True, pressed: bool = False) -> str:
    f = scale
    cx = x + w / 2
    btn = ""
    if button:
        bw, bh = 300 * f, 56 * f
        by = y + h - 92 * f
        ring = f'<rect x="{cx-bw/2-8*f}" y="{by-8*f}" width="{bw+16*f}" height="{bh+16*f}" rx="{(bh+16*f)/2}" fill="{GOLD}" opacity=".45"/>' if pressed else ""
        btn = (
            ring
            + f'<rect x="{cx-bw/2}" y="{by}" width="{bw}" height="{bh}" rx="{bh/2}" fill="{INK}"/>'
            f'<text x="{cx}" y="{by + bh*0.64}" text-anchor="middle" class="n" font-size="{22*f}" fill="{CREAM_2}">Yes, we’ll be there</text>'
        )
    return f"""<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{10*f}" fill="#fffdf8" stroke="#eadfc4" stroke-width="1.5"/>
<rect x="{x+16*f}" y="{y+16*f}" width="{w-32*f}" height="{h-32*f}" rx="{6*f}" fill="none" stroke="{GOLD}" stroke-opacity=".55" stroke-width="{1.5*f}"/>
<text x="{cx}" y="{y+70*f}" text-anchor="middle" class="n" font-size="{15*f}" letter-spacing="{4*f}" fill="{GOLD}">TOGETHER WITH THEIR FAMILIES</text>
<text x="{cx}" y="{y+150*f}" text-anchor="middle" class="s" font-size="{64*f}" fill="{INK}">Alex</text>
<text x="{cx}" y="{y+218*f}" text-anchor="middle" class="s" font-style="italic" font-size="{50*f}" fill="#a9843f">&amp; Sam</text>
<text x="{cx}" y="{y+268*f}" text-anchor="middle" class="n" font-size="{20*f}" fill="{INK}">Saturday 13 March · 3pm</text>
<text x="{cx}" y="{y+298*f}" text-anchor="middle" class="n" font-size="{17*f}" fill="{SOFT}">The Old Dairy, Kangaroo Valley</text>
{btn}"""


def envelope_open(x: float, y: float, w: float, k: str, card_rise: float = 0.75, pressed: bool = False) -> str:
    """Flap up, card risen out of the pocket. (x, y) is the envelope's top-left (the fold line)."""
    h = w * 2 / 3
    cw = w * 0.86
    ch = cw * 1.04
    cx0 = x + (w - cw) / 2
    cy0 = y - ch * card_rise + h * 0.12
    f = cw / 440
    return f"""<g filter="url(#{k}-sh)">
<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{w*0.02}" fill="#d9cdaf"/>
<polygon points="{x},{y} {x+w},{y} {x+w/2},{y-h*0.6}" fill="url(#{k}-flap)" stroke="#cdbb92" stroke-width="1.5"/>
</g>
<g filter="url(#{k}-sh2)">{invite_card(cx0, cy0, cw, ch, f, True, pressed)}</g>
<polygon points="{x},{y+h*0.08} {x+w/2},{y+h*0.62} {x+w},{y+h*0.08} {x+w},{y+h} {x},{y+h}" fill="url(#{k}-front)" stroke="#cdbb92" stroke-width="1"/>
"""


def phone(k: str, x: float, y: float, w: float, h: float, inner: str, clip_id: str) -> str:
    r = w * 0.15
    pad = w * 0.04
    sx, sy, sw, sh = x + pad, y + pad, w - 2 * pad, h - 2 * pad
    return f"""<g filter="url(#{k}-sh)">
<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="#151a13" stroke="#3a4236" stroke-width="3"/></g>
<clipPath id="{clip_id}"><rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="{r-pad}"/></clipPath>
<g clip-path="url(#{clip_id})"><rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" fill="url(#{k}-screen)"/>{inner}</g>
<rect x="{x + w/2 - w*0.15}" y="{sy + 12}" width="{w*0.3}" height="{w*0.075}" rx="{w*0.0375}" fill="#151a13"/>"""


def tap(cx: float, cy: float, r: float) -> str:
    return (
        f'<circle cx="{cx}" cy="{cy}" r="{r*1.9}" fill="none" stroke="{GOLD_L}" stroke-width="4" opacity=".35"/>'
        f'<circle cx="{cx}" cy="{cy}" r="{r*1.4}" fill="none" stroke="{GOLD_L}" stroke-width="5" opacity=".6"/>'
        f'<circle cx="{cx}" cy="{cy}" r="{r*0.55}" fill="#fff" opacity=".85"/>'
    )


GUESTS = [
    ("JC", "Jo & Chris", "Coming", "Chris: vegetarian"),
    ("MR", "Aunty Mel", "Coming", "+1 Ray"),
    ("PS", "Priya Shah", "Coming", "Gluten free"),
    ("TE", "Tom & Ellie", "Awaiting", "Reminder sent"),
    ("GR", "Grandma Rose", "Coming", "Table near the door"),
    ("DK", "Dave Kelly", "Declined", "Sends love"),
    ("LN", "Lena & Noor", "Coming", "Vegan ×2"),
]


def guest_list_screen(x: float, y: float, w: float, rows: int = 6, f: float = 1.0, toast: bool = True) -> str:
    """Guest list inside a phone screen whose content area starts at (x, y), width w."""
    out = [
        f'<text x="{x+28*f}" y="{y+70*f}" class="s" font-size="{40*f}" fill="{INK}">Guest list</text>',
    ]
    chips = [("Coming 64", "#e6ecd8", INK), ("Awaiting 12", "#f3e6c7", "#7a5a22"), ("Declined 4", "#efe2dc", "#7d3a24")]
    cx = x + 28 * f
    for label, bg, fg in chips:
        cw = (len(label) * 10.5 + 26) * f
        out.append(f'<rect x="{cx}" y="{y+92*f}" width="{cw}" height="{34*f}" rx="{17*f}" fill="{bg}"/>')
        out.append(f'<text x="{cx + cw/2}" y="{y+114*f}" text-anchor="middle" class="n" font-size="{16*f}" font-weight="600" fill="{fg}">{label}</text>')
        cx += cw + 8 * f
    ry = y + 146 * f
    rh = 78 * f
    for i, (ini, name, st, note) in enumerate(GUESTS[:rows]):
        yy = ry + i * rh
        out.append(f'<rect x="{x+16*f}" y="{yy}" width="{w-32*f}" height="{rh-10*f}" rx="{14*f}" fill="#fff" stroke="#e7dcc2"/>')
        out.append(f'<circle cx="{x+50*f}" cy="{yy+(rh-10*f)/2}" r="{20*f}" fill="#eef1e4"/>')
        out.append(f'<text x="{x+50*f}" y="{yy+(rh-10*f)/2+6*f}" text-anchor="middle" class="n" font-size="{15*f}" font-weight="600" fill="{INK}">{ini}</text>')
        out.append(f'<text x="{x+82*f}" y="{yy+30*f}" class="n" font-size="{19*f}" font-weight="600" fill="{INK}">{e(name)}</text>')
        out.append(f'<text x="{x+82*f}" y="{yy+54*f}" class="n" font-size="{15*f}" fill="{SOFT}">{e(note)}</text>')
        px = x + w - 30 * f
        if st == "Coming":
            out.append(f'<circle cx="{px-14*f}" cy="{yy+(rh-10*f)/2}" r="{16*f}" fill="{INK}"/>')
            out.append(f'<path d="M{px-21*f} {yy+(rh-10*f)/2} l{5*f} {5*f} l{10*f} -{10*f}" stroke="{GOLD_L}" stroke-width="{3.2*f}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
        elif st == "Awaiting":
            out.append(f'<circle cx="{px-14*f}" cy="{yy+(rh-10*f)/2}" r="{16*f}" fill="none" stroke="{GOLD}" stroke-width="{3*f}" stroke-dasharray="{5*f} {4*f}"/>')
        else:
            out.append(f'<circle cx="{px-14*f}" cy="{yy+(rh-10*f)/2}" r="{16*f}" fill="#efe2dc"/>')
            out.append(f'<path d="M{px-20*f} {yy+(rh-10*f)/2} h{12*f}" stroke="#7d3a24" stroke-width="{3*f}" stroke-linecap="round"/>')
    if toast:
        ty = ry + rows * rh + 14 * f
        out.append(f'<rect x="{x+16*f}" y="{ty}" width="{w-32*f}" height="{64*f}" rx="{18*f}" fill="{INK}"/>')
        out.append(f'<text x="{x+w/2}" y="{ty+40*f}" text-anchor="middle" class="n" font-size="{17*f}" fill="{CREAM_2}">✓ New reply: Lena &amp; Noor are coming</text>')
    return "".join(out)


def seating_screen(x: float, y: float, w: float, f: float = 1.0) -> str:
    out = [f'<text x="{x+28*f}" y="{y+70*f}" class="s" font-size="{40*f}" fill="{INK}">Seating</text>']
    # rule chip
    out.append(f'<rect x="{x+24*f}" y="{y+96*f}" width="{w-48*f}" height="{50*f}" rx="{14*f}" fill="#e6ecd8"/>')
    out.append(f'<text x="{x+44*f}" y="{y+128*f}" class="n" font-size="{17*f}" fill="{INK}">✓ Rule kept: Dave and Sue apart</text>')
    tables = [(0.3, 0.33), (0.72, 0.33), (0.3, 0.62), (0.72, 0.62)]
    th = 760 * f
    for i, (tx, ty) in enumerate(tables):
        cx, cy = x + w * tx, y + 120 * f + th * ty
        out.append(f'<circle cx="{cx}" cy="{cy}" r="{52*f}" fill="#fff" stroke="{INK}" stroke-width="{2.5*f}"/>')
        out.append(f'<text x="{cx}" y="{cy+8*f}" text-anchor="middle" class="s" font-size="{26*f}" fill="{INK}">{i+1}</text>')
        for j in range(8):
            a = j / 8 * 2 * math.pi - math.pi / 2
            col = GOLD if (i + j) % 3 == 0 else "#8a9670"
            out.append(f'<circle cx="{cx + 80*f*math.cos(a):.1f}" cy="{cy + 80*f*math.sin(a):.1f}" r="{14*f}" fill="{col}"/>')
    by = y + 120 * f + th * 0.86
    bw = 280 * f
    out.append(f'<rect x="{x + w/2 - bw/2}" y="{by}" width="{bw}" height="{62*f}" rx="{31*f}" fill="{INK}"/>')
    out.append(f'<text x="{x + w/2}" y="{by+40*f}" text-anchor="middle" class="n" font-size="{21*f}" font-weight="600" fill="{GOLD_L}">✦ Auto-seat</text>')
    return "".join(out)


def headline(lines: list[str], x: float, y: float, size: float, color: str = TXT_L, anchor: str = "middle", lh: float = 1.06, italic_gold: str | None = None) -> str:
    out = []
    for i, ln in enumerate(lines):
        t = e(ln)
        if italic_gold and italic_gold in ln:
            t = t.replace(e(italic_gold), f'<tspan font-style="italic" fill="url(#__FOIL__)">{e(italic_gold)}</tspan>')
        out.append(f'<text x="{x}" y="{y + i*size*lh}" text-anchor="{anchor}" class="s" font-size="{size}" fill="{color}">{t}</text>')
    return "".join(out)


def sub(text: str, x: float, y: float, size: float = 36, color: str = MUTED_L, anchor: str = "middle", weight: int = 400) -> str:
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" class="n" font-size="{size}" font-weight="{weight}" fill="{color}">{e(text)}</text>'


def pill(text: str, cx: float, y: float, size: float = 34, fill: str = GOLD_L, color: str = D1, pad: float = 44) -> str:
    w = len(text) * size * 0.56 + pad * 2
    h = size * 2.1
    return (
        f'<rect x="{cx - w/2}" y="{y}" width="{w}" height="{h}" rx="{h/2}" fill="{fill}"/>'
        f'<text x="{cx}" y="{y + h*0.64}" text-anchor="middle" class="n" font-size="{size}" font-weight="600" fill="{color}">{e(text)}</text>'
    )


def kicker(text: str, cx: float, y: float, size: float = 24) -> str:
    w = len(text) * size * 0.72 + 48
    return (
        f'<rect x="{cx - w/2}" y="{y}" width="{w}" height="{size*2}" rx="{size}" fill="none" stroke="{GOLD}" stroke-opacity=".7" stroke-width="2"/>'
        f'<text x="{cx}" y="{y + size*1.35}" text-anchor="middle" class="n" font-size="{size}" letter-spacing="{size*0.16}" fill="{GOLD_L}">{e(text.upper())}</text>'
    )


def price_card(k: str, cx: float, y: float, w: float, title: str, price: str, line: str, items: list[str], f: float = 1.0) -> str:
    h = (300 + 64 * len(items) + 80) * f
    x = cx - w / 2
    out = [
        f'<g filter="url(#{k}-sh)"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{36*f}" fill="{CREAM_2}"/></g>',
        f'<rect x="{x+18*f}" y="{y+18*f}" width="{w-36*f}" height="{h-36*f}" rx="{24*f}" fill="none" stroke="{GOLD}" stroke-opacity=".6" stroke-width="2"/>',
        f'<text x="{cx}" y="{y+82*f}" text-anchor="middle" class="n" font-size="{24*f}" letter-spacing="{5*f}" fill="#a9843f">{e(title.upper())}</text>',
        f'<text x="{cx}" y="{y+228*f}" text-anchor="middle" class="s" font-size="{170*f}" fill="{INK}">{e(price)}</text>',
        f'<text x="{cx}" y="{y+290*f}" text-anchor="middle" class="s" font-style="italic" font-size="{44*f}" fill="#a9843f">{e(line)}</text>',
    ]
    for i, it in enumerate(items):
        yy = y + (366 + i * 64) * f
        out.append(f'<path d="M{x+80*f} {yy-10*f} l{9*f} {9*f} l{18*f} -{19*f}" stroke="{GOLD}" stroke-width="{4.5*f}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
        out.append(f'<text x="{x+124*f}" y="{yy}" class="n" font-size="{31*f}" fill="{INK}">{e(it)}</text>')
    return "".join(out)


def svg(k: str, w: int, h: int, title: str, body: str) -> str:
    body = body.replace("__FOIL__", f"{k}-foil")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{e(title)}">'
        f"<title>{e(title)}</title><style>{FONTS}</style>{defs(k)}{background(k, w, h)}{body}</svg>\n"
    )


# ---------------------------------------------------------------- the ten ads
SQ, VW, VH = 1080, 1080, 1920


def s1_seal() -> str:
    k = "s1"
    b = kicker("Wedding invitations", SQ / 2, 84)
    b += headline(["The invitation they’ll", "actually open."], SQ / 2, 250, 96, italic_gold="actually")
    b += envelope_closed(250, 450, 580, k)
    b += sub("Wax-sealed, on their phone. From free.", SQ / 2, 930, 36)
    b += wordmark(SQ / 2, 1012, 40)
    return svg(k, SQ, SQ, "The invitation they'll actually open: a wax-sealed envelope", b)


def s2_list() -> str:
    k = "s2"
    b = headline(["Every", "reply.", "One list."], 70, 210, 104, anchor="start", italic_gold="One list.")
    b += sub("Plus-ones and dietary", 72, 560, 34, anchor="start", color=TXT_L)
    b += sub("needs land there too.", 72, 606, 34, anchor="start", color=TXT_L)
    b += wordmark(72, 1000, 38, anchor="start")
    pw, ph = 450, 960
    px, py = 590, 140
    inner = guest_list_screen(px + 18, py + 60, pw - 36, rows=7, f=0.93, toast=True)
    b += phone(k, px, py, pw, ph, inner, f"{k}-clip")
    return svg(k, SQ, SQ, "Every reply, one list: a phone showing the guest list filling in", b)


def s3_price() -> str:
    k = "s3"
    b = price_card(k, SQ / 2, 120, 760, "Essentials · whole wedding", "$88", "once · everything",
                   ["Invitation, RSVPs, reminders", "Seating plan and auto-seat", "Budget, payments, vendors"], f=1.0)
    b += sub("Not a subscription. Start free.", SQ / 2, 820, 38, color=TXT_L, weight=500)
    b += wordmark(SQ / 2, 960, 42)
    return svg(k, SQ, SQ, "$88 once, everything: the Essentials price card", b)


def s4_free() -> str:
    k = "s4"
    b = headline(["From", "free."], 70, 230, 150, anchor="start", italic_gold="free.")
    b += sub("Free for up to 50 guests.", 74, 470, 36, anchor="start", color=TXT_L, weight=500)
    b += sub("A$88 once when you need more.", 74, 522, 30, anchor="start")
    b += wordmark(72, 1000, 38, anchor="start")
    b += envelope_open(570, 640, 440, k, card_rise=0.95)
    return svg(k, SQ, SQ, "From free: an opened envelope with the invitation card risen out", b)


def s5_partner() -> str:
    k = "s5"
    b = kicker("For celebrants & planners", SQ / 2, 80)
    b += headline(["10% off", "for your couples."], SQ / 2, 300, 118, italic_gold="10% off")
    b += sub("With your own partner code.", SQ / 2, 500, 36, color=TXT_L, weight=500)
    # gift tag card
    cx, cy, cw, ch = SQ / 2, 580, 640, 250
    b += f'<g filter="url(#{k}-sh)"><rect x="{cx-cw/2}" y="{cy}" width="{cw}" height="{ch}" rx="28" fill="{CREAM_2}"/></g>'
    b += f'<rect x="{cx-cw/2+16}" y="{cy+16}" width="{cw-32}" height="{ch-32}" rx="18" fill="none" stroke="{GOLD}" stroke-dasharray="10 8" stroke-width="2"/>'
    b += f'<text x="{cx}" y="{cy+82}" text-anchor="middle" class="n" font-size="24" letter-spacing="5" fill="#a9843f">AND FOR YOU</text>'
    b += f'<text x="{cx}" y="{cy+158}" text-anchor="middle" class="s" font-size="64" fill="{INK}">Free <tspan font-style="italic" fill="#a9843f">Deluxe</tspan></text>'
    b += f'<text x="{cx}" y="{cy+206}" text-anchor="middle" class="n" font-size="28" fill="{SOFT}">for your own events</text>'
    b += seal(cx + cw / 2 - 30, cy + 20, 50, k, "YL")
    b += wordmark(SQ / 2, 1000, 40)
    return svg(k, SQ, SQ, "Partner offer for celebrants and planners: 10% off for their couples, free Deluxe for them", b)


def v_frame_text(b: str) -> str:
    return b


def v1_seal() -> str:
    k = "v1"
    b = headline(["Guests reply", "in one tap."], VW / 2, 340, 120, italic_gold="one tap.")
    pw, ph = 600, 1130
    px, py = (VW - pw) / 2, 500
    sx, sw = px + 24, pw - 48
    inner = (
        f'<text x="{VW/2}" y="{py+170}" text-anchor="middle" class="s" font-size="40" fill="{INK}">For Jo &amp; Chris</text>'
        + envelope_open(sx + 40, py + 640, sw - 80, k, card_rise=0.92, pressed=True)
    )
    b += phone(k, px, py, pw, ph, inner, f"{k}-clip")
    # tap on the Yes button
    cw = (sw - 80) * 0.86
    ch = cw * 1.04
    f = cw / 440
    cy0 = py + 640 - ch * 0.92 + (sw - 80) * 2 / 3 * 0.12
    b += tap(VW / 2 + 150, cy0 + ch - 92 * f + 30 * f, 20)
    b += wordmark(VW / 2, 1745, 48)
    return svg(k, VW, VH, "Guests reply in one tap: the invitation open on a phone and the Yes button tapped", b)


def v2_list() -> str:
    k = "v2"
    b = headline(["Every reply lands", "in one list."], VW / 2, 330, 108, italic_gold="one list.")
    b += sub("Replies · plus-ones · dietary needs", VW / 2, 500, 38, color=TXT_L)
    pw, ph = 640, 1050
    px, py = (VW - pw) / 2, 580
    inner = guest_list_screen(px + 24, py + 70, pw - 48, rows=6, f=1.2, toast=True)
    b += phone(k, px, py, pw, ph, inner, f"{k}-clip")
    b += wordmark(VW / 2, 1745, 48)
    return svg(k, VW, VH, "Every reply lands in one list: a phone with the guest list filling in", b)


def v3_compare() -> str:
    k = "v3"
    b = kicker("Animated invitations", VW / 2, 280, 28)
    b += headline(["Elsewhere, the", "invitation alone*", "is about"], VW / 2, 440, 88)
    b += headline(["A$170–189"], VW / 2, 740, 150, color=GOLD_L)
    b += f'<line x1="200" y1="820" x2="880" y2="820" stroke="{GOLD}" stroke-opacity=".5" stroke-width="2"/>'
    b += headline(["Ours: A$88 once."], VW / 2, 950, 104)
    b += sub("Invitation, RSVPs, seating and budget.", VW / 2, 1030, 38, color=TXT_L)
    b += sub("*Typical published price of an animated invitation,", VW / 2, 1100, 26)
    b += sub("wooowinvites.com, Nov 2026. Features differ.", VW / 2, 1138, 26)
    b += envelope_closed(VW / 2 - 180, 1210, 360, k)
    b += wordmark(VW / 2, 1560, 48)
    return svg(k, VW, VH, "Animated invitation elsewhere about A$170 to 189 (wooowinvites.com, Nov 2026); The Yes List A$88 once", b)


def v4_seating() -> str:
    k = "v4"
    b = headline(["Seating that", "keeps the rules."], VW / 2, 330, 112, italic_gold="the rules.")
    b += sub("Then press auto-seat.", VW / 2, 510, 40, color=TXT_L)
    pw, ph = 640, 1020
    px, py = (VW - pw) / 2, 590
    inner = seating_screen(px + 24, py + 70, pw - 48, f=1.1)
    b += phone(k, px, py, pw, ph, inner, f"{k}-clip")
    b += wordmark(VW / 2, 1745, 48)
    return svg(k, VW, VH, "Seating that keeps the rules: tables on a phone and the auto-seat button", b)


def v5_price() -> str:
    k = "v5"
    b = kicker("One price · whole wedding", VW / 2, 290, 28)
    b += price_card(k, VW / 2, 420, 860, "Essentials", "$88", "once · everything",
                    ["Animated invitation", "RSVPs and reminders", "Seating plan", "Budget and vendors"], f=1.1)
    b += headline(["From free. Not a subscription."], VW / 2, 1270, 60)
    b += sub("Australian-made", VW / 2, 1345, 34, color=GOLD_L, weight=500)
    b += wordmark(VW / 2, 1490, 48)
    return svg(k, VW, VH, "$88 once, everything: the price card in Stories format", b)


ADS = [
    ("S1", "s1-seal", "Square 1080×1080", "The seal", s1_seal),
    ("S2", "s2-guest-list", "Square 1080×1080", "Every reply, one list", s2_list),
    ("S3", "s3-price", "Square 1080×1080", "$88 once · everything", s3_price),
    ("S4", "s4-from-free", "Square 1080×1080", "From free", s4_free),
    ("S5", "s5-partner", "Square 1080×1080", "Partner offer (celebrants, planners)", s5_partner),
    ("V1", "v1-one-tap", "Vertical 1080×1920", "Guests reply in one tap", v1_seal),
    ("V2", "v2-guest-list", "Vertical 1080×1920", "Every reply lands in one list", v2_list),
    ("V3", "v3-compare", "Vertical 1080×1920", "Sourced price comparison", v3_compare),
    ("V4", "v4-seating", "Vertical 1080×1920", "Seating that keeps the rules", v4_seating),
    ("V5", "v5-price", "Vertical 1080×1920", "$88 once · everything (Stories)", v5_price),
]


# ---------------------------------------------------------------- PNGs (optional)


def find_browser() -> str | None:
    for p in (
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ):
        if os.path.exists(p):
            return p
    for name in ("chromium", "google-chrome", "chrome", "msedge"):
        if shutil.which(name):
            return shutil.which(name)
    return None


def render_pngs(files: list[tuple[Path, int, int]]) -> int:
    try:
        import cairosvg  # type: ignore

        for svg_path, w, h in files:
            cairosvg.svg2png(url=str(svg_path), write_to=str(svg_path.with_suffix(".png")), output_width=w, output_height=h)
        return len(files)
    except Exception:
        pass
    br = find_browser()
    if not br:
        return 0
    done = 0
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as td:
        for svg_path, w, h in files:
            page = Path(td) / (svg_path.stem + ".html")
            page.write_text(
                "<!doctype html><meta charset=utf-8><style>html,body{margin:0;overflow:hidden;background:#1b2218}</style>"
                + svg_path.read_text(encoding="utf-8"),
                encoding="utf-8",
            )
            out = svg_path.with_suffix(".png")
            out.unlink(missing_ok=True)
            for _ in range(3):
                if out.exists():
                    break
                subprocess.run(
                    [br, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--user-data-dir={td}/prof-{svg_path.stem}",
                     f"--window-size={w},{h}", "--virtual-time-budget=6000", f"--screenshot={out}", page.as_uri()],
                    capture_output=True, timeout=90,
                )
            done += out.exists()
    return done


# ---------------------------------------------------------------- index.html


def md_inline(t: str) -> str:
    t = html.escape(t, quote=False)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2">\1</a>', t)
    return t


def md_to_html(md: str) -> str:
    out: list[str] = []
    lines = md.strip("\n").split("\n")
    i = 0
    while i < len(lines):
        ln = lines[i]
        if ln.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip("|").split("|")]
                if not all(re.fullmatch(r":?-+:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            t = "<div class=tbl><table>"
            for r, cells in enumerate(rows):
                tag = "th" if r == 0 else "td"
                t += "<tr>" + "".join(f"<{tag}>{md_inline(c)}</{tag}>" for c in cells) + "</tr>"
            out.append(t + "</table></div>")
            continue
        if ln.startswith("- "):
            items: list[list[str]] = []
            while i < len(lines) and lines[i].startswith(("- ", "  ")):
                cur = lines[i]
                if cur.startswith("- "):
                    items.append([cur[2:]])
                elif cur.strip().startswith("- "):
                    items[-1].append(cur.strip()[2:])
                else:
                    items[-1][-1] += " " + cur.strip()
                i += 1
            lis = []
            for it in items:
                subl = "".join(f"<li>{md_inline(x)}</li>" for x in it[1:])
                lis.append(f"<li>{md_inline(it[0])}" + (f"<ul>{subl}</ul>" if subl else "") + "</li>")
            out.append("<ul>" + "".join(lis) + "</ul>")
            continue
        m = re.match(r"(#{3,4}) (.*)", ln)
        if m:
            out.append(f"<h4>{md_inline(m.group(2))}</h4>")
        elif ln.strip():
            out.append(f"<p>{md_inline(ln)}</p>")
        i += 1
    return "\n".join(out)


def copy_sections() -> dict[str, tuple[str, str]]:
    """'## S1 · Title' sections from AD_COPY.md, keyed by id: (title, html)."""
    path = HERE / "AD_COPY.md"
    if not path.exists():
        return {}
    parts = re.split(r"^## ", path.read_text(encoding="utf-8"), flags=re.M)
    out = {}
    for p in parts[1:]:
        head, _, body = p.partition("\n")
        m = re.match(r"([SVR]\d) · (.*)", head.strip())
        if m:
            out[m.group(1)] = (m.group(2), md_to_html(body))
    return out


DOCS = [
    ("AD_COPY.md", "Ad copy", "Primary text, headlines, CTAs, audiences, A/B variants, 3 retargeting ads"),
    ("VIDEO_SCRIPTS.md", "Video scripts", "6 vertical videos, 7–20 s, shot by shot"),
    ("CONTENT_CALENDAR.md", "Content calendar", "6 weeks of posts, partner days, the A$10/day ad test"),
    ("PARTNER_KIT.md", "Partner kit", "Emails for celebrants, planners, venues, photographers; the offer; follow-ups"),
]
GH = "https://github.com/nicholasdale88-lgtm/wedding-platform/blob/main/docs/marketing/"

PAGE_CSS = """
:root{--bg:#f6f0e2;--card:#fffdf8;--ink:#33402f;--soft:#5b6a52;--line:#e2d7bc;--gold:#a9843f;--chip:#eef1e4;--code:#f1ead8}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#161c14;--card:#1f271b;--ink:#f3ecd6;--soft:#c9c2ad;--line:#36412f;--gold:#e6cf9e;--chip:#2a3425;--code:#2a3425}}
:root[data-theme=dark]{--bg:#161c14;--card:#1f271b;--ink:#f3ecd6;--soft:#c9c2ad;--line:#36412f;--gold:#e6cf9e;--chip:#2a3425;--code:#2a3425}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 'DM Sans','Helvetica Neue',Arial,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:0 16px 64px}
header{background:#1b2218;color:#f3ecd6;padding:28px 16px 32px}
header .in{max-width:1180px;margin:0 auto}
h1,h2,h3{font-family:'Cormorant Garamond',Georgia,serif;font-weight:400;margin:0}
h1{font-size:clamp(34px,6vw,52px);line-height:1.05}h1 em{color:#e6cf9e}
header p{color:#d9d2bf;margin:10px 0 0;max-width:720px}
.docs{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));margin:24px 0}
.doc{display:block;padding:16px;border-radius:16px;background:var(--card);border:1px solid var(--line);color:var(--ink);text-decoration:none}
.doc strong{display:block;font-size:17px}.doc span{color:var(--soft);font-size:14px}.doc small{display:block;margin-top:6px;color:var(--gold)}
.todo{padding:16px 18px;border-radius:16px;background:var(--chip);margin:8px 0 28px}.todo h2{font-size:26px}.todo ol{margin:8px 0 0;padding-left:20px}
h2.sec{font-size:clamp(28px,4.5vw,38px);margin:36px 0 14px}
.ad{display:grid;gap:20px;grid-template-columns:minmax(0,1fr);padding:18px;border-radius:20px;background:var(--card);border:1px solid var(--line);margin:0 0 20px}
@media (min-width:860px){.ad{grid-template-columns:minmax(0,420px) minmax(0,1fr)}}
.art svg{display:block;width:100%;height:auto;border-radius:12px}
.art.tall{max-width:360px;margin:0 auto;width:100%}
.meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 6px}
.id{font-weight:600;background:#1b2218;color:#e6cf9e;border-radius:999px;padding:2px 10px;font-size:13px}
.fmt{color:var(--soft);font-size:13px}
.ad h3{font-size:28px;line-height:1.15;margin:0 0 6px}
.files{font-size:14px;margin:8px 0 0}.files a{color:var(--gold)}
.copy h4{font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:600;margin:14px 0 4px}
.copy p,.copy ul{margin:4px 0}.copy ul{padding-left:20px}.copy li{margin:2px 0}
code{background:var(--code);padding:1px 5px;border-radius:5px;font-size:.9em;word-break:break-all}
.tbl{overflow-x:auto}table{border-collapse:collapse;font-size:14px;min-width:100%}td,th{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
a{color:var(--gold)}
footer{color:var(--soft);font-size:14px;margin-top:40px}
"""


def build_index(svgs: dict[str, str], pngs: bool) -> str:
    copy = copy_sections()
    ad_html = []
    for aid, slug, fmt, title, _ in ADS:
        tall = aid.startswith("V")
        ct = copy.get(aid, (title, "<p>Copy: see AD_COPY.md.</p>"))
        files = f'<a href="ads/{slug}.svg">SVG</a>' + (f' · <a href="ads/{slug}.png">PNG (upload this to Meta)</a>' if pngs else "")
        svg_inline = re.sub(r"^<svg ", '<svg focusable="false" ', svgs[aid])
        ad_html.append(
            f'<article class="ad" id="{aid}"><div class="art{" tall" if tall else ""}">{svg_inline}</div>'
            f'<div class="copy"><div class="meta"><span class="id">{aid}</span><span class="fmt">{fmt}</span></div>'
            f"<h3>{md_inline(ct[0])}</h3><p class=files>{files}</p>{ct[1]}</div></article>"
        )
    retarget = "".join(
        f'<article class="ad" id="{rid}" style="grid-template-columns:1fr"><div class="copy"><div class="meta"><span class="id">{rid}</span>'
        f'<span class="fmt">Retargeting · reuses an ad above</span></div><h3>{md_inline(copy[rid][0])}</h3>{copy[rid][1]}</div></article>'
        for rid in ("R1", "R2", "R3") if rid in copy
    )
    docs = "".join(
        f'<a class="doc" href="{f}"><strong>{t}</strong><span>{d}</span><small>Open · or on GitHub ↓</small></a>'
        for f, t, d in DOCS
    )
    gh = " · ".join(f'<a href="{GH}{f}">{t}</a>' for f, t, _ in DOCS)
    return f"""<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Yes List Launch Kit</title>
<meta name="color-scheme" content="light dark">
<style>@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@400;500;600&display=swap');{PAGE_CSS}</style>
</head><body>
<header><div class="in"><h1>The Yes List · <em>launch kit</em></h1>
<p>Ten ads with their copy, six video scripts, six weeks of posts and the partner emails. Prices: Free up to 50 guests, Essentials A$88 and Deluxe A$98 once per wedding, extra event A$39.</p></div></header>
<main class="wrap">
<div class="docs">{docs}</div>
<p style="font-size:14px;color:var(--soft)">On GitHub: {gh}</p>
<section class="todo"><h2>Before the first ad runs</h2><ol>
<li>Create the ads in Meta Ads Manager with the PNGs from <code>docs/marketing/ads/</code> and the copy below. Meta doesn’t take SVG.</li>
<li>Send every ad to the front page with its own link (shown in each ad’s copy) so Company portal → Promote counts sign-ups per ad. The front page has the “Open a sample invitation” button.</li>
<li>Check that the sign-up tracking (FACEBOOK_ADS_PLAN.md section 7) is live, or judge the ads by the <code>?ref=</code> counts in Promote.</li>
<li>Film the six videos (VIDEO_SCRIPTS.md) on your phone with /demo and the app.</li>
<li>Make the partner codes and the launch code in Company portal → Promote.</li>
</ol></section>
<h2 class="sec">Ads and copy</h2>
{"".join(ad_html)}
<h2 class="sec">Retargeting (couples who signed up free)</h2>
{retarget}
<footer>Built by docs/marketing/build_kit.py from AD_COPY.md. The comparison ad (V3) quotes wooowinvites.com’s published prices, checked Nov 2026: check them again before it runs, and keep a screenshot.</footer>
</main></body></html>
"""


def main() -> None:
    ADS_DIR.mkdir(parents=True, exist_ok=True)
    svgs: dict[str, str] = {}
    files = []
    for aid, slug, fmt, _, fn in ADS:
        s = fn()
        svgs[aid] = s
        p = ADS_DIR / f"{slug}.svg"
        p.write_text(s, encoding="utf-8")
        files.append((p, 1080, 1080 if aid.startswith("S") else 1920))
    n = 0 if os.environ.get("NO_PNG") else render_pngs(files)
    (HERE / "index.html").write_text(build_index(svgs, n == len(files)), encoding="utf-8")
    print(f"{len(files)} SVGs, {n} PNGs, index.html")


if __name__ == "__main__":
    main()
