<script lang="ts">
  // ui/shell/PersonPicker.svelte — durchsuchbares Personen-Auswahlfeld (ADR-v9-30
  // Punkt 2, Spec 20 §2 "Entitäts-Picker"). Dünner, entitäts-spezifischer Wrapper um die
  // generische Shell `ui/shell/Picker.svelte` (ADR-v9-40, INV-UI-4) — JEDE Person-
  // Referenz in Formularen (Ehemann/Ehefrau, Kind hinzufügen, künftig Assoziationen/
  // Alias) nutzt DIESE eine Komponente, kein zweiter Picker-Bau.
  //
  // Wiederverwendung statt Neuerfindung: matchesSearch (person-list-model.ts, dieselbe
  // Match-Logik wie die globale Suche), displayName/yearPlaceSummary (person-display.ts),
  // allocatorFromDatabase/nextId (core/model/ids.ts) + makePerson (core/model/factory.ts)
  // für die ID-Vergabe (exakt das PersonList.svelte-"＋ Neue Person"-Muster), und
  // PersonForm.svelte selbst für die Inline-Neuanlage (kein zweites Mini-Formular).
  //
  // Externe Props-API bleibt UNVERÄNDERT gegenüber der Vor-ADR-v9-40-Fassung (keine
  // Breaking Changes an den bestehenden Call-Sites FamilyForm/FamilyDetail/SourceForm) —
  // nur die interne Mechanik (Feld-Button + Such-Panel + Ergebnisliste) delegiert jetzt
  // an Picker.svelte, statt sie selbst zu duplizieren.
  import type { AppState } from './app-state.svelte';
  import type { Person, PersonId } from '../../core/model/types';
  import { makePerson, allocatorFromDatabase, nextId } from '../../core/model';
  import { matchesSearch } from '../views/person/person-list-model';
  import { displayName, yearPlaceSummary } from './person-display';
  import PersonForm from '../views/person/PersonForm.svelte';
  import Picker from './Picker.svelte';

  interface Props {
    appState: AppState;
    value: PersonId | null;
    onChange: (id: PersonId | null) => void;
    /** Erlaubt die explizite "kein(e) X"-Auswahl (z. B. Elternteil entfernen). Default false. */
    allowNone?: boolean;
    /** Beschriftung der "keine Auswahl"-Option, nur relevant wenn allowNone. */
    noneLabel?: string;
    /** Personen, die als Kandidat NICHT angeboten werden (z. B. bereits zugeordnete Kinder). */
    excludeIds?: readonly PersonId[];
    /** Beschränkt die Auswahl auf genau diese Personen (Weiß-Liste, Gegenstück zu
     *  `excludeIds`). Für Aufrufer, die eine bereits ermittelte Kandidatenmenge zur Wahl
     *  stellen — die Erfassungs-Vorlagen zeigen so ihre Dubletten-Vorschläge (BL-352).
     *  Weglassen = die ganze Liste, wie bei allen bestehenden Aufrufern. */
    onlyIds?: readonly PersonId[];
    /** Platzhaltertext, wenn nichts ausgewählt ist und allowNone=false. */
    placeholder?: string;
    /** Für Formular-Labels (aria-label auf dem Such-/Anzeigefeld). */
    label?: string;
    /** Mountet die Shell direkt im offenen Panel-Zustand (Picker.svelte's `startOpen`,
     *  ADR-v9-42-Muster wie EventPlaceField/EventAddrField) — für Aufrufer, die den
     *  Picker selbst hinter einem eigenen Auslöser einbetten (z. B. FamilyDetail.svelte's
     *  Eltern-Slots: ein Klick auf "+ Ehemann wählen"/"✎ ändern" mountet PersonPicker
     *  NEU über ein `{#if}` — ein zweiter Klick auf ein redundantes geschlossenes Feld
     *  wäre unnötige Reibung). Nur beim Mount gelesen, kein fortlaufendes Re-Sync.
     *  Default false (bestehende Aufrufer unverändert). */
    startOpen?: boolean;
    /** Reicht Picker.svelte's `onClose` durch — für Aufrufer, die diesen Picker selbst
     *  hinter einem `{#if}` einblenden (Karten-/Zeitleisten-Lens). */
    onClose?: () => void;
    /** Blendet die "+ Neue Person anlegen"-Zeile aus. Default true (alle Formular-
     *  Aufrufer unverändert). Auf `false` für ANSICHTS-Auswahlen, die nur einen Fokus
     *  auf einen bestehenden Datenbestand setzen (Karte, Zeitleiste) — dort ist eine
     *  leere Neuanlage keine sinnvolle Handlung, sie erzeugte nur eine namenlose Person
     *  ohne Ereignisse, die die Ansicht gar nicht darstellen kann. */
    allowCreate?: boolean;
  }
  const {
    appState,
    value,
    onChange,
    allowNone = false,
    noneLabel = '— keine Auswahl —',
    excludeIds = [],
    onlyIds,
    placeholder = 'Person wählen…',
    label = 'Person auswählen',
    startOpen = false,
    onClose,
    allowCreate = true,
  }: Props = $props();

  const items = $derived(Array.from(appState.db.individuals.values()));

  function getSubLabel(p: Person): string {
    return yearPlaceSummary(p.birth, appState.placeContext);
  }

  /** Frisches Person-Gerüst mit kollisionsfreier id — exakt das PersonList.svelte-Muster
   *  ("＋ Neue Person": allocatorFromDatabase + nextId, kein Zufall/Wall-Clock, ADR-v9-11). */
  function draftPerson(): Person {
    const alloc = allocatorFromDatabase(appState.db);
    const id = nextId(alloc, 'I');
    return makePerson(id);
  }

  let creating = $state(false);
  let draft = $state<Person | null>(null);

  function beginCreate() {
    draft = draftPerson();
    creating = true;
  }

  function onPersonCreated(id: string) {
    creating = false;
    draft = null;
    onChange(id);
  }

  function cancelCreate() {
    creating = false;
    draft = null;
  }
</script>

<div class="person-picker">
  {#if creating && draft}
    <div class="person-picker__create">
      <PersonForm {appState} person={draft} onSaved={onPersonCreated} onCancel={cancelCreate} />
    </div>
  {:else}
    <Picker
      {items}
      getId={(p) => p.id}
      getLabel={displayName}
      {getSubLabel}
      matches={matchesSearch}
      {value}
      {onChange}
      {allowNone}
      {noneLabel}
      {excludeIds}
      {onlyIds}
      {placeholder}
      {label}
      createLabel={allowCreate ? '+ Neue Person anlegen …' : undefined}
      onCreateRequested={allowCreate ? beginCreate : undefined}
      {startOpen}
      {onClose}
    />
  {/if}
</div>

<style>
  .person-picker {
    min-width: 200px;
  }

  .person-picker__create {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
  }
</style>
