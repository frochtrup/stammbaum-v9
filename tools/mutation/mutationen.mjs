// tools/mutation/mutationen.mjs — die Liste der Stellen, an denen die Absicherung
// gemessen wird (BL-287, ADR-v9-196).
//
// WORAUS DIE LISTE ABGELEITET IST. Nicht aus einer Einschätzung, was „wichtig" ist,
// sondern aus den **benannten Invarianten der Specs** (`LP-…`/`INV-…`). Das ist dieselbe
// Quelle wie TST-2 („jede Invariante hat einen Test") — nur eine Ebene strenger: TST-2
// fragt, OB ein Test existiert, diese Tabelle fragt, ob er ANSCHLÄGT. Ein Test, der auch
// dann grün bleibt, wenn die Regel gebrochen ist, erfüllt TST-2 und schützt nichts.
//
// Der erste Entwurf dieser Datei enthielt eine von mir zusammengestellte Auswahl
// „kritischer Stellen". Das war Raten in seriöser Verpackung: die Auswahl hatte keine
// prüfbare Herkunft, und ihre Vollständigkeit war niemandes Pflicht. Jetzt ist die Menge
// vorgegeben, und `tests/mutation/abdeckung.test.ts` erzwingt, dass jede in den Specs
// benannte Invariante hier eine Zeile hat — auch eine neue.
//
// DREI ZUSTÄNDE, KEIN STILLES WEGLASSEN (dieselbe Disziplin wie TST-9):
//   'mutation'      — es gibt eine Sabotage; gemessen wird, wie viele Fälle sie merken.
//   'anderes-gate'  — die Invariante wird NICHT von der Vitest-Suite getragen, sondern von
//                     einem anderen Lauf (check:arch, eslint, check:csp, check:a11y). Eine
//                     Mutation gegen die Suite sagte über sie nichts aus.
//   'offen'         — noch kein Ziel. Der Fundort steht dabei, damit die Nachholung nicht
//                     bei null anfängt. KEIN erfundener Grund, kein Fehler im Lauf — eine
//                     offene Zeile, die der Lauf namentlich meldet.
//
// WIE EINE MUTATION AUSSEHEN MUSS. Sie ist die REALISTISCHE Regression („jemand entfernt
// den Fallback", „jemand dreht den Vergleich um", „jemand holt die abgeschaffte
// Reprojektion zurück"), nicht der größtmögliche Schaden: eine Sabotage, die das Modul
// zerschießt, fangen hunderte Tests, und sie sagt über die Zusicherung nichts aus.
//
// `suche` ist zugleich der DRIFT-GUARD: findet der Lauf den Text nicht mehr oder mehrfach,
// bricht er ab. Eine umgezogene Stelle muss neu angezielt werden — sonst misst der Lauf
// stillschweigend nichts und meldet trotzdem Erfolg.

/**
 * Die Untergrenze, unterhalb derer eine Stelle als UNZUREICHEND abgesichert gilt —
 * unabhängig davon, was heute gemessen wird.
 *
 * GEMESSEN IN DATEIEN, NICHT IN FÄLLEN. Die erste Fassung verlangte zusätzlich „≥ 3 rote
 * Testfälle". Das war falsch, und der Bau von `passthrough-matrix.test.ts` hat es
 * vorgeführt: dieser Test prüft über 40 Positionen der Passthrough-Matrix, aber als EINE
 * Mengen-Zusicherung — er meldet also einen Treffer. Wollte man die Zahl heben, genügte
 * ein `it.each` über dieselben Positionen: 40 Treffer, kein Gramm mehr Absicherung. Eine
 * Schwelle, die sich durch Zersplittern einer Zusicherung erreichen lässt, misst
 * Schreibweise statt Schutz.
 *
 * Was die Messung dagegen wirklich zeigte (2026-08-02, 15 Stellen): jede unzureichend
 * geschützte Invariante hing an einer EINZIGEN Testdatei. Das ist das Risiko — ein Umbau
 * dieser Datei nimmt die Absicherung mit, ohne dass irgendwo etwas rot wird. Zwei
 * unabhängige Dateien sind deshalb die Grenze; die Fall-Zahl bleibt Auskunft, nicht Norm.
 */
