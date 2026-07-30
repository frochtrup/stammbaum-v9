// @vitest-environment happy-dom
// tests/ui/PersonList.component.test.ts — Personen-Liste als Component-Test
// (Spec 32 §6 "[21] INV-VS/INV-UI-…, Testart: Komponente"; Spec 32 §3
// @testing-library/svelte + happy-dom). Deckt Rendering ab, das die reine
// Gruppierungs-/Filterlogik (person-list-model.test.ts) nicht zeigt: Buchstaben-Trenner
// erscheinen tatsächlich im DOM, Sortier-Umschalter/Suche/Filter-Panel reagieren auf
// Nutzer-Interaktion, Klick ruft den EINEN ViewState-Weg auf.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PersonList from '../../ui/views/person/PersonList.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson, makeMediaCitation } from '../../core/model';
import { AnchorDownloadAdapter } from '../../services/file/download-adapter';

function seedAppState() {
  const appState = createAppState();
  const db = makeDatabase();
  const a = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
  a.birth.date = '1 JAN 1950';
  const o = makePerson('@I2@', { given: 'Otto', surname: 'Meyer' });
  o.birth.date = '1 JAN 1900';
  db.individuals.set('@I1@', a);
  db.individuals.set('@I2@', o);
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

describe('PersonList — alphabetische Gruppierung mit Buchstaben-Trenner (Component)', () => {
  it('rendert einen Buchstaben-Trenner pro Anfangsbuchstaben und die Personenzeilen darunter', () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });

    expect(screen.getByRole('separator', { name: 'Buchstabe B' })).toBeTruthy();
    expect(screen.getByRole('separator', { name: 'Buchstabe M' })).toBeTruthy();
    expect(screen.getByText('Anna Bauer')).toBeTruthy();
    expect(screen.getByText('Otto Meyer')).toBeTruthy();
  });

  it('zeigt einen Leerzustand, solange keine Personen geladen sind (kein Absturz auf leerer DB)', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });

    expect(screen.getByText(/Keine Personen geladen/)).toBeTruthy();
  });

  it('Klick auf eine Zeile setzt die Auswahl über den EINEN ViewState-Weg (setCurrent)', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });

    await fireEvent.click(screen.getByText('Anna Bauer'));

    expect(viewState.getCurrent('person')).toBe('@I1@');
  });
});

describe('PersonList — Sortier-Umschalter Name ⇄ Geburtsdatum (Component)', () => {
  it('startet im Name-Modus mit Buchstaben-Trennern und schaltet auf Geburtsdatum ohne Trenner um', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });

    expect(screen.getByRole('button', { name: /⇅ Name/ })).toBeTruthy();
    expect(screen.getByRole('separator', { name: 'Buchstabe B' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: /⇅ Name/ }));

    expect(screen.getByRole('button', { name: /⇅ Geburtsdatum/ })).toBeTruthy();
    expect(screen.queryByRole('separator')).toBeNull();

    // chronologische Reihenfolge: Otto (1900) vor Anna (1950)
    const names = screen.getAllByText(/Anna Bauer|Otto Meyer/).map((el) => el.textContent);
    expect(names).toEqual(['Otto Meyer', 'Anna Bauer']);
  });

  it('schaltet zurück auf Name-Modus (Toggle ist reversibel)', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });
    const toggle = screen.getByRole('button', { name: /⇅/ });

    await fireEvent.click(toggle);
    await fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: /⇅ Name/ })).toBeTruthy();
    expect(screen.getByRole('separator', { name: 'Buchstabe B' })).toBeTruthy();
  });
});

describe('PersonList — Live-Suche (Component)', () => {
  it('filtert die Liste live beim Tippen und zeigt ein ✕ zum Löschen', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });
    const search = screen.getByLabelText('Personen durchsuchen');

    await fireEvent.input(search, { target: { value: 'bauer' } });

    expect(screen.getByText('Anna Bauer')).toBeTruthy();
    expect(screen.queryByText('Otto Meyer')).toBeNull();

    const clearBtn = screen.getByLabelText('Suche löschen');
    await fireEvent.click(clearBtn);

    expect(screen.getByText('Otto Meyer')).toBeTruthy();
  });

  it('zeigt einen Leerzustand, wenn die Suche nichts findet', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });
    const search = screen.getByLabelText('Personen durchsuchen');

    await fireEvent.input(search, { target: { value: 'nonexistent-zzz' } });

    expect(screen.getByText(/Keine Personen gefunden/)).toBeTruthy();
  });
});

