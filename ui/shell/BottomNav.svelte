<script lang="ts">
  // ui/shell/BottomNav.svelte — mobile Bottom-Nav, 5 feste Ziele (Spec 21 §2).
  // "Personen", "Baum" (Sanduhr-Insel, Spec 20 §1.3 [K]), "Suche" (Spec 20 §1.1 [K]),
  // "Aufgaben" (Spec 20 §1.11 [K]) UND "Mehr" (Hub-Gerüst für die Lenses + Ausgaben +
  // Einstellungen, s. MoreView.svelte) sind in dieser Scheibe funktional. Die einzelnen
  // Lenses/Ausgaben/Einstellungen HINTER dem Mehr-Hub sind noch Platzhalter (eigene,
  // spätere Bauabschnitte) — kein Absturz beim Klick, aber auch kein stiller Wechsel in
  // einen nicht gebauten Bereich.
  //
  // Aktiver Zustand: Balken + fett + Akzentfarbe (nicht nur Farbe, WCAG 1.4.1 / LP-8,
  // Spec 21 §2 "nie nur Farbe").
  // Bottom-Nav-Ziele sind eine feste Teilmenge der Navigationsziele (Spec 21 §2: 5 feste
  // Slots). Familien/Quellen/Archive sind KEINE Bottom-Nav-Ziele — sie leben im
  // Entitäten-Segment-Umschalter (EntityTab.svelte), erreichbar über "Personen".
  //
  // Die Liste selbst steht seit BL-90 NICHT mehr hier: Symbole und Beschriftungen kommen
  // aus dem einen Ziel-Register (nav-model.ts, INV-UI-15) — diese Komponente ist eine
  // Projektion darauf, keine zweite Quelle. Vorher standen dieselben Beschriftungen
  // zusätzlich in EntityTab.svelte und MoreView.svelte (ADR-v9-101).
  import { bottomNavItems, type BottomNavSlot } from './nav-model';

  const items = bottomNavItems();

  interface Props {
    active: BottomNavSlot;
    onNavigate: (target: BottomNavSlot) => void;
    /** Anzahl offener Aufgaben fürs Badge (Spec 20 §1.11 [K], Orakel `_updateTasksBadge`
     * "99+" ab >99) — 0/undefined blendet das Badge aus. Formatierung obliegt dem
     * Aufrufer (tasks-model.ts `formatBadgeCount`), diese Komponente zeigt nur an. */
    openTaskBadge?: string;
  }
  const { active, onNavigate, openTaskBadge }: Props = $props();
</script>

<nav class="bottom-nav" aria-label="Hauptnavigation">
  {#each items as item (item.id)}
    <button
      type="button"
      class="bottom-nav__item"
      class:bottom-nav__item--active={active === item.id}
      aria-current={active === item.id ? 'page' : undefined}
      data-slot={item.id}
      onclick={() => onNavigate(item.id)}
    >
      <span class="bottom-nav__bar" aria-hidden="true"></span>
      <span class="bottom-nav__icon" aria-hidden="true">
        {item.icon}
        {#if item.id === 'tasks' && openTaskBadge}
          <span class="bottom-nav__badge">{openTaskBadge}</span>
        {/if}
      </span>
      <span class="bottom-nav__label">{item.label}{item.implemented ? '' : ' (folgt)'}</span>
    </button>
  {/each}
</nav>

<style>
  .bottom-nav {
    display: flex;
    justify-content: space-around;
    align-items: stretch;
    background: var(--stb-surface-1);
    border-top: 1px solid var(--stb-surface-3);
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    /* Höhe aus dem geteilten Token, damit Overlays, die sich über der Nav andocken,
       nicht auf eine geschätzte Zahl angewiesen sind (design-system.css). */
    min-height: var(--stb-nav-height);
    z-index: var(--stb-z-nav);
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  .bottom-nav__item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 4px 6px;
    background: transparent;
    border: none;
    cursor: pointer;
    position: relative;
    color: var(--stb-text-dim);
  }

  .bottom-nav__bar {
    position: absolute;
    top: 0;
    left: 20%;
    right: 20%;
    height: 3px;
    border-radius: 0 0 3px 3px;
    background: transparent;
  }

  .bottom-nav__item--active {
    color: var(--stb-gold-light);
    font-weight: 700;
  }

  .bottom-nav__item--active .bottom-nav__bar {
    background: var(--stb-gold);
  }

  .bottom-nav__icon {
    position: relative;
    display: inline-block;
    font-size: 1.25rem;
    line-height: 1;
  }

  .bottom-nav__badge {
    position: absolute;
    top: -6px;
    right: -10px;
    background: var(--stb-danger);
    color: var(--stb-text);
    border-radius: 999px;
    padding: 0 0.3em;
    font-size: 0.58rem;
    font-weight: 700;
    line-height: 1.4;
    min-width: 1.3em;
    text-align: center;
  }

  .bottom-nav__label {
    font-size: 0.68rem;
  }
</style>
