#!/usr/bin/env python3
"""Generate the self-hosted SVG assets used by the profile READMEs.

Every image is a static SVG committed to `assets/`, so the profile does not
depend on third-party card services. Run from the repo root:

    python3 scripts/generate_assets.py
"""

import math
import random
from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).resolve().parent.parent / "assets"

SANS = "'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Ubuntu, Arial, sans-serif"
MONO = "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, 'DejaVu Sans Mono', 'Liberation Mono', monospace"

BG_0 = "#0b0f1e"
BG_1 = "#141a33"
INK = "#e6e9f5"
MUTED = "#8b93b8"
ACCENT = "#7aa2f7"
ACCENT_2 = "#bb9af7"
ACCENT_3 = "#7dcfff"
GREEN = "#9ece6a"
ORANGE = "#ff9e64"

# --------------------------------------------------------------------------
# Localised copy
# --------------------------------------------------------------------------

TEXT = {
    "fr": {
        "prompt": "~/fadi $ ./bonjour --lang=fr",
        "role": "Développeur Web & Jeux vidéo",
        "tagline": "Passionné de graphismes 3D, de rendu temps réel",
        "tagline2": "et de génération procédurale.",
        "chips": ["Web full-stack", "Game dev", "3D", "Procédural"],
        "place": "Strasbourg · France",
        "caption": "île générée procéduralement · seed 1089",
        "cube_alt": "Rubik’s Cube animé qui tourne sans arrêt",
        "about": [
            ("Rôle", "Développeur Web & Jeux vidéo"),
            ("Études", "BUT Informatique · IUT Robert Schuman"),
            ("Lieu", "Strasbourg, France"),
            ("Web", "TypeScript · React · Next.js · Tailwind"),
            ("Back-end", "Bun · Hono · Express · Prisma · PostgreSQL"),
            ("Jeux & 3D", "C# · Blender · Python · Java"),
            ("Systèmes", "C · Linux · réseau"),
            ("Passions", "Rendu 3D · Procédural · Game design"),
            ("Langues", "Français · English · Deutsch"),
            ("Contact", "fadi.sultan.dev@gmail.com"),
        ],
        "projects": {
            "cvie": ("WEB · FULL-STACK", "Plateforme de CV gratuite et open source,",
                     "compatible ATS, avec export PDF et liens portfolio."),
            "formio": ("WEB · FULL-STACK", "Alternative à Google Forms avec clips audio,",
                       "publication par lien public et statistiques."),
            "wfc": ("3D · ADD-ON BLENDER", "Génère des terrains 3D modulaires avec",
                    "l’algorithme Wave Function Collapse."),
            "adeli": ("JEU VIDÉO · EN DÉVELOPPEMENT", "Jeu de gestion de colonie en Antarctique :",
                      "ressources, équipe, missions et survie."),
            "rubik": ("WEB · 3D · JEU", "Un Rubik’s Cube 3D jouable dans le navigateur,",
                      "avec chrono, guides et solveur pas à pas."),
        },
    },
    "en": {
        "prompt": "~/fadi $ ./hello --lang=en",
        "role": "Web & Game Developer",
        "tagline": "Into 3D graphics, real-time rendering",
        "tagline2": "and procedural generation.",
        "chips": ["Full-stack web", "Game dev", "3D", "Procedural"],
        "place": "Strasbourg · France",
        "caption": "procedurally generated island · seed 1089",
        "cube_alt": "animated Rubik’s Cube turning at random",
        "about": [
            ("Role", "Web & Game Developer"),
            ("Studies", "BUT Informatique (CS) · IUT Robert Schuman"),
            ("Location", "Strasbourg, France"),
            ("Web", "TypeScript · React · Next.js · Tailwind"),
            ("Back-end", "Bun · Hono · Express · Prisma · PostgreSQL"),
            ("Games & 3D", "C# · Blender · Python · Java"),
            ("Systems", "C · Linux · networking"),
            ("Passions", "3D rendering · Procedural · Game design"),
            ("Languages", "Français · English · Deutsch"),
            ("Contact", "fadi.sultan.dev@gmail.com"),
        ],
        "projects": {
            "cvie": ("WEB · FULL-STACK", "Free, open-source, ATS-friendly CV platform",
                     "with PDF export and portfolio links."),
            "formio": ("WEB · FULL-STACK", "A Google Forms alternative with audio clips,",
                       "public share links and analytics."),
            "wfc": ("3D · BLENDER ADD-ON", "Builds modular 3D terrains with the",
                    "Wave Function Collapse algorithm."),
            "adeli": ("VIDEO GAME · IN DEVELOPMENT", "Colony management game set in Antarctica:",
                      "resources, staff, missions and survival."),
            "rubik": ("WEB · 3D · GAME", "A 3D Rubik’s Cube you can play in the browser,",
                      "with a timer, guides and a step-by-step solver."),
        },
    },
    "de": {
        "prompt": "~/fadi $ ./hallo --lang=de",
        "role": "Web- & Spieleentwickler",
        "tagline": "Begeistert von 3D-Grafik, Echtzeit-Rendering",
        "tagline2": "und prozeduraler Generierung.",
        "chips": ["Full-Stack-Web", "Game Dev", "3D", "Prozedural"],
        "place": "Straßburg · Frankreich",
        "caption": "prozedural generierte Insel · Seed 1089",
        "cube_alt": "animierter Rubik’s Cube, der sich ständig dreht",
        "about": [
            ("Rolle", "Web- & Spieleentwickler"),
            ("Studium", "BUT Informatique · IUT Robert Schuman"),
            ("Ort", "Straßburg, Frankreich"),
            ("Web", "TypeScript · React · Next.js · Tailwind"),
            ("Back-end", "Bun · Hono · Express · Prisma · PostgreSQL"),
            ("Spiele & 3D", "C# · Blender · Python · Java"),
            ("Systeme", "C · Linux · Netzwerke"),
            ("Leidenschaft", "3D-Rendering · Prozedural · Game Design"),
            ("Sprachen", "Français · English · Deutsch"),
            ("Kontakt", "fadi.sultan.dev@gmail.com"),
        ],
        "projects": {
            "cvie": ("WEB · FULL-STACK", "Kostenlose Open-Source-Lebenslauf-Plattform,",
                     "ATS-kompatibel, mit PDF-Export und Portfolio-Links."),
            "formio": ("WEB · FULL-STACK", "Google-Forms-Alternative mit Audioclips,",
                       "öffentlichen Links und Statistiken."),
            "wfc": ("3D · BLENDER-ADD-ON", "Erzeugt modulare 3D-Landschaften mit dem",
                    "Wave-Function-Collapse-Algorithmus."),
            "adeli": ("VIDEOSPIEL · IN ENTWICKLUNG", "Kolonie-Management-Spiel in der Antarktis:",
                      "Ressourcen, Personal, Missionen, Überleben."),
            "rubik": ("WEB · 3D · SPIEL", "Ein 3D-Rubik’s-Cube zum Spielen im Browser,",
                      "mit Timer, Anleitungen und Schritt-für-Schritt-Löser."),
        },
    },
}

