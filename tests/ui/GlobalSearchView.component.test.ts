// @vitest-environment happy-dom
// tests/ui/GlobalSearchView.component.test.ts — globale Suche (Spec 20 §1.1 [K],
// Spec 21 §2 "Suche ist erstklassig"). Deckt Eingabe -> gruppierte Ergebnisse -> Klick
// navigiert (über die onNavigate*-Callbacks, analog TreeView.onOpenPersonDetail) ab.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import GlobalSearchView from '../../ui/views/search/GlobalSearchView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makeFamily, makePerson, makeSource } from '../../core/model';
import { place, hof } from '../core/places-fixtures';
import {
  createGlobalSearchState,
  type GlobalSearchState,
} from '../../ui/views/search/global-search-state.svelte';
import { createWindowed } from '../../ui/shell/windowed.svelte';
import { ERSTES_FENSTER } from '../../ui/shell/window-slice';

function seedDb() {
  const db = makeDatabase();
  const husband = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
  const wife = makePerson('@I2@', { given: 'Anna', surname: 'Klein' });
  husband.parentIn.push('@F1@');
  wife.parentIn.push('@F1@');
  db.individuals.set('@I1@', husband);
  db.individuals.set('@I2@', wife);
  db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' }));
  db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Ochtrup', author: 'Pfarrer Meyer' }));
  db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' }));
  db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
  return db;
}

function renderView(db: ReturnType<typeof makeDatabase>) {
  const appState = createAppState();
  appState.loadDatabase(db, 'test.ged');
  const onNavigateToPerson = vi.fn();
  const onNavigateToFamily = vi.fn();
  const onNavigateToSource = vi.fn();
  const onNavigateToPlace = vi.fn();
  const onNavigateToHof = vi.fn();

  const utils = render(GlobalSearchView, {
    props: {
      appState,
      onNavigateToPerson,
      onNavigateToFamily,
      onNavigateToSource,
      onNavigateToPlace,
      onNavigateToHof,
    },
  });

  return { ...utils, onNavigateToPerson, onNavigateToFamily, onNavigateToSource, onNavigateToPlace, onNavigateToHof };
}

describe('GlobalSearchView — Eingabe, Mindestlänge, gruppierte Ergebnisse', () => {
  it('zeigt einen Hinweis statt Ergebnissen, solange keine Query eingegeben ist', () => {
    renderView(seedDb());
    expect(screen.getByText(/Mindestens 2 Zeichen/)).toBeTruthy();
  });

  it('zeigt weiterhin den Hinweis bei einem einzelnen Zeichen (keine Full-Scan-Suche)', async () => {
    renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'O' } });
    expect(screen.getByText(/Mindestens 2 Zeichen/)).toBeTruthy();
  });

  it('gruppiert Treffer nach Personen/Familien/Quellen/Orte/Höfe', async () => {
    renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Ochtrup' } });

    // Gruppen-Überschriften gezielt (die Typ-Filter-Chips tragen dieselben Labels, ADR-v9-130).
    expect(screen.getByRole('heading', { name: 'Quellen' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Orte' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Höfe' })).toBeTruthy();
    expect(screen.getByText('KB Ochtrup')).toBeTruthy();
    // "Ochtrup" trifft sowohl den Ort (primary) als auch den Hof (secondary: Dorf-Titel).
    expect(screen.getAllByText('Ochtrup').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Wall 33')).toBeTruthy();
  });

  it('zeigt einen Leerzustand ohne Treffer', async () => {
    renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Zimmermann' } });

    expect(screen.getByText(/Keine Treffer/)).toBeTruthy();
  });

  it('✕ löscht die Suche und kehrt zum Hinweis-Zustand zurück', async () => {
    renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Bauer' } });
    expect(screen.getByText('Otto Bauer')).toBeTruthy();

    await fireEvent.click(screen.getByLabelText('Suche löschen'));

    expect(screen.getByText(/Mindestens 2 Zeichen/)).toBeTruthy();
  });
});

