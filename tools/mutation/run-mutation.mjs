#!/usr/bin/env node
// tools/mutation/run-mutation.mjs — misst die ABSICHERUNG, nicht die Testzahl.
// BL-287 / ADR-v9-196. Aufruf: `npm run test:mutation` (nie blank — s. CLAUDE.md).
//
// DIE FRAGE, DIE DIESES WERKZEUG BEANTWORTBAR MACHT. „Ist die Absicherung gestiegen?"
// war bis hierher unbeantwortbar: sichtbar war nur die Zahl der Tests, und die steigt
// immer. Gemessen wird deshalb das Gegenteil der üblichen Richtung — nicht, ob die Tests
// grün werden, sondern ob sie ROT werden, wenn man die Regel bricht, die sie schützen
// sollen. Dieselbe Denkfigur wie die projektüblichen Rot-Proben („Zeile entfernt → 2 Tests
// fallen"), nur systematisch statt einmal je Bau und danach vergessen.
//
// WELCHE STELLEN GEMESSEN WERDEN, entscheidet nicht dieser Lauf, sondern die Liste der
// benannten Spec-Invarianten — s. `mutationen.mjs` und den Abdeckungs-Wächter
// `tests/mutation/abdeckung.test.ts`.
//
// LÄUFT GEGEN DIE EINGECHECKTEN FIXTUREN. Die privaten Realdaten dürfen die Zahlen nur
// ERHÖHEN, nie tragen: sonst wäre die Schwelle auf einem fremden Rechner (und in CI)
// unerreichbar. Der Lauf sagt deshalb an, in welcher Lage er misst.
//
// KOSTEN: ein voller Suitenlauf je Stelle (~11 s hier, gemessen 76 s auf dem CI-Runner).
// Deshalb ein eigener, seltener Job — nicht bei jedem Push.
//
// WAS ER NICHT IST: kein Mutation-Testing-Framework (Stryker & Co. mutieren erschöpfend
// und brauchen Stunden). Vollständigkeit über alle Code-Zeilen ist ausdrücklich nicht das
// Ziel; Vollständigkeit über die benannten Invarianten ist es.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STELLEN, MUTATIONEN, UNTERGRENZE, UNTERGRENZE_RUECKSTAND } from './mutationen.mjs';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = join(WURZEL, 'node_modules/.cache/mutation');
const BERICHT = join(CACHE, 'vitest.json');

/** Nur zur Ansage: die Zahlen fallen mit diesen Dateien höher aus. */
const PRIVATE_FIXTURES = [
  'Unsere Familie 2026.ged',
  'Unsere Familie.gramps',
  'MeineDaten_ancestris.ged',
  'orte.v9.json',
];

const argv = process.argv.slice(2);
const nurArg = argv.indexOf('--nur');
const nur = nurArg >= 0 ? argv[nurArg + 1] : null;

