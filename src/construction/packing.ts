import type { Part } from '../model/types';

export interface Piece {
  id: string;
  label: string;
  length: number;
  width: number;
}

// ---------------------------------------------------------------------------
// Parquet planks: every cladding piece is ripped from one plank (width ≤ plank
// width), so this is a 1D bin packing along the plank length.

export interface PlankPlan {
  planks: { pieces: (Piece & { at: number })[]; used: number }[];
  /** Pieces longer than a plank – need a joint or longer planks. */
  tooLong: Piece[];
  tooWide: Piece[];
  areaM2: number;
}

export function planPlanks(pieces: Piece[], plankLength: number, plankWidth: number, kerf: number, endTrim: number): PlankPlan {
  const usable = plankLength - 2 * endTrim;
  const tooLong = pieces.filter((p) => p.length > usable);
  const tooWide = pieces.filter((p) => p.width > plankWidth + 0.5);
  const fit = pieces.filter((p) => p.length <= usable && p.width <= plankWidth + 0.5).sort((a, b) => b.length - a.length);
  const planks: PlankPlan['planks'] = [];
  for (const p of fit) {
    let target = planks.find((pl) => pl.used + (pl.pieces.length ? kerf : 0) + p.length <= usable);
    if (!target) {
      target = { pieces: [], used: 0 };
      planks.push(target);
    }
    const at = endTrim + target.used + (target.pieces.length ? kerf : 0);
    target.pieces.push({ ...p, at });
    target.used = at - endTrim + p.length;
  }
  const areaM2 = pieces.reduce((s, p) => s + p.length * p.width, 0) / 1e6;
  return { planks, tooLong, tooWide, areaM2 };
}

// ---------------------------------------------------------------------------
// Sheet goods: guillotine "shelf" packing (first-fit decreasing height).

export interface Placed extends Piece {
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
}

export interface Sheet {
  placed: Placed[];
}

export interface SheetPlan {
  sheets: Sheet[];
  unplaced: Piece[];
  /** Used area / total sheet area. */
  yieldRatio: number;
}

export function planSheets(pieces: Piece[], sheetL: number, sheetW: number, kerf: number, allowRotate: boolean): SheetPlan {
  interface Shelf { y: number; h: number; x: number }
  interface S { sheet: Sheet; shelves: Shelf[]; top: number }
  const sheets: S[] = [];
  const unplaced: Piece[] = [];
  // length along the sheet length (x), width along y
  const items = pieces
    .map((p) => ({ ...p, l: p.length, w: p.width }))
    .sort((a, b) => Math.max(b.w, allowRotate ? b.l : 0) - Math.max(a.w, allowRotate ? a.l : 0) || b.l - a.l);

  const tryPlace = (s: S, p: Piece, w: number, h: number, rotated: boolean): boolean => {
    for (const shelf of s.shelves) {
      if (h <= shelf.h && shelf.x + w <= sheetL) {
        s.sheet.placed.push({ ...p, x: shelf.x, y: shelf.y, w, h, rotated });
        shelf.x += w + kerf;
        return true;
      }
    }
    if (s.top + h <= sheetW && w <= sheetL) {
      const shelf = { y: s.top, h, x: w + kerf };
      s.shelves.push(shelf);
      s.sheet.placed.push({ ...p, x: 0, y: s.top, w, h, rotated });
      s.top += h + kerf;
      return true;
    }
    return false;
  };

  for (const it of items) {
    const p: Piece = { id: it.id, label: it.label, length: it.length, width: it.width };
    const options: [number, number, boolean][] = [[it.l, it.w, false]];
    if (allowRotate) options.push([it.w, it.l, true]);
    const fits = options.filter(([w, h]) => w <= sheetL && h <= sheetW);
    if (fits.length === 0) {
      unplaced.push(p);
      continue;
    }
    let done = false;
    for (const s of sheets) {
      for (const [w, h, r] of fits) {
        if (tryPlace(s, p, w, h, r)) {
          done = true;
          break;
        }
      }
      if (done) break;
    }
    if (!done) {
      const s: S = { sheet: { placed: [] }, shelves: [], top: 0 };
      sheets.push(s);
      tryPlace(s, p, fits[0][0], fits[0][1], fits[0][2]);
    }
  }
  const used = sheets.reduce((a, s) => a + s.sheet.placed.reduce((b, p) => b + p.w * p.h, 0), 0);
  const total = sheets.length * sheetL * sheetW;
  return { sheets: sheets.map((s) => s.sheet), unplaced, yieldRatio: total ? used / total : 0 };
}

export function pieceOf(p: Part): Piece {
  return { id: p.id, label: p.name, length: p.cut!.length, width: p.cut!.width };
}
