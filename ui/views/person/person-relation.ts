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
import { findRelationshipPath, relationToProbandLabel, type RelationToProband } from '../tools/relationship';

/** Der Teil des ViewState, den diese Query braucht — nicht die ganze Schnittstelle, damit
 *  ein Test sie mit einem Einzeiler bedienen kann. */
export interface ProbandQuelle {
  getProband(): PersonId | null;
}

/**
 * Die Zeile für `personId`, oder `null` wenn keine anzuzeigen ist. `null` in drei Fällen:
 * keine Person, kein gesetzter Proband, oder die Person IST der Proband — dort sagt die
 * Kopfzeile es bereits über „★ Proband", eine zweite Aussage daneben wäre Rauschen.
 *
 * BEWUSST `getProband()` STATT `resolveProband()` — die einzige Stelle im Programm, die den
 * AUSDRÜCKLICH gesetzten Probanden verlangt statt der effektiven Referenzperson
 * (ADR-v9-274 E7). `resolveProband` beantwortet „auf wen richten sich die Ansichten, solange
 * niemand gewählt hat" und fällt dafür auf die kleinste Id zurück — eine technische
 * Vorbelegung. Diese Zeile stellt dagegen einen SATZ ÜBER ZWEI BENANNTE MENSCHEN auf; mit
 * der Vorbelegung als Bezug behauptete sie „nicht mit <Person, die niemand gewählt hat>
 * verwandt". Eine Kekule-Nummer verträgt einen stillen Bezugspunkt, ein Satz mit Namen
 * nicht. Kein zweiter Auflösungsweg (INV-UI-4 bleibt gewahrt): `getProband` IST die Quelle,
 * aus der `resolveProband` selbst liest — hier wird nur auf dessen Rückfall verzichtet.
 */
export function relationLineFor(
  db: Database,
  proband: ProbandQuelle,
  personId: PersonId | null,
): RelationToProband | null {
  const probandId = proband.getProband();
  // Datei-Wechsel: eine gesetzte Id, die es hier nicht mehr gibt, ergibt keinen Bezug
  // (dieselbe Bestands-Prüfung, die `resolveProband` für seinen Rückfall macht).
  if (!personId || !probandId || probandId === personId || !db.individuals.has(probandId)) return null;
  const p = db.individuals.get(probandId);
  return relationToProbandLabel(findRelationshipPath(db, personId, probandId), p ? displayName(p) : '');
}
