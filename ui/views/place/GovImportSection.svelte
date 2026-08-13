<script lang="ts">
  // ui/views/place/GovImportSection.svelte — GOV-Import im Ort-Bearbeiten-Modus
  // (BL-131, Spec 20 §1.7 [S]; v8-Orakel `applyGovText`, ui-views-place.js:434).
  //
  // Nur im Bearbeiten-Modus sichtbar — wie `PlaceMergeSection` daneben: ein
  // Kurations-Werkzeug, kein Dauer-Inhalt der Lesefläche (ADR-v9-30, „kein ungegatetes
  // Mutations-Control").
  //
  // Committet SOFORT (nicht über den „Speichern"-Knopf der Grunddaten): der Import
  // berührt mehr als das bearbeitete Objekt — er legt für unbekannte Elternorte
  // Platzhalter-PlaceObjects an. Dasselbe Timing wie Add/Remove bei Adressvarianten
  // (ADR-v9-81) und wie `PlaceMergeSection`. Rückgängig über den regulären Undo-Stack.
  import type { PlacesHost } from '../../shell/places-host';
  import { PROSE_FIELD } from '../../shell/plain-input';
  import StatusNotice from '../../shell/StatusNotice.svelte';

  interface Props {
    appState: PlacesHost;
    placeId: string;
  }
  const { appState, placeId }: Props = $props();

  let open = $state(false);
  let text = $state('');
  let notice = $state('');

  /** Beispiel-Zusammenfassung als Platzhalter — als Konstante, weil ein mehrzeiliges
   *  String-Literal direkt im Attribut die `no-useless-mustaches`-Lint-Regel auslöst. */
  const PLACEHOLDER = [
    'object_162795',
    'heißt (auf deu) Ochtrup',
    'ist ab 1969-07-01 (auf deu) Stadt',
    'gehört ab 1969-07-01 zu object_190334',
  ].join('\n');

  function apply(): void {
    const result = appState.importGovEntry(placeId, text);
    if (!result) {
      notice = 'Keine GOV-Kennung erkannt — bitte die vollständige Textzusammenfassung einfügen (erste Zeile = Kennung).';
      return;
    }
    if (result.changes === 0) {
      notice = 'Nichts zu ergänzen — dieser Ort trägt die Angaben bereits.';
      return;
    }
    notice = `Übernommen: ${result.notes.join(' · ')}.`;
    text = '';
  }
</script>

<section class="gov-import">
  <h3 class="stb-section-title">GOV-Eintrag übernehmen</h3>
  <button type="button" class="gov-import__toggle" aria-expanded={open} onclick={() => (open = !open)}>
    {open ? 'GOV-Import schließen' : 'GOV-Import öffnen'}
  </button>

  {#if open}
    <p class="gov-import__hint">
      Auf <span class="gov-import__code">gov.genealogy.net</span> den Ort aufrufen, die Textzusammenfassung
      kopieren und hier einfügen. Übernommen werden Kennung, Namen (deutsche als Namensvariante,
      fremdsprachige als Übersetzung), Typ-Historie und die datierte Verwaltungszugehörigkeit.
      Bereits gepflegte Angaben bleiben unverändert.
    </p>
    <textarea {...PROSE_FIELD}
      class="gov-import__text"
      rows="6"
      bind:value={text}
      aria-label="GOV-Textzusammenfassung einfügen"
      placeholder={PLACEHOLDER}
    ></textarea>
    <button type="button" class="gov-import__apply" disabled={!text.trim()} onclick={apply}>Übernehmen</button>
    <StatusNotice text={notice} onDismiss={() => (notice = '')} lage="block" />
  {/if}
</section>

<style>
  .gov-import {
    margin: 1rem 0;
  }

  .gov-import__toggle,
  .gov-import__apply {
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    color: var(--stb-gold-light);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .gov-import__apply:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .gov-import__hint {
    margin: 0.5rem 0;
    color: var(--stb-text-dim);
    font-size: 0.8rem;
  }

  .gov-import__code {
    font-family: ui-monospace, monospace;
    color: var(--stb-text);
  }

  .gov-import__text {
    display: block;
    width: 100%;
    margin-bottom: 0.4rem;
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    color: var(--stb-text);
    font: inherit;
    font-size: 0.8rem;
    padding: 0.4rem;
  }

  /* Das Ergebnis der Übernahme kommt aus `StatusNotice` (BL-334) — auch der Fall
     „Keine GOV-Kennung erkannt": das ist die Antwort auf einen Klick, nicht die
     Gültigkeit eines Feldes, und der Text bleibt so lange stehen wie jede andere. */
</style>
