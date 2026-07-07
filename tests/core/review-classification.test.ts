// Review-Klassifikation A/C/D (Spec 11 §6). Ungewissheit bleibt sichtbar — kein
// per-Event-Override, kein stiller Guess.
import { describe, it, expect } from 'vitest';
import { resolveEvents } from '../../core/places/index';
import { place, hof, placeMap, hofMap, ev } from './places-fixtures';

const places = placeMap(
  place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town', pnames: [{ value: 'Ochtorpe', from: 1200, to: 1500 }] }),
  place('@DE@', { title: 'Deutschland', type: 'Country' }),
);

describe('Review-Klasse A — Non-Hof-Event-Typ mit ADDR ohne Hof-Match', () => {
  it('BIRT + ADDR ohne existierende Höfe im Dorf → Klasse A', () => {
    const res = resolveEvents(
      [ev('BIRT', { place: 'Ochtrup, Deutschland', addr: 'Wall 33', date: '1900' })],
      places,
      hofMap(),
    );
    expect(res.events[0].event.hofId).toBeNull();
    expect(res.review).toHaveLength(1);
    expect(res.review[0].klass).toBe('A');
    expect(res.review[0].addr).toBe('Wall 33');
    expect(res.review[0].eventType).toBe('BIRT');
  });
});

describe('Review-Klasse C — ≥2 Höfe gleicher Adresse im Dorf (mehrdeutig)', () => {
  it('Hof-Typ + ADDR, zwei Höfe gleicher Adresse → Klasse C mit Kandidaten', () => {
    const hofs = hofMap(
      hof('_hof_a', '@OCHTRUP@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
      hof('_hof_b', '@OCHTRUP@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
    );
    const res = resolveEvents(
      [ev('RESI', { place: 'Ochtrup, Deutschland', addr: 'Wall 33', date: '1900' })],
      places,
      hofs,
    );
    expect(res.events[0].event.hofId).toBeNull();
    expect(res.review).toHaveLength(1);
    expect(res.review[0].klass).toBe('C');
    expect(res.review[0].candidates.slice().sort()).toEqual(['_hof_a', '_hof_b']);
  });
});

describe('Review-Klasse D — Norm-Drift: ADDR matcht keinen Hof, aber Höfe existieren', () => {
  it('Non-Hof-Typ + ADDR, unpassend, aber Dorf hat Höfe → Klasse D', () => {
    const hofs = hofMap(
      hof('_hof_existing', '@OCHTRUP@', { addrs: [{ value: 'Oster 5', from: null, to: null }] }),
    );
    const res = resolveEvents(
      [ev('DEAT', { place: 'Ochtrup, Deutschland', addr: 'Wall 33', date: '1900' })],
      places,
      hofs,
    );
    expect(res.events[0].event.hofId).toBeNull();
    expect(res.review).toHaveLength(1);
    expect(res.review[0].klass).toBe('D');
  });
});

describe('ADDR=Village-Redundanz — kein Pseudo-Hof, kein Review', () => {
  it('ADDR == Dorfname → keine Hof-Anlage, kein Review-Eintrag', () => {
    const res = resolveEvents(
      [ev('RESI', { place: 'Ochtrup, Deutschland', addr: 'Ochtrup', date: '1900' })],
      places,
      hofMap(),
    );
    expect(res.hofObjects.size).toBe(0);
    expect(res.review).toHaveLength(0);
    expect(res.events[0].event.hofId).toBeNull();
  });

  it('ADDR == pname-Variante des Dorfes → ebenfalls kein Pseudo-Hof', () => {
    const res = resolveEvents(
      [ev('RESI', { place: 'Ochtrup, Deutschland', addr: 'Ochtorpe', date: '1300' })],
      places,
      hofMap(),
    );
    expect(res.hofObjects.size).toBe(0);
    expect(res.events[0].event.hofId).toBeNull();
  });
});
