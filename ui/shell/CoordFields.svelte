<script lang="ts">
  // Geteilte Koordinaten-Eingabe für Orte UND Höfe (INV-UI-4: ein Mechanismus, nicht pro
  // View neu erfunden). Kernwunsch (Spec 20 §1.7): ein Feld nimmt eine komplette eingefügte
  // Apple-Maps-Koordinate auf, die wir automatisch auf Breite/Länge zerlegen.
  //
  // Die Felder tragen Text (nicht type="number"), damit ein eingefügtes Paar wie
  // „52,22779° N, 7,17310° O" überhaupt ankommt. Zahlen entstehen erst beim Speichern in
  // der Elternansicht via resolveCoordFields(latText, longText).
  import { parseCoordPair } from '../../core/places';
  import { PLAIN_FIELD } from './plain-input';

  let { latText = $bindable(''), longText = $bindable('') }: { latText: string; longText: string } =
    $props();

  /** Wird ein komplettes Paar ins erste Feld eingefügt, zerlege es auf beide Felder. */
  function onFirstField() {
    const pair = parseCoordPair(latText);
    if (pair) {
      latText = String(pair.lat);
      longText = String(pair.long);
    }
  }
</script>

<div class="coord-fields__row">
  <label>
    Breitengrad
    <input
      type="text" {...PLAIN_FIELD}
      inputmode="decimal"
      bind:value={latText}
      onchange={onFirstField}
      placeholder="52.2073 — oder Apple-Maps-Koordinaten einfügen"
    />
  </label>
  <label>
    Längengrad
    <input type="text" {...PLAIN_FIELD} inputmode="decimal" bind:value={longText} placeholder="7.1845" />
  </label>
</div>
<p class="coord-fields__hint">
  Dezimalgrad (52.2073 / 7.1845) oder Apple-Maps-Format („52,22779° N, 7,17310° O") ins erste
  Feld einfügen — wird automatisch aufgeteilt.
</p>

<style>
  .coord-fields__row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .coord-fields__row label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .coord-fields__row input {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font: inherit;
  }

  .coord-fields__hint {
    margin: 0.3rem 0 0;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }
</style>
