<script lang="ts">
  // ui/shell/DeleteEntityButton.svelte — geteilte „Danger-Zone" für das referenz-auflösende
  // Löschen einer Detail-Entität (Person/Familie/Quelle/Archiv, Spec 20 §2). EIN Mechanismus
  // statt pro View neu erfunden (INV-UI-4): destruktiver Button unten im Detail-Body. Der
  // Aufrufer liefert Beschriftung, Warntext und die eigentliche Lösch-/Navigations-Aktion.
  //
  // Die Rückfrage kommt seit BL-351 aus `ConfirmDialog` statt aus `window.confirm`. Hier
  // stand der Satz „kein eigenes Dialog-Muster im Projekt — Vereinfachen vor Erfinden";
  // er stimmte, bis gemessen war, was die Vereinfachung kostet: in der Vorschau-Fläche
  // liefert `confirm()` sofort `false`, der Knopf war dort wirkungslos.
  import ConfirmDialog from './ConfirmDialog.svelte';

  interface Props {
    /** Button-Beschriftung, z. B. "Person löschen". */
    label: string;
    /** Warntext der Rückfrage — benennt die Referenz-Folge. */
    message: string;
    /** Wird nur bei bestätigter Rückfrage aufgerufen (Kommando + Zurück-Navigation). */
    onConfirm: () => void;
  }
  const { label, message, onConfirm }: Props = $props();

  let fragt = $state(false);
</script>

<section class="delete-entity">
  <button type="button" class="stb-btn" data-variant="danger" onclick={() => (fragt = true)}>{label}</button>
</section>

{#if fragt}
  <ConfirmDialog
    titel={`${label}?`}
    text={message}
    bestaetigen="Löschen"
    onConfirm={() => {
      fragt = false;
      onConfirm();
    }}
    onCancel={() => (fragt = false)}
  />
{/if}

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
