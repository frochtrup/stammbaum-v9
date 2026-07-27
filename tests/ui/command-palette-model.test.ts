// tests/ui/command-palette-model.test.ts — was die Befehlspalette anzeigt (Spec 21 §3,
// BL-93). Läuft im node-Environment: das Modell ist DOM-frei, und genau darum ist der
// heikelste Teil der Palette — die flache Liste, über die die Tastatur läuft — ohne
// Browser prüfbar.
import { describe, expect, it } from 'vitest';
import {
  MAX_PER_GROUP,
  buildCommands,
  isNavCommand,
  moveSelection,
} from '../../ui/shell/command-palette-model';
import { NAV_TARGETS } from '../../ui/shell/nav-model';
import { makeDatabase, makePerson } from '../../core/model';
import type { PlaceContext } from '../../core/places';

const ctx: PlaceContext = { places: new Map(), hofs: new Map() } as unknown as PlaceContext;

function dbWith(names: [string, string][]) {
  const db = makeDatabase();
  names.forEach(([given, surname], i) => {
    db.individuals.set(`@I${i}@`, makePerson(`@I${i}@`, { given, surname }));
  });
  return db;
}

describe('buildCommands — zwei Quellen, keine eigene', () => {
  it('zeigt bei leerer Eingabe alle GEBAUTEN Navigationsziele', () => {
    const cmds = buildCommands(dbWith([]), ctx, '');
    const built = NAV_TARGETS.filter((t) => t.implemented);

    expect(cmds.length).toBe(built.length);
    expect(cmds.every(isNavCommand)).toBe(true);
    expect(cmds.map((c) => c.id)).toEqual(built.map((t) => t.id));
  });

  it('lässt ungebaute Ziele weg — ein Befehl, der nichts tut, ist schlimmer als keiner', () => {
    const cmds = buildCommands(dbWith([]), ctx, '');
    for (const t of NAV_TARGETS.filter((t) => !t.implemented)) {
      expect(cmds.some((c) => c.id === t.id), t.id).toBe(false);
    }
  });

  it('filtert Navigationsziele nach der Eingabe', () => {
    const cmds = buildCommands(dbWith([]), ctx, 'ort');
    expect(cmds.filter(isNavCommand).map((c) => c.primary)).toEqual(['Orte']);
  });

  it('sucht ab der Mindestlänge auch Entitäten und stellt die Navigation voran', () => {
    // "Baum" trifft BEIDES: das Navigationsziel Baum und die Person Anna Baum. Ohne
    // diese Überschneidung wäre der Reihenfolge-Vergleich unten wirkungslos — er liefe
    // gegen einen leeren Navigations-Teil und wäre immer grün (beim Bau genau so
    // passiert, erst der rote Nachbartest deckte es auf).
    const db = dbWith([
      ['Anna', 'Baum'],
      ['Otto', 'Baum'],
    ]);
    const cmds = buildCommands(db, ctx, 'baum');

    const navs = cmds.filter(isNavCommand);
    const persons = cmds.filter((c) => c.kind === 'person');
    expect(navs.map((c) => c.primary)).toEqual(['Baum']);
    expect(persons.length).toBe(2);

    const firstPersonIndex = cmds.findIndex((c) => c.kind === 'person');
    const lastNavIndex = cmds.map(isNavCommand).lastIndexOf(true);
    expect(lastNavIndex).toBeLessThan(firstPersonIndex);
  });

  it('sucht unterhalb der Mindestlänge NICHT (kein Full-Scan je Tastendruck)', () => {
    const db = dbWith([['Otto', 'Bauer']]);
    expect(buildCommands(db, ctx, 'b').some((c) => c.kind === 'person')).toBe(false);
  });

  it('deckelt jede Entitätsgruppe — die Palette ist ein Sprungwerkzeug, keine Trefferliste', () => {
    const many: [string, string][] = Array.from({ length: MAX_PER_GROUP + 5 }, (_, i) => [
      `Vorname${i}`,
      'Bauer',
    ]);
    const cmds = buildCommands(dbWith(many), ctx, 'bauer');
    expect(cmds.filter((c) => c.kind === 'person').length).toBe(MAX_PER_GROUP);
  });

  it('trägt Gruppen-Überschriften, die die flache Liste gliedern', () => {
    expect(buildCommands(dbWith([]), ctx, '').find(isNavCommand)?.group).toBe('Gehe zu');
    const treffer = buildCommands(dbWith([['Otto', 'Bauer']]), ctx, 'bauer');
    expect(treffer.find((c) => c.kind === 'person')?.group).toBe('Personen');
  });
});

describe('buildCommands — „Zum Probanden" (BL-120)', () => {
  const proband = { id: '@I0@', label: 'Otto Meyer' };

  it('erscheint gar nicht ohne übergebenen Proband (rückwärtskompatibel)', () => {
    const cmds = buildCommands(dbWith([['Otto', 'Meyer']]), ctx, '');
    expect(cmds.some((c) => c.kind === 'proband')).toBe(false);
  });

  it('steht bei leerer Eingabe als erster Befehl der „Gehe zu"-Gruppe', () => {
    const cmds = buildCommands(dbWith([['Otto', 'Meyer']]), ctx, '', proband);
    expect(cmds[0]).toMatchObject({ kind: 'proband', id: '@I0@', primary: 'Zum Probanden', secondary: 'Otto Meyer', group: 'Gehe zu' });
  });

  it('matcht auf „prob" und auf den Proband-Namen', () => {
    expect(buildCommands(dbWith([['Otto', 'Meyer']]), ctx, 'prob', proband).some((c) => c.kind === 'proband')).toBe(true);
    expect(buildCommands(dbWith([['Otto', 'Meyer']]), ctx, 'otto', proband).some((c) => c.kind === 'proband')).toBe(true);
  });

  it('erscheint nicht bei einer nicht passenden Eingabe', () => {
    expect(buildCommands(dbWith([['Otto', 'Meyer']]), ctx, 'xyz', proband).some((c) => c.kind === 'proband')).toBe(false);
  });
});

describe('moveSelection — Tastaturauswahl in der flachen Liste', () => {
  it('geht vorwärts und rückwärts', () => {
    expect(moveSelection(0, 1, 3)).toBe(1);
    expect(moveSelection(2, -1, 3)).toBe(1);
  });

  it('läuft an beiden Enden um (vom ersten hoch = zum letzten)', () => {
    expect(moveSelection(2, 1, 3)).toBe(0);
    expect(moveSelection(0, -1, 3)).toBe(2);
  });

  it('bleibt bei leerer Liste bei 0, statt -1 an den Aufrufer zu geben', () => {
    expect(moveSelection(0, 1, 0)).toBe(0);
    expect(moveSelection(0, -1, 0)).toBe(0);
  });
});
