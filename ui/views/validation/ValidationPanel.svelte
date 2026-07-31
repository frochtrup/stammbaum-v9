<script lang="ts">
  // ui/views/validation/ValidationPanel.svelte — der RAM-Bericht hinter „✓ Daten prüfen"
  // (Spec 20 §1.11h). Zeigt Befunde nach Schwere gruppiert; jede Zeile trägt den
  // „→ Als Aufgabe übernehmen"-Knopf (Spec 20 §3 Konfiguration).
  //
  // Der Bericht ist FLÜCHTIG: er lebt nur im Zustand dieser Komponente, nichts davon
  // wird gespeichert (Spec 20 §3 „RAM-Bericht, keine automatischen Datenänderungen").
  // Erst „→ Als Aufgabe übernehmen" schreibt — und zwar eine gewöhnliche ResearchTask
  // über den vorhandenen appState.addTask-Chokepoint, kein eigener Schreibpfad.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { Finding } from '../../../core/validate/index';
  import { newTaskId } from '../tasks/tasks-commands';
  import { suggestResearchStep } from '../../../core/research/index';
  import { defaultThresholds } from '../../../core/validate/index';
  import { groupBySeverity, summaryText, SEVERITY_ICON, SEVERITY_LABEL } from './validation-model';

  interface Props {
    appState: AppState;
    findings: Finding[];
    onClose: () => void;
    /** Öffnet die Regel-Konfiguration. Der Einstieg lebt HIER, nicht als Dauer-Icon in
     *  der Tab-Toolbar: Spec 20 §1.11h verlangt für die Konfiguration „EINEN
     *  Bottom-Sheet-Einstiegspunkt, nicht als Dauer-Toolbar-Icon" (INV-UI-11
     *  Befehlsflächen-Budget). Im Bericht ist er zugleich dort, wo er gebraucht wird —
     *  man will Regeln ändern, wenn man ihre Befunde vor sich sieht. */
    onOpenConfig: () => void;
    onNavigateToPerson?: (id: string) => void;
    onNavigateToFamily?: (id: string) => void;
    onNavigateToPlace?: (id: string) => void;
    onNavigateToHof?: (id: string) => void;
    /** Optionaler Umfangs-Hinweis in der Kopfzeile (z. B. „Orte & Höfe", wenn der Bericht
     *  auf eine Teilmenge gefiltert geöffnet wurde). `null` = voller Bericht, kein Label. */
    scopeLabel?: string | null;
    /**
     * Grenzjahr der Standesamts-Ära für den Forschungsschritt-Vorschlag (ADR-v9-165) —
     * kommt aus der Regel-Konfiguration des Aufrufers, damit Regel (`BIRTH_AFTER_STAERA`)
     * und Vorschlag dieselbe Schwelle benutzen. Ohne Angabe gilt die Vorgabe.
     */
    staStAera?: number;
  }
  const {
    appState,
    findings,
    onClose,
    onOpenConfig,
    onNavigateToPerson,
    onNavigateToFamily,
    onNavigateToPlace,
    onNavigateToHof,
    scopeLabel = null,
    staStAera = defaultThresholds().staStAera,
  }: Props = $props();

  /**
   * Lokal übernommene Befunde. Sie verschwinden sofort aus der Liste, statt bis zur
   * nächsten Prüfung stehen zu bleiben — sonst böte der Bericht denselben Befund
   * mehrfach zur Übernahme an (v8-Parität `_handlePromoteToTask`).
   */
  let promoted = $state(new Set<string>());

  const key = (f: Finding): string =>
    `${f.rule}|${f.personId ?? ''}|${f.familyId ?? ''}|${f.placeId ?? ''}|${f.hofId ?? ''}|${f.text}`;

  const visible = $derived(findings.filter((f) => !promoted.has(key(f))));
  const groups = $derived(groupBySeverity(visible, appState.db));

  function promote(f: Finding) {
    // Geo-Befunde haben keine Trägerperson — eine Aufgabe braucht Person oder Familie
    // (Spec 12 §1), deshalb ist der Knopf dort gar nicht erst sichtbar.
    if (!f.personId) return;
    const today = new Date().toISOString().slice(0, 10);
    // Derselbe Knopf, nur besser vorbelegt (ADR-v9-165): Gattung aus dem Vokabular der
    // Quellen-Vorlagen, Quellenbezug nur bei Eindeutigkeit. Kein zweites Bedienelement
    // (INV-UI-11), kein neues Modellfeld — `category`/`sourceRef` gibt es längst.
    const vorschlag = suggestResearchStep(f, { db: appState.db, staStAera });
    appState.addTask(
      'person',
      f.personId,
      newTaskId(),
      f.text,
      vorschlag.category,
      today,
      vorschlag.sourceRef,
    );
    promoted = new Set([...promoted, key(f)]);
  }

  function navigate(f: Finding) {
    if (f.personId) onNavigateToPerson?.(f.personId);
    else if (f.familyId) onNavigateToFamily?.(f.familyId);
    else if (f.placeId) onNavigateToPlace?.(f.placeId);
    else if (f.hofId) onNavigateToHof?.(f.hofId);
  }
