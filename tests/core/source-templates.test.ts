// tests/core/source-templates.test.ts — BL-128 Quellen-Vorlagen (Spec 20 §1.6 [S]).
// Reine Vokabular-Prüfung: Vollständigkeit gegen die Spec-Aufzählung, stabile Schlüssel,
// keine Dubletten, jede Vorbelegung landet auf einem echten `Source`-Feld. Das Formular-
// Verhalten (Auswahl füllt Felder, bleibt editierbar) wird per Komponenten-Test verriegelt
// (tests/ui/SourceForm.component.test.ts) — hier nur die Kern-Logik (TST-5 Testpyramide).
import { describe, it, expect } from 'vitest';
import { SOURCE_TEMPLATES } from '../../core/model/source-templates';
import { makeSource } from '../../core/model';

// Spec 20 §1.6 letzter Punkt, wörtlich: "Kirchenbuch Taufen/Heiraten/Beerdigungen,
// Standesamt Geburt/Heirat/Sterbefall, Volkszählung, Grabstein, Totenzettel, Militärakte."
const SPEC_LABELS = [
  'Kirchenbuch Taufen',
  'Kirchenbuch Heiraten',
  'Kirchenbuch Beerdigungen',
  'Standesamt Geburt',
  'Standesamt Heirat',
  'Standesamt Sterbefall',
  'Volkszählung',
  'Grabstein',
  'Totenzettel',
  'Militärakte',
];

describe('SOURCE_TEMPLATES (BL-128)', () => {
  it('deckt genau die in Spec 20 §1.6 aufgezählte Gattungsliste ab', () => {
    const labels = SOURCE_TEMPLATES.map((t) => t.label);
    expect(labels.sort()).toEqual([...SPEC_LABELS].sort());
  });

  it('hat stabile, eindeutige Schlüssel (kein Duplikat)', () => {
    const keys = SOURCE_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(/^[a-z-]+$/);
    }
  });

  it('hat keine doppelten Anzeigenamen', () => {
    const labels = SOURCE_TEMPLATES.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('jede Vorlage füllt Kurzname und Titel (nie beide leer, sonst kein sichtbarer Effekt)', () => {
    for (const t of SOURCE_TEMPLATES) {
      expect(t.abbr.trim()).not.toBe('');
      expect(t.title.trim()).not.toBe('');
    }
  });

  it('lässt Autor bewusst leer, wo die Gattung keinen für ALLE Instanzen zutreffenden ' +
    'Autor hergibt — kein erfundener Platzhalter (Auftrags-Vorgabe, anders als v8-Orakel)', () => {
    for (const t of SOURCE_TEMPLATES) {
      expect(t.author).toBe('');
    }
  });

  it('Titel-Gerüste markieren offene Lücken mit "[…]", nie mit v8s Auslassungspunkten', () => {
    for (const t of SOURCE_TEMPLATES) {
      expect(t.title).not.toMatch(/…/);
    }
  });

  it('jede Vorbelegung passt auf ein echtes Source-Feld (abbr/title/author/callMedia)', () => {
    for (const t of SOURCE_TEMPLATES) {
      const s = makeSource('@S1@', {
        abbr: t.abbr,
        title: t.title,
        author: t.author,
        callMedia: t.callMedia,
      });
      expect(s.abbr).toBe(t.abbr);
      expect(s.title).toBe(t.title);
      expect(s.author).toBe(t.author);
      expect(s.callMedia).toBe(t.callMedia);
    }
  });

  it('Medientyp nutzt den GEDCOM-5.5.1-Standard-Enum (SOUR.REPO.CALN.MEDI), keine ' +
    'deutsche Übersetzung — das Feld hat keine Label-Schicht wie placeTypeLabel/repoTypeLabel', () => {
    const allowed = new Set([
      'audio', 'book', 'card', 'electronic', 'fiche', 'film', 'magazine',
      'manuscript', 'map', 'newspaper', 'photo', 'tombstone', 'video', 'other',
    ]);
    for (const t of SOURCE_TEMPLATES) {
      expect(allowed.has(t.callMedia)).toBe(true);
    }
  });
});