describe('PersonList — Filter-Panel (Component)', () => {
  it('öffnet das Filter-Panel und filtert nach Geschlecht', async () => {
    const appState = seedAppState();
    const viewState = createViewState();
    // Anna ist standardmäßig 'U' (kein sex im patch) — für einen echten Filter-Test
    // Geschlecht explizit setzen.
    appState.db.individuals.get('@I1@')!.sex = 'F';
    appState.db.individuals.get('@I2@')!.sex = 'M';

    render(PersonList, { props: { appState, viewState } });

    await fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'Weiblich' }));

    expect(screen.getByText('Anna Bauer')).toBeTruthy();
    expect(screen.queryByText('Otto Meyer')).toBeNull();
  });

  it('filtert nach Geburtsjahr-Bereich', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });

    await fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    const from = screen.getByLabelText(/Geburtsjahr von/);
    const to = screen.getByLabelText(/Geburtsjahr bis/);
    await fireEvent.input(from, { target: { value: '1940' } });
    await fireEvent.input(to, { target: { value: '1960' } });

    expect(screen.getByText('Anna Bauer')).toBeTruthy();
    expect(screen.queryByText('Otto Meyer')).toBeNull();
  });

  it('"Filter zurücksetzen" stellt die volle Liste wieder her', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });

    await fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    const from = screen.getByLabelText(/Geburtsjahr von/);
    await fireEvent.input(from, { target: { value: '1940' } });
    expect(screen.queryByText('Otto Meyer')).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));

    expect(screen.getByText('Otto Meyer')).toBeTruthy();
  });
});

describe('PersonList — Soundex-Filteroption (BL-10, ADR-v9-159)', () => {
  it('Soundex-Checkbox liegt hinter der FilterBar und zählt in "Filter · N" mit', async () => {
    const appState = seedAppState(); // Anna Bauer, Otto Meyer
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });

    expect(screen.queryByLabelText(/Soundex/)).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    const soundexBox = screen.getByLabelText(/Soundex/) as HTMLInputElement;
    expect(soundexBox.checked).toBe(false);

    await fireEvent.click(soundexBox);

    expect(screen.getByRole('button', { name: 'Filter · 1' })).toBeTruthy();
  });

  it('Soundex an: findet eine phonetisch gleiche, aber anders geschriebene Person', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Hans', surname: 'Meyer' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Karl', surname: 'Maier' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });

    const search = screen.getByLabelText('Personen durchsuchen');
    await fireEvent.input(search, { target: { value: 'meyer' } });
    expect(screen.getByText('Hans Meyer')).toBeTruthy();
    expect(screen.queryByText('Karl Maier')).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await fireEvent.click(screen.getByLabelText(/Soundex/));

    expect(screen.getByText('Hans Meyer')).toBeTruthy();
    expect(screen.getByText('Karl Maier')).toBeTruthy();
  });
});

describe('PersonList — CSV-Export der gefilterten Liste (BL-125, ADR-v9-159)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Export-Button liegt hinter der FilterBar (kein Dauer-Icon in der Kopfzeile)', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });

    expect(screen.queryByRole('button', { name: /Als CSV exportieren/ })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(screen.getByRole('button', { name: /Als CSV exportieren/ })).toBeTruthy();
  });

  it('exportiert NUR die gefilterte Zeilenmenge, inkl. Entitäts-ID, nicht die ganze Datenbank', async () => {
    const appState = seedAppState(); // Anna Bauer (@I1@, *1950), Otto Meyer (@I2@, *1900)
    const viewState = createViewState();
    const downloadSpy = vi.spyOn(AnchorDownloadAdapter.prototype, 'download').mockImplementation(() => {});

    render(PersonList, { props: { appState, viewState } });

    // Auf "Anna Bauer" filtern -> Otto Meyer darf NICHT im Export landen.
    await fireEvent.input(screen.getByLabelText('Personen durchsuchen'), { target: { value: 'bauer' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await fireEvent.click(screen.getByRole('button', { name: /Als CSV exportieren/ }));

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    const [csv, filename, mimeType] = downloadSpy.mock.calls[0]!;
    expect(filename).toMatch(/^personen_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(mimeType).toBe('text/csv;charset=utf-8');
    expect(String(csv)).toContain('@I1@');
    expect(String(csv)).toContain('Anna Bauer');
    expect(String(csv)).not.toContain('@I2@');
    expect(String(csv)).not.toContain('Otto Meyer');
    // UTF-8-BOM vorangestellt (ADR-v9-159 Punkt 5).
    expect(String(csv).charCodeAt(0)).toBe(0xfeff);
  });
});

describe('PersonList — 📎-Medien-Badge (ADR-v9-79 Punkt 3)', () => {
  it('zeigt die 📎-Pille nur bei Personen mit Medien', () => {
    const appState = createAppState();
    const db = makeDatabase();
    const withMedia = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    withMedia.media.push(makeMediaCitation('foto.jpg'));
    db.individuals.set('@I1@', withMedia);
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'Meyer' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });

    const row1 = screen.getByText('Anna Bauer').closest('.person-list__row') as HTMLElement;
    const row2 = screen.getByText('Otto Meyer').closest('.person-list__row') as HTMLElement;
    expect(Array.from(row1.querySelectorAll('.stb-pill')).some((el) => el.textContent === '📎')).toBe(true);
    expect(Array.from(row2.querySelectorAll('.stb-pill')).some((el) => el.textContent === '📎')).toBe(false);
  });
});

