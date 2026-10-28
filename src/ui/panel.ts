import { column, section, sideboardPreset, vitrinePreset } from '../model/presets';
import type { BaseKind, BuildResult, Column, FrontKind, FurnitureConfig, Room, Section, Surface } from '../model/types';
import { autoField, button, checkField, h, numberField, selectField } from './dom';

export const SURFACES: [Surface, string][] = [
  ['matt-white', 'Mattglas weiß'],
  ['matt-anthracite', 'Mattglas anthrazit'],
  ['matt-fango', 'Mattglas fango'],
  ['glass-clear', 'Klarglas (Vitrine)'],
  ['oak', 'Parkett Eiche'],
];

export const FRONTS: [FrontKind, string][] = [
  ['door', 'Tür'],
  ['double-door', 'Doppeltür'],
  ['flap', 'Klappe'],
  ['drawers', 'Schubkästen'],
  ['open', 'offen'],
];

const BASES: [BaseKind, string][] = [
  ['plinth', 'Sockel zurückgesetzt'],
  ['skids', 'Metallkufen'],
  ['feet', 'Füße'],
  ['wall', 'wandhängend'],
];

export interface PanelHost {
  config: FurnitureConfig;
  room: Room;
  result: BuildResult;
  /** Value changed – rebuild 3D, keep panel. */
  changed(): void;
  /** Structure changed – rebuild 3D and panel. */
  restructured(): void;
  setConfig(cfg: FurnitureConfig): void;
  roomChanged(): void;
}

const openSections = new Set<string>(['masse', 'aufteilung']);

function group(key: string, title: string, ...content: (HTMLElement | null)[]): HTMLElement {
  const d = h('details', { open: openSections.has(key) }, h('summary', {}, title), h('div', { class: 'group-body' }, ...content));
  d.addEventListener('toggle', () => (d.open ? openSections.add(key) : openSections.delete(key)));
  return d;
}

