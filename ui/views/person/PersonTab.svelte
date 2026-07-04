<script lang="ts">
  // ui/views/person/PersonTab.svelte — Personen-Tab (Spec 20 §1.4). Mobile: Liste ODER
  // Detail (Master-Detail auf einer Fläche, Desktop-Multi-Pane ist NICHT Teil dieser
  // Scheibe). Ein Segment-Umschalter-Grundgerüst (Spec 21 §2: "Familien/Quellen/Orte/
  // Höfe über einen Segment-Umschalter") wird hier angelegt, aber bewusst NUR mit
  // "Personen" befüllt — die anderen Segmente sind sichtbare, deaktivierte Platzhalter.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import PersonList from './PersonList.svelte';
  import PersonDetail from './PersonDetail.svelte';

  interface Props {
    appState: AppState;
    viewState: ViewState;
  }
  const { appState, viewState }: Props = $props();

  const segments = ['Personen', 'Familien', 'Quellen', 'Orte', 'Höfe'] as const;
  const selectedPersonId = $derived(viewState.getCurrent('person'));

  function backToList() {
    viewState.setCurrent('person', null);
  }
</script>

<div class="person-tab">
  <div class="person-tab__segments" role="tablist" aria-label="Entität wählen">
    {#each segments as segment (segment)}
      <button
        type="button"
        role="tab"
        aria-selected={segment === 'Personen'}
        class="person-tab__segment"
        class:person-tab__segment--active={segment === 'Personen'}
        disabled={segment !== 'Personen'}
      >
        {segment}{segment === 'Personen' ? '' : ' (folgt)'}
      </button>
    {/each}
  </div>

  {#if selectedPersonId}
    <div class="person-tab__detail-header">
      <button type="button" class="person-tab__back" onclick={backToList}>← Zur Liste</button>
    </div>
    <PersonDetail {appState} {viewState} />
  {:else}
    <PersonList {appState} {viewState} />
  {/if}
</div>

<style>
  .person-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .person-tab__segments {
    display: flex;
    gap: 0.3rem;
    padding: 0.5rem 0.75rem;
    overflow-x: auto;
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .person-tab__segment {
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    color: var(--stb-text-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    font-size: 0.78rem;
    white-space: nowrap;
    cursor: not-allowed;
  }

  .person-tab__segment--active {
    background: var(--stb-gold);
    color: var(--stb-bg);
    font-weight: 700;
    border-color: var(--stb-gold);
    cursor: default;
  }

  .person-tab__detail-header {
    padding: 0.5rem 0.75rem 0;
  }

  .person-tab__back {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    font: inherit;
    padding: 0;
  }
</style>
