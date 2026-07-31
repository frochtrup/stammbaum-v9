<script lang="ts">
  // ui/views/quality/QualityDashboard.svelte — Qualitäts-Dashboard, viertes Segment der
  // Forschungs-Arbeitsfläche (Spec 20 §1.11g, BL-05). Verhaltens-Orakel:
  // legacy-v8/ui-views-dashboard.js (Score-Kachel, Ampel-Chips, Lückenradar,
  // Brennpunkte mit "+ alle").
  //
  // Die Rechnung liegt vollständig im Kern (`core/validate/dashboard.ts`) — diese Datei
  // rendert nur. Beide Validierungs-Flächen leben hier beieinander (ADR-v9-98): das
  // personbezogene Dashboard UND der vollständige Prüfbericht hinter "✓ Bericht", der
  // als einziger auch die Orts-/Hof-Befunde zeigt (das Dashboard verwirft Befunde ohne
  // Trägerperson, v8-Parität).
  //
  // Befehlsflächen-Budget (INV-UI-11, Spec 21 §6h): [Filter · N] [✓ Bericht] [⚙] — drei
  // Elemente in EINER Zeile.
  import type { AppState } from '../../shell/app-state.svelte';
  import FilterBar from '../../shell/FilterBar.svelte';
  import ValidationPanel from '../validation/ValidationPanel.svelte';
  import GeoFindingsTile from './GeoFindingsTile.svelte';
  import ValConfigSheet from '../validation/ValConfigSheet.svelte';
  import { newTaskId } from '../tasks/tasks-commands';
  import {
    buildQualityDashboard,
    configFromStored,
    configToStored,
    defaultConfig,
    filterFocus,
    runValidation,
    countBySeverity,
    withoutAlreadyTasked,
    type Finding,
    type FocusFilter,
    type Severity,
    type ValidationConfig,
  } from '../../../core/validate/index';
  import { IdbValConfigStore, loadValConfig } from '../../../services/validate/index';
  import { matchesScope } from '../../../core/research/index';
  import type { ProjectScope } from '../../../core/research/types';
  import { SEVERITY_ICON } from '../validation/validation-model';

  interface Props {
    appState: AppState;
    onNavigateToPerson?: (id: string) => void;
    onNavigateToFamily?: (id: string) => void;
    onNavigateToPlace?: (id: string) => void;
    onNavigateToHof?: (id: string) => void;
    /** Aktiver Projekt-Scope (BL-58) — null = keine Einschränkung (alle Personen). */
    scope?: ProjectScope | null;
  }
  const {
    appState,
    onNavigateToPerson,
    onNavigateToFamily,
    onNavigateToPlace,
    onNavigateToHof,
    scope = null,
  }: Props = $props();

  // Personenmenge des aktiven Projekts als Set (Spec 20 §1.11g: „die Personenmenge kommt
  // als Parameter herein"); null = keine Einschränkung. matchesScope ist die Kern-Wahrheit.
  const scopeSet = $derived(
    scope
      ? new Set(
          [...appState.db.individuals.values()].filter((p) => matchesScope(p, scope)).map((p) => p.id),
        )
      : null,
  );

  const FOCUS_FILTERS: { key: FocusFilter; label: string }[] = [
    { key: 'attention', label: 'Handlungsbedarf (Fehler + Warnungen)' },
    { key: 'red', label: 'Nur Fehler' },
    { key: 'all', label: 'Alle (inkl. Hinweise)' },
  ];
  const DEFAULT_FOCUS: FocusFilter = 'attention';

  /** Höchstzahl gerenderter Brennpunkt-Personen (v8-Parität) — der Rest wird gezählt. */
  const FOCUS_CAP = 40;

  const SEVERITY_CLASS: Record<Severity, string> = {
    error: 'error',
    warn: 'warn',
    info: 'info',
  };

  let focusFilter = $state<FocusFilter>(DEFAULT_FOCUS);
  let valConfig = $state<ValidationConfig>(defaultConfig());
  let showValConfig = $state(false);
  /** Der Prüfbericht (§1.11h): `false` = ausgeblendet. */
  let showReport = $state(false);
  /**
   * Umfang des offenen Berichts: `all` = alle Befunde (Knopf „✓ Bericht"), `geo` = nur
   * Orts-/Hof-Befunde (Öffner ist die „Orte & Höfe"-Kachel). Dieselbe `ValidationPanel`,
   * nur die übergebene Befundmenge unterscheidet sich (INV-UI-4).
   */
  let reportScope = $state<'all' | 'geo'>('all');

  /** Öffnet/schließt den Bericht im gewählten Umfang; erneuter Klick auf denselben Umfang schließt. */
  function toggleReport(scope: 'all' | 'geo') {
    if (showReport && reportScope === scope) {
      showReport = false;
    } else {
      showReport = true;
      reportScope = scope;
    }
  }

  const valStore = new IdbValConfigStore();

  /**
   * Befunde der aktuellen Konfiguration. `$derived` statt eines Knopfdrucks: das
   * Dashboard IST die Antwort auf "wie steht es um die Daten" — es leer zu zeigen, bis
   * jemand "prüfen" drückt, wäre ein Rückschritt gegenüber v8 (dort rechnete das
   * Dashboard beim Öffnen). Der teure Teil ist gedeckelt, weil das Segment nur auf
   * Anforderung gemountet wird.
   */
  const findings = $derived(
    withoutAlreadyTasked(runValidation(appState.db, valConfig), appState.db),
  );

  const dashboard = $derived(buildQualityDashboard(appState.db, findings, { scope: scopeSet }));

  // Orts-/Hof-Befunde tragen keine Person und bleiben deshalb aus der personbezogenen
  // Dashboard-Auswertung heraus (dashboard.ts) — die einzige Fläche, die sie zeigt, ist
  // der „✓ Bericht". Damit das Dashboard nicht komplett dazu schweigt (Nutzer-Fund
  // 2026-07-28: „Prüfung wirkt personorientiert, Orts-/Hof-Probleme werden nicht
  // angezeigt"), zählt diese Kachel sie separat und öffnet den Bericht. Keine zweite
  // Engine, kein zweites Badge (§3): nur ein Wegweiser auf dieselbe Fläche.
  const geoFindings = $derived(findings.filter((f) => f.placeId || f.hofId));
  const geoCounts = $derived(countBySeverity(geoFindings));
  /** Was der offene Bericht zeigt — je nach Umfang alle oder nur die Geo-Befunde. */
  const reportFindings = $derived(reportScope === 'geo' ? geoFindings : findings);
  const rows = $derived(filterFocus(dashboard.focus, focusFilter));
  const activeFilterCount = $derived(focusFilter === DEFAULT_FOCUS ? 0 : 1);

  const scoreClass = $derived(
    dashboard.cleanPct >= 80 ? 'good' : dashboard.cleanPct >= 50 ? 'mid' : 'low',
  );

  /**
   * Gespeicherte Regel-Konfiguration einmal je Mount nachladen. Schlägt der app-lokale
   * Speicher fehl, bleibt es bei den Defaults — das Dashboard rechnet trotzdem.
   */
  $effect(() => {
    let cancelled = false;
    loadValConfig(valStore)
      .then((stored) => {
        if (!cancelled) valConfig = configFromStored(stored);
      })
      .catch(() => {
        /* Defaults behalten. */
      });
    return () => {
      cancelled = true;
    };
  });

  async function saveValConfig(cfg: ValidationConfig) {
    valConfig = cfg;
    showValConfig = false;
    try {
      await valStore.save(configToStored(cfg));
    } catch {
      /* app-lokaler Speicher nicht verfügbar — Konfiguration bleibt sitzungslokal. */
    }
  }

  function barClass(pct: number): string {
    return pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'low';
  }

  function promote(personId: string, f: Finding) {
    const today = new Date().toISOString().slice(0, 10);
    appState.addTask('person', personId, newTaskId(), f.text, f.category, today, '');
  }

  /**
   * Alle Befunde EINER Person als Aufgaben übernehmen — über ALLE Schweregrade, nicht
   * nur die gerade sichtbaren (v8-Parität `_handleDashPromoteAll`): wer "alles zu dieser
   * Person" sagt, meint nicht "alles, was der aktuelle Filter zeigt".
   */
  function promoteAll(personId: string) {
    const p = dashboard.focus.find((x) => x.personId === personId);
    if (!p) return;
    for (const f of [...p.error, ...p.warn, ...p.info]) promote(personId, f);
  }

  function countOf(personId: string): number {
    const p = dashboard.focus.find((x) => x.personId === personId);
    return p ? p.error.length + p.warn.length + p.info.length : 0;
  }
