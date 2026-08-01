// tests/ui/swipe-nav.test.ts — Wisch-Erkennung für Zurück/Vorwärts (Spec 21 §2, BL-07).
// Reine Funktion, node-Environment (TST-5) — die Schwellen sind der eigentliche Inhalt.
import { describe, expect, it } from 'vitest';
import {
  swipeDirection,
  SWIPE_AXIS_RATIO,
  SWIPE_MAX_MS,
  SWIPE_MIN_DISTANCE,
} from '../../ui/shell/swipe-nav';

describe('BL-07: swipeDirection', () => {
  it('nach rechts = zurück, nach links = vorwärts', () => {
    expect(swipeDirection({ dx: 120, dy: 10, elapsedMs: 200 })).toBe('right');
    expect(swipeDirection({ dx: -120, dy: 10, elapsedMs: 200 })).toBe('left');
  });

  it('zu kurze Strecke zählt nicht (Tippen mit leichtem Versatz)', () => {
    expect(swipeDirection({ dx: SWIPE_MIN_DISTANCE, dy: 0, elapsedMs: 100 })).toBeNull();
    expect(swipeDirection({ dx: SWIPE_MIN_DISTANCE + 1, dy: 0, elapsedMs: 100 })).toBe('right');
  });

  it('DER WICHTIGE FALL: zügiges Scrollen mit Seitwärtsdrall navigiert NICHT', () => {
    // Ohne das Achsenverhältnis löste jede senkrechte Wischbewegung mit etwas Drall die
    // Navigation aus — der Nutzer verlöre beim Lesen einer langen Detailseite die Seite.
    expect(swipeDirection({ dx: 100, dy: 300, elapsedMs: 200 })).toBeNull();
    expect(swipeDirection({ dx: 100, dy: 100 / SWIPE_AXIS_RATIO - 1, elapsedMs: 200 })).toBe('right');
  });

  it('zu langsam zählt nicht (Ziehen ist kein Wischen)', () => {
    expect(swipeDirection({ dx: 200, dy: 0, elapsedMs: SWIPE_MAX_MS })).toBeNull();
    expect(swipeDirection({ dx: 200, dy: 0, elapsedMs: SWIPE_MAX_MS - 1 })).toBe('right');
  });
});

// --- BL-271: die Geste hält sich aus Editoren und Overlays heraus --------------------
//
// Der Defekt: `swipeNav` hatte die Option `enabled` („Aus, solange z. B. ein Modal offen
// ist") — der einzige Aufrufer (`EntityTab`) übergab sie nie. Sie war auch das falsche
// Werkzeug: der Bearbeiten-Zustand lebt KOMPONENTEN-LOKAL in PlaceDetail/PersonDetail,
// `EntityTab` kann ihn gar nicht sehen. Deshalb prüft die Geste stattdessen ihren
// eigenen Startpunkt — das braucht kein neues Zustandsmodul und funktioniert auch für
// ein Overlay, das (bis BL-278/INV-UI-13 vollzogen ist) im DOM noch im Detail-Pane hängt.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { wischGesperrt, KEIN_WISCH_SELEKTOR } from '../../ui/shell/swipe-nav';

/** Minimal-Attrappe eines Elements: nur `closest`, mehr braucht die Prüfung nicht. */
function el(treffer: string | null) {
  return { closest: (sel: string) => (treffer && sel === KEIN_WISCH_SELEKTOR ? { sel } : null) } as unknown as EventTarget;
}

describe('BL-271: wischGesperrt', () => {
  it('sperrt, wenn der Startpunkt in einer abgemeldeten Fläche liegt', () => {
    expect(wischGesperrt(el('.stb-modal-backdrop'))).toBe(true);
  });

  it('lässt die Geste auf der normalen Detailfläche durch', () => {
    expect(wischGesperrt(el(null))).toBe(false);
  });

  it('verträgt ein Ziel ohne `closest` (Text-Knoten, null) statt zu werfen', () => {
    expect(wischGesperrt(null)).toBe(false);
    expect(wischGesperrt({} as EventTarget)).toBe(false);
  });

  it('deckt beide Fälle ab: geteilter Modal-Backdrop UND die Abmeldung per Attribut', () => {
    // Kein dritter Mechanismus — der Backdrop ist die vorhandene Overlay-Primitive
    // (INV-UI-4), `data-no-swipe` die Abmeldung für Flächen ohne Backdrop.
    expect(KEIN_WISCH_SELEKTOR).toContain('.stb-modal-backdrop');
    expect(KEIN_WISCH_SELEKTOR).toContain('[data-no-swipe]');
  });
});

describe('BL-271: die inline aufgeklappten Bearbeiten-Formulare melden sich ab', () => {
  // Quellen-Wächter: ohne ihn fiele das Attribut bei einem Umbau still weg, und der
  // Datenverlust käme unbemerkt zurück (es gibt keinen Dirty-Schutz, der ihn abfinge).
  const FORMULARE = [
    'ui/views/place/PlaceEditForm.svelte',
    'ui/views/hof/HofEditForm.svelte',
    'ui/views/person/PersonForm.svelte',
    'ui/views/source/SourceForm.svelte',
    'ui/views/repository/RepositoryForm.svelte',
  ];

  it.each(FORMULARE)('%s trägt data-no-swipe an seiner Wurzel', (rel) => {
    const src = readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
    expect(src).toMatch(/<(section|div|form)[^>]*\sdata-no-swipe[\s>]/);
  });
});
