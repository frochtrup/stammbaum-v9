// @vitest-environment happy-dom
// tests/orte/orte-flaeche.test.ts — die Orts-Fläche im Editor (OE-5, Spec 22 §3/§6).
//
// Der Punkt dieser Datei ist NICHT, die Orts-Liste noch einmal zu testen — das tun die
// Component-Tests des Hauptprogramms. Geprüft wird, dass DIESELBEN Komponenten mit dem
// eingeschränkten Wirt sinnvoll rendern: was ohne Ereignisse bedeutungslos wäre,
// verschwindet (D1–D4), und was ohne sie funktioniert, bleibt vollständig da.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PlaceList from '../../ui/views/place/PlaceList.svelte';
import PlaceDetail from '../../ui/views/place/PlaceDetail.svelte';
import { createOrteHost } from '../../app-orte/orte-state.svelte';
import { createOrteNav } from '../../app-orte/orte-nav.svelte';
import { place } from '../core/places-fixtures';

function hostWith(...titles: string[]) {
  const host = createOrteHost();
  host.loadContent({
    placeObjects: new Map(titles.map((t, i) => [`@P${i + 1}@`, place(`@P${i + 1}@`, { title: t, type: 'Village' })])),
    hofObjects: new Map()
  });
  return host;
}

describe('Orts-Liste im Editor (D1/D4)', () => {
  it('zeigt ALLE Orte — ohne Ereignisse wäre die Hauptliste sonst leer', () => {
    // Der eigentliche Fallstrick: `hasReference` kann ohne Ereignisse nie zutreffen. Eine
    // ungeprüfte Wiederverwendung hätte hier eine leere Liste gezeigt, obwohl die Datei
    // voll ist (Spec 22 §3.1 D1).
    const host = hostWith('Ochtrup', 'Rheine', 'Ahaus');
    render(PlaceList, { props: { appState: host, viewState: createOrteNav() } });

    expect(screen.getByText('Ochtrup')).toBeTruthy();
    expect(screen.getByText('Rheine')).toBeTruthy();
    expect(screen.getByText('Ahaus')).toBeTruthy();
  });

  it('blendet den „Ohne Bezug"-Umschalter aus (bedeutungslos ohne Ereignisse)', () => {
    const host = hostWith('Ochtrup');
    render(PlaceList, { props: { appState: host, viewState: createOrteNav() } });
    expect(screen.queryByRole('tablist', { name: /Orte-Abschnitt/ })).toBeNull();
  });

  it('zeigt keine Personenzahl an der Zeile', () => {
    const host = hostWith('Ochtrup');
    render(PlaceList, { props: { appState: host, viewState: createOrteNav() } });
    expect(screen.queryByText(/\d+ Person/)).toBeNull();
  });

  it('bietet den Massen-Dedup an — er braucht keine Ereignisse', async () => {
    // Er lebt hinter der „Werkzeuge"-Disclosure (Spec 21 §6h) — im Editor genauso wie im
    // Hauptprogramm, denn es ist dieselbe Komponente.
    const host = hostWith('Ochtrup', 'Ochtrup');
    render(PlaceList, {
      props: { appState: host, viewState: createOrteNav(), onOpenDedup: () => {} }
    });
    await fireEvent.click(screen.getByText('Werkzeuge'));
    expect(screen.getByText(/Massen-Dedup/)).toBeTruthy();
  });

  it('bietet KEINE Zuordnungsprüfung an — sie ist im Editor nicht übergeben (D2)', async () => {
    const host = hostWith('Ochtrup');
    render(PlaceList, { props: { appState: host, viewState: createOrteNav(), onOpenDedup: () => {} } });
    await fireEvent.click(screen.getByText('Werkzeuge'));
    expect(screen.queryByText(/Zuweisungen prüfen/)).toBeNull();
  });

  it('navigiert per Klick in den Steckbrief', async () => {
    const host = hostWith('Ochtrup');
    const nav = createOrteNav();
    render(PlaceList, { props: { appState: host, viewState: nav } });

    await fireEvent.click(screen.getByText('Ochtrup'));
    expect(nav.getCurrent('place')).toBe('@P1@');
  });
});

describe('Orts-Steckbrief im Editor (D3)', () => {
  it('rendert den Ort und blendet die Zeitgenossen aus', () => {
    const host = hostWith('Ochtrup');
    const nav = createOrteNav();
    nav.setCurrent('place', '@P1@');
    render(PlaceDetail, { props: { appState: host, viewState: nav } });

    expect(screen.getAllByText(/Ochtrup/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Zeitgenoss/)).toBeNull();
    // Auch der Ereignis-Abschnitt bleibt weg: seine leere Fassung behauptete „keine
    // Ereignisse an diesem Ort erfasst" — eine Aussage über die Daten, wo die Grundlage
    // fehlt. Gefunden in der eigenen Browser-Verifikation an einem unangereicherten Ort,
    // nicht im Testentwurf (TST-16).
    expect(screen.queryByText(/Ereignisse nach Typ/)).toBeNull();
    expect(screen.queryByText(/Keine Ereignisse an diesem Ort/)).toBeNull();
  });

  it('eine Bearbeitung landet im Bestand (Persistenz-Rundlauf, TST-8)', () => {
    // Nicht „das Kommando wurde aufgerufen", sondern „der Wert ist danach da" — genau die
    // Unterscheidung, an der savePlace/saveHof schon einmal gescheitert sind.
    const host = hostWith('Ochtrup');
    host.savePlace({ ...host.db.placeObjects.get('@P1@')!, note: 'Kirchspiel' });
    expect(host.db.placeObjects.get('@P1@')?.note).toBe('Kirchspiel');
    expect(host.dirty).toBe(true);
  });

  it('Undo nimmt die Bearbeitung zurück', () => {
    const host = hostWith('Ochtrup');
    host.savePlace({ ...host.db.placeObjects.get('@P1@')!, note: 'Kirchspiel' });
    expect(host.canUndo).toBe(true);
    host.undo();
    expect(host.db.placeObjects.get('@P1@')?.note).toBe('');
  });
});

describe('GOV-Übernahme im Editor', () => {
  it('ergänzt Kennung und Namen aus der eingefügten Textzusammenfassung', () => {
    // Der Kernpunkt des Auftrags: GOV-Import ist eine reine, netzfreie Textfunktion und
    // funktioniert im Editor unverändert — inklusive Platzhaltern für Elternorte.
    const host = hostWith('Ochtrup');
    const result = host.importGovEntry(
      '@P1@',
      ['object_162795', 'heißt (auf deu) Ochtrup', 'ist ab 1969-07-01 (auf deu) Stadt', 'gehört ab 1969-07-01 zu object_190334'].join('\n')
    );

    expect(result).not.toBeNull();
    expect(result!.changes).toBeGreaterThan(0);
    expect(host.db.placeObjects.get('@P1@')?.govId).toBe('object_162795');
  });

  it('meldet unbrauchbaren Text, ohne etwas zu ändern', () => {
    const host = hostWith('Ochtrup');
    expect(host.importGovEntry('@P1@', 'irgendein Text ohne Kennung')).toBeNull();
    expect(host.dirty).toBe(false);
  });
});
