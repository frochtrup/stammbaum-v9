// @vitest-environment happy-dom
// tests/ui/ImportCompareView.component.test.ts — Import-Vergleich, Ansicht (BL-107,
// Spec 20 §1.12, Spec 32 §6). Der Datei-Picker wird über eine FileService-Attrappe
// gestellt — die Ansicht soll geprüft werden, nicht die Plattform-API (TST-3).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ImportCompareView from '../../ui/views/import/ImportCompareView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson, makeEvent } from '../../core/model';
import type { FileService } from '../../services/file';
import { surnameOf } from '../../core/model/name-parts';

/** Minimale Vergleichsdatei als GEDCOM-Text: eine Übereinstimmung, eine neue Person. */
const FREMD_GED = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '0 @I1@ INDI',
  '1 NAME Anna /Decker/',
  '1 SEX F',
  '1 BIRT',
  '2 DATE 1850',
  '2 PLAC Ochtrup',
  '1 TITL Hebamme',
  '0 @I2@ INDI',
  '1 NAME Wilhelm /Kortmann/',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 1902',
  '0 TRLR',
].join('\n');

function basisDb() {
  const db = makeDatabase();
  db.individuals.set(
    '@B1@',
    makePerson('@B1@', {
      given: 'Anna',
      surname: 'Decker',
      sex: 'F',
      birth: makeEvent('BIRT', { date: '1850', place: 'Ochtrup' }),
    }),
  );
  return db;
}

function fileServiceMit(text: string, name = 'ergaenzung.ged'): FileService {
  return { pickAndImport: vi.fn().mockResolvedValue({ text, name }) } as unknown as FileService;
}

/** Wartet, bis die asynchrone Datei-Verarbeitung durchgelaufen UND gerendert ist.
 *  `fireEvent.click` kehrt zurück, sobald der Handler startet — nicht, wenn er fertig ist. */
async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await tick();
}

async function ladeVergleich(fs = fileServiceMit(FREMD_GED)) {
  const appState = createAppState();
  appState.loadDatabase(basisDb(), 'basis.ged');
  render(ImportCompareView, { props: { appState, fileService: fs } });
  await fireEvent.click(screen.getByRole('button', { name: 'Zweite Datei wählen' }));
  await flush();
  return appState;
}

