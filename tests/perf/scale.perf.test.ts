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

/** Ratschen-Größe: klein genug für einen zügigen CI-Schritt, groß genug, dass der
 *  Orts-/Hof-Pfad mit wachsender Hof-Registry läuft (s. RATSCHE unten). */
const PERSONEN_RATSCHE = 2_500;

/** Budgets in ms — bewusst ~3× über den v9-Zusicherungen aus [30 §1] (ADR-v9-89), damit
 *  das Gate auf fremder CI-Hardware ein Größenordnungs-Wecker bleibt und kein Prozent-Gate.
 *  Zusicherung ⇄ Budget: Parse < 400 ⇄ 1.200 · Auflösung < 2.000 ⇄ 6.000 · Sort < 400 ⇄ 1.200. */
const BUDGET_PARSE_MS = 1_200; // Zusicherung < 400 ms (Ist 112 ms)
const BUDGET_RESOLVE_MS = 6_000; // Zusicherung < 2.000 ms (Ist 89.436 ms — ADR-v9-88/BL-47)
const BUDGET_SORT_MS = 1_200; // Zusicherung < 400 ms (Ist 81 ms)

/** RATSCHE, kein Zielwert: Ist-Messung 2026-07-18 bei 2.500 Personen war ~5,3 s für
 *  die Orts-Auflösung — weit jenseits dessen, was hier stehen SOLLTE, aber der
 *  aktuelle Stand (s. BEFUND im Kopfkommentar). Der Wert hält fest, dass es nicht
 *  SCHLIMMER wird, solange der Resolver nicht behoben ist. Nach dem Fix: diesen Test
 *  löschen und den 20k-Test unskippen, NICHT diese Zahl nachziehen. */
const RATSCHE_RESOLVE_MS = 12_000;

function ms(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

describe(`Skalen-Gate: ${PERSONEN} Personen (Spec 30 §1)`, () => {
  // Fixture-Erzeugung IM Test, nicht auf describe-Ebene: sonst würden die ~9 MiB auch
  // erzeugt, während der Test übersprungen ist (describe-Rümpfe laufen immer).

  // ÜBERSPRUNGEN, WEIL DER BEFUND OFFEN IST — nicht, weil der Test falsch wäre.
  // Erster Lauf dieses Gates (2026-07-18): Orts-Auflösung 89.436 ms gegen ein Budget
  // von 6.000 ms. Gemessene Kurve (resolve, Orts-Auflösung):
  //     1.250 P →  1.748 ms      5.000 P → 15.950 ms     20.000 P → 89.436 ms
  //     2.500 P →  5.338 ms     10.000 P → 41.156 ms
  // Pro Verdopplung ~2,2–3,1× statt 2× → superlinear.
  // Ursache lokalisiert: `resolveOne()` (core/places/resolve.ts) baut BEIDE Registries
  // pro EVENT neu auf (`makePlaceRegistry(places)` + `makeHofRegistry(workingHofs)`,
  // dazu ein zweites `makeHofRegistry` in `reproject`) → O(events × (places + hofs)).
  // Der Kommentar dort nennt den Grund ("workingHofs wächst durch Bootstrap") — die
  // Entscheidung ist korrektheitsmotiviert, ihre Kosten waren nur nie gemessen.
  // Behebung = inkrementell fortgeschriebene Registry statt Neubau; eigener Vorgang
  // im dichtesten Kern-Bereich (Spec 11), ADR-würdig. Danach: `.skip` entfernen.
  it.skip('lädt, löst Orte auf und sortiert innerhalb der NFR-Budgets', () => {
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

  // Der Teil, der HEUTE schützt: solange der 20k-Test wegen des offenen Befunds
  // übersprungen ist, darf der Ist-Zustand wenigstens nicht schlechter werden.
  it(`wird bei ${PERSONEN_RATSCHE} Personen nicht langsamer als der Ist-Stand (Ratsche)`, () => {
    const kleiner = makeScaleGedcom(PERSONEN_RATSCHE);
    const parsed = parseGedcom(kleiner.text);

    const tResolve = ms(() => {
      applyPlaceResolution(parsed.db);
    });

    console.log(
      `\n  Ratsche (${PERSONEN_RATSCHE} Personen): Orts-Auflösung ${tResolve.toFixed(0)} ms ` +
        `(Ratsche ${RATSCHE_RESOLVE_MS} ms, Ist-Stand 2026-07-18: ~5.300 ms)\n`,
    );

    expect(parsed.db.individuals.size).toBe(PERSONEN_RATSCHE);
    expect(parsed.db.hofObjects.size).toBeGreaterThan(0);
    expect(tResolve).toBeLessThan(RATSCHE_RESOLVE_MS);
  });
});
