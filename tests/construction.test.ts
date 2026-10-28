import { describe, expect, it } from 'vitest';
import { cutList, genericName, toCSV } from '../src/construction/bom';
import { computeDrilling, hingeCount } from '../src/construction/drilling';
import { hardwareList } from '../src/construction/hardware';
import { planPlanks, planSheets } from '../src/construction/packing';
import { buildFurniture } from '../src/model/build';
import { sideboardPreset, vitrinePreset } from '../src/model/presets';

describe.each([
  ['vitrine', vitrinePreset],
  ['sideboard', sideboardPreset],
])('%s construction', (_n, make) => {
  const cfg = make();
  const res = buildFurniture(cfg);

  it('cut list covers every part except LEDs', () => {
    const rows = cutList(cfg, res);
    const counted = rows.reduce((s, r) => s + r.qty, 0);
    expect(counted).toBe(res.parts.filter((p) => p.group !== 'led').length);
    expect(toCSV(rows).split('\r\n').length).toBe(rows.length + 1);
  });

  it('fixes every cladding plank with ≥ 2 muffs and exactly one fixed point', () => {
    const drill = computeDrilling(cfg, res);
    const planks = res.parts.filter((p) => p.id.startsWith('vk-'));
    for (const p of planks) {
      const muffs = drill.plankMuffs.get(p.id) ?? [];
      expect(muffs.length, p.id).toBeGreaterThanOrEqual(2);
      expect(muffs.filter((m) => m.fix).length, p.id).toBe(1);
    }
    expect(drill.muffCount).toBe([...drill.plankMuffs.values()].reduce((s, l) => s + l.length, 0));
  });

  it('keeps muffs inside their carcass panel and away from hinge plates', () => {
    const drill = computeDrilling(cfg, res);
    for (const v of drill.views) {
      const holes = drill.holes.filter((x) => x.panel === v.partId);
      const hinges = holes.filter((x) => x.kind === 'scharnier');
      for (const m of holes.filter((x) => x.kind.startsWith('muffe'))) {
        expect(m.h).toBeGreaterThan(20);
        expect(m.h).toBeLessThan(v.width - 20);
        expect(m.v).toBeGreaterThan(20);
        expect(m.v).toBeLessThan(v.height - 20);
        for (const hg of hinges) expect(Math.abs(m.h - hg.h) >= 30 || Math.abs(m.v - hg.v) >= 45).toBe(true);
      }
    }
  });

  it('lists hardware with hinges and muffs', () => {
    const drill = computeDrilling(cfg, res);
    const hw = hardwareList(cfg, res, drill);
    expect(hw.find((r) => r.item.startsWith('Einschraubmuffe'))?.qty).toBe(drill.muffCount);
    expect(hw.some((r) => r.item.includes('Scharnier') || r.item.includes('scharnier'))).toBe(true);
  });
});

describe('helpers', () => {
  it('strips position tags from names', () => {
    expect(genericName('Fachboden S1F2.1')).toBe('Fachboden');
    expect(genericName('Verkleidung links Diele 1/3')).toBe('Verkleidung links');
    expect(genericName('Zwischenboden S1/2')).toBe('Zwischenboden');
    expect(genericName('Mittelwand 2')).toBe('Mittelwand');
  });

  it('counts hinges by door height', () => {
    expect(hingeCount(700)).toBe(2);
    expect(hingeCount(1200)).toBe(3);
    expect(hingeCount(1800)).toBe(4);
  });

  it('packs planks without exceeding the usable length', () => {
    const pieces = [1500, 900, 700, 600, 400].map((l, i) => ({ id: `p${i}`, label: `p${i}`, length: l, width: 150 }));
    const plan = planPlanks(pieces, 2200, 190, 4, 30);
    for (const pl of plan.planks) {
      const end = Math.max(...pl.pieces.map((p) => p.at + p.length));
      expect(end).toBeLessThanOrEqual(2200 - 30);
    }
    expect(plan.planks.length).toBe(2);
  });

  it('packs sheets without overlaps', () => {
    const pieces = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, label: `s${i}`, length: 300 + i * 40, width: 200 + (i % 3) * 90 }));
    const plan = planSheets(pieces, 2500, 1250, 4, true);
    expect(plan.unplaced).toEqual([]);
    for (const sh of plan.sheets) {
      for (const a of sh.placed) {
        expect(a.x + a.w).toBeLessThanOrEqual(2500);
        expect(a.y + a.h).toBeLessThanOrEqual(1250);
        for (const b of sh.placed) {
          if (a === b) continue;
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap).toBe(false);
        }
      }
    }
  });
});
