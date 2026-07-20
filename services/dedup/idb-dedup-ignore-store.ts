// services/dedup/idb-dedup-ignore-store.ts — Persistenz der „kein Duplikat"-Paare
// (BL-105, Spec 20 §1.12, ADR-v9-104).
//
// App-LOKAL in IndexedDB, bewusst NICHT in der Genealogie-Datei — gleiche Begründung und
// gleiche Bauart wie die Regel-Konfiguration (services/validate/val-config-store.ts,
// ADR-v9-96): „diese beiden sind nicht dieselbe Person" ist eine Einschätzung des
// Bearbeiters über seinen Bestand, keine genealogische Aussage. Der GEDCOM-/GRAMPS-Writer
// bleibt unberührt, die Roundtrip-Treue (LP-1) damit auch. Der Preis ist derselbe und
// akzeptiert: zwei Geräte führen je eine eigene Liste.
//
// Plattform-API (indexedDB) NUR hier, hinter dem Store-Vertrag — Kern und UI sehen sie nie
// (Spec 02 §7, Spec 32 §5 TST-3).
import { openStammbaumDb, STORE_DEDUP_IGNORED as STORE_NAME } from '../idb-schema';

const KEY = 'pairs';

/** Speicher-Vertrag — in Tests durch eine In-Memory-Attrappe ersetzbar. */
export interface DedupIgnoreStore {
  load(): Promise<string[]>;
  save(keys: readonly string[]): Promise<void>;
}

export class IdbDedupIgnoreStore implements DedupIgnoreStore {
  async load(): Promise<string[]> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve((req.result as string[] | undefined) ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  async save(keys: readonly string[]): Promise<void> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      // Als einfaches Array unter EINEM Schlüssel statt ein Datensatz je Paar: die Liste
      // wird immer vollständig gelesen (der Filter braucht sie als Menge) und wächst mit
      // bewussten Einzelentscheidungen, nicht mit dem Bestand.
      tx.objectStore(STORE_NAME).put([...keys], KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

/**
 * Ignorier-Liste laden — fällt bei jedem Speicherfehler auf „leer" zurück. Ein defekter
 * Store darf die Duplikat-Suche nicht blockieren: der Nutzer sieht dann wieder Paare, die
 * er schon abgehakt hatte (ärgerlich), statt gar keine Suche zu bekommen (kaputt).
 */
export async function loadIgnoredPairs(store: DedupIgnoreStore): Promise<Set<string>> {
  try {
    return new Set(await store.load());
  } catch {
    return new Set();
  }
}
