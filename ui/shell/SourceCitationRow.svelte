<script lang="ts">
  // ui/shell/SourceCitationRow.svelte — kompakte EIN-Zeilen-Darstellung einer Quellen-
  // Zitation (Citation) an einem Ereignis/einer Familie (INV-UI-4, INV-UI-5). Ersetzt das
  // bisherige 3-Zeilen-Layout in PersonForm.svelte/FamilyForm.svelte (1: große Karte für
  // die Quelle im vollen Entitäts-Picker-Kartenstil `.stb-person-box`, 2: Seite+QUAY-
  // Zeile, 3: Notiz+Entfernen-Zeile) durch EINE flex-wrap-Zeile: Quellenname als Text-Link
  // + Seite + QUAY + Notiz + ✕ — analog dem etablierten kompakten Zeilen-Muster
  // (`.person-detail__event-head`, PersonDetail.svelte: display:flex, flex-wrap:wrap,
  // align-items, gap — kein neues Muster erfunden, INV-UI-4).
  //
  // Der Quellenname-Link übernimmt exakt die bisherige Karten-Klick-Funktion (Quelle
  // wechseln ODER inline neu anlegen) — direkt über die generische Picker-Shell komponiert
  // (analog EventPlaceField.svelte/EventAddrField.svelte: eigener kompakter Auslöser +
  // `Picker.svelte` mit startOpen=true + Inline-SourceForm-Neuanlage), statt die
  // `SourcePicker.svelte`-Karte einzubetten (die für DIESEN dichten Zeilen-Kontext zu groß
  // ist — SourcePicker bleibt an anderer Stelle, z. B. Repository-/Aufgaben-Referenzfeld,
  // weiterhin der richtige Stil, INV-UI-4 "EIN Stil pro Kontext, nicht pro Datentyp").
  //
  // Chokepoint-Disziplin: liest appState.db.sources NUR lesend; jede Änderung läuft über
  // die vom Aufrufer übergebenen onX-Callbacks (PersonForm/FamilyForm bauen daraus das
  // volle Citation-Objekt und rufen appState.savePerson/saveFamily(model) — kein Feld-
  // Setter-Pattern hier).
  import type { AppState } from './app-state.svelte';
  import type { Source, Citation, Quay } from '../../core/model/types';
  import { makeSource, allocatorFromDatabase, nextId } from '../../core/model';
  import { matchesSearch } from '../views/source/source-list-model';
  import SourceForm from '../views/source/SourceForm.svelte';
  import Picker from './Picker.svelte';

  interface Props {
    appState: AppState;
    citation: Citation;
    /** 0-basierter Index innerhalb der Zitationsliste — für aria-labels ("Quelle 2" usw.),
     *  identisch zu den bisherigen, direkt in PersonForm/FamilyForm gebauten Labels. */
    index: number;
    /** Formular-Kontext-Präfix für aria-labels (z. B. "Geburt (BIRT)", "Familie"). */
    labelPrefix: string;
    onSourceChange: (sourceId: string) => void;
    onPageChange: (page: string) => void;
    onQuayChange: (quay: Quay) => void;
    onNoteChange: (note: string) => void;
    onRemove: () => void;
  }
  const {
    appState,
    citation,
    index,
    labelPrefix,
    onSourceChange,
    onPageChange,
    onQuayChange,
    onNoteChange,
    onRemove,
  }: Props = $props();

  const sources = $derived(Array.from(appState.db.sources.values()));
  const selectedSource = $derived<Source | undefined>(sources.find((s) => s.id === citation.sourceId));

  function sourceLabel(s: Source): string {
    return s.abbr || s.title || s.id;
  }

  function sourceSubLabel(s: Source): string {
    return [s.author, s.date].filter(Boolean).join(' · ');
  }

  /** Wie Picker.svelte's Fallback (Zeile "value referenziert keinen Kandidaten..."): eine
   *  dangling sourceId wird als Rohwert gezeigt statt stillschweigend zu verschwinden
   *  (TST-9). */
  const displayLabel = $derived(selectedSource ? sourceLabel(selectedSource) : citation.sourceId);
  const displayTitle = $derived(selectedSource ? sourceSubLabel(selectedSource) : '');

  let panelOpen = $state(false);
  let creating = $state(false);
  let draft = $state<Source | null>(null);

  function togglePanel() {
    panelOpen = !panelOpen;
    creating = false;
  }

  function selectExisting(id: string | null) {
    if (id) onSourceChange(id);
    panelOpen = false;
  }

  /** Frisches Quellen-Gerüst mit kollisionsfreier id — exakt das SourcePicker.svelte-Muster. */
  function draftSource(): Source {
    const alloc = allocatorFromDatabase(appState.db);
    const id = nextId(alloc, 'S');
    return makeSource(id);
  }

  function beginCreate() {
    draft = draftSource();
    creating = true;
  }

  function onSourceCreated(id: string) {
    creating = false;
    panelOpen = false;
    draft = null;
    onSourceChange(id);
  }

  function cancelCreate() {
    creating = false;
    draft = null;
  }
