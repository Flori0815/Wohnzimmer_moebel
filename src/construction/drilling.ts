import { frontThickness, isVisibleInside } from '../model/build';
import type { Axis, BuildResult, FurnitureConfig, Part } from '../model/types';

/** In-plane coordinate system of a carcass panel drawing (inside view). */
export interface PanelView {
  partId: string;
  title: string;
  /** World axes mapped to drawing horizontal / vertical. */
  hAxis: Axis;
  vAxis: Axis;
  /** World coordinate of drawing origin (h = 0, v = 0). */
  h0: number;
  v0: number;
  width: number;
  height: number;
  /** Where the horizontal axis "starts" (for the caption). */
  hLabel: string;
  vLabel: string;
}

export type HoleKind = 'muffe-fix' | 'muffe-langloch' | 'bodentraeger' | 'scharnier';

export interface Hole {
  panel: string;
  kind: HoleKind;
  h: number;
  v: number;
  /** For slots: orientation of the long axis in the drawing. */
  slotDir?: 'h' | 'v';
  /** Cladding plank the muff belongs to. */
  plank?: string;
}

export interface DrillResult {
  views: PanelView[];
  holes: Hole[];
  /** Muff positions on the planks themselves (outside view), per plank. */
  plankMuffs: Map<string, { u: number; v: number; fix: boolean }[]>;
  muffCount: number;
  bodentraeger: number;
  hinges: { door: string; count: number; side: string; height: number; type: string }[];
}

const AX: Axis[] = ['x', 'y', 'z'];
const idx = (a: Axis) => AX.indexOf(a);

export const MUFF_EDGE = 50;
export const MUFF_PITCH = 300;
export const MUFF_ROW_INSET = 35;

export function hingeCount(height: number): number {
  if (height <= 900) return 2;
  if (height <= 1600) return 3;
  if (height <= 2000) return 4;
  return 5;
}

export function muffSpec(cladding: number): { muffe: string; schraube: string; bohrung: string; langloch: string } {
  if (cladding < 14) return { muffe: 'Einschraubmuffe M4 × 8 mm', schraube: 'M4 × 25', bohrung: 'Ø 5,5 mm, 8,5 mm tief', langloch: '5 × 10 mm' };
  if (cladding < 18) return { muffe: 'Einschraubmuffe M5 × 10 mm', schraube: 'M5 × 25', bohrung: 'Ø 6,5 mm, 10,5 mm tief', langloch: '6 × 12 mm' };
  return { muffe: 'Einschraubmuffe M6 × 13 mm', schraube: 'M6 × 30', bohrung: 'Ø 8 mm, 13,5 mm tief', langloch: '7 × 14 mm' };
}

/** Candidate offsets (along, across) when a muff position is blocked, nearest first. */
const SHIFTS: [number, number][] = [0, 15, -15, 30, -30, 45, -45, 60, -60, 80, -80]
  .flatMap((du) => [0, 10, -10, 20, -20, 30, -30].map((dw) => [du, dw] as [number, number]))
  .sort((a, b) => Math.abs(a[0]) + 2 * Math.abs(a[1]) - (Math.abs(b[0]) + 2 * Math.abs(b[1])));

interface Rect2 { h0: number; h1: number; v0: number; v1: number }

