import * as THREE from 'three';
import type { MaterialKey } from '../model/types';
import { endgrainTexture, woodTexture, type WoodTextures } from './textures';

export interface MaterialLib {
  get(key: MaterialKey, partId: string): THREE.Material;
  /** Texture repeat size for wood-mapped materials (mm along / across grain); null for untextured. */
  woodScale(key: MaterialKey): [number, number] | null;
  setLed(on: boolean): void;
}

const ENDGRAIN_VARIANTS = 6;

export function createMaterials(): MaterialLib {
  const oak: WoodTextures = woodTexture({ seed: 11, light: [200, 150, 96], dark: [140, 94, 52], rings: 9, knots: 4 });
  const solid: WoodTextures = woodTexture({ seed: 23, light: [190, 140, 88], dark: [120, 78, 40], rings: 11, knots: 1 });
  const ply: WoodTextures = woodTexture({ seed: 31, light: [226, 204, 168], dark: [204, 176, 136], rings: 5, knots: 0 });

  const wood = (t: WoodTextures, roughness: number) =>
    new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 1.2, roughness, metalness: 0, vertexColors: true });

  const led = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffd49a, emissiveIntensity: 2.2 });

  const mats: Partial<Record<MaterialKey, THREE.Material>> = {
    oak: wood(oak, 0.78),
    'oak-ply': wood(oak, 0.8),
    'oak-solid': wood(solid, 0.75),
    multiplex: wood(ply, 0.85),
    'glass-clear': new THREE.MeshPhysicalMaterial({
      color: 0xf4fbf8,
      roughness: 0.03,
      metalness: 0,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      envMapIntensity: 1.6,
      specularIntensity: 1,
    }),
    'matt-white': new THREE.MeshPhysicalMaterial({ color: 0xe8e6e1, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.55 }),
    'matt-anthracite': new THREE.MeshPhysicalMaterial({ color: 0x3a3c3e, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.55 }),
    'matt-fango': new THREE.MeshPhysicalMaterial({ color: 0xa6988c, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.55 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.75 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.45, metalness: 0.7 }),
    'metal-alu': new THREE.MeshStandardMaterial({ color: 0xc9ccce, roughness: 0.35, metalness: 0.9 }),
    'metal-black': new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 }),
    'metal-bronze': new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.38, metalness: 0.85 }),
    led,
  };

  const endgrain = Array.from({ length: ENDGRAIN_VARIANTS }, (_, i) => {
    const t = endgrainTexture(101 + i * 17);
    return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 2, roughness: 0.85 });
  });

  return {
    get(key, partId) {
      if (key === 'endgrain') {
        const n = Number(partId.replace(/\D/g, '')) || 0;
        return endgrain[n % ENDGRAIN_VARIANTS];
      }
      return mats[key]!;
    },
    woodScale(key) {
      if (key === 'oak' || key === 'oak-ply') return oak.sizeMm;
      if (key === 'oak-solid') return solid.sizeMm;
      if (key === 'multiplex') return ply.sizeMm;
      return null;
    },
    setLed(on) {
      led.emissiveIntensity = on ? 2.2 : 0;
      led.color.set(on ? 0xfff1d6 : 0xbfbfbf);
    },
  };
}
