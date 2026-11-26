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

  // Foam: a short white bar on the water side of every coastal cell edge.
  const edges = [];
  for (let i = 0; i < W * H; i++) {
    if (!isLand(g.tiles[i])) continue;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || isLand(g.tiles[ny * W + nx])) continue;
      edges.push({ x: x - W / 2 + 0.5 + dx * 0.56, z: y - H / 2 + 0.5 + dy * 0.56, nx: dx, nz: dy, rot: dx ? Math.PI / 2 : 0, ph: (x * 7 + y * 13) % 6.28 });
    }
  }
  const foamMat = new THREE.MeshBasicMaterial({ color: "#f3fbff", transparent: true, opacity: 0, depthWrite: false });
  const foam = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.02, 0.12), foamMat, Math.max(1, edges.length));
  foam.count = edges.length;
  foam.frustumCulled = false;
  group.add(foam);

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

  const place = (t) => {
    edges.forEach((e, k) => {
      const lap = reduceMotion ? 0 : Math.sin(t * 1.4 + e.ph) * 0.06;
      v.set(e.x + e.nx * lap, waterY(e.x, e.z, t) + 0.025, e.z + e.nz * lap);
      m4.compose(v, q.setFromAxisAngle(Y, e.rot), s.set(0.95 + lap, 1, 1));
      foam.setMatrixAt(k, m4);
    });
    foam.instanceMatrix.needsUpdate = true;
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
    update(now) {
      // Foam and glints fade in once the island has settled.
      const f = reduceMotion ? 1 : smooth((now - world.born - world.ready) / 0.8);
      foamMat.opacity = 0.55 * f;
      glintMat.opacity = 0.9 * f;
      if (!reduceMotion || f < 1) place(now);
    },
    dispose() {
      scene.remove(group);
      for (const m of [foam, glint, ring]) {
        m.geometry.dispose();
        m.material.dispose();
        m.dispose();
      }
    },
  };
}