PROJECTS = {
    "cvie": {"title": "CVie.fr", "color": ACCENT,
             "tech": ["React 19", "Vite", "Tailwind", "Hono", "Bun", "Prisma", "PostgreSQL"]},
    "formio": {"title": "Formio", "color": ACCENT_3,
               "tech": ["Next.js", "Express", "TypeScript", "Prisma", "Supabase"]},
    "wfc": {"title": "WFC Terrain Designer", "color": GREEN,
            "tech": ["Python", "Blender 3.0+", "Wave Function Collapse"]},
    "adeli": {"title": "Adeli", "color": ORANGE,
              "tech": {"fr": ["Game design", "Simulation", "Stratégie"],
                       "en": ["Game design", "Simulation", "Strategy"],
                       "de": ["Game Design", "Simulation", "Strategie"]}},
    "rubik": {"title": "Rubik’s Cube", "color": ACCENT_2,
              "tech": ["React 19", "TypeScript", "Three.js", "R3F", "Zustand", "Tailwind v4"]},
}


def t(s):
    return escape(s)


# --------------------------------------------------------------------------
# Hero banner: procedural isometric voxel island
# --------------------------------------------------------------------------

def value_noise(x, y, seed=1089):
    def h(ix, iy):
        n = (ix * 374761393 + iy * 668265263 + seed * 144269504) & 0xFFFFFFFF
        n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
        return ((n ^ (n >> 16)) & 0xFFFF) / 0xFFFF

    x0, y0 = math.floor(x), math.floor(y)
    fx, fy = x - x0, y - y0
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * sx
    b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * sx
    return a + (b - a) * sy


