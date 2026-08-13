// tests/core/coverage-spec.test.ts — Coverage gegen den NENNER (BL-162, ADR-v9-127).
//
// Hält die Modell-Abdeckung gegen den Möglichkeitsraum der ÖFFENTLICHEN Specs
// (spec-universe.ts), nicht nur gegen zwei Bestandsdateien (BL-155-Census = Zähler).
// Jedes Spec-Konstrukt ist damit entweder MODELLIERT (Daten erreichen das Modell) oder
// PASSTHROUGH (überlebt verbatim via INV-PT / GRAMPS-doc-Baum, geht aber bei Cross-Family
// verloren — BL-157/158). Der Test hat Zähne: (a) die Universen sind längen-gepinnt, ein
// Spec-Versionswechsel erzwingt bewusste Revision; (b) jeder modellierte Tag/Element MUSS
// im Universum verortet sein, sonst ist er unerklärte Drift.

import { describe, it, expect } from 'vitest';
import { EVENT_TAGS, SPECIAL_EVENT_TAGS } from '../../core/interop/gedcom-parse';
import { ERKANNTE_TAGS } from '../../core/interop/write-back';
import {
  GEDCOM_551_TAGS,
  GEDCOM_70_TAGS,
  GEDCOM_NONSTANDARD_MODELED,
  GRAMPS_172_ELEMENTS,
  GRAMPS_MODELED,
  MODELED_GEDCOM_TAGS,
} from './spec-universe';

const uniq = (xs: readonly string[]) => new Set(xs);
const sortedDiff = (universe: readonly string[], modeled: ReadonlySet<string>) =>
  universe.filter((x) => !modeled.has(x)).sort();

