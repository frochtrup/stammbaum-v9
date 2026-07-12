// Reine PlaceRegistry + HofRegistry (Read-Tolerance LP-6). Spec 11 §4.4, §5.
import { describe, it, expect } from 'vitest';
import { makePlaceRegistry, makeHofRegistry, buildFormString, chainCompatibleAnyPath } from '../../core/places/index';
import { normPlaceName } from '../../core/places/index';
import { place, hof, placeMap, hofMap } from './places-fixtures';

describe('PlaceRegistry — Identität, Disambiguierung, Periodengerechtheit', () => {
  it('findByName kollabiert Schreibvarianten via Norm', () => {
    const reg = makePlaceRegistry(
      placeMap(place('@P1@', { title: 'Sassenberg', pnames: [{ value: 'Sassenbergk', from: null, to: null }] })),
    );
    expect(reg.findByName('SASSENBERG')).toBe('@P1@');
    expect(reg.findByName('Sassenbergk')).toBe('@P1@');
  });

  it('gleichnamige Orte: spezifischer (Siedlung) gewinnt, beide bleiben distinkt', () => {
    const reg = makePlaceRegistry(
      placeMap(
        place('@KREIS@', { title: 'Münster', type: 'County' }),
        place('@STADT@', { title: 'Münster', type: 'City' }),
      ),
    );
    expect(reg.findByName('Münster')).toBe('@STADT@');
    expect(reg.findAllByName('Münster')).toEqual(['@STADT@', '@KREIS@']);
  });

  it('resolveAsOf: periodengerechte pname, sonst title', () => {
    const reg = makePlaceRegistry(
      placeMap(
        place('@P1@', {
          title: 'Sassenberg',
          pnames: [{ value: 'Sassenbergk', from: 1600, to: 1750 }],
        }),
      ),
    );
    expect(reg.resolveAsOf('@P1@', 1700)).toBe('Sassenbergk');
    expect(reg.resolveAsOf('@P1@', 1900)).toBe('Sassenberg');
    expect(reg.resolveAsOf('@P1@', null)).toBe('Sassenberg');
  });

  it('enclosureChainAsOf: periodengerechte Verwaltungskette', () => {
    const reg = makePlaceRegistry(
      placeMap(
        place('@DORF@', {
          title: 'Ochtrup',
          enclosedBy: [{ placeId: '@LAND@', from: null, to: null }],
        }),
        place('@LAND@', { title: 'Deutschland' }),
      ),
    );
    expect(reg.enclosureChainAsOf('@DORF@', 1900)).toEqual(['Ochtrup', 'Deutschland']);
    expect(buildFormString(reg, '@DORF@', 1900)).toBe('Ochtrup, Deutschland');
  });
});

