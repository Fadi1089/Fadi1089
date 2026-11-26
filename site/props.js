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
      // No environment map here, so metallic surfaces would render black.
      if ("metalness" in m) m.metalness = Math.min(m.metalness, 0.2);
      if ("roughness" in m) m.roughness = Math.max(m.roughness, 0.45);
    }
  });
  return gltf;
}

// Turns (degrees) that stand a model up and make its front face +z,
// found by looking at each one.
const MODEL_FIX = { scaffold: { x: -90, y: 90 }, desk: { y: 180 }, laptop: { y: 180 } };

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
  printer: () => grp(box(0.6, 0.3, 0.45, "#d9dde0"), box(0.5, 0.04, 0.35, "#3b4247", 0, 0.3, 0), box(0.38, 0.02, 0.28, PAPER, 0, 0.12, 0.3)),
  folder: () => grp(box(0.7, 0.5, 0.05, "#e2b35a"), box(0.22, 0.06, 0.05, "#e2b35a", -0.22, 0.5, 0)),
  paper: () => grp(box(0.42, 0.06, 0.3, PAPER), rot(box(0.4, 0.01, 0.28, PAPER, 0.03, 0.06, 0), 0, 0.2, 0)),
  radio: () => grp(box(1.0, 0.6, 0.35, "#a8452f"),
    mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16).rotateX(Math.PI / 2), "#2b2b2b", -0.22, 0.3, 0.18),
    box(0.3, 0.12, 0.02, "#efe4cc", 0.24, 0.32, 0.17), rot(cyl(0.01, 0.01, 0.6, METAL, 0.35, 0.58, 0), 0, 0, -0.5)),
  speaker: () => grp(box(0.5, 0.8, 0.45, "#3b2a20"),
    mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 16).rotateX(Math.PI / 2), "#1a1a1a", 0, 0.3, 0.23),
    mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12).rotateX(Math.PI / 2), "#1a1a1a", 0, 0.62, 0.23)),
  mic: () => grp(cyl(0.2, 0.22, 0.04, "#333"), cyl(0.02, 0.02, 1.2, METAL), scl(ball(0.09, "#444", 0, 1.28, 0), 1, 1.4, 1)),
  headphones: () => grp(mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 16, Math.PI), "#2b2b2b", 0, 0.1, 0),
    mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 12).rotateZ(Math.PI / 2), "#d8735a", -0.2, 0.1, 0),
    mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 12).rotateZ(Math.PI / 2), "#d8735a", 0.2, 0.1, 0)),
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
  toolbox: () => grp(box(0.6, 0.3, 0.3, "#c0392b"), box(0.3, 0.04, 0.04, "#333", 0, 0.38, 0), box(0.04, 0.08, 0.04, "#333", -0.13, 0.3, 0), box(0.04, 0.08, 0.04, "#333", 0.13, 0.3, 0)),
  wrench: () => grp(box(0.6, 0.04, 0.08, METAL), cyl(0.08, 0.08, 0.04, METAL, 0.3, 0, 0, 6), cyl(0.07, 0.07, 0.04, METAL, -0.3, 0, 0, 12)),
  screen: () => grp(box(0.3, 0.03, 0.2, DARK), box(0.06, 0.25, 0.06, DARK), box(0.72, 0.44, 0.05, "#222", 0, 0.24, 0), box(0.66, 0.38, 0.006, glow("#5fd0ff", "#2a8fc0"), 0, 0.27, 0.028)),
  server: () => grp(box(0.6, 1.6, 0.55, DARK), ...Array.from({ length: 6 }, (_, k) => box(0.52, 0.16, 0.02, "#3b434c", 0, 0.15 + k * 0.22, 0.28))),
  scaffold: () => grp(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => cyl(0.03, 0.03, 1.85, METAL, a * 0.6, 0, b * 0.28, 6)),
    ...[0.6, 1.2, 1.8].map((y) => box(1.3, 0.05, 0.62, "#b07a4a", 0, y, 0))),
  mailbox: () => grp(box(0.08, 0.8, 0.08, DARKWOOD), box(0.32, 0.28, 0.5, "#3a6ea5", 0, 0.8, 0), box(0.03, 0.16, 0.06, "#d8735a", 0.18, 0.9, -0.1)),
  bottle: () => grp(cyl(0.12, 0.12, 0.45, M("#5fa08a", { transparent: true, opacity: 0.7 })), cyl(0.05, 0.08, 0.15, M("#5fa08a", { transparent: true, opacity: 0.7 }), 0, 0.45, 0),
    box(0.08, 0.3, 0.08, PAPER, 0, 0.06, 0), cyl(0.05, 0.05, 0.06, "#b07a4a", 0, 0.6, 0)),
  plane: () => grp(mesh(paperPlaneGeo(), M(PAPER, { side: THREE.DoubleSide }))),
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

