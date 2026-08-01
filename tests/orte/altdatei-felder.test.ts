// @vitest-environment happy-dom
// tests/orte/altdatei-felder.test.ts — Bearbeiten eines Orts aus einer ÄLTEREN orte.json.
//
// ANLASS (Browser-Verifikation des Editors, an echten Daten): `shortName` (ADR-v9-90) und
// `translations` (ADR-v9-144) sind nachträglich ergänzte, abwärtskompatible Felder. An
// einem Ort aus einer älteren Datei fehlen sie — und `shortName.trim()` in
// `PlaceEditForm.save()` warf `Cannot read properties of undefined`. Gemessen: ALLE 128
// Orte in `tools/handbuch/fixtures/orte.json` sind davon betroffen.
//
// WARUM ES NIEMAND GEMERKT HAT: Die Fixtures des Hauptprogramms bauen PlaceObjects über
// einen Helfer, der jedes Feld setzt. Ein „echtes" Objekt aus einer fremden Datei sieht
// anders aus als ein konstruiertes — und der Editor bekommt naturgemäß Dateien beliebigen
// Alters. Der Test baut die Objekte deshalb ABSICHTLICH ohne die späten Felder, statt den
// Fixture-Helfer zu benutzen.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PlaceDetail from '../../ui/views/place/PlaceDetail.svelte';
import { createOrteHost } from '../../app-orte/orte-state.svelte';
import { createOrteNav } from '../../app-orte/orte-nav.svelte';
import type { PlaceObject } from '../../core/places';

/** Ein Ort, wie er in einer orte.json VOR ADR-v9-90/-144 steht — ohne shortName/translations. */
function altesPlaceObject(): PlaceObject {
  return {
    id: '@P1@',
    title: 'Alt Kosser',
    type: 'Town',
    pnames: [],
    enclosedBy: [],
    lat: null,
    long: null,
    note: '',
    existsFrom: null,
    existsTo: null,
    govId: null,
    govTypes: null
  } as unknown as PlaceObject;
}

function hostMitAltemOrt() {
  const host = createOrteHost();
  host.loadContent({ placeObjects: new Map([['@P1@', altesPlaceObject()]]), hofObjects: new Map() });
  return host;
}

describe('Ort aus älterer orte.json', () => {
  it('lässt sich anzeigen', () => {
    const host = hostMitAltemOrt();
    const nav = createOrteNav();
    nav.setCurrent('place', '@P1@');
    render(PlaceDetail, { props: { appState: host, viewState: nav } });
    expect(screen.getAllByText(/Alt Kosser/).length).toBeGreaterThan(0);
  });

  it('lässt sich bearbeiten und speichern, ohne zu werfen', async () => {
    const host = hostMitAltemOrt();
    const nav = createOrteNav();
    nav.setCurrent('place', '@P1@');
    render(PlaceDetail, { props: { appState: host, viewState: nav } });

    await fireEvent.click(screen.getByText(/Bearbeiten/));
    // Über die Beschriftung statt über eine CSS-Klasse: seit BL-273 kommen die
    // beschrifteten Knöpfe aus `.stb-btn`, eine view-eigene Klasse gibt es nicht mehr.
    // Ein Test, der an der Optik hängt, bricht bei jeder Konsolidierung erneut.
    await fireEvent.click(screen.getByText('Speichern'));

    // Die fehlenden Felder sind danach gesetzt, nicht undefined — sonst wanderte das
    // Problem beim nächsten Speichern in die Datei.
    const saved = host.db.placeObjects.get('@P1@')!;
    expect(saved.shortName).toBe('');
    expect(saved.title).toBe('Alt Kosser');
  });
});

describe('Notiz-Anzeige (TST-14 — Eingabe und Anzeige sind zwei Kontrakte)', () => {
  it('zeigt die gespeicherte Notiz in der Leseansicht des Orts', () => {
    // Gefunden bei der Browser-Verifikation: die Notiz ließ sich eingeben und landete
    // korrekt in der Datei, war danach aber in KEINER Leseansicht zu sehen. Betrifft
    // beide Programme — dieselbe Komponente.
    const host = hostMitAltemOrt();
    host.savePlace({ ...host.db.placeObjects.get('@P1@')!, note: 'Kirchenbuch geprüft 1802' });
    const nav = createOrteNav();
    nav.setCurrent('place', '@P1@');
    render(PlaceDetail, { props: { appState: host, viewState: nav } });
    expect(screen.getByText('Kirchenbuch geprüft 1802')).toBeTruthy();
  });
});
