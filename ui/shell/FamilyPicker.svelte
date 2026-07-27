<script lang="ts">
  // ui/shell/FamilyPicker.svelte — durchsuchbares Familien-Auswahlfeld (ADR-v9-40,
  // generalisiert ADR-v9-30 Punkt 2/PersonPicker.svelte, INV-UI-4, Spec 20 §2
  // "Entitäts-Picker"). Dünner Wrapper um die generische Shell `ui/shell/Picker.svelte` —
  // ersetzt die hand-gebaute "Textfeld + gefiltertes <select>"-Zielentität-Auswahl bei
  // Aufgabe/Forschungsprotokoll/Hypothese, wenn die Zielentität eine Familie ist.
  //
  // Wiederverwendung statt Neuerfindung: matchesSearch(db, f, query) (family-list-
  // model.ts, dieselbe Match-Logik wie die globale Suche), familyLabelFor (source/
  // family-label.ts — bewusst NICHT verschoben, s. Auftrag), allocatorFromDatabase/
  // nextId (core/model/ids.ts) + makeFamily (core/model/factory.ts) für die ID-Vergabe
  // (exakt das FamilyList.svelte-"＋ Neue Familie"-Muster).
  //
  // Neuanlage ist SOFORT, kein Inline-Formular mehr (ADR-v9-63): `FamilyForm.svelte`
  // entfällt komplett — Familie hat keine eigenen Skalarfelder, ein frisch angelegtes
  // Gerüst (`makeFamily`) ist bereits vollständig speicherbar, ohne dass der Nutzer
  // irgendetwas ausfüllen müsste (Eltern/Kinder/Ereignisse sind direkte Picker-/Modal-
  // Aktionen auf `FamilyDetail.svelte`, nicht Teil dieser Anlage-Geste).
  import type { AppState } from './app-state.svelte';
  import type { Family, FamilyId } from '../../core/model/types';
  import { makeFamily, allocatorFromDatabase, nextId } from '../../core/model';
  import { matchesSearch } from '../views/family/family-list-model';
  import { familyLabelFor } from '../views/source/family-label';
  import Picker from './Picker.svelte';

  interface Props {
    appState: AppState;
    value: FamilyId | null;
    onChange: (id: FamilyId | null) => void;
    /** Erlaubt die explizite "keine Familie"-Auswahl. Default false. */
    allowNone?: boolean;
    /** Beschriftung der "keine Auswahl"-Option, nur relevant wenn allowNone. */
    noneLabel?: string;
    /** Platzhaltertext, wenn nichts ausgewählt ist und allowNone=false. */
    placeholder?: string;
    /** Für Formular-Labels (aria-label auf dem Such-/Anzeigefeld). */
    label?: string;
    /** Mountet die Shell direkt offen (Picker.svelte's `startOpen`, wie PersonPicker) —
     *  für Aufrufer, die den Picker hinter einem eigenen "+"-Trigger einblenden. */
    startOpen?: boolean;
    /** Reicht Picker.svelte's `onClose` durch (Aufrufer blenden den Picker per `{#if}` ein). */
    onClose?: () => void;
  }
  const {
    appState,
    value,
    onChange,
    allowNone = false,
    noneLabel = '— keine Familie —',
    placeholder = 'Familie wählen…',
    label = 'Familie auswählen',
    startOpen = false,
    onClose,
  }: Props = $props();

  const items = $derived(Array.from(appState.db.families.values()));

  function getLabel(f: Family): string {
    return familyLabelFor(appState.db, f.id);
  }

  function matches(f: Family, query: string): boolean {
    return matchesSearch(appState.db, f, query);
  }

  /** Frisches Familien-Gerüst mit kollisionsfreier id — exakt das FamilyList.svelte-Muster.
   *  Speichert SOFORT (kein Inline-Formular, s. Modul-Kommentar) und meldet die neue id
   *  direkt an den Aufrufer — kein Kontextverlust, kein Zwischenschritt. */
  function beginCreate() {
    const alloc = allocatorFromDatabase(appState.db);
    const id = nextId(alloc, 'F');
    const family = makeFamily(id);
    appState.saveFamily(family);
    onChange(id);
  }
</script>

<div class="family-picker">
  <Picker
    {items}
    getId={(f) => f.id}
    {getLabel}
    {matches}
    {value}
    {onChange}
    {allowNone}
    {noneLabel}
    {placeholder}
    {label}
    createLabel="+ Neue Familie anlegen …"
    onCreateRequested={beginCreate}
    {startOpen}
    {onClose}
  />
</div>

<style>
  .family-picker {
    min-width: 200px;
  }
</style>
