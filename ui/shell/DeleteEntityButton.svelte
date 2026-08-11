<script lang="ts">
  // ui/shell/DeleteEntityButton.svelte — geteilte „Danger-Zone" für das referenz-auflösende
  // Löschen einer Detail-Entität (Person/Familie/Quelle/Archiv, Spec 20 §2). EIN Mechanismus
  // statt pro View neu erfunden (INV-UI-4): destruktiver Button unten im Detail-Body, mit
  // nativem `confirm()` (kein eigenes Dialog-Muster im Projekt — Vereinfachen-vor-Erfinden,
  // wie „Ort löschen" in PlaceDetail.svelte). Der Aufrufer liefert Beschriftung, Warntext und
  // die eigentliche Lösch-/Navigations-Aktion.
  interface Props {
    /** Button-Beschriftung, z. B. "Person löschen". */
    label: string;
    /** Warntext für `window.confirm` — benennt die Referenz-Folge. */
    message: string;
    /** Wird nur bei bestätigtem `confirm()` aufgerufen (Kommando + Zurück-Navigation). */
    onConfirm: () => void;
  }
  const { label, message, onConfirm }: Props = $props();

  function handleClick() {
    if (window.confirm(message)) onConfirm();
  }
</script>

<section class="delete-entity">
  <button type="button" class="stb-btn" data-variant="danger" onclick={handleClick}>{label}</button>
</section>

<style>
  .delete-entity {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--stb-surface-2);
  }

  /* KEIN eigener Knopf-Stil mehr (BL-347). Hier stand eine vierte, lokale
     Knopf-Implementierung: transparent + Danger-Farbe + Rahmen + Radius — also genau das,
     was `.stb-btn[data-variant='danger']` seit BL-273 liefert. Der Kommentar an jener
     Variante lud ausdrücklich dazu ein, sie zu übernehmen, „sobald es ohnehin angefasst
     wird"; beim Nachmessen der Schriftgrößen war das der Fall.

     GEMESSEN, was sich dabei ändert: der Knopf war 108×29px und als einziger beschriftete
     Knopf nicht an die Primitive gebunden — nach dem Wechsel 36px hoch wie jeder andere.
     Dass er trotzdem nicht wie die Primäraktion aussieht, leistet die Outline-Variante
     (Rahmen statt Füllung), nicht seine geringere Höhe. */
</style>
