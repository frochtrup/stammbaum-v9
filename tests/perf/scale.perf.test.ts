// tests/perf/scale.perf.test.ts — Performance-Gate gegen die NFR-Ziele aus Spec 30 §1.
//
// WARUM DIESES GATE EXISTIERT (Befund 2026-07-18): Spec 30 §1 nennt konkrete Zahlen
// ("v8 verifiziert bis 20.000 Personen, Parse < 700 ms, erster Sort ~1 s") — diese
// stammen aus einer v8-Messung und wurden auf v9 NIE nachgemessen. Der real genutzte
// Datenbestand hat ~3.100 Personen; bei dieser Größe ist jede Implementierung schnell.
// Ohne Gate fällt eine quadratische Regression (z. B. im Orts-Resolver, Spec 11 §4.2,
// der pro Ereignis über Kandidatenmengen läuft) erst am echten großen Bestand auf.
//
// LÄUFT NICHT IM STANDARD-TESTLAUF. `vitest.config.ts` schließt tests/perf/ aus, damit
// der Kern-Testlauf bei ~5 s bleibt (Pre-Commit-Tauglichkeit, Spec 32). Aufruf:
// `npm run test:perf` — in CI als eigener Schritt.
//
// BUDGETS SIND ABSICHTLICH GROSSZÜGIG (~3× der Spec-Zielwerte auf Referenz-Hardware).
// Ein Gate, das auf einem langsamen CI-Runner sporadisch rot wird, wird abgeschaltet
// und schützt dann gar nichts. Es soll Größenordnungs-Regressionen fangen
// (linear → quadratisch), nicht Prozentpunkte. Die gemessenen Ist-Werte werden immer
// ausgegeben, auch bei grünem Lauf — die Zahl ist der eigentliche Nutzen, die Schwelle
// nur der Wecker.
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../core/interop';
import { applyPlaceResolution } from '../../services/places';
import { makePlaceRegistry, makeHofRegistry } from '../../core/places';
import { buildPersonGroups } from '../../ui/views/person/person-list-model';
import { makeScaleGedcom } from './make-scale-gedcom';

/** Zielgröße aus Spec 30 §1 ("v8 verifiziert bis 20.000 Personen"). */
const PERSONEN = 20_000;

/** Budgets in ms — deutlich über den v9-Zusicherungen aus [30 §1] (ADR-v9-89), damit
 *  das Gate auf fremder CI-Hardware ein Größenordnungs-Wecker bleibt und kein Prozent-Gate.
 *  Zusicherung ⇄ Budget: Parse < 400 ⇄ 1.200 · Auflösung < 2.000 ⇄ 9.000 · Sort < 400 ⇄ 1.200.
 *
 *  DAS BUDGET IST EINE RUNNER-TOLERANZ, KEIN ZIELWERT (BL-48). Der Faktor bemisst sich
 *  am gemessenen IST auf Referenz-Hardware, nicht an der Zusicherung — sonst schrumpft
 *  die CI-Reserve genau dann, wenn eine Implementierung ihre Zusicherung knapp erreicht.
 *  Genau das war hier der Fall: nach BL-47 liegt die Auflösung bei 1.875 ms (94 % der
 *  Zusicherung), die alten 6.000 ms hätten auf einem 2–3× langsameren ubuntu-latest-
 *  Runner sporadisch rot gemeldet — und ein flackerndes Gate wird abgeschaltet.
 *  9.000 ms = 4,8× Reserve auf das Ist. Fängt weiterhin JEDE Größenordnungs-Regression:
 *  der behobene Registry-Neubau lag bei 89.436 ms, also Faktor 10 über dieser Schwelle,
 *  und jede Rückkehr zu superlinearem Wachstum schlägt schon weit darunter an. */
const BUDGET_PARSE_MS = 1_200; // Zusicherung < 400 ms (Ist 110 ms — 10,9× Reserve)
const BUDGET_RESOLVE_MS = 9_000; // Zusicherung < 2.000 ms (Ist 1.875 ms — 4,8× Reserve)
const BUDGET_SORT_MS = 1_200; // Zusicherung < 400 ms (Ist 87 ms — 13,8× Reserve)

