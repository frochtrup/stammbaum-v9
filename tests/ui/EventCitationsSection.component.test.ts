// @vitest-environment happy-dom
// tests/ui/EventCitationsSection.component.test.ts — die Quellen-Sektion des Ereignis-
// Editors, hier vor allem als Fläche der Quellreferenz-Zwischenablage (BL-234).
//
// Geprüft wird die Naht, nicht die Ablage selbst (die hat ihren eigenen Unit-Test):
// (a) das ⧉ je Zeile füllt die Ablage mit der VOLLSTÄNDIGEN Zitation, (b) der Übernehmen-Chip
// erscheint erst DANN und hängt eine neue Zitation an, (c) er trägt seinen Ausgang
// (Ablage leeren), (d) ohne Ablage-Prop bleibt die Fläche unverändert (kein neues
// Dauer-Bedienelement, INV-UI-11).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import EventCitationsSection from '../../ui/shell/EventCitationsSection.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createCitationClipboard } from '../../ui/shell/citation-clipboard.svelte';
import { makeDatabase, makeSource, makeCitation, citationUrl, setCitationUrl } from '../../core/model';
import { makeEvidenceEval } from '../../core/research';
import type { Citation } from '../../core/model/types';

function seedSources() {
  const appState = createAppState();
  const db = makeDatabase();
  db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Musterdorf' }));
  db.sources.set('@S2@', makeSource('@S2@', { abbr: 'StA Musterstadt' }));
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

describe('EventCitationsSection — Quellreferenz-Zwischenablage (BL-234)', () => {
  it('ohne Ablage-Prop gibt es weder ⧉ noch Übernehmen-Chip', () => {
    const appState = seedSources();
    render(EventCitationsSection, {
      props: {
        appState,
        citations: [makeCitation('@S1@', { page: '12' })],
        labelPrefix: 'Geburt (BIRT)',
        onChange: vi.fn(),
      },
    });

    expect(screen.queryByLabelText(/in die Ablage kopieren/)).toBeNull();
    expect(screen.queryByText(/Übernehmen/)).toBeNull();
  });

  it('⧉ legt ALLE Angaben ab; der Übernehmen-Chip erscheint erst danach', async () => {
    const appState = seedSources();
    const citationClipboard = createCitationClipboard();
    render(EventCitationsSection, {
      props: {
        appState,
        citations: [
          setCitationUrl(
            makeCitation('@S1@', { page: 'fol. 3', quay: 3, note: 'Randbemerkung' }),
            'https://example.org/kb/3',
          ),
        ],
        labelPrefix: 'Geburt (BIRT)',
        citationClipboard,
        onChange: vi.fn(),
      },
    });

    // Vorher: die Ablage ist leer, also gibt es keinen Einfüge-Weg (INV-UI-11).
    expect(screen.queryByText(/Übernehmen/)).toBeNull();

    await fireEvent.click(screen.getByLabelText('Geburt (BIRT) Quelle 1 in die Ablage kopieren'));

    expect(citationClipboard.value?.sourceId).toBe('@S1@');
    expect(citationClipboard.value?.page).toBe('fol. 3');
    expect(citationClipboard.value?.quay).toBe(3);
    expect(citationClipboard.value?.note).toBe('Randbemerkung');
    expect(citationUrl(citationClipboard.value!)).toBe('https://example.org/kb/3');
    // Die Beschriftung nennt, was die Fundstelle IDENTIFIZIERT — nach ein paar Minuten
    // ist „KB" allein nicht mehr erratbar (Lehre der Ereignis-Ablage) — und „↗" sagt,
    // dass der Weblink dabei ist, statt ihn still mitzunehmen.
    expect(citationClipboard.label).toBe('KB Musterdorf · fol. 3 ↗');
    expect(screen.getByText(/📋 Übernehmen: KB Musterdorf · fol\. 3 ↗/)).toBeTruthy();
  });

  it('Übernehmen hängt eine Zitation mit ALLEN Angaben an — samt `grampsId`', async () => {
    const appState = seedSources();
    const citationClipboard = createCitationClipboard();
    const abgelegt = setCitationUrl(
      makeCitation('@S2@', {
        page: '17',
        quay: 2,
        note: 'zweite Hand',
        eval: makeEvidenceEval({ source: 'derivative', information: 'secondary', evidence: 'direct' }),
        grampsId: 'C0042',
      }),
      'https://example.org/sta/17',
    );
    citationClipboard.copy(abgelegt, 'StA Musterstadt · 17 ↗');
    let next: Citation[] | null = null;

    render(EventCitationsSection, {
      props: {
        appState,
        citations: [],
        labelPrefix: 'Kindschaft',
        citationClipboard,
        onChange: (c: Citation[]) => (next = c),
      },
    });

    await fireEvent.click(screen.getByText(/📋 Übernehmen/));

    expect(next).toHaveLength(1);
    expect(next![0].sourceId).toBe('@S2@');
    expect(next![0].page).toBe('17');
    // Alles wandert mit (Nutzer-Vorgabe 2026-08-12) …
    expect(next![0].quay).toBe(2);
    expect(next![0].note).toBe('zweite Hand');
    expect(next![0].eval?.evidence).toBe('direct');
    expect(citationUrl(next![0])).toBe('https://example.org/sta/17');
    expect(next![0].deepLinkUrl).toBe('https://example.org/sta/17');
    // … auch `grampsId`: ein `<citation>` ist in GRAMPS ein GETEILTER Record, dieselbe
    // Fundstelle an einem zweiten Ereignis ist dort EIN Record mit zwei Besitzern. Eine
    // frische id wäre eine Dublette in der Datei (Nutzer-Vorgabe 2026-08-12).
    expect(next![0].grampsId).toBe('C0042');
    // Und die eingefügte Zitation teilt keine Unterobjekte mit der Ablage.
    expect(next![0].media[0]).not.toBe(citationClipboard.value!.media[0]);

    // Die Ablage bleibt gefüllt: derselbe Beleg wird typischerweise mehrfach gebraucht.
    expect(citationClipboard.value?.sourceId).toBe('@S2@');
    expect(citationClipboard.value?.page).toBe('17');
  });

  it('der Chip trägt seinen Ausgang — „leeren" nimmt den Einfüge-Weg wieder weg', async () => {
    const appState = seedSources();
    const citationClipboard = createCitationClipboard();
    citationClipboard.copy(makeCitation('@S1@', { page: '12' }), 'KB Musterdorf · 12');

    render(EventCitationsSection, {
      props: {
        appState,
        citations: [],
        labelPrefix: 'Geburt (BIRT)',
        citationClipboard,
        onChange: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByLabelText('Quellen-Ablage leeren'));

    expect(citationClipboard.value).toBeNull();
    expect(screen.queryByText(/Übernehmen/)).toBeNull();
  });

  it('eine Zitation ohne Seite und ohne Weblink wird mit dem reinen Quellennamen beschriftet', async () => {
    const appState = seedSources();
    const citationClipboard = createCitationClipboard();
    render(EventCitationsSection, {
      props: {
        appState,
        citations: [makeCitation('@S1@')],
        labelPrefix: 'Geburt (BIRT)',
        citationClipboard,
        onChange: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByLabelText('Geburt (BIRT) Quelle 1 in die Ablage kopieren'));

    expect(citationClipboard.label).toBe('KB Musterdorf');
    expect(citationClipboard.value?.page).toBe('');
    expect(citationUrl(citationClipboard.value!)).toBe('');
  });
});

describe('EventCitationsSection — die eingefügte Zeile löst sich beim ersten Edit (BL-234)', () => {
  /** Rendert die Sektion mit gefüllter Ablage; die gemeldete Liste wird per `rerender`
   *  zurückgegeben (die Test-Datei kann kein `$state` halten — Runes gibt es nur in
   *  `.svelte`/`.svelte.ts`). Der `rerender` behält die Komponenten-INSTANZ und damit
   *  ihren lokalen Zustand — genau das, worauf die Ablösung beruht. */
  function aufbau(start: Citation[] = []) {
    const appState = seedSources();
    const citationClipboard = createCitationClipboard();
    citationClipboard.copy(
      makeCitation('@S2@', { page: '17', grampsId: 'C0042' }),
      'StA Musterstadt · 17',
    );
    let letzte: Citation[] = start;
    const props = {
      appState,
      citations: start,
      labelPrefix: 'Geburt (BIRT)',
      citationClipboard,
      onChange: (c: Citation[]) => (letzte = c),
    };
    const view = render(EventCitationsSection, { props });
    const uebernehmen = async () => {
      await view.rerender({ ...props, citations: letzte });
    };
    return { view, props, letzte: () => letzte, uebernehmen };
  }

  it('behält die `grampsId`, solange die eingefügte Zeile unverändert bleibt', async () => {
    const { letzte } = aufbau();
    await fireEvent.click(screen.getByText(/📋 Übernehmen/));
    expect(letzte()[0].grampsId).toBe('C0042');
  });

  it('gibt die `grampsId` ab, sobald die eingefügte Zeile geändert wird', async () => {
    const { letzte, uebernehmen } = aufbau();
    await fireEvent.click(screen.getByText(/📋 Übernehmen/));
    await uebernehmen();

    await fireEvent.change(screen.getByLabelText('Geburt (BIRT) Seite 1'), {
      target: { value: '18' },
    });

    expect(letzte()[0].page).toBe('18');
    // Ohne das schriebe der Seiten-Edit den GETEILTEN Record um — und damit die Zeile,
    // aus der kopiert wurde.
    expect(letzte()[0].grampsId).toBeNull();
  });

  it('lässt eine BESTEHENDE (nicht eingefügte) Zeile ihre `grampsId` behalten', async () => {
    const { letzte } = aufbau([makeCitation('@S1@', { page: '5', grampsId: 'C0007' })]);

    await fireEvent.change(screen.getByLabelText('Geburt (BIRT) Seite 1'), {
      target: { value: '6' },
    });

    // Eine geteilte Zitation zu ändern heißt in GRAMPS, sie für alle Besitzer zu ändern —
    // das ist die Semantik der Datei, nicht ein Versehen dieser Fläche.
    expect(letzte()[0].page).toBe('6');
    expect(letzte()[0].grampsId).toBe('C0007');
  });
});
