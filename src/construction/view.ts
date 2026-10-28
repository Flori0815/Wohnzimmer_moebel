import type { BuildResult, FurnitureConfig } from '../model/types';
import { h } from '../ui/dom';

/** Construction aid – filled in with stage 2. */
export function renderConstruction(root: HTMLElement, cfg: FurnitureConfig, res: BuildResult) {
  root.replaceChildren(
    h('div', { class: 'bau-inner' },
      h('h2', {}, `${cfg.name}: Konstruktion & Stückliste`),
      h('p', {}, `Ausbaustufe 2 – in Arbeit. Das Modell besteht aktuell aus ${res.parts.length} Bauteilen.`),
    ),
  );
}
