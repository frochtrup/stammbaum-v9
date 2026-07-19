// ui/views/import/import-compare-model.ts — Ansichts-Modell des Import-Vergleichs
// (BL-107, Spec 20 §1.12). Reine Funktionen über dem Kern (`core/dedup`) — keine eigene
// Vergleichs- oder Schreiblogik, nur Aufbereitung für die Anzeige.
import type { Person, PersonId } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import type { ImportMatch, ImportStatus, PersonDiff, PersonGraph } from '../../../core/dedup';
import { diffPerson } from '../../../core/dedup';
import { displayName, yearPlaceSummary } from '../../shell/person-display';

export interface ImportRow {
  /** Stabiler `{#each}`-Schlüssel — die Id der Fremddatei, sie kommt genau einmal vor. */
  key: PersonId;
  importId: PersonId;
  baseId: PersonId | null;
  status: ImportStatus;
  score: number;
  reasons: string[];
  importLabel: string;
  importMeta: string;
  baseLabel: string;
  baseMeta: string;
  /** Wie viele Felder zu entscheiden wären (Ergänzungen + Konflikte); 0 = nichts zu tun. */
  offeneFelder: number;
}

export const STATUS_LABELS: Record<ImportStatus, string> = {
  matched: 'Übereinstimmung',
  uncertain: 'Unsicher',
  new: 'Neu',
};

function meta(p: Person | undefined, ctx: PlaceContext): string {
  if (!p) return '';
  const s = yearPlaceSummary(p.birth, ctx);
  return s ? `* ${s}` : '';
}

/**
 * Baut die Ergebniszeilen. `overrides` trägt die „≠ Andere Person"-Entscheidungen des
 * Nutzers: eine aufgehobene Zuordnung fällt auf „Neu" zurück (Spec 20 §1.12) — bewusst
 * hier und nicht im Kern, weil es eine Sicht-Entscheidung ist und der Kern-Vergleich
 * reproduzierbar bleiben soll.
 */
export function buildImportRows(
  base: PersonGraph,
  imported: PersonGraph,
  matches: readonly ImportMatch[],
  ctx: PlaceContext,
  overrides: ReadonlySet<PersonId> = new Set(),
): ImportRow[] {
  return matches.map((m) => {
    const aufgehoben = overrides.has(m.importId);
    const baseId = aufgehoben ? null : m.baseId;
    const importPerson = imported.individuals.get(m.importId);
    const basePerson = baseId ? base.individuals.get(baseId) : undefined;
    const diff = importPerson && basePerson ? diffPerson(basePerson, importPerson) : null;
    return {
      key: m.importId,
      importId: m.importId,
      baseId,
      status: aufgehoben ? 'new' : m.status,
      score: aufgehoben ? 0 : m.score,
      reasons: aufgehoben ? [] : m.reasons,
      importLabel: importPerson ? displayName(importPerson) : m.importId,
      importMeta: meta(importPerson, ctx),
      baseLabel: basePerson ? displayName(basePerson) : '',
      baseMeta: meta(basePerson, ctx),
      offeneFelder: diff ? diff.additions.length + diff.conflicts.length : 0,
    };
  });
}

export interface StatusCounts {
  matched: number;
  uncertain: number;
  new: number;
}

export function countByStatus(rows: readonly ImportRow[]): StatusCounts {
  const out: StatusCounts = { matched: 0, uncertain: 0, new: 0 };
  for (const r of rows) out[r.status]++;
  return out;
}

/** Diff eines ausgewählten Paares; `null`, wenn die Zeile keine Zuordnung (mehr) hat. */
export function diffForRow(base: PersonGraph, imported: PersonGraph, row: ImportRow): PersonDiff | null {
  if (!row.baseId) return null;
  const b = base.individuals.get(row.baseId);
  const n = imported.individuals.get(row.importId);
  return b && n ? diffPerson(b, n) : null;
}
