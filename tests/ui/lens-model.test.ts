// tests/ui/lens-model.test.ts — reine Datenbeschreibung des EINEN Lens-Umschalters
// (Spec 21 §4, INV-UI-3). Node-Environment, keine DOM-Abhängigkeit (TST-5).
import { describe, expect, it } from 'vitest';
import { LENSES, lensById } from '../../ui/shell/lens-model';

describe('LENSES — Lens-Umschalter-Datenmodell (Spec 21 §4)', () => {
  it('listet genau die vier Kontext-Fokus-Lenses in Spec-Reihenfolge (Baum ▸ Karte ▸ Zeitleiste ▸ Story)', () => {
    expect(LENSES.map((l) => l.id)).toEqual(['tree', 'map', 'timeline', 'story']);
  });

  it('enthält KEINE Statistik-Lens (Nutzer-Entscheidung: globales Dashboard, keine Kontext-Fokus-Lens)', () => {
    expect(LENSES.some((l) => l.id === ('stats' as never))).toBe(false);
    expect(LENSES.map((l) => l.label)).not.toContain('Statistik');
  });

  it('nur Baum ist implementiert; Karte/Zeitleiste/Story sind deaktivierte Platzhalter', () => {
    const byId = Object.fromEntries(LENSES.map((l) => [l.id, l.implemented]));
    expect(byId.tree).toBe(true);
    expect(byId.map).toBe(false);
    expect(byId.timeline).toBe(false);
    expect(byId.story).toBe(false);
  });

  it('lensById findet einen bekannten Eintrag und liefert undefined für Unbekanntes', () => {
    expect(lensById('map')?.label).toBe('Karte');
    expect(lensById('does-not-exist' as never)).toBeUndefined();
  });
});
