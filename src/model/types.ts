// All lengths in millimetres.
// World coordinates: origin at floor / left outer edge / back outer edge.
// x → right, y → up, z → front.

export type FurnitureKind = 'vitrine' | 'sideboard' | 'custom';

/** Visible front surface. */
export type Surface = 'glass-clear' | 'matt-white' | 'matt-anthracite' | 'matt-fango' | 'oak';

/** How a compartment is closed. */
export type FrontKind = 'door' | 'double-door' | 'flap' | 'drawers' | 'open';

export type BaseKind = 'plinth' | 'skids' | 'feet' | 'wall';
export type GrainDir = 'vertical' | 'horizontal';
export type CornerJoint = 'miter' | 'butt';
export type ShelfMaterial = 'glass' | 'wood';
export type InteriorFinish = 'multiplex' | 'oak';
export type HingeSide = 'left' | 'right';
/**
 * overlay: Lago style – fronts cover the whole carcass incl. dividers and sit flush inside the
 *          projecting parquet cladding; only the thin cladding edge shows from the front.
 * inset:   fronts sit inside a visible oak frame (carcass + cladding edges with lipping).
 */
export type FrontStyle = 'overlay' | 'inset';
export type Lining = 'none' | 'parkett';

export interface Section {
  id: string;
  /** Clear inner height; null = share remaining height equally. */
  height: number | null;
  front: FrontKind;
  surface: Surface;
  hinge: HingeSide;
  drawers: number;
  shelves: number;
  shelfMaterial: ShelfMaterial;
  led: boolean;
}

export interface Column {
  id: string;
  /** Clear inner width; null = share remaining width equally. */
  width: number | null;
  /** Bottom to top. */
  sections: Section[];
}

export interface Tile {
  /** Left edge, measured from the left outer edge of the furniture. */
  x: number;
  /** Bottom edge, measured from the floor. */
  y: number;
}

export interface Applique {
  enabled: boolean;
  size: number;
  thickness: number;
  tiles: Tile[];
}

export interface Base {
  kind: BaseKind;
  /** Plinth / skid / foot height, or mounting height above floor for 'wall'. */
  height: number;
  /** How far a plinth or the feet are set back from the outer faces. */
  setback: number;
}

export interface Materials {
  /** Multiplex carcass thickness. */
  carcass: number;
  /** Rear panel thickness (Multiplex, set in a rebate). */
  back: number;
  /** Parquet plank thickness (cladding). */
  cladding: number;
  plankWidth: number;
  plankLength: number;
  /** Solid oak lipping on the visible front edges (cladding edge, or whole frame when inset). */
  edgeBand: number;
  frontStyle: FrontStyle;
  /** Parquet lining inside compartments with clear glass or open fronts (hides the Multiplex). */
  lining: Lining;
  liningThickness: number;
  sideGrain: GrainDir;
  topGrain: GrainDir;
  corner: CornerJoint;
  /** Gap around inset fronts. */
  frontGap: number;
  /** How far fronts sit behind the frame face. */
  frontSetback: number;
  /** Multiplex carrier behind matt glass fronts. */
  mattCarrier: number;
  mattGlass: number;
  clearGlass: number;
  /** Total thickness of a parquet-clad wooden front. */
  woodFront: number;
  shelfGlass: number;
  interior: InteriorFinish;
}

export interface FurnitureConfig {
  version: 1;
  name: string;
  kind: FurnitureKind;
  width: number;
  height: number;
  depth: number;
  base: Base;
  materials: Materials;
  columns: Column[];
  applique: Applique;
}

export interface Room {
  width: number;
  depth: number;
  height: number;
  wallColor: string;
  floor: 'oak' | 'concrete';
}

// ---------------------------------------------------------------------------
// Build output

export type PartGroup =
  | 'korpus'
  | 'rueckwand'
  | 'verkleidung'
  | 'auskleidung'
  | 'anleimer'
  | 'front'
  | 'glas'
  | 'boden'
  | 'schubkasten'
  | 'sockel'
  | 'applikation'
  | 'led';

export type MaterialKey =
  | 'multiplex'
  | 'oak-ply'
  | 'oak'
  | 'oak-solid'
  | 'endgrain'
  | 'glass-clear'
  | 'matt-white'
  | 'matt-anthracite'
  | 'matt-fango'
  | 'black'
  | 'steel'
  | 'led';

export type Vec3 = [number, number, number];

export type Axis = 'x' | 'y' | 'z';

export interface Cut {
  /** Along the grain (or the longer side if grain-less). */
  length: number;
  width: number;
  thickness: number;
  /** Edges cut at 45° (cladding with mitred corners). */
  miter?: string[];
}

export interface Part {
  id: string;
  name: string;
  group: PartGroup;
  material: MaterialKey;
  /** Min corner. */
  pos: Vec3;
  size: Vec3;
  /** Direction of the wood grain, used for texture mapping and cut lists. */
  grain?: Axis;
  cut?: Cut;
  /** Motion group this part moves with (door, drawer). */
  motion?: string;
  /** Column / section the part belongs to. */
  col?: number;
  sec?: number;
}

export type Motion =
  | { id: string; kind: 'hinge'; axis: 'x' | 'y'; pivot: Vec3; angle: number }
  | { id: string; kind: 'slide'; offset: Vec3 };

export interface Opening {
  col: number;
  sec: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Warning {
  level: 'info' | 'warn' | 'error';
  text: string;
}

export interface BuildResult {
  parts: Part[];
  motions: Motion[];
  openings: Opening[];
  /** LED light sources (centre of strip). */
  lights: { pos: Vec3; length: number }[];
  warnings: Warning[];
  /** Inner carcass extents, handy for dimension lines. */
  inner: { x: number; y: number; w: number; h: number; zFront: number; zBack: number };
}
