// tests/ui/touch-target.test.ts — Trefferflächen-Kontrakt (Spec 21 §6i, ADR-v9-155).
// Geschwister von `text-contrast.test.ts`: liest die ECHTEN CSS-Werte aus den Quellen,
// statt eine Konvention nur zu dokumentieren.
//
// WAS DIESER WÄCHTER KANN — und was nicht. Er fängt den Fall, der ihn ausgelöst hat:
// jemand setzt an einem Bedienelement eine EXPLIZITE Mindestgröße UNTER der Schwelle
// (`UndoControls` hatte `min-width: 2.2rem` → 35×27px, die kleinsten interaktiven
// Flächen der App, gefunden erst durch eine Design-Kritik des Nutzers). Er fängt NICHT
// „jemand setzt gar keine Größe" — dafür braucht es gerenderte Pixel MIT Layout. Der
// a11y-Scanner (tests/a11y/axe-setup.ts, ADR-v9-170) schließt die Lücke NICHT: er läuft
// unter happy-dom, das keine Geometrie rechnet. Sie bleibt manuell. Das ist bewusst so
// benannt statt als Voll-Abdeckung ausgegeben: ein Wächter, dessen Reichweite man
// überschätzt, ist schlimmer als einer, dessen Grenze man kennt.
//
// Warum überhaupt eine Zahl im CSS und nicht nur im Spec: die Vorgabe „44px" hing bis
// ADR-v9-155 an gar nichts — §6i nannte Tastatur, Screenreader, reduzierte Bewegung und
// Kontrast, aber kein Ziel-Größen-Kriterium. Eine Regel, die nur in Prosa steht, hängt am
// zufälligen Wieder-Erinnern jeder künftigen Bau-Session (CLAUDE.md, mehrfach belegt).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const UI_DIR = fileURLToPath(new URL('../../ui', import.meta.url));
const DESIGN_SYSTEM = fileURLToPath(new URL('../../ui/shell/design-system.css', import.meta.url));

/**
 * BL-282 — der Suchraum umfasst die freistehenden CSS-Dateien, nicht nur die
 * `<style>`-Blöcke der Komponenten. Ausgerechnet die MEISTBENUTZTEN Bedienelemente
 * stehen dort: `.stb-segment-btn` (Entitäten-Segmente, Lens-Umschalter,
 * `ViewModeToggle`) und `.stb-pill__remove` liegen in `design-system.css`, in keiner
 * Komponente. Der Wächter zählte an ihnen vorbei und meldete trotzdem eine Zahl über
 * „die Bedienelemente" — dieselbe Fehlerklasse wie die Lücke, die BL-272 geschlossen
 * hat, eine Ebene höher: die Reichweite wurde überschätzt und der Suchraum beim Bau
 * nicht gegen die Realität geprüft.
 */
const GETEILTE_PRIMITIVEN = /\.css$/;

/** Die Schwelle steht im Design-System, nicht hier — EINE Quelle (INV-UI-4). */
function touchTargetPx(): number {
  const px = toPx('var(--stb-touch-target)', designTokens());
  if (px == null) throw new Error('Token --stb-touch-target fehlt in design-system.css');
  return px;
}

/** Alle `--stb-*`-Token aus dem Design-System, roh. Nötig, damit eine Größe, die über
 *  ein ANDERES Token gesetzt wird (`--stb-nav-height`), bewertbar ist statt ignoriert. */
function designTokens(): Map<string, string> {
  const css = readFileSync(DESIGN_SYSTEM, 'utf8');
  const map = new Map<string, string>();
  for (const m of css.matchAll(/(--stb-[\w-]+)\s*:\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  return map;
}

function filesUnder(dir: string, suffix: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p, suffix));
    else if (name.endsWith(suffix)) out.push(p);
  }
  return out;
}

interface StyleSource {
  file: string;
  css: string;
}

/** Jede Stilquelle der UI: `<style>`-Block einer Komponente ODER freistehende
 *  CSS-Datei (GETEILTE_PRIMITIVEN). */
