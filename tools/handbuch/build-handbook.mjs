#!/usr/bin/env node
// tools/handbuch/build-handbook.mjs — Orchestrator der Handbuch-Erzeugung.
//
// Ein Befehl:  npm run handbuch   (bzw. Skill /handbuch-build)
//
// Ablauf:
//   1. Vorbedingungen prüfen (anonymisierte Fixture, puppeteer-core, Chrome).
//   2. app/public/demo.ged auf die anonymisierte reiche Beispieldatei umlegen (Backup).
//   3. Vite-Dev-Server starten und auf den Port warten.
//   4. capture.mjs laufen lassen → handbuch-assets/*.png neu erzeugen.
//   5. Server stoppen, demo.ged zurücklegen.
//   6. Version hochzählen, Changelog AUTOMATISCH aus den git-Commits seit dem letzten
//      Handbuch-Bau erzeugen (kein manuell gepflegtes [Unreleased] mehr), HTML stempeln.
//
// Das Änderungsfenster ist `<letzter Commit an HANDBUCH.html>..HEAD` — es braucht KEIN
// manuell gepflegtes Changelog: alle zwischenzeitlichen Code-Änderungen (feat/fix/perf an
// app/ui/core/services) werden automatisch aufgelistet. Nichts wird committet — der Nutzer
// prüft den Diff und committet bewusst.
//
// Zu Beginn läuft der TEXT-ABGLEICH (tools/handbuch/text-review.mjs): er listet die Features
// seit dem letzten Bau und den vermutlich betroffenen Handbuch-Abschnitt — damit die PROSA
// (nicht nur die Screenshots) nachgezogen wird. Er blockiert nicht (Edits liegen oft schon
// uncommittet vor); die Anpassung erledigt der Agent/Mensch nach Skill /handbuch-build.
//
// Optionen:  --dry-run         nur anzeigen, was ins Changelog käme (schreibt nichts)
//            --notes "a ;; b"   optionale, rein redaktionelle Zusatzzeile(n) (mit ' ;; ' getrennt)
//            --since <ref>      Basis-Commit übersteuern (statt „letzter HANDBUCH.html-Commit")
//            --all-commits      auch Nicht-feat/fix/perf-Commits im Fenster aufnehmen
//            --skip-text-review den Text-Abgleich-Bericht am Anfang unterdrücken
//            --version X.Y      Version explizit setzen (sonst Minor-Bump)
//            --skip-capture     nur Version/Changelog aktualisieren (kein Server/Screenshots)

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, existsSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { resolveBase, collectCommits, git as gitIn } from './changes.mjs';
import { gatherTextReview, printTextReview } from './text-review.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const has = (n) => args.includes(n);

const FIX = join(__dirname, 'fixtures', 'demo-rich.anon.ged');
const DEMO = join(REPO, 'app', 'public', 'demo.ged');
const DEMO_BAK = join(REPO, 'app', 'public', 'demo.ged.handbuch-bak');
const HTML = join(REPO, 'app', 'public', 'HANDBUCH.html');
const CHANGELOG = join(REPO, 'HANDBUCH-CHANGELOG.md');
const VFILE = join(__dirname, 'handbuch.version.json');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 5173;

const log = (...a) => console.log('[handbuch]', ...a);
const die = (m) => { console.error('[handbuch] FEHLER:', m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 1. Vorbedingungen ---
if (!existsSync(FIX)) die(`Anonymisierte Fixture fehlt: ${FIX}\n  → zuerst: node tools/handbuch/anonymize-ged.mjs <quelle.ged> ${FIX}`);
if (!existsSync(HTML)) die(`HANDBUCH.html fehlt: ${HTML}`);
// Die „Nach oben"-Navigation ist fester Bestandteil des Handbuchs (inhaltsunabhängige,
// schwebende Schaltfläche — bleibt bei neuen Kapiteln automatisch wirksam). Ein späterer
// Umbau darf sie nicht STILL entfernen: hier erzwungen statt nur dokumentiert. Siehe README.
if (!/id="to-top"/.test(readFileSync(HTML, 'utf8')))
  die('„Nach oben"-Navigation fehlt in HANDBUCH.html (Element id="to-top"). Sie muss erhalten bleiben — siehe tools/handbuch/README.md („Wichtig").');
try { await import('puppeteer-core'); } catch { die('puppeteer-core fehlt → npm install -D puppeteer-core'); }
if (!has('--skip-capture') && !existsSync(CHROME)) die(`Chrome nicht gefunden: ${CHROME} (CHROME_PATH setzen)`);

// --- 1b. Textabgleich zuerst zeigen: welche Features brauchen NEUEN TEXT, nicht nur neue
// Screenshots? Rein informativ (blockiert nicht — die Prosa-Edits liegen zum Bauzeitpunkt oft
// schon uncommittet im Arbeitsbaum). Die eigentliche Anpassung erledigt der Agent/Mensch nach
// dem Skill /handbuch-build; hier wird der Bedarf sichtbar gemacht, nicht auf Erinnerung gebaut.
let openTextPoints = 0;
if (!has('--skip-text-review')) {
  openTextPoints = printTextReview(gatherTextReview({ since: arg('--since', ''), includeAll: has('--all-commits') }));
  if (openTextPoints > 0) log(`Hinweis: ${openTextPoints} Punkt(e) für Text-Abgleich — vor dem Commit prüfen, dass HANDBUCH.html sie abdeckt.`);
}

let viteProc = null;
let demoSwapped = false;
function cleanup() {
  if (viteProc && !viteProc.killed) { try { viteProc.kill('SIGTERM'); } catch { /* egal */ } }
  if (demoSwapped && existsSync(DEMO_BAK)) { try { renameSync(DEMO_BAK, DEMO); } catch { /* egal */ } demoSwapped = false; }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

async function waitForPort(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(url); if (r.ok || r.status === 200) return true; } catch { /* noch nicht */ }
    await sleep(500);
  }
  return false;
}

if (!has('--skip-capture')) {
  // --- 2. demo.ged umlegen ---
  log('Beispieldatei einlegen (Backup vorhandener demo.ged) …');
  if (existsSync(DEMO)) copyFileSync(DEMO, DEMO_BAK);
  copyFileSync(FIX, DEMO);
  demoSwapped = true;

  // --- 3. Dev-Server starten ---
  log('Dev-Server starten …');
  viteProc = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore' });
  if (!(await waitForPort(`http://localhost:${PORT}/`))) die('Dev-Server nicht erreichbar geworden.');
  await sleep(1500);

  // --- 4. Screenshots ---
  log('Screenshots erzeugen …');
  await new Promise((res, rej) => {
    const p = spawn(process.execPath, [join(__dirname, 'capture.mjs'), '--url', `http://localhost:${PORT}`, '--out', join(REPO, 'app', 'public', 'handbuch-assets')], { cwd: REPO, stdio: 'inherit' });
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error('capture.mjs Exit ' + c))));
  }).catch((e) => die(e.message));

  // --- 5. Aufräumen ---
  cleanup();
  log('Server gestoppt, demo.ged wiederhergestellt.');
}

