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
  <button type="button" class="delete-entity__btn" onclick={handleClick}>{label}</button>
</section>

<style>
  .delete-entity {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--stb-surface-2);
  }

  .delete-entity__btn {
    background: transparent;
    color: var(--stb-danger);
    border: 1px solid var(--stb-danger);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    cursor: pointer;
  }
</style>