function styleSources(): StyleSource[] {
  const out: StyleSource[] = [];
  for (const file of filesUnder(UI_DIR, '.svelte')) {
    const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(readFileSync(file, 'utf8'));
    if (style) out.push({ file: file.slice(UI_DIR.length + 1), css: style[1] });
  }
  for (const file of filesUnder(UI_DIR, '.css')) {
    if (!GETEILTE_PRIMITIVEN.test(file)) continue;
    out.push({ file: file.slice(UI_DIR.length + 1), css: readFileSync(file, 'utf8') });
  }
  return out;
}

/** `2.2rem` → 35.2 · `28px` → 28 · `var(--stb-nav-height)` → über die Token-Tabelle.
 *  Andere Einheiten (%, em, vw) sind kontextabhängig und werden bewusst NICHT geraten —
 *  sie zählen als „nicht bewertbar", nicht als Verstoß. Die `var()`-Auflösung kam mit
 *  BL-282: die Bottom-Nav beantwortet ihre Größe über ein EIGENES Token
 *  (`--stb-nav-height`), war damit „nicht bewertbar" und fiel aus der Prüfung — heute
 *  konform, aber nicht *dadurch*; ein gesenkter Wert fiele unbemerkt unter die Schwelle. */
function toPx(value: string, tokens: Map<string, string>, depth = 0): number | null {
  const v = value.trim();
  const ref = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(v);
  if (ref) {
    const raw = tokens.get(ref[1]);
    return raw == null || depth >= 4 ? null : toPx(raw, tokens, depth + 1);
  }
  const m = /^([\d.]+)(px|rem)$/.exec(v);
  if (!m) return null;
  return m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
}

interface Finding {
  file: string;
  selector: string;
  prop: string;
  value: string;
  px: number;
}

const CONTROL = /(^|[\s,>])(button|a)\b|(btn|button|control|toggle|chip|action|remove|close|dismiss)/i;

/**
 * BL-297 — die Zugehörigkeit „ist ein Bedienelement" wird nicht mehr nur am Klassennamen
 * GERATEN, sondern im Markup NACHGESEHEN: welche Klassen stehen tatsächlich auf einem
 * `<button>`, `<a>` oder `role="button"`? Die Namensheuristik allein fand 95 Regeln, die
 * Markup-Ableitung 155 — sie sah also gut ein Drittel nicht. Umgekehrt findet die
 * Heuristik 23, die das Markup nicht liefert: Nachfahren-Selektoren ohne eigene Klasse
 * (`.hof-detail__add-row button`) und die imperativen Inseln, deren Markup gar nicht in
 * einer `.svelte`-Datei steht (`timeline-view.css`, `hourglass-tree.css`). Deshalb die
 * VEREINIGUNG beider — keine der beiden Quellen ist für sich vollständig, und welche
 * fehlt, hängt davon ab, wie die Komponente gebaut ist.
 */
