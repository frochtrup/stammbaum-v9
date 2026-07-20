// @vitest-environment happy-dom
// tests/ui/PersonDedupView.component.test.ts — Duplikat-Erkennung Personen (BL-104,
// Spec 20 §1.12, Spec 32 §6). Deckt Leerzustand, Scan-auf-Klick, Suchfilter,
// Merge-Modal (Feldwahl, Seitentausch, Zusammenführen) und den „Forschungseintrag
// statt Merge"-Weg.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import PersonDedupView from '../../ui/views/person/PersonDedupView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson, makeEvent } from '../../core/model';
import type { Database } from '../../core/model/types';
import type { DedupIgnoreStore } from '../../services/dedup';
import { pairKey } from '../../core/dedup';

/** Ignorier-Speicher ohne IndexedDB — der Komponententest prüft den Weg, nicht die Platform-API. */
class MemoryIgnoreStore implements DedupIgnoreStore {
  keys: string[] = [];
  constructor(initial: string[] = []) {
    this.keys = initial;
  }
  async load(): Promise<string[]> {
    return this.keys;
  }
  async save(keys: readonly string[]): Promise<void> {
    this.keys = [...keys];
  }
}

/** Zwei praktisch identische Personen — Score liegt sicher über der Default-Schwelle. */
function zwillingsDb(): Database {
  const db = makeDatabase();
  db.individuals.set(
    '@I1@',
    makePerson('@I1@', {
      given: 'Anna',
      surname: 'Decker',
      sex: 'F',
      birth: makeEvent('BIRT', { date: '1850', place: 'Ochtrup' }),
      title: 'Bäuerin',
    }),
  );
  db.individuals.set(
    '@I2@',
    makePerson('@I2@', {
      given: 'Anna',
      surname: 'Decker',
      sex: 'F',
      birth: makeEvent('BIRT', { date: '1850', place: 'Ochtrup' }),
      www: 'beispiel.de',
    }),
  );
  return db;
}

/**
 * N Zwillingspaare — je Paar GENAU ein Treffer.
 *
 * Die Nachnamen müssen sich in den ERSTEN DREI Zeichen unterscheiden: der Finder
 * bucketet nach diesem Präfix, und gleichpräfixige Namen landen zusammen und werden
 * kreuzweise bewertet. Ein erster Anlauf mit „Nachname000/001/…" erzeugte deshalb aus
 * 5 gewollten Paaren über 30 Treffer — alle im Bucket „nac".
 */
function vielePaareDb(paare: number): Database {
  const db = makeDatabase();
  const buchstaben = 'abcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < paare; i++) {
    const prefix = buchstaben[Math.floor(i / 26) % 26] + buchstaben[i % 26] + 'x';
    const surname = prefix.toUpperCase() + 'mann';
    for (const seite of ['a', 'b']) {
      const id = `@I${i}${seite}@`;
      db.individuals.set(
        id,
        makePerson(id, {
          given: 'Anna',
          surname,
          sex: 'F',
          birth: makeEvent('BIRT', { date: '1850', place: 'Ochtrup' }),
        }),
      );
    }
  }
  return db;
}

async function scan(): Promise<void> {
  await fireEvent.click(screen.getByRole('button', { name: 'Duplikate suchen' }));
}

/** Scannt und öffnet das Modal des einzigen Paares. */
async function openModal(ignoreStore: DedupIgnoreStore = new MemoryIgnoreStore()) {
  const appState = createAppState();
  appState.loadDatabase(zwillingsDb(), 'test.ged');
  render(PersonDedupView, { props: { appState, ignoreStore } });
  await scan();
  await fireEvent.click(screen.getByRole('button', { name: /Anna Decker/ }));
  return appState;
}