describe('GlobalSearchView — Soundex-Umschalter (BL-10, ADR-v9-159)', () => {
  it('rendert einen sichtbaren, per aria-pressed umschaltbaren Soundex-Schalter', () => {
    renderView(seedDb());
    const toggle = screen.getByRole('button', { name: /Soundex/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('Soundex aus (Default): "meyer" findet NICHT den phonetisch ähnlichen "Otto Bauer"', async () => {
    // Regression-Fixture: eine weitere Person mit phonetisch ähnlichem Nachnamen zur
    // vorhandenen Seed-Datenbank hinzufügen, ohne die anderen Tests zu berühren.
    const db = seedDb();
    db.individuals.set('@I3@', makePerson('@I3@', { given: 'Karl', surname: 'Maier' }));
    renderView(db);
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'meyer' } });
    expect(screen.queryByText('Karl Maier')).toBeNull();
  });

  it('Soundex an: "meyer" findet zusätzlich "Karl Maier" (phonetisch gleich), Schalter zeigt aria-pressed=true', async () => {
    const db = seedDb();
    db.individuals.set('@I3@', makePerson('@I3@', { given: 'Karl', surname: 'Maier' }));
    renderView(db);
    const toggle = screen.getByRole('button', { name: /Soundex/ });

    await fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'meyer' } });
    expect(screen.getByText('Karl Maier')).toBeTruthy();
  });
});

