#!/usr/bin/env node
// tools/handbuch/text-review.mjs
//
// Textabgleich-Bericht: Welche Code-Änderungen seit dem letzten Handbuch-Bau brauchen eine
// PROSA-Anpassung in HANDBUCH.html (nicht nur neue Screenshots)? Der Bericht erkennt den
// Bedarf und weist jeden Punkt einem Handbuch-Abschnitt zu; die eigentliche Anpassung führt
// der Mensch/Agent aus (Skill /handbuch-build). Ein Node-Skript kann keine Prosa schreiben —
// aber es kann exakt sagen, WAS zu prüfen ist, statt sich auf Erinnerung zu verlassen.
//
// Aufruf:  npm run handbuch:text-review        (bzw. mit --since <ref> / --all-commits)
// Exit-Code: standardmäßig 0 (kein „npm ERR!" beim interaktiven Lauf). Mit `--exit-code`
// liefert das Skript die Anzahl offener Punkte zurück — für CI/Prozess-Gates.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { resolveBase, collectCommits, suggestSections } from './changes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);

/** Sammelt Fenster + relevante Commits (für Wiederverwendung durch build-handbook.mjs). */
export function gatherTextReview({ since = '', includeAll = false } = {}) {
  const base = resolveBase(REPO, since);
  const commits = collectCommits(REPO, base, { includeAll });
  return { base, commits };
}

/** Gibt den Bericht aus und liefert die Anzahl der zu prüfenden Punkte zurück. */
export function printTextReview({ base, commits }) {
  const html = readFileSync(join(REPO, 'app', 'public', 'HANDBUCH.html'), 'utf8').toLowerCase();
  console.log('──────────────────────────────────────────────────────────');
  console.log(' Handbuch-Textabgleich — brauchen diese Änderungen neuen TEXT?');
  console.log('──────────────────────────────────────────────────────────');
  if (!base) {
    console.log(' Kein Basis-Commit (HANDBUCH.html noch nie committet). --since <ref> setzen.\n');
    return 0;
  }
  console.log(` Fenster: ${base.slice(0, 7)}…HEAD  (seit dem letzten HANDBUCH.html-Commit)`);
  if (!commits.length) {
    console.log(' Keine user-relevanten Commits → voraussichtlich nur Screenshots, kein Prosa-Bedarf.\n');
    return 0;
  }
  console.log(` ${commits.length} zu prüfende(r) Punkt(e). Je Punkt: Abschnitt öffnen, TEXT nachziehen.\n`);
  for (const c of commits) {
    // "Ergänzen vs. anpassen": erwähnt das Handbuch schon eines der Betreff-Stichwörter?
    const words = c.subject.toLowerCase().match(/[a-zäöüß][a-zäöüß-]{4,}/g) || [];
    const known = words.some((w) => html.includes(w));
    console.log(`  • ${c.subject}  (${c.hash})`);
    if (c.refs.length) console.log(`      Referenzen : ${c.refs.join(', ')}`);
    console.log(`      Abschnitt  : ${suggestSections(c).join(' · ')}`);
    console.log(`      Vermutung  : ${known ? 'Thema existiert im Handbuch → Beschreibung ANPASSEN' : 'Thema evtl. neu → Text ERGÄNZEN'}`);
    console.log('');
  }
  console.log(' → Für jeden Punkt den genannten Abschnitt in HANDBUCH.html prüfen und Prosa');
  console.log('   anpassen/ergänzen. Danach `npm run handbuch` (Screenshots + Version + Changelog).');
  console.log('   Der Changelog listet diese Commits ohnehin automatisch — hier geht es um den TEXT.\n');
  return commits.length;
}

// Direktaufruf (nicht bei Import durch build-handbook.mjs).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const n = printTextReview(gatherTextReview({ since: arg('--since', ''), includeAll: has('--all-commits') }));
  // Standard: 0 (freundlich). `--exit-code` gibt die Zahl offener Punkte zurück (CI-Gate).
  process.exit(has('--exit-code') ? Math.min(n, 250) : 0);
}
