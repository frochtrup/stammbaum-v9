// @vitest-environment happy-dom
// tests/ui/grenz-eingabe-flaechen.test.ts — die Perioden-Grenze wird an ALLEN Flächen
// gleich gelesen (BL-331, ADR-v9-243/-245).
//
// WARUM DIESE DATEI. `grenz-feld.ts` beschreibt sich selbst als „EIN Mechanismus für
// beide Flächen (INV-UI-4)" und meinte damit `PlaceNamesSection` + `PlaceEnclosureEditModal`.
// Es gibt aber eine DRITTE datierte Liste — die Adressvarianten eines Hofes
// (`DatedAddress`, Spec 11 §1) —, und die blieb beim Bau der Tagesgenauigkeit auf
// `<input type="number">` + `Number(raw)` stehen: ein Stichtag war dort nicht eingebbar,
// und der Kern-Pfad hätte ihn verworfen. Genau die Geschwister-Lücke, die CLAUDE.md als
// eigene Fehlerklasse führt („ein Fix ist erst fertig, wenn ALLE strukturgleichen Stellen
// mitgezogen sind").
//
// DER WÄCHTER AM ENDE ist der eigentliche Zweck: er stellt die Frage an JEDE künftige
// Fläche, die eine Periode schreibt, statt darauf zu hoffen, dass jemand diese Datei
// liest (Vorbild: `place-ref-integrity.test.ts`, ADR-v9-83 — Zwang schlägt Dokumentation).
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/svelte';
import HofDetail from '../../ui/views/hof/HofDetail.svelte';
import PlaceDetail from '../../ui/views/place/PlaceDetail.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase } from '../../core/model';
import { place, hof } from '../core/places-fixtures';
import { pinLayout } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';

let unpin: () => void;
beforeEach(() => {
  unpin = pinLayout(false);
});
afterEach(() => {
  unpin();
  layout.reset();
});

function hofSteckbriefImBearbeitenModus() {
  const appState = createAppState();
  const db = makeDatabase();
  db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
  db.hofObjects.set(
    '@H1@',
    hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: 1800, to: null, fromDate: null, toDate: null }] }),
  );
  appState.loadDatabase(db, 'test.ged');
  const viewState = createViewState();
  viewState.setCurrent('hof', '@H1@');
  render(HofDetail, { props: { appState, viewState } });
  return appState;
}

const adressen = (appState: ReturnType<typeof createAppState>) => appState.db.hofObjects.get('@H1@')!.addrs;