describe('PersonDedupView — Scan und Ergebnisliste', () => {
  it('scannt nicht von selbst — der Nutzer startet die Suche', async () => {
    const appState = createAppState();
    appState.loadDatabase(zwillingsDb(), 'test.ged');

    render(PersonDedupView, { props: { appState } });

    // Vor dem Klick steht der Leerzustand da, obwohl es ein Paar GIBT (gemessen ~750 ms
    // bei 2.795 Personen — kein Scan beim bloßen Aufklappen).
    expect(screen.getByText('Noch kein Scan durchgeführt.')).toBeTruthy();

    await scan();
    expect(screen.getByText(/verdächtige Paare/)).toBeTruthy();
  });

  it('meldet einen leeren Bestand als „keine Paare", nicht als Fehler', async () => {
    const appState = createAppState();
    appState.loadDatabase(makeDatabase(), 'test.ged');

    render(PersonDedupView, { props: { appState } });
    await scan();

    expect(screen.getByText(/Keine verdächtigen Paare/)).toBeTruthy();
  });

  it('filtert die Ergebnisliste, ohne die Gesamtzahl zu verfälschen', async () => {
    const appState = createAppState();
    const db = zwillingsDb();
    db.individuals.set(
      '@I3@',
      makePerson('@I3@', { given: 'Wilhelm', surname: 'Kortmann', sex: 'M', birth: makeEvent('BIRT', { date: '1830' }) }),
    );
    db.individuals.set(
      '@I4@',
      makePerson('@I4@', { given: 'Wilhelm', surname: 'Kortmann', sex: 'M', birth: makeEvent('BIRT', { date: '1830' }) }),
    );
    appState.loadDatabase(db, 'test.ged');

    render(PersonDedupView, { props: { appState } });
    await scan();
    expect(screen.getByText(/2 verdächtige Paare/)).toBeTruthy();

    await fireEvent.input(screen.getByLabelText('Ergebnisse durchsuchen'), { target: { value: 'Kortmann' } });

    // „1 von 2" — die Gesamtzahl bleibt sichtbar, sonst sähe der Nutzer beim Tippen
    // eine schrumpfende Bestandsgröße statt eines Filters.
    expect(screen.getByText(/1 von 2 Paaren/)).toBeTruthy();
  });

  it('ein höherer Schwellenwert wirkt erst mit dem nächsten Scan', async () => {
    const appState = createAppState();
    appState.loadDatabase(zwillingsDb(), 'test.ged');

    render(PersonDedupView, { props: { appState } });
    await scan();
    expect(screen.getByText(/verdächtige Paare/)).toBeTruthy();

    await fireEvent.input(screen.getByRole('slider'), { target: { value: '95' } });
    // Regler allein ändert nichts — die Liste gehört zum zuletzt gelaufenen Scan.
    expect(screen.getByText(/verdächtige Paare/)).toBeTruthy();

    await scan();
    expect(screen.getByText(/Keine verdächtigen Paare ab Score 95/)).toBeTruthy();
  });
});

