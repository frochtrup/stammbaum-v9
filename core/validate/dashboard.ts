// core/validate/dashboard.ts — die Rechenhälfte des Qualitäts-Dashboards
// (Spec 20 §1.11g, BL-05). Kern-Schicht: DOM-frei, framework-frei (INV-ARCH-1).
//
// Zweiter Konsument DERSELBEN Engine wie der Prüfbericht (§1.11h): die Befunde kommen
// fertig herein, diese Datei erzeugt keine eigenen. Eine abgeschaltete Regel
// verschwindet damit automatisch auch aus Score und Ampel — genau die in Spec 20 §1.11g
// verlangte Kopplung, ohne dass sie hier eigens hergestellt werden müsste.
//
// Was das Dashboard ZUSÄTZLICH tut: das Lückenradar zählt direkt am `db`, nicht über
// Befunde. Das ist Absicht — ein Balken „mind. 1 Quelle: 62 %" soll auch dann stimmen,
// wenn die zugehörige Regel (NO_SOURCES_AT_ALL) abgeschaltet ist; er beantwortet eine
// Bestands-, keine Befundfrage.
import {
  birthYear,
  deathYear,
  hasAnyEval,
  hasAnyQuay,
  hasSources,
  openHypotheses,
  personLabel,
  yearOf,
} from './facts';
import type { Database, Person, PersonId } from '../model/types';
import type { Finding, Severity } from './types';

/** Ein Balken des Lückenradars. `base` ist die Bezugsmenge, nicht immer `total`. */
export interface RadarBar {
  label: string;
  /** Personen, die das Merkmal erfüllen. */
  n: number;
  /** Bezugsmenge — bei QUAY/Evidenz die Personen MIT Quellen, sonst alle. */
  base: number;
  /** Gerundeter Anteil; 0 bei leerer Bezugsmenge (kein NaN in der Anzeige). */
  pct: number;
}

/** Eine Person der Brennpunkt-Liste, Befunde nach Schwere getrennt. */
export interface FocusPerson {
  personId: PersonId;
  label: string;
  /** „✶1850 †1920"; leer, wenn beide Jahre fehlen. */
  life: string;
  error: Finding[];
  warn: Finding[];
  info: Finding[];
  /** Dringlichkeitsgewicht der Sortierung (v8-Parität, s. `weightOf`). */
  weight: number;
}

export interface QualityDashboard {
  /** Personen im Scope — der Nenner von `cleanPct` und der meisten Radar-Balken. */
  total: number;
  /** Anteil befundfreier Personen in Prozent. Ampel: grün ≥80, gelb ≥50, sonst rot. */
  cleanPct: number;
  /** Personen je schwerstem Befund — jede Person genau einmal. */
  ampel: { error: number; warn: number; infoOnly: number; clean: number };
  /** Befunde je Schwere — jeder Befund einzeln. Andere Frage als `ampel`. */
  counts: { error: number; warn: number; info: number };
  radar: RadarBar[];
  /** Alle Personen mit mindestens einem Befund, dringlichste zuerst. */
  focus: FocusPerson[];
}

export interface DashboardOptions {
  /**
   * Personenmenge des aktiven Forschungsprojekts (Spec 20 §1.11f/g „Respektiert aktives
   * Projekt als Scope"). `null`/weggelassen = alle Personen.
   *
   * Bewusst eine fertige Menge statt eines `Project`-Objekts: die Scope-Matching-Funktion
   * selbst ist BL-58 und lebt dann bei den Projekten, nicht hier — das Dashboard muss
   * nicht wissen, WORAUS ein Scope entsteht, nur WELCHE Personen darin liegen.
   */
  scope?: ReadonlySet<PersonId> | null;
}

/** Brennpunkt-Auswahl (v8-Parität): Handlungsbedarf · nur Fehler · alles. */
export type FocusFilter = 'attention' | 'red' | 'all';

/** Eine Brennpunkt-Zeile, auf die gewählte Schwere-Auswahl reduziert. */
export interface FocusRow {
  personId: PersonId;
  label: string;
  life: string;
  /** Nur die Befunde der gewählten Schweregrade, Fehler zuerst. */
  findings: Finding[];
  /** Schwerster vertretener Grad — die Farbe des Punkts vor dem Namen. */
  dot: Severity;
}

const SEVERITIES: Severity[] = ['error', 'warn', 'info'];

const FOCUS_SEVERITIES: Record<FocusFilter, Severity[]> = {
  attention: ['error', 'warn'],
  red: ['error'],
  all: ['error', 'warn', 'info'],
};

/**
 * Dringlichkeit einer Person: ein Fehler schlägt jede Zahl von Warnungen, eine Warnung
 * jede Zahl von Hinweisen (v8-Orakel `ui-views-dashboard.js`). Die Stufung ist bewusst
 * grob — sie ordnet nach Handlungsbedarf, nicht nach Befundmenge.
 */
function weightOf(error: number, warn: number, info: number): number {
  return error * 1000 + warn * 10 + info;
}

/**
 * Baut das gesamte Dashboard-Modell in EINEM Durchlauf über die Personen im Scope.
 *
 * `findings` kommt fertig herein — üblicherweise `withoutAlreadyTasked(runValidation(…))`,
 * damit bereits übernommene Befunde weder den Score drücken noch erneut zur Übernahme
 * angeboten werden.
 */
