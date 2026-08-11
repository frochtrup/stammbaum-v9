// tests/ui/app-state-change-stamp.test.ts — BL-337: die VERDRAHTUNG des Stempels.
//
// `change-stamp.test.ts` prüft die reine Funktion. Hier geht es um die Frage daneben, an
// der solche Bauten scheitern: läuft sie auch? Der Stempel hängt an `commit` — dem einen
// Chokepoint, durch den jedes Editier-Kommando muss. Wäre er stattdessen an ein einzelnes
// Kommando geschrieben, träfe er das nächste nicht, und niemand würde es merken (der Test
// zum Kommando wäre grün, die Datei bliebe stumm). Deshalb wird hier über MEHRERE
// Entitätsarten geprüft, nicht nur an der Person.
//
// Die Uhr ist injiziert (TST-3): ohne sie hinge jede Zusicherung an der Systemzeit.
import { describe, expect, it } from 'vitest';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makePerson, makeFamily, makeSource, makeRepository, makeDatabase } from '../../core/model/index';

const FEST = new Date(Date.UTC(2026, 7, 11, 7, 30, 0));
const STAMP = '11 AUG 2026 07:30:00';

function appMitUhr() {
  return createAppState({ clock: { now: () => FEST } });
}

/** Ein geladener Stand mit je einer Entität pro Art, alle mit ALTEM Stempel. */
function geladen() {
  const db = makeDatabase();
  db.individuals.set('@I1@', makePerson('@I1@', { name: 'Anna /Muster/', lastChanged: '1 JAN 2020' }));
  db.individuals.set('@I2@', makePerson('@I2@', { name: 'Bernd /Muster/', lastChanged: '1 JAN 2020' }));
  db.families.set('@F1@', makeFamily('@F1@', { lastChanged: '1 JAN 2020' }));
  db.sources.set('@S1@', makeSource('@S1@', { title: 'Kirchenbuch', lastChanged: '1 JAN 2020' }));
  db.repositories.set('@R1@', makeRepository('@R1@', { name: 'Archiv', lastChanged: '1 JAN 2020' }));
  return db;
}

describe('AppState datiert jede Bearbeitung (BL-337)', () => {
  it('savePerson stempelt die bearbeitete Person — und nur sie', () => {
    const app = appMitUhr();
    app.loadDatabase(geladen(), 'test.ged');
    app.savePerson({ ...app.db.individuals.get('@I1@')!, name: 'Anna /Anders/' });

    expect(app.db.individuals.get('@I1@')!.lastChanged).toBe(STAMP);
    expect(app.db.individuals.get('@I2@')!.lastChanged, 'die unberührte Person bleibt').toBe('1 JAN 2020');
    expect(app.db.families.get('@F1@')!.lastChanged).toBe('1 JAN 2020');
  });

  it('gilt genauso für Familie, Quelle und Archiv (der Chokepoint, nicht ein Kommando)', () => {
    const app = appMitUhr();
    app.loadDatabase(geladen(), 'test.ged');
    app.saveFamily({ ...app.db.families.get('@F1@')!, noteText: 'geprüft' });
    app.saveSource({ ...app.db.sources.get('@S1@')!, title: 'Kirchenbuch Taufen' });
    app.saveRepository({ ...app.db.repositories.get('@R1@')!, name: 'Bistumsarchiv' });

    expect(app.db.families.get('@F1@')!.lastChanged).toBe(STAMP);
    expect(app.db.sources.get('@S1@')!.lastChanged).toBe(STAMP);
    expect(app.db.repositories.get('@R1@')!.lastChanged).toBe(STAMP);
  });

  it('das Laden einer Datei stempelt NICHTS', () => {
    // Sonst trüge der erste Auto-Save nach jedem Öffnen einen frischen Zeitstempel an
    // JEDEM Datensatz — ein Riesen-Diff, den niemand verursacht hat.
    const app = appMitUhr();
    app.loadDatabase(geladen(), 'test.ged');
    for (const p of app.db.individuals.values()) expect(p.lastChanged).toBe('1 JAN 2020');
  });

  it('ohne injizierte Uhr wird nicht gestempelt (Kern-Tests bleiben zeitfrei)', () => {
    const app = createAppState();
    app.loadDatabase(geladen(), 'test.ged');
    app.savePerson({ ...app.db.individuals.get('@I1@')!, name: 'Anna /Anders/' });
    expect(app.db.individuals.get('@I1@')!.lastChanged).toBe('1 JAN 2020');
  });

  it('„Revert to Saved" datiert nicht um — es ist eine Rücknahme, keine Bearbeitung', () => {
    const app = appMitUhr();
    app.loadDatabase(geladen(), 'test.ged');
    app.savePerson({ ...app.db.individuals.get('@I1@')!, name: 'Anna /Anders/' });
    expect(app.db.individuals.get('@I1@')!.lastChanged).toBe(STAMP);

    app.revertToSaved();
    expect(app.db.individuals.get('@I1@')!.name).toBe('Anna /Muster/');
    expect(app.db.individuals.get('@I1@')!.lastChanged).toBe('1 JAN 2020');
  });
});
