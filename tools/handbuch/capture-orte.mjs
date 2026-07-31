#!/usr/bin/env node
// tools/handbuch/capture-orte.mjs — Screenshots für Anhang E (BL-226, Spec 22 §8).
//
// EIGENER Aufnahmepfad, kein Zusatz zu capture.mjs: der Editor hat keine Bottom-Navigation,
// die dortige Navigation greift auf Beschriftungen zu, die es hier nicht gibt.
//
// DER KNACKPUNKT: Der Editor lädt sein Dokument über einen Datei-Dialog, der sich headless
// nicht auslösen lässt. Gelöst OHNE Produktionscode: der Aufnahmelauf blendet
// `showOpenFilePicker` aus (dann nimmt der Picker seinen zweiten, universellen Weg — ein
// verstecktes `<input type="file">`) und legt die Datei über `DataTransfer` hinein. Das ist
// derselbe Weg, den ein echter Upload nimmt — kein Testmodus, keine Hintertür in der App.
//
// Varianten-Regel (Spec 22 §8): Aufnahmen heißen `<name>.orte.png`. Der Extraktor bevorzugt
// sie, wenn es sie gibt, sonst bleibt das geteilte Bild des Hauptbuchs stehen — Aufnahmen,
// die nur geteilte Komponenten zeigen, brauchen also gar keine Variante.
//
// Voraussetzungen: laufender Editor-Dev-Server (`npm run dev:orte`, Standard :5174),
// System-Chrome, puppeteer-core.
// Aufruf:  node capture-orte.mjs [--url http://localhost:5174] [--out <dir>]

import puppeteer from 'puppeteer-core';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const URL = arg('--url', 'http://localhost:5174');
const OUT = arg('--out', join(__dirname, '..', '..', 'app-orte', 'public', 'handbuch-assets'));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'orte.json'), 'utf8');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!existsSync(CHROME)) { console.error('Chrome nicht gefunden:', CHROME); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 375, height: 812, deviceScaleFactor: 2 },
  args: ['--no-sandbox', '--hide-scrollbars'],
});
const page = await browser.newPage();
page.setDefaultTimeout(20000);

async function shot(name) {
  await page.screenshot({ path: join(OUT, `${name}.orte.png`) });
  console.log('  ✓', `${name}.orte.png`);
}

async function clickText(text) {
  const ok = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t));
    if (!el) return false;
    el.click();
    return true;
  }, text);
  if (!ok) throw new Error(`Knopf „${text}" nicht gefunden`);
  await sleep(350);
}

console.log('[capture-orte]', URL, '→', OUT);
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { delete window.showOpenFilePicker; });
await sleep(300);

// 1) Startbildschirm ohne Dokument — das Erste, was ein neuer Nutzer sieht.
await shot('e1-start');

// 2) Datei laden (echter Picker-Weg, s. Kopfkommentar).
await clickText('Öffnen');
await page.evaluate((text) => {
  const inp = document.querySelector('input[type=file]');
  const dt = new DataTransfer();
  dt.items.add(new File([text], 'orte.json', { type: 'application/json' }));
  inp.files = dt.files;
  inp.dispatchEvent(new Event('change', { bubbles: true }));
}, FIXTURE);
await sleep(700);
await shot('e2-liste');

// 3) Steckbrief eines Orts mit gepflegter Verwaltungsgeschichte.
await page.evaluate(() => {
  const row = [...document.querySelectorAll('li button')].find((b) => b.textContent.includes('Ochtrup'));
  (row ?? document.querySelector('li button')).click();
});
await sleep(400);
await shot('e3-steckbrief');

// 4) Bearbeiten-Modus (Grunddaten + GOV-Übernahme).
await clickText('Bearbeiten');
await shot('e4-bearbeiten');

// 5) Höfe.
await page.evaluate(() => {
  const back = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Zur Liste'));
  back?.click();
});
await sleep(300);
await clickText('Höfe');
await shot('e5-hoefe');

await browser.close();
console.log('[capture-orte] fertig.');
