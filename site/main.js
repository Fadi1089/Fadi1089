import * as THREE from "three";
import { generate, rng, T } from "./wfc.js";
import { I18N } from "./i18n.js";

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

// Water: a faceted plane whose vertices ripple every frame.
const WATER_Y = 0;
const waterGeo = new THREE.PlaneGeometry(240, 240, 120, 120);
waterGeo.rotateX(-Math.PI / 2);
const waterBase = Float32Array.from(waterGeo.attributes.position.array);
const water = new THREE.Mesh(
  waterGeo,
  new THREE.MeshStandardMaterial({ color: "#2b7f99", transparent: true, opacity: 0.72, roughness: 0.18, metalness: 0.05, flatShading: true })
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
const RISE = reduceMotion ? 0 : 0.75; // seconds for one column to rise
const STEP = reduceMotion ? 0 : 1.7 / (GRID * GRID); // whole collapse replays in ~1.7 s

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
  const startAt = new Float32Array(N);
  g.order.forEach((cell, k) => { startAt[cell] = k * STEP; });

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

  // Props: trees, houses and rocks, each tied to the cell it stands on.
  const props = { tree: [], trunk: [], wall: [], roof: [], rock: [] };
  const add = (kind, cell, x, z, s, rot) => props[kind].push({ cell, x, z, s, rot });
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
  const propMeshes = {};
  for (const [kind, list] of Object.entries(props)) {
    const geo = { tree: treeGeo, trunk: trunkGeo, wall: wallGeo, roof: roofGeo, rock: rockGeo }[kind];
    const m = new THREE.InstancedMesh(geo, mat[kind], Math.max(1, list.length));
    m.count = list.length;
    m.castShadow = true;
    m.receiveShadow = kind !== "tree";
    group.add(m);
    propMeshes[kind] = { mesh: m, list };
  }

  scene.add(group);
  return { g, group, cols, heights, startAt, propMeshes, born: clock.getElapsedTime(), done: false, ms, landmarks: findLandmarks(g, heights) };
}

function disposeWorld(w) {
  scene.remove(w.group);
  w.group.traverse((o) => o.isInstancedMesh && o.dispose());
}

const ease = (x) => {
  const c = 1.4;
  x = Math.min(1, Math.max(0, x));
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);

