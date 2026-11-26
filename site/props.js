// Small 3D scenes at the camera stops, one per section. Props come from
// Poly Pizza models in site/models (scripts/fetch_models.sh downloads them);
// every model has a procedural fallback built from primitives, so the site
// still works when a model, or the whole folder, is missing.
//
// Scene layouts are written in a local frame: +x is screen right, +z points
// toward the camera of that stop. Each item is then turned by the stop's
// azimuth and snapped onto the island.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { T } from "./wfc.js";
import { STOPS } from "./stops.js";

const DEG = Math.PI / 180;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const easeBack = (x) => { const c = 1.6; x = clamp01(x); return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const bounce = (x) => {
  x = clamp01(x);
  if (x < 1 / 2.75) return 7.5625 * x * x;
  if (x < 2 / 2.75) return 7.5625 * (x -= 1.5 / 2.75) * x + 0.75;
  if (x < 2.5 / 2.75) return 7.5625 * (x -= 2.25 / 2.75) * x + 0.9375;
  return 7.5625 * (x -= 2.625 / 2.75) * x + 0.984375;
};

/* ------------------------------------------------------------------ */
/* Models                                                              */
/* ------------------------------------------------------------------ */

let manifestP = null;
export function loadManifest() {
  manifestP ??= fetch("models/manifest.json")
    .then((r) => (r.ok ? r.json() : { models: [] }))
    .catch(() => ({ models: [] }));
  return manifestP;
}

let loader = null;
const modelP = new Map();
function getModel(name) {
  if (!modelP.has(name)) {
    modelP.set(name, loadManifest().then((m) => {
      if (!(m.models || []).some((e) => e.name === name)) return null;
      loader ??= new GLTFLoader();
      return loader.loadAsync(`models/${name}.glb`).then(prepModel, () => null);
    }));
  }
  return modelP.get(name);
}

function prepModel(gltf) {
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      // Match the island: flat-shaded, matte, no metal (there is no
      // environment map, so metallic surfaces would render black).
      if ("metalness" in m) m.metalness = 0;
      if ("roughness" in m) m.roughness = Math.max(m.roughness, 0.75);
      if ("flatShading" in m) m.flatShading = true;
      m.needsUpdate = true;
    }
  });
  return gltf;
}

// Turns (degrees) that stand a model up and make its front face +z,
// found by looking at each one.
const MODEL_FIX = { desk: { y: 180 }, laptop: { y: 180 }, plane: { y: 180 } };

const _box = new THREE.Box3(), _size = new THREE.Vector3(), _ctr = new THREE.Vector3();
// Wrap obj so it stands on y = 0, centred, at height o.h (or with its largest
// horizontal side o.w). The wrapper records its final dimensions.
function fit(obj, o) {
  const wrap = new THREE.Group();
  wrap.add(obj);
  wrap.updateMatrixWorld(true);
  obj.traverse((c) => c.isSkinnedMesh && c.skeleton.update());
  _box.setFromObject(obj, true);
  _box.getSize(_size);
  _box.getCenter(_ctr);
  const s = o.h ? o.h / Math.max(_size.y, 1e-6) : o.w / Math.max(_size.x, _size.z, 1e-6);
  obj.position.x -= _ctr.x;
  obj.position.z -= _ctr.z;
  obj.position.y -= _box.min.y;
  wrap.scale.setScalar(s);
  wrap.userData.dims = { w: _size.x * s, h: _size.y * s, d: _size.z * s };
  return wrap;
}

// A model as plain parts (geometry + material), baked to stand on y = 0,
// centred, at the given height: for drawing many copies with InstancedMesh.
export async function loadModelParts(name, height) {
  const gltf = await getModel(name);
  if (!gltf) return null;
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const s = height / size.y, parts = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld).translate(-c.x, -box.min.y, -c.z).scale(s, s, s);
    parts.push({ geometry: geo, material: o.material });
  });
  return parts.length ? parts : null;
}

function fromModel(gltf, spec) {
  const obj = SkeletonUtils.clone(gltf.scene);
  const fix = MODEL_FIX[spec.m];
  if (fix) obj.rotation.set(obj.rotation.x + (fix.x || 0) * DEG, obj.rotation.y + (fix.y || 0) * DEG, obj.rotation.z, "YXZ");
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    o.userData.shared = true; // geometry belongs to the cached model
    if (spec.tint) {
      o.material = [].concat(o.material).map((m) => { const c = m.clone(); c.color.set(spec.tint); return c; });
      if (o.material.length === 1) o.material = o.material[0];
      o.userData.ownMat = true;
    }
  });
  const wrap = fit(obj, spec);
  if (spec.clip && gltf.animations.length) {
    const clip = gltf.animations.find((a) => a.name === spec.clip || a.name.endsWith("|" + spec.clip));
    if (clip) {
      const mixer = new THREE.AnimationMixer(obj);
      mixer.clipAction(clip).play();
      mixer.update(0); // pose the skeleton now, so placement code sees the real pose
      wrap.userData.mixer = mixer;
    }
  }
  return wrap;
}

/* ------------------------------------------------------------------ */
/* Primitive helpers (fallback props and procedural pieces)            */
/* ------------------------------------------------------------------ */

const mats = new Map();
function M(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o }));
  return mats.get(key);
}
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, typeof mat === "string" ? M(mat) : mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
// Primitives sit on their base (y = 0 is the bottom) unless noted.
const box = (w, h, d, c, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), c, x, y, z);
const cyl = (rt, rb, h, c, x, y, z, seg = 10) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0), c, x, y, z);
const cone = (r, h, c, x, y, z, seg = 8) => mesh(new THREE.ConeGeometry(r, h, seg).translate(0, h / 2, 0), c, x, y, z);
const ball = (r, c, x, y, z) => mesh(new THREE.IcosahedronGeometry(r, 1), c, x, y, z); // centred
const grp = (...kids) => { const g = new THREE.Group(); for (const k of kids) g.add(k); return g; };
const rot = (o, x = 0, y = 0, z = 0) => { o.rotation.set(x, y, z); return o; };
const scl = (o, x, y, z) => { o.scale.set(x, y, z); return o; };

const WOOD = "#8a5a3b", DARKWOOD = "#6b4a33", PAPER = "#fbf8f0", INK = "#0d2433", METAL = "#9aa4ad", DARK = "#2a2f36";
const glow = (c, e = c) => M(c, { emissive: e, emissiveIntensity: 0.9, flatShading: false });

