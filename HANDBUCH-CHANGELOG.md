# Handbuch — Änderungsprotokoll

Versionsverlauf des Benutzerhandbuchs ([HANDBUCH.html](HANDBUCH.html)).

**Arbeitsweise — vollautomatisch, kein manuell gepflegtes Changelog.** Beim Lauf von
`npm run handbuch` (Skill `/handbuch-build`) erzeugt der Orchestrator diesen Eintrag
selbst: Er liest die git-Commits im Fenster *„letzter Commit an `HANDBUCH.html`" … HEAD*
und listet alle user-relevanten Code-Änderungen (`feat`/`fix`/`perf` an
`app`/`ui`/`core`/`services`) auf. Es gibt **keinen `[Unreleased]`-Block mehr** und keine
Zeile, die von Hand eingetragen werden muss — zwischenzeitliche Code-Änderungen sind
automatisch berücksichtigt. Optional lässt sich mit `--notes "…"` eine rein
redaktionelle Zusatzzeile ergänzen; `--dry-run` zeigt den Eintrag vorab.

Der **Handbuch-Text** (`HANDBUCH.html`) wird davon getrennt gepflegt: `npm run
handbuch:text-review` (läuft auch am Anfang jedes Baus) erkennt, welche Features neue
Prosa brauchen und weist sie einem Abschnitt zu — die Anpassung erfolgt dann von Hand
bzw. per Agent (Skill `/handbuch-build`).

Die Illustrationen entstehen aus einer **anonymisierten** Beispieldatei
(`tools/handbuch/fixtures/demo-rich.anon.ged`) — reichhaltig, aber ohne echte
Personennamen (siehe [tools/handbuch/README.md](tools/handbuch/README.md)).

---

## [9.5] — 2026-07-27

_Automatisch aus den Code-Commits seit dem letzten Handbuch-Bau (`3800372`…HEAD) erzeugt._

- feat(v9): BL-126 — Medien-Verwaltung komplett (UI + GRAMPS/Citation-Write-Back, ADR-v9-132) (`74db7a9`)
- feat(v9): Quellen-Weblink als angedockte Ergänzungs-Pille (ADR-v9-131) (`a40da31`)
- feat(v9): Such-Typ-Filter (Chips) + Quellen-Zitat-Weblink in Referenzliste (`b6bf583`)
- feat(dedup): BL-165 — GRAMPS-Personen-Merge verlustfrei auf Passthrough-Ebene (Phase 2) (`1d82135`)
- feat(dedup): BL-164 Phase 1 — Personen-Merge verlustfrei auf Passthrough-Ebene (GEDCOM) (`3949271`)
- feat(ui): Datei-Seite — einheitliche Formensprache (ADR-v9-128, Kritik-Folge) (`7c1d4e2`)
- fix(ui): Datei-Seiten-ADR auf v9-128 umnummeriert (Doppelnummer 123 aufgelöst) (`45dbafc`)
- feat(interop): BL-163 — GEDCOM-7.0-Enumeration für den Coverage-Nenner (`2c25070`)
- feat(ui): BL-160 — Cross-Family-Export in der UI (ADR-v9-127, Epic-Abschluss) (`ffc3fc2`)
- feat(interop): BL-159 — RT-4 Cross-Family-Gate + modelEquiv-Signatur-Härtung (`44f17c5`)
- feat(interop): Cross-Family-Vollbaum-Synthese in index.ts verdrahten (BL-157/158) (`0b43820`)
- feat(interop): BL-158 — Modell→GRAMPS-Vollbaum-Synthese (Cross-Family) (`0c9ca7d`)
- feat(interop): BL-157 — Modell→GEDCOM-Vollbaum-Synthese (Cross-Family GRAMPS→GEDCOM) (`6803b2e`)
- feat(interop): BL-156 — ID-Remap + gebündelte Enum/Wert-Normalisierung (ADR-v9-127) (`8f77b0b`)
- feat(interop): BL-155 — modelEquiv (RT-4-Äquivalenz) + Coverage-Audit (`a51ffe2`)
- feat(interop): Media.form am Input zu MIME kanonisieren (Narrow-Waist, ADR-v9-126) (`1ebff3f`)
- feat(core): Media als Top-Level-Entität + GRAMPS-Projektion (ADR-v9-125) (`55b062b`)
- fix(interop): OBJE-Pointer-Form (@M@-Record) — spec-vollständig (ADR-v9-124) (`6fdb2d7`)
- feat(core): Media/MediaCitation-Auflösung + Interop-Migration (ADR-v9-124) (`e031906`)

