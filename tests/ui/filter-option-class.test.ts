// tests/ui/filter-option-class.test.ts — EINE Filteroptions-Klasse (INV-UI-4).
// Geschwister von `text-contrast.test.ts`/`touch-target.test.ts`: liest die ECHTEN
// Quellen, statt eine Konvention nur zu dokumentieren.
//
// Ausgelöst von einer Drift, die sich fünfmal durch Kopieren fortgesetzt hatte:
// `PersonList`, `FamilyList`, `PlaceList`, `HofList` und `PlaceContemporaries` hatten je
// eine eigene `…__checkbox`-Klasse für dieselbe Filteroptions-Zeile, vier davon mit
// `flex-direction: row !important` + `gap: … !important`. Die `!important` waren nicht
// Schlamperei, sondern Folge einer zu breit gefassten Nachbarregel
// (`…__filters label { flex-direction: column }`), die ALLE Labels des Panels traf —
// auch die, die eine Zeile bleiben sollten. Wer die nächste Liste baut, kopiert genau
// dieses Paar wieder, wenn nichts widerspricht.
//
// WAS DIESER WÄCHTER KANN: er fängt (a) eine neue view-lokale Optionsklasse, die die
// geteilte `.stb-filter-opt` nachbaut, und (b) jedes `!important` auf `flex-direction`
// in einem Filterpanel — die beiden Formen, in denen die Drift real aufgetreten ist.
// WAS ER NICHT KANN: er sieht nicht, ob eine neue Liste ihre Optionen ÜBERHAUPT
// auszeichnet — eine Option ganz ohne Klasse fällt ihm nicht auf. Das ist bewusst
// benannt statt als Voll-Abdeckung ausgegeben.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const UI_DIR = fileURLToPath(new URL('../../ui', import.meta.url));
const DESIGN_SYSTEM = fileURLToPath(new URL('../../ui/shell/design-system.css', import.meta.url));

function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...svelteFiles(p));
    else if (name.endsWith('.svelte')) out.push(p);
  }
  return out;
}

function styleBlock(src: string): string {
  const m = /<style[^>]*>([\s\S]*?)<\/style>/.exec(src);
  return m ? m[1] : '';
}

function kurz(file: string): string {
  return file.slice(file.indexOf('/ui/') + 1);
}

describe('Filteroptionen — EINE geteilte Klasse statt einer Kopie je Liste (INV-UI-4)', () => {
  it('die geteilte Klasse samt Dichte-Variante existiert im Design-System', () => {
    const css = readFileSync(DESIGN_SYSTEM, 'utf8');
    expect(css).toMatch(/^\.stb-filter-opt \{/m);
    expect(css).toMatch(/^\.stb-filter-opt--compact \{/m);
  });

  it('kein View definiert eine eigene `…__checkbox`-Optionsklasse nach', () => {
    const treffer: string[] = [];
    for (const file of svelteFiles(UI_DIR)) {
      const css = styleBlock(readFileSync(file, 'utf8'));
      for (const m of css.matchAll(/^\s*\.([\w-]*__checkbox)\s*\{/gm)) {
        treffer.push(`${kurz(file)}: .${m[1]}`);
      }
    }
    expect(treffer, `Filteroptionen gehören auf .stb-filter-opt (+ --compact), nicht auf eine view-eigene Kopie:\n${treffer.join('\n')}`).toEqual([]);
  });

  it('kein Filterpanel nimmt seine eigene Label-Regel per `!important` zurück', () => {
    const treffer: string[] = [];
    for (const file of svelteFiles(UI_DIR)) {
      const css = styleBlock(readFileSync(file, 'utf8'));
      for (const m of css.matchAll(/(flex-direction|gap)\s*:[^;]*!important/g)) {
        treffer.push(`${kurz(file)}: ${m[0].trim()}`);
      }
    }
    expect(treffer, `Eine zu breite \`label\`-Regel enger fassen (z. B. \`:not(.stb-filter-opt)\`), statt sie zurückzunehmen:\n${treffer.join('\n')}`).toEqual([]);
  });
});