describe('Hof-Adressvarianten — Grenz-Eingabe wie an den beiden Orts-Flächen (BL-331)', () => {
  it('nimmt an einer bestehenden Zeile einen Stichtag und setzt Jahr UND Tag', async () => {
    const appState = hofSteckbriefImBearbeitenModus();
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));

    const von = screen.getByLabelText('Gültig von Zeile 1 (Jahr oder Stichtag)') as HTMLInputElement;
    await fireEvent.change(von, { target: { value: '8 MAY 1945' } });

    // Beide Hälften, nicht nur der Tag: Spec 11 §1 verlangt, dass `from` aus `fromDate`
    // ableitbar ist und dazu passt (bewacht von grenzen-kongruenz.test.ts).
    expect(adressen(appState)[0].fromDate).toBe('8 MAY 1945');
    expect(adressen(appState)[0].from).toBe(1945);
  });

  it('nimmt weiterhin eine nackte Jahreszahl (kein Zwang zur Scheingenauigkeit)', async () => {
    const appState = hofSteckbriefImBearbeitenModus();
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));

    const bis = screen.getByLabelText('Gültig bis Zeile 1 (Jahr oder Stichtag)') as HTMLInputElement;
    await fireEvent.change(bis, { target: { value: '1899' } });

    expect(adressen(appState)[0].to).toBe(1899);
    expect(adressen(appState)[0].toDate).toBeNull();
  });

  it('lehnt Unlesbares ab, statt die Periode still zu leeren — das Feld springt zurück', async () => {
    const appState = hofSteckbriefImBearbeitenModus();
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));

    const von = screen.getByLabelText('Gültig von Zeile 1 (Jahr oder Stichtag)') as HTMLInputElement;
    await fireEvent.change(von, { target: { value: 'xyz' } });

    expect(adressen(appState)[0].from).toBe(1800);
    expect(von.value).toBe('1800');
  });

  it('nimmt einen Stichtag auch in der Hinzufügen-Zeile', async () => {
    const appState = hofSteckbriefImBearbeitenModus();
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));

    await fireEvent.input(screen.getByLabelText('Neue Adressvariante'), { target: { value: 'Wall 35' } });
    await fireEvent.input(screen.getByLabelText('Gültig von (Jahr oder Stichtag)'), {
      target: { value: '1. Oktober 1810' },
    });
    await fireEvent.click(screen.getByText('+ Hinzufügen'));

    const neu = adressen(appState).find((a) => a.value === 'Wall 35');
    expect(neu?.fromDate).toBe('1 OCT 1810');
    expect(neu?.from).toBe(1810);
  });

  it('meldet eine unlesbare Grenze in der Hinzufügen-Zeile, statt sie stumm zu schlucken', async () => {
    const appState = hofSteckbriefImBearbeitenModus();
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));

    await fireEvent.input(screen.getByLabelText('Neue Adressvariante'), { target: { value: 'Wall 35' } });
    await fireEvent.input(screen.getByLabelText('Gültig von (Jahr oder Stichtag)'), { target: { value: 'xyz' } });
    await fireEvent.click(screen.getByText('+ Hinzufügen'));

    expect(adressen(appState).some((a) => a.value === 'Wall 35')).toBe(false);
    expect(screen.getByText(/nicht lesbar/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------
// Die ANZEIGE-Hälfte: ein kuratierter Stichtag, den nur das Eingabefeld kennt, ist für
// den Leser nicht vorhanden („ist es SICHTBAR?", nicht „ist es gespeichert?").
describe('Leseansicht — der kuratierte Stichtag ist sichtbar, nicht nur gespeichert', () => {
  it('schreibt ihn an der Hof-Adresszeile aus', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set(
      '@H1@',
      hof('@H1@', '@P1@', {
        addrs: [{ value: 'Wall 33', from: 1945, to: null, fromDate: '8 MAY 1945', toDate: null }],
      }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    render(HofDetail, { props: { appState, viewState } });

    expect(screen.getByText('(ab 8. Mai 1945)')).toBeTruthy();
  });

  it('schreibt ihn an der Orts-Namensvariante aus', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Chocianów',
        pnames: [{ value: 'Kotzenau', from: 1400, to: 1945, fromDate: null, toDate: '8 MAY 1945' }],
      }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });

    expect(screen.getByText('1400–8. Mai 1945')).toBeTruthy();
  });

  it('lässt die reine Jahresform unverändert (kein Zwang zur Scheingenauigkeit)', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Ochtrup',
        pnames: [{ value: 'Ochtorf', from: 1400, to: 1700, fromDate: null, toDate: null }],
      }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });

    expect(screen.getByText('1400–1700')).toBeTruthy();
  });

  it('reicht den Stichtag in die Bearbeiten-Zeile zurück — und verliert die Gegengrenze nicht', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Chocianów',
        pnames: [{ value: 'Kotzenau', from: 1400, to: 1945, fromDate: null, toDate: '8 MAY 1945' }],
      }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));

    // Die Zeile zeigt den gespeicherten Stichtag — bis BL-331 schnitt die
    // Projektion (`PlaceVariantRow`) ihn ab und zeigte „1945".
    const bis = screen.getByLabelText('Namensvariante 1 — gültig bis (Jahr oder Stichtag)') as HTMLInputElement;
    expect(bis.value).toBe('8 MAY 1945');

    // Und ein Edit an der ANDEREN Grenze darf ihn nicht mitnehmen: die Gegengrenze wird
    // aus dem Feldtext zurückgelesen, und der Feldtext ist erst seit dieser Zeile der Tag.
    const von = screen.getByLabelText('Namensvariante 1 — gültig von (Jahr oder Stichtag)') as HTMLInputElement;
    await fireEvent.change(von, { target: { value: '1410' } });

    const pn = appState.db.placeObjects.get('@P1@')!.pnames[0];
    expect(pn.from).toBe(1410);
    expect(pn.toDate).toBe('8 MAY 1945');
    expect(pn.to).toBe(1945);
  });
});