---

## [9.4] — 2026-07-27

_Automatisch aus den Code-Commits seit dem letzten Handbuch-Bau (`3800372`…HEAD) erzeugt._

- feat(v9): BL-126 — Medien-Verwaltung komplett (UI + GRAMPS/Citation-Write-Back, ADR-v9-132) (`74db7a9`)
- feat(v9): Quellen-Weblink als angedockte Ergänzungs-Pille (ADR-v9-131) (`a40da31`)
- feat(v9): Such-Typ-Filter (Chips) + Quellen-Zitat-Weblink in Referenzliste (`b6bf583`)
- feat(dedup): BL-165 — GRAMPS-Personen-Merge verlustfrei auf Passthrough-Ebene (Phase 2) (`1d82135`)
- feat(dedup): BL-164 Phase 1 — Personen-Merge verlustfrei auf Passthrough-Ebene (GEDCOM) (`3949271`)
- feat(ui): Datei-Seite — einheitliche Formensprache (ADR-v9-128, Kritik-Folge) (`7c1d4e2`)
- fix(ui): Datei-Seiten-ADR auf v9-128 umnummeriert (Doppelnummer 123 aufgelöst) (`45dbafc`)
- feat(interop): BL-163 — GEDCOM-7.0-Enumeration für den Coverage-Nenner (`2c25070`)
- feat(ui): BL-160 — Cross-Family-Export in der UI (ADR-v9-127, Epic-Abschluss) (`ffc3fc2`)
- feat(interop): BL-159 — RT-4 Cross-Family-Gate + modelEquiv-Signatur-Härtung (`44f17c5`)
- feat(interop): Cross-Family-Vollbaum-Synthese in index.ts verdrahten (BL-157/158) (`0b43820`)
- feat(interop): BL-158 — Modell→GRAMPS-Vollbaum-Synthese (Cross-Family) (`0c9ca7d`)
- feat(interop): BL-157 — Modell→GEDCOM-Vollbaum-Synthese (Cross-Family GRAMPS→GEDCOM) (`6803b2e`)
- feat(interop): BL-156 — ID-Remap + gebündelte Enum/Wert-Normalisierung (ADR-v9-127) (`8f77b0b`)
- feat(interop): BL-155 — modelEquiv (RT-4-Äquivalenz) + Coverage-Audit (`a51ffe2`)
- feat(interop): Media.form am Input zu MIME kanonisieren (Narrow-Waist, ADR-v9-126) (`1ebff3f`)
- feat(core): Media als Top-Level-Entität + GRAMPS-Projektion (ADR-v9-125) (`55b062b`)
- fix(interop): OBJE-Pointer-Form (@M@-Record) — spec-vollständig (ADR-v9-124) (`6fdb2d7`)
- feat(core): Media/MediaCitation-Auflösung + Interop-Migration (ADR-v9-124) (`e031906`)

---

## [9.3] — 2026-07-26

_Automatisch aus den Code-Commits seit dem letzten Handbuch-Bau (`9e80724`…HEAD) erzeugt._

