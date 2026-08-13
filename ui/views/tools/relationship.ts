// ui/views/tools/relationship.ts — Beziehungsrechner (BL-134, Spec 20 §1.12).
// Reine Graph-Logik: BFS die Vorfahrenketten beider Personen hoch, kürzester gemeinsamer
// Vorfahre → Grad-Benennung (Vorfahr/Nachkomme, Onkel/Tante, Cousin-Grade + „entfernt").
// DOM-frei, framework-frei → headless unit-testbar. Reuse `getParentIds` aus tree-model
// (dieselbe Eltern-Auflösung wie Sanduhr/Ahnenliste, kein zweiter Rechenweg).
// Verhaltens-Orakel: v8 `ui-views-person.js` `calcRelationship`/`_relLabel`.
import type { Database, PersonId, Sex } from '../../../core/model/types';
import { getParentIds } from '../../islands/tree/tree-model';

/** BFS-Suchtiefe (Generationen aufwärts) — wie v8 (`DEPTH = 12`). */
const MAX_DEPTH = 12;

export interface RelationshipResult {
  /** Existiert ein gemeinsamer Vorfahre in Reichweite? */
  related: boolean;
  /** Verwandtschafts-Etikett aus A-Sicht (z. B. „Cousin 2. Grads", „Großmutter") bzw.
   *  „Nicht verwandt". */
  label: string;
  /** Generationsabstand A → gemeinsamer Vorfahre. */
  distA: number;
  /** Generationsabstand B → gemeinsamer Vorfahre. */
  distB: number;
  /** id des (kürzest-erreichbaren) gemeinsamen Vorfahren, null wenn nicht verwandt. */
  commonId: PersonId | null;
  /** Pfad A … gemeinsamer Vorfahre … B (durchgehende Kette für die Darstellung). */
  path: PersonId[];
  /** Mehrere gleich kurze Verwandtschaftspfade — nur der kürzeste ist dargestellt. */
  multiPath: boolean;
}

/**
 * Deutsches Verwandtschafts-Etikett aus Sicht von A (Geschlecht `sexA`) zu B, gegeben die
 * Generationsabstände beider zum gemeinsamen Vorfahren. Direkte Portierung von v8 `_relLabel`.
 * - distA=0: A IST der Vorfahre von B → Mutter/Vater/Großmutter/…
 * - distB=0: B ist der Vorfahre von A → Sohn/Tochter/Enkel/…
 * - sonst: Geschwister / Onkel-Tante-Neffe-Nichte / Cousin-Grade (+ „entfernt").
 */
export function relationshipLabel(distA: number, distB: number, sexA: Sex): string {
  const f = sexA === 'F';
  if (distA === 0) {
    if (distB === 1) return f ? 'Mutter' : 'Vater';
    if (distB === 2) return f ? 'Großmutter' : 'Großvater';
    if (distB === 3) return f ? 'Urgroßmutter' : 'Urgroßvater';
    return 'Ur'.repeat(distB - 2) + (f ? 'großmutter' : 'großvater');
  }
  if (distB === 0) {
    if (distA === 1) return f ? 'Tochter' : 'Sohn';
    if (distA === 2) return f ? 'Enkelin' : 'Enkel';
    if (distA === 3) return f ? 'Urenkelin' : 'Urenkel';
    return 'Ur'.repeat(distA - 2) + (f ? 'enkelin' : 'enkel');
  }
  const m = Math.min(distA, distB);
  const M = Math.max(distA, distB);
  const isOlder = distA < distB;
  if (m === 1) {
    if (M === 1) return 'Geschwister';
    const gen = M - 1;
    if (isOlder) {
      if (gen === 1) return f ? 'Tante' : 'Onkel';
      if (gen === 2) return f ? 'Großtante' : 'Großonkel';
      return 'Ur'.repeat(gen - 2) + (f ? 'großtante' : 'großonkel');
    }
    if (gen === 1) return f ? 'Nichte' : 'Neffe';
    if (gen === 2) return f ? 'Großnichte' : 'Großneffe';
    return 'Ur'.repeat(gen - 2) + (f ? 'großnichte' : 'großneffe');
  }
  const degree = m - 1;
  const removed = M - m;
  const base = f ? 'Cousine' : 'Cousin';
  return removed ? `${base} ${degree}. Grads, ${removed}× entfernt` : `${base} ${degree}. Grads`;
}

interface AncInfo {
  dist: number;
  path: PersonId[];
}

/** BFS die Vorfahrenkette von `startId` hoch → Map id → {kürzeste Distanz, Pfad}. */
function ancestorsUp(db: Database, startId: PersonId): Map<PersonId, AncInfo> {
  const seen = new Map<PersonId, AncInfo>();
  const queue: Array<{ id: PersonId; dist: number; path: PersonId[] }> = [
    { id: startId, dist: 0, path: [startId] },
  ];
  while (queue.length) {
    const { id, dist, path } = queue.shift()!;
    if (seen.has(id)) continue;
    seen.set(id, { dist, path });
    if (dist >= MAX_DEPTH) continue;
    const { father, mother } = getParentIds(db, id);
    if (father && !seen.has(father)) queue.push({ id: father, dist: dist + 1, path: [...path, father] });
    if (mother && !seen.has(mother)) queue.push({ id: mother, dist: dist + 1, path: [...path, mother] });
  }
  return seen;
}

