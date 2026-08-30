// tests/core/person-names.test.ts — Kern-Kommandos für die weiteren Namensformen
// (`core/model/person-names.ts`, Spec 10 §2 „Namen", Spec 20 §1.4).
//
// Der Schwerpunkt liegt NICHT auf Add/Remove (das ist Listenarithmetik), sondern auf der
// einen Regel, an der diese Kommandos hängen: `nameRaw` und die optionalen Untertags
// `GIVN`/`SURN` sind zwei Hälften derselben Sache — halb nachgezogen ist die
// ADR-v9-81-Fehlerklasse, voll nachgezogen die ADR-v9-197-Fehlerklasse („Speichern
// schreibt um"). Jede Zusicherung hier hält eine Seite dieser Grenze.
import { describe, expect, it } from 'vitest';
import { makePerson } from '../../core/model';
import type { Person, PersonName } from '../../core/model/types';
import {
  extraNameParts,
  extraNameDisplay,
  withAddedExtraName,
  withRemovedExtraName,
  withUpdatedExtraName,
} from '../../core/model';

function nameForm(over: Partial<PersonName> = {}): PersonName {
  return { nameRaw: '', given: '', surname: '', prefix: '', suffix: '', type: '', citations: [], ...over };
}

function personMit(...formen: PersonName[]): Person {
  const p = makePerson('@I1@', { given: 'Anna', surname: 'Decker' });
  p.extraNames.push(...formen);
  return p;
}

describe('extraNameParts — der NAME-Wert hat Vorrang vor den Untertags', () => {
  it('zerlegt den Schrägstrich-Wert', () => {
    const parts = extraNameParts(nameForm({ nameRaw: 'Anna Maria /Meyer/' }));
    expect(parts).toEqual({ given: 'Anna Maria', surname: 'Meyer' });
  });

  it('ein ENGER gesetzter Untertag überstimmt den Wert NICHT (ADR-v9-210)', () => {
    // `GIVN Anna` neben `NAME Anna Maria /Decker/`: der Untertag sagt bewusst weniger.
    // Die Anzeige muss trotzdem den vollständigen Namen zeigen, sonst verschwindet
    // „Maria" aus der Oberfläche und beim nächsten Edit aus der Datei.
    const parts = extraNameParts(nameForm({ nameRaw: 'Anna Maria /Decker/', given: 'Anna' }));
    expect(parts.given).toBe('Anna Maria');
  });

  it('springt auf die Untertags ein, wo der Wert nichts hergibt', () => {
    const parts = extraNameParts(nameForm({ nameRaw: '//', given: 'Anna', surname: 'Meyer' }));
    expect(parts).toEqual({ given: 'Anna', surname: 'Meyer' });
  });

  it('ohne Schrägstrichpaar gilt der ganze Wert als Vorname (nachsichtige Lesart)', () => {
    expect(extraNameParts(nameForm({ nameRaw: 'Anna Maria' }))).toEqual({ given: 'Anna Maria', surname: '' });
  });
});

describe('extraNameDisplay', () => {
  it('zeigt die Form ohne Schrägstriche', () => {
    expect(extraNameDisplay(nameForm({ nameRaw: 'Anna /Meyer/' }))).toBe('Anna Meyer');
  });

  it('bezieht Präfix und NSFX-Suffix mit ein', () => {
    expect(extraNameDisplay(nameForm({ nameRaw: 'Anna /Meyer/', prefix: 'Dr.', suffix: 'jun.' })))
      .toBe('Dr. Anna Meyer jun.');
  });

  it('eine unzerlegbare Zeile erscheint nicht als Leerzeile', () => {
    expect(extraNameDisplay(nameForm({ nameRaw: 'Nonne Theresia' }))).toBe('Nonne Theresia');
  });
});

describe('withAddedExtraName', () => {
  it('baut den GEDCOM-NAME-Wert und lässt die Untertags LEER (ADR-v9-197)', () => {
    const p = withAddedExtraName(personMit(), 'Anna', 'Meyer', 'married');
    expect(p.extraNames).toHaveLength(1);
    const n = p.extraNames[0]!;
    expect(n.nameRaw).toBe('Anna /Meyer/');
    expect(n.type).toBe('married');
    // Der Writer schreibt `GIVN`/`SURN` nur bei gefülltem Feld — eine frisch angelegte
    // Form bekommt damit genau die eine NAME-Zeile, die sie braucht.
    expect(n.given).toBe('');
    expect(n.surname).toBe('');
  });

  it('ohne Vor- UND Nachname passiert nichts (No-Op, keine leere Zeile in der Datei)', () => {
    const p = personMit();
    expect(withAddedExtraName(p, '  ', '', 'aka')).toBe(p);
  });
});

