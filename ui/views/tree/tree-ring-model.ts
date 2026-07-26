// ui/views/tree/tree-ring-model.ts — baut die Vollständigkeits-Ringe je Person für die
// Baum-Inseln (BL-121, Spec 21 §8, ADR-v9-123). Reine Funktion, aus der Svelte-Schale
// ausgelagert (testbar, und die plain `Map` fällt nicht unter die `.svelte`-Reaktivitäts-
// Lint-Regel). Nutzt DIESELBE Befundschwere wie das Dashboard (`computePersonSeverity`,
// INV-UI-4) — kein zweiter Validator; die Insel bekommt das Ergebnis nur gereicht.
import type { Database, PersonId } from '../../../core/model/types';
import { runValidation, withoutAlreadyTasked, computePersonSeverity, type ValidationConfig } from '../../../core/validate/index';
import { SEVERITY_ICON } from '../validation/validation-model';
import type { CardRing } from '../../islands/tree/tree-cards';

/**
 * Ring je Person aus den Validierungs-Befunden (schwerste Schwere = Farbe, alle Befund-
 * texte = Tooltip). Personen ohne Befund fehlen (= sauber, kein Ring). Wie das Dashboard
 * werden bereits als Aufgabe übernommene Befunde ausgeklammert (`withoutAlreadyTasked`).
 */
export function buildTreeRings(db: Database, config: ValidationConfig): Map<PersonId, CardRing> {
  const findings = withoutAlreadyTasked(runValidation(db, config), db);
  const out = new Map<PersonId, CardRing>();
  for (const [id, g] of computePersonSeverity(findings)) {
    const tooltip = [...g.error, ...g.warn, ...g.info].map((f) => `${SEVERITY_ICON[f.severity]} ${f.text}`).join('\n');
    out.set(id, { severity: g.severity, tooltip });
  }
  return out;
}
