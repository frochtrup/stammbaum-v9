<script lang="ts">
  // ui/shell/LensViewHeader.svelte — DIE EINE Kopfzeile für jede Lens-Ansicht
  // (Baum/Karte/Zeitleiste[folgt]/Story[folgt], Spec 21 §4, INV-UI-3).
  //
  // Befund (Browser-Verifikation Baum+Karte): beide Lenses hatten je eine eigene
  // `__topbar`-Zeile mit reinem Titel-Text ÜBER dem Lens-Umschalter — redundant, denn
  // der Umschalter zeigt die aktive Lens bereits über das hervorgehobene Tab
  // (aria-current + Klasse). Das kostete unnötigen Vertikalraum (Mobile-first) UND
  // war unabhängig dupliziertes Markup+CSS pro View (Baum-Topbar 26.6px hoch mit
  // Vollbild-Button, Karte-Topbar nur 18.5px ohne — liefen bei jeder künftigen
  // Änderung weiter auseinander).
  //
  // Diese Komponente ist jetzt die EINZIGE Quelle für Höhe/Padding/Ausrichtung der
  // Lens-Kopfzeile: sie rendert NUR NOCH den LensSwitcher selbst (keine Titel-Zeile
  // mehr) und reicht optional einen Aktions-Bereich rechts daneben durch (z. B. der
  // Baum-Vollbild-Button). View-spezifische zweite Zeilen (z. B. der Karten-Modus-
  // Umschalter Orte/Personen/Migrationen) bleiben bewusst AUSSERHALB dieser
  // Komponente — sie sind inhaltlich kein Lens-Wechsel, sondern ein View-internes
  // Konzept, und jede aufrufende View rendert sie direkt darunter.
  import LensSwitcher from './LensSwitcher.svelte';
  import type { LensId } from './lens-model';
  import type { Snippet } from 'svelte';

  interface Props {
    active: LensId;
    onNavigate: (lens: LensId) => void;
    /** Optionaler Kontext-Aktionen-Bereich rechts neben dem Umschalter (z. B. der
     * Baum-Vollbild-Button) — bleibt leer, wenn eine Lens keine solche Aktion hat. */
    actions?: Snippet;
  }
  const { active, onNavigate, actions }: Props = $props();
</script>

<div class="lens-view-header">
  <LensSwitcher {active} {onNavigate} />
  {#if actions}
    <div class="lens-view-header__actions">
      {@render actions()}
    </div>
  {/if}
</div>

<style>
  .lens-view-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .lens-view-header :global(.lens-switcher) {
    flex: 1;
    min-width: 0;
  }

  .lens-view-header__actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-shrink: 0;
  }
</style>
