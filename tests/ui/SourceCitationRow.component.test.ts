// @vitest-environment happy-dom
// tests/ui/SourceCitationRow.component.test.ts — kompakte EIN-Zeilen-Darstellung einer
// Quellen-Zitation (INV-UI-5, ersetzt das bisherige 3-Zeilen-Layout in PersonForm.svelte/
// FamilyForm.svelte). Deckt die kompakte Struktur (EINE flex-wrap-Zeile), Seite/QUAY/
// Notiz-Bearbeitung, Entfernen, Quelle wechseln über die eingebettete Picker-Shell sowie
// die Inline-Neuanlage ("+ Neue Quelle anlegen …") ab — kein <select bind:value> (TST-12).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SourceCitationRow from '../../ui/shell/SourceCitationRow.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makeSource, makeCitation, makeMediaCitation } from '../../core/model';
import { evalToQuay, makeEvidenceEval } from '../../core/research';

function seedTwoSources() {
  const appState = createAppState();
  const db = makeDatabase();
  db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Musterdorf', author: 'Pfarrer Müller' }));
  db.sources.set('@S2@', makeSource('@S2@', { abbr: 'StA Musterstadt', author: 'Standesamt' }));
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

describe('SourceCitationRow — kompakte EIN-Zeilen-Struktur', () => {
  it('rendert Quellenname, Seite, QUAY, Notiz und Entfernen-Button in EINER Zeile (keine 3-Zeilen-Karte mehr)', () => {
    const appState = seedTwoSources();
    const citation = makeCitation('@S1@', { page: 'fol. 3', quay: 2, note: 'Randbemerkung' });

    render(SourceCitationRow, {
      props: {
        appState,
        citation,
        index: 0,
        labelPrefix: 'Geburt (BIRT)',
        onSourceChange: vi.fn(),
        onPageChange: vi.fn(),
        onQuayChange: vi.fn(),
        onNoteChange: vi.fn(),
        onUrlChange: vi.fn(),
        onEvalChange: vi.fn(),
        onRemove: vi.fn(),
      },
    });

    const row = document.querySelector('.source-citation-row') as HTMLElement;
    expect(row).toBeTruthy();
    // Alle Bedienelemente sind direkte Kinder DERSELBEN flex-wrap-Zeile — kein
    // separates Karten-/Seite-QUAY-/Notiz-Entfernen-Zeilen-Trio mehr.
    expect(row.querySelector('.source-citation-row__source-link')).toBeTruthy();
    expect(row.querySelector('.source-citation-row__page')).toBeTruthy();
    expect(row.querySelector('.source-citation-row__quay')).toBeTruthy();
    expect(row.querySelector('.source-citation-row__note')).toBeTruthy();
    expect(row.querySelector('.source-citation-row__remove-btn')).toBeTruthy();
    expect(document.querySelectorAll('.source-citation-row')).toHaveLength(1);

    expect(screen.getByText('KB Musterdorf')).toBeTruthy();
    expect((screen.getByLabelText('Geburt (BIRT) Seite 1') as HTMLInputElement).value).toBe('fol. 3');
    expect((screen.getByLabelText('Geburt (BIRT) Zuverlässigkeit 1') as HTMLSelectElement).value).toBe('2');
    expect((screen.getByLabelText('Geburt (BIRT) Notiz 1') as HTMLInputElement).value).toBe('Randbemerkung');
  });

  it('zeigt den rohen sourceId, wenn er auf keine bekannte Quelle verweist (TST-9, keine Information stillschweigend verlieren)', () => {
    const appState = seedTwoSources();
    const citation = makeCitation('@S9@');

    render(SourceCitationRow, {
      props: {
        appState,
        citation,
        index: 0,
        labelPrefix: 'Familie',
        onSourceChange: vi.fn(),
        onPageChange: vi.fn(),
        onQuayChange: vi.fn(),
        onNoteChange: vi.fn(),
        onUrlChange: vi.fn(),
        onEvalChange: vi.fn(),
        onRemove: vi.fn(),
      },
    });

    expect(screen.getByText('@S9@')).toBeTruthy();
  });
});

describe('SourceCitationRow — Bearbeiten der Felder', () => {
  it('ruft onPageChange/onQuayChange/onNoteChange bei Änderung auf', async () => {
    const appState = seedTwoSources();
    const citation = makeCitation('@S1@');
    const onPageChange = vi.fn();
    const onQuayChange = vi.fn();
    const onNoteChange = vi.fn();

    render(SourceCitationRow, {
      props: {
        appState,
        citation,
        index: 0,
        labelPrefix: 'Heirat (MARR)',
        onSourceChange: vi.fn(),
        onPageChange,
        onQuayChange,
        onNoteChange,
        onUrlChange: vi.fn(),
        onEvalChange: vi.fn(),
        onRemove: vi.fn(),
      },
    });

    await fireEvent.change(screen.getByLabelText('Heirat (MARR) Seite 1'), { target: { value: 'S. 12' } });
    expect(onPageChange).toHaveBeenCalledWith('S. 12');

    await fireEvent.change(screen.getByLabelText('Heirat (MARR) Zuverlässigkeit 1'), { target: { value: '3' } });
    expect(onQuayChange).toHaveBeenCalledWith(3);

    await fireEvent.change(screen.getByLabelText('Heirat (MARR) Notiz 1'), { target: { value: 'geprüft' } });
    expect(onNoteChange).toHaveBeenCalledWith('geprüft');
  });

  it('zeigt den Weblink der Referenz und ruft onUrlChange bei Änderung auf', async () => {
    const appState = seedTwoSources();
    const citation = makeCitation('@S1@', {
      media: [makeMediaCitation('https://example.org/rec/7')],
    });
    const onUrlChange = vi.fn();

    render(SourceCitationRow, {
      props: {
        appState,
        citation,
        index: 0,
        labelPrefix: 'Heirat (MARR)',
        onSourceChange: vi.fn(),
        onPageChange: vi.fn(),
        onQuayChange: vi.fn(),
        onNoteChange: vi.fn(),
        onUrlChange,
        onEvalChange: vi.fn(),
        onRemove: vi.fn(),
      },
    });

    const field = screen.getByLabelText('Heirat (MARR) Weblink 1') as HTMLInputElement;
    // vorhandener Weblink (aus dem Zitat-Medium) wird angezeigt
    expect(field.value).toBe('https://example.org/rec/7');

    await fireEvent.change(field, { target: { value: 'https://example.org/rec/9' } });
    expect(onUrlChange).toHaveBeenCalledWith('https://example.org/rec/9');
  });

  it('ruft onRemove beim Klick auf ✕ auf', async () => {
    const appState = seedTwoSources();
    const citation = makeCitation('@S1@');
    const onRemove = vi.fn();

    render(SourceCitationRow, {
      props: {
        appState,
        citation,
        index: 0,
        labelPrefix: 'Geburt (BIRT)',
        onSourceChange: vi.fn(),
        onPageChange: vi.fn(),
        onQuayChange: vi.fn(),
        onNoteChange: vi.fn(),
        onUrlChange: vi.fn(),
        onEvalChange: vi.fn(),
        onRemove,
      },
    });

    await fireEvent.click(screen.getByLabelText('Geburt (BIRT) Quelle 1 entfernen'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

describe('SourceCitationRow — Quelle wechseln/neu anlegen über den Namens-Link (bisherige Karten-Klick-Funktion)', () => {
  it('öffnet die Picker-Shell beim Klick auf den Quellennamen und wechselt die Quelle', async () => {
    const appState = seedTwoSources();
    const citation = makeCitation('@S1@');
    const onSourceChange = vi.fn();

    render(SourceCitationRow, {
      props: {
        appState,
        citation,
        index: 0,
        labelPrefix: 'Geburt (BIRT)',
        onSourceChange,
        onPageChange: vi.fn(),
        onQuayChange: vi.fn(),
        onNoteChange: vi.fn(),
        onUrlChange: vi.fn(),
        onEvalChange: vi.fn(),
        onRemove: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByLabelText('Geburt (BIRT) Quelle 1'));
    expect(screen.getByLabelText('Geburt (BIRT) Quelle 1 auswählen')).toBeTruthy();

    await fireEvent.click(screen.getByText('StA Musterstadt'));
    expect(onSourceChange).toHaveBeenCalledWith('@S2@');
  });

  it('legt über "+ Neue Quelle anlegen …" inline eine neue Quelle an und ruft onSourceChange mit der neuen id auf', async () => {
    const appState = seedTwoSources();
    const citation = makeCitation('@S1@');
    const onSourceChange = vi.fn();

    render(SourceCitationRow, {
      props: {
        appState,
        citation,
        index: 0,
        labelPrefix: 'Geburt (BIRT)',
        onSourceChange,
        onPageChange: vi.fn(),
        onQuayChange: vi.fn(),
        onNoteChange: vi.fn(),
        onUrlChange: vi.fn(),
        onEvalChange: vi.fn(),
        onRemove: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByLabelText('Geburt (BIRT) Quelle 1'));
    await fireEvent.click(screen.getByText('+ Neue Quelle anlegen …'));

    expect(screen.getByText('Neue Quelle')).toBeTruthy();
    await fireEvent.input(screen.getByRole('textbox', { name: 'Kurzname' }), { target: { value: 'Neue Quelle X' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(onSourceChange).toHaveBeenCalledTimes(1);
    const newId = onSourceChange.mock.calls[0][0] as string;
    expect(appState.db.sources.get(newId)?.abbr).toBe('Neue Quelle X');
    expect(screen.queryByText('Neue Quelle')).toBeNull();
  });
});

describe('SourceCitationRow — TST-7 Kapazitäts-Fall (mehrere Zitationen bleiben kompakt)', () => {
  it('rendert 8 Zitationen als 8 eigenständige kompakte Zeilen (keine gemeinsame verschachtelte Karte)', () => {
    const appState = seedTwoSources();
    for (let i = 0; i < 6; i += 1) {
      const id = `@S${10 + i}@`;
      appState.db.sources.set(id, makeSource(id, { abbr: `Weitere Quelle ${i}` }));
    }

    const citations = Array.from({ length: 8 }, (_, i) => makeCitation('@S1@', { page: `S. ${i}` }));

    // SourceCitationRow ist bewusst EIN Datensatz pro Instanz (analog jeder anderen
    // Listenzeilen-Komponente) — der Aufrufer (PersonForm/FamilyForm) iteriert per
    // {#each}. Hier wird dasselbe Iterationsmuster nachgebildet, um die Kompaktheit bei
    // vielen Zitationen zu verifizieren (TST-7).
    for (const [i, citation] of citations.entries()) {
      render(SourceCitationRow, {
        props: {
          appState,
          citation,
          index: i,
          labelPrefix: 'Geburt (BIRT)',
          onSourceChange: vi.fn(),
          onPageChange: vi.fn(),
          onQuayChange: vi.fn(),
          onNoteChange: vi.fn(),
          onUrlChange: vi.fn(),
          onEvalChange: vi.fn(),
          onRemove: vi.fn(),
        },
      });
    }

    expect(document.querySelectorAll('.source-citation-row')).toHaveLength(8);
    for (let i = 0; i < 8; i += 1) {
      expect(screen.getByLabelText(`Geburt (BIRT) Seite ${i + 1}`)).toBeTruthy();
    }
  });
});

describe('SourceCitationRow — BL-57 Evidenz-Bewertung als Aufklapper (⚖)', () => {
  /** Simuliert den echten Aufrufer (EventEditModal): `onEvalChange` liefert das VOLLE
   *  Ergebnis, das der Aufrufer per `applyEvalToCitation`/`{ ...c, eval: null }` in die
   *  Zitation zurückschreibt und den Row neu rendert (`rerender`) — sonst würde jede
   *  Achsen-Änderung in diesem isolierten Test immer wieder vom URSPRÜNGLICHEN
   *  `citation`-Prop ausgehen statt kumulativ auf der vorherigen Änderung aufzubauen. */
  async function renderRow(
    overrides: Partial<Parameters<typeof makeCitation>[1]> = {},
    extraProps: Record<string, unknown> = {},
  ) {
    const appState = seedTwoSources();
    let citation = makeCitation('@S1@', overrides);
    const onEvalChange = vi.fn();
    const onQuayChange = vi.fn();
    const baseProps = {
      appState,
      index: 0,
      labelPrefix: 'Geburt (BIRT)',
      onSourceChange: vi.fn(),
      onPageChange: vi.fn(),
      onQuayChange,
      onNoteChange: vi.fn(),
      onUrlChange: vi.fn(),
      onRemove: vi.fn(),
      ...extraProps,
    };
    const rendered = render(SourceCitationRow, {
      props: { ...baseProps, citation, onEvalChange: (ev: unknown) => onEvalChange(ev) },
    });
    /** Nach einer Achsen-Änderung aufrufen: liest den letzten `onEvalChange`-Aufruf,
     *  schreibt ihn in `citation.eval` und rendert mit dem aktualisierten Prop neu. */
    async function commitLastEval() {
      const lastCall = onEvalChange.mock.calls.at(-1);
      citation = { ...citation, eval: lastCall ? (lastCall[0] as typeof citation.eval) : null };
      await rendered.rerender({ ...baseProps, citation, onEvalChange: (ev: unknown) => onEvalChange(ev) });
    }
    return { onEvalChange, onQuayChange, commitLastEval };
  }

  it('der ⚖-Auslöser öffnet/schließt den Aufklapper (aria-expanded) — keine Achsen-Felder ohne Klick sichtbar', async () => {
    await renderRow();
    const toggle = screen.getByLabelText('Geburt (BIRT) Quelle 1 Bewertung hinzufügen');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Geburt (BIRT) Quelle 1 Quellentyp')).toBeNull();

    await fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Geburt (BIRT) Quelle 1 Quellentyp')).toBeTruthy();
    expect(screen.getByLabelText('Geburt (BIRT) Quelle 1 Information')).toBeTruthy();
    expect(screen.getByLabelText('Geburt (BIRT) Quelle 1 Evidenz')).toBeTruthy();
    expect(screen.getByLabelText('Geburt (BIRT) Quelle 1 Informant')).toBeTruthy();

    await fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Geburt (BIRT) Quelle 1 Quellentyp')).toBeNull();
  });

  it('Achsen-Auswahl ruft onEvalChange mit dem VOLLEN EvidenceEval-Objekt auf (nicht nur der geänderten Achse)', async () => {
    const { onEvalChange, commitLastEval } = await renderRow();
    await fireEvent.click(screen.getByLabelText('Geburt (BIRT) Quelle 1 Bewertung hinzufügen'));

    await fireEvent.change(screen.getByLabelText('Geburt (BIRT) Quelle 1 Quellentyp'), {
      target: { value: 'original' },
    });
    expect(onEvalChange).toHaveBeenLastCalledWith(
      makeEvidenceEval({ source: 'original' }),
    );
    await commitLastEval();

    await fireEvent.change(screen.getByLabelText('Geburt (BIRT) Quelle 1 Information'), {
      target: { value: 'primary' },
    });
    expect(onEvalChange).toHaveBeenLastCalledWith(
      makeEvidenceEval({ source: 'original', information: 'primary' }),
    );
    await commitLastEval();

    await fireEvent.change(screen.getByLabelText('Geburt (BIRT) Quelle 1 Evidenz'), {
      target: { value: 'direct' },
    });
    expect(onEvalChange).toHaveBeenLastCalledWith(
      makeEvidenceEval({ source: 'original', information: 'primary', evidence: 'direct' }),
    );
    await commitLastEval();

    await fireEvent.change(screen.getByLabelText('Geburt (BIRT) Quelle 1 Informant'), {
      target: { value: 'Pfarrer Schmidt' },
    });
    expect(onEvalChange).toHaveBeenLastCalledWith(
      makeEvidenceEval({
        source: 'original',
        information: 'primary',
        evidence: 'direct',
        informant: 'Pfarrer Schmidt',
      }),
    );
  });

  it('Optionen tragen deutsche Labels, keine Wire-Werte (kein "original"/"primary"/"direct" im Text)', async () => {
    await renderRow();
    await fireEvent.click(screen.getByLabelText('Geburt (BIRT) Quelle 1 Bewertung hinzufügen'));
    expect(screen.getByText('Original')).toBeTruthy();
    expect(screen.getByText('Abschrift')).toBeTruthy();
    expect(screen.getByText('Autorenwerk')).toBeTruthy();
    expect(screen.getByText('primär')).toBeTruthy();
    expect(screen.getByText('sekundär')).toBeTruthy();
    expect(screen.getByText('unbestimmt')).toBeTruthy();
    expect(screen.getByText('direkt')).toBeTruthy();
    expect(screen.getByText('indirekt')).toBeTruthy();
    expect(screen.getByText('negativ')).toBeTruthy();
  });

  it('zeigt den QUAY-Vorschlag nur bei vorhandener Bewertung; Ein-Klick-Übernahme ruft onQuayChange mit genau evalToQuay(...); OHNE Klick bleibt QUAY unverändert', async () => {
    const ev = makeEvidenceEval({ source: 'original', information: 'primary', evidence: 'direct' });
    const { onQuayChange } = await renderRow({ eval: ev, quay: 0 });

    // Vor dem Öffnen: kein Vorschlag sichtbar (keine zweite Dauer-Fläche).
    expect(screen.queryByText(/Vorschlag: QUAY/)).toBeNull();

    await fireEvent.click(screen.getByLabelText('Geburt (BIRT) Quelle 1 Bewertung bearbeiten'));
    const expectedQuay = evalToQuay(ev);
    expect(screen.getByText(new RegExp(`Vorschlag: QUAY ${expectedQuay}`))).toBeTruthy();
    // Reine Anzeige verändert QUAY NICHT (INV-C2) — kein automatischer onQuayChange-Aufruf.
    expect(onQuayChange).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByText('Übernehmen'));
    expect(onQuayChange).toHaveBeenCalledTimes(1);
    expect(onQuayChange).toHaveBeenCalledWith(expectedQuay);
  });

  it('rendert ohne Bewertung keinen QUAY-Vorschlag im Aufklapper', async () => {
    await renderRow();
    await fireEvent.click(screen.getByLabelText('Geburt (BIRT) Quelle 1 Bewertung hinzufügen'));
    expect(screen.queryByText(/Vorschlag: QUAY/)).toBeNull();
  });

  it('Zurücksetzen aller Achsen (inkl. Informant) auf "—"/leer ergibt eval=null, nicht ein leeres Gerüst-Objekt', async () => {
    const ev = makeEvidenceEval({ source: 'original', information: 'primary', evidence: 'direct', informant: 'X' });
    const { onEvalChange, commitLastEval } = await renderRow({ eval: ev });
    await fireEvent.click(screen.getByLabelText('Geburt (BIRT) Quelle 1 Bewertung bearbeiten'));

    await fireEvent.change(screen.getByLabelText('Geburt (BIRT) Quelle 1 Quellentyp'), { target: { value: '' } });
    await commitLastEval();
    await fireEvent.change(screen.getByLabelText('Geburt (BIRT) Quelle 1 Information'), { target: { value: '' } });
    await commitLastEval();
    await fireEvent.change(screen.getByLabelText('Geburt (BIRT) Quelle 1 Evidenz'), { target: { value: '' } });
    await commitLastEval();
    await fireEvent.change(screen.getByLabelText('Geburt (BIRT) Quelle 1 Informant'), { target: { value: '' } });

    expect(onEvalChange).toHaveBeenLastCalledWith(null);
  });

  it('der ⚖-Auslöser zeigt den bewerteten Zustand an (aktives Erscheinungsbild), sobald eine Bewertung existiert', async () => {
    const ev = makeEvidenceEval({ source: 'original' });
    await renderRow({ eval: ev });
    const toggle = screen.getByLabelText('Geburt (BIRT) Quelle 1 Bewertung bearbeiten');
    expect(toggle.className).toContain('source-citation-row__eval-toggle--active');
  });
});
