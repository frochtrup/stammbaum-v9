// Test-Fixtures für den Orts-Kern (Spec 11). Reine Datenfabriken — keine Logik.
import { makeEvent } from '../../core/model/index';
import type { Event, PlaceId, HofId } from '../../core/model/types';
import type {
  PlaceObject,
  HofObject,
  PlaceObjects,
  HofObjects,
} from '../../core/places/index';

export function place(id: PlaceId, patch: Partial<PlaceObject> = {}): PlaceObject {
  return {
    id,
    title: '',
    shortName: '',
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
    ...patch,
  };
}

export function hof(id: HofId, villageId: PlaceId, patch: Partial<HofObject> = {}): HofObject {
  return {
    id,
    villageId,
    addrs: [],
    lat: null,
    long: null,
    note: '',
    existsFrom: null,
    existsTo: null,
    predecessor: null,
    successor: null,
    govId: null,
    govTypes: null,
    schemaVersion: 1,
    ...patch,
  };
}

export function placeMap(...ps: PlaceObject[]): PlaceObjects {
  return new Map(ps.map((p) => [p.id, p]));
}

export function hofMap(...hs: HofObject[]): HofObjects {
  return new Map(hs.map((h) => [h.id, h]));
}

export function ev(type: string, patch: Partial<Event> = {}): Event {
  return makeEvent(type, patch);
}
