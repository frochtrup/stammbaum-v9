// INV-P5: Ein `seen`-Flag auf Sonder-Ereignissen bewahrt leere-aber-vorhandene Blöcke
//         (`1 BIRT` ohne Sub-Tags bleibt beim Roundtrip erhalten). Spec 10 §6, §5.1.
// Zusätzlich: Event-Feld-Tristate date/place — null (Tag fehlt) vs '' (Tag leer) vs Wert.
import { describe, it, expect } from 'vitest';
import { makeEvent, isEventPresent } from '../../core/model/index';

describe('INV-P5: seen-Flag bewahrt leere Sonder-Ereignisse', () => {
  it('ein frisch angelegtes Event ist standardmäßig NICHT gesehen', () => {
    const ev = makeEvent('BIRT');
    expect(ev.seen).toBe(false);
    expect(isEventPresent(ev)).toBe(false);
  });

  it('ein leeres-aber-vorhandenes BIRT (seen=true) gilt als vorhanden', () => {
    const ev = makeEvent('BIRT', { seen: true });
    // Kein Datum, kein Ort, kein Wert — aber `1 BIRT` war da.
    expect(ev.date).toBeNull();
    expect(ev.place).toBeNull();
    expect(isEventPresent(ev)).toBe(true);
  });

  it('ein Event mit belegtem Feld gilt als vorhanden, auch ohne seen', () => {
    expect(isEventPresent(makeEvent('BIRT', { date: '12 MAR 1890' }))).toBe(true);
    expect(isEventPresent(makeEvent('BIRT', { place: 'Hildesheim' }))).toBe(true);
    expect(isEventPresent(makeEvent('OCCU', { value: 'Landwirt' }))).toBe(true);
  });

  it('Tristate: null (Tag fehlt) ≠ "" (Tag vorhanden, leer) ≠ Wert', () => {
    const missing = makeEvent('BIRT');
    const emptyTag = makeEvent('BIRT', { seen: true, date: '', place: '' });
    const withValue = makeEvent('BIRT', { date: '1890', place: 'Hildesheim' });

    expect(missing.date).toBeNull();
    expect(emptyTag.date).toBe('');
    expect(withValue.date).toBe('1890');

    // Ein vorhandenes-aber-leeres Datum (`2 DATE` ohne Wert) ist vorhanden.
    expect(isEventPresent(emptyTag)).toBe(true);
    // Ein fehlendes Datum ohne seen ist nicht vorhanden.
    expect(isEventPresent(missing)).toBe(false);
  });
});
