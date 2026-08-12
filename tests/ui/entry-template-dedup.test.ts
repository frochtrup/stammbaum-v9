// tests/ui/entry-template-dedup.test.ts — Live-Dubletten-Erkennung der Erfassungs-
// Vorlagen-Fläche (BL-352, ADR-v9-264 E10). Reine Funktion, kein Komponenten-Mount nötig.
//
// Die Funktion SCHLÄGT VOR — sie bindet nicht. Der zweite Block unten hält den Befund
// fest, der diese Form erzwungen hat.
import { describe, expect, it } from 'vitest';
import {
  duplicateSuggestions,
  ENTRY_TEMPLATE_DUPLICATE_THRESHOLD,
  ENTRY_TEMPLATE_MAX_SUGGESTIONS,
} from '../../ui/shell/entry-template-dedup';
import { makeDatabase, makePerson } from '../../core/model';
import type { Database } from '../../core/model/types';

function graph(db: Database) {
  return { individuals: db.individuals, families: db.families };
}

describe('duplicateSuggestions', () => {
  it('findet die bestehende Person bei nahezu identischem Namen', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Decker', sex: 'F' }));

    const treffer = duplicateSuggestions(graph(db), { given: 'Anna', surname: 'Decker', sex: 'F' });

    expect(treffer.length).toBeGreaterThan(0);
    expect(treffer[0].id).toBe('@I1@');
    expect(treffer[0].score).toBeGreaterThanOrEqual(ENTRY_TEMPLATE_DUPLICATE_THRESHOLD);
  });

  it('liefert nichts unterhalb der Schwelle (ein anderer Name)', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Decker', sex: 'F' }));

    expect(duplicateSuggestions(graph(db), { given: 'Josef', surname: 'Zurloh', sex: 'M' })).toEqual([]);
  });

  it('liefert nichts ohne jeden Namen — kein Treffer ins Blaue an einem leeren Entwurf', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Decker', sex: 'F' }));

    expect(duplicateSuggestions(graph(db), { given: '', surname: '', sex: 'U' })).toEqual([]);
  });

  it('ordnet mehrere Kandidaten absteigend nach Score', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Deker', sex: 'F' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna', surname: 'Decker', sex: 'F' }));

    const treffer = duplicateSuggestions(graph(db), { given: 'Anna', surname: 'Decker', sex: 'F' });

    expect(treffer.length).toBe(2);
    expect(treffer[0].id).toBe('@I2@');
    expect(treffer[0].score).toBeGreaterThan(treffer[1].score);
  });

  it(`bietet höchstens ${ENTRY_TEMPLATE_MAX_SUGGESTIONS} Vorschläge an`, () => {
    const db = makeDatabase();
    for (let i = 0; i < 12; i++) {
      db.individuals.set(`@I${i}@`, makePerson(`@I${i}@`, { given: 'Anna', surname: 'Decker', sex: 'F' }));
    }

    expect(duplicateSuggestions(graph(db), { given: 'Anna', surname: 'Decker', sex: 'F' }))
      .toHaveLength(ENTRY_TEMPLATE_MAX_SUGGESTIONS);
  });

  it('respektiert eine übergebene Schwelle strenger als der Default', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Decker', sex: 'F' }));

    expect(duplicateSuggestions(graph(db), { given: 'Anna', surname: 'Deckerin', sex: 'F' }, 99)).toEqual([]);
  });

  it('bleibt deterministisch (TST-3): gleicher Score, gleiche Reihenfolge', () => {
    const db = makeDatabase();
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna', surname: 'Decker', sex: 'F' }));
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Decker', sex: 'F' }));
    const kandidat = { given: 'Anna', surname: 'Decker', sex: 'F' as const };

    const a = duplicateSuggestions(graph(db), kandidat);
    expect(a.map((t) => t.id)).toEqual(['@I1@', '@I2@']); // id bricht den Gleichstand, nicht die Map-Reihenfolge
    expect(a).toEqual(duplicateSuggestions(graph(db), kandidat));
  });
});

describe('Warum die Funktion vorschlägt statt zu binden (am Score gemessen)', () => {
  // Der Befund, der die erste Fassung (automatische Bindung des besten Treffers)
  // widerlegt hat. Beide Fälle liegen ÜBER der Schwelle und wären still gebunden worden.
  it('ein anderer Vorname beim selben Nachnamen liegt über der Schwelle', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Decker', sex: 'F' }));

    const treffer = duplicateSuggestions(graph(db), { given: 'Maria', surname: 'Decker', sex: 'F' });

    expect(treffer.length).toBe(1);
    expect(treffer[0].score).toBeGreaterThan(ENTRY_TEMPLATE_DUPLICATE_THRESHOLD);
    // Maria ist nicht Anna — die Entscheidung darüber gehört dem Menschen, nicht dem Score.
  });

  // Die Gegenprobe, und sie ist die Grenze der Schwelle: ein Nachname ALLEIN reicht nicht.
  // Ohne Vorname fällt die 20-Punkte-Achse ganz weg (nicht auf 0 bewertet, sondern
  // übersprungen), ohne Geschlecht auch die 11er — es bleiben 24 + 4 = 28. Die Schwelle
  // trennt also durchaus etwas; sie trennt nur nicht Anna von Maria.
  it('der bloße Nachname erreicht die Schwelle NICHT', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Decker', sex: 'F' }));

    expect(duplicateSuggestions(graph(db), { given: '', surname: 'Decker', sex: 'U' })).toEqual([]);
    expect(duplicateSuggestions(graph(db), { given: '', surname: 'Decker', sex: 'F' })).toEqual([]);
  });
});