TILES = {
    # name: (top, left, right)
    "water": ("#3d7bd9", "#2a5aa8", "#1f4789"),
    "sand": ("#e8d49a", "#c9b173", "#a8925a"),
    "grass": ("#7bc96f", "#5a9e50", "#46813e"),
    "forest": ("#5fae5a", "#468a43", "#376e35"),
    "rock": ("#9aa1b5", "#767d93", "#5d6378"),
    "snow": ("#f1f4ff", "#c9cfe3", "#a8afc7"),
}


def island(n=9):
    kinds = ["water", "sand", "grass", "forest", "rock", "snow"]
    cells = []
    c = (n - 1) / 2
    for i in range(n):
        for j in range(n):
            d = math.hypot(i - c, j - c) / (c + 0.6)
            peak = math.exp(-((i - 3.2) ** 2 + (j - 4.6) ** 2) / 4.5)
            e = (1 - d) * 0.9 + (value_noise(i * 0.7, j * 0.7) - 0.5) * 0.55 + peak * 0.55
            h = max(0, min(5, int(e * 5.2)))
            cells.append((i, j, kinds[h], h))
    return cells


def cube(x, y, a, depth, colors):
    top, left, right = colors
    half = a / 2
    return (
        f'<path d="M{x - a:.1f} {y:.1f}L{x:.1f} {y + half:.1f}L{x:.1f} {y + half + depth:.1f}'
        f'L{x - a:.1f} {y + depth:.1f}Z" fill="{left}"/>'
        f'<path d="M{x:.1f} {y + half:.1f}L{x + a:.1f} {y:.1f}L{x + a:.1f} {y + depth:.1f}'
        f'L{x:.1f} {y + half + depth:.1f}Z" fill="{right}"/>'
        f'<path d="M{x:.1f} {y - half:.1f}L{x + a:.1f} {y:.1f}L{x:.1f} {y + half:.1f}'
        f'L{x - a:.1f} {y:.1f}Z" fill="{top}"/>'
    )


def tree(x, y, s=1.0):
    return (
        f'<path d="M{x:.1f} {y - 26 * s:.1f}L{x + 8 * s:.1f} {y - 4 * s:.1f}L{x:.1f} {y:.1f}Z" fill="#2f7a3a"/>'
        f'<path d="M{x:.1f} {y - 26 * s:.1f}L{x - 8 * s:.1f} {y - 4 * s:.1f}L{x:.1f} {y:.1f}Z" fill="#3f9a4a"/>'
    )


def hero(lang):
    L = TEXT[lang]
    W, H = 1200, 400
    a, unit, base = 26, 13, 16
    ox, oy = 930, 118
    parts = []
    cells = sorted(island(), key=lambda c: (c[0] + c[1], c[0]))
    for order, (i, j, kind, h) in enumerate(cells):
        x = ox + (i - j) * a
        y = oy + (i + j) * a / 2 - h * unit
        depth = base + h * unit
        g = cube(x, y, a, depth, TILES[kind])
        if kind == "forest" or (kind == "grass" and (i * 3 + j) % 3 == 0):
            g += tree(x - 6, y + 3, 0.9) + tree(x + 7, y + 6, 0.7)
        if kind == "water":
            g = f'<g class="wave" style="animation-delay:{(i + j) * 0.25:.2f}s">{g}</g>'
        delay = order * 0.035
        parts.append(f'<g class="tile" style="animation-delay:{delay:.3f}s">{g}</g>')
    terrain = "".join(parts)

    chip_svg, cx = [], 64
    for label in L["chips"]:
        w = 22 + len(label) * 8.2
        chip_svg.append(
            f'<g transform="translate({cx:.0f} 300)"><rect width="{w:.0f}" height="30" rx="15" '
            f'fill="{ACCENT}" fill-opacity="0.12" stroke="{ACCENT}" stroke-opacity="0.45"/>'
            f'<text x="{w / 2:.0f}" y="20" text-anchor="middle" class="chip">{t(label)}</text></g>'
        )
        cx += w + 10

    stars = []
    for k in range(60):
        sx = (value_noise(k * 1.7, 3.1) * 1.9 % 1) * W
        sy = (value_noise(5.3, k * 2.3) * 1.7 % 1) * H * 0.9
        r = 0.6 + (k % 3) * 0.4
        stars.append(f'<circle cx="{sx:.0f}" cy="{sy:.0f}" r="{r:.1f}" class="star" '
                     f'style="animation-delay:{(k % 7) * 0.6:.1f}s"/>')

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="Fadi Sultan — {t(L["role"])}">
<title>Fadi Sultan — {t(L["role"])}</title>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="{BG_0}"/><stop offset="1" stop-color="{BG_1}"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.75" cy="0.55" r="0.45">
    <stop offset="0" stop-color="{ACCENT_2}" stop-opacity="0.28"/><stop offset="1" stop-color="{ACCENT_2}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="name" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="{INK}"/><stop offset="0.55" stop-color="{ACCENT}"/><stop offset="1" stop-color="{ACCENT_2}"/>
  </linearGradient>
  <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
    <path d="M32 0H0V32" fill="none" stroke="{ACCENT}" stroke-opacity="0.06"/>
  </pattern>
  <clipPath id="card"><rect width="{W}" height="{H}" rx="18"/></clipPath>
