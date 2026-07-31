<script lang="ts">
  // ui/views/repository/RepositoryDetail.svelte — Archiv-Detail (Spec 20 §1.6 [K]:
  // "Detail mit verlinkten Quellen, Signatur"). "Bearbeiten" öffnet RepositoryForm inline
  // (analog PlaceDetail.svelte's editing-Abschnitt, Spec 20 §2) — EINE gemeinsame
  // Kopfzeile über DetailHeader (Spec 21 §6b, INV-UI-4), von Anfang an.
  import { untrack } from 'svelte';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import DetailHeader from '../../shell/DetailHeader.svelte';
  import DeleteEntityButton from '../../shell/DeleteEntityButton.svelte';
  import { buildRepositoryDetail } from './repository-detail-model';
  import { repoTypeLabel } from '../../shell/repo-labels';
  import RepositoryForm from './RepositoryForm.svelte';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    onNavigateToSource: (sourceId: string) => void;
    /** "← Zur Liste" (Spec 21 §6b: EINE gemeinsame Kopfzeile statt EntityTabs eigener
     *  Zeile) — optional, damit isolierte Tests/Kontexte ohne EntityTab weiterlaufen. */
    onBack?: () => void;
    /** Öffnet den Editor sofort beim Mount (z. B. direkt nach "＋ Neues Archiv", Spec 20 §2).
     *  Nur der Startwert zählt (untrack) — kein fortlaufendes Re-Öffnen bei jedem Re-Render. */
    startInEdit?: boolean;
  }
  const { appState, viewState, onNavigateToSource, onBack, startInEdit = false }: Props = $props();

  const repoId = $derived(viewState.getCurrent('repository'));
  const detail = $derived(repoId ? buildRepositoryDetail(appState.db, repoId) : null);

  let editing = $state(untrack(() => startInEdit));

  function startEdit() {
    editing = true;
  }

  function cancelEdit() {
    editing = false;
  }

  function afterSave() {
    editing = false;
  }
</script>

<div class="repository-detail">
  {#if !repoId}
    <p class="repository-detail__empty">Kein Archiv ausgewählt.</p>
  {:else if !detail}
    <p class="repository-detail__empty">Archiv nicht gefunden (evtl. gelöscht oder Datei gewechselt).</p>
  {:else if editing}
    <RepositoryForm {appState} repository={detail.repository} onSaved={afterSave} onCancel={cancelEdit} />
  {:else}
    <DetailHeader title={detail.repository.name || detail.repository.id} onBack={onBack ?? (() => {})}>
      {#snippet actions()}
        <button type="button" class="repository-detail__edit-btn" onclick={startEdit}>✎ Bearbeiten</button>
      {/snippet}
    </DetailHeader>

    <dl class="repository-detail__meta">
      <!-- BL-203: deutsches Label über DIE EINE Quelle (`repoTypeLabel`), nie der rohe
           GRAMPS-/`_RTYPE`-Wert. `Unknown`/leer liefern '' → die Zeile entfällt (dieselbe
           Polarität wie der Ortstyp, ADR-v9-149). -->
      {#if repoTypeLabel(detail.repository.type)}
        <dt>Typ</dt>
        <dd>{repoTypeLabel(detail.repository.type)}</dd>
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

    <DeleteEntityButton
      label="Archiv löschen"
      message={`Archiv „${detail.repository.name || detail.repository.id}" wirklich löschen? Quellen, die auf dieses Archiv verweisen, verlieren nur die Verknüpfung (die Quellen selbst bleiben bestehen).`}
      onConfirm={() => {
        appState.deleteRepository(detail.repository.id);
        editing = false;
        onBack?.();
      }}
    />
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

  .repository-detail__edit-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
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
