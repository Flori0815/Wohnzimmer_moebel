import type { BuildResult, FurnitureConfig } from '../model/types';
import { muffSpec, type DrillResult } from './drilling';

export interface Step {
  title: string;
  items: string[];
}

export function assemblySteps(cfg: FurnitureConfig, res: BuildResult, drill: DrillResult): Step[] {
  const m = cfg.materials;
  const ms = muffSpec(m.cladding);
  const fronts = cfg.columns.flatMap((c) => c.sections);
  const has = (pred: (s: (typeof fronts)[number]) => boolean) => fronts.some(pred);
  const steps: Step[] = [];

  steps.push({
    title: 'Vorbereitung',
    items: [
      'Landhausdielen mindestens 1 Woche im Raum lagern (Akklimatisieren).',
      'Zuschnittliste prüfen und Multiplex nach Plattenplan zuschneiden lassen oder selbst zuschneiden. Bei Furnier auf die Faserrichtung achten.',
      'Bohrschablone (MDF) für das Muffenraster bauen: Raster lt. Bohrplan, Anschlagleiste an der Vorderkante.',
      `Muffe an einem Dielenrest testen: ${ms.muffe}, Bohrung ${ms.bohrung}. Die Nutzschicht darf sich nicht abzeichnen.`,
    ],
  });
  steps.push({
    title: 'Korpusteile bearbeiten (vor dem Verleimen)',
    items: [
      `Falz ${Math.floor(m.carcass / 2)} × ${m.back + 1} mm für die Rückwand in Seiten, Deckel und Boden fräsen.`,
      `Muffen-Durchgangsbohrungen lt. Bohrplan: Fixpunkt rund, alle anderen als Langloch ${ms.langloch} quer zur Dielenrichtung (insgesamt ${drill.muffCount}).`,
      drill.bodentraeger ? 'Lochreihen Ø 5 mm für Bodenträger bohren (System 32, 37 mm von vorne/hinten). Auf Mittelwänden die zweite Seite um 16 mm versetzen.' : '',
      drill.hinges.length ? 'Montageplatten-Positionen für die Scharniere anreißen und vorbohren (Herstellerschablone).' : '',
      res.lights.length ? 'Nut für LED-Profil an der Unterseite von Deckel/Zwischenböden fräsen und Kabelbohrungen Ø 8 mm in der Rückwand setzen.' : '',
      'Kanten der Mittelwände/Zwischenböden für die Anleimer vorbereiten.',
    ].filter(Boolean),
  });
  steps.push({
    title: 'Korpus verleimen',
    items: [
      'Seiten, Boden und Deckel mit Lamellos/Dominos verleimen, Diagonalen messen (rechtwinklig!).',
      cfg.columns.length > 1 ? 'Mittelwände einsetzen und verleimen.' : '',
      fronts.length > cfg.columns.length ? 'Feste Zwischenböden einsetzen.' : '',
      'Rückwand in den Falz einlegen, verleimen und schrauben. Sie stabilisiert den Korpus.',
    ].filter(Boolean),
  });
  if (res.parts.some((p) => p.group === 'auskleidung')) {
    steps.push({
      title: 'Innenauskleidung der Vitrinenfächer',
      items: [
        `Fächer mit Klarglas- oder offener Front mit Dielen (${m.liningThickness} mm) auskleiden: zuerst die Rückwand, dann Seiten, Boden und Decke.`,
        'Von außen durch den Korpus schrauben. Das geht nur, solange die Außenverkleidung noch nicht montiert ist. Die Muffenpositionen dabei freihalten.',
        'Bodenträger-Löcher erst nach dem Auskleiden durch Auskleidung und Korpus bohren (Bohrschablone).',
        'Kabel für die LED vorher durch die Rückwand führen.',
      ],
    });
  }
  steps.push({
    title: 'Massivholz-Anleimer',
    items: m.frontStyle === 'overlay'
      ? [
          `Die Verkleidung steht vorne um die Frontstärke über den Korpus über, damit die Fronten bündig in ihr sitzen. Sichtbar bleibt nur die ${m.cladding} mm schmale Dielenkante.`,
          `Diese Kante mit einem ${m.edgeBand} mm Eiche-Anleimer abdecken (verdeckt die Mittellage der Diele). Anleimer auf Gehrung, auf die Verkleidungsteile leimen, bevor sie montiert werden.`,
          m.rim < m.cladding
            ? `Sichtbarer Rand ${m.rim} mm: an der Vorderkante der vorderen Dielen innen einen Falz ${m.cladding - m.rim} mm breit fräsen, so tief wie der Überstand vor dem Korpus (Maß lt. Zuschnittliste). Die Fronten greifen in diesen Falz. Fräsen vor dem Anleimen, an den Gehrungen den Falz mitlaufen lassen.`
            : m.rim > m.cladding
              ? `Sichtbarer Rand ${m.rim} mm: vor die Korpuskante eine Eiche-Blende ${m.rim - m.cladding} mm breit leimen, damit der Rand breiter wird als die Diele.`
              : '',
        ].filter(Boolean)
      : [
          `Eiche-Anleimer (${m.edgeBand} mm) an alle sichtbaren Vorderkanten: Seiten und Deckel/Boden decken Korpus + Parkett ab (${m.carcass + m.cladding} mm breit).`,
          'Nur mit dem Multiplex verleimen, zur Diele hin trocken stoßen. Mit Übermaß anleimen und danach bündig fräsen.',
        ],
  });
  steps.push({
    title: 'Verkleidung aus Landhausdielen',
    items: [
      'Dielen je Fläche lt. Dielenplan auswählen (Farbe/Struktur sortieren), Nut/Feder an den Außenkanten abtrennen.',
      m.corner === 'miter' ? 'Gehrungen 45° an den Außenecken schneiden (Probeschnitt!). Die Gehrung nicht verleimen.' : 'Stumpf stoßen: die Seiten laufen durch, Deckel und Boden liegen dazwischen.',
      'Verkleidungsfeld trocken auflegen, Muffenpositionen durch die Korpusbohrungen von innen anzeichnen (Bohrerspitze/Körner).',
      `Muffen setzen (Bohrung ${ms.bohrung}), optional mit einem Tropfen Epoxid.`,
      `Verkleidung von innen mit ${ms.schraube} + Karosseriescheibe anschrauben: zuerst den Fixpunkt, dann die Langlöcher nur handfest.`,
    ],
  });
  if (has((s) => s.front !== 'open')) {
    steps.push({
      title: 'Fronten',
      items: [
        has((s) => s.surface.startsWith('matt')) ? 'Mattglas mit Spiegelkleber vollflächig auf die Multiplex-Trägertüren kleben (Glas ringsum bündig). 24 h aushärten lassen.' : '',
        has((s) => s.surface === 'glass-clear' && s.front !== 'drawers') ? 'ESG-Klarglastüren beim Glaser mit Scharnierbohrungen bestellen (Maße lt. Zuschnittliste, Kanten poliert).' : '',
        has((s) => s.surface === 'oak') ? 'Parkettfronten: Diele auf Multiplexträger schrauben (von hinten) oder vollflächig verleimen. Bei der kleinen Fläche ist das unkritisch.' : '',
        has((s) => s.front === 'drawers') ? 'Schubkästen bauen (Seiten 12 mm), Unterflurführungen montieren, Fronten mit Fugenmaß ausrichten.' : '',
        m.frontStyle === 'overlay'
          ? `Türen aufliegend einhängen (an Mittelwänden halb aufliegend). Fugen auf ${m.frontGap} mm einstellen, auch zur Verkleidung. Vorher an einer Tür testen, ob sie beim Öffnen frei an der überstehenden Verkleidung vorbeischwenkt; sonst die Fuge vergrößern oder ein Scharnier mit Nullanschlag nehmen.`
          : `Türen einhängen, Fugen auf ${m.frontGap} mm einstellen.`,
        'Push-to-open montieren.',
      ].filter(Boolean),
    });
  }
  if (cfg.applique.enabled && cfg.applique.tiles.length) {
    steps.push({
      title: 'Hirnholz-Applikation',
      items: [
        `${cfg.applique.tiles.length} Kacheln ${cfg.applique.size} × ${cfg.applique.size} mm aus Eiche-Stammscheiben bzw. verleimten Kanthölzern (${cfg.applique.thickness} mm) schneiden.`,
        'Risse mit schwarzem Epoxid füllen (optional), schleifen bis Korn 180, mehrfach ölen.',
        'Auf Holz-/Mattglas-Trägertüren von hinten verschrauben, auf Klarglas mit MS-Polymer elastisch kleben. Positionen lt. Konfiguration (x/y in der Stückliste).',
      ],
    });
  }
  steps.push({
    title: 'Finish & Aufstellen',
    items: [
      'Alle Holzflächen mit Hartwachsöl behandeln (passend zum Parkett), Hirnholz mehrfach.',
      res.lights.length ? 'LED-Profile einsetzen, Netzteil und Schalter anschließen.' : '',
      cfg.base.kind === 'plinth' ? 'Sockel schwarz lackieren, mit Winkeln unter den Korpus schrauben.' : '',
      cfg.base.kind === 'skids' ? 'Kufen schwarz pulverbeschichten lassen, mit Muffen M6 unter dem Boden befestigen.' : '',
      cfg.height > 1200 ? 'Möbel an der Wand kippsichern!' : 'Möbel ausrichten (Wasserwaage).',
    ].filter(Boolean),
  });
  return steps;
}
