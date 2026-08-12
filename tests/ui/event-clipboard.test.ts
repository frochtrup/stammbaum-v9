// tests/ui/event-clipboard.test.ts — Ereignis-Zwischenablage (BL-212, ADR-v9-156).
// Transienter Sitzungszustand, kein persistierter Speicher (Kategorie A) — geprüft wird
// vor allem die Entkopplung: eine Kopie darf nie ein geteiltes Objekt mit dem Original
// oder mit einer zweiten Einfügung sein, sonst schriebe eine spätere Änderung an der
// einen Person still in die andere.
import { describe, expect, it } from 'vitest';
import { makeEvent, makeCitation } from '../../core/model';
import { createEventClipboard } from '../../ui/shell/event-clipboard.svelte';

describe('EventClipboard', () => {
  it('ist anfangs leer', () => {
    const c = createEventClipboard();
    expect(c.value).toBeNull();
    expect(c.label).toBe('');
    expect(c.take()).toBeNull();
  });

  it('gibt dem kopierten EREIGNIS eine frische Identität, behält die der Zitate (ADR-v9-260)', () => {
    const c = createEventClipboard();
    const original = makeEvent('RESI', {
      place: 'Ochtrup',
      grampsId: 'E0007',
      citations: [makeCitation('@S1@', { page: '12', grampsId: 'C0042' })],
    });

    c.copy(original, 'Wohnort');

    // Ein `<event>` ist ein Geschehen BEI EINEM BESITZER — „⧉ Übernehmen" hängt es an eine
    // andere Person, also ist es dort nicht derselbe Record.
    expect(c.value?.grampsId).toBeNull();
    // Eine Fundstelle dagegen ist dieselbe, egal wer sie zitiert: in GRAMPS EIN geteilter
    // Record mit mehreren Besitzern, keine Dublette.
    expect(c.value?.citations[0].grampsId).toBe('C0042');
  });

  it('merkt sich Ereignis und Beschriftung', () => {
    const c = createEventClipboard();
    c.copy(makeEvent('RESI', { place: 'Ochtrup' }), 'Wohnort');
    expect(c.label).toBe('Wohnort');
    expect(c.value?.place).toBe('Ochtrup');
  });

  it('legt eine TIEFE Kopie ab — spätere Änderungen am Original ändern die Ablage nicht', () => {
    const c = createEventClipboard();
    const original = makeEvent('RESI', { place: 'Ochtrup', citations: [makeCitation('@S1@', { page: '12' })] });
    c.copy(original, 'Wohnort');
    original.place = 'Rheine';
    original.citations[0].page = '99';
    expect(c.value?.place).toBe('Ochtrup');
    expect(c.value?.citations[0].page).toBe('12');
  });

  it('liefert bei jedem take() ein eigenes Objekt — zwei Einfügungen teilen nichts', () => {
    const c = createEventClipboard();
    c.copy(makeEvent('RESI', { place: 'Ochtrup', citations: [makeCitation('@S1@')] }), 'Wohnort');
    const a = c.take()!;
    const b = c.take()!;
    expect(a).not.toBe(b);
    expect(a.citations[0]).not.toBe(b.citations[0]);
    a.place = 'Rheine';
    expect(b.place).toBe('Ochtrup');
    // Und die Ablage selbst bleibt unberührt, bleibt also mehrfach einfügbar.
    expect(c.value?.place).toBe('Ochtrup');
  });

  it('clear() leert Ablage und Beschriftung', () => {
    const c = createEventClipboard();
    c.copy(makeEvent('OCCU', { value: 'Schmied' }), 'Beruf');
    c.clear();
    expect(c.value).toBeNull();
    expect(c.label).toBe('');
  });

  it('zwei Instanzen sind unabhängig (kein Modul-Singleton)', () => {
    const a = createEventClipboard();
    const b = createEventClipboard();
    a.copy(makeEvent('OCCU', { value: 'Schmied' }), 'Beruf');
    expect(b.value).toBeNull();
  });
});
