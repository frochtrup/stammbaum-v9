// tests/ui/design-system-flex.test.ts — Regressionsschutz für die Flexbox-Schrumpf-Falle
// im geteilten Design-System (INV-UI-4).
//
// Warum ein CSS-Quelltext-Test und kein Komponenten-Test: happy-dom hat keine
// Layout-Engine (kein Box-Modell, keine Flexbox-Auflösung) — `getBoundingClientRect()`
// liefert dort durchweg 0. Ein gerenderter Test KANN diesen Fehler prinzipiell nicht
// sehen; er wurde im echten Browser per Geometrie-Messung gefunden (Zeile 17,1 px hoch,
// Pillen 11,6 px bei Top-Offset 8 px → Hauptnavigation unten angeschnitten).
// Der Quelltext-Check ist damit die einzige mechanisch verfügbare Absicherung — bewusst
// schwächer als ein echter Layout-Test, aber stärker als ein Kommentar (CLAUDE.md:
// "wo mechanisch möglich, den Zwang statt die Erinnerung wählen").
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Kommentare werden VOR jeder Prüfung entfernt: die erklärenden Kommentare in
// design-system.css nennen die geprüften Deklarationen wörtlich ("`flex-shrink: 0`
// schützt alle …"). Ohne dieses Strippen prüft der Test den Kommentar statt des Codes
// und bleibt grün, auch wenn die Deklaration selbst gelöscht wird (genau so beim
// Gegen-Test aufgefallen — der Test war zunächst wirkungslos).
const css = readFileSync(
  fileURLToPath(new URL('../../ui/shell/design-system.css', import.meta.url)),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** Liefert den Deklarationsblock eines Selektors (erste Fundstelle). */
function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `Selektor ${selector} fehlt in design-system.css`).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  return css.slice(start, end);
}

describe('design-system.css — Flexbox-Schrumpf-Falle bei scrollenden Reihen', () => {
  // Jede Reihe mit `overflow-*: auto` bekommt `min-height/min-width: auto` → 0
  // (CSS-Flexbox §4.5) und darf in einem Spalten-Flex-Container unter ihre
  // Inhaltshöhe schrumpfen. Betrifft alle Nutzer der Klasse zugleich: EntityTab
  // (Haupt- + Subsegmente), ResearchTab, LensSwitcher, ViewModeToggle, MapLensView,
  // PlaceList, HofList, HypothesesView, LogView.
  it('.stb-segment-row ist gegen Schrumpfen unter die Inhaltshöhe geschützt', () => {
    const body = ruleBody('.stb-segment-row');

    expect(body).toMatch(/overflow-x:\s*auto/);
    expect(
      /flex-shrink:\s*0/.test(body) || /flex:\s*0 0/.test(body),
      '.stb-segment-row hat overflow-x:auto, aber kein flex-shrink:0 — in einem ' +
        'Spalten-Flex-Container (EntityTab/ResearchTab) werden die Segment-Pillen ' +
        'dann abgeschnitten.',
    ).toBe(true);
  });

  it('keine weitere geteilte .stb-*-Reihe hat overflow:auto ohne Schrumpf-Schutz', () => {
    // Geschwister-Stellen-Prüfung (CLAUDE.md: ein Fix an einer Regel ist erst fertig,
    // wenn ALLE strukturgleichen Stellen mitgezogen sind).
    const rules = [...css.matchAll(/(\.stb-[a-z0-9-]+)\s*\{([^}]*)\}/g)];
    const unprotected = rules
      .filter(([, , body]) => /overflow(-[xy])?:\s*(auto|scroll)/.test(body))
      .filter(([, , body]) => !/flex-shrink:\s*0/.test(body) && !/flex:\s*0 0/.test(body))
      .map(([, selector]) => selector);

    expect(unprotected).toEqual([]);
  });
});
