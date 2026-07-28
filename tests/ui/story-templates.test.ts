// tests/ui/story-templates.test.ts — Story-Satz-Templates (BL-183, Spec 20 §1.10).
// Reine Funktionen Event→Satz; Verhaltens-Orakel v8 `legacy-v8/ui-story.js`. Prüft die
// tragende Formulierung je Zweig, nicht nur „läuft durch". Wächter: bleibt unskipped.
import { describe, expect, it } from 'vitest';
import { makeEvent, makePerson } from '../../core/model';
import {
  atDate,
  atPlace,
  childSentence,
  eventSentence,
  fmtDate,
  mergeCareerSentence,
  mergeEducSentence,
  mergeGradSentence,
  mergeOccuSentence,
  mergeResiSentence,
  partnerSpan,
  pronoun,
  yearFromDate,
} from '../../ui/views/story/story-templates';

describe('pronoun (gegendert)', () => {
  it('männlich → Er/sein/Sohn', () => {
    const pr = pronoun(makePerson('I1', { sex: 'M', given: 'Otto' }));
    expect(pr.Er).toBe('Er');
    expect(pr.Sohn).toBe('Sohn');
    expect(pr.SohnArt).toBe('der');
  });
  it('weiblich → Sie/ihr/Tochter', () => {
    const pr = pronoun(makePerson('I2', { sex: 'F', given: 'Anna' }));
    expect(pr.Er).toBe('Sie');
    expect(pr.Sohn).toBe('Tochter');
    expect(pr.SohnArt).toBe('die');
  });
  it('unbekanntes Geschlecht → Vorname tritt an die Stelle von „Er"', () => {
    const pr = pronoun(makePerson('I3', { sex: 'U', given: 'Kim' }));
    expect(pr.Er).toBe('Kim');
    expect(pr.Sohn).toBe('Kind');
    expect(pr.SohnArt).toBe('das');
  });
});

describe('Datums-Prosa (atDate/fmtDate)', () => {
  it('Jahr-only → in Klammern', () => {
    expect(atDate({ date: '1850' })).toBe(' (1850)');
  });
  it('Monat+Jahr → „im Mai 1850"', () => {
    expect(atDate({ date: 'MAY 1850' })).toBe(' im Mai 1850');
  });
  it('volles Datum → „am 10. April 1850"', () => {
    expect(atDate({ date: '10 APR 1850' })).toBe(' am 10. April 1850');
  });
  it('Qualifier ABT → „um 1850" ohne „am"', () => {
    expect(atDate({ date: 'ABT 1850' })).toBe(' um 1850');
  });
  it('FROM…TO… → „von … bis …"', () => {
    expect(fmtDate('FROM 1850 TO 1870')).toBe('von 1850 bis 1870');
  });
  it('leeres/null Datum → leerer String', () => {
    expect(atDate({ date: null })).toBe('');
    expect(yearFromDate(null)).toBeNull();
    expect(yearFromDate('ABT 1863')).toBe(1863);
  });
});

describe('atPlace', () => {
  it('kürzt auf ersten Ortsteil, führt Adresszeile voran', () => {
    expect(atPlace({ addr: 'Hauptstr. 3', place: 'Detmold, Lippe, Deutschland' })).toBe(' in Hauptstr. 3, Detmold');
  });
  it('ohne Ort/Adresse → leer', () => {
    expect(atPlace({ addr: '', place: null })).toBe('');
  });
});

describe('eventSentence — Templates', () => {
  const pr = pronoun(makePerson('I1', { sex: 'M', given: 'Otto' }));
  it('OCCU', () => {
    expect(eventSentence(makeEvent('OCCU', { value: 'Schmied', date: '1875' }), pr)).toBe('Er war Schmied (1875).');
  });
  it('RESI mit Ort', () => {
    expect(eventSentence(makeEvent('RESI', { place: 'Detmold', date: '1880' }), pr)).toBe('Er lebte in Detmold (1880).');
  });
  it('BAPM', () => {
    expect(eventSentence(makeEvent('BAPM', { place: 'Lippe', date: '2 JAN 1850' }), pr)).toBe(
      'Er wurde getauft in Lippe am 2. Januar 1850.',
    );
  });
  it('GRAD mit Wert → Artikel „die"', () => {
    expect(eventSentence(makeEvent('GRAD', { value: 'Meisterprüfung', date: '1878' }), pr)).toBe(
      'Er erlangte (1878) die Meisterprüfung.',
    );
  });
});

