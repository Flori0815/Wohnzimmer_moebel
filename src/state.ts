import { defaultRoom, sideboardPreset, vitrinePreset } from './model/presets';
import type { FurnitureConfig, Room } from './model/types';

const STORAGE_KEY = 'lago-konfigurator-v1';

export interface Saved {
  config: FurnitureConfig;
  room: Room;
}

function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64decode(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Fill in fields missing from older saves with preset defaults. */
export function normalize(raw: unknown): Saved | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Saved> & Partial<FurnitureConfig>;
  const cfg = (r.config ?? (r.columns ? r : null)) as FurnitureConfig | null;
  if (!cfg || !Array.isArray(cfg.columns)) return null;
  const base = cfg.kind === 'sideboard' ? sideboardPreset() : vitrinePreset();
  const config: FurnitureConfig = {
    ...base,
    ...cfg,
    base: { ...base.base, ...cfg.base },
    materials: { ...base.materials, ...cfg.materials },
    applique: { ...base.applique, ...cfg.applique },
  };
  return { config, room: { ...defaultRoom, ...(r.room ?? {}) } };
}

export function shareUrl(s: Saved): string {
  const url = new URL(window.location.href);
  url.hash = `c=${b64encode(JSON.stringify(s))}`;
  return url.toString();
}

export function loadInitial(): Saved {
  const m = /[#&]c=([^&]+)/.exec(window.location.hash);
  if (m) {
    try {
      const s = normalize(JSON.parse(b64decode(m[1])));
      if (s) return s;
    } catch {
      /* ignore broken links */
    }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = normalize(JSON.parse(raw));
      if (s) return s;
    }
  } catch {
    /* storage unavailable */
  }
  return { config: vitrinePreset(), room: { ...defaultRoom } };
}

export function persist(s: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