export const UNTERGRENZE = { dateien: 2 };

/**
 * Stellen, die die Untergrenze heute NICHT halten — mit der Zeile, unter der sie gehoben
 * werden. Aufbau wie die L3/L11/L12-Ratschen in `spec-lint`: ein bekannter Rückstand wird
 * benannt und eingeplant, ein NEUER ist ein Fehler. Ohne diese Liste wäre der Lauf ab dem
 * ersten Tag rot und damit wertlos; mit ihr ist jeder Eintrag eine bewusste Aussage.
 *
 * NUR SCHRUMPFEN. Ein Eintrag verschwindet, wenn eine zweite, unabhängige Testdatei die
 * Invariante trägt — nicht, wenn die Zahl zufällig steigt.
 */
export const UNTERGRENZE_RUECKSTAND = {
  'INV-P4': 'BL-293 — nur tests/core/model/integrity.test.ts',
  'INV-H2': 'BL-293 — nur tests/core/inv-h1-h2-hypothesis.test.ts',
  'INV-H3': 'BL-293 — nur tests/core/identity-exclusion.test.ts',
  'INV-VS': 'BL-293 — nur tests/ui/view-state.test.ts',
};

/**
 * @typedef {{
 *   inv: string, spec: string, art: 'mutation'|'anderes-gate'|'offen',
 *   zusicherung: string,
 *   datei?: string, suche?: string, ersetze?: string, schwelle?: number|null,
 *   gate?: string, ort?: string, grund?: string
 * }} Stelle
 */

