import * as THREE from 'three';
import type { BuildResult, FurnitureConfig } from '../model/types';
import { labelTexture } from './textures';

/** Dimension lines in furniture-local millimetres (parent is scaled to metres). */
export function buildDimensions(cfg: FurnitureConfig, res: BuildResult): THREE.Group {
  const g = new THREE.Group();
  g.name = 'masse';
  const lineMat = new THREE.LineBasicMaterial({ color: 0x1f2a33, depthTest: false, transparent: true });
  const W = cfg.width;
  const H = cfg.height;
  const D = cfg.depth;
  const tick = 25;

  const dim = (a: THREE.Vector3, b: THREE.Vector3, tickDir: THREE.Vector3, text: string) => {
    const pts = [
      a, b,
      a.clone().addScaledVector(tickDir, -tick), a.clone().addScaledVector(tickDir, tick),
      b.clone().addScaledVector(tickDir, -tick), b.clone().addScaledVector(tickDir, tick),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const lines = new THREE.LineSegments(geo, lineMat);
    lines.renderOrder = 10;
    g.add(lines);
    const { tex, aspect } = labelTexture(text);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const h = 55;
    sprite.scale.set(h * aspect, h, 1);
    sprite.position.copy(a).add(b).multiplyScalar(0.5);
    sprite.renderOrder = 11;
    g.add(sprite);
  };

  const fmt = (v: number) => `${Math.round(v)}`;
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3(1, 0, 0);

  dim(new THREE.Vector3(0, H + 140, D), new THREE.Vector3(W, H + 140, D), side, `${fmt(W)} mm`);
  dim(new THREE.Vector3(W + 140, 0, D), new THREE.Vector3(W + 140, H, D), up, `${fmt(H)} mm`);
  dim(new THREE.Vector3(W + 140, H, 0), new THREE.Vector3(W + 140, H, D), up, `${fmt(D)}`);

  // clear width per column (only if more than one)
  const cols = new Map<number, { x: number; w: number }>();
  for (const o of res.openings) cols.set(o.col, { x: o.x, w: o.w });
  if (cols.size > 1) {
    for (const { x, w } of cols.values()) {
      dim(new THREE.Vector3(x, H + 60, D), new THREE.Vector3(x + w, H + 60, D), side, fmt(w));
    }
  }
  // clear height per compartment on the left
  const byCol = res.openings.filter((o) => o.col === 0);
  if (byCol.length > 1) {
    for (const o of byCol) {
      dim(new THREE.Vector3(-90, o.y, D), new THREE.Vector3(-90, o.y + o.h, D), up, fmt(o.h));
    }
  }
  return g;
}