- feat(islands): BL-124 — Diagramm-Export PNG + A1-Vektorposter (`dbb41b0`)
- feat(places): BL-87 + BL-88 — Ortsname-Chokepoint in der Karten-Insel + Lint-Gate (`37ed5e8`)
- feat(islands): BL-121 — Vollständigkeits-Heatmap-Ring am Kartenrand (`f194ae8`)
- feat(validate): BL-152 — Per-Person-Severity als geteilte Projektion (`1640653`)
- fix(islands): Baum/Fächer im Viewport zentrieren (BL-151, ADR-v9-123) (`f20abab`)
- feat(islands): BL-123 — Fan-Chart (Halbkreis-Segmente) (`05b3e9f`)
- feat(islands): BL-122 — Nachkommen-Baum (top-down, Gen 2-7) (`948ab0c`)
- feat(islands): BL-151 — geteilter tree-viewport, Sanduhr umgestellt (`87bf586`)

---

## [9.2] — 2026-07-25

_Automatisch aus den Code-Commits seit dem letzten Handbuch-Bau (`a2dfe15`…HEAD) erzeugt._

- feat(ui): Handy und Desktop benennen Nav-Gruppen gleich (ADR-v9-122) (`c33ccc3`)
- feat(ui): Namenlose als kollabierbare "N ohne Namen"-Zeile (ADR-v9-121) (`0fe156b`)
- feat(ui): Quellen-Marke zeigt lesbaren Namen statt Datensatz-ID (ADR-v9-120) (`c75b80a`)
- fix(a11y): Text-Token-Kontrast auf WCAG AA anheben (ADR-v9-119) (`c3033ea`)
- feat(ui): QUAY-Beweiskraft als Meter statt Pillenfarbe (ADR-v9-118) (`0b30cc8`)

---

## [9.1] — 2026-07-25

- **Orts- & Hofkonzept ausführlich erklärt (Kapitel 7):** neue Abschnitte „Das Konzept:
  zwei Objektarten, eine Wahrheit", „Die Rolle der `orte.json`" (stammbaum-übergreifend,
  nicht in der GEDCOM-Datei, Geräte-Spiegel, verlustfreier Abgleich) und „Automatisch
  angelegt, von Hand veredelt" — als eines der Herzstücke der App herausgestellt.
- **Screenshots gezielt verbessert:** Duplikat-Liste statt Werkzeuge-Blatt bei „Doppelte
  Personen" (neu: `05-duplikate`), angereicherter Ort **Ochtrup** mit voller datierter
  Verwaltungskette beim Ort-Steckbrief, **Zeitleiste als Computer-Ansicht** (Swim-Lanes über
  die volle Breite) mit einer ereignisreichen Person, **Halbauswahl** (Teileingabe „Ochtr")
  bei der globalen Suche. Alle personenzentrierten Abbildungen zeigen eine **verstorbene**
  Person.
- **Anhänge ausgebaut:** GEDCOM — „Was die App bearbeitet / durchreicht" und „Grenzen der
  Kompatibilität" (voll vs. Strict, Kodierung, unscharfe Daten); GRAMPS — „Bearbeiten und
  zurückschreiben: Umfang und Grenzen" (native Orts-Verweise, Adressen im Beschreibungsfeld,
  Idempotenz). Technischer Überblick deutlich vertieft: Schichten-Architektur, Roundtrip als
  Prüfstein, Orts-/Hofauflösung (Projektions-Invariante, Konventions-Matrix, Auto-Seed,
  Gleichnamigkeit, Prüfen-Workflow), `orte.json`-Abgleich, Speicher/Undo/Offline.
- **Entitäten löschen:** Person, Familie, Quelle und Archiv haben jeweils unten im Detail
  eine „… löschen"-Schaltfläche (mit Rückfrage). Das Löschen räumt alle Verweise sauber auf
  (Familien-Rollen, Kindlisten, Zitate, Archiv-Bezüge), sodass keine kaputten Verknüpfungen
  zurückbleiben; eine dadurch völlig leere Familie wird automatisch mitentfernt. Andere
  Personen und Ereignisse bleiben bestehen.
