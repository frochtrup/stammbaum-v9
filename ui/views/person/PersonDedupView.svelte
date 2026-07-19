<script lang="ts">
  // ui/views/person/PersonDedupView.svelte — Duplikat-Erkennung für Personen (BL-104,
  // Spec 20 §1.12). Overlay im Personen-Segment, genau wie PlaceDedupView/HofDedupView
  // im Orte-/Höfe-Segment (INV-UI-4 — ein Muster, nicht pro Entität neu erfunden).
  //
  // Kein automatischer Scan beim Öffnen: der Nutzer stellt den Schwellenwert ein und
  // startet die Suche. Grund ist gemessen, nicht vermutet — am echten Bestand (2.795
  // Personen) dauert ein Lauf ~750 ms und liefert bei Schwelle 65 über tausend Paare;
  // ein Scan bei jedem Öffnen wäre eine spürbare Blockade für ein Werkzeug, das man oft
  // nur aufklappt, um es wieder zuzumachen.
  //
  // Zusammengeführt wird ausschließlich über `appState.mergePerson(...)` im Modal — hier
  // gibt es keine Merge-Logik, nur Auswahl und Anzeige.
  import type { AppState } from '../../shell/app-state.svelte';
  import { DEFAULT_DUPLICATE_THRESHOLD } from '../../../core/dedup';
  import { buildPersonDedupRows, type DedupPairRow } from './person-dedup-model';
  import PersonMergeModal from './PersonMergeModal.svelte';

  interface Props {
    appState: AppState;
    onClose?: () => void;
  }
  const { appState, onClose }: Props = $props();

  let threshold = $state(DEFAULT_DUPLICATE_THRESHOLD);
  let query = $state('');
  let scanned = $state(false);
  /** Schwelle des zuletzt GELAUFENEN Scans — der Regler allein ändert die Liste nicht. */
  let scannedThreshold = $state(DEFAULT_DUPLICATE_THRESHOLD);
  let statusMessage = $state('');
  let openPair = $state<DedupPairRow | null>(null);

  const graph = $derived({ individuals: appState.db.individuals, families: appState.db.families });
  const rows = $derived<DedupPairRow[]>(
    scanned ? buildPersonDedupRows(graph, appState.placeContext, scannedThreshold, query) : [],
  );
  /** Trefferzahl ohne Suchfilter — sonst sieht der Nutzer beim Tippen eine sinkende Gesamtzahl. */
  const totalRows = $derived<DedupPairRow[]>(
    scanned ? buildPersonDedupRows(graph, appState.placeContext, scannedThreshold) : [],
  );

  function runScan() {
    scannedThreshold = threshold;
    scanned = true;
    statusMessage = '';
  }

  function scoreClass(score: number): string {
    if (score >= 85) return 'person-dedup__score--high';
    if (score >= 75) return 'person-dedup__score--mid';
    return '';
  }
</script>