describe('withRemovedExtraName', () => {
  it('entfernt genau den Eintrag', () => {
    const p = personMit(nameForm({ nameRaw: 'A //' }), nameForm({ nameRaw: 'B //' }));
    expect(withRemovedExtraName(p, 0).extraNames.map((n) => n.nameRaw)).toEqual(['B //']);
  });

  it('Index außerhalb der Liste ist ein No-Op, kein stilles Löschen eines anderen', () => {
    const p = personMit(nameForm({ nameRaw: 'A //' }));
    expect(withRemovedExtraName(p, 5)).toBe(p);
    expect(withRemovedExtraName(p, -1)).toBe(p);
  });
});

describe('withUpdatedExtraName — die beiden Hälften', () => {
  it('reine ART-Änderung lässt `nameRaw` byte-identisch (ADR-v9-197)', () => {
    // Der kritische Fall: `Anna Maria` hat kein Schrägstrichpaar. Ein bedingungsloses
    // Neubauen hängte allein durch das Öffnen der Auswahlliste ein `//` an.
    const p = personMit(nameForm({ nameRaw: 'Anna Maria' }));
    const next = withUpdatedExtraName(p, 0, 'Anna Maria', '', 'aka');
    expect(next.extraNames[0]!.nameRaw).toBe('Anna Maria');
    expect(next.extraNames[0]!.type).toBe('aka');
  });

  it('Namensänderung baut `nameRaw` neu', () => {
    const p = personMit(nameForm({ nameRaw: 'Anna /Meyer/', type: 'married' }));
    const next = withUpdatedExtraName(p, 0, 'Anna', 'Meier', 'married');
    expect(next.extraNames[0]!.nameRaw).toBe('Anna /Meier/');
  });

  it('der Nachlauf hinter dem Schrägstrichpaar bleibt erhalten', () => {
    const p = personMit(nameForm({ nameRaw: 'Anna /Meyer/ jun.' }));
    const next = withUpdatedExtraName(p, 0, 'Anna', 'Meier', '');
    expect(next.extraNames[0]!.nameRaw).toBe('Anna /Meier/ jun.');
  });

  it('ein Untertag, der den Wert nur WIEDERHOLT hat, wandert mit (ADR-v9-81)', () => {
    const p = personMit(nameForm({ nameRaw: 'Anna /Meyer/', given: 'Anna', surname: 'Meyer' }));
    const next = withUpdatedExtraName(p, 0, 'Anna', 'Meier', '');
    expect(next.extraNames[0]!.nameRaw).toBe('Anna /Meier/');
    expect(next.extraNames[0]!.surname).toBe('Meier');
    expect(next.extraNames[0]!.given).toBe('Anna');
  });

  it('ein ENGER gesetzter Untertag bleibt unangetastet', () => {
    // `GIVN Anna` bei `NAME Anna Maria /Decker/` sagt bewusst weniger als der Wert
    // (ADR-v9-210) — ihn zu überschreiben wäre eine Behauptung über die Quelle.
    const p = personMit(nameForm({ nameRaw: 'Anna Maria /Decker/', given: 'Anna' }));
    const next = withUpdatedExtraName(p, 0, 'Anna Maria', 'Decker-Meyer', '');
    expect(next.extraNames[0]!.nameRaw).toBe('Anna Maria /Decker-Meyer/');
    expect(next.extraNames[0]!.given).toBe('Anna');
  });

  it('ein Untertag, den die Quelle NICHT hatte, entsteht auch beim Edit nicht', () => {
    const p = personMit(nameForm({ nameRaw: 'Anna /Meyer/' }));
    const next = withUpdatedExtraName(p, 0, 'Anna', 'Meier', '');
    expect(next.extraNames[0]!.given).toBe('');
    expect(next.extraNames[0]!.surname).toBe('');
  });

  it('Zitate der Namensform überleben den Edit', () => {
    const p = personMit(nameForm({
      nameRaw: 'Anna /Meyer/',
      citations: [{ sourceId: '@S1@', page: 'S. 3', quay: 3, media: [], eval: null, noteText: '', url: '' } as never],
    }));
    expect(withUpdatedExtraName(p, 0, 'Anna', 'Meier', '').extraNames[0]!.citations).toHaveLength(1);
  });

  it('unbekannter Index, Leeren eines vorhandenen Namens und unveränderte Werte sind No-Ops', () => {
    const p = personMit(nameForm({ nameRaw: 'Anna /Meyer/', type: 'aka' }));
    expect(withUpdatedExtraName(p, 3, 'X', 'Y', '')).toBe(p);
    // Ein vorhandener Name verschwindet nicht über die Feldeingabe — dafür gibt es ✕.
    expect(withUpdatedExtraName(p, 0, '', '   ', 'aka')).toBe(p);
    expect(withUpdatedExtraName(p, 0, 'Anna', 'Meyer', 'aka')).toBe(p);
  });

  it('eine bereits NAMENLOSE Form bleibt in ihrer Art änderbar (realer Bestandsfall)', () => {
    // `1 NAME` ohne Wert, nur mit `2 TYPE AKA` — 1× in `Testdateien/Unsere Familie 2026.ged`.
    // Die schärfere No-Op-Fassung hätte hier die Art-Auswahl tot gestellt.
    const p = personMit(nameForm({ nameRaw: '', type: 'AKA' }));
    const next = withUpdatedExtraName(p, 0, '', '', 'aka');
    expect(next).not.toBe(p);
    expect(next.extraNames[0]!.type).toBe('aka');
    expect(next.extraNames[0]!.nameRaw).toBe('');
  });

  it('eine namenlose Form erscheint nicht als leere Pille', () => {
    expect(extraNameDisplay(nameForm({ nameRaw: '', type: 'AKA' }))).toBe('(ohne Namen)');
  });

  it('die Position in der Liste bleibt (ADR-v9-183-Form)', () => {
    const p = personMit(nameForm({ nameRaw: 'A //' }), nameForm({ nameRaw: 'B //' }), nameForm({ nameRaw: 'C //' }));
    const next = withUpdatedExtraName(p, 1, 'Beta', '', '');
    expect(next.extraNames.map((n) => n.nameRaw)).toEqual(['A //', 'Beta //', 'C //']);
  });
});

