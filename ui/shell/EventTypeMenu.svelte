<script lang="ts">
  // ui/shell/EventTypeMenu.svelte — geteiltes "+ Ereignis"-Sammel-Menü (ADR-v9-62/63,
  // Spec 20 §2). Button-Trigger + Popover-Liste statt eines `<select bind:value>`
  // (TST-12-Falle unter happy-dom) — analog `FilterBar.svelte`s Trigger+Panel-Muster,
  // aber mit sofort auswählbaren Aktions-Buttons statt Filterfeldern.
  //
  // Diese Shell kennt KEINE konkreten Ereignistypen — sie bekommt fertig gefilterte
  // Item-Gruppen (jede bereits nach "gefüllt schlägt selten" vom Aufrufer gefiltert, s.
  // PersonDetail.svelte/FamilyDetail.svelte) + einen optionalen `otherItems`-Fallback für
  // den bereits bestehenden generischen "beliebiger Typ"-Mechanismus (u. a. IMMI/MILI/
  // CENS/NATU/ADOP/FACT bei Person, s. Spec 20 §2) über ein natives `<select>` mit
  // value/onchange (kein `bind:value`, TST-12) + eigenem "Hinzufügen"-Button.
  //
  // Von PersonDetail.svelte UND FamilyDetail.svelte genutzt (INV-UI-4) — EIN Mechanismus
  // statt je einer eigenen Popover-Implementierung.
  //
  // Das Panel hängt per `use:anchoredTo` am <body>, nicht im eigenen Teilbaum (BL-85):
  // `.person-detail` ist ein Scroll-Container (`overflow: auto`) und schnitt das Menü an
  // seiner Unterkante ab — gemessen: Container endete bei y=523, das Menü reichte bis
  // 630, die unteren Einträge waren nicht anklickbar. Ein höherer z-index hilft dagegen
  // nicht (ADR-v9-97); nur das Verlassen des Vorfahren.
  import { untrack } from 'svelte';
  import { portal, anchoredTo } from './portal';

  export interface EventMenuItem {
    tag: string;
    label: string;
  }

  interface Props {
    /** Trigger-Button-Text, Spec-Vorgabe: "+ Ereignis". */
    triggerLabel?: string;
    /** Gruppen von Items, mit optischem Trenner zwischen Gruppen (z. B. Person:
     *  [Taufe/Beruf/Bestattung], [Ereignis/Eigentum/Auswanderung/Abschluss/Ausbildung]). */
    groups: EventMenuItem[][];
    /** Optionaler Fallback für "beliebiger anderer Typ" (natives `<select>` + Button) —
     *  weglassen, wenn nicht gebraucht (z. B. FamilyDetail's schlankeres Menü). */
    otherItems?: EventMenuItem[];
    otherLabel?: string;
    onSelect: (tag: string) => void;
    /** Sonder-Eintrag ganz oben (BL-212: „⧉ Übernehmen") — KEIN Ereignistyp, deshalb ein
     *  eigener Callback statt eines Pseudo-Tags in `groups`: er legt kein leeres Ereignis
     *  eines Typs an, sondern fügt ein vollständiges kopiertes ein. Weglassen = kein
     *  Eintrag (FamilyDetail und Tests bleiben unverändert). */
    pasteItem?: { label: string; onSelect: () => void };
  }
  const {
    triggerLabel = '+ Ereignis',
    groups,
    otherItems = [],
    otherLabel = 'Anderer Ereignistyp',
    onSelect,
    pasteItem,
  }: Props = $props();

  let open = $state(false);
  /** Bezugspunkt der Platzierung — das Panel kennt seinen Trigger nach dem Portal nicht
   *  mehr über den DOM-Baum, deshalb als Referenz. */
  let triggerEl = $state<HTMLElement | undefined>(undefined);
  // TST-10-Muster: nur der Mount-Anfangswert zählt — der Aufrufer übergibt `otherItems`
  // im Normalfall unveränderlich (statische Liste), kein fortlaufendes Re-Sync nötig.
  let otherTag = $state(untrack(() => otherItems[0]?.tag ?? ''));

  function toggle() {
    open = !open;
  }

  function close() {
    open = false;
  }

  function pick(tag: string) {
    onSelect(tag);
    close();
  }

  function pickOther() {
    if (otherTag) pick(otherTag);
  }
