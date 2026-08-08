// tests/ui/validation-model.test.ts — die Projektion der Regel-Registry in die Oberfläche.
import { describe, expect, it } from 'vitest';
import { RULES } from '../../core/validate/rules';
import { rulesByGroup } from '../../ui/views/validation/validation-model';

// ADR-v9-228: die Regel war eingetragen, getestet und grün — und erschien trotzdem nicht,
// weil die Anzeige-Reihenfolge eine separate Liste war, die der Compiler nicht prüfen
// konnte. Dieser Wächter stellt die Frage für JEDE Gruppe, nicht nur für „format".
describe('rulesByGroup — keine Gruppe fällt still heraus', () => {
  it('jede Gruppe, die eine Regel trägt, erscheint auch in der Ausgabe', () => {
    const gruppenMitRegeln = new Set(RULES.map((r) => r.group));
    const gezeigt = new Set(rulesByGroup().map((g) => g.group));
    expect(gruppenMitRegeln.size).toBeGreaterThan(0);
    for (const g of gruppenMitRegeln) expect(gezeigt.has(g)).toBe(true);
  });

  it('jede einzelne Regel taucht genau einmal auf', () => {
    const alle = rulesByGroup().flatMap((g) => g.rules.map((r) => r.id));
    expect(new Set(alle).size).toBe(alle.length);
    expect(alle.length).toBe(RULES.length);
  });

  it('ADDR_INDEX_ONLY erscheint unter „Dateiformat"', () => {
    const gruppe = rulesByGroup().find((g) => g.rules.some((r) => r.id === 'ADDR_INDEX_ONLY'));
    expect(gruppe?.label).toBe('Dateiformat');
  });
});
