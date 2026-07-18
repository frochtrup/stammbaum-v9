// core/validate/run.ts — der Runner (Spec 20 §3).
//
// Er kennt KEINE einzelne Regel: er iteriert die Registry, ruft je Entitätsart das
// vorhandene Prädikat und macht aus Rohtreffern Befunde. Eine neue Regel erfordert
// hier deshalb keine Zeile.
//
// Die Engine ändert NIE Daten (Spec 20 §3: „RAM-Bericht, keine automatischen
// Datenänderungen") — sie liest die Datenbank und gibt ein Array zurück.
import { buildContext } from './context';
import { RULES } from './rules';
import type { Database } from '../model/types';
import type { Finding, Rule, ValidationConfig } from './types';

/** Reihenfolge der Schweregrade im Bericht: Fehler zuerst. */
const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 } as const;

/**
 * Führt alle aktiven Regeln über die Datenbank aus.
 *
 * Determinismus (TST-3-Geist): die Ausgabe hängt allein an `db` und `config`. Innerhalb
 * eines Schweregrads bleibt die Erzeugungsreihenfolge erhalten (Registry-Reihenfolge ×
 * Map-Einfügereihenfolge) — zweimal derselbe Aufruf liefert byte-gleiche Befunde.
 */
export function runValidation(db: Database, config: ValidationConfig): Finding[] {
  const ctx = buildContext(db, config);
  const active = RULES.filter((r) => !config.disabled.has(r.id));
  const findings: Finding[] = [];

  for (const rule of active) {
    if (rule.person) {
      for (const p of db.individuals.values()) {
        for (const h of rule.person(p, ctx)) {
          findings.push(finding(rule, h.text, { personId: h.personId ?? p.id }));
        }
      }
    }
    if (rule.family) {
      for (const f of db.families.values()) {
        for (const h of rule.family(f, ctx)) {
          findings.push(
            finding(rule, h.text, { personId: h.personId ?? null, familyId: f.id }),
          );
        }
      }
    }
    if (rule.place) {
      for (const o of db.placeObjects.values()) {
        for (const h of rule.place(o, ctx)) {
          findings.push(finding(rule, h.text, { placeId: o.id }));
        }
      }
    }
    if (rule.hof) {
      for (const h0 of db.hofObjects.values()) {
        for (const h of rule.hof(h0, ctx)) {
          findings.push(finding(rule, h.text, { hofId: h0.id }));
        }
      }
    }
  }

  return sortFindings(findings);
}

/**
 * Stabile Sortierung: Schwere zuerst, danach die Erzeugungsreihenfolge. `Array.sort` ist
 * seit ES2019 stabil, der Vergleich allein über die Schwere genügt also.
 */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

interface Anchors {
  personId?: string | null;
  familyId?: string | null;
  placeId?: string | null;
  hofId?: string | null;
}

function finding(rule: Rule, text: string, anchors: Anchors): Finding {
  return {
    rule: rule.id,
    severity: rule.severity,
    text,
    category: rule.category,
    personId: anchors.personId ?? null,
    familyId: anchors.familyId ?? null,
    placeId: anchors.placeId ?? null,
    hofId: anchors.hofId ?? null,
  };
}

/** Befunde je Schweregrad zählen — die Zahl hinter „✓ Daten prüfen" und (später) BL-05. */
export function countBySeverity(findings: readonly Finding[]): {
  error: number;
  warn: number;
  info: number;
} {
  const out = { error: 0, warn: 0, info: 0 };
  for (const f of findings) out[f.severity]++;
  return out;
}

/**
 * Befunde ausblenden, für die an derselben Person bereits eine gleichlautende Aufgabe
 * existiert (v8-Parität `_handleRunValidation`): wer einen Befund einmal übernommen hat,
 * soll ihn nicht bei jeder Prüfung erneut angeboten bekommen.
 */
export function withoutAlreadyTasked(
  findings: readonly Finding[],
  db: Database,
): Finding[] {
  return findings.filter((f) => {
    if (!f.personId) return true;
    const tasks = db.individuals.get(f.personId)?.tasks ?? [];
    return !tasks.some((t) => t.text === f.text);
  });
}
