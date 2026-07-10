// tests/ui/count-active-filters.test.ts — Diff-Zählung für den FilterBar-Trigger
// ("Filter · N", Spec 21 §10a).
import { describe, expect, it } from 'vitest';
import { countActiveFilters } from '../../ui/shell/count-active-filters';
import { defaultPersonFilters } from '../../ui/views/person/person-list-model';
import { defaultFamilyFilters } from '../../ui/views/family/family-list-model';
import { defaultPlaceFilters } from '../../ui/views/place/place-list-model';

describe('countActiveFilters', () => {
  it('zählt 0 bei unveränderten Defaults', () => {
    expect(countActiveFilters(defaultPersonFilters(), defaultPersonFilters())).toBe(0);
    expect(countActiveFilters(defaultFamilyFilters(), defaultFamilyFilters())).toBe(0);
    expect(countActiveFilters(defaultPlaceFilters(), defaultPlaceFilters())).toBe(0);
  });

  it('zählt genau die vom Default abweichenden Felder, mehrere gleichzeitig', () => {
    const filters = { ...defaultPersonFilters(), sex: 'F' as const, birthYearFrom: 1900, noSources: true };
    expect(countActiveFilters(filters, defaultPersonFilters())).toBe(3);
  });

  it('zählt eine einzelne geänderte Boolean-Flag', () => {
    const filters = { ...defaultFamilyFilters(), noChildren: true };
    expect(countActiveFilters(filters, defaultFamilyFilters())).toBe(1);
  });

  it('zählt einen einzelnen geänderten Select-Wert (PlaceFilters.type)', () => {
    const filters = { ...defaultPlaceFilters(), type: 'Village' };
    expect(countActiveFilters(filters, defaultPlaceFilters())).toBe(1);
  });
});