describe('PersonDedupView — Merge-Modal', () => {

  it('öffnet den Vergleich mit Score und Gründen', async () => {
    await openModal();
    const dialog = screen.getByRole('dialog', { name: 'Personen zusammenführen' });
    // Bewusst im Dialog gesucht: die Gründe stehen auch in der Ergebniszeile dahinter —
    // ein ungescoptes getByText fände beide und prüfte nicht, was es zu prüfen vorgibt.
    expect(within(dialog).getByText(/Nachname identisch/)).toBeTruthy();
    expect(within(dialog).getByText(/Score/)).toBeTruthy();
  });

  it('führt über den Kommando-Chokepoint zusammen und entfernt den Verlierer', async () => {
    const appState = await openModal();
    expect(appState.db.individuals.size).toBe(2);

    await fireEvent.click(screen.getByRole('button', { name: 'Zusammenführen' }));

    expect(appState.db.individuals.size).toBe(1);
    // Verlustfrei: das nur beim Verlierer gefüllte Feld ist mitgekommen.
    const [merged] = [...appState.db.individuals.values()];
    expect(merged.www).toBe('beispiel.de');
    expect(merged.title).toBe('Bäuerin');
    expect(screen.getByText(/Zusammengeführt:/)).toBeTruthy();
  });

  it('der Merge ist über den regulären Undo-Stack rücknehmbar', async () => {
    const appState = await openModal();
    await fireEvent.click(screen.getByRole('button', { name: 'Zusammenführen' }));
    expect(appState.db.individuals.size).toBe(1);

    expect(appState.undo()).toBe(true);
    expect(appState.db.individuals.size).toBe(2);
  });

  it('„⇄ Seiten tauschen" wechselt, wer bleibt — die getroffene Feldwahl bleibt bei ihrer Spalte', async () => {
    const appState = await openModal();
    const idsVorher = [...appState.db.individuals.keys()];

    // Titel ist nur auf der einen Seite gefüllt → wählbare Zeile. Die rechte Spalte wählen.
    const titelZeile = screen.getByRole('row', { name: /Titel/ });
    const zellen = titelZeile.querySelectorAll('button');
    await fireEvent.click(zellen[1]);
    expect(zellen[1].getAttribute('aria-pressed')).toBe('true');

    await fireEvent.click(screen.getByRole('button', { name: '⇄ Seiten tauschen' }));

    // Nach dem Tausch steht die Wahl immer noch auf DERSELBEN Spalte: der Tausch
    // entscheidet, wer bleibt, nicht welcher Wert gemeint war.
    const zellenNachher = screen.getByRole('row', { name: /Titel/ }).querySelectorAll('button');
    expect(zellenNachher[1].getAttribute('aria-pressed')).toBe('true');

    await fireEvent.click(screen.getByRole('button', { name: 'Zusammenführen' }));
    // Der andere Zwilling hat überlebt.
    const [survivor] = [...appState.db.individuals.keys()];
    expect(survivor).toBe(idsVorher[1]);
  });

  it('„📝 Forschungseintrag" legt bei BEIDEN Personen einen offenen Eintrag an, ohne zu mergen', async () => {
    const appState = await openModal();

    await fireEvent.click(screen.getByRole('button', { name: '📝 Forschungseintrag' }));

    expect(appState.db.individuals.size).toBe(2);
    for (const p of appState.db.individuals.values()) {
      expect(p.researchLog).toHaveLength(1);
      expect(p.researchLog[0].result).toBe('pending');
      expect(p.researchLog[0].query).toContain('Duplikat-Prüfung');
    }
  });

  it('gleiche Felder werden zusammengefasst statt zur Wahl gestellt', async () => {
    await openModal();
    // Nachname ist auf beiden Seiten „Decker" — eine Zelle über beide Spalten, keine Knöpfe.
    const zeile = screen.getByRole('row', { name: /Nachname/ });
    expect(zeile.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('PersonDedupView — „Kein Duplikat" (BL-105)', () => {
  it('nimmt das Paar aus der Liste und schreibt es in den Speicher', async () => {
    const store = new MemoryIgnoreStore();
    await openModal(store);

    await fireEvent.click(screen.getByRole('button', { name: 'Kein Duplikat' }));

    expect(screen.getByText(/Als „kein Duplikat" gemerkt/)).toBeTruthy();
    expect(screen.getByText(/Keine verdächtigen Paare/)).toBeTruthy();
    expect(store.keys).toHaveLength(1);
  });

  it('führt NICHT zusammen — beide Personen bleiben erhalten', async () => {
    const appState = await openModal();
    await fireEvent.click(screen.getByRole('button', { name: 'Kein Duplikat' }));
    expect(appState.db.individuals.size).toBe(2);
  });

  it('ein bereits gespeichertes Paar erscheint gar nicht erst', async () => {
    // Die eigentliche Zusicherung von BL-105: „dauerhaft", nicht „bis zum Neuladen".
    // Ein frischer Mount mit vorbefülltem Speicher steht für den nächsten App-Start.
    const appState = createAppState();
    appState.loadDatabase(zwillingsDb(), 'test.ged');
    render(PersonDedupView, {
      props: { appState, ignoreStore: new MemoryIgnoreStore([pairKey('@I1@', '@I2@')]) },
    });
    await scan();

    expect(screen.getByText(/Keine verdächtigen Paare/)).toBeTruthy();
  });
});

describe('PersonDedupView — Paginierung (Spec 21 §10b)', () => {
  // NICHT aus Performance-Gründen: 1.266 zusätzliche Zeilen kosten am echten Bestand
  // rund 34 ms (gemessen 2026-07-19). §10b begründet den Deckel mit Einfachheit —
  // ungedeckelt ergaben 1.267 Paare 90.212 px Scrollstrecke.
  async function scanMit(paare: number) {
    const appState = createAppState();
    appState.loadDatabase(vielePaareDb(paare), 'test.ged');
    render(PersonDedupView, { props: { appState, ignoreStore: new MemoryIgnoreStore() } });
    await scan();
  }

  const sichtbareZeilen = () => document.querySelectorAll('.person-dedup__pair').length;

  it('zeigt zunächst höchstens 30 Zeilen, nennt aber die volle Trefferzahl', async () => {
    await scanMit(50);
    expect(sichtbareZeilen()).toBe(30);
    expect(screen.getByText(/50 verdächtige Paare/)).toBeTruthy();
  });

  it('„N weitere laden" hängt die nächsten 30 an', async () => {
    await scanMit(50);
    await fireEvent.click(screen.getByRole('button', { name: '20 weitere laden' }));
    expect(sichtbareZeilen()).toBe(50);
    expect(screen.queryByRole('button', { name: /weitere laden/ })).toBeNull();
  });

  it('kurze Listen bekommen keinen Knopf', async () => {
    await scanMit(5);
    expect(sichtbareZeilen()).toBe(5);
    expect(screen.queryByRole('button', { name: /weitere laden/ })).toBeNull();
  });

  it('eine neue Suche setzt den Deckel zurück', async () => {
    // Ohne das Zurücksetzen zeigte eine eingegrenzte Suche weiterhin den alten Stand —
    // mehr Zeilen, als die Trefferzahl darüber behauptet (Zustands-Leck, ADR-v9-83).
    await scanMit(50);
    await fireEvent.click(screen.getByRole('button', { name: '20 weitere laden' }));
    expect(sichtbareZeilen()).toBe(50);

    await fireEvent.input(screen.getByLabelText('Ergebnisse durchsuchen'), { target: { value: 'Anna' } });

    expect(sichtbareZeilen()).toBe(30);
    expect(screen.getByRole('button', { name: '20 weitere laden' })).toBeTruthy();
  });

  it('ein neuer Scan setzt den Deckel ebenfalls zurück', async () => {
    await scanMit(50);
    await fireEvent.click(screen.getByRole('button', { name: '20 weitere laden' }));
    expect(sichtbareZeilen()).toBe(50);

    await scan();

    expect(sichtbareZeilen()).toBe(30);
  });
});