function updateWorld(w, now) {
  if (w.done) return;
  const age = now - w.born;
  let moving = false;
  const N = GRID * GRID;
  const cur = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const p = RISE ? ease((age - w.startAt[i]) / RISE) : 1;
    if (p < 1) moving = true;
    const top = BASE + (w.heights[i] - BASE) * p;
    cur[i] = top;
    const [x, z] = cellXZ(i);
    m4.compose(v.set(x, BASE, z), q.identity(), sc.set(1, Math.max(0.001, top - BASE), 1));
    w.cols.setMatrixAt(i, m4);
  }
  w.cols.instanceMatrix.needsUpdate = true;
  for (const { mesh, list } of Object.values(w.propMeshes)) {
    list.forEach((p, k) => {
      const grow = RISE ? ease((age - w.startAt[p.cell] - RISE * 0.7) / 0.45) : 1;
      if (grow < 1) moving = true;
      const s = Math.max(0.001, p.s * grow);
      m4.compose(v.set(p.x, cur[p.cell], p.z), q.setFromAxisAngle(Y, p.rot), sc.set(s, s, s));
      mesh.setMatrixAt(k, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  if (!moving) w.done = true;
}

/* ------------------------------------------------------------------ */
/* Landmarks: the places the camera visits, found in each new island   */
/* ------------------------------------------------------------------ */

function findLandmarks(g, heights) {
  const N = GRID * GRID;
  const score = (want, radius) => {
    let best = -1, bestS = -1;
    for (let i = 0; i < N; i++) {
      if (!want.includes(g.tiles[i])) continue;
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
    return best;
  };
  const at = (i, fallback) => {
    if (i < 0) return fallback.clone();
    const [x, z] = cellXZ(i);
    return new THREE.Vector3(x, Math.max(heights[i], 0), z);
  };
  const center = new THREE.Vector3(0, 0.5, 0);
  // Beach facing the camera side (south), and one on the far side.
  let south = -1, north = -1, sBest = -Infinity, nBest = -Infinity;
  for (let i = 0; i < N; i++) {
    if (g.tiles[i] !== T.SAND) continue;
    const z = (i / GRID) | 0, x = i % GRID;
    const cx = Math.abs(x - GRID / 2);
    if (z - cx * 0.6 > sBest) { sBest = z - cx * 0.6; south = i; }
    if (-z - cx * 0.6 > nBest) { nBest = -z - cx * 0.6; north = i; }
  }
  return {
    center,
    village: at(score([T.VILLAGE], 2), center),
    forest: at(score([T.FOREST], 2), center),
    peak: at(score([T.SNOW], 1), center),
    rock: at(score([T.ROCK, T.SNOW], 2), center),
    south: at(south, center),
    north: at(north, center),
  };
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

// target: landmark name, az: degrees around it, dist: horizontal distance,
// h: height above target, shift: how far the subject slides right (desktop)
const STOPS = {
  hero: { target: "center", az: 18, dist: 44, h: 31, shift: 17 },
  about: { target: "south", az: -25, dist: 13, h: 7, shift: 3.5 },
  tristik: { target: "village", az: 40, dist: 11, h: 8, shift: 3.5 },
  cvie: { target: "forest", az: 115, dist: 12, h: 8.5, shift: 3.5 },
  formio: { target: "north", az: 190, dist: 13, h: 7.5, shift: 3.5 },
  wfc: { target: "center", az: 200, dist: 0.01, h: 62, shift: 14, top: true },
  adeli: { target: "peak", az: 300, dist: 15, h: 9, shift: 4.5 },
  stack: { target: "rock", az: 250, dist: 26, h: 9, shift: 7 },
  contact: { target: "center", az: 378, dist: 52, h: 36, shift: 12 },
};

const sections = [...document.querySelectorAll("[data-cam]")];
let anchors = [];
function measure() {
  anchors = sections.map((s, i) => (i === 0 ? 0 : s.offsetTop + s.offsetHeight / 2 - innerHeight / 2));
}

function stopParams(name, mobile) {
  const s = STOPS[name];
  const lm = world.landmarks[s.target];
  return { tx: lm.x, ty: lm.y, tz: lm.z, az: s.az, dist: s.dist * (mobile ? 1.35 : 1), h: s.h * (mobile ? 1.3 : 1), shift: mobile ? 0 : s.shift, lift: mobile ? s.h * (name === "hero" ? 0.42 : 0.22) : 0 };
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
  const a = stopParams(sections[i].dataset.cam, mobile);
  if (i >= anchors.length - 1) return a;
  const b = stopParams(sections[i + 1].dataset.cam, mobile);
  const t = smooth(Math.min(1, Math.max(0, (y - anchors[i]) / (anchors[i + 1] - anchors[i]))));
  const out = {};
  for (const k of Object.keys(a)) out[k] = lerp(a[k], b[k], t);
  // Climb a little mid-flight so the path clears the peaks.
  out.h += Math.sin(t * Math.PI) * 6;
  return out;
}

const look = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
function placeCamera(dt, now) {
  const tc = targetCam();
  const k = camInit ? 1 - Math.exp(-dt * 3.2) : 1;
  camInit = true;
  for (const key of Object.keys(cam)) cam[key] += (tc[key] - cam[key]) * k;
  const drift = reduceMotion ? 0 : now * 1.2 + pointer.x * 6;
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

function seedFromUrl() {
  const s = parseInt(new URLSearchParams(location.search).get("seed"), 10);
  return Number.isFinite(s) && s > 0 ? s : 1089;
}

function grow(seed) {
  if (world) disposeWorld(world);
  world = buildWorld(seed);
  showStat({ cells: GRID * GRID, ms: world.ms, seed });
}

document.getElementById("regen").addEventListener("click", () => {
  const seed = 1 + Math.floor(Math.random() * 99999);
  const url = new URL(location.href);
  url.searchParams.set("seed", seed);
  history.replaceState(null, "", url);
  grow(seed);
});

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
      p.array[i * 3 + 1] = Math.sin(x * 0.55 + now * 1.3) * 0.07 + Math.cos(z * 0.7 + now * 0.9) * 0.06 + Math.sin((x + z) * 1.7 + now * 2.1) * 0.025;
    }
    p.needsUpdate = true;
    for (const c of clouds.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 50) c.position.x = -50;
    }
  }

  placeCamera(dt, now);
  renderer.render(scene, camera);
});
