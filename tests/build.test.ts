import { describe, expect, it } from 'vitest';
import { buildFurniture, distribute } from '../src/model/build';
import { sideboardPreset, vitrinePreset } from '../src/model/presets';
import type { FurnitureConfig, Part } from '../src/model/types';

function bounds(parts: Part[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p.pos[i]);
      max[i] = Math.max(max[i], p.pos[i] + p.size[i]);
    }
  }
  return { min, max };
}

const presets: [string, () => FurnitureConfig][] = [
  ['vitrine', () => vitrinePreset()],
  ['sideboard', () => sideboardPreset()],
];

describe.each(presets)('%s preset', (_name, make) => {
  const cfg = make();
  const res = buildFurniture(cfg);
  const body = res.parts.filter((p) => p.group !== 'applikation');

  it('has no errors or warnings', () => {
    expect(res.warnings.filter((w) => w.level !== 'info')).toEqual([]);
  });

  it('fits exactly into the outer dimensions', () => {
    const b = bounds(body);
    expect(b.min).toEqual([0, 0, 0]);
    expect(b.max[0]).toBeCloseTo(cfg.width, 6);
    expect(b.max[1]).toBeCloseTo(cfg.height, 6);
    expect(b.max[2]).toBeCloseTo(cfg.depth, 6);
  });

  it('produces positive sizes and unique ids', () => {
    for (const p of res.parts) for (const s of p.size) expect(s).toBeGreaterThan(0);
    const ids = res.parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every moving part a known motion', () => {
    const ids = new Set(res.motions.map((m) => m.id));
    for (const p of res.parts) if (p.motion) expect(ids.has(p.motion)).toBe(true);
  });

  it('clads the sides with planks no wider than the plank width', () => {
    const planks = res.parts.filter((p) => p.group === 'verkleidung');
    expect(planks.length).toBeGreaterThan(4);
    for (const p of planks) expect(p.cut!.width).toBeLessThanOrEqual(cfg.materials.plankWidth + cfg.materials.cladding);
  });
});

describe('layout', () => {
  it('distributes auto sizes', () => {
    expect(distribute(1000, [null, 200, null])).toEqual([400, 200, 400]);
  });

  it('places the sideboard tiles on doors without overhang', () => {
    const res = buildFurniture(sideboardPreset());
    const tiles = res.parts.filter((p) => p.group === 'applikation');
    expect(tiles).toHaveLength(3);
    for (const t of tiles) expect(t.motion).toBeDefined();
  });

  it('warns when columns do not fit', () => {
    const cfg = sideboardPreset();
    cfg.columns[0].width = 1500;
    expect(buildFurniture(cfg).warnings.some((w) => w.level === 'error')).toBe(true);
  });

  it('extends mitred top planks by the cladding thickness on both ends', () => {
    const cfg = sideboardPreset();
    const res = buildFurniture(cfg);
    const top = res.parts.find((p) => p.id === 'vk-o-1')!;
    expect(top.cut!.length).toBeCloseTo(cfg.width, 6);
  });

  it('builds drawers with runners that fit', () => {
    const cfg = sideboardPreset();
    cfg.columns[1].sections[0].front = 'drawers';
    cfg.columns[1].sections[0].drawers = 3;
    cfg.applique.enabled = false;
    const res = buildFurniture(cfg);
    const sides = res.parts.filter((p) => p.group === 'schubkasten' && p.id.endsWith('-sl'));
    expect(sides).toHaveLength(3);
    // 490 deep − 19 mm front − 9 mm back − 10 mm clearance → 450 mm runner
    expect(sides[0].size[2]).toBe(450);
  });
});

