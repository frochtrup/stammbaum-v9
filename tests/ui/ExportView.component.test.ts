// @vitest-environment happy-dom
// tests/ui/ExportView.component.test.ts — die Export-Fläche (BL-119, Spec 20 §1.2,
// Spec 14 §3.2, ADR-v9-113). Gemockte Adapter, nie eine echte Plattform-API — das
// Rohr und die Kern-Serializer laufen echt (analog PlacesFileButtons/SaveButton).
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import ExportView from '../../ui/views/export/ExportView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { FileService } from '../../services/file/file-service';
import { parseGedcom, parseXMLText } from '../../core/interop';
import { createMockAdapterSet } from '../services/mock-adapters';

// Zwei Personen: eine 1890 geborene (bei Bezugsjahr 1980 lebend, bei 2026 verstorben)
// und eine 1700 geborene, die in KEINEM Bezugsjahr lebt — damit ist der Zähler in
// beiden Richtungen aussagekräftig und nicht zufällig „alle".
const SRC = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '0 @I1@ INDI',
  '1 NAME Max /Muster/',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 12 MAR 1890',
  '0 @I2@ INDI',
  '1 NAME Urahn /Alt/',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 1700',
  '1 DEAT',
  '2 DATE 1770',
  '0 TRLR',
].join('\n');

function setup(opts: { fsHandleSupported?: boolean; handle?: unknown; referenceYear?: number } = {}) {
  const appState = createAppState();
  const parsed = parseGedcom(SRC);
  appState.loadDatabase(parsed.db, 'Meine Familie.ged', parsed.roots);
  const { adapters, fsHandle, download } = createMockAdapterSet({
    fsHandleSupported: opts.fsHandleSupported ?? false,
    shareSupported: false,
  });
  const fileService = new FileService(adapters);

  render(ExportView, {
    props: { appState, fileService, handle: opts.handle, referenceYear: opts.referenceYear ?? 1980 },
  });

  return { appState, fsHandle, download };
}

const formatSelect = () => screen.getByLabelText('Export-Format') as HTMLSelectElement;
const anonCheckbox = () => screen.getByLabelText(/anonymisieren/) as HTMLInputElement;
const exportButton = () => screen.getByRole('button', { name: /Exportieren/ });

describe('ExportView — Formatwahl', () => {
  it('bietet alle vier Formate an, GRAMPS eingeschlossen (BL-160, ADR-v9-127 überholt ADR-v9-113 E5)', () => {
    setup();
    const werte = [...formatSelect().options].map((o) => o.value);
    expect(werte).toEqual(['gedcom-5.5.1', 'gedcom-strict', 'gedcom-7.0', 'gramps']);
  });

  it('kennzeichnet GRAMPS bei GEDCOM-geladenem Bestand als Cross-Family-Synthese aus dem Modell', () => {
    setup();
    const grampsOption = [...formatSelect().options].find((o) => o.value === 'gramps')!;
    expect(grampsOption.textContent).toContain('aus dem Modell erzeugt');
    // Das native Format trägt KEINEN Cross-Hinweis.
    const nativOption = [...formatSelect().options].find((o) => o.value === 'gedcom-5.5.1')!;
    expect(nativOption.textContent).not.toContain('aus dem Modell erzeugt');
  });

  it('nennt den Zieldateinamen, sobald er vom Original abweicht — vorher nicht', async () => {
    setup();
    // Reiner 5.5.1-Export schreibt denselben Namen; die Zeile wäre Rauschen neben dem
    // Speichern-Knopf direkt darüber.
    expect(screen.queryByText(/Zieldatei/)).toBeNull();

    await fireEvent.change(formatSelect(), { target: { value: 'gedcom-strict' } });

    await waitFor(() => expect(screen.getByText('Meine Familie_strict.ged')).toBeTruthy());
  });

  it('exportiert im gewählten Format unter dem passenden Namen', async () => {
    const { download } = setup();

    await fireEvent.change(formatSelect(), { target: { value: 'gedcom-7.0' } });
    await fireEvent.click(exportButton());

    await waitFor(() => expect(download.downloadCalls).toHaveLength(1));
    expect(download.downloadCalls[0].filename).toBe('Meine Familie_ged7.ged');
  });
});

