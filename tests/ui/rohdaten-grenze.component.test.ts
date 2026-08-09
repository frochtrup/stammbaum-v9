// @vitest-environment happy-dom
// tests/ui/rohdaten-grenze.component.test.ts — die Zollgrenze zwischen Oberfläche und
// Kern: was ein Formular an ein `appState.saveX(model)` übergibt, liegt danach als
// GEWÖHNLICHE Daten in der Datenbank, nicht als Svelte-Proxy.
//
// DER BEFUND (2026-08-09, Nutzermeldung „im Familien – Heirat bearbeiten funktioniert der
// Speichern Knopf nicht"). „Heirat bearbeiten → Speichern" klappte EINMAL; beim zweiten
// Mal tat der Knopf nichts. `EventEditModal` hält seinen Formularzustand in `$state`,
// `fromEditable()` reicht dessen `citations` unverändert zurück — ein tief-reaktiver
// Proxy. `saveFamily` legte ihn in die Datenbank; der nächste Save lief über
// `editDatabase`→`thaw`→`structuredClone` und warf an genau diesem Proxy. Die Ausnahme
// flog aus dem `onsubmit`-Handler: kein Speichern, keine Meldung, ein Knopf, der aussieht,
// als sei er tot.
//
// ZWEI EBENEN, ABSICHTLICH: der erste Block fährt den gemeldeten Weg durch die echte
// Oberfläche (zweimal speichern) — das ist der Regressionstest für den Defekt selbst. Der
// zweite prüft die Zusicherung, aus der er folgte, an JEDEM Upsert-Kommando einzeln; ein
// künftiges Kommando, das `roh()` vergisst, macht dort eine Zeile rot statt erst beim
// zweiten Klick eines Nutzers.
//
// Warum `structuredClone` die Prüfform ist und nicht „ist es ein Proxy": Proxys sind von
// außen nicht erkennbar (s. core/clone-diagnose.ts). Geprüft wird deshalb die EIGENSCHAFT,
// auf die es ankommt — Copy-on-Write (ADR-v9-92) klont jede aufzutauende Entität, und
// genau das muss gelingen.
//
// DIE UMGEBUNG IST TEIL DER PRÜFUNG, nicht Beiwerk: **nodes** `structuredClone` TOLERIERT
// einen Svelte-Proxy (hier nachgemessen, deckt sich mit [ADR-v9-117] Entscheidung 3) —
// in einer node-Datei wären alle Zusicherungen unten stillschweigend wahr. Der Docblock
// ganz oben ist deshalb tragend, und die erste Zusicherung ist eine Kontrollprobe, die
// genau das feststellt, statt es vorauszusetzen.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import FamilyDetail from '../../ui/views/family/FamilyDetail.svelte';
import { createAppState, type AppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import {
  makeCitation,
  makeDatabase,
  makeFamily,
  makeMedia,
  makePerson,
  makeRepository,
  makeSource,
} from '../../core/model';
import { place, hof } from '../core/places-fixtures';
import { reaktiv } from './fixtures/reaktiv.svelte';

/** Die Eigenschaft, um die es geht: jede Entität lässt sich für ein Kommando auftauen. */
function istKopierbar(wert: unknown): boolean {
  try {
    structuredClone(wert);
    return true;
  } catch {
    return false;
  }
}

function familieMitZitat(): AppState {
  const appState = createAppState();
  const db = makeDatabase();
  const f = makeFamily('@F1@');
  f.marriage.date = '27 MAY 1914';
  // Das Zitat ist die Vorbedingung, nicht Beiwerk: der Proxy, an dem das Klonen scheiterte,
  // war `citations[0].media` — ohne Zitat gibt es kein Teilobjekt, das reaktiv werden könnte.
  f.marriage.citations.push(makeCitation('@S1@'));
  db.families.set('@F1@', f);
  db.sources.set('@S1@', makeSource('@S1@', { abbr: 'Wegener' }));
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

describe('Heirat bearbeiten — Speichern funktioniert auch beim zweiten Mal (Regression)', () => {
  it('zweimal hintereinander öffnen und speichern schreibt beide Male', async () => {
    const appState = familieMitZitat();
    const viewState = createViewState();
    viewState.setCurrent('family', '@F1@');
    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });

    for (const durchgang of ['erster', 'zweiter']) {
      await fireEvent.click(screen.getByLabelText('Heirat bearbeiten'));
      const jahr = screen.getByLabelText('Jahr') as HTMLInputElement;
      await fireEvent.change(jahr, { target: { value: durchgang === 'erster' ? '1915' : '1916' } });
      await fireEvent.click(screen.getByText('Speichern'));

      // Sichtbar, nicht nur gespeichert: bleibt das Modal stehen, ist der Knopf tot.
      expect(screen.queryByText('Heirat bearbeiten')).toBeNull();
    }

    // Tag/Monat bleiben stehen — geändert wurde nur das Jahresfeld (Tristate, ADR-v9-30).
    expect(appState.db.families.get('@F1@')!.marriage.date).toBe('27 MAY 1916');
  });

  it('nach dem Speichern aus dem Modal bleibt die Familie in der Datenbank kopierbar', async () => {
    const appState = familieMitZitat();
    const viewState = createViewState();
    viewState.setCurrent('family', '@F1@');
    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });

    await fireEvent.click(screen.getByLabelText('Heirat bearbeiten'));
    await fireEvent.click(screen.getByText('Speichern'));

    expect(istKopierbar(appState.db.families.get('@F1@'))).toBe(true);
  });
});

