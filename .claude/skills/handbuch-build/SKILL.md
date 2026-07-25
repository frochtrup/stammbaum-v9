---
name: handbuch-build
description: >-
  Erzeugt das Benutzerhandbuch (HANDBUCH.html) neu — Screenshots aus der laufenden App
  mit anonymisierter Beispieldatei, Versions-Bump und Changelog. Nutze diesen Skill, wenn
  das Handbuch aktualisiert werden soll, nach Features mit sichtbarer UI-Wirkung, oder bei
  Triggern wie „Handbuch neu bauen/aktualisieren", „handbuch-build", „neue Handbuch-Version".
---

# Handbuch neu erzeugen

Das Benutzerhandbuch [`HANDBUCH.html`](../../../HANDBUCH.html) beschreibt die **gebauten**
v9-Funktionen und ist mit echten App-Screenshots illustriert. Die Illustrationen entstehen
aus einer **anonymisierten**, reichhaltigen Beispieldatei — nie aus echten Familiendaten.

## Wann ausführen
- Nach jedem PR mit im Handbuch **sichtbarer** Wirkung (neuer Screen, geändertes Layout,
  neues Feature). **Kein manuelles Changelog-Tracking mehr:** der Lauf erzeugt den
  [`HANDBUCH-CHANGELOG.md`](../../../HANDBUCH-CHANGELOG.md)-Eintrag selbst aus den git-Commits
  seit dem letzten Handbuch-Bau — zwischenzeitliche Code-Änderungen sind automatisch drin.
- Der Nutzer gestattet den Lauf; committet wird **nicht** automatisch.

## Ein Befehl
```bash
npm run handbuch
```
Das startet den Dev-Server, legt `tools/handbuch/fixtures/demo-rich.anon.ged` als
`app/public/demo.ged` ein, erzeugt alle `handbuch-assets/*.png` neu, räumt auf, zählt die
Version hoch, **erzeugt den Changelog-Eintrag automatisch aus git** (Commits im Fenster
`<letzter Commit an HANDBUCH.html>..HEAD`, gefiltert auf `feat`/`fix`/`perf` an
`app`/`ui`/`core`/`services`) und stempelt die Version ins HTML.

Optionen: `-- --dry-run` (Changelog-Eintrag nur anzeigen), `-- --notes "a ;; b"`
(optionale redaktionelle Zeile[n]), `-- --since <ref>` (Basis übersteuern),
`-- --all-commits` (auch andere Commit-Typen), `-- --version 9.3` (Version explizit),
`-- --skip-capture` (nur Version/Changelog, keine Screenshots).

## Voraussetzungen
- `puppeteer-core` (devDependency) und **System-Chrome** (Pfad ggf. über `CHROME_PATH`).
- Die anonymisierte Fixture muss existieren. Neu erzeugen (nur mit lokal vorhandener
  echter Quelldatei — die ist privat/gitignored):
  ```bash
  npm run handbuch:anon -- <quelle.ged> tools/handbuch/fixtures/demo-rich.anon.ged
  ```

## Nach dem Lauf — selbst gegenprüfen (Pflicht)
1. **Keine echten Namen:** stichprobenartig prüfen, dass in den neuen PNGs nur Pseudonyme
   erscheinen (die Anonymisierung ersetzt Personennamen deterministisch; Orte bleiben real).
2. **Kein leerer/kaputter Screen:** neue Screenshots durchsehen (Detail-, Karten-,
   Forschungs-Screens). Bei Fehlklicks in `tools/handbuch/capture.mjs` die Ziel-Namen
   (`RICH_PERSON`/`RICH_SURNAME`) gegen die aktuelle Fixture prüfen.
3. **HTML-Referenzen:** jede in `HANDBUCH.html` referenzierte Datei existiert, keine
   verwaisten Assets. Kurz visuell öffnen.
4. **Diff prüfen und bewusst committen** — Handbuch + `handbuch-assets/` +
   `HANDBUCH-CHANGELOG.md` + `tools/handbuch/handbuch.version.json` gemeinsam
   (beide Repos nach den Projektregeln; pushen erst nach Rückfrage).

## Bausteine (in `tools/handbuch/`)
- `anonymize-ged.mjs` — deterministische Namens-Pseudonymisierung der reichen GEDCOM.
- `capture.mjs` — Screenshot-Pipeline (IDB-Orts-Seed, Demo-Load, Research-Seeding,
  Karten-Median-Zoom, alle Shots mobil + Desktop).
- `build-handbook.mjs` — Orchestrator (Server, Capture, Version, Changelog, Aufräumen).
