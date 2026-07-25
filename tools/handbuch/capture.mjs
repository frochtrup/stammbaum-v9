#!/usr/bin/env node
// tools/handbuch/capture.mjs
//
// Erzeugt ALLE Screenshots für das Handbuch (handbuch-assets/*.png) aus der laufenden
// App. Wird vom Orchestrator build-handbook.mjs aufgerufen, der zuvor die anonymisierte
// Beispieldatei nach app/public/demo.ged legt und den Dev-Server startet.
//
// Voraussetzungen: laufender Dev-Server (Standard :5173), System-Chrome, puppeteer-core.
// Aufruf:  node capture.mjs [--url http://localhost:5173] [--out <dir>]
//
// Kernkniffe (am Code verifiziert, siehe Chronik der Lessons Learned):
//   * Orts-Anreicherung (Koordinaten/Hierarchie) wird VOR "Demo laden" direkt in den
//     IndexedDB-Store `places-mirror` geschrieben — load-gedcom-text liest ihn beim Laden
//     und löst die Ereignisse dagegen auf (→ Marker auf der Karte). Kein Datei-Picker nötig
//     (der ließe sich headless nicht auslösen).
//   * Forschungsdaten (Aufgaben/Hypothesen/Protokoll) hängen je an einer Ziel-Person und
//     werden per Formular geseedet, damit die Screens nicht leer sind.
//   * Karte: auf den Median der Marker (= Deutschland) zoomen, damit nicht die Welt-
//     Ansicht mit Auswanderer-Ausreißern erscheint.

import puppeteer from 'puppeteer-core';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const URL = arg('--url', 'http://localhost:5173');
const OUT = arg('--out', '/Users/franzdecker/dev/stammbaum-v9/handbuch-assets');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WRAPPER = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'orte.json'), 'utf8'));

// Ziel-Personen — Pseudonyme aus fixtures/demo-rich.anon.ged (deterministisch stabil).
// Bei Wechsel der Quell-Fixture neu ableiten (reichste Person mit vielen Beruf-Events).
const RICH_PERSON = 'Kaspar Hörstmann'; // *1933 Vechta, viele Berufe (Sanduhr-Vater, @I3@)
const RICH_SURNAME = 'Hörstmann';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!existsSync(CHROME)) { console.error('Chrome nicht gefunden:', CHROME); process.exit(1); }

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 375, height: 812, deviceScaleFactor: 2 },
  args: ['--no-sandbox', '--hide-scrollbars'],
});
const page = await browser.newPage();
page.setDefaultTimeout(20000);

