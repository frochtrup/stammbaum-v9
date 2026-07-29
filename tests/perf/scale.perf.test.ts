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
import { buildPlaceReview } from '../../ui/views/place/place-review-model';
import { makeScaleGedcom } from './make-scale-gedcom';

/** Zielgröße aus Spec 30 §1 ("v8 verifiziert bis 20.000 Personen"). */
const PERSONEN = 20_000;

/**
 * Untergrenze der ORTS-KANDIDATENBREITE (BL-89). Kein Performance-Budget, sondern eine
 * Aussage darüber, WORAN gemessen wird: die teuren Auflösungspfade (Konsistenz-Guard 3c,
 * Eltern-Disambiguierung 3c′, Spec 11 §4.2) arbeiten über Kandidatenmengen — bei zu
 * wenigen Orten laufen sie leer und das Gate deckt einen Pfad, den es nie betritt.
 *
 * Der Wert orientiert sich am GEMESSENEN Realbestand (416 PlaceObjects) und liegt knapp
 * darunter, damit eine harmlose Generator-Änderung ihn nicht sofort reißt. Der Generator
 * liefert derzeit 520 (gemessen) — Reserve ist Absicht, eine Punktlandung wäre nur ein
 * gepinnter Ist-Wert. Bis BL-89 waren es **23**.
 */
const MIN_DISTINCT_PLACES = 400;

/** Budgets in ms — RUNNER-TOLERANZEN, KEINE ZIELWERTE (BL-48, ADR-v9-91 + Nachtrag).
 *  Die verbindlichen Zusicherungen stehen in [30 §1] (ADR-v9-89) und sind hiervon
 *  unberührt: Parse < 400 · Auflösung < 2.000 · Sort < 400 ms.
 *
 *  BEMESSUNGSREGEL: ~3× des auf CI GEMESSENEN Werts, aufgerundet. Nicht 3× der
 *  Zusicherung (dann schrumpft die Reserve, sobald eine Implementierung ihre Zusicherung
 *  knapp erreicht), und auch nicht 3× des Werts auf REFERENZ-Hardware — das Gate läuft
 *  auf dem Runner, also muss es dort bemessen werden. Beide Fehlformen sind hier
 *  nacheinander real aufgetreten, s. u.
 *
 *  ECHTE MESSUNG ubuntu-latest vs. Referenz-Mac (2026-07-18, erster Lauf mit sichtbarer
 *  Ausgabe): parse 100 → 452 ms (4,5×) · Auflösung 1.914 → 5.854 ms (3,1×) ·
 *  Sort 84 → 281 ms (3,3×). Der Runner ist also 3–4,5× langsamer, nicht 2–3× wie in
 *  ADR-v9-91 geschätzt.
 *
 *  WARUM DIE ZAHLEN ZWEIMAL WANDERTEN — beide Male hätte das Gate sonst geflackert:
 *   - 6.000 (3× Zusicherung): CI-Ist 5.854 = 97,6 % des Budgets. Münzwurf.
 *   - 9.000 (4,8× Referenz-Ist): nur 1,54× Reserve auf den CI-Wert. Zu wenig für die
 *     Schwankung geteilter Runner-Infrastruktur.
 *  Ein sporadisch rotes Gate wird abgeschaltet und schützt danach gar nichts — deshalb
 *  ist großzügig hier die konservative Wahl, nicht die bequeme.
 *
 *  FÄNGT WEITERHIN, WORAUF ES ANKOMMT: der behobene Registry-Neubau (ADR-v9-88) lag
 *  lokal bei 89.436 ms, auf dem Runner also bei ~270 s — Faktor 15 über der Schwelle.
 *  Jede Rückkehr zu superlinearem Wachstum schlägt weit darunter an. NICHT gefangen wird
 *  eine 2×-Verlangsamung; die ließe sich von Runner-Varianz ohnehin nicht trennen. */
