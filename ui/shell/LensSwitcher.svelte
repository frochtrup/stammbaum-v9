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

<div class="lens-switcher stb-segment-row" role="tablist" aria-label="Ansicht wählen">
  {#each LENSES as lens (lens.id)}
    <button
      type="button"
      role="tab"
      class="stb-segment-btn lens-switcher__item"
      class:stb-segment-btn--active={active === lens.id}
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
  /* Segment-Control-Pillen selbst kommen aus design-system.css (.stb-segment-row/
     .stb-segment-btn/--active) — EntityTab-Kanon (Spec 21 §6/§2: individuell
     umrandete Pillen, aktiv = volle Gold-Füllung, kein Zeilenumbruch). Icon ist ein
     zusätzliches Element INNERHALB der standardisierten Pille, kein eigenes
     Styling-System. `.lens-switcher__item--active` bleibt als Alias-Klasse für den
     bestehenden Komponenten-Test (prüft genau diesen Klassennamen). */
  .lens-switcher__item {
    gap: 0.35rem;
  }

  .lens-switcher__item--disabled {
    opacity: 0.55;
  }

  .lens-switcher__icon {
    font-size: 1rem;
    line-height: 1;
  }
</style>
