// The sea around the island, without a shader: the water is tinted lighter
// near the coast, foam laps along the shoreline, and the sun glints on the
// waves. Rebuilt with each island, since the coastline changes.
import * as THREE from "three";
import { T } from "./wfc.js";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

// Height of the water surface at (x, z) and time t. The water mesh, the foam
// and the glints all follow it.
export function waterY(x, z, t) {
  if (reduceMotion) return 0;
  return Math.sin(x * 0.55 + t * 1.3) * 0.07 + Math.cos(z * 0.7 + t * 0.9) * 0.06 + Math.sin((x + z) * 1.7 + t * 2.1) * 0.025;
}

const isLand = (t) => t >= T.SAND;

// Distance in cells from every grid cell to the nearest land cell.
function landDistance(g) {
  const W = g.W, H = g.H, d = new Float32Array(W * H).fill(Infinity), queue = [];
  for (let i = 0; i < W * H; i++) if (isLand(g.tiles[i])) { d[i] = 0; queue.push(i); }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % W, y = (i / W) | 0;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (d[j] > d[i] + 1) { d[j] = d[i] + 1; queue.push(j); }
    }
  }
  return d;
}

// Smooth value noise, seeded, for the seabed outside the grid.
function noise2(seed) {
  const h = (x, y) => {
    let n = (x * 374761393 + y * 668265263 + seed * 144269504) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) & 0xffff) / 0xffff;
  };
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * sx;
    const b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

// The seabed follows one rule everywhere, inside the grid and out past it:
// it deepens with the distance to land, with some noise and the odd bank. So
// the grid's deep cells and the ring of columns around it join up, and the sea
// has no square border. The ring is static: it sits under water the whole time.
const SEABED_RING = 44; // cells beyond the grid
const BASE = -3.2; // bottom of every column, same as the island's
const BED_DEEP = new THREE.Color("#0f3448"), BED_MID = new THREE.Color("#14415a"), BED_BANK = new THREE.Color("#2c7a92");

// Distance to land at any point: the distance at the nearest grid cell plus
// how far the point lies past the grid.
function distAt(g, x, z) {
  const W = g.W, H = g.H;
  const cx = Math.min(W - 1, Math.max(0, Math.floor(x + W / 2))), cz = Math.min(H - 1, Math.max(0, Math.floor(z + H / 2)));
  return g.landDist[cz * W + cx] + Math.max(0, Math.abs(x) - W / 2, Math.abs(z) - H / 2);
}

function bed(g) {
  g.landDist ??= landDistance(g);
  const n = noise2(g.seed * 3 + 11), m = noise2(g.seed * 5 + 7);
  return {
    depth(x, z) {
      const d = distAt(g, x, z);
      let y = -1.7 - 1.3 * smooth((d - 1) / 16) + (n(x / 9, z / 9) - 0.5) * 0.5 + (m(x * 1.7, z * 1.7) - 0.5) * 0.12;
      const bank = n(x / 17 + 40, z / 17);
      if (d > 6 && bank > 0.72) y += (bank - 0.72) * 4; // now and then a bank rises
      return Math.min(-0.8, Math.max(BASE + 0.1, y));
    },
    color(y, x, z, c) {
      return c.copy(BED_DEEP).lerp(BED_MID, smooth((y + 3.1) / 1.1)).lerp(BED_BANK, smooth((y + 1.9) / 1.2)).offsetHSL(0, 0, (m(x * 3, z * 3) - 0.5) * 0.03);
    },
  };
}

// Give the grid's deep cells their seabed depth and colour (called while the
// island is built, after its plots are placed).
export function shapeSeabed(g, heights, cols) {
  const b = bed(g), W = g.W, H = g.H, c = new THREE.Color();
  for (let i = 0; i < W * H; i++) {
    if (g.tiles[i] !== T.DEEP) continue;
    const x = (i % W) - W / 2 + 0.5, z = Math.floor(i / W) - H / 2 + 0.5;
    heights[i] = b.depth(x, z);
    cols.setColorAt(i, b.color(heights[i], x, z, c));
  }
}

