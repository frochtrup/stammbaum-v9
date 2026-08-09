#!/usr/bin/env node
// tools/run-ci-steps.mjs — führt lokal GENAU die Schritte aus, die CI ausführt.
//
// WARUM ES DAS GIBT (2026-08-09). Vor einem Push liefen regelmäßig „die Tests" — also drei
// von acht Schritten. Der vierte, `check:csp`, war der, der brach: die Platzhalter des
// virtuellen Scrollens trugen ein `style=`-Attribut, das unter der Content-Security-Policy
// tot ist. Lokal grün gemeldet, CI rot, Nachbesserung, zweiter Push. Die Regel „alle acht
// Schritte laufen lassen" stand als Merksatz in der Projekt-Memory und hat nicht gehalten;
// die Bilanz derselben Sitzung war eindeutig — vier mechanische Regeln hielten, vier
// Merksätze nicht. Also ein Gate statt eines weiteren Merksatzes.
//
// DIE SCHRITTLISTE WIRD NICHT GEPFLEGT, SONDERN GELESEN. Eine zweite Liste neben `ci.yml`
// wäre genau die Drift, gegen die dieses Werkzeug gebaut ist: wer einen CI-Schritt ergänzt,
// müsste daran denken, ihn auch hier einzutragen — und daran nicht zu denken, ist der
// Ausgangsfehler. Deshalb parst dieses Skript `.github/workflows/ci.yml` und führt aus, was
// dort steht. `npm ci` fällt raus (lokal sind die Abhängigkeiten schon da).
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');
const yml = readFileSync(join(wurzel, '.github/workflows/ci.yml'), 'utf8');

/** Jede `- run: npm …`-Zeile aus dem Workflow, in Reihenfolge, ohne `npm ci`. */
const schritte = [];
for (const zeile of yml.split('\n')) {
  const treffer = /^\s*-\s*run:\s*(npm\s+.+?)\s*$/.exec(zeile);
  if (!treffer) continue;
  const befehl = treffer[1];
  if (befehl === 'npm ci' || befehl.startsWith('npm ci ')) continue;
  if (!schritte.includes(befehl)) schritte.push(befehl);
}

if (schritte.length === 0) {
  // Kein stiller Leerlauf: fände das Muster nicht mehr (umformatierter Workflow), liefe der
  // Hook grün durch, ohne irgendetwas geprüft zu haben — der Fehler, den ADR-v9-200 benennt.
  console.error('FEHLER: keine `- run: npm …`-Schritte in .github/workflows/ci.yml gefunden.');
  console.error('Der Hook prüft dann nichts. Muster in tools/run-ci-steps.mjs anpassen.');
  process.exit(2);
}

console.log(`\n▶ ${schritte.length} CI-Schritte aus .github/workflows/ci.yml:\n`);
const t0 = Date.now();
for (const [i, befehl] of schritte.entries()) {
  const marke = `[${i + 1}/${schritte.length}] ${befehl}`;
  process.stdout.write(`${marke} … `);
  const t = Date.now();
  const lauf = spawnSync(befehl, { cwd: wurzel, shell: true, stdio: 'pipe', encoding: 'utf8' });
  const s = ((Date.now() - t) / 1000).toFixed(1);
  if (lauf.status !== 0) {
    console.log(`ROT (${s}s)\n`);
    // Die volle Ausgabe, ungefiltert — eine gefilterte Ausgabe ist kein Prüfergebnis
    // (ADR-v9-199): genau so ist der CSP-Fehler durchgerutscht.
    process.stdout.write(lauf.stdout ?? '');
    process.stderr.write(lauf.stderr ?? '');
    console.error(`\n✖ ${befehl} fehlgeschlagen — Push abgebrochen.`);
    console.error('  Notausgang, wenn das bewusst ist: git push --no-verify');
    process.exit(1);
  }
  console.log(`grün (${s}s)`);
}
console.log(`\n✓ alle ${schritte.length} Schritte grün (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
