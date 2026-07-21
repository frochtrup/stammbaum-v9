// tests/services/places-sync-tiebreak.test.ts — BL-82: der Union-Merge entscheidet bei
// Kollisionen am gemeinsamen Vorfahren, nicht an der Uhr (Spec 30 §4 LP-9, Spec 11 §2).
//
// DER BEFUND. Der Tie-Break verglich `clock.now()` (den Zeitpunkt DIESES Speicherns) mit
// `remote.ts` (dem Zeitpunkt, zu dem das andere Gerät gespeichert hat). Das ist kein
// Vergleich zweier Inhalts-Alter, sondern „jetzt" gegen „irgendwann früher" — `now()` ist
// per Definition größer als jeder bereits gespeicherte Zeitstempel. Die lokale Seite
// gewann damit IMMER; „neueres ts gewinnt" war in Wahrheit Last-Write-Wins.
//
// WARUM ES NIEMANDEM AUFFIEL. Die bestehenden Tests belegten beide Richtungen — aber mit
// einer Uhr, die 2000 lieferte, während der gespeicherte Stand ts=5000 trug. Eine echte
// Uhr kann das nicht: der gespeicherte Wert stammt aus einem früheren `now()` desselben
// Zeitstrahls. Die Tests prüften ein Szenario, das in der Anwendung nicht vorkommt. Die
// Uhr in DIESER Datei läuft deshalb bewusst realistisch (`JETZT` ist später als jeder
// gespeicherte Zeitstempel) — sonst prüfte der Nachfolger denselben Phantom-Fall.
//
// DIE LÖSUNG. Drei-Wege-Merge: die Basis (der Stand, aus dem die lokale Fassung geladen
// wurde) ist der gemeinsame Vorfahre und beantwortet die Frage, die eine Uhr nicht
// beantworten kann — WER hat sich geändert. Unverändert gegenüber der Basis heißt: diese
// Seite hat nichts zu sagen. Haben BEIDE sich geändert, ist es ein echter Konflikt; er
// wird deterministisch aufgelöst (lokal, die Fassung vor Augen des Nutzers) UND gemeldet,
// statt als „zusammengeführt, kein Datenverlust" verkauft zu werden.
import { describe, expect, it } from 'vitest';
import { PlacesSyncService } from '../../services/places/places-sync-service';
import { PLACES_SCHEMA_VERSION, type PlacesFileWrapper } from '../../services/places/types';
import { place, hof } from '../core/places-fixtures';
import { createMockClock, createMockDeviceId, createMockPlacesStore } from './mock-places-store';

/** Realistische Uhr: „jetzt" liegt hinter JEDEM in dieser Datei gespeicherten ts. */
const JETZT = 9_000_000;

const placeMap = (...ps: ReturnType<typeof place>[]) => new Map(ps.map((p) => [p.id, p]));
const hofMap = (...hs: ReturnType<typeof hof>[]) => new Map(hs.map((h) => [h.id, h]));

function remoteWrapper(patch: Partial<PlacesFileWrapper> = {}): PlacesFileWrapper {
  return {
    schemaVersion: PLACES_SCHEMA_VERSION,
    rev: 2,
    device: 'dev-REMOTE',
    ts: 1000,
    placeObjects: [],
    hofObjects: [],
    ...patch,
  };
}

function dienst(wrapper: PlacesFileWrapper | null, now = JETZT) {
  const store = createMockPlacesStore(wrapper);
  return { store, svc: new PlacesSyncService(store, createMockDeviceId('dev-LOCAL'), createMockClock(now)) };
}