describe('HofRegistry — Read-Tolerance (LP-6), Eindeutigkeit', () => {
  const hofs = hofMap(
    hof('_hof_wall_33_p1', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
    hof('_hof_komma_p1', '@P1@', { addrs: [{ value: 'Oster 82a, Wester 141', from: null, to: null }] }),
  );

  it('findByAddr matcht reine Adresse', () => {
    const reg = makeHofRegistry(hofs);
    expect(reg.findByAddr('Wall 33', null)).toBe('_hof_wall_33_p1');
  });

  it('Extract-Fallback matcht Adressbuch-Suffix gegen Hof-Kern', () => {
    const reg = makeHofRegistry(hofs);
    expect(reg.findByAddr('Wall 33, 48607 Ochtrup, Deutschland', null)).toBe('_hof_wall_33_p1');
  });

  it('Voll-Norm matcht historischen Komma-Hof (vor Konvention α)', () => {
    const reg = makeHofRegistry(hofs);
    // Voll-Norm trifft „Oster 82a, Wester 141" zuerst — NICHT Extract auf „Oster 82a".
    expect(reg.findByAddr('Oster 82a, Wester 141', null)).toBe('_hof_komma_p1');
  });

  it('Dorf-Scope: gleiche Adresse in anderem Dorf matcht nicht', () => {
    const reg = makeHofRegistry(hofs);
    expect(reg.findByAddr('Wall 33', null, '@ANDERES@')).toBeNull();
  });

  it('Mehrdeutigkeit (≥2 Höfe gleicher Adresse) → findByAddr null', () => {
    const ambiguous = hofMap(
      hof('_hof_a', '@P1@', { addrs: [{ value: 'Hof 1', from: null, to: null }] }),
      hof('_hof_b', '@P1@', { addrs: [{ value: 'Hof 1', from: null, to: null }] }),
    );
    const reg = makeHofRegistry(ambiguous);
    expect(reg.findByAddr('Hof 1', null)).toBeNull();
    expect(reg.findAllByAddr('Hof 1', null)).toHaveLength(2);
  });
});

// chainCompatibleAnyPath — die gemeinsame, reine Mehrpfad-Verträglichkeit (ADR-v9-72),
// geteilt von seed.ts (existingParentsCompatible) und resolve.ts (chainCompatible, year==null).
describe('chainCompatibleAnyPath — Mehrpfad-Eltern-Verträglichkeit (ADR-v9-72)', () => {
  // Ein gemergter Ort mit ZWEI historischen Ketten (verschiedene Kreise, gleiche Region).
  const places = placeMap(
    place('@OCH@', {
      title: 'Ochtrup',
      enclosedBy: [
        { placeId: '@STEINFURT@', from: null, to: null },
        { placeId: '@AHAUS@', from: null, to: null },
      ],
    }),
    place('@STEINFURT@', { title: 'Kreis Steinfurt', enclosedBy: [{ placeId: '@WESTF@', from: null, to: null }] }),
    place('@AHAUS@', { title: 'Kreis Ahaus', enclosedBy: [{ placeId: '@WESTF@', from: null, to: null }] }),
    place('@WESTF@', { title: 'Westfalen' }),
  );
  const byId = makePlaceRegistry(places).byId;
  const norm = (segs: string[]): string[] => segs.map(normPlaceName);

  it('trifft die ERSTE Kette (Index 0)', () => {
    expect(chainCompatibleAnyPath(byId, '@OCH@', norm(['Kreis Steinfurt', 'Westfalen']))).toBe(true);
  });

  it('trifft die ZWEITE Kette (Index 1) — der eigentliche Bug', () => {
    expect(chainCompatibleAnyPath(byId, '@OCH@', norm(['Kreis Ahaus', 'Westfalen']))).toBe(true);
  });

  it('lehnt eine widersprüchliche Kette ab', () => {
    expect(chainCompatibleAnyPath(byId, '@OCH@', norm(['USA']))).toBe(false);
  });

  it('Präfix-Semantik: kürzere Stated-Kette ist verträglich', () => {
    expect(chainCompatibleAnyPath(byId, '@OCH@', norm(['Kreis Ahaus']))).toBe(true);
    expect(chainCompatibleAnyPath(byId, '@OCH@', [])).toBe(true);
  });

  it('lenient bei fehlendem Blatt-Knoten (nicht verifizierbar → verträglich)', () => {
    expect(chainCompatibleAnyPath(byId, '@FEHLT@', norm(['Westfalen']))).toBe(true);
  });

  it('matcht Knoten auch über eine PNAME (nicht nur den Titel)', () => {
    const withPname = placeMap(
      place('@X@', { title: 'Dorf', enclosedBy: [{ placeId: '@LAND@', from: null, to: null }] }),
      place('@LAND@', { title: 'Deutschland', pnames: [{ value: 'Deutsches Reich', from: 1871, to: 1945 }] }),
    );
    const byId2 = makePlaceRegistry(withPname).byId;
    expect(chainCompatibleAnyPath(byId2, '@X@', norm(['Deutsches Reich']))).toBe(true);
  });
});
