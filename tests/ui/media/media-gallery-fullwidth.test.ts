// @vitest-environment happy-dom
// tests/ui/media/media-gallery-fullwidth.test.ts — Flächen-Übersicht statt Listenspalte
// (ADR-v9-192, Spec 21 §3/§10n).
//
// Der Multi-Pane (Spec 21 §3) ist die Regel, nicht das Naturgesetz: er trägt eine LISTE
// neben einem Detail. Die Medien-Kachelgalerie ist keine Liste — im 22rem-Pane blieb vom
// `auto-fill`-Raster genau eine Kachelspalte übrig, während zwei Drittel des Fensters den
// Leerzustand trugen. Dieser Test hält die Ausnahme fest, und zwar an ihren drei
// beobachtbaren Folgen: kein Listen-Pane, Detail ERSETZT die Galerie, und deshalb —
// anders als bei den Multi-Pane-Segmenten — ein Rückweg auch auf Desktop.
//
// Die Gegenprobe (Personen-Segment bleibt Multi-Pane) steht bewusst mit drin: eine
// Ausnahme, die still zur Regel wird, ist der eigentliche Schaden.
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import EntityTab from '../../../ui/views/EntityTab.svelte';
import { createAppState } from '../../../ui/shell/app-state.svelte';
import { createViewState } from '../../../ui/shell/view-state.svelte';
import { createRoute } from '../../../ui/shell/route.svelte';
import { pinLayout } from '../layout-harness';
import { layout } from '../../../ui/shell/layout.svelte';
import { makeDatabase, makeMedia, makeMediaCitation, makePerson } from '../../../core/model';

let unpin: () => void;
afterEach(() => {
  unpin();
  layout.reset();
});

function seed() {
  const db = makeDatabase();
  db.media.set('Pictures/anna.jpg', makeMedia('Pictures/anna.jpg', { title: 'Anna Portrait' }));
  db.media.set('Pictures/otto.jpg', makeMedia('Pictures/otto.jpg', { title: 'Otto Portrait' }));
  const p = makePerson('@I1@', { given: 'Anna', surname: 'Klein' });
  p.media = [makeMediaCitation('Pictures/anna.jpg')];
  db.individuals.set(p.id, p);
  const appState = createAppState();
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

function mount() {
  const viewState = createViewState();
  const route = createRoute({ entityTarget: 'media' });
  route.setTarget('media');
  render(EntityTab, { props: { appState: seed(), viewState, route } });
  return { viewState };
}

describe('Medien auf Desktop — die Galerie bekommt die ganze Fläche', () => {
  beforeEach(() => {
    unpin = pinLayout(true);
  });

  it('rendert KEINE Listenspalte — die Galerie liegt in der Flächen-Hülle', () => {
    mount();

    expect(document.querySelector('.entity-tab__pane--list')).toBeNull();
    expect(document.querySelector('.entity-tab__pane--area')).toBeTruthy();
    expect(screen.getByText('Anna Portrait')).toBeTruthy();
  });

  it('zeigt KEINEN Leerzustand „Kein Eintrag ausgewählt" — es gibt keinen leeren Nachbarn', () => {
    mount();

    expect(screen.queryByText(/Kein Eintrag ausgewählt/)).toBeNull();
  });

  it('schaltet bei Auswahl auf die Detailsicht um, statt sie danebenzustellen', async () => {
    const { viewState } = mount();

    await fireEvent.click(screen.getByText('Anna Portrait'));

    expect(viewState.getCurrent('media')).toBe('Pictures/anna.jpg');
    // Die zweite Kachel ist weg: das Detail hat die Fläche übernommen.
    expect(screen.queryByText('Otto Portrait')).toBeNull();
  });

  it('behält „← Zurück" auch auf Desktop — ohne sichtbare Galerie wäre es eine Sackgasse', async () => {
    mount();
    await fireEvent.click(screen.getByText('Anna Portrait'));

    expect(screen.getByRole('button', { name: /Zurück/ })).toBeTruthy();
  });

  it('behält die Facetten-Auswahl über den Weg ins Medium und zurück (Spec 21 §5)', async () => {
    // Die Kehrseite der ganzflächigen Galerie: sie baut beim Öffnen eines Mediums ab.
    // Läge ihr Filterzustand komponenten-lokal, wäre er nach jedem Rückweg weg — im
    // Multi-Pane fiel das nicht auf, weil die Listenspalte stehen blieb.
    mount();
    await fireEvent.click(screen.getByRole('button', { name: /Personen/ }));
    expect(screen.getByRole('button', { name: /Personen/ }).getAttribute('aria-pressed')).toBe('true');

    await fireEvent.click(screen.getByText('Anna Portrait'));
    await fireEvent.click(screen.getByRole('button', { name: /Zurück/ }));

    expect(screen.getByRole('button', { name: /Personen/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('Gegenprobe: das Personen-Segment bleibt Multi-Pane (die Ausnahme greift nur bei Medien)', () => {
    const route = createRoute({ entityTarget: 'person' });
    render(EntityTab, { props: { appState: seed(), viewState: createViewState(), route } });

    expect(document.querySelector('.entity-tab__pane--list')).toBeTruthy();
    expect(document.querySelector('.entity-tab__pane--area')).toBeNull();
  });
});

describe('Mobile ändert sich nicht — dort war die Galerie schon ganzflächig', () => {
  beforeEach(() => {
    unpin = pinLayout(false);
  });

  it('rendert weder Panes noch Flächen-Hülle, sondern die Galerie allein', () => {
    mount();

    expect(document.querySelector('.entity-tab__pane--area')).toBeNull();
    expect(document.querySelector('.entity-tab__pane--list')).toBeNull();
    expect(screen.getByText('Anna Portrait')).toBeTruthy();
  });

  it('ersetzt die Galerie durch das Detail und behält „← Zurück"', async () => {
    mount();
    await fireEvent.click(screen.getByText('Anna Portrait'));

    expect(screen.queryByText('Otto Portrait')).toBeNull();
    expect(screen.getByRole('button', { name: /Zurück/ })).toBeTruthy();
  });
});
