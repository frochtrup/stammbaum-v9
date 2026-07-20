// tests/core/model/event-empty.test.ts — isEventEmpty (Nachtrag 2026-07-12, Spec 20 §2
// „Generalisiert"): steuert die generalisierte ✕-Rücknahme jeder Ereigniszeile
// (Sonder-Ereignis ODER events[]-Eintrag). Anders als `isEventPresent` ignoriert dieser
// Test bewusst `seen` (ein reines Bookkeeping-Flag zählt hier als "leer") — s. Kommentar
// an core/model/event.ts.
import { describe, it, expect } from 'vitest';
import { makeEvent, makeCitation, isEventEmpty, isEventPresent } from '../../../core/model/index';

describe('isEventEmpty', () => {
  it('ein frisch angelegtes Event (makeEvent, keine weiteren Felder) ist leer', () => {
    expect(isEventEmpty(makeEvent('CHR'))).toBe(true);
  });

  it('ein reines `seen`-Flag ohne sonstigen Inhalt gilt als leer (Unterschied zu isEventPresent)', () => {
    const ev = makeEvent('OCCU', { seen: true });
    expect(isEventPresent(ev)).toBe(true);
    expect(isEventEmpty(ev)).toBe(true);
  });

  it.each([
    ['value', { value: 'Landwirt' }],
    ['date', { date: '1900' }],
    ['place', { place: 'Ochtrup' }],
    ['placeId', { placeId: '@P1@' }],
    ['hofId', { hofId: '@H1@' }],
    ['addr', { addr: 'Hof 3' }],
    ['note', { note: 'Notiz' }],
    ['datePhrase', { datePhrase: 'kurz nach Weihnachten' }],
    ['eventType', { eventType: 'Beschäftigung' }],
    ['lati', { lati: 52.1 }],
    ['long', { long: 7.6 }],
  ] as const)('ist NICHT leer, sobald %s belegt ist', (_field, patch) => {
    expect(isEventEmpty(makeEvent('EVEN', patch))).toBe(false);
  });

  it('ist NICHT leer, sobald mindestens ein Quellen-Zitat vorhanden ist', () => {
    const ev = makeEvent('OCCU', { citations: [makeCitation('@S1@')] });
    expect(isEventEmpty(ev)).toBe(false);
  });

  it('ist NICHT leer, sobald Medien vorhanden sind (nicht über EventEditModal löschbar — Datenverlust-Vermeidung)', () => {
    const ev = makeEvent('OCCU', { media: [{ file: 'foto.jpg', title: '' }] });
    expect(isEventEmpty(ev)).toBe(false);
  });
});