describe('ImportCompareView — Laden und Klassifikation', () => {
  it('zeigt vor dem Laden, dass der Bestand unangetastet bleibt', () => {
    const appState = createAppState();
    appState.loadDatabase(basisDb(), 'basis.ged');
    render(ImportCompareView, { props: { appState, fileService: fileServiceMit(FREMD_GED) } });
    expect(screen.getByText(/Noch keine Vergleichsdatei geladen/)).toBeTruthy();
    expect(screen.getByText(/ändert sich erst/)).toBeTruthy();
  });

  it('klassifiziert nach dem Laden in die drei Kategorien', async () => {
    await ladeVergleich();
    expect(screen.getByRole('tab', { name: /Übereinstimmung \(1\)/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Neu \(1\)/ })).toBeTruthy();
  });

  it('GRENZE: gleicher Name, gleiches Geschlecht, gleiches Jahr — ohne Ort nur „unsicher"', async () => {
    // 24 (Nachname) + 20 (Vorname) + 11 (Geschlecht) + 16 (Geburtsjahr) = 71, die
    // Spec-Schwelle für „Übereinstimmung" liegt bei 75. Ein karger Datensatz wird also
    // NICHT automatisch zugeordnet — das ist gewollt und hier festgehalten, damit es
    // niemand später für einen Fehler hält. Erst der gemeinsame Geburtsort (+7) trägt
    // über die Schwelle.
    const ohneOrt = FREMD_GED.split('\n').filter((z) => z !== '2 PLAC Ochtrup').join('\n');
    const appState = createAppState();
    const db = basisDb();
    db.individuals.get('@B1@')!.birth.place = null;
    appState.loadDatabase(db, 'basis.ged');
    render(ImportCompareView, { props: { appState, fileService: fileServiceMit(ohneOrt) } });
    await fireEvent.click(screen.getByRole('button', { name: 'Zweite Datei wählen' }));
    await flush();

    expect(screen.getByRole('tab', { name: /Übereinstimmung \(0\)/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Unsicher \(1\)/ })).toBeTruthy();
  });

  it('weist eine GRAMPS-Datei klar ab, statt sie still falsch zu parsen', async () => {
    const appState = createAppState();
    appState.loadDatabase(basisDb(), 'basis.ged');
    render(ImportCompareView, {
      props: { appState, fileService: fileServiceMit('<database/>', 'stammbaum.gramps') },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Zweite Datei wählen' }));
    await flush();
    expect(screen.getByText(/GRAMPS-Dateien werden hier noch nicht verglichen/)).toBeTruthy();
  });

  it('ändert beim bloßen Laden nichts am Bestand', async () => {
    const appState = await ladeVergleich();
    expect(appState.db.individuals.size).toBe(1);
    expect(appState.db.sources.size).toBe(0);
  });
});

describe('ImportCompareView — Entscheiden und Übernehmen', () => {
  async function oeffneErstePerson() {
    const appState = await ladeVergleich();
    await fireEvent.click(screen.getByRole('button', { name: /Anna Decker/ }));
    return appState;
  }

  it('zeigt die abweichenden Felder des zugeordneten Paares', async () => {
    await oeffneErstePerson();
    expect(screen.getByText(/Ergänzungen \(1\)/)).toBeTruthy();
    expect(screen.getByText(/Import: Hebamme/)).toBeTruthy();
  });

  it('„Übernehmen" ist gesperrt, solange nichts entschieden ist', async () => {
    await ladeVergleich();
    expect(screen.getByRole('button', { name: /Übernehmen \(0\)/ }).hasAttribute('disabled')).toBe(true);
  });

  it('überträgt ein gewähltes Feld erst mit dem Übernehmen-Klick', async () => {
    const appState = await oeffneErstePerson();
    await fireEvent.click(screen.getAllByRole('button', { name: 'Übernehmen' })[0]);
    // Noch nichts geschrieben — die Entscheidung ist nur vorgemerkt.
    expect(appState.db.individuals.get('@B1@')!.title).toBe('');

    await fireEvent.click(screen.getByRole('button', { name: /Übernehmen \(1\)/ }));
    expect(appState.db.individuals.get('@B1@')!.title).toBe('Hebamme');
  });

  it('legt beim Übernehmen EINE Import-Quelle als Beleg an', async () => {
    const appState = await oeffneErstePerson();
    await fireEvent.click(screen.getAllByRole('button', { name: 'Übernehmen' })[0]);
    await fireEvent.click(screen.getByRole('button', { name: /Übernehmen \(1\)/ }));
    expect(appState.db.sources.size).toBe(1);
    expect([...appState.db.sources.values()][0].title).toBe('Import: ergaenzung.ged');
  });

  it('die Übernahme hängt am regulären Undo-Stack', async () => {
    const appState = await oeffneErstePerson();
    await fireEvent.click(screen.getAllByRole('button', { name: 'Übernehmen' })[0]);
    await fireEvent.click(screen.getByRole('button', { name: /Übernehmen \(1\)/ }));
    expect(appState.db.individuals.get('@B1@')!.title).toBe('Hebamme');

    expect(appState.undo()).toBe(true);
    expect(appState.db.individuals.get('@B1@')!.title).toBe('');
  });

  it('„≠ Andere Person" schiebt die Zeile nach „Neu"', async () => {
    await oeffneErstePerson();
    await fireEvent.click(screen.getByRole('button', { name: '≠ Andere Person' }));
    expect(screen.getByRole('tab', { name: /Übereinstimmung \(0\)/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Neu \(2\)/ })).toBeTruthy();
  });

  it('„📝 Forschungseintrag" legt einen offenen Eintrag an, ohne etwas zu übernehmen', async () => {
    const appState = await oeffneErstePerson();
    await fireEvent.click(screen.getByRole('button', { name: '📝 Forschungseintrag' }));
    const p = appState.db.individuals.get('@B1@')!;
    expect(p.researchLog).toHaveLength(1);
    expect(p.researchLog[0].result).toBe('pending');
    expect(p.title).toBe('');
  });

  it('übernimmt eine neue Person nur nach ausdrücklicher Auswahl', async () => {
    const appState = await ladeVergleich();
    await fireEvent.click(screen.getByRole('tab', { name: /Neu \(1\)/ }));
    await fireEvent.click(screen.getByRole('button', { name: /Wilhelm Kortmann/ }));
    expect(appState.db.individuals.size).toBe(1);

    await fireEvent.click(screen.getByLabelText('Vollständig übernehmen'));
    await fireEvent.click(screen.getByRole('button', { name: /Übernehmen \(1\)/ }));
    expect(appState.db.individuals.size).toBe(2);
    // Über `surnameOf`, nicht über `p.surname`: die Fixture schreibt `1 NAME Wilhelm
    // /Kortmann/` ohne SURN-Untertag, das Feld bleibt also leer. Genau die Falle, die
    // dieser Bauabschnitt im Scoring geschlossen hat — eine Zusicherung auf dem rohen
    // Feld wäre hier grün-für-den-falschen-Grund gewesen.
    expect([...appState.db.individuals.values()].some((p) => surnameOf(p) === 'Kortmann')).toBe(true);
  });
});
