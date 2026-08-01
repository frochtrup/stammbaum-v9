// @vitest-environment happy-dom
// tests/ui/RepositoryForm.component.test.ts — Archiv-Editor (Spec 20 §2 Formular-
// Feldtabelle "Archiv"). Repository ist ein flaches Modell (keine Tristate-/Dirty-
// Tracking-Logik nötig, s. RepositoryForm.svelte Kopfkommentar).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import RepositoryForm from '../../ui/views/repository/RepositoryForm.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeRepository } from '../../core/model';

describe('RepositoryForm — Speichern/Vorbefüllung', () => {
  it('speichert geänderte Felder über appState.saveRepository als vollständiges Objekt', async () => {
    const appState = createAppState();
    const repository = makeRepository('@R1@', { name: 'Landesarchiv NRW' });
    const onSaved = vi.fn();

    render(RepositoryForm, { props: { appState, repository, onSaved } });

    await fireEvent.input(screen.getByLabelText('Telefon'), { target: { value: '0251-123456' } });
    await fireEvent.input(screen.getByLabelText('Findbuch-URL'), { target: { value: 'https://archive.example/findbuch' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.repositories.get('@R1@')?.name).toBe('Landesarchiv NRW');
    expect(appState.db.repositories.get('@R1@')?.phone).toBe('0251-123456');
    expect(appState.db.repositories.get('@R1@')?.findingAid).toBe('https://archive.example/findbuch');
    expect(onSaved).toHaveBeenCalledWith('@R1@');
  });

  it('zeigt "Neues Archiv" für ein leeres Archiv, "Archiv bearbeiten" für ein befülltes', () => {
    const appState = createAppState();
    const { unmount } = render(RepositoryForm, { props: { appState, repository: makeRepository('@R1@') } });
    expect(screen.getByText('Neues Archiv')).toBeTruthy();
    unmount();

    render(RepositoryForm, { props: { appState, repository: makeRepository('@R2@', { name: 'Bestehend' }) } });
    expect(screen.queryByText('Archiv bearbeiten')).toBeNull();
    expect(screen.queryByText('Neues Archiv')).toBeNull();
  });

  it('Abbrechen ruft onCancel, speichert nichts', async () => {
    const appState = createAppState();
    const onCancel = vi.fn();
    render(RepositoryForm, { props: { appState, repository: makeRepository('@R1@'), onCancel } });

    await fireEvent.click(screen.getByText('Abbrechen'));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(appState.db.repositories.has('@R1@')).toBe(false);
  });
});

// BL-203: der Archivtyp war ein englisches Freitextfeld — getippt „Library", angezeigt
// „Library". Jetzt kuratiertes Vokabular mit deutschen Labels über EINE Quelle
// (`REPO_TYPE_OPTIONS`), gespeichert bleibt der GRAMPS-Wert.
describe('RepositoryForm — Archivtyp als kuratiertes Dropdown (BL-203)', () => {
  it('speichert den GRAMPS-Wert, nicht das deutsche Label', async () => {
    const appState = createAppState();
    const repository = makeRepository('@R1@', { name: 'Stadtbücherei' });

    render(RepositoryForm, { props: { appState, repository } });

    const select = screen.getByLabelText('Typ') as HTMLSelectElement;
    // Das Vokabular ist deutsch sichtbar …
    expect(Array.from(select.options).map((o) => o.textContent)).toContain('Bibliothek');
    // … der Optionswert bleibt der englische GRAMPS-Enum-Wert.
    await fireEvent.change(select, { target: { value: 'Library' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.repositories.get('@R1@')?.type).toBe('Library');
  });

  it('kein Option-Text ist ein roher englischer GRAMPS-Wert', () => {
    const appState = createAppState();
    render(RepositoryForm, { props: { appState, repository: makeRepository('@R1@') } });

    const texts = Array.from((screen.getByLabelText('Typ') as HTMLSelectElement).options).map(
      (o) => o.textContent,
    );
    for (const raw of ['Library', 'Cemetery', 'Church', 'Archive', 'Web site', 'Bookstore', 'Safe']) {
      expect(texts).not.toContain(raw);
    }
  });

  it('ein Bestandswert außerhalb des Vokabulars überlebt Öffnen + Speichern (LP-1)', async () => {
    // Ein GRAMPS-Custom-Typ darf nicht dadurch verschwinden, dass jemand den Editor
    // öffnet und speichert — er wird als zusätzliche, ausgewählte Option angehängt.
    const appState = createAppState();
    const repository = makeRepository('@R1@', { name: 'Sonderfall', type: 'Sondersammlung Bistum' });

    render(RepositoryForm, { props: { appState, repository } });

    const select = screen.getByLabelText('Typ') as HTMLSelectElement;
    expect(select.value).toBe('Sondersammlung Bistum');

    await fireEvent.click(screen.getByText('Speichern'));
    expect(appState.db.repositories.get('@R1@')?.type).toBe('Sondersammlung Bistum');
  });

  it('unterscheidet „kein Typ" von ausdrücklich „Unbekannt" (kein stiller Wertverlust)', async () => {
    const appState = createAppState();
    const repository = makeRepository('@R1@', { name: 'Archiv X', type: 'Unknown' });

    render(RepositoryForm, { props: { appState, repository } });

    const select = screen.getByLabelText('Typ') as HTMLSelectElement;
    expect(select.value).toBe('Unknown');
    await fireEvent.click(screen.getByText('Speichern'));
    expect(appState.db.repositories.get('@R1@')?.type).toBe('Unknown');
  });
});
