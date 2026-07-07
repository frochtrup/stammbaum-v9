// ui/views/source/family-label.ts — gemeinsames Elternpaar-Label für Familien
// (von Familien-Liste UND Quellen-Detail genutzt, um Duplikation zu vermeiden).
import type { Database } from '../../../core/model/types';
import { displayName } from '../../shell/person-display';

/** "Otto Meyer ⚭ Anna Bauer" bzw. "Unbekannte Familie", wenn die id fehlt. */
export function familyLabelFor(db: Database, familyId: string): string {
  const f = db.families.get(familyId);
  if (!f) return '(unbekannte Familie)';
  const husband = f.husband ? db.individuals.get(f.husband) : null;
  const wife = f.wife ? db.individuals.get(f.wife) : null;
  const names = [husband, wife].filter((p): p is NonNullable<typeof p> => p != null).map(displayName);
  return names.length ? names.join(' ⚭ ') : 'Unbekannte Familie';
}
