# Projektplan: Lago-Möbel im Selbstbau – Konfigurator mit VR/AR und Konstruktionshilfe

## Ziel

Eine **Standvitrine** und ein **Sideboard** im Stil der Valnatura-Serie „Lago“ selbst bauen
(Referenz: [`docs/referenz/lago-valnatura.md`](../referenz/lago-valnatura.md)).
Bauweise: **Multiplex-Korpus**, außen verkleidet mit **Landhausdielen-Parkett (Eiche)**, befestigt über
**Einschraubmuffen (Hülsen)** statt flächiger Verklebung, damit die Verkleidung arbeiten kann und sich nichts verzieht
(Konzept: [`docs/plan/konstruktionskonzept.md`](konstruktionskonzept.md)).

Software: Web-App, statisch über **GitHub Pages** ausgeliefert, in zwei Ausbaustufen.

## Architektur

```
src/
  model/        reines TypeScript, kein three.js – testbar
    types.ts      Konfigurations-Typen (alle Maße in mm)
    presets.ts    Vorlagen „Standvitrine“, „Sideboard“
    build.ts      Konfiguration -> Bauteilliste (Part[]): Korpus, Verkleidung, Anleimer, Fronten, Glas, Sockel …
    validate.ts   Plausibilitätsprüfungen (Mindestmaße, Glasbreiten, Scharnieranzahl …)
  three/        Darstellung
    textures.ts   prozedurale Texturen (Eiche gebürstet, Hirnholzscheiben, Multiplex-Kante, Mattglas)
    scene.ts      Raum, Licht, Kamera, OrbitControls, Schatten
    furniture.ts  Part[] -> three.js-Meshes
    dimensions.ts Maßketten-Overlay
    xr.ts         WebXR: VR (Raum 1:1 begehbar) und AR (Hit-Test, per Tippen platzieren)
    export.ts     GLB- und USDZ-Export (USDZ = AR Quick Look auf iPhone/iPad)
  ui/           Konfigurations-Panel (DOM), Speichern/Laden/Teilen-Link
  construction/ (Stufe 2) Stückliste, Zuschnittoptimierung, Bohrbilder, Montageanleitung
```

Kernidee: **Eine Quelle der Wahrheit.** `build.ts` erzeugt aus der Konfiguration eine vollständige Bauteilliste
(Maße, Material, Faserrichtung, Position). Die 3D-Ansicht (Stufe 1) und die Konstruktionshilfe (Stufe 2) lesen
beide nur diese Liste. Was man in VR sieht, ist exakt das, was in der Stückliste steht.

Technik: Vite + TypeScript + three.js, Vitest für das Modell, GitHub Actions für Build/Test/Deploy.

## Stufe 1 – Konfigurator mit VR/AR

| # | Arbeitspaket | Ergebnis |
|---|---|---|
| 1.1 | Projektgerüst (Vite, TS, three, Vitest), CI-Workflow, Pages-Deployment | App unter `https://flori0815.github.io/Wohnzimmer_moebel/` |
| 1.2 | Datenmodell + Vorlagen Vitrine/Sideboard | `types.ts`, `presets.ts` |
| 1.3 | Bauteil-Generator `build.ts` inkl. Tests | Korpus, Verkleidung in Dielenbreiten, Massivholz-Anleimer, Fronten, Glasböden, LED, Sockel |
| 1.4 | Prozedurale Materialien | Eiche gebürstet/geölt, Hirnholz mit Rissen, Mattglas weiß/anthrazit/fango, Klarglas |
| 1.5 | 3D-Szene | Raum mit einstellbaren Maßen, Licht, Schatten, Orbit-Steuerung, Türen animiert öffnen |
| 1.6 | Konfigurations-Panel | Außenmaße, Sockel, Materialstärken, Dielenbreite/-richtung, Felder (Spalten), Fächer, Front je Fach (Tür/Doppeltür/Klappe/Schubkästen/offen × Oberfläche Mattglas weiß/anthrazit/fango, Klarglas, Parkett), Hirnholz-Kachelband, Böden, LED, Anschlag |
| 1.7 | Maßketten | B/H/T und Feldmaße im 3D-Bild ein-/ausblendbar |
| 1.8 | WebXR | **AR**: Möbel per Hit-Test im echten Raum platzieren (Android/Chrome, Quest). **VR**: virtueller Raum 1:1 (Quest). **iOS**: USDZ-Export für AR Quick Look |
| 1.9 | Speichern/Teilen | localStorage, Teilen-Link (Konfiguration im URL-Hash), JSON-Export/-Import, GLB-Export |
| 1.10 | Validierung | Hinweise bei unsinnigen Maßen (Glastür zu breit, Fach zu niedrig …) |

