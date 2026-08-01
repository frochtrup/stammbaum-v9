// tests/a11y/axe-setup.ts — der a11y-Scanner (Spec 32 TST-15, BL-66).
//
// WIE ER WIRKT: kein eigener Testkorpus, sondern ein `afterEach`, das den DOM prüft,
// den die BEREITS VORHANDENEN Komponententests ohnehin aufbauen (Spec 32 §3). Jeder
// `render(...)` + jede Interaktion in `tests/ui/**` wird damit zu einem
// Barrierefreiheits-Prüfpunkt, ohne dass irgendwo eine Liste zu pflegen wäre, die
// veraltet, sobald jemand eine View hinzufügt.
//
// WARUM EIGENE CONFIG UND NICHT `npm test`: `@testing-library/svelte` räumt den DOM in
// einem EIGENEN `afterEach` ab. Vitest führt After-Hooks standardmäßig in umgekehrter
// Registrierungsreihenfolge aus (`sequence.hooks: 'stack'`) — eine Setup-Datei
// registriert zuerst und liefe damit ZULETZT, also nach dem Aufräumen: gemessen
// 24 gescannte Tests von 902, 31 DOM-Knoten insgesamt. Der Wächter wäre grün gewesen,
// ohne irgendetwas gesehen zu haben. Mit `sequence.hooks: 'list'`
// (`vitest.a11y.config.ts`) läuft dieser Hook VOR dem Aufräumen: 827 Tests, 73 Dateien,
// ~28.000 DOM-Knoten, 49 tatsächlich greifende Regeln. Die Reihenfolge global zu
// ändern wäre ein Eingriff in alle 1.771 Tests — deshalb ein zweiter Lauf mit eigener
// Config statt einer Änderung am Hauptlauf.
//
// WAS ER NICHT KANN (bewusst benannt statt als Voll-Abdeckung ausgegeben — ein Wächter,
// dessen Reichweite man überschätzt, ist schlimmer als einer, dessen Grenze man kennt):
//  · `color-contrast` — braucht gerechnete Pixel; happy-dom liefert keine, axe meldet
//    die Regel als `incomplete`. Abgedeckt ist stattdessen die Token-Ebene
//    (`tests/ui/text-contrast.test.ts`, ADR-v9-119).
//  · Größe von Trefferflächen — dieselbe Ursache; abgedeckt auf CSS-Ebene
//    (`tests/ui/touch-target.test.ts`, ADR-v9-155).
//  · Die zwei Seitenkontext-Regeln unten (`region`/`heading-order`): ein einzeln
//    gerendertes Fragment hat keine Landmarken und beginnt mitten in der
//    Überschriften-Hierarchie. Beide würden auf JEDEM Fragment anschlagen und wären
//    damit kein Signal, sondern Rauschen (gemessen: 680 bzw. 30 Treffer, praktisch alle
//    Kontext-Artefakte). Sie bleiben die manuelle Stichprobe aus TST-15.
import { afterEach, afterAll } from 'vitest';
import { appendFileSync } from 'node:fs';
import axe from 'axe-core';

/** Seitenkontext-Regeln — auf einem isoliert gerenderten Fragment nicht bewertbar. */
const PAGE_CONTEXT_RULES = ['region', 'heading-order'] as const;

/** Zählt die tatsächliche Reichweite; `tools/a11y/run-a11y.mjs` wertet sie aus. */
const stats = { scans: 0, nodes: 0, rules: new Set<string>() };

afterEach(async () => {
  if (typeof document === 'undefined' || !document.body?.innerHTML.trim()) return;

  const result = await axe.run(document.body, {
    rules: Object.fromEntries(PAGE_CONTEXT_RULES.map((id) => [id, { enabled: false }])),
  });

  stats.scans += 1;
  stats.nodes += document.body.querySelectorAll('*').length;
  for (const r of [...result.passes, ...result.violations]) stats.rules.add(r.id);

  if (result.violations.length === 0) return;

  const report = result.violations
    .map((v) => {
      const nodes = v.nodes
        .slice(0, 3)
        .map((n) => `      ${n.html.slice(0, 160)}\n      → ${n.failureSummary?.split('\n').join(' ') ?? ''}`)
        .join('\n');
      const more = v.nodes.length > 3 ? `\n      … und ${v.nodes.length - 3} weitere` : '';
      return `  ✗ ${v.id} (${v.impact}, ${v.nodes.length}×) — ${v.help}\n${nodes}${more}\n    ${v.helpUrl}`;
    })
    .join('\n');

  throw new Error(`axe-core fand ${result.violations.length} Barrierefreiheits-Verstoß/-Verstöße:\n${report}`);
});

afterAll(() => {
  const file = process.env.STB_A11Y_STATS;
  if (!file) return;
  appendFileSync(file, JSON.stringify({ ...stats, rules: [...stats.rules] }) + '\n');
});
