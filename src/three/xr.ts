import * as THREE from 'three';
import { pinchTwist, snapScale, twoFinger, type TwoFinger } from './gestures';
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
 * AR: furniture is placed on a detected floor via hit-test (tap). Afterwards one finger drags it
 *     over the floor, two fingers pinch to scale and twist to rotate; buttons rotate / reset.
 * VR: the virtual room is shown 1:1, the user starts ~1.8 m in front of the furniture;
 *     the controller trigger opens/closes the doors.
 */
export class XrController {
  private session: XRSession | null = null;
  private hitSource: XRHitTestSource | null = null;
  private readonly reticle: THREE.Mesh;
  private controllers: THREE.Group[] = [];
  private placed = false;
  private readonly raycaster = new THREE.Raycaster();
  private drag: { offset: THREE.Vector3 } | null = null;
  private pinch: { start: TwoFinger; base: { scale: number; yaw: number } } | null = null;

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

    // Taps on buttons never place; once placed, touches are gestures, not "place here".
    overlay.addEventListener('beforexrselect', (e) => {
      if ((e.target as HTMLElement).closest('button') || this.placed) e.preventDefault();
    });
    const layer = overlay.querySelector<HTMLElement>('.xr-gesture') ?? overlay;
    layer.addEventListener('touchstart', (e) => this.touch(e), { passive: false });
    layer.addEventListener('touchmove', (e) => this.touch(e), { passive: false });
    layer.addEventListener('touchend', (e) => this.touch(e), { passive: false });
    layer.addEventListener('touchcancel', (e) => this.touch(e), { passive: false });
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
    this.viewer.anchor.scale.setScalar(1);
    this.placed = false;
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

  /** Back to real size. */
  resetScale() {
    this.viewer.anchor.scale.setScalar(1);
    this.hint();
  }

  /** Hide the furniture and show the reticle again to place it anew. */
  replace() {
    this.placed = false;
    this.drag = this.pinch = null;
    this.viewer.anchor.visible = false;
    this.onState('ar', 'Kamera auf den Boden richten, Ring erscheint – tippen zum Platzieren.');
  }

  private hint() {
    const pct = Math.round(this.viewer.anchor.scale.x * 100);
    this.onState('ar', `1 Finger: verschieben · 2 Finger: zoomen & drehen · Maßstab ${pct} %${pct === 100 ? ' (Originalgröße)' : ''}`);
  }

  /** Point on the floor plane (at the furniture's height) under a screen position. */
  private floorPoint(x: number, y: number): THREE.Vector3 | null {
    const xrCam = this.viewer.renderer.xr.getCamera();
    const cam = xrCam.cameras?.[0] ?? xrCam;
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, cam);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.viewer.anchor.position.y);
    return this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  }

  private touch(e: TouchEvent) {
    if (!this.session || !this.placed) return;
    e.preventDefault();
    const anchor = this.viewer.anchor;
    const t = e.touches;
    if (e.type === 'touchstart' || e.type === 'touchend' || e.type === 'touchcancel') {
      // (re)start the gesture with whatever fingers remain on the screen
      this.drag = null;
      this.pinch = null;
      if (t.length === 1) {
        const p = this.floorPoint(t[0].clientX, t[0].clientY);
        if (p) this.drag = { offset: anchor.position.clone().sub(p) };
      } else if (t.length >= 2) {
        this.pinch = {
          start: twoFinger({ x: t[0].clientX, y: t[0].clientY }, { x: t[1].clientX, y: t[1].clientY }),
          base: { scale: anchor.scale.x, yaw: anchor.rotation.y },
        };
      } else {
        anchor.scale.setScalar(snapScale(anchor.scale.x));
        this.hint();
      }
      return;
    }
    if (this.pinch && t.length >= 2) {
      const now = twoFinger({ x: t[0].clientX, y: t[0].clientY }, { x: t[1].clientX, y: t[1].clientY });
      const r = pinchTwist(this.pinch.start, now, this.pinch.base);
      anchor.scale.setScalar(r.scale);
      anchor.rotation.y = r.yaw;
      this.hint();
    } else if (this.drag && t.length === 1) {
      const p = this.floorPoint(t[0].clientX, t[0].clientY);
      if (p) anchor.position.set(p.x + this.drag.offset.x, anchor.position.y, p.z + this.drag.offset.z);
    }
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
    this.placed = true;
    this.hint();
  }

  private frame(frame?: XRFrame) {
    if (!frame || !this.hitSource) return;
    if (this.placed) {
      this.reticle.visible = false;
      return;
    }
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
    this.placed = false;
    this.drag = this.pinch = null;
    this.viewer.anchor.visible = true;
    this.viewer.anchor.scale.setScalar(1);
    this.viewer.setXrMode('none');
    this.onState('none');
  }
}
