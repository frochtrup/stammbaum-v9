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

## [9.11] — 2026-08-01

_Automatisch aus den Code-Commits seit dem letzten Handbuch-Bau (`ebde29c`…HEAD) erzeugt._

- feat(ui): BL-273 — beschriftete Bearbeitungs-Knöpfe kommen aus `.stb-btn` (INV-UI-4) (`4e25faa`)
- fix(ui): Der Rundgang duzte als einzige Fläche der App (`ff88970`)

---

## [9.10] — 2026-08-01

_Automatisch aus den Code-Commits seit dem letzten Handbuch-Bau (`e246e0a`…HEAD) erzeugt._

- feat(ui): BL-271 + BL-272 — Wisch-Geste hält sich aus Editoren heraus, Trefferflächen-Wächter fängt die fehlende Größe (`52a24db`)
- feat(ui): BL-270 — Transaktionsgrenze sichtbar, „Verwerfen" ≠ Modus verlassen (ADR-v9-193) (`89ace61`)
- feat(places): BL-268 — Ortstyp am Kandidaten der Review-Klasse P (`f676929`)
- feat(ui): BL-269 — Medien-Galerie ganzflächig, Facetten additiv (ADR-v9-192) (`45b7322`)
- feat(places): BL-267 — Anreicherungs-Grad dreistufig, sichtbar wo entschieden wird (ADR-v9-191) (`2d291ae`)
- feat(places): BL-266 — Prüf-Marker `reviewedAt` + „geprüft"-Knopf (ADR-v9-191) (`b1defbb`)
- fix(ui): BL-265 — geerbte Verwaltungshistorie gehört dem Elternort (ADR-v9-191) (`4dade2a`)
- feat(ui): Erstnutzer-Rundgang aus dem Nav-Register (BL-213, ADR-v9-190) (`8055b39`)
- fix(ui): Geräte-Sicherheitsabstände an allen Rändern (BL-264, ADR-v9-189) (`7fd6747`)
- feat(media): BL-259 + BL-260 + BL-261 — Import-Weg, Bilder im Steckbrief, Fotos in Ausgaben (`11956a7`)
- fix(media): Dateinamen mit Umlaut wurden nie gefunden — NFC-Normalisierung (`dbe8006`)
- feat(media): BL-258 — Thumbnails aus dem verbundenen Ordner, vier sichtbare Zustände (`ea6cd34`)
- feat(settings): BL-257 — Einstellungen als echte Fläche, Medien-Ordner anbindbar (`94cd51c`)
- feat(media): BL-256 — Medien-Klassifikation als Chokepoint, Weblinks werden aufgelöst (`23398a9`)
- fix(ui): BL-255 — Adressfeld auch bei Non-Hof-Ereignissen mit ADDR (`6fd8410`)
- fix(ui): BL-253 + BL-254 — Werkzeuge bei bestehender Auswahl, Fokus-Schutz am Panel (`71112f3`)
- fix(places): BL-249 + BL-250 + BL-251 + BL-252 — vorne offene Zeiträume, Picker-Auswahl in Safari (`b802a31`)
- feat(interop): BL-217 + BL-243 — SOUR.DATA projiziert, Quellen-Datum am richtigen Tag (`d09f635`)
- fix(interop): BL-244 + BL-245 — GRAMPS-Export verlor Quellen-Felder mit nativem Ziel (`a39bbc3`)

---

## [9.9] — 2026-08-01

_Automatisch aus den Code-Commits seit dem letzten Handbuch-Bau (`81b743e`…HEAD) erzeugt._

