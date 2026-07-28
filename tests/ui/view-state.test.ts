// tests/ui/view-state.test.ts — INV-VS (Spec 21 §5, Kontrakt-Matrix Spec 32 §6):
// genau EINE zentrale Instanz verwaltet die aktuelle Auswahl je Ziel, inklusive
// Change-Event; bei fehlender Entität ein definierter Fallback (nie stiller Abbruch).
//
// Reine Zustands-/Vertragslogik ohne DOM — läuft bewusst im node-Environment
// (TST-5 Testpyramide: Logik so tief wie möglich testen, nicht als Component-Test).
import { describe, expect, it } from 'vitest';
import { createViewState } from '../../ui/shell/view-state.svelte';

describe('INV-VS — eine zentrale ViewState-Instanz', () => {
  it('startet mit keiner Auswahl je Ziel (definierter Ausgangszustand, kein undefined)', () => {
    const vs = createViewState();
    expect(vs.getCurrent('person')).toBeNull();
    expect(vs.getCurrent('lensFocus')).toBeNull();
  });

  it('setCurrent/getCurrent bilden den EINEN Weg, die Auswahl je Ziel zu lesen/schreiben', () => {
    const vs = createViewState();
    vs.setCurrent('person', '@I1@');
    expect(vs.getCurrent('person')).toBe('@I1@');
    // Ziele sind unabhängig voneinander (kein gemeinsamer "currentX"-Topf wie in v8).
    expect(vs.getCurrent('lensFocus')).toBeNull();
  });

  it('feuert das Change-Event genau einmal pro setCurrent-Aufruf, mit Ziel und id', () => {
    const vs = createViewState();
    const calls: Array<[string, string | null]> = [];
    const unsubscribe = vs.subscribe((target, id) => calls.push([target, id]));

    vs.setCurrent('person', '@I7@');

    expect(calls).toEqual([['person', '@I7@']]);
    unsubscribe();
  });

  it('unsubscribe beendet den Empfang zuverlässig (kein Leck über Test-/Komponentengrenzen)', () => {
    const vs = createViewState();
    const calls: Array<[string, string | null]> = [];
    const unsubscribe = vs.subscribe((target, id) => calls.push([target, id]));
    unsubscribe();

    vs.setCurrent('person', '@I9@');

    expect(calls).toEqual([]);
  });

  it('setCurrent(target, null) ist der definierte Fallback bei fehlender Entität — kein Wurf, kein stiller Abbruch', () => {
    const vs = createViewState();
    vs.setCurrent('person', '@I1@');

    vs.setCurrent('person', null);

    expect(vs.getCurrent('person')).toBeNull();
  });

  it('zwei unabhängig erzeugte Instanzen teilen keinen Zustand (keine versteckte Modul-Singleton-Kopplung)', () => {
    const a = createViewState();
    const b = createViewState();

    a.setCurrent('person', '@I1@');

    expect(a.getCurrent('person')).toBe('@I1@');
    expect(b.getCurrent('person')).toBeNull();
  });

  it('lensFocus ist EIN geteilter Slot für alle Kontext-Fokus-Lenses (Spec 21 §4: "Fokus bleibt beim Lens-Wechsel erhalten") — kein separater Slot je Lens', () => {
    const vs = createViewState();

    // Baum schreibt den Fokus...
    vs.setCurrent('lensFocus', '@I1@');
    // ...eine künftige Karten-Lens läse denselben Slot, nicht einen eigenen "map"-Topf.
    expect(vs.getCurrent('lensFocus')).toBe('@I1@');
  });

  it('lensPlaceFocus ist ein EIGENER Slot, unabhängig von lensFocus (ADR-v9-78 Punkt 4 — einmaliger Orts-Sprung-Auftrag, kein Dauer-Personen-Fokus)', () => {
    const vs = createViewState();
    expect(vs.getCurrent('lensPlaceFocus')).toBeNull();

    vs.setCurrent('lensPlaceFocus', 'P1');

    expect(vs.getCurrent('lensPlaceFocus')).toBe('P1');
    expect(vs.getCurrent('lensFocus')).toBeNull();
  });

  it('media (BL-126, Medien-Segment) ist ein EIGENER Slot, unabhängig von den übrigen Entitäts-Zielen (kein gemeinsamer currentX-Topf)', () => {
    const vs = createViewState();
    expect(vs.getCurrent('media')).toBeNull();

    vs.setCurrent('source', '@S1@');
    vs.setCurrent('media', 'fotos/anna.jpg');

    expect(vs.getCurrent('media')).toBe('fotos/anna.jpg');
    expect(vs.getCurrent('source')).toBe('@S1@');
  });
});