</script>

<div class="stb-event-menu">
  <button
    type="button"
    class="stb-activation-pill"
    aria-expanded={open}
    onclick={toggle}
    bind:this={triggerEl}
  >{triggerLabel}</button>
  {#if open}
    <button type="button" class="stb-event-menu__backdrop" aria-label="Menü schließen" onclick={close} use:portal></button>
    <div class="stb-event-menu__panel" role="menu" aria-label={triggerLabel} use:anchoredTo={triggerEl}>
      {#if pasteItem}
        <button
          type="button"
          class="stb-event-menu__item stb-event-menu__item--paste"
          role="menuitem"
          onclick={() => { close(); pasteItem.onSelect(); }}
        >
          {pasteItem.label}
        </button>
        <div class="stb-event-menu__divider"></div>
      {/if}
      {#each groups as group, gi (gi)}
        {#if gi > 0 && group.length > 0}<div class="stb-event-menu__divider"></div>{/if}
        {#each group as item (item.tag)}
          <button type="button" class="stb-event-menu__item" role="menuitem" onclick={() => pick(item.tag)}>
            {item.label}
          </button>
        {/each}
      {/each}
      {#if otherItems.length > 0}
        <div class="stb-event-menu__divider"></div>
        <div class="stb-event-menu__other">
          <select
            aria-label={otherLabel}
            value={otherTag}
            onchange={(e) => (otherTag = (e.currentTarget as HTMLSelectElement).value)}
          >
            {#each otherItems as item (item.tag)}
              <option value={item.tag}>{item.label}</option>
            {/each}
          </select>
          <button type="button" onclick={pickOther}>Hinzufügen</button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .stb-event-menu {
    position: relative;
    display: inline-flex;
  }

  .stb-event-menu__backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    border: none;
    padding: 0;
    cursor: default;
    /* Geteilte Ebenen-Skala (ADR-v9-97). Erst nach dem Portalieren wirkt sie überhaupt —
       vorher wurde sie im Stacking-Context des Vorfahren aufgelöst. */
    z-index: calc(var(--stb-z-modal) - 1);
  }

  /* Position kommt aus `anchoredTo` (ui/shell/portal.ts) als Viewport-Koordinaten: nach
     dem Umhängen an den <body> gibt es keinen positionierten Vorfahren mehr, auf den
     sich `absolute` beziehen könnte. */
  .stb-event-menu__panel {
    position: fixed;
    top: var(--stb-anchor-top, 0);
    left: var(--stb-anchor-left, 0);
    z-index: var(--stb-z-modal);
    /* Eine Liste, die höher wird als der Viewport, scrollt selbst — sonst bliebe ihr
       Ende auch nach dem Portal unerreichbar, nur an anderer Stelle. */
    max-height: 70vh;
    overflow-y: auto;
    min-width: 12rem;
    max-width: min(90vw, 18rem);
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
    padding: 0.35rem;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
  }

  .stb-event-menu__item {
    display: block;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    color: var(--stb-text);
    cursor: pointer;
    font: inherit;
    padding: 0.35rem 0.5rem;
    border-radius: var(--stb-radius-control);
  }

  /* Sonder-Eintrag „⧉ Übernehmen" (BL-212) — MUSS nach `.stb-event-menu__item` stehen:
     gleiche Spezifität, es gewinnt die spätere Regel. Vorher stand sie davor und war
     wirkungslos, die Hervorhebung existierte nur im Quelltext (Design-Kritik 2026-07-31). */
  .stb-event-menu__item--paste {
    color: var(--stb-gold-light);
  }

  .stb-event-menu__item:hover,
  .stb-event-menu__item:focus-visible {
    background: var(--stb-surface-2);
  }

  .stb-event-menu__divider {
    border-top: 1px dashed var(--stb-gold-dim);
    margin: 0.3rem 0;
  }

  .stb-event-menu__other {
    display: flex;
    gap: 0.35rem;
    padding: 0.2rem 0.3rem;
    align-items: center;
  }

  .stb-event-menu__other select {
    flex: 1;
    min-width: 0;
  }

  .stb-event-menu__other button {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    font-size: 0.78rem;
    white-space: nowrap;
  }
</style>