/**
 * Berechnet die Verwandtschaft zwischen A und B. `null`, wenn eine id fehlt oder A===B
 * (keine sinnvolle Beziehung zu sich selbst). Sonst ein `RelationshipResult` — bei fehlendem
 * gemeinsamen Vorfahren mit `related=false`/`label='Nicht verwandt'`.
 */
export function findRelationshipPath(
  db: Database,
  idA: PersonId,
  idB: PersonId,
): RelationshipResult | null {
  if (!idA || !idB || idA === idB) return null;
  if (!db.individuals.has(idA) || !db.individuals.has(idB)) return null;

  const ancA = ancestorsUp(db, idA);
  const ancB = ancestorsUp(db, idB);

  let best: { id: PersonId; distA: number; distB: number; total: number; pathA: PersonId[]; pathB: PersonId[] } | null = null;
  let multiCount = 0;
  for (const [id, infoA] of ancA) {
    const infoB = ancB.get(id);
    if (!infoB) continue;
    const total = infoA.dist + infoB.dist;
    if (!best || total < best.total) {
      best = { id, distA: infoA.dist, distB: infoB.dist, total, pathA: infoA.path, pathB: infoB.path };
      multiCount = 1;
    } else if (total === best.total) {
      multiCount++;
    }
  }

  if (!best) {
    return { related: false, label: 'Nicht verwandt', distA: 0, distB: 0, commonId: null, path: [], multiPath: false };
  }

  // Durchgehende Kette A … gemeinsamer Vorfahre … B: A-Pfad hoch bis zum Vorfahren, dann
  // B-Pfad (ohne den doppelten Vorfahren) rückwärts wieder hinunter zu B.
  const path = [...best.pathA, ...best.pathB.slice(0, -1).reverse()];
  const sexA = db.individuals.get(idA)?.sex ?? 'U';
  return {
    related: true,
    label: relationshipLabel(best.distA, best.distB, sexA),
    distA: best.distA,
    distB: best.distB,
    commonId: best.id,
    path,
    multiPath: multiCount > 1,
  };
}

/** Die Verwandtschafts-Zeile am Steckbrief, in zwei Teilen — der GRAD wird hervorgehoben
 *  dargestellt, der Rest bleibt gedämpft (Nutzer-Wunsch 2026-08-13: „der Verwandtschafts-
 *  grad sollte etwas hervorgehoben werden"). Deshalb kein fertiger String: die Auszeichnung
 *  gehört ins Markup, und ein Aufteilen am Wort „von" wäre eine Zerlegung dessen, was diese
 *  Funktion gerade zusammengesetzt hat. */
export interface RelationToProband {
  /** „Vater", „Enkelin", „Geschwister" — hervorgehoben. Leer, wenn nicht verwandt. */
  degree: string;
  /** Der Rest der Zeile: „von Otto Alt" bzw. die ganze Aussage „nicht mit Otto Alt verwandt". */
  suffix: string;
  /** Beide Teile als eine Zeichenkette — für Tooltip, `aria-label` und Tests. */
  text: string;
}

/**
 * Die kompakte Verwandtschafts-Angabe am Personen-Steckbrief (Nutzer-Wunsch 2026-08-13):
 * „**Enkelin** von Otto Alt" bzw. „nicht mit Otto Alt verwandt".
 *
 * KEIN zweiter Rechenweg und keine zweite Benennung — das Etikett kommt unverändert aus
 * `relationshipLabel` (über `findRelationshipPath`), hier wird nur die Bezugsperson
 * angehängt. Der Beziehungsrechner formuliert daraus seinen eigenen ganzen Satz mit BEIDEN
 * Namen; das ist eine andere Fläche, dieselbe Quelle.
 *
 * `null`/leerer Name → `null`: `findRelationshipPath` liefert `null`, wenn die Person der
 * Proband SELBST ist (Beziehung zu sich selbst), und dann sagt die Kopfzeile das bereits
 * über „★ Proband".
 *
 * „Geschwister" bleibt „Geschwister von X": die geteilte Benennung kennt für diesen Fall
 * bewusst kein Geschlecht (v8-Orakel `_relLabel`), und sie hier zu Bruder/Schwester
 * aufzulösen wäre eine zweite Benennungsregel neben der einen.
 */
export function relationToProbandLabel(rel: RelationshipResult | null, probandName: string): RelationToProband | null {
  if (!rel || !probandName) return null;
  if (!rel.related) {
    const suffix = `nicht mit ${probandName} verwandt`;
    return { degree: '', suffix, text: suffix };
  }
  return { degree: rel.label, suffix: `von ${probandName}`, text: `${rel.label} von ${probandName}` };
}
