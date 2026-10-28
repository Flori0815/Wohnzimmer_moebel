import type { BuildResult, FurnitureConfig, MaterialKey, Part, PartGroup } from '../model/types';

export type StockKind = 'multiplex' | 'parkett' | 'massivholz' | 'glas' | 'hirnholz' | 'stahl' | 'led';

export interface CutRow {
  pos: number;
  stock: StockKind;
  /** Human readable material, e.g. "Multiplex Birke 18 mm". */
  material: string;
  name: string;
  qty: number;
  length: number;
  width: number;
  thickness: number;
  grain: string;
  note: string;
  partIds: string[];
}

const GLASS_NAMES: Partial<Record<MaterialKey, string>> = {
  'glass-clear': 'ESG klar',
  'matt-white': 'Mattglas weiß (rückseitig lackiert)',
  'matt-anthracite': 'Mattglas anthrazit (rückseitig lackiert)',
  'matt-fango': 'Mattglas fango (rückseitig lackiert)',
};

export function stockOf(p: Part): StockKind {
  switch (p.material) {
    case 'multiplex':
    case 'oak-ply':
    case 'black':
      return 'multiplex';
    case 'oak':
      return 'parkett';
    case 'oak-solid':
      return 'massivholz';
    case 'endgrain':
      return 'hirnholz';
    case 'steel':
      return 'stahl';
    case 'led':
      return 'led';
    default:
      return 'glas';
  }
}

export function materialName(p: Part, _cfg: FurnitureConfig): string {
  const t = p.cut?.thickness ?? 0;
  switch (p.material) {
    case 'multiplex':
      return `Multiplex Birke ${t} mm`;
    case 'oak-ply':
      return `Multiplex Eiche furniert ${t} mm`;
    case 'black':
      return `Multiplex Birke ${t} mm, schwarz lackiert`;
    case 'oak':
      return `Landhausdiele Eiche ${t} mm`;
    case 'oak-solid':
      return 'Eiche massiv';
    case 'endgrain':
      return 'Eiche Hirnholz';
    case 'steel':
      return 'Flachstahl schwarz';
    case 'led':
      return 'LED-Profil';
    default:
      return `${GLASS_NAMES[p.material] ?? 'Glas'} ${t} mm`;
  }
}

const GROUP_ORDER: PartGroup[] = ['korpus', 'rueckwand', 'boden', 'front', 'schubkasten', 'sockel', 'verkleidung', 'auskleidung', 'anleimer', 'glas', 'applikation', 'led'];
const STOCK_ORDER: StockKind[] = ['multiplex', 'parkett', 'massivholz', 'glas', 'hirnholz', 'stahl', 'led'];

function grainText(p: Part): string {
  if (p.material === 'endgrain') return 'Hirnholz vorne';
  if (stockOf(p) === 'glas' || p.material === 'led' || p.material === 'steel') return '–';
  return 'längs';
}

function noteFor(p: Part, cfg: FurnitureConfig): string {
  const notes: string[] = [];
  if (p.cut?.miter?.length) notes.push(`Gehrung 45°: ${p.cut.miter.join(', ')}`);
  if (p.group === 'verkleidung') notes.push('Nut/Feder an Außenkanten abtrennen; Muffen lt. Bohrbild');
  if (p.rebate) {
    const width = (p.cut?.thickness ?? 0) - p.rebate.keep;
    const depth = p.pos[2] + p.size[2] - p.rebate.zFrom;
    notes.push(`Falz ${fmt(width)} × ${fmt(depth)} mm an der Vorderkante innen fräsen (Restdicke ${fmt(p.rebate.keep)} mm)`);
  }
  if (p.id.startsWith('bl-')) notes.push('Blende vor der Korpuskante, mit dem Korpus verleimen');
  if (p.group === 'auskleidung') notes.push('von außen durch den Korpus schrauben, bevor die Verkleidung kommt');
  if (p.id.startsWith('al-') && cfg.materials.frontStyle === 'overlay') notes.push('deckt die Dielenkante (Mittellage) ab');
  if (p.id.startsWith('ul-')) notes.push('auf die Multiplexkante hinter dem Klarglas');
  if (p.id === 'rueckwand') notes.push(`in Falz ${Math.floor(cfg.materials.carcass / 2)} mm`);
  if (p.group === 'boden' && stockOf(p) === 'multiplex') notes.push('Vorderkante Eiche-Umleimer 2 mm');
  if (p.group === 'glas' && p.material === 'glass-clear' && p.name.startsWith('Tür')) notes.push('Kanten poliert, Scharnierbohrungen lt. Beschlag');
  if (p.group === 'glas' && p.name.startsWith('Glasboden')) notes.push('Kanten poliert');
  if (p.group === 'glas' && p.material.startsWith('matt')) notes.push('vollflächig auf Träger kleben (Spiegelkleber)');
  if (p.group === 'front' && p.name.includes('Träger')) notes.push('Kanten passend zur Front lackieren/ölen');
  if (p.group === 'anleimer') notes.push('mit Übermaß anleimen, bündig fräsen');
  if (p.material === 'endgrain') notes.push('Risse mit schwarzem Epoxid füllen (optional)');
  return notes.join('; ');
}

