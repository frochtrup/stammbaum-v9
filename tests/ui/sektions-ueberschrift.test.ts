// tests/ui/sektions-ueberschrift.test.ts — BL-342: eine Sektions-Überschrift, ein Stil.
//
// DER BEFUND (Nutzer-Screenshot 2026-08-11: „viele verschiedene Ebenen und Styles"). Auf
// EINER Seite standen vier Behandlungen für dieselbe Sache: „Ereignisse" gold/klein,
// „Familien" cremefarben/groß, „Personenbezüge" gedimmt, „FORSCHUNG" als kleines
// Großbuchstaben-Label. Die Ursache war keine Nachlässigkeit beim Stylen, sondern eine
// FEHLENDE PRIMITIVE: dieselben drei Deklarationen (`0.95rem` · `--stb-gold-light` ·
// `0.4rem`) standen SECHSFACH kopiert, je scoped in ihrer Detail-Ansicht.
//
// WARUM DAS ERST JETZT AUFFIEL, und warum eine Kopie hier schlimmer ist als anderswo:
// Sveltes Scoped CSS bleibt beim Elternteil. Solange jede Sektion in ihrer Ansicht lag,
// hielt die Kopie. In dem Moment, in dem eine Sektion in eine EIGENE Komponente umzieht
// (`PersonFamilySection`, BL-341), bleibt die Regel zurück und die Überschrift fällt
// still auf den Browser-Default. Eine kopierte Regel ist deshalb keine bloße Redundanz,
// sondern eine Zeitbombe mit Auslöser „jemand verschiebt Markup".
//
// DIESER TEST IST DER ZWANG statt der Erinnerung (ADR-v9-83-Logik, CLAUDE.md): eine
// Konvention, die nur im Kommentar steht, hängt daran, dass die nächste Bau-Sitzung sie
// liest. Der Wächter zählt bei jedem Lauf.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const UI = join(__dirname, '../../ui');

function svelteDateien(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...svelteDateien(p));
    else if (e.endsWith('.svelte')) out.push(p);
  }
  return out;
}

const dateien = svelteDateien(UI).map((p) => ({ pfad: p.slice(UI.length + 1), text: readFileSync(p, 'utf8') }));

describe('Sektions-Überschrift (BL-342)', () => {
  it('keine Komponente deklariert die Überschriften-Optik erneut', () => {
    // Die Signatur der abgeschafften Kopie: eine `h3`-Regel, die Größe UND Goldton setzt.
    // Sie zu suchen ist genauer als nach `0.95rem` allein zu greifen — den Wert nutzen auch
    // Listenzeilen und Formularfelder völlig zu Recht.
    const treffer = dateien.filter(({ text }) => {
      const regeln = text.match(/h3\s*\{[^}]*\}/g) ?? [];
      // Die Signatur ist der GENAUE Dreiklang der Sektions-Überschrift. Modal- und
      // Formular-Titel sind ebenfalls goldene `h3`, aber in 1rem bzw. 0.9rem — sie sind
      // bewusst eine andere Sache und bleiben unberührt. (Wer sie eines Tages ebenfalls
      // vereinheitlichen will, braucht dafür eine eigene Primitive, nicht diese.)
      return regeln.some((r) => /font-size:\s*0\.95rem/.test(r) && /--stb-gold-light/.test(r));
    });
    expect(
      treffer.map((t) => t.pfad),
      'Sektions-Überschriften nutzen `.stb-section-title` (ui/shell/design-system.css)',
    ).toEqual([]);
  });

  it('die geteilte Klasse existiert und trägt die drei Eigenschaften', () => {
    const css = readFileSync(join(UI, 'shell/design-system.css'), 'utf8');
    const regel = /\.stb-section-title\s*\{([^}]*)\}/.exec(css);
    expect(regel, '.stb-section-title fehlt in design-system.css').toBeTruthy();
    expect(regel![1]).toMatch(/font-size/);
    expect(regel![1]).toMatch(/--stb-gold-light/);
    expect(regel![1]).toMatch(/margin/);
  });

  it('jede Detail-Sektion beschriftet ihre Überschrift mit der Klasse', () => {
    // Die Gegenrichtung: ein `<h3>` OHNE Klasse in einer Datei, die Detail-Sektionen führt,
    // ist genau der Zustand, aus dem der Befund entstand. Modal- und Formular-Titel sind
    // ausgenommen — sie sind bewusst anders und tragen eigene Klassen.
    const detailDateien = dateien.filter(
      ({ pfad, text }) => /__section/.test(text) && !/Modal|Form\.svelte$/.test(pfad),
    );
    const nackt = detailDateien.filter(({ text }) => /<h3>/.test(text));
    expect(nackt.map((t) => t.pfad), '<h3> ohne `class="stb-section-title"`').toEqual([]);
  });
});