// ---------------------------------------------------------------------------------------
// Der Wächter: wer eine Periode SCHREIBT, liest ihre Grenze über den gemeinsamen Weg.
// Er ersetzt die Erinnerung durch eine Frage, die bei jedem `npm test` gestellt wird.
describe('Wächter: alle Flächen, die eine Periode schreiben, nutzen EINEN Lesepfad (INV-UI-4)', () => {
  /** Kommandos, deren Aufruf eine `{from,to}`-Grenze aus einem Eingabefeld setzt. */
  const SCHREIBT_PERIODE = /withAddedPname|withUpdatedPname|withAddedHofAddr|updateHofAddr|updateEnclosedBySpan|addEnclosedBy/;
  /** Der gemeinsame Lesepfad (Feld-Variante bzw. Roh-Variante für Hinzufügen-Zeilen). */
  const LIEST_GRENZE = /grenzeAusFeld|grenzeAusEingabe/;

  /**
   * Der Quelltext OHNE Kommentare. Ohne diesen Schritt schlug der Wächter auf
   * `HofEditForm.svelte` an, die `updateHofAddr` nur ERWÄHNT (Verweis auf die
   * Geschwister-Fläche) — ein Wächter, der Prosa für Code hält, wird abgeschaltet.
   */
  function codeVon(pfad: string): string {
    let imBlock = false;
    return readFileSync(pfad, 'utf8')
      .split('\n')
      .filter((zeile) => {
        const t = zeile.trim();
        if (imBlock) {
          if (t.includes('-->') || t.includes('*/')) imBlock = false;
          return false;
        }
        if (t.startsWith('<!--') || t.startsWith('/*')) {
          imBlock = !(t.includes('-->') || t.endsWith('*/'));
          return false;
        }
        return !t.startsWith('//') && !t.startsWith('*');
      })
      .join('\n');
  }

  function svelteDateien(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) svelteDateien(p, out);
      else if (e.name.endsWith('.svelte')) out.push(p);
    }
    return out;
  }

  it('kennt keine Fläche, die eine Periode ohne den gemeinsamen Lesepfad schreibt', () => {
    const dateien = svelteDateien(join(__dirname, '../../ui'));
    // Ohne diese Zählung liefe die Prüfung bei einem Pfad-Vertipper über eine leere
    // Menge und wäre grün, ohne etwas geprüft zu haben (ADR-v9-200).
    expect(dateien.length).toBeGreaterThan(20);

    const luecken = dateien.filter((p) => {
      const text = codeVon(p);
      return SCHREIBT_PERIODE.test(text) && !LIEST_GRENZE.test(text);
    });

    expect(luecken.map((p) => p.split('/ui/')[1])).toEqual([]);
  });

  it('kennt keine `type="number"`-Grenze mehr an diesen Flächen', () => {
    const dateien = svelteDateien(join(__dirname, '../../ui')).filter((p) =>
      SCHREIBT_PERIODE.test(codeVon(p)),
    );
    expect(dateien.length).toBeGreaterThan(0);

    for (const p of dateien) {
      const text = codeVon(p);
      // Ein Zahlenfeld nimmt „8 MAY 1945" gar nicht erst an — die Tagesgenauigkeit wäre
      // an dieser Fläche nicht eingebbar, ohne dass irgendetwas anschlüge.
      const grenzFelder = text.match(/type="number"[^>]*(placeholder="(von|bis)"|Gültig (von|bis))/gs) ?? [];
      expect({ datei: p.split('/ui/')[1], treffer: grenzFelder }).toEqual({
        datei: p.split('/ui/')[1],
        treffer: [],
      });
    }
  });
});
