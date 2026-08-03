<script lang="ts">
  // ui/shell/EventCitationsSection.svelte — die Quellen-Sektion des Ereignis-Editors:
  // Überschrift, „+ Quelle hinzufügen" und die Liste der `SourceCitationRow`-Zeilen.
  //
  // Aus `EventEditModal.svelte` extrahiert, als diese die max-lines-Ratsche (BL-54) riss.
  // Es ist die Fortsetzung derselben Aufteilung, die schon `event-edit-citations.ts`
  // erzeugt hat: dort liegen die reinen Array-Funktionen (add/remove/setXAt), hier ihre
  // OBERFLÄCHE — Überschrift, Knopf, Zeilenliste und deren Stil. Was im Modal bleibt, ist
  // das Ereignis selbst.
  //
  // Sie hält keinen Zustand: sie bekommt die aktuelle Zitatliste und meldet jede Änderung
  // als GANZE neue Liste zurück (`onChange`) — dasselbe Whole-Object-Muster wie die
  // Kommandos des Kerns, kein Feld-Setter über eine fremde Struktur.
  import type { AppState } from './app-state.svelte';
  import type { Citation } from '../../core/model/types';
  import SourceCitationRow from './SourceCitationRow.svelte';
  import {
    addCitationFor,
    removeCitationAt,
    setCitationSourceAt,
    setCitationPageAt,
    setCitationNoteAt,
    setCitationQuayAt,
    setCitationUrlAt,
    setCitationEvalAt,
  } from './event-edit-citations';

  interface Props {
    appState: AppState;
    citations: Citation[];
    /** Beschriftungs-Präfix der Zeilen (der Ereignis-Name) — für `aria-label`. */
    labelPrefix: string;
    onChange: (next: Citation[]) => void;
  }
  const { appState, citations, labelPrefix, onChange }: Props = $props();

  const sources = $derived(Array.from(appState.db.sources.values()));

  /** Der EINE Guard, der eine Quelle voraussetzt — ohne Quellen gäbe es nichts zu zitieren. */
  function addCitation() {
    if (sources.length === 0) return;
    onChange(addCitationFor(citations, sources[0].id));
  }
</script>

<div class="event-citations">
  <div class="event-citations__head">
    <h5>Quellen</h5>
    <button type="button" class="event-citations__add-btn" onclick={addCitation} disabled={sources.length === 0}>
      + Quelle hinzufügen
    </button>
  </div>
  {#each citations as cit, i (i)}
    <SourceCitationRow
      {appState}
      citation={cit}
      index={i}
      {labelPrefix}
      onSourceChange={(id) => onChange(setCitationSourceAt(citations, i, id))}
      onPageChange={(page) => onChange(setCitationPageAt(citations, i, page))}
      onQuayChange={(quay) => onChange(setCitationQuayAt(citations, i, quay))}
      onNoteChange={(note) => onChange(setCitationNoteAt(citations, i, note))}
      onUrlChange={(u) => onChange(setCitationUrlAt(citations, i, u))}
      onEvalChange={(ev) => onChange(setCitationEvalAt(citations, i, ev))}
      onRemove={() => onChange(removeCitationAt(citations, i))}
    />
  {/each}
</div>

<style>
  .event-citations {
    margin-top: 0.6rem;
  }

  .event-citations__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.3rem;
  }

  .event-citations h5 {
    font-size: 0.8rem;
    color: var(--stb-text-dim);
    margin: 0;
  }

  .event-citations__add-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
    min-height: var(--stb-touch-target);
  }

  .event-citations__add-btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
</style>