/**
 * Ein Upsert-Kommando, sein reaktiv gemachtes Modell und die Stelle, an der das Ergebnis
 * liegt. Als TABELLE, nicht als sieben Blöcke — nur so lässt sich unten mechanisch prüfen,
 * dass sie VOLLSTÄNDIG ist.
 */
const UPSERTS: { name: string; ausfuehren: (a: AppState) => void; ergebnis: (a: AppState) => unknown }[] = [
  {
    name: 'savePerson',
    ausfuehren: (a) => a.savePerson(reaktiv(makePerson('@I1@', { given: 'Otto' }))),
    ergebnis: (a) => a.db.individuals.get('@I1@'),
  },
  {
    name: 'saveFamily',
    ausfuehren: (a) => {
      const f = makeFamily('@F1@');
      f.marriage.citations.push(makeCitation('@S1@'));
      a.saveFamily(reaktiv(f));
    },
    ergebnis: (a) => a.db.families.get('@F1@'),
  },
  {
    // BL-329: der Link muss BESTEHEN, bevor er beschrieben werden kann (das Kommando
    // verknüpft nicht, es beschreibt) — deshalb erst Person + Familie mit dem Kind, dann
    // der Link mit einem reaktiv gemachten Zitat darin.
    name: 'saveChildLink',
    ausfuehren: (a) => {
      a.savePerson(makePerson('@I1@', { given: 'Julius' }));
      a.saveFamily(makeFamily('@F1@', { children: ['@I1@'] }));
      const link = a.db.individuals.get('@I1@')!.childOf[0];
      a.saveChildLink('@I1@', reaktiv({ ...link, pedigree: 'adopted', citations: [makeCitation('@S1@')] }));
    },
    ergebnis: (a) => a.db.individuals.get('@I1@'),
  },
  {
    name: 'saveSource',
    ausfuehren: (a) => a.saveSource(reaktiv(makeSource('@S1@', { title: 'Kirchenbuch' }))),
    ergebnis: (a) => a.db.sources.get('@S1@'),
  },
  {
    name: 'saveRepository',
    ausfuehren: (a) => a.saveRepository(reaktiv(makeRepository('@R1@', { name: 'Bistumsarchiv' }))),
    ergebnis: (a) => a.db.repositories.get('@R1@'),
  },
  {
    name: 'saveMedia',
    ausfuehren: (a) => a.saveMedia(reaktiv(makeMedia('foto.jpg', { file: 'foto.jpg', form: 'image/jpeg' }))),
    ergebnis: (a) => a.db.media.get('foto.jpg'),
  },
  {
    name: 'savePlace',
    ausfuehren: (a) => a.savePlace(reaktiv(place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' }))),
    ergebnis: (a) => a.db.placeObjects.get('@OCHTRUP@'),
  },
  {
    name: 'saveHof',
    ausfuehren: (a) => {
      a.savePlace(place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' }));
      a.saveHof(reaktiv(hof('@H1@', '@OCHTRUP@', { addrs: [{ value: 'Wall 33', from: null, to: null }] })));
    },
    ergebnis: (a) => a.db.hofObjects.get('@H1@'),
  },
];

describe('AppState — kein Upsert legt einen Svelte-Proxy in die Datenbank', () => {
  // Kontrollprobe. Ohne sie hinge die Aussagekraft aller Fälle darunter an einer
  // Umgebungs-Eigenschaft, die nirgends geprüft wird: node klont einen Svelte-Proxy
  // klaglos, happy-dom lehnt ihn ab (wie der Browser). Verschwindet der Docblock ganz
  // oben, wird diese Zeile rot — nicht die sieben darunter still grün.
  it('die Testumgebung lehnt einen Svelte-Proxy überhaupt ab (sonst prüfen die Fälle nichts)', () => {
    expect(istKopierbar(reaktiv({ inhalt: [] as unknown[] }))).toBe(false);
  });

  for (const fall of UPSERTS) {
    it(fall.name, () => {
      const appState = createAppState();
      appState.loadDatabase(makeDatabase(), 'test.ged');

      fall.ausfuehren(appState);

      expect(istKopierbar(fall.ergebnis(appState))).toBe(true);
    });
  }

  // Der eigentliche Wächter gegen den Rückfall: die Tabelle oben deckt JEDES `save*`-
  // Kommando ab. Wer ein neues hinzufügt und `roh()` vergisst, hat sonst niemanden, der
  // fragt — der Defekt zeigt sich erst beim ZWEITEN Speichern eines Nutzers. Das ist der
  // Prüfstein aus ADR-v9-239: für eine Verfahrensregel den mechanischen Boden bauen,
  // statt sie aufzuschreiben.
  it('die Tabelle deckt jedes save*-Kommando der AppState ab', () => {
    const appState = createAppState();
    const vorhanden = Object.keys(appState)
      .filter((k) => k.startsWith('save'))
      .sort();
    expect(vorhanden.length).toBeGreaterThan(0);
    expect(UPSERTS.map((f) => f.name).sort()).toEqual(vorhanden);
  });
});