const INTERAKTIVE_KLASSEN = (): Set<string> => {
  const set = new Set<string>();
  const sammle = (attrs: string) => {
    const fuege = (v: string) => {
      for (const t of v.split(/[\s{}?:()|&+]+/)) if (/^[a-z][\w-]{2,}$/i.test(t)) set.add(t);
    };
    for (const m of attrs.matchAll(/\bclass\s*=\s*"([^"]*)"/g)) fuege(m[1]);
    // `class={cond ? 'a' : 'b'}` — nur die Literale, nie die Variablennamen.
    for (const m of attrs.matchAll(/\bclass\s*=\s*\{([^}]*)\}/g))
      for (const lit of m[1].matchAll(/["'`]([^"'`]*)["'`]/g)) fuege(lit[1]);
    for (const m of attrs.matchAll(/\bclass:([\w-]+)/g)) set.add(m[1]);
  };
  for (const file of filesUnder(UI_DIR, '.svelte')) {
    const markup = readFileSync(file, 'utf8').replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
    for (const tag of markup.matchAll(/<(button|a)\b([^>]*)>/gi)) sammle(tag[2]);
    for (const tag of markup.matchAll(/<[a-zA-Z][\w-]*\b([^>]*role=["']button["'][^>]*)>/g)) sammle(tag[1]);
  }
  return set;
};

/** Ein Selektor, der ausdrücklich KEIN Bedienelement ist (z. B. `.x__btn-row`), trägt die
 *  Größe seines Kindes nicht — Container-Suffixe ausnehmen. */
const CONTAINER_SUFFIX = /(row|bar|group|list|wrap|container)\s*$/i;

/** Beantwortet die Regel die Größenfrage selbst? `line-height` zählt NICHT — es enthält
 *  `height:` nur als Teilwort. Genau daran sind `.stb-pill__remove` und
 *  `.event-line__edit-btn` (beide `line-height: 1`) still aus der Zählung gefallen,
 *  obwohl sie die kleinsten Flächen der App sind (BL-282). */
const SETS_SIZE = /(?:^|[\s;{])(min-height|min-width|height)\s*:/;

/** Kommentare gehören nicht zum Selektor. Sonst entscheidet die Prosa NEBEN einer Regel,
 *  ob sie als Bedienelement zählt — zehn Regeln (`__notice`, `__error`, `__group-header`,
 *  `.stb-list-stat` …) standen nur deshalb in der Liste, weil in ihrem Kommentar „Button"
 *  oder „Aktion" vorkam (BL-282). */
function selectorOf(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
}

/** Grobe, aber ausreichende Regel-Zerlegung: `selektor { … }` ohne Verschachtelung. */
function* controlRules(): Generator<{ file: string; selector: string; body: string }> {
  const interaktiv = INTERAKTIVE_KLASSEN();
  for (const { file, css } of styleSources()) {
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = selectorOf(rule[1]);
      if (!selector) continue;
      const perMarkup = (selector.match(/\.([\w-]+)/g) ?? []).some((c) => interaktiv.has(c.slice(1)));
      if (!perMarkup && !CONTROL.test(selector)) continue;
      // Die Container-Ausnahme gilt nur für die geratene Hälfte: was das Markup als
      // Bedienelement BELEGT, ist keins wegen seines Namenssuffixes weniger.
      if (!perMarkup && CONTAINER_SUFFIX.test(selector)) continue;
      yield { file, selector, body: rule[2] };
    }
  }
}

/**
 * Sucht Regeln, deren Selektor ein Bedienelement benennt (`button`, `__btn`,
 * `[role="button"]` …) und die dort `min-width`/`min-height` unter der Schwelle
 * festschreiben.
 */
function findUndersizedControls(threshold: number, tokens: Map<string, string>): Finding[] {
  const findings: Finding[] = [];
  for (const { file, selector, body } of controlRules()) {
    for (const decl of body.matchAll(/(min-width|min-height)\s*:\s*([^;]+);/g)) {
      const px = toPx(decl[2], tokens);
      if (px == null || px >= threshold) continue;
      findings.push({ file, selector, prop: decl[1], value: decl[2].trim(), px });
    }
  }
  return findings;
}

/**
 * BL-282, zweite Fundstelle: eine Höhe, die über ein EIGENES Token gesetzt wird.
 *
 * Die Bottom-Nav bemisst sich über `--stb-nav-height` (3,1rem ≈ 49,6px) — heute konform,
 * aber nicht *dadurch*: ein gesenkter Wert fiele unbemerkt unter die Schwelle, denn die
 * Regel steht auf dem `<nav>`-Container, nicht auf den Knöpfen darin (`align-items:
 * stretch` gibt ihnen die Höhe). Der Selektor-Heuristik oben ist der Container zu Recht
 * kein Bedienelement; die Höhe ist er trotzdem.
 *
 * Deshalb hier nicht am Selektor, sondern am TOKEN geprüft: jedes `--stb-*`, das irgendwo
 * eine `height`/`min-height` bestimmt, wird gegen die Schwelle gehalten. Heute sind das
 * genau zwei (`--stb-touch-target` 15×, `--stb-nav-height` 1×) — wer ein drittes einführt,
 * beantwortet die Frage, statt sie zu umgehen. Eine Höhe, die BEWUSST unter der Schwelle
 * liegen soll, gehört dann als Literal in die Regel, nicht in ein geteiltes Token.
 */
function findUndersizedSizeTokens(
  threshold: number,
  tokens: Map<string, string>,
): { file: string; token: string; px: number }[] {
  const out: { file: string; token: string; px: number }[] = [];
  for (const { file, css } of styleSources()) {
    for (const m of css.matchAll(/(?:^|[\s;{])(?:min-)?height\s*:\s*(var\(\s*--[\w-]+\s*\))/g)) {
      const token = /--[\w-]+/.exec(m[1])![0];
      const px = toPx(m[1], tokens);
      if (px == null || px >= threshold) continue;
      out.push({ file, token, px });
    }
  }
  return out;
}

/**
 * BL-272 — die ANDERE Hälfte: ein Bedienelement, das GAR KEINE Mindestgröße setzt.
 *
 * Der Kopfkommentar oben nannte diese Lücke und ließ sie offen („dafür braucht es
 * gerenderte Pixel MIT Layout"). Die Design-Kritik der Bearbeitungsfunktion zeigte, dass
 * genau darin die gesamte Editier-Fläche liegt: kein einziges ihrer Bedienelemente setzt
 * eine Größe, keines erreicht die Schwelle — `✎` je Ereigniszeile rechnerisch ≈ 14px bei
 * `padding: 0; font-size: .85rem; line-height: 1`.
 *
 * Gerenderte Pixel braucht es dafür NICHT: es genügt zu fragen, ob eine Regel, die ein
 * Bedienelement gestaltet, die Größenfrage überhaupt beantwortet — entweder selbst
 * (`min-height`/`min-width`/`height`) oder durch Rückgriff auf die geteilte Primitive
 * `.stb-btn`, die sie beantwortet. Wer weder das eine noch das andere tut, hat die Frage
 * nicht gestellt. Das ist schwächer als eine Messung und stärker als nichts.
 *
 * RATSCHE statt Rot-Wand: der Ist-Stand ist bekannt und wird von BL-273 abgebaut
 * (Umstellung der Bearbeitungs-Bedienelemente auf `.stb-btn`). Die Zahl darf nur
 * FALLEN — dieselbe Bauform wie L3/L7/L11 im Backlog-Lint. Wer ein neues Bedienelement
 * ohne Größe anlegt, hebt sie sonst unbemerkt an; genau das soll auffliegen.
 *
 * Die Zahl ist GEMESSEN, nicht gegriffen: der erste Entwurf trug 44 als Platzhalter, der
 * Lauf ergab 116. Eine Ratsche mit geschätztem Startwert ist entweder sofort rot oder
 * blind — beides macht sie wertlos (dieselbe Lehre wie beim Perf-Budget, ADR-v9-91).
 *
 * BL-282 hebt sie EINMALIG an (93 → 101), weil der Suchraum wuchs — die Zahl zählt jetzt
 * andere Elemente, nicht mehr davon. Aufgeschlüsselt, damit die Anhebung nicht wie ein
 * Rückschritt gelesen wird: +12 aus den freistehenden CSS-Dateien, +2 durch die
 * `line-height`-Wortgrenze, +4 durch `remove`/`close`/`dismiss` im Selektor-Vokabular,
 * −10 Kommentar-Fehltreffer. Eine Ratsche darf nur fallen, SOLANGE sie dasselbe misst;
 * ändert sich der Suchraum, wird neu gemessen statt die alte Zahl zu retten.
 *
 * BL-280 senkt sie im selben Zug auf 95: sechs lokale Icon-Knopf-Regeln gehen in
 * `.stb-icon-btn` auf.
 *
 * BL-297 hebt sie ein zweites Mal an (95 → 177), aus demselben Grund wie BL-282: der
 * Suchraum wurde ehrlicher, nicht schlechter. Vorher entschied ein Wort im Klassennamen,
 * ob eine Regel als Bedienelement zählt; jetzt zusätzlich das Markup — 82 Regeln, die
 * ein `<button>` gestalten, ohne „btn" zu heißen, waren nie gezählt worden. Die Zahl
 * misst ab hier die ganze Fläche; sie fällt wieder mit jedem Element, das eine Größe
 * bekommt.
 */
const OHNE_GROESSE_RATSCHE = 177; // GEMESSEN. 116 → 93 (BL-273/274) → 101 (BL-282) → 95 (BL-280) → 177 (BL-297, Markup-Ableitung).

/**
 * Selektoren, deren Größe an einem PSEUDO-ELEMENT hängt (BL-280): `.stb-icon-btn` selbst
 * setzt bewusst keine Größe — die Trefferzone ist ein absolut positioniertes `::after`,
 * das über die Glyphe hinaushängt, ohne im Fluss vorzukommen. Ohne diese Gutschrift
 * meldete der Wächter ausgerechnet die Primitive, die die Frage am gründlichsten
 * beantwortet.
 */
function pseudoSizedSelectors(): Set<string> {
  const out = new Set<string>();
  for (const { css } of styleSources()) {
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = selectorOf(rule[1]);
      if (!/::(before|after)\b/.test(selector) || !SETS_SIZE.test(rule[2])) continue;
      for (const teil of selector.split(',')) {
        const basis = teil.replace(/::(before|after)\b.*$/, '').trim();
        if (basis) out.add(basis);
      }
    }
  }
  return out;
}

/** Regeln, die ein Bedienelement gestalten, aber seine Größe nicht beantworten. */
function findControlsWithoutSize(): { file: string; selector: string }[] {
  const out: { file: string; selector: string }[] = [];
  const perPseudo = pseudoSizedSelectors();
  for (const { file, selector, body } of controlRules()) {
    if (perPseudo.has(selector)) continue;
    // Nur Regeln, die das Element WIRKLICH gestalten — ein reiner `:hover`-Farbwechsel
    // ist keine Größen-Entscheidung und soll nicht mitzählen.
    if (/:(hover|focus|focus-visible|active|disabled)\b/.test(selector)) continue;
    if (!/(padding|background|border|font-size)\s*:/.test(body)) continue;
    if (SETS_SIZE.test(body)) continue;
    out.push({ file, selector });
  }
  return out;
}

describe('Trefferflächen — Bedienelemente schreiben keine Größe unter der Schwelle fest', () => {
  it('das Schwellen-Token existiert und hält die Apple-HIG-Vorgabe für die Primärplattform', () => {
    expect(touchTargetPx()).toBeGreaterThanOrEqual(44);
  });

  it('keine Komponente setzt min-width/min-height eines Bedienelements darunter', () => {
    const threshold = touchTargetPx();
    const findings = findUndersizedControls(threshold, designTokens());
    const report = findings
      .map((f) => `${f.file}  ${f.selector} { ${f.prop}: ${f.value} }  → ${f.px}px < ${threshold}px`)
      .join('\n');
    expect(report).toBe('');
  });

  it('BL-282: der Suchraum umfasst die geteilten CSS-Primitiven, nicht nur Komponenten', () => {
    const quellen = styleSources();
    expect(quellen.length).toBeGreaterThan(0);
    expect(quellen.some((q) => GETEILTE_PRIMITIVEN.test(q.file))).toBe(true);
    // Die namentlich benannte Fundstelle: `.stb-segment-btn` steht in
    // `design-system.css`, in keiner Komponente — und ist über Entitäten-Segmente,
    // Lens-Umschalter und `ViewModeToggle` das meistbenutzte Bedienelement der App.
    // (Die zweite, `.stb-pill__remove`, ist mit BL-280 in `.stb-icon-btn` aufgegangen —
    // sie war der Anlass, nicht die Grenze des Suchraums.)
    const ohne = findControlsWithoutSize();
    expect(ohne.some((f) => f.selector === '.stb-segment-btn')).toBe(true);
    expect(ohne.filter((f) => GETEILTE_PRIMITIVEN.test(f.file)).length).toBeGreaterThan(1);
  });

  it('BL-280: die Icon-Primitive beantwortet die Größenfrage am Pseudo-Element', () => {
    // Sie setzt bewusst KEINE eigene Größe (das würde den Fluss verändern) — die
    // Trefferzone hängt am `::after`. Der Wächter muss diese Form kennen, sonst meldet
    // er ausgerechnet die Primitive, die die Frage am gründlichsten beantwortet.
    expect(pseudoSizedSelectors().has('.stb-icon-btn')).toBe(true);
    expect(findControlsWithoutSize().some((f) => f.selector === '.stb-icon-btn')).toBe(false);
    // Und die alten Fundstellen sind weg: keine lokale Regel mehr für sie.
    const alle = styleSources().map((q) => q.css).join('\n');
    for (const tot of ['.event-line__edit-btn', '.media-detail__ref-btn', '.stb-pill__remove']) {
      expect(alle).not.toContain(`${tot} {`);
    }
  });

  it('BL-282: ein Größen-Token, das nicht --stb-touch-target ist, wird geprüft statt ignoriert', () => {
    const threshold = touchTargetPx();
    const tokens = designTokens();
    const verstoesse = findUndersizedSizeTokens(threshold, tokens);
    expect(
      verstoesse.map((v) => `${v.file}  ${v.token} → ${v.px}px < ${threshold}px`).join('\n'),
    ).toBe('');
    // Und der Rot-Fall ist belegt, nicht behauptet: derselbe Lauf mit gesenktem
    // `--stb-nav-height` findet die Bottom-Nav. Vor BL-282 war `var(…)` schlicht
    // „nicht bewertbar" und fiel aus jeder Prüfung.
    const gesenkt = new Map(tokens).set('--stb-nav-height', '2rem');
    const rot = findUndersizedSizeTokens(threshold, gesenkt);
    expect(rot.map((v) => v.token)).toContain('--stb-nav-height');
  });

  it('BL-272: die Zahl der Bedienelemente OHNE Größenangabe fällt nur (Ratsche)', () => {
    const ohne = findControlsWithoutSize();
    const bericht = ohne.map((f) => `${f.file}  ${f.selector}`).sort().join('\n');
    expect(
      ohne.length,
      `Bedienelemente ohne jede Größenangabe: ${ohne.length} > Ratsche ${OHNE_GROESSE_RATSCHE}.\n` +
        'Ein neues Bedienelement nutzt `.stb-btn` (INV-UI-4) oder setzt selbst eine\n' +
        'Mindestgröße — die Ratsche wird nur GESENKT, nie angehoben (BL-273 baut sie ab).\n' +
        bericht,
    ).toBeLessThanOrEqual(OHNE_GROESSE_RATSCHE);
  });

  it('BL-272: der Rot-Fall ist belegt — eine Regel ohne Größe wird gefunden, eine mit nicht', () => {
    // Genau die Form der `✎`-Bearbeiten-Fläche vor BL-273 (padding, aber keine Größe)
    // gegen dieselbe Regel mit `.stb-btn`-Vertrag.
    const ohne = findControlsWithoutSize();
    expect(ohne.length).toBeGreaterThan(0);
    expect(ohne.some((f) => /edit-btn|__btn/.test(f.selector))).toBe(true);
  });

  it('erkennt einen Verstoß überhaupt (Selbsttest — ein Wächter, dessen Rot-Fall nie lief, ist unbelegt)', () => {
    // Genau die Form, die `UndoControls` hatte, bevor ADR-v9-155 sie behob.
    const tokens = designTokens();
    const probe = `<style>\n.foo__btn { min-width: 2.2rem; }\n</style>`;
    const rule = /([^{}]+)\{([^{}]*)\}/.exec(/<style[^>]*>([\s\S]*?)<\/style>/.exec(probe)![1])!;
    expect(rule[1].trim()).toBe('.foo__btn');
    expect(toPx(/min-width\s*:\s*([^;]+);/.exec(rule[2])![1], tokens)).toBeCloseTo(35.2, 1);
    expect(toPx('2.2rem', tokens)! < touchTargetPx()).toBe(true);
  });

  it('BL-282: `line-height` beantwortet die Größenfrage NICHT (Wortgrenze, Selbsttest)', () => {
    expect(SETS_SIZE.test('padding: 0; line-height: 1;')).toBe(false);
    expect(SETS_SIZE.test('padding: 0; min-height: 44px;')).toBe(true);
    expect(SETS_SIZE.test('height: 2rem;')).toBe(true);
  });

  it('BL-282: ein Kommentar neben einer Regel macht sie nicht zum Bedienelement (Selbsttest)', () => {
    expect(selectorOf('/* Der Button daneben … */ .foo__notice')).toBe('.foo__notice');
    expect(CONTROL.test(selectorOf('/* Der Button daneben … */ .foo__notice'))).toBe(false);
  });
});
