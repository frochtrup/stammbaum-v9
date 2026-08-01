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