/** "Fachboden S1F2.1" → "Fachboden", "Verkleidung links Diele 1/2" → "Verkleidung links". */
export function genericName(name: string): string {
  return name
    .replace(/ Diele \d+\/\d+$/, '')
    .replace(/\s*S\d+(F\d+(\.\d+)?|\/\d+)/g, '')
    .replace(/ \d+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cut list: identical parts (material, dimensions, notes) merged into one row. */
export function cutList(cfg: FurnitureConfig, res: BuildResult): CutRow[] {
  const rows = new Map<string, CutRow>();
  const parts = [...res.parts].sort(
    (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
  );
  for (const p of parts) {
    if (!p.cut) continue;
    const stock = stockOf(p);
    if (stock === 'led') continue; // handled in the hardware list (by length)
    const material = materialName(p, cfg);
    const note = noteFor(p, cfg);
    const baseName = genericName(p.name);
    const key = [stock, material, baseName, p.cut.length, p.cut.width, p.cut.thickness, note].join('|');
    const row = rows.get(key);
    if (row) {
      row.qty += 1;
      row.partIds.push(p.id);
    } else {
      rows.set(key, {
        pos: 0,
        stock,
        material,
        name: baseName,
        qty: 1,
        length: p.cut.length,
        width: p.cut.width,
        thickness: p.cut.thickness,
        grain: grainText(p),
        note,
        partIds: [p.id],
      });
    }
  }
  const list = [...rows.values()].sort((a, b) => STOCK_ORDER.indexOf(a.stock) - STOCK_ORDER.indexOf(b.stock));
  list.forEach((r, i) => (r.pos = i + 1));
  return list;
}

const DENSITY: Partial<Record<StockKind, number>> = {
  multiplex: 680,
  parkett: 650,
  massivholz: 700,
  hirnholz: 700,
  glas: 2500,
  stahl: 7850,
};

/** Rough weight in kg. */
export function weight(res: BuildResult): number {
  let kg = 0;
  for (const p of res.parts) {
    const d = DENSITY[stockOf(p)];
    if (!d) continue;
    kg += ((p.size[0] * p.size[1] * p.size[2]) / 1e9) * d;
  }
  return kg;
}

export function toCSV(rows: CutRow[]): string {
  const head = ['Pos', 'Material', 'Bezeichnung', 'Anzahl', 'Länge', 'Breite', 'Stärke', 'Faser', 'Bemerkung'];
  const esc = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head.join(';')];
  for (const r of rows) {
    lines.push([r.pos, r.material, r.name, r.qty, fmt(r.length), fmt(r.width), fmt(r.thickness), r.grain, r.note].map(esc).join(';'));
  }
  // Excel-friendly: BOM + semicolon + decimal comma
  return '﻿' + lines.join('\r\n');
}

export function fmt(v: number): string {
  return (Math.round(v * 10) / 10).toLocaleString('de-DE');
}
