import * as THREE from "three";
import { generate, rng, T } from "./wfc.js";
import { I18N } from "./i18n.js";
import { STOPS } from "./stops.js";
import { createScenes, planPlots, loadManifest, loadModelParts } from "./props.js";
import { createSea, shapeSeabed, waterY } from "./sea.js";

/* ------------------------------------------------------------------ */
/* Language                                                            */
/* ------------------------------------------------------------------ */

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

let lang = (() => {
  const q = new URLSearchParams(location.search).get("lang");
  if (q && I18N[q]) return q;
  const s = store.get("lang");
  if (s && I18N[s]) return s;
  const nav = (navigator.language || "en").slice(0, 2);
  return I18N[nav] ? nav : "en";
})();

let lastStat = null;
function tr(key, vars = {}) {
  let s = I18N[lang][key] ?? I18N.en[key] ?? "";
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}
function applyLang() {
  document.documentElement.lang = lang;
  document.title = tr("meta.title");
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.innerHTML = tr(el.dataset.i18n); });
  document.querySelectorAll(".langs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  if (lastStat) showStat(lastStat);
}
document.querySelectorAll(".langs button").forEach((b) =>
  b.addEventListener("click", () => { lang = b.dataset.lang; store.set("lang", lang); applyLang(); })
);
applyLang();

const statEl = document.getElementById("genstat");
function showStat(s) {
  lastStat = s;
  const fmt = new Intl.NumberFormat(lang);
  statEl.textContent = tr("hero.stat", { cells: fmt.format(s.cells), ms: fmt.format(s.ms), seed: s.seed });
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("world");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch (e) {
  document.body.classList.add("no-webgl");
  canvas.remove();
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const SEA = new THREE.Color("#0d2433");
const scene = new THREE.Scene();
scene.background = SEA;
scene.fog = new THREE.Fog(SEA, 55, 140);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);

scene.add(new THREE.HemisphereLight("#d6ecff", "#1a3646", 1.25));
const sun = new THREE.DirectionalLight("#ffe0b0", 2.6);
sun.position.set(-26, 38, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 120 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.02;
scene.add(sun);

// Sea floor far below, so the water has something dark under it beyond the grid.
const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ color: "#0a1d29" }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -3.2;
scene.add(floor);

// Water: a faceted plane whose vertices ripple every frame, tinted per
// vertex by sea.js (lighter over the shallows).
const WATER_Y = 0;
const waterGeo = new THREE.PlaneGeometry(240, 240, 120, 120);
waterGeo.rotateX(-Math.PI / 2);
const waterBase = Float32Array.from(waterGeo.attributes.position.array);
const water = new THREE.Mesh(
  waterGeo,
  new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, transparent: true, opacity: 0.76, roughness: 0.1, metalness: 0.1, flatShading: true })
);
water.position.y = WATER_Y;
water.receiveShadow = true;
scene.add(water);

/* ------------------------------------------------------------------ */
/* Island                                                              */
/* ------------------------------------------------------------------ */

const GRID = 48;
const TILE = {
  [T.DEEP]: { h: -2.2, c: "#14415a" },
  [T.SHALLOW]: { h: -0.45, c: "#3a8fa6" },
  [T.SAND]: { h: 0.32, c: "#e2c983" },
  [T.GRASS]: { h: 0.75, c: "#7fb35a" },
  [T.FOREST]: { h: 1.2, c: "#4f8a47" },
  [T.ROCK]: { h: 2.3, c: "#8f8b99" },
  [T.SNOW]: { h: 3.5, c: "#eef2f4" },
  [T.VILLAGE]: { h: 0.75, c: "#b9a476" },
};
const BASE = -3.2;
// Growth, in two phases. First the map fills in flat on the water, tile by
// tile in the order Wave Function Collapse decided them. Then the terrain
// settles, land rising and sea sinking, from the centre out to the coast.
// Trees and houses grow last, and the scenes appear once all is still.
const T_MAP = reduceMotion ? 0 : 1.4; // phase 1
const T_DROP = reduceMotion ? 0 : 0.22; // one tile dropping onto the map
const T_SPREAD = reduceMotion ? 0 : 0.55; // phase 2: centre to coast
const T_RISE = reduceMotion ? 0 : 0.9; // one column rising or sinking
const T_PROP = reduceMotion ? 0 : 0.4; // one tree or house growing
const FLAT = 0.16; // height of the flat map

