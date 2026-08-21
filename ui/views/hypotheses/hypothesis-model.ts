// ui/views/hypotheses/hypothesis-model.ts — reine Logik der globalen Hypothesen-Liste
// (Spec 12 §4, Spec 20 §1.11 [S] "Hypothesen (GPS)"). Analog
// ui/views/tasks/tasks-model.ts (collectAllTasks) — DOM-frei testbar (TST-5), liest
// AUSSCHLIESSLICH über db.individuals/db.families (Chokepoint-Zugriff, Spec 02 §3).
import type { Database, PersonId } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import type { Hypothesis, HypothesisStatus, ProjectScope } from '../../../core/research/types';
import { displayName, yearPlaceSummary } from '../../shell/person-display';
import { familyLabelFor } from '../source/family-label';
import { entityInScope, type TaskEntityKind } from '../tasks/tasks-model';
import { matchesResearchQuery } from '../research-search';

/** Eine Hypothese zusammen mit ihrer Trägerentität (analog TaskEntry). */
export interface HypothesisEntry {
  kind: TaskEntityKind;
  entityId: string;
  entityLabel: string;
  /** Disambiguierendes Sekundärmerkmal (INV-UI-6, BL-109) — s. TaskEntry.entitySummary. */
  entitySummary: string;
  hypothesis: Hypothesis;
}

/**
 * Sammelt ALLE Hypothesen über Personen UND Familien (analog collectAllTasks). Reine
 * Funktion, kein eigener Zustand — ein Kommando (Hypothese hinzufügen/ändern) →
 * Chokepoints neu lesen → diese Funktion erneut aufrufen. `ctx` optional (INV-UI-6, BL-109).
 */
export function collectAllHypotheses(
  db: Database,
  ctx?: PlaceContext,
  scope?: ProjectScope | null,
  allowed: ReadonlySet<PersonId> | null = null,
): HypothesisEntry[] {
  const out: HypothesisEntry[] = [];
  for (const [id, p] of db.individuals) {
    if (!entityInScope(db, 'person', id, scope, allowed)) continue;
    const summary = ctx ? yearPlaceSummary(p.birth, ctx) : '';
    for (const hypothesis of p.hypotheses) {
      out.push({ kind: 'person', entityId: id, entityLabel: displayName(p), entitySummary: summary, hypothesis });
    }
  }
  for (const [id] of db.families) {
    if (!entityInScope(db, 'family', id, scope, allowed)) continue;
    const label = familyLabelFor(db, id);
    const f = db.families.get(id)!;
    for (const hypothesis of f.hypotheses) {
      out.push({ kind: 'family', entityId: id, entityLabel: label, entitySummary: '', hypothesis });
    }
  }
  return out;
}

export type HypothesisFilter = 'all' | HypothesisStatus;

const STATUS_LABELS: Record<HypothesisStatus, string> = {
  open: 'Offen',
  confirmed: 'Bestätigt',
  rejected: 'Verworfen',
};

export function statusLabel(status: HypothesisStatus): string {
  return STATUS_LABELS[status];
}

const WEIGHT_LABELS: Record<Hypothesis['weight'], string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
};

export function weightLabel(weight: Hypothesis['weight']): string {
  return WEIGHT_LABELS[weight];
}

/** Textsuche über Annahme, Begründung, Schluss und Trägername (BL-374, Spec 20 §1.11d). */
export function matchesHypothesisQuery(e: HypothesisEntry, query: string): boolean {
  const h = e.hypothesis;
  return matchesResearchQuery([h.text, h.rationale, h.conclusion, e.entityLabel], query);
}

/** Filtert nach Status (analog filterTasks). */
export function filterHypotheses(entries: HypothesisEntry[], filter: HypothesisFilter): HypothesisEntry[] {
  if (filter === 'all') return entries;
  return entries.filter((e) => e.hypothesis.status === filter);
}
