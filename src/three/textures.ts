import * as THREE from 'three';

// Procedural textures – no image downloads needed, so the app works offline and in XR.

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Smooth 1D value noise over a periodic lattice. */
function noise1(rand: () => number, n: number): (x: number) => number {
  const v = Array.from({ length: n }, () => rand());
  return (x: number) => {
    const xi = Math.floor(x);
    const f = x - xi;
    const a = v[((xi % n) + n) % n];
    const b = v[(((xi + 1) % n) + n) % n];
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
}

function mix(a: number[], b: number[], t: number): number[] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, color: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

export interface WoodTextures {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  /** Real-world size covered by one texture repeat (mm): along grain, across grain. */
  sizeMm: [number, number];
}

export interface WoodOptions {
  seed: number;
  light: number[];
  dark: number[];
  /** Ring density across the grain. */
  rings: number;
  knots: number;
}

/**
 * Brushed oak, grain running along the canvas x axis.
 * Canvas covers 1600 mm along the grain and 400 mm across.
 */
export function woodTexture(opt: WoodOptions): WoodTextures {
  const W = 1024;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const [cb, ctxb] = canvas(W, H);
  const img = ctx.createImageData(W, H);
  const bimg = ctxb.createImageData(W, H);
  const rand = rng(opt.seed);
  const warpA = noise1(rand, 32);
  const warpB = noise1(rand, 64);
  const ring = noise1(rand, 97);
  const streak = noise1(rand, 211);
  const knots = Array.from({ length: opt.knots }, () => ({
    x: rand() * W,
    y: rand() * H,
    r: 3 + rand() * 5,
  }));

  for (let x = 0; x < W; x++) {
    const wx = x / W;
    const warp = (warpA(wx * 32) - 0.5) * 7 + (warpB(wx * 64) - 0.5) * 2;
    for (let y = 0; y < H; y++) {
      let yy = y + warp;
      let knotDark = 0;
      for (const k of knots) {
        const dx = (x - k.x) / (k.r * 3);
        const dy = (y - k.y) / k.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < 9) {
          yy += (y - k.y) * 1.6 * Math.exp(-d2);
          if (d2 < 1) knotDark = Math.max(knotDark, 1 - d2);
        }
      }
      // fine, mostly straight streaks plus darker late-wood lines
      const tone = streak(yy * 0.35) * 0.45 + streak(yy * 1.7 + 13) * 0.35 + streak(yy * 6 + x * 0.0015) * 0.2;
      const lines = Math.pow(Math.abs(Math.sin(ring((yy / H) * opt.rings) * Math.PI * 8)), 18);
      const pore = rand() < 0.01 ? 0.5 : 0;
      let t = 0.32 + (tone - 0.5) * 0.9 + lines * 0.35 + pore * 0.3;
      t = Math.min(1, Math.max(0, t));
      let col = mix(opt.light, opt.dark, t);
      if (knotDark > 0) col = mix(col, [88, 58, 32], knotDark * 0.7);
      const i = (y * W + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
      // brushed: the soft early wood is lower, dark late wood stands proud
      const b = 255 * (0.4 + t * 0.5 - pore * 0.3 - knotDark * 0.2);
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = b;
      bimg.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctxb.putImageData(bimg, 0, 0);
  return { map: toTexture(c, true), bump: toTexture(cb, false), sizeMm: [1600, 400] };
}

/** End-grain slice of an oak log with drying cracks, one per tile (UV 0..1). */
export function endgrainTexture(seed: number): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const [cb, ctxb] = canvas(S, S);
  const img = ctx.createImageData(S, S);
  const bimg = ctxb.createImageData(S, S);
  const rand = rng(seed);
  // pith somewhere around the tile, sometimes outside (tile cut from a larger log)
  const cx = S * (0.2 + rand() * 0.6);
  const cy = S * (0.2 + rand() * 0.6);
  const wob = noise1(rand, 24);
  const rn = noise1(rand, 131);
  const light = [204, 156, 100];
  const dark = [132, 84, 42];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const a = Math.atan2(dy, dx);
      const r = Math.hypot(dx, dy) * (1 + (wob(((a + Math.PI) / (2 * Math.PI)) * 24) - 0.5) * 0.12);
      const ringPos = r / 7.5 + rn(r * 0.05) * 1.5;
      const late = Math.pow(Math.abs(Math.sin(ringPos * Math.PI)), 10);
      const heart = Math.min(1, r / (S * 0.9));
      let col = mix(light, dark, late * 0.85 + heart * 0.2);
      // medullary rays
      const ray = Math.pow(Math.abs(Math.sin(a * 70 + rn(r * 0.02) * 4)), 60) * 0.25;
      col = mix(col, [235, 200, 150], ray);
      const n = (rand() - 0.5) * 14;
      const i = (y * S + x) * 4;
      img.data[i] = col[0] + n;
      img.data[i + 1] = col[1] + n;
      img.data[i + 2] = col[2] + n;
      img.data[i + 3] = 255;
      const b = 200 - late * 60 + n;
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = b;
      bimg.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctxb.putImageData(bimg, 0, 0);

  // radial drying cracks, wider towards the bark
  const cracks = 3 + Math.floor(rand() * 4);
  for (let k = 0; k < cracks; k++) {
    let a = rand() * Math.PI * 2;
    const len = S * (0.35 + rand() * 0.6);
    let px = cx;
    let py = cy;
    const steps = 40;
    const pts: [number, number, number][] = [];
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      pts.push([px, py, 0.5 + f * f * 9]);
      a += (rand() - 0.5) * 0.18;
      px += Math.cos(a) * (len / steps);
      py += Math.sin(a) * (len / steps);
    }
    for (const g of [ctx, ctxb]) {
      g.strokeStyle = g === ctx ? 'rgb(22,14,8)' : 'rgb(0,0,0)';
      g.lineCap = 'round';
      for (let s = 1; s < pts.length; s++) {
        g.lineWidth = pts[s][2];
        g.beginPath();
        g.moveTo(pts[s - 1][0], pts[s - 1][1]);
        g.lineTo(pts[s][0], pts[s][1]);
        g.stroke();
      }
    }
  }
  const map = toTexture(c, true);
  const bump = toTexture(cb, false);
  map.wrapS = map.wrapT = bump.wrapS = bump.wrapT = THREE.ClampToEdgeWrapping;
  return { map, bump };
}

/** Floor: light oak planks 2000 × 200 mm. Canvas covers 4000 × 1000 mm. */
export function floorTexture(kind: 'oak' | 'concrete'): THREE.CanvasTexture {
  const [c, ctx] = canvas(2048, 512);
  if (kind === 'concrete') {
    const rand = rng(7);
    const img = ctx.createImageData(2048, 512);
    const nz = noise1(rand, 257);
    for (let i = 0; i < 2048 * 512; i++) {
      const x = i % 2048;
      const y = (i / 2048) | 0;
      const v = 168 + (nz(x * 0.01 + y * 0.013) - 0.5) * 30 + (rand() - 0.5) * 10;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v - 2;
      img.data[i * 4 + 2] = v - 5;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, true);
  }
  const wood = woodTexture({ seed: 99, light: [224, 200, 166], dark: [196, 164, 124], rings: 4, knots: 0 });
  const src = wood.map.image as HTMLCanvasElement;
  const rand = rng(3);
  const rows = 5;
  const rowH = 512 / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rand() * 1024;
    while (x < 2048) {
      const len = 1024;
      const sy = rand() * (src.height - rowH);
      ctx.globalAlpha = 1;
      ctx.drawImage(src, 0, sy, src.width, rowH, x, r * rowH, len, rowH);
      ctx.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},${rand() * 0.06})`;
      ctx.fillRect(x, r * rowH, len, rowH);
      ctx.fillStyle = 'rgba(60,45,30,0.35)';
      ctx.fillRect(x, r * rowH, 2, rowH);
      x += len;
    }
    ctx.fillStyle = 'rgba(60,45,30,0.35)';
    ctx.fillRect(0, r * rowH, 2048, 1.5);
  }
  return toTexture(c, true);
}

/** Text sprite texture for dimension labels. */
export function labelTexture(text: string): { tex: THREE.CanvasTexture; aspect: number } {
  const [c, ctx] = canvas(256, 72);
  ctx.font = '600 44px system-ui, sans-serif';
  const w = Math.min(256, ctx.measureText(text).width + 28);
  c.width = Math.ceil(w);
  ctx.font = '600 44px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.roundRect(0, 0, c.width, 72, 14);
  ctx.fill();
  ctx.fillStyle = '#1f2a33';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: c.width / 72 };
}