function paperPlaneGeo() {
  // A dart folded from one sheet: two wings and a keel, nose toward +z.
  const v = [
    0, 0, 0.6, -0.36, 0.04, -0.4, 0, 0, -0.4,
    0, 0, 0.6, 0, 0, -0.4, 0.36, 0.04, -0.4,
    0, 0, 0.6, 0, 0, -0.4, 0, -0.13, -0.4,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

const FALLBACK = {
  desk: () => grp(box(1.2, 0.07, 0.6, WOOD, 0, 0.63, 0),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => box(0.07, 0.63, 0.07, DARKWOOD, a * 0.54, 0, b * 0.24))),
  laptop: () => {
    const lid = grp(box(0.5, 0.32, 0.025, DARK), box(0.44, 0.26, 0.006, glow("#8fd3ee", "#3f9fc4"), 0, 0.03, 0.014));
    lid.position.z = -0.16;
    lid.rotation.x = -0.25;
    return grp(box(0.5, 0.03, 0.34, DARK), lid);
  },
  cat: () => {
    const c = "#26262b";
    return grp(scl(ball(0.3, c, 0, 0.36, 0), 0.8, 0.75, 1.3), ball(0.19, c, 0, 0.6, 0.36),
      cone(0.07, 0.14, c, -0.1, 0.72, 0.36, 4), cone(0.07, 0.14, c, 0.1, 0.72, 0.36, 4),
      rot(cyl(0.03, 0.04, 0.5, c, 0, 0.3, -0.36), -0.7),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => cyl(0.04, 0.04, 0.22, c, a * 0.12, 0, b * 0.22)));
  },
  campfire: () => grp(
    ...Array.from({ length: 7 }, (_, k) => ball(0.08, "#8f8b99", Math.cos(k * 0.9) * 0.3, 0.05, Math.sin(k * 0.9) * 0.3)),
    ...[0, 1, 2].map((k) => rot(cyl(0.05, 0.05, 0.55, DARKWOOD, 0, 0.06, 0, 6), 0, k * 1.05, Math.PI / 2 - 0.25))),
  folder: () => grp(box(0.7, 0.5, 0.05, "#e2b35a"), box(0.22, 0.06, 0.05, "#e2b35a", -0.22, 0.5, 0)),
  penguin: () => grp(scl(ball(0.3, "#1f2329", 0, 0.45, 0), 1, 1.45, 0.9), scl(ball(0.24, "#f4f4f0", 0, 0.42, 0.13), 0.9, 1.3, 0.5),
    ball(0.17, "#1f2329", 0, 0.84, 0.02), rot(cone(0.045, 0.14, "#f0a030", 0, 0.82, 0.16, 4), Math.PI / 2),
    box(0.1, 0.03, 0.13, "#f0a030", -0.1, 0, 0.06), box(0.1, 0.03, 0.13, "#f0a030", 0.1, 0, 0.06)),
  tent: () => grp(rot(cone(0.62, 0.75, "#d8735a", 0, 0, 0, 4), 0, Math.PI / 4), box(0.2, 0.3, 0.02, "#3a2a20", 0, 0, 0.36)),
  flag: () => grp(cyl(0.025, 0.03, 1.6, METAL), box(0.6, 0.38, 0.02, "#d8735a", 0.3, 1.2, 0)),
  dish: () => {
    const dish = mesh(new THREE.SphereGeometry(0.45, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.32), M("#e8ecef", { side: THREE.DoubleSide }), 0, 0.85, 0);
    dish.rotation.x = 0.95;
    return grp(cyl(0.1, 0.16, 0.6, "#c8ccd0"), dish);
  },
  igloo: () => grp(mesh(new THREE.SphereGeometry(0.7, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), "#eef2f4"),
    mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.45, 10).rotateX(Math.PI / 2), "#e4eaee", 0, 0.12, 0.68),
    mesh(new THREE.CircleGeometry(0.17, 10), "#1a2a33", 0, 0.14, 0.91)),
  sled: () => grp(box(0.06, 0.05, 1.0, DARKWOOD, -0.22, 0, 0), box(0.06, 0.05, 1.0, DARKWOOD, 0.22, 0, 0), box(0.56, 0.04, 0.85, "#b07a4a", 0, 0.12, 0)),
  mailbox: () => grp(box(0.08, 0.8, 0.08, DARKWOOD), box(0.32, 0.28, 0.5, "#3a6ea5", 0, 0.8, 0), box(0.03, 0.16, 0.06, "#d8735a", 0.18, 0.9, -0.1)),
  bottle: () => grp(cyl(0.12, 0.12, 0.45, M("#5fa08a", { transparent: true, opacity: 0.7 })), cyl(0.05, 0.08, 0.15, M("#5fa08a", { transparent: true, opacity: 0.7 }), 0, 0.45, 0),
    box(0.08, 0.3, 0.08, PAPER, 0, 0.06, 0), cyl(0.05, 0.05, 0.06, "#b07a4a", 0, 0.6, 0)),
  plane: () => grp(mesh(paperPlaneGeo(), M(PAPER, { side: THREE.DoubleSide }))),
  chair: () => grp(...[0, 1, 2, 3, 4].map((k) => rot(box(0.3, 0.025, 0.04, "#2b2f36", 0, 0.02, 0), 0, k * 1.2566, 0)),
    cyl(0.025, 0.025, 0.22, METAL, 0, 0.02, 0), box(0.42, 0.07, 0.4, "#3b6ea8", 0, 0.24, 0), box(0.4, 0.4, 0.06, "#2b2f36", 0, 0.3, -0.2)),
  fish: () => grp(scl(ball(0.12, "#9fb4c2", 0, 0.1, 0), 0.55, 0.8, 1.5), rot(cone(0.08, 0.12, "#7f95a5", 0, 0.1, -0.22, 4), -Math.PI / 2)),
  clownfish: () => grp(scl(ball(0.12, "#f08a3c", 0, 0.1, 0), 0.6, 0.85, 1.3), scl(ball(0.122, "#ffffff", 0, 0.1, 0.02), 0.62, 0.86, 0.25), rot(cone(0.08, 0.12, "#f08a3c", 0, 0.1, -0.2, 4), -Math.PI / 2)),
};

/* ------------------------------------------------------------------ */
/* Canvas textures: CV page, form page, labelled stack blocks          */
/* ------------------------------------------------------------------ */

const DISPLAY = '"Bricolage Grotesque", "Arial Narrow", sans-serif';
const MONO = '"JetBrains Mono", Menlo, monospace';
const fontsReady = document.fonts
  ? Promise.all([document.fonts.load(`800 60px ${DISPLAY}`), document.fonts.load(`600 24px ${MONO}`)]).catch(() => {})
  : Promise.resolve();

const textures = {};
function canvasTex(key, w, h, draw) {
  if (textures[key]) return textures[key];
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const paint = () => {
    const g = c.getContext("2d");
    if ("fontStretch" in g) g.fontStretch = "condensed";
    draw(g, w, h);
    tex.needsUpdate = true;
  };
  paint();
  fontsReady.then(paint);
  tex.userData.paint = paint;
  return (textures[key] = tex);
}

// Deterministic line lengths, so the fake text looks the same on every visit.
const lineLen = (k) => 0.45 + (((k * 7919) % 97) / 97) * 0.5;

