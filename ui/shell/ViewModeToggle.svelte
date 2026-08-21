<script lang="ts">
  // ui/shell/ViewModeToggle.svelte — DER EINE "Alternativansicht-Umschalter"-Mechanismus
  // (Spec 21 §6h INV-UI-11 Zuordnungsregel "Alternativansicht-Umschalter (Liste⇄Board,
  // Liste⇄Timeline, künftige Fälle) → EIN geteilter ViewModeToggle-Mechanismus, ein
  // Icon-Slot"; Spec 21 §10b "Wählbare Gruppierungslogik ... über den bereits etablierten
  // ViewModeToggle-Mechanismus, NICHT über einen neuen View-lokalen Steuerungstyp").
  // Generisch über die konkreten Modi — kein View erfindet sein eigenes "Modus A/B/C"-
  // Muster (INV-UI-4).
  //
  // ZWEI FORMEN, und die Wahl folgt der Anzahl der Modi, nicht dem Geschmack:
  //
  //   GENAU ZWEI Modi → EIN Knopf, der den aktuellen Modus nennt und beim Klick auf den
  //   anderen umschaltet. Das ist die „ein Icon-Slot"-Form, die §6h wörtlich verlangt, und
  //   sie ist der Grund für diese Fassung: als Segmentreihe belegten zwei Modi bei 375px
  //   131 von 343 Pixeln der Toolbar — die Fläche, die das Suchfeld der Forschungslisten
  //   braucht (BL-374, gemessen). Ein Umschalter zwischen zwei Zuständen braucht keine
  //   zwei Flächen: die Gegenoption ist implizit.
  //   Die Darstellung folgt dem bereits gebauten Sortier-Umschalter der Personenliste
  //   (`⇅ Name` ⇄ `⇅ Geburtsdatum`, INV-UI-4): das Vorzeichen `⇄` trägt die Affordanz,
  //   die Beschriftung den IST-Zustand. Der zugängliche Name nennt beide Zustände, weil
  //   „Liste" allein nicht verrät, dass und wohin geklickt wird (LP-8/§6i).
  //
  //   DREI ODER MEHR Modi → die gewohnte Segmentreihe. Ein Rundlauf-Knopf über drei
  //   Zustände verstecken zwei davon; hier ist die Reihe die ehrlichere Fläche.
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

  const kompakt = $derived(modes.length === 2);
  const aktiv = $derived(modes.find((m) => m.id === value) ?? modes[0]);
  const anderer = $derived(modes.find((m) => m.id !== aktiv?.id) ?? modes[0]);
</script>

{#if kompakt}
  <button
    type="button"
    class="view-mode-toggle__switch"
    aria-label="{ariaLabel} — {aktiv?.label}, wechseln zu {anderer?.label}"
    onclick={() => onChange(anderer.id)}
  >
    ⇄ {aktiv?.label}
  </button>
{:else}
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
{/if}

<style>
  /* Segment-Pillen selbst kommen aus design-system.css (.stb-segment-row/-btn,
     INV-UI-4) — nur das umgebende Padding wird hier auf 0 gesetzt, weil dieser
     Umschalter typischerweise INNERHALB einer bereits gepolsterten Toolbar-Zeile sitzt
     (Spec 21 §6h Budget-Zuordnung), nicht als eigenständige Kopfzeile wie EntityTab. */
  .view-mode-toggle {
    padding: 0;
  }

  /* Zwei-Zustands-Form: optisch derselbe Knopf wie der Sortier-Umschalter der
     Personenliste — ein Umschalter soll nicht nach einem eigenen Steuerungstyp aussehen. */
  .view-mode-toggle__switch {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .view-mode-toggle__switch:hover,
  .view-mode-toggle__switch:focus-visible {
    border-color: var(--stb-gold);
  }
</style>
