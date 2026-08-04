// tests/ui/picker-dismiss-contract.test.ts — jeder Picker hat einen Ausweg (BL-300,
// ADR-v9-206). Geschwister von `touch-target.test.ts`/`button-style.test.ts`: liest die
// echten Quellen, statt eine Konvention nur zu dokumentieren.
//
// DER ANLASS: `FamilyDetail` blendet `PersonPicker` mit `startOpen` hinter „✎ Ehefrau
// ändern" ein — und verdrahtete `onClose` nicht. Verlassen ließ sich der Picker damit nur
// durch eine AUSWAHL; wer sich verklickt hatte, saß fest (Nutzer-Fund). `SourceCitationRow`
// hatte dieselbe Lücke, eine Stufe milder.
//
// DIE REGEL, die daraus folgt: **wer einen Picker mit `startOpen` einblendet, blendet ihn
// über einen eigenen Zustand ein — und muss diesen Zustand zurücksetzen können.** Genau
// dafür existiert `onClose` (feuert bei Auswahl, Escape, Klick daneben). Ohne die Prop
// bleibt die Hülle stehen, wenn die Liste sich schließt.
//
// Warum als Quellen-Scan und nicht als Komponententest: der Defekt liegt nicht IM Picker,
// sondern in der Verdrahtung durch den Aufrufer — und die neuen Aufrufer sind es, die den
// Fehler wiederholen würden. Ein Test je Aufrufer prüft die, die es heute gibt; dieser
// prüft die, die morgen dazukommen.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const UI_DIR = fileURLToPath(new URL('../../ui', import.meta.url));

/** Die Shell selbst und ihre dünnen Wrapper reichen `startOpen`/`onClose` nur durch —
 *  sie sind nicht die Aufrufer, um die es hier geht. */
const DURCHREICHER = ['Picker.svelte', 'PersonPicker.svelte', 'FamilyPicker.svelte', 'SourcePicker.svelte', 'RepositoryPicker.svelte'];

function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...svelteFiles(p));
    else if (name.endsWith('.svelte')) out.push(p);
  }
  return out;
}

interface Einbettung {
  file: string;
  komponente: string;
  startOpen: boolean;
  onClose: boolean;
}

/** Jede Stelle, an der ein Picker MONTIERT wird — mit ihren beiden Props. */
function einbettungen(): Einbettung[] {
  const out: Einbettung[] = [];
  // Bis zum SELBSTSCHLIESSENDEN `/>`, nicht bis zum ersten `>`: ein Attributwert wie
  // `onChange={(id) => setParent(role, id)}` enthält ein `>`, und die erste Fassung
  // schnitt das Element genau dort ab — sie fand 3 Einbettungen mit `startOpen` statt 7.
  // Der Fehler wäre unbemerkt geblieben, wenn die Nicht-leer-Zusicherung unten fehlte.
  const tag = /<(Picker|PersonPicker|FamilyPicker|SourcePicker|RepositoryPicker)\b([\s\S]*?)\/>/g;
  for (const file of svelteFiles(UI_DIR)) {
    const kurz = file.slice(UI_DIR.length + 1);
    if (DURCHREICHER.includes(kurz.split('/').pop()!)) continue;
    const src = readFileSync(file, 'utf8');
    // Nur das Markup — ein `import PersonPicker from …` ist keine Einbettung.
    const markup = src.replace(/<script[\s\S]*?<\/script>/g, '');
    for (const m of markup.matchAll(tag)) {
      const attrs = m[2];
      out.push({
        file: kurz,
        komponente: m[1],
        startOpen: /\bstartOpen\b/.test(attrs),
        onClose: /\bonClose\b/.test(attrs),
      });
    }
  }
  return out;
}

describe('Picker-Einbettung — wer ihn einblendet, muss ihn auch schließen können (BL-300)', () => {
  it('jede Einbettung mit `startOpen` verdrahtet auch `onClose`', () => {
    const offen = einbettungen()
      .filter((e) => e.startOpen && !e.onClose)
      .map((e) => `${e.file}  <${e.komponente} startOpen … /> ohne onClose`);
    expect(
      offen.join('\n'),
      'Ein Picker mit `startOpen` hängt an einem eigenen Zustand des Aufrufers.\n' +
        'Ohne `onClose` bleibt dieser Zustand gesetzt, wenn die Liste sich schließt —\n' +
        'die Hülle steht weiter da, und verlassen lässt sie sich nur durch eine Auswahl.',
    ).toBe('');
  });

  it('der Wächter prüft nicht die leere Menge (die bekannten Einbettungen sind gefunden)', () => {
    // Ohne diese Zusicherung bliebe der Test auch dann grün, wenn der Scan gar nichts
    // fände — ein Wächter über einer leeren Menge ist keiner (TST-20).
    const alle = einbettungen();
    expect(alle.length).toBeGreaterThanOrEqual(20);
    expect(alle.filter((e) => e.startOpen).length).toBeGreaterThanOrEqual(5);
    expect(alle.some((e) => e.file.endsWith('FamilyDetail.svelte') && e.startOpen)).toBe(true);
  });
});