describe('GlobalSearchView — Typ-Filter-Chips (ADR-v9-130)', () => {
  it('zeigt Chips (Alle + je Typ mit Zähler), sobald mindestens zwei Typen Treffer haben', async () => {
    renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Ochtrup' } });

    // "Ochtrup" trifft Quellen, Orte, Höfe → Chips erscheinen.
    expect(screen.getByRole('button', { name: /Alle 3/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Quellen 1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Orte 1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Höfe 1/ })).toBeTruthy();
  });

  it('KEINE Chips, wenn nur ein Typ Treffer hat (Filter wäre sinnlos)', async () => {
    renderView(seedDb());
    // "Meyer" (Quellen-Autor) trifft nur die Quelle.
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Meyer' } });

    expect(screen.getByText('KB Ochtrup')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Alle/ })).toBeNull();
  });

  it('ein Klick auf einen Typ-Chip scopt die Ergebnisse auf genau diesen Typ', async () => {
    renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Ochtrup' } });

    // Vorher: alle drei Gruppen-Überschriften sichtbar.
    expect(screen.getByRole('heading', { name: 'Quellen' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Orte' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Höfe' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: /Quellen 1/ }));

    // Nachher: nur noch die Quellen-Gruppe.
    expect(screen.getByRole('heading', { name: 'Quellen' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Orte' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Höfe' })).toBeNull();
  });

  it('fällt auf "Alle" zurück, wenn der gewählte Typ nach Query-Wechsel keine Treffer mehr hat', async () => {
    renderView(seedDb());
    const input = screen.getByLabelText('Global suchen');
    await fireEvent.input(input, { target: { value: 'Ochtrup' } });
    await fireEvent.click(screen.getByRole('button', { name: /Höfe 1/ }));
    expect(screen.getByRole('heading', { name: 'Höfe' })).toBeTruthy();

    // Neue Query trifft keine Höfe mehr, aber Personen + Familie ("Bauer").
    await fireEvent.input(input, { target: { value: 'Bauer' } });

    // Kein leerer Zustand: die Personen-Gruppe ist sichtbar (activeFilter fiel auf 'all').
    expect(screen.getByRole('heading', { name: 'Personen' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Höfe' })).toBeNull();
  });
});

describe('GlobalSearchView — Klick navigiert über die Navigations-Callbacks', () => {
  it('Klick auf eine Person ruft onNavigateToPerson mit der id auf', async () => {
    const { onNavigateToPerson } = renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Bauer' } });

    await fireEvent.click(screen.getByText('Otto Bauer'));

    expect(onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });

  it('Klick auf eine Familie ruft onNavigateToFamily mit der id auf', async () => {
    const { onNavigateToFamily } = renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Klein' } });

    await fireEvent.click(screen.getByText('Otto Bauer ⚭ Anna Klein'));

    expect(onNavigateToFamily).toHaveBeenCalledWith('@F1@');
  });

  it('Klick auf eine Quelle ruft onNavigateToSource mit der id auf', async () => {
    const { onNavigateToSource } = renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Ochtrup' } });

    await fireEvent.click(screen.getByText('KB Ochtrup'));

    expect(onNavigateToSource).toHaveBeenCalledWith('@S1@');
  });

  it('Klick auf einen Ort ruft onNavigateToPlace mit der id auf', async () => {
    const { onNavigateToPlace } = renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Ochtrup' } });

    // "Ochtrup" trifft auch den Hof (als Dorf-Titel-Sekundärinfo) — gezielt den
    // Ort-Primärtext (§ global-search__primary) statt eines beliebigen Texttreffers klicken.
    const placeHit = screen.getAllByText('Ochtrup').find((el) => el.className.includes('global-search__primary'))!;
    await fireEvent.click(placeHit);

    expect(onNavigateToPlace).toHaveBeenCalledWith('@P1@');
  });

  it('Klick auf einen Hof ruft onNavigateToHof mit der id auf (ADR-v9-24)', async () => {
    const { onNavigateToHof } = renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Wall 33' } });

    await fireEvent.click(screen.getByText('Wall 33'));

    expect(onNavigateToHof).toHaveBeenCalledWith('@H1@');
  });
});

// ---------------------------------------------------------------------------------------
// Die Trefferliste überlebt den Sprung auf einen Treffer (Spec 21 §5, Nutzer-Auftrag
// 2026-08-08 „in der gleichen Logik sollten auch Suchergebnisse stehen bleiben").
//
// Derselbe Weg wie beim Qualitäts-Dashboard (BL-319): setzen -> wegnavigieren (= Unmount,
// App.svelte rendert die Ziele über `{:else if}`) -> zurück -> HINSEHEN. Geprüft wird die
// gerenderte Trefferliste, nicht der Halter — gespeichert ist nicht sichtbar.
describe('GlobalSearchView — Anfrage und Filter überleben den Sprung auf einen Treffer', () => {
  function renderWith(search: GlobalSearchState, db = seedDb()) {
    const appState = createAppState();
    appState.loadDatabase(db, 'test.ged');
    return render(GlobalSearchView, {
      props: {
        appState,
        search,
        onNavigateToPerson: vi.fn(),
        onNavigateToFamily: vi.fn(),
        onNavigateToSource: vi.fn(),
        onNavigateToPlace: vi.fn(),
        onNavigateToHof: vi.fn(),
      },
    });
  }

  it('kommt mit derselben Anfrage und derselben Trefferliste zurück, nicht mit leerem Feld', async () => {
    const search = createGlobalSearchState();
    const first = renderWith(search);
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Otto' } });
    expect(screen.getByText('Otto Bauer')).toBeTruthy();
    first.unmount();

    renderWith(search);

    expect((screen.getByLabelText('Global suchen') as HTMLInputElement).value).toBe('Otto');
    expect(screen.getByText('Otto Bauer')).toBeTruthy();
    expect(screen.queryByText(/Mindestens 2 Zeichen/)).toBeNull();
  });

  it('kommt mit gesetztem Soundex-Schalter zurück (samt der nur dadurch gefundenen Treffer)', async () => {
    const db = seedDb();
    db.individuals.set('@I3@', makePerson('@I3@', { given: 'Karl', surname: 'Maier' }));
    const search = createGlobalSearchState();
    const first = renderWith(search, db);
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'meyer' } });
    await fireEvent.click(screen.getByRole('button', { name: /Soundex/ }));
    expect(screen.getByText('Karl Maier')).toBeTruthy();
    first.unmount();

    renderWith(search, db);

    expect(screen.getByRole('button', { name: /Soundex/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Karl Maier')).toBeTruthy();
  });

  it('kommt mit dem gewählten Typ-Filter zurück (Chips zeigen ihn gedrückt)', async () => {
    const search = createGlobalSearchState();
    const first = renderWith(search);
    // „Ochtrup" trifft Ort UND Hof (Wall 33 liegt in Ochtrup) — genug für die Chip-Reihe.
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Ochtrup' } });
    await fireEvent.click(screen.getByRole('button', { name: /^Orte/ }));
    expect(screen.getByRole('button', { name: /^Orte/ }).getAttribute('aria-pressed')).toBe('true');
    first.unmount();

    renderWith(search);

    expect(screen.getByRole('button', { name: /^Orte/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^Alle/ }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('GlobalSearchView — virtuelles Scrollen (BL-311, ADR-v9-236)', () => {
  /** Viele Treffer, gemischt hoch: jede dritte Person ohne Zweitzeile (keine Daten). */
  function vieleDb(n: number) {
    const db = makeDatabase();
    for (let i = 0; i < n; i++) {
      const p = makePerson(`@I${i}@`, { given: `Vorname${i}`, surname: 'Muster' });
      if (i % 3 !== 0) p.birth.date = '1 JAN 1900'; // erzeugt die Zweitzeile „* 1900"
      db.individuals.set(p.id, p);
    }
    return db;
  }

  /**
   * DIE NAHT — und ihre Grenze. happy-dom hat kein Layout, die Höhen kommen deshalb
   * gestellt ([32 TST-24](../../specs/v9/32-Testframework.md)). Diese Tests prüfen die
   * ARITHMETIK über der Messung, nicht die Messung; der Beleg, dass die Messung selbst
   * stimmt, ist der Browser-Lauf aus ADR-v9-236.
   */
  function renderGefenstert(n: number, scrollTop = 0) {
    const appState = createAppState();
    appState.loadDatabase(vieleDb(n), 'test.ged');
    const search = createGlobalSearchState();
    search.setQuery('Muster');
    const windowed = createWindowed();
    windowed.setMetrics({ viewportHeight: 800, scrollTop });
    windowed.setSectionMetrics('persons', { heights: { eins: 34, zwei: 51, kopf: 24 } });
    const utils = render(GlobalSearchView, {
      props: {
        appState,
        search,
        windowed,
        onNavigateToPerson: vi.fn(),
        onNavigateToFamily: vi.fn(),
        onNavigateToSource: vi.fn(),
        onNavigateToPlace: vi.fn(),
        onNavigateToHof: vi.fn(),
      },
    });
    return { ...utils, windowed };
  }

  it('rendert bei 2.000 Treffern nur ein Fenster, nicht die ganze Liste', () => {
    const { container } = renderGefenstert(2_000);
    const zeilen = container.querySelectorAll('.global-search__row').length;
    expect(zeilen).toBeGreaterThan(0); // sonst prüfte der Rest eine leere Menge (ADR-v9-200)
    expect(zeilen).toBeLessThan(100);
  });

  it('Platzhalter plus Fenster ergeben die volle Höhe — der Scrollbalken lügt nicht', () => {
    const n = 2_000;
    // Höhen wie oben gestellt: jede dritte Zeile 34, die übrigen 51.
    let gesamt = 0;
    for (let i = 0; i < n; i++) gesamt += i % 3 === 0 ? 34 : 51;
    for (const scrollTop of [0, 5_000, 40_000, 90_000]) {
      const { container } = renderGefenstert(n, scrollTop);
      const pads = [...container.querySelectorAll<HTMLElement>('.stb-window-pad')];
      const padSumme = pads.reduce((s, p) => s + parseFloat(p.style.height), 0);
      const fenster = [...container.querySelectorAll('.global-search__row')].length;
      // Das Fenster selbst zählt in Zeilen; seine Höhe liegt zwischen n×34 und n×51.
      expect(padSumme + fenster * 34, `scrollTop=${scrollTop}`).toBeLessThanOrEqual(gesamt);
      expect(padSumme + fenster * 51, `scrollTop=${scrollTop}`).toBeGreaterThanOrEqual(gesamt);
    }
  });

  it('ohne gemessene Höhe rendert die Fläche ein Anfangsfenster — nicht nichts, nicht alles (ADR-v9-236)', () => {
    const appState = createAppState();
    appState.loadDatabase(vieleDb(120), 'test.ged');
    const search = createGlobalSearchState();
    search.setQuery('Muster');
    const { container } = render(GlobalSearchView, {
      props: {
        appState,
        search,
        windowed: createWindowed(), // keine Messwerte gestellt — wie happy-dom ohne Naht
        onNavigateToPerson: vi.fn(),
        onNavigateToFamily: vi.fn(),
        onNavigateToSource: vi.fn(),
        onNavigateToPlace: vi.fn(),
        onNavigateToHof: vi.fn(),
      },
    });
    // happy-dom hat kein Layout, die Sonden messen 0 — genau der Zustand, in dem die Fläche
    // im Browser den ERSTEN Takt verbringt. Sie zeigt dann ein Anfangsfenster: nicht leer
    // (das sähe aus wie Datenverlust) und nicht die ganze Liste (das war die Spitze, gegen
    // die es das Fenster gibt).
    const zeilen = container.querySelectorAll('.global-search__row').length;
    expect(zeilen).toBe(ERSTES_FENSTER);
  });

  it('das Fenster wandert mit der Scroll-Position — andere Namen, gleiche Zeilenzahl', () => {
    const oben = renderGefenstert(2_000, 0);
    const obenNamen = [...oben.container.querySelectorAll('.global-search__primary')].map(
      (e) => e.textContent?.trim(),
    );
    const unten = renderGefenstert(2_000, 40_000);
    const untenNamen = [...unten.container.querySelectorAll('.global-search__primary')].map(
      (e) => e.textContent?.trim(),
    );
    expect(untenNamen.length).toBeGreaterThan(0);
    expect(untenNamen).not.toEqual(obenNamen);
    expect(untenNamen.some((n) => obenNamen.includes(n))).toBe(false);
  });
});