describe('Union-Merge-Tie-Break: der gemeinsame Vorfahre entscheidet (BL-82)', () => {
  it('lokal unverändert, remote geändert → remote gewinnt (der Defekt-Fall)', async () => {
    // Genau die Konstellation, die vorher falsch ausging: dieses Gerät hat seinen Stand
    // vor Stunden geladen und seither an den Orten NICHTS getan; das andere Gerät hat den
    // Titel kuratiert. Mit `now()` als lokalem Zeitstempel gewann trotzdem die alte
    // lokale Fassung und machte die Kuration des anderen Geräts rückgängig.
    const basis = place('P1', { title: 'Ochtrup' });
    const { svc } = dienst(remoteWrapper({ rev: 3, placeObjects: [place('P1', { title: 'Ochtrup (kuratiert)' })] }));

    const res = await svc.reconcileAndSave(placeMap(basis), hofMap(), {
      rev: 2,
      placeObjects: placeMap(basis),
      hofObjects: hofMap(),
    });

    expect(res.placeObjects.get('P1')?.title).toBe('Ochtrup (kuratiert)');
    expect(res.warning).toMatchObject({ kind: 'union-merge', mergedPlaceIds: ['P1'], conflictPlaceIds: [] });
  });

  it('lokal geändert, remote unverändert → lokal gewinnt', async () => {
    const basis = place('P1', { title: 'Ochtrup' });
    const { svc } = dienst(remoteWrapper({ rev: 3, placeObjects: [basis] }));

    const res = await svc.reconcileAndSave(placeMap(place('P1', { title: 'Ochtrup (hier kuratiert)' })), hofMap(), {
      rev: 2,
      placeObjects: placeMap(basis),
      hofObjects: hofMap(),
    });

    expect(res.placeObjects.get('P1')?.title).toBe('Ochtrup (hier kuratiert)');
    expect(res.warning).toMatchObject({ conflictPlaceIds: [] });
  });

  it('beide geändert → echter Konflikt: lokal gewinnt deterministisch UND wird gemeldet', async () => {
    // Hier ist keine Auflösung „richtig" — entscheidend ist, dass die überschriebene
    // Fassung nicht als „kein Datenverlust" durchgeht.
    const basis = place('P1', { title: 'Ochtrup' });
    const { svc } = dienst(remoteWrapper({ rev: 3, placeObjects: [place('P1', { title: 'Ochtrup, Kr. Steinfurt' })] }));

    const res = await svc.reconcileAndSave(placeMap(place('P1', { title: 'Ochtrup (Westf.)' })), hofMap(), {
      rev: 2,
      placeObjects: placeMap(basis),
      hofObjects: hofMap(),
    });

    expect(res.placeObjects.get('P1')?.title).toBe('Ochtrup (Westf.)');
    expect(res.warning).toMatchObject({ mergedPlaceIds: ['P1'], conflictPlaceIds: ['P1'] });
  });

  it('ID auf beiden Seiten neu und verschieden → Konflikt, weil es keinen Vorfahren gibt', async () => {
    const { svc } = dienst(remoteWrapper({ rev: 3, placeObjects: [place('P9', { title: 'Remote-Neuanlage' })] }));

    const res = await svc.reconcileAndSave(placeMap(place('P9', { title: 'Lokale Neuanlage' })), hofMap(), {
      rev: 2,
      placeObjects: placeMap(),
      hofObjects: hofMap(),
    });

    expect(res.warning).toMatchObject({ conflictPlaceIds: ['P9'] });
  });

  it('gilt für Höfe genauso — dieselbe Regel, nicht eine zweite Politik', async () => {
    const basisHof = hof('H1', 'P1', { note: 'alt' });
    const { svc } = dienst(remoteWrapper({ rev: 3, hofObjects: [hof('H1', 'P1', { note: 'remote kuratiert' })] }));

    const res = await svc.reconcileAndSave(placeMap(), hofMap(basisHof), {
      rev: 2,
      placeObjects: placeMap(),
      hofObjects: hofMap(basisHof),
    });

    expect(res.hofObjects.get('H1')?.note).toBe('remote kuratiert');
    expect(res.warning).toMatchObject({ mergedHofIds: ['H1'], conflictHofIds: [] });
  });

  it('das Ergebnis hängt NICHT mehr an der Uhr — zwei Uhren, dieselbe Entscheidung', async () => {
    // Der eigentliche Wächter gegen einen Rückfall: käme wieder ein Zeitvergleich hinein,
    // liefen diese beiden Läufe auseinander.
    const basis = place('P1', { title: 'Ochtrup' });
    const remote = remoteWrapper({ rev: 3, ts: 8_999_999, placeObjects: [place('P1', { title: 'Remote' })] });
    const ergebnisse: (string | undefined)[] = [];
    for (const now of [JETZT, 1]) {
      const { svc } = dienst({ ...remote }, now);
      const res = await svc.reconcileAndSave(placeMap(basis), hofMap(), {
        rev: 2,
        placeObjects: placeMap(basis),
        hofObjects: hofMap(),
      });
      ergebnisse.push(res.placeObjects.get('P1')?.title);
    }
    expect(ergebnisse[0]).toBe(ergebnisse[1]);
    expect(ergebnisse[0]).toBe('Remote');
  });

  it('unveränderte Seiten ohne Kollision bleiben warnungsfrei (kein Fehlalarm)', async () => {
    const { svc } = dienst(remoteWrapper({ rev: 2, placeObjects: [place('P1', { title: 'Ochtrup' })] }));

    const res = await svc.reconcileAndSave(placeMap(place('P1', { title: 'Ochtrup' })), hofMap(), {
      rev: 2,
      placeObjects: placeMap(place('P1', { title: 'Ochtrup' })),
      hofObjects: hofMap(),
    });

    expect(res.warning).toBeNull();
    expect(res.saved).toBe(true);
  });
});