describe('Coverage gegen die öffentliche Spec (BL-162) — GEDCOM', () => {
  it('Universen sind längen-gepinnt (5.5.1 Appendix A + 7.0 Registry) — Versionswechsel erzwingt Revision', () => {
    expect(GEDCOM_551_TAGS.length).toBe(135);
    expect(uniq(GEDCOM_551_TAGS).size).toBe(135); // keine Duplikate
    expect(GEDCOM_70_TAGS.length).toBe(141); // BL-163
    expect(uniq(GEDCOM_70_TAGS).size).toBe(141);
  });

  it('jeder MODELLIERTE Standard-Tag ist im Universum (5.5.1 ∪ 7.0) verortet (keine unerklärte Drift)', () => {
    // Nicht-`_`-Erweiterungstags müssen aus 5.5.1 ODER 7.0 ODER der bewusst geführten
    // Nicht-Standard-Liste stammen. Ein Tag, der nirgends verortet ist, ist ein Fehler
    // (verkappte Erweiterung oder Tippfehler im recognized-Set).
    const universe = new Set([...GEDCOM_551_TAGS, ...GEDCOM_70_TAGS, ...GEDCOM_NONSTANDARD_MODELED]);
    const unplaced = [...MODELED_GEDCOM_TAGS].filter((t) => !t.startsWith('_') && !universe.has(t));
    expect(unplaced).toEqual([]);
  });

  // Die GEGENRICHTUNG (BL-356, ADR-v9-267) — die teurere, und die, die zwei Monate fehlte.
  //
  // Der Test darüber fragt „ist jeder MODELLIERTE Tag im Universum verortet?" und fängt damit
  // Tippfehler und verkappte Erweiterungen. Er kann nicht fangen, dass die Liste selbst
  // HINTERHERHINKT: ein Tag, den der Parser projiziert, der aber hier fehlt, sieht für den
  // Report wie ein passthrough-only Tag aus — also wie eine bewusste Lücke. Genau das ist
  // passiert: [ADR-v9-249](BL-335) nahm zehn Ereignistags (ORDN BARM BASM BLES CHRA CREM FCOM
  // PROB RETI WILL) in Parser, Erkennungsmenge und Emitter auf, `MODELED_GEDCOM_TAGS` blieb
  // unverändert, und der Report meldete weiter 76/135 statt 87/135. Die Zahl war um elf
  // Positionen zu pessimistisch — eine Coverage-Aussage, die ein halbes Jahr Bauarbeit
  // unterschlägt, verstellt gerade die Priorisierung, für die sie da ist.
  //
  // WARUM CONTAINMENT UND NICHT ABLEITUNG. Die Liste ließe sich nicht aus den
  // Erkennungsmengen erzeugen: sie ist deren Obermenge, weil auch KINDER modelliert sind
  // (`GIVN`/`SURN`/`LATI`/`PAGE`/`QUAY`/`MEDI` … stehen in keiner Record-Erkennungsmenge).
  // Und der blinde String-Literal-Match über den Projektions-Code liefert Falsch-Positive —
  // aus genau diesem Grund ist `GRAMPS_MODELED` kuratiert (s. Kopf von spec-universe.ts).
  // Prüfbar ist deshalb die Richtung, die eindeutig ist: was der Code BEANSPRUCHT, muss hier
  // geführt sein. Ein neuer Tag in einer Erkennungsmenge macht diesen Test rot, und die
  // Coverage-Zahl bewegt sich mit dem Bau statt mit der Erinnerung.
  it('die Gegenrichtung: jeder im Code beanspruchte Tag ist als modelliert geführt', () => {
    const beansprucht = new Set<string>([
      ...ERKANNTE_TAGS.person, ...ERKANNTE_TAGS.family, ...ERKANNTE_TAGS.source, ...ERKANNTE_TAGS.repo,
      ...EVENT_TAGS, ...SPECIAL_EVENT_TAGS,
    ]);
    // Zählung VOR der Zusicherung (ADR-v9-200): eine leere Menge wäre grün und wertlos.
    expect(beansprucht.size).toBeGreaterThan(60);
    const fehlt = [...beansprucht].filter((t) => !MODELED_GEDCOM_TAGS.has(t)).sort();
    expect(
      fehlt,
      'in einer Erkennungsmenge (core/interop/write-back.ts) oder in EVENT_TAGS (gedcom-parse.ts), ' +
        'aber nicht in MODELED_GEDCOM_TAGS — der Coverage-Report zählt den Tag fälschlich als passthrough-only',
    ).toEqual([]);
  });

  it('Coverage-Report: modellierte vs. passthrough-only Tags, je 5.5.1 UND 7.0 (At-Risk bei Cross-Family)', () => {
    for (const [name, universe] of [
      ['5.5.1', GEDCOM_551_TAGS],
      ['7.0', GEDCOM_70_TAGS],
    ] as const) {
      const modeled = universe.filter((t) => MODELED_GEDCOM_TAGS.has(t));
      const passthrough = sortedDiff(universe, MODELED_GEDCOM_TAGS);
      expect(modeled.length + passthrough.length).toBe(universe.length); // Partition vollständig
      // eslint-disable-next-line no-console
      console.log(
        `[BL-162/163] GEDCOM ${name}: ${modeled.length}/${universe.length} Standard-Tags modelliert, ` +
          `${passthrough.length} passthrough-only (bei Cross-Family verloren):\n  ${passthrough.join(' ')}`,
      );
      expect(passthrough.length).toBeGreaterThan(0); // Nenner > Zähler
    }
  });
});

describe('Coverage gegen die öffentliche Spec (BL-162) — GRAMPS', () => {
  it('Universum ist längen-gepinnt (DTD v1.7.2) — Versionswechsel erzwingt Revision', () => {
    expect(GRAMPS_172_ELEMENTS.length).toBe(107);
    expect(uniq(GRAMPS_172_ELEMENTS).size).toBe(107);
  });

  it('jedes als MODELLIERT geführte Element existiert in der DTD (keine Phantome)', () => {
    const universe = uniq(GRAMPS_172_ELEMENTS);
    const phantom = GRAMPS_MODELED.filter((e) => !universe.has(e));
    expect(phantom).toEqual([]);
    expect(uniq(GRAMPS_MODELED).size).toBe(GRAMPS_MODELED.length); // keine Duplikate
  });

  it('Coverage-Report: modellierte vs. passthrough-only DTD-Elemente (At-Risk bei Cross-Family)', () => {
    const modeledSet = uniq(GRAMPS_MODELED);
    const passthrough = sortedDiff(GRAMPS_172_ELEMENTS, modeledSet);
    expect(GRAMPS_MODELED.length + passthrough.length).toBe(GRAMPS_172_ELEMENTS.length);
    // eslint-disable-next-line no-console
    console.log(
      `[BL-162] GRAMPS 1.7.2: ${GRAMPS_MODELED.length}/${GRAMPS_172_ELEMENTS.length} DTD-Elemente modelliert, ` +
        `${passthrough.length} passthrough-only (bei Cross-Family verloren):\n  ${passthrough.join(' ')}`,
    );
    expect(passthrough.length).toBeGreaterThan(0);
  });
});
