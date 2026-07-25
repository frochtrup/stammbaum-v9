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
//   6. Version hochzählen, Changelog [Unreleased] → datierte Version, HTML stempeln.
//
// Nichts wird committet — der Nutzer prüft den Diff und committet bewusst.
//
// Optionen:  --notes "…"   zusätzliche Changelog-Zeile
//            --version X.Y  Version explizit setzen (sonst Minor-Bump)
//            --skip-capture nur Version/Changelog aktualisieren (kein Server/Screenshots)

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, existsSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const has = (n) => args.includes(n);

const FIX = join(__dirname, 'fixtures', 'demo-rich.anon.ged');
const DEMO = join(REPO, 'app', 'public', 'demo.ged');
const DEMO_BAK = join(REPO, 'app', 'public', 'demo.ged.handbuch-bak');
const HTML = join(REPO, 'HANDBUCH.html');
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
try { await import('puppeteer-core'); } catch { die('puppeteer-core fehlt → npm install -D puppeteer-core'); }
if (!has('--skip-capture') && !existsSync(CHROME)) die(`Chrome nicht gefunden: ${CHROME} (CHROME_PATH setzen)`);

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
    const p = spawn(process.execPath, [join(__dirname, 'capture.mjs'), '--url', `http://localhost:${PORT}`, '--out', join(REPO, 'handbuch-assets')], { cwd: REPO, stdio: 'inherit' });
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error('capture.mjs Exit ' + c))));
  }).catch((e) => die(e.message));

  // --- 5. Aufräumen ---
  cleanup();
  log('Server gestoppt, demo.ged wiederhergestellt.');
}

// --- 6. Version + Changelog + HTML-Stempel ---
const vinfo = JSON.parse(readFileSync(VFILE, 'utf8'));
function bumpMinor(v) { const [maj, min] = v.split('.').map(Number); return `${maj}.${(min || 0) + 1}`; }
const nextVersion = arg('--version', bumpMinor(vinfo.version));
const today = new Date().toISOString().slice(0, 10);

// Changelog: [Unreleased] → [next] (datiert)
let cl = readFileSync(CHANGELOG, 'utf8');
const relMatch = cl.match(/## \[Unreleased\]\s*\n([\s\S]*?)\n---/);
let unreleased = relMatch ? relMatch[1].trim() : '';
const notes = arg('--notes', '');
if (notes) unreleased = (unreleased ? unreleased + '\n' : '') + `- ${notes}`;
const emptyMarker = /Noch keine unveröffentlichten/;
const body = (!unreleased || emptyMarker.test(unreleased))
  ? '- Screenshots neu erzeugt (keine gesonderten Textänderungen vermerkt).'
  : unreleased;
const freshUnreleased = '## [Unreleased]\n\n_(Noch keine unveröffentlichten Änderungen. Neue Zeilen hier eintragen.)_\n\n---\n';
const newEntry = `## [${nextVersion}] — ${today}\n\n${body}\n`;
cl = cl.replace(/## \[Unreleased\][\s\S]*?\n---\n/, `${freshUnreleased}\n${newEntry}\n---\n`);
writeFileSync(CHANGELOG, cl);

// HTML stempeln (Cover-Badge + Footer)
let html = readFileSync(HTML, 'utf8');
const stamp = `Version ${nextVersion} · Stand ${today}`;
html = html.replace(/Version \d+(?:\.\d+)? · Stand [^<]+/g, stamp);
writeFileSync(HTML, html);

// Versionsdatei fortschreiben
writeFileSync(VFILE, JSON.stringify({ version: nextVersion, date: today }, null, 2) + '\n');

log(`Handbuch auf ${stamp} gestempelt.`);
log('Fertig. Bitte Diff prüfen und bewusst committen (Handbuch + Assets + Changelog).');
