// tests/ui/detail-wurzel.test.ts — BL-349: die Wurzel einer Detailansicht ist EINE Klasse.
//
// DER BEFUND (Nutzer-Bildschirmfoto 2026-08-12: „öffnet nicht in der richtigen Größe, nur
// eine Zeile"). Das Identitäts-Formular im Personen-Steckbrief war 32px hoch statt 276 —
// sichtbar blieb eine angeschnittene Zeile. Dieselbe Ursache traf `SourceForm` (32 statt
// 350) und `RepositoryForm`.
//
// DIE URSACHE war kein Formular-Fehler, sondern die Wurzel darüber. Mit BL-342/343 wurde
// der Abschnitts-Abstand von `margin` auf `gap` umgestellt (richtig — er gilt seitdem auch
// für Abschnitte in eigenen Komponenten). Damit wurde die Wurzel aber ein FLEX-Container,
// und ihre Kinder wurden schrumpfbare Flex-Items. Ein Kind mit eigenem `overflow` hat als
// automatische Mindesthöhe 0 (CSS-Flexbox §4.5) — es kann also bis auf seine Polsterung
// zusammengedrückt werden, und weil eine Detailseite regelmäßig höher ist als der
// Bildschirm, absorbierte GENAU DIESES Kind die gesamte Überlänge.
//
// WARUM ALS WÄCHTER, nicht als Kommentar: sieben Ansichten trugen dieselben fünf Zeilen
// als byte-gleiche Kopie. Genau daran ist die Klasse schon zweimal gescheitert (BL-342
// Überschrift, BL-343 Abstand): eine Kopie hält, bis jemand sie in einer Ansicht anfasst
// oder eine achte Ansicht ohne sie entsteht. Der Wächter zählt bei jedem Lauf; der
// Kommentar hängt daran, dass die nächste Sitzung ihn liest (CLAUDE.md, ADR-v9-83-Logik).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const UI = join(__dirname, '../../ui');

/** Die sieben Detailansichten. Bewusst als Liste, nicht per Glob über `*Detail.svelte`:
 *  ein neuer Name soll HIER auffallen, statt still durch das Muster zu rutschen. */
const WURZELN = [
  ['views/person/PersonDetail.svelte', 'person-detail'],
  ['views/family/FamilyDetail.svelte', 'family-detail'],
  ['views/source/SourceDetail.svelte', 'source-detail'],
  ['views/repository/RepositoryDetail.svelte', 'repository-detail'],
  ['views/place/PlaceDetail.svelte', 'place-detail'],
  ['views/hof/HofDetail.svelte', 'hof-detail'],
  ['views/media/MediaDetail.svelte', 'media-detail'],
] as const;

const lies = (p: string) => readFileSync(join(UI, p), 'utf8');

describe('Detail-Wurzel (BL-349)', () => {
  it.each(WURZELN)('%s trägt die geteilte Wurzel-Klasse', (pfad, bem) => {
    expect(lies(pfad)).toContain(`<div class="stb-detail-root ${bem}"`);
  });

  it.each(WURZELN)('%s baut das Wurzel-Layout nicht erneut', (pfad, bem) => {
    // Die Signatur der abgeschafften Kopie: der BEM-Wurzelselektor mit eigenem
    // Spalten-Flex. Eine Ansicht, die ihn zurückholt, holt auch die Schrumpf-Falle
    // zurück — `flex-shrink: 0` steht nur an der geteilten Klasse.
    const regel = new RegExp(`\\.${bem}\\s*\\{[^}]*\\}`).exec(lies(pfad))?.[0] ?? '';
    expect(regel, 'Wurzel-Layout gehört in .stb-detail-root').not.toMatch(/display:\s*flex/);
  });

  it('die geteilte Klasse hält ihre Kinder auf Inhaltshöhe', () => {
    // Der eigentliche Fix, negativ geprüft (2026-08-12): ohne diese Regel misst das
    // Identitäts-Formular im Browser 32px statt 276. Ein Test kann das nicht sehen —
    // happy-dom rechnet kein Layout —, aber er kann verhindern, dass die Zeile
    // verschwindet, weil sie „nach Aufräumen aussieht".
    const css = readFileSync(join(UI, 'shell/design-system.css'), 'utf8');
    expect(css).toMatch(/\.stb-detail-root > \*\s*\{\s*flex-shrink:\s*0;\s*\}/);
  });
});
