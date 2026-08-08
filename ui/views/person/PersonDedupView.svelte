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
  //
  // PAGINIERUNG (Spec 21 §10b, `pageSlice`): NICHT aus Performance-Gründen — das wurde
  // gemessen und widerlegt. Am echten Bestand (3.180 Personen, 1.267 Paare) kosten die
  // 1.266 zusätzlichen Zeilen rund 34 ms (1.523 ms gegenüber 1.489 ms bei EINER Zeile,
  // Layout erzwungen); die 1,5 s sind der Scan selbst und fallen unabhängig von der
  // Zeilenzahl an. Der Grund ist der, den §10b selbst nennt — Einfachheit: ungedeckelt
  // ergaben 1.267 Paare eine 90.212 px lange Scrollstrecke und 11.542 DOM-Knoten.
  // Bewusst dieselbe Primitive wie EventsByType, kein zweiter Mechanismus (INV-UI-4).
  import type { AppState } from '../../shell/app-state.svelte';
  import { PLAIN_FIELD, PROSE_FIELD } from '../../shell/plain-input';
  import { DEFAULT_DUPLICATE_THRESHOLD, collectIdentityExclusions } from '../../../core/dedup';
  import { pageSlice, DEFAULT_PAGE_SIZE } from '../../shell/pagination';
  import { IdbDedupIgnoreStore, loadIgnoredPairs, type DedupIgnoreStore } from '../../../services/dedup';
  import { newHypothesisId } from '../hypotheses/hypothesis-commands';
  import { buildPersonDedupRows, type DedupPairRow } from './person-dedup-model';
  import PersonMergeModal from './PersonMergeModal.svelte';

  interface Props {
    appState: AppState;
    onClose?: () => void;
    /** NUR für die einmalige Übernahme der früheren, gerätelokalen Ignorierliste
     *  (ADR-v9-174): der Store wird nicht mehr geschrieben. Injizierbar für den Test. */
    ignoreStore?: DedupIgnoreStore;
  }
  const { appState, onClose, ignoreStore = new IdbDedupIgnoreStore() }: Props = $props();

  let threshold = $state(DEFAULT_DUPLICATE_THRESHOLD);
  let query = $state('');
  let scanned = $state(false);
  /** Schwelle des zuletzt GELAUFENEN Scans — der Regler allein ändert die Liste nicht. */
  let scannedThreshold = $state(DEFAULT_DUPLICATE_THRESHOLD);
  let statusMessage = $state('');
  let openPair = $state<DedupPairRow | null>(null);
  /** Paar, für das gerade die Pflicht-Begründung erfasst wird (INV-H3). */
  let excluding = $state<DedupPairRow | null>(null);
  let exclusionReason = $state('');
  /** Altbestand der früheren, gerätelokalen Ignorierliste — nur zum Übernehmen-Angebot. */
  let legacyPairs = $state<string[]>([]);

  const graph = $derived({ individuals: appState.db.individuals, families: appState.db.families });
  /**
   * Ausgeschlossene Paare kommen seit ADR-v9-174 AUS DEM BESTAND (abgelehnte
   * Identitäts-Hypothesen), nicht mehr aus einem app-privaten Store — deshalb ein
   * `$derived` statt eines nachgeladenen Zustands: legt der Nutzer einen Ausschluss an,
   * verschwindet das Paar im selben Zug, ohne zweite Wahrheit daneben.
   */
  const ignored = $derived(collectIdentityExclusions(graph));

  // Einmaliges Übernahme-Angebot für die frühere Liste. Bewusst KEIN stiller Schreib-
  // vorgang in die geteilte Datei (ADR-024-Familie): der Nutzer entscheidet.
  $effect(() => {
    let cancelled = false;
    loadIgnoredPairs(ignoreStore)
      .then((set) => {
        if (!cancelled) legacyPairs = [...set];
      })
      .catch(() => {
        /* kein Angebot — der Altbestand ist entbehrlich, nicht kritisch */
      });
    return () => {
      cancelled = true;
    };
  });

  /** Legt den Ausschluss als abgelehnte Identitäts-Hypothese an (ADR-v9-174). */
  function recordExclusion(a: string, b: string, labelA: string, labelB: string, reason: string) {
    appState.addHypothesis(
      'person',
      a,
      newHypothesisId(),
      {
        text: `${labelA} (${a}) und ${labelB} (${b}) sind dieselbe Person`,
        status: 'rejected',
        kind: 'identity',
        refs: [b],
        rationale: reason,
      },
      new Date().toISOString().slice(0, 10),
    );
  }

  function startExclusion(row: DedupPairRow) {
    excluding = row;
    exclusionReason = '';
    openPair = null;
  }

  function confirmExclusion() {
    const row = excluding;
    if (!row || exclusionReason.trim() === '') return;
    recordExclusion(row.a, row.b, row.labelA, row.labelB, exclusionReason.trim());
    statusMessage = `Als „kein Duplikat" festgehalten: ${row.labelA} ↔ ${row.labelB}.`;
    excluding = null;
    exclusionReason = '';
  }

  /**
   * Übernimmt die frühere Ignorierliste in den Bestand. Die Begründung ist gekennzeichnet,
   * statt erfunden: die alten Einträge trugen keine, und ein Befund ohne Herkunft wäre
   * schlimmer als einer, der seine Herkunft nennt.
   */
  function adoptLegacy() {
    for (const key of legacyPairs) {
      const [a, b] = key.split('|');
      const pa = appState.db.individuals.get(a);
      const pb = appState.db.individuals.get(b);
      if (!pa || !pb) continue; // Eintrag eines anderen Bestands — genau der alte Defekt.
      recordExclusion(
        a,
        b,
        pa.name || a,
        pb.name || b,
        'Übernommen aus der früheren, gerätelokalen Ignorierliste (dort ohne Begründung erfasst).',
      );
    }
    statusMessage = `${legacyPairs.length} frühere Ausschlüsse übernommen.`;
    legacyPairs = [];
    void ignoreStore.save([]).catch(() => {
      /* Übernahme steht im Bestand; das Angebot kehrt beim nächsten Öffnen zurück. */
    });
  }
  const rows = $derived<DedupPairRow[]>(
    scanned ? buildPersonDedupRows(graph, appState.placeContext, scannedThreshold, query, ignored) : [],
  );
  /** Trefferzahl ohne Suchfilter — sonst sieht der Nutzer beim Tippen eine sinkende Gesamtzahl. */
  const totalRows = $derived<DedupPairRow[]>(
    scanned ? buildPersonDedupRows(graph, appState.placeContext, scannedThreshold, '', ignored) : [],
  );

  /**
   * Wie viele Zeilen aktuell gezeigt werden. Wird bei JEDER Änderung der Grundmenge
   * zurückgesetzt (neuer Scan, neue Suche) — sonst zeigte eine eingegrenzte Suche
   * weiterhin den Stand von vorher, also mehr Zeilen als die Trefferzahl darüber
   * behauptet. Genau die Sorte Zustands-Leck, gegen die `resetKey` bei EventsByType
   * eingeführt wurde (ADR-v9-83).
   */
  let shown = $state(DEFAULT_PAGE_SIZE);
  const paged = $derived(pageSlice(rows, shown));

  function runScan() {
    scannedThreshold = threshold;
    scanned = true;
    statusMessage = '';
    shown = DEFAULT_PAGE_SIZE;
  }

  function onQueryInput() {
    shown = DEFAULT_PAGE_SIZE;
  }

  function loadMore() {
    shown += DEFAULT_PAGE_SIZE;
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

  {#if legacyPairs.length}
    <p class="person-dedup__legacy">
      {legacyPairs.length} frühere „kein Duplikat"-Entscheidungen liegen noch im gerätelokalen
      Speicher. Sie gehören in die Datei, damit sie mitreisen.
      <button type="button" class="person-dedup__legacy-btn" onclick={adoptLegacy}>Übernehmen</button>
    </p>
  {/if}

  {#if excluding}
    <div class="person-dedup__exclude">
      <p class="person-dedup__exclude-head">
        Kein Duplikat: <strong>{excluding.labelA}</strong> ↔ <strong>{excluding.labelB}</strong>
      </p>
      <label class="person-dedup__exclude-label" for="dedup-exclusion-reason">
        Begründung (Pflicht) — warum sind das zwei verschiedene Personen?
      </label>
      <textarea {...PROSE_FIELD}
        id="dedup-exclusion-reason"
        class="person-dedup__exclude-input"
        rows="3"
        bind:value={exclusionReason}
      ></textarea>
      <div class="person-dedup__exclude-actions">
        <button type="button" class="person-dedup__btn" onclick={() => (excluding = null)}>
          Abbrechen
        </button>
        <button
          type="button"
          class="person-dedup__btn person-dedup__btn--primary"
          disabled={exclusionReason.trim() === ''}
          onclick={confirmExclusion}
        >
          Ausschluss festhalten
        </button>
      </div>
    </div>
  {/if}

  {#if !scanned}
    <p class="person-dedup__empty">Noch kein Scan durchgeführt.</p>
  {:else if totalRows.length === 0}
    <p class="person-dedup__empty">Keine verdächtigen Paare ab Score {scannedThreshold}.</p>
  {:else}
    <div class="person-dedup__searchwrap">
      <input
        type="search" {...PLAIN_FIELD}
        class="person-dedup__search"
        placeholder="Ergebnisse durchsuchen"
        aria-label="Ergebnisse durchsuchen"
        bind:value={query}
        oninput={onQueryInput}
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
      {#each paged.visible as row (row.key)}
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
    {#if paged.remaining > 0}
      <button type="button" class="person-dedup__load-more" onclick={loadMore}>
        {Math.min(paged.remaining, DEFAULT_PAGE_SIZE)} weitere laden
      </button>
    {/if}
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
      onIgnore={() => startExclusion(openPair!)}
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

  /* Übernahme-Angebot + Begründungs-Panel (ADR-v9-174). Beide nutzen die vorhandenen
     Flächen-Tokens; kein neuer Dialog-Mechanismus (INV-UI-4). */
  .person-dedup__legacy,
  .person-dedup__exclude {
    margin-top: 0.7rem;
    padding: 0.6rem 0.7rem;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    font-size: 0.85rem;
  }

  .person-dedup__exclude-head {
    margin: 0 0 0.5rem;
  }

  .person-dedup__exclude-label {
    display: block;
    margin-bottom: 0.3rem;
    color: var(--stb-text-dim);
  }

  .person-dedup__exclude-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.4rem 0.5rem;
    background: var(--stb-surface-1);
    color: var(--stb-text);
    border: 1px solid var(--stb-border);
    border-radius: var(--stb-radius-control);
    font: inherit;
    resize: vertical;
  }

  .person-dedup__exclude-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 0.5rem;
  }

  .person-dedup__btn,
  .person-dedup__legacy-btn {
    min-height: 44px;
    padding: 0 0.9rem;
    background: var(--stb-surface-1);
    color: var(--stb-text);
    border: 1px solid var(--stb-border);
    border-radius: var(--stb-radius-control);
    font: inherit;
    cursor: pointer;
  }

  .person-dedup__btn--primary {
    background: var(--stb-gold-dim);
    border-color: var(--stb-gold);
  }

  .person-dedup__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .person-dedup__legacy-btn {
    margin-left: 0.5rem;
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

  .person-dedup__load-more {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.7rem;
    cursor: pointer;
  }

  .person-dedup__meta,
  .person-dedup__reasons {
    font-size: 0.76rem;
    color: var(--stb-text-dim);
  }
</style>
