import * as THREE from 'three';
import type { Viewer } from './viewer';

export interface XrSupport {
  ar: boolean;
  vr: boolean;
}

export async function detectXr(): Promise<XrSupport> {
  const xr = navigator.xr;
  if (!xr || !window.isSecureContext) return { ar: false, vr: false };
  const [ar, vr] = await Promise.all([
    xr.isSessionSupported('immersive-ar').catch(() => false),
    xr.isSessionSupported('immersive-vr').catch(() => false),
  ]);
  return { ar, vr };
}

/**
 * AR: furniture is placed on a detected floor via hit-test; tap to place, buttons to rotate.
 * VR: the virtual room is shown 1:1, the user starts ~1.8 m in front of the furniture;
 *     the controller trigger opens/closes the doors.
 */
export class XrController {
  private session: XRSession | null = null;
  private hitSource: XRHitTestSource | null = null;
  private readonly reticle: THREE.Mesh;
  private controllers: THREE.Group[] = [];

  constructor(
    private readonly viewer: Viewer,
    private readonly overlay: HTMLElement,
    private readonly onState: (state: 'none' | 'ar' | 'vr', hint?: string) => void,
  ) {
    const ring = new THREE.RingGeometry(0.12, 0.15, 40).rotateX(-Math.PI / 2);
    this.reticle = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    viewer.scene.add(this.reticle);
    viewer.onFrame = (frame) => this.frame(frame);
  }

  get active(): boolean {
    return this.session !== null;
  }

  async startAR() {
    const xr = navigator.xr!;
    const session = await xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor'],
      domOverlay: { root: this.overlay },
    });
    const r = this.viewer.renderer;
    r.xr.setReferenceSpaceType('local');
    // Hide the virtual room before the first AR frame is drawn.
    this.viewer.setXrMode('ar');
    this.viewer.anchor.visible = false;
    try {
      await r.xr.setSession(session);
    } catch (e) {
      this.viewer.anchor.visible = true;
      this.viewer.setXrMode('none');
      throw e;
    }
    this.session = session;
    const viewerSpace = await session.requestReferenceSpace('viewer');
    this.hitSource = (await session.requestHitTestSource?.({ space: viewerSpace })) ?? null;
    session.addEventListener('select', () => this.placeAtReticle());
    session.addEventListener('end', () => this.ended());
    this.onState('ar', 'Kamera auf den Boden richten, Ring erscheint – tippen zum Platzieren.');
  }

  async startVR() {
    const xr = navigator.xr!;
    const session = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    const r = this.viewer.renderer;
    r.xr.setReferenceSpaceType('local-floor');
    await r.xr.setSession(session);
    this.session = session;
    this.viewer.setXrMode('vr');
    // Start 1.8 m in front of the furniture front, looking at it (viewer looks along −z).
    const a = this.viewer.anchor.position;
    const halfDepth = this.viewer.footprint().depth / 2;
    this.viewer.world.position.set(-a.x, 0, -1.8 - a.z - halfDepth);
    if (this.controllers.length === 0) {
      for (let i = 0; i < 2; i++) {
        const c = r.xr.getController(i);
        c.addEventListener('select', () => this.viewer.toggleDoors());
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
          new THREE.LineBasicMaterial({ color: 0xffffff }),
        );
        line.scale.z = 2;
        c.add(line);
        this.controllers.push(c);
      }
    }
    for (const c of this.controllers) this.viewer.scene.add(c);
    session.addEventListener('end', () => this.ended());
    this.onState('vr');
  }

  async end() {
    await this.session?.end();
  }

  rotate(deg: number) {
    this.viewer.anchor.rotation.y += (deg * Math.PI) / 180;
  }

  private placeAtReticle() {
    if (!this.reticle.visible) return;
    const p = new THREE.Vector3().setFromMatrixPosition(this.reticle.matrix);
    const anchor = this.viewer.anchor;
    anchor.position.copy(p);
    // Face the viewer
    const cam = this.viewer.renderer.xr.getCamera();
    const cp = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    anchor.rotation.set(0, Math.atan2(cp.x - p.x, cp.z - p.z), 0);
    anchor.visible = true;
    this.onState('ar', 'Erneut tippen zum Versetzen. Drehen mit den Pfeilen.');
  }

  private frame(frame?: XRFrame) {
    if (!frame || !this.hitSource) return;
    const ref = this.viewer.renderer.xr.getReferenceSpace();
    if (!ref) return;
    const hits = frame.getHitTestResults(this.hitSource);
    if (hits.length > 0) {
      const pose = hits[0].getPose(ref);
      if (pose) {
        this.reticle.visible = true;
        this.reticle.matrix.fromArray(pose.transform.matrix);
        return;
      }
    }
    this.reticle.visible = false;
  }

  private ended() {
    this.hitSource?.cancel();
    this.hitSource = null;
    this.session = null;
    this.reticle.visible = false;
    for (const c of this.controllers) c.removeFromParent();
    this.viewer.anchor.visible = true;
    this.viewer.setXrMode('none');
    this.onState('none');
  }
}
