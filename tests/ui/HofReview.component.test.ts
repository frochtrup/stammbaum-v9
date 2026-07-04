// @vitest-environment happy-dom
// tests/ui/HofReview.component.test.ts — "Hof-Zuweisungen prüfen"-Review als Component-
// Test (Spec 32 §6; Spec 20 §1.8 [K], Spec 11 §6). Deckt die drei Aktionstypen +
// "Quelle schärfen"-Navigation ab.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import HofReview from '../../ui/views/hof/HofReview.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makePerson, makeFamily } from '../../core/model';
import { place, hof } from '../core/places-fixtures';

describe('HofReview — Klasse A: "Hof anlegen"', () => {
  it('legt einen Hof an und die Zeile verschwindet aus dem Review', async () => {
    const appState = createAppState();
    appState.savePlace(place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' }));
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.death.place = 'Ochtrup';
    person.death.addr = 'Wall 33';
    const db = appState.db;
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');

    render(HofReview, { props: { appState } });

    expect(screen.getByText('Klasse A')).toBeTruthy();
    await fireEvent.click(screen.getByText('+ Hof anlegen'));

    expect(person.death.hofId).toBeTruthy();
    expect(screen.getByText(/Keine offenen Zuweisungen/)).toBeTruthy();
  });
});

describe('HofReview — Klasse C: "Hof wählen"', () => {
  it('verknüpft das Event mit dem gewählten Hof-Kandidaten', async () => {
    const appState = createAppState();
    appState.savePlace(place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' }));
    appState.saveHof(hof('_hof_a', '@OCHTRUP@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.saveHof(hof('_hof_b', '@OCHTRUP@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));

    const husband = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    const wife = makePerson('@I2@', { given: 'Anna', surname: 'Klein' });
    const db = appState.db;
    db.individuals.set('@I1@', husband);
    db.individuals.set('@I2@', wife);
    const fam = makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' });
    fam.marriage.place = 'Ochtrup';
    fam.marriage.addr = 'Wall 33';
    fam.marriage.type = 'RESI';
    db.families.set('@F1@', fam);
    appState.loadDatabase(db, 'test.ged');

    render(HofReview, { props: { appState } });

    expect(screen.getByText('Klasse C')).toBeTruthy();
    // beide Kandidaten heißen gleich (identische Adresse, das IST die Mehrdeutigkeit) —
    // ein Klick auf einen der beiden reicht, um die Aktion zu verifizieren.
    const candidateButtons = screen.getAllByText('Hof wählen: Wall 33');
    await fireEvent.click(candidateButtons[0]);

    expect(fam.marriage.hofId).toMatch(/^_hof_/);
  });
});

describe('HofReview — "Quelle schärfen" navigiert zur Person/Familie', () => {
  it('ruft onNavigateToPerson mit der Owner-Id auf', async () => {
    const appState = createAppState();
    appState.savePlace(place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' }));
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.death.place = 'Ochtrup';
    person.death.addr = 'Wall 33';
    const db = appState.db;
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');
    const onNavigateToPerson = vi.fn();

    render(HofReview, { props: { appState, onNavigateToPerson } });
    await fireEvent.click(screen.getByText('Quelle schärfen'));

    expect(onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });
});

describe('HofReview — Leerzustand ohne offene Zuweisungen', () => {
  it('zeigt einen definierten Leerzustand', () => {
    const appState = createAppState();

    render(HofReview, { props: { appState } });

    expect(screen.getByText(/Keine offenen Zuweisungen/)).toBeTruthy();
  });
});
