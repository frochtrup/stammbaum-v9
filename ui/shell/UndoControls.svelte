<script lang="ts">
  // ui/shell/UndoControls.svelte — Rückgängig/Wiederherstellen (BL-01, Spec 20 §1.2).
  //
  // Die Tastenkürzel (⌘Z/⇧⌘Z) hängen NICHT hier, sondern an der Schale (App.svelte,
  // `<svelte:window onkeydown>` über ui/shell/shortcuts.ts): sie sollen unabhängig davon
  // greifen, ob diese Leiste gerade sichtbar ist oder den Fokus hat.
  //
  // „Zum geladenen Stand zurück" (Revert to Saved, Spec 20 §1.2) erscheint als Fallback
  // NUR, wenn nichts mehr rücknehmbar ist — es ist die grobe Notbremse, nicht die
  // alltägliche Aktion, und stünde daneben ständig als Fehlklick-Risiko im Weg.
  import { tooltip } from './tooltip';
  import type { AppState } from './app-state.svelte';

  interface Props {
    appState: AppState;
  }
  const { appState }: Props = $props();

  /** Kurzer Hinweis nach einer Aktion — bestätigt, DASS etwas passiert ist. Ohne ihn
   *  wirkt ein Undo, dessen Wirkung gerade nicht im Blick liegt (z. B. eine Änderung in
   *  einer anderen Ansicht), wie ein wirkungsloser Klick. */
  let notice = $state('');

  function say(text: string) {
    notice = text;
    setTimeout(() => (notice = ''), 2500);
  }

  function onUndo() {
    if (appState.undo()) say('Rückgängig gemacht.');
  }
  function onRedo() {
    if (appState.redo()) say('Wiederhergestellt.');
  }
  function onRevert() {
    if (appState.revertToSaved()) say('Auf den geladenen Stand zurückgesetzt.');
  }
</script>

<div class="undo-controls">
  <!-- Die Aktion sitzt am bedeutungstragenden Element selbst, der Tooltip erklärt nur das
       Kürzel (INV-UI-12: kein „Tu X →"-Text). -->
  <button
    type="button"
    class="undo-controls__btn"
    onclick={onUndo}
    disabled={!appState.canUndo}
    aria-label="Rückgängig"
    use:tooltip={'Rückgängig (⌘Z)'}
  >
    ↶
  </button>
  <button
    type="button"
    class="undo-controls__btn"
    onclick={onRedo}
    disabled={!appState.canRedo}
    aria-label="Wiederherstellen"
    use:tooltip={'Wiederherstellen (⇧⌘Z)'}
  >
    ↷
  </button>

  {#if !appState.canUndo && appState.fileName}
    <button
      type="button"
      class="undo-controls__revert"
      onclick={onRevert}
      use:tooltip={'Verwirft alle Änderungen seit dem Laden'}
    >
      Zum geladenen Stand
    </button>
  {/if}

  {#if notice}
    <span class="undo-controls__notice" role="status">{notice}</span>
  {/if}
</div>

<style>
  .undo-controls {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .undo-controls__btn {
    background: transparent;
    color: var(--stb-gold);
    border: 1px solid var(--stb-border);
    border-radius: var(--stb-radius-control);
    /* Feste Breite: sonst springt die Leiste, sobald sich der Zustand ändert. */
    min-width: 2.2rem;
    padding: 0.35rem 0.5rem;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
  }

  .undo-controls__btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .undo-controls__revert {
    background: transparent;
    color: var(--stb-text-dim);
    border: 1px solid var(--stb-border);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.6rem;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .undo-controls__notice {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
    font-style: italic;
  }
</style>
