// tests/ui/edit-commit-timing.test.ts — Transaktionsgrenze der Bearbeitung
// (Spec 21 §6m, INV-UI-16, ADR-v9-193).
//
// WAS DIESER WÄCHTER HÄLT. Nicht „ein Commit-Zeitpunkt je Seite" — die Zweiteilung ist
// laut ADR-v9-193 die Entscheidung, nicht der Defekt. Gehalten wird die GRENZE:
//
//   (1) Ein Formular mit Speichern/Verwerfen schreibt NICHT selbst. Es baut sein Objekt
//       und reicht es per Callback nach oben. Fasste es `appState` an, läge ein
//       Sofort-Commit innerhalb der Transaktionsfläche — genau der Fall, den INV-UI-16
//       ausschließt, und er wäre von außen nicht zu sehen.
//   (2) Kein Verwerfen-Pfad verlässt den Bearbeiten-Modus. Der Modus ist ein
//       Sichtbarkeits-Gate (ADR-v9-30), das Verwerfen betrifft die Feldwerte. Beides in
//       einem Klick zu führen war die Ursache des falschen Versprechens: „Abbrechen"
//       las sich als Rücknahme von allem, was seit dem Öffnen geschah — auch von den
//       sofort committenden Abschnitten daneben (Namensvarianten, Hof-Adressen,
//       Dorf-Picker, Zugehörigkeits-Modal).
//
// Geschwister von `touch-target.test.ts`/`text-contrast.test.ts`: liest die ECHTEN
// Quellen, statt eine Konvention nur zu dokumentieren. Die Regel hängt sonst am
// zufälligen Wieder-Erinnern jeder künftigen Bau-Session (CLAUDE.md, mehrfach belegt).
//
// GRENZE, bewusst benannt: geprüft werden die Transaktions-Formulare, die es heute gibt
// (`*EditForm.svelte` unter `ui/views`). Ein künftiges Formular unter anderem Namen fällt
// nicht automatisch darunter — dafür bräuchte es ein Markup-Merkmal statt einer
// Namenskonvention. Der Fall, der diesen Wächter ausgelöst hat, ist abgedeckt.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const UI_DIR = fileURLToPath(new URL('../../ui', import.meta.url));

function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...svelteFiles(p));
    else if (name.endsWith('.svelte')) out.push(p);
  }
  return out;
}

/** Entfernt Block- und Zeilenkommentare, damit eine Erklärung im Kopf der Datei nicht
 *  als Verstoß zählt (dieselbe Falle wie bei `txt:`-Belegen, s. check-backlog.mjs). */
function ohneKommentare(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '') // Svelte-Markup-Kommentare: die Erklärung eines
    .replace(/\/\*[\s\S]*?\*\//g, '') // Verstoßes darf nicht selbst als Verstoß zählen
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Die Transaktions-Formulare: eine umgrenzte Fläche mit Speichern + Verwerfen darin. */
function editForms(): { pfad: string; src: string }[] {
  return svelteFiles(UI_DIR)
    .filter((p) => /EditForm\.svelte$/.test(p))
    .map((pfad) => ({ pfad, src: readFileSync(pfad, 'utf8') }));
}

describe('INV-UI-16 — die Transaktionsgrenze ist sichtbar und schreibt nicht selbst', () => {
  it('es gibt überhaupt Transaktions-Formulare zu prüfen (sonst prüft der Wächter nichts)', () => {
    expect(editForms().length).toBeGreaterThan(0);
  });

  // (1) Kein Sofort-Commit INNERHALB der Speichern/Verwerfen-Fläche.
  it('ein Bearbeiten-Formular fasst `appState` nicht an, sondern reicht sein Objekt nach oben', () => {
    const verstoesse = editForms()
      .filter(({ src }) => /\bappState\b/.test(ohneKommentare(src)))
      .map(({ pfad }) => pfad.replace(UI_DIR, 'ui'));
    expect(verstoesse, 'Formular schreibt selbst — Sofort-Commit in der Transaktionsfläche').toEqual([]);
  });

  // (2) Verwerfen verlässt den Modus nicht.
  it('kein Bearbeiten-Formular führt einen `onCancel`-Ausgang (Verwerfen ≠ Modus verlassen)', () => {
    const verstoesse = editForms()
      .filter(({ src }) => /\bonCancel\b/.test(ohneKommentare(src)))
      .map(({ pfad }) => pfad.replace(UI_DIR, 'ui'));
    expect(verstoesse, '`onCancel` schließt die Fläche — INV-UI-16 verlangt das Trennen von Verwerfen und Modus-Ende').toEqual([]);
  });

  // BL-274: der Editor ersetzt die Seite nicht. Der Defekt hatte eine feste Form —
  // ein `{:else if editing}`-Zweig VOR der Kopfzeile, der Titel und Rückweg genau dann
  // wegnahm, wenn der Nutzer den Namen ändert. Person/Quelle/Archiv trugen ihn, Ort/Hof
  // nie. Diese Form ist greppbar, also wird sie verboten statt beschrieben.
  it('keine Detail-Ansicht verdrängt ihre Kopfzeile durch den Editor (`{:else if editing}`)', () => {
    const verstoesse = svelteFiles(UI_DIR)
      .filter((p) => /Detail\.svelte$/.test(p))
      .filter((p) => /\{:else if editing\}/.test(ohneKommentare(readFileSync(p, 'utf8'))))
      .map((p) => p.replace(UI_DIR, 'ui'));
    expect(verstoesse, 'Editor steht VOR der Kopfzeile — Titel und Rückweg verschwinden beim Bearbeiten').toEqual([]);
  });

  it('jede Detail-Ansicht mit Bearbeiten-Modus bietet einen eigenen Ausgang („Fertig")', () => {
    const fehlend = svelteFiles(UI_DIR)
      .filter((p) => /Detail\.svelte$/.test(p))
      .map((pfad) => ({ pfad, src: readFileSync(pfad, 'utf8') }))
      // Jede Ansicht mit eigenem Bearbeiten-Zustand — nicht nur die mit `*EditForm`:
      // Person/Quelle/Archiv betten `*Form` ein und brauchen denselben Ausgang (BL-274).
      .filter(({ src }) => /let editing = \$state/.test(src))
      // Der Ausgang darf in der zugehörigen Kopfzeilen-Komponente sitzen (PersonDetail
      // delegiert seinen Kopf an PersonDetailHeader) — gesucht wird in beiden.
      .filter(({ pfad, src }) => {
        const header = pfad.replace(/Detail\.svelte$/, 'DetailHeader.svelte');
        const zusatz = existsSync(header) ? readFileSync(header, 'utf8') : '';
        return !/Fertig/.test(ohneKommentare(src + zusatz));
      })
      .map(({ pfad }) => pfad.replace(UI_DIR, 'ui'));
    expect(fehlend, 'Bearbeiten-Modus ohne eigenen Ausgang — dann muss „Verwerfen" ihn schließen').toEqual([]);
  });
});

// Das VERHALTEN („Verwerfen" setzt zurück, hält den Modus offen, lässt die sofort
// committende Nachbararbeit stehen) prüfen die Komponenten-Tests der beiden Seiten
// (`PlaceDetail.component.test.ts`, `HofDetail.component.test.ts`) — sie brauchen
// happy-dom, dieser Wächter liest nur Dateien und bleibt bewusst umgebungsfrei.
