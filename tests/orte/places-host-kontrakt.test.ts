// @vitest-environment happy-dom
// tests/orte/places-host-kontrakt.test.ts — der Vertrag, an dem beide Programme hängen
// (Spec 22 §3, Spec 32 §2/§6, ADR-v9-161).
//
// WARUM ALS EIGENER TEST: Die geteilten Orts-/Hof-Views binden an `PlacesHost`. Erweitert
// jemand den Vertrag für das Hauptprogramm, ohne den Editor mitzuziehen, bricht nichts —
// bis der Editor zur Laufzeit auf `undefined` trifft. Der Compiler allein fängt das nur,
// solange beide Seiten dieselbe Deklaration teilen; dieser Test prüft zusätzlich, dass
// jedes Kommando am ECHTEN Objekt vorhanden und aufrufbar ist.
//
// Die Laufzeit-Hälfte ist der Punkt: ein `satisfies`-Ausdruck beweist nur, dass der TYP
// passt. Dass die Fabrik das Member auch wirklich liefert, ist eine andere Aussage.
import { describe, expect, it } from 'vitest';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { createOrteHost } from '../../app-orte/orte-state.svelte';
import { createOrteNav } from '../../app-orte/orte-nav.svelte';
import type { PlacesHost, PlacesNav } from '../../ui/shell/places-host';

/** Die zwölf Kommandos + drei Lese-Zugänge aus Spec 22 §3 — als Liste, nicht als Typ:
 *  eine Liste lässt sich zur Laufzeit gegen das echte Objekt halten. */
const HOST_MEMBERS = [
  'db',
  'placeContext',
  'caps',
  'savePlace',
  'deletePlace',
  'mergePlace',
  'importGovEntry',
  'saveHof',
  'deleteHof',
  'mergeHof',
  'updateHofAddr',
  'moveHof',
  'linkEventToPlace',
  'linkEventToHof'
] as const;

const CAP_KEYS = ['hasEventContext', 'canEditEvents', 'canNavigateToLens'] as const;

describe('PlacesHost — beide Programme erfüllen denselben Vertrag', () => {
  const hosts: [string, () => PlacesHost][] = [
    ['Hauptprogramm (AppState)', () => createAppState()],
    ['Orte-Editor (OrteHost)', () => createOrteHost()]
  ];

  for (const [name, make] of hosts) {
    describe(name, () => {
      it('liefert jedes Vertrags-Member', () => {
        const host = make();
        for (const member of HOST_MEMBERS) {
          expect(host[member], `${name}: ${member} fehlt`).toBeDefined();
        }
      });

      it('liefert jedes Kommando als aufrufbare Funktion', () => {
        const host = make();
        for (const member of HOST_MEMBERS.slice(3)) {
          expect(typeof host[member], `${name}: ${member} ist keine Funktion`).toBe('function');
        }
      });

      it('liefert vollständige, boolesche Fähigkeiten', () => {
        const host = make();
        for (const key of CAP_KEYS) {
          expect(typeof host.caps[key], `${name}: caps.${key}`).toBe('boolean');
        }
      });

      it('liefert einen zur db passenden Orts-/Hof-Kontext', () => {
        const host = make();
        expect(host.placeContext.places).toBeDefined();
        expect(host.placeContext.hofs).toBeDefined();
        expect(host.db.placeObjects).toBeInstanceOf(Map);
        expect(host.db.hofObjects).toBeInstanceOf(Map);
      });
    });
  }

  it('Hauptprogramm hat alle Fähigkeiten, der Editor die eingeschränkten', () => {
    // Die Fähigkeiten sind die EINZIGE zulässige Abweichung (INV-ORTE-1) — dass sie sich
    // tatsächlich unterscheiden, ist damit ein Kontraktpunkt, keine Nebensache.
    expect(createAppState().caps).toEqual({
      hasEventContext: true,
      canEditEvents: true,
      canNavigateToLens: true
    });
    expect(createOrteHost().caps).toEqual({
      hasEventContext: false,
      canEditEvents: false,
      canNavigateToLens: false
    });
  });

  it('der Editor gewinnt Ereignis-Kontext erst mit einer Kontextdatei', () => {
    const host = createOrteHost();
    expect(host.caps.hasEventContext).toBe(false);
    host.setEventContext({ individuals: new Map(), families: new Map() } as never);
    expect(host.caps.hasEventContext).toBe(true);
    // …und dauerhaft NICHT die beiden anderen: der Editor schreibt keine Genealogie-Datei
    // und hat keine Linsen, egal welche Datei danebenliegt.
    expect(host.caps.canEditEvents).toBe(false);
    expect(host.caps.canNavigateToLens).toBe(false);
  });
});

describe('PlacesNav — Auswahl in beiden Programmen', () => {
  const navs: [string, () => PlacesNav][] = [
    ['Hauptprogramm (ViewState)', () => createViewState()],
    ['Orte-Editor (OrteNav)', () => createOrteNav()]
  ];

  for (const [name, make] of navs) {
    it(`${name}: setzt und liest Ort und Hof unabhängig`, () => {
      const nav = make();
      nav.setCurrent('place', '@P1@');
      nav.setCurrent('hof', '_hof_x_@P1@');
      expect(nav.getCurrent('place')).toBe('@P1@');
      expect(nav.getCurrent('hof')).toBe('_hof_x_@P1@');
      nav.setCurrent('place', null);
      expect(nav.getCurrent('place')).toBeNull();
      // Der Hof bleibt: getrennte Slots, kein gemeinsamer currentX-Topf (INV-VS).
      expect(nav.getCurrent('hof')).toBe('_hof_x_@P1@');
    });
  }

  it('D6 ist die Abwesenheit einer Methode, kein Flag', () => {
    // `focusOnMap` prüft auf `setMapCoordFocus`. Das Hauptprogramm hat sie, der Editor
    // nicht — der Koordinaten-Glyph bleibt dort still, ohne dass eine Komponente das
    // wissen müsste.
    expect(typeof createViewState().setMapCoordFocus).toBe('function');
    expect(createOrteNav().setMapCoordFocus).toBeUndefined();
  });
});
