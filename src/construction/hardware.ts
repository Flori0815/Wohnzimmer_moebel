import type { BuildResult, FurnitureConfig } from '../model/types';
import { muffSpec, type DrillResult } from './drilling';

export interface HwRow {
  group: string;
  item: string;
  qty: number;
  unit: string;
  note: string;
}

/** Hardware and consumables derived from configuration, parts and drilling plan. */
export function hardwareList(cfg: FurnitureConfig, res: BuildResult, drill: DrillResult): HwRow[] {
  const rows: HwRow[] = [];
  const add = (group: string, item: string, qty: number, unit: string, note = '') => {
    if (qty > 0) rows.push({ group, item, qty: Math.round(qty * 100) / 100, unit, note });
  };
  const m = cfg.materials;
  const ms = muffSpec(m.cladding);

  // --- cladding fixings
  add('Verkleidung', ms.muffe, drill.muffCount, 'Stk', `Bohrung in der Diele ${ms.bohrung}, Tiefenanschlag!`);
  add('Verkleidung', `Flachkopfschraube ${ms.schraube} (Torx)`, drill.muffCount, 'Stk', 'von innen durch den Korpus');
  add('Verkleidung', 'Karosseriescheibe passend', drill.muffCount, 'Stk', `Langloch im Korpus ${ms.langloch}, Fixpunkt rund`);
  add('Verkleidung', 'Bohrschablone MDF 6–8 mm', 1, 'Stk', 'selbst bauen: Lochbild lt. Bohrplan');

  const lining = res.parts.filter((p) => p.group === 'auskleidung');
  if (lining.length) {
    add('Auskleidung', 'Spanplattenschraube 3,5 × 20 (von außen durch den Korpus)', lining.length * 4, 'Stk', 'vor dem Anbringen der Verkleidung; Schraubenlänge < Korpus + Auskleidung − 3 mm');
  }

  // --- carcass joints
  const joints = res.parts.filter((p) => p.group === 'korpus' && p.id !== 'seite-l' && p.id !== 'seite-r');
  let biscuits = 0;
  for (const p of joints) {
    const depth = p.size[2];
    biscuits += 2 * Math.max(2, Math.round(depth / 150));
  }
  add('Korpus', 'Lamello Gr. 20 oder Domino 5 × 30', biscuits, 'Stk', 'Ausrichtung der Korpusverbindungen');
  add('Korpus', 'Spanplattenschraube 4 × 50', biscuits, 'Stk', 'optional zusätzlich zur Verleimung (verdeckt unter der Verkleidung)');
  const rw = res.parts.find((p) => p.id === 'rueckwand');
  if (rw) add('Korpus', 'Senkkopfschraube 3,5 × 20 (Rückwand)', Math.ceil((2 * (rw.size[0] + rw.size[1])) / 150), 'Stk', 'Rückwand in den Falz, alle 150 mm');
  add('Korpus', 'Holzleim D3', 1, 'Fl.', '');

  // --- fronts
  const doorHinges = drill.hinges.reduce((s, h) => s + h.count, 0);
  const byType = new Map<string, number>();
  for (const h of drill.hinges) byType.set(h.type, (byType.get(h.type) ?? 0) + h.count);
  for (const [type, n] of byType) add('Fronten', type, n, 'Stk', 'mit Montageplatte; Türhöhen/Anzahl siehe Scharnierliste');
  const doors = drill.hinges.length;
  let flaps = 0;
  const drawerRuns = new Map<number, number>();
  for (const col of cfg.columns) {
    for (const sec of col.sections) {
      if (sec.front === 'flap') flaps++;
    }
  }
  for (const p of res.parts) {
    if (p.group === 'schubkasten' && p.id.endsWith('-sl')) drawerRuns.set(p.size[2], (drawerRuns.get(p.size[2]) ?? 0) + 1);
  }
  add('Fronten', 'Push-to-open Öffner (Tip-On) für Türen', doors, 'Stk', 'grifflos wie Lago');
  add('Fronten', 'Klappenscharnier', flaps * 2, 'Stk', '');
  add('Fronten', 'Klappenhalter / Klappenbremse', flaps * 2, 'Stk', '');
  add('Fronten', 'Push-to-open für Klappen', flaps, 'Stk', '');
  for (const [nl, n] of drawerRuns) {
    add('Fronten', `Unterflur-Vollauszug NL ${nl} mm mit Push-to-open (Paar)`, n, 'Paar', 'Schubkastenseiten 12 mm, Luft 5 mm je Seite – Herstellermaße prüfen');
  }
  const frameBars = res.parts.filter((p) => p.material.startsWith('metal-'));
  if (frameBars.length) {
    const len = frameBars.reduce((sum, p) => sum + (p.cut?.length ?? 0), 0) / 1000;
    const doorsWithFrame = frameBars.length / 4;
    add('Fronten', `Alu-Rahmenprofil ${m.glassFrameWidth} × ${m.glassFrameDepth} mm für Glas ${m.framedGlass} mm`, Math.ceil(len * 1.1 * 10) / 10, 'm', 'inkl. 10 % Verschnitt; Gehrungen 45°; alternativ beim Profilhändler auf Maß fertigen lassen');
    add('Fronten', 'Eckverbinder für Rahmenprofil', doorsWithFrame * 4, 'Stk', '');
    add('Fronten', 'Glasdichtung / Verglasungsgummi', Math.ceil(len * 10) / 10, 'm', '');
  }
  if (res.parts.some((p) => p.material.startsWith('matt'))) {
    const area = res.parts.filter((p) => p.material.startsWith('matt')).reduce((s, p) => s + p.size[0] * p.size[1], 0) / 1e6;
    add('Fronten', 'Spiegelkleber (Kartusche)', Math.max(1, Math.ceil(area / 1.5)), 'Stk', `${area.toFixed(2)} m² Mattglas`);
  }
  if (doorHinges > 0) add('Fronten', 'Kreuzmontageplatten-Schrauben / Euroschrauben 6,3 × 13', doorHinges * 2, 'Stk', '');

  // --- interior
  add('Innen', 'Bodenträger Ø 5 mm (Glasböden: mit Sicherung)', drill.bodentraeger, 'Stk', 'Lochreihe 32 mm, 37 mm von vorne/hinten');

  // --- light
  const leds = res.parts.filter((p) => p.group === 'led');
  if (leds.length) {
    const len = leds.reduce((s, p) => s + p.size[0], 0) / 1000;
    add('Licht', 'LED-Alu-Einbauprofil inkl. Abdeckung opal', Math.ceil(len * 10) / 10, 'm', 'in Nut an der Fachunterseite');
    add('Licht', 'LED-Band 24 V warmweiß 2700–3000 K, CRI > 90', Math.ceil(len * 10) / 10, 'm', '');
    const watts = len * 10;
    add('Licht', `Netzteil 24 V, mind. ${Math.ceil((watts * 1.3) / 10) * 10} W`, 1, 'Stk', 'im Sockel bzw. hinter der Rückwand');
    add('Licht', 'Schalter/Dimmer (Funk oder Touch) + Kabel 2 × 0,75 mm²', 1, 'Satz', 'Kabel durch 8-mm-Bohrungen in der Rückwand');
  }

  // --- base / installation
  if (cfg.base.kind === 'plinth') add('Unterbau', 'Möbelverbinder/Winkel Sockel–Korpus', 6, 'Stk', 'Sockel schwarz lackieren');
  if (cfg.base.kind === 'skids') add('Unterbau', 'Flachstahl 40 × 10 schwarz pulverbeschichtet (Kufen schweißen lassen)', 2, 'Rahmen', 'Befestigung mit M6-Einschraubmuffen im Boden');
  if (cfg.base.kind === 'feet') add('Unterbau', `Möbelfuß Stahl schwarz ${cfg.base.height} mm`, 4, 'Stk', '');
  if (cfg.base.kind === 'wall') add('Unterbau', 'Schwerlast-Aufhängeschiene + Schrankaufhänger', 1, 'Satz', 'Tragfähigkeit ≥ Gewicht × 2');
  if (cfg.height > 1200 && cfg.base.kind !== 'wall') add('Unterbau', 'Kippsicherung (Winkel/Gurt) + Dübel', 2, 'Stk', 'Pflicht bei hohen Möbeln');

  // --- appliqué
  const tiles = res.parts.filter((p) => p.group === 'applikation');
  if (tiles.length) {
    add('Applikation', 'Schraube 3,5 × 25 (von hinten durch Träger) bzw. MS-Polymer-Kleber auf Glas', tiles.length * 2, 'Stk', 'Hirnholz nie starr auf Glas kleben');
    add('Applikation', 'Epoxidharz schwarz für Risse', 1, 'Set', 'optional');
  }

  // --- finish
  add('Oberfläche', 'Hartwachsöl farblos/natur (passend zum Parkett)', 1, 'l', '2 Aufträge, Hirnholz mehrfach sättigen');
  add('Oberfläche', 'Lack schwarz matt (Sockel)', cfg.base.kind === 'plinth' ? 0.25 : 0, 'l', '');
  return rows;
}
