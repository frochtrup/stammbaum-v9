#!/usr/bin/env node
// INV-ARCH-1 Gate: core/ importiert nichts aus services/ui/app und referenziert
// keine DOM-/Plattform-API. Bewusst ein schlankes Skript statt eslint-plugin-boundaries
// (Vereinfachen vor Erfinden, s. Entscheidungslog ADR-v9-NN) — läuft ohne zusätzliche
// ESLint-Flat-Config-Komplexität, direkt unter Node.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const CORE_DIR = 'core';
const FORBIDDEN_IMPORT_RE = /from\s+['"](\.\.\/(services|ui|app)|svelte|vite)/;
const FORBIDDEN_GLOBAL_RE = /\b(window|document|fetch|indexedDB|localStorage|navigator)\b/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (['.ts', '.js'].includes(extname(full))) out.push(full);
  }
  return out;
}

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
