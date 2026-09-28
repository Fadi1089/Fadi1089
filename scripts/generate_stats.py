#!/usr/bin/env python3
"""Generate the localized GitHub stats card (repos, stars, followers, languages).

Runs daily in the Metrics workflow. Uses only the public REST API; set
GITHUB_TOKEN to raise the rate limit. For a local preview without network
access, pass a JSON fixture: python3 scripts/generate_stats.py fixture.json
"""

import json
import os
import sys
import urllib.request
from pathlib import Path

from generate_assets import (ACCENT, ACCENT_2, BG_0, BG_1, INK, MONO, MUTED, SANS, t)

USER = "Fadi1089"
OUT = Path(__file__).resolve().parent.parent / "stats"
IGNORED = {"HTML", "CSS"}
TOP = 8

TEXT = {
    "fr": {"repos": "dépôts publics", "stars": "étoiles", "followers": "abonnés",
           "title": "Langages les plus utilisés", "note": "d’après le code de mes dépôts publics"},
    "en": {"repos": "public repos", "stars": "stars", "followers": "followers",
           "title": "Most used languages", "note": "based on the code in my public repos"},
    "de": {"repos": "öffentliche Repos", "stars": "Sterne", "followers": "Follower",
           "title": "Meistgenutzte Sprachen", "note": "basierend auf dem Code meiner öffentlichen Repos"},
}

# GitHub linguist colors, lightened where they vanish on a dark background
COLORS = {
    "TypeScript": "#3178c6", "JavaScript": "#f1e05a", "Python": "#ffd43b", "C": "#a8b1c2",
    "C++": "#f34b7d", "C#": "#2fb344", "Java": "#b07219", "PHP": "#6e7fd2", "Swift": "#f05138",
    "Shell": "#89e051", "GDScript": "#478cbf", "GLSL": "#5686a5", "HLSL": "#aace60",
    "ShaderLab": "#8a9bb0", "Kotlin": "#a97bff", "Go": "#00add8", "Rust": "#dea584",
    "Vue": "#41b883", "Svelte": "#ff3e00", "SCSS": "#c6538c", "Lua": "#6b6bff",
    "Dockerfile": "#5a7fa0", "Makefile": "#6b9e3a", "CMake": "#da3434",
}
FALLBACK = ["#7dcfff", "#bb9af7", "#ff9e64", "#9ece6a", "#e0af68", "#73daca", "#f7768e"]


def api(path):
    req = urllib.request.Request(f"https://api.github.com{path}",
                                 headers={"Accept": "application/vnd.github+json"})
    if os.environ.get("GITHUB_TOKEN"):
        req.add_header("Authorization", f"Bearer {os.environ['GITHUB_TOKEN']}")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def fetch():
    user = api(f"/users/{USER}")
    repos = api(f"/users/{USER}/repos?per_page=100&type=owner")
    langs = {}
    for repo in repos:
        if repo["fork"]:
            continue
        for lang, size in api(f"/repos/{USER}/{repo['name']}/languages").items():
            langs[lang] = langs.get(lang, 0) + size
    return {
        "repos": user["public_repos"],
        "stars": sum(r["stargazers_count"] for r in repos if not r["fork"]),
        "followers": user["followers"],
        "languages": langs,
    }


def card(lang, data):
    L = TEXT[lang]
    W, H = 1200, 300
    langs = sorted(((k, v) for k, v in data["languages"].items() if k not in IGNORED),
                   key=lambda kv: -kv[1])
    total = sum(v for _, v in langs) or 1
    top = [kv for kv in langs[:TOP] if kv[1] / total >= 0.005]
    other = total - sum(v for _, v in top)
    if other / total >= 0.005:
        top.append(("…", other))

    fb = iter(FALLBACK)
    colors = [COLORS.get(k) or next(fb, MUTED) for k, _ in top]

    x0, bar_w, bar_y = 470, 690, 110
    bar, x = [], x0
    for (name, size), c in zip(top, colors):
        w = bar_w * size / total
        bar.append(f'<rect x="{x:.1f}" y="{bar_y}" width="{max(w - 2, 1):.1f}" height="14" fill="{c}"/>')
        x += w

    legend = []
    for k, ((name, size), c) in enumerate(zip(top, colors)):
        col, row = k % 3, k // 3
        lx, ly = x0 + col * 235, 170 + row * 34
        legend.append(
            f'<circle cx="{lx + 6}" cy="{ly - 5}" r="6" fill="{c}"/>'
            f'<text x="{lx + 20}" y="{ly}" class="lang">{t(name)}'
            f'<tspan class="pct"> {100 * size / total:.1f}%</tspan></text>'
        )

    stats = []
    for k, key in enumerate(("repos", "stars", "followers")):
        y = 84 + k * 78
        stats.append(
            f'<text x="56" y="{y}" class="num">{data[key]}</text>'
            f'<text x="56" y="{y + 24}" class="lbl">{t(L[key])}</text>'
        )

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="{t(L["title"])}">
<title>{t(L["title"])}</title>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="{BG_1}"/><stop offset="1" stop-color="{BG_0}"/>
  </linearGradient>
  <clipPath id="bar"><rect x="{x0}" y="{bar_y}" width="{bar_w}" height="14" rx="7"/></clipPath>
</defs>
<style>
  .num {{ font: 800 40px {SANS}; fill: {INK}; }}
  .lbl {{ font: 500 14px {MONO}; fill: {MUTED}; }}
  .title {{ font: 700 20px {SANS}; fill: {INK}; }}
  .note {{ font: 400 13px {MONO}; fill: {MUTED}; }}
  .lang {{ font: 600 16px {SANS}; fill: {INK}; }}
  .pct {{ font-weight: 400; fill: {MUTED}; }}
  .grow {{ animation: grow 1.2s cubic-bezier(.2,.8,.2,1) both; transform-origin: {x0}px 0; }}
  @keyframes grow {{ from {{ transform: scaleX(0); }} }}
  @media (prefers-reduced-motion: reduce) {{ .grow {{ animation: none; }} }}
</style>
<rect width="{W}" height="{H}" rx="16" fill="url(#bg)"/>
<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="16" fill="none" stroke="{ACCENT}" stroke-opacity="0.18"/>
{"".join(stats)}
<path d="M390 40V260" stroke="{MUTED}" stroke-opacity="0.25"/>
<text x="{x0}" y="70" class="title">{t(L["title"])}</text>
<text x="{x0}" y="92" class="note">{t(L["note"])}</text>
<g clip-path="url(#bar)"><rect x="{x0}" y="{bar_y}" width="{bar_w}" height="14" fill="{ACCENT_2}" fill-opacity="0.1"/><g class="grow">{"".join(bar)}</g></g>
{"".join(legend)}
</svg>
'''


def main():
    data = json.loads(Path(sys.argv[1]).read_text()) if len(sys.argv) > 1 else fetch()
    OUT.mkdir(exist_ok=True)
    for lang in TEXT:
        (OUT / f"overview-{lang}.svg").write_text(card(lang, data), encoding="utf-8")
    print(f"wrote stats to {OUT}")


if __name__ == "__main__":
    main()
