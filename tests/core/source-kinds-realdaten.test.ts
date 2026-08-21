// tests/core/source-kinds-realdaten.test.ts — BL-373 am ECHTEN Bestand.
//
// WARUM AN REALDATEN: die Gattung ist eine Ableitung aus gewachsenen Namen, und die
// einzige ehrliche Frage an sie lautet, wie viele Quellen sie OHNE eine einzige
// Umbenennung einordnet. Ein Test gegen selbst erfundene Namen beantwortet sie nicht — er
// prüft die Regeln gegen die Beispiele, aus denen sie gemacht wurden.
//
// SCHWELLE MIT RESERVE, kein gepinnter Ist-Wert (Muster `MIN_DISTINCT_PLACES`,
// ADR-v9-159): gemessen sind 146 von 153 (95 %); die Schwelle steht bei 85 %. Sie ist ein
// Wecker, keine Zielmarke — der Bestand wächst, und ein neu erfasster Name darf die
// Quote drücken, ohne den Lauf rot zu färben. Fällt sie unter die Schwelle, ist entweder
// die Regelliste veraltet oder die Namenskonvention aufgegeben; beides gehört gesehen.
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../core/interop';
import { sourceKindOf } from '../../core/model/source-kinds';
import { realbestandText, realbestandVorhanden, fehlendHinweis, REALBESTAND } from './realdaten';

/** Anteil einordenbarer Quellen, unter dem die Ableitung ihren Zweck verfehlt. */
const MIN_QUOTE = 0.85;

describe.skipIf(!realbestandVorhanden())(`Gattungs-Ableitung an ${REALBESTAND.datei} (BL-373)`, () => {
  it(`ordnet mindestens ${MIN_QUOTE * 100} % der Quellen ohne Umbenennung ein — sonst: ${fehlendHinweis()}`, () => {
    const db = parseGedcom(realbestandText()).db;
    const quellen = [...db.sources.values()];
    // Zählung VOR der Zusicherung: eine Quote über einer leeren Menge wäre NaN und die
    // Schleife darunter grün, ohne etwas geprüft zu haben (Lehre ADR-v9-200).
    expect(quellen.length).toBeGreaterThan(100);

    const erkannt = quellen.filter((s) => sourceKindOf(s) !== 'sonstiges');
    expect(erkannt.length / quellen.length).toBeGreaterThanOrEqual(MIN_QUOTE);
  });

  it('verteilt die Quellen auf mehrere Gattungen — eine einzige wäre keine Einordnung', () => {
    const db = parseGedcom(realbestandText()).db;
    const quellen = [...db.sources.values()];
    expect(quellen.length).toBeGreaterThan(100);

    const gattungen = new Set(quellen.map((s) => sourceKindOf(s)));
    gattungen.delete('sonstiges');
    expect(gattungen.size).toBeGreaterThanOrEqual(4);
  });
});
