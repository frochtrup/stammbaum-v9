#!/usr/bin/env node
// tools/a11y/run-a11y.mjs — Wrapper um den a11y-Lauf (Spec 32 TST-15, BL-66).
//
// Warum ein Wrapper und nicht einfach `vitest --config vitest.a11y.config.ts`:
// dieser Wächter prüft fremden DOM, den andere Tests aufbauen. Baut niemand mehr DOM
// auf — weil eine Bibliothek früher aufräumt, weil sich eine Hook-Reihenfolge ändert,
// weil jemand den Glob verstellt — dann findet er null Verstöße und meldet GRÜN. Genau
// dieser Fall ist beim Bau eingetreten und nur aufgefallen, weil die Reichweite
// gemessen statt angenommen wurde (24 statt 827 Tests, s. tests/a11y/axe-setup.ts).
//
// Deshalb: die Reichweite ist Teil des Ergebnisses. Sie steht im CI-Log, und sie hat
// eine Untergrenze. Die Zahl ist der eigentliche Nutzen, die Schwelle nur der Wecker.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Gemessen am 2026-07-31: 827 gescannte Tests aus 73 Dateien. Die Schwelle liegt
// bewusst deutlich darunter — sie soll den EINBRUCH fangen (Aufräum-/Hook-Regression
// führt auf ~24), nicht bei jedem entfernten Test anschlagen.
const MIN_SCANS = 600;

const dir = mkdtempSync(join(tmpdir(), 'stb-a11y-'));
const statsFile = join(dir, 'stats.jsonl');

const run = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.a11y.config.ts', ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, STB_A11Y_STATS: statsFile } },
);

const totals = { scans: 0, nodes: 0, rules: new Set() };
if (existsSync(statsFile)) {
  for (const line of readFileSync(statsFile, 'utf8').split('\n').filter(Boolean)) {
    const s = JSON.parse(line);
    totals.scans += s.scans;
    totals.nodes += s.nodes;
    for (const r of s.rules) totals.rules.add(r);
  }
}
rmSync(dir, { recursive: true, force: true });

console.log(
  `\na11y-Scanner (axe-core): ${totals.scans} gescannte Testzustände · ` +
    `${totals.nodes} DOM-Knoten · ${totals.rules.size} tatsächlich greifende Regeln`,
);

if (run.status !== 0) {
  console.error('a11y-Gate ROT: axe-core meldet Verstöße (Fundstellen oben).');
  process.exit(run.status ?? 1);
}

if (totals.scans < MIN_SCANS) {
  console.error(
    `a11y-Gate ROT: nur ${totals.scans} Testzustände gescannt (erwartet ≥ ${MIN_SCANS}).\n` +
      'Grün ohne Reichweite ist kein Ergebnis — vermutlich räumt jetzt jemand den DOM vor\n' +
      "dem Scanner ab (Hook-Reihenfolge, s. tests/a11y/axe-setup.ts) oder der `include`-Glob\n" +
      'in vitest.a11y.config.ts trifft nichts mehr.',
  );
  process.exit(1);
}

console.log('a11y-Gate grün: 0 Verstöße.');
