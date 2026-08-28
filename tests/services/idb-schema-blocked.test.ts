// tests/services/idb-schema-blocked.test.ts — der Öffnen-Pfad der lokalen Datenbank in
// den zwei Lagen, die ein Versionssprung erzeugt ([ADR-v9-302], BL-406).
//
// WARUM DAS EINEN TEST BRAUCHT. `openStammbaumDb` hält seine Verbindung bewusst offen
// (`dbPromise` cacht sie, es soll genau EINE geben). Beim ersten Versionssprung seit
// langem (10 → 11) macht diese Entscheidung eine zweite sichtbar: ein Tab mit der alten
// Version blockiert das Upgrade eines neuen — und ohne `onblocked` wird das Promise weder
// erfüllt noch abgelehnt. Der Fehler ist dann kein Absturz, sondern eine Ladeanzeige, die
// nie endet: die unangenehmste Sorte, weil sie nach „langsam" aussieht.
//
// Getestet wird gegen eine Attrappe von `indexedDB`, nicht gegen eine echte Implementierung
// (Spec 32 §5): geprüft wird die REAKTION auf die Ereignisse, nicht IndexedDB selbst.
import { describe, expect, it, vi, afterEach } from 'vitest';

interface FakeReq {
  result: unknown;
  error: unknown;
  onsuccess?: () => void;
  onerror?: () => void;
  onblocked?: () => void;
  onupgradeneeded?: () => void;
}

/** Minimale IDBDatabase-Attrappe — nur, was der Öffnen-Pfad anfasst. */
function fakeDb() {
  return {
    objectStoreNames: { contains: () => true, length: 0 },
    createObjectStore: vi.fn(),
    onversionchange: null as null | (() => void),
    close: vi.fn(),
  };
}

/** Setzt `globalThis.indexedDB` und gibt die Request-Attrappe zum Feuern zurück. */
function stubIndexedDb(): FakeReq {
  const req: FakeReq = { result: fakeDb(), error: null };
  vi.stubGlobal('indexedDB', { open: () => req });
  return req;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules(); // `dbPromise` ist modulweit — jeder Test braucht ein frisches Modul.
});

async function frischesSchema() {
  vi.resetModules();
  return import('../../services/idb-schema');
}

describe('openStammbaumDb — blockiertes Upgrade (BL-406)', () => {
  it('lehnt ab, statt still zu hängen, und nennt die lösende Handlung', async () => {
    const req = stubIndexedDb();
    const { openStammbaumDb } = await frischesSchema();

    const p = openStammbaumDb();
    req.onblocked?.();

    await expect(p).rejects.toThrow(/anderen Registerkarte/);
  });

  it('gibt den Cache frei, damit ein späterer Versuch nach dem Schließen des anderen Tabs greift', async () => {
    const req = stubIndexedDb();
    const { openStammbaumDb } = await frischesSchema();

    const p = openStammbaumDb();
    req.onblocked?.();
    await expect(p).rejects.toThrow();

    // Zweiter Anlauf: derselbe Aufruf muss neu öffnen dürfen. Bliebe das abgelehnte
    // Promise im Cache, wäre die App bis zum Neuladen dauerhaft kaputt — eine
    // Fehlermeldung, die den vom ihr genannten Ausweg selbst versperrt.
    const zweiter = openStammbaumDb();
    req.onsuccess?.();
    await expect(zweiter).resolves.toBeTruthy();
  });
});

describe('openStammbaumDb — die eigene Verbindung macht Platz', () => {
  it('schließt sich auf `versionchange`, statt den nächsten Tab auszusperren', async () => {
    const req = stubIndexedDb();
    const db = req.result as ReturnType<typeof fakeDb>;
    const { openStammbaumDb } = await frischesSchema();

    const p = openStammbaumDb();
    req.onsuccess?.();
    await p;

    expect(typeof db.onversionchange).toBe('function');
    db.onversionchange?.();
    // Ohne dieses `close()` blockiert genau diese Verbindung jedes künftige Upgrade —
    // und weil sie nie geschlossen wird, dauerhaft.
    expect(db.close).toHaveBeenCalled();
  });
});
