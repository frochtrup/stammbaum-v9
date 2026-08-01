<script lang="ts">
  // ui/shell/FilterBar.svelte — DIE EINE Filter-Container-Komponente für Listen-
  // Toolbars (Spec 21 §10a). Befund: PersonList/FamilyList/PlaceList implementierten
  // unabhängig voneinander denselben "showFilters"-Boolean + ein IMMER gerendertes
  // `{#if showFilters}`-Feld-Grid mit fast identischem CSS (roher flex-wrap-Block ohne
  // Platzbudget — "nimmt 50% des Bildschirms ein"). Diese Komponente übernimmt NUR die
  // Container-Mechanik (eingeklappt per Default, Trigger-Button mit "Filter"/"Filter · N",
  // Bottom-Sheet auf Mobile / Popover unterhalb des Buttons auf Desktop) — die Filter-
  // FELDER selbst bleiben unverändert bei der jeweiligen Liste (children-Snippet).
  //
  // "N aktive Filter" ist bewusst ein Prop, kein Component-internes Wissen: FilterBar
  // kennt die Feldstruktur der jeweiligen Liste nicht (Person/Familie/Ort haben
  // unterschiedliche PersonFilters/FamilyFilters/PlaceFilters-Typen) — die aufrufende
  // Liste zählt selbst (via count-active-filters.ts) und reicht nur die Zahl durch.
  //
  // Panel und Backdrop hängen per Portal am <body> (BL-85): der sticky Toolbar-Vorfahre
  // (`z-index: 1`) spannt einen Stacking-Context auf, in dem jede eigene Zahl aufgelöst
  // wird — bis 9999 gemessen und wirkungslos (ADR-v9-97/98). Der Desktop-Popover wird
  // zusätzlich an seinem Trigger positioniert; auf Mobil bleibt es ein Bottom-Sheet, die
  // Anker-Variablen sind dort schlicht ungenutzt (der Breakpoint steht weiterhin NUR im
  // Stylesheet, nicht ein zweites Mal in JavaScript).
  import type { Snippet } from 'svelte';
  import { portal, anchoredTo } from './portal';

  interface Props {
    /** Anzahl der vom Default abweichenden Filterfelder — 0 = "Filter", sonst "Filter · N". */
    activeCount?: number;
    /**
     * Beschriftung von Trigger und Panel. Default "Filter" — der Fall, für den diese
     * Komponente gebaut wurde.
     *
     * Der Parameter kam mit BL-96 dazu: Spec 21 §6h ordnet "seltene/schwere" Befehle
     * hinter EINEN Einstiegspunkt, und die Orts-/Hof-Werkzeuge (Review, Massen-Dedup)
     * sind genau das. Sie brauchen dieselbe Mechanik — eingeklappt per Default,
     * Bottom-Sheet auf Mobil, Popover auf Desktop, portaliert. Eine zweite Komponente
     * dafür wäre derselbe Mechanismus zum zweiten Mal (INV-UI-4); ein Parameter ist die
     * kleinere Antwort. (Die allgemeinere Extraktion zu einer `Disclosure`-Primitive
     * steht als BL-69 im Backlog — hier bewusst NICHT vorweggenommen.)
     */
    label?: string;
    /**
     * Reiner Achtungs-Punkt am Trigger (BL-206, ADR-v9-148): `true` zeigt einen kleinen
     * Punkt (KEINE Zahl) neben dem Label, sobald hinter der Disclosure Handlungsbedarf
     * liegt — für die Orts-/Hof-Kurationswerkzeuge, deren Buttons hinter dieser Disclosure
     * verborgen sind (ein Badge auf einem verborgenen Button wäre nicht proaktiv sichtbar,
     * §6h/INV-UI-11). Bewusst ein Boolean, keine Zahl: die summierte Zahl mischte fachlich
     * getrennte Signale (Dedup/Review) zu einer bedeutungslosen Summe (ADR-v9-148 Verworfen b);
     * die beschrifteten Einzelzähler stehen aufgeklappt in den Panel-Inhalten. Der zugängliche
     * Name des Triggers trägt den Handlungsbedarf mit (LP-8/§6i), nicht nur die Farbe.
     */
    attention?: boolean;
    children: Snippet;
  }
  const { activeCount = 0, label = 'Filter', attention = false, children }: Props = $props();

  let open = $state(false);
  let triggerEl = $state<HTMLElement | undefined>(undefined);

  function toggle() {
    open = !open;
  }

  function close() {
    open = false;
  }
</script>

