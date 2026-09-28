#!/usr/bin/env python3
"""Generate the self-hosted SVG assets used by the profile READMEs.

Every image is a static SVG committed to `assets/`, so the profile does not
depend on third-party card services. Run from the repo root:

    python3 scripts/generate_assets.py
"""

import math
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
# neofetch-style "about" card with a rotating wireframe cube
# --------------------------------------------------------------------------

def cube_frames(cx, cy, size, frames=48):
    verts = [(x, y, z) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    edges = [(a, b) for a in range(8) for b in range(a + 1, 8)
             if sum(1 for k in range(3) if verts[a][k] != verts[b][k]) == 1]
    out = []
    for f in range(frames + 1):
        ay = 2 * math.pi * f / frames
        ax = 0.6 + 0.12 * math.sin(2 * math.pi * f / frames)
        pts = []
        for x, y, z in verts:
            x, z = x * math.cos(ay) + z * math.sin(ay), -x * math.sin(ay) + z * math.cos(ay)
            y, z = y * math.cos(ax) - z * math.sin(ax), y * math.sin(ax) + z * math.cos(ax)
            p = 7 / (7 + z)
            pts.append((cx + x * size * p, cy + y * size * p))
        d = "".join(f"M{pts[a][0]:.1f} {pts[a][1]:.1f}L{pts[b][0]:.1f} {pts[b][1]:.1f}" for a, b in edges)
        out.append((d, pts))
    return out


def about(lang):
    L = TEXT[lang]
    W, H = 1200, 440
    frames = cube_frames(250, 230, 88)
    path_values = ";".join(d for d, _ in frames)
    dots = []
    for v in range(8):
        cxs = ";".join(f"{p[v][0]:.1f}" for _, p in frames)
        cys = ";".join(f"{p[v][1]:.1f}" for _, p in frames)
        dots.append(
            f'<circle r="4.5" fill="{ACCENT_3}">'
            f'<animate attributeName="cx" dur="12s" repeatCount="indefinite" values="{cxs}"/>'
            f'<animate attributeName="cy" dur="12s" repeatCount="indefinite" values="{cys}"/></circle>'
        )

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

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="fadi@strasbourg — neofetch">
<title>fadi@strasbourg</title>
<defs>
  <linearGradient id="bg2" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="{BG_1}"/><stop offset="1" stop-color="{BG_0}"/>
  </linearGradient>
  <radialGradient id="halo" cx="0.21" cy="0.55" r="0.3">
    <stop offset="0" stop-color="{ACCENT}" stop-opacity="0.22"/><stop offset="1" stop-color="{ACCENT}" stop-opacity="0"/>
  </radialGradient>
  <filter id="neon" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>
<style>
  .bar {{ font: 500 13px {MONO}; fill: {MUTED}; }}
  .host {{ font: 700 20px {MONO}; fill: {ACCENT}; }}
  .at {{ fill: {INK}; }}
  .row {{ font: 400 16px {MONO}; }}
  .key {{ fill: {ACCENT_2}; font-weight: 700; }}
  .val {{ fill: {INK}; }}
</style>
<rect width="{W}" height="{H}" rx="16" fill="url(#bg2)"/>
<rect width="{W}" height="{H}" rx="16" fill="url(#halo)"/>
<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="16" fill="none" stroke="{ACCENT}" stroke-opacity="0.18"/>
<path d="M0 16a16 16 0 0 1 16-16h{W - 32}a16 16 0 0 1 16 16v20H0z" fill="#ffffff" fill-opacity="0.04"/>
<circle cx="24" cy="18" r="6" fill="#f7768e"/><circle cx="44" cy="18" r="6" fill="#e0af68"/><circle cx="64" cy="18" r="6" fill="{GREEN}"/>
<text x="{W / 2}" y="23" text-anchor="middle" class="bar">fadi@strasbourg: ~ — neofetch</text>
<g filter="url(#neon)" fill="none" stroke="{ACCENT}" stroke-width="2.2" stroke-linecap="round">
  <path d="{frames[0][0]}"><animate attributeName="d" dur="12s" repeatCount="indefinite" values="{path_values}"/></path>
</g>
{"".join(dots)}
<ellipse cx="250" cy="382" rx="110" ry="12" fill="{ACCENT}" fill-opacity="0.12"/>
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
