// tests/ui/place-merge-reload-realdaten.test.ts — die Zusicherung, die ADR-v9-222 trägt,
// am ECHTEN Bestand: ein Dubletten-Merge muss den nächsten Ladepass ÜBERLEBEN.
//
// WARUM ES DIESEN TEST GIBT. Bis ADR-v9-222 sammelte der Überlebende die Namen und
// Verwaltungsketten aller Verlierer ein. Das war nicht bloß Buchhaltung: genau daran
// dockten beim nächsten Laden die Ereignisse wieder an, die zum Merge-Zeitpunkt mehrdeutig
// waren (`placeId == null`, Review-Klasse P) und deshalb von `placeRemap` nicht erfasst
// wurden. Nimmt man die Faltung ersatzlos weg, legt der Village-Seed den Verlierer aus
// deren unverändertem PLAC-Text neu an — der Merge hält dann bis zum nächsten Öffnen.
//
// GEMESSENE ROT-PROBE (2026-08-05, `Unsere Familie 2026.ged`, alle 41 Dubletten-Gruppen):
//   Faltung (vorher)            424 → 295 Orte, nach Reload 295, 0 neu geseedet
//   strikt OHNE Nachbindung     424 → 295 Orte, nach Reload 309, 14 neu geseedet ← Defekt
//   strikt MIT  Nachbindung     424 → 295 Orte, nach Reload 295, 0 neu geseedet
// Die betroffenen 14 waren durchweg Perioden-Varianten desselben Dorfes („Steinwedel"
// unter Fürstentum Lüneburg / Kurfürstentum Braunschweig-Lüneburg / Kurfürstentum
// Hannover / Département de l'Aller), zusammen 35 Ereignisse.
//
// WARUM ÜBER `createAppState` und nicht über den reinen Kern: die Nachbindung IST die
// Arbeitsteilung — der Kern meldet `mentionNames`, das Kommando wendet sie an (wie bei
// `placeRemap`/`hofRemap`, ADR-v9-92/-195). Ein Test am reinen `mergePlaceObjects` würde
// die eine Hälfte prüfen und die andere annehmen.
import { describe, expect, it } from 'vitest';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { parseGedcom } from '../../core/interop';
import { applyPlaceResolution } from '../../services/places';
import { mapAllEvents } from '../../core/model/draft';
import { findPlaceDuplicates } from '../../core/places';
import type { PlaceId } from '../../core/model/types';
import { realbestandText, realbestandVorhanden, fehlendHinweis, REALBESTAND } from '../core/realdaten';

describe.skipIf(!realbestandVorhanden())('Orts-Merge überlebt den Reload (ADR-v9-222)', () => {
  it(`legt nach dem Zusammenführen aller Dubletten-Gruppen keinen Verlierer neu an — sonst: ${fehlendHinweis()}`, () => {
    const geparst = parseGedcom(realbestandText());
    applyPlaceResolution(geparst.db); // erster Ladepass, wie beim echten Öffnen
    expect(geparst.db.individuals.size).toBe(REALBESTAND.erwartet.individuals);

    const appState = createAppState();
    appState.loadDatabase(geparst.db, REALBESTAND.datei);

    const gruppen = findPlaceDuplicates(appState.db.placeObjects, 'places');
    expect(gruppen.length).toBeGreaterThan(0); // sonst prüft der Test nichts

    for (const g of gruppen) {
      const ids = g.ids as PlaceId[];
      const [gewinner, ...verlierer] = ids;
      if (!appState.db.placeObjects.has(gewinner)) continue;
      const offen = verlierer.filter((id) => appState.db.placeObjects.has(id));
      if (offen.length > 0) appState.mergePlace(gewinner, offen);
    }
    const nachMerge = appState.db.placeObjects.size;
    expect(nachMerge).toBeLessThan(geparst.db.placeObjects.size); // es wurde wirklich gemergt

    // Reload: `placeId`/`hofId` werden nie persistiert (Spec 11 §2) — der nächste Ladepass
    // leitet sie allein aus dem Ereignistext gegen den gemergten Orts-Bestand ab.
    const neuGeladen = mapAllEvents(appState.db, (ev) => ({ ...ev, placeId: null, hofId: null }));
    neuGeladen.placeObjects = new Map(appState.db.placeObjects);
    neuGeladen.hofObjects = new Map(appState.db.hofObjects);
    applyPlaceResolution(neuGeladen);

    // DIE Zusicherung: der Seed hat nichts nachgelegt. Jeder neue Ort hier ist ein
    // zurückgekehrter Verlierer.
    expect(neuGeladen.placeObjects.size).toBe(nachMerge);
  });
});