const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const treeGeo = new THREE.ConeGeometry(0.3, 0.95, 6).translate(0, 0.475, 0);
const trunkGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.3, 5).translate(0, 0.15, 0);
const wallGeo = new THREE.BoxGeometry(0.56, 0.38, 0.44).translate(0, 0.19, 0);
const roofGeo = new THREE.ConeGeometry(0.46, 0.34, 4).rotateY(Math.PI / 4).scale(1, 1, 0.82).translate(0, 0.38 + 0.17, 0);
const rockGeo = new THREE.DodecahedronGeometry(0.28, 0);

const mat = {
  ground: new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
  tree: new THREE.MeshStandardMaterial({ color: "#2f6b3c", roughness: 0.8, flatShading: true }),
  trunk: new THREE.MeshStandardMaterial({ color: "#6b4a33", roughness: 1 }),
  wall: new THREE.MeshStandardMaterial({ color: "#efe4cc", roughness: 0.85 }),
  roof: new THREE.MeshStandardMaterial({ color: "#c45a3f", roughness: 0.7, flatShading: true }),
  rock: new THREE.MeshStandardMaterial({ color: "#77737f", roughness: 1, flatShading: true }),
};

let world = null;

function cellXZ(i) {
  return [(i % GRID) - GRID / 2 + 0.5, Math.floor(i / GRID) - GRID / 2 + 0.5];
}

function buildWorld(seed) {
  const t0 = performance.now();
  const g = generate(GRID, GRID, seed);
  const ms = Math.round(performance.now() - t0);
  const r = rng(seed ^ 0x9e3779b9);
  const N = GRID * GRID;

  const group = new THREE.Group();
  const heights = new Float32Array(N);
  const showAt = new Float32Array(N), riseAt = new Float32Array(N);
  g.order.forEach((cell, k) => { showAt[cell] = (k / N) * T_MAP; });
  for (let i = 0; i < N; i++) {
    const [x, z] = cellXZ(i);
    riseAt[i] = T_MAP + T_DROP + Math.min(1, Math.hypot(x, z) / (GRID * 0.62)) * T_SPREAD;
  }

  const cols = new THREE.InstancedMesh(boxGeo, mat.ground, N);
  cols.castShadow = cols.receiveShadow = true;
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const t = g.tiles[i];
    const jitter = t >= T.SAND ? r() * 0.22 : r() * 0.3;
    heights[i] = TILE[t].h + jitter;
    col.set(TILE[t].c).offsetHSL((r() - 0.5) * 0.015, (r() - 0.5) * 0.06, (r() - 0.5) * 0.05);
    cols.setColorAt(i, col);
  }
  group.add(cols);

  // Landmarks first, then a levelled plot for each scene near its landmark.
  // Plot cells are retiled (a clearing, a patch of beach...) and grow nothing.
  const landmarks = findLandmarks(g, heights);
  const plan = planPlots(g, heights, landmarks);
  const rp = rng(seed ^ 0x5bd1e995);
  for (const i of plan.cells) cols.setColorAt(i, col.set(TILE[g.tiles[i]].c).offsetHSL(0, 0, (rp() - 0.5) * 0.03));
  // Deep cells take the seabed's depth and colour, which carries on past the grid.
  shapeSeabed(g, heights, cols);

  // Props: trees, houses and rocks, each tied to the cell it stands on.
  const props = { tree: [], trunk: [], wall: [], roof: [], rock: [] };
  const add = (kind, cell, x, z, s, rot) => { if (!plan.clear.has(cell)) props[kind].push({ cell, x, z, s, rot }); };
  for (let i = 0; i < N; i++) {
    const t = g.tiles[i];
    const [cx, cz] = cellXZ(i);
    const spot = () => [cx + (r() - 0.5) * 0.6, cz + (r() - 0.5) * 0.6];
    if (t === T.FOREST || (t === T.GRASS && r() < 0.07)) {
      const n = t === T.FOREST ? 1 + Math.floor(r() * 3) : 1;
      for (let k = 0; k < n; k++) {
        const [x, z] = spot();
        const s = 0.7 + r() * 0.6;
        add("tree", i, x, z, s, r() * 6.3);
        add("trunk", i, x, z, s, 0);
      }
    } else if (t === T.VILLAGE) {
      const [x, z] = [cx + (r() - 0.5) * 0.25, cz + (r() - 0.5) * 0.25];
      const s = 0.85 + r() * 0.4;
      const rot = Math.floor(r() * 4) * (Math.PI / 2) + (r() - 0.5) * 0.3;
      add("wall", i, x, z, s, rot);
      add("roof", i, x, z, s, rot);
    } else if ((t === T.ROCK && r() < 0.35) || (t === T.SAND && r() < 0.03)) {
      const [x, z] = spot();
      add("rock", i, x, z, 0.6 + r() * 0.8, r() * 6.3);
    }
  }
  // Trees use the tree models when they loaded: each tree gets one of the
  // variants, drawn as one instanced mesh per variant part. Otherwise the
  // built-in cone and trunk.
  const parts = [];
  for (const [kind, list] of Object.entries(props)) {
    if (treeParts && kind === "trunk") continue;
    if (treeParts && kind === "tree") {
      treeParts.forEach((variant, vi) => {
        const mine = list.filter((p, k) => (p.cell * 7 + k) % treeParts.length === vi);
        for (const p of variant) parts.push([p.geometry, p.material, mine]);
      });
    } else parts.push([{ tree: treeGeo, trunk: trunkGeo, wall: wallGeo, roof: roofGeo, rock: rockGeo }[kind], mat[kind], list]);
  }
  const propMeshes = parts.map(([geo, material, list]) => {
    const m = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
    m.count = list.length;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return { mesh: m, list };
  });

  scene.add(group);
  const last = Math.max(...riseAt) + T_RISE;
  return {
    g, group, cols, heights, showAt, riseAt, propMeshes, ms, landmarks, plots: plan.plots,
    baseColor: Float32Array.from(cols.instanceColor.array), cur: new Float32Array(N),
    born: clock.getElapsedTime(), done: false,
    ready: reduceMotion ? 0 : last + T_PROP, end: reduceMotion ? 0 : last + T_PROP + 0.7,
  };
}

