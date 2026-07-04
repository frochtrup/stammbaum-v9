<script lang="ts">
  // ui/views/repository/RepositoryDetail.svelte — Archiv-Detail (Spec 20 §1.6 [K]:
  // "Detail mit verlinkten Quellen, Signatur"), read-only für diese Scheibe.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { buildRepositoryDetail } from './repository-detail-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    onNavigateToSource: (sourceId: string) => void;
  }
  const { appState, viewState, onNavigateToSource }: Props = $props();

  const repoId = $derived(viewState.getCurrent('repository'));
  const detail = $derived(repoId ? buildRepositoryDetail(appState.db, repoId) : null);
</script>

<div class="repository-detail">
  {#if !repoId}
    <p class="repository-detail__empty">Kein Archiv ausgewählt.</p>
  {:else if !detail}
    <p class="repository-detail__empty">Archiv nicht gefunden (evtl. gelöscht oder Datei gewechselt).</p>
  {:else}
    <h2 class="repository-detail__name">{detail.repository.name}</h2>

    <dl class="repository-detail__meta">
      {#if detail.repository.type}
        <dt>Typ</dt>
        <dd>{detail.repository.type}</dd>
      {/if}
      {#if detail.repository.address}
        <dt>Adresse</dt>
        <dd>{detail.repository.address}</dd>
      {/if}
      {#if detail.repository.phone}
        <dt>Telefon</dt>
        <dd>{detail.repository.phone}</dd>
      {/if}
      {#if detail.repository.www}
        <dt>Website</dt>
        <dd><a href={detail.repository.www} target="_blank" rel="noopener noreferrer">{detail.repository.www}</a></dd>
      {/if}
      {#if detail.repository.email}
        <dt>E-Mail</dt>
        <dd>{detail.repository.email}</dd>
      {/if}
      {#if detail.repository.findingAid}
        <dt>Findbuch</dt>
        <dd><a href={detail.repository.findingAid} target="_blank" rel="noopener noreferrer">{detail.repository.findingAid}</a></dd>
      {/if}
    </dl>

    <section class="repository-detail__section">
      <h3>Verlinkte Quellen ({detail.sources.length})</h3>
      {#if detail.sources.length === 0}
        <p class="repository-detail__muted">Keine Quelle verweist auf dieses Archiv.</p>
      {:else}
        <ul class="repository-detail__sources">
          {#each detail.sources as src (src.sourceId)}
            <li>
              <button
                type="button"
                class="repository-detail__source-link"
                onclick={() => onNavigateToSource(src.sourceId)}
              >
                {src.label}
              </button>
              {#if src.callNumber}<span class="repository-detail__call-number">Sign. {src.callNumber}</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<style>
  .repository-detail {
    padding: 1rem;
    overflow-y: auto;
  }

  .repository-detail__empty {
    color: var(--stb-text-dim);
  }

  .repository-detail__name {
    margin-top: 0;
  }

  .repository-detail__meta {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.2rem 0.75rem;
    margin: 0.75rem 0;
    font-size: 0.88rem;
  }

  .repository-detail__meta dt {
    color: var(--stb-text-muted);
  }

  .repository-detail__meta dd {
    margin: 0;
  }

  .repository-detail__section {
    margin-top: 1.25rem;
  }

  .repository-detail__section h3 {
    font-size: 0.95rem;
    color: var(--stb-gold-light);
    margin-bottom: 0.4rem;
  }

  .repository-detail__muted {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .repository-detail__sources {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .repository-detail__sources li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--stb-surface-2);
  }

  .repository-detail__source-link {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    padding: 0;
    font: inherit;
    text-decoration: underline;
  }

  .repository-detail__call-number {
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }
</style>
