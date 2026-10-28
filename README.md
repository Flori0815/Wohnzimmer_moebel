# Wohnzimmermöbel im Lago-Stil

Selbstbau einer **Standvitrine** und eines **Sideboards** im Stil der Valnatura-Serie „Lago“:
Multiplex-Korpus, Verkleidung aus Landhausdielen-Parkett (Eiche) auf Einschraubmuffen, Mattglas-Fronten,
Klarglas-Vitrinenfächer mit LED, Hirnholz-Applikationen.

**App:** <https://flori0815.github.io/Wohnzimmer_moebel/>

## Inhalt

| Pfad | Inhalt |
|---|---|
| [`docs/referenz/lago-valnatura.md`](docs/referenz/lago-valnatura.md) | Recherche: Designmerkmale, Typenplan, Maße, Quellen |
| [`docs/referenz/prospekte/`](docs/referenz/prospekte/) | Original-Produktflyer Lago |
| [`docs/plan/projektplan.md`](docs/plan/projektplan.md) | Projektplan, Architektur, Ausbaustufen |
| [`docs/plan/konstruktionskonzept.md`](docs/plan/konstruktionskonzept.md) | Aufbau Multiplex + Parkett, Einschraubmuffen, Langlöcher, Kanten |
| `src/` | Web-App (Vite + TypeScript + three.js) |

## App

**Stufe 1 – Konfigurator mit AR/VR**

- Vorlagen „Standvitrine“ (nach Lago-Standelement) und „Sideboard“ (175 × 81 × 49)
- Außenmaße, Unterbau (Sockel, Metallkufen, Füße, wandhängend), Spalten und Fächer frei einteilbar
- Fronten je Fach: Tür, Doppeltür, Klappe, Schubkästen, offen – Oberfläche Mattglas weiß/anthrazit/fango,
  Klarglas oder Parkett; Einlegeböden aus Glas oder Holz, LED-Beleuchtung
- Hirnholz-Kacheln frei platzierbar (Warnung, wenn eine Kachel über eine Türfuge ragt)
- Materialstärken (Multiplex, Parkett, Anleimer, Glas), Dielenbreite, Faserrichtung, Gehrung/stumpf
- Maßketten, Türen öffnen, LED an/aus, Raum mit einstellbaren Maßen
- **AR** (Android/Chrome, Meta Quest): Möbel per Tippen auf den echten Boden stellen, drehen, Türen öffnen
- **AR Quick Look** (iPhone/iPad) über USDZ, **VR** (Quest) im virtuellen Raum 1:1
- Teilen-Link, JSON speichern/laden, GLB/USDZ/PNG-Export

AR/VR braucht HTTPS – auf GitHub Pages gegeben.

## Entwicklung

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Modell-Tests (Vitest)
npm run build    # Produktionsbuild nach dist/
```

Deployment: Jeder Push auf `main` baut die App und veröffentlicht sie auf dem Branch `gh-pages`
(GitHub → Settings → Pages → „Deploy from a branch“, Branch `gh-pages`, Ordner `/`).
