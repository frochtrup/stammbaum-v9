// @vitest-environment happy-dom
// tests/ui/ChildLinkEdit.component.test.ts — der Kindschafts-Editor an BEIDEN Einstiegen
// (BL-329, ADR-v9-244; Spec 20 §1.4/§1.5, Spec 32 §6).
//
// Die Aussage, die hier verteidigt wird, ist nicht „das Modal rendert", sondern: die
// Kindschafts-Belege sind an BEIDEN Flächen SICHTBAR und über DIESELBE Komponente
// bearbeitbar (INV-UI-4) — und was dort gespeichert wird, steht danach im Modell. Eine
// Fläche allein zu prüfen ließe die zweite still driften; genau davor warnt INV-UI-4.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import FamilyDetail from '../../ui/views/family/FamilyDetail.svelte';
import PersonDetail from '../../ui/views/person/PersonDetail.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeCitation, makeDatabase, makeFamily, makePerson, makeSource } from '../../core/model';
import { pinLayout } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';

let unpin: () => void;
beforeEach(() => {
  unpin = pinLayout(false);
});
afterEach(() => {
  unpin();
  layout.reset();
});

/** Vater + Mutter + Kind, ein Kirchenbuch, und ein Beleg AN DER KINDSCHAFT. */
function bestand(mitBeleg = true) {
  const appState = createAppState();
  const viewState = createViewState();
  const db = makeDatabase();
  db.individuals.set('@I1@', makePerson('@I1@', { given: 'Johann', surname: 'Decker' }));
  db.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna', surname: 'Meyer' }));
  const kind = makePerson('@I3@', { given: 'Julius', surname: 'Decker' });
  if (mitBeleg) {
    const cit = makeCitation('@S1@');
    cit.page = 'Bl. 11';
    cit.quay = 3;
    kind.childOf.push({
      familyId: '@F1@',
      pedigree: 'birth',
      fatherRel: '',
      motherRel: '',
      fatherRelSeen: false,
      motherRelSeen: false,
      citations: [cit],
    });
  }
  db.individuals.set('@I3@', kind);
  // Ohne Beleg AUCH ohne Kindschaft: beide Seiten entstehen dann im Test über das
  // reguläre Kommando (INV-P3) — eine Familie mit `children`, deren Kind kein `childOf`
  // trägt, wäre ein Zustand, den der Ladepfad gar nicht erzeugt.
  db.families.set(
    '@F1@',
    makeFamily('@F1@', { husband: '@I1@', wife: '@I2@', children: mitBeleg ? ['@I3@'] : [] }),
  );
  db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Ochtrup', title: 'Kirchenbuch Ochtrup' }));
  appState.loadDatabase(db, 'test.ged');
  return { appState, viewState };
}

const link = (appState: ReturnType<typeof createAppState>) =>
  appState.db.individuals.get('@I3@')!.childOf.find((l) => l.familyId === '@F1@')!;

describe('Kindschafts-Belege — Familien-Detailseite (Kinder-Zeile)', () => {
  it('zeigt die Quellen-Pille der Kindschaft an der Kind-Zeile', () => {
    const { appState, viewState } = bestand();
    viewState.setCurrent('family', '@F1@');

    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });

    expect(screen.getByLabelText(/KB Ochtrup/)).toBeTruthy();
  });

  it('speichert Kind-Verhältnis und einen neuen Beleg über den Editor', async () => {
    const { appState, viewState } = bestand();
    viewState.setCurrent('family', '@F1@');
    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });

    await fireEvent.click(screen.getByLabelText('Kindschaft von Julius Decker bearbeiten'));

    const select = screen.getByLabelText('Kind-Verhältnis') as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: 'adopted' } });
    await fireEvent.click(screen.getByText('+ Quelle hinzufügen'));
    await fireEvent.click(screen.getByText('Speichern'));

    expect(link(appState).pedigree).toBe('adopted');
    expect(link(appState).citations).toHaveLength(2);
  });

  it('„Abbrechen" schreibt nichts', async () => {
    const { appState, viewState } = bestand();
    viewState.setCurrent('family', '@F1@');
    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });

    await fireEvent.click(screen.getByLabelText('Kindschaft von Julius Decker bearbeiten'));
    await fireEvent.change(screen.getByLabelText('Kind-Verhältnis'), { target: { value: 'foster' } });
    await fireEvent.click(screen.getByText('Abbrechen'));

    expect(link(appState).pedigree).toBe('birth');
  });
});

describe('Kindschafts-Belege — Personen-Steckbrief (Herkunftsfamilie)', () => {
  it('zeigt die Quellen-Pille der eigenen Abstammung', () => {
    const { appState, viewState } = bestand();
    viewState.setCurrent('person', '@I3@');

    render(PersonDetail, { props: { appState, viewState } });

    expect(screen.getByLabelText(/KB Ochtrup/)).toBeTruthy();
  });

  it('öffnet DENSELBEN Editor und speichert von hier aus', async () => {
    const { appState, viewState } = bestand();
    viewState.setCurrent('person', '@I3@');
    render(PersonDetail, { props: { appState, viewState } });

    await fireEvent.click(screen.getByLabelText('Kindschaft bearbeiten'));
    await fireEvent.change(screen.getByLabelText('Kind-Verhältnis'), { target: { value: 'foster' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(link(appState).pedigree).toBe('foster');
    // Der Beleg aus der Quelle bleibt unangetastet — der Editor ersetzt den GANZEN Link,
    // also muss er alles mitnehmen, was er nicht anfasst.
    expect(link(appState).citations.map((c) => c.page)).toEqual(['Bl. 11']);
  });

  it('ohne Beleg bleibt die Zeile bedienbar (der Einstieg hängt nicht an Daten)', async () => {
    const { appState, viewState } = bestand(false);
    // Kindschaft besteht family-seitig; der Link entsteht über das reguläre Kommando.
    appState.saveFamily({ ...appState.db.families.get('@F1@')!, children: ['@I3@'] });
    viewState.setCurrent('person', '@I3@');
    render(PersonDetail, { props: { appState, viewState } });

    await fireEvent.click(screen.getByLabelText('Kindschaft bearbeiten'));
    await fireEvent.click(screen.getByText('+ Quelle hinzufügen'));
    await fireEvent.click(screen.getByText('Speichern'));

    expect(link(appState).citations).toHaveLength(1);
  });
});
