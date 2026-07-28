// ui/views/source/source-detail-model.ts — reine Projektion einer Quelle auf ein
// Detail-Modell (Spec 20 §1.6 [K]: "Detail mit allen referenzierenden Personen/
// Familien inkl. PAGE/QUAY"). Liest AUSSCHLIESSLICH über core-Felder/Chokepoints.
//
// Referenzen werden zusätzlich nach dem referenzierenden Ereignis-/Fundstellen-Typ
// gruppiert (`referencesByType`, Spec 21 §10b) — "Geburt"/"Heirat"/"Name"/… (derselbe
// `context`-Wert, den citation-refs.ts ohnehin schon je Referenz mitführt, hier nur
// aggregiert). Nutzt DIE EINE Gruppierungs-Funktion (`groupByKey`, INV-UI-4, bereits
// von PlaceDetail/HofDetail für ihre "Ereignisse nach Typ"-Abschnitte verwendet) statt
// eine zweite, source-eigene Gruppierungslogik zu erfinden.
import type { Database, Repository, Source } from '../../../core/model/types';
import { displayName } from '../../shell/person-display';
import { groupByKey, type EventGroup } from '../../shell/event-grouping';
import { collectCitationRefs } from './citation-refs';
import { familyLabelFor } from './family-label';
import { badgeLinkHref } from '../../shell/source-badge';

export interface SourceReferenceRow {
  /** Stabiler Rendering-Key (Svelte `{#each}`), da mehrere Referenzen sonst identische
   *  Feldwerte haben könnten (z. B. zwei "Namensvariante"-Zitate derselben Person). */
  key: string;
  ownerKind: 'person' | 'family';
  ownerId: string;
  ownerLabel: string;
  context: string;
  page: string;
  quay: 0 | 1 | 2 | 3;
  /** Online-Fundort der Referenz (ADR-v9-86): abgeleitet über DIESELBE `badgeLinkHref`-
   *  Quelle wie die Quellen-Pille (INV-UI-4) — deepLinkUrl/OBJE-FILE bzw. PAGE-als-URL,
   *  leer wenn kein Weblink. Trägt das klickbare `↗` in der Referenzzeile. */
  url: string;
}

export interface SourceDetailModel {
  source: Source;
  repository: Repository | null;
  references: SourceReferenceRow[];
  /** `references`, gruppiert nach `context` (Spec 21 §10b: "Referenzen (N)" gruppiert
   *  nach referenzierendem Ereignis-/Fundstellen-Typ, paginiert je Gruppe). */
  referencesByType: EventGroup<SourceReferenceRow>[];
}

/**
 * #2 (2026-07-25): `citation.page` wird roh angezeigt (`S. {page}`). Die Demo-Fixture
 * enthält einen Anonymisierungs-Rest `2 PAGE )` — ohne Prüfung erscheint „S. )". Der
 * Rohwert bleibt byte-treu erhalten (LP-1); rein anzeigeseitig wird eine Seitenangabe nur
 * dann gerendert, wenn sie überhaupt etwas Bezeichnendes trägt — mindestens einen
 * Buchstaben oder eine Ziffer (reine Satzzeichen/Whitespace sind keine Fundstelle).
 */
export function hasPageContent(page: string): boolean {
  return /[\p{L}\p{N}]/u.test(page);
}

function ownerLabel(db: Database, kind: 'person' | 'family', id: string): string {
  if (kind === 'person') {
    const p = db.individuals.get(id);
    return p ? displayName(p) : '(unbekannte Person)';
  }
  return familyLabelFor(db, id);
}

/**
 * Baut das read-only Detail-Modell einer Quelle. Gibt null zurück, wenn die id im
 * aktuellen Datenbestand fehlt (definierter Fallback, Spec 21 §5).
 */
export function buildSourceDetail(db: Database, sourceId: string): SourceDetailModel | null {
  const source = db.sources.get(sourceId);
  if (!source) return null;

  const repository = source.repo ? db.repositories.get(source.repo) ?? null : null;

  const references: SourceReferenceRow[] = collectCitationRefs(db)
    .filter((ref) => ref.citation.sourceId === sourceId)
    .map((ref, i) => ({
      key: `${ref.ownerKind}-${ref.ownerId}-${ref.context}-${i}`,
      ownerKind: ref.ownerKind,
      ownerId: ref.ownerId,
      ownerLabel: ownerLabel(db, ref.ownerKind, ref.ownerId),
      context: ref.context,
      page: ref.citation.page,
      quay: ref.citation.quay,
      url: badgeLinkHref(ref.citation),
    }));

  const referencesByType = groupByKey(references, (r) => r.context);

  return { source, repository, references, referencesByType };
}
