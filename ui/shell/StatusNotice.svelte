<script lang="ts">
  // ui/shell/StatusNotice.svelte — die Statuszeile der Schale: EIN Text, ein
  // Gültigkeitszeitraum, ein Sofort-Weg (BL-333).
  //
  // WARUM ALS EIGENE KOMPONENTE. Bis hierher war die Zeile drei Zeilen Markup in
  // `App.svelte` und hatte keinen Gültigkeitszeitraum: sie blieb stehen, bis eine ANDERE
  // Meldung denselben Kanal überschrieb. Bei einer Meldung, die nach JEDEM Laden erscheint
  // („N Ereignisse unverändert gelassen"), heißt das „für immer" — der Nutzer-Befund, der
  // diese Datei ausgelöst hat. Text, Frist und Schließen gehören zusammen; getrennt
  // gehalten wären es drei Stellen, an denen die nächste Meldung die Frist vergisst.
  //
  // Die Frist gilt der ANZEIGE, nicht der Sache: was Handlungsbedarf ist, steht als Befund
  // im Qualitäts-Dashboard und verschwindet dort nicht mit einem Timer (ADR-v9-247).
  interface Props {
    /** Leerer Text = keine Zeile. */
    text: string;
    /** Ruft der Timer ODER das ✕ — der Aufrufer leert seinen Kanal. */
    onDismiss: () => void;
    /** 12 s statt der 2,5 s aus `UndoControls`: dort ein Wort, hier zwei Sätze mit Zahlen. */
    dauerMs?: number;
  }
  const { text, onDismiss, dauerMs = 12_000 }: Props = $props();

  // Neuer Text → neue Frist; leerer Text → gar keine. Die Aufräum-Funktion des Effekts
  // löscht den alten Timer, bevor der nächste startet — ohne sie überlebte die Frist der
  // vorigen Meldung ihren Text und löschte die neue zu früh.
  $effect(() => {
    if (!text) return;
    const timer = setTimeout(onDismiss, dauerMs);
    return () => clearTimeout(timer);
  });
</script>

{#if text}
  <p class="status-notice" role="status">
    <span class="status-notice__text">{text}</span>
    <button
      type="button"
      class="stb-icon-btn status-notice__close"
      onclick={onDismiss}
      aria-label="Hinweis schließen">✕</button
    >
  </p>
{/if}

<style>
  .status-notice {
    margin: 0;
    padding: 0.4rem 1rem;
    color: var(--stb-text-dim);
    font-size: 0.85rem;
    font-style: italic;
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .status-notice__text {
    flex: 1 1 auto;
    min-width: 0;
  }

  /* Optik und Trefferzone kommen aus `.stb-icon-btn` (INV-UI-4, BL-299) — hier bleibt nur,
     was die kursive Zeile am Zeichen selbst korrigiert. */
  .status-notice__close {
    font-style: normal;
  }
</style>