function formTexture() {
  return canvasTex("form", 512, 680, (g, w, h) => {
    g.fillStyle = PAPER;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#7fb35a";
    g.fillRect(0, 0, w, 120);
    g.fillStyle = INK;
    g.font = `800 70px ${DISPLAY}`;
    g.fillText("FORMIO", 34, 88);
    let y = 160;
    const question = (opts, audio) => {
      g.fillStyle = "#2b3438";
      g.fillRect(34, y, 300, 16);
      y += 38;
      if (audio) {
        g.fillStyle = "#d8735a";
        g.beginPath();
        g.arc(60, y + 22, 24, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#fff";
        g.beginPath();
        g.moveTo(52, y + 10);
        g.lineTo(74, y + 22);
        g.lineTo(52, y + 34);
        g.fill();
        g.fillStyle = "#2b3438";
        for (let b = 0; b < 26; b++) {
          const bh = 6 + Math.abs(Math.sin(b * 1.7) * Math.cos(b * 0.6)) * 34;
          g.fillRect(100 + b * 13, y + 22 - bh / 2, 7, bh);
        }
        y += 66;
      }
      for (let o = 0; o < opts; o++) {
        g.strokeStyle = "#2b3438";
        g.lineWidth = 4;
        g.strokeRect(36, y, 26, 26);
        if (o === 1) {
          g.fillStyle = "#7fb35a";
          g.fillRect(36, y, 26, 26);
          g.strokeStyle = "#fff";
          g.beginPath();
          g.moveTo(41, y + 13);
          g.lineTo(48, y + 20);
          g.lineTo(58, y + 6);
          g.stroke();
        }
        g.fillStyle = "#c9c2b2";
        g.fillRect(80, y + 8, 220 * lineLen(o + opts * 3), 10);
        y += 40;
      }
      y += 26;
    };
    question(3, true);
    question(2, true);
    g.fillStyle = INK;
    g.fillRect(34, h - 84, 150, 50);
    g.fillStyle = "#e2c983";
    g.beginPath();
    g.moveTo(98, h - 72);
    g.lineTo(122, h - 59);
    g.lineTo(98, h - 46);
    g.fill();
  });
}

// Bottom to top. Names are product names, the same in every language.
const BLOCKS = [
  ["Linux", "#f2c94c", "#1a1a1a"],
  ["Postgres", "#336791", "#ffffff"],
  ["Node", "#5fa04e", "#ffffff"],
  ["TypeScript", "#3178c6", "#ffffff"],
  ["React", "#20232a", "#61dafb"],
  ["Three.js", "#111111", "#ffffff"],
  ["C#", "#68217a", "#ffffff"],
  ["Blender", "#e87d0d", "#ffffff"],
];
const BLOCK = { w: 1.0, h: 0.28, d: 0.46 };
let blockGeo = null;
const blockMats = [];
function blockMaterials(k) {
  if (!blockMats[k]) {
    const [label, bg, fg] = BLOCKS[k];
    const tex = canvasTex("block" + k, 320, 90, (g, w, h) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = fg;
      g.font = `800 54px ${DISPLAY}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(label, w / 2, h / 2 + 3);
    });
    const side = new THREE.MeshStandardMaterial({ color: bg, roughness: 0.7 });
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    blockMats[k] = [side, side, side, side, face, face];
  }
  return blockMats[k];
}

const pageMats = {};
function page(key, tex, w, h) {
  pageMats[key] ??= new THREE.MeshStandardMaterial({ map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.3, roughness: 0.8 });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), pageMats[key]);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(Math.PI), M(PAPER));
  const sheet = grp(front, back);
  sheet.traverse((o) => { o.castShadow = true; o.userData.own = true; });
  sheet.position.y = h / 2;
  sheet.rotation.x = -0.1;
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
  // Board: wooden base sunk into the ground, cream top with a faint grid.
  b.add("#b88b5e", bxGeo(W + 2 * m, 1.2, D + 2 * m), 0, -1.12, 0);
  b.add("#efe6d2", bxGeo(W + 2 * m, 0.08, D + 2 * m), 0, 0, 0);
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

function blockStack() {
  blockGeo ??= new THREE.BoxGeometry(BLOCK.w, BLOCK.h, BLOCK.d).translate(0, BLOCK.h / 2, 0);
  const g = new THREE.Group();
  const turn = [0.05, -0.1, 0.14, -0.06, 0.1, -0.13, 0.07, -0.04];
  BLOCKS.forEach((_, k) => {
    const b = new THREE.Mesh(blockGeo, blockMaterials(k));
    b.position.set((k % 2 ? 0.04 : -0.03), k * BLOCK.h, (k % 3) * 0.02);
    b.rotation.y = turn[k];
    b.castShadow = b.receiveShadow = true;
    b.userData.y = b.position.y;
    g.add(b);
  });
  g.userData.dims = { w: BLOCK.w, h: BLOCK.h * BLOCKS.length, d: BLOCK.d };
  return g;
}

let ringGeo = null;
function addRings(it, content) {
  ringGeo ??= new THREE.TorusGeometry(1, 0.025, 6, 40);
  const d = content.userData.dims;
  const rings = new THREE.Group();
  rings.position.set(0, d.h * 0.45, d.d / 2 + 0.06);
  for (let k = 0; k < 3; k++) {
    const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#e2c983", transparent: true, opacity: 0, depthWrite: false }));
    r.userData.ownMat = true;
    rings.add(r);
  }
  it.pivot.add(rings);
  it.data.rings = rings;
}
function animRings(it, t, dt, w) {
  const rs = it.data.rings;
  if (!rs) return;
  rs.children.forEach((r, k) => {
    const p = (t * 0.5 + k / 3) % 1;
    r.scale.setScalar(0.12 + p * 1.1);
    r.material.opacity = (1 - p) * (1 - p) * (0.3 + 0.7 * w);
  });
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

let ledGeo = null;
function addLeds(it, content) {
  ledGeo ??= new THREE.BoxGeometry(0.06, 0.035, 0.015);
  const d = content.userData.dims;
  const n = 14;
  const leds = new THREE.InstancedMesh(ledGeo, new THREE.MeshBasicMaterial(), n);
  leds.userData.ownMat = true;
  const m = new THREE.Matrix4();
  for (let k = 0; k < n; k++) {
    const row = k >> 1, col = k & 1;
    m.setPosition((col ? 0.18 : -0.18) * d.w, d.h * (0.2 + row * 0.1), d.d / 2 + 0.01);
    leds.setMatrixAt(k, m);
    leds.setColorAt(k, new THREE.Color("#000"));
  }
  it.pivot.add(leds);
  it.data.leds = leds;
}
const LED_ON = [new THREE.Color("#57ff8c"), new THREE.Color("#ffb347"), new THREE.Color("#57d9ff")];
const LED_OFF = new THREE.Color("#12301c");
function animLeds(it, t) {
  const leds = it.data.leds;
  if (!leds) return;
  for (let k = 0; k < leds.count; k++) {
    const tick = Math.floor(t * (3 + (k % 4)) + k * 0.37);
    const on = ((tick * 2654435761 + k * 40503) >>> 0) % 100 > 35;
    leds.setColorAt(k, on ? LED_ON[k % 3] : LED_OFF);
  }
  leds.instanceColor.needsUpdate = true;
}

// Sunglasses for the cat (the owner's portrait has a black cat wearing some).
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _p2 = new THREE.Vector3(), _s = new THREE.Vector3();
function addSunglasses(it, content) {
  let head = null;
  content.traverse((o) => { if (o.isBone && o.name === "Head") head = o; });
  if (!head) return;
  // Reflective lenses, so they still read on a black cat.
  const lens = M("#1c2734", { roughness: 0.15, metalness: 0.2, emissive: "#35607f", emissiveIntensity: 0.55, flatShading: false });
  const frame = M("#0b0b0d", { roughness: 0.3, flatShading: false });
  const glasses = grp(box(0.12, 0.075, 0.02, lens, -0.07, -0.04, 0), box(0.12, 0.075, 0.02, lens, 0.07, -0.04, 0), box(0.36, 0.018, 0.018, frame, 0, 0.03, -0.005));
  // Work in the pivot's frame: size and place the glasses there, then
  // express that pose in the head bone's frame so they follow the animation.
  it.pivot.updateWorldMatrix(true, true);
  content.traverse((o) => o.isSkinnedMesh && o.skeleton.update());
  head.getWorldScale(_s);
  const ratio = _s.x / it.pivot.getWorldScale(_p).x;
  it.pivot.getWorldQuaternion(_q);
  head.getWorldQuaternion(_q2);
  const rel = _q.invert().multiply(_q2); // head orientation in pivot space
  const relInv = rel.clone().invert();
  head.getWorldPosition(_p2);
  it.pivot.worldToLocal(_p2); // head joint in pivot space
  // In front of the eyes, measured on the Quaternius cat (and close enough
  // on the procedural one).
  const d = content.userData.dims;
  const want = new THREE.Vector3(0, d.h * 0.64, d.d / 2 - d.h * 0.09);
  const off = want.sub(_p2).applyQuaternion(relInv).divideScalar(ratio);
  glasses.position.copy(off);
  glasses.quaternion.copy(relInv);
  glasses.scale.setScalar((d.h / 0.62) / ratio);
  head.add(glasses);
  it.data.glasses = glasses;
}

/* ------------------------------------------------------------------ */
/* Per-item animations                                                 */
/* ------------------------------------------------------------------ */

const floatPage = (it, t, dt, w) => {
  it.pivot.position.y = Math.sin(t * 0.9) * 0.1;
  it.pivot.rotation.y = Math.sin(t * 0.45) * 0.14;
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

const sheets = (it, t) => {
  const g = it.content;
  if (!g) return;
  const [dx, dy, dz] = it.spec.to;
  g.children.forEach((s, k) => {
    const p = (t * 0.32 + k / g.children.length) % 1;
    s.position.set(dx * p, 0.08 + dy * smooth(p) + Math.sin(p * Math.PI) * 0.5, dz * p);
    s.rotation.set(-1.2 + p * 1.1, Math.sin(p * 7 + k) * 0.6, Math.sin(p * 9 + k) * 0.4);
    s.scale.setScalar(Math.sin(p * Math.PI) * 0.9 + 0.05);
  });
};

const waddle = (k) => (it, t) => {
  const dir = k % 2 ? 1 : -1;
  const sp = (0.35 + (k % 3) * 0.12) * dir;
  const a = t * sp + k * 1.9;
  const r = k % 4 === 0 ? 0 : 0.22;
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

const LOW = [T.SAND, T.GRASS, T.FOREST, T.VILLAGE];

// at: [x, z] in the stop's local frame. h / w: target height / width.
// y: height above the ground. yaw: degrees, on top of the stop's azimuth.
// on: index of the item this one rests on. tiles: where it may stand.
const SCENES = [
  {
    stop: "about", clear: 3.2, tiles: [T.SAND, T.GRASS],
    items: [
      { m: "desk", h: 0.75, at: [0.5, -0.4], yaw: -15 },
      { m: "laptop", h: 0.26, on: 0, y: 0.75, yaw: -15 },
      { m: "cat", h: 0.62, at: [-0.5, 0.6], yaw: 35, tint: "#4a4a52", clip: "Idle", then: addSunglasses },
      { m: "campfire", h: 0.38, at: [-1.2, -0.5], then: addFire, anim: animFire },
    ],
  },
  {
    stop: "tristik", clear: 3.1, tiles: LOW,
    items: [
      { make: ttBoard, at: [0, 0], footprint: [4.4, 2.9], anim: ttDrop },
    ],
  },
  {
    stop: "cvie", clear: 3.2, tiles: [T.FOREST, T.GRASS, T.ROCK, T.SAND, T.VILLAGE],
    items: [
      { make: () => page("cv", cvTexture(), 1.9, 2.69), at: [0.3, -0.6], y: 0.9, anim: floatPage },
      { m: "printer", h: 0.55, at: [-1.4, 0.5], yaw: 25 },
      { make: () => grp(...[0, 1, 2].map(() => mesh(new THREE.PlaneGeometry(0.22, 0.3), M(PAPER, { side: THREE.DoubleSide })))), on: 1, y: 0.55, to: [1.6, 1.0, -0.9], anim: sheets },
      { m: "folder", h: 0.6, at: [1.7, 0.8], yaw: -25 },
      { m: "paper", w: 0.45, at: [-0.4, 1.2], yaw: 30 },
      { m: "paper", w: 0.4, at: [1.1, -1.4], yaw: -50 },
    ],
  },
  {
    stop: "formio", clear: 3.2, tiles: [T.SAND, T.GRASS],
    items: [
      { m: "radio", h: 0.85, at: [0, -0.4] },
      { m: "speaker", h: 0.75, at: [-1.6, -0.1], yaw: 20, then: addRings, anim: animRings },
      { m: "speaker", h: 0.75, at: [1.6, -0.1], yaw: -20, then: addRings, anim: animRings },
      { m: "mic", h: 1.25, at: [0.85, 0.8], yaw: -25 },
      { m: "headphones", w: 0.5, at: [-0.7, 0.9], yaw: 20 },
      { make: () => page("form", formTexture(), 1.2, 1.6), at: [-0.2, -1.6], y: 1.4, anim: floatPage },
    ],
  },
  {
    stop: "adeli", clear: 3.2, tiles: [T.SNOW, T.ROCK],
    items: [
      { m: "igloo", h: 0.75, at: [-1.1, -0.7], yaw: 20 },
      { m: "tent", h: 0.65, at: [1.2, -1.0], yaw: -20 },
      { m: "tent", h: 0.6, at: [2.1, -0.1], yaw: -50 },
      { m: "flag", h: 1.5, at: [0.1, -1.5], anim: sway },
      { m: "dish", h: 0.85, at: [-2.0, 0.5], yaw: 35 },
      { m: "sled", w: 0.95, at: [0.8, 1.2], yaw: 70 },
      ...[[-0.4, 0.4], [0.4, 0.1], [-1.0, 1.0], [1.3, 0.6], [0.1, 1.5], [-0.3, -0.4], [1.9, 1.4]].map((at, k) => (
        { m: "penguin", h: 0.42, at, yaw: (k * 53) % 360, unique: true, anim: waddle(k) })),
    ],
  },
  {
    stop: "stack", clear: 3.2, tiles: [T.ROCK, T.GRASS, T.FOREST, T.SAND, T.SNOW],
    items: [
      { m: "scaffold", h: 1.9, at: [-2.0, -1.0], yaw: 15 },
      { m: "server", h: 1.4, at: [-0.6, -1.3], then: addLeds, anim: animLeds },
      { m: "screen", h: 0.5, at: [0.5, -0.1], yaw: -15 },
      { m: "toolbox", h: 0.35, at: [1.7, 0.7], yaw: -30 },
      { m: "wrench", w: 0.55, at: [0.7, 1.0], yaw: 50 },
      { make: blockStack, at: [1.5, -1.2], yaw: -12, noPop: true, anim: blocks },
    ],
  },
  {
    stop: "contact", clear: 2.6, tiles: [T.SAND, T.GRASS],
    items: [
      { m: "mailbox", h: 1.6, at: [0, -0.3], yaw: -20 },
      { m: "bottle", h: 0.6, at: [1.2, 2.2], tiles: [T.SHALLOW, T.DEEP], water: true, y: 0.02, anim: bobBottle },
      { m: "plane", w: 0.55, around: 0, anim: orbit(1.5, 2.1, 0.9, 0) },
      // Planes circling the whole island, seen from the hero view too.
      ...[[24, 8, 0.11, 0], [27, 10, 0.09, 2.1], [21, 6.5, -0.13, 4], [30, 12, 0.07, 5.2]].map(([r, y, sp, ph]) => (
        { m: "plane", w: 1.2, around: "center", anim: orbit(r, y, sp, ph) })),
    ],
  },
];

// Circles around each scene where the island should not grow trees or rocks.
export function sceneZones(landmarks) {
  return SCENES.map((d) => {
    const lm = landmarks[STOPS[d.stop].target];
    return { x: lm.x, z: lm.z, r: d.clear, keepHouses: !!d.keepHouses };
  });
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

  function snap(S, lx, lz, tiles, unique) {
    const c = Math.cos(S.az), s = Math.sin(S.az);
    let x = S.lm.x + lx * c + lz * s, z = S.lm.z - lx * s + lz * c;
    const col = Math.floor(x + W / 2), row = Math.floor(z + H / 2);
    const ok = (cc, rr) => cc >= 0 && rr >= 0 && cc < W && rr < H && tiles.includes(g.tiles[rr * W + cc]) && !(unique && S.used.has(rr * W + cc));
    let cell = -1;
    if (ok(col, row)) cell = row * W + col;
    else {
      let best = Infinity;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          if (!ok(col + dx, row + dy)) continue;
          const d = (col + dx - W / 2 + 0.5 - x) ** 2 + (row + dy - H / 2 + 0.5 - z) ** 2;
          if (d < best) { best = d; cell = (row + dy) * W + col + dx; }
        }
    }
    if (cell < 0) cell = Math.min(H - 1, Math.max(0, row)) * W + Math.min(W - 1, Math.max(0, col));
    const ccx = (cell % W) - W / 2 + 0.5, ccz = Math.floor(cell / W) - H / 2 + 0.5;
    // Stay inside the chosen cell, so the item stands on its column.
    const lim = unique ? 0 : 0.32;
    x = ccx + Math.max(-lim, Math.min(lim, x - ccx));
    z = ccz + Math.max(-lim, Math.min(lim, z - ccz));
    S.used.add(cell);
    return { x, z, y: Math.max(heights[cell], 0), cell };
  }

  // Highest ground under an item's rectangle (w x d, turned with the item).
  function footprintTop(S, spec, x0, z0) {
    const [fw, fd] = spec.footprint, a = S.az + (spec.yaw || 0) * DEG, c = Math.cos(a), s = Math.sin(a);
    let top = 0;
    for (let u = -fw / 2; u <= fw / 2 + 1e-6; u += 0.4)
      for (let v = -fd / 2; v <= fd / 2 + 1e-6; v += 0.4) {
        const col = Math.floor(x0 + u * c + v * s + W / 2), row = Math.floor(z0 - u * s + v * c + H / 2);
        if (col >= 0 && row >= 0 && col < W && row < H) top = Math.max(top, heights[row * W + col]);
      }
    return top;
  }

  function spawn(S, spec, si, k) {
    const holder = new THREE.Group(), pivot = new THREE.Group();
    holder.add(pivot);
    holder.visible = false;
    root.add(holder);
    let pos;
    if (spec.on != null) {
      const b = S.placed[spec.on].base;
      pos = { x: b.x, z: b.z, y: b.y + (spec.y || 0) };
    } else if (spec.around != null) {
      pos = { x: S.lm.x, y: S.lm.y, z: S.lm.z };
    } else {
      pos = snap(S, spec.at[0], spec.at[1], spec.tiles || S.def.tiles, spec.unique);
      if (spec.footprint) pos.y = footprintTop(S, spec, pos.x, pos.z);
      if (spec.water) pos.y = 0;
      pos.y += spec.y || 0;
    }
    holder.position.set(pos.x, pos.y, pos.z);
    holder.rotation.y = S.az + (spec.yaw || 0) * DEG;
    const it = {
      spec, holder, pivot, content: null, base: { x: pos.x, y: pos.y - (spec.y || 0), z: pos.z },
      stop: S.def.stop, delay: world.born + (reduceMotion ? 0 : 2.2 + si * 0.06 + k * 0.08), readyAt: Infinity, data: {},
    };
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
    const stop = STOPS[def.stop];
    const S = { def, az: stop.az * DEG, lm: world.landmarks[stop.target], used: new Set(), placed: [] };
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
      const keep = [blockGeo, ringGeo, ledGeo, flameGeo]; // shared by every build
      root.traverse((o) => {
        if (o.geometry && !o.userData.shared && !keep.includes(o.geometry)) o.geometry.dispose();
        if (o.userData.ownMat) [].concat(o.material).forEach((m) => m.dispose());
        if (o.isInstancedMesh) o.dispose();
        if (o.isLight) o.dispose();
      });
    },
  };
}
