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
  //
  // `active = null` (BL-60, ADR-v9-153): derselbe Umschalter, aufgerufen aus einer
  // Fläche, die SELBST keine Lens ist (Personen-Steckbrief) — ein reiner Absprung
  // „diese Person in Ansicht X". Dann ist die Reihe kein `tablist` mit einem aktiven
  // Tab, sondern eine Gruppe gleichrangiger Sprung-Knöpfe: `role="tab"`/`aria-selected`
  // ohne ausgewählten Tab wäre für Screenreader eine Falschaussage (LP-8, §6i). Optik
  // und Mechanismus bleiben identisch — das ist der Punkt (INV-UI-3: EIN Umschalter,
  // nicht je Fläche ein eigener Satz Sprung-Knöpfe).
  import { LENSES, type LensId } from './lens-model';

  interface Props {
    /** Aktive Lens — `null`, wenn der Aufrufer selbst keine Lens ist (Absprung-Modus). */
    active: LensId | null;
    onNavigate: (lens: LensId) => void;
    /** Beschriftung der Reihe für Screenreader; im Absprung-Modus benennt sie den Bezug
     *  („Diese Person in einer anderen Ansicht öffnen"). */
    ariaLabel?: string;
  }
  const { active, onNavigate, ariaLabel = 'Ansicht wählen' }: Props = $props();

  /** Absprung-Modus (kein aktiver Tab) — s. Kopfkommentar. */
  const isJump = $derived(active === null);

  function select(id: LensId, implemented: boolean): void {
    if (!implemented) return;
    onNavigate(id);
  }
</script>

<div class="lens-switcher stb-segment-row stb-segment-row--full" role={isJump ? 'group' : 'tablist'} aria-label={ariaLabel}>
  {#each LENSES as lens (lens.id)}
    <button
      type="button"
      role={isJump ? undefined : 'tab'}
      class="stb-segment-btn lens-switcher__item"
      class:stb-segment-btn--active={active === lens.id}
      class:lens-switcher__item--active={active === lens.id}
      class:lens-switcher__item--disabled={!lens.implemented}
      aria-current={active === lens.id ? 'page' : undefined}
      aria-selected={isJump ? undefined : active === lens.id}
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