## Stufe 2 – Konstruktionshilfe und Stücklisten

| # | Arbeitspaket | Ergebnis |
|---|---|---|
| 2.1 | Zuschnittliste | je Material (Multiplex 18, Multiplex 9 Rückwand, Parkett, Massiveiche, Glas) mit L × B × D, Faserrichtung, Kantenbearbeitung, Gehrung |
| 2.2 | Dielenbedarf | Anzahl Landhausdielen aus Dielenmaß (L × B), Verschnittzugabe, Zuordnung Diele → Bauteil |
| 2.3 | Plattenoptimierung | Zuschnittplan Multiplex auf Plattenformat (z. B. 2500 × 1250), Verschnitt in %, SVG-Plan |
| 2.4 | Beschlagliste | Scharniere (Anzahl je Türhöhe), Push-to-open, Schubkastenführungen nach Tiefe, Bodenträger, **Einschraubmuffen + Schrauben + Scheiben**, LED-Profil/-Band/Trafo, Sockel/Füße, Wandbefestigung |
| 2.5 | Bohrbilder | SVG je Korpusteil: Muffenraster (Fixpunkt + Langlöcher), Bodenträger-Lochreihe, Topfbohrungen, Schubkasten-Führungen, Kabeldurchlass |
| 2.6 | Montageanleitung | Schrittfolge, generiert aus Konfiguration |
| 2.7 | Export | Druckansicht (PDF über Browser), CSV-Stückliste |

## Vorgehen / Meilensteine

1. **M0** Recherche + Plan im Repo (dieser Stand).
2. **M1** Stufe 1 lauffähig, deployt auf GitHub Pages (PR → main).
3. **M2** Stufe 2 Konstruktionshilfe (PR → main).
4. Danach: Iteration nach Feedback (Probebau, Maße an echten Dielen/Beschlägen ausrichten).

## Offene Entscheidungen (mit Default in der App)

| Thema | Default | Alternativen |
|---|---|---|
| Multiplex | Birke 18 mm | 15 / 21 mm, Pappel (leichter) |
| Parkett | 3-Schicht-Landhausdiele Eiche 14 mm, 190 mm breit, 2200 mm lang | 15 mm / 20 mm (mehr Fleisch für Muffen), 2-Schicht 10 mm |
| Ecken der Verkleidung | Gehrung 45° | stumpf mit Massiv-Eckleiste |
| Vorderkanten | Massiveiche-Anleimer 8 mm (deckt Multiplex + Diele ab) | Diele sichtbar mit Mittellage (nicht empfohlen) |
| Fronten | Einliegend, bündig, 3 mm Fuge, grifflos (Push-to-open) | aufliegend, mit Griffleiste |
| Mattglas-Fronten | Mattglas 4 mm (weiß/anthrazit/fango) auf Multiplex-Trägertür 15 mm | Parkett-Front, lackierte Front |
| Vitrinentüren | Ganzglastür ESG 6 mm klar (Glastürscharniere) | Eichenrahmen mit Glasfüllung |
| Holzfronten | Multiplex 12 mm + Parkett 14 mm = 26 mm | 3-Schicht-Massivholzplatte Eiche 19 mm |
| Sockel | zurückgesetzt 60 mm hoch, schwarz | schwarze Metallkufen (wie Lago-Lowboard), Füße, wandhängend |
| Hirnholz-Applikation | Band aus quadratischen Kacheln 180 mm, 18 mm dick | Anzahl, Position, stufiger Versatz frei |
