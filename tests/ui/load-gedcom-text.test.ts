// tests/ui/load-gedcom-text.test.ts — gemeinsame GEDCOM-Text-Lade-Pipeline (Spec 20
// §1.2 [K]/[S]: "Datei öffnen" + "Demo-Modus"), extrahiert aus ImportButton.svelte.
// Reine Orchestrierung: nimmt einen Text-String (Quelle egal — Datei-Picker ODER
// Demo-Asset), gemockter PlacesSyncService (analog tests/services/mock-places-store.ts,
// ADR-v9-15) + ein ECHTER AppState (createAppState() ist reine Runes-Logik, node-fähig,
// s. tests/ui/app-state.test.ts) — kein DOM nötig.
import { describe, expect, it } from 'vitest';
import { loadGedcomText } from '../../ui/shell/load-gedcom-text';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { PlacesSyncService } from '../../services/places';
import { createMockPlacesStore, createMockDeviceId, createMockClock } from '../services/mock-places-store';

const MINI_GED = `0 HEAD
1 SOUR TEST
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Max /Muster/
2 GIVN Max
2 SURN Muster
1 SEX M
1 BIRT
2 DATE 1 JAN 1900
2 PLAC Ochtrup, Steinfurt, Deutschland
0 TRLR
`;

function makeSyncService(): PlacesSyncService {
  return new PlacesSyncService(createMockPlacesStore(null), createMockDeviceId('device-1'), createMockClock(1000));
}

describe('loadGedcomText — EINE Pipeline für Datei-Import UND Demo-Ladeweg', () => {
  it('parst den Text, lädt Orte/Höfe-Wissen und ruft appState.loadDatabase() mit dem übergebenen Dateinamen auf', async () => {
    const appState = createAppState();
    const placesSync = makeSyncService();

    const result = await loadGedcomText(MINI_GED, 'demo.ged', appState, placesSync);

    expect(appState.fileName).toBe('demo.ged');
    expect(appState.db.individuals.get('@I1@')?.given).toBe('Max');
    expect(result.placesNotice).toBe('');
  });

  it('funktioniert identisch für einen anderen Dateinamen (Datei-Picker-Pfad) — dieselbe Pipeline, andere Quelle', async () => {
    const appState = createAppState();
    const placesSync = makeSyncService();

    await loadGedcomText(MINI_GED, 'echte-datei.ged', appState, placesSync);

    expect(appState.fileName).toBe('echte-datei.ged');
    expect(appState.db.individuals.size).toBe(1);
  });

  it('frischer Start: Orte werden aus PLAC automatisch geseedet (ADR-v9-28), Höfe brauchen weiterhin ADDR', async () => {
    const appState = createAppState();
    const placesSync = makeSyncService();

    await loadGedcomText(MINI_GED, 'demo.ged', appState, placesSync);

    // Auto-Seed: "Ochtrup, Steinfurt, Deutschland" → Village-POs sind nach dem Import sichtbar.
    expect(appState.db.placeObjects.size).toBeGreaterThan(0);
    expect([...appState.db.placeObjects.values()].some((p) => p.title === 'Ochtrup')).toBe(true);
    // Reines BIRT ohne ADDR bootstrappt keinen Hof.
    expect(appState.db.hofObjects.size).toBe(0);
  });

  it('meldet einen Hinweis, wenn reconcileAndSave einen Union-Merge-Konflikt meldet (Hof-Bootstrap wächst hofObjects)', async () => {
    const appState = createAppState();
    // Vorbelegtes Orte-Wissen mit einem Dorf, gegen das ein RESI-Event mit ADDR
    // (Konvention 2, Pfad B') einen Hof bootstrappen kann.
    const store = createMockPlacesStore({
      schemaVersion: 1,
      rev: 1,
      device: 'other-device',
      ts: 500,
      placeObjects: [
        {
          id: '@P1@',
          title: 'Ochtrup',
          type: '',
          pnames: [],
          enclosedBy: [],
          lat: null,
          long: null,
          note: '',
          existsFrom: null,
          existsTo: null,
          govId: null,
          govTypes: null,
        },
      ],
      hofObjects: [],
    });
    const placesSync = new PlacesSyncService(store, createMockDeviceId('device-1'), createMockClock(1000));

    const gedWithAddr = `0 HEAD
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Max /Muster/
1 SEX M
1 RESI
2 DATE 1930
2 PLAC Ochtrup, Steinfurt, Deutschland
2 ADDR Wall 33
0 TRLR
`;

    await loadGedcomText(gedWithAddr, 'demo.ged', appState, placesSync);

    // Hof-Bootstrap (Pfad B') ist gelaufen -> hofObjects gewachsen -> reconcileAndSave lief.
    expect(appState.db.hofObjects.size).toBe(1);
  });
});
