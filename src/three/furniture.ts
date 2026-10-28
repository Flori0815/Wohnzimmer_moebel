import * as THREE from 'three';
import type { Axis, BuildResult, Motion, Part } from '../model/types';
import type { MaterialLib } from './materials';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash, rng } from './textures';

export const MM = 0.001;

const AXES: Axis[] = ['x', 'y', 'z'];

/**
 * Box geometry whose UVs are in real-world millimetres divided by the texture size,
 * with u following the grain. Gives correct wood scale on every face of every part.
 */
/** Part geometry centred on the part: a plain box, or two boxes for a rebated plank. */
function partGeometry(part: Part): THREE.BufferGeometry {
  const [sx, sy, sz] = part.size;
  const r = part.rebate;
  const zCut = r ? r.zFrom - part.pos[2] : sz;
  if (!r || zCut <= 0 || zCut >= sz) return new THREE.BoxGeometry(sx, sy, sz);
  const a = AXES.indexOf(r.axis);
  // body behind the rebate (full thickness)
  const body = new THREE.BoxGeometry(sx, sy, zCut);
  body.translate(0, 0, -sz / 2 + zCut / 2);
  // remaining outer band in front of it
  const lipSize: [number, number, number] = [sx, sy, sz - zCut];
  lipSize[a] = r.keep;
  const lip = new THREE.BoxGeometry(...lipSize);
  const off: [number, number, number] = [0, 0, sz / 2 - (sz - zCut) / 2];
  const half = part.size[a] / 2;
  off[a] = r.outerAtMin ? -half + r.keep / 2 : half - r.keep / 2;
  lip.translate(...off);
  return mergeGeometries([body, lip])!;
}

function woodBox(part: Part, scale: [number, number]): THREE.BufferGeometry {
  const geo = partGeometry(part);
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const rand = rng(hash(part.id));
  const offU = rand();
  const offV = rand();
  const grain = AXES.indexOf(part.grain ?? 'x');
  for (let i = 0; i < pos.count; i++) {
    const n = [Math.abs(nrm.getX(i)), Math.abs(nrm.getY(i)), Math.abs(nrm.getZ(i))];
    const normalAxis = n.indexOf(Math.max(...n));
    const inPlane = [0, 1, 2].filter((a) => a !== normalAxis);
    const ua = inPlane.includes(grain) ? grain : inPlane[0];
    const va = inPlane.find((a) => a !== ua)!;
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    uv.setXY(i, p[ua] / scale[0] + offU, p[va] / scale[1] + offV);
  }
  // Slight per-part colour variation so planks read as individual boards
  const tint = 0.9 + rand() * 0.16;
  const colors = new Float32Array(pos.count * 3).fill(tint);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export interface FurnitureView {
  group: THREE.Group;
  setOpen(amount: number): void;
  dispose(): void;
}

export function buildFurnitureView(res: BuildResult, mats: MaterialLib, ledOn: boolean): FurnitureView {
  const group = new THREE.Group();
  group.name = 'moebel';
  group.scale.setScalar(MM);

  const pivots = new Map<string, { node: THREE.Group; motion: Motion }>();
  for (const m of res.motions) {
    const node = new THREE.Group();
    node.name = m.id;
    if (m.kind === 'hinge') node.position.set(...m.pivot);
    group.add(node);
    pivots.set(m.id, { node, motion: m });
  }

  const geos: THREE.BufferGeometry[] = [];
  for (const part of res.parts) {
    const scale = mats.woodScale(part.material);
    const geo = scale ? woodBox(part, scale) : partGeometry(part);
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, mats.get(part.material, part.id));
    mesh.name = part.id;
    mesh.userData.part = part;
    const transparent = part.material === 'glass-clear';
    mesh.castShadow = !transparent && part.material !== 'led';
    mesh.receiveShadow = !transparent;
    if (transparent) mesh.renderOrder = 2;
    const centre = new THREE.Vector3(part.pos[0] + part.size[0] / 2, part.pos[1] + part.size[1] / 2, part.pos[2] + part.size[2] / 2);
    const pv = part.motion ? pivots.get(part.motion) : undefined;
    if (pv) {
      mesh.position.copy(centre.sub(pv.node.position));
      pv.node.add(mesh);
    } else {
      mesh.position.copy(centre);
      group.add(mesh);
    }
  }

  // LED light sources – a handful of point lights is affordable even in XR
  const lights: THREE.PointLight[] = [];
  for (const l of res.lights.slice(0, 6)) {
    const light = new THREE.PointLight(0xffc98a, 0.6, 0.9, 1.5);
    light.position.set(l.pos[0], l.pos[1] - 30, l.pos[2]);
    light.visible = ledOn;
    group.add(light);
    lights.push(light);
  }

  return {
    group,
    setOpen(amount: number) {
      for (const { node, motion } of pivots.values()) {
        if (motion.kind === 'hinge') {
          node.rotation.set(0, 0, 0);
          node.rotation[motion.axis] = motion.angle * amount;
        } else {
          node.position.set(motion.offset[0] * amount, motion.offset[1] * amount, motion.offset[2] * amount);
        }
      }
    },
    dispose() {
      for (const g of geos) g.dispose();
    },
  };
}
