// tests/services/idb-schema.test.ts — Regressionstest für einen bei der Browser-
// Verifikation dieser Slice gefundenen Bug: IdbWorkingCopyStore (services/file) und
// IdbPlacesStore (services/places) öffneten je eine EIGENE `indexedDB.open('stammbaum-v9',
// 1)`-Verbindung mit je einem eigenen `onupgradeneeded`-Handler, der nur den eigenen
// Object-Store anlegte. Beim allerersten Öffnen gewinnt aber nur EIN Handler (IndexedDB
// feuert onupgradeneeded pro Versionssprung genau einmal) — der jeweils andere Store fehlte
// zur Laufzeit ("... object stores was not found"), reproduzierbar bei echtem GEDCOM-Import
// im Browser (Playwright-Smoke dieser Slice).
//
// Keine echte IndexedDB in Tests (ADR-v9-15: kein `fake-indexeddb`) — dieser Test prüft
// stattdessen strukturell/statisch, dass BEIDE Store-Implementierungen denselben
// zentralen Schema-Öffner referenzieren, damit diese Bug-Klasse nicht unbemerkt wieder
// auftreten kann (z. B. durch einen künftigen dritten Store mit eigenem `indexedDB.open`).

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SERVICES_DIR = join(__dirname, '../../services');

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTsFiles(full));
    else if (entry.name.endsWith('.ts') && entry.name !== 'idb-schema.ts') out.push(full);
  }
  return out;
}

/** Strippt `//`-Zeilenkommentare, damit Kommentar-Prosa (die `indexedDB.open()` erwähnt,
 * um genau DIESEN Bug zu erklären) den Code-Scan nicht fälschlich triggert. */
function stripLineComments(src: string): string {
  return src
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

describe('IndexedDB-Schema — genau EIN zentraler Öffner (Regressionstest)', () => {
  it('services/idb-schema.ts definiert genau einen indexedDB.open()-Aufruf (Code, keine Kommentare)', () => {
    const schemaSrc = stripLineComments(readFileSync(join(SERVICES_DIR, 'idb-schema.ts'), 'utf8'));
    const opens = schemaSrc.match(/indexedDB\.open\(/g) ?? [];
    expect(opens).toHaveLength(1);
  });

  it('kein services/*-Modul außer idb-schema.ts ruft indexedDB.open() selbst auf (Code, keine Kommentare)', () => {
    const offenders: string[] = [];
    for (const file of walkTsFiles(SERVICES_DIR)) {
      const src = stripLineComments(readFileSync(file, 'utf8'));
      if (/indexedDB\.open\(/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('IdbWorkingCopyStore, IdbPlacesStore und IdbPlacesFileHandleStore importieren alle openStammbaumDb aus dem geteilten Schema', () => {
    const workingCopySrc = readFileSync(join(SERVICES_DIR, 'file/idb-working-copy-store.ts'), 'utf8');
    const placesSrc = readFileSync(join(SERVICES_DIR, 'places/idb-places-store.ts'), 'utf8');
    const placesHandleSrc = readFileSync(join(SERVICES_DIR, 'places/idb-places-file-handle-store.ts'), 'utf8');

    expect(workingCopySrc).toMatch(/from ['"]\.\.\/idb-schema['"]/);
    expect(workingCopySrc).toMatch(/openStammbaumDb/);
    expect(placesSrc).toMatch(/from ['"]\.\.\/idb-schema['"]/);
    expect(placesSrc).toMatch(/openStammbaumDb/);
    expect(placesHandleSrc).toMatch(/from ['"]\.\.\/idb-schema['"]/);
    expect(placesHandleSrc).toMatch(/openStammbaumDb/);
  });

  it('idb-schema.ts registriert alle drei bekannten Object-Stores im selben onupgradeneeded-Handler', () => {
    const schemaSrc = readFileSync(join(SERVICES_DIR, 'idb-schema.ts'), 'utf8');
    const upgradeBlockMatch = schemaSrc.match(/onupgradeneeded = \(\) => \{[\s\S]*?\};/);
    expect(upgradeBlockMatch).not.toBeNull();
    const upgradeBlock = upgradeBlockMatch![0];
    expect(upgradeBlock).toMatch(/STORE_WORKING_COPY/);
    expect(upgradeBlock).toMatch(/STORE_PLACES_MIRROR/);
    expect(upgradeBlock).toMatch(/STORE_PLACES_FILE_HANDLE/);
    expect(upgradeBlock).toMatch(/STORE_PROJECTS/); // BL-58
  });

  it('STORE_PLACES_FILE_HANDLE ist ein eigener Store-Name, GETRENNT von STORE_WORKING_COPY/STORE_PLACES_MIRROR (ADR-v9-70)', () => {
    const schemaSrc = readFileSync(join(SERVICES_DIR, 'idb-schema.ts'), 'utf8');
    expect(schemaSrc).toMatch(/STORE_PLACES_FILE_HANDLE\s*=\s*'places-file-handle'/);
  });
});

// Zweiter Wächter derselben Bauart, aus demselben Grund: eine Regel, die nur in zehn
// Dateien wiederholt wird, fehlt irgendwann in der elften. Hier geht es um den
// `DataCloneError`-Zweig in `idbPut` — schreibt ein Store direkt per `.put()`, meldet er
// im Fehlerfall wieder die nackte Browser-Meldung ohne Feld und Pfad (Safari-Fund
// 2026-08-07). Der Test stellt die Frage bei jedem Lauf, statt sie einem Kommentar zu
// überlassen.
describe('IndexedDB-Schreibzugriffe — genau EIN Weg (idbPut)', () => {
  const ORTE_DIR = join(__dirname, '../../app-orte');

  it('kein Modul außer idb-schema.ts ruft objectStore(...).put() selbst auf', () => {
    const offenders: string[] = [];
    for (const file of [...walkTsFiles(SERVICES_DIR), ...walkTsFiles(ORTE_DIR)]) {
      const src = stripLineComments(readFileSync(file, 'utf8'));
      if (/objectStore\([^)]*\)\.put\(/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('idbPut reichert einen DataCloneError mit Pfad und Feld an, statt ihn durchzureichen', () => {
    const schemaSrc = stripLineComments(readFileSync(join(SERVICES_DIR, 'idb-schema.ts'), 'utf8'));
    // Der Zweig selbst ist ohne echte IndexedDB nicht ausführbar (ADR-v9-15: kein
    // fake-indexeddb) — geprüft wird, dass er existiert und die Diagnose benutzt. Was die
    // Diagnose LEISTET, prüft tests/core/clone-diagnose.test.ts am echten Verhalten.
    expect(schemaSrc).toMatch(/DataCloneError/);
    expect(schemaSrc).toMatch(/klonFehlerText/);
  });
});
