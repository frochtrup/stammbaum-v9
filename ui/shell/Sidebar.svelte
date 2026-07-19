<script lang="ts">
  // ui/shell/Sidebar.svelte — persistente linke Sidebar des Desktop-Modells
  // (Spec 21 §3, BL-06). Ersetzt oberhalb der Layout-Grenze (900px, layout.svelte.ts)
  // die Bottom-Nav.
  //
  // Kein verbreitertes Mobile-Layout: die Sidebar zeigt ALLE Ziele flach und
  // BESCHRIFTET, nach den drei Rollen des Rollenmodells gruppiert (Spec 21 §1) —
  // Entitäten, Ansichten, Arbeit. Genau das löst die v8-Befunde B1 (Ziele ohne
  // Nav-Button), B5 (Desktop = Mobile + Spalten) und B6 (kryptische Icon-Leiste)
  // strukturell auf, statt sie kleiner zu machen.
  //
  // Sie führt KEINE eigene Ziel-Liste: Gruppen, Beschriftungen, Symbole und der
  // Implementiert-Status kommen aus dem einen Register (nav-model.ts, INV-UI-15) —
  // dieselbe Quelle, aus der BottomNav und MoreView projizieren. Deshalb erscheint ein
  // künftig ergänztes Ziel hier automatisch mit, ohne dass jemand daran denken muss.
  //
  // Aktiver Zustand: Balken + fett + Akzentfarbe — nie nur Farbe (WCAG 1.4.1 / LP-8,
  // dieselbe Regel und dieselbe Bauform wie in BottomNav.svelte). Anders als dort wird
  // das Ziel hier DIREKT markiert: `bottomNavSlotFor()` bündelt Ziele auf fünf Slots,
  // weil die Bottom-Nav nur fünf hat — die Sidebar hat für jedes Ziel eine eigene
  // Zeile und braucht diese Bündelung nicht.
  import { targetsByRole, type NavRole, type NavTargetId, type RouteTarget } from './nav-model';

  interface Props {
    active: RouteTarget;
    onNavigate: (target: NavTargetId) => void;
    /** Anzahl offener Aufgaben fürs Badge — analog BottomNav, Formatierung beim Aufrufer. */
    openTaskBadge?: string;
  }
  const { active, onNavigate, openTaskBadge }: Props = $props();

  // Reihenfolge und Beschriftung der Gruppen folgen Spec 21 §3 wörtlich.
  const GROUPS: { role: NavRole; label: string }[] = [
    { role: 'entity', label: 'Entitäten' },
    { role: 'lens', label: 'Ansichten' },
    { role: 'work', label: 'Arbeit' },
  ];
</script>

<nav class="sidebar" aria-label="Hauptnavigation">
  <p class="sidebar__brand">Stammbaum</p>

  {#each GROUPS as group (group.role)}
    <div class="sidebar__group">
      <h2 class="sidebar__group-label" id="sidebar-group-{group.role}">{group.label}</h2>
      <ul class="sidebar__list" aria-labelledby="sidebar-group-{group.role}">
        {#each targetsByRole(group.role) as target (target.id)}
          <li>
            <button
              type="button"
              class="sidebar__item"
              class:sidebar__item--active={active === target.id}
              aria-current={active === target.id ? 'page' : undefined}
              disabled={!target.implemented}
              onclick={() => onNavigate(target.id)}
            >
              <span class="sidebar__bar" aria-hidden="true"></span>
              <span class="sidebar__icon" aria-hidden="true">{target.icon}</span>
              <span class="sidebar__label">{target.label}{target.implemented ? '' : ' (folgt)'}</span>
              {#if target.id === 'tasks' && openTaskBadge}
                <span class="sidebar__badge">{openTaskBadge}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</nav>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    width: 13.5rem;
    flex-shrink: 0;
    height: 100%;
    overflow-y: auto;
    padding: 0.75rem 0.6rem 1rem;
    background: var(--stb-surface-1);
    border-right: 1px solid var(--stb-surface-3);
  }

  .sidebar__brand {
    margin: 0 0 0.5rem 0.5rem;
    font-size: 1.1rem;
    color: var(--stb-gold-light);
    font-weight: 700;
  }

  .sidebar__group {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .sidebar__group-label {
    margin: 0.5rem 0 0.15rem 0.5rem;
    font-size: 0.68rem;
    font-weight: 400;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--stb-text-muted);
  }

  .sidebar__list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .sidebar__item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.4rem 0.5rem;
    background: transparent;
    border: none;
    border-radius: var(--stb-radius-control);
    color: var(--stb-text-dim);
    font: inherit;
    font-size: 0.88rem;
    text-align: left;
    cursor: pointer;
  }

  .sidebar__item:hover:not(:disabled) {
    background: var(--stb-surface-2);
    color: var(--stb-text);
  }

  .sidebar__item:disabled {
    opacity: 0.45;
    cursor: default;
  }

  /* Aktiv-Signal Nr. 1 von 3: der Balken (nie nur Farbe, LP-8). Links statt oben —
     die Sidebar ist vertikal, die Bottom-Nav horizontal. */
  .sidebar__bar {
    position: absolute;
    left: 0;
    top: 15%;
    bottom: 15%;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: transparent;
  }

  .sidebar__item--active {
    color: var(--stb-gold-light);
    font-weight: 700;
    background: var(--stb-surface-2);
  }

  .sidebar__item--active .sidebar__bar {
    background: var(--stb-gold);
  }

  .sidebar__icon {
    font-size: 1rem;
    line-height: 1;
    width: 1.3em;
    text-align: center;
    flex-shrink: 0;
  }

  .sidebar__label {
    min-width: 0;
  }

  .sidebar__badge {
    margin-left: auto;
    background: var(--stb-danger);
    color: var(--stb-text);
    border-radius: 999px;
    padding: 0 0.4em;
    font-size: 0.6rem;
    font-weight: 700;
    line-height: 1.5;
  }
</style>
