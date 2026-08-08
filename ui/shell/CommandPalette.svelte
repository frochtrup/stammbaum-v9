<script lang="ts">
  // ui/shell/CommandPalette.svelte — Befehlspalette (⌘K), Desktop-Pendant zur Suche
  // (Spec 21 §3, BL-93).
  //
  // Sie führt WEDER eine eigene Ziel-Liste NOCH einen eigenen Suchkern: beides kommt aus
  // command-palette-model.ts, das seinerseits nav-model.ts (INV-UI-15) und
  // globalSearch (BL-14) zusammenführt. Diese Komponente ist reine Darstellung plus
  // Tastaturführung — die Auswahl-Arithmetik selbst liegt ebenfalls im Modell
  // (`moveSelection`), damit sie ohne Browser prüfbar ist.
  //
  // Overlay-Pflichten (INV-UI-13/LP-8, Spec 21 §6i/§6k), alle drei bewusst hier und
  // nicht im Aufrufer:
  //   - `use:portal`: verlässt jeden klippenden/stapelnden Vorfahren. Ein z-index reicht
  //     nachweislich nicht (ADR-v9-97/99).
  //   - Escape schließt, auch mit Fokus im Eingabefeld (s. shortcuts.ts `belongsToField`).
  //   - Fokus geht beim Öffnen ins Feld und beim Schließen dorthin zurück, wo er war —
  //     sonst landet er auf <body> und die Tastaturbedienung beginnt von vorn.
  import { tick } from 'svelte';
  import { PLAIN_FIELD } from './plain-input';
  import { portal } from './portal';
  import { buildCommands, moveSelection, type Command } from './command-palette-model';
  import type { Database } from '../../core/model/types';
  import type { PlaceContext } from '../../core/places';

  interface Props {
    db: Database;
    ctx: PlaceContext;
    /** Effektiver Proband für den „Zum Probanden"-Befehl (BL-120) — von App aufgelöst. */
    proband?: { id: string; label: string } | null;
    onClose: () => void;
    onRun: (cmd: Command) => void;
  }
  const { db, ctx, proband = null, onClose, onRun }: Props = $props();

  let query = $state('');
  let selected = $state(0);
  let input = $state<HTMLInputElement | undefined>();
  const commands = $derived(buildCommands(db, ctx, query, proband));

  // Die Auswahl darf nicht hinter der Liste zurückbleiben: tippt man weiter, schrumpft
  // die Liste, und ein Index von vorher zeigte sonst ins Leere (oder auf einen ganz
  // anderen Befehl als den markierten).
  $effect(() => {
    if (selected >= commands.length) selected = 0;
  });

  const previouslyFocused = typeof document !== 'undefined' ? document.activeElement : null;

  $effect(() => {
    void tick().then(() => input?.focus());
    return () => {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  });

  function run(cmd: Command | undefined) {
    if (!cmd) return;
    onRun(cmd);
    onClose();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selected = moveSelection(selected, 1, commands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selected = moveSelection(selected, -1, commands.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(commands[selected]);
    }
    // Escape NICHT hier: das Kürzel liegt zentral in shortcuts.ts und wird von der
    // Schale behandelt (EIN Kürzel-Satz, kein zweiter Satz je Overlay).
  }

  /** Trägt dieser Befehl die erste Zeile seiner Gruppe? Dann bekommt er die Überschrift. */
  function startsGroup(index: number): boolean {
    return index === 0 || commands[index - 1].group !== commands[index].group;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="cmdp__backdrop" use:portal onclick={onClose}></div>

<div class="cmdp" use:portal role="dialog" aria-modal="true" aria-label="Befehlspalette">
  <input
    bind:this={input}
    class="cmdp__input"
    type="text" {...PLAIN_FIELD}
    placeholder="Springen oder suchen …"
    aria-label="Befehl oder Suchbegriff"
    bind:value={query}
    onkeydown={onKeydown}
  />

  {#if commands.length === 0}
    <p class="cmdp__empty">Keine Treffer.</p>
  {:else}
    <ul class="cmdp__list">
      {#each commands as cmd, i (cmd.kind + cmd.id)}
        {#if startsGroup(i)}
          <li class="cmdp__group" aria-hidden="true">{cmd.group}</li>
        {/if}
        <li>
          <button
            type="button"
            class="cmdp__item"
            class:cmdp__item--selected={i === selected}
            aria-current={i === selected ? 'true' : undefined}
            onclick={() => run(cmd)}
            onmouseenter={() => (selected = i)}
          >
            <span class="cmdp__primary">{cmd.primary}</span>
            {#if cmd.secondary}
              <span class="cmdp__secondary">{cmd.secondary}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .cmdp__backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: var(--stb-z-modal);
  }

  .cmdp {
    position: fixed;
    top: 12vh;
    left: 50%;
    transform: translateX(-50%);
    width: min(92vw, 34rem);
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
    z-index: var(--stb-z-modal);
    overflow: hidden;
  }

  .cmdp__input {
    margin: 0;
    border: none;
    border-bottom: 1px solid var(--stb-surface-3);
    border-radius: 0;
    padding: 0.7rem 0.9rem;
    font-size: 0.95rem;
    background: transparent;
    color: var(--stb-text);
  }

  .cmdp__input:focus {
    outline: none;
  }

  .cmdp__list {
    list-style: none;
    margin: 0;
    padding: 0.3rem;
    overflow-y: auto;
  }

  .cmdp__group {
    padding: 0.4rem 0.6rem 0.2rem;
    font-size: 0.66rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--stb-text-muted);
  }

  .cmdp__item {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    width: 100%;
    padding: 0.35rem 0.6rem;
    background: transparent;
    border: none;
    border-radius: var(--stb-radius-control);
    color: var(--stb-text);
    font: inherit;
    font-size: 0.88rem;
    text-align: left;
    cursor: pointer;
  }

  /* Auswahl nie nur über Farbe (LP-8): Fläche + Goldton + fetter Haupttext. */
  .cmdp__item--selected {
    background: var(--stb-surface-3);
    color: var(--stb-gold-light);
  }

  .cmdp__item--selected .cmdp__primary {
    font-weight: 700;
  }

  .cmdp__secondary {
    color: var(--stb-text-dim);
    font-size: 0.78rem;
    margin-left: auto;
    text-align: right;
  }

  .cmdp__empty {
    margin: 0;
    padding: 0.9rem;
    color: var(--stb-text-dim);
    font-style: italic;
  }
</style>