</script>

<div class="source-citation-row">
  <button
    type="button"
    class="source-citation-row__source-link"
    aria-label={`${labelPrefix} Quelle ${index + 1}`}
    title={displayTitle || undefined}
    onclick={togglePanel}
  >
    {displayLabel}
  </button>
  <input
    type="text"
    class="source-citation-row__page"
    placeholder="Seite"
    aria-label={`${labelPrefix} Seite ${index + 1}`}
    value={citation.page}
    onchange={(e) => onPageChange((e.currentTarget as HTMLInputElement).value)}
  />
  <select
    class="source-citation-row__quay"
    aria-label={`${labelPrefix} Zuverlässigkeit ${index + 1}`}
    value={String(citation.quay)}
    onchange={(e) => onQuayChange(Number((e.currentTarget as HTMLSelectElement).value) as Quay)}
  >
    <option value="0">QUAY 0</option>
    <option value="1">QUAY 1</option>
    <option value="2">QUAY 2</option>
    <option value="3">QUAY 3</option>
  </select>
  <input
    type="text"
    class="source-citation-row__note"
    placeholder="Notiz"
    aria-label={`${labelPrefix} Notiz ${index + 1}`}
    value={citation.note}
    onchange={(e) => onNoteChange((e.currentTarget as HTMLInputElement).value)}
  />
  <!-- TODO Folgeschritt: Evidenz-Achsen (eval: source/information/evidence) — unverändert
       aus PersonForm.svelte/FamilyForm.svelte übernommen, nicht Teil dieser Scheibe
       (Spec 20 §2). -->
  <button
    type="button"
    class="source-citation-row__remove-btn"
    onclick={onRemove}
    aria-label={`${labelPrefix} Quelle ${index + 1} entfernen`}
  >
    ✕
  </button>
</div>
{#if panelOpen}
  <div class="source-citation-row__panel">
    {#if creating && draft}
      <SourceForm {appState} source={draft} onSaved={onSourceCreated} onCancel={cancelCreate} />
    {:else}
      <Picker
        items={sources}
        getId={(s) => s.id}
        getLabel={sourceLabel}
        getSubLabel={sourceSubLabel}
        matches={matchesSearch}
        value={citation.sourceId}
        onChange={selectExisting}
        label={`${labelPrefix} Quelle ${index + 1} auswählen`}
        placeholder="Quelle suchen…"
        createLabel="+ Neue Quelle anlegen …"
        onCreateRequested={beginCreate}
        startOpen={true}
      />
    {/if}
  </div>
{/if}

<style>
  /* EIN flex-wrap-Zeilen-Muster analog PersonDetail.svelte .person-detail__event-head —
     kein margin-left:auto (TST-11-Falle: der Entfernen-Button ist nicht garantiert das
     letzte Element in der Zeile, sobald sie umbricht). */
  .source-citation-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.35rem;
  }

  .source-citation-row__source-link {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
    padding: 0;
    max-width: 11rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-citation-row__source-link:hover,
  .source-citation-row__source-link:focus-visible {
    color: var(--stb-gold);
  }

  .source-citation-row input,
  .source-citation-row select {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.4rem;
    font: inherit;
    font-size: 0.85rem;
  }

  .source-citation-row__page {
    width: 4.6rem;
    flex: 0 0 auto;
  }

  .source-citation-row__quay {
    flex: 0 1 6.5rem;
    min-width: 0;
  }

  .source-citation-row__note {
    flex: 1 1 8rem;
    min-width: 6rem;
  }

  .source-citation-row__remove-btn {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 0.8rem;
    flex: 0 0 auto;
  }

  .source-citation-row__panel {
    margin-bottom: 0.5rem;
  }
</style>
