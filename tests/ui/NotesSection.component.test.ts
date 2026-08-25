// @vitest-environment happy-dom
// tests/ui/NotesSection.component.test.ts — BL-381: die Notiz-Sektion an der Oberfläche.
//
// Geprüft wird, was das Modell allein nicht zeigen kann: dass die Schwelle wirklich einen
// Aufklapper erzeugt (und darunter keinen), dass die Herkunft an der Zeile steht und dass
// eine geteilte Notiz ihre Mitverwender VOR dem Aufklappen nennt.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import NotesSection from '../../ui/shell/NotesSection.svelte';
import { makeDatabase, makePerson, makeNote } from '../../core/model/factory';
import type { Database } from '../../core/model/types';

function bestand(): Database {
  return makeDatabase();
}

describe('BL-381 — NotesSection', () => {
  it('zeigt eine kurze Notiz direkt, ohne Aufklapper', () => {
    const db = bestand();
    const p = makePerson('@I1@');
    p.noteText = 'Magendurchbruch nach Magengeschwür';
    render(NotesSection, { db, owner: p });

    expect(screen.getByText('Magendurchbruch nach Magengeschwür')).toBeTruthy();
    expect(document.querySelector('details')).toBeNull();
  });

  it('legt eine lange Notiz hinter ein <details> — mit Anriss und Umfang statt „Mehr"', () => {
    const db = bestand();
    const p = makePerson('@I1@');
    p.noteText = '[Hof] Der alte Duesmannhof war ein Eigentum des Hauses Asbeck.\n'
      + 'Den Zehnten besaß der Knappe Dideric von Goeblo. Er verkaufte ihn mit dem schmalen '
      + 'Zehnten im Jahre 1361 an die Johanniterkommende in Burgsteinfurt, die ihn bis zur '
      + 'Säkularisation innehatte.';
    render(NotesSection, { db, owner: p });

    const details = document.querySelector('details');
    expect(details).not.toBeNull();
    // Zugeklappt: der Anriss steht da, der volle Text ist im DOM (Suche/Screenreader), aber
    // das <details> ist geschlossen — die Erwartung stimmt mit dem überein, was man sieht.
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByText('[Hof] Der alte Duesmannhof war ein Eigentum…')).toBeTruthy();
    expect(screen.getByText(`${p.noteText.length} Zeichen`)).toBeTruthy();
  });

  it('nennt bei einer geteilten Notiz Herkunft und Mitverwender', () => {
    const db = bestand();
    const n = makeNote('@N1@', { type: 'NOTE' });
    n.text = 'Gemeinsame Anmerkung';
    db.notes.set(n.id, n);
    for (const id of ['@I1@', '@I2@', '@I3@']) {
      const q = makePerson(id);
      q.noteRefs = ['@N1@'];
      db.individuals.set(id, q);
    }
    render(NotesSection, { db, owner: db.individuals.get('@I1@')! });

    expect(screen.getByText('Geteilte Notiz')).toBeTruthy();
    expect(screen.getByText('auch bei 2 weiteren Datensätzen')).toBeTruthy();
  });

  it('führt eigene, weitere und geteilte Notiz in EINER Liste', () => {
    const db = bestand();
    const n = makeNote('@N1@', { type: 'NOTE' });
    n.text = 'Aus dem Kirchenbuch';
    db.notes.set(n.id, n);
    const p = makePerson('@I1@');
    p.noteText = 'Eigene Anmerkung';
    p.extraNotes = ['Zweite Anmerkung'];
    p.noteRefs = ['@N1@'];
    db.individuals.set(p.id, p);
    render(NotesSection, { db, owner: p });

    const zeilen = document.querySelectorAll('.notes-section__row');
    expect(zeilen).toHaveLength(3);
    expect(screen.getByText('Weitere Notiz')).toBeTruthy();
    expect(screen.getByText('Geteilte Notiz')).toBeTruthy();
  });

  it('ohne Notizen erscheint keine leere Sektion', () => {
    const db = bestand();
    render(NotesSection, { db, owner: makePerson('@I1@') });
    expect(document.querySelector('.notes-section')).toBeNull();
  });

  it('erhält die Absatzstruktur (`pre-wrap`) — sie ist bei den langen Notizen der Lesefluss', () => {
    const db = bestand();
    const p = makePerson('@I1@');
    p.noteText = 'Erster Absatz\nZweiter Absatz';
    render(NotesSection, { db, owner: p });
    const el = document.querySelector('.notes-section__text') as HTMLElement;
    expect(el.textContent).toBe('Erster Absatz\nZweiter Absatz');
  });
});
