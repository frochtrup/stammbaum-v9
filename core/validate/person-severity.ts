// core/validate/person-severity.ts — Befunde je Person, nach Schwere gruppiert und auf die
// schwerste reduziert (ADR-v9-123, Spec 21 §8). DOM-frei, framework-frei. EIN
// Bewertungsmechanismus, zwei Anzeigeorte: die Qualitäts-Dashboard-Ampel/-Brennpunkte
// (§1.11g) UND der Vollständigkeits-Ring der Baum-Inseln (§1.3, BL-121) leiten ihre
// Per-Person-Schwere hieraus ab — kein zweiter, insel-lokaler Mini-Validator (v8-Vorbild).
import type { PersonId } from '../model/types';
import type { Finding, Severity } from './types';

/** Befunde einer Person, nach Schwere getrennt, plus die schwerste (für Ampel/Ring-Farbe). */
export interface PersonFindings {
  /** Schwerster vertretener Grad (error > warn > info). */
  severity: Severity;
  error: Finding[];
  warn: Finding[];
  info: Finding[];
}

/** Schwerster Grad einer nicht-leeren Gruppe (error > warn > info). */
function worstOf(error: number, warn: number, info: number): Severity {
  return error > 0 ? 'error' : warn > 0 ? 'warn' : info > 0 ? 'info' : 'info';
}

/**
 * Bündelt `findings` je Trägerperson und bestimmt die schwerste Schwere. Personen ohne
 * personbezogenen Befund fehlen in der Map (= „sauber", kein Ring). Befunde ohne
 * `personId` (Orte/Höfe/Familien-nur) und — falls `inScope` gesetzt — ausserhalb des
 * Scopes werden übergangen (dieselbe Regel wie das Dashboard: Orts-/Hof-Befunde gehören
 * in den vollständigen Prüfbericht, §1.11h).
 */
export function computePersonSeverity(
  findings: readonly Finding[],
  inScope?: ReadonlySet<PersonId> | null,
): Map<PersonId, PersonFindings> {
  const byPerson = new Map<PersonId, PersonFindings>();
  for (const f of findings) {
    if (!f.personId) continue;
    if (inScope && !inScope.has(f.personId)) continue;
    let g = byPerson.get(f.personId);
    if (!g) {
      g = { severity: 'info', error: [], warn: [], info: [] };
      byPerson.set(f.personId, g);
    }
    g[f.severity].push(f);
  }
  for (const g of byPerson.values()) {
    g.severity = worstOf(g.error.length, g.warn.length, g.info.length);
  }
  return byPerson;
}
