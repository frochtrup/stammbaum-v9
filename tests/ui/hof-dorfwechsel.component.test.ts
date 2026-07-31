// @vitest-environment happy-dom
// tests/ui/hof-dorfwechsel.component.test.ts — der Ortspicker am Hof (BL-236, ADR-v9-172).
//
// Liegt bewusst bei den GETEILTEN Views, nicht unter tests/orte: Gegenstand ist
// `HofDetail`, das beide Programme zeigen. Dass hier der Editor-Wirt eingesetzt wird, ist
// eine Bequemlichkeit (er ist die kleinste PlacesHost-Implementierung), keine Aussage über
// die Zugehörigkeit — die entscheidet der Beleg-Pfad (L8).
//
// Prüft die Fläche, nicht die Fachlogik (die liegt in tests/core + tests/services): steht
// der Picker nur im Bearbeiten-Modus (ADR-v9-30: kein ungegatetes Mutations-Control auf der
// Lesefläche), committet er sofort, und schaltet die Ansicht bei einer Konsolidierung auf
// den Überlebenden um?
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import HofDetail from '../../ui/views/hof/HofDetail.svelte';
import { createOrteHost } from '../../app-orte/orte-state.svelte';
import { createOrteNav } from '../../app-orte/orte-nav.svelte';
import { place, hof } from '../core/places-fixtures';

const adresse = (v: string) => [{ value: v, lang: 'deu', from: null, to: null, dateRaw: null }];

function wirt(hoefe = [hof('_hof_a_@P1@', '@P1@', { addrs: adresse('Wall 33') })]) {
  const host = createOrteHost();
  host.loadContent({
    placeObjects: new Map([
      ['@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' })],
      ['@P2@', place('@P2@', { title: 'Rheine', type: 'Village' })],
    ]),
    hofObjects: new Map(hoefe.map((h) => [h.id, h])),
  });
  return host;
}

describe('Dorf des Hofes ändern', () => {
  it('zeigt den Picker erst im Bearbeiten-Modus', async () => {
    const host = wirt();
    const nav = createOrteNav();
    nav.setCurrent('hof', '_hof_a_@P1@');
    render(HofDetail, { props: { appState: host, viewState: nav } });

    expect(screen.queryByLabelText('Dorf des Hofes')).toBeNull();
    await fireEvent.click(screen.getByText(/Bearbeiten/));
    expect(screen.getByLabelText('Dorf des Hofes')).toBeTruthy();
  });

  it('hängt den Hof um und macht es im Bestand sichtbar', () => {
    const host = wirt();
    host.moveHof('_hof_a_@P1@', '@P2@');
    expect(host.db.hofObjects.get('_hof_a_@P1@')?.villageId).toBe('@P2@');
    expect(host.dirty).toBe(true);
  });

  it('nimmt der Undo-Stapel den Umzug zurück', () => {
    const host = wirt();
    host.moveHof('_hof_a_@P1@', '@P2@');
    host.undo();
    expect(host.db.hofObjects.get('_hof_a_@P1@')?.villageId).toBe('@P1@');
  });

  it('konsolidiert bei Kollision und meldet es sichtbar', async () => {
    const host = wirt([
      hof('_hof_a_@P1@', '@P1@', { addrs: adresse('Wall 33') }),
      hof('_hof_b_@P2@', '@P2@', { addrs: adresse('Wall 33') }),
    ]);
    const nav = createOrteNav();
    nav.setCurrent('hof', '_hof_a_@P1@');
    render(HofDetail, { props: { appState: host, viewState: nav } });
    await fireEvent.click(screen.getByText(/Bearbeiten/));

    // Der Picker ist eine Combobox — der Wechsel läuft über das Kommando, das er auslöst.
    const ergebnis = host.moveHof('_hof_a_@P1@', '@P2@');
    expect(ergebnis.merged).toBe(1);
    expect(host.db.hofObjects.size).toBe(1);
    // Und die Ansicht muss auf den Überlebenden zeigen können.
    expect(host.db.hofObjects.has(ergebnis.hofId)).toBe(true);
  });
});
