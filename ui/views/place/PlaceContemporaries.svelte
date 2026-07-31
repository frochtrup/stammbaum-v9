<script lang="ts">
  // ui/views/place/PlaceContemporaries.svelte — die „Ortszeitgenossen"-Sektion des
  // Ort-Steckbriefs (Spec 20 §1.7 [S], ADR-v9-78 Punkt 5). Aus PlaceDetail extrahiert,
  // damit diese Datei komfortabel unter dem max-lines-Limit bleibt (kohäsive Einheit:
  // eigener On-Demand-Zustand + Filter/Gruppierung, ohne Kopplung an die übrige Detail-UI).
  //
  // On-Demand (ADR-v9-78 Punkt 5): die Berechnung läuft NUR, solange die Sektion offen ist —
  // sie skaliert an Knotenpunkt-Orten auf hunderte Treffer, deshalb kein Dauer-Inhalt.
  import type { PlacesHost } from '../../shell/places-host';
  import EventsByType from '../../shell/EventsByType.svelte';
  import ViewModeToggle from '../../shell/ViewModeToggle.svelte';
  import FilterBar from '../../shell/FilterBar.svelte';
  import {
    buildPlaceContemporaries,
    groupContemporaries,
    type ContemporaryGroupMode,
    type PlaceContemporaryRow,
  } from './place-detail-model';

  interface Props {
    appState: PlacesHost;
    placeId: string | null;
    onNavigateToPerson?: (personId: string) => void;
  }
  const { appState, placeId, onNavigateToPerson }: Props = $props();

  let open = $state(false);
  let mode = $state<ContemporaryGroupMode>('decade');
  const MODES = [
    { id: 'decade', label: 'Nach Jahrzehnt' },
    { id: 'hof', label: 'Nach Hof' },
    { id: 'chrono', label: 'Chronologisch' },
  ];

  /** Zeitgenossen-Filter über EREIGNISJAHRE (Nutzer-Entscheidung 2026-07-16, NICHT über
   *  geschätzte Lebensspannen — kein Lebensspannen-Schätzer im Kern). Per Default AUS. */
  let filterEnabled = $state(false);
  let refYear = $state<number | null>(null);
  let windowYears = $state(25);

  const filter = $derived(
    filterEnabled && refYear != null ? { refYear, window: windowYears } : null,
  );
  const rows = $derived(
    open && placeId ? buildPlaceContemporaries(appState.db, appState.placeContext, placeId, filter) : [],
  );
  const groups = $derived(groupContemporaries(rows, mode));
  const activeFilterCount = $derived(filterEnabled ? 1 : 0);
</script>

{#snippet row(r: PlaceContemporaryRow)}
  <button type="button" class="contemporaries__owner-link" onclick={() => onNavigateToPerson?.(r.personId)}>
    {r.personName}
  </button>
  {#if r.year != null}<span class="contemporaries__muted">{r.year}</span>{/if}
  <span class="contemporaries__muted">{r.label}</span>
  <!-- Hof-Angabe als `.stb-pill` (nicht `.stb-role-label` — ein Hof-Name ist ein Eigenname,
       keine Rollen-Kategorie, ADR-v9-81). Im Hof-Modus entfällt sie (der Gruppen-Header
       trägt den Hof-Namen bereits). -->
  {#if r.hofLabel && mode !== 'hof'}<span class="stb-pill">{r.hofLabel}</span>{/if}
{/snippet}

<section class="contemporaries">
  <h3>Ortszeitgenossen</h3>
  <button
    type="button"
    class="contemporaries__toggle"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    {open ? 'Ortszeitgenossen ausblenden' : 'Ortszeitgenossen anzeigen'}
  </button>
  {#if open}
    <p class="contemporaries__muted">
      Personen mit einem Ereignis an diesem Ort oder einem seiner Höfe — chronologisch,
      nach Bedarf gruppiert/gefiltert.
    </p>
    <div class="contemporaries__toolbar">
      <ViewModeToggle
        modes={MODES}
        value={mode}
        onChange={(id) => (mode = id as ContemporaryGroupMode)}
        ariaLabel="Gruppierung wählen"
      />
      <FilterBar activeCount={activeFilterCount}>
        <div class="contemporaries__filter">
          <label class="stb-filter-opt stb-filter-opt--compact">
            <input type="checkbox" bind:checked={filterEnabled} />
            Zeitgenossen-Filter aktivieren
          </label>
          <label>
            Referenzjahr
            <input type="number" bind:value={refYear} disabled={!filterEnabled} aria-label="Referenzjahr" />
          </label>
          <label>
            Fenster (± Jahre)
            <input type="number" bind:value={windowYears} disabled={!filterEnabled} aria-label="Fensterbreite in Jahren" />
          </label>
          <p class="contemporaries__hint">
            Zeigt, wer in diesem Zeitfenster nachweislich am Ort dokumentiert ist — nicht,
            wer vermutlich damals gelebt hat (kein Lebensspannen-Schätzer).
          </p>
        </div>
      </FilterBar>
    </div>
    {#if rows.length === 0}
      <p class="contemporaries__muted">
        {filterEnabled && refYear != null
          ? 'Keine Personen im gewählten Zeitfenster.'
          : 'Keine Personen mit Ereignis an diesem Ort oder seinen Höfen erfasst.'}
      </p>
    {:else}
      <!-- resetKey umfasst Ort UND Gruppierungsmodus: ein Moduswechsel darf den Einklapp-/
           Paginierungs-Zustand der vorherigen Gruppierung nicht mitschleppen (ADR-v9-78 Punkt 6). -->
      <EventsByType {groups} {row} resetKey={`${placeId}::${mode}`} />
    {/if}
  {/if}
</section>

<style>
  .contemporaries {
    margin-top: 1.25rem;
  }

  .contemporaries h3 {
    font-size: 0.95rem;
    color: var(--stb-gold-light);
    margin-bottom: 0.4rem;
  }

  .contemporaries__toggle {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .contemporaries__muted {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .contemporaries__hint {
    color: var(--stb-text-dim);
    font-size: 0.78rem;
    margin: 0.6rem 0 0.2rem;
  }

  .contemporaries__owner-link {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    padding: 0;
    font: inherit;
    text-decoration: underline;
  }

  /* Toolbar-Zeile wie PlaceList.svelte's Filter-Zeile (INV-UI-4, kein neues Layout-Muster). */
  .contemporaries__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    margin: 0.6rem 0;
  }

  .contemporaries__filter {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: flex-end;
  }

  /* Nur die Feld-Beschriftungen (Text ÜBER dem Eingabefeld) sind eine Spalte. Die
     Filteroptionen tragen `.stb-filter-opt` und bleiben eine Zeile — vorher traf diese
     Regel ALLE Labels des Panels und musste per `!important` zurückgenommen werden. */
  .contemporaries__filter label:not(.stb-filter-opt) {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }

  .contemporaries__filter input[type='number'] {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.5rem;
    width: 6rem;
  }


  .contemporaries__filter .contemporaries__hint {
    flex-basis: 100%;
    margin: 0.2rem 0 0;
  }
</style>