async function click(text, { contains = false, nth = 0 } = {}) {
  const ok = await page.evaluate((text, contains, nth) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const all = [...document.querySelectorAll('button,[role=tab],[role=button],a,summary,label,div,li,span')];
    const m = all.filter((el) => { const t = norm(el.textContent); return contains ? t.includes(text) : t === text; });
    m.sort((a, b) => norm(a.textContent).length - norm(b.textContent).length);
    const el = m[nth]; if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true;
  }, text, contains, nth);
  if (!ok) console.log('  ! nicht gefunden:', text);
  await sleep(450); return ok;
}
async function bottomNav(label) {
  await page.evaluate((label) => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').replace(/\s+/g, ' ').trim().endsWith(label));
    if (b) b.click();
  }, label);
  await sleep(650);
}
async function shot(name) { await sleep(650); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('  ✓', name); }
async function scrollTop() { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200); }
async function fill(ph, val) { const ok = await page.evaluate((ph) => { const i = [...document.querySelectorAll('input,textarea')].find((x) => x.placeholder === ph && x.offsetParent); if (i) { i.focus(); return true; } return false; }, ph); if (ok) await page.keyboard.type(val, { delay: 8 }); await sleep(200); return ok; }
async function pickTarget(term) {
  await page.evaluate(() => { const c = [...document.querySelectorAll('input[role=combobox]')].find((x) => /Person/.test(x.placeholder || '') && x.offsetParent); if (c) c.focus(); });
  await page.keyboard.type(term, { delay: 20 }); await sleep(800);
  await page.evaluate(() => { const o = [...document.querySelectorAll('[role=option]')].find((x) => !/Neue Person/.test(x.textContent)); if (o) o.click(); });
  await sleep(350);
}
async function save() { await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Speichern' && x.offsetParent); if (b) b.click(); }); await sleep(550); }

console.log('→', URL);
await page.goto(URL, { waitUntil: 'networkidle2' }); await sleep(1200);

// Orts-Spiegel VOR dem Laden seeden
await page.evaluate(async (wrapper) => {
  await new Promise((res, rej) => {
    const rq = indexedDB.open('stammbaum-v9', 5);
    rq.onupgradeneeded = () => { const db = rq.result; for (const s of ['working-copy', 'places-mirror', 'places-file-handle', 'val-config', 'dedup-ignored']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); };
    rq.onsuccess = () => { const db = rq.result; const tx = db.transaction('places-mirror', 'readwrite'); tx.objectStore('places-mirror').put(wrapper, 'current'); tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => rej(tx.error); };
    rq.onerror = () => rej(rq.error);
  });
}, WRAPPER);

console.log('Demo laden …');
await bottomNav('Mehr'); await click('Datei'); await click('Demo laden'); await sleep(5500);

// ---- Forschungsdaten seeden ----
console.log('Forschungsdaten seeden …');
await bottomNav('Aufgaben');
for (const t of [
  'Taufeintrag im Kirchenbuch Ochtrup 1720–1740 prüfen',
  'Sterbeurkunde beim Standesamt Ochtrup anfragen',
  'Heiratsregister St. Lamberti (Matricula) S. 93 auswerten',
  'Auswanderer-Listen Bremerhaven → USA durchsuchen',
]) { await click('+ Aufgabe', { contains: true }); await fill('Was ist zu tun?', t); await pickTarget(RICH_SURNAME); await save(); }
await bottomNav('Aufgaben'); await click('Hypothesen');
for (const [txt, rat] of [
  ['Die Person stammt aus dem Kirchspiel Ochtrup (Kreis Steinfurt)', 'Gleicher Familienname am selben Ort, passender Altersabstand, namensgleicher Taufpate.'],
  ['Die Linie wanderte um 1855 über Bremerhaven nach Mississippi aus', 'Namensgleiche Person in den Vicksburg-Kirchenbüchern; Registerlücke ab 1854.'],
]) { await click('+ Hypothese', { contains: true }); await sleep(300); await fill('Was wird vermutet?', txt); await fill('Beweisführung', rat); await pickTarget(RICH_SURNAME); await save(); }
await bottomNav('Aufgaben'); await click('Protokoll');
await click('+ Eintrag', { contains: true }); await sleep(300);
await fill('Wonach wurde gesucht?', 'Taufeinträge im Kirchenbuch Ochtrup 1770–1780');
await fill('Ergebnis / Beobachtungen', 'Zwei mögliche Treffer auf S. 93/94; Verfilmung bestellt, Vatername unleserlich.');
await pickTarget(RICH_SURNAME); await save();

// ---- MOBIL ----
console.log('Screenshots (mobil) …');
await bottomNav('Personen'); await scrollTop(); await shot('01-personenliste');
await bottomNav('Personen'); await scrollTop(); await click('Filter'); await shot('02-person-filter'); await click('Filter');
await bottomNav('Personen'); await scrollTop(); await click('Werkzeuge'); await shot('03-person-werkzeuge');
await bottomNav('Personen'); await scrollTop(); await click(RICH_PERSON, { contains: true }); await shot('04-person-detail');
await bottomNav('Personen'); await click('Familien'); await scrollTop(); await shot('06-familienliste');
await bottomNav('Personen'); await click('Familien'); await scrollTop(); await click(RICH_SURNAME, { contains: true }); await shot('07-familie-detail');
await bottomNav('Personen'); await click('Quellen'); await scrollTop(); await shot('08-quellenliste');
await bottomNav('Personen'); await click('Quellen'); await scrollTop(); await click('KB', { contains: true }); await shot('09-quelle-detail');
await bottomNav('Personen'); await click('Orte'); await scrollTop(); await shot('10-ortsliste');
await bottomNav('Personen'); await click('Orte'); await scrollTop(); await click('Burgsteinfurt', { nth: 0 }); await shot('11-ort-steckbrief');
await bottomNav('Personen'); await click('Höfe'); await scrollTop(); await shot('12-hoefeliste');
await bottomNav('Personen'); await click('Höfe'); await scrollTop(); await click('Oster 141', { nth: 0 }); await shot('13-hof-detail');

await bottomNav('Baum'); await shot('14-sanduhr');

// Karte (Orte) — auf Deutschland (Marker-Median) zoomen
await bottomNav('Baum'); await click('Karte'); await sleep(3000);
for (let i = 0; i < 5; i++) {
  const m = await page.evaluate(() => { const ms = [...document.querySelectorAll('.leaflet-marker-icon')].map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }).filter((p) => p.y > 180 && p.y < 1500); if (!ms.length) return null; ms.sort((a, b) => a.x - b.x); const mx = ms[Math.floor(ms.length / 2)].x; ms.sort((a, b) => a.y - b.y); const my = ms[Math.floor(ms.length / 2)].y; return { x: mx, y: my }; });
  if (!m) break; await page.mouse.move(m.x, m.y); await page.mouse.wheel({ deltaY: -350 }); await sleep(1400);
}
await page.mouse.move(360, 760); await sleep(3000); await shot('15-karte-orte');
await click('Personen', { nth: 0 }); await sleep(2200); await page.mouse.move(360, 760); await sleep(500); await shot('16-karte-personen');

