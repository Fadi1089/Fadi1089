// Small Wave Function Collapse on a square grid, guided by an island-shaped prior.
// Returns the tile of every cell plus the order cells collapsed in, so the
// renderer can replay the collapse as an animation.

export const T = { DEEP: 0, SHALLOW: 1, SAND: 2, GRASS: 3, FOREST: 4, ROCK: 5, SNOW: 6, VILLAGE: 7 };
const N_TILES = 8;
const ALL = (1 << N_TILES) - 1;

// Elevation tiles 0..6 may touch when their levels differ by at most one.
// Villages sit on the lowlands: next to sand, grass, forest and other houses.
const ALLOWED = (() => {
  const a = new Array(N_TILES).fill(0);
  for (let i = 0; i <= 6; i++)
    for (let j = 0; j <= 6; j++) if (Math.abs(i - j) <= 1) a[i] |= 1 << j;
  for (const t of [T.SAND, T.GRASS, T.FOREST, T.VILLAGE]) {
    a[T.VILLAGE] |= 1 << t;
    a[t] |= 1 << T.VILLAGE;
  }
  return a;
})();

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise2(seed) {
  const h = (x, y) => {
    let n = (x * 374761393 + y * 668265263 + seed * 144269504) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) & 0xffff) / 0xffff;
  };
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * sx;
    const b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

function prior(W, H, seed) {
  const n = noise2(seed);
  const v = noise2(seed * 7 + 3);
  const w = new Float32Array(W * H * N_TILES);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
      const warp = n(x / 9, y / 9) * 0.55 + n(x / 4, y / 4) * 0.2;
      const d = Math.sqrt(dx * dx + dy * dy) * 1.3 - warp * 0.45;
      const e = Math.max(0, Math.min(6.4, (1 - d) * 7.4 + n(x / 5 + 40, y / 5) * 1.5 - 0.9));
      const village = v(x / 6, y / 6);
      for (let t = 0; t <= 6; t++) w[(y * W + x) * N_TILES + t] = Math.exp(-((t - e) ** 2) / 0.6) + 1e-4;
      const g = w[(y * W + x) * N_TILES + T.GRASS];
      w[(y * W + x) * N_TILES + T.VILLAGE] = village > 0.62 ? g * 1.4 : g * 0.01;
    }
  return w;
}

const popcount = (m) => {
  let c = 0;
  while (m) { m &= m - 1; c++; }
  return c;
};

function attempt(W, H, seed, weights) {
  const r = rng(seed);
  const dom = new Uint16Array(W * H).fill(ALL);
  const order = [];
  const stack = [];
  const nbrs = (i) => {
    const x = i % W, y = (i / W) | 0, out = [];
    if (x > 0) out.push(i - 1);
    if (x < W - 1) out.push(i + 1);
    if (y > 0) out.push(i - W);
    if (y < H - 1) out.push(i + W);
    return out;
  };
  const propagate = () => {
    while (stack.length) {
      const i = stack.pop();
      let reach = 0;
      for (let t = 0; t < N_TILES; t++) if (dom[i] & (1 << t)) reach |= ALLOWED[t];
      for (const j of nbrs(i)) {
        const nd = dom[j] & reach;
        if (nd === dom[j]) continue;
        if (!nd) return false;
        dom[j] = nd;
        stack.push(j);
      }
    }
    return true;
  };

  for (let step = 0; step < W * H; step++) {
    let best = -1, bestE = Infinity;
    for (let i = 0; i < W * H; i++) {
      const c = popcount(dom[i]);
      if (c <= 1) continue;
      // Shannon-ish entropy from the prior weights, plus noise to break ties.
      let sum = 0, sl = 0;
      for (let t = 0; t < N_TILES; t++)
        if (dom[i] & (1 << t)) {
          const wt = weights[i * N_TILES + t];
          sum += wt;
          sl += wt * Math.log(wt);
        }
      const e = Math.log(sum) - sl / sum + r() * 1e-3;
      if (e < bestE) { bestE = e; best = i; }
    }
    if (best < 0) break;
    let sum = 0;
    for (let t = 0; t < N_TILES; t++) if (dom[best] & (1 << t)) sum += weights[best * N_TILES + t];
    let pick = r() * sum, chosen = 0;
    for (let t = 0; t < N_TILES; t++)
      if (dom[best] & (1 << t)) {
        pick -= weights[best * N_TILES + t];
        chosen = t;
        if (pick <= 0) break;
      }
    dom[best] = 1 << chosen;
    order.push(best);
    stack.push(best);
    if (!propagate()) return null;
  }
  // Cells fixed by propagation alone never got "picked": add them in place.
  const seen = new Uint8Array(W * H);
  for (const i of order) seen[i] = 1;
  for (let i = 0; i < W * H; i++) if (!seen[i]) order.push(i);
  const tiles = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) tiles[i] = 31 - Math.clz32(dom[i]);
  return { tiles, order };
}

export function generate(W, H, seed) {
  const weights = prior(W, H, seed);
  for (let k = 0; k < 12; k++) {
    const res = attempt(W, H, seed * 31 + k, weights);
    if (res) return { ...res, W, H, seed, retries: k };
  }
  // Fallback: take the most likely tile per cell. Never seen in practice.
  const tiles = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    let b = 0;
    for (let t = 1; t < N_TILES; t++) if (weights[i * N_TILES + t] > weights[i * N_TILES + b]) b = t;
    tiles[i] = b;
  }
  return { tiles, order: [...tiles.keys()], W, H, seed, retries: -1 };
}