/** Führt die volle Suite aus und liefert die Kennzahlen des Laufs. */
function laufeSuite() {
  mkdirSync(CACHE, { recursive: true });
  const r = spawnSync(
    'npx',
    ['vitest', 'run', '--silent', '--reporter=json', `--outputFile=${BERICHT}`],
    { cwd: WURZEL, encoding: 'utf8', timeout: 15 * 60 * 1000, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (r.error || !existsSync(BERICHT)) {
    throw new Error(`vitest lieferte keinen Bericht: ${r.error?.message ?? r.stderr?.slice(-2000)}`);
  }
  const j = JSON.parse(readFileSync(BERICHT, 'utf8'));
  /** Welche Test-DATEIEN haben angeschlagen — die eigentlich interessante Auskunft: sie
   *  sagt, WO die Absicherung sitzt und ob sie an einer einzigen Datei hängt. */
  const dateien = [];
  /** Dateien, die gar nicht erst durchliefen (Import-/Sammelfehler): sie tragen keine
   *  Assertion, zählen aber als Treffer — sonst meldete eine Mutation, die eine ganze
   *  Testdatei zerschießt, fälschlich „0 Treffer". */
  const nichtGelaufen = [];
  for (const d of j.testResults ?? []) {
    const name = d.name.replace(`${WURZEL}/`, '');
    const rot = (d.assertionResults ?? []).filter((a) => a.status === 'failed').length;
    if (rot > 0) dateien.push({ datei: name, rot });
    else if (d.status === 'failed') nichtGelaufen.push(name);
  }
  dateien.sort((a, b) => b.rot - a.rot);
  return { faelle: j.numTotalTests ?? 0, rot: j.numFailedTests ?? 0, dateien, nichtGelaufen };
}

/** Wendet eine Mutation an bzw. nimmt sie zurück. Wirft bei Drift (Text nicht/mehrfach da). */
function patche(m, richtung) {
  const pfad = join(WURZEL, m.datei);
  const text = readFileSync(pfad, 'utf8');
  const [von, nach] = richtung === 'an' ? [m.suche, m.ersetze] : [m.ersetze, m.suche];
  const teile = text.split(von);
  if (teile.length !== 2) {
    throw new Error(
      `DRIFT bei ${m.inv}: Ankertext ${teile.length - 1}× in ${m.datei} (erwartet: genau 1×).\n` +
        `  Der Code ist umgezogen — die Mutation muss neu angezielt werden, sonst misst der\n` +
        `  Lauf nichts und meldet trotzdem Erfolg.\n  Gesucht: ${JSON.stringify(von)}`,
    );
  }
  writeFileSync(pfad, teile.join(nach));
}

function main() {
  const privat = PRIVATE_FIXTURES.filter((f) => existsSync(join(WURZEL, 'tests/fixtures', f)));
  console.log(
    privat.length
      ? `Lage: ${privat.length} private Fixture(n) vorhanden — die Zahlen liegen hier ggf. ÜBER\n` +
          `      denen von CI. Schwellen werden nur in der CI-Lage (keine private Fixture)\n` +
          `      zum Anheben vorgeschlagen.\n`
      : 'Lage: nur eingecheckte Fixturen (CI-Lage) — die Zahlen sind hier maßgeblich.\n',
  );

  const liste = nur ? MUTATIONEN.filter((m) => m.inv === nur) : MUTATIONEN;
  if (!liste.length) {
    console.error(`Unbekannte Stelle „${nur}". Mit Mutation: ${MUTATIONEN.map((m) => m.inv).join(', ')}`);
    process.exit(1);
  }

  console.log('Basislauf (unverändert) …');
  const basis = laufeSuite();
  if (basis.rot > 0 || basis.nichtGelaufen.length > 0) {
    console.error(
      `Abbruch: die Suite ist schon ohne Mutation rot (${basis.rot} Fälle, ` +
        `${basis.nichtGelaufen.length} nicht gelaufene Dateien).\n` +
        `Auf rotem Grund ist jede Trefferzahl bedeutungslos.`,
    );
    process.exit(1);
  }
  console.log(`  ${basis.faelle} Testfälle, alle grün.\n`);

  const ergebnisse = [];
  for (const m of liste) {
    process.stdout.write(`${m.inv} … `);
    // Das Anwenden steht BEWUSST vor dem try: schlägt es fehl (Drift), wurde nichts
    // geschrieben — dann darf auch nichts zurückgenommen werden. Die erste Fassung hatte
    // es drin und meldete bei jedem Drift zusätzlich einen „NOTFALL", weil das
    // Zurücknehmen den (nie geschriebenen) mutierten Text nicht fand.
    patche(m, 'an');
    let r;
    try {
      r = laufeSuite();
    } finally {
      // Immer zurücknehmen — auch bei Abbruch. Eine liegen gebliebene Mutation im
      // Arbeitsverzeichnis wäre der schlimmste denkbare Ausgang dieses Werkzeugs.
      try {
        patche(m, 'aus');
      } catch (e) {
        console.error(`\nNOTFALL: ${m.datei} konnte nicht zurückgesetzt werden — ${e.message}`);
        console.error(`  \`git checkout -- ${m.datei}\` ausführen, BEVOR irgendetwas committet wird.`);
        process.exit(2);
      }
    }
    console.log(`${r.rot + r.nichtGelaufen.length} von ${basis.faelle} Fällen rot`);
    ergebnisse.push({ m, r });
  }

  console.log('\n─── Absicherung je Invariante ───\n');
  const fehler = [];
  const anheben = [];
  const unterGrenze = [];
  for (const { m, r } of ergebnisse) {
    const treffer = r.rot + r.nichtGelaufen.length; // Einheit: rote Testfälle, nicht gelaufene Datei = 1
    const dateien = r.dateien.length + r.nichtGelaufen.length;
    const soll = m.schwelle;
    console.log(`${m.inv}  —  ${m.zusicherung}`);
    console.log(`  Spec ${m.spec} · ${m.datei}`);
    console.log(
      `  ${treffer} Treffer in ${dateien} Datei(en)  (Schwelle ${soll ?? 'unkalibriert'})`,
    );
    for (const d of r.dateien.slice(0, 5)) console.log(`    ${d.rot}×  ${d.datei}`);
    if (r.dateien.length > 5) console.log(`    … und ${r.dateien.length - 5} weitere Dateien`);
    for (const n of r.nichtGelaufen) console.log(`    (lief gar nicht erst durch: ${n})`);
    console.log('');

    if (soll == null) anheben.push(`${m.inv}: schwelle: ${treffer}`);
    else if (treffer < soll)
      fehler.push(
        `${m.inv}: ${treffer} Treffer < Schwelle ${soll} — die Absicherung ist GESUNKEN. ` +
          `Entweder ein Test ist weggefallen, der sie trug, oder die Regel hat sich verschoben.`,
      );
    else if (treffer > soll && !privat.length) anheben.push(`${m.inv}: ${treffer} statt ${soll}`);

    // Die Untergrenze ist unabhängig von der Ratsche: sie sagt nicht „schlechter als
    // gestern", sondern „unzureichend, egal seit wann". Ein bekannter Rückstand ist
    // eingeplant und wird nur genannt; ein NEUER ist ein Fehler.
    if (dateien < UNTERGRENZE.dateien) {
      const bekannt = UNTERGRENZE_RUECKSTAND[m.inv];
      const zeile = `${m.inv}: ${treffer} Treffer in ${dateien} Datei(en)`;
      if (bekannt) unterGrenze.push(`${zeile} — eingeplant: ${bekannt}`);
      else
        fehler.push(
          `${zeile} — unter der Untergrenze (${UNTERGRENZE.dateien} unabhängige Testdateien) und ` +
            `NICHT im Rückstands-Verzeichnis. Diese Invariante hängt an einer einzigen Datei: ` +
            `ein Umbau dort nimmt ihre Absicherung mit, ohne dass etwas rot wird.`,
        );
    }
  }

  // Was NICHT gemessen wurde, gehört in denselben Bericht — sonst liest sich ein grüner
  // Lauf als „alles abgesichert", obwohl er über die halbe Liste nichts sagt.
  const nachArt = (a) => STELLEN.filter((s) => s.art === a);
  console.log('─── Reichweite ───');
  console.log(`  ${nachArt('mutation').length} Invarianten mit Mutation (gemessen)`);
  console.log(`  ${nachArt('anderes-gate').length} durch ein anderes Gate getragen:`);
  for (const s of nachArt('anderes-gate')) console.log(`      ${s.inv} → ${s.gate}`);
  console.log(`  ${nachArt('offen').length} noch ohne Ziel:`);
  for (const s of nachArt('offen')) console.log(`      ${s.inv} (${s.ort})`);
  console.log('');

  if (unterGrenze.length) {
    console.log(
      `Unter der Untergrenze (< ${UNTERGRENZE.dateien} unabhängige Testdateien), bekannt und\n` +
        'eingeplant — rechnerisch geprüft, praktisch an einer Datei hängend:',
    );
    for (const z of unterGrenze) console.log(`  ${z}`);
    console.log('');
  }
  if (anheben.length) {
    console.log('Schwellen eintragen/anheben (in mutationen.mjs):');
    for (const z of anheben) console.log(`  ${z}`);
    console.log('');
  }
  if (fehler.length) {
    console.error('FEHLER:');
    for (const z of fehler) console.error(`  ${z}`);
    process.exit(1);
  }
  console.log(`${ergebnisse.length} Stellen gemessen, keine unter ihrer Schwelle.`);
}

// Ein Drift-Abbruch ist ein erwarteter Ausgang, kein Absturz — er verdient eine Meldung,
// keinen Stacktrace über sechs Node-interne Rahmen.
try {
  main();
} catch (e) {
  console.error(`\n${e.message}`);
  process.exit(1);
}
