// @vitest-environment happy-dom
// tests/ui/NotesSection.component.test.ts — BL-381 (Anzeige) + BL-382 (Bearbeitung).
//
// Geprüft wird, was das Modell allein nicht zeigen kann: dass die Schwelle wirklich einen
// Aufklapper erzeugt (und darunter keinen), dass die Herkunft an der Zeile steht, dass eine
// geteilte Notiz ihre Mitverwender VOR dem Aufklappen nennt — und die Unterscheidung, an der
// die Bearbeitung hängt: `🗑` löscht die eigene Notiz, `✕` löst nur den Verweis auf eine
// geteilte ([ADR-v9-263] E4).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import NotesSection from '../../ui/shell/NotesSection.svelte';
import { makeDatabase, makePerson, makeNote } from '../../core/model/factory';
import type { Database, Note, Person } from '../../core/model/types';
import type { AppState } from '../../ui/shell/app-state.svelte';

/** Nur die zwei Zugänge, die die Sektion benutzt — der Rest von `AppState` ist hier tot. */
function fakeAppState(db: Database): { appState: AppState; saveNote: ReturnType<typeof vi.fn> } {
  const saveNote = vi.fn((n: Note) => db.notes.set(n.id, n));
  return { appState: { db, saveNote } as unknown as AppState, saveNote };
}

function baue(owner: Person, db: Database = makeDatabase()) {
  const { appState, saveNote } = fakeAppState(db);
  const onOwnerChange = vi.fn();
  render(NotesSection, { appState, owner, onOwnerChange });
  return { onOwnerChange, saveNote, db };
}

function geteiltePerson(): { db: Database; person: Person } {
  const db = makeDatabase();
  const n = makeNote('@N1@', { type: 'NOTE' });
  n.text = 'Gemeinsame Anmerkung';
  db.notes.set(n.id, n);
  for (const id of ['@I1@', '@I2@', '@I3@']) {
    const q = makePerson(id);
    q.noteRefs = ['@N1@'];
    db.individuals.set(id, q);
  }
  return { db, person: db.individuals.get('@I1@')! };
}

describe('BL-381 — NotesSection: Anzeige', () => {
  it('zeigt eine kurze Notiz direkt, ohne Aufklapper', () => {
    const p = makePerson('@I1@');
    p.noteText = 'Magendurchbruch nach Magengeschwür';
    baue(p);

    expect(screen.getByText('Magendurchbruch nach Magengeschwür')).toBeTruthy();
    expect(document.querySelector('details')).toBeNull();
  });

  it('legt eine lange Notiz hinter ein <details> — mit Anriss und Umfang statt „Mehr"', () => {
    const p = makePerson('@I1@');
    p.noteText = '[Hof] Der alte Duesmannhof war ein Eigentum des Hauses Asbeck.\n'
      + 'Den Zehnten besaß der Knappe Dideric von Goeblo. Er verkaufte ihn mit dem schmalen '
      + 'Zehnten im Jahre 1361 an die Johanniterkommende in Burgsteinfurt, die ihn bis zur '
      + 'Säkularisation innehatte.';
    baue(p);

    const details = document.querySelector('details') as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(screen.getByText('[Hof] Der alte Duesmannhof war ein Eigentum…')).toBeTruthy();
    expect(screen.getByText(`${p.noteText.length} Zeichen`)).toBeTruthy();
  });

  it('nennt bei einer geteilten Notiz Herkunft und Mitverwender', () => {
    const { db, person } = geteiltePerson();
    baue(person, db);

    expect(screen.getByText('Geteilte Notiz')).toBeTruthy();
    expect(screen.getByText('auch bei 2 weiteren Datensätzen')).toBeTruthy();
  });

  it('führt eigene, weitere und geteilte Notiz in EINER Liste', () => {
    const db = makeDatabase();
    const n = makeNote('@N1@', { type: 'NOTE' });
    n.text = 'Aus dem Kirchenbuch';
    db.notes.set(n.id, n);
    const p = makePerson('@I1@');
    p.noteText = 'Eigene Anmerkung';
    p.extraNotes = ['Zweite Anmerkung'];
    p.noteRefs = ['@N1@'];
    db.individuals.set(p.id, p);
    baue(p, db);

    expect(document.querySelectorAll('.notes-section__row')).toHaveLength(3);
    expect(screen.getByText('Weitere Notiz')).toBeTruthy();
    expect(screen.getByText('Geteilte Notiz')).toBeTruthy();
  });

  it('erhält die Absatzstruktur (`pre-wrap`) — sie ist bei den langen Notizen der Lesefluss', () => {
    const p = makePerson('@I1@');
    p.noteText = 'Erster Absatz\nZweiter Absatz';
    baue(p);
    expect((document.querySelector('.notes-section__text') as HTMLElement).textContent)
      .toBe('Erster Absatz\nZweiter Absatz');
  });
});

