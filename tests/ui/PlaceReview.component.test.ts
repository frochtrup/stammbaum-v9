// @vitest-environment happy-dom
// tests/ui/PlaceReview.component.test.ts — "Orts-Zuweisungen prüfen" (Klasse P) als
// tatsächliches DOM-Rendering (Spec 32 §6; Spec 11 §6, Spec 20 §1.7). Gegenstück zu
// HofReview.component.test.ts.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PlaceReview from '../../ui/views/place/PlaceReview.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';
import { place, placeMap } from '../core/places-fixtures';

function ambiguousDb() {
  const db = makeDatabase();
  db.placeObjects = placeMap(
    place('@NDS@', { title: 'Niedersachsen' }),
    place('@USA@', { title: 'USA' }),
    place('@OL_DE@', { title: 'Oldenburg', enclosedBy: [{ placeId: '@NDS@', from: null, to: null }] }),
    place('@OL_US@', { title: 'Oldenburg', enclosedBy: [{ placeId: '@USA@', from: null, to: null }] }),
  );
  const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
  person.death.place = 'Oldenburg';
  person.death.date = '1900';
  db.individuals.set('@I1@', person);
  return db;
}

describe('PlaceReview — Klasse P', () => {
  it('zeigt einen Leerzustand, wenn alle Orte eindeutig aufgelöst sind', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects = placeMap(place('@OL@', { title: 'Oldenburg' }));
    const p = makePerson('@I1@');
    p.death.place = 'Oldenburg';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');

    render(PlaceReview, { props: { appState } });

    expect(screen.getByText(/eindeutig aufgelöst/)).toBeTruthy();
  });

  it('listet die mehrdeutige Zeile mit Kontext und beiden Kandidaten (Ketten unterscheidbar)', () => {
    const appState = createAppState();
    appState.loadDatabase(ambiguousDb(), 'test.ged');

    render(PlaceReview, { props: { appState } });

    expect(screen.getByText('Klasse P')).toBeTruthy();
    expect(screen.getByText(/Otto Bauer/)).toBeTruthy();
    // Die Kandidaten MÜSSEN unterscheidbar beschriftet sein — beide heißen "Oldenburg".
    expect(screen.getByText('Ort wählen: Oldenburg › Niedersachsen')).toBeTruthy();
    expect(screen.getByText('Ort wählen: Oldenburg › USA')).toBeTruthy();
  });

  it('„Ort wählen" verknüpft das Event und die Zeile verschwindet', async () => {
    const appState = createAppState();
    appState.loadDatabase(ambiguousDb(), 'test.ged');

    render(PlaceReview, { props: { appState } });
    await fireEvent.click(screen.getByText('Ort wählen: Oldenburg › USA'));

    expect(appState.db.individuals.get('@I1@')!.death.placeId).toBe('@OL_US@');
    // Mehrdeutigkeit gelöst → Review ist leer (das $derived rechnet neu).
    expect(screen.getByText(/eindeutig aufgelöst/)).toBeTruthy();
  });

  it('„Quelle schärfen" navigiert zum Event-Besitzer (Spec 11 §6, deterministischer Weg)', async () => {
    const appState = createAppState();
    appState.loadDatabase(ambiguousDb(), 'test.ged');
    const onNavigateToPerson = vi.fn();

    render(PlaceReview, { props: { appState, onNavigateToPerson } });
    await fireEvent.click(screen.getByText('Quelle schärfen'));

    expect(onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });
});

describe('PlaceReview — Dubletten-Hinweis statt sinnloser Wahl', () => {
  it('zeigt den Dubletten-Hinweis, wenn die Kandidaten nicht unterscheidbar sind', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects = placeMap(
      place('@DE@', { title: 'Deutschland' }),
      place('@B1@', { title: 'Bremen', enclosedBy: [{ placeId: '@DE@', from: null, to: null }] }),
      place('@B2@', { title: 'Bremen', enclosedBy: [{ placeId: '@DE@', from: null, to: null }] }),
    );
    const p = makePerson('@I1@', { given: 'Klaus', surname: 'Decker' });
    p.death.place = 'Bremen';
    p.death.date = '1950';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');

    render(PlaceReview, { props: { appState } });

    expect(screen.getByText(/nicht unterscheidbar/)).toBeTruthy();
    expect(screen.getByText(/Massen-Dedup/)).toBeTruthy();
  });

  it('zeigt den Hinweis NICHT, wenn die Ketten unterscheiden', () => {
    const appState = createAppState();
    appState.loadDatabase(ambiguousDb(), 'test.ged');

    render(PlaceReview, { props: { appState } });

    expect(screen.queryByText(/nicht unterscheidbar/)).toBeNull();
  });
});
