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
  <!-- BESCHRIFTET, nicht nur Glyph (ADR-v9-155). `↶`/`↷` sind nicht selbsterklärend, und
       ihre einzige Erklärung hing am `use:tooltip` — der auf Touch nicht existiert
       (`.stb-tooltip` ist ohne Hover unsichtbar), während iPhone/iPad die Primärplattform
       ist. Dieselbe Lehre wie ADR-v9-150 Punkt (c) an der Mini-Karte, hier auf die
       Geschwister-Stelle gezogen. §6j(b) erlaubt icon-only ausdrücklich nur für SEKUNDÄRE
       Aktionen; Rückgängig ist eine Kernaktion (Spec 20 §1.2). Der Tooltip erklärt jetzt
       nur noch das Tastenkürzel — Zusatz, nicht Träger der Bedeutung.
       ERSCHEINEN NUR, WENN SIE ETWAS KÖNNEN: ein dauerhaft ausgegrauter Knopf war der
       blasse Zustand aus der Design-Kritik, und die Beschriftung passt nur deshalb ins
       Breitenbudget — „Zum geladenen Stand" unten erscheint komplementär bei `!canUndo`,
       die beiden konkurrieren also nie um dieselbe Zeile (gemessen 375px: beschriftet
       118px gegen 230px Budget; mit dauerhaften Knöpfen wären es 230px am Anschlag
       gewesen, was „Zum geladenen Stand" von 138 auf 106px gestaucht hätte). -->
  {#if appState.canUndo}
    <button
      type="button"
      class="undo-controls__btn"
      onclick={onUndo}
      use:tooltip={'Tastenkürzel: ⌘Z'}
    >
      <span aria-hidden="true">↶</span> Zurück
    </button>
  {/if}
  {#if appState.canRedo}
    <button
      type="button"
      class="undo-controls__btn"
      onclick={onRedo}
      use:tooltip={'Tastenkürzel: ⇧⌘Z'}
    >
      <span aria-hidden="true">↷</span> Vor
    </button>
  {/if}

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
    /* Damit die Notice wirklich bis zur Ellipse nachgeben kann: ein Flex-Item schrumpft
       ohne `min-width: 0` nicht unter seine min-content-Breite — der Rest landete sonst
       als horizontaler Überlauf im Header (gemessen 375px: scrollWidth 380 > 375). */
    min-width: 0;
  }

  .undo-controls__btn {
    background: transparent;
    color: var(--stb-gold);
    /* `--stb-gold-dim`, NICHT `--stb-border`: den Token gab es nie (nirgends definiert,
       nur hier benutzt) — der Rahmen fiel still auf `currentColor` zurück und war
       deshalb goldfarben statt Rahmenfarbe. ADR-v9-155. */
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    /* Trefferfläche: §6i verlangt 44×44 CSS-px für Touch-Ziele. Vorher 2.2rem/35×27px —
       die kleinsten interaktiven Flächen der App. `min-height` gehört dazu: die Breite
       allein trägt die Beschriftung ohnehin, die HÖHE war der eigentliche Verstoß. */
    min-width: var(--stb-touch-target);
    min-height: var(--stb-touch-target);
    /* Eine Trefferfläche wird NIE von einem Statustext weggedrückt (§6i): ohne dies
       staucht die 2,5-s-Notice die Knöpfe unter das Maß, das eine Zeile darüber gerade
       erst gesetzt wurde. Gemessen 375px: mit Notice lief die Leiste auf 230px Anschlag,
       ohne auf 206px. Gekürzt wird der Text, nicht der Knopf. */
    flex-shrink: 0;
    padding: 0.35rem 0.6rem;
    font-size: 0.9rem;
    line-height: 1;
    cursor: pointer;
  }

  .undo-controls__revert {
    background: transparent;
    color: var(--stb-text-dim);
    min-height: var(--stb-touch-target);
    flex-shrink: 0;
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.6rem;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .undo-controls__notice {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
    font-style: italic;
    /* Gibt als einziges Element nach, wenn die Zeile eng wird (s. `flex-shrink: 0` oben). */
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
