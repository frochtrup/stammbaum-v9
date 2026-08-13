// tests/ui/status-notice-kanaele.test.ts — EIN Baustein für transiente Rückmeldungen
// (Spec 21 §6, INV-UI-4, BL-334, ADR-v9-247/-250).
//
// DER BEFUND, DER IHN AUSLÖSTE. `StatusNotice` entstand als Bugfix an EINER Meldung, die
// nicht mehr verschwand (ADR-v9-247). Beim Zählen fielen daneben 14 handgebaute Fassungen
// desselben Musters auf — `let notice = $state('')`, eine eigene `__notice`-CSS-Regel,
// und in den meisten weder Frist noch Ausgang. Sie wurden bewusst nicht im selben Zug
// umgebaut; das holt BL-334 nach. Ohne Wächter wäre die 15. Fassung nur eine Frage der
// Zeit — genau so ist die 14. entstanden.
//
// WAS GEPRÜFT WIRD, in drei Armen:
//  (1) Keine Komponente zeichnet eine eigene Meldungs-Optik (`…__notice`/`__meldung`/
//      `__hinweis`/`__toast`). Das war das sichtbare Merkmal aller 14.
//  (2) Jeder Meldungs-Kanal (`let …notice/meldung/hinweis = $state('')`) geht durch den
//      Baustein. Ein Kanal ohne ihn ist ein Kanal ohne Frist.
//  (3) Jede angesagte Statuszeile (`role="status"`) außerhalb des Bausteins steht
//      namentlich unten — mit dem Grund, warum sie KEINE transiente Meldung ist.
//
// AUSDRÜCKLICH NICHT GEPRÜFT: `role="alert"`. Ein Feldfehler („Datum nicht lesbar") sagt
// aus, dass eine Eingabe ungültig IST — er darf nicht nach 12 s verschwinden, sondern
// erst, wenn die Eingabe stimmt. Das ist eine andere Sache als eine Rückmeldung auf eine
// Handlung, und der Baustein wäre dort die falsche Antwort. Die drei Fundstellen
// (`grenzFehler` in `HofDetail`, `PlaceNamesSection`, `PlaceEnclosureEditModal`) tragen
// diese Begründung im Code, wie es die Fertig-Bedingung von BL-334 verlangt. Ein Wächter,
// der so täte, als sei das mit erledigt, wäre schlimmer als seine benannte Grenze.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WURZEL = fileURLToPath(new URL('../..', import.meta.url));
/** Alle drei Programm-Wurzeln: der Orte-Editor ist ein eigenes Programm, aber kein
 *  eigenes Meldungs-Muster (INV-UI-4 hört nicht an der Bundle-Grenze auf). */
const WURZELN = ['ui', 'app', 'app-orte'];
const BAUSTEIN = 'ui/shell/StatusNotice.svelte';

function svelteDateien(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...svelteDateien(p));
    else if (name.endsWith('.svelte')) out.push(p);
  }
  return out;
}

const dateien = WURZELN.flatMap((w) => svelteDateien(join(WURZEL, w))).map((p) => ({
  rel: p.slice(WURZEL.length).replace(/\\/g, '/'),
  src: readFileSync(p, 'utf8'),
}));

/**
 * Angesagte Statuszeilen, die KEINE transiente Meldung sind — je Eintrag der Grund.
 * RATSCHE: diese Liste wird nicht länger. Wer eine Rückmeldung auf eine Handlung zeigen
 * will, nimmt den Baustein; wer hier etwas einträgt, behauptet, eine Dauer-Anzeige zu
 * bauen, und muss das im Code begründen können.
 */
const DAUERANZEIGEN: Record<string, string> = {
  'ui/shell/OfflineIndicator.svelte': 'Verbindungszustand — gilt, solange er gilt, nicht 12 s',
  'ui/shell/UpdateBanner.svelte': 'steht, bis die neue Fassung übernommen wurde',
  'ui/views/export/ExportView.svelte': 'Zähler „N von M geschwärzt" — Zustand der Auswahl, keine Rückmeldung',
  'ui/views/map/MapLensView.svelte': 'Offline-Banner der Karte — Zustand der Kachelquelle',
  'ui/views/timeline/TimelineLensView.svelte': 'fester Hinweis zum gewählten Modus, kein Ereignis',
};

/** Eigene Meldungs-Optik: genau das Merkmal, an dem die 14 Eigenbauten erkennbar waren. */
const EIGENE_OPTIK = /\.[a-z0-9-]+__(notice|meldung|hinweis|toast)\s*(?=[,{:])/gi;

/** Ein Meldungs-Kanal: eine leere Zeichenkette als Zustand, benannt wie eine Meldung. */
const KANAL = /let\s+([A-Za-z_$][\w$]*(?:otice|eldung|inweis))\s*=\s*\$state\(\s*''\s*\)/g;

function styleBlock(src: string): string {
  return /<style[^>]*>([\s\S]*?)<\/style>/.exec(src)?.[1] ?? '';
}

describe('BL-334 — transiente Rückmeldungen kommen aus `StatusNotice`', () => {
  it('der Baustein trägt Text, Frist und Ausgang (sonst löst die Umstellung nichts)', () => {
    const src = dateien.find((d) => d.rel === BAUSTEIN)?.src ?? '';
    expect(src).toMatch(/setTimeout\(onDismiss, dauerMs\)/);
    expect(src).toMatch(/aria-label="Hinweis schließen"/);
    expect(src).toMatch(/role="status"/);
    // Zwei Lagen aus einer Quelle: eigene Fläche (Schale) und Flex-Item neben dem Knopf.
    expect(src).toMatch(/lage\s*=\s*'zeile'/);
  });

  it('keine Komponente zeichnet eine eigene Meldungs-Optik', () => {
    const treffer = dateien
      .filter((d) => d.rel !== BAUSTEIN)
      .flatMap((d) => [...styleBlock(d.src).matchAll(EIGENE_OPTIK)].map((m) => `${d.rel}: ${m[0].trim()}`));
    expect(treffer, 'Meldungs-Optik gehört in StatusNotice, nicht in die Komponente').toEqual([]);
  });

  it('jeder Meldungs-Kanal geht durch den Baustein', () => {
    const offen: string[] = [];
    for (const d of dateien) {
      if (d.rel === BAUSTEIN) continue;
      for (const m of d.src.matchAll(KANAL)) {
        const name = m[1];
        const durchgereicht = new RegExp(String.raw`<StatusNotice[\s\S]{0,400}?text=\{\s*${name}\s*\}`).test(d.src);
        if (!durchgereicht) offen.push(`${d.rel}: ${name}`);
      }
    }
    // Wäre die Menge leer, prüfte dieser Test nichts (Reflex 5 aus CLAUDE.md).
    const gezaehlt = dateien.flatMap((d) => [...d.src.matchAll(KANAL)]).length;
    expect(gezaehlt).toBeGreaterThan(10);
    expect(offen, 'ein Kanal ohne StatusNotice ist ein Kanal ohne Frist').toEqual([]);
  });

  it('jede angesagte Statuszeile außerhalb des Bausteins ist eine begründete Dauer-Anzeige', () => {
    const gefunden = dateien.filter((d) => d.rel !== BAUSTEIN && /role="status"/.test(d.src)).map((d) => d.rel);
    // Die Ratsche: keine neuen Einträge. Gleichheit statt `toContain` — sonst wüchse die
    // Liste unbemerkt mit, und ein toter Eintrag bliebe unbemerkt stehen.
    expect(gefunden.sort()).toEqual(Object.keys(DAUERANZEIGEN).sort());
  });
});
