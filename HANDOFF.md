# Handoff: portfolio camera-stop scenes

## Status (2026-11-26): done
All eight scenes are built in `site/props.js` (camera stops shared in `site/stops.js`), with 23 models in `site/models/` and procedural fallbacks for each. Changes from the plan below:
- Every scene stands on a **plot**: `planPlots()` picks a block of cells near the landmark, levels it to one height, retiles it (a forest clearing, a beach patch, a snow terrace), turns it to the grid side facing the camera, and keeps a one-cell border free of trees/houses/rocks. Items are laid out in plot units with quarter turns, so nothing hangs off a column edge or sits at a random angle.
- Pages are grounded: the CV is a notice board. The contact beach has a jetty that starts at the waterline, flush with the sand.
- Formio is a big tablet showing the form (two questions with audio clips and choices) next to a bar chart that grows as the stop comes into view. Stack is four labelled strata (systems, back-end, front-end, 3D), each coloured like a terrain tile.
- Island growth (`updateWorld` in `main.js`): the map fills in flat on the water in WFC order, then land rises and sea sinks from the centre out, then trees and houses grow; scenes appear only after that (`world.ready`).
- `sea.js`: the seabed deepens with distance to land by one rule inside the grid and in a ring of columns beyond it (no square border); water tinted the same way; foam along the coast; sun glints. A few fish swim in the shallows (props.js, "sea" scene).
- Hand-downloaded models (Poly Pizza only serves newer uploads to its own page): chair, cat, tree, fish, listed as MANUAL in `scripts/fetch_models.sh`. `tree.glb` is the "Tree Assets" pack: the island uses six single trees from it (`TREE_PIECES` in `main.js`), one variant per tree. The fish model is an animated clownfish.
- TrisTik is a fenced game board in the game's own look (one biome per piece, last piece turns and drops into its gap), not floating pieces + windmill. The windmill model was dropped.
- On desktop each scene centres itself in the space right of its text panel (`stopParams` in `main.js` measures the panel); `up` raises the look point, `mlift` lifts the subject on phones.
- The hero orbit unwinds when you scroll away, so scenes face the camera.
- `MODEL_FIX` in `props.js` holds the turns that stand some models up / face them forward.

The original brief follows for reference.

---

## Goal
The portfolio (`site/`, live at https://fadi1089.github.io/Fadi1089/) is a Three.js voxel island grown by Wave Function Collapse. Scrolling flies the camera to a landmark per section. **Task: at each landmark, place a small 3D scene relevant to that section**, built from Poly Pizza models.

## Step 1: get the models
```bash
bash scripts/fetch_models.sh
```
Downloads 26 GLBs into `site/models/` and writes `site/models/manifest.json` (name, id, title, author, licence). Run it on a home connection: Poly Pizza's file server (`static.poly.pizza`) blocks cloud IPs with a Cloudflare challenge. The search API (`api.poly.pizza/v1.1/search/<q>`, header `x-auth-token`) is only needed for finding more models.

## Step 2: the scenes (one per `data-cam` section)
| Stop | Landmark | Scene |
|---|---|---|
| about | `south` beach | desk + laptop + **black cat** (recolor; owner's portrait has a black cat in sunglasses) + campfire |
| tristik | `village` | 3–4 **tetromino pieces made of mini biome tiles** (procedural, no model) hovering/dropping onto the village + windmill |
| cvie | `forest` | giant floating **CV page** (CanvasTexture: "FADI SULTAN", lines, photo box) + printer + folder + papers |
| formio | `north` beach | radio, mic, headphones, 2 speakers + **expanding sound rings** (procedural torus) + floating form page with checkboxes/play buttons (CanvasTexture) |
| wfc | `center`, top-down | grid overlay fading in only at this stop + additive "collapse trail" lighting cells in `world.g.order` + floating tileset cubes (one per tile type) |
| adeli | `peak` (snow) | Antarctic base: tents, flag, satellite dish, igloo, sled, **waddling penguin colony** (Adeli = Adélie penguin) |
| stack | `rock` | workshop: scaffold, server rack (blinking LEDs), screen, toolbox, wrench + a literal **stack of labeled blocks** (TypeScript, React, Three.js, Node, Postgres, C#, Blender, Linux) |
| contact | new `west` beach | mailbox + bottle bobbing in the water + **paper planes circling the island** (visible from the hero too) |

## How to build it (in `site/main.js`)
- Add the importmap entry `"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"` in `index.html`; use `GLTFLoader`.
- Fetch `models/manifest.json` once (missing → all procedural). Load each listed GLB, normalize it: bounding box → scale to a target height in world units (1 cell = 1 unit; tree ≈ 0.9, house ≈ 0.7; make props larger than life, 0.6–2.5), feet at y=0, centered, `castShadow/receiveShadow` on meshes.
- **Every slot needs a procedural fallback** built from primitives (flat-shaded `MeshStandardMaterial`, same look as the island), so the site works without models.
- Put scenes in a new `site/props.js`; move `STOPS` to a shared module so scenes use the same `az` as the camera stop: rotate each scene group by `az` (radians) so its front faces the camera.
- Place items with offsets around the landmark; snap each item to the nearest land cell of an allowed tile type (search radius ~3); y = `world.heights[cell]` (top of the column).
- In `buildWorld`, compute landmarks **before** props and skip trees/houses/rocks within each scene's clear radius (keep village houses at the tristik stop).
- Scenes pop in (scale up) after the island finishes rising (~2.2 s after `world.born`, staggered).
- Rebuild scenes on "Grow another island" (`grow(seed)`), since landmarks move. Dispose old ones.
- `findLandmarks()`: add `west` (and `east`) beaches like `south`/`north`. Retarget `STOPS.contact` to `west` (az ≈ 285, dist ≈ 14, h ≈ 8, shift 3.5).
- Make `targetCam()` also return per-stop weights so the WFC grid and focus effects fade with scroll.
- Respect `reduceMotion` (no animation loops).
- **Credits**: CC-BY models (penguin, igloo, sled, server, plane) need attribution. Add a small credits list in the contact panel or footer, generated from the manifest with links to `https://poly.pizza/m/<id>`.

## Testing
```bash
mkdir -p /tmp/site/img && cp -r site/. /tmp/site/ && cp assets/tristik-*.jpg /tmp/site/img/ && (cd /tmp/site && python3 -m http.server 8765)
```
Open http://localhost:8765, scroll through every stop on desktop and at 390 px wide. The panel text must stay readable: scenes sit right of the panel on desktop (the `shift` param), above it on mobile (`lift`). Check `?seed=42` and the regenerate button too.

## Ground rules
- Commit and push **directly to `main`** (owner's preference). The Pages workflow deploys on changes to `site/**`.
- Keep replies short: result first, then next steps.
- Copy is trilingual (`site/i18n.js`, FR/EN/DE). Any new visible text needs all three.
- Palette: sea `#0d2433` ground, sand `#e2c983` accent, terrain colors in `TILE` in `main.js`. Fonts: Bricolage Grotesque (display), JetBrains Mono (labels).
