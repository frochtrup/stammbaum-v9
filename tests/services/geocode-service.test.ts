// tests/services/geocode-service.test.ts — Nominatim-Service mit gemocktem Netzwerk (BL-130).
// Kein echter fetch, keine echten Timer (headless, deterministisch).
import { describe, expect, it, vi } from 'vitest';
import {
  geocodePlace,
  batchGeocodePlaces,
  type GeocodeDeps,
} from '../../services/places/geocode-service';

const OCHTRUP = [{ lat: '52.2073', lon: '7.1845', address: { village: 'Ochtrup', country: 'Deutschland' } }];

/** Deps mit einem fetchJson, das je URL eine feste Antwort liefert; sleep sofort. */
function mockDeps(byQuery: Record<string, unknown>): GeocodeDeps {
  return {
    fetchJson: vi.fn(async (url: string) => {
      const q = new URL(url).searchParams.get('q') ?? '';
      if (q in byQuery) return byQuery[q];
      throw new Error('Nominatim HTTP 500');
    }),
    sleep: vi.fn(async () => {}),
  };
}

describe('geocodePlace', () => {
  it('liefert den geparsten Treffer', async () => {
    const hit = await geocodePlace('Ochtrup', mockDeps({ Ochtrup: OCHTRUP }));
    expect(hit).toEqual({ lat: 52.2073, long: 7.1845, type: 'Village', hierarchy: [{ title: 'Deutschland', type: 'Country' }] });
  });

  it('leerer Name → null, ohne fetch', async () => {
    const deps = mockDeps({});
    expect(await geocodePlace('   ', deps)).toBeNull();
    expect(deps.fetchJson).not.toHaveBeenCalled();
  });

  it('nicht-Array-Antwort → null', async () => {
    expect(await geocodePlace('X', { fetchJson: async () => ({ error: 'x' }) })).toBeNull();
  });

  it('reicht Netzwerk-Fehler durch (der Aufrufer meldet)', async () => {
    await expect(geocodePlace('X', { fetchJson: async () => { throw new Error('offline'); } })).rejects.toThrow('offline');
  });
});

describe('batchGeocodePlaces', () => {
  it('geocodiert mehrere, meldet Fortschritt, wartet zwischen den Anfragen', async () => {
    const deps = mockDeps({ Ochtrup: OCHTRUP, München: [{ lat: '48.13', lon: '11.57', address: { city: 'München' } }] });
    const progress: string[] = [];
    const res = await batchGeocodePlaces(['Ochtrup', 'München'], deps, (p) => progress.push(`${p.done}/${p.total}:${p.current}`));

    expect([...res.keys()]).toEqual(['Ochtrup', 'München']);
    expect(res.get('München')?.type).toBe('City');
    // Fortschritt: je Start + Abschluss.
    expect(progress).toEqual(['0/2:Ochtrup', '1/2:München', '2/2:']);
    // Rate-Limit: genau EIN sleep zwischen zwei Namen (nicht nach dem letzten).
    expect(deps.sleep).toHaveBeenCalledTimes(1);
  });

  it('ein Fehler überspringt den Namen, bricht den Batch nicht ab', async () => {
    // „Nirgendwo" ist nicht in der Mock-Tabelle → wirft; „Ochtrup" gelingt.
    const deps = mockDeps({ Ochtrup: OCHTRUP });
    const res = await batchGeocodePlaces(['Nirgendwo', 'Ochtrup'], deps);
    expect([...res.keys()]).toEqual(['Ochtrup']);
  });
});
