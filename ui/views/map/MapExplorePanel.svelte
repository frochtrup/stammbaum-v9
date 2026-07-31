<script lang="ts">
  // ui/views/map/MapExplorePanel.svelte — Orts-Explorationspanel der Karte-Lens
  // (BL-210, Spec 20 §1.9; v8-Orakel `_showExplorationPanel`, ui-views-map.js:399).
  //
  // Klick auf einen Marker beantwortet die Frage, für die man auf die Karte gegangen
  // ist: WER war hier? Bewusst ein Panel IN der Lens und kein Sprung in den Steckbrief:
  // Kartenarbeit ist räumliches Vergleichen (dieser Ort gegen den Nachbarort) — ein
  // Sprung, der die Karte verlässt, zerreißt genau das. Der Steckbrief bleibt EINEN
  // Klick entfernt („→ Steckbrief"), womit auch die Gegenrichtung der Mini-Karte
  // (ADR-v9-150: Steckbrief → Karte) geschlossen ist.
  //
  // Die Zeilen kommen aus den BESTEHENDEN Quellen (`map-explore-model.ts`:
  // Ortszeitgenossen bzw. Hof-Bewohner/-Eigentümer), nicht aus einer dritten,
  // karten-eigenen Sammlung (INV-UI-4).
  import type { AppState } from '../../shell/app-state.svelte';
  import { buildMapExplore } from './map-explore-model';

  interface Props {
    appState: AppState;
    /** Geklickter Marker (Place- ODER Hof-Id) — `null` = Panel geschlossen. */
    placeId: string | null;
    onClose: () => void;
    onNavigateToPerson?: (personId: string) => void;
    onNavigateToPlace?: (placeId: string) => void;
    onNavigateToHof?: (hofId: string) => void;
  }
  const { appState, placeId, onClose, onNavigateToPerson, onNavigateToPlace, onNavigateToHof }: Props = $props();

  const model = $derived(placeId ? buildMapExplore(appState.db, appState.placeContext, placeId) : null);

  function openDetail(): void {
    if (!model) return;
    if (model.kind === 'hof') onNavigateToHof?.(model.id);
    else onNavigateToPlace?.(model.id);
  }
</script>

{#if model}
  <aside class="map-explore" aria-label="Personen an diesem Ort">
    <header class="map-explore__head">
      <span class="map-explore__title">{model.title}</span>
      <span class="map-explore__count">{model.rows.length}</span>
      <button
        type="button"
        class="map-explore__detail-btn"
        onclick={openDetail}
      >→ Steckbrief</button>
      <button type="button" class="map-explore__close" aria-label="Panel schließen" onclick={onClose}>✕</button>
    </header>

    {#if model.rows.length === 0}
      <p class="map-explore__empty">Keine Personen mit einem Ereignis an dieser Stelle erfasst.</p>
    {:else}
      <ul class="map-explore__list">
        {#each model.rows as r (r.key)}
          <li class="map-explore__row">
            <button
              type="button"
              class="map-explore__person"
              onclick={() => onNavigateToPerson?.(r.personId)}
            >{r.personName}</button>
            {#if r.year != null}<span class="map-explore__muted">{r.year}</span>{/if}
            <span class="map-explore__muted">{r.label}</span>
            {#if r.detail}<span class="stb-pill">{r.detail}</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </aside>
{/if}

<style>
  /* Kein Overlay ÜBER der Karte (das v8-Panel lag absolut positioniert darauf und
     verdeckte auf 375px die halbe Karte), sondern eine eigene Zeile UNTER ihr, mit
     eigener Scroll-Fläche. Damit bleibt der geklickte Marker sichtbar — die Karte ist
     der Kontext, nicht die Kulisse. */
  .map-explore {
    display: flex;
    flex-direction: column;
    max-height: 40%;
    min-height: 0;
    margin: 0.5rem 0.75rem 0;
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    background: var(--stb-surface-1);
  }

  .map-explore__head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .map-explore__title {
    font-weight: 600;
    color: var(--stb-gold-light);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .map-explore__count {
    color: var(--stb-text-dim);
    font-size: 0.78rem;
    margin-right: auto;
  }

  .map-explore__detail-btn,
  .map-explore__close {
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    color: var(--stb-gold-light);
    border-radius: var(--stb-radius-control);
    padding: 0.2rem 0.5rem;
    font-size: 0.76rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .map-explore__list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    min-height: 0;
  }

  .map-explore__row {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.3rem 0.6rem;
    border-bottom: 1px solid var(--stb-surface-2);
    font-size: 0.82rem;
  }

  .map-explore__person {
    background: none;
    border: none;
    padding: 0;
    color: var(--stb-gold-light);
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
  }

  .map-explore__muted {
    color: var(--stb-text-dim);
  }

  .map-explore__empty {
    margin: 0;
    padding: 0.5rem 0.6rem;
    color: var(--stb-text-dim);
    font-size: 0.82rem;
  }
</style>
