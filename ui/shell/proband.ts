// ui/shell/proband.ts — die EINE effektive-Proband-Auflösung der UI-Schicht (BL-120,
// ADR-v9-135/139). Reine Query-Funktion (DOM-frei), damit headless testbar.
//
// Vor BL-120 rechnete jede „Default-Person"-Stelle ihren eigenen Rückfall — TreeView/
// ReportsView per `keys().next()` (Einfüge-Reihenfolge!), RelationshipTool/Validierung per
// sortiert-kleinster ID. Das war ein INV-UI-4-Bruch (ein Mechanismus, nicht pro View neu
// erfunden). Jetzt genau EINE Definition: die in der Sitzung gesetzte Person (falls im
// Bestand), sonst die kleinste Personen-ID (`smallestPersonId` im Kern — dieselbe, die die
// Validierungs-Reachability nutzt).
import type { Database, PersonId } from '../../core/model/types';
import { smallestPersonId } from '../../core/model';
import type { ViewState } from './view-state.svelte';

/**
 * Die effektive Referenzperson der Sitzung: der explizit gesetzte Proband (nur wenn er im
 * aktuellen Bestand existiert — ein Datei-Wechsel darf keine tote Id hinterlassen), sonst
 * der Default „kleinste ID". `null` nur bei leerer Datenbank.
 */
export function resolveProband(db: Database, viewState: ViewState): PersonId | null {
  const set = viewState.getProband();
  if (set && db.individuals.has(set)) return set;
  return smallestPersonId(db);
}