describe('PersonList — "＋ Neue Person" (Spec 20 §2)', () => {
  it('legt eine leere Person mit kollisionsfreier id an und meldet sie über onCreate', async () => {
    const appState = seedAppState(); // bereits @I1@/@I2@ belegt
    const viewState = createViewState();
    const onCreate = vi.fn();

    render(PersonList, { props: { appState, viewState, onCreate } });
    await fireEvent.click(screen.getByText('＋ Neue Person'));

    expect(onCreate).toHaveBeenCalledWith('@I3@');
    expect(appState.db.individuals.has('@I3@')).toBe(true);
    expect(appState.db.individuals.get('@I3@')?.given).toBe('');
  });

  it('funktioniert auch bei leerem Datenbestand (erste Person)', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const onCreate = vi.fn();

    render(PersonList, { props: { appState, viewState, onCreate } });
    await fireEvent.click(screen.getByText('＋ Neue Person'));

    expect(onCreate).toHaveBeenCalledWith('@I1@');
    expect(appState.db.individuals.has('@I1@')).toBe(true);
  });
});

describe('PersonList — Namenlose gruppiert/kollabiert (ADR-v9-121)', () => {
  function seedWithNameless() {
    const appState = createAppState();
    const db = makeDatabase();
    const a = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    db.individuals.set('@I1@', a);
    const n1 = makePerson('@I2@'); // namenlos → "(ohne Namen)"
    n1.noteText = 'Findmich';
    db.individuals.set('@I2@', n1);
    db.individuals.set('@I3@', makePerson('@I3@')); // namenlos
    appState.loadDatabase(db, 'test.ged');
    return appState;
  }

  it('zeigt standardmäßig eine Sammelzeile „N ohne Namen“ statt der einzelnen Namenlosen', () => {
    const appState = seedWithNameless();
    render(PersonList, { props: { appState, viewState: createViewState() } });

    expect(screen.getByRole('button', { name: /2 ohne Namen/ })).toBeTruthy();
    // die einzelnen Namenlosen sind eingeklappt (nicht im DOM sichtbar gelistet)
    expect(screen.queryByText('(ohne Namen)')).toBeNull();
    // benannte Person bleibt normal sichtbar
    expect(screen.getByText('Anna Bauer')).toBeTruthy();
  });

  it('ein Klick auf die Sammelzeile klappt die Namenlosen auf', async () => {
    const appState = seedWithNameless();
    render(PersonList, { props: { appState, viewState: createViewState() } });

    const toggle = screen.getByRole('button', { name: /2 ohne Namen/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByText('(ohne Namen)')).toHaveLength(2);
  });

  it('bei aktiver Suche werden namenlose Treffer sichtbar, ohne dass man aufklappen muss', async () => {
    const appState = seedWithNameless();
    render(PersonList, { props: { appState, viewState: createViewState() } });

    await fireEvent.input(screen.getByRole('searchbox', { name: 'Personen durchsuchen' }), {
      target: { value: 'Findmich' },
    });

    // genau der eine namenlose Treffer ist ohne Toggle sichtbar
    expect(screen.getByText('(ohne Namen)')).toBeTruthy();
    expect(screen.getByRole('button', { name: /1 ohne Namen/ })).toBeTruthy();
  });
});
