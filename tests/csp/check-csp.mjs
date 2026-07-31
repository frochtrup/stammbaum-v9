#!/usr/bin/env node
// CSP-Scanner (LP-8, Spec 30 §NFR-3) — Portierung von v8 test-csp.js.
// Zwei Stufen:
//
// A) HARD-FAIL — app/index.html + ui/**/*.svelte:
//    Kein inline on*=-Handler und kein inline style=-Attribut. Der Browser
//    verwirft/blockiert beides unter script-src/style-src 'self' still —
//    solche Attribute wären toter, irreführender Code.
//
// B) INFO-REPORT — core/**/*.ts + ui/**/*.ts (keine Tests):
//    style="..."/on*="..." in Template-Strings, die z. B. an Leaflets
//    bindTooltip/bindPopup übergeben werden (innerHTML-basiert), würden vom
//    Browser ebenso blockiert. Ziel: 0. Meldet, schlägt aber nicht fehl —
//    das ist ein Hinweis auf mögliche HTML-Injection-Stellen, kein CSP-Verstoß
//    im engeren Sinn (kein `="`-Literal im Quelltext selbst).
//
// Zusätzlich: CSP_POLICY (app/csp-policy.ts) darf nie unsafe-inline/unsafe-eval
// enthalten — doppelt zum Vitest-Unit-Test (tests/csp/csp-plugin.test.ts),
// hier zusätzlich als Teil desselben Gates, falls check:csp isoliert läuft.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

function walk(dir, exts) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, exts));
    else if (exts.includes(extname(full))) out.push(full);
  }
  return out;
}

const ON_ATTR_RE = /\son[a-z]+\s*=\s*["'][^"']*["']/;
const STYLE_ATTR_RE = /\sstyle\s*=\s*["'][^"']*["']/;

function isCommentLine(trimmed) {
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('<!--');
}

function scanHardFail(files) {
  const violations = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (isCommentLine(line.trim())) return;
      if (ON_ATTR_RE.test(line)) {
        violations.push(`${file}:${i + 1}: inline on*=-Handler (CSP-tot) — ${line.trim().slice(0, 120)}`);
      }
      if (STYLE_ATTR_RE.test(line)) {
        violations.push(`${file}:${i + 1}: inline style=-Attribut (CSP-tot) — ${line.trim().slice(0, 120)}`);
      }
    });
  }
  return violations;
}

function scanInfoReport(files) {
  const hits = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (isCommentLine(trimmed)) return;
      if (STYLE_ATTR_RE.test(line) || ON_ATTR_RE.test(line)) {
        hits.push(`${file}:${i + 1}: ${trimmed.slice(0, 120)}`);
      }
    });
  }
  return hits;
}

let ok = true;

// --- A) HARD-FAIL ---
// app/public/**/*.html gehört zur selben Regel: die Offline-Fallback-Seite (BL-02) ist
// ausgelieferte, vom Nutzer sichtbare HTML wie index.html auch — sie ging nur deshalb
// nicht durch dieses Gate, weil sie als public/-Datei am Vite-Plugin vorbeiläuft
// (statt einer zweiten, laxeren Regel für „statische" Seiten: dieselbe Regel, ein
// Mechanismus).
// BEIDE Programme (Spec 22 §2/§7): das zweite index.html und die Svelte-Dateien des
// Orte-Editors gehoeren in dieselbe Hard-Fail-Menge. Ein Gate, das nur das Hauptprogramm
// sieht, laesst den Editor unbemerkt zurueckfallen — dieselbe Klasse wie ein Gate, das
// null Tests findet und gruen meldet.
const hardFailFiles = [
  'app/index.html',
  'app-orte/index.html',
  ...walk('app/public', ['.html']),
  ...walk('ui', ['.svelte']),
  ...walk('app-orte', ['.svelte']),
];
const violations = scanHardFail(hardFailFiles);
if (violations.length) {
  ok = false;
  console.error(`FAIL: ${violations.length} inline-Attribut(e) (CSP-tot):`);
  violations.forEach((v) => console.error('  ' + v));
} else {
  console.log('OK: index.html + ui/**/*.svelte frei von inline-on*= und inline-style= — CSP lückenlos durchsetzbar.');
}

// --- Policy-Inhalt (Kommentarzeilen ausgenommen — die dürfen die verbotenen
// Begriffe zu Dokumentationszwecken nennen, ohne selbst ein Verstoß zu sein) ---
const policyCode = readFileSync('app/csp-policy.ts', 'utf8')
  .split('\n')
  .filter((line) => !isCommentLine(line.trim()))
  .join('\n');
if (/unsafe-inline|unsafe-eval/.test(policyCode)) {
  ok = false;
  console.error('FAIL: CSP_POLICY erlaubt unsafe-inline/unsafe-eval (app/csp-policy.ts).');
} else {
  console.log('OK: CSP_POLICY ohne unsafe-inline/unsafe-eval.');
}

// --- B) INFO-REPORT ---
const infoFiles = [...walk('core', ['.ts']), ...walk('ui', ['.ts'])].filter((f) => !f.endsWith('.test.ts'));
const infoHits = scanInfoReport(infoFiles);
if (infoHits.length === 0) {
  console.log('INFO: core/**/*.ts + ui/**/*.ts frei von style=/on*= in Template-Strings — CSP vollständig.');
} else {
  console.log(`INFO: ${infoHits.length} style=/on*=-Fundstelle(n) in Template-Strings (potenzielle HTML-Injection-Stelle, Ziel = 0):`);
  infoHits.forEach((h) => console.log('  ' + h));
}

if (!ok) {
  console.error('CSP-Scanner fehlgeschlagen: Event-Delegation/CSS-Klassen bzw. korrigierte Policy verwenden.');
  process.exit(1);
}
console.log('CSP-Scanner ok.');