describe('Lago overlay fronts', () => {
  const cfg = vitrinePreset();
  const res = buildFurniture(cfg);
  const m = cfg.materials;

  it('puts the fronts flush with the cladding edge', () => {
    const fronts = res.parts.filter((p) => p.motion && (p.group === 'glas' || p.group === 'front'));
    const frontFace = Math.max(...fronts.map((p) => p.pos[2] + p.size[2]));
    expect(frontFace).toBeCloseTo(cfg.depth - m.frontSetback, 6);
    const lip = res.parts.find((p) => p.id === 'al-l')!;
    expect(lip.size[0]).toBe(m.rim);
    expect(lip.pos[2] + lip.size[2]).toBe(cfg.depth);
  });

  it('covers the whole carcass front with fronts (only gaps between them)', () => {
    const doors = res.parts.filter((p) => p.id.startsWith('tuer-') && !p.id.endsWith('-tr'));
    const area = doors.reduce((s, p) => s + p.size[0] * p.size[1], 0);
    const opening = (cfg.width - 2 * m.cladding) * (cfg.height - cfg.base.height - 2 * m.cladding);
    expect(area / opening).toBeGreaterThan(0.97);
  });

  it('lines only the clear-glass compartment with parquet', () => {
    const lining = res.parts.filter((p) => p.group === 'auskleidung');
    expect(lining.length).toBeGreaterThanOrEqual(5);
    expect(new Set(lining.map((p) => p.sec))).toEqual(new Set([1]));
    expect(lining.every((p) => p.cut!.thickness === m.liningThickness)).toBe(true);
  });

  it('keeps the inset style available', () => {
    const inset = vitrinePreset();
    inset.materials.frontStyle = 'inset';
    const r = buildFurniture(inset);
    expect(r.warnings.filter((w) => w.level === 'error')).toEqual([]);
    expect(r.parts.some((p) => p.id.startsWith('al-zb-'))).toBe(true);
  });
});

describe('visible rim of the cladding', () => {
  const withRim = (rim: number) => {
    const cfg = sideboardPreset();
    cfg.materials.rim = rim;
    return { cfg, res: buildFurniture(cfg) };
  };

  it('mills a rebate into the front planks when the rim is thinner than the cladding', () => {
    const { cfg, res } = withRim(8);
    const m = cfg.materials;
    const rebated = res.parts.filter((p) => p.rebate);
    expect(rebated.length).toBeGreaterThan(0);
    for (const p of rebated) {
      expect(p.group).toBe('verkleidung');
      expect(p.rebate!.keep).toBe(8);
      expect(p.pos[2] + p.size[2]).toBeCloseTo(cfg.depth - m.edgeBand, 6);
    }
    // the leftmost door starts right after rim + gap
    const doors = res.parts.filter((p) => p.motion && p.group !== 'applikation');
    expect(Math.min(...doors.map((p) => p.pos[0]))).toBeCloseTo(8 + m.frontGap, 6);
    expect(res.parts.some((p) => p.id.startsWith('bl-'))).toBe(false);
  });

  it('adds a filler strip when the rim is wider than the cladding', () => {
    const { cfg, res } = withRim(20);
    expect(res.parts.some((p) => p.rebate)).toBe(false);
    const filler = res.parts.find((p) => p.id === 'bl-l')!;
    expect(filler.size[0]).toBe(20 - cfg.materials.cladding);
    expect(res.parts.find((p) => p.id === 'al-l')!.size[0]).toBe(20);
  });

  it('needs neither when the rim equals the cladding thickness', () => {
    const { res } = withRim(14);
    expect(res.parts.some((p) => p.rebate || p.id.startsWith('bl-'))).toBe(false);
  });
});

describe('metal frame on clear-glass doors', () => {
  const framed = (width: number) => {
    const cfg = vitrinePreset();
    cfg.materials.glassFrame = 'black';
    cfg.materials.glassFrameWidth = width;
    return { cfg, res: buildFurniture(cfg) };
  };

  it('builds four mitred profiles around a smaller pane', () => {
    const { cfg, res } = framed(25);
    const m = cfg.materials;
    const bars = res.parts.filter((p) => p.material === 'metal-black');
    expect(bars).toHaveLength(4);
    for (const b of bars) expect(b.cut!.miter).toEqual(['beide Enden']);
    const pane = res.parts.find((p) => p.id === 'tuer-0-1')!;
    const left = bars.find((b) => b.id.endsWith('-rl'))!;
    // pane sits 5 mm deep in the groove on each side
    expect(pane.size[0]).toBeCloseTo(res.parts.find((p) => p.id === 'tuer-0-1-rr')!.pos[0] + 25 - left.pos[0] - 2 * 25 + 10, 6);
    expect(pane.size[2]).toBe(m.framedGlass);
    // door thickness = profile depth, all moving with the door
    expect(bars.every((b) => b.size[2] === m.glassFrameDepth && b.motion === pane.motion)).toBe(true);
  });

  it('follows the chosen frame width', () => {
    const a = framed(15).res.parts.find((p) => p.id === 'tuer-0-1-rl')!;
    const b = framed(40).res.parts.find((p) => p.id === 'tuer-0-1-rl')!;
    expect(a.size[0]).toBe(15);
    expect(b.size[0]).toBe(40);
  });

  it('leaves frameless glass doors unchanged by default', () => {
    const res = buildFurniture(vitrinePreset());
    expect(res.parts.some((p) => p.material.startsWith('metal-'))).toBe(false);
  });
});