describe('ExportView — Anonymisierung', () => {
  it('zeigt den Zähler erst, wenn die Schwärzung gewählt ist', async () => {
    setup({ referenceYear: 1980 });
    expect(screen.queryByText(/werden geschwärzt/)).toBeNull();

    await fireEvent.click(anonCheckbox());

    await waitFor(() => expect(screen.getByText(/1 von 2 Personen werden geschwärzt/)).toBeTruthy());
  });

  it('der Zähler folgt dem Bezugsjahr: 2026 trifft dieselbe Person nicht mehr', async () => {
    setup({ referenceYear: 2026 });

    await fireEvent.click(anonCheckbox());

    await waitFor(() => expect(screen.getByText(/0 von 2 Personen werden geschwärzt/)).toBeTruthy());
  });

  it('hängt _anon an den Zieldateinamen, auch kombiniert mit einem Format', async () => {
    setup();

    await fireEvent.click(anonCheckbox());
    await fireEvent.change(formatSelect(), { target: { value: 'gedcom-strict' } });

    await waitFor(() => expect(screen.getByText('Meine Familie_strict_anon.ged')).toBeTruthy());
  });

  it('schreibt NIE in-place, auch mit vorhandenem Handle — und die Bytes sind geschwärzt', async () => {
    const { fsHandle, download } = setup({ fsHandleSupported: true, handle: { id: 'original' } });

    await fireEvent.click(anonCheckbox());
    await fireEvent.click(exportButton());

    await waitFor(() => expect(download.downloadCalls).toHaveLength(1));
    expect(fsHandle.write).not.toHaveBeenCalled();
    expect(download.downloadCalls[0].filename).toBe('Meine Familie_anon.ged');
    const bytes = String(download.downloadBytes[0]);
    expect(bytes).toContain('Lebende Person');
    expect(bytes).not.toContain('Max /Muster/');
    expect(bytes).toContain('Urahn /Alt/'); // der Verstorbene bleibt sichtbar
  });

  it('lässt den App-Zustand unberührt — die Arbeitskopie behält die echten Namen', async () => {
    const { appState, download } = setup();

    await fireEvent.click(anonCheckbox());
    await fireEvent.click(exportButton());

    await waitFor(() => expect(download.downloadCalls).toHaveLength(1));
    expect(appState.db.individuals.get('@I1@')!.name).toContain('Max');
    expect(appState.serialize()).toContain('Max /Muster/');
  });
});