<div class="person-dedup">
  <div class="person-dedup__head">
    <h2>Personen — Duplikate</h2>
    {#if onClose}
      <button type="button" class="person-dedup__close-btn" onclick={onClose}>✕ Schließen</button>
    {/if}
  </div>

  <div class="person-dedup__controls">
    <label class="person-dedup__threshold">
      <span>Schwellenwert: {threshold}</span>
      <input type="range" min="40" max="95" step="5" bind:value={threshold} />
    </label>
    <button type="button" class="person-dedup__scan-btn" onclick={runScan}>Duplikate suchen</button>
  </div>

  {#if statusMessage}
    <p class="person-dedup__status">{statusMessage}</p>
  {/if}

  {#if !scanned}
    <p class="person-dedup__empty">Noch kein Scan durchgeführt.</p>
  {:else if totalRows.length === 0}
    <p class="person-dedup__empty">Keine verdächtigen Paare ab Score {scannedThreshold}.</p>
  {:else}
    <div class="person-dedup__searchwrap">
      <input
        type="search"
        class="person-dedup__search"
        placeholder="Ergebnisse durchsuchen"
        aria-label="Ergebnisse durchsuchen"
        bind:value={query}
      />
    </div>
    <p class="person-dedup__count">
      {#if query}
        {rows.length} von {totalRows.length} Paaren (Score ≥ {scannedThreshold})
      {:else}
        {totalRows.length} verdächtige Paare (Score ≥ {scannedThreshold})
      {/if}
    </p>

    <ul class="person-dedup__list">
      {#each rows as row (row.key)}
        <li>
          <button type="button" class="person-dedup__pair" onclick={() => (openPair = row)}>
            <span class="person-dedup__names">
              <span>{row.labelA}</span>
              <span class="person-dedup__vs">↔</span>
              <span>{row.labelB}</span>
              <span class={`person-dedup__score ${scoreClass(row.score)}`}>{row.score}</span>
            </span>
            <span class="person-dedup__meta">{row.metaA || '?'} &nbsp;↔&nbsp; {row.metaB || '?'}</span>
            {#if row.reasons.length}
              <span class="person-dedup__reasons">{row.reasons.join(' · ')}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if openPair}
  <!-- `{#key}` erzwingt eine frische Instanz je Paar. Ohne sie trüge ein zweites, ohne
       Unmount geöffnetes Paar die Feldauswahl des ersten weiter — genau das Zustands-Leck,
       das `resetKey` bei EventsByType erzwingt (ADR-v9-83). Dass es heute keinen Weg gibt,
       das Modal ohne Schließen umzuhängen, ist eine Eigenschaft des Aufrufers, keine
       Zusicherung dieser Komponente. -->
  {#key openPair.key}
    <PersonMergeModal
      {appState}
      idA={openPair.a}
      idB={openPair.b}
      score={openPair.score}
      reasons={openPair.reasons}
      suggestedWinner={openPair.suggestedWinner}
      onClose={() => (openPair = null)}
      onDone={(message) => (statusMessage = message)}
    />
  {/key}
{/if}

<style>
  .person-dedup {
    padding: 1rem;
    overflow-y: auto;
  }

  .person-dedup__head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .person-dedup__head h2 {
    margin: 0;
  }

  .person-dedup__close-btn {
    margin-left: auto;
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }

  .person-dedup__controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.8rem;
  }

  .person-dedup__threshold {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  /* Einziger Range-Regler der App — ohne das hier zeichnet der Browser ihn im
     System-Blau mitten in eine goldene Oberfläche. `accent-color` statt eines
     nachgebauten Tracks/Thumbs: eine Zeile, volle Tastatur- und Touch-Semantik. */
  .person-dedup__threshold input[type='range'] {
    accent-color: var(--stb-gold);
    max-width: 12rem;
  }

  .person-dedup__scan-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  .person-dedup__status {
    margin-top: 0.7rem;
    padding: 0.5rem 0.7rem;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    font-size: 0.85rem;
  }

  .person-dedup__empty {
    color: var(--stb-text-dim);
    margin-top: 1rem;
  }

  .person-dedup__searchwrap {
    margin-top: 0.8rem;
  }

  .person-dedup__search {
    width: 100%;
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
  }

  .person-dedup__count {
    font-size: 0.8rem;
    color: var(--stb-text-dim);
    margin: 0.5rem 0 0;
  }

  .person-dedup__list {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
  }

  .person-dedup__pair {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    width: 100%;
    text-align: left;
    background: var(--stb-surface-1);
    color: var(--stb-text);
    border: none;
    border-radius: var(--stb-radius-card);
    padding: 0.5rem 0.7rem;
    margin-bottom: 0.4rem;
    cursor: pointer;
    font: inherit;
  }

  .person-dedup__names {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem;
    font-size: 0.88rem;
  }

  .person-dedup__vs {
    color: var(--stb-text-dim);
  }

  .person-dedup__score {
    margin-left: auto;
    font-weight: 600;
    color: var(--stb-text-dim);
  }

  .person-dedup__score--mid {
    color: var(--stb-gold);
  }

  .person-dedup__score--high {
    color: var(--stb-quay-1);
  }

  .person-dedup__meta,
  .person-dedup__reasons {
    font-size: 0.76rem;
    color: var(--stb-text-dim);
  }
</style>