- **Ereigniszeile — doppelte Adress-/Notizangabe ausgeblendet:** ist die Notiz einer
  Ereigniszeile zeichengleich zur Adresse, wird sie nicht mehr doppelt angezeigt.
- **Forschung als eigene Sidebar-Kategorie (Desktop):** Aufgaben, Protokoll, Hypothesen und
  Dashboard sind jetzt eigene, beschriftete Einträge einer neuen Sidebar-Gruppe „Forschung"
  (statt Segmente hinter einem einzelnen „Aufgaben"-Eintrag). In der mobilen Segment-Reihe
  steht das **Dashboard an erster Stelle**.
- **Forschungsprojekte:** ein Projekt-Chip-Selektor oberhalb der Forschungs-Segmente bündelt
  Aufgaben, Protokoll, Hypothesen und Dashboard auf einen Ausschnitt. Ein Projekt wird über
  Nachname, Ort und Zeitraum abgegrenzt (jede Achse ist optional, leere Achse schränkt nicht
  ein); die Projekte bleiben geräteweit auf diesem Gerät und reisen **nicht** mit der Datei.
- **Protokoll — Ergebnis „teilweise":** vierter Ergebniswert neben gefunden/nichts
  gefunden/ausstehend, für „Fund, aber unvollständig" (trägt die Wiedervorlage).
- **Protokoll — Timeline-Umschalter:** Umschalten zwischen personenweiser Gruppierung und
  einer chronologischen Research-Timeline (neueste zuerst) — gleiche Einträge, andere Sicht.
- **Aus einer Aufgabe direkt ins Protokoll:** die Schaltfläche „🔍 Protokoll" an einer
  Aufgabe legt einen vorbefüllten, verknüpften Protokolleintrag an; die Protokollzeile zeigt
  die auslösende Aufgabe als Rückverweis.
- **Disambiguierung in den Forschungslisten:** Aufgaben, Protokoll und Hypothesen zeigen bei
  namensgleichen Personen zusätzlich das Geburtsjahr/den Geburtsort als Unterscheidungsmerkmal.
- **Beweisführungsnotiz im Personendetail:** eine automatisch berechnete, rein lesende
  Zusammenfassung (Reifegrad „% aufgelöst" · Quellenlage mit Evidenz-/QUAY-Anteil ·
  bestätigte/offene/verworfene Hypothesen) — erscheint, sobald die Person mindestens eine
  Hypothese trägt.

---

## [9.0] — 2026-07-25

Erste Fassung des v9-Handbuchs.

- **Funktionsumfang:** vollständige Beschreibung der **gebauten** v9-Funktionen — nur
  Erreichbares; geplante Bereiche in „Was noch folgt" gesammelt.
- **Vorgehensweisen & gute Praxis:** Arbeitsablauf-Überblick, Schritt-Anleitungen
  (Person/Ereignis erfassen, Orte pflegen, Belege führen, Befunde abarbeiten,
  Forschungs-Kreislauf), FAQ, Umstieg von anderen Programmen, Startcheckliste.
- **Technische Anhänge:** Symbol-/Tastaturreferenz, GEDCOM- und GRAMPS-Dateiformat
  (Roundtrip, Formate, proprietäre Tags — am Interop-Code verifiziert) sowie technischer
  Überblick (Architektur, Orts-/Hofauflösung, Anonymisierung).
- **Illustration** mit echten App-Screenshots (mobil + Desktop) auf Basis einer
  reichhaltigen, anonymisierten Beispieldatei mit angereicherten Orten (Kartenmarker).
- **Automatisierte Erzeugung** eingeführt: Anonymisierer, Screenshot-Pipeline,
  Orchestrator (`npm run handbuch`), Versions- und Changelog-Verwaltung, Skill
  `/handbuch-build`.
