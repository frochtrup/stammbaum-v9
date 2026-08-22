// tests/core/source-kinds.test.ts — BL-373 Gattung der Quelle (Spec 20 §1.6 [S]).
//
// Reine Kern-Logik (TST-5): Vokabular, die Vorrang-Regel „führender Marker schlägt
// Stichwort", die Ordnung unter den Stichwörtern und das Schreiben des Markers. Das
// Formular-Verhalten (Auswahl ändert den Kurzname sichtbar) verriegelt der
// Komponenten-Test daneben.
import { describe, it, expect } from 'vitest';
import {
  SOURCE_KINDS,
  ASSIGNABLE_SOURCE_KINDS,
  sourceKindOf,
  sourceKindLabel,
  withSourceKindMarker,
} from '../../core/model/source-kinds';
import { SOURCE_TEMPLATES } from '../../core/model/source-templates';

// Spec 20 §1.6, wörtlich: „Kirchenbuch · Standesamt/Urkunde · Grabstein/Totenzettel ·
// Zeitung/Literatur · Persönliche Information · Internet/Datenbank · Fremder Stammbaum ·
// Sonstiges."
const SPEC_LABELS = [
  'Kirchenbuch',
  'Standesamt/Urkunde',
  'Grabstein/Totenzettel',
  'Zeitung/Literatur',
  'Persönliche Information',
  'Internet/Datenbank',
  'Fremder Stammbaum',
  'Sonstiges',
];

describe('Gattungs-Vokabular (BL-373)', () => {
  it('deckt genau die in Spec 20 §1.6 aufgezählten acht Gattungen ab', () => {
    expect(SOURCE_KINDS.map((k) => k.label)).toEqual(SPEC_LABELS);
  });

  it('führt keine doppelten Schlüssel und für jeden ein Label', () => {
    const keys = SOURCE_KINDS.map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(sourceKindLabel(k)).not.toBe('');
  });

  it('bietet `sonstiges` NICHT zur Auswahl an — es ist ein Befund, keine Wahl', () => {
    expect(ASSIGNABLE_SOURCE_KINDS.map((k) => k.key)).not.toContain('sonstiges');
    expect(ASSIGNABLE_SOURCE_KINDS).toHaveLength(SOURCE_KINDS.length - 1);
  });
});

describe('sourceKindOf — Ableitung aus Kurzname und Titel', () => {
  it('erkennt die Gattung am Stichwort, gleich ob es im Kurznamen oder im Titel steht', () => {
    expect(sourceKindOf({ abbr: 'Grabstein Hermann Scho', title: '' })).toBe('grab');
    expect(sourceKindOf({ abbr: '', title: 'Kirchbuch St. Lambertus, Ochtrup' })).toBe('kirchenbuch');
    expect(sourceKindOf({ abbr: 'Marianne Ransmann Interview 2003', title: '' })).toBe('persoenlich');
  });

  it('wertet die Gattungen GEORDNET aus — die erste passende gewinnt', () => {
    // „Todesanzeige" trägt „anzeig…" wie „Anzeiger", ist aber ein Totenzettel: `grab`
    // steht vor `presse`. Ohne die Ordnung liefe der halbe Bestand in die Zeitung.
    expect(sourceKindOf({ abbr: 'Todesanzeige Hermann Peters', title: '' })).toBe('grab');
    expect(sourceKindOf({ abbr: 'Münsterischer Anzeiger, 11.10.1908, S. 1', title: '' })).toBe('presse');
    // „Taufurkunde" trägt „urkunde" wie die Standesamt-Papiere, ist aber kirchlich.
    expect(sourceKindOf({ abbr: 'Taufurkunde Maria Anna Ransmann', title: '' })).toBe('kirchenbuch');
    expect(sourceKindOf({ abbr: 'Geburtsurkunde Franz-Georg Decker', title: '' })).toBe('standesamt');
  });

  it('lässt einen führenden Marker das Stichwort SCHLAGEN — sonst wäre jede Korrektur wirkungslos', () => {
    expect(sourceKindOf({ abbr: 'Totenzettel Meier', title: '' })).toBe('grab');
    expect(sourceKindOf({ abbr: 'StA Totenzettel Meier', title: '' })).toBe('standesamt');
    expect(sourceKindOf({ abbr: 'KB Vechta', title: 'Kirchbuch St. Georg, Vechta' })).toBe('kirchenbuch');
  });

  it('verlangt vom Marker ein ganzes Wort — „KBW Meier" ist kein Kirchenbuch', () => {
    expect(sourceKindOf({ abbr: 'KBW Meier', title: '' })).toBe('sonstiges');
    expect(sourceKindOf({ abbr: 'KB', title: '' })).toBe('kirchenbuch');
  });

  it('fällt auf `sonstiges` zurück, statt zu raten', () => {
    expect(sourceKindOf({ abbr: 'Wegener', title: '' })).toBe('sonstiges');
    expect(sourceKindOf({ abbr: '', title: '' })).toBe('sonstiges');
  });

  it('ordnet JEDE Quellen-Vorlage ein — die Konvention ist das, was die App ohnehin schreibt', () => {
    for (const t of SOURCE_TEMPLATES) {
      expect(
        sourceKindOf({ abbr: t.abbr, title: t.title }),
        `Vorlage ${t.key} (${t.abbr})`,
      ).not.toBe('sonstiges');
    }
  });
});

describe('withSourceKindMarker — was die Auswahlbox in den Kurznamen schreibt', () => {
  it('lässt einen bereits passend benannten Kurznamen unangetastet', () => {
    expect(withSourceKindMarker('KB Vechta', 'kirchenbuch')).toBe('KB Vechta');
    // Auch ein akzeptierter Zweit-Marker zählt als passend — kein Umschreiben ohne Not.
    expect(withSourceKindMarker('Kirchenbuch Ochtrup', 'kirchenbuch')).toBe('Kirchenbuch Ochtrup');
  });

  it('stellt den kanonischen Marker voran, wenn keiner da ist', () => {
    expect(withSourceKindMarker('Vechta 1820', 'kirchenbuch')).toBe('KB Vechta 1820');
    expect(withSourceKindMarker('', 'standesamt')).toBe('StA');
  });

  it('ERSETZT einen fremden Marker, statt Präfixe zu stapeln', () => {
    const einmal = withSourceKindMarker('Totenzettel Meier', 'standesamt');
    expect(einmal).toBe('StA Meier');
    expect(withSourceKindMarker(einmal, 'kirchenbuch')).toBe('KB Meier');
  });

  it('macht aus jedem Ergebnis auch die Gattung, die es behauptet', () => {
    for (const def of ASSIGNABLE_SOURCE_KINDS) {
      const abbr = withSourceKindMarker('Beispiel', def.key);
      expect(sourceKindOf({ abbr, title: '' }), `${def.key}: ${abbr}`).toBe(def.key);
    }
  });
});
