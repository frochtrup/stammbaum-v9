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

  // BL-343: dieselbe Kopier-Klasse eine Ebene höher. Der Abstand zwischen Abschnitten
  // stand achtfach als `margin` — fünfmal `margin-top`, zweimal `margin-bottom`, also
  // nicht einmal einheitlich —, und eine extrahierte Komponente verlor ihn genauso still
  // wie die Überschrift (`FamilyChildrenSection` zog ihn von Hand nach; der Kommentar
  // daneben sagte es wörtlich). Jetzt trägt ihn `gap` am Container: er gilt für jedes
  // Kind, unabhängig davon, welche Komponente es rendert.
  //
  // DIE RATSCHE STEHT AUF 0, nicht auf „ein paar sind erlaubt": es gibt keinen Grund,
  // warum eine Detail-Sektion ihren Außenabstand selbst mitbringen sollte. Bewusst als
  // Zahl formuliert und nicht als `toEqual([])` — so ist beim nächsten Anstieg sofort
  // sichtbar, ob EINE Fundstelle dazukam oder das Muster zurückgekehrt ist.
  const abschnittsAbstandRatsche = 0;

  it(`kein Detail-Abschnitt bringt seinen Außenabstand selbst mit (Ratsche ${abschnittsAbstandRatsche})`, () => {
    // `-detail__section`, nicht irgendein `__section`: ein FORMULAR-Abschnitt
    // (`person-form__section`) sitzt in einem anderen Container mit eigener Rhythmik und
    // ist von dieser Entscheidung nicht berührt. Der erste, zu weite Anlauf meldete ihn
    // mit — dieselbe Verwechslung wie beim Überschriften-Wächter oben, wo Modal-Titel
    // mitkamen.
    const treffer = dateien.filter(({ text }) => {
      const regeln = text.match(/-detail__section\s*\{[^}]*\}/g) ?? [];
      return regeln.some((r) => /margin(-top|-bottom)?:\s*1\.25rem/.test(r));
    });
    expect(treffer.map((t) => t.pfad), 'Abstand gehört als `gap` an den Container').toHaveLength(
      abschnittsAbstandRatsche,
    );
  });

  // BL-345: dieselbe Klasse von Befund an einer anderen Primitive. `.stb-icon-btn` setzte
  // KEINE `font-size` — und ein `<button>` erbt seine nicht, er fällt auf den
  // User-Agent-Wert (13,333px). Alle 16 Fundstellen maßen exakt diesen Wert: einheitlich,
  // aber durch Zufall, und je nach Zeile (0,7–0,95rem) mal größer, mal kleiner als der
  // Text daneben. Der Wert steht jetzt in der Primitive; dieser Test hält fest, DASS er
  // dort steht — verschwindet er, ist der UA-Default sofort und unbemerkt zurück.
  it('die Glyphen-Primitive setzt ihre Schriftgröße selbst (kein User-Agent-Default)', () => {
    const css = readFileSync(join(UI, 'shell/design-system.css'), 'utf8');
    const regel = /\.stb-icon-btn\s*\{([^}]*)\}/.exec(css);
    expect(regel, '.stb-icon-btn fehlt in design-system.css').toBeTruthy();
    expect(regel![1], 'ohne font-size gilt der UA-Wert 13,333px — gemessen, nicht gewählt').toMatch(/font-size/);
  });

  // BL-347: dieselbe Lücke an der zweiten Primitive. `.stb-btn` setzte ebenfalls keine
  // `font-size` — 78 Fundstellen auf dem UA-Wert. Der Wert ist hier an die gezeichneten
  // 36px gebunden (0,85rem hält sie; ab 0,9rem wachsen Knöpfe mit Glyphe auf 39px), also
  // steht die Zahl nicht zur freien Wahl und gehört umso mehr festgehalten.
  it('die beschriftete Knopf-Primitive setzt ihre Schriftgröße selbst', () => {
    const css = readFileSync(join(UI, 'shell/design-system.css'), 'utf8');
    const regel = /\.stb-btn\s*\{([^}]*)\}/.exec(css);
    expect(regel, '.stb-btn fehlt in design-system.css').toBeTruthy();
    expect(regel![1], 'ohne font-size gilt der UA-Wert 13,333px — gemessen, nicht gewählt').toMatch(/font-size/);
  });

  // Kein lokaler Nachbau einer VORHANDENEN Variante. Die Gefahrenzone tat genau das bis
  // BL-347: `.delete-entity__btn` war transparent + Danger-Farbe + Rahmen + Radius — Zug
  // um Zug die `danger`-Variante, nur außerhalb der Primitive, und damit der einzige
  // beschriftete Knopf, den eine Änderung an ihr nicht erreicht hätte.
  //
  // Die Signatur ist bewusst die DANGER-Variante und nicht „irgendein lokaler Knopf mit
  // Radius-Token": vier Komponenten (`PersonMergeModal`, `PlaceMergeSection`,
  // `EventAgeHelper` u. a.) führen einen gefüllten `surface-3`-Knopf mit `gold-dim`-Rahmen
  // — einen VIERTEN Look, den die Primitive gar nicht anbietet. Sie zu erfassen hieße,
  // eine Design-Frage zu stellen, die dieser Test nicht beantwortet (BL-348). Der erste,
  // zu weite Anlauf tat es und meldete sie mit — derselbe Fehler wie zweimal zuvor in
  // dieser Datei.
  it('kein lokaler Nachbau einer vorhandenen Knopf-Variante', () => {
    const treffer = dateien.filter(({ text }) => {
      const regeln = text.match(/__btn\s*\{[^}]*\}/g) ?? [];
      return regeln.some((r) => /--stb-danger/.test(r) && /border-radius/.test(r));
    });
    expect(treffer.map((t) => t.pfad), 'nutze `.stb-btn` samt `data-variant`').toEqual([]);
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