describe('BL-382 — NotesSection: Bearbeitung', () => {
  it('ohne Notizen steht die Sektion trotzdem da — sonst gäbe es keinen Einstieg', () => {
    baue(makePerson('@I1@'));
    expect(document.querySelector('.notes-section')).not.toBeNull();
    expect(screen.getByRole('button', { name: '+ Notiz' })).toBeTruthy();
  });

  it('„+ Notiz" legt die erste Notiz als eigene an, die zweite als weitere', async () => {
    const p = makePerson('@I1@');
    p.noteText = 'Schon da';
    const { onOwnerChange } = baue(p);

    await fireEvent.click(screen.getByRole('button', { name: '+ Notiz' }));
    await fireEvent.input(screen.getByLabelText('Neue Notiz'), { target: { value: 'Zweite Notiz' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onOwnerChange).toHaveBeenCalledWith(
      expect.objectContaining({ noteText: 'Schon da', extraNotes: ['Zweite Notiz'] }),
    );
  });

  it('ein Edit an der eigenen Notiz geht an den TRÄGER', async () => {
    const p = makePerson('@I1@');
    p.noteText = 'Alt';
    const { onOwnerChange, saveNote } = baue(p);

    await fireEvent.click(screen.getByRole('button', { name: 'Notiz bearbeiten' }));
    await fireEvent.input(screen.getByLabelText('Notiztext'), { target: { value: 'Neu' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onOwnerChange).toHaveBeenCalledWith(expect.objectContaining({ noteText: 'Neu' }));
    expect(saveNote).not.toHaveBeenCalled();
  });

  it('ein Edit an der GETEILTEN Notiz geht an den Record, nicht an den Träger', async () => {
    const { db, person } = geteiltePerson();
    const { onOwnerChange, saveNote } = baue(person, db);

    await fireEvent.click(screen.getByRole('button', { name: 'Geteilte Notiz bearbeiten' }));
    await fireEvent.input(screen.getByLabelText('Notiztext'), { target: { value: 'Korrigiert' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(saveNote).toHaveBeenCalledWith(expect.objectContaining({ id: '@N1@', text: 'Korrigiert' }));
    expect(onOwnerChange).not.toHaveBeenCalled();
  });

  /**
   * Die Glyphen-Unterscheidung, an der die ganze Zeile hängt ([ADR-v9-263] E4): `🗑` heißt
   * „der Eintrag verschwindet" und steht nur an eigenen Notizen; an einer geteilten steht
   * `✕`, weil dort nur der VERWEIS gelöst wird.
   */
  it('trägt 🗑 an der eigenen und ✕ an der geteilten Notiz', () => {
    const { db, person } = geteiltePerson();
    person.noteText = 'Eigene';
    baue(person, db);

    const knoepfe = [...document.querySelectorAll('.notes-section__row')].map(
      (r) => (r.querySelector('[data-variant="danger"]') as HTMLElement).textContent?.trim(),
    );
    expect(knoepfe).toEqual(['🗑', '✕']);
    expect(screen.getByRole('button', { name: 'Notiz löschen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verweis auf die geteilte Notiz entfernen' })).toBeTruthy();
  });

  it('🗑 fragt nach und löscht dann die eigene Notiz', async () => {
    const p = makePerson('@I1@');
    p.noteText = 'Geht weg';
    const { onOwnerChange } = baue(p);

    await fireEvent.click(screen.getByRole('button', { name: 'Notiz löschen' }));
    expect(screen.getByText('Notiz löschen?')).toBeTruthy(); // ConfirmDialog, kein confirm()
    await fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));

    expect(onOwnerChange).toHaveBeenCalledWith(expect.objectContaining({ noteText: '' }));
  });

  it('✕ löst nur den Verweis — der Record bleibt im Bestand', async () => {
    const { db, person } = geteiltePerson();
    const { onOwnerChange, saveNote } = baue(person, db);

    await fireEvent.click(screen.getByRole('button', { name: 'Verweis auf die geteilte Notiz entfernen' }));
    expect(screen.getByText('Verweis entfernen?')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Entfernen' }));

    expect(onOwnerChange).toHaveBeenCalledWith(expect.objectContaining({ noteRefs: [] }));
    expect(saveNote).not.toHaveBeenCalled();
    expect(db.notes.get('@N1@')).toBeTruthy();
  });

  it('Abbrechen verwirft den Entwurf, ohne etwas zu speichern', async () => {
    const p = makePerson('@I1@');
    p.noteText = 'Unverändert';
    const { onOwnerChange } = baue(p);

    await fireEvent.click(screen.getByRole('button', { name: 'Notiz bearbeiten' }));
    await fireEvent.input(screen.getByLabelText('Notiztext'), { target: { value: 'verworfen' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(onOwnerChange).not.toHaveBeenCalled();
    expect(screen.getByText('Unverändert')).toBeTruthy();
  });
});
