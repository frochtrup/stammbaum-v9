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
  <div class="undo-controls__row">
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
         gewesen, was „Zum geladenen Stand" von 138 auf 106px gestaucht hätte).

         WORTWAHL „Rückgängig"/„Wiederholen" statt vormals „Zurück"/„Vor" (BL-07): seit die
         Navigation ihren herkunftsbewussten „← Zurück"-Knopf hat (ADR-v9-177), standen auf
         dem Personen-Steckbrief ZWEI Knöpfe mit derselben Beschriftung und verschiedener
         Wirkung — Daten zurücknehmen gegen Ansicht zurück. Dieselbe Sorte Namenskollision,
         die ADR-v9-122 zwischen Nav-Slot und Segment aufgelöst hat. Das Handbuch schrieb
         ohnehin schon „Rückgängig"; die UI zog jetzt nach. „Wiederholen" statt
         „Wiederherstellen" ist zweifach begründet: gemessen 206px gegen 228px im 230er
         Budget, und „wiederherstellen" ist genau das, was der Nachbarknopf „Zum geladenen
         Stand" tut — ein zweites Wort für zwei Dinge wäre die Kollision von vorn. -->
    {#if appState.canUndo}
      <button
        type="button"
        class="undo-controls__btn"
        onclick={onUndo}
        use:tooltip={'Tastenkürzel: ⌘Z'}
      >
        <span aria-hidden="true">↶</span> Rückgängig
      </button>
    {/if}
    {#if appState.canRedo}
      <button
        type="button"
        class="undo-controls__btn"
        onclick={onRedo}
        use:tooltip={'Tastenkürzel: ⇧⌘Z'}
      >
        <span aria-hidden="true">↷</span> Wiederholen
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
  </div>

  <!-- Die Meldung steht UNTER der Knopfzeile, nicht daneben (Nutzer-Entscheidung
       2026-07-30, ADR-v9-155 Nachtrag). Daneben musste sie sich den Platz mit den
       Bedienelementen teilen und wurde nach der Trefferflächen-Regel („eine
       Trefferfläche gibt nie nach") auf 18px zusammengeschoben — also unsichtbar,
       obwohl sie eine Rückmeldung ist. Unter der Zeile bekommt sie die volle Breite
       (gemessen: 118px Textbreite gegen 206–230px Leistenbreite, passt in jedem
       Zustand ungekürzt).
       DER PLATZ ENTSTEHT NUR, SOLANGE SIE DA IST: die Zeile wird gar nicht erst
       gerendert, wenn `notice` leer ist — kein reservierter Leerraum, der die Topbar
       dauerhaft höher machte. Nach den 2,5s fällt der Kopf exakt in den vorherigen
       Zustand zurück. -->
  {#if notice}
    <span class="undo-controls__notice" role="status">{notice}</span>
  {/if}
</div>

<style>
  /* Zwei Zeilen: Bedienelemente oben, Meldung darunter. `flex-end` hält beide rechts
     bündig — der Kopf ist `space-between`, die Leiste sitzt an der rechten Kante. */
  .undo-controls {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.15rem;
    /* Ein Flex-Item schrumpft ohne `min-width: 0` nicht unter seine min-content-Breite —
       ohne das wurde der Rest zu horizontalem Überlauf im Kopf (gemessen 375px:
       scrollWidth 380 > 375). Bleibt als Sicherheitsnetz, auch wenn die Meldung jetzt
       eine eigene Zeile hat. */
    min-width: 0;
  }

  .undo-controls__row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
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
    /* Eigene Zeile: die volle Leistenbreite steht zur Verfügung. Ellipse bleibt als
       Sicherheitsnetz für eine künftig längere Meldung — sie soll die Leiste nicht
       verbreitern und damit den Titel verdrängen, aber im Normalfall greift sie nicht. */
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