// The ring of seabed columns around the grid, out to a round edge in the fog.
function seabedRing(g) {
  const W = g.W, H = g.H, b = bed(g), cells = [];
  for (let z = -H / 2 - SEABED_RING; z < H / 2 + SEABED_RING; z++)
    for (let x = -W / 2 - SEABED_RING; x < W / 2 + SEABED_RING; x++) {
      if (x >= -W / 2 && x < W / 2 && z >= -H / 2 && z < H / 2) continue;
      const cx = x + 0.5, cz = z + 0.5;
      if (Math.hypot(cx, cz) > W / 2 + SEABED_RING) continue;
      cells.push([cx, cz, b.depth(cx, cz)]);
    }
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
    cells.length,
  );
  mesh.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  cells.forEach(([x, z, y], k) => {
    mesh.setMatrixAt(k, m4.compose(v.set(x, BASE, z), q, s.set(1, y - BASE, 1)));
    mesh.setColorAt(k, b.color(y, x, z, c));
  });
  return mesh;
}

const SHORE = new THREE.Color("#5fc2cc"), MID = new THREE.Color("#2b8aa6"), DEEP = new THREE.Color("#195a76");

// Vertex colours: turquoise over the shallows, darker blue out at sea.
function tintWater(geo, world) {
  const { g } = world, W = g.W, H = g.H;
  const pos = geo.attributes.position;
  let color = geo.attributes.color;
  if (!color) {
    color = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    geo.setAttribute("color", color);
  }
  const c = new THREE.Color();
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), z = pos.getZ(v);
    const t = Math.min(distAt(g, x, z), 16) / 8;
    c.copy(SHORE).lerp(MID, smooth(t * 2)).lerp(DEEP, smooth(t * 2 - 1));
    color.setXYZ(v, c.r, c.g, c.b);
  }
  color.needsUpdate = true;
}

// Foam textures, drawn once. Rows run from the shore (top) out to sea.
let foamTex = null;
function foamTextures() {
  if (foamTex) return foamTex;
  const make = (w, h, draw) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  let seed = 7;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const bubbles = (g, w, h, n, maxY) => {
    for (let k = 0; k < n; k++) {
      const y = rand() ** 1.6 * maxY, a = 0.75 * (1 - y / maxY);
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.beginPath();
      g.arc(rand() * w, y, 0.8 + rand() * 2.2, 0, Math.PI * 2);
      g.fill();
    }
  };
  foamTex = {
    band: make(128, 64, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(255,255,255,0.95)");
      grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
      grad.addColorStop(0.6, "rgba(255,255,255,0.12)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      bubbles(g, w, h, 70, h * 0.8);
    }),
    corner: make(64, 64, (g, w) => {
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, w);
      grad.addColorStop(0, "rgba(255,255,255,0.95)");
      grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
      grad.addColorStop(0.6, "rgba(255,255,255,0.12)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, w, w);
      for (let k = 0; k < 30; k++) {
        const r = rand() ** 1.6 * w * 0.8, a = rand() * Math.PI / 2;
        g.fillStyle = `rgba(255,255,255,${0.7 * (1 - r / w)})`;
        g.beginPath();
        g.arc(Math.cos(a) * r, Math.sin(a) * r, 0.8 + rand() * 1.8, 0, Math.PI * 2);
        g.fill();
      }
    }),
    line: make(128, 64, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.1, "rgba(255,255,255,0.9)");
      grad.addColorStop(0.22, "rgba(255,255,255,0.15)");
      grad.addColorStop(0.4, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }),
  };
  return foamTex;
}