/** @type {readonly Stelle[]} */
export const STELLEN = [
  // ── Leitprinzipien (Spec 01) ────────────────────────────────────────────────────────
  {
    inv: 'LP-1',
    spec: '01/13',
    art: 'mutation',
    zusicherung: 'Roundtrip-Integrität: ein neu gebauter Record verliert seine un-modellierten Enkel nicht',
    datei: 'core/interop/write-back.ts',
    suche: 'const alt = nachTag(alteKinder.filter((c) => recognized.has(c.tag)));',
    ersetze: 'const alt = nachTag([]);',
    schwelle: 3,
  },
  {
    inv: 'LP-2',
    spec: '01',
    art: 'offen',
    zusicherung: 'Lokal-First: kein Server im Pfad',
    ort: 'services/media/media-resolver.ts, core/model/media-kind.ts',
    grund: 'Ein Verstoß wäre ein NEUER Netzzugriff, keine geänderte Zeile — die Sabotage müsste Code hinzufügen, nicht ersetzen. Vermutlich besser als Lint-/CSP-Regel (LP-8-Vorbild) als über diesen Lauf.',
  },
  {
    inv: 'LP-3',
    spec: '01',
    art: 'offen',
    zusicherung: 'Die Datei ist die Wahrheit für Genealogie',
    ort: 'kein Code-Vorkommen (grep über core/services/ui: 0 Treffer)',
    grund: 'Trägt keine eigene Code-Stelle; wirkt über LP-1/INV-PLACE/INV-FILE-1, die hier eigene Zeilen haben. Eine eigene Sabotage wäre eine Doppelung.',
  },
  {
    inv: 'LP-4',
    spec: '01',
    art: 'offen',
    zusicherung: 'Cross-Stammbaum-Wissen ist von der Genealogie getrennt',
    ort: 'ui/views/settings/SettingsView.svelte, ui/views/more/MoreView.svelte',
    grund: 'Die Trennung ist eine Struktur-Eigenschaft (zwei Dateien, zwei Speicher), keine Verzweigung — noch kein Ein-Zeilen-Ziel gefunden.',
  },
  {
    inv: 'LP-5',
    spec: '01/11',
    art: 'mutation',
    zusicherung: 'Re-Derivation ist die Persistenz: eine Ortskorrektur reprojiziert die Ereignisse ihres Teilbaums',
    datei: 'services/places/apply-resolution.ts',
    // `===` → `!==`: geschrieben wird nur noch, wenn sich nichts ändert — das Kommando
    // wird zum No-Op, ohne dass eine Zeile fehlt.
    suche: 'if (proj == null || proj === ev.place) return null;',
    ersetze: 'if (proj == null || proj !== ev.place) return null;',
    schwelle: 5,
  },
  {
    inv: 'LP-6',
    spec: '01/11',
    art: 'mutation',
    zusicherung: 'Sichtbarkeit von Ungewissheit: ein nicht auflösbares Ereignis wird gemeldet, nicht verschluckt',
    datei: 'core/places/resolve.ts',
    suche: '    if (r) review.push(r);',
    ersetze: '    if (false) review.push(r);',
    schwelle: 40,
  },
  {
    inv: 'LP-7',
    spec: '01/21',
    art: 'anderes-gate',
    zusicherung: 'Mobile-First, Desktop vollwertig',
    gate: 'Komponententests mit `pinLayout()` (TST-17) + Trefferflächen-Wächter `tests/ui/touch-target.test.ts`',
    grund: 'Eine Formfaktor-Zusage hat keine einzelne Code-Stelle; sie wird je Komponente über den festgelegten Viewport geprüft.',
  },
  {
    inv: 'LP-8',
    spec: '01/30',
    art: 'anderes-gate',
    zusicherung: 'Barrierefreiheit & Sicherheit als Baseline',
    gate: 'npm run check:a11y (axe-core, TST-15) · npm run check:csp',
    grund: 'Beide laufen mit eigener Vitest-Config bzw. als eigenes Skript; die Suite dieses Laufs enthält sie nicht.',
  },
  {
    inv: 'LP-9',
    spec: '01/30',
    art: 'mutation',
    zusicherung: 'Kein Datenverlust bei Multi-Device: der Union-Merge behält alle IDs beider Seiten',
    datei: 'services/union-merge.ts',
    // Die IDs, die es nur lokal gibt, fallen weg — der klassische „letzter Schreiber
    // gewinnt"-Verlust, gegen den LP-9 formuliert ist.
    suche: '      merged.set(id, localItem);\n      continue;',
    ersetze: '      continue;',
    schwelle: 6,
  },

  // ── Architektur (Spec 02) ───────────────────────────────────────────────────────────
  {
    inv: 'INV-ARCH-1',
    spec: '02',
    art: 'anderes-gate',
    zusicherung: 'Abhängigkeiten zeigen nur nach unten; der Kern ist DOM-/Framework-frei',
    gate: 'npm run check:arch (tests/arch-boundary/check-arch-boundary.mjs)',
    grund: 'Import-Grenze ist eine statische Eigenschaft des Dateibaums — ein eigener Lauf, nicht die Vitest-Suite.',
  },
  {
    inv: 'INV-ARCH-2',
    spec: '02',
    art: 'anderes-gate',
    zusicherung: 'Der Kern ist ohne Bündelung/Framework testbar',
    gate: 'npm run check:arch + die Existenz der build-freien Kern-Tests selbst',
    grund: 'Wäre sie verletzt, liefe dieser Lauf gar nicht erst — er IST die Probe.',
  },

  // ── Domänenmodell (Spec 10) ─────────────────────────────────────────────────────────
  {
    inv: 'INV-P1',
    spec: '10',
    art: 'mutation',
    zusicherung: 'sex ∈ {M, F, U}; unbekannt/leer → U',
    datei: 'core/model/sex.ts',
    suche: "  if (v === 'F') return 'F';",
    ersetze: "  if (v === 'F') return 'U';",
    schwelle: 37,
  },
  {
    inv: 'INV-P2',
    spec: '10',
    art: 'mutation',
    zusicherung: 'Jede verwaiste ID-Referenz wird gemeldet, nicht still ignoriert',
    datei: 'core/model/integrity.ts',
    suche: 'export function findOrphanRefs(db: Database): OrphanRef[] {\n  const out: OrphanRef[] = [];',
    ersetze: 'export function findOrphanRefs(db: Database): OrphanRef[] {\n  const out: OrphanRef[] = [];\n  if (db) return out;',
    schwelle: 5,
  },
  {
    inv: 'INV-P3',
    spec: '10',
    art: 'mutation',
    zusicherung: 'INDI-Seite und FAM-Seite bleiben wechselseitig konsistent',
    datei: 'core/model/integrity.ts',
    suche: '  if (!fam.children.includes(personId)) fam.children.push(personId);',
    ersetze: '  if (false) fam.children.push(personId);',
    schwelle: 7,
  },
  {
    inv: 'INV-P4',
    spec: '10',
    art: 'mutation',
    zusicherung: 'Der Kind-Beziehungstyp wird ausschließlich INDI-seitig geführt',
    datei: 'core/model/integrity.ts',
    suche: '    link.pedigree = pedigree;',
    ersetze: "    link.pedigree = '';",
    schwelle: 1,
  },
  {
    inv: 'INV-P5',
    spec: '10',
    art: 'mutation',
    zusicherung: 'Das seen-Flag bewahrt leere-aber-vorhandene Blöcke (`1 BIRT` ohne Sub-Tags)',
    datei: 'core/model/event.ts',
    suche: '  if (ev.seen) return true;',
    ersetze: '  if (false) return true;',
    schwelle: 6,
  },
  {
    inv: 'INV-C1',
    spec: '10',
    art: 'offen',
    zusicherung: 'Ein Zitat referenziert genau eine Quelle-ID; Mehrfachzitate dedupliziert dargestellt',
    ort: 'kein Code-Vorkommen des Kürzels (grep: 0 Treffer) — die Darstellung liegt in ui/shell/SourceCitationRow.svelte',
    grund: 'Fundort noch nicht eindeutig; keine erfundene Sabotage.',
  },
  {
    inv: 'INV-C2',
    spec: '10',
    art: 'offen',
    zusicherung: 'quay bleibt unabhängig editierbar; eval leitet nur einen Vorschlag ab',
    ort: 'core/research/eval.ts (evalToQuay), ui/shell/event-edit-citations.ts',
    grund: 'Die Zusicherung ist die ABWESENHEIT eines automatischen Überschreibens. Eine Sabotage müsste Code hinzufügen — machbar, aber der Ort der Einfügung ist eine Entscheidung, keine Messung.',
  },

  // ── Forschungsdaten (Spec 12) ───────────────────────────────────────────────────────
  {
    inv: 'INV-H1',
    spec: '12',
    art: 'offen',
    zusicherung: 'weight (Forscher-Konfidenz) ist von quay/eval (Quellqualität) getrennt',
    ort: 'core/research/hypothesis.ts, core/research/types.ts',
    grund: 'Trennung zweier Felder — auch hier wäre die Sabotage eine Hinzufügung (Kopplung), kein Ersatz.',
  },
  {
    inv: 'INV-H2',
    spec: '12',
    art: 'mutation',
    zusicherung: 'Evidenz ist SID-Referenz ohne Doppelung',
    datei: 'core/research/hypothesis.ts',
    suche: '  const exists = h.evidence.some((e) => e.sourceId === sourceId && e.page === page);',
    ersetze: '  const exists = false;',
    schwelle: 1,
  },
  {
    inv: 'INV-H3',
    spec: '12',
    art: 'mutation',
    zusicherung: 'Ein Identitäts-Ausschluss braucht Bezug UND Begründung',
    datei: 'core/research/hypothesis.ts',
    suche: '    h.refs.length > 0 &&',
    ersetze: '    true &&',
    schwelle: 1,
  },

  // ── Interop (Spec 13) ───────────────────────────────────────────────────────────────
  {
    inv: 'INV-PT',
    spec: '13',
    art: 'mutation',
    zusicherung: 'Un-erkannte Kind-Zeilen überleben an genau einer Stelle, in Reihenfolge und Tiefe',
    datei: 'core/interop/write-back.ts',
    suche: '      children.push(c); // Passthrough: verbatim, an Ort und Stelle',
    ersetze: '      if (false) children.push(c); // Passthrough: verbatim, an Ort und Stelle',
    schwelle: 10,
  },

  // ── Orte/Höfe (Spec 11) ─────────────────────────────────────────────────────────────
  {
    inv: 'INV-PLACE',
    spec: '11',
    art: 'mutation',
    zusicherung: 'event.place ist die Wire-Wahrheit — der Ladepass schreibt PLAC nicht um',
    datei: 'core/places/resolve.ts',
    // Die Regression ist hier eine RÜCKKEHR, keine Entfernung: genau die Reprojektion, die
    // an `Unsere Familie 2026.ged` 668 PLAC-Werte an unangetasteten Ereignissen umschrieb.
    suche: '    if (ev.hofId != null && !ev.addr) {',
    ersetze:
      '    if (ev.placeId != null) {\n' +
      '      const wieder = buildFormString(ctx.places, ev.placeId, year);\n' +
      '      if (wieder) ev.place = wieder;\n' +
      '    }\n' +
      '    if (ev.hofId != null && !ev.addr) {',
    schwelle: 4,
  },

  // ── Dateihandling (Spec 14) ─────────────────────────────────────────────────────────
  {
    inv: 'INV-FILE-1',
    spec: '14',
    art: 'offen',
    zusicherung: 'Es gibt genau eine Arbeitskopie, kein zweiter Text-Cache daneben',
    ort: 'services/file/file-service.ts, services/file/idb-working-copy-store.ts',
    grund: 'Einzigkeit ist eine Struktur-Eigenschaft; ein zweiter Cache wäre neuer Code.',
  },
  {
    inv: 'INV-FILE-2',
    spec: '14',
    art: 'offen',
    zusicherung: 'Jeder Format-Export geht durch dasselbe Save-Rohr',
    ort: 'services/file/export-pipe.ts',
    grund: 'Wie INV-FILE-1: ein zweites Rohr wäre eine Hinzufügung, keine geänderte Zeile.',
  },
  {
    inv: 'INV-FILE-3',
    spec: '14',
    art: 'mutation',
    zusicherung: 'Die Tier-Leiter ist die einzige Plattform-Verzweigung — ein Nutzerabbruch weicht auf keinen weiteren Tier aus',
    datei: 'services/file/file-service.ts',
    suche: "      if (!picked) return { tier: 'fs-picker', ok: false };",
    ersetze:
      '      if (!picked) {\n' +
      '        this.adapters.download.download(bytes, filename, mimeType);\n' +
      "        return { tier: 'download', ok: true };\n" +
      '      }',
    schwelle: 2,
  },

  // ── UI/UX (Spec 21) ─────────────────────────────────────────────────────────────────
  {
    inv: 'INV-VS',
    spec: '21',
    art: 'mutation',
    zusicherung: 'Genau eine Instanz verwaltet die Auswahl je Ziel',
    datei: 'ui/shell/view-state.svelte.ts',
    // Die Auswahl wird gesetzt, aber niemand erfährt es — genau das verstreute
    // Zustands-Verhalten, gegen das INV-VS formuliert ist (v8s `currentX`-Trio).
    suche: '      for (const fn of listeners) fn(target, id);',
    ersetze: '      if (false) for (const fn of listeners) fn(target, id);',
    schwelle: 1,
  },
  // Die sechzehn Oberflächen-Invarianten stehen bewusst EINZELN da, nicht als erzeugte
  // Liste: der Abdeckungs-Wächter (L13 in spec-lint) sucht `inv: 'INV-UI-7'` im Quelltext,
  // und eine generierte Zeile wäre für ihn unsichtbar. Vor allem aber bekommt so jede von
  // ihnen einen eigenen Platz für ihren eigenen Grund, sobald einer gefunden ist —
  // ein gemeinsamer Sammel-Grund für sechzehn verschiedene Regeln wäre wieder das, was
  // diese Tabelle abschaffen soll.
  {
    inv: 'INV-UI-1',
    spec: '21',
    art: 'offen',
    zusicherung: "Ansichten sind Lenses, keine Nav-Ziele — ein Umschalter",
    ort: 'ui/',
    grund: 'Struktur-/Darstellungsregel — noch kein Ein-Zeilen-Ziel bestimmt.',
  },
  {
    inv: 'INV-UI-2',
    spec: '21',
    art: 'offen',
    zusicherung: "Jedes Ziel ist über genau einen kanonischen Weg erreichbar",
    ort: 'ui/',
    grund: 'Struktur-/Darstellungsregel — noch kein Ein-Zeilen-Ziel bestimmt.',
  },
  {
    inv: 'INV-UI-3',
    spec: '21',
    art: 'offen',
    zusicherung: "Es gibt genau einen Lens-Umschalter-Mechanismus",
    ort: 'ui/',
    grund: 'Struktur-/Darstellungsregel — noch kein Ein-Zeilen-Ziel bestimmt.',
  },
  {
    inv: 'INV-UI-4',
    spec: '21',
    art: 'offen',
    zusicherung: "Ein wiederkehrendes visuelles Muster hat genau eine Quelle",
    ort: 'ui/',
    grund: 'Struktur-/Darstellungsregel — noch kein Ein-Zeilen-Ziel bestimmt.',
  },
  {
    inv: 'INV-UI-5',
    spec: '21',
    art: 'offen',
    zusicherung: "Ein zusammengehöriges Element bleibt eine Einheit (kein Umbruch mittendrin)",
    ort: 'ui/',
    grund: 'Struktur-/Darstellungsregel — noch kein Ein-Zeilen-Ziel bestimmt.',
  },
  {
    inv: 'INV-UI-6',
    spec: '21',
    art: 'offen',
    zusicherung: "Ein Personenname in einer Liste/Zeile ist überall dieselbe klickbare Komponente",
    ort: 'ui/',
    grund: 'Struktur-/Darstellungsregel — noch kein Ein-Zeilen-Ziel bestimmt.',
  },
  {
    inv: 'INV-UI-7',
    spec: '21',
    art: 'offen',
    zusicherung: "Die typspezifische Nutzlast eines Ereignisses ist der Headline-Inhalt der Zeile",
    ort: 'ui/',
    grund: 'Struktur-/Darstellungsregel — noch kein Ein-Zeilen-Ziel bestimmt.',
  },
  {
    inv: 'INV-UI-8',
    spec: '21',
    art: 'offen',
    zusicherung: "Ein GEDCOM-Ereignistyp wird überall über dieselbe Beschriftungsquelle gezeigt",
    ort: 'ui/',
    grund: 'Struktur-/Darstellungsregel — noch kein Ein-Zeilen-Ziel bestimmt.',
  },
  {
    inv: 'INV-UI-9',
    spec: '21',
    art: 'offen',
    zusicherung: "Die Datums-Anzeigetiefe folgt dem Kontext (eigene vs. fremde Ereignisse)",
    ort: 'ui/',
    grund: 'Struktur-/Darstellungsregel — noch kein Ein-Zeilen-Ziel bestimmt.',
  },
  {
    inv: 'INV-UI-10',
    spec: '21',
    art: 'offen',
    zusicherung: "Jede Ein-Klick-Sofort-Aktion hat einen Rücknahme-Weg",
    ort: 'ui/',
    grund: 'Struktur-/Darstellungsregel — noch kein Ein-Zeilen-Ziel bestimmt.',
  },
  {
    inv: 'INV-UI-11',
    spec: '21',
    art: 'offen',
    zusicherung: "Budget für den permanenten Kopfbereich: max. 2 Zeilen, 5 Flächen je Spalte bis 400px",
    ort: 'ui/',
    grund: 'Struktur-/Darstellungsregel — noch kein Ein-Zeilen-Ziel bestimmt.',
  },
  {
    inv: 'INV-UI-12',
    spec: '21',
    art: 'offen',
    zusicherung: "Eine Aktion hängt am bedeutungstragenden Element, nicht an einer Extra-Textzeile",
    ort: 'ui/',
    grund: 'Struktur-/Darstellungsregel — noch kein Ein-Zeilen-Ziel bestimmt.',
  },
  {
    inv: 'INV-UI-13',
    spec: '21',
    art: 'offen',
    zusicherung: "Ein Overlay, das über seinen Fluss hinausragt, wird an den <body> portaliert",
    ort: 'ui/',
    grund: 'Struktur-/Darstellungsregel — noch kein Ein-Zeilen-Ziel bestimmt.',
  },
  {
    inv: 'INV-UI-14',
    spec: '21',
    art: 'offen',
    zusicherung: "Die Orts-Anzeigetiefe folgt demselben Kontext-Prinzip wie INV-UI-9",
    ort: 'ui/',
    grund: 'Struktur-/Darstellungsregel — noch kein Ein-Zeilen-Ziel bestimmt.',
  },
  {
    inv: 'INV-UI-15',
    spec: '21',
    art: 'offen',
    zusicherung: "Ein Navigations-Register, mehrere Projektionen",
    ort: 'ui/',
    grund: 'Struktur-/Darstellungsregel — noch kein Ein-Zeilen-Ziel bestimmt.',
  },
  {
    inv: 'INV-UI-16',
    spec: '21',
    art: 'offen',
    zusicherung: "Wann eine Änderung wirksam wird, ist Eigenschaft des Abschnitts, nicht der Seite",
    ort: 'ui/',
    grund: 'Struktur-/Darstellungsregel — noch kein Ein-Zeilen-Ziel bestimmt.',
  },

  // ── Orte-Editor (Spec 22) ───────────────────────────────────────────────────────────
  {
    inv: 'INV-ORTE-1',
    spec: '22',
    art: 'anderes-gate',
    zusicherung: 'Geteilte Views bleiben unverändert; Abweichung nur als benannte Fähigkeit',
    gate: 'npm run check:arch (Import-Verbot + Fork-Guard, Spec 22 §3)',
    grund: 'Statische Import-Prüfung, nicht Laufzeit.',
  },
  {
    inv: 'INV-ORTE-2',
    spec: '22',
    art: 'offen',
    zusicherung: 'Die Kontextdatei verändert das Dokument nicht',
    ort: 'app-orte/orte-context.ts, app-orte/orte-state.svelte.ts',
    grund: 'Fundort steht; ein Ziel im Standalone-Editor ist noch nicht ausgewählt.',
  },
  {
    inv: 'INV-ORTE-3',
    spec: '22',
    art: 'offen',
    zusicherung: 'Die Datei ist die einzige Wahrheit; der Entwurf verfällt beim Speichern',
    ort: 'app-orte/orte-draft-store.ts',
    grund: 'Wie INV-ORTE-2.',
  },

  // ── Dev-Umgebung (Spec 31) ──────────────────────────────────────────────────────────
  {
    inv: 'INV-DEV-1',
    spec: '31',
    art: 'anderes-gate',
    zusicherung: 'Das Code-Repo liegt außerhalb von iCloud',
    gate: 'keiner — Eigenschaft des Arbeitsplatzes, kein Code',
    grund: 'Es gibt nichts zu sabotieren: die Invariante betrifft den Ablageort des Repos.',
  },
];

/** Nur die Zeilen, die dieser Lauf tatsächlich misst. */
export const MUTATIONEN = STELLEN.filter((s) => s.art === 'mutation');