describe('eventSentence — generischer Fallback (unbekannter Typ)', () => {
  const pr = pronoun(makePerson('I1', { sex: 'M', given: 'Otto' }));
  it('Wert + FROM-Datum → Tätigkeitssatz mit Zeitraum', () => {
    expect(eventSentence(makeEvent('EVEN', { value: 'Ratsherr', date: 'FROM 1880 TO 1890' }), pr)).toBe(
      'Er war Ratsherr (1880–1890).',
    );
  });
  it('Wert + konkretes Datum → Datum vorne', () => {
    expect(eventSentence(makeEvent('EVEN', { value: 'Notiz', date: '3 MAR 1875' }), pr)).toBe(
      'Am 3. März 1875: Notiz.',
    );
  });
});

describe('Merge-Sätze', () => {
  const pr = pronoun(makePerson('I1', { sex: 'M', given: 'Otto' }));
  it('OCCU einzeln (Arbeitgeber)', () => {
    expect(mergeOccuSentence([makeEvent('OCCU', { value: 'Fa. Krupp', date: '1875' })], pr)).toBe(
      'Er arbeitete bei Fa. Krupp (1875).',
    );
  });
  it('OCCU mehrfach → „… und später …"', () => {
    const out = mergeOccuSentence(
      [makeEvent('OCCU', { value: 'Lehrling', date: 'FROM 1870 TO 1873' }), makeEvent('OCCU', { value: 'Meister', date: '1880' })],
      pr,
    );
    expect(out).toBe('Er war Lehrling (1870–1873) und später Meister (1880).');
  });
  it('RESI ≤2 → Einzelsätze', () => {
    const out = mergeResiSentence([makeEvent('RESI', { place: 'Detmold', date: '1870' }), makeEvent('RESI', { place: 'Lemgo', date: '1880' })], pr);
    expect(out).toBe('Er lebte in Detmold (1870). Er lebte in Lemgo (1880).');
  });
  it('RESI 3+ → kompakte Ortsliste', () => {
    const out = mergeResiSentence(
      [
        makeEvent('RESI', { place: 'Detmold', date: '1870' }),
        makeEvent('RESI', { place: 'Lemgo', date: '1880' }),
        makeEvent('RESI', { place: 'Bielefeld', date: '1890' }),
      ],
      pr,
    );
    expect(out).toBe('Er wohnte in Detmold (1870), Lemgo (1880) und Bielefeld (1890).');
  });
  it('GRAD/EDUC/Career sind formuliert (kein Absturz bei leerer Liste)', () => {
    expect(mergeGradSentence([], pr)).toBe('');
    expect(mergeEducSentence([], pr)).toBe('');
    expect(mergeCareerSentence([], pr)).toBe('');
    expect(mergeCareerSentence([makeEvent('EVEN', { value: 'Bürgermeister', date: 'FROM 1885 TO 1895' })], pr)).toBe(
      'Er war Bürgermeister (1885–1895).',
    );
  });
});

describe('childSentence', () => {
  it('ein Kind', () => {
    expect(childSentence([{ name: 'Carl', year: 1880 }])).toBe('Das gemeinsame Kind war Carl (*1880).');
  });
  it('bis drei → „waren A, B und C"', () => {
    expect(childSentence([{ name: 'A', year: 1880 }, { name: 'B', year: 1882 }, { name: 'C', year: 1884 }])).toBe(
      'Die gemeinsamen Kinder waren A (*1880), B (*1882) und C (*1884).',
    );
  });
  it('vier bis sechs → aufgezählt mit Anzahl', () => {
    const out = childSentence([1, 2, 3, 4].map((n) => ({ name: 'K' + n, year: 1880 + n })));
    expect(out).toBe('Das Paar hatte 4 Kinder: K1 (*1881), K2 (*1882), K3 (*1883) und K4 (*1884).');
  });
  it('mehr als sechs → nur Anzahl', () => {
    const out = childSentence(Array.from({ length: 7 }, (_, i) => ({ name: 'K' + i, year: null })));
    expect(out).toBe('Das Paar hatte 7 Kinder.');
  });
  it('leere Liste → null', () => {
    expect(childSentence([])).toBeNull();
  });
});

describe('partnerSpan', () => {
  it('beide Jahre', () => {
    expect(partnerSpan(1820, 1902)).toBe(' (*1820, †1902)');
  });
  it('keins → leer', () => {
    expect(partnerSpan(null, null)).toBe('');
  });
});