- Inhaltliche Revision nach einer Abdeckungs- und Balance-Prüfung gegen das Backlog: Kapitel „Was noch folgt" nannte GOV-Import und Personenbezüge als fehlend, obwohl beide gebaut sind — korrigiert und beide beschrieben
- Acht gebaute, bisher unbeschriebene Funktionen ergänzt: Soundex-Suche, Typ-Chips der Suchtreffer, Marker-Klick auf der Karte, Mini-Karte als Sprung, Geo-Regeln der Datenprüfung, Datumsphrase, Prozente in der Statistik, Kekulé-Marker der Personenliste
- Familien, Höfe, Suche und Statistik waren gegenüber ihrem Gewicht in der App zu dünn beschrieben und wurden ausgebaut
- Die verlustfreie Datei-Treue steht jetzt in Kapitel 1 statt nur im Anhang

---

## [9.8] — 2026-08-01

_Automatisch aus den Code-Commits seit dem letzten Handbuch-Bau (`5d8abf7`…HEAD) erzeugt._

- feat(app): BL-07 + BL-238 + BL-239 — Verlauf, geprüfte Projekt-Bezüge, Mitnahme (`f0e753d`)
- feat(interop): BL-242 — GED7 deklariert seine Extension-Tags im SCHMA-Block (`83c2d61`)
- feat(validate): BL-229 — Regel EVIDENCE_CONFLICT (`71a6fbb`)
- feat(research): BL-228 — Forschungsschritt-Vorschlag am Uebernehmen-Knopf (`40f8ba7`)
- fix(quality): BL-231 Restzeile + BL-128 Medientyp-Hinweis (`e2b7f85`)
- feat(quality): BL-231 — Ast-Reifegrad im Qualitäts-Dashboard (`c71fca4`)
- feat(source): BL-128 — Quellen-Vorlagen beim Anlegen (`87eaf43`)
- feat(ui): BL-57 — Evidenz-Bewertung als Aufklapper an der Zitat-Zeile (`1127448`)
- feat(interop): BL-83 — `_EVAL`-Wire-Format für GEDCOM und GRAMPS (`377d850`)
- feat(app-data): BL-180 — B1-Buendel app-data.json (dateiuebergreifender Zustand) (`f8ac62a`)
- fix(interop): BL-241 — GED7 ASSO/ROLE ist eine Enumeration, kein Freitext (`28317ff`)
- feat(dedup): BL-240 — Dublettenausschluss als abgelehnte Identitaets-Hypothese (`5771125`)
- feat(places): BL-236 — Dorf eines Hofes aenderbar (Ortspicker, ADR-v9-172) (`585e0e5`)

---

## [9.7] — 2026-07-28

_Automatisch aus den Code-Commits seit dem letzten Handbuch-Bau (`c5bc025`…HEAD) erzeugt._

- feat(places): BL-09 Mini-Karte (Ort+Hof+Reports) & BL-59 Ortsübersetzungen (`71c9bf3`)
- feat(places): BL-130 Nominatim-Geocoding (Einzel + Batch) (`5b32f54`)
- feat(places/geo): Koordinaten-Eingabe, Geo-Sichtbarkeit, hofsWithResidence-Fix, OCCU raus (`c1ef314`)
- fix(reports): Realdaten-Feinschliff der Buch-Grad-Ausgaben (BL-176/178) (`60c6996`)
- feat(reports): Buch-Grad-§4-Ausgaben #7/#11/#12/#13 (BL-176…179) (`f4f47a9`)
- feat(v9): Story-Modus — Personen-/Familien-Biografie (BL-133/183…190) (`f2f1ae2`)
- feat(v9): Session-Proband + „Zum Probanden"; Default-Person vereinheitlicht (BL-120) (`68a119c`)
- feat(v9): Beziehungsrechner + Verwandtschaftsnachweis (BL-134/175) (`add406b`)
- feat(v9): §4-Druck-Reports #1–#4/#6 + Ausgaben-Hub (BL-169…174) (`c425510`)

---

## [9.6] — 2026-07-27

_Automatisch aus den Code-Commits seit dem letzten Handbuch-Bau (`c165823`…HEAD) erzeugt._

- Nur Screenshots neu erzeugt — keine relevanten Code-Änderungen im Fenster.

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
