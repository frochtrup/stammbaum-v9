<script lang="ts">
  // ui/shell/BottomNav.svelte — mobile Bottom-Nav, 5 feste Ziele (Spec 21 §2).
  // "Personen", "Baum" (Sanduhr-Insel, Spec 20 §1.3 [K]) UND "Suche" (Spec 20 §1.1 [K])
  // sind in dieser Scheibe funktional; die übrigen zwei sind sichtbare, klickbare
  // Platzhalter (deutlich als "folgt" markiert) — kein Absturz beim Klick, aber auch
  // kein stiller Wechsel in einen nicht gebauten Bereich.
  //
  // Aktiver Zustand: Balken + fett + Akzentfarbe (nicht nur Farbe, WCAG 1.4.1 / LP-8,
  // Spec 21 §2 "nie nur Farbe").
  // Bottom-Nav-Ziele sind eine feste Teilmenge von ViewTarget (Spec 21 §2: 5 feste
  // Slots). Familien/Quellen/Archive sind KEINE Bottom-Nav-Ziele — sie leben im
  // Entitäten-Segment-Umschalter (EntityTab.svelte), erreichbar über "Personen".
  export type BottomNavTarget = 'tree' | 'person' | 'search' | 'tasks' | 'more';

  interface NavItem {
    target: BottomNavTarget;
    icon: string;
    label: string;
    implemented: boolean;
  }

  const items: NavItem[] = [
    { target: 'tree', icon: '⧖', label: 'Baum', implemented: true },
    { target: 'person', icon: '👤', label: 'Personen', implemented: true },
    { target: 'search', icon: '🔍', label: 'Suche', implemented: true },
    { target: 'tasks', icon: '☑', label: 'Aufgaben', implemented: false },
    { target: 'more', icon: '⋯', label: 'Mehr', implemented: false },
  ];

  interface Props {
    active: BottomNavTarget;
    onNavigate: (target: BottomNavTarget) => void;
  }
  const { active, onNavigate }: Props = $props();
</script>

<nav class="bottom-nav" aria-label="Hauptnavigation">
  {#each items as item (item.target)}
    <button
      type="button"
      class="bottom-nav__item"
      class:bottom-nav__item--active={active === item.target}
      aria-current={active === item.target ? 'page' : undefined}
      onclick={() => onNavigate(item.target)}
    >
      <span class="bottom-nav__bar" aria-hidden="true"></span>
      <span class="bottom-nav__icon" aria-hidden="true">{item.icon}</span>
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
    z-index: 400;
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
    font-size: 1.25rem;
    line-height: 1;
  }

  .bottom-nav__label {
    font-size: 0.68rem;
  }
</style>