</script>

<div class="quality">
  <div class="quality__toolbar">
    <FilterBar activeCount={activeFilterCount}>
      <fieldset class="stb-filter-set">
        <legend>Brennpunkte zeigen</legend>
        {#each FOCUS_FILTERS as f (f.key)}
          <label class="stb-filter-opt">
            <input type="radio" bind:group={focusFilter} value={f.key} />
            {f.label}
          </label>
        {/each}
      </fieldset>
    </FilterBar>
    <button
      type="button"
      class="quality__report-btn"
      aria-pressed={showReport && reportScope === 'all'}
      onclick={() => toggleReport('all')}
    >
      ✓ Bericht
    </button>
    <button
      type="button"
      class="quality__cfg-btn"
      onclick={() => (showValConfig = true)}
      aria-label="Prüfregeln konfigurieren"
      title="Prüfregeln konfigurieren"
    >
      ⚙
    </button>
  </div>

  {#if showValConfig}
    <ValConfigSheet
      config={valConfig}
      onSave={saveValConfig}
      onClose={() => (showValConfig = false)}
    />
  {/if}

  {#if dashboard.total === 0}
    <p class="quality__empty">Keine Personen geladen.</p>
  {:else}
    {#if showReport}
      <!-- Prüfbericht — Umfang je nach Öffner: „✓ Bericht" zeigt alles, die „Orte &
           Höfe"-Kachel nur die Geo-Befunde. Dieselbe Komponente, gefilterte Befundmenge. -->
      <ValidationPanel
        {appState}
        findings={reportFindings}
        scopeLabel={reportScope === 'geo' ? 'Orte & Höfe' : null}
        onClose={() => (showReport = false)}
        onOpenConfig={() => (showValConfig = true)}
        {onNavigateToPerson}
        {onNavigateToFamily}
        {onNavigateToPlace}
        {onNavigateToHof}
      />
    {/if}

    <div class="quality__score quality__score--{scoreClass}">
      <div class="quality__score-num">{dashboard.cleanPct} %</div>
      <div class="quality__score-lbl">befundfrei · {dashboard.total} Personen</div>
    </div>

    <div class="quality__ampel">
      <div class="quality__chip quality__chip--error">
        <span class="quality__dot quality__dot--error"></span>
        <span class="quality__chip-num">{dashboard.ampel.error}</span>
        <span class="quality__chip-lbl">Fehler</span>
      </div>
      <div class="quality__chip quality__chip--warn">
        <span class="quality__dot quality__dot--warn"></span>
        <span class="quality__chip-num">{dashboard.ampel.warn}</span>
        <span class="quality__chip-lbl">Warnungen</span>
      </div>
      <div class="quality__chip quality__chip--info">
        <span class="quality__dot quality__dot--info"></span>
        <span class="quality__chip-num">{dashboard.ampel.infoOnly}</span>
        <span class="quality__chip-lbl">nur Hinweise</span>
      </div>
      <div class="quality__chip quality__chip--clean">
        <span class="quality__dot quality__dot--clean"></span>
        <span class="quality__chip-num">{dashboard.ampel.clean}</span>
        <span class="quality__chip-lbl">sauber</span>
      </div>
    </div>
    <p class="quality__counts">
      {dashboard.counts.error} Fehler · {dashboard.counts.warn} Warnungen ·
      {dashboard.counts.info} Hinweise
    </p>

    <!-- Orts-/Hof-Wegweiser: das Dashboard oben ist personbezogen; diese Kachel ist das
         einzige Dauersignal für Geo-Befunde und öffnet den vollständigen Bericht. -->
    <GeoFindingsTile
      error={geoCounts.error}
      warn={geoCounts.warn}
      info={geoCounts.info}
      expanded={showReport && reportScope === 'geo'}
      onOpen={() => toggleReport('geo')}
    />

    <h3 class="quality__section">Lückenradar</h3>
    <div class="quality__radar">
      {#each dashboard.radar as b (b.label)}
        <div class="quality__bar-row">
          <div class="quality__bar-label">
            {b.label}
            {#if b.base !== dashboard.total}
              <span class="quality__bar-base">(von {b.base})</span>
            {/if}
          </div>
          <div class="quality__bar" role="img" aria-label="{b.label}: {b.pct} Prozent">
            <div
              class="quality__bar-fill quality__bar-fill--{barClass(b.pct)}"
              style:width="{b.pct}%"
            ></div>
          </div>
          <div class="quality__bar-pct">{b.pct} %</div>
        </div>
      {/each}
    </div>

    <h3 class="quality__section">
      Brennpunkte
      {#if rows.length}<span class="quality__section-count">({rows.length})</span>{/if}
    </h3>

    {#if rows.length === 0}
      <p class="quality__empty">
        Keine Personen mit {focusFilter === 'red' ? 'Fehlern' : 'Befunden'} in dieser Auswahl 🎉
      </p>
    {:else}
      {#each rows.slice(0, FOCUS_CAP) as row (row.personId)}
        <div class="quality__person">
          <span class="quality__dot quality__dot--{SEVERITY_CLASS[row.dot]}"></span>
          <button
            type="button"
            class="quality__person-name"
            onclick={() => onNavigateToPerson?.(row.personId)}
          >
            {row.label}
          </button>
          {#if row.life}<span class="quality__person-life">{row.life}</span>{/if}
          <button
            type="button"
            class="quality__promote-all"
            onclick={() => promoteAll(row.personId)}
            title="Alle {countOf(row.personId)} Befunde als Aufgaben anlegen"
          >
            + alle
          </button>
        </div>
        {#each row.findings as f (f.rule + f.text)}
          <div class="quality__finding quality__finding--{SEVERITY_CLASS[f.severity]}">
            <span class="quality__finding-icon" aria-hidden="true">{SEVERITY_ICON[f.severity]}</span>
            <span class="quality__finding-text">{f.text}</span>
            <button
              type="button"
              class="quality__promote"
              onclick={() => promote(row.personId, f)}
              aria-label="Als Aufgabe anlegen"
              title="Als Aufgabe anlegen"
            >
              +
            </button>
          </div>
        {/each}
      {/each}
      {#if rows.length > FOCUS_CAP}
        <p class="quality__more">… und {rows.length - FOCUS_CAP} weitere Personen</p>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .quality {
    overflow-y: auto;
    height: 100%;
    padding-bottom: 1rem;
  }

  .quality__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--stb-surface-2);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .quality__cfg-btn {
    margin-left: auto;
  }

  .quality__report-btn,
  .quality__cfg-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
    white-space: nowrap;
  }

  .quality__report-btn[aria-pressed='true'] {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border-color: var(--stb-gold);
    font-weight: 700;
  }

  .quality__empty {
    padding: 1.5rem;
    color: var(--stb-text-dim);
  }

  /* Score-Kachel — die eine Zahl, die den Zustand zusammenfasst. */
  .quality__score {
    margin: 0.75rem;
    padding: 0.9rem;
    border-radius: var(--stb-radius-card);
    background: var(--stb-surface-1);
    border-left: 4px solid var(--stb-text-dim);
    text-align: center;
  }
  .quality__score--good { border-left-color: var(--stb-ok); }
  .quality__score--mid { border-left-color: var(--stb-warn, #d9a441); }
  .quality__score--low { border-left-color: var(--stb-danger, #e06c6c); }

  .quality__score-num {
    font-family: var(--stb-font-title);
    font-size: 2rem;
    font-weight: 700;
    color: var(--stb-gold-light);
  }

  .quality__score-lbl {
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .quality__ampel {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0 0.75rem;
  }

  .quality__chip {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex: 1 1 auto;
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.5rem;
    font-size: 0.78rem;
  }

  .quality__chip-num {
    font-weight: 700;
    color: var(--stb-text);
  }

  .quality__chip-lbl { color: var(--stb-text-dim); }

  .quality__dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    display: inline-block;
    flex: none;
  }
  .quality__dot--error { background: var(--stb-danger, #e06c6c); }
  .quality__dot--warn { background: var(--stb-warn, #d9a441); }
  .quality__dot--info { background: var(--stb-text-dim); }
  .quality__dot--clean { background: var(--stb-ok); }

  .quality__counts {
    margin: 0.4rem 0.75rem 0;
    font-size: 0.75rem;
    color: var(--stb-text-dim);
  }


  .quality__section {
    margin: 1rem 0.75rem 0.4rem;
    font-family: var(--stb-font-title);
    font-size: 0.9rem;
    color: var(--stb-gold-light);
  }

  .quality__section-count {
    color: var(--stb-text-dim);
    font-weight: 400;
  }

  .quality__radar {
    padding: 0 0.75rem;
  }

  .quality__bar-row {
    display: grid;
    grid-template-columns: minmax(7rem, 12rem) 1fr 2.6rem;
    align-items: center;
    gap: 0.5rem;
    padding: 0.2rem 0;
    font-size: 0.78rem;
  }

  .quality__bar-label { color: var(--stb-text); }
  .quality__bar-base { color: var(--stb-text-muted, var(--stb-text-dim)); }

  .quality__bar {
    background: var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    height: 0.5rem;
    overflow: hidden;
  }

  .quality__bar-fill {
    height: 100%;
    border-radius: inherit;
  }
  .quality__bar-fill--good { background: var(--stb-ok); }
  .quality__bar-fill--mid { background: var(--stb-warn, #d9a441); }
  .quality__bar-fill--low { background: var(--stb-danger, #e06c6c); }

  .quality__bar-pct {
    text-align: right;
    color: var(--stb-text-dim);
  }

  .quality__person {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.75rem 0.2rem;
    border-top: 1px solid var(--stb-surface-2);
  }

  .quality__person-name {
    background: transparent;
    border: none;
    padding: 0;
    color: var(--stb-gold-light);
    cursor: pointer;
    font-size: 0.88rem;
    text-align: left;
  }

  .quality__person-life {
    color: var(--stb-text-dim);
    font-size: 0.72rem;
  }

  .quality__promote-all {
    margin-left: auto;
    background: transparent;
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    color: var(--stb-gold-light);
    cursor: pointer;
    font-size: 0.72rem;
    padding: 0.1rem 0.4rem;
  }

  .quality__finding {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.15rem 0.75rem 0.15rem 1.5rem;
    font-size: 0.78rem;
  }

  .quality__finding-icon { color: var(--stb-text-dim); }
  .quality__finding--error .quality__finding-icon { color: var(--stb-danger, #e06c6c); }
  .quality__finding--warn .quality__finding-icon { color: var(--stb-warn, #d9a441); }

  .quality__finding-text { color: var(--stb-text); }

  .quality__promote {
    background: transparent;
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
    color: var(--stb-gold-light);
    cursor: pointer;
    line-height: 1;
    padding: 0.1rem 0.4rem;
  }

  .quality__more {
    margin: 0.5rem 0.75rem;
    color: var(--stb-text-dim);
    font-size: 0.78rem;
  }
</style>
