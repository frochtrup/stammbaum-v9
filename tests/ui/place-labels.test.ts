// tests/ui/place-labels.test.ts — kanonische deutsche Ortstyp-Übersetzung (ADR-v9-149).
//
// Hintergrund: die Orte-Liste und der Ort-Steckbrief zeigten den ROHEN GRAMPS-Wert
// (`Town`/`State`/`Unknown`) als Pille — der v8-Altlast-Fall B7 (Spec 21 §11) auf einer
// neuen Fläche wiederaufgetaucht, obwohl zwei deutsche Übersetzungstabellen längst
// existierten (Report + Story), nur nie in Liste/Detail benutzt wurden.
import { describe, expect, it } from 'vitest';
import { PLACE_TYPE_DE, placeTypeLabel, placeTypeCategory } from '../../ui/shell/place-labels';
import { PLACE_TYPE_DE_ARTICLE } from '../../ui/views/story/place-context';

describe('placeTypeLabel — deutsche Ortstyp-Labels (B7-Regression, ADR-v9-149)', () => {
  it('übersetzt die englischen GRAMPS-Werte, die im echten Bestand vorkommen', () => {
    expect(placeTypeLabel('Town')).toBe('Stadt');
    expect(placeTypeLabel('City')).toBe('Stadt');
    expect(placeTypeLabel('State')).toBe('Bundesland');
    expect(placeTypeLabel('County')).toBe('Kreis');
    expect(placeTypeLabel('Village')).toBe('Dorf');
    expect(placeTypeLabel('Farm')).toBe('Hof');
  });

  it('kein bekannter Typ kommt als englischer Rohwert durch (die eigentliche Regression)', () => {
    for (const [raw, de] of Object.entries(PLACE_TYPE_DE)) {
      expect(placeTypeLabel(raw)).toBe(de);
      // „Region" ist in beiden Sprachen gleich — nur die echten Anglizismen prüfen.
      if (raw !== de) expect(placeTypeLabel(raw)).not.toBe(raw);
    }
  });

  it('`Unknown` liefert "" — kein Chip, statt "Unbekannt" auf der Mehrheit der Zeilen', () => {
    // Der Nicht-Informations-Zustand bekommt KEINEN Dauer-Chip (ADR-v9-149, dieselbe
    // Polarität wie das Entfernen der „ohne Zusatzangaben"-Pille). ADR-v9-77 nennt den
    // leeren Typ ausdrücklich „den normalen, unauffälligen Fall".
    expect(placeTypeLabel('Unknown')).toBe('');
  });

  it('leerer/fehlender Typ liefert "" (kein Chip)', () => {
    expect(placeTypeLabel('')).toBe('');
    expect(placeTypeLabel(null)).toBe('');
    expect(placeTypeLabel(undefined)).toBe('');
  });

  it('unbekannter Custom-Typ kommt roh durch — keine Übersetzung erfunden (wie eventTypeLabel)', () => {
    expect(placeTypeLabel('Weiler-Sonderform')).toBe('Weiler-Sonderform');
  });
});

describe('placeTypeCategory — anzeigen nein, abfragen ja (ADR-v9-149)', () => {
  it('gibt dem nicht kategorisierten Zustand für Filter einen echten Namen', () => {
    expect(placeTypeCategory('Unknown')).toBe('Unbekannt');
    expect(placeTypeCategory('')).toBe('Unbekannt');
    expect(placeTypeCategory(null)).toBe('Unbekannt');
  });

  it('unterscheidet sich von placeTypeLabel NUR im unbekannten Fall', () => {
    for (const raw of Object.keys(PLACE_TYPE_DE)) {
      expect(placeTypeCategory(raw)).toBe(placeTypeLabel(raw));
    }
    expect(placeTypeCategory('Unknown')).not.toBe(placeTypeLabel('Unknown'));
  });
});

describe('Drift-Guard: Chip-Form und Story-Erzählform decken dieselben Typen ab', () => {
  // Zwei FORMEN derselben Fachbegriffe (artikellos „Stadt" vs. erzählend „eine Stadt") —
  // getrennt zulässig, aber nicht auseinanderlaufend: ein nur in einer Tabelle ergänzter
  // Typ erschiene in der anderen Fläche wieder als roher englischer Wert. Genau so ist die
  // B7-Regression entstanden (Übersetzung existierte, die Fläche nutzte sie nicht).
  it('beide Tabellen führen exakt dieselben Typ-Schlüssel', () => {
    expect(Object.keys(PLACE_TYPE_DE).sort()).toEqual(Object.keys(PLACE_TYPE_DE_ARTICLE).sort());
  });

  it('die Erzählform enthält das artikellose Substantiv (gleiche Vokabel, nur mit Artikel)', () => {
    for (const [raw, de] of Object.entries(PLACE_TYPE_DE)) {
      expect(PLACE_TYPE_DE_ARTICLE[raw].endsWith(de)).toBe(true);
    }
  });
});
