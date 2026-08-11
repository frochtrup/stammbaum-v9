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
  import { buildSourceDetail, hasPageContent, type SourceReferenceRow, formatSourceCoverage } from './source-detail-model';
  import QuayMeter from '../../shell/QuayMeter.svelte';
  import EventsByType from '../../shell/EventsByType.svelte';
  import SourceForm from './SourceForm.svelte';
  import { tooltip } from '../../shell/tooltip';
  import { isSourceEmpty } from '../../../core/model';
  import { retractIfPristine } from '../../shell/create-retraction';

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
  /** Anlage-Sitzung nach „＋ Neue Quelle" (BL-275) — Begründung s. PersonDetail. */
  let freshlyCreated = $state(untrack(() => startInEdit));

  /** Speichern schließt den Modus (Transaktion abgeschlossen, INV-UI-16); „Verwerfen"
   *  im Formular darf das nicht — es betrifft nur die Feldwerte. */
  function afterSave() {
    editing = false;
    // Bewusst bestätigt: ab hier keine Rücknahme mehr (INV-UI-10 schützt den
    // unbestätigten Zustand).
    freshlyCreated = false;
  }

  /** Rücknahme einer leer gebliebenen Neuanlage (BL-275, INV-UI-10) — s. `create-retraction.ts`. */
  function retractIfAbandoned(): boolean {
    const weg = retractIfPristine({
      fresh: freshlyCreated,
      entity: detail?.source ?? null,
      isEmpty: isSourceEmpty,
      remove: (s) => appState.deleteSource(s.id),
    });
    if (weg) freshlyCreated = false;
    return weg;
  }

  function toggleEdit() {
    if (editing && retractIfAbandoned()) {
      onBack?.();
      return;
    }
    editing = !editing;
  }

  function handleBack() {
    retractIfAbandoned();
    onBack?.();
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
  <!-- QUAY-Marke + optionaler Weblink bilden EINE rechtsbündige Einheit. Führt die Referenz
       einen Online-Fundort, dockt das ↗ als „links geöffnete" Ergänzungs-Pille direkt an die
       QUAY-Pille an — dieselbe Optik wie an der Quellen-Pille (SourceBadge, INV-UI-12). -->
  <span class="source-detail__ref-end" class:source-detail__ref-end--linked={ref.url}>
    <span class="source-detail__ref-quay">
      QUAY {ref.quay}
      <QuayMeter quay={ref.quay} />
    </span>
    {#if ref.url}
      <!-- Read-only, öffnet in neuem Tab (ADR-v9-86); editiert wird der Weblink im
           Ereignis-Editor. stopPropagation, damit der Klick nicht den Owner-Button auslöst. -->
      <a
        class="source-detail__ref-link"
        href={ref.url}
        target="_blank"
        rel="noopener"
        aria-label={`Online-Fundort öffnen: ${ref.ownerLabel}`}
        use:tooltip={ref.url}
        onclick={(e) => e.stopPropagation()}
      >
        ↗
      </a>
    {/if}
  </span>
{/snippet}

<div class="source-detail">
  {#if !sourceId}
    <p class="source-detail__empty">Keine Quelle ausgewählt.</p>
  {:else if !detail}
    <p class="source-detail__empty">Quelle nicht gefunden (evtl. gelöscht oder Datei gewechselt).</p>
  {:else}
    <!-- BL-274/INV-UI-16: die Kopfzeile bleibt im Bearbeiten-Modus stehen. Vorher ersetzte
         das Formular die ganze Seite — Titel und Rückweg verschwanden genau dann, wenn der
         Nutzer den Namen ändert. Der Schalter öffnet UND schließt (kein zweiter Ausgang). -->
    <DetailHeader title={detail.source.abbr || detail.source.title || detail.source.id} onBack={handleBack}>
      {#snippet actions()}
        <button type="button" class="stb-btn" data-variant="secondary" onclick={toggleEdit}>
          {editing ? 'Fertig' : '✎ Bearbeiten'}
        </button>
      {/snippet}
    </DetailHeader>

    {#if editing}
      <SourceForm {appState} source={detail.source} onSaved={afterSave} />
    {/if}

    {#if detail.source.abbr && detail.source.title && detail.source.abbr !== detail.source.title}
      <p class="source-detail__fulltitle">{detail.source.title}</p>
    {/if}

    <dl class="source-detail__meta">
      {#if detail.source.author}
        <dt>Autor</dt>
        <dd>{detail.source.author}</dd>
      {/if}
      {#if detail.source.createdDate}
        <dt>Erfasst am</dt>
        <dd>{detail.source.createdDate}</dd>
      {/if}
      {#if detail.source.publisher}
        <dt>Verlag</dt>
        <dd>{detail.source.publisher}</dd>
      {/if}
      <!-- BL-217: Abdeckung (`SOUR.DATA.EVEN`) und verantwortliche Stelle (`SOUR.DATA.AGNC`).
           Beide sind read-only — sie kommen aus der Datei, werden in der App nicht erfasst
           (Spec 20 §1.6). Mehrere Abdeckungs-Angaben sind laut Grammatik erlaubt ({0:M}),
           deshalb je eine Zeile statt einer zusammengezogenen. -->
      {#if detail.source.dataEvents.length}
        <dt>Abdeckung</dt>
        <dd>
          {#each detail.source.dataEvents as de, i (i)}
            <div>{formatSourceCoverage(de)}</div>
          {/each}
        </dd>
      {/if}
      {#if detail.source.agnc}
        <dt>Behörde</dt>
        <dd>{detail.source.agnc}</dd>
      {/if}
      <!-- BL-201: das Signatur-MEDIUM (GEDCOM `SOUR.REPO.CALN.MEDI`, `source.callMedia`)
           hängt an der Signatur selbst, statt eine eigene Zeile für einen Zusatz zur
           bereits gezeigten Zahl aufzumachen — dieselbe Verdichtung wie im v8-Orakel
           (`Signatur: X (Buch)`). Ohne Medium bleibt die Zeile unverändert. -->
      {#if detail.source.callNumber}
        <dt>Signatur</dt>
        <dd>{detail.source.callNumber}{detail.source.callMedia ? ` (${detail.source.callMedia})` : ''}</dd>
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
      <!-- BL-201: externe Referenz-Nummern (GEDCOM `SOUR.REFN` + `TYPE`, `externalRefs`) —
           die Kennung, unter der die Quelle beim FÜHRENDEN Archiv/Portal läuft. Beschriftung
           bewusst „Externe Referenz" und nicht das v8-„Referenz": auf derselben Seite steht
           bereits die Sektion „Referenzen (N)" für die ZITIERENDEN Personen/Familien — zwei
           gleichnamige, gegensätzlich gerichtete Begriffe wären eine echte Verwechslung.
           Read-only: Spec 20 §2 führt das Feld nicht in der Quellen-Feldtabelle; der Wert
           reist unverändert über Parser/Writer (LP-1). -->
      {#each detail.source.externalRefs as ref, i (`${ref.type}-${ref.value}-${i}`)}
        <dt>{ref.type ? `Externe Referenz (${ref.type})` : 'Externe Referenz'}</dt>
        <dd>{ref.value}</dd>
      {/each}
    </dl>

    <!-- Zwei getrennte Textblöcke seit BL-336, und die Beschriftung sagt jetzt, welcher
         welcher ist: `text` (SOUR>TEXT) ist der ZITIERTE Wortlaut aus der Quelle,
         `noteText` (SOUR>NOTE) die Anmerkung ÜBER sie. Bis dahin gab es nur den ersten,
         unbeschriftet, und er trug beide Bedeutungen. -->
    {#if detail.source.text}
      <p class="stb-role-label">Wortlaut</p>
      <p class="source-detail__text">{detail.source.text}</p>
    {/if}
    {#if detail.source.noteText}
      <p class="stb-role-label">Notiz</p>
      <p class="source-detail__text">{detail.source.noteText}</p>
    {/if}

    <section class="source-detail__section">
      <h3 class="stb-section-title">Referenzen ({detail.references.length})</h3>
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

  /* Rechtsbündige Einheit aus QUAY-Marke + optionalem Weblink (das frühere `margin-left:auto`
     der QUAY-Pille lebt jetzt hier, damit die Ergänzungs-Pille bündig mitwandert). */
  .source-detail__ref-end {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
  }

  /* Klickbares ↗ zum Online-Fundort (ADR-v9-86) — monochromes Symbol wie an der
     Quellen-Pille (INV-UI-12), kein Emoji. stopPropagation, damit der Klick nicht
     zusätzlich den Owner-Navigations-Button auslöst. */
  .source-detail__ref-link {
    display: inline-flex;
    align-items: center;
    color: var(--stb-gold-light);
    text-decoration: none;
    font-size: 0.85rem;
    line-height: 1;
  }

  /* „Links geöffnete" Ergänzungs-Pille am rechten Ende der QUAY-Pille: flache linke Ecken
     (dockt an), rechts abgerundet; die linke Kante ist die geteilte Naht (QUAY-Pille trägt
     sie), daher border-left: none. Gleicher Rand, transparente Fläche wie die QUAY-Pille. */
  .source-detail__ref-end--linked .source-detail__ref-link {
    font-size: 0.72rem;
    padding: 0.1em 0.4em;
    border: 1px solid var(--stb-gold-dim);
    border-left: none;
    border-radius: 0 9px 9px 0;
  }

  .source-detail__ref-link:hover,
  .source-detail__ref-link:focus-visible {
    color: var(--stb-gold);
  }

  .source-detail__ref-end--linked .source-detail__ref-link:hover,
  .source-detail__ref-end--linked .source-detail__ref-link:focus-visible {
    border-color: var(--stb-gold);
    background: var(--stb-surface-2);
  }

  /* Neutrale „QUAY N"-Marke + Meter (ADR-v9-118): der Zahlenwert steht hier explizit,
     die Stufe zusätzlich als Pips — keine QUAY-Farbklasse mehr (kein Alarm-Rot für q0). */
  .source-detail__ref-quay {
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

  /* Mit Weblink gibt die QUAY-Pille rechts ihre Rundung auf, damit die Naht plan verläuft. */
  .source-detail__ref-end--linked .source-detail__ref-quay {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
</style>