let portrait = null;
function cvTexture() {
  if (!portrait) {
    portrait = new Image();
    portrait.src = "img/fadi.webp";
    portrait.decode().then(() => textures.cv?.userData.paint(), () => {});
  }
  return canvasTex("cv", 512, 724, (g, w, h) => {
    g.fillStyle = PAPER;
    g.fillRect(0, 0, w, h);
    g.fillStyle = INK;
    g.fillRect(0, 0, w, 168);
    // Photo box
    g.fillStyle = "#e2c983";
    g.fillRect(30, 26, 116, 116);
    if (portrait.complete && portrait.naturalWidth) {
      const s = Math.min(portrait.naturalWidth, portrait.naturalHeight);
      g.drawImage(portrait, (portrait.naturalWidth - s) / 2, 0, s, s, 30, 26, 116, 116);
    }
    g.fillStyle = "#eef1ea";
    g.font = `800 62px ${DISPLAY}`;
    g.fillText("FADI", 168, 84);
    g.fillStyle = "#e2c983";
    g.fillText("SULTAN", 168, 140);
    // Sections: a coloured heading bar, then lines of "text".
    let y = 205, k = 1;
    for (const [rows, col] of [[4, "#d8735a"], [3, "#4f8a47"], [4, "#3a8fa6"]]) {
      g.fillStyle = col;
      g.fillRect(30, y, 150, 16);
      y += 36;
      for (let r = 0; r < rows; r++, k++) {
        g.fillStyle = "#c9c2b2";
        g.fillRect(30, y, (w - 60) * lineLen(k), 9);
        y += 22;
      }
      y += 24;
    }
    // Skill dots in the corner
    for (let r = 0; r < 3; r++)
      for (let d = 0; d < 5; d++) {
        g.fillStyle = d < 5 - r ? INK : "#d9d2c2";
        g.beginPath();
        g.arc(330 + d * 30, 225 + r * 26, 8, 0, Math.PI * 2);
        g.fill();
      }
  });
}

