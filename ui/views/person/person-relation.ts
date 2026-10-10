// ui/views/person/person-relation.ts — die Verwandtschafts-Zeile des Personen-Steckbriefs
// (BL-365, ADR-v9-274). Reine Query: Bestand + Sitzungszustand + angezeigte Person → die
// zwei Teile der Zeile. DOM-frei, headless testbar (TST-5) — und aus `PersonDetail.svelte`
// ausgelagert, weil die Begründung unten länger ist als die Rechnung und die Datei sonst
// an ihre Zeilengrenze stößt (feedback_generous_file_split).
//
// KEIN zweiter Rechenweg: das Etikett kommt aus `findRelationshipPath`/`relationshipLabel`
// — derselbe Beziehungsrechner wie das Werkzeug (BL-134, INV-UI-4).
import type { Database, PersonId } from '../../../core/model/types';
import { displayName } from '../../shell/person-display';
import { resolveProband } from '../../shell/proband';
import { findRelationshipPath, relationToProbandLabel, type RelationToProband } from '../tools/relationship';

/** Der Teil des ViewState, den diese Query braucht — nicht die ganze Schnittstelle, damit
 *  ein Test sie mit einem Einzeiler bedienen kann. */
export interface ProbandQuelle {
  getProband(): PersonId | null;
}

/**
 * Die Zeile für `personId`, oder `null` wenn keine anzuzeigen ist. `null` in zwei Fällen:
 * keine Person, oder die Person IST der Proband — dort sagt die Kopfzeile es bereits über
 * „★ Proband", eine zweite Aussage daneben wäre Rauschen.
 *
 * Bezug ist der EFFEKTIVE Proband (`resolveProband`: der gesetzte, sonst die kleinste Id),
 * wie in jeder anderen Ansicht (INV-UI-4). Bis ADR-v9-309 verlangte diese Zeile als
 * einzige Stelle einen ausdrücklich gesetzten Probanden (ADR-v9-274 E7); der Nutzer hat
 * das aufgehoben — es ist immer ein Proband ausgewählt, und die Zeile steht ab dem Laden.
 */
export function relationLineFor(
  db: Database,
  proband: ProbandQuelle,
  personId: PersonId | null,
): RelationToProband | null {
  const probandId = resolveProband(db, proband);
  if (!personId || !probandId || probandId === personId) return null;
  const p = db.individuals.get(probandId);
  return relationToProbandLabel(findRelationshipPath(db, personId, probandId), p ? displayName(p) : '');
}
