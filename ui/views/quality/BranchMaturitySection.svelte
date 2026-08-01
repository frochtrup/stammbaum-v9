<script lang="ts">
  // ui/views/quality/BranchMaturitySection.svelte — Ast-Reifegrad, eine Sektion des
  // Qualitäts-Dashboards (Spec 20 §1.11g „Ast-Reifegrad", ADR-v9-167, BL-231).
  //
  // KEIN zweites Dashboard, KEIN zweiter Bewertungsmechanismus: je Ast wird dieselbe
  // `buildQualityDashboard`-Engine wie oben im Dashboard aufgerufen, nur mit einer
  // anderen Personenmenge (`ancestorBranches`, Kern, framework-frei). Die Ebene wird HIER
  // gewählt, nicht in der Dashboard-Toolbar (die bleibt exakt
  // `[Filter · N] [✓ Bericht] [⚙]`, ADR-v9-98/INV-UI-11).
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { resolveProband } from '../../shell/proband';
  import {
    ancestorBranches,
    DEFAULT_BRANCH_LEVEL,
    MIN_BRANCH_LEVEL,
    MAX_BRANCH_LEVEL,
    type AncestorBranch,
  } from '../../../core/research/index';
  import { buildQualityDashboard, type Finding } from '../../../core/validate/index';
  import type { PersonId } from '../../../core/model/types';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Dieselben Befunde, die auch das Dashboard oben speist — keine zweite Berechnung. */
    findings: readonly Finding[];
    /** Aktiver Projekt-Scope (§1.11f) als fertige Menge — null = keine Einschränkung. */
    projectScope: ReadonlySet<PersonId> | null;
    /**
     * Meldet Auswahl/Abwahl eines Asts nach oben — die aufrufende `QualityDashboard`
     * scoped damit ihre bestehende Brennpunkte-Liste (ADR-v9-167 „Klick auf einen Ast
     * scoped die darunterliegenden Brennpunkte"). `null` = Auswahl aufgehoben.
     */
    onSelectBranch: (selection: { label: string; personIds: ReadonlySet<PersonId> } | null) => void;
  }
  const { appState, viewState, findings, projectScope, onSelectBranch }: Props = $props();

  const LEVELS: { value: number; label: string }[] = [
    { value: MIN_BRANCH_LEVEL, label: 'Ebene 2 — Eltern (2 Äste)' },
    { value: 3, label: 'Ebene 3 — Großeltern (4 Äste)' },
    { value: 4, label: 'Ebene 4 — Urgroßeltern (8 Äste)' },
    { value: MAX_BRANCH_LEVEL, label: 'Ebene 5 — Ururgroßeltern (16 Äste)' },
  ];

  let level = $state(DEFAULT_BRANCH_LEVEL);
  let selectedIndex = $state<number | null>(null);

  const probandId = $derived(resolveProband(appState.db, viewState));
  const data = $derived(probandId ? ancestorBranches(appState.db, probandId, level) : null);
  const hasAnyRoot = $derived(!!data && data.branches.some((b) => b.rootId !== null));

  /** Schnittmenge zweier Personenmengen; `null` (keine Einschränkung) verhält sich neutral. */
  function intersect(
    a: ReadonlySet<PersonId> | null,
    b: ReadonlySet<PersonId>,
  ): ReadonlySet<PersonId> {
    if (!a) return b;
    // Rein lokale Rückgabe-Menge einer reinen Funktion, keine Komponenten-Reaktivität nötig.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const out = new Set<PersonId>();
    for (const id of b) if (a.has(id)) out.add(id);
    return out;
  }

  interface BranchRow {
    /** `null` bei der Restzeile — sie ist kein Ast, wird aber gleich behandelt. */
    branch: AncestorBranch | null;
    label: string;
    index: number;
    scope: ReadonlySet<PersonId>;
    total: number;
    /** `null` = „—": der (durch Projekt-Schnitt oder unbekannte Wurzel) leere Ast. */
    cleanPct: number | null;
  }

  /** Beschriftung der Restzeile — kein Ast-Name, deshalb bewusst anders formuliert. */
  const REST_LABEL = 'Übrige (außerhalb aller Äste)';

  // Je Ast EIN zusätzlicher `buildQualityDashboard`-Lauf über die (mit einem aktiven
  // Projekt UND-verknüpfte, ADR-v9-167 Pkt 5) Astmenge — bis zu MAX_BRANCH_LEVEL-1
  // Bits = 16 Läufe bei Ebene 5. Gemessen an Realdaten (s. Commit-Bericht); das bestehende
  // Perf-Gate (`npm run test:perf`) deckt Regressionen ab.
  function buildRow(branch: AncestorBranch | null, label: string, index: number, menge: ReadonlySet<PersonId>): BranchRow {
    const scope = intersect(projectScope, menge);
    if (scope.size === 0) {
      return { branch, label, index, scope, total: 0, cleanPct: null };
    }
    const d = buildQualityDashboard(appState.db, findings, { scope });
    return { branch, label, index, scope, total: d.total, cleanPct: d.cleanPct };
  }

  // Äste + EINE Restzeile (ADR-v9-167 Pkt 4): Nachkommen, Seitenlinien und Unverbundene
  // liegen in keinem Ast. Ohne diese Zeile summierten sich die Balken stillschweigend auf
  // weniger als den Bestand, und die Ansicht behauptete eine Vollständigkeit, die sie
  // nicht hat. Sie ist dieselbe Sorte Zeile wie ein Ast (gleiche Engine, gleicher Klick →
  // Brennpunkte scopen) — kein zweiter Mechanismus für eine zweite Zeilenart.
  const rows = $derived([
    ...(data?.branches ?? []).map((branch, index) => buildRow(branch, branch.label, index, branch.personIds)),
    ...(data && data.rest.size > 0
      ? [buildRow(null, REST_LABEL, data.branches.length, data.rest)]
      : []),
  ]);
  /** Die aktuell gewählte Zeile, falls vorhanden — als eigener Wert, damit TS die
   *  `selectedIndex !== null`-Prüfung nicht über eine Closure hinweg neu bewerten muss. */
  const selectedRow = $derived(selectedIndex !== null ? (rows[selectedIndex] ?? null) : null);

  function selectLevel(newLevel: number) {
    level = newLevel;
    selectedIndex = null;
    onSelectBranch(null);
  }

  function toggleBranch(row: BranchRow) {
    if (selectedIndex === row.index) {
      selectedIndex = null;
      onSelectBranch(null);
    } else {
      selectedIndex = row.index;
      onSelectBranch({ label: row.label, personIds: row.scope });
    }
  }

  function barClass(pct: number): string {
    return pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'low';
  }
