// Wire-Konventions-Matrix (Spec 11 §4.3) — je Konvention ein Fixture, das den
// erwarteten Auflösungspfad verriegelt.
import { describe, it, expect } from 'vitest';
import { resolveEvents } from '../../core/places/index';
import { place, hof, placeMap, hofMap, ev } from './places-fixtures';

const village = place('@OCHTRUP@', {
  title: 'Ochtrup',
  type: 'Town',
  enclosedBy: [{ placeId: '@DE@', from: null, to: null }],
});
const country = place('@DE@', { title: 'Deutschland', type: 'Country' });
const places = placeMap(village, country);

describe('Konvention 1 — Ancestris (PLAC Hof, Dorf, … + ADDR Hof)', () => {
  it('Hof existiert → Pfad A, PLAC bit-identisch (net_delta=0)', () => {
    const hofs = hofMap(
      hof('_hof_wall_33_ochtrup', '@OCHTRUP@', {
        addrs: [{ value: 'Wall 33', from: null, to: null }],
      }),
    );
    const source = ev('RESI', {
      place: 'Wall 33, Ochtrup, Deutschland',
      addr: 'Wall 33',
      date: '1900',
    });
    const res = resolveEvents([source], places, hofs);
    const r = res.events[0];
    expect(r.path).toBe('A');
    expect(r.event.hofId).toBe('_hof_wall_33_ochtrup');
    expect(r.event.placeId).toBe('@OCHTRUP@');
    // Wire-Treue: reprojiziertes PLAC == Eingabe (bit-identisch).
    expect(r.event.place).toBe('Wall 33, Ochtrup, Deutschland');
    // Idempotenz: kein neuer Hof gebootstrappt.
    expect(res.hofObjects.size).toBe(1);
  });

  it('Hof existiert nicht → Pfad C (Bootstrap), danach idempotent', () => {
    const source = ev('RESI', {
      place: 'Wall 33, Ochtrup, Deutschland',
      addr: 'Wall 33',
      date: '1900',
    });
    const res = resolveEvents([source], places, hofMap());
    expect(res.events[0].path).toBe('C');
    expect(res.hofObjects.size).toBe(1);
    const newHofId = res.events[0].event.hofId!;
    // Zweiter Lauf mit dem gebootstrappten Hof → Pfad A, keine weitere Anlage.
    const res2 = resolveEvents([source], places, res.hofObjects);
    expect(res2.events[0].path).toBe('A');
    expect(res2.events[0].event.hofId).toBe(newHofId);
    expect(res2.hofObjects.size).toBe(1);
  });
});

describe('Konvention 2 — MyHeritage/GRAMPS (PLAC Dorf + ADDR Hof)', () => {
  it('Hof-Typ, Hof existiert → Pfad B', () => {
    const hofs = hofMap(
      hof('_hof_wall_33_ochtrup', '@OCHTRUP@', {
        addrs: [{ value: 'Wall 33', from: null, to: null }],
      }),
    );
    const source = ev('RESI', { place: 'Ochtrup, Deutschland', addr: 'Wall 33', date: '1900' });
    const res = resolveEvents([source], places, hofs);
    expect(res.events[0].path).toBe('B');
    expect(res.events[0].event.hofId).toBe('_hof_wall_33_ochtrup');
  });

  it('Hof-Typ, Hof existiert nicht → Pfad B\' (Bootstrap); sichtbarer Übergang zu Konvention 1', () => {
    const source = ev('RESI', { place: 'Ochtrup, Deutschland', addr: 'Wall 33', date: '1900' });
    const res = resolveEvents([source], places, hofMap());
    expect(res.events[0].path).toBe("B'");
    expect(res.hofObjects.size).toBe(1);
    // Ehrlicher Übergang: PLAC bekommt beim Speichern den Hof-Präfix (Konvention-2→1).
    expect(res.events[0].event.place).toBe('Wall 33, Ochtrup, Deutschland');
  });

  it('Non-Hof-Typ mit ADDR ohne Hof-Match → Review Klasse A', () => {
    const source = ev('BIRT', { place: 'Ochtrup, Deutschland', addr: 'Wall 33', date: '1900' });
    const res = resolveEvents([source], places, hofMap());
    expect(res.events[0].event.hofId).toBeNull();
    expect(res.review).toHaveLength(1);
    expect(res.review[0].klass).toBe('A');
  });
});

describe('Konvention 3a — atomar, global eindeutig (PLAC Wall 33, kein ADDR)', () => {
  it('atomarer Ort mit PO-Match → Verwaltungs-Match (kein Hof)', () => {
    const atomicPlaces = placeMap(place('@WALL@', { title: 'Wall 33', type: 'Village' }));
    const source = ev('RESI', { place: 'Wall 33', date: '1900' });
    const res = resolveEvents([source], atomicPlaces, hofMap());
    expect(res.events[0].path).toBe('atomic-po');
    expect(res.events[0].event.placeId).toBe('@WALL@');
  });

  it('atomar ohne PO, aber global eindeutiger Hof → Pfad A\'', () => {
    const hofs = hofMap(
      hof('_hof_wall_33_ochtrup', '@OCHTRUP@', {
        addrs: [{ value: 'Wall 33', from: null, to: null }],
      }),
    );
    const source = ev('RESI', { place: 'Wall 33', date: '1900' });
    const res = resolveEvents([source], places, hofs);
    expect(res.events[0].path).toBe("A'");
    expect(res.events[0].event.hofId).toBe('_hof_wall_33_ochtrup');
    expect(res.events[0].event.placeId).toBe('@OCHTRUP@');
  });
});

describe('Konvention 3b — atomar, ohne Match → Review / Quelle schärfen', () => {
  it('atomarer Ort ohne PO und ohne Hof → nicht aufgelöst (kein Link)', () => {
    const source = ev('RESI', { place: 'Wall 33', date: '1900' });
    const res = resolveEvents([source], places, hofMap());
    expect(res.events[0].path).toBe('none');
    expect(res.events[0].event.placeId).toBeNull();
    expect(res.events[0].event.hofId).toBeNull();
    // ev.place bleibt Wire-Wert (nichts reprojiziert).
    expect(res.events[0].event.place).toBe('Wall 33');
  });
});
