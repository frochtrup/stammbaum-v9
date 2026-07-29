// tests/ui/lens-jump.test.ts — Personen-Kontext-Sprung in eine Lens (BL-60, ADR-v9-153,
// Spec 20 §1.9 „Ebenfalls vorgesehen", Spec 21 §4).
//
// Build-freier Reiner-Zustands-Test (Spec 32): `focusPersonInLens` fasst nur ViewState-
// und Route-Slots an, kein DOM. Der Wächter, auf den es ankommt, ist der ZWEITE Sprung
// (s. u.): nur `lensFocus` zu setzen genügt nicht, weil Karte/Zeitleiste seit ADR-v9-102
// eine eigene Auswahl halten und `lensFocus` für sie nur eine Vorbelegung ist.
import { describe, expect, it } from 'vitest';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { createRoute } from '../../ui/shell/route.svelte';
import { focusPersonInLens } from '../../ui/shell/lens-jump';

describe('focusPersonInLens (BL-60)', () => {
  it('Baum: setzt den geteilten Fokus und navigiert', () => {
    const vs = createViewState();
    const route = createRoute();
    focusPersonInLens(vs, route, '@I1@', 'tree');
    expect(vs.getCurrent('lensFocus')).toBe('@I1@');
    expect(route.target).toBe('tree');
  });

  it('Karte: setzt ZUSÄTZLICH die karten-eigene Auswahl UND den Personen-Modus', () => {
    const vs = createViewState();
    const route = createRoute();
    focusPersonInLens(vs, route, '@I1@', 'map');
    expect(vs.getCurrent('lensFocus')).toBe('@I1@');
    expect(vs.getCurrent('mapPerson')).toBe('@I1@');
    // Ohne den Modus zeigte die Karte die gesetzte Person gar nicht (sie ist nur im
    // Personen-Modus sichtbar) — ein erhaltener Zustand, den ein zweiter verdeckt, ist
    // aus Nutzersicht nicht erhalten (ADR-v9-102).
    expect(route.mapMode).toBe('person');
    expect(route.target).toBe('map');
  });

  it('Zeitleiste: setzt die zeitleisten-eigene Personenliste auf genau diese Person', () => {
    const vs = createViewState();
    const route = createRoute();
    vs.setTimelinePersons(['@I9@', '@I8@']);
    focusPersonInLens(vs, route, '@I1@', 'timeline');
    expect(vs.getTimelinePersons()).toEqual(['@I1@']);
    expect(route.target).toBe('timeline');
  });

  it('Story: lässt einen alten Familien-Fokus fallen und wählt den Personen-Modus', () => {
    const vs = createViewState();
    const route = createRoute();
    vs.setCurrent('storyFamily', '@F7@');
    focusPersonInLens(vs, route, '@I1@', 'story');
    expect(vs.getCurrent('storyFamily')).toBeNull();
    expect(route.storyMode).toBe('person');
    expect(route.target).toBe('story');
  });

  // DER eigentliche Wächter. Ein Sprung, der nur `lensFocus` setzte, wirkte beim ersten
  // Mal (die Karte hatte noch keine eigene Auswahl → Vorbelegung greift) und ab dann nie
  // wieder — die Karte zeigte weiter die zuerst gewählte Person. Genau diese Halbheit
  // hätte kein Einzel-Slot-Test gefangen.
  it('ein ZWEITER Sprung auf eine andere Person überschreibt die lens-eigene Auswahl', () => {
    const vs = createViewState();
    const route = createRoute();
    focusPersonInLens(vs, route, '@I1@', 'map');
    focusPersonInLens(vs, route, '@I2@', 'map');
    expect(vs.getCurrent('mapPerson')).toBe('@I2@');
    expect(vs.getCurrent('lensFocus')).toBe('@I2@');
  });

  // INV-VS bleibt gewahrt: die Slots sind weiterhin unabhängig — hier setzt ein KOMMANDO
  // mehrere davon explizit, `setCurrent` selbst koppelt nichts (die Kopplung IN
  // `setCurrent` war der Fehler, den ADR-v9-102 verworfen hat).
  it('ein Baum-Sprung rührt weder mapPerson noch die Zeitleisten-Liste an', () => {
    const vs = createViewState();
    const route = createRoute();
    vs.setCurrent('mapPerson', '@I5@');
    vs.setTimelinePersons(['@I6@']);
    focusPersonInLens(vs, route, '@I1@', 'tree');
    expect(vs.getCurrent('mapPerson')).toBe('@I5@');
    expect(vs.getTimelinePersons()).toEqual(['@I6@']);
  });
});