export function buildQualityDashboard(
  db: Database,
  findings: readonly Finding[],
  opts: DashboardOptions = {},
): QualityDashboard {
  const scope = opts.scope ?? null;
  const persons: Person[] = [];
  for (const p of db.individuals.values()) {
    if (!scope || scope.has(p.id)) persons.push(p);
  }

  // Befunde je Person bündeln. Befunde ohne Trägerperson (Orte/Höfe) und solche an
  // Personen ausserhalb des Scopes gehören nicht in diese personbezogene Auswertung —
  // sie bleiben dem vollständigen Prüfbericht (§1.11h) vorbehalten.
  const inScope = new Set<PersonId>(persons.map((p) => p.id));
  const byPerson = new Map<PersonId, { error: Finding[]; warn: Finding[]; info: Finding[] }>();
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of findings) {
    if (!f.personId || !inScope.has(f.personId)) continue;
    let g = byPerson.get(f.personId);
    if (!g) {
      g = { error: [], warn: [], info: [] };
      byPerson.set(f.personId, g);
    }
    g[f.severity].push(f);
    counts[f.severity]++;
  }

  const ampel = { error: 0, warn: 0, infoOnly: 0, clean: 0 };
  const focus: FocusPerson[] = [];
  // Radar-Zähler — ein Durchlauf, sieben bis acht Fragen je Person.
  let cBirth = 0, cBirthPlace = 0, cDeath = 0, cSex = 0;
  let cSrc = 0, cQuay = 0, cEval = 0;
  let cHypoBase = 0, cHypoResolved = 0;

  for (const p of persons) {
    const g = byPerson.get(p.id);
    if (!g) ampel.clean++;
    else if (g.error.length) ampel.error++;
    else if (g.warn.length) ampel.warn++;
    else if (g.info.length) ampel.infoOnly++;
    else ampel.clean++;

    if (g) {
      focus.push({
        personId: p.id,
        label: personLabel(p),
        life: lifeLabel(p),
        error: g.error,
        warn: g.warn,
        info: g.info,
        weight: weightOf(g.error.length, g.warn.length, g.info.length),
      });
    }

    if (p.birth.date || p.chr.date) cBirth++;
    if (p.birth.place || p.chr.place) cBirthPlace++;
    if (p.death.date || p.buri.date) cDeath++;
    if (p.sex === 'M' || p.sex === 'F') cSex++;
    if (hasSources(p)) {
      cSrc++;
      if (hasAnyQuay(p)) cQuay++;
      if (hasAnyEval(p)) cEval++;
    }
    if (p.hypotheses.length > 0) {
      cHypoBase++;
      if (openHypotheses(p.hypotheses) === 0) cHypoResolved++;
    }
  }

  const total = persons.length;
  const radar: RadarBar[] = [
    bar('Geburts-/Taufdatum', cBirth, total),
    bar('Geburtsort', cBirthPlace, total),
    bar('Sterbedatum', cDeath, total),
    bar('Geschlecht bestimmt', cSex, total),
    bar('mind. 1 Quelle', cSrc, total),
    // Bezug: die Personen MIT Quellen. Sonst zählte das Fehlen einer Quelle zweimal
    // gegen dieselbe Person — hier lautet die Frage, wie gut die vorhandenen Quellen
    // belegt sind (v8-Parität `base: cSrc`).
    bar('Quellen mit Bewertung (QUAY)', cQuay, cSrc),
    bar('Quellen mit Evidenzbewertung', cEval, cSrc),
  ];
  // Hypothesen-Balken nur, wenn überhaupt Hypothesen existieren: informiert, ohne zu
  // strafen (Spec 20 §1.11g „[nur wenn vorhanden] aufgelöste Hypothesen").
  if (cHypoBase > 0) radar.push(bar('Hypothesen aufgelöst', cHypoResolved, cHypoBase));

  // Stabil: `Array.sort` ist seit ES2019 stabil, bei gleichem Gewicht bleibt damit die
  // Map-Reihenfolge der Personen erhalten (TST-3-Geist — gleiche Eingabe, gleiche Liste).
  focus.sort((a, b) => b.weight - a.weight);

  return {
    total,
    cleanPct: total > 0 ? Math.round((ampel.clean / total) * 100) : 0,
    ampel,
    counts,
    radar,
    focus,
  };
}

/**
 * Brennpunkte auf eine Schwere-Auswahl reduzieren. Bewusst getrennt von
 * `buildQualityDashboard`: der Filter ist eine Anzeige-Entscheidung, die sich ändert,
 * ohne dass Score, Ampel oder Radar neu gerechnet werden müssten.
 */
export function filterFocus(focus: readonly FocusPerson[], filter: FocusFilter): FocusRow[] {
  const wanted = FOCUS_SEVERITIES[filter];
  const rows: FocusRow[] = [];
  for (const p of focus) {
    const findings = wanted.flatMap((s) => p[s]);
    if (findings.length === 0) continue;
    rows.push({
      personId: p.personId,
      label: p.label,
      life: p.life,
      findings,
      dot: SEVERITIES.find((s) => p[s].length > 0) ?? 'info',
    });
  }
  return rows;
}

function bar(label: string, n: number, base: number): RadarBar {
  return { label, n, base, pct: base > 0 ? Math.round((n / base) * 100) : 0 };
}

/** „✶1850 †1920" — Taufe bzw. Bestattung springen ein, wenn das Hauptdatum fehlt. */
function lifeLabel(p: Person): string {
  const b = birthYear(p);
  const d = deathYear(p) ?? yearOf(p.buri.date);
  if (b === null && d === null) return '';
  return [b !== null ? `✶${b}` : '', d !== null ? `†${d}` : ''].filter(Boolean).join(' ');
}
