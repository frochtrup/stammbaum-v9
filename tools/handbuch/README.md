# Handbuch-Automatisierung (`tools/handbuch/`)

Erzeugt [`HANDBUCH.html`](../../HANDBUCH.html) reproduzierbar neu: Screenshots aus der
laufenden App, illustriert mit einer **anonymisierten, reichhaltigen** Beispieldatei.

## Schnellstart
```bash
npm run handbuch:text-review   # 1) welche Features brauchen neuen TEXT? → Prosa anpassen
npm run handbuch               # 2) Screenshots + Version + Changelog (zeigt den Bericht erneut)
```
Danach den Diff prüfen und bewusst committen (siehe Skill `/handbuch-build`).

## Zwei Ebenen der Aktualisierung
Ein Handbuch-Update hat **zwei** Teile, die nicht verwechselt werden dürfen:

1. **Screenshots + Changelog + Version** — *vollautomatisch* (`npm run handbuch`, s. u.).
2. **Prosa** (`HANDBUCH.html`-Text) — *nicht* automatisierbar (Deutsch schreiben ist eine
   Urteilsfrage). Aber der **Bedarf** wird automatisch erkannt und pro Feature einem Abschnitt
   zugewiesen; die Umsetzung erledigt der Agent/Mensch anhand dieses Berichts.

## Textabgleich: Prosa-Bedarf erkennen (`text-review.mjs`)
`npm run handbuch:text-review` listet alle user-relevanten Commits seit dem letzten
Handbuch-Bau (dasselbe Fenster wie der Changelog) und weist jedem per Schlüsselwort-Heuristik
den **wahrscheinlich betroffenen Handbuch-Abschnitt** zu — plus BL-/ADR-Referenzen und den
Hinweis „Thema existiert (anpassen)" vs. „evtl. neu (ergänzen)". Der Bericht läuft auch am
**Anfang jedes `npm run handbuch`** automatisch mit (unterdrückbar via `--skip-text-review`).
Er *blockiert nicht* — die Prosa-Edits liegen zum Bauzeitpunkt oft schon uncommittet vor.
Standard-Exit ist 0 (freundlich); mit `--exit-code` liefert er die Zahl offener Punkte
zurück (CI-/Prozess-Gate). Die Abschnitts-Heuristik lebt in `changes.mjs` (`SECTION_MAP`).

## Changelog: automatisch aus git (kein manueller Kanal)
Der Orchestrator erzeugt den [`HANDBUCH-CHANGELOG.md`](../../HANDBUCH-CHANGELOG.md)-Eintrag
**selbst** aus den Commits seit dem letzten Handbuch-Bau — es gibt **kein** manuell
gepflegtes `[Unreleased]`.

- **Änderungsfenster:** `<letzter Commit an HANDBUCH.html>..HEAD`. Da der Lauf
  `HANDBUCH.html` nur im Arbeitsbaum stempelt (nicht committet), zeigt `git log` den
  vorigen Bau — die Basis ergibt sich also von selbst, ohne gespeichertes Feld.
- **Aufgenommen** werden `feat`/`fix`/`perf`-Commits, die `app`/`ui`/`core`/`services`
  berühren. `docs`/`chore`/`test`/Tooling fallen durch Typ- **und** Pfad-Filter heraus.
- **Vorschau ohne zu schreiben:** `npm run handbuch -- --skip-capture --dry-run`.
- **Nützliche Schalter:** `--since <ref>` (Basis übersteuern), `--all-commits` (auch
  andere Typen), `--notes "a ;; b"` (optionale redaktionelle Zeilen), `--version X.Y`.

Praktische Folge: Wer ein user-sichtbares Feature baut, muss **nichts** am Changelog tun —
der nächste `npm run handbuch`-Lauf listet den Commit automatisch. Nur der eigentliche
Handbuch-**Text** (`HANDBUCH.html`) will bei Bedarf noch von Hand nachgezogen werden.

## Dateien
| Datei | Zweck |
|-------|-------|
| `anonymize-ged.mjs` | Wandelt eine echte (private) GEDCOM in eine anonymisierte Beispieldatei: Personennamen werden deterministisch pseudonymisiert (gleicher Name → gleiches Pseudonym), Foto-/Dateipfade neutralisiert. **Erhalten bleiben** Struktur, Daten, Verwandtschaft, Quellen und die **reale Ortsgeografie** (öffentlich; die Verknüpfung Ort/Hof → reale Person ist durch die Pseudonymisierung ohnehin gekappt). |
| `capture.mjs` | Fährt die App headless (puppeteer-core + System-Chrome), seedt den Orts-Spiegel und etwas Forschungsdaten und schießt alle `handbuch-assets/*.png`. |
| `changes.mjs` | Geteilte git-Analyse (Änderungsfenster, Commit-Auswahl, Abschnitts-Heuristik `SECTION_MAP`) — EINE Quelle für Changelog **und** Textabgleich. |
| `text-review.mjs` | Textabgleich-Bericht: welche Features seit dem letzten Bau brauchen neue **Prosa**, und in welchem Abschnitt. |
| `build-handbook.mjs` | Orchestrator: Textabgleich zeigen → demo.ged umlegen → Dev-Server → capture → aufräumen → Version-Bump, **Changelog automatisch aus git** (s. o.), HTML-Stempel. |
| `fixtures/demo-rich.anon.ged` | Die **committefähige** anonymisierte Beispieldatei (≈2.800 Personen). |
| `fixtures/orte.json` | Orts-Anreicherung (Koordinaten/Hierarchien) — öffentliche Geografie, für Kartenmarker. |
| `handbuch.version.json` | Aktuelle Handbuch-Version (Minor-Bump je Lauf) + `builtAtCommit` (informativ). |

