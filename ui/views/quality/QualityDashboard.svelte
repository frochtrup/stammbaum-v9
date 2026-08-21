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
  //
  // Der Ansichts-Unterzustand (Brennpunkte-Filter, offener Bericht samt Umfang, Ast-
  // Auswahl) liegt NICHT hier, sondern im mitgegebenen `QualityDashboardState` — sonst
  // stirbt er beim Wegnavigieren (BL-319, Spec 21 §5; Begründung in
  // `quality-dashboard-state.svelte.ts`).
  import { untrack } from 'svelte';
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
  import {
    createQualityDashboardState,
    DEFAULT_QUALITY_FOCUS,
    type QualityDashboardState,
  } from './quality-dashboard-state.svelte';
  import { matchesScope, suggestResearchStep } from '../../../core/research/index';
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
    /**
     * Personenmenge der Verwandtschafts-Relevanz (BL-375, Spec 20 §1.11i) — `null` =
     * Stufe „Alle". Die Achse sitzt auf der Umbrella-Ebene und scoped ALLE VIER
     * Segmente; das Dashboard auszunehmen wäre der halbe Zustand aus Spec 21 §5 —
     * eine sichtbar gesetzte Einschränkung, die auf einer der Flächen nichts tut.
     */
    allowed?: ReadonlySet<PersonId> | null;
    /**
     * Ansichts-Unterzustand von AUSSEN (BL-319): Filter, offener Bericht und Ast-Auswahl
     * müssen das Wegnavigieren überleben, diese Fläche wird dabei abgebaut. Optional,
     * damit Komponententests das Dashboard weiterhin ohne Umgebung montieren können —
     * dann mit einer eigenen Instanz, die schlicht so lange lebt wie die Komponente.
     */
    quality?: QualityDashboardState;
  }
  const {
    appState,
    viewState,
    onNavigateToPerson,
    onNavigateToFamily,
    onNavigateToPlace,
    onNavigateToHof,
    scope = null,
    allowed = null,
    quality: qualityProp,
  }: Props = $props();

  // Einmal beim Aufbau festgelegt: die Instanz wird nie ausgetauscht (das `untrack` sagt
  // genau das) — der Zustand DARIN ist reaktiv, die Hülle nicht. Muster wie
  // `MediaGallery.filters` (ADR-v9-192).
  const quality = untrack(() => qualityProp ?? createQualityDashboardState());

  // Personenmenge des aktiven Projekts als Set (Spec 20 §1.11g: „die Personenmenge kommt
  // als Parameter herein"); null = keine Einschränkung. matchesScope ist die Kern-Wahrheit.
  const projektSet = $derived(
    scope
      ? new Set(
          [...appState.db.individuals.values()].filter((p) => matchesScope(p, scope)).map((p) => p.id),
        )
      : null,
  );

  // Beide Achsen schneiden sich per UND (Spec 20 §1.11i). Genau EINE Menge geht danach in
  // die Engine — der Ast-Reifegrad und die Brennpunkte unten lesen dieselbe, es gibt also
  // keinen Pfad, auf dem nur eine der beiden Einschränkungen wirkt.
  const scopeSet = $derived(
    projektSet && allowed
      ? new Set([...projektSet].filter((id) => allowed.has(id)))
      : (projektSet ?? allowed),
  );

  const FOCUS_FILTERS: { key: FocusFilter; label: string }[] = [
    { key: 'attention', label: 'Handlungsbedarf (Fehler + Warnungen)' },
    { key: 'red', label: 'Nur Fehler' },
    { key: 'all', label: 'Alle (inkl. Hinweise)' },
  ];

  let valConfig = $state<ValidationConfig>(defaultConfig());
  // Der ⚙-Sheet bleibt bewusst komponenten-lokal: eine begonnene Interaktion, kein
  // Ansichtszustand (s. `quality-dashboard-state.svelte.ts`).
  let showValConfig = $state(false);
  /**
   * Umfang des offenen Berichts (§1.11h): `all` = alle Befunde (Knopf „✓ Bericht"),
   * `geo` = nur Orts-/Hof-Befunde (Öffner ist die „Orte & Höfe"-Kachel), `none` =
   * ausgeblendet. Dieselbe `ValidationPanel`, nur die übergebene Befundmenge
   * unterscheidet sich (INV-UI-4).
   */
  const reportOpen = $derived(quality.report !== 'none');

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
  //
  // Die AUSWAHL selbst liegt als Ebene+Index im `QualityDashboardState` (BL-319, damit
  // sie das Wegnavigieren überlebt); diese Variable ist nur der daraus berechnete, von
  // der Sektion gemeldete Personen-Ausschnitt — kein zweiter Auswahl-Zustand.
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
  const reportFindings = $derived(quality.report === 'geo' ? geoFindings : findings);
  const rows = $derived(filterFocus((branchFocusDashboard ?? dashboard).focus, quality.focus));
  const activeFilterCount = $derived(quality.focus === DEFAULT_QUALITY_FOCUS ? 0 : 1);

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

  // Der vorhandene Knopf wird schlauer, statt einen zweiten zu bekommen (ADR-v9-165,
  // INV-UI-11): `suggestResearchStep` belegt Gattung und — wo eindeutig — Quellenbezug
  // vor. Angelegt wird weiter erst auf Klick, jedes Feld bleibt danach editierbar (LP-6).
  function promote(personId: string, f: Finding) {
    const today = new Date().toISOString().slice(0, 10);
    const vorschlag = suggestResearchStep(f, {
      db: appState.db,
      staStAera: valConfig.thresholds.staStAera,
    });
    appState.addTask(
      'person',
      personId,
      newTaskId(),
      f.text,
      vorschlag.category,
      today,
      vorschlag.sourceRef,
    );
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
          <!-- `checked` + `onchange` statt `bind:group`: der Wert lebt außerhalb der
               Komponente (BL-319) und ist über den Getter nicht bindbar. -->
          <label class="stb-filter-opt">
            <input
              type="radio"
              name="quality-focus"
              value={f.key}
              checked={quality.focus === f.key}
              onchange={() => quality.setFocus(f.key)}
            />
            {f.label}
          </label>
        {/each}
      </fieldset>
    </FilterBar>
    <button
      type="button"
      class="quality__report-btn"
      aria-pressed={quality.report === 'all'}
      onclick={() => quality.toggleReport('all')}
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
    {#if reportOpen}
      <!-- Prüfbericht — Umfang je nach Öffner: „✓ Bericht" zeigt alles, die „Orte &
           Höfe"-Kachel nur die Geo-Befunde. Dieselbe Komponente, gefilterte Befundmenge. -->
      <ValidationPanel
        staStAera={valConfig.thresholds.staStAera}
        {appState}
        findings={reportFindings}
        scopeLabel={quality.report === 'geo' ? 'Orte & Höfe' : null}
        onClose={() => quality.closeReport()}
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
      expanded={quality.report === 'geo'}
      onOpen={() => quality.toggleReport('geo')}
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
      {quality}
      projectScope={scopeSet}
      onSelectBranch={handleSelectBranch}
    />

    <FocusPersonList
      {rows}
      focusFilter={quality.focus}
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
