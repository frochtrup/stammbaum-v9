<script lang="ts">
  // ui/views/source/SourceDetail.svelte — Quellen-Detail (Spec 20 §1.6 [K], read-only
  // für diese Scheibe): alle referenzierenden Personen/Familien inkl. PAGE/QUAY,
  // verlinktes Archiv (Repository).
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { buildSourceDetail } from './source-detail-model';
  import { quayClassFor } from '../../shell/source-badge';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    onNavigateToPerson: (personId: string) => void;
    onNavigateToFamily: (familyId: string) => void;
    onNavigateToRepository: (repoId: string) => void;
  }
  const { appState, viewState, onNavigateToPerson, onNavigateToFamily, onNavigateToRepository }: Props =
    $props();

  const sourceId = $derived(viewState.getCurrent('source'));
  const detail = $derived(sourceId ? buildSourceDetail(appState.db, sourceId) : null);

  function navigateToOwner(kind: 'person' | 'family', id: string) {
    if (kind === 'person') onNavigateToPerson(id);
    else onNavigateToFamily(id);
  }
</script>

<div class="source-detail">
  {#if !sourceId}
    <p class="source-detail__empty">Keine Quelle ausgewählt.</p>
  {:else if !detail}
    <p class="source-detail__empty">Quelle nicht gefunden (evtl. gelöscht oder Datei gewechselt).</p>
  {:else}
    <h2 class="source-detail__title">{detail.source.abbr || detail.source.title || detail.source.id}</h2>
    {#if detail.source.abbr && detail.source.title && detail.source.abbr !== detail.source.title}
      <p class="source-detail__fulltitle">{detail.source.title}</p>
    {/if}

    <dl class="source-detail__meta">
      {#if detail.source.author}
        <dt>Autor</dt>
        <dd>{detail.source.author}</dd>
      {/if}
      {#if detail.source.date}
        <dt>Datum</dt>
        <dd>{detail.source.date}</dd>
      {/if}
      {#if detail.source.publisher}
        <dt>Verlag</dt>
        <dd>{detail.source.publisher}</dd>
      {/if}
      {#if detail.source.callNumber}
        <dt>Signatur</dt>
        <dd>{detail.source.callNumber}</dd>
      {/if}
      {#if detail.repository}
        <dt>Archiv</dt>
        <dd>
          <button
            type="button"
            class="source-detail__repo-link"
            onclick={() => onNavigateToRepository(detail.repository!.id)}
          >
            {detail.repository.name}
          </button>
        </dd>
      {/if}
    </dl>

    {#if detail.source.text}<p class="source-detail__text">{detail.source.text}</p>{/if}

    <section class="source-detail__section">
      <h3>Referenzen ({detail.references.length})</h3>
      {#if detail.references.length === 0}
        <p class="source-detail__muted">Keine Zitatstelle referenziert diese Quelle.</p>
      {:else}
        <ul class="source-detail__refs">
          {#each detail.references as ref, i (i)}
            <li class="source-detail__ref">
              <button
                type="button"
                class="source-detail__ref-owner"
                onclick={() => navigateToOwner(ref.ownerKind, ref.ownerId)}
              >
                {ref.ownerLabel}
              </button>
              <span class="source-detail__ref-context">{ref.context}</span>
              {#if ref.page}<span class="source-detail__ref-page">S. {ref.page}</span>{/if}
              <span class="source-detail__ref-quay {quayClassFor(ref.quay)}">
                QUAY {ref.quay}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<style>
  .source-detail {
    padding: 1rem;
    overflow-y: auto;
  }

  .source-detail__empty {
    color: var(--stb-text-dim);
  }

  .source-detail__title {
    margin-top: 0;
    margin-bottom: 0.2rem;
  }

  .source-detail__fulltitle {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
    margin-top: 0;
  }

  .source-detail__meta {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.2rem 0.75rem;
    margin: 0.75rem 0;
    font-size: 0.88rem;
  }

  .source-detail__meta dt {
    color: var(--stb-text-muted);
  }

  .source-detail__meta dd {
    margin: 0;
  }

  .source-detail__repo-link {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    padding: 0;
    font: inherit;
    text-decoration: underline;
  }

  .source-detail__text {
    font-size: 0.85rem;
    color: var(--stb-text-dim);
    white-space: pre-wrap;
  }

  .source-detail__section {
    margin-top: 1.25rem;
  }

  .source-detail__section h3 {
    font-size: 0.95rem;
    color: var(--stb-gold-light);
    margin-bottom: 0.4rem;
  }

  .source-detail__muted {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .source-detail__refs {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .source-detail__ref {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--stb-surface-2);
    font-size: 0.85rem;
  }

  .source-detail__ref-owner {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    padding: 0;
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
  }

  .source-detail__ref-context {
    color: var(--stb-text-dim);
  }

  .source-detail__ref-page {
    color: var(--stb-text-dim);
  }

  .source-detail__ref-quay {
    margin-left: auto;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.1em 0.4em;
    border-radius: 9px;
    border: 1px solid var(--stb-gold-dim);
  }

  .source-detail__ref-quay.src-badge--q0 {
    border-color: var(--stb-quay-0);
    color: var(--stb-quay-0);
  }
  .source-detail__ref-quay.src-badge--q1 {
    border-color: var(--stb-quay-1);
    color: var(--stb-quay-1);
  }
  .source-detail__ref-quay.src-badge--q2 {
    border-color: var(--stb-quay-2);
    color: var(--stb-quay-2);
  }
  .source-detail__ref-quay.src-badge--q3 {
    border-color: var(--stb-quay-3);
    color: var(--stb-quay-3);
  }
</style>