describe('ExportView — Cross-Family-Export (BL-160, ADR-v9-127)', () => {
  it('GEDCOM-geladen → GRAMPS-Export: Download erzwungen, .gramps-Suffix, Inhalt re-parst', async () => {
    const { download } = setup();

    await fireEvent.change(formatSelect(), { target: { value: 'gramps' } });
    await fireEvent.click(exportButton());

    await waitFor(() => expect(download.downloadCalls).toHaveLength(1));
    expect(download.downloadCalls[0].filename).toBe('Meine Familie.gramps');
    expect(download.downloadCalls[0].mimeType).toBe('application/gzip');

    // Wirklich gzip-komprimiert (echter CompressionStream-Codec, kein Mock) — entpacken
    // und re-parsen belegt, dass der synthetisierte Baum valide ist UND die Personen
    // erhalten sind (Gate: re-parst, Entitätszahlen stimmen).
    const gz = download.downloadBytes[0] as Uint8Array;
    const xml = gunzipSync(Buffer.from(gz)).toString('utf8');
    const reparsed = parseXMLText(xml);
    expect(reparsed.db.individuals.size).toBe(2);
    const namen = [...reparsed.db.individuals.values()].map((p) => `${p.given} ${p.surname}`).sort();
    expect(namen).toEqual(['Max Muster', 'Urahn Alt']);
  });

  it('GRAMPS-geladen → GEDCOM-Export: Download erzwungen, .ged-Suffix, Inhalt re-parst', async () => {
    const grampsXml = readFileSync(join(__dirname, '../fixtures/mini.small.gramps'), 'utf8');
    const parsed = parseXMLText(grampsXml);
    const appState = createAppState();
    appState.loadGrampsDoc(parsed.db, 'Unsere Familie.gramps', parsed.doc);
    const { adapters, download } = createMockAdapterSet({ fsHandleSupported: false, shareSupported: false });
    const fileService = new FileService(adapters);
    render(ExportView, { props: { appState, fileService } });

    await fireEvent.change(formatSelect(), { target: { value: 'gedcom-5.5.1' } });
    await fireEvent.click(exportButton());

    await waitFor(() => expect(download.downloadCalls).toHaveLength(1));
    expect(download.downloadCalls[0].filename).toBe('Unsere Familie.ged');

    const text = String(download.downloadBytes[0]);
    const reparsed = parseGedcom(text);
    expect(reparsed.db.individuals.size).toBe(parsed.db.individuals.size);
    expect(reparsed.db.sources.size).toBe(parsed.db.sources.size);
    expect([...reparsed.db.individuals.values()][0].surname).toBe('Muster');
  });

  it('bietet GEDCOM bei GRAMPS-geladenem Bestand als Cross-Family-Synthese an (E5 überholt)', () => {
    const grampsXml = readFileSync(join(__dirname, '../fixtures/mini.small.gramps'), 'utf8');
    const parsed = parseXMLText(grampsXml);
    const appState = createAppState();
    appState.loadGrampsDoc(parsed.db, 'Unsere Familie.gramps', parsed.doc);
    const { adapters } = createMockAdapterSet();
    render(ExportView, { props: { appState, fileService: new FileService(adapters) } });

    const werte = [...formatSelect().options].map((o) => o.value);
    expect(werte).toEqual(['gedcom-5.5.1', 'gedcom-strict', 'gedcom-7.0', 'gramps']);
    const gedcomOption = [...formatSelect().options].find((o) => o.value === 'gedcom-5.5.1')!;
    expect(gedcomOption.textContent).toContain('aus dem Modell erzeugt');
    const grampsOption = [...formatSelect().options].find((o) => o.value === 'gramps')!;
    expect(grampsOption.textContent).not.toContain('aus dem Modell erzeugt');
  });
});

describe('ExportView — Rückmeldung', () => {
  it('nennt nach einem Formatexport die geschriebene Datei (sie heißt anders als das Original)', async () => {
    setup();

    await fireEvent.change(formatSelect(), { target: { value: 'gedcom-strict' } });
    await fireEvent.click(exportButton());

    await waitFor(() =>
      expect(screen.getByText(/Als Download bereitgestellt: Meine Familie_strict\.ged/)).toBeTruthy(),
    );
  });

  it('der reine 5.5.1-Export MIT Handle geht in-place (Tier 1) — dieselbe Fläche, andere Tier-Wahl', async () => {
    const { fsHandle } = setup({ fsHandleSupported: true, handle: { id: 'original' } });

    await fireEvent.click(exportButton());

    await waitFor(() => expect(fsHandle.writeCalls).toHaveLength(1));
    expect(screen.getByText('Gespeichert (direkt in die Datei).')).toBeTruthy();
  });

  it('bleibt unsichtbar, solange keine Datei geladen ist', () => {
    const { adapters } = createMockAdapterSet();
    render(ExportView, { props: { appState: createAppState(), fileService: new FileService(adapters) } });
    expect(screen.queryByRole('button', { name: /Exportieren/ })).toBeNull();
  });
});