export function renderPanel(root: HTMLElement, host: PanelHost) {
  const cfg = host.config;
  const m = cfg.materials;
  const set = <T>(fn: (v: T) => void, structural = false) => (v: T) => {
    fn(v);
    if (structural) host.restructured();
    else host.changed();
  };

  const presets = h(
    'div',
    { class: 'presets' },
    button('Standvitrine', () => host.setConfig(vitrinePreset()), 'chip', 'Vorlage nach Lago-Standelement'),
    button('Sideboard', () => host.setConfig(sideboardPreset()), 'chip', 'Vorlage nach Lago-Sideboard 175 × 81 × 49'),
  );

  const name = h('input', { type: 'text', value: cfg.name, 'aria-label': 'Name' });
  name.addEventListener('input', () => {
    cfg.name = name.value;
    host.changed();
  });

  const masse = group(
    'masse',
    'Außenmaße',
    h('div', { class: 'grid3' },
      numberField('Breite', cfg.width, set((v) => (cfg.width = v)), { min: 300, max: 4000, step: 10, unit: 'mm' }),
      numberField('Höhe', cfg.height, set((v) => (cfg.height = v)), { min: 300, max: 2600, step: 10, unit: 'mm' }),
      numberField('Tiefe', cfg.depth, set((v) => (cfg.depth = v)), { min: 250, max: 800, step: 5, unit: 'mm' }),
    ),
    h('div', { class: 'grid3' },
      selectField('Unterbau', cfg.base.kind, BASES, set((v: BaseKind) => (cfg.base.kind = v), true)),
      numberField(cfg.base.kind === 'wall' ? 'Abstand Boden' : 'Höhe', cfg.base.height, set((v) => (cfg.base.height = v)), { min: 0, max: 1500, step: 5, unit: 'mm' }),
      cfg.base.kind === 'wall' ? null : numberField('Rücksprung', cfg.base.setback, set((v) => (cfg.base.setback = v)), { min: 0, max: 200, step: 5, unit: 'mm' }),
    ),
  );

  // --- columns and compartments --------------------------------------------
  const colWidth = (ci: number) => host.result.openings.find((o) => o.col === ci)?.w;
  const secHeight = (ci: number, si: number) => host.result.openings.find((o) => o.col === ci && o.sec === si)?.h;

  const sectionCard = (col: Column, ci: number, sec: Section, si: number) => {
    const n = col.sections.length;
    const pos = n === 1 ? '' : si === 0 ? ' (unten)' : si === n - 1 ? ' (oben)' : '';
    const fields: (HTMLElement | null)[] = [
      autoField('Lichte Höhe', sec.height, secHeight(ci, si), set((v: number) => (sec.height = v)), set((v: number | null) => (sec.height = v), true), { min: 80 }),
      selectField('Front', sec.front, FRONTS, set((v: FrontKind) => (sec.front = v), true)),
      sec.front === 'open' ? null : selectField('Oberfläche', sec.surface, SURFACES, set((v: Surface) => (sec.surface = v), true)),
      sec.front === 'door' ? selectField('Anschlag', sec.hinge, [['left', 'links'], ['right', 'rechts']], set((v: 'left' | 'right') => (sec.hinge = v), true)) : null,
      sec.front === 'drawers' ? numberField('Anzahl', sec.drawers, set((v) => (sec.drawers = Math.round(v))), { min: 1, max: 6 }) : null,
      sec.front === 'drawers' ? null : numberField('Einlegeböden', sec.shelves, set((v) => (sec.shelves = Math.round(v))), { min: 0, max: 8 }),
      sec.front === 'drawers' || sec.shelves === 0 ? null : selectField('Bodenmaterial', sec.shelfMaterial, [['glass', 'Glas 8 mm'], ['wood', 'Holz']], set((v: 'glass' | 'wood') => (sec.shelfMaterial = v), true)),
      checkField('LED-Beleuchtung', sec.led, set((v: boolean) => (sec.led = v), true)),
    ];
    return h(
      'div',
      { class: 'card section' },
      h('div', { class: 'card-head' },
        h('strong', {}, `Fach ${si + 1}${pos}`),
        h('span', { class: 'actions' },
          button('+ darüber', () => { col.sections.splice(si + 1, 0, section({ surface: sec.surface })); host.restructured(); }, 'mini', 'Neues Fach darüber einfügen'),
          n > 1 ? button('✕', () => { col.sections.splice(si, 1); host.restructured(); }, 'mini danger', 'Fach entfernen') : null,
        ),
      ),
      h('div', { class: 'grid2' }, ...fields),
    );
  };

  const columnCard = (col: Column, ci: number) => {
    const n = cfg.columns.length;
    const move = (d: number) => {
      const [c] = cfg.columns.splice(ci, 1);
      cfg.columns.splice(ci + d, 0, c);
      host.restructured();
    };
    // show top compartment first, like looking at the furniture
    const secs = col.sections.map((s, si) => sectionCard(col, ci, s, si)).reverse();
    return h(
      'div',
      { class: 'card column' },
      h('div', { class: 'card-head' },
        h('strong', {}, `Spalte ${ci + 1}`),
        h('span', { class: 'actions' },
          ci > 0 ? button('←', () => move(-1), 'mini', 'nach links') : null,
          ci < n - 1 ? button('→', () => move(1), 'mini', 'nach rechts') : null,
          n > 1 ? button('✕', () => { cfg.columns.splice(ci, 1); host.restructured(); }, 'mini danger', 'Spalte entfernen') : null,
        ),
      ),
      autoField('Lichte Breite', col.width, colWidth(ci), set((v: number) => (col.width = v)), set((v: number | null) => (col.width = v), true), { min: 100 }),
      ...secs,
    );
  };

  const aufteilung = group(
    'aufteilung',
    'Aufteilung & Fronten',
    h('p', { class: 'hint' }, 'Spalten von links nach rechts, Fächer von oben nach unten. „auto“ teilt den Rest gleichmäßig auf.'),
    ...cfg.columns.map(columnCard),
    button('+ Spalte', () => { cfg.columns.push(column([section()])); host.restructured(); }, 'wide'),
  );

  // --- appliqué ----------------------------------------------------------------
  const a = cfg.applique;
  const band = { count: 3, x: Math.round(cfg.width / 2 - 270), y: Math.round(cfg.height / 2 - 90), gap: 4 };
  const applik = group(
    'applik',
    'Hirnholz-Applikation',
    checkField('Hirnholz-Kacheln anzeigen', a.enabled, set((v: boolean) => (a.enabled = v), true)),
    h('div', { class: 'grid2' },
      numberField('Kachelgröße', a.size, set((v) => (a.size = v)), { min: 40, max: 600, unit: 'mm' }),
      numberField('Stärke', a.thickness, set((v) => (a.thickness = v)), { min: 5, max: 60, unit: 'mm' }),
    ),
    ...a.tiles.map((t, i) =>
      h('div', { class: 'tile-row' },
        h('span', {}, `#${i + 1}`),
        numberField('x', t.x, set((v) => (t.x = v)), { step: 1, unit: 'mm' }),
        numberField('y', t.y, set((v) => (t.y = v)), { step: 1, unit: 'mm' }),
        button('✕', () => { a.tiles.splice(i, 1); host.restructured(); }, 'mini danger'),
      ),
    ),
    button('+ Kachel', () => { a.tiles.push({ x: Math.round(cfg.width / 2 - a.size / 2), y: Math.round(cfg.height / 2) }); host.restructured(); }, 'wide'),
    h('p', { class: 'hint' }, 'x = Abstand linke Außenkante → Kachel, y = Boden → Unterkante. Kacheln sollten jeweils ganz auf einer Front sitzen (Warnung sonst).'),
    h('div', { class: 'band' },
      h('strong', {}, 'Band erzeugen'),
      h('div', { class: 'grid2' },
        numberField('Anzahl', band.count, (v) => (band.count = Math.round(v)), { min: 1, max: 12 }),
        numberField('Fuge', band.gap, (v) => (band.gap = v), { min: 0, max: 200, unit: 'mm' }),
        numberField('Start x', band.x, (v) => (band.x = v), { unit: 'mm' }),
        numberField('y', band.y, (v) => (band.y = v), { unit: 'mm' }),
      ),
      button('Band ersetzen', () => {
        a.enabled = true;
        a.tiles = Array.from({ length: band.count }, (_, i) => ({ x: band.x + i * (a.size + band.gap), y: band.y }));
        host.restructured();
      }, 'wide'),
    ),
  );

  // --- construction / material -----------------------------------------------
  const konstruktion = group(
    'konstruktion',
    'Material & Konstruktion',
    h('div', { class: 'grid2' },
      selectField('Frontausbildung', m.frontStyle, [['overlay', 'Lago: Fronten bündig in der Verkleidung'], ['inset', 'einliegend mit Eichenrahmen']], set((v: 'overlay' | 'inset') => (m.frontStyle = v), true)),
      selectField('Vitrinenfächer innen', m.lining, [['parkett', 'mit Dielen ausgekleidet'], ['none', 'ohne Auskleidung']], set((v: 'parkett' | 'none') => (m.lining = v), true)),
      m.frontStyle === 'overlay'
        ? numberField('Sichtbarer Rand', m.rim, set((v) => (m.rim = v)), { min: 2, max: m.cladding + m.carcass - 5, unit: 'mm', hint: m.rim < m.cladding ? `Falz ${m.cladding - m.rim} mm in der Diele` : m.rim > m.cladding ? `Blende ${m.rim - m.cladding} mm vor dem Korpus` : 'ohne Falz' })
        : null,
      m.lining === 'parkett' ? numberField('Auskleidung Stärke', m.liningThickness, set((v) => (m.liningThickness = v)), { min: 4, max: 20, unit: 'mm' }) : null,
    ),
    h('p', { class: 'hint' }, 'Lago-Stil: Die Fronten decken den Multiplex-Korpus komplett ab. Die Parkettverkleidung steht vorne um die Frontstärke über, sichtbar bleibt nur ihre schmale Kante. Klarglas- und offene Fächer werden innen mit Dielen ausgekleidet, damit kein Multiplex zu sehen ist.'),
    h('div', { class: 'grid2' },
      numberField('Multiplex Korpus', m.carcass, set((v) => (m.carcass = v)), { min: 12, max: 30, unit: 'mm' }),
      numberField('Rückwand', m.back, set((v) => (m.back = v)), { min: 4, max: 19, unit: 'mm' }),
      numberField('Parkett-Stärke', m.cladding, set((v) => (m.cladding = v)), { min: 8, max: 24, unit: 'mm' }),
      numberField('Dielenbreite', m.plankWidth, set((v) => (m.plankWidth = v)), { min: 80, max: 400, unit: 'mm' }),
      numberField('Dielenlänge', m.plankLength, set((v) => (m.plankLength = v)), { min: 400, max: 4000, step: 10, unit: 'mm' }),
      numberField(m.frontStyle === 'overlay' ? 'Anleimer Dielenkante' : 'Massivholz-Anleimer', m.edgeBand, set((v) => (m.edgeBand = v)), { min: 2, max: 30, unit: 'mm' }),
      selectField('Faser Seiten', m.sideGrain, [['vertical', 'senkrecht'], ['horizontal', 'waagerecht']], set((v: 'vertical' | 'horizontal') => (m.sideGrain = v), true)),
      selectField('Faser Deckel/Boden', m.topGrain, [['horizontal', 'quer (Breite)'], ['vertical', 'in Tiefe']], set((v: 'vertical' | 'horizontal') => (m.topGrain = v), true)),
      selectField('Eckverbindung', m.corner, [['miter', 'Gehrung 45°'], ['butt', 'stumpf']], set((v: 'miter' | 'butt') => (m.corner = v), true)),
      selectField('Korpus-Multiplex', m.interior, [['multiplex', 'Birke'], ['oak', 'Eiche furniert']], set((v: 'oak' | 'multiplex') => (m.interior = v), true)),
      numberField('Frontfuge', m.frontGap, set((v) => (m.frontGap = v)), { min: 1, max: 8, step: 0.5, unit: 'mm' }),
      numberField('Front zurückgesetzt', m.frontSetback, set((v) => (m.frontSetback = v)), { min: 0, max: 20, unit: 'mm' }),
      numberField('Mattglas-Träger', m.mattCarrier, set((v) => (m.mattCarrier = v)), { min: 8, max: 25, unit: 'mm' }),
      numberField('Mattglas', m.mattGlass, set((v) => (m.mattGlass = v)), { min: 3, max: 8, unit: 'mm' }),
      selectField('Klarglastür-Rahmen', m.glassFrame, [['none', 'ohne (Ganzglas)'], ['alu', 'Metallrahmen Alu natur'], ['black', 'Metallrahmen schwarz'], ['bronze', 'Metallrahmen bronze']], set((v: 'none' | 'alu' | 'black' | 'bronze') => (m.glassFrame = v), true)),
      m.glassFrame !== 'none' ? numberField('Rahmenbreite', m.glassFrameWidth, set((v) => (m.glassFrameWidth = v)), { min: 5, max: 120, unit: 'mm' }) : null,
      m.glassFrame !== 'none' ? numberField('Profiltiefe', m.glassFrameDepth, set((v) => (m.glassFrameDepth = v)), { min: 10, max: 40, unit: 'mm', hint: 'bestimmt die Türstärke' }) : null,
      m.glassFrame !== 'none' ? numberField('Glas im Rahmen', m.framedGlass, set((v) => (m.framedGlass = v)), { min: 3, max: 8, unit: 'mm' }) : null,
      m.glassFrame !== 'none' ? null : numberField('Klarglastür ESG', m.clearGlass, set((v) => (m.clearGlass = v)), { min: 4, max: 10, unit: 'mm' }),
      numberField('Parkettfront gesamt', m.woodFront, set((v) => (m.woodFront = v)), { min: m.cladding + 6, max: 40, unit: 'mm' }),
    ),
  );

  // --- room ----------------------------------------------------------------------
  const room = host.room;
  const rset = <T>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    host.roomChanged();
  };
  const wallColor = h('input', { type: 'color', value: room.wallColor });
  wallColor.addEventListener('input', () => rset((v: string) => (room.wallColor = v))(wallColor.value));
  const raum = group(
    'raum',
    'Raum',
    h('div', { class: 'grid3' },
      numberField('Breite', room.width, rset((v) => (room.width = v)), { min: 1500, max: 12000, step: 50, unit: 'mm' }),
      numberField('Tiefe', room.depth, rset((v) => (room.depth = v)), { min: 1500, max: 12000, step: 50, unit: 'mm' }),
      numberField('Höhe', room.height, rset((v) => (room.height = v)), { min: 2000, max: 5000, step: 10, unit: 'mm' }),
    ),
    h('div', { class: 'grid2' },
      selectField('Boden', room.floor, [['oak', 'Eichendiele hell'], ['concrete', 'Beton/Fliese']], rset((v: 'oak' | 'concrete') => (room.floor = v))),
      h('label', { class: 'field' }, h('span', {}, 'Wandfarbe'), wallColor),
    ),
  );

  root.replaceChildren(
    h('div', { class: 'panel-top' }, presets, h('label', { class: 'field name' }, h('span', {}, 'Name'), name)),
    masse,
    aufteilung,
    applik,
    konstruktion,
    raum,
  );
}

export function renderWarnings(el: HTMLElement, res: BuildResult) {
  const icon = { info: 'ℹ', warn: '⚠', error: '⛔' } as const;
  el.replaceChildren(...res.warnings.map((w) => h('div', { class: `warn ${w.level}` }, `${icon[w.level]} ${w.text}`)));
  el.hidden = res.warnings.length === 0;
}
