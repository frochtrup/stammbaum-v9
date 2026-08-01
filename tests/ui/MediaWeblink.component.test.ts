// @vitest-environment happy-dom
// tests/ui/MediaWeblink.component.test.ts — BL-256/ADR-v9-187: der häufigste Medien-Fall
// des Realbestands (1968 von 2198 FILE-Werten sind Weblinks, 452 verschiedene) war in der
// Medienverwaltung eine tote Zeichenkette, obwohl derselbe Wert an der Quellen-Pille
// längst ein klickbares ↗ trug.
//
// Der zweite Teil ist der WÄCHTER: ein Weblink wird VERLINKT, nie GELADEN. Ohne ihn wäre
// die naheliegende „Verbesserung" (Thumbnail vom fremden Host holen) jederzeit möglich —
// und würde beim Öffnen der Galerie tausende Anfragen an matricula & Co. auslösen, das
// Offline-Versprechen (LP-2) brechen und an der CSP scheitern.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import MediaDetail from '../../ui/views/media/MediaDetail.svelte';
import MediaGallery from '../../ui/views/media/MediaGallery.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makeMedia, makeMediaCitation, makePerson } from '../../core/model';

const URL_A = 'https://data.matricula-online.eu/de/deutschland/muenster/x/';
const URL_B = 'https://www.archion.de/p/abcdef/';

function seeded() {
  const appState = createAppState();
  const viewState = createViewState();
  const db = makeDatabase();
  db.media.set(URL_A, makeMedia(URL_A, { title: 'Taufbuch 1820' }));
  db.media.set(URL_B, makeMedia(URL_B));
  db.media.set('Pictures/anna.jpg', makeMedia('Pictures/anna.jpg', { title: 'Anna' }));
  db.media.set('Documents/urkunde.pdf', makeMedia('Documents/urkunde.pdf', { title: 'Urkunde' }));
  const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
  p.media.push(makeMediaCitation(URL_A));
  p.media.push(makeMediaCitation('Pictures/anna.jpg'));
  db.individuals.set('@I1@', p);
  appState.loadDatabase(db, 'test.ged');
  return { appState, viewState };
}

