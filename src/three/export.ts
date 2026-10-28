import type * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';

export function download(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export async function exportGLB(obj: THREE.Object3D): Promise<Blob> {
  const data = await new GLTFExporter().parseAsync(obj, { binary: true });
  return new Blob([data as ArrayBuffer], { type: 'model/gltf-binary' });
}

export async function exportUSDZ(obj: THREE.Object3D): Promise<Blob> {
  const data = await new USDZExporter().parseAsync(obj);
  return new Blob([data as BlobPart], { type: 'model/vnd.usdz+zip' });
}

export const isIOS = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Open AR Quick Look on iOS (Safari needs an <a rel="ar"> containing an <img>). */
export function openQuickLook(blob: Blob) {
  const a = document.createElement('a');
  a.rel = 'ar';
  a.href = URL.createObjectURL(blob);
  a.appendChild(document.createElement('img'));
  document.body.appendChild(a);
  a.click();
  a.remove();
}
