#!/usr/bin/env node
// INV-ARCH-1 Gate: core/ importiert nichts aus services/ui/app und referenziert
// keine DOM-/Plattform-API. Bewusst ein schlankes Skript statt eslint-plugin-boundaries
// (Vereinfachen vor Erfinden, s. Entscheidungslog ADR-v9-NN) — läuft ohne zusätzliche
// ESLint-Flat-Config-Komplexität, direkt unter Node.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const CORE_DIR = 'core';
const FORBIDDEN_IMPORT_RE = /from\s+['"](\.\.\/(services|ui|app)|svelte|vite)/;
const FORBIDDEN_GLOBAL_RE = /\b(window|document|fetch|indexedDB|localStorage|navigator)\b/;

function walk(dir, exts = ['.ts', '.js']) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, exts));
    else if (exts.includes(extname(full))) out.push(full);
  }
  return out;
}

// Der INV-ORTE-1-Teil unten muss `.svelte` MITZAEHLEN: die geteilten Views sind zu zwei
// Dritteln Svelte-Komponenten. Mit dem Kern-Default (.ts/.js) prueft der Fork-Guard 10
// statt 26 Dateien und meldet trotzdem "ok" — ein Waechter, der die falsche Menge sieht,
// ist kein Waechter. (Beim Bau genau so passiert, bevor die Zahl im Log auffiel.)
const VIEW_EXTS = ['.ts', '.js', '.svelte'];

const violations = [];
for (const file of walk(CORE_DIR)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (FORBIDDEN_IMPORT_RE.test(line)) {
      violations.push(`${file}:${i + 1}: verbotener Import aus höherer Schicht — ${line.trim()}`);
    }
    if (FORBIDDEN_GLOBAL_RE.test(line) && !line.trim().startsWith('//')) {
      violations.push(`${file}:${i + 1}: verbotene Plattform-API im Kern — ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error('INV-ARCH-1 verletzt:\n' + violations.join('\n'));
  process.exit(1);
}
console.log(`INV-ARCH-1 ok (${walk(CORE_DIR).length} Kern-Dateien geprüft).`);

// --- INV-ORTE-1 (Spec 22 §3, ADR-v9-161) ------------------------------------
//
// Die Orts-/Hof-Views werden von ZWEI Programmen gezeigt (Hauptprogramm `app/`,
// Standalone-Orte-Editor `app-orte/`). Sie binden deshalb an den schmalen Vertrag
// `ui/shell/places-host.ts`, nicht an die Zustandsschale eines Programms — und keines
// der beiden Programme darf eine eigene Kopie einer geteilten View halten.
//
// WARUM ALS GATE UND NICHT ALS KONVENTION: Der Vertrag ist heute schmal (zwölf Kommandos
// plus zwei Navigations-Methoden). Ohne Zwang wächst er beim nächsten Feature
// stillschweigend wieder zur ganzen Schale zurück, und die Kopie einer View ist der
// naheliegendste Weg, eine Abweichung zu bauen. Beide Verfallswege sind mechanisch
// erkennbar, also werden sie erkannt und nicht erinnert.

const SHARED_VIEW_DIRS = ['ui/views/place', 'ui/views/hof'];
const ORTE_APP_DIR = 'app-orte';
/** `walk` wirft bei fehlendem Verzeichnis. Der Fork-Guard muss aber auch dann laufen,
 *  wenn der Editor (noch) nicht ausgecheckt ist — sonst blockiert das Gate den Bau,
 *  statt ihn zu sichern. */
const walkIfExists = (dir) => (existsSync(dir) ? walk(dir, VIEW_EXTS) : []);
const HOST_IMPORT_RE = /from\s+['"][^'"]*shell\/(app-state|view-state)\.svelte['"]/;

const orteViolations = [];

// (a) Geteilte Views binden nicht an die Schale eines Programms.
for (const dir of SHARED_VIEW_DIRS) {
  for (const file of walk(dir, VIEW_EXTS)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (HOST_IMPORT_RE.test(line) && !line.trim().startsWith('//'))
          orteViolations.push(
            `${file}:${i + 1}: geteilte View importiert die Zustandsschale — stattdessen ui/shell/places-host.ts (INV-ORTE-1)\n    ${line.trim()}`,
          );
      });
  }
}

// (b) Fork-Guard: keine Datei in app-orte/, deren Basisname eine geteilte View ist.
const sharedBasenames = new Map();
for (const dir of SHARED_VIEW_DIRS)
  for (const f of walk(dir, VIEW_EXTS)) sharedBasenames.set(f.split('/').pop(), f);
for (const file of walkIfExists(ORTE_APP_DIR)) {
  const base = file.split('/').pop();
  if (sharedBasenames.has(base))
    orteViolations.push(
      `${file}: Kopie einer geteilten View (${sharedBasenames.get(base)}) — der Editor nutzt sie unverändert, Abweichungen laufen über PlacesHostCaps (INV-ORTE-1)`,
    );
}

if (orteViolations.length > 0) {
  console.error('INV-ORTE-1 verletzt:\n' + orteViolations.join('\n'));
  process.exit(1);
}
console.log(
  `INV-ORTE-1 ok (${SHARED_VIEW_DIRS.reduce((n, d) => n + walk(d, VIEW_EXTS).length, 0)} geteilte Views, ${walkIfExists(ORTE_APP_DIR).length} Editor-Dateien geprüft).`,
);
