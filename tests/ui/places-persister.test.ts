// tests/ui/places-persister.test.ts — Orts-Persister (Befund 1 / task_a82678c1):
// kapselt PlacesSyncService + baseRev-Tracking, damit Import- UND Edit-Pfad denselben
// Rev-Stand teilen. Gemockter Store (In-Memory, ADR-v9-15) — kein echtes IndexedDB.
import { describe, expect, it } from 'vitest';
import { createPlacesPersister } from '../../ui/shell/places-persister';
import { PlacesSyncService } from '../../services/places';
import { createMockPlacesStore, createMockDeviceId, createMockClock } from '../services/mock-places-store';
import type { PlaceObject, HofObject } from '../../core/places';
import type { PlacesFileWrapper } from '../../services/places/types';

function place(id: string, title: string): PlaceObject {
  return {
    id, title, type: '', pnames: [], enclosedBy: [], lat: null, long: null,
    note: '', existsFrom: null, existsTo: null, govId: null, govTypes: null,
  };
}
const pm = (...ps: PlaceObject[]): Map<string, PlaceObject> => new Map(ps.map((p) => [p.id, p]));
const hm = (...hs: HofObject[]): Map<string, HofObject> => new Map(hs.map((h) => [h.id, h]));

function makePersister(initial: PlacesFileWrapper | null = null, device = 'device-1') {
  const store = createMockPlacesStore(initial);
  const sync = new PlacesSyncService(store, createMockDeviceId(device), createMockClock(1000));
  return { persister: createPlacesPersister(sync), store };
}

describe('createPlacesPersister — orte.json-Persistenz + baseRev-Tracking (Befund 1)', () => {
  it('persist() speichert und meldet keinen Hinweis bei sauberem Speichern', async () => {
    const { persister, store } = makePersister();
    const res = await persister.persist(pm(place('@A@', 'Ochtrup')), hm());
    expect(res.notice).toBe('');
    expect(store._peek()?.placeObjects.map((p) => p.id)).toEqual(['@A@']);
    expect(store._peek()?.rev).toBe(1);
  });

  it('mehrere persist()-Aufrufe tracken die rev fort — kein falscher Same-Device-Konflikt', async () => {
    const { persister, store } = makePersister();
    await persister.persist(pm(place('@A@', 'Ochtrup')), hm());
    const res2 = await persister.persist(pm(place('@A@', 'Ochtrup'), place('@B@', 'Wettringen')), hm());
    expect(res2.notice).toBe('');
    expect(store._peek()?.rev).toBe(2);
    expect(store._peek()?.placeObjects.map((p) => p.id).sort()).toEqual(['@A@', '@B@']);
  });

  it('load() setzt baseRev auf die geladene Revision — anschließendes persist() ohne Konflikt', async () => {
    const { persister, store } = makePersister({
      schemaVersion: 1, rev: 5, device: 'device-1', ts: 100,
      placeObjects: [place('@X@', 'Alt')], hofObjects: [],
    });
    const loaded = await persister.load();
    expect(loaded.rev).toBe(5);
    const res = await persister.persist(pm(place('@X@', 'Alt'), place('@Y@', 'Neu')), hm());
    expect(res.notice).toBe('');
    expect(store._peek()?.rev).toBe(6);
  });

  it('schema-too-new → Hinweis + kein Überschreiben', async () => {
    const { persister, store } = makePersister({
      schemaVersion: 999, rev: 3, device: 'other', ts: 100, placeObjects: [], hofObjects: [],
    });
    const res = await persister.persist(pm(place('@A@', 'Ochtrup')), hm());
    expect(res.notice).toContain('neueren App-Version');
    expect(store._peek()?.schemaVersion).toBe(999);
  });
});
