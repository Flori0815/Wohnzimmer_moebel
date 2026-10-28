import './style.css';
import { buildFurniture } from './model/build';
import type { BuildResult, FurnitureConfig, Room } from './model/types';
import { loadInitial, normalize, persist, shareUrl } from './state';
import { download, exportGLB, exportUSDZ, isIOS, openQuickLook } from './three/export';
import { Viewer } from './three/viewer';
import { detectXr, XrController } from './three/xr';
import { renderConstruction } from './construction/view';
import { button, h } from './ui/dom';
import { renderPanel, renderWarnings, type PanelHost } from './ui/panel';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const initial = loadInitial();
let config: FurnitureConfig = initial.config;
let room: Room = initial.room;
let result: BuildResult = buildFurniture(config);

const viewer = new Viewer($('viewport'));
const panelEl = $('panel');
const warningsEl = $('warnings');
const bauEl = $('bau');
let activeTab: 'konfig' | 'bau' = 'konfig';

let pending = 0;
function scheduleRebuild(panelToo: boolean) {
  if (panelToo) pendingPanel = true;
  if (pending) return;
  pending = requestAnimationFrame(() => {
    pending = 0;
    rebuild();
  });
}
let pendingPanel = false;

function rebuild() {
  result = buildFurniture(config);
  viewer.update(config, result, room);
  renderWarnings(warningsEl, result);
  if (pendingPanel) {
    pendingPanel = false;
    renderPanel(panelEl, host);
  }
  if (activeTab === 'bau') renderConstruction(bauEl, config, result);
  persist({ config, room });
  scheduleQuickLook();
}

// iOS only allows opening AR Quick Look directly from a tap, so the USDZ is prepared ahead of time.
let quickLook = false;
let quickLookBlob: Blob | null = null;
let quickLookTimer = 0;
function scheduleQuickLook() {
  if (!quickLook) return;
  quickLookBlob = null;
  clearTimeout(quickLookTimer);
  quickLookTimer = window.setTimeout(async () => {
    quickLookBlob = await exportUSDZ(viewer.exportObject());
  }, 800);
}

const host: PanelHost = {
  get config() {
    return config;
  },
  get room() {
    return room;
  },
  get result() {
    return result;
  },
  changed: () => scheduleRebuild(false),
  restructured: () => scheduleRebuild(true),
  setConfig(cfg) {
    config = cfg;
    scheduleRebuild(true);
    requestAnimationFrame(() => viewer.frame());
  },
  roomChanged: () => scheduleRebuild(false),
};

renderPanel(panelEl, host);
rebuild();

// --- toolbar -----------------------------------------------------------------------
const bindCheck = (id: string, key: 'dimensions' | 'led' | 'room') => {
  const el = $<HTMLInputElement>(id);
  el.checked = viewer.options[key];
  el.addEventListener('change', () => viewer.setOptions({ [key]: el.checked }));
};
bindCheck('opt-dims', 'dimensions');
bindCheck('opt-led', 'led');
bindCheck('opt-room', 'room');
const openEl = $<HTMLInputElement>('opt-open');
openEl.addEventListener('input', () => viewer.setOptions({ open: parseFloat(openEl.value) }));
$('btn-frame').addEventListener('click', () => viewer.frame());

// --- tabs ----------------------------------------------------------------------------
for (const tab of document.querySelectorAll<HTMLButtonElement>('.tab')) {
  tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab as 'konfig' | 'bau';
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    $('stage').hidden = activeTab !== 'konfig';
    panelEl.hidden = activeTab !== 'konfig';
    bauEl.hidden = activeTab !== 'bau';
    viewer.paused = activeTab !== 'konfig';
    if (activeTab === 'bau') renderConstruction(bauEl, config, result);
  });
}

// --- toast -----------------------------------------------------------------------------
let toastTimer = 0;
function toast(text: string) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 3500);
}

async function guarded(fn: () => Promise<void>) {
  toast('Export läuft …');
  try {
    await fn();
  } catch (e) {
    console.error(e);
    toast(`Export fehlgeschlagen: ${(e as Error).message}`);
  }
}

// --- save / export menu -------------------------------------------------------------
const menu = $('menu');
const fileName = (ext: string) => `${(config.name || 'moebel').replace(/[^\wäöüÄÖÜß-]+/g, '_')}.${ext}`;
const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  try {
    const s = normalize(JSON.parse(await f.text()));
    if (!s) throw new Error('kein gültiges Format');
    config = s.config;
    room = s.room;
    scheduleRebuild(true);
    requestAnimationFrame(() => viewer.frame());
    toast('Konfiguration geladen.');
  } catch (e) {
    toast(`Laden fehlgeschlagen: ${(e as Error).message}`);
  }
  fileInput.value = '';
});
document.body.append(fileInput);

menu.append(
  button('Link zum Teilen kopieren', async () => {
    const url = shareUrl({ config, room });
    try {
      await navigator.clipboard.writeText(url);
      toast('Link kopiert – enthält die komplette Konfiguration.');
    } catch {
      window.prompt('Link kopieren:', url);
    }
  }),
  button('Konfiguration speichern (.json)', () =>
    download(new Blob([JSON.stringify({ config, room }, null, 2)], { type: 'application/json' }), fileName('json')),
  ),
  button('Konfiguration laden (.json)', () => fileInput.click()),
  button('3D-Modell exportieren (.glb)', () => guarded(async () => download(await exportGLB(viewer.exportObject()), fileName('glb')))),
  button('3D-Modell für AR Quick Look (.usdz)', () => guarded(async () => download(await exportUSDZ(viewer.exportObject()), fileName('usdz')))),
  button('Bild speichern (.png)', async () => download(await (await fetch(viewer.screenshot())).blob(), fileName('png'))),
);
menu.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button')) menu.hidden = true;
});
$('btn-menu').addEventListener('click', (e) => {
  e.stopPropagation();
  menu.hidden = !menu.hidden;
});
document.addEventListener('click', (e) => {
  if (!menu.contains(e.target as Node)) menu.hidden = true;
});

// --- XR -------------------------------------------------------------------------------
const overlay = $('xr-overlay');
const xr = new XrController(viewer, overlay, (state, hint) => {
  overlay.hidden = state !== 'ar';
  $('xr-hint').textContent = hint ?? '';
});
$('xr-left').addEventListener('click', () => xr.rotate(15));
$('xr-right').addEventListener('click', () => xr.rotate(-15));
$('xr-doors').addEventListener('click', () => viewer.toggleDoors());
$('xr-exit').addEventListener('click', () => xr.end());
$('xr-scale').addEventListener('click', () => xr.resetScale());
$('xr-replace').addEventListener('click', () => xr.replace());

detectXr().then((s) => {
  const ar = $('btn-ar');
  const vr = $('btn-vr');
  ar.hidden = !s.ar;
  vr.hidden = !s.vr;
  ar.addEventListener('click', () => xr.startAR().catch((e) => toast(`AR nicht möglich: ${e.message}`)));
  vr.addEventListener('click', () => xr.startVR().catch((e) => toast(`VR nicht möglich: ${e.message}`)));
  if (!s.ar && isIOS()) {
    const ql = $('btn-ql');
    ql.hidden = false;
    quickLook = true;
    scheduleQuickLook();
    ql.addEventListener('click', () => {
      if (quickLookBlob) openQuickLook(quickLookBlob);
      else toast('3D-Modell wird noch vorbereitet – gleich nochmal tippen.');
    });
  }
});