</defs>
<style>
  .prompt {{ font: 500 16px {MONO}; fill: {GREEN}; }}
  .name {{ font: 800 64px {SANS}; fill: url(#name); letter-spacing: -1px; }}
  .role {{ font: 600 26px {SANS}; fill: {INK}; }}
  .tag {{ font: 400 17px {SANS}; fill: {MUTED}; }}
  .chip {{ font: 600 13px {SANS}; fill: {ACCENT}; }}
  .place {{ font: 500 14px {MONO}; fill: {MUTED}; }}
  .caption {{ font: 400 12px {MONO}; fill: {MUTED}; opacity: .7; }}
  .cursor {{ animation: blink 1s steps(1) infinite; fill: {GREEN}; }}
  .tile {{ animation: build 12s cubic-bezier(.2,.8,.2,1) infinite both; }}
  .wave {{ animation: bob 3s ease-in-out infinite; }}
  .star {{ fill: #fff; animation: twinkle 4.2s ease-in-out infinite; }}
  .reveal {{ animation: rise .9s cubic-bezier(.2,.8,.2,1) both; }}
  @keyframes build {{
    0% {{ transform: translateY(-70px); opacity: 0; }}
    7% {{ transform: translateY(0); opacity: 1; }}
    86% {{ transform: translateY(0); opacity: 1; }}
    94%, 100% {{ transform: translateY(-40px); opacity: 0; }}
  }}
  @keyframes bob {{ 50% {{ transform: translateY(3px); }} }}
  @keyframes twinkle {{ 50% {{ opacity: .15; }} }}
  @keyframes blink {{ 50% {{ opacity: 0; }} }}
  @keyframes rise {{ from {{ opacity: 0; transform: translateY(14px); }} }}
  @media (prefers-reduced-motion: reduce) {{
    .tile, .wave, .star, .cursor, .reveal {{ animation: none; }}
  }}
</style>
<g clip-path="url(#card)">
  <rect width="{W}" height="{H}" fill="url(#bg)"/>
  <rect width="{W}" height="{H}" fill="url(#grid)"/>
  <rect width="{W}" height="{H}" fill="url(#glow)"/>
  <g opacity="0.55">{"".join(stars)}</g>
  <g>{terrain}</g>
  <text x="{W - 32}" y="{H - 22}" text-anchor="end" class="caption">{t(L["caption"])}</text>
  <g class="reveal">
    <text x="64" y="92" class="prompt">{t(L["prompt"])}<tspan class="cursor"> █</tspan></text>
  </g>
  <g class="reveal" style="animation-delay:.15s"><text x="60" y="172" class="name">Fadi Sultan</text></g>
  <g class="reveal" style="animation-delay:.3s"><text x="64" y="214" class="role">{t(L["role"])}</text></g>
  <g class="reveal" style="animation-delay:.45s">
    <text x="64" y="248" class="tag">{t(L["tagline"])}</text>
    <text x="64" y="272" class="tag">{t(L["tagline2"])}</text>
  </g>
  <g class="reveal" style="animation-delay:.6s">{"".join(chip_svg)}</g>
  <g class="reveal" style="animation-delay:.75s">
    <path d="M70 352c-4.5 0-8 3.4-8 7.8 0 5.6 8 13.2 8 13.2s8-7.6 8-13.2c0-4.4-3.5-7.8-8-7.8zm0 10.6a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6z" fill="{ORANGE}"/>
    <text x="86" y="367" class="place">{t(L["place"])}</text>
  </g>
</g>
<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="18" fill="none" stroke="{ACCENT}" stroke-opacity="0.18"/>
</svg>
'''


# --------------------------------------------------------------------------
# neofetch-style "about" card with a self-scrambling Rubik's cube
#
# The cube is the one from github.com/Fadi1089/Rubik. Every frame is baked
# here and shown in turn with a CSS animation, so the SVG stays static: no
# script, which is what GitHub's image pipeline allows.
#
# A turn only moves one layer, and that layer sits entirely on one side of a
# plane the rest of the cube never crosses, so from a fixed camera it is
# either always in front of the rest or always behind it. That means the two
# halves can be drawn in a fixed order, the still half can be emitted once per
# move instead of once per frame, and neither half needs sorting: both are
# convex, so the faces turned towards the camera cannot overlap each other.
# --------------------------------------------------------------------------

CUBE_FACES = {
    "U": ((0, 1, 0), "#f1f4ff"),
    "D": ((0, -1, 0), "#e0af68"),
    "R": ((1, 0, 0), ACCENT),
    "L": ((-1, 0, 0), GREEN),
    "F": ((0, 0, 1), "#f7768e"),
    "B": ((0, 0, -1), ORANGE),
}
PLASTIC = "#141a2e"
DIRS = [n for n, _ in CUBE_FACES.values()]
IDENTITY = ((1, 0, 0), (0, 1, 0), (0, 0, 1))

SEED = 1089        # the cube turns at random, but the same random every run
OPENING = 12       # moves applied before the loop, so it never looks solved
WALK = 8           # random moves, then walked back, so the loop is seamless
FRAMES = 10        # frames per quarter turn
STEP = 0.026       # seconds per turning frame
HOLDS = (0.10, 0.17, 0.25)   # how long a settled cube waits, picked per move
PAD = 0.006        # frames overlap by a hair, so rounding never blanks one

STICKER = 0.47     # half a sticker, in cubie widths; the rest is the gap
GRID = 2.4         # dark stroke between stickers, the cube's plastic
LIGHT = (-0.30, 0.86, 0.41)
SHADES = (0.58, 0.75, 0.92, 1.08)
CLASS_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _unit(v):
    n = math.sqrt(_dot(v, v))
    return (v[0] / n, v[1] / n, v[2] / n)


def _mv(m, v):
    return tuple(_dot(row, v) for row in m)


def _mm(a, b):
    return tuple(tuple(sum(a[r][k] * b[k][c] for k in range(3)) for c in range(3)) for r in range(3))


def _rot(axis, ang):
    x, y, z = axis
    c, s, k = math.cos(ang), math.sin(ang), 1 - math.cos(ang)
    return ((c + x * x * k, x * y * k - z * s, x * z * k + y * s),
            (y * x * k + z * s, c + y * y * k, y * z * k - x * s),
            (z * x * k - y * s, z * y * k + x * s, c + z * z * k))


# Camera: yawed 30° and pitched 26° so the U, F and R faces all show.
CAM_E = _unit((math.sin(math.radians(30)) * math.cos(math.radians(26)),
               math.sin(math.radians(26)),
               math.cos(math.radians(30)) * math.cos(math.radians(26))))
CAM_R = _unit(_cross((0, 1, 0), CAM_E))
CAM_U = _cross(CAM_E, CAM_R)
CAM_DIST = 9.0


def _project(p, cx, cy, scale):
    s = CAM_DIST / (CAM_DIST - _dot(p, CAM_E)) * scale
    return cx + _dot(p, CAM_R) * s, cy - _dot(p, CAM_U) * s


def _shaded(colour, normal):
    f = SHADES[min(3, int(max(0.0, _dot(normal, LIGHT)) * 4))]
    rgb = (int(colour[1:3], 16), int(colour[3:5], 16), int(colour[5:7], 16))
    return "#%02x%02x%02x" % tuple(min(255, int(v * f + 0.5)) for v in rgb)


def _solved_cube():
    """26 cubies, each a [lattice position, orientation, stickers] triple."""
    cubies = []
    for x in (-1, 0, 1):
        for y in (-1, 0, 1):
            for z in (-1, 0, 1):
                stickers = [(n, c) for n, c in CUBE_FACES.values() if _dot(n, (x, y, z)) > 0.5]
                if stickers:
                    cubies.append([(x, y, z), IDENTITY, stickers])
    return cubies


def _layer(move, t=1.0):
    """Axis and rotation matrix for `move` turned t of the way round."""
    axis = CUBE_FACES[move[0]][0]
    # A clockwise turn seen from outside is a negative rotation about the normal.
    return axis, _rot(axis, math.pi / 2 * t * (1 if move.endswith("'") else -1))


def _apply(cubies, move):
    axis, r = _layer(move)
    for cb in cubies:
        if _dot(cb[0], axis) > 0.5:
            cb[0] = tuple(int(round(v)) for v in _mv(r, cb[0]))
            cb[1] = _mm(r, cb[1])


def _face_basis(n):
    if n[1]:
        return (1, 0, 0), (0, 0, 1)
    if n[0]:
        return (0, 0, 1), (0, 1, 0)
    return (1, 0, 0), (0, 1, 0)


def _parts(cubies, move, t, cx, cy, scale):
    """The faces the camera can see, split into the still half and the turning one."""
    axis, r = _layer(move, t)
    side = {cb[0]: (1 if _dot(cb[0], axis) > 0.5 else 0) for cb in cubies}
    side[(0, 0, 0)] = 0

    out = ([], [])
    for pos, rot, stickers in cubies:
        turning = side[pos]
        wpos = _mv(r, pos) if turning else pos
        # Which way each sticker points now that the cubie has been turned about.
        skins = {tuple(int(round(v)) for v in _mv(rot, n)): c for n, c in stickers}
        for d in DIRS:
            nb = (pos[0] + d[0], pos[1] + d[1], pos[2] + d[2])
            if side.get(nb, -1) == turning:
                continue                               # buried against a neighbour
            normal = _mv(r, d) if turning else d
            if _dot(normal, CAM_E) <= 0.03:
                continue                               # facing away
            u, v = _face_basis(d)
            if turning:
                u, v = _mv(r, u), _mv(r, v)
            centre = tuple(wpos[k] + normal[k] * 0.5 for k in range(3))
            pts = [_project(tuple(centre[k] + (u[k] * a + v[k] * b) * STICKER for k in range(3)),
                            cx, cy, scale)
                   for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            out[turning].append((_shaded(skins.get(d, PLASTIC), normal), pts))
    return out


def _quad_path(pts):
    """A quad as one move plus relative linetos — the deltas are short numbers."""
    xy = [(int(round(x)), int(round(y))) for x, y in pts]
    out = f"M{xy[0][0]} {xy[0][1]}l"
    for (px, py), (x, y) in zip(xy, xy[1:]):
        for n in (x - px, y - py):
            out += ("" if out[-1] in "l-" or n < 0 else " ") + str(n)
    return out + "Z"


def _ease(u):
    return u * u * (3 - 2 * u)


def rubik_walk():
    """An opening scramble, then a random walk and the way back out of it."""
    rng = random.Random(SEED)

    def moves(n):
        picked, last = [], ""
        while len(picked) < n:
            face = rng.choice("UDLRFB")
            if face == last:
                continue                               # two turns of one face read as one
            last = face
            picked.append(face + rng.choice(("", "'")))
        return picked

    opening = moves(OPENING)
    walk = moves(WALK)
    back = [m[0] if m.endswith("'") else m + "'" for m in reversed(walk)]
    return opening, walk + back, [rng.randrange(len(HOLDS)) for _ in walk + back]


def about(lang):
    L = TEXT[lang]
    W, H = 1200, 440
    cx, cy, scale = 252, 222, 76
    turn = (FRAMES - 1) * STEP
    opening, sequence, rests = rubik_walk()
    total = sum(HOLDS[r] for r in rests) + turn * len(sequence)

    cubies = _solved_cube()
    for move in opening:
        _apply(cubies, move)

    classes, moves_svg, start = {}, [], 0.0
    for i, move in enumerate(sequence):
        def draw(quads):
            return "".join(f'<path class="{classes.setdefault(c, CLASS_CHARS[len(classes)])}" '
                           f'd="{_quad_path(p)}"/>' for c, p in quads)

        hold, mark = HOLDS[rests[i]], " rm0" if i == 0 else ""
        frames = [f'<g class="frm {"hd%d" % rests[i] + mark if k == 0 else "stp"}" '
                  f'style="animation-delay:{start + (0 if k == 0 else hold + (k - 1) * STEP) - total:.3f}s">'
                  f'{draw(_parts(cubies, move, _ease(k / FRAMES), cx, cy, scale)[1])}</g>'
                  for k in range(FRAMES)]
        still = (f'<g class="frm sg{rests[i]}{mark}" style="animation-delay:{start - total:.3f}s">'
                 f'{draw(_parts(cubies, move, 0, cx, cy, scale)[0])}</g>')
        # The turning layer is wholly on one side of the cut, so its depth order
        # against the rest of the cube is settled before the turn even starts.
        order = [still] + frames if _dot(_layer(move)[0], CAM_E) > 0 else frames + [still]
        moves_svg.append("<g>" + "".join(order) + "</g>")
        start += hold + turn
        _apply(cubies, move)

    swatches = "".join(f".{n}{{fill:{c}}}" for c, n in classes.items())
    windows = "".join(
        f'  .hd{k} {{ animation: kd{k} {total:.3f}s linear infinite; }}\n'
        f'  .sg{k} {{ animation: kg{k} {total:.3f}s linear infinite; }}\n'
        f'  @keyframes kd{k} {{ 0%,{(h + PAD) / total * 100:.4f}% {{ opacity: 1; }} '
        f'{(h + PAD) / total * 100 + 0.0005:.4f}%,100% {{ opacity: 0; }} }}\n'
        f'  @keyframes kg{k} {{ 0%,{(h + turn + PAD) / total * 100:.4f}% {{ opacity: 1; }} '
        f'{(h + turn + PAD) / total * 100 + 0.0005:.4f}%,100% {{ opacity: 0; }} }}\n'
        for k, h in enumerate(HOLDS))

    lines = []
    y = 104
    for key, value in L["about"]:
        lines.append(
            f'<text x="500" y="{y}" class="row"><tspan class="key">{t(key)}</tspan>'
            f'<tspan x="660" class="val">{t(value)}</tspan></text>'
        )
        y += 29

    palette = "".join(
        f'<rect x="{500 + k * 34}" y="{y + 4}" width="30" height="16" rx="3" fill="{c}"/>'
        for k, c in enumerate(["#f7768e", ORANGE, "#e0af68", GREEN, "#73daca", ACCENT_3, ACCENT, ACCENT_2])
    )

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="fadi@strasbourg — neofetch, {t(L["cube_alt"])}">
<title>fadi@strasbourg</title>
<defs>
  <linearGradient id="bg2" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="{BG_1}"/><stop offset="1" stop-color="{BG_0}"/>
  </linearGradient>
  <radialGradient id="halo" cx="0.21" cy="0.5" r="0.34">
    <stop offset="0" stop-color="{ACCENT}" stop-opacity="0.22"/><stop offset="1" stop-color="{ACCENT}" stop-opacity="0"/>
  </radialGradient>
</defs>
<style>
  .bar {{ font: 500 13px {MONO}; fill: {MUTED}; }}
  .host {{ font: 700 20px {MONO}; fill: {ACCENT}; }}
  .at {{ fill: {INK}; }}
  .row {{ font: 400 16px {MONO}; }}
  .key {{ fill: {ACCENT_2}; font-weight: 700; }}
  .val {{ fill: {INK}; }}
  {swatches}
  .frm {{ opacity: 0; }}
  .stp {{ animation: ks {total:.3f}s linear infinite; }}
  @keyframes ks {{ 0%,{(STEP + PAD) / total * 100:.4f}% {{ opacity: 1; }} {(STEP + PAD) / total * 100 + 0.0005:.4f}%,100% {{ opacity: 0; }} }}
{windows}  @media (prefers-reduced-motion: reduce) {{
    .frm {{ animation: none; }}
    .rm0 {{ opacity: 1; }}
  }}
</style>
<rect width="{W}" height="{H}" rx="16" fill="url(#bg2)"/>
<rect width="{W}" height="{H}" rx="16" fill="url(#halo)"/>
<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="16" fill="none" stroke="{ACCENT}" stroke-opacity="0.18"/>
<path d="M0 16a16 16 0 0 1 16-16h{W - 32}a16 16 0 0 1 16 16v20H0z" fill="#ffffff" fill-opacity="0.04"/>
<circle cx="24" cy="18" r="6" fill="#f7768e"/><circle cx="44" cy="18" r="6" fill="#e0af68"/><circle cx="64" cy="18" r="6" fill="{GREEN}"/>
<text x="{W / 2}" y="23" text-anchor="middle" class="bar">fadi@strasbourg: ~ — neofetch</text>
<ellipse cx="{cx}" cy="404" rx="130" ry="14" fill="{ACCENT}" fill-opacity="0.12"/>
<g stroke="{BG_0}" stroke-width="{GRID}" stroke-linejoin="round">{"".join(moves_svg)}</g>
<text x="500" y="72" class="host">fadi<tspan class="at">@</tspan>strasbourg</text>
<path d="M500 82H760" stroke="{MUTED}" stroke-opacity="0.5" stroke-dasharray="4 4"/>
{"".join(lines)}
{palette}
</svg>
'''


# --------------------------------------------------------------------------
# Project cards
# --------------------------------------------------------------------------

def project_card(lang, key):
    P = PROJECTS[key]
    label, line1, line2 = TEXT[lang]["projects"][key]
    W, H = 600, 230
    c = P["color"]
    chips, x, row_y = [], 32, 172
    techs = P["tech"][lang] if isinstance(P["tech"], dict) else P["tech"]
    for tech in techs:
        w = 18 + len(tech) * 7.4
        if x + w > W - 28:
            break
        chips.append(
            f'<g transform="translate({x:.0f} {row_y})"><rect width="{w:.0f}" height="26" rx="6" fill="{c}" fill-opacity="0.12"/>'
            f'<text x="{w / 2:.0f}" y="17.5" text-anchor="middle" class="chip">{t(tech)}</text></g>'
        )
        x += w + 8
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="{t(P["title"])}">
<title>{t(P["title"])}</title>
<defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="{BG_1}"/><stop offset="1" stop-color="{BG_0}"/>
  </linearGradient>
  <radialGradient id="h" cx="1" cy="0" r="0.8">
    <stop offset="0" stop-color="{c}" stop-opacity="0.25"/><stop offset="1" stop-color="{c}" stop-opacity="0"/>
  </radialGradient>
</defs>
<style>
  .label {{ font: 700 12px {MONO}; fill: {c}; letter-spacing: 1.5px; }}
  .title {{ font: 800 30px {SANS}; fill: {INK}; }}
  .desc {{ font: 400 17px {SANS}; fill: {MUTED}; }}
  .chip {{ font: 600 12px {MONO}; fill: {c}; }}
  .arrow {{ fill: none; stroke: {c}; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }}
</style>
<rect width="{W}" height="{H}" rx="16" fill="url(#g)"/>
<rect width="{W}" height="{H}" rx="16" fill="url(#h)"/>
<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="16" fill="none" stroke="{c}" stroke-opacity="0.35"/>
<rect x="32" y="0" width="64" height="4" rx="2" fill="{c}"/>
<text x="32" y="44" class="label">{t(label)}</text>
<text x="32" y="86" class="title">{t(P["title"])}</text>
<path class="arrow" d="M{W - 56} 38l14-14M{W - 52} 24h10v10"/>
<text x="32" y="122" class="desc">{t(line1)}</text>
<text x="32" y="147" class="desc">{t(line2)}</text>
{"".join(chips)}
</svg>
'''


def main():
    OUT.mkdir(exist_ok=True)
    for lang in TEXT:
        (OUT / f"hero-{lang}.svg").write_text(hero(lang), encoding="utf-8")
        (OUT / f"about-{lang}.svg").write_text(about(lang), encoding="utf-8")
        for key in PROJECTS:
            (OUT / f"project-{key}-{lang}.svg").write_text(project_card(lang, key), encoding="utf-8")
    print(f"wrote assets to {OUT}")


if __name__ == "__main__":
    main()
