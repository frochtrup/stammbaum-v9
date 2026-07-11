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
  import { untrack } from 'svelte';

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
  }
  const {
    triggerLabel = '+ Ereignis',
    groups,
    otherItems = [],
    otherLabel = 'Anderer Ereignistyp',
    onSelect,
  }: Props = $props();

  let open = $state(false);
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
  <button type="button" class="stb-activation-pill" aria-expanded={open} onclick={toggle}>{triggerLabel}</button>
  {#if open}
    <button type="button" class="stb-event-menu__backdrop" aria-label="Menü schließen" onclick={close}></button>
    <div class="stb-event-menu__panel" role="menu" aria-label={triggerLabel}>
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
    z-index: 20;
  }

  .stb-event-menu__panel {
    position: absolute;
    top: calc(100% + 0.3rem);
    left: 0;
    z-index: 21;
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