export function computeDrilling(cfg: FurnitureConfig, res: BuildResult): DrillResult {
  const parts = new Map(res.parts.map((p) => [p.id, p]));
  const m = cfg.materials;
  const views: PanelView[] = [];
  const holes: Hole[] = [];
  const plankMuffs = new Map<string, { u: number; v: number; fix: boolean }[]>();
  const hinges: DrillResult['hinges'] = [];
  const carcass = res.parts.filter((p) => p.group === 'korpus' || p.group === 'rueckwand');

  const view = (p: Part, title: string, hAxis: Axis, vAxis: Axis, hLabel: string, vLabel: string): PanelView => {
    const existing = views.find((x) => x.partId === p.id);
    if (existing) return existing;
    const v: PanelView = {
      partId: p.id,
      title,
      hAxis,
      vAxis,
      h0: p.pos[idx(hAxis)],
      v0: p.pos[idx(vAxis)],
      width: p.size[idx(hAxis)],
      height: p.size[idx(vAxis)],
      hLabel,
      vLabel,
    };
    views.push(v);
    return v;
  };

  const toView = (v: PanelView, world: number[]) => ({ h: world[idx(v.hAxis)] - v.h0, v: world[idx(v.vAxis)] - v.v0 });

  // Blocked zones on the inside face of a carcass panel: joints with other carcass parts,
  // the rear panel rebate and the front edge.
  const blockers = (panel: Part, normal: Axis, innerFace: number, v: PanelView): Rect2[] => {
    const n = idx(normal);
    const out: Rect2[] = [];
    for (const q of carcass) {
      if (q.id === panel.id) continue;
      const touches = Math.abs(q.pos[n] - innerFace) < 0.6 || Math.abs(q.pos[n] + q.size[n] - innerFace) < 0.6;
      if (!touches) continue;
      const a = toView(v, q.pos);
      const b = toView(v, [q.pos[0] + q.size[0], q.pos[1] + q.size[1], q.pos[2] + q.size[2]]);
      const pad = 15;
      out.push({ h0: Math.min(a.h, b.h) - pad, h1: Math.max(a.h, b.h) + pad, v0: Math.min(a.v, b.v) - pad, v1: Math.max(a.v, b.v) + pad });
    }
    return out;
  };

  // --- shelf supports and hinge plates on the column walls -------------------------
  const wallViews = new Map<string, PanelView>();
  const wallView = (id: string): PanelView | undefined => {
    if (wallViews.has(id)) return wallViews.get(id);
    const p = parts.get(id);
    if (!p) return undefined;
    const v = view(p, `${p.name} (Innenansicht)`, 'z', 'y', 'hinten → vorne', 'unten → oben');
    wallViews.set(id, v);
    return v;
  };
  const leftWall = (col: number) => (col === 0 ? 'seite-l' : `mw-${col}`);
  const rightWall = (col: number) => (col === cfg.columns.length - 1 ? 'seite-r' : `mw-${col + 1}`);

  let bodentraeger = 0;
  for (const o of res.openings) {
    const sec = cfg.columns[o.col]?.sections[o.sec];
    if (!sec) continue;
    const T = sec.front === 'open' ? 0 : frontThickness(cfg, sec.surface);
    const zDoorBack = sec.front === 'open' ? res.inner.zFront : cfg.depth - m.frontSetback - T;

    if (sec.front !== 'drawers' && sec.shelves > 0) {
      const zRows = [res.inner.zBack + 37, Math.min(res.inner.zFront, zDoorBack) - 37];
      for (const wall of [leftWall(o.col), rightWall(o.col)]) {
        const v = wallView(wall);
        if (!v) continue;
        for (let y = o.y + 64; y <= o.y + o.h - 64; y += 32) {
          for (const z of zRows) {
            holes.push({ panel: wall, kind: 'bodentraeger', h: z - v.h0, v: y - v.v0 });
          }
        }
      }
      bodentraeger += 4 * Math.round(sec.shelves);
    }

    if (sec.front === 'door' || sec.front === 'double-door') {
      const doors = sec.front === 'door' ? [{ side: sec.hinge, wall: sec.hinge === 'left' ? leftWall(o.col) : rightWall(o.col) }] : [
        { side: 'left' as const, wall: leftWall(o.col) },
        { side: 'right' as const, wall: rightWall(o.col) },
      ];
      const overlay = m.frontStyle === 'overlay';
      const lined = m.lining === 'parkett' && isVisibleInside(sec) ? m.liningThickness : 0;
      for (const d of doors) {
        const door = res.parts.find((p) => p.id.startsWith(`tuer-${o.col}-${o.sec}${doors.length > 1 ? (d.side === 'left' ? '-l' : '-r') : ''}`));
        const dy0 = door ? door.pos[1] : o.y + m.frontGap;
        const dh = door ? door.size[1] : o.h - 2 * m.frontGap;
        const k = hingeCount(dh);
        const onSide = d.wall.startsWith('seite');
        const mount = overlay ? (onSide ? 'aufliegend' : 'halb aufliegend (Mittelwand)') : 'einliegend';
        const type =
          (sec.surface === 'glass-clear' && m.glassFrame !== 'none'
            ? `Scharnier für Alu-Rahmentüren ${mount} (Rahmenadapter passend zum Profil)`
            : sec.surface === 'glass-clear'
            ? `Glastürscharnier ${mount} (Glas 4–6 mm, Bohrungen vom Glaser)`
            : sec.surface === 'oak' && T > 24
              ? `Topfscharnier 110° ${mount} für Dickfronten`
              : `Topfscharnier 110° ${mount}, Topf Ø 35`) + (lined ? `, Montageplatte +${lined} mm (Auskleidung)` : '');
        hinges.push({ door: `Spalte ${o.col + 1}, Fach ${o.sec + 1}${doors.length > 1 ? ` (${d.side === 'left' ? 'links' : 'rechts'})` : ''}`, count: k, side: d.side === 'left' ? 'links' : 'rechts', height: dh, type });
        const v = wallView(d.wall);
        if (!v) continue;
        const y0 = dy0 + 100;
        const y1 = dy0 + dh - 100;
        const zPlate = (overlay ? res.inner.zFront : zDoorBack) - 37;
        for (let i = 0; i < k; i++) {
          const y = k === 1 ? (y0 + y1) / 2 : y0 + (i * (y1 - y0)) / (k - 1);
          holes.push({ panel: d.wall, kind: 'scharnier', h: zPlate - v.h0, v: y - v.v0 });
        }
      }
    }
  }

  // --- muffs per cladding panel ------------------------------------------------
  const claddingSets: { prefix: string; backing: string; normal: Axis; title: string; hAxis: Axis; vAxis: Axis; hLabel: string; vLabel: string }[] = [
    { prefix: 'vk-l-', backing: 'seite-l', normal: 'x', title: 'Seite links (Innenansicht)', hAxis: 'z', vAxis: 'y', hLabel: 'hinten → vorne', vLabel: 'unten → oben' },
    { prefix: 'vk-r-', backing: 'seite-r', normal: 'x', title: 'Seite rechts (Innenansicht)', hAxis: 'z', vAxis: 'y', hLabel: 'hinten → vorne', vLabel: 'unten → oben' },
    { prefix: 'vk-o-', backing: 'deckel', normal: 'y', title: 'Deckel (Ansicht von unten/innen)', hAxis: 'x', vAxis: 'z', hLabel: 'links → rechts', vLabel: 'hinten → vorne' },
    { prefix: 'vk-u-', backing: 'boden', normal: 'y', title: 'Boden (Ansicht von oben/innen)', hAxis: 'x', vAxis: 'z', hLabel: 'links → rechts', vLabel: 'hinten → vorne' },
  ];

  let muffCount = 0;
  for (const set of claddingSets) {
    const panel = parts.get(set.backing);
    if (!panel) continue;
    const v = view(panel, set.title, set.hAxis, set.vAxis, set.hLabel, set.vLabel);
    const n = idx(set.normal);
    // inner face: the face that is not covered by the cladding
    const cladFirst = res.parts.find((p) => p.id.startsWith(set.prefix));
    if (!cladFirst) continue;
    const cladIsBelow = cladFirst.pos[n] < panel.pos[n];
    const innerFace = cladIsBelow ? panel.pos[n] + panel.size[n] : panel.pos[n];
    const blocked = blockers(panel, set.normal, innerFace, v);
    // rear rebate and front edge
    const zAxisIsH = set.hAxis === 'z';
    const zStrip = (z0: number, z1: number): Rect2 => (zAxisIsH ? { h0: z0 - v.h0, h1: z1 - v.h0, v0: -1e9, v1: 1e9 } : { h0: -1e9, h1: 1e9, v0: z0 - v.v0, v1: z1 - v.v0 });
    // keep clear of hinge mounting plates and shelf support holes
    for (const x of holes.filter((q) => q.panel === panel.id)) {
      const [dh, dv] = x.kind === 'scharnier' ? [30, 45] : [12, 12];
      blocked.push({ h0: x.h - dh, h1: x.h + dh, v0: x.v - dv, v1: x.v + dv });
    }
    blocked.push(zStrip(-1e9, m.back + 20));
    blocked.push(zStrip(res.inner.zFront - 25, 1e9));
    const isFree = (h: number, vv: number) =>
      h > 25 && h < v.width - 25 && vv > 25 && vv < v.height - 25 && !blocked.some((r) => h > r.h0 && h < r.h1 && vv > r.v0 && vv < r.v1);

    for (const plank of res.parts.filter((p) => p.id.startsWith(set.prefix))) {
      const along = plank.grain!;
      const across = AX.find((a) => a !== along && a !== set.normal)!;
      const L = plank.size[idx(along)];
      const W = plank.size[idx(across)];
      const nAlong = Math.max(2, Math.ceil((L - 2 * MUFF_EDGE) / MUFF_PITCH) + 1);
      const rows = W >= 120 ? [MUFF_ROW_INSET, W - MUFF_ROW_INSET] : [W / 2];
      const list: { u: number; v: number; fix: boolean }[] = [];
      const mid = L / 2;
      let fixDone = false;
      const us = Array.from({ length: nAlong }, (_, i) => MUFF_EDGE + (i * (L - 2 * MUFF_EDGE)) / (nAlong - 1));
      // the position nearest to the middle gets the fixed point
      const fixU = us.reduce((best, u) => (Math.abs(u - mid) < Math.abs(best - mid) ? u : best), us[0]);
      for (const [ri, row] of rows.entries()) {
        for (const u0 of us) {
          let placed: { u: number; w: number; h: number; v: number } | null = null;
          for (const [du, dw] of SHIFTS) {
            const u = u0 + du;
            const w = row + dw;
            if (u < 30 || u > L - 30 || w < 15 || w > W - 15) continue;
            const world = [...plank.pos];
            world[idx(along)] += u;
            world[idx(across)] += w;
            const pv = toView(v, world);
            if (isFree(pv.h, pv.v)) {
              placed = { u, w, ...pv };
              break;
            }
          }
          if (!placed) continue;
          const fix = !fixDone && ri === 0 && u0 === fixU;
          if (fix) fixDone = true;
          list.push({ u: placed.u, v: placed.w, fix });
          // slots run across the plank (the direction the plank moves)
          const slotDir: 'h' | 'v' = across === set.hAxis ? 'h' : 'v';
          holes.push({ panel: panel.id, kind: fix ? 'muffe-fix' : 'muffe-langloch', h: placed.h, v: placed.v, slotDir, plank: plank.id });
          muffCount++;
        }
      }
      // guarantee one fixed point per plank
      if (!fixDone && list.length) {
        list[0].fix = true;
        const hh = holes.filter((x) => x.plank === plank.id)[0];
        if (hh) hh.kind = 'muffe-fix';
      }
      plankMuffs.set(plank.id, list);
    }
  }

  return { views, holes, plankMuffs, muffCount, bodentraeger, hinges };
}