</script>

<div class="branches">
  <div class="branches__head">
    <h3 class="branches__title">Ast-Reifegrad</h3>
    <label class="branches__level-lbl">
      Ebene
      <select
        class="branches__level"
        value={level}
        onchange={(e) => selectLevel(Number(e.currentTarget.value))}
      >
        {#each LEVELS as l (l.value)}
          <option value={l.value}>{l.label}</option>
        {/each}
      </select>
    </label>
  </div>

  {#if !data}
    <p class="branches__empty">Kein Proband auflösbar — keine Personen geladen.</p>
  {:else if !hasAnyRoot}
    <p class="branches__empty">Keine bekannten Vorfahren auf dieser Ebene.</p>
  {:else}
    <ul class="branches__list">
      {#each rows as row (row.index)}
        <li>
          <button
            type="button"
            class="branches__row"
            class:branches__row--rest={row.branch === null}
            class:branches__row--selected={selectedIndex === row.index}
            aria-pressed={selectedIndex === row.index}
            onclick={() => toggleBranch(row)}
          >
            <span class="branches__label">{row.label}</span>
            {#if row.cleanPct === null}
              <span class="branches__pct branches__pct--empty">—</span>
            {:else}
              <span class="branches__bar" role="img" aria-label="{row.label}: {row.cleanPct} Prozent befundfrei">
                <span
                  class="branches__bar-fill branches__bar-fill--{barClass(row.cleanPct)}"
                  style:width="{row.cleanPct}%"
                ></span>
              </span>
              <span class="branches__pct">{row.cleanPct} % · {row.total}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
    {#if selectedRow}
      <p class="branches__filter-note">
        Brennpunkte gefiltert nach {selectedRow.branch ? 'Ast' : ''} „{selectedRow.label}" —
        <button type="button" class="branches__clear" onclick={() => toggleBranch(selectedRow)}>
          Auswahl aufheben
        </button>
      </p>
    {/if}
  {/if}
</div>

<style>
  .branches {
    margin: 1rem 0.75rem 0;
    padding: 0.7rem 0.75rem;
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-card);
  }

  .branches__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .branches__title {
    margin: 0;
    font-family: var(--stb-font-title);
    font-size: 0.9rem;
    color: var(--stb-gold-light);
  }

  .branches__level-lbl {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }

  .branches__level {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.4rem;
    font-size: 0.78rem;
    min-height: var(--stb-touch-target);
  }

  .branches__empty {
    margin: 0.5rem 0 0;
    color: var(--stb-text-dim);
    font-size: 0.82rem;
  }

  .branches__list {
    list-style: none;
    margin: 0.6rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .branches__row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-height: var(--stb-touch-target);
    padding: 0.3rem 0.5rem;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    color: var(--stb-text);
    cursor: pointer;
    text-align: left;
    font-size: 0.78rem;
  }

  /* Die Restzeile ist kein Ast — sie wird abgesetzt, damit die Balkenreihe lesbar
     bleibt, ohne dass sie wie eine fünfte Linie mitzählt. */
  .branches__row--rest {
    border-style: dashed;
    color: var(--stb-text-dim);
  }

  .branches__row--selected {
    border-color: var(--stb-gold);
    background: var(--stb-surface-3);
  }

  .branches__label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .branches__bar {
    flex: 1 1 5rem;
    max-width: 8rem;
    background: var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    height: 0.5rem;
    overflow: hidden;
    display: block;
  }

  .branches__bar-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
  }
  .branches__bar-fill--good { background: var(--stb-ok); }
  .branches__bar-fill--mid { background: var(--stb-warn, #d9a441); }
  .branches__bar-fill--low { background: var(--stb-danger, #e06c6c); }

  .branches__pct {
    flex: none;
    color: var(--stb-text-dim);
    font-variant-numeric: tabular-nums;
  }

  .branches__pct--empty {
    color: var(--stb-text-muted, var(--stb-text-dim));
  }

  .branches__filter-note {
    margin: 0.5rem 0 0;
    font-size: 0.75rem;
    color: var(--stb-text-dim);
  }

  .branches__clear {
    background: transparent;
    border: none;
    padding: 0;
    color: var(--stb-gold-light);
    cursor: pointer;
    text-decoration: underline;
    font-size: inherit;
  }
</style>
