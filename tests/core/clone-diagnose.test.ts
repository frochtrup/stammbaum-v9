// tests/core/clone-diagnose.test.ts — die Klon-Diagnose (core/clone-diagnose.ts).
//
// Der Zweck der Einheit ist eine AUSSAGE, kein Rückgabewert: „welches Feld verhindert das
// Speichern". Die Tests prüfen deshalb den Pfad, nicht nur, dass irgendetwas gefunden wird
// — ein Finder, der immer die Wurzel meldet, wäre grün und wertlos.
import { describe, expect, it } from 'vitest';
import { findeKlonHindernis, klonFehlerText, beschreibeWert, klonen } from '../../core/clone-diagnose';

describe('findeKlonHindernis — sauberer Wert', () => {
  it('gibt null zurück, wenn alles klonbar ist', () => {
    expect(findeKlonHindernis({ a: 1, b: [1, 2], c: new Map([['k', { d: 'x' }]]) })).toBeNull();
  });

  it('erkennt auch die üblichen Genealogie-Bausteine als klonbar (Map, verschachtelte Arrays, null)', () => {
    const db = {
      individuals: new Map([['@I1@', { id: '@I1@', events: [{ type: 'BIRT', date: null, citations: [] }] }]]),
      families: new Map(),
    };
    expect(findeKlonHindernis(db)).toBeNull();
  });
});

describe('findeKlonHindernis — Pfad zum Hindernis', () => {
  it('nennt den Property-Pfad einer Funktion in der Tiefe', () => {
    const h = findeKlonHindernis({ a: 1, b: { c: { d: () => 1 } } });
    expect(h?.pfad).toBe('.b.c.d');
    expect(h?.containerSelbst).toBe(false);
  });

  it('nennt den Index eines Array-Elements', () => {
    const h = findeKlonHindernis({ events: [{ ok: 1 }, { schlecht: Symbol('x') }] });
    expect(h?.pfad).toBe('.events[1].schlecht');
  });

  it('nennt den Map-Schlüssel — der Fall, um den es bei Personen/Orten geht', () => {
    const h = findeKlonHindernis({
      individuals: new Map([
        ['@I1@', { id: '@I1@', ok: true }],
        ['@I2@', { id: '@I2@', ref: () => 1 }],
      ]),
    });
    expect(h?.pfad).toBe('.individuals.get(@I2@).ref');
  });

  it('meldet den Container selbst, wenn kein einzelnes Kind schuld ist (Proxy)', () => {
    // Beide Engines lehnen Proxies ab, obwohl jedes Feld für sich klonbar ist — genau
    // dieser Fall führt sonst zu endloser Suche nach einem Feld, das es nicht gibt.
    const h = findeKlonHindernis({ zustand: new Proxy({ a: 1 }, {}) });
    expect(h?.pfad).toBe('.zustand');
    expect(h?.containerSelbst).toBe(true);
  });

  it('behandelt einen Set-Eintrag wie ein Array-Element', () => {
    const h = findeKlonHindernis({ menge: new Set([1, () => 2]) });
    expect(h?.pfad).toBe('.menge#1');
  });

  it('meldet leeren Pfad, wenn der übergebene Wert selbst das Hindernis ist', () => {
    const h = findeKlonHindernis(() => 1);
    expect(h?.pfad).toBe('');
    expect(h?.wert).toContain('Funktion');
  });
});

describe('beschreibeWert', () => {
  it('nennt Klassennamen und id, wo vorhanden — damit die Meldung den Datensatz benennt', () => {
    expect(beschreibeWert({ id: '@I42@' })).toBe('Object (id: @I42@)');
  });

  it('nennt den Funktionsnamen', () => {
    function halloWelt() {}
    expect(beschreibeWert(halloWelt)).toBe('Funktion „halloWelt"');
  });

  it('kürzt lange primitive Werte, statt die Meldung zu fluten', () => {
    expect(beschreibeWert('x'.repeat(500)).length).toBeLessThan(60);
  });
});

describe('klonFehlerText — der Satz, den der Nutzer sieht', () => {
  it('nennt Kontext, Hindernis und Pfad', () => {
    const txt = klonFehlerText({ individuals: new Map([['@I1@', { id: '@I1@', f: () => 1 }]]) }, 'Speichern der Arbeitskopie');
    expect(txt).toContain('Speichern der Arbeitskopie');
    expect(txt).toContain('.individuals.get(@I1@).f');
    expect(txt).toContain('Funktion');
  });

  it('behauptet NICHTS, wenn die Nachmessung nichts findet — kein erfundener Ort', () => {
    const txt = klonFehlerText({ a: 1 }, 'Speichern');
    expect(txt).toContain('keinen unklonbaren Bestandteil');
    expect(txt).not.toContain('bei .');
  });

  it('weist beim Proxy-Fall darauf hin, dass die Bestandteile unverdächtig sind', () => {
    const txt = klonFehlerText({ zustand: new Proxy({ a: 1 }, {}) }, 'Speichern');
    expect(txt).toContain('Proxy');
  });
});

// Der Kern-Chokepoint: jede Bearbeitung läuft über `editDatabase` → `thaw` → `klonen`.
// Kippt dort etwas, muss die Meldung den Datensatz benennen — sonst steht der Nutzer vor
// „The object can not be cloned." und niemand weiß, welche Person gemeint ist.
describe('klonen — der Kern-Chokepoint meldet verortet', () => {
  it('gibt bei klonbarem Wert eine echte Kopie zurück (kein Durchreichen der Referenz)', () => {
    const original = { id: '@I1@', events: [{ type: 'BIRT' }] };
    const kopie = klonen(original, 'Test');
    expect(kopie).toEqual(original);
    expect(kopie).not.toBe(original);
    expect(kopie.events).not.toBe(original.events);
  });

  it('wirft mit Kontext, Pfad und Feldbeschreibung statt der nackten Browser-Meldung', () => {
    const person = { id: '@I42@', events: [{ type: 'OCCU', gestrandet: () => 1 }] };
    expect(() => klonen(person, 'Kopie eines Datensatzes zum Bearbeiten')).toThrow(
      /Kopie eines Datensatzes zum Bearbeiten.*Funktion.*\.events\[0\]\.gestrandet/s,
    );
  });

  it('behält den ursprünglichen Fehler als `cause` — die Konsole verliert nichts', () => {
    try {
      klonen({ f: () => 1 }, 'Test');
      expect.unreachable('hätte werfen müssen');
    } catch (err) {
      expect((err as Error).cause).toBeInstanceOf(Error);
      expect(((err as Error).cause as Error).name).toBe('DataCloneError');
    }
  });

  it('reicht Fehler durch, die NICHTS mit dem Klonen zu tun haben', () => {
    const boese = { get feld() { throw new TypeError('kaputter Getter'); } };
    expect(() => klonen(boese, 'Test')).toThrow(TypeError);
  });
});
