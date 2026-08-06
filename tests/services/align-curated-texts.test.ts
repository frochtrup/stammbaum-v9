// tests/services/align-curated-texts.test.ts — der Autoritäts-Satz aus ADR-v9-224:
// hängt ein Ereignis an KURATIERTEM Ortswissen, IST der Dateitext die periodengerechte
// Projektion; hängt es an einem Seed-Objekt, bleibt die Quelle stehen.
//
// Die Fälle hier sind die vier, die am Realbestand gemessen wurden (2026-08-05), plus die
// zwei Sperren. Reine Funktion, deshalb Unit- statt Component-Test (TST-5).
import { describe, expect, it } from 'vitest';
import { alignCuratedEventTexts } from '../../services/places';
import { makeDatabase, makePerson, makeEvent } from '../../core/model/index';
import type { Database } from '../../core/model/types';
import { place } from '../core/places-fixtures';

/** Dorf unter Elter; das Ereignis hängt am Dorf und trägt den Text der Quelle. */
function bestand(opts: {
  elter: Parameters<typeof place>[1];
  dorf?: Parameters<typeof place>[1];
  text: string;
  jahr?: string;
}): Database {
  const db = makeDatabase();
  db.placeObjects.set('@ELTER@', place('@ELTER@', opts.elter));
  db.placeObjects.set(
    '@DORF@',
    place('@DORF@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@ELTER@', from: null, to: null }], ...opts.dorf }),
  );
  db.individuals.set(
    '@I1@',
    makePerson('@I1@', {
      birth: makeEvent('BIRT', { place: opts.text, date: opts.jahr ?? '3 MAR 1750', placeId: '@DORF@' }),
    }),
  );
  return db;
}

const textVon = (db: Database): string | null => db.individuals.get('@I1@')!.birth!.place;

describe('alignCuratedEventTexts — kuratiertes Wissen gewinnt (ADR-v9-224)', () => {
  it('periodengerechte Umbenennung am ELTERNGLIED landet im Text (der häufigste Fall: 232 von 279)', () => {
    const db = bestand({
      elter: { title: 'Kreis Steinfurt', pnames: [{ value: 'Amt Ochtrup', from: 1700, to: 1800 }] },
      text: 'Ochtrup, Kreis Steinfurt',
    });
    const res = alignCuratedEventTexts(db);
    expect(res.geaendert).toBe(1);
    expect(textVon(res.db)).toBe('Ochtrup, Amt Ochtrup');
    expect(res.luecken).toEqual([]);
  });

  it('Anreicherung: die Quelle nennt nur den Ort, die Kette kommt dazu', () => {
    const db = bestand({ elter: { title: 'Kreis Steinfurt', note: 'kuratiert' }, text: 'Ochtrup' });
    const res = alignCuratedEventTexts(db);
    expect(textVon(res.db)).toBe('Ochtrup, Kreis Steinfurt');
  });

  it('SEED-Objekte bleiben unangetastet — dort kann die Projektion nichts hinzufügen, nur verlieren', () => {
    // Beide Objekte im Seed-Rohzustand: ein undatiertes enclosedBy, sonst nichts (§9.1).
    const db = bestand({ elter: { title: 'Kreis Steinfurt' }, text: ', Ochtrup, , , Kreis Steinfurt' });
    const res = alignCuratedEventTexts(db);
    expect(res.geaendert).toBe(0);
    expect(textVon(res.db)).toBe(', Ochtrup, , , Kreis Steinfurt'); // Leerfelder bleiben stehen
  });

  it('VERARMUNGS-SPERRE: eine Ebene, die der Bestand nicht kennt, wird nicht überschrieben', () => {
    const db = bestand({
      elter: { title: 'Nordrhein-Westfalen', note: 'kuratiert' }, // kennt kein Deutschland darüber
      text: 'Ochtrup, Nordrhein-Westfalen, Deutschland',
    });
    const res = alignCuratedEventTexts(db);
    expect(res.geaendert).toBe(0);
    expect(textVon(res.db)).toBe('Ochtrup, Nordrhein-Westfalen, Deutschland');
    expect(res.luecken).toHaveLength(1);
    expect(res.luecken[0].quelle).toContain('Deutschland');
    expect(res.luecken[0].projektion).not.toContain('Deutschland');
  });

  it('Umbenennung ist KEINE Verarmung — der Knoten trägt das Segment unter einem anderen Namen', () => {
    // Genau die Unterscheidung, an der die erste Fassung der Sperre scheiterte: „Kreis
    // Steinfurt" verschwindet aus dem Text, der KNOTEN bleibt (unter seinem Namen für 1750).
    const db = bestand({
      elter: { title: 'Kreis Steinfurt', pnames: [{ value: 'Amt Ochtrup', from: 1700, to: 1800 }] },
      text: 'Ochtrup, Kreis Steinfurt',
    });
    expect(alignCuratedEventTexts(db).luecken).toEqual([]);
  });

  it('idempotent: der zweite Lauf ändert nichts mehr', () => {
    const db = bestand({
      elter: { title: 'Kreis Steinfurt', pnames: [{ value: 'Amt Ochtrup', from: 1700, to: 1800 }] },
      text: 'Ochtrup, Kreis Steinfurt',
    });
    const einmal = alignCuratedEventTexts(db);
    const zweimal = alignCuratedEventTexts(einmal.db);
    expect(zweimal.geaendert).toBe(0);
    expect(textVon(zweimal.db)).toBe(textVon(einmal.db));
  });

  it('lässt UNGEBUNDENE Ereignisse in Ruhe (dort gibt es kein Wissen, dem der Text folgen könnte)', () => {
    const db = bestand({ elter: { title: 'Kreis Steinfurt', note: 'kuratiert' }, text: 'Irgendwo' });
    db.individuals.get('@I1@')!.birth!.placeId = null;
    const res = alignCuratedEventTexts(db);
    expect(res.geaendert).toBe(0);
    expect(textVon(res.db)).toBe('Irgendwo');
  });

  it('mutiert die Eingabe nicht (Copy-on-Write, ADR-v9-92)', () => {
    const db = bestand({
      elter: { title: 'Kreis Steinfurt', pnames: [{ value: 'Amt Ochtrup', from: 1700, to: 1800 }] },
      text: 'Ochtrup, Kreis Steinfurt',
    });
    const vorher = textVon(db);
    const res = alignCuratedEventTexts(db);
    expect(textVon(db)).toBe(vorher); // Original unangetastet
    expect(textVon(res.db)).not.toBe(vorher);
  });
});
