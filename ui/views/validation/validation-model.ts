// ui/views/validation/validation-model.ts — reines Ansichts-Modell des Prüfberichts
// (Spec 20 §1.11h/§3). Kein DOM, kein Svelte — damit build-frei testbar (INV-ARCH-2).
import type { Database } from '../../../core/model/types';
import type { Finding, Severity } from '../../../core/validate/index';
import { RULES, type Rule, type RuleGroup } from '../../../core/validate/index';
import { placeDisplayName } from '../../../core/places';
import { displayName } from '../../shell/person-display';

export const SEVERITY_ICON: Record<Severity, string> = { error: '✗', warn: '⚠', info: 'ℹ' };
export const SEVERITY_LABEL: Record<Severity, string> = {
  error: 'Fehler',
  warn: 'Warnungen',
  info: 'Hinweise',
};

export const GROUP_LABEL: Record<RuleGroup, string> = {
  logik: 'Logische Fehler',
  plausibilitaet: 'Plausibilität',
  vollstaendigkeit: 'Vollständigkeit',
  quellen: 'Quellen',
  vernetzung: 'Vernetzung',
  geo: 'Orte & Höfe',
  format: 'Dateiformat',
};

/** Ein Befund, angereichert um die Beschriftungen, die die Zeile darstellen muss. */
export interface FindingRow {
  finding: Finding;
  /** Anzeigename der Trägerentität — nie leer. */
  subject: string;
  /** true, wenn die Zeile auf eine Person navigieren kann. */
  canNavigate: boolean;
}

export interface SeverityGroup {
  severity: Severity;
  rows: FindingRow[];
}

/**
 * Befunde in die drei Schwere-Blöcke gruppieren, wie der Bericht sie zeigt.
 * Leere Blöcke fallen weg — eine Überschrift „⚠ Warnungen (0)" ist keine Information.
 */
export function groupBySeverity(findings: readonly Finding[], db: Database): SeverityGroup[] {
  const order: Severity[] = ['error', 'warn', 'info'];
  return order
    .map((severity) => ({
      severity,
      rows: findings.filter((f) => f.severity === severity).map((f) => toRow(f, db)),
    }))
    .filter((g) => g.rows.length > 0);
}

function toRow(finding: Finding, db: Database): FindingRow {
  return { finding, subject: subjectLabel(finding, db), canNavigate: !!finding.personId };
}

/**
 * Beschriftung der Trägerentität. Personen-Befunde zeigen den Personennamen, Orts-/
 * Hof-Befunde den Orts-/Hoftitel — sonst stünde bei den Geo-Regeln eine leere Spalte
 * (Spec 20 §3: das Dashboard muss ZWEI Fundstellen-Arten anzeigen können).
 */
export function subjectLabel(f: Finding, db: Database): string {
  if (f.personId) {
    const p = db.individuals.get(f.personId);
    return p ? displayName(p) : f.personId;
  }
  if (f.placeId) {
    const o = db.placeObjects.get(f.placeId);
    return placeDisplayName(o) || f.placeId;
  }
  if (f.hofId) {
    const h = db.hofObjects.get(f.hofId);
    return h?.addrs[0]?.value || f.hofId;
  }
  if (f.familyId) return f.familyId;
  return '—';
}

/** Regeln für das Konfigurations-Sheet nach Gruppen ordnen (Registry-Reihenfolge bleibt). */
export function rulesByGroup(): { group: RuleGroup; label: string; rules: Rule[] }[] {
  const order: RuleGroup[] = [
    'logik',
    'plausibilitaet',
    'vollstaendigkeit',
    'quellen',
    'vernetzung',
    'geo',
  ];
  return order
    .map((group) => ({
      group,
      label: GROUP_LABEL[group],
      rules: RULES.filter((r) => r.group === group),
    }))
    .filter((g) => g.rules.length > 0);
}

/** Beschriftungen der Schwellenwert-Felder im Konfigurations-Sheet. */
export const THRESHOLD_LABEL: Record<string, string> = {
  maxAge: 'Unrealistisches Alter ab (Jahre)',
  staStAera: 'Standesamt-Ära ab (Jahr)',
  minMotherAge: 'Mutter zu jung unter (Jahre)',
  maxMotherAge: 'Mutter zu alt über (Jahre)',
  minFatherAge: 'Vater zu jung unter (Jahre)',
  maxFatherAge: 'Vater zu alt über (Jahre)',
  minMarrAge: 'Heiratsalter zu jung unter (Jahre)',
  maxChildren: 'Ungewöhnlich viele Kinder ab',
  hofMaxDistKm: 'Hof zu weit vom Ort über (km)',
  bboxMinLat: 'Bounding-Box: min. Breite',
  bboxMaxLat: 'Bounding-Box: max. Breite',
  bboxMinLon: 'Bounding-Box: min. Länge',
  bboxMaxLon: 'Bounding-Box: max. Länge',
};

/** Kurzfassung für die Kopfzeile: „9 Fehler · 160 Warnungen · 2817 Hinweise". */
export function summaryText(findings: readonly Finding[]): string {
  if (findings.length === 0) return 'Keine Befunde — die Daten sehen gut aus.';
  const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return (['error', 'warn', 'info'] as Severity[])
    .filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${SEVERITY_LABEL[s]}`)
    .join(' · ');
}
