import type { BuildResult, FurnitureConfig, Part } from '../model/types';
import { download } from '../three/export';
import { button, h, numberField, checkField } from '../ui/dom';
import { assemblySteps } from './assembly';
import { cutList, fmt, stockOf, toCSV, weight, materialName, type CutRow, type StockKind } from './bom';
import { computeDrilling, muffSpec, MUFF_EDGE, MUFF_PITCH, type DrillResult, type Hole, type PanelView } from './drilling';
import { hardwareList } from './hardware';
import { pieceOf, planPlanks, planSheets, type PlankPlan, type SheetPlan } from './packing';

interface Settings {
  sheetL: number;
  sheetW: number;
  kerf: number;
  plankTrim: number;
  rotate: boolean;
  waste: number;
}

const SETTINGS_KEY = 'lago-konstruktion-v1';
const settings: Settings = loadSettings();

function loadSettings(): Settings {
  const d: Settings = { sheetL: 2500, sheetW: 1250, kerf: 4, plankTrim: 30, rotate: true, waste: 10 };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return d;
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
}

const STOCK_TITLES: Record<StockKind, string> = {
  multiplex: 'Plattenware (Multiplex)',
  parkett: 'Landhausdielen (Verkleidung, Parkettfronten)',
  massivholz: 'Massivholz Eiche (Anleimer)',
  glas: 'Glas (beim Glaser bestellen)',
  hirnholz: 'Hirnholz-Applikation',
  stahl: 'Stahl',
  led: 'LED',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svgEl(markup: string, cls = 'drawing'): HTMLElement {
  const wrap = h('div', { class: cls });
  wrap.innerHTML = markup;
  return wrap;
}

export function renderConstruction(root: HTMLElement, cfg: FurnitureConfig, res: BuildResult) {
  const rerender = () => {
    saveSettings();
    renderConstruction(root, cfg, res);
  };
  const rows = cutList(cfg, res);
  const drill = computeDrilling(cfg, res);
  const hw = hardwareList(cfg, res, drill);
  const steps = assemblySteps(cfg, res, drill);

  const parquetParts = res.parts.filter((p) => p.material === 'oak' && p.cut);
  const plankPlan = planPlanks(parquetParts.map(pieceOf), cfg.materials.plankLength, cfg.materials.plankWidth, settings.kerf, settings.plankTrim);
  const sheetGroups = new Map<string, Part[]>();
  for (const p of res.parts) {
    if (stockOf(p) !== 'multiplex' || !p.cut) continue;
    const k = materialName(p, cfg).replace(', schwarz lackiert', '');
    sheetGroups.set(k, [...(sheetGroups.get(k) ?? []), p]);
  }
  const sheetPlans = [...sheetGroups.entries()].map(([name, parts]) => ({
    name,
    plan: planSheets(parts.map(pieceOf), settings.sheetL, settings.sheetW, settings.kerf, settings.rotate && !name.includes('Eiche')),
  }));

  const errors = res.warnings.filter((w) => w.level === 'error');
  const planksNeeded = Math.ceil(plankPlan.planks.length * (1 + settings.waste / 100));

  const stats: [string, string][] = [
    ['Außenmaße', `${cfg.width} × ${cfg.height} × ${cfg.depth} mm`],
    ['Bauteile', String(res.parts.filter((p) => p.group !== 'led').length)],
    ['Gewicht ca.', `${Math.round(weight(res))} kg`],
    ['Parkett', `${plankPlan.areaM2.toFixed(2)} m² · ${planksNeeded} Dielen (inkl. ${settings.waste} %)`],
    ...sheetPlans.map(({ name, plan }) => [name, `${plan.sheets.length} Platte(n) ${settings.sheetL} × ${settings.sheetW}`] as [string, string]),
    ['Einschraubmuffen', `${drill.muffCount} × ${muffSpec(cfg.materials.cladding).muffe.replace('Einschraubmuffe ', '')}`],
  ];

  root.replaceChildren(
    h('div', { class: 'bau-inner' },
      h('div', { class: 'bau-head' },
        h('div', {},
          h('h2', {}, `${cfg.name} – Konstruktion & Stückliste`),
          h('p', { class: 'hint' }, 'Alle Maße in mm. Alles wird aus der aktuellen Konfiguration berechnet. Vor dem Zuschnitt an den echten Dielen und Beschlägen prüfen.'),
        ),
        h('div', { class: 'bau-actions noprint' },
          button('Stückliste als CSV', () => download(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' }), `${cfg.name || 'moebel'}-stueckliste.csv`)),
          button('Drucken / PDF', () => window.print(), 'primary'),
        ),
      ),
      errors.length ? h('div', { class: 'warn error' }, `⛔ Die Konfiguration hat Fehler: ${errors.map((e) => e.text).join(' ')}`) : null,
      h('div', { class: 'stats' }, ...stats.map(([k, v]) => h('div', { class: 'stat' }, h('span', {}, k), h('strong', {}, v)))),
      settingsBox(rerender),
      section('Zuschnittliste', cutTable(rows)),
      section('Dielenplan (Landhausdielen)', plankSection(plankPlan, cfg, planksNeeded)),
      section('Plattenplan (Multiplex)', ...sheetPlans.map(({ name, plan }) => sheetSection(name, plan))),
      section('Beschläge & Material', hardwareTable(hw), hingeTable(drill)),
      section('Bohrpläne Korpus (Innenansicht)', drillIntro(cfg), ...drill.views.map((v) => drillView(v, drill.holes.filter((x) => x.panel === v.partId), res))),
      section('Muffen auf den Dielen (Rückseite)', plankMuffTable(drill, res)),
      cfg.applique.enabled && cfg.applique.tiles.length ? section('Hirnholz-Kacheln', tileTable(cfg)) : null,
      section('Montageablauf', ...steps.map((s, i) => h('div', { class: 'step' }, h('h4', {}, `${i + 1}. ${s.title}`), h('ul', {}, ...s.items.map((t) => h('li', {}, t)))))),
    ),
  );
}

function section(title: string, ...content: (HTMLElement | null)[]): HTMLElement {
  return h('section', { class: 'bau-section' }, h('h3', {}, title), ...content);
}

function settingsBox(onChange: () => void): HTMLElement {
  const set = (k: keyof Settings) => (v: number | boolean) => {
    (settings as unknown as Record<string, number | boolean>)[k] = v;
    onChange();
  };
  return h('details', { class: 'bau-settings noprint' },
    h('summary', {}, 'Einstellungen für Plattenplan & Dielenbedarf'),
    h('div', { class: 'grid-auto' },
      numberField('Plattenlänge', settings.sheetL, set('sheetL'), { min: 500, max: 5000, step: 10, unit: 'mm' }),
      numberField('Plattenbreite', settings.sheetW, set('sheetW'), { min: 300, max: 2500, step: 10, unit: 'mm' }),
      numberField('Schnittfuge', settings.kerf, set('kerf'), { min: 0, max: 10, step: 0.5, unit: 'mm' }),
      numberField('Dielen: Kopf abschneiden', settings.plankTrim, set('plankTrim'), { min: 0, max: 200, unit: 'mm' }),
      numberField('Verschnittzuschlag', settings.waste, set('waste'), { min: 0, max: 50, unit: '%' }),
      checkField('Teile drehen erlaubt (nicht bei Furnier)', settings.rotate, set('rotate')),
    ),
  );
}

function cutTable(rows: CutRow[]): HTMLElement {
  const body: HTMLElement[] = [];
  let last: StockKind | null = null;
  for (const r of rows) {
    if (r.stock !== last) {
      body.push(h('tr', { class: 'sub' }, h('td', { colspan: 8 }, STOCK_TITLES[r.stock])));
      last = r.stock;
    }
    body.push(
      h('tr', {},
        h('td', {}, String(r.pos)),
        h('td', {}, r.name),
        h('td', { class: 'num' }, String(r.qty)),
        h('td', { class: 'num' }, fmt(r.length)),
        h('td', { class: 'num' }, fmt(r.width)),
        h('td', { class: 'num' }, fmt(r.thickness)),
        h('td', {}, r.material),
        h('td', { class: 'note' }, r.note),
      ),
    );
  }
  return h('div', { class: 'table-wrap' },
    h('table', {},
      h('thead', {}, h('tr', {}, ...['Pos', 'Bauteil', 'Stk', 'Länge', 'Breite', 'Stärke', 'Material', 'Bemerkung'].map((t) => h('th', {}, t)))),
      h('tbody', {}, ...body),
    ),
    h('p', { class: 'hint' }, 'Länge = in Faserrichtung. Gehrungsteile sind auf Spitze gemessen (Außenmaß).'),
  );
}

function plankSection(plan: PlankPlan, cfg: FurnitureConfig, needed: number): HTMLElement {
  const L = cfg.materials.plankLength;
  const W = cfg.materials.plankWidth;
  const scale = 860 / L;
  const rowH = Math.max(14, W * scale);
  const gap = 10;
  const height = plan.planks.length * (rowH + gap) + 20;
  let svg = `<svg viewBox="0 0 ${L * scale + 40} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="system-ui" font-size="10">`;
  plan.planks.forEach((pl, i) => {
    const y = 10 + i * (rowH + gap);
    svg += `<rect x="30" y="${y}" width="${L * scale}" height="${rowH}" fill="#f1e6d6" stroke="#a8743f"/>`;
    svg += `<text x="0" y="${y + rowH / 2 + 3}" fill="#6f675e">${i + 1}</text>`;
    for (const p of pl.pieces) {
      const pw = p.width * scale;
      svg += `<rect x="${30 + p.at * scale}" y="${y + (rowH - pw)}" width="${p.length * scale}" height="${pw}" fill="#c99a62" stroke="#5c3d1e" stroke-width="0.6"><title>${esc(p.label)} ${fmt(p.length)} × ${fmt(p.width)}</title></rect>`;
      svg += `<text x="${30 + p.at * scale + 4}" y="${y + rowH / 2 + 3}" fill="#2b1a0a">${esc(shortLabel(p.label))} · ${Math.round(p.length)}</text>`;
    }
  });
  svg += '</svg>';
  return h('div', {},
    h('p', {}, `Diele ${L} × ${W} mm, Kopfenden je ${settings.plankTrim} mm abgeschnitten. Benötigt: `, h('strong', {}, `${plan.planks.length} Dielen`), `, mit ${settings.waste} % Zuschlag `, h('strong', {}, `${needed} Dielen`), ` (${plan.areaM2.toFixed(2)} m² Nettofläche).`),
    plan.tooLong.length ? h('div', { class: 'warn warn' }, `⚠ Länger als eine Diele (Längsstoß nötig oder längere Dielen): ${plan.tooLong.map((p) => `${shortLabel(p.label)} ${Math.round(p.length)} mm`).join(', ')}`) : null,
    plan.tooWide.length ? h('div', { class: 'warn warn' }, `⚠ Breiter als die Diele: ${plan.tooWide.map((p) => shortLabel(p.label)).join(', ')}`) : null,
    svgEl(svg),
    h('p', { class: 'hint' }, 'Eine Diele wird je Teil auf Breite gerissen. Für eine durchgehende Maserung über Gehrungsecken möglichst Teile aus derselben Diele nehmen.'),
  );
}

function shortLabel(label: string): string {
  return label.replace('Verkleidung ', '').replace(' Diele ', ' ').replace('Parkett', 'Pk.');
}

function sheetSection(name: string, plan: SheetPlan): HTMLElement {
  const L = settings.sheetL;
  const W = settings.sheetW;
  const scale = 420 / L;
  const sheets = plan.sheets.map((s, i) => {
    let svg = `<svg viewBox="-2 -2 ${L * scale + 4} ${W * scale + 16}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="system-ui" font-size="7">`;
    svg += `<rect x="0" y="0" width="${L * scale}" height="${W * scale}" fill="#f5f1ea" stroke="#8c8173"/>`;
    for (const p of s.placed) {
      svg += `<rect x="${p.x * scale}" y="${p.y * scale}" width="${p.w * scale}" height="${p.h * scale}" fill="#e6d3b3" stroke="#6b5434" stroke-width="0.5"><title>${esc(p.label)} ${fmt(p.length)} × ${fmt(p.width)}</title></rect>`;
      if (p.w * scale > 30 && p.h * scale > 9) {
        svg += `<text x="${p.x * scale + 2}" y="${p.y * scale + 8}" fill="#2b1a0a">${esc(shortLabel(p.label)).slice(0, Math.floor((p.w * scale) / 3.6))}</text>`;
        if (p.h * scale > 17) svg += `<text x="${p.x * scale + 2}" y="${p.y * scale + 16}" fill="#6b5434">${Math.round(p.length)}×${Math.round(p.width)}${p.rotated ? ' ↻' : ''}</text>`;
      }
    }
    svg += `<text x="0" y="${W * scale + 11}" fill="#6f675e" font-size="9">Platte ${i + 1}</text></svg>`;
    return svgEl(svg, 'drawing sheet');
  });
  return h('div', { class: 'sheet-group' },
    h('h4', {}, `${name}: ${plan.sheets.length} Platte(n), Ausnutzung ${Math.round(plan.yieldRatio * 100)} %`),
    plan.unplaced.length ? h('div', { class: 'warn error' }, `⛔ Passt nicht auf die Platte: ${plan.unplaced.map((p) => p.label).join(', ')}`) : null,
    h('div', { class: 'sheets' }, ...sheets),
  );
}

function hardwareTable(rows: ReturnType<typeof hardwareList>): HTMLElement {
  const body: HTMLElement[] = [];
  let last = '';
  for (const r of rows) {
    if (r.group !== last) {
      body.push(h('tr', { class: 'sub' }, h('td', { colspan: 4 }, r.group)));
      last = r.group;
    }
    body.push(h('tr', {}, h('td', {}, r.item), h('td', { class: 'num' }, fmt(r.qty)), h('td', {}, r.unit), h('td', { class: 'note' }, r.note)));
  }
  return h('div', { class: 'table-wrap' },
    h('table', {}, h('thead', {}, h('tr', {}, ...['Artikel', 'Menge', 'Einheit', 'Hinweis'].map((t) => h('th', {}, t)))), h('tbody', {}, ...body)),
  );
}

function hingeTable(drill: DrillResult): HTMLElement | null {
  if (!drill.hinges.length) return null;
  return h('div', { class: 'table-wrap' },
    h('h4', {}, 'Scharniere je Tür'),
    h('table', {},
      h('thead', {}, h('tr', {}, ...['Tür', 'Anschlag', 'Türhöhe', 'Scharniere', 'Typ'].map((t) => h('th', {}, t)))),
      h('tbody', {}, ...drill.hinges.map((x) => h('tr', {}, h('td', {}, x.door), h('td', {}, x.side), h('td', { class: 'num' }, fmt(x.height)), h('td', { class: 'num' }, String(x.count)), h('td', {}, x.type)))),
    ),
    h('p', { class: 'hint' }, 'Topfbohrung Ø 35 mm, Bohrabstand 3–5 mm zur Türkante; Scharniere 100 mm von oben/unten, dazwischen gleichmäßig.'),
  );
}

function drillIntro(cfg: FurnitureConfig): HTMLElement {
  const ms = muffSpec(cfg.materials.cladding);
  return h('div', { class: 'legend' },
    h('p', {}, `Raster: ${MUFF_EDGE} mm Randabstand, max. ${MUFF_PITCH} mm Abstand längs, 2 Reihen je Diele (35 mm vom Dielenrand). Sitzt eine Position auf einer Verbindung (Boden, Deckel, Mittelwand) oder im Rückwandfalz, wird sie verschoben.`),
    h('div', { class: 'legend-row' },
      svgEl('<svg width="16" height="16"><circle cx="8" cy="8" r="5" fill="#b2452f"/></svg>', 'sym'), h('span', {}, `Fixpunkt (rund, Ø ${ms.schraube.slice(1, 2)},5 mm)`),
      svgEl('<svg width="22" height="16"><rect x="2" y="5" width="18" height="6" rx="3" fill="none" stroke="#1f2a33" stroke-width="1.5"/></svg>', 'sym'), h('span', {}, `Langloch ${ms.langloch}`),
      svgEl('<svg width="16" height="16"><circle cx="8" cy="8" r="2.5" fill="#6f675e"/></svg>', 'sym'), h('span', {}, 'Bodenträger Ø 5'),
      svgEl('<svg width="22" height="16"><rect x="3" y="3" width="16" height="10" fill="#2f6f9a" opacity="0.6"/></svg>', 'sym'), h('span', {}, 'Scharnier-Montageplatte'),
    ),
  );
}

function drillView(v: PanelView, holes: Hole[], res: BuildResult): HTMLElement {
  const maxW = 820;
  const scale = Math.min(maxW / v.width, 760 / v.height, 1);
  const pad = 40;
  const W = v.width * scale + pad * 2;
  const H = v.height * scale + pad * 2;
  const X = (hh: number) => pad + hh * scale;
  const Y = (vv: number) => pad + (v.height - vv) * scale;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" xmlns="http://www.w3.org/2000/svg" font-family="system-ui" font-size="10">`;
  svg += `<rect x="${pad}" y="${pad}" width="${v.width * scale}" height="${v.height * scale}" fill="#f6efe3" stroke="#1f2a33"/>`;

  // cladding plank outlines behind this panel (dashed)
  const prefix = { 'seite-l': 'vk-l-', 'seite-r': 'vk-r-', deckel: 'vk-o-', boden: 'vk-u-' }[v.partId];
  if (prefix) {
    for (const p of res.parts.filter((q) => q.id.startsWith(prefix))) {
      const a = toView(v, p.pos);
      const b = toView(v, [p.pos[0] + p.size[0], p.pos[1] + p.size[1], p.pos[2] + p.size[2]]);
      const x0 = Math.max(0, Math.min(a.h, b.h));
      const x1 = Math.min(v.width, Math.max(a.h, b.h));
      const y0 = Math.max(0, Math.min(a.v, b.v));
      const y1 = Math.min(v.height, Math.max(a.v, b.v));
      svg += `<rect x="${X(x0)}" y="${Y(y1)}" width="${(x1 - x0) * scale}" height="${(y1 - y0) * scale}" fill="none" stroke="#a8743f" stroke-dasharray="4 3" stroke-width="0.8"/>`;
    }
  }
  for (const hole of holes) {
    const cx = X(hole.h);
    const cy = Y(hole.v);
    if (hole.kind === 'muffe-fix') svg += `<circle cx="${cx}" cy="${cy}" r="3.5" fill="#b2452f"><title>Fixpunkt ${fmt(hole.h)} / ${fmt(hole.v)}</title></circle>`;
    else if (hole.kind === 'muffe-langloch') {
      const [w, hh] = hole.slotDir === 'h' ? [12, 5] : [5, 12];
      svg += `<rect x="${cx - w / 2}" y="${cy - hh / 2}" width="${w}" height="${hh}" rx="2.5" fill="none" stroke="#1f2a33" stroke-width="1.2"><title>Langloch ${fmt(hole.h)} / ${fmt(hole.v)}</title></rect>`;
    } else if (hole.kind === 'bodentraeger') svg += `<circle cx="${cx}" cy="${cy}" r="1.4" fill="#6f675e"/>`;
    else svg += `<rect x="${cx - 6}" y="${cy - 10}" width="12" height="20" fill="#2f6f9a" opacity="0.6"><title>Scharnier ${fmt(hole.h)} / ${fmt(hole.v)}</title></rect>`;
  }
  // dimension chains for the muffs: distinct h and v values along the edges
  const muffs = holes.filter((x) => x.kind.startsWith('muffe'));
  const hs = [...new Set(muffs.map((x) => Math.round(x.h)))].sort((a, b) => a - b);
  const vs = [...new Set(muffs.map((x) => Math.round(x.v)))].sort((a, b) => a - b);
  if (hs.length <= 14) for (const hh of hs) svg += `<text x="${X(hh)}" y="${pad - 6}" text-anchor="middle" fill="#b2452f">${hh}</text><line x1="${X(hh)}" y1="${pad - 3}" x2="${X(hh)}" y2="${pad}" stroke="#b2452f"/>`;
  if (vs.length <= 30) for (const vv of vs) svg += `<text x="${pad - 5}" y="${Y(vv) + 3}" text-anchor="end" fill="#b2452f">${vv}</text>`;
  svg += `<text x="${pad}" y="${H - 18}" fill="#6f675e">${fmt(v.width)} mm (${esc(v.hLabel)})</text>`;
  svg += `<text x="${W - pad + 6}" y="${pad + 10}" fill="#6f675e" transform="rotate(90 ${W - pad + 6} ${pad + 10})">${fmt(v.height)} mm (${esc(v.vLabel)})</text>`;
  svg += '</svg>';
  return h('div', { class: 'drill' },
    h('h4', {}, v.title),
    h('p', { class: 'hint' }, `Ursprung unten links. Waagerecht ${v.hLabel}, senkrecht ${v.vLabel}. ${muffs.length} Muffen, ${holes.filter((x) => x.kind === 'bodentraeger').length} Bodenträgerlöcher, ${holes.filter((x) => x.kind === 'scharnier').length} Scharniere.`),
    svgEl(svg),
  );
}

function toView(v: PanelView, world: number[]) {
  const ax = ['x', 'y', 'z'];
  return { h: world[ax.indexOf(v.hAxis)] - v.h0, v: world[ax.indexOf(v.vAxis)] - v.v0 };
}

function plankMuffTable(drill: DrillResult, res: BuildResult): HTMLElement {
  const rows: HTMLElement[] = [];
  for (const [id, muffs] of drill.plankMuffs) {
    const p = res.parts.find((q) => q.id === id)!;
    const list = [...muffs].sort((a, b) => a.v - b.v || a.u - b.u).map((m) => `${m.fix ? '●' : '○'} ${Math.round(m.u)}/${Math.round(m.v)}`);
    rows.push(h('tr', {}, h('td', {}, p.name), h('td', { class: 'num' }, `${fmt(p.cut!.length)} × ${fmt(p.cut!.width)}`), h('td', { class: 'num' }, String(muffs.length)), h('td', { class: 'mono' }, list.join('  '))));
  }
  return h('div', { class: 'table-wrap' },
    h('p', { class: 'hint' }, 'Koordinaten u/v im Bauteil gemessen: u längs der Diele ab dem hinteren bzw. unteren/linken Ende, v quer ab der Kante zur Rückseite/unten/links. ● = Fixpunkt. Am sichersten werden die Positionen aber durch die Korpusbohrungen übertragen.'),
    h('table', {}, h('thead', {}, h('tr', {}, ...['Diele', 'Zuschnitt', 'Muffen', 'Positionen u/v [mm]'].map((t) => h('th', {}, t)))), h('tbody', {}, ...rows)),
  );
}

function tileTable(cfg: FurnitureConfig): HTMLElement {
  const a = cfg.applique;
  return h('div', { class: 'table-wrap' },
    h('table', {},
      h('thead', {}, h('tr', {}, ...['Kachel', 'x (von links)', 'y (vom Boden)', 'Größe', 'Stärke'].map((t) => h('th', {}, t)))),
      h('tbody', {}, ...a.tiles.map((t, i) => h('tr', {}, h('td', {}, `#${i + 1}`), h('td', { class: 'num' }, fmt(t.x)), h('td', { class: 'num' }, fmt(t.y)), h('td', { class: 'num' }, `${a.size} × ${a.size}`), h('td', { class: 'num' }, fmt(a.thickness))))),
    ),
  );
}