function disposeWorld(w) {
  scene.remove(w.group);
  w.group.traverse((o) => o.isInstancedMesh && o.dispose());
}

const easeOut = (x) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
const easeInOut = (x) => { x = Math.min(1, Math.max(0, x)); return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; };
const easeBack = (x) => { const c = 1.2; x = Math.min(1, Math.max(0, x)); return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
const FLASH = new THREE.Color("#fff3c8"), tint = new THREE.Color(), baseC = new THREE.Color();

function updateWorld(w, now) {
  if (w.done) return;
  const age = reduceMotion ? Infinity : now - w.born;
  const N = GRID * GRID, cur = w.cur;
  let flashed = false;
  for (let i = 0; i < N; i++) {
    const shown = age - w.showAt[i];
    // Deep sea stays off the flat map, so the map takes the island's shape;
    // it rises from the sea floor to its depth in phase 2.
    const deep = w.g.tiles[i] === T.DEEP;
    let top;
    if (reduceMotion) top = w.heights[i];
    else if (shown < 0 || (deep && age < w.riseAt[i])) top = BASE; // not decided yet
    else if (age < w.riseAt[i]) top = FLAT + (1 - easeOut(shown / T_DROP)) * 0.45; // drops onto the map
    else {
      const from = deep ? BASE : FLAT;
      top = from + (w.heights[i] - from) * easeInOut((age - w.riseAt[i]) / T_RISE);
    }
    cur[i] = top;
    const [x, z] = cellXZ(i);
    m4.compose(v.set(x, BASE, z), q.identity(), sc.set(1, Math.max(0.001, top - BASE), 1));
    w.cols.setMatrixAt(i, m4);
    // A newly decided tile flashes pale, then fades to its own colour.
    if (!reduceMotion && !deep && shown >= 0 && shown < 0.7) {
      baseC.fromArray(w.baseColor, i * 3);
      w.cols.setColorAt(i, tint.copy(FLASH).lerp(baseC, easeOut(shown / 0.6)));
      flashed = true;
    }
  }
  w.cols.instanceMatrix.needsUpdate = true;
  if (flashed) w.cols.instanceColor.needsUpdate = true;
  for (const { mesh, list } of w.propMeshes) {
    list.forEach((p, k) => {
      const grow = reduceMotion ? 1 : easeBack((age - w.riseAt[p.cell] - T_RISE * 0.85) / T_PROP);
      const s = Math.max(0.001, p.s * grow);
      m4.compose(v.set(p.x, cur[p.cell], p.z), q.setFromAxisAngle(Y, p.rot), sc.set(s, s, s));
      mesh.setMatrixAt(k, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  if (age > w.end) {
    w.cols.instanceColor.array.set(w.baseColor);
    w.cols.instanceColor.needsUpdate = true;
    w.done = true;
  }
}

/* ------------------------------------------------------------------ */
/* Landmarks: the places the camera visits, found in each new island   */
/* ------------------------------------------------------------------ */

function findLandmarks(g, heights) {
  const N = GRID * GRID;
  // Keep each scene clear of the ones already placed.
  const far = (i, avoid, d) => {
    const [x, z] = cellXZ(i);
    return avoid.every((p) => (x - p.x) ** 2 + (z - p.z) ** 2 >= d * d);
  };
  const score = (want, radius, avoid = [], minD = 7) => {
    let best = -1, bestS = -1;
    for (let i = 0; i < N; i++) {
      if (!want.includes(g.tiles[i]) || !far(i, avoid, minD)) continue;
      const x0 = i % GRID, y0 = (i / GRID) | 0;
      let s = 0;
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const x = x0 + dx, y = y0 + dy;
          if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
          if (want.includes(g.tiles[y * GRID + x])) s++;
        }
      if (s > bestS) { bestS = s; best = i; }
    }
    return best < 0 && avoid.length ? score(want, radius) : best;
  };
  const at = (i, fallback) => {
    if (i < 0) return fallback.clone();
    const [x, z] = cellXZ(i);
    return new THREE.Vector3(x, Math.max(heights[i], 0), z);
  };
  const center = new THREE.Vector3(0, 0.5, 0);
  // Beaches on each side: the one that sticks out furthest that way.
  const beach = (fn, avoid = []) => {
    let best = -1, bestS = -Infinity;
    for (let i = 0; i < N; i++) {
      if (g.tiles[i] !== T.SAND || !far(i, avoid, 8)) continue;
      const s = fn(i % GRID - GRID / 2, ((i / GRID) | 0) - GRID / 2);
      if (s > bestS) { bestS = s; best = i; }
    }
    return best < 0 && avoid.length ? beach(fn) : best;
  };
  const south = at(beach((x, z) => z - Math.abs(x) * 0.6), center);
  const north = at(beach((x, z) => -z - Math.abs(x) * 0.6), center);
  const west = at(beach((x, z) => -x - Math.abs(z) * 0.6, [south, north]), center);
  const east = at(beach((x, z) => x - Math.abs(z) * 0.6, [south, north, west]), center);
  const village = at(score([T.VILLAGE], 2, [south, north, west]), center);
  const forest = at(score([T.FOREST], 2, [village, south, north, west]), center);
  const peak = at(score([T.SNOW], 1), center);
  const rock = at(score([T.ROCK, T.SNOW], 2, [peak, forest, village]), center);
  return { center, village, forest, peak, rock, south, north, west, east };
}

/* ------------------------------------------------------------------ */
/* Clouds                                                              */
/* ------------------------------------------------------------------ */

const clouds = new THREE.Group();
{
  const r = rng(7);
  const puff = new THREE.IcosahedronGeometry(1, 0);
  const cm = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, flatShading: true, transparent: true, opacity: 0.93 });
  for (let c = 0; c < 9; c++) {
    const cl = new THREE.Group();
    const n = 3 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const p = new THREE.Mesh(puff, cm);
      p.position.set(k * 1.1 - n * 0.5 + r() * 0.4, r() * 0.5, (r() - 0.5) * 1.2);
      const s = 0.8 + r() * 0.9;
      p.scale.set(s * 1.3, s * 0.65, s);
      p.castShadow = true;
      cl.add(p);
    }
    cl.position.set((r() - 0.5) * 90, 10 + r() * 4, -42 + r() * 40);
    cl.userData.speed = 0.35 + r() * 0.5;
    clouds.add(cl);
  }
  scene.add(clouds);
}

/* ------------------------------------------------------------------ */
/* Camera flight: one stop per section, driven by scroll               */
/* ------------------------------------------------------------------ */

const sections = [...document.querySelectorAll("[data-cam]")];
let anchors = [];
let panelRight = [];
function measure() {
  anchors = sections.map((s, i) => (i === 0 ? 0 : s.offsetTop + s.offsetHeight / 2 - innerHeight / 2));
  panelRight = sections.map((s) => s.querySelector(".panel")?.getBoundingClientRect().right ?? 0);
}

function stopParams(i, mobile) {
  const name = sections[i].dataset.cam;
  const s = STOPS[name];
  const lm = world.landmarks[s.target];
  const dist = s.dist * (mobile ? 1.35 : 1), h = s.h * (mobile ? 1.3 : 1);
  let shift = mobile ? 0 : s.shift;
  if (!mobile && panelRight[i] && name !== "hero" && !s.top) {
    // Centre the scene in the space right of the text panel.
    const perPx = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * Math.hypot(dist, h)) / innerHeight;
    shift = Math.max(0, ((panelRight[i] + innerWidth) / 2 - innerWidth / 2) * perPx);
  }
  // ahead: aim a little toward the camera, for scenes that run out that way.
  const ah = s.ahead || 0, ar = THREE.MathUtils.degToRad(s.az);
  return { tx: lm.x + Math.sin(ar) * ah, ty: lm.y + (s.up || 0), tz: lm.z + Math.cos(ar) * ah, az: s.az, dist, h, shift, lift: mobile ? s.h * (s.mlift ?? (name === "hero" ? 0.42 : 0.22)) : 0 };
}

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const cam = { tx: 0, ty: 0, tz: 0, az: 18, dist: 40, h: 30, shift: 11, lift: 0 };
let camInit = false;
const pointer = { x: 0, y: 0 };
addEventListener("pointermove", (e) => {
  pointer.x = e.clientX / innerWidth - 0.5;
  pointer.y = e.clientY / innerHeight - 0.5;
});

