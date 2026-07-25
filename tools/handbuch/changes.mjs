// tools/handbuch/changes.mjs
//
// Geteilte git-Analyse für die Handbuch-Automatisierung — von build-handbook.mjs (Changelog)
// UND text-review.mjs (Prosa-Abgleich) genutzt, damit beide EXAKT dasselbe Änderungsfenster
// und dieselbe Commit-Auswahl sehen (eine Quelle der Wahrheit, kein Drift).

import { execSync } from 'node:child_process';

export function git(repo, cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: repo, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/**
 * Basis-Commit des Änderungsfensters = der letzte COMMIT, der HANDBUCH.html verändert hat
 * (= der letzte Handbuch-Bau). Ein laufender Bau stempelt HANDBUCH.html nur im Arbeitsbaum
 * (kein Commit), `git log` sieht also den vorigen Bau — kein gespeichertes Feld nötig.
 * Mit `sinceArg` (aus `--since <ref>`) übersteuerbar.
 */
export function resolveBase(repo, sinceArg = '') {
  return sinceArg || git(repo, 'log -1 --format=%H -- HANDBUCH.html');
}

const TYPE = /^(feat|fix|perf)(\(|:|!)/i;
/** Nur echter App-Code zählt als user-relevant — Tooling/Doku/Tests fallen per Pfad heraus. */
export const APP_PATHS = ['app', 'ui', 'core', 'services'];

/**
 * Alle Commits im Fenster `base..HEAD`, die App-Code berühren, angereichert mit Dateien und
 * BL-/ADR-Referenzen. Standardmäßig nur feat/fix/perf; `includeAll` hebt den Typ-Filter auf.
 * Ergebnis: [{ hash, subject, body, files: string[], refs: string[] }].
 */
export function collectCommits(repo, base, { includeAll = false } = {}) {
  if (!base) return [];
  // %x1f trennt Felder, %x1e die Records — beides Zeichen, die in Commit-Texten nicht vorkommen.
  const raw = git(repo, `log --no-merges --pretty=format:%h%x1f%s%x1f%b%x1e ${base}..HEAD -- ${APP_PATHS.join(' ')}`);
  const out = [];
  for (const rec of raw ? raw.split('\x1e') : []) {
    const t = rec.replace(/^\s+/, '');
    if (!t) continue;
    const parts = t.split('\x1f');
    const hash = parts[0];
    const subject = (parts[1] || '').trim();
    const body = (parts[2] || '').trim();
    if (!hash || !subject) continue;
    if (!includeAll && !TYPE.test(subject)) continue;
    const files = git(repo, `diff-tree --no-commit-id --name-only -r ${hash}`).split('\n').filter(Boolean);
    const refs = [...new Set((`${subject} ${body}`).match(/\b(?:BL-\d+|ADR-v9-\d+)\b/g) || [])];
    out.push({ hash, subject, body, files, refs });
  }
  return out;
}

/**
 * Heuristische Zuordnung eines Commits zu Handbuch-Abschnitten (Kapitel/Anhang) anhand von
 * Schlüsselwörtern in Betreff, Body und geänderten Dateipfaden. Bewusst großzügig (lieber ein
 * Abschnitt zu viel als einer zu wenig) — es ist ein Wegweiser für die Prosa-Prüfung, keine
 * automatische Entscheidung.
 */
const SECTION_MAP = [
  { section: 'Kap. 3 / Navigation', kw: ['nav-model', 'sidebar', 'bottom-nav', 'bottomnav', 'command', 'palette', 'viewstate', 'view-state', 'shell/'] },
  { section: 'Kap. 4 (Personen)', kw: ['person', 'duplikat', 'dedup', 'beweisführung', 'proof-summary'] },
  { section: 'Kap. 5 (Familien)', kw: ['famil'] },
  { section: 'Kap. 6 (Quellen/Archive)', kw: ['quelle', 'source', 'zitat', 'citation', 'archiv', 'repository', 'quay', 'evidenz', 'eval', 'beweiskraft'] },
  { section: 'Kap. 7 (Orte) + orte.json', kw: ['/place', 'ort', 'orte', 'verwaltung', 'enclosed', 'pname', 'hierarchie', 'seed'] },
  { section: 'Kap. 8 (Höfe)', kw: ['hof', 'höfe', 'farm', 'building'] },
  { section: 'Kap. 9 (Baum/Karte/Zeitleiste)', kw: ['sanduhr', 'tree', 'baum', 'karte', '/map', 'zeitleiste', 'timeline', 'fächer', 'fan-chart', 'nachkommen', 'lens', 'island', 'insel', 'migration'] },
  { section: 'Kap. 10 (Statistik)', kw: ['statistik', 'stats'] },
  { section: 'Kap. 11 (Forschung)', kw: ['aufgabe', 'task', 'protokoll', 'rlog', 'research-log', 'hypothese', 'hypo', 'forschung', 'research', 'projekt', 'project', 'kanban', 'board'] },
  { section: 'Kap. 12 (Qualität/Dashboard)', kw: ['dashboard', 'regel', 'validier', 'validation', 'befund', 'lücken', 'quality'] },
  { section: 'Kap. 13 (Suche)', kw: ['suche', 'search'] },
  { section: 'Kap. 14 (Speichern/Undo)', kw: ['undo', 'redo', 'arbeitskopie', 'working-copy', 'snapshot'] },
  { section: 'Kap. 15 + Anhänge B/C (Formate)', kw: ['export', 'import', 'gedcom', 'gramps', 'roundtrip', 'anonymis', 'writer', 'parser', 'interop', 'passthrough'] },
  { section: 'Anhang D (Technik)', kw: ['architektur', 'pwa', 'offline', 'service worker', 'sw-', 'indexeddb', 'idb-'] },
];

export function suggestSections(commit) {
  // Primär die AUTOR-Beschreibung (Betreff + Body) — sie sagt am schärfsten, WORUM es geht.
  const desc = `${commit.subject} ${commit.body}`.toLowerCase();
  const fromDesc = SECTION_MAP.filter((s) => s.kw.some((k) => desc.includes(k))).map((s) => s.section);
  if (fromDesc.length) return [...new Set(fromDesc)];
  // Nur wenn die Beschreibung nichts hergibt: auf die geänderten Dateipfade zurückfallen.
  const fromFiles = SECTION_MAP.filter((s) => s.kw.some((k) => commit.files.join(' ').toLowerCase().includes(k))).map((s) => s.section);
  return fromFiles.length ? [...new Set(fromFiles)] : ['— unklar, Abschnitt manuell bestimmen'];
}