const BUDGET_PARSE_MS = 1_500; // CI-Ist 452 ms → 3,3× Reserve
// GESCHÄTZT, NOCH NICHT AUF DEM RUNNER GEMESSEN (BL-89, 2026-07-30) — bis zur ersten
// CI-Messung ausdrücklich eine Projektion, kein kalibrierter Wert (dieselbe Kennzeichnung,
// die ADR-v9-91 nachträglich erzwungen hat). Grund der Anhebung: die Fixture wurde für
// BL-89 auf realistische Orts-Kandidatenbreite gebracht (23 → 520 PlaceObjects, 2.196 →
// 17.958 Höfe); die Referenz-Messung stieg dadurch von 1.914 auf 3.039 ms. Mit dem
// gemessenen Runner-Faktor 3,1 projiziert das auf ~9.400 ms CI-Ist — 18.000 ließen davon
// nur 1,9× Reserve, zu wenig für die Schwankung geteilter Runner (genau der Fehler, den
// dieselbe Datei schon zweimal korrigieren musste). 30.000 hält die dokumentierte ~3×-Regel
// auf den PROJIZIERTEN Wert. Beim ersten grünen CI-Lauf gegen den echten Ist-Wert nachziehen.
const BUDGET_RESOLVE_MS = 30_000;
const BUDGET_SORT_MS = 1_200; // CI-Ist 281 ms → 4,3× Reserve (unverändert, schon passend)

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

    // Review-Klasse P (Spec 11 §6) VOR der Ausgabe berechnen — die Zahl gehört ins Log,
    // nicht nur in eine Zusicherung (BL-47/48-Lehre: "die Zahl ist der eigentliche Nutzen").
    const review = buildPlaceReview(parsed.db, ctx);
    const mib = (text.length / 1024 / 1024).toFixed(1);
    console.log(
      `\n  Skalen-Messung (${PERSONEN} Personen / ${familyCount} Familien / ${mib} MiB GEDCOM):\n` +
        `    parse            ${tParse.toFixed(0).padStart(6)} ms  (Budget ${BUDGET_PARSE_MS})\n` +
        `    Orts-Auflösung   ${tResolve.toFixed(0).padStart(6)} ms  (Budget ${BUDGET_RESOLVE_MS})\n` +
        `    erster Sort      ${tSort.toFixed(0).padStart(6)} ms  (Budget ${BUDGET_SORT_MS})\n` +
        `    PlaceObjects: ${parsed.db.placeObjects.size} (Untergrenze ${MIN_DISTINCT_PLACES}) · HofObjects: ${parsed.db.hofObjects.size}\n` +
        `    mehrdeutige Leitnamen: ${new Set([...parsed.db.placeObjects.values()].map((p) => p.title).filter((t, i, a) => t && a.indexOf(t) !== i)).size} · Review-Klasse P: ${review.rows.length}\n`,
    );

    // Plausibilität VOR den Budgets prüfen: ein Pfad, der nichts tut, ist trivial
    // schnell — ohne diese Zusicherungen wäre das Gate wertlos, sobald eine Regression
    // die Verarbeitung überspringt statt sie zu verlangsamen.
    expect(parsed.db.individuals.size).toBe(PERSONEN);
    expect(parsed.db.families.size).toBe(familyCount);
    // BREITE statt bloßer Existenz (BL-89): "> 0" war erfüllt, als es 23 Orte waren.
    expect(parsed.db.placeObjects.size).toBeGreaterThanOrEqual(MIN_DISTINCT_PLACES);
    // Und die Breite muss die richtige SORTE Schwere haben: gleichnamige Kandidaten unter
    // verschiedenen Ketten sind die Voraussetzung dafür, dass 3c′ überhaupt entscheidet.
    const titles = [...parsed.db.placeObjects.values()].map((p) => p.title);
    const homonymTitles = titles.filter((t, i) => t && titles.indexOf(t) !== i);
    expect(homonymTitles.length).toBeGreaterThan(0);
    // Review-Klasse P (Spec 11 §6): ein atomarer PLAC auf einem mehrdeutigen Leitnamen darf
    // NICHT still geraten werden. Vor BL-89 kam dieser Fall in der Fixture gar nicht vor —
    // der Messlauf ging also nie durch den Zweig, der die Kandidatenliste aufbaut.
    expect(review.rows.length).toBeGreaterThan(0);
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
