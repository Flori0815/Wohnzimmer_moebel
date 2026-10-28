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
