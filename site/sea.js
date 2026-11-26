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

const SHORE = new THREE.Color("#5fc2cc"), MID = new THREE.Color("#2b8aa6"), DEEP = new THREE.Color("#195a76");

// Vertex colours: turquoise over the shallows, darker blue out at sea.
function tintWater(geo, world, dist) {
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
    const cx = Math.floor(x + W / 2), cz = Math.floor(z + H / 2);
    const inside = cx >= 0 && cz >= 0 && cx < W && cz < H;
    const outside = Math.max(0, Math.abs(x) - W / 2, Math.abs(z) - H / 2);
    const d = inside ? Math.min(dist[cz * W + cx], 12) : 6 + outside;
    const t = d / 8;
    c.copy(SHORE).lerp(MID, smooth(t * 2)).lerp(DEEP, smooth(t * 2 - 1));
    color.setXYZ(v, c.r, c.g, c.b);
  }
  color.needsUpdate = true;
}

export function createSea(scene, world, waterGeo) {
  const { g } = world, W = g.W, H = g.H;
  const dist = landDistance(g);
  tintWater(waterGeo, world, dist);
  const group = new THREE.Group();
  scene.add(group);
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
      for (const m of [foam, glint]) {
        m.geometry.dispose();
        m.material.dispose();
        m.dispose();
      }
    },
  };
}
