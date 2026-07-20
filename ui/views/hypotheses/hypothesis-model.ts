// ui/views/hypotheses/hypothesis-model.ts — reine Logik der globalen Hypothesen-Liste
// (Spec 12 §4, Spec 20 §1.11 [S] "Hypothesen (GPS)"). Analog
// ui/views/tasks/tasks-model.ts (collectAllTasks) — DOM-frei testbar (TST-5), liest
// AUSSCHLIESSLICH über db.individuals/db.families (Chokepoint-Zugriff, Spec 02 §3).
import type { Database } from '../../../core/model/types';
import type { Hypothesis, HypothesisStatus } from '../../../core/research/types';
import { displayName } from '../../shell/person-display';
import { familyLabelFor } from '../source/family-label';
import type { TaskEntityKind } from '../tasks/tasks-model';

/** Eine Hypothese zusammen mit ihrer Trägerentität (analog TaskEntry). */
export interface HypothesisEntry {
  kind: TaskEntityKind;
  entityId: string;
  entityLabel: string;
  hypothesis: Hypothesis;
}

/**
 * Sammelt ALLE Hypothesen über Personen UND Familien (analog collectAllTasks). Reine
 * Funktion, kein eigener Zustand — ein Kommando (Hypothese hinzufügen/ändern) →
 * Chokepoints neu lesen → diese Funktion erneut aufrufen.
 */
export function collectAllHypotheses(db: Database): HypothesisEntry[] {
  const out: HypothesisEntry[] = [];
  for (const [id, p] of db.individuals) {
    for (const hypothesis of p.hypotheses) {
      out.push({ kind: 'person', entityId: id, entityLabel: displayName(p), hypothesis });
    }
  }
  for (const [id] of db.families) {
    const label = familyLabelFor(db, id);
    const f = db.families.get(id)!;
    for (const hypothesis of f.hypotheses) {
      out.push({ kind: 'family', entityId: id, entityLabel: label, hypothesis });
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

/** Filtert nach Status (analog filterTasks). */
export function filterHypotheses(entries: HypothesisEntry[], filter: HypothesisFilter): HypothesisEntry[] {
  if (filter === 'all') return entries;
  return entries.filter((e) => e.hypothesis.status === filter);
}