// The Formio form as it shows on a phone: one question with an audio clip,
// three choices, a send button. Shapes only, so it needs no translation.
function formTexture() {
  return canvasTex("form", 360, 720, (g, w, h) => {
    g.fillStyle = PAPER;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#7fb35a";
    g.fillRect(0, 0, w, 130);
    g.fillStyle = INK;
    g.font = `800 64px ${DISPLAY}`;
    g.fillText("FORMIO", 28, 98);
    g.fillStyle = "#2b3438";
    g.fillRect(28, 172, 250, 18);
    // Audio clip: play button and waveform.
    g.fillStyle = "#f4efe4";
    g.fillRect(28, 214, w - 56, 84);
    g.fillStyle = "#d8735a";
    g.beginPath();
    g.arc(70, 256, 26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.beginPath();
    g.moveTo(61, 242);
    g.lineTo(84, 256);
    g.lineTo(61, 270);
    g.fill();
    g.fillStyle = "#2b3438";
    for (let b = 0; b < 17; b++) {
      const bh = 8 + Math.abs(Math.sin(b * 1.7) * Math.cos(b * 0.6)) * 44;
      g.fillRect(114 + b * 12, 256 - bh / 2, 7, bh);
    }
    // Three choices, the middle one ticked.
    for (let o = 0; o < 3; o++) {
      const y = 340 + o * 62;
      g.strokeStyle = "#2b3438";
      g.lineWidth = 5;
      g.strokeRect(30, y, 32, 32);
      if (o === 1) {
        g.fillStyle = "#7fb35a";
        g.fillRect(30, y, 32, 32);
        g.strokeStyle = "#fff";
        g.beginPath();
        g.moveTo(37, y + 16);
        g.lineTo(45, y + 24);
        g.lineTo(56, y + 8);
        g.stroke();
      }
      g.fillStyle = "#c9c2b2";
      g.fillRect(82, y + 11, 200 * lineLen(o + 5), 12);
    }
    g.fillStyle = INK;
    g.fillRect(28, h - 120, w - 56, 64);
    g.fillStyle = "#e2c983";
    g.beginPath();
    g.moveTo(w / 2 - 12, h - 104);
    g.lineTo(w / 2 + 16, h - 88);
    g.lineTo(w / 2 - 12, h - 72);
    g.fill();
  });
}

// The stack as strata, bottom to top: systems, back-end, front-end, 3D.
// Each layer is coloured like a terrain tile. Names are product names.
const STRATA = [
  ["LINUX · C · GIT", "#8f8b99", "#1d2230"],
  ["NODE · PRISMA · POSTGRES", "#e2c983", INK],
  ["REACT · NEXT.JS · TYPESCRIPT", "#7fb35a", INK],
  ["THREE.JS · BLENDER · C#", "#eef2f4", INK],
];
const LAYER = { h: 0.3, w0: 2.3, d0: 1.5, dw: 0.3, dd: 0.25 };
const LABEL_PX = 400; // canvas pixels per world unit, the same on every layer
const strataMats = [];
function strataMaterials(k) {
  if (!strataMats[k]) {
    const [label, bg, fg] = STRATA[k];
    const lw = LAYER.w0 - k * LAYER.dw;
    const W = Math.round(lw * LABEL_PX), H = Math.round(LAYER.h * LABEL_PX);
    const tex = canvasTex("stratum" + k, W, H, (g, w, h) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = fg;
      // One text size for every layer: the largest that fits the narrowest.
      let size = h * 0.34;
      g.font = `600 ${size}px ${MONO}`;
      const fit = Math.min(...STRATA.map(([l], j) => ((LAYER.w0 - j * LAYER.dw) * LABEL_PX * 0.86) / g.measureText(l).width));
      if (fit < 1) g.font = `600 ${(size *= fit)}px ${MONO}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(label, w / 2, h / 2 + 2);
    });
    const side = M(bg);
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    strataMats[k] = [side, side, side, side, face, side];
  }
  return strataMats[k];
}

const pageMats = {};
function page(key, tex, w, h, tilt = -0.1) {
  pageMats[key] ??= new THREE.MeshStandardMaterial({ map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.3, roughness: 0.8 });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), pageMats[key]);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(Math.PI), M(PAPER));
  const sheet = grp(front, back);
  sheet.traverse((o) => { o.castShadow = true; o.userData.own = true; });
  sheet.position.y = h / 2;
  sheet.rotation.x = tilt;
  const g = grp(sheet);
  g.userData.dims = { w, h, d: 0.01 };
  g.userData.mat = pageMats[key];
  return g;
}

/* ------------------------------------------------------------------ */
/* Procedural pieces                                                   */
/* ------------------------------------------------------------------ */

// TrisTik board, in the game's own look: a cream board with a wooden fence,
// filled with one-biome tetrominoes, and a last piece that turns and drops
// into the gap. Geometry is merged per colour, so the board is a few meshes.
const TT = { cs: 0.5, cols: 8, rows: 5, gap: 0.025 };
const TT_COL = { forest: "#58a948", autumn: "#e0573f", wheat: "#ecc64a", water: "#3f8fd8", stone: "#2c2724" };
// [biome, cells as [column, row]], row 0 at the back. The last one drops in.
const TT_PIECES = [
  ["forest", [[0, 0], [1, 0], [0, 1], [0, 2]]],
  ["autumn", [[2, 0], [3, 0], [2, 1], [3, 1]]],
  ["water", [[4, 0], [5, 0], [5, 1], [6, 1]]],
  ["stone", [[6, 0]]],
  ["stone", [[7, 0]]],
  ["stone", [[4, 1]]],
  ["wheat", [[1, 1], [1, 2], [2, 2], [1, 3]]],
  ["forest", [[7, 1], [7, 2], [7, 3], [7, 4]]],
  ["autumn", [[0, 3], [0, 4], [1, 4], [2, 4]]],
  ["wheat", [[6, 2], [6, 3], [5, 3], [5, 4]]],
  ["water", [[2, 3], [3, 3], [3, 4], [4, 4]]],
  ["stone", [[6, 4]]],
  ["autumn", [[3, 2], [4, 2], [5, 2], [4, 3]]],
];

// Small deterministic noise for decoration placement.
const hash = (a, b, k) => (((Math.imul(a * 73856093 ^ b * 19349663 ^ k * 83492791, 2654435761) >>> 0) % 1000) / 1000);

// Collects geometry per colour, then merges each colour into one mesh.
function batcher() {
  const parts = new Map();
  const add = (color, geo, x, y, z, ry = 0) => {
    geo = geo.index ? geo.toNonIndexed() : geo;
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    if (!parts.has(color)) parts.set(color, []);
    parts.get(color).push(geo);
  };
  const build = () => {
    const g = new THREE.Group();
    for (const [color, list] of parts) {
      const m = new THREE.Mesh(mergeGeometries(list), M(color));
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      for (const geo of list) geo.dispose();
    }
    return g;
  };
  return { add, build };
}
const bxGeo = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);

// One piece's tiles, centred on (ox, oz). Neighbouring cells of the same
// piece join up; edges against other pieces keep a thin gap.
function ttTiles(b, biome, cells, ox, oz, y0) {
  const { cs, gap } = TT;
  const has = (c, r) => cells.some(([a, d]) => a === c && d === r);
  const col = TT_COL[biome];
  const topH = biome === "stone" ? 0.1 : biome === "water" ? 0.035 : 0.06;
  for (const [c, r] of cells) {
    const l = has(c - 1, r) ? 0 : gap, rt = has(c + 1, r) ? 0 : gap, bk = has(c, r - 1) ? 0 : gap, fr = has(c, r + 1) ? 0 : gap;
    const w = cs - l - rt, d = cs - bk - fr;
    const x = ox + c * cs + (l - rt) / 2, z = oz + r * cs + (bk - fr) / 2;
    b.add("#8a5a3b", bxGeo(w, 0.06, d), x, y0, z);
    b.add(col, bxGeo(w, topH, d), x, y0 + 0.06, z);
    const top = y0 + 0.06 + topH;
    const cx = ox + c * cs, cz = oz + r * cs;
    const rnd = (k) => hash(c + 11, r + 7, k + biome.length * 13);
    const at = (k) => [cx + (rnd(k) - 0.5) * cs * 0.6, cz + (rnd(k + 50) - 0.5) * cs * 0.6];
    if (biome === "forest") {
      for (let k = 0; k < 2; k++) {
        const [x1, z1] = at(k), h = 0.18 + rnd(k + 9) * 0.12;
        b.add("#2f6f37", new THREE.ConeGeometry(0.065 + rnd(k + 3) * 0.03, h, 6).translate(0, h / 2, 0), x1, top, z1);
      }
      const [x2, z2] = at(5);
      b.add("#7cbf4f", new THREE.IcosahedronGeometry(0.055, 0), x2, top + 0.06, z2);
    } else if (biome === "autumn") {
      for (let k = 0; k < 2; k++) {
        const [x1, z1] = at(k);
        b.add("#6b4a33", bxGeo(0.018, 0.08, 0.018), x1, top, z1);
        b.add(["#f39a3d", "#c8402e", "#f2c14a"][Math.floor(rnd(k + 20) * 3)], new THREE.IcosahedronGeometry(0.06 + rnd(k + 4) * 0.025, 0), x1, top + 0.12, z1);
      }
    } else if (biome === "wheat") {
      for (let k = 0; k < 7; k++) {
        const [x1, z1] = at(k), h = 0.09 + rnd(k + 30) * 0.05;
        b.add("#c99a2e", bxGeo(0.022, h, 0.022), x1, top, z1, rnd(k + 40) * 3);
      }
    } else if (biome === "water") {
      for (let k = 0; k < 2; k++) {
        const [x1, z1] = at(k);
        b.add("#8fd0f5", bxGeo(0.11, 0.006, 0.025), x1, top, z1);
      }
    }
  }
}

function ttBoard() {
  const { cs, cols, rows } = TT;
  const W = cols * cs, D = rows * cs, m = 0.14, wood = "#c08850";
  const ox = -((cols - 1) / 2) * cs, oz = -((rows - 1) / 2) * cs;
  const b = batcher();
  // Board: a low wooden base on the levelled plot, cream top, faint grid.
  b.add("#b88b5e", bxGeo(W + 2 * m, 0.05, D + 2 * m), 0, 0, 0);
  b.add("#efe6d2", bxGeo(W + 2 * m, 0.03, D + 2 * m), 0, 0.05, 0);
  for (let c = 0; c <= cols; c++) b.add("#d6c9ab", bxGeo(0.012, 0.004, D), -W / 2 + c * cs, 0.08, 0);
  for (let r = 0; r <= rows; r++) b.add("#d6c9ab", bxGeo(W, 0.004, 0.012), 0, 0.08, -D / 2 + r * cs);
  // Fence: posts around the edge, two rails.
  const ex = W / 2 + m / 2, ez = D / 2 + m / 2;
  for (let c = 0; c <= cols; c++)
    for (const z of [-ez, ez]) b.add(wood, bxGeo(0.045, 0.2, 0.045), -W / 2 + c * cs, 0.08, z);
  for (let r = 1; r < rows; r++)
    for (const x of [-ex, ex]) b.add(wood, bxGeo(0.045, 0.2, 0.045), x, 0.08, -D / 2 + r * cs);
  for (const y of [0.14, 0.23]) {
    for (const z of [-ez, ez]) b.add(wood, bxGeo(W + 0.05, 0.025, 0.025), 0, y, z);
    for (const x of [-ex, ex]) b.add(wood, bxGeo(0.025, 0.025, D + 0.05), x, y, 0);
  }
  const placed = TT_PIECES.slice(0, -1);
  for (const [biome, cells] of placed) ttTiles(b, biome, cells, ox, oz, 0.08);
  const g = b.build();

  // The last piece, built around its own centre so it can turn in place.
  const [biome, cells] = TT_PIECES[TT_PIECES.length - 1];
  const mc = cells.reduce((s, c) => s + c[0], 0) / cells.length, mr = cells.reduce((s, c) => s + c[1], 0) / cells.length;
  const pb = batcher();
  ttTiles(pb, biome, cells, -mc * cs, -mr * cs, 0);
  const drop = pb.build();
  const holder = new THREE.Group();
  holder.position.set(ox + mc * cs, 0.08, oz + mr * cs);
  holder.add(drop);
  g.add(holder);
  g.userData.drop = drop;
  g.userData.dims = { w: W + 2 * m, h: 0.3, d: D + 2 * m };
  return g;
}

// Stepped layers, each set back from the one below, like a terrace cut.
function strata() {
  const g = new THREE.Group();
  STRATA.forEach((_, k) => {
    const w = LAYER.w0 - k * LAYER.dw, d = LAYER.d0 - k * LAYER.dd;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, LAYER.h, d).translate(0, LAYER.h / 2, 0), strataMaterials(k));
    m.position.y = k * LAYER.h;
    m.castShadow = m.receiveShadow = true;
    m.userData.y = m.position.y;
    g.add(m);
  });
  g.userData.dims = { w: LAYER.w0, h: LAYER.h * STRATA.length, d: LAYER.d0 };
  return g;
}

// A notice board: two posts holding a page, standing on the ground.
function signBoard(key, tex, w, h, lift) {
  const p = page(key, tex, w, h, 0);
  p.position.set(0, lift, 0.035);
  const post = (x) => box(0.06, lift + h + 0.06, 0.06, DARKWOOD, x, 0, 0);
  const g = grp(p, post(-w / 2 + 0.05), post(w / 2 - 0.05), box(w + 0.12, 0.06, 0.08, WOOD, 0, lift + h, 0));
  g.userData.dims = { w, h: lift + h, d: 0.1 };
  g.userData.mat = p.userData.mat;
  return g;
}

// A big phone standing on the sand, showing a Formio form.
function phone() {
  const w = 0.64, h = 1.24, d = 0.07, tilt = -0.14;
  const body = grp(box(w, h, d, "#1d2228"), box(w * 0.3, 0.025, 0.01, "#3a4048", 0, h - 0.06, d / 2 + 0.003));
  const screen = page("form", formTexture(), w - 0.07, h - 0.16, 0);
  screen.position.set(0, 0.06, d / 2 + 0.004);
  body.add(screen);
  body.position.y = 0.06;
  body.rotation.x = tilt;
  const g = grp(body, box(w * 0.7, 0.06, 0.34, "#2b2f36", 0, 0, -0.1));
  g.userData.dims = { w, h: h + 0.06, d: 0.4 };
  g.userData.mat = screen.userData.mat;
  return g;
}

// Answers coming back as statistics: four bars that grow when the stop is in view.
function barChart() {
  const cols = ["#7fb35a", "#4f8a47", "#e2c983", "#d8735a"], hs = [0.42, 0.7, 0.52, 0.86];
  const g = grp(box(1.0, 0.05, 0.34, "#efe6d2"));
  hs.forEach((bh, k) => {
    const b = box(0.17, bh, 0.17, cols[k], -0.33 + k * 0.22, 0.05, 0);
    b.userData.h = bh;
    g.add(b);
  });
  g.userData.dims = { w: 1.0, h: 0.9, d: 0.34 };
  return g;
}

// A few loose sheets in a pile.
const paperPile = (n) => grp(...Array.from({ length: n }, (_, k) => rot(box(0.2, 0.012, 0.27, PAPER, (k % 2) * 0.02, k * 0.013, -(k % 3) * 0.015), 0, (k - n / 2) * 0.18, 0)));

// A log to sit on by the campfire.
const logSeat = () => grp(rot(cyl(0.07, 0.07, 0.5, DARKWOOD, 0, 0.07, 0.25, 8), Math.PI / 2, 0, 0));

// A jetty that starts where the beach meets the sea: walks out from the plot
// along +z until the ground drops under water, and sets its deck just above
// the sea. Items with from: <its index> are placed relative to its far end.
function seaJetty(it) {
  const { world, S, spec } = it;
  const W = world.g.W, H = world.g.H, c = Math.cos(S.th), s = Math.sin(S.th);
  const [lx, lz0] = spec.at, len = spec.len || 1.8;
  // Walk out until the ground is under water; the deck starts at that edge,
  // level with the last bit of beach, so it meets the sand without a gap.
  let lz = lz0, shore = it.base.y;
  for (; lz < lz0 + 6; lz += 0.05) {
    const x = S.P.x + lx * c + lz * s, z = S.P.z - lx * s + lz * c;
    const h = world.heights[Math.floor(z + H / 2) * W + Math.floor(x + W / 2)];
    if (h < 0.1) break;
    shore = h;
  }
  const deck = Math.max(0.3, shore), start = lz - 0.02;
  const g = jetty(len, deck);
  g.position.set(0, -it.base.y, start - lz0);
  it.anchor = [lx, start + len, deck];
  return grp(g);
}

// A small wooden jetty: planks on posts, deck at height top, along +z.
function jetty(len, top) {
  const g = new THREE.Group();
  for (let z = 0; z < len; z += 0.17) g.add(box(0.5, 0.04, 0.14, z % 0.34 < 0.17 ? "#b07a4a" : "#a06c40", 0, top - 0.04, z + 0.07));
  for (let z = 0.25; z < len; z += 0.55)
    for (const x of [-0.22, 0.22]) g.add(cyl(0.035, 0.035, top + 1.2, DARKWOOD, x, -1.2, z, 6));
  g.userData.dims = { w: 0.5, h: top, d: len };
  return g;
}

const fireMats = [
  new THREE.MeshBasicMaterial({ color: "#ff7a2e" }),
  new THREE.MeshBasicMaterial({ color: "#ffc04a" }),
];
let flameGeo = null;
function addFire(it, content) {
  flameGeo ??= new THREE.ConeGeometry(0.09, 0.34, 5).translate(0, 0.17, 0);
  const d = content.userData.dims;
  const fire = new THREE.Group();
  fire.position.y = d.h * 0.25;
  fire.scale.setScalar(d.h / 0.38);
  [[0, 0, 1.2, 0], [0.06, 0.03, 0.8, 1], [-0.05, -0.04, 0.9, 1], [0.01, 0.06, 0.7, 0]].forEach(([x, z, s, m]) => {
    const f = new THREE.Mesh(flameGeo, fireMats[m]);
    f.position.set(x, 0, z);
    f.scale.setScalar(s);
    f.userData.s = s;
    fire.add(f);
  });
  const light = new THREE.PointLight("#ff9a4a", 3, 4.5, 1.6);
  light.position.y = 0.35;
  fire.add(light);
  it.pivot.add(fire);
  it.data.fire = fire;
  it.data.light = light;
}
function animFire(it, t) {
  const { fire, light } = it.data;
  if (!fire) return;
  fire.children.forEach((f, k) => {
    if (!f.isMesh) return;
    const n = Math.sin(t * 13 + k * 2.1) * 0.5 + Math.sin(t * 7.3 + k) * 0.5;
    f.scale.set(f.userData.s, f.userData.s * (1 + n * 0.25), f.userData.s);
    f.rotation.y = t * (1 + k * 0.3);
  });
  light.intensity = 2.6 + Math.sin(t * 11) * 0.5 + Math.sin(t * 4.7) * 0.4;
}

/* ------------------------------------------------------------------ */
/* Per-item animations                                                 */
/* ------------------------------------------------------------------ */

const glowPage = (it, t, dt, w) => {
  const m = it.content?.userData.mat;
  if (m) m.emissiveIntensity = 0.22 + 0.3 * w;
};

// The last TrisTik piece: hovers, turns twice (like Q/E in the game), drops
// into its gap with a small squash, rests, then lifts off again.
const ttDrop = (it, t) => {
  const g = it.content?.userData.drop;
  if (!g) return;
  const c = t % 8, H = 1.15;
  let y = H, turn = 0, squash = 1;
  if (c < 1) turn = 2;
  else if (c < 1.4) turn = 2 - smooth((c - 1) / 0.4);
  else if (c < 2.2) turn = 1;
  else if (c < 2.6) turn = 1 - smooth((c - 2.2) / 0.4);
  if (c < 3) y = H + Math.sin(c * 2.4) * 0.06;
  else if (c < 3.45) y = H * (1 - ((c - 3) / 0.45) ** 2);
  else if (c < 6.4) {
    y = 0;
    if (c < 3.75) squash = 1 - 0.18 * Math.sin((Math.PI * (c - 3.45)) / 0.3);
  } else {
    const p = smooth((c - 6.4) / 1.6);
    y = H * p;
    turn = 2 * p;
  }
  g.position.y = y;
  g.rotation.y = turn * (Math.PI / 2);
  g.scale.set(1, squash, 1);
};

// Bars grow from a stub to full height as the Formio stop comes into view.
const growBars = (it, t, dt, w) => {
  const g = it.content;
  if (!g) return;
  const f = reduceMotion ? 1 : 0.15 + 0.85 * smooth(w * 1.3 - 0.15);
  g.children.forEach((b, k) => {
    if (!b.userData.h) return;
    b.scale.y = Math.max(0.05, f * (0.9 + Math.sin(t * 1.2 + k) * 0.04 * (1 - reduceMotion)));
  });
};

// A fish circling in the shallows; every other one leaps now and then.
const swim = (k) => (it, t) => {
  const { center: c, r } = it.data;
  const dir = k % 2 ? 1 : -1, sp = (0.3 + (k % 3) * 0.08) * dir;
  const a = t * (sp / r) + k * 2.1;
  let y = -0.04 + Math.sin(t * 1.3 + k) * 0.02, pitch = 0;
  if (k % 2 === 0) {
    const ph = (t + k * 2.7) % 12;
    if (ph < 0.9) {
      const u = ph / 0.9;
      y = -0.04 + Math.sin(u * Math.PI) * 0.75;
      pitch = (u - 0.5) * 1.8;
    }
  }
  it.holder.position.set(c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r);
  it.holder.rotation.set(0, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir), 0);
  it.pivot.rotation.set(pitch, Math.sin(t * 9 + k) * 0.18, 0);
};

const waddle = (k) => (it, t) => {
  const dir = k % 2 ? 1 : -1;
  const sp = (0.35 + (k % 3) * 0.12) * dir;
  const a = t * sp + k * 1.9;
  const r = k % 4 === 0 ? 0 : 0.15;
  it.pivot.position.x = Math.cos(a) * r;
  it.pivot.position.z = Math.sin(a) * r;
  const yaw = r ? Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir) : Math.sin(t * 0.5 + k) * 0.8;
  const step = t * 8 + k;
  it.pivot.rotation.set(0, yaw, Math.sin(step) * 0.13);
  it.pivot.position.y = Math.abs(Math.sin(step)) * 0.03;
};

const orbit = (r, y, sp, ph) => (it, t) => {
  const c = it.data.center;
  const a = t * sp + ph, s = Math.sign(sp);
  it.holder.position.set(c.x + Math.cos(a) * r, c.y + y + Math.sin(t * 0.8 + ph) * 0.5, c.z + Math.sin(a) * r);
  it.holder.rotation.set(0, Math.atan2(-Math.sin(a) * s, Math.cos(a) * s), 0);
  it.pivot.rotation.set(Math.cos(t * 0.8 + ph) * 0.12, 0, 0.35 * s);
};

const bobBottle = (it, t) => {
  it.pivot.position.y = Math.sin(t * 1.3) * 0.05;
  it.pivot.rotation.set(Math.sin(t * 1.1) * 0.1, 0, 1.4 + Math.sin(t * 0.9) * 0.1);
};

const sway = (it, t) => { it.pivot.rotation.z = Math.sin(t * 1.6) * 0.03; };

const blocks = (it, t) => {
  const g = it.content;
  if (!g) return;
  g.children.forEach((b, k) => {
    const p = clamp01((t - k * 0.16) / 0.6);
    b.visible = p > 0;
    b.position.y = b.userData.y + (1 - bounce(p)) * 3.5;
  });
  g.rotation.z = Math.sin(t * 0.8) * 0.012;
};

/* ------------------------------------------------------------------ */
/* Scenes                                                              */
/* ------------------------------------------------------------------ */

// Each scene stands on a plot: a w x d block of cells levelled to one
// height and retiled to one terrain type (a clearing in the forest, a patch
// of beach, a terrace in the snow), turned to the grid side that faces the
// stop's camera. Items are laid out on it in plot units: at: [x, z] from the
// plot centre, +x right, +z toward the camera; r: quarter turns, yaw: extra
// degrees for living things; h / w: target height / width; y: height above
// the plot; on: index of the item it rests on.
const SCENES = [
  {
    stop: "about", plot: [3, 2], tiles: [T.SAND, T.GRASS], base: T.SAND,
    items: [
      { m: "desk", h: 0.48, at: [0.45, -0.45] },
      { m: "laptop", h: 0.16, on: 0, at: [-0.17, 0.02], y: 0.48 },
      { m: "cat", h: 0.2, on: 0, at: [0.25, 0.02], y: 0.48, yaw: -35 },
      { m: "chair", h: 0.46, at: [0.45, 0.12], r: 2, yaw: 12 },
      { m: "campfire", h: 0.22, at: [-0.85, -0.4], then: addFire, anim: animFire },
      { make: logSeat, at: [-0.85, 0.25], r: 1 },
    ],
  },
  {
    stop: "tristik", plot: [5, 3], tiles: [T.GRASS, T.VILLAGE, T.SAND, T.FOREST], base: T.GRASS,
    items: [{ make: ttBoard, at: [0, 0], anim: ttDrop }],
  },
  {
    stop: "cvie", plot: [3, 3], tiles: [T.FOREST, T.GRASS], base: T.GRASS,
    items: [
      { make: () => signBoard("cv", cvTexture(), 0.95, 1.34, 0.2), at: [0.05, -0.8], anim: glowPage },
      { m: "folder", h: 0.3, at: [0.85, 0.2], yaw: -20 },
      { make: () => paperPile(4), at: [-0.35, 0.55], yaw: 25 },
      { make: () => paperPile(3), at: [0.5, 0.8], yaw: -40 },
    ],
  },
  {
    stop: "formio", plot: [3, 2], tiles: [T.SAND, T.GRASS], base: T.SAND,
    items: [
      { make: phone, at: [-0.5, -0.3], yaw: 14, anim: glowPage },
      { make: barChart, at: [0.65, -0.2], yaw: -12, anim: growBars },
    ],
  },
  {
    stop: "adeli", plot: [4, 3], tiles: [T.SNOW, T.ROCK], base: T.SNOW,
    items: [
      { m: "igloo", h: 0.5, at: [-1.3, -0.75] },
      { m: "tent", h: 0.42, at: [0.35, -0.9] },
      { m: "tent", h: 0.4, at: [1.3, -0.85], r: 3 },
      { m: "flag", h: 0.95, at: [-0.4, -1.1], anim: sway },
      { m: "dish", h: 0.5, at: [1.5, 0.35], yaw: -35 },
      { m: "sled", w: 0.55, at: [-1.3, 0.65], r: 1 },
      ...[[-0.5, 0.15], [0.2, 0.5], [0.85, -0.05], [0.05, -0.25], [0.6, 1.0], [-0.35, 0.95]].map((at, k) => (
        { m: "penguin", h: 0.26, at, yaw: (k * 53) % 360, anim: waddle(k) })),
    ],
  },
  {
    stop: "stack", plot: [3, 3], tiles: [T.ROCK, T.SNOW, T.GRASS], base: T.ROCK,
    items: [
      { make: strata, at: [0, -0.1], noPop: true, anim: blocks },
    ],
  },
  {
    stop: "contact", plot: [2, 2], tiles: [T.SAND, T.GRASS], base: T.SAND,
    items: [
      { m: "mailbox", h: 0.72, at: [-0.3, 0.45], r: 0 },
      { make: seaJetty, at: [0.35, 0.6], len: 1.6 },
      { m: "bottle", h: 0.32, from: 1, at: [-0.7, -0.2], water: true, y: 0.02, anim: bobBottle },
      { m: "plane", w: 0.32, around: 0, anim: orbit(0.9, 1.1, 0.9, 0) },
      // Planes circling the whole island, seen from the hero view too.
      ...[[24, 8, 0.11, 0], [27, 10, 0.09, 2.1], [21, 6.5, -0.13, 4], [30, 12, 0.07, 5.2]].map(([r, y, sp, ph]) => (
        { m: "plane", w: 1.0, around: "center", anim: orbit(r, y, sp, ph) })),
    ],
  },
  {
    // Not a stop: a few fish around the island.
    stop: "sea",
    items: [0, 1, 2, 3, 4, 5].map((k) => ({ m: k % 3 === 2 ? "clownfish" : "fish", w: 0.5, swim: k, anim: swim(k) })),
  },
];

// Quarter turn of a scene: the grid side closest to its camera.
const quarter = (stop) => ((Math.round(STOPS[stop].az / 90) % 4) + 4) % 4;
// Cell offset (i, j) in plot space turned onto the world grid.
const turnCell = (q, i, j) => [[i, j], [j, -i], [-i, -j], [-j, i]][q];

// Pick a plot for each scene near its landmark, level it and retile it.
// Mutates heights, g.tiles and landmarks (each stop's camera then aims at
// its plot). Returns the plot cells, and the cells (plots plus a one-cell
// border) where the island should grow no trees, houses or rocks.
export function planPlots(g, heights, landmarks) {
  const W = g.W, H = g.H;
  const taken = new Set(), cells = new Set(), clear = new Set(), plots = {};
  for (const def of SCENES) {
    if (!def.plot) continue;
    const stop = STOPS[def.stop], q = quarter(def.stop), lm = landmarks[stop.target];
    const [pw, pd] = def.plot;
    const lc = Math.floor(lm.x + W / 2), lr = Math.floor(lm.z + H / 2);
    let best = null, bestS = -Infinity;
    for (let dr = -4; dr <= 4; dr++)
      for (let dc = -4; dc <= 4; dc++) {
        const list = [];
        let sc = -0.35 * Math.hypot(dc, dr);
        for (let i = 0; i < pw && list; i++)
          for (let j = 0; j < pd; j++) {
            const [x, z] = turnCell(q, i, j), c = lc + dc + x, r = lr + dr + z, k = r * W + c;
            if (c < 1 || r < 1 || c >= W - 1 || r >= H - 1 || taken.has(k)) { list.length = 0; sc = -Infinity; break; }
            const t = g.tiles[k];
            sc += def.tiles.includes(t) ? 1 : t <= T.SHALLOW ? -3 : -1;
            list.push(k);
          }
        if (sc > bestS) { bestS = sc; best = { c: lc + dc, r: lr + dr, list: list.slice() }; }
      }
    const [ox, oz] = turnCell(q, (pw - 1) / 2, (pd - 1) / 2);
    if (!best || !best.list.length) {
      plots[def.stop] = { q, x: lm.x, y: lm.y, z: lm.z };
      continue;
    }
    // One height for the plot: the median of the cells that already suit it.
    const hs = best.list.filter((k) => def.tiles.includes(g.tiles[k])).map((k) => heights[k]).sort((a, b) => a - b);
    const level = hs.length ? hs[hs.length >> 1] : Math.max(0.35, ...best.list.map((k) => heights[k]));
    for (const k of best.list) {
      g.tiles[k] = def.base;
      heights[k] = level;
      cells.add(k);
      // Keep a one-cell gap to the next plot, and nothing growing in it.
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { taken.add(k + dy * W + dx); clear.add(k + dy * W + dx); }
    }
    const x = best.c - W / 2 + 0.5 + ox, z = best.r - H / 2 + 0.5 + oz;
    plots[def.stop] = { q, x, y: level, z };
    landmarks[stop.target] = new THREE.Vector3(x, level, z);
  }
  return { cells, clear, plots };
}

/* ------------------------------------------------------------------ */
/* WFC stop: grid, collapse trail, tileset cubes                       */
/* ------------------------------------------------------------------ */

function buildWfc(world, tileColors) {
  const { g, heights } = world;
  const W = g.W, N = W * g.H;
  const cx = (i) => (i % W) - W / 2 + 0.5, cz = (i) => Math.floor(i / W) - g.H / 2 + 0.5;
  const top = (i) => Math.max(heights[i], 0.24) + 0.04;
  const group = new THREE.Group();
  group.visible = false;

  const pos = new Float32Array(N * 24);
  for (let i = 0, p = 0; i < N; i++) {
    const x = cx(i), z = cz(i), y = top(i);
    const c = [[x - 0.5, z - 0.5], [x + 0.5, z - 0.5], [x + 0.5, z + 0.5], [x - 0.5, z + 0.5]];
    for (let e = 0; e < 4; e++) {
      const a = c[e], b = c[(e + 1) % 4];
      pos.set([a[0], y, a[1], b[0], y, b[1]], p);
      p += 6;
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: "#e2c983", transparent: true, opacity: 0, depthWrite: false }));
  lines.userData.own = lines.userData.ownMat = true;
  group.add(lines);

  const quad = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
  const trail = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), N);
  trail.userData.own = trail.userData.ownMat = true;
  const m4 = new THREE.Matrix4();
  const black = new THREE.Color(0, 0, 0);
  for (let i = 0; i < N; i++) {
    trail.setMatrixAt(i, m4.makeTranslation(cx(i), top(i) + 0.01, cz(i)));
    trail.setColorAt(i, black);
  }
  group.add(trail);

  const cubes = new THREE.Group();
  const cubeGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  const keys = Object.keys(tileColors);
  keys.forEach((t, k) => {
    const c = mesh(cubeGeo, M(tileColors[t].c));
    const a = (k / keys.length) * Math.PI * 2;
    c.position.set(Math.cos(a) * 9.5, 12, Math.sin(a) * 9.5);
    c.rotation.set(0.5, a, 0.3);
    cubes.add(c);
  });
  group.add(cubes);

  const sand = new THREE.Color("#ffd98a");
  const col = new THREE.Color();
  let lit = [];
  return {
    group,
    update(now, w) {
      group.visible = w > 0.01;
      if (!group.visible) return;
      lines.material.opacity = 0.5 * w;
      trail.material.opacity = w;
      const s = Math.max(0.001, smooth(w * 1.4 - 0.3));
      cubes.children.forEach((c, k) => {
        c.scale.setScalar(s);
        if (!reduceMotion) c.rotation.y += 0.01 + k * 0.001;
      });
      if (!reduceMotion) cubes.rotation.y = now * 0.08;
      if (reduceMotion) return;
      for (const i of lit) trail.setColorAt(i, black);
      lit = [];
      const len = 240, head = (now * 360) % (N + len);
      for (let k = Math.max(0, Math.floor(head - len)); k < Math.min(N, head); k++) {
        const f = 1 - (head - k) / len;
        const cell = g.order[k];
        trail.setColorAt(cell, col.copy(sand).multiplyScalar(f * f * 1.4));
        lit.push(cell);
      }
      trail.instanceColor.needsUpdate = true;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

// ctx: { scene, clock, tileColors }
export function createScenes(world, ctx) {
  const { g, heights } = world;
  const W = g.W, H = g.H;
  const root = new THREE.Group();
  ctx.scene.add(root);
  const items = [];
  let dead = false;

  function spawn(S, spec, si, k) {
    const holder = new THREE.Group(), pivot = new THREE.Group();
    holder.add(pivot);
    holder.visible = false;
    root.add(holder);
    let pos;
    if (spec.on != null) {
      const b = S.placed[spec.on].base, [ox, oz] = spec.at || [0, 0], c = Math.cos(S.th), s = Math.sin(S.th);
      pos = { x: b.x + ox * c + oz * s, z: b.z - ox * s + oz * c, y: b.y + (spec.y || 0) };
    } else if (spec.swim != null) {
      // Circle around a shallow cell next to the shore, picked from the seed.
      const W = world.g.W, H = world.g.H, tl = world.g.tiles;
      const nearLand = (i) => [-1, 1, -W, W, -2, 2, -2 * W, 2 * W].some((o) => tl[i + o] >= T.SAND);
      S.shallow ??= [...tl.keys()].filter((i) => tl[i] === T.SHALLOW && i % W > 2 && i % W < W - 3 && i > 2 * W && i < (H - 2) * W && nearLand(i));
      const cell = S.shallow.length ? S.shallow[(world.g.seed * 7919 + spec.swim * 104729) % S.shallow.length] : 0;
      pos = { x: (cell % W) - W / 2 + 0.5, y: -0.1, z: Math.floor(cell / W) - H / 2 + 0.5 };
    } else if (spec.around != null) {
      pos = { x: S.P.x, y: S.P.y, z: S.P.z };
    } else if (spec.from != null) {
      const [ax, az, ay] = S.placed[spec.from].anchor, c = Math.cos(S.th), s = Math.sin(S.th);
      const lx = ax + spec.at[0], lz = az + spec.at[1];
      pos = { x: S.P.x + lx * c + lz * s, z: S.P.z - lx * s + lz * c, y: (spec.water ? 0 : ay) + (spec.y || 0) };
    } else {
      const [lx, lz] = spec.at, c = Math.cos(S.th), s = Math.sin(S.th);
      pos = { x: S.P.x + lx * c + lz * s, z: S.P.z - lx * s + lz * c, y: spec.water ? 0 : S.P.y };
      pos.y += spec.y || 0;
    }
    holder.position.set(pos.x, pos.y, pos.z);
    holder.rotation.y = S.th + ((spec.r || 0) * 90 + (spec.yaw || 0)) * DEG;
    const it = {
      spec, holder, pivot, content: null, base: { x: pos.x, y: pos.y - (spec.y || 0), z: pos.z },
      stop: S.def.stop, delay: world.born + (reduceMotion ? 0 : world.ready + si * 0.06 + k * 0.06), readyAt: Infinity, data: {}, world, S,
    };
    if (spec.swim != null) it.data = { center: { x: pos.x, z: pos.z }, r: 0.5 + (spec.swim % 3) * 0.25 };
    if (spec.around != null) {
      const c = spec.around === "center" ? world.landmarks.center : S.placed[spec.around].base;
      it.data.center = { x: c.x, y: spec.around === "center" ? 0 : c.y, z: c.z };
    }
    const finish = (content) => {
      if (dead) return;
      it.content = content;
      pivot.add(content);
      it.mixer = content.userData.mixer;
      spec.then?.(it, content);
      it.readyAt = ctx.clock.getElapsedTime();
    };
    if (spec.make) finish(spec.make(it));
    else getModel(spec.m).then((gltf) => finish(gltf ? fromModel(gltf, spec) : fit(FALLBACK[spec.m](), spec)));
    items.push(it);
    return it;
  }

  SCENES.forEach((def, si) => {
    const P = world.plots[def.stop] || { q: 0, x: 0, y: 0, z: 0 };
    const S = { def, P, th: P.q * (Math.PI / 2), placed: [] };
    def.items.forEach((spec, k) => S.placed.push(spawn(S, spec, si, k)));
  });

  const wfc = buildWfc(world, ctx.tileColors);
  root.add(wfc.group);

  return {
    root,
    items,
    update(now, dt, weights) {
      for (const it of items) {
        if (it.readyAt === Infinity) continue;
        const start = Math.max(it.delay, it.readyAt);
        const p = reduceMotion ? 1 : (now - start) / 0.5;
        it.holder.visible = p > 0;
        if (p <= 0) continue;
        if (!it.spec.noPop) it.holder.scale.setScalar(Math.max(0.001, easeBack(p)));
        it.spec.anim?.(it, reduceMotion ? 100 : now - start, dt, weights[it.stop] || 0);
        if (it.mixer && !reduceMotion) it.mixer.update(dt);
      }
      wfc.update(now, weights.wfc || 0);
    },
    dispose() {
      dead = true;
      ctx.scene.remove(root);
      for (const it of items) it.mixer?.stopAllAction();
      const keep = [flameGeo]; // shared by every build
      root.traverse((o) => {
        if (o.geometry && !o.userData.shared && !keep.includes(o.geometry)) o.geometry.dispose();
        if (o.userData.ownMat) [].concat(o.material).forEach((m) => m.dispose());
        if (o.isInstancedMesh) o.dispose();
        if (o.isLight) o.dispose();
      });
    },
  };
}