function ms(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

describe(`Skalen-Gate: ${PERSONEN} Personen (Spec 30 §1)`, () => {
  // Fixture-Erzeugung IM Test, nicht auf describe-Ebene: sonst würden die ~9 MiB auch
  // erzeugt, während der Test übersprungen ist (describe-Rümpfe laufen immer).

  // WAR ÜBERSPRUNGEN (2026-07-18, ADR-v9-88), weil `resolveOne()` beide Registries pro
  // EREIGNIS neu baute — O(events × (places + hofs)), gemessene Kurve superlinear:
  //     1.250 P →  1.748 ms      5.000 P → 15.950 ms     20.000 P → 89.436 ms
  //     2.500 P →  5.338 ms     10.000 P → 41.156 ms
  // Seit der inkrementellen Fortschreibung (`HofRegistry.indexHof`, BL-47) läuft dieser
  // Test ohne `.skip`. Er ist damit der Wächter gegen einen Rückfall: wird die Registry
  // wieder pro Ereignis gebaut, wird er rot. Er darf NICHT wieder geskippt und sein
  // Budget nicht nachgezogen werden — bei Rot ist die Ursache im Resolver zu suchen.
  it('lädt, löst Orte auf und sortiert innerhalb der NFR-Budgets', () => {
    const { text, familyCount } = makeScaleGedcom(PERSONEN);
    let parsed!: ReturnType<typeof parseGedcom>;
    const tParse = ms(() => {
      parsed = parseGedcom(text);
    });

    const tResolve = ms(() => {
      applyPlaceResolution(parsed.db);
    });

    const ctx = {
      places: makePlaceRegistry(parsed.db.placeObjects),
      hofs: makeHofRegistry(parsed.db.hofObjects),
    };
    let groups!: ReturnType<typeof buildPersonGroups>;
    const tSort = ms(() => {
      groups = buildPersonGroups(parsed.db, ctx, 'name');
    });

    const mib = (text.length / 1024 / 1024).toFixed(1);
    console.log(
      `\n  Skalen-Messung (${PERSONEN} Personen / ${familyCount} Familien / ${mib} MiB GEDCOM):\n` +
        `    parse            ${tParse.toFixed(0).padStart(6)} ms  (Budget ${BUDGET_PARSE_MS})\n` +
        `    Orts-Auflösung   ${tResolve.toFixed(0).padStart(6)} ms  (Budget ${BUDGET_RESOLVE_MS})\n` +
        `    erster Sort      ${tSort.toFixed(0).padStart(6)} ms  (Budget ${BUDGET_SORT_MS})\n` +
        `    PlaceObjects: ${parsed.db.placeObjects.size} · HofObjects: ${parsed.db.hofObjects.size}\n`,
    );

    // Plausibilität VOR den Budgets prüfen: ein Pfad, der nichts tut, ist trivial
    // schnell — ohne diese Zusicherungen wäre das Gate wertlos, sobald eine Regression
    // die Verarbeitung überspringt statt sie zu verlangsamen.
    expect(parsed.db.individuals.size).toBe(PERSONEN);
    expect(parsed.db.families.size).toBe(familyCount);
    expect(parsed.db.placeObjects.size).toBeGreaterThan(0);
    // Höfe MÜSSEN entstehen: ohne sie liefe der Hof-Bootstrap (Spec 11 §4.2 A/A'/C/B')
    // im Messlauf gar nicht mit und das Budget würde einen ungetesteten Pfad decken.
    expect(parsed.db.hofObjects.size).toBeGreaterThan(0);
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(PERSONEN);

    expect(tParse).toBeLessThan(BUDGET_PARSE_MS);
    expect(tResolve).toBeLessThan(BUDGET_RESOLVE_MS);
    expect(tSort).toBeLessThan(BUDGET_SORT_MS);
  });

  // Hier stand bis BL-47 eine 2.500er-RATSCHE (12.000 ms), die den defekten Ist-Zustand
  // vor weiterer Verschlechterung schützte, solange der 20k-Test übersprungen war. Sie
  // ist mit dem Fix ersatzlos entfallen — der 20k-Test misst dieselbe Sache an der
  // eigentlichen Zusicherungsgröße und ist damit der schärfere Wächter. Eine Ratsche auf
  // einen behobenen Defekt wäre nur noch Archiv.
});
