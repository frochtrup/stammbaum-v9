// tests/ui/story-place-context.test.ts — Orts-Kontextsätze des Story-Modus (BL-185,
// Spec 20 §1.10). Reine Funktion über die core/places-Registry; Orakel v8
// `buildPlaceContextSentence`. Wächter: bleibt unskipped.
import { describe, expect, it } from 'vitest';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import type { PlaceObject } from '../../core/places/types';
import type { PlaceId } from '../../core/model/types';
import { buildPlaceContextSentence } from '../../ui/views/story/place-context';

function po(id: string, over: Partial<PlaceObject>): PlaceObject {
  return {
    id, title: '', shortName: '', type: '', pnames: [], translations: [], enclosedBy: [],
    lat: null, long: null, note: '', existsFrom: null, existsTo: null,
    govId: null, govTypes: null, ...over,
  };
}

function ctxOf(...places: PlaceObject[]): PlaceContext {
  const m = new Map<PlaceId, PlaceObject>();
  for (const p of places) m.set(p.id, p);
  return { places: makePlaceRegistry(m), hofs: makeHofRegistry(new Map()) };
}

describe('buildPlaceContextSentence', () => {
  it('Ortstyp + Zugehörigkeitskette (ohne Jahr)', () => {
    const ctx = ctxOf(
      po('P1', { title: 'Musterdorf', type: 'Village', enclosedBy: [{ placeId: 'P2', from: null, to: null }] }),
      po('P2', { title: 'Kreis Lippe', type: 'County' }),
    );
    expect(buildPlaceContextSentence(ctx, 'P1', null)).toBe('Musterdorf war ein Dorf in Kreis Lippe.');
  });

  it('periodenkorrekter Name zum Ereignisjahr + Jahr im Satz', () => {
    const ctx = ctxOf(
      po('P1', {
        title: 'Neustadt', type: 'City',
        pnames: [{ value: 'Altstadt', from: 1800, to: 1850 }],
        enclosedBy: [{ placeId: 'P2', from: 1700, to: 2000 }],
      }),
      po('P2', { title: 'Provinz Westfalen', type: 'Province' }),
    );
    const out = buildPlaceContextSentence(ctx, 'P1', 1830);
    expect(out).toBe('Altstadt war 1830 eine Stadt in Provinz Westfalen.');
  });

  it('kein placeId → leer', () => {
    expect(buildPlaceContextSentence(ctxOf(), null, 1830)).toBe('');
  });

  it('unbekannter Ort → leer', () => {
    expect(buildPlaceContextSentence(ctxOf(), 'PX', 1830)).toBe('');
  });

  it('weder Typ noch Kette → leer (kein nichtssagender Satz)', () => {
    const ctx = ctxOf(po('P1', { title: 'Irgendwo', type: '' }));
    expect(buildPlaceContextSentence(ctx, 'P1', null)).toBe('');
  });
});