## Anonymisierte Fixture neu erzeugen
Nur nötig, wenn sich der reale Quellbestand geändert hat (die Quelle ist privat/gitignored):
```bash
npm run handbuch:anon -- /pfad/zur/echten.ged tools/handbuch/fixtures/demo-rich.anon.ged
```
Danach in `capture.mjs` die Ziel-Personen (`RICH_PERSON` / `RICH_SURNAME`) gegen die neue
Fixture verifizieren (reichste Person mit vielen Ereignissen für die Detail-Screenshots).

## Wichtig
- **Committet nie automatisch.** Der Diff wird vom Nutzer geprüft.
- **Anonymität selbst gegenprüfen:** nach dem Lauf stichprobenartig sicherstellen, dass in
  den PNGs keine echten Personennamen erscheinen.
- **Nur verstorbene Person im Fokus:** alle personenzentrierten Screenshots (Detail,
  Sanduhr, Karte-Personen, Zeitleiste, Desktop-Liste) zeigen bewusst eine **verstorbene**
  Person (`RICH_PERSON` in `capture.mjs`, aktuell @I3@ †1997). Beim Wechsel der Fixture eine
  neue verstorbene, ereignisreiche Person wählen.
- Läuft **lokal** (System-Chrome, Dev-Server) — nicht in CI.

## Lessons Learnt (Screenshot-Pipeline)
Erfahrungen, die `capture.mjs` immer wieder brechen können — beim nächsten Fehlerbild zuerst hier:

1. **`capture.mjs` teilt das IndexedDB-Schema der App.** Der Seed öffnet die DB mit fester
   Version + Store-Liste; diese MÜSSEN mit `services/idb-schema.ts` (`DB_VERSION`, `STORE_*`)
   übereinstimmen. Ein Schema-Bump in der App bricht den Seed sonst hart mit „VersionError"
   (erlebt: 5 → 6 + neuer Store `research-projects`). Bei DB-Änderungen mitziehen.
2. **Ein grünes „✓" heißt nur „PNG gespeichert", nicht „richtiger Screen".** Deshalb nach
   jedem Lauf die tatsächlichen PNGs ansehen — mindestens die geänderten. (Erlebt: alle
   Screens landeten auf „Protokoll", jeder mit ✓.)
3. **Navigations-Helfer eng auf das echte Bedien-Element skopieren, nicht auf „irgendein
   Element mit passendem Text".** Ein neuer, gleichnamiger Schalter kann die Navigation
   kapern. Konkret: der Protokoll-Umschalter „Personen/Timeline" fing `bottomNav('Personen')`
   ab → `bottomNav` trifft jetzt nur `nav.bottom-nav .bottom-nav__item`.
4. **Segment-/Tab-Zustand bleibt erhalten.** Zurück auf einen Entitäts-Tab landet auf dem
   ZULETZT genutzten Segment (nicht „Personen"). Ziel eindeutig ansteuern (Segment explizit
   klicken oder über Detail → „Im Baum anzeigen").
5. **`lensFocus` ist geteilt.** Einmal gesetzt (Person-Detail → „Im Baum anzeigen"), erben
   Sanduhr, Karte-Personen-Modus UND Zeitleiste dieselbe Person — praktisch, um überall den
   verstorbenen Probanden zu zeigen. Aber: die Zeitleiste belegt sich daraus schon selbst;
   ein zusätzliches „Person hinzufügen" ergibt einen zweiten (gleichnamigen) Chip.
6. **Anonymisierung erzeugt Namensgleichheit.** Pseudonyme sind deterministisch je Name —
   mehrere reale Personen können denselben Namen tragen. „Ersten Treffer zum Nachnamen
   nehmen" ist mehrdeutig; über die volle Identität / einen stabilen Anker gehen.
7. **Manche Ansichten brauchen Breite.** Die Zeitleiste (Swim-Lanes) wird im **Desktop**-
   Viewport aufgenommen, nicht mobil (dort zu schmal) — als `figure.wide` im Handbuch.
