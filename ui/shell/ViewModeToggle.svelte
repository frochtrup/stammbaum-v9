<script lang="ts">
  // ui/shell/ViewModeToggle.svelte — DER EINE "Alternativansicht-Umschalter"-Mechanismus
  // (Spec 21 §6h INV-UI-11 Zuordnungsregel "Alternativansicht-Umschalter (Liste⇄Board,
  // Liste⇄Timeline, künftige Fälle) → EIN geteilter ViewModeToggle-Mechanismus"; Spec 21
  // §10b "Wählbare Gruppierungslogik ... über den bereits etablierten ViewModeToggle-
  // Mechanismus, NICHT über einen neuen View-lokalen Steuerungstyp"). Generisch über die
  // konkreten Modi (Liste vom Aufrufer) — kein View erfindet sein eigenes "Modus A/B/C"-
  // Muster (INV-UI-4). Erster Aufrufer folgt in einem Folge-Auftrag (Ortszeitgenossen:
  // "nach Jahrzehnt · nach Hof · ungruppiert", ADR-v9-78 Punkt 5/6).
  //
  // Nutzt DIESELBEN `.stb-segment-row`/`.stb-segment-btn`-Klassen wie LensSwitcher.svelte/
  // EntityTab.svelte statt einen dritten Segment-Control-Stil zu erfinden (INV-UI-4,
  // Spec 21 §6 "wiederkehrende visuelle Muster haben genau eine Quelle").
  export interface ViewMode {
    id: string;
    label: string;
  }

  interface Props {
    modes: ViewMode[];
    value: string;
    onChange: (id: string) => void;
    /** Kontext-Beschriftung für Screenreader (LP-8) — was genau hier umgeschaltet wird
     *  (z. B. "Gruppierung wählen", "Ansicht wählen"). */
    ariaLabel?: string;
  }
  const { modes, value, onChange, ariaLabel = 'Ansicht wählen' }: Props = $props();
</script>

<div class="view-mode-toggle stb-segment-row" role="tablist" aria-label={ariaLabel}>
  {#each modes as mode (mode.id)}
    <button
      type="button"
      role="tab"
      class="stb-segment-btn"
      class:stb-segment-btn--active={value === mode.id}
      aria-selected={value === mode.id}
      onclick={() => onChange(mode.id)}
    >
      {mode.label}
    </button>
  {/each}
</div>

<style>
  /* Segment-Pillen selbst kommen aus design-system.css (.stb-segment-row/-btn,
     INV-UI-4) — nur das umgebende Padding wird hier auf 0 gesetzt, weil dieser
     Umschalter typischerweise INNERHALB einer bereits gepolsterten Toolbar-Zeile sitzt
     (Spec 21 §6h Budget-Zuordnung), nicht als eigenständige Kopfzeile wie EntityTab. */
  .view-mode-toggle {
    padding: 0;
  }
</style>
