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
  import type { ViewState } from '../../shell/view-state.svelte';
  import FilterBar from '../../shell/FilterBar.svelte';
  import ValidationPanel from '../validation/ValidationPanel.svelte';
  import GeoFindingsTile from './GeoFindingsTile.svelte';
  import BranchMaturitySection from './BranchMaturitySection.svelte';
  import FocusPersonList from './FocusPersonList.svelte';
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
    type ValidationConfig,
  } from '../../../core/validate/index';
  import { loadValConfig } from '../../../services/validate/index';
  import { createValConfigStore } from '../../../services/app-data';
  import { matchesScope } from '../../../core/research/index';
  import type { ProjectScope } from '../../../core/research/types';
  import type { PersonId } from '../../../core/model/types';

  interface Props {
    appState: AppState;
    /** Für die Ast-Reifegrad-Sektion: `resolveProband(db, viewState)` ist die EINE
     *  Proband-Auflösung (ADR-v9-140) — kein zweiter „kleinste Id"-Rückfall hier. */
    viewState: ViewState;
    onNavigateToPerson?: (id: string) => void;
    onNavigateToFamily?: (id: string) => void;
    onNavigateToPlace?: (id: string) => void;
    onNavigateToHof?: (id: string) => void;
    /** Aktiver Projekt-Scope (BL-58) — null = keine Einschränkung (alle Personen). */
    scope?: ProjectScope | null;
  }
  const {
    appState,
    viewState,
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

  // Die Regel-Konfiguration wohnt im B1-Bündel (app-data.json, BL-180) und reist
  // damit zwischen Geräten; der Vertrag bleibt derselbe (ValConfigStore).
  const valStore = createValConfigStore();

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

  // Ast-Reifegrad (ADR-v9-167): Klick auf einen Ast scoped NUR die Brennpunkte-Liste
  // unten, nicht Score/Ampel/Radar oben (die bleiben die Gesamt-/Projektsicht). Eigener
  // `buildQualityDashboard`-Lauf über die vom Ast bereits mit dem Projekt-Scope
  // UND-verknüpfte Personenmenge (`BranchMaturitySection` liefert sie fertig) —
  // dieselbe Engine, andere Menge, kein zweiter Bewertungsmechanismus.
  let branchSelection = $state<{ label: string; personIds: ReadonlySet<PersonId> } | null>(null);
  const branchFocusDashboard = $derived(
    branchSelection
      ? buildQualityDashboard(appState.db, findings, { scope: branchSelection.personIds })
      : null,
  );

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
  const rows = $derived(filterFocus((branchFocusDashboard ?? dashboard).focus, focusFilter));
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

  function handleSelectBranch(selection: { label: string; personIds: ReadonlySet<PersonId> } | null) {
    branchSelection = selection;
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

    <!-- Ast-Reifegrad (ADR-v9-167, BL-231): zweiter Scope-Erzeuger, kein zweites
         Dashboard — je Ast Score/Ampel aus derselben Engine, Klick scoped die
         Brennpunkte unten. Ebenen-Umschalter sitzt HIER, nicht in der Toolbar. -->
    <BranchMaturitySection
      {appState}
      {viewState}
      {findings}
      projectScope={scopeSet}
      onSelectBranch={handleSelectBranch}
    />

    <FocusPersonList
      {rows}
      {focusFilter}
      {onNavigateToPerson}
      onPromote={promote}
      onPromoteAll={promoteAll}
      {countOf}
    />
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

  /* .quality__empty lebt in design-system.css (INV-UI-4) — FocusPersonList.svelte
     braucht dieselbe Klasse für ihren eigenen Leerzustand. */

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

  /* .quality__dot* / .quality__section* leben in design-system.css (INV-UI-4) —
     FocusPersonList.svelte teilt sich dieselben Klassen für die Brennpunkte-Liste. */

  .quality__counts {
    margin: 0.4rem 0.75rem 0;
    font-size: 0.75rem;
    color: var(--stb-text-dim);
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

  /* Die Brennpunkte-eigenen Klassen (Person-/Befund-/Promote-Zeilen) sind mit der Liste
     nach FocusPersonList.svelte ausgelagert (BL-231, Datei-Teilung großzügig statt
     knapp — kohäsive Rendering-Einheit statt Trimmen). */
</style>
