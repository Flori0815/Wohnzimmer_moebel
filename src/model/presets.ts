import type { Column, FurnitureConfig, Materials, Room, Section, Surface } from './types';

let counter = 0;
export function uid(prefix = 'id'): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

export const defaultMaterials: Materials = {
  carcass: 18,
  back: 9,
  cladding: 14,
  plankWidth: 190,
  plankLength: 2200,
  edgeBand: 5,
  frontStyle: 'overlay',
  lining: 'parkett',
  liningThickness: 10,
  sideGrain: 'vertical',
  topGrain: 'horizontal',
  corner: 'miter',
  frontGap: 3,
  frontSetback: 0,
  mattCarrier: 15,
  mattGlass: 4,
  clearGlass: 6,
  woodFront: 26,
  shelfGlass: 8,
  interior: 'multiplex',
};

export function section(partial: Partial<Section> = {}): Section {
  return {
    id: uid('s'),
    height: null,
    front: 'door',
    surface: 'matt-white',
    hinge: 'left',
    drawers: 2,
    shelves: 1,
    shelfMaterial: 'wood',
    led: false,
    ...partial,
  };
}

export function column(sections: Section[], width: number | null = null): Column {
  return { id: uid('c'), width, sections };
}

/** Standvitrine after the Lago "Standelement" (89 × 196 × 39), slimmer by default. */
export function vitrinePreset(surface: Surface = 'matt-white'): FurnitureConfig {
  return {
    version: 1,
    name: 'Standvitrine',
    kind: 'vitrine',
    width: 600,
    height: 1960,
    depth: 390,
    base: { kind: 'plinth', height: 60, setback: 40 },
    materials: { ...defaultMaterials },
    columns: [
      column([
        section({ height: 520, surface, hinge: 'right', shelves: 1 }),
        section({ height: null, surface: 'glass-clear', hinge: 'right', shelves: 2, shelfMaterial: 'glass', led: true }),
        section({ height: 520, surface, hinge: 'right', shelves: 1 }),
      ]),
    ],
    applique: { enabled: true, size: 180, thickness: 18, tiles: [{ x: 210, y: 900 }] },
  };
}

/** Sideboard after the Lago sideboard (175 × 81 × 49). */
export function sideboardPreset(surface: Surface = 'matt-fango'): FurnitureConfig {
  return {
    version: 1,
    name: 'Sideboard',
    kind: 'sideboard',
    width: 1750,
    height: 810,
    depth: 490,
    base: { kind: 'plinth', height: 50, setback: 40 },
    materials: { ...defaultMaterials },
    columns: [
      column([section({ surface, hinge: 'left', shelves: 1 })]),
      column([section({ surface: 'glass-clear', hinge: 'left', shelves: 1, shelfMaterial: 'glass', led: true })]),
      column([section({ surface, hinge: 'right', shelves: 1 })]),
    ],
    applique: {
      enabled: true,
      size: 176,
      thickness: 18,
      tiles: [
        { x: 787, y: 330 },
        { x: 967, y: 330 },
        { x: 1175, y: 330 },
      ],
    },
  };
}

export const defaultRoom: Room = {
  width: 4500,
  depth: 4000,
  height: 2600,
  wallColor: '#d9d6d0',
  floor: 'oak',
};
