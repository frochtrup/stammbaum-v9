// core/dedup/identity-exclusions.ts — Dublettenausschlüsse aus dem Bestand einsammeln
// (Spec 20 §1.12, Spec 12 §4, ADR-v9-174, BL-240).
//
// Der Ausschluss „diese beiden Datensätze sind nicht dieselbe Person" liegt seit
// ADR-v9-174 NICHT mehr in einem app-privaten Store, sondern als abgelehnte
// Identitäts-Hypothese IN der Genealogie-Datei — dort sind die Ids per Konstruktion
// gültig, der Befund reist mit der Datei und braucht weder Schlüssel noch Sync.
//
// Geschrieben wird EINSEITIG (an einem der beiden Datensätze), gelesen BEIDSEITIG:
// dieser Sammler normalisiert über `pairKey`, sodass es dem Finder gleichgültig ist,
// an welcher Seite der Befund hängt.
import type { Hypothesis } from '../research/types';
import { isIdentityExclusion } from '../research/hypothesis';
import { pairKey } from './person-duplicates';
import type { PersonGraph } from './person-duplicates';

function addFrom(owner: string, hypotheses: Hypothesis[], out: Set<string>): void {
  for (const h of hypotheses) {
    if (!isIdentityExclusion(h)) continue;
    for (const ref of h.refs) out.add(pairKey(owner, ref));
  }
}

/**
 * Alle ausgeschlossenen Paare als `pairKey`-Menge — direkt als `ignored`-Argument für
 * `findPersonDuplicates` verwendbar (gleiche Schlüsselform, EINE Definition).
 *
 * Läuft über Personen UND Familien: beide Träger führen `hypotheses[]`, und ein
 * Identitäts-Befund über zwei Familien („dieselbe Ehe, doppelt erfasst") ist dieselbe
 * Aussage über eine andere Datensatz-Art.
 */
export function collectIdentityExclusions(db: PersonGraph): Set<string> {
  const out = new Set<string>();
  for (const p of db.individuals.values()) addFrom(p.id, p.hypotheses, out);
  for (const f of db.families.values()) addFrom(f.id, f.hypotheses, out);
  return out;
}