describe('Die Vergleichsform — am echten Bestand kalibriert', () => {
  // Gemessen an `Testdateien/Unsere Familie 2026.ged` (3180 Personen, 95 weitere
  // NAME-Zeilen): 30 der 80 `GIVN` trennen ihre Bestandteile mit Komma, 1 `SURN` weicht
  // nur in der Groß-/Kleinschreibung ab. Ein byte-genauer Vergleich hätte genau diese 31
  // Untertags beim Edit eingefroren, bis sie dem Namen widersprechen.
  it('eine Komma-Fassung gilt als Wiederholung und zieht mit', () => {
    const p = personMit(nameForm({ nameRaw: 'Paul Gerhard /Scho/', given: 'Paul, Gerhard' }));
    const next = withUpdatedExtraName(p, 0, 'Paul Gerhard', 'Schotte', '');
    expect(next.extraNames[0]!.nameRaw).toBe('Paul Gerhard /Schotte/');
    expect(next.extraNames[0]!.given).toBe('Paul Gerhard');
  });

  it('eine reine Schreibweisen-Abweichung ebenso', () => {
    const p = personMit(nameForm({ nameRaw: 'Gt. Hermann /SCHULZE IKING/', surname: 'Schulze Iking' }));
    const next = withUpdatedExtraName(p, 0, 'Gt. Hermann', 'Schulze-Iking', '');
    expect(next.extraNames[0]!.surname).toBe('Schulze-Iking');
  });

  it('echte Verengung bleibt auch nach der Normalisierung stehen', () => {
    // `GIVN Otmar` neben `NAME P. Dr. Otmar /Decker/ O.P.` sagt WENIGER, nicht dasselbe
    // anders — der reale Fall aus dem Bestand.
    const p = personMit(nameForm({ nameRaw: 'P. Dr. Otmar /Decker/ O.P.', given: 'Otmar' }));
    const next = withUpdatedExtraName(p, 0, 'P. Dr. Otmar', 'Decker-Wolff', '');
    expect(next.extraNames[0]!.given).toBe('Otmar');
    expect(next.extraNames[0]!.nameRaw).toBe('P. Dr. Otmar /Decker-Wolff/ O.P.');
  });
});
