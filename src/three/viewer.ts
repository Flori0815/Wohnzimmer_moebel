import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { BuildResult, FurnitureConfig, Room } from '../model/types';
import { buildDimensions } from './dimensions';
import { buildFurnitureView, MM, type FurnitureView } from './furniture';
import { createMaterials, type MaterialLib } from './materials';
import { floorTexture } from './textures';

export interface ViewOptions {
  dimensions: boolean;
  open: number;
  led: boolean;
  room: boolean;
  /** Furniture offset along the back wall (mm, 0 = centred). */
  offsetX: number;
}

/**
 * Scene graph:
 *   scene
 *   └─ world            (shifted as a whole in VR so the user starts in front of the furniture)
 *      ├─ room          (floor + walls facing inwards)
 *      └─ anchor        (footprint centre of the furniture, on the floor; moved in AR)
 *         └─ furniture  (scaled mm → m, origin = back-left-floor corner)
 */
export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly world = new THREE.Group();
  readonly anchor = new THREE.Group();
  readonly mats: MaterialLib;
  private readonly roomGroup = new THREE.Group();
  private readonly holder = new THREE.Group();
  private view: FurnitureView | null = null;
  private dims: THREE.Group | null = null;
  private cfg: FurnitureConfig | null = null;
  private room: Room | null = null;
  private opts: ViewOptions = { dimensions: true, open: 0, led: true, room: true, offsetX: 0 };
  private openCurrent = 0;
  private readonly sun: THREE.DirectionalLight;
  private readonly background = new THREE.Color(0xe9e6e1);
  private framed = false;
  /** Called every frame (desktop and XR) – used by the XR module. */
  onFrame: ((frame?: XRFrame) => void) | null = null;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.xr.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.scene.background = this.background;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.02, 60);
    this.camera.position.set(1.2, 1.4, 2.6);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.52;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 8;

    this.scene.add(new THREE.HemisphereLight(0xfffdf8, 0x9a8f80, 0.9));
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    this.sun.position.set(-2.5, 3.5, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -3;
    this.sun.shadow.camera.right = 3;
    this.sun.shadow.camera.top = 3;
    this.sun.shadow.camera.bottom = -3;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.01;
    this.scene.add(this.sun);

    this.scene.add(this.world);
    this.world.add(this.roomGroup, this.anchor);
    this.anchor.add(this.holder);

    this.mats = createMaterials();

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop((_t, frame) => this.tick(frame));
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0 || this.renderer.xr.isPresenting) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Skip rendering while the 3D view is hidden (construction tab). */
  paused = false;

  private tick(frame?: XRFrame) {
    if (this.paused && !this.renderer.xr.isPresenting) return;
    // ease door animation
    const target = this.opts.open;
    if (Math.abs(this.openCurrent - target) > 0.001) {
      this.openCurrent += (target - this.openCurrent) * 0.18;
      this.view?.setOpen(this.openCurrent);
    }
    this.onFrame?.(frame);
    if (!this.renderer.xr.isPresenting) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  setOptions(o: Partial<ViewOptions>) {
    const prev = this.opts;
    this.opts = { ...this.opts, ...o };
    this.applyVisibility();
    if (prev.led !== this.opts.led) this.mats.setLed(this.opts.led);
    if (prev.offsetX !== this.opts.offsetX || prev.led !== this.opts.led) this.refresh();
  }

  get options(): ViewOptions {
    return this.opts;
  }

  /** Animate doors to fully open / closed. */
  toggleDoors() {
    this.setOptions({ open: this.opts.open > 0.5 ? 0 : 1 });
  }

  update(cfg: FurnitureConfig, res: BuildResult, room: Room) {
    const roomChanged = JSON.stringify(room) !== JSON.stringify(this.room);
    this.cfg = cfg;
    this.room = room;
    if (roomChanged) this.buildRoom(room);
    this.rebuildFurniture(res);
    if (!this.framed) {
      this.frame();
      this.framed = true;
    }
  }

  private lastRes: BuildResult | null = null;

  private refresh() {
    if (this.lastRes) this.rebuildFurniture(this.lastRes);
  }

  private rebuildFurniture(res: BuildResult) {
    const cfg = this.cfg!;
    const room = this.room!;
    this.lastRes = res;
    if (this.view) {
      this.holder.remove(this.view.group);
      this.view.dispose();
    }
    if (this.dims) {
      this.holder.remove(this.dims);
      disposeTree(this.dims);
    }
    this.view = buildFurnitureView(res, this.mats, this.opts.led);
    this.view.setOpen(this.openCurrent);
    this.holder.add(this.view.group);
    this.dims = buildDimensions(cfg, res);
    this.dims.scale.setScalar(MM);
    this.holder.add(this.dims);
    this.applyVisibility();

    // holder: furniture origin (back-left corner) relative to the footprint centre
    this.holder.position.set((-cfg.width / 2) * MM, 0, (-cfg.depth / 2) * MM);
    if (!this.renderer.xr.isPresenting || this.xrMode === 'vr') this.placeInRoom(cfg, room);
  }

  /** Where the furniture stands in room mode: against the back wall. */
  placeInRoom(cfg = this.cfg!, room = this.room!) {
    const halfW = (room.width / 2 - cfg.width / 2) * MM;
    const x = THREE.MathUtils.clamp(this.opts.offsetX * MM, -Math.max(0, halfW), Math.max(0, halfW));
    this.anchor.position.set(x, 0, (-room.depth / 2 + cfg.depth / 2 + 10) * MM);
    this.anchor.rotation.set(0, 0, 0);
  }

  xrMode: 'none' | 'ar' | 'vr' = 'none';

  /** Single place that decides what is shown – AR must never show the virtual room. */
  private applyVisibility() {
    const v = sceneVisibility(this.xrMode, this.opts);
    this.roomGroup.visible = v.room;
    this.scene.background = v.background ? this.background : null;
    if (this.dims) this.dims.visible = v.dimensions;
  }

  setXrMode(mode: 'none' | 'ar' | 'vr') {
    this.xrMode = mode;
    this.applyVisibility();
    if (mode === 'none') {
      this.world.position.set(0, 0, 0);
      this.placeInRoom();
    }
  }

  private buildRoom(room: Room) {
    disposeTree(this.roomGroup);
    this.roomGroup.clear();
    const w = room.width * MM;
    const d = room.depth * MM;
    const h = room.height * MM;
    const floorTex = floorTexture(room.floor);
    floorTex.repeat.set(w / 4, d / 1);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: room.floor === 'oak' ? 0.7 : 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = 'boden';
    this.roomGroup.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: room.wallColor, roughness: 0.95 });
    const wall = (width: number, x: number, z: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(width, h), wallMat);
      m.position.set(x, h / 2, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      this.roomGroup.add(m);
    };
    // Planes face inwards; from outside the room they are back-face culled and vanish.
    wall(w, 0, -d / 2, 0);
    wall(w, 0, d / 2, Math.PI);
    wall(d, -w / 2, 0, Math.PI / 2);
    wall(d, w / 2, 0, -Math.PI / 2);

    const skirting = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.012), new THREE.MeshStandardMaterial({ color: 0xf2f0ec, roughness: 0.6 }));
    skirting.position.set(0, 0.03, -d / 2 + 0.006);
    skirting.receiveShadow = true;
    this.roomGroup.add(skirting);
  }

  /** Footprint of the current furniture in metres. */
  footprint(): { width: number; depth: number } {
    return { width: (this.cfg?.width ?? 0) * MM, depth: (this.cfg?.depth ?? 0) * MM };
  }

  /** Point the orbit camera at the furniture. */
  frame() {
    const cfg = this.cfg;
    if (!cfg) return;
    const target = new THREE.Vector3();
    this.anchor.getWorldPosition(target);
    target.y = (cfg.height / 2) * MM;
    const size = Math.max(cfg.width, cfg.height) * MM;
    const dist = size / (2 * Math.tan((this.camera.fov * Math.PI) / 360)) + 0.9;
    this.controls.target.copy(target);
    this.camera.position.set(target.x + dist * 0.35, target.y + dist * 0.18, target.z + dist);
    this.controls.update();
  }

  /** Detached copy of the furniture for export (metres, origin at footprint centre). */
  exportObject(): THREE.Object3D {
    const root = new THREE.Group();
    root.name = this.cfg?.name ?? 'Moebel';
    const copy = this.holder.clone(true);
    copy.children = copy.children.filter((c) => c.name !== 'masse');
    copy.traverse((o) => {
      if ((o as THREE.Light).isLight) o.removeFromParent();
    });
    root.add(copy);
    root.updateMatrixWorld(true);
    return root;
  }

  screenshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}

/** What is visible for a given XR mode (pure, unit-tested). */
export function sceneVisibility(mode: 'none' | 'ar' | 'vr', opts: Pick<ViewOptions, 'room' | 'dimensions'>) {
  return {
    room: mode !== 'ar' && opts.room,
    background: mode !== 'ar',
    dimensions: mode === 'none' && opts.dimensions,
  };
}

function disposeTree(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = (mesh as { material?: THREE.Material }).material;
    if (mat && (mat as THREE.SpriteMaterial).map && (o as THREE.Sprite).isSprite) {
      (mat as THREE.SpriteMaterial).map!.dispose();
      mat.dispose();
    }
  });
}
