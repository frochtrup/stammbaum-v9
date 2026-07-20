// tests/ui/event-labels.test.ts — deutsche Ereignistyp-Labels + Kategorien (INV-UI-4,
// Nutzer-Fund 2026-07-10). Reine Funktionen (TST-5).
import { describe, expect, it } from 'vitest';
import { eventTypeLabel, eventCategory, EVENT_CATEGORY_ORDER } from '../../ui/shell/event-labels';

describe('eventTypeLabel — deutsche Übersetzung bekannter GEDCOM-Tags', () => {
  it('übersetzt Sonder-Ereignisse', () => {
    expect(eventTypeLabel('BIRT')).toBe('Geburt');
    expect(eventTypeLabel('CHR')).toBe('Taufe');
    expect(eventTypeLabel('DEAT')).toBe('Tod');
    expect(eventTypeLabel('BURI')).toBe('Bestattung');
  });

  it('übersetzt häufige generische Ereignisse, die vorher als Rohtag erschienen', () => {
    expect(eventTypeLabel('GRAD')).toBe('Abschluss');
    expect(eventTypeLabel('EDUC')).toBe('Ausbildung');
    expect(eventTypeLabel('OCCU')).toBe('Beruf');
    expect(eventTypeLabel('RESI')).toBe('Wohnort');
    expect(eventTypeLabel('PROP')).toBe('Eigentum');
    expect(eventTypeLabel('EMIG')).toBe('Auswanderung');
    expect(eventTypeLabel('IMMI')).toBe('Einwanderung');
    expect(eventTypeLabel('MILI')).toBe('Militärdienst');
  });

  it('lässt unbekannte Tags (z. B. freien TYPE-Text wie "Schule") unverändert durch', () => {
    expect(eventTypeLabel('Schule')).toBe('Schule');
    expect(eventTypeLabel('Irgendwas Freitext')).toBe('Irgendwas Freitext');
  });
});

describe('eventCategory — feste Kategorie-Zuordnung (Nutzer-Vorgabe 2026-07-10)', () => {
  it('ordnet Lebensdaten/Bildung/Beruf/Wohnen korrekt zu', () => {
    expect(eventCategory('BIRT')).toBe('Lebensdaten');
    expect(eventCategory('DEAT')).toBe('Lebensdaten');
    expect(eventCategory('GRAD')).toBe('Bildung');
    expect(eventCategory('EDUC')).toBe('Bildung');
    expect(eventCategory('OCCU')).toBe('Beruf');
    expect(eventCategory('RESI')).toBe('Wohnen & Eigentum');
    expect(eventCategory('PROP')).toBe('Wohnen & Eigentum');
  });

  it('ordnet alles Unbekannte "Weitere Ereignisse" zu', () => {
    expect(eventCategory('EMIG')).toBe('Weitere Ereignisse');
    expect(eventCategory('MILI')).toBe('Weitere Ereignisse');
    expect(eventCategory('EVEN')).toBe('Weitere Ereignisse');
  });

  it('EVEN mit freiem TYPE-Text "Beschäftigung" gehört zu "Beruf", wie OCCU (Nutzer-Vorgabe 2026-07-10)', () => {
    expect(eventCategory('EVEN', 'Beschäftigung')).toBe('Beruf');
  });

  it('ein Tag mit eigener Kategorie gewinnt immer gegen freien TYPE-Text', () => {
    // EDUC hat bereits "Bildung" — ein freier Text (selbst wenn er zufällig
    // "Beschäftigung" wäre) ändert das NICHT.
    expect(eventCategory('EDUC', 'Beschäftigung')).toBe('Bildung');
  });

  it('unbekannter freier TYPE-Text bei EVEN/FACT landet weiterhin bei "Weitere Ereignisse"', () => {
    expect(eventCategory('EVEN', 'Schule')).toBe('Weitere Ereignisse');
  });

  it('EVENT_CATEGORY_ORDER hat die vom Nutzer vorgegebene Reihenfolge', () => {
    expect(EVENT_CATEGORY_ORDER).toEqual(['Lebensdaten', 'Bildung', 'Beruf', 'Wohnen & Eigentum', 'Weitere Ereignisse']);
  });
});