// Zeitleiste mit Person
await bottomNav('Baum'); await click('Zeitleiste'); await sleep(900);
await page.evaluate(() => { const b = document.querySelector('button[aria-label="Person hinzufügen"]'); if (b) b.click(); }); await sleep(800);
await page.evaluate(() => { const i = document.querySelector('input[role=combobox]'); if (i) i.focus(); });
await page.keyboard.type(RICH_SURNAME, { delay: 20 }); await sleep(1000);
await page.evaluate(() => { const o = [...document.querySelectorAll('[role=option]')].find((x) => !/Neue Person/.test(x.textContent)); if (o) o.click(); }); await sleep(1500);
await shot('17-zeitleiste');

await bottomNav('Mehr'); await click('Statistik'); await sleep(900); await scrollTop(); await shot('18-statistik');
await bottomNav('Suche'); await scrollTop(); await shot('19-suche');
await bottomNav('Aufgaben'); await click('Aufgaben'); await sleep(300); await shot('20-aufgaben');
await bottomNav('Aufgaben'); await click('Aufgaben'); await click('Board', { contains: true }); await sleep(500); await shot('20b-aufgaben-board');
await bottomNav('Aufgaben'); await click('Protokoll'); await sleep(300); await shot('21-protokoll');
await bottomNav('Aufgaben'); await click('Hypothesen'); await sleep(300); await shot('22-hypothesen');
await bottomNav('Aufgaben'); await click('Dashboard'); await sleep(900); await scrollTop(); await shot('23-dashboard');
await bottomNav('Mehr'); await click('Datei'); await shot('24-datei');
await bottomNav('Mehr'); await click('Datei'); await click('In anderes Format exportieren', { contains: true }); await shot('25-export');
await bottomNav('Mehr'); await shot('26-mehr');

// ---- DESKTOP ----
console.log('Screenshots (Desktop) …');
await page.setViewport({ width: 1280, height: 850, deviceScaleFactor: 2 }); await sleep(600);
await page.evaluate(() => { const b = [...document.querySelectorAll('button,a,[role=button]')].find((x) => /Personen/.test(x.textContent || '')); if (b) b.click(); }); await sleep(500);
await click(RICH_PERSON, { contains: true }); await sleep(600); await shot('30-desktop-liste');
await page.keyboard.down('Meta'); await page.keyboard.press('KeyK'); await page.keyboard.up('Meta'); await sleep(500);
await page.keyboard.type('Karte', { delay: 25 }); await sleep(500); await shot('32-command-palette');

await browser.close();
console.log('fertig — Screenshots in', OUT);