</script>

<section class="val-panel" aria-label="Prüfbericht">
  <div class="val-panel__head">
    <span class="val-panel__summary">
      {#if scopeLabel}<span class="val-panel__scope">{scopeLabel}:&nbsp;</span>{/if}{summaryText(visible)}
    </span>
    <span class="val-panel__head-actions">
      <button
        type="button"
        class="val-panel__cfg"
        onclick={onOpenConfig}
        aria-label="Prüfregeln konfigurieren"
        title="Prüfregeln konfigurieren"
      >
        ⚙
      </button>
      <button type="button" class="val-panel__close" onclick={onClose} aria-label="Bericht ausblenden">
        ✕
      </button>
    </span>
  </div>

  {#each groups as group (group.severity)}
    <h3 class="val-panel__group val-panel__group--{group.severity}">
      {SEVERITY_ICON[group.severity]}
      {SEVERITY_LABEL[group.severity]} ({group.rows.length})
    </h3>
    <ul class="val-panel__list">
      {#each group.rows as row (key(row.finding))}
        <li class="val-panel__row val-panel__row--{group.severity}">
          <span class="val-panel__icon" aria-hidden="true">{SEVERITY_ICON[group.severity]}</span>
          <button
            type="button"
            class="val-panel__subject"
            onclick={() => navigate(row.finding)}
            disabled={!row.finding.personId && !row.finding.familyId && !row.finding.placeId && !row.finding.hofId}
          >
            {row.subject}
          </button>
          <span class="val-panel__text">{row.finding.text}</span>
          {#if row.finding.personId}
            <button
              type="button"
              class="val-panel__promote"
              onclick={() => promote(row.finding)}
              aria-label="Als Aufgabe übernehmen"
              title="Als Aufgabe übernehmen"
            >
              +
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/each}
</section>

<style>
  .val-panel {
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
    background: var(--stb-surface-1);
    padding: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .val-panel__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .val-panel__summary {
    font-size: 0.85rem;
    color: var(--stb-gold-light);
  }

  .val-panel__scope {
    font-weight: 600;
  }

  .val-panel__head-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .val-panel__cfg,
  .val-panel__close {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    padding: 0;
  }

  .val-panel__group {
    margin: 0.75rem 0 0.25rem;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .val-panel__group--error { color: var(--stb-danger, #e06c6c); }
  .val-panel__group--warn { color: var(--stb-warn, #d9a441); }
  .val-panel__group--info { color: var(--stb-text-dim); }

  .val-panel__list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .val-panel__row {
    display: grid;
    grid-template-columns: auto minmax(6rem, 10rem) 1fr auto;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.3rem 0;
    border-top: 1px solid var(--stb-surface-3);
    font-size: 0.8rem;
  }

  .val-panel__icon { color: var(--stb-text-dim); }

  .val-panel__subject {
    background: transparent;
    border: none;
    padding: 0;
    text-align: left;
    color: var(--stb-gold-light);
    cursor: pointer;
    font-size: inherit;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .val-panel__subject:disabled { color: var(--stb-text-dim); cursor: default; }

  .val-panel__text { color: var(--stb-text); }

  .val-panel__promote {
    background: transparent;
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
    color: var(--stb-gold-light);
    cursor: pointer;
    line-height: 1;
    padding: 0.1rem 0.4rem;
  }

  /* Auf schmalen Geräten bricht die Vier-Spalten-Zeile auf zwei Zeilen um — sonst
     schrumpft der Befundtext auf wenige Zeichen (Spec 21 §1 Mobile-first). */
  @media (max-width: 30rem) {
    .val-panel__row {
      grid-template-columns: auto 1fr auto;
    }
    .val-panel__text {
      grid-column: 2 / -1;
    }
  }
</style>
