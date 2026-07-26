<script lang="ts">
  // ui/views/source/SourceDetail.svelte — Quellen-Detail (Spec 20 §1.6 [K]): alle
  // referenzierenden Personen/Familien inkl. PAGE/QUAY, verlinktes Archiv (Repository).
  // "Bearbeiten" öffnet SourceForm inline (analog PlaceDetail.svelte's editing-Abschnitt,
  // Spec 20 §2) — EINE gemeinsame Kopfzeile über DetailHeader (Spec 21 §6b, INV-UI-4),
  // von Anfang an, statt EntityTabs alten Pauschal-Header-Fallback zu nutzen.
  import { untrack } from 'svelte';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import DetailHeader from '../../shell/DetailHeader.svelte';
  import DeleteEntityButton from '../../shell/DeleteEntityButton.svelte';
  import { buildSourceDetail, hasPageContent, type SourceReferenceRow } from './source-detail-model';
  import QuayMeter from '../../shell/QuayMeter.svelte';
  import EventsByType from '../../shell/EventsByType.svelte';
  import SourceForm from './SourceForm.svelte';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    onNavigateToPerson: (personId: string) => void;
    onNavigateToFamily: (familyId: string) => void;
    onNavigateToRepository: (repoId: string) => void;
    /** "← Zur Liste" (Spec 21 §6b: EINE gemeinsame Kopfzeile statt EntityTabs eigener
     *  Zeile) — optional, damit isolierte Tests/Kontexte ohne EntityTab weiterlaufen. */
    onBack?: () => void;
    /** Öffnet den Editor sofort beim Mount (z. B. direkt nach "＋ Neue Quelle", Spec 20 §2).
     *  Nur der Startwert zählt (untrack) — kein fortlaufendes Re-Öffnen bei jedem Re-Render. */
    startInEdit?: boolean;
  }
  const {
    appState,
    viewState,
    onNavigateToPerson,
    onNavigateToFamily,
    onNavigateToRepository,
    onBack,
    startInEdit = false,
  }: Props = $props();

  const sourceId = $derived(viewState.getCurrent('source'));
  const detail = $derived(sourceId ? buildSourceDetail(appState.db, sourceId) : null);

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

  function navigateToOwner(kind: 'person' | 'family', id: string) {
    if (kind === 'person') onNavigateToPerson(id);
    else onNavigateToFamily(id);
  }
</script>

{#snippet refRow(ref: SourceReferenceRow)}
  <button
    type="button"
    class="source-detail__ref-owner"
    onclick={() => navigateToOwner(ref.ownerKind, ref.ownerId)}
  >
    {ref.ownerLabel}
  </button>
  {#if hasPageContent(ref.page)}<span class="source-detail__ref-page">S. {ref.page}</span>{/if}
  <span class="source-detail__ref-quay">
    QUAY {ref.quay}
    <QuayMeter quay={ref.quay} />
  </span>
{/snippet}

<div class="source-detail">
  {#if !sourceId}
    <p class="source-detail__empty">Keine Quelle ausgewählt.</p>
  {:else if !detail}
    <p class="source-detail__empty">Quelle nicht gefunden (evtl. gelöscht oder Datei gewechselt).</p>
  {:else if editing}
    <SourceForm {appState} source={detail.source} onSaved={afterSave} onCancel={cancelEdit} />
  {:else}
    <DetailHeader title={detail.source.abbr || detail.source.title || detail.source.id} onBack={onBack ?? (() => {})}>
      {#snippet actions()}
        <button type="button" class="source-detail__edit-btn" onclick={startEdit}>✎ Bearbeiten</button>
      {/snippet}
    </DetailHeader>

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
        <EventsByType groups={detail.referencesByType} row={refRow} resetKey={sourceId} />
      {/if}
    </section>

    <DeleteEntityButton
      label="Quelle löschen"
      message={`Quelle „${detail.source.abbr || detail.source.title || detail.source.id}" wirklich löschen? Alle Zitate auf diese Quelle werden entfernt (die zitierenden Personen/Familien/Ereignisse selbst bleiben bestehen).`}
      onConfirm={() => {
        appState.deleteSource(detail.source.id);
        editing = false;
        onBack?.();
      }}
    />
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

  .source-detail__edit-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
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

  /* Referenzen-Gruppierung/-Paginierung/-Einklappen kommt jetzt VOLLSTÄNDIG aus
     EventsByType.svelte (Spec 21 §10b, ADR-v9-78 Punkt 6, INV-UI-4) — kein eigenes
     Gruppen-/Paginierungs-Markup mehr hier. Die Zeile selbst (refRow-Snippet) setzt
     ihre Schriftgröße explizit (0.85rem), weil EventsByType's geteiltes `<li>` bewusst
     KEINE eigene Schriftgröße vorgibt (Konsumenten mit unterschiedlichem Zeileninhalt,
     analog PlaceDetail.svelte's placeEventRow-Snippet). */
  .source-detail__ref-owner {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    padding: 0;
    font-size: 0.85rem;
    font-weight: 600;
    text-decoration: underline;
  }

  /* #2 (2026-07-25): der Referenz-Kontext ("Person"/"Geburt"/…) steht bereits im
     Gruppen-Header (EventsByType rendert `{group.type} ({N})`, gruppiert nach genau
     diesem `context`) — ihn zusätzlich je Zeile zu wiederholen war reine Redundanz
     ("Person (1)" über einer Zeile "… Person S. …"). Deshalb kein `.ref-context` mehr. */
  .source-detail__ref-page {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  /* Neutrale „QUAY N"-Marke + Meter (ADR-v9-118): der Zahlenwert steht hier explizit,
     die Stufe zusätzlich als Pips — keine QUAY-Farbklasse mehr (kein Alarm-Rot für q0). */
  .source-detail__ref-quay {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--stb-text-dim);
    padding: 0.1em 0.4em;
    border-radius: 9px;
    border: 1px solid var(--stb-gold-dim);
  }
</style>
