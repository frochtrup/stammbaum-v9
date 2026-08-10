<script lang="ts">
  // ui/views/quality/FocusPersonList.svelte — die „Brennpunkte"-Liste des
  // Qualitäts-Dashboards (Spec 20 §1.11g, BL-05), aus `QualityDashboard.svelte`
  // ausgelagert (Datei-Teilung großzügig, s. CLAUDE.md „Datei-Teilung großzügig statt
  // knapp" — kohäsive Rendering-Einheit statt Trimmen). Reine Anzeige-Komponente: die
  // Mutationslogik (Aufgabe anlegen) bleibt im Aufrufer, hier nur Callback-Props
  // (dasselbe Muster wie `GeoFindingsTile`/`BranchMaturitySection`).
  import type { Finding, FocusFilter, FocusRow, Severity } from '../../../core/validate/index';
  import { SEVERITY_ICON } from '../validation/validation-model';

  interface Props {
    rows: FocusRow[];
    focusFilter: FocusFilter;
    onNavigateToPerson?: (id: string) => void;
    onPromote: (personId: string, finding: Finding) => void;
    onPromoteAll: (personId: string) => void;
    /** Gesamtzahl der Befunde EINER Person über ALLE Schweregrade (nicht nur die
     *  gerade sichtbaren) — für den „+ alle"-Titel. */
    countOf: (personId: string) => number;
  }
  const { rows, focusFilter, onNavigateToPerson, onPromote, onPromoteAll, countOf }: Props = $props();

  /** Höchstzahl gerenderter Brennpunkt-Personen (v8-Parität) — der Rest wird gezählt. */
  const FOCUS_CAP = 40;

  const SEVERITY_CLASS: Record<Severity, string> = {
    error: 'error',
    warn: 'warn',
    info: 'info',
  };
</script>

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
        onclick={() => onPromoteAll(row.personId)}
        title="Alle {countOf(row.personId)} Befunde als Aufgaben anlegen"
      >
        + alle
      </button>
    </div>
    <!-- Der Index gehört in den Key: zwei Befunde EINER Person können denselben Text
         tragen (dieselbe Regel, zwei Ereignisse). Ohne ihn kollidierte der Key, Svelte
         brach den Zweig ab, und die Liste blieb leer, während die Überschrift ihre Zahl
         behielt (Nutzer-Befund 2026-08-10, `tests/ui/FocusPersonList.component.test.ts`). -->
    {#each row.findings as f, fi (f.rule + '\u0000' + fi)}
      <div class="quality__finding quality__finding--{SEVERITY_CLASS[f.severity]}">
        <span class="quality__finding-icon" aria-hidden="true">{SEVERITY_ICON[f.severity]}</span>
        <span class="quality__finding-text">{f.text}</span>
        <button
          type="button"
          class="quality__promote"
          onclick={() => onPromote(row.personId, f)}
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

<style>
  /* .quality__section/__section-count/__empty/__dot* bleiben in QualityDashboard.svelte
     (dort auch von Score-/Ampel-/Radar-Blöcken genutzt, INV-UI-4) — hier nur die
     Klassen, die AUSSCHLIESSLICH die Brennpunkte-Liste selbst betreffen. */
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