// --- 6. Version + Changelog (AUTOMATISCH aus git) + HTML-Stempel ---
const vinfo = JSON.parse(readFileSync(VFILE, 'utf8'));
function bumpMinor(v) { const [maj, min] = v.split('.').map(Number); return `${maj}.${(min || 0) + 1}`; }
const nextVersion = arg('--version', bumpMinor(vinfo.version));
const today = new Date().toISOString().slice(0, 10);
const dryRun = has('--dry-run');

// Fenster + relevante Commits kommen aus dem geteilten Modul (dieselbe Quelle wie der
// Text-Abgleich oben) — kein manuell gepflegtes Feld, kein manuell gepflegtes Changelog.
const base = resolveBase(REPO, arg('--since', ''));
const commits = collectCommits(REPO, base, { includeAll: has('--all-commits') });
const bullets = commits.map((c) => `- ${c.subject} (\`${c.hash}\`)`);
// Optionale, rein handbuch-redaktionelle Zusatzzeile (z. B. „Screenshot verbessert") — die
// EINZIGE manuelle Eingabe, und sie ist optional. Mehrere via " ;; " trennen.
for (const n of arg('--notes', '').split(' ;; ').map((s) => s.trim()).filter(Boolean)) {
  bullets.push(`- ${n}`);
}

const prov = base
  ? `_Automatisch aus den Code-Commits seit dem letzten Handbuch-Bau (\`${base.slice(0, 7)}\`…HEAD) erzeugt._`
  : `_Kein Basis-Commit gefunden (HANDBUCH.html noch nie committet) — bitte einmalig \`--since <ref>\` setzen._`;
const body = bullets.length
  ? `${prov}\n\n${bullets.join('\n')}`
  : `${prov}\n\n- Nur Screenshots neu erzeugt — keine relevanten Code-Änderungen im Fenster.`;
const newEntry = `## [${nextVersion}] — ${today}\n\n${body}\n`;

if (dryRun) {
  log('DRY-RUN — es wird nichts geschrieben. Vorschau des Changelog-Eintrags:\n');
  console.log(newEntry);
  log(`(Version würde auf ${nextVersion} steigen; HANDBUCH.html/Changelog/Version bleiben unangetastet.)`);
  process.exit(0);
}

// Changelog: neuen datierten Block direkt nach dem Kopf einfügen. Etwaigen alten,
// jetzt obsoleten [Unreleased]-Block entfernen (der manuelle Kanal entfällt).
let cl = readFileSync(CHANGELOG, 'utf8');
cl = cl.replace(/## \[Unreleased\][\s\S]*?\n---\n/, '');
cl = cl.replace(/\n---\n/, `\n---\n\n${newEntry}\n---\n`);
writeFileSync(CHANGELOG, cl);

// HTML stempeln (Cover-Badge + Footer)
let html = readFileSync(HTML, 'utf8');
const stamp = `Version ${nextVersion} · Stand ${today}`;
html = html.replace(/Version \d+(?:\.\d+)? · Stand [^<]+/g, stamp);
writeFileSync(HTML, html);

// Versionsdatei fortschreiben (builtAtCommit rein informativ; die Basis kommt aus git log).
writeFileSync(VFILE, JSON.stringify({ version: nextVersion, date: today, builtAtCommit: gitIn(REPO, 'rev-parse HEAD') || null }, null, 2) + '\n');

// Editor-Handbuch (BL-224/OE-9, Spec 22 §8) im selben Zug neu erzeugen: es ist ein
// EXTRAKT dieser Datei. Liefe es getrennt, veraltete es genau dann, wenn jemand das
// Handbuch pflegt — also immer.
try {
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, [join(__dirname, 'build-orte-handbook.mjs')], { stdio: 'inherit' });
} catch {
  die('Editor-Handbuch konnte nicht erzeugt werden (s. Meldung oben).');
}

log(`Handbuch auf ${stamp} gestempelt. Changelog aus ${bullets.length} Commit(s)/Notiz(en) erzeugt.`);
if (openTextPoints > 0) log(`ERINNERUNG: ${openTextPoints} Feature(s) im Fenster — vor dem Commit sicherstellen, dass HANDBUCH.html den TEXT dazu enthält (Bericht oben).`);
log('Fertig. Bitte Diff prüfen und bewusst committen (Handbuch + Assets + Changelog).');
