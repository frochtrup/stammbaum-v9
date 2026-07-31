// @vitest-environment happy-dom
// tests/ui/SourceForm.component.test.ts — Quellen-Editor (Spec 20 §2 Formular-Feldtabelle
// "Quelle"). Source ist ein flaches Modell (keine Event-Tristate/Dirty-Tracking nötig,
// s. SourceForm.svelte Kopfkommentar) — deckt Speichern/Vorbefüllung sowie das
// Archiv-Freitext-Erhaltungsverhalten ab. KEIN <select bind:value> mit fireEvent.change
// (bekannter happy-dom-Bug) — value/onchange-Muster.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SourceForm from '../../ui/views/source/SourceForm.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeSource, makeRepository } from '../../core/model';

describe('SourceForm — Speichern/Vorbefüllung', () => {
  it('speichert geänderte Felder über appState.saveSource als vollständiges Objekt', async () => {
    const appState = createAppState();
    const source = makeSource('@S1@', { title: 'Kirchenbuch Ochtrup' });
    const onSaved = vi.fn();

    render(SourceForm, { props: { appState, source, onSaved } });

    await fireEvent.input(screen.getByLabelText('Kurzname'), { target: { value: 'KB Ochtrup' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.sources.get('@S1@')?.abbr).toBe('KB Ochtrup');
    expect(appState.db.sources.get('@S1@')?.title).toBe('Kirchenbuch Ochtrup');
    expect(onSaved).toHaveBeenCalledWith('@S1@');
  });

  it('zeigt "Neue Quelle" für eine leere Quelle, "Quelle bearbeiten" für eine befüllte', () => {
    const appState = createAppState();
    const { unmount } = render(SourceForm, { props: { appState, source: makeSource('@S1@') } });
    expect(screen.getByText('Neue Quelle')).toBeTruthy();
    unmount();

    render(SourceForm, { props: { appState, source: makeSource('@S2@', { title: 'Bestehend' }) } });
    expect(screen.getByText('Quelle bearbeiten')).toBeTruthy();
  });

  it('Abbrechen ruft onCancel, speichert nichts', async () => {
    const appState = createAppState();
    const onCancel = vi.fn();
    render(SourceForm, { props: { appState, source: makeSource('@S1@'), onCancel } });

    await fireEvent.click(screen.getByText('Abbrechen'));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(appState.db.sources.has('@S1@')).toBe(false);
  });

  it('erhält einen Freitext-repo-Wert (kein bekannter RepoId) beim Speichern, wenn nicht aktiv geändert', async () => {
    const appState = createAppState();
    const source = makeSource('@S1@', { repo: 'Legacy-Freitext-Archiv' });
    render(SourceForm, { props: { appState, source } });

    await fireEvent.click(screen.getByText('Speichern'));
    expect(appState.db.sources.get('@S1@')?.repo).toBe('Legacy-Freitext-Archiv');
  });

  it('übernimmt eine aktive Archiv-Auswahl über den RepositoryPicker (ADR-v9-40)', async () => {
    const appState = createAppState();
    appState.saveRepository(makeRepository('@R1@', { name: 'Landesarchiv NRW' }));
    const source = makeSource('@S1@');
    render(SourceForm, { props: { appState, source } });

    await fireEvent.click(screen.getByLabelText('Archiv'));
    await fireEvent.click(screen.getByText('Landesarchiv NRW'));
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.sources.get('@S1@')?.repo).toBe('@R1@');
  });
});

describe('SourceForm — Quellen-Vorlagen (BL-128, Spec 20 §1.6 [S])', () => {
  it('zeigt den Vorlagen-Picker nur beim Anlegen einer frischen Quelle (Kurzname+Titel leer)', () => {
    const appState = createAppState();
    const { unmount } = render(SourceForm, { props: { appState, source: makeSource('@S1@') } });
    expect(screen.getByText('Kirchenbuch Taufen')).toBeTruthy();
    unmount();

    render(SourceForm, { props: { appState, source: makeSource('@S2@', { title: 'Bestehende Quelle' }) } });
    expect(screen.queryByText('Kirchenbuch Taufen')).toBeNull();
  });

  it('Chip-Klick füllt Kurzname/Titel/Medientyp vor, Autor bleibt leer (kein erfundener Wert)', async () => {
    const appState = createAppState();
    const source = makeSource('@S1@');
    render(SourceForm, { props: { appState, source } });

    await fireEvent.click(screen.getByText('Grabstein'));

    expect((screen.getByLabelText('Kurzname') as HTMLInputElement).value).toBe('Grabstein');
    expect((screen.getByLabelText('Titel') as HTMLInputElement).value).toBe('Grabstein, [Friedhof/Ort]');
    expect((screen.getByLabelText('Autor') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Medientyp (zur Signatur)') as HTMLInputElement).value).toBe('tombstone');
  });

  it('vorbefüllte Felder bleiben danach frei editierbar und werden beim Speichern übernommen', async () => {
    const appState = createAppState();
    const source = makeSource('@S1@');
    render(SourceForm, { props: { appState, source } });

    await fireEvent.click(screen.getByText('Totenzettel'));
    await fireEvent.input(screen.getByLabelText('Titel'), { target: { value: 'Totenzettel Anna Schmidt, 1932' } });
    await fireEvent.click(screen.getByText('Speichern'));

    const saved = appState.db.sources.get('@S1@');
    expect(saved?.abbr).toBe('Totenzettel');
    expect(saved?.title).toBe('Totenzettel Anna Schmidt, 1932');
    expect(saved?.callMedia).toBe('card');
  });

  it('überschreibt einen bereits getippten Wert NICHT stillschweigend, wenn danach eine Vorlage gewählt wird', async () => {
    const appState = createAppState();
    const source = makeSource('@S1@');
    render(SourceForm, { props: { appState, source } });

    await fireEvent.input(screen.getByLabelText('Autor'), { target: { value: 'Eigene Angabe' } });
    await fireEvent.click(screen.getByText('Kirchenbuch Taufen'));

    expect((screen.getByLabelText('Autor') as HTMLInputElement).value).toBe('Eigene Angabe');
    // die übrigen, noch leeren Felder werden trotzdem vorbefüllt
    expect((screen.getByLabelText('Kurzname') as HTMLInputElement).value).toBe('KB Taufen');
  });

  it('Freitext-Eingabe im Vorlagen-Feld, die exakt einem Preset-Label entspricht, füllt ebenfalls vor', async () => {
    const appState = createAppState();
    const source = makeSource('@S1@');
    render(SourceForm, { props: { appState, source } });

    const input = screen.getByPlaceholderText('Vorlage wählen…');
    await fireEvent.input(input, { target: { value: 'Volkszählung' } });
    await fireEvent.change(input, { target: { value: 'Volkszählung' } });

    expect((screen.getByLabelText('Kurzname') as HTMLInputElement).value).toBe('Volkszählung');
    expect((screen.getByLabelText('Medientyp (zur Signatur)') as HTMLInputElement).value).toBe('manuscript');
  });
});