<div class="stb-filterbar">
  <button
    type="button"
    class="stb-filterbar__trigger"
    aria-expanded={open}
    onclick={toggle}
    bind:this={triggerEl}
  >
    {label}{activeCount > 0 ? ` · ${activeCount}` : ''}
    {#if attention}<span class="stb-filterbar__dot" aria-hidden="true"></span><span class="stb-filterbar__sr"> — Handlungsbedarf</span>{/if}
  </button>

  {#if open}
    <button type="button" class="stb-filterbar__backdrop" aria-label="{label}-Hintergrund schließen" onclick={close} use:portal></button>
    <div class="stb-filterbar__panel" role="dialog" aria-label={label} use:anchoredTo={triggerEl}>
      <div class="stb-filterbar__panel-head">
        <span>{label}</span>
        <button type="button" class="stb-filterbar__panel-close" aria-label="{label} schließen" onclick={close}>✕</button>
      </div>
      <div class="stb-filterbar__panel-body">
        {@render children()}
      </div>
    </div>
  {/if}
</div>

<style>
  .stb-filterbar {
    position: relative;
    display: inline-flex;
  }

  .stb-filterbar__trigger {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .stb-filterbar__trigger:hover,
  .stb-filterbar__trigger[aria-expanded='true'] {
    border-color: var(--stb-gold);
  }

  /* Reiner Achtungs-Punkt (BL-206): amber (--stb-warn) — ein Nudge „hier ist etwas zu
     tun", bewusst NICHT --stb-danger (Rot = Fehler) und nicht Gold (verschwände im
     goldenen Trigger-Rand). Kleiner gefüllter Kreis, inline nach dem Label. */
  .stb-filterbar__dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-left: 0.4rem;
    border-radius: 50%;
    background: var(--stb-warn);
    vertical-align: middle;
  }

  /* Screenreader-Text: der Punkt darf nicht nur visuell existieren (LP-8/§6i). */
  .stb-filterbar__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  .stb-filterbar__backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    border: none;
    padding: 0;
    cursor: default;
    /* Geteilte Ebenen-Skala (ADR-v9-97) — wirksam, seit das Element portaliert ist. */
    z-index: calc(var(--stb-z-modal) - 1);
  }

  /* Mobile-first: Bottom-Sheet — volle Breite, begrenzte Höhe mit eigenem Scroll
     (375px Zielbreite, Spec 21 §2).

     Es dockt ÜBER der Bottom-Nav an, nicht am Viewport-Rand — das ist eine
     Gestaltungsentscheidung, kein Notbehelf mehr: seit dem Portal (BL-85) läge das Sheet
     ohnehin über der Nav, aber eine Navigation, die das Sheet verdeckt, ist genauso
     falsch wie eine, die verdeckt wird. Die Höhe kommt aus EINEM Token, das auch
     `BottomNav` setzt — sonst driften Nav und Andockpunkt auseinander (ADR-v9-98).
     `--stb-nav-total` statt `--stb-nav-height`: die Nav ist auf dem Gerät um das
     Home-Indikator-Inset höher als ihre Basis-Höhe, das Sheet läge sonst um genau
     diesen Betrag darunter. */
  .stb-filterbar__panel {
    position: fixed;
    left: 0;
    right: 0;
    bottom: var(--stb-nav-total);
    z-index: var(--stb-z-modal);
    max-height: 70vh;
    overflow-y: auto;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    border-bottom: none;
    border-radius: var(--stb-radius-card) var(--stb-radius-card) 0 0;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.4);
  }

  /* Desktop: Popover am Trigger statt Bottom-Sheet. Die Koordinaten kommen aus
     `anchoredTo` — nach dem Portal gibt es keinen positionierten Vorfahren mehr, auf den
     sich `absolute` beziehen könnte. */
  @media (min-width: 640px) {
    .stb-filterbar__panel {
      left: var(--stb-anchor-left, 0);
      right: auto;
      bottom: auto;
      top: var(--stb-anchor-top, 0);
      max-height: min(70vh, 420px);
      width: max-content;
      min-width: 260px;
      max-width: min(90vw, 480px);
      border-radius: var(--stb-radius-card);
      border-bottom: 1px solid var(--stb-gold-dim);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
    }

    .stb-filterbar__backdrop {
      background: transparent;
    }
  }

  .stb-filterbar__panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--stb-surface-3);
    font-size: 0.85rem;
    color: var(--stb-gold-light);
    font-weight: 600;
  }

  .stb-filterbar__panel-close {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0;
  }

  .stb-filterbar__panel-close:hover {
    color: var(--stb-text);
  }

  .stb-filterbar__panel-body {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    align-items: flex-end;
  }
</style>