export function createSea(scene, world, waterGeo) {
  const { g } = world, W = g.W, H = g.H;
  g.landDist ??= landDistance(g);
  const dist = g.landDist;
  tintWater(waterGeo, world);
  const group = new THREE.Group();
  scene.add(group);
  const ring = seabedRing(g);
  group.add(ring);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);

  // Foam: a soft ribbon along every coastal cell edge (bright against the
  // sand, fading out into the water), rounded pieces on the outer corners, and
  // a thin wave line that rolls outward and fades. Its timing drifts along
  // the coast, so the waves travel around the island.
  const edges = [], corners = [];
  const land = (x, y) => x >= 0 && y >= 0 && x < W && y < H && isLand(g.tiles[y * W + x]);
  for (let i = 0; i < W * H; i++) {
    if (!isLand(g.tiles[i])) continue;
    const x = i % W, y = (i / W) | 0, cx = x - W / 2 + 0.5, cz = y - H / 2 + 0.5;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (land(x + dx, y + dy)) continue;
      edges.push({ x: cx + dx * 0.5, z: cz + dy * 0.5, nx: dx, nz: dy, yaw: Math.atan2(dx, dy), ph: cx * 0.13 + cz * 0.17 });
    }
    for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      if (land(x + sx, y) || land(x, y + sy) || land(x + sx, y + sy)) continue;
      corners.push({ x: cx + sx * 0.5, z: cz + sy * 0.5, yaw: { "1,1": 0, "-1,1": -Math.PI / 2, "-1,-1": Math.PI, "1,-1": Math.PI / 2 }[sx + "," + sy], ph: cx * 0.13 + cz * 0.17 });
    }
  }
  const foamGroup = (geo, tex, n) => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), Math.max(1, n));
    m.count = n;
    m.frustumCulled = false;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3);
    group.add(m);
    return m;
  };
  const stripGeo = new THREE.PlaneGeometry(1.04, 0.6).rotateX(-Math.PI / 2).translate(0, 0, 0.3);
  const cornerGeo = new THREE.PlaneGeometry(0.6, 0.6).rotateX(-Math.PI / 2).translate(0.3, 0, 0.3);
  const band = foamGroup(stripGeo, foamTextures().band, edges.length);
  const round = foamGroup(cornerGeo, foamTextures().corner, corners.length);
  const wave = foamGroup(stripGeo, foamTextures().line, edges.length);
  const foams = [band, round, wave];

  // Glints: thin flat flashes scattered over open water.
  const glints = [];
  let seed = g.seed >>> 0;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  while (glints.length < 90) {
    const a = rand() * Math.PI * 2, r = 8 + rand() * 40;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const cx = Math.floor(x + W / 2), cz = Math.floor(z + H / 2);
    if (cx >= 0 && cz >= 0 && cx < W && cz < H && dist[cz * W + cx] < 2) continue;
    glints.push({ x, z, rot: rand() * Math.PI, sp: 0.6 + rand() * 1.2, ph: rand() * 20 });
  }
  const glintMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const glint = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.07).rotateX(-Math.PI / 2), glintMat, glints.length);
  glint.frustumCulled = false;
  group.add(glint);

  const grey = new THREE.Color();
  let fade = 0, dim = 1;
  const place = (t) => {
    edges.forEach((e, k) => {
      const y = waterY(e.x, e.z, t) + 0.03;
      const breathe = reduceMotion ? 0 : Math.sin(t * 1.1 + e.ph * 6.28);
      m4.compose(v.set(e.x, y, e.z), q.setFromAxisAngle(Y, e.yaw), s.set(1, 1, 0.85 + breathe * 0.12));
      band.setMatrixAt(k, m4);
      band.setColorAt(k, grey.setScalar((0.62 + breathe * 0.12) * fade * dim));
      const p = reduceMotion ? 0.3 : (((t * 0.3 + e.ph) % 1) + 1) % 1;
      m4.compose(v.set(e.x + e.nx * p * 0.55, y + 0.005, e.z + e.nz * p * 0.55), q, s.set(1, 1, 1));
      wave.setMatrixAt(k, m4);
      wave.setColorAt(k, grey.setScalar(Math.sin(p * Math.PI) * 0.75 * fade * dim));
    });
    corners.forEach((c, k) => {
      const breathe = reduceMotion ? 0 : Math.sin(t * 1.1 + c.ph * 6.28);
      m4.compose(v.set(c.x, waterY(c.x, c.z, t) + 0.03, c.z), q.setFromAxisAngle(Y, c.yaw), s.set(0.88 + breathe * 0.1, 1, 0.88 + breathe * 0.1));
      round.setMatrixAt(k, m4);
      round.setColorAt(k, grey.setScalar((0.62 + breathe * 0.12) * fade * dim));
    });
    for (const m of foams) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
    glints.forEach((p, k) => {
      const f = reduceMotion ? 0 : Math.max(0, Math.sin(t * p.sp + p.ph)) ** 14;
      v.set(p.x, waterY(p.x, p.z, t) + 0.03, p.z);
      m4.compose(v, q.setFromAxisAngle(Y, p.rot), s.set(f + 0.001, 1, f + 0.001));
      glint.setMatrixAt(k, m4);
    });
    glint.instanceMatrix.needsUpdate = true;
  };
  place(0);

  return {
    update(now, nightT = 0) {
      // Foam and glints fade in once the island has settled, and dim at night.
      const f = reduceMotion ? 1 : smooth((now - world.born - world.ready) / 0.8);
      const changed = f !== fade || dim !== 1 - nightT * 0.45;
      fade = f;
      dim = 1 - nightT * 0.45;
      glintMat.opacity = 0.9 * f * (1 - nightT * 0.5);
      if (!reduceMotion || changed) place(now);
    },
    dispose() {
      scene.remove(group);
      for (const m of [...foams, glint, ring]) {
        if (m.geometry !== stripGeo || m === band) m.geometry.dispose();
        m.material.dispose();
        m.dispose();
      }
    },
  };
}