function targetCam() {
  const mobile = innerWidth < 720;
  const y = scrollY;
  let i = 0;
  while (i < anchors.length - 1 && y > anchors[i + 1]) i++;
  const na = sections[i].dataset.cam;
  const a = stopParams(i, mobile);
  if (i >= anchors.length - 1) return [a, { [na]: 1 }];
  const nb = sections[i + 1].dataset.cam;
  const b = stopParams(i + 1, mobile);
  const t = smooth(Math.min(1, Math.max(0, (y - anchors[i]) / (anchors[i + 1] - anchors[i]))));
  const out = {};
  for (const k of Object.keys(a)) out[k] = lerp(a[k], b[k], t);
  // Climb a little mid-flight so the path clears the peaks.
  out.h += Math.sin(t * Math.PI) * 6;
  return [out, { [na]: 1 - t, [nb]: t }];
}

// How much each stop is in view (0..1), eased like the camera. The scenes
// use it to fade their focus effects in and out.
const weights = Object.fromEntries(Object.keys(STOPS).map((k) => [k, 0]));
// Slow orbit of the hero view. It unwinds when you scroll away, so the
// scenes at the stops face the camera.
let orbit = 0;

const look = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
function placeCamera(dt, now) {
  const [tc, tw] = targetCam();
  const k = camInit ? 1 - Math.exp(-dt * 3.2) : 1;
  camInit = true;
  for (const key of Object.keys(cam)) cam[key] += (tc[key] - cam[key]) * k;
  for (const key of Object.keys(weights)) weights[key] += ((tw[key] || 0) - weights[key]) * k;
  if (!reduceMotion) {
    orbit += dt * 1.2 * weights.hero;
    orbit = ((((orbit + 180) % 360) + 360) % 360) - 180;
    orbit -= orbit * (1 - Math.exp(-dt * 0.9)) * (1 - weights.hero);
  }
  const drift = reduceMotion ? 0 : orbit + Math.sin(now * 0.25) * 2.5 + pointer.x * 6;
  const az = THREE.MathUtils.degToRad(cam.az + drift);
  camera.position.set(cam.tx + Math.sin(az) * cam.dist, cam.ty + cam.h + (reduceMotion ? 0 : -pointer.y * 1.5), cam.tz + Math.cos(az) * cam.dist);
  look.set(cam.tx, cam.ty, cam.tz);
  // Slide the subject to the right of the text column.
  fwd.subVectors(look, camera.position);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(-Math.sin(az), 0, -Math.cos(az));
  fwd.normalize();
  right.crossVectors(fwd, Y).normalize();
  look.addScaledVector(right, -cam.shift);
  look.y -= cam.lift;
  camera.up.set(0, 1, 0);
  if (cam.dist < 1) camera.up.set(-Math.sin(az), 0, -Math.cos(az)); // straight down: keep north up
  camera.lookAt(look);
}

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */

