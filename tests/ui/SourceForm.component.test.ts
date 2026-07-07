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

  it('übernimmt eine aktive Archiv-Auswahl per Select (value/onchange)', async () => {
    const appState = createAppState();
    appState.saveRepository(makeRepository('@R1@', { name: 'Landesarchiv NRW' }));
    const source = makeSource('@S1@');
    render(SourceForm, { props: { appState, source } });

    const select = screen.getByLabelText('Archiv') as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: '@R1@' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.sources.get('@S1@')?.repo).toBe('@R1@');
  });
});
