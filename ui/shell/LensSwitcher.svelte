<script lang="ts">
  // ui/shell/LensSwitcher.svelte — DER EINE Lens-Umschalter (Spec 21 §4, INV-UI-3:
  // "genau ein Lens-Umschalter-Mechanismus; kein Diagramm bringt eigene Wechsel-Buttons
  // mit"). Segment-Control für Mobile (Spec 21 §4: "Segment-Control (Mobile) bzw.
  // Sidebar-Abschnitt 'Ansichten' (Desktop)" — Desktop-Variante ist NICHT Teil dieser
  // Scheibe).
  //
  // Zeigt die aktive Lens deutlich (Spec 21 §2 "nie nur Farbe", WCAG 1.4.1/LP-8) über
  // aria-current + eine eigene Modifier-Klasse — dasselbe Muster wie BottomNav.svelte.
  // Klick auf eine nicht implementierte Lens tut NICHTS (kein onNavigate-Aufruf, kein
  // Crash) — analog zum `implemented:false`-Muster aus BottomNav/EntityTab/MoreView.
  //
  // Trägt selbst KEINEN Fokus-Zustand: der Aufrufer (App.svelte) entscheidet, wohin
  // navigiert wird, und der gemeinsame ViewState-Slot `lensFocus` (view-state.svelte.ts)
  // hält den eigentlichen Fokus über den Lens-Wechsel hinweg (INV-VS).
  import { LENSES, type LensId } from './lens-model';

  interface Props {
    active: LensId;
    onNavigate: (lens: LensId) => void;
  }
  const { active, onNavigate }: Props = $props();

  function select(id: LensId, implemented: boolean): void {
    if (!implemented) return;
    onNavigate(id);
  }
</script>

<div class="lens-switcher" role="tablist" aria-label="Ansicht wählen">
  {#each LENSES as lens (lens.id)}
    <button
      type="button"
      role="tab"
      class="lens-switcher__item"
      class:lens-switcher__item--active={active === lens.id}
      class:lens-switcher__item--disabled={!lens.implemented}
      aria-current={active === lens.id ? 'page' : undefined}
      aria-selected={active === lens.id}
      disabled={!lens.implemented}
      onclick={() => select(lens.id, lens.implemented)}
    >
      <span class="lens-switcher__icon" aria-hidden="true">{lens.icon}</span>
      <span class="lens-switcher__label">{lens.label}{lens.implemented ? '' : ' (folgt)'}</span>
    </button>
  {/each}
</div>

<style>
  .lens-switcher {
    display: flex;
    gap: 0.25rem;
    padding: 0.3rem;
    background: var(--stb-surface-2);
    border-radius: var(--stb-radius-control);
  }

  .lens-switcher__item {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    background: transparent;
    border: none;
    border-radius: var(--stb-radius-control);
    color: var(--stb-text-dim);
    padding: 0.4rem 0.5rem;
    font-size: 0.78rem;
    cursor: pointer;
  }

  .lens-switcher__item--active {
    background: var(--stb-surface-3);
    color: var(--stb-gold-light);
    font-weight: 700;
  }

  .lens-switcher__item--disabled {
    cursor: default;
    opacity: 0.55;
  }

  .lens-switcher__icon {
    font-size: 1rem;
    line-height: 1;
  }
</style>