const clock = new THREE.Clock();

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < 720 ? 50 : 38;
  camera.updateProjectionMatrix();
  measure();
}
addEventListener("resize", resize);
addEventListener("load", measure);
// Fonts and images change the layout after load; keep the anchors in step.
if ("ResizeObserver" in window) new ResizeObserver(measure).observe(document.querySelector("main"));

function seedFromUrl() {
  const s = parseInt(new URLSearchParams(location.search).get("seed"), 10);
  return Number.isFinite(s) && s > 0 ? s : 1089;
}

let scenes = null, sea = null;
function grow(seed) {
  if (scenes) scenes.dispose();
  if (sea) sea.dispose();
  if (world) disposeWorld(world);
  world = buildWorld(seed);
  scenes = createScenes(world, { scene, clock, tileColors: TILE });
  sea = createSea(scene, world, waterGeo);
  showStat({ cells: GRID * GRID, ms: world.ms, seed });
}

document.getElementById("regen").addEventListener("click", () => {
  const seed = 1 + Math.floor(Math.random() * 99999);
  const url = new URL(location.href);
  url.searchParams.set("seed", seed);
  history.replaceState(null, "", url);
  grow(seed);
});

// Credits for the 3D models, listed from the manifest the fetch script writes.
loadManifest().then((m) => {
  const list = m.models || [];
  const box = document.getElementById("credits");
  if (!list.length || !box) return;
  const ul = box.querySelector("ul");
  for (const e of list) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `https://poly.pizza/m/${encodeURIComponent(e.id)}`;
    a.textContent = e.title;
    li.append(a, ` · ${e.author} · ${e.licence}`);
    ul.append(li);
  }
  box.hidden = false;
});

// The island's trees come from a model pack when it is there: these pieces of
// it are single trees (the pack also holds rocks, a ground slab and clouds).
// Wait for it a moment before the first island, then carry on without it.
const TREE_PIECES = ["group2112331936", "group546125134", "group100681590", "group2102696020", "group1206298165", "group1610579876"];
let treeParts = null;
await Promise.race([
  loadModelParts("tree", 0.95, TREE_PIECES).then((p) => { treeParts = p; }, () => {}),
  new Promise((r) => setTimeout(r, 2500)),
]);

resize();
grow(seedFromUrl());

let last = 0;
renderer.setAnimationLoop(() => {
  const now = clock.getElapsedTime();
  const dt = Math.min(0.05, now - last);
  last = now;

  updateWorld(world, now);

  if (!reduceMotion) {
    const p = waterGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = waterBase[i * 3], z = waterBase[i * 3 + 2];
      p.array[i * 3 + 1] = waterY(x, z, now);
    }
    p.needsUpdate = true;
    for (const c of clouds.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 50) c.position.x = -50;
    }
  }

  placeCamera(dt, now);
  scenes.update(now, dt, weights);
  sea.update(now);
  renderer.render(scene, camera);
});