function detailProps() {
  return {
    onNavigateToPerson: vi.fn(),
    onNavigateToFamily: vi.fn(),
    onNavigateToSource: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MediaDetail — Weblink wird aufgelöst', () => {
  it('rendert einen anklickbaren Link mit dem Host als Kurztext', () => {
    const { appState, viewState } = seeded();
    viewState.setCurrent('media', URL_A);
    render(MediaDetail, { props: { appState, viewState, ...detailProps() } });

    const link = screen.getByRole('link', { name: /data\.matricula-online\.eu/ });
    expect(link.getAttribute('href')).toBe(URL_A);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('beschriftet die Zeile als „Fundort", nicht als „Datei"', () => {
    const { appState, viewState } = seeded();
    viewState.setCurrent('media', URL_A);
    render(MediaDetail, { props: { appState, viewState, ...detailProps() } });
    expect(screen.getByText('Fundort')).toBeTruthy();
    expect(screen.queryByText('Datei')).toBeNull();
  });

  it('zeigt bei einem Dateipfad weiter „Datei" und KEINEN Link', () => {
    const { appState, viewState } = seeded();
    viewState.setCurrent('media', 'Pictures/anna.jpg');
    render(MediaDetail, { props: { appState, viewState, ...detailProps() } });
    expect(screen.getByText('Datei')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('WÄCHTER: ein Weblink wird verlinkt, nie geladen (LP-2/CSP)', () => {
  it('MediaDetail stellt keine Netzanfrage und rendert kein <img> auf einen fremden Host', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { appState, viewState } = seeded();
    viewState.setCurrent('media', URL_A);
    const { container } = render(MediaDetail, { props: { appState, viewState, ...detailProps() } });

    expect(fetchSpy).not.toHaveBeenCalled();
    for (const img of container.querySelectorAll('img')) {
      expect(img.getAttribute('src') ?? '').not.toMatch(/^https?:/i);
    }
    vi.unstubAllGlobals();
  });

  it('MediaGallery stellt keine Netzanfrage und rendert kein <img> auf einen fremden Host', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { appState, viewState } = seeded();
    const { container } = render(MediaGallery, { props: { appState, viewState } });

    // ERST auf die Weblink-Facette schalten — sonst prüft der Wächter eine Galerie, in
    // der gar keine Weblink-Kachel steht (Vorauswahl „Dateien"), und bliebe auch dann
    // grün, wenn die Kachel ein <img src="https://…"> renderte. Genau das ist beim Bau
    // passiert: die erste Fassung dieses Tests überlebte die Rot-Probe.
    screen.getByRole('button', { name: /Weblinks/ }).click();
    await tick();
    expect(screen.getByText('Taufbuch 1820')).toBeTruthy();

    expect(fetchSpy).not.toHaveBeenCalled();
    for (const img of container.querySelectorAll('img')) {
      expect(img.getAttribute('src') ?? '').not.toMatch(/^https?:/i);
    }
    vi.unstubAllGlobals();
  });
});

describe('MediaGallery — Art-Facette im DOM', () => {
  it('startet auf „Dateien": Weblink-Kacheln sind nicht vorausgewählt, ihre Zahl steht offen', () => {
    const { appState, viewState } = seeded();
    render(MediaGallery, { props: { appState, viewState } });

    // Vorauswahl greift: die zwei Dateien sind da, die zwei Weblinks nicht.
    expect(screen.getByText('Anna')).toBeTruthy();
    expect(screen.getByText('Urkunde')).toBeTruthy();
    expect(screen.queryByText('Taufbuch 1820')).toBeNull();

    // Ausgeblendet ist nicht versteckt — der Chip trägt seinen Zähler.
    const chip = screen.getByRole('button', { name: /Weblinks/ });
    expect(chip.textContent).toMatch(/2/);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('ein Klick auf „Weblinks" zeigt sie — mit Host-Kurztext statt rohem URL-Text', async () => {
    const { appState, viewState } = seeded();
    render(MediaGallery, { props: { appState, viewState } });
    const chip = screen.getByRole('button', { name: /Weblinks/ });
    chip.click();
    await Promise.resolve();

    expect(screen.getByText('Taufbuch 1820')).toBeTruthy();
    expect(screen.getByText(/data\.matricula-online\.eu/)).toBeTruthy();
  });

  // --- ADR-v9-192: beide Reihen wirken additiv --------------------------------
  it('„Weblinks" dazuwählen ERSETZT „Dateien" nicht — beide Arten stehen danach nebeneinander', async () => {
    const { appState, viewState } = seeded();
    render(MediaGallery, { props: { appState, viewState } });
    screen.getByRole('button', { name: /Weblinks/ }).click();
    await Promise.resolve();

    // Genau das war vorher unmöglich: der Tipp auf Weblinks verwarf die Dateien.
    expect(screen.getByText('Taufbuch 1820')).toBeTruthy();
    expect(screen.getByText('Anna')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Dateien/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Weblinks/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('derselbe Chip nochmal = wieder abgewählt; „Alle" leert die Auswahl', async () => {
    const { appState, viewState } = seeded();
    render(MediaGallery, { props: { appState, viewState } });
    const weblinks = () => screen.getByRole('button', { name: /Weblinks/ });

    weblinks().click();
    await Promise.resolve();
    weblinks().click();
    await Promise.resolve();
    expect(weblinks().getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText('Taufbuch 1820')).toBeNull();

    // „Alle" ist kein dritter Wert, sondern das Leeren — danach ist KEIN Art-Chip gedrückt.
    screen.getAllByRole('button', { name: /^Alle/ })[0].click();
    await Promise.resolve();
    expect(screen.getByRole('button', { name: /Dateien/ }).getAttribute('aria-pressed')).toBe('false');
    expect(weblinks().getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Taufbuch 1820')).toBeTruthy();
    expect(screen.getByText('Anna')).toBeTruthy();
  });
});
