import type {
  Axis,
  BuildResult,
  Cut,
  FurnitureConfig,
  HingeSide,
  MaterialKey,
  Motion,
  Opening,
  Part,
  Surface,
  Vec3,
  Warning,
} from './types';

const DEG = Math.PI / 180;

/** Standard nominal lengths of drawer runners (mm). */
export const RUNNER_LENGTHS = [250, 270, 300, 350, 400, 450, 500, 550, 600];

export const DRAWER_SIDE = 12;
export const DRAWER_BOTTOM = 10;
/** Lateral clearance per side for under-mount runners. */
export const DRAWER_CLEARANCE = 5;

export function frontThickness(cfg: FurnitureConfig, surface: Surface): number {
  const m = cfg.materials;
  if (surface === 'glass-clear') return m.clearGlass;
  if (surface === 'oak') return m.woodFront;
  return m.mattCarrier + m.mattGlass;
}

/** Split `total` among slots; fixed slots keep their size, null slots share the rest. */
export function distribute(total: number, sizes: (number | null)[]): number[] {
  const fixed = sizes.reduce<number>((s, v) => s + (v ?? 0), 0);
  const autoCount = sizes.filter((v) => v === null).length;
  const share = autoCount > 0 ? (total - fixed) / autoCount : 0;
  return sizes.map((v) => (v === null ? share : v));
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Map a box size onto a cut dimension (length along grain, width, thickness). */
export function cutFromBox(size: Vec3, grain?: Axis): Cut {
  const axes: Axis[] = ['x', 'y', 'z'];
  const val = (a: Axis) => size[axes.indexOf(a)];
  const sorted = [...axes].sort((a, b) => val(a) - val(b));
  const thicknessAxis = sorted[0];
  const lengthAxis = grain && grain !== thicknessAxis ? grain : sorted[2];
  const widthAxis = axes.find((a) => a !== thicknessAxis && a !== lengthAxis)!;
  return { length: round1(val(lengthAxis)), width: round1(val(widthAxis)), thickness: round1(val(thicknessAxis)) };
}

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface FrontPanel extends Rect {
  motion: string;
  zFront: number;
  label: string;
}

export function buildFurniture(cfg: FurnitureConfig): BuildResult {
  const parts: Part[] = [];
  const motions: Motion[] = [];
  const openings: Opening[] = [];
  const lights: BuildResult['lights'] = [];
  const warnings: Warning[] = [];
  const panels: FrontPanel[] = [];

  const m = cfg.materials;
  const { width: W, height: H, depth: D } = cfg;
  const t = m.carcass;
  const c = m.cladding;
  const e = m.edgeBand;
  const rb = m.back;
  const g = m.frontGap;
  const interiorMat: MaterialKey = m.interior === 'oak' ? 'oak-ply' : 'multiplex';

  const add = (p: Omit<Part, 'cut'> & { cut?: Cut }) => {
    if (p.size.some((s) => s <= 0)) return;
    parts.push({ ...p, cut: p.cut ?? cutFromBox(p.size, p.grain) });
  };

  // --- sanity checks -------------------------------------------------------
  if (W < 300 || W > 4000) warnings.push({ level: 'error', text: `Breite ${W} mm außerhalb 300–4000 mm.` });
  if (H < 300 || H > 2600) warnings.push({ level: 'error', text: `Höhe ${H} mm außerhalb 300–2600 mm.` });
  if (D < 250 || D > 800) warnings.push({ level: 'error', text: `Tiefe ${D} mm außerhalb 250–800 mm.` });

  // --- vertical layout -----------------------------------------------------
  const baseY = cfg.base.kind === 'wall' ? 0 : Math.max(0, cfg.base.height);
  const yBottom = cfg.base.kind === 'wall' ? Math.max(0, cfg.base.height) : baseY;
  // The furniture body spans y ∈ [yBottom, yBottom + bodyH]
  const bodyH = cfg.base.kind === 'wall' ? H : H - baseY;
  const yTop = yBottom + bodyH;
  const Dk = D - e; // carcass depth behind the solid lipping
  const Wk = W - 2 * c;
  const Hk = bodyH - 2 * c;
  const yk = yBottom + c;

  // --- carcass -------------------------------------------------------------
  add({ id: 'seite-l', name: 'Seite links', group: 'korpus', material: interiorMat, pos: [c, yk, 0], size: [t, Hk, Dk], grain: 'y' });
  add({ id: 'seite-r', name: 'Seite rechts', group: 'korpus', material: interiorMat, pos: [W - c - t, yk, 0], size: [t, Hk, Dk], grain: 'y' });
  add({ id: 'boden', name: 'Boden', group: 'korpus', material: interiorMat, pos: [c + t, yk, 0], size: [Wk - 2 * t, t, Dk], grain: 'x' });
  add({ id: 'deckel', name: 'Deckel', group: 'korpus', material: interiorMat, pos: [c + t, yk + Hk - t, 0], size: [Wk - 2 * t, t, Dk], grain: 'x' });
  // Rear panel sits in a rebate, half the carcass thickness deep.
  const rebate = Math.floor(t / 2);
  add({
    id: 'rueckwand',
    name: 'Rückwand (gefälzt)',
    group: 'rueckwand',
    material: interiorMat,
    pos: [c + t - rebate, yk + t - rebate, 0],
    size: [Wk - 2 * t + 2 * rebate, Hk - 2 * t + 2 * rebate, rb],
    grain: Wk > Hk ? 'x' : 'y',
  });

  // --- cladding (parquet planks) ------------------------------------------
  const miter = m.corner === 'miter';
  const sideAlong: Axis = m.sideGrain === 'vertical' ? 'y' : 'z';
  const topAlong: Axis = m.topGrain === 'horizontal' ? 'x' : 'z';
  cladPanel(parts, m.plankWidth, 'vk-l', 'Verkleidung links', [0, yBottom, 0], [c, bodyH, Dk], sideAlong, miter ? { axis: 'y', ext: 0 } : null);
  cladPanel(parts, m.plankWidth, 'vk-r', 'Verkleidung rechts', [W - c, yBottom, 0], [c, bodyH, Dk], sideAlong, miter ? { axis: 'y', ext: 0 } : null);
  cladPanel(parts, m.plankWidth, 'vk-o', 'Verkleidung oben', [c, yTop - c, 0], [Wk, c, Dk], topAlong, miter ? { axis: 'x', ext: c } : null);
  cladPanel(parts, m.plankWidth, 'vk-u', 'Verkleidung unten', [c, yBottom, 0], [Wk, c, Dk], topAlong, miter ? { axis: 'x', ext: c } : null);

  // --- solid oak lipping on the front edges -------------------------------
  const zL = Dk;
  add({ id: 'al-l', name: 'Anleimer links', group: 'anleimer', material: 'oak-solid', pos: [0, yBottom, zL], size: [c + t, bodyH, e], grain: 'y' });
  add({ id: 'al-r', name: 'Anleimer rechts', group: 'anleimer', material: 'oak-solid', pos: [W - c - t, yBottom, zL], size: [c + t, bodyH, e], grain: 'y' });
  add({ id: 'al-o', name: 'Anleimer oben', group: 'anleimer', material: 'oak-solid', pos: [c + t, yTop - c - t, zL], size: [Wk - 2 * t, c + t, e], grain: 'x' });
  add({ id: 'al-u', name: 'Anleimer unten', group: 'anleimer', material: 'oak-solid', pos: [c + t, yBottom, zL], size: [Wk - 2 * t, c + t, e], grain: 'x' });

  // --- base ---------------------------------------------------------------
  buildBase(cfg, add, warnings);

  // --- interior layout -----------------------------------------------------
  const xi0 = c + t;
  const wi = Wk - 2 * t;
  const yi0 = yk + t;
  const hi = Hk - 2 * t;
  const zBack = rb;
  const zf = D - m.frontSetback;
  const inner = { x: xi0, y: yi0, w: wi, h: hi, zFront: Dk, zBack };

  const nCols = cfg.columns.length;
  if (nCols === 0) warnings.push({ level: 'error', text: 'Mindestens eine Spalte nötig.' });
  const colWidths = distribute(wi - (nCols - 1) * t, cfg.columns.map((col) => col.width));
  if (colWidths.some((w) => w < 100)) {
    warnings.push({ level: 'error', text: 'Spaltenbreiten passen nicht in die Innenbreite (mind. 100 mm je Spalte).' });
  }

  let xc = xi0;
  cfg.columns.forEach((col, ci) => {
    const cw = colWidths[ci];
    if (ci > 0) {
      const xd = xc - t;
      add({ id: `mw-${ci}`, name: `Mittelwand ${ci}`, group: 'korpus', material: interiorMat, pos: [xd, yi0, zBack], size: [t, hi, Dk - zBack], grain: 'y' });
      add({ id: `al-mw-${ci}`, name: `Anleimer Mittelwand ${ci}`, group: 'anleimer', material: 'oak-solid', pos: [xd, yi0, zL], size: [t, hi, e], grain: 'y' });
    }

    const nSec = col.sections.length;
    const secHeights = distribute(hi - (nSec - 1) * t, col.sections.map((s) => s.height));
    if (secHeights.some((h) => h < 80)) {
      warnings.push({ level: 'error', text: `Spalte ${ci + 1}: Fachhöhen passen nicht (mind. 80 mm je Fach).` });
    }

    let ys = yi0;
    col.sections.forEach((sec, si) => {
      const sh = secHeights[si];
      if (si > 0) {
        const yd = ys - t;
        add({ id: `zb-${ci}-${si}`, name: `Zwischenboden S${ci + 1}/${si}`, group: 'korpus', material: interiorMat, pos: [xc, yd, zBack], size: [cw, t, Dk - zBack], grain: 'x', col: ci });
        add({ id: `al-zb-${ci}-${si}`, name: `Anleimer Zwischenboden S${ci + 1}/${si}`, group: 'anleimer', material: 'oak-solid', pos: [xc, yd, zL], size: [cw, t, e], grain: 'x', col: ci });
      }
      openings.push({ col: ci, sec: si, x: xc, y: ys, w: cw, h: sh });
      const tag = `S${ci + 1}F${si + 1}`;
      const T = sec.front === 'open' ? 0 : frontThickness(cfg, sec.surface);
      const zFrontBack = sec.front === 'open' ? Dk : zf - T;

      // fronts
      const r: Rect = { x0: xc + g, x1: xc + cw - g, y0: ys + g, y1: ys + sh - g };
      const addPanel = (rect: Rect, id: string, label: string, motion: Motion, grain: Axis) => {
        motions.push(motion);
        panels.push({ ...rect, motion: motion.id, zFront: zf, label });
        addFront(cfg, parts, rect, zf, sec.surface, id, label, motion.id, grain, ci, si);
      };
      const hingeMotion = (id: string, rect: Rect, side: HingeSide): Motion =>
        side === 'left'
          ? { id, kind: 'hinge', axis: 'y', pivot: [rect.x0, 0, zf], angle: -100 * DEG }
          : { id, kind: 'hinge', axis: 'y', pivot: [rect.x1, 0, zf], angle: 100 * DEG };

      if (sec.front === 'door') {
        addPanel(r, `tuer-${ci}-${si}`, `Tür ${tag}`, hingeMotion(`m-${ci}-${si}`, r, sec.hinge), 'y');
        if (sec.surface === 'glass-clear' && r.x1 - r.x0 > 600) {
          warnings.push({ level: 'warn', text: `${tag}: Glastür ${Math.round(r.x1 - r.x0)} mm breit – ab ca. 600 mm Doppeltür empfohlen.` });
        }
      } else if (sec.front === 'double-door') {
        const mid = (r.x0 + r.x1) / 2;
        const a = { ...r, x1: mid - g / 2 };
        const b = { ...r, x0: mid + g / 2 };
        addPanel(a, `tuer-${ci}-${si}-l`, `Tür ${tag} links`, hingeMotion(`m-${ci}-${si}-l`, a, 'left'), 'y');
        addPanel(b, `tuer-${ci}-${si}-r`, `Tür ${tag} rechts`, hingeMotion(`m-${ci}-${si}-r`, b, 'right'), 'y');
      } else if (sec.front === 'flap') {
        addPanel(r, `klappe-${ci}-${si}`, `Klappe ${tag}`, { id: `m-${ci}-${si}`, kind: 'hinge', axis: 'x', pivot: [0, r.y0, zf], angle: 85 * DEG }, 'x');
      } else if (sec.front === 'drawers') {
        const k = Math.max(1, Math.round(sec.drawers));
        const fh = (r.y1 - r.y0 - (k - 1) * g) / k;
        const avail = zFrontBack - zBack - 10;
        const runner = [...RUNNER_LENGTHS].reverse().find((l) => l <= avail);
        if (!runner) warnings.push({ level: 'error', text: `${tag}: zu wenig Tiefe für Schubkästen (mind. ${RUNNER_LENGTHS[0] + 10} mm innen).` });
        for (let i = 0; i < k; i++) {
          const y0 = r.y0 + i * (fh + g);
          const rect = { ...r, y0, y1: y0 + fh };
          const mid = `m-${ci}-${si}-${i}`;
          const slide = (runner ?? 250) * 0.8;
          addPanel(rect, `sk-${ci}-${si}-${i}`, `Schubkasten ${tag}.${i + 1}`, { id: mid, kind: 'slide', offset: [0, 0, slide] }, 'x');
          if (runner) drawerBox(parts, `skb-${ci}-${si}-${i}`, `Schubkasten ${tag}.${i + 1}`, xc, cw, y0, fh, zFrontBack, runner, mid, ci, si);
        }
        if (fh < 80) warnings.push({ level: 'warn', text: `${tag}: Schubkastenfronten sehr niedrig (${Math.round(fh)} mm).` });
      }

      const doorH = r.y1 - r.y0;
      if ((sec.front === 'door' || sec.front === 'double-door') && doorH > 1600) {
        warnings.push({ level: 'info', text: `${tag}: Tür ${Math.round(doorH)} mm hoch – mindestens 4 Scharniere.` });
      }

      // adjustable shelves
      if (sec.front !== 'drawers' && sec.shelves > 0) {
        const glass = sec.shelfMaterial === 'glass';
        const st = glass ? m.shelfGlass : t;
        const n = Math.round(sec.shelves);
        const space = (sh - n * st) / (n + 1);
        const zEnd = zFrontBack - (sec.front === 'open' ? 0 : 8);
        for (let i = 0; i < n; i++) {
          const y = ys + space * (i + 1) + st * i;
          add({
            id: `fb-${ci}-${si}-${i}`,
            name: `${glass ? 'Glasboden' : 'Fachboden'} ${tag}.${i + 1}`,
            group: glass ? 'glas' : 'boden',
            material: glass ? 'glass-clear' : interiorMat,
            pos: [xc + (glass ? 2 : 1), y, zBack + 2],
            size: [cw - (glass ? 4 : 2), st, zEnd - zBack - 2],
            grain: 'x',
            col: ci,
            sec: si,
          });
        }
        if (space < 60) warnings.push({ level: 'warn', text: `${tag}: Fachabstand nur ${Math.round(space)} mm.` });
      }

      // LED strip under the top of the compartment
      if (sec.led) {
        const len = cw - 40;
        const z = Math.max(zBack + 20, zFrontBack - 50);
        add({ id: `led-${ci}-${si}`, name: `LED ${tag}`, group: 'led', material: 'led', pos: [xc + 20, ys + sh - 8, z], size: [len, 8, 12], grain: 'x', col: ci, sec: si });
        lights.push({ pos: [xc + cw / 2, ys + sh - 12, z + 6], length: len });
      }

      ys += sh + t;
    });
    xc += cw + t;
  });

  // --- end-grain appliqué ---------------------------------------------------
  if (cfg.applique.enabled) {
    const s = cfg.applique.size;
    const th = cfg.applique.thickness;
    cfg.applique.tiles.forEach((tile, i) => {
      const rect: Rect = { x0: tile.x, x1: tile.x + s, y0: tile.y, y1: tile.y + s };
      const cx = tile.x + s / 2;
      const cy = tile.y + s / 2;
      const host = panels.find((p) => cx >= p.x0 && cx <= p.x1 && cy >= p.y0 && cy <= p.y1);
      const z0 = host ? host.zFront : D;
      if (host) {
        const eps = 0.5;
        if (rect.x0 < host.x0 - eps || rect.x1 > host.x1 + eps || rect.y0 < host.y0 - eps || rect.y1 > host.y1 + eps) {
          warnings.push({ level: 'warn', text: `Hirnholz-Kachel ${i + 1} ragt über „${host.label}“ hinaus und blockiert beim Öffnen.` });
        }
      } else if (rect.x0 < 0 || rect.x1 > W || rect.y0 < yBottom || rect.y1 > yTop) {
        warnings.push({ level: 'warn', text: `Hirnholz-Kachel ${i + 1} liegt außerhalb des Möbels.` });
      }
      add({
        id: `hh-${i}`,
        name: `Hirnholz-Kachel ${i + 1}`,
        group: 'applikation',
        material: 'endgrain',
        pos: [tile.x, tile.y, z0],
        size: [s, s, th],
        grain: 'z',
        motion: host?.motion,
        cut: { length: s, width: s, thickness: th },
      });
    });
  }

  if (H > 1200 && cfg.base.kind !== 'wall') {
    warnings.push({ level: 'info', text: 'Hohes Möbel: unbedingt an der Wand kippsichern.' });
  }
  if (c < 14) {
    warnings.push({ level: 'info', text: `Parkett ${c} mm: für Einschraubmuffen bleibt wenig Material – M4-Muffen verwenden.` });
  }

  return { parts, motions, openings, lights, warnings, inner };
}

interface MiterSpec {
  /** Axis whose two ends meet the neighbouring panel at 45°. */
  axis: Axis;
  /** Extra length the cut needs on each mitred end (the box stops at the inner corner). */
  ext: number;
}

/** Split a cladding area into planks of (nearly) equal width. */
function cladPanel(parts: Part[], plankWidth: number, id: string, name: string, pos: Vec3, size: Vec3, along: Axis, miter: MiterSpec | null) {
  const axes: Axis[] = ['x', 'y', 'z'];
  const ai = axes.indexOf(along);
  const thick = size.indexOf(Math.min(...size));
  const si = [0, 1, 2].find((i) => i !== ai && i !== thick)!;
  const extent = size[si];
  const n = Math.max(1, Math.ceil(extent / plankWidth - 1e-6));
  const w = extent / n;
  const edgeNames: Record<Axis, [string, string]> = { x: ['links', 'rechts'], y: ['unten', 'oben'], z: ['hinten', 'vorne'] };
  for (let k = 0; k < n; k++) {
    const p: Vec3 = [...pos];
    const s: Vec3 = [...size];
    p[si] = pos[si] + k * w;
    s[si] = w;
    const cut = cutFromBox(s, along);
    if (miter) {
      const [n0, n1] = edgeNames[miter.axis];
      if (miter.axis === along) {
        cut.length = round1(cut.length + 2 * miter.ext);
        cut.miter = [`Hirnende ${n0}`, `Hirnende ${n1}`];
      } else if (axes[si] === miter.axis) {
        const edges: string[] = [];
        if (k === 0) edges.push(`Längskante ${n0}`);
        if (k === n - 1) edges.push(`Längskante ${n1}`);
        cut.width = round1(cut.width + edges.length * miter.ext);
        if (edges.length) cut.miter = edges;
      }
    }
    parts.push({ id: `${id}-${k + 1}`, name: `${name} Diele ${k + 1}/${n}`, group: 'verkleidung', material: 'oak', pos: p, size: s, grain: along, cut });
  }
}

function addFront(
  cfg: FurnitureConfig,
  parts: Part[],
  r: Rect,
  zf: number,
  surface: Surface,
  id: string,
  label: string,
  motion: string,
  grain: Axis,
  col: number,
  sec: number,
) {
  const m = cfg.materials;
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  const T = frontThickness(cfg, surface);
  const base = { motion, col, sec };
  if (surface === 'glass-clear') {
    parts.push({ id, name: `${label} (ESG klar)`, group: 'glas', material: 'glass-clear', pos: [r.x0, r.y0, zf - T], size: [w, h, T], ...base, cut: cutFromBox([w, h, T], 'y') });
    return;
  }
  if (surface === 'oak') {
    const carrier = T - m.cladding;
    parts.push({ id: `${id}-tr`, name: `${label} Träger`, group: 'front', material: 'multiplex', pos: [r.x0, r.y0, zf - T], size: [w, h, carrier], ...base, cut: cutFromBox([w, h, carrier], grain) });
    const before = parts.length;
    cladPanel(parts, m.plankWidth, `${id}-pk`, `${label} Parkett`, [r.x0, r.y0, zf - m.cladding], [w, h, m.cladding], grain, null);
    for (let i = before; i < parts.length; i++) Object.assign(parts[i], base);
    return;
  }
  const carrier = m.mattCarrier;
  parts.push({ id: `${id}-tr`, name: `${label} Träger`, group: 'front', material: 'multiplex', pos: [r.x0, r.y0, zf - T], size: [w, h, carrier], ...base, cut: cutFromBox([w, h, carrier], grain) });
  parts.push({ id: `${id}-gl`, name: `${label} Mattglas`, group: 'glas', material: surface, pos: [r.x0, r.y0, zf - m.mattGlass], size: [w, h, m.mattGlass], ...base, cut: cutFromBox([w, h, m.mattGlass], 'y') });
}

function drawerBox(
  parts: Part[],
  id: string,
  label: string,
  xc: number,
  cw: number,
  y0: number,
  fh: number,
  zFrontBack: number,
  runner: number,
  motion: string,
  col: number,
  sec: number,
) {
  const s = DRAWER_SIDE;
  const bw = cw - 2 * DRAWER_CLEARANCE;
  const bh = Math.max(60, Math.min(fh - 40, 220));
  const z1 = zFrontBack - 2;
  const z0 = z1 - runner;
  const x0 = xc + DRAWER_CLEARANCE;
  const y = y0 + 14;
  const mk = (sub: string, name: string, pos: Vec3, size: Vec3, grain: Axis) =>
    parts.push({ id: `${id}-${sub}`, name: `${label} ${name}`, group: 'schubkasten', material: 'multiplex', pos, size, grain, motion, col, sec, cut: cutFromBox(size, grain) });
  mk('sl', 'Seite links', [x0, y, z0], [s, bh, runner], 'z');
  mk('sr', 'Seite rechts', [x0 + bw - s, y, z0], [s, bh, runner], 'z');
  mk('v', 'Vorderstück', [x0 + s, y + DRAWER_BOTTOM, z1 - s], [bw - 2 * s, bh - DRAWER_BOTTOM, s], 'x');
  mk('h', 'Hinterstück', [x0 + s, y + DRAWER_BOTTOM, z0], [bw - 2 * s, bh - DRAWER_BOTTOM, s], 'x');
  mk('b', 'Boden', [x0 + s, y, z0], [bw - 2 * s, DRAWER_BOTTOM, runner], 'x');
}

function buildBase(cfg: FurnitureConfig, add: (p: Omit<Part, 'cut'> & { cut?: Cut }) => void, warnings: Warning[]) {
  const { width: W, depth: D } = cfg;
  const b = cfg.base;
  const t = cfg.materials.carcass;
  if (b.kind === 'wall') {
    warnings.push({ level: 'info', text: 'Wandhängend: Montage über Schwerlast-Aufhängeschiene (z. B. Camar) oder Französische Leiste.' });
    return;
  }
  if (b.height <= 0) return;
  const h = b.height;
  const sb = b.setback;
  if (b.kind === 'plinth') {
    const x0 = sb;
    const x1 = W - sb;
    const z0 = 30;
    const z1 = D - sb;
    if (x1 - x0 < 100 || z1 - z0 < 100) return;
    add({ id: 'sockel-v', name: 'Sockelblende vorne', group: 'sockel', material: 'black', pos: [x0, 0, z1 - t], size: [x1 - x0, h, t], grain: 'x' });
    add({ id: 'sockel-h', name: 'Sockelblende hinten', group: 'sockel', material: 'black', pos: [x0, 0, z0], size: [x1 - x0, h, t], grain: 'x' });
    add({ id: 'sockel-l', name: 'Sockelseite links', group: 'sockel', material: 'black', pos: [x0, 0, z0 + t], size: [t, h, z1 - z0 - 2 * t], grain: 'z' });
    add({ id: 'sockel-r', name: 'Sockelseite rechts', group: 'sockel', material: 'black', pos: [x1 - t, 0, z0 + t], size: [t, h, z1 - z0 - 2 * t], grain: 'z' });
  } else if (b.kind === 'skids') {
    // Two rectangular frames of black flat steel, 40 × 10 mm
    const bar = 10;
    const bw = 40;
    const z0 = Math.max(20, sb);
    const z1 = D - Math.max(20, sb);
    for (const [i, x] of [Math.max(60, sb + 40), W - Math.max(60, sb + 40) - bar].entries()) {
      const tag = i === 0 ? 'links' : 'rechts';
      add({ id: `kufe-${i}-u`, name: `Kufe ${tag} unten`, group: 'sockel', material: 'steel', pos: [x, 0, z0], size: [bar, bw / 4, z1 - z0], grain: 'z' });
      add({ id: `kufe-${i}-o`, name: `Kufe ${tag} oben`, group: 'sockel', material: 'steel', pos: [x, h - bar, z0], size: [bar, bar, z1 - z0], grain: 'z' });
      add({ id: `kufe-${i}-v`, name: `Kufe ${tag} vorne`, group: 'sockel', material: 'steel', pos: [x, 0, z1 - bw], size: [bar, h, bw], grain: 'y' });
      add({ id: `kufe-${i}-h`, name: `Kufe ${tag} hinten`, group: 'sockel', material: 'steel', pos: [x, 0, z0], size: [bar, h, bw], grain: 'y' });
    }
  } else if (b.kind === 'feet') {
    const f = 30;
    const inset = Math.max(20, sb);
    const xs = [inset, W - inset - f];
    const zs = [inset, D - inset - f];
    let i = 0;
    for (const x of xs) for (const z of zs) {
      i++;
      add({ id: `fuss-${i}`, name: `Fuß ${i}`, group: 'sockel', material: 'steel', pos: [x, 0, z], size: [f, h, f], grain: 'y' });
    }
  }
}
