<script lang="ts">
  // ui/shell/TypeSelect.svelte — EIN Auswahlfeld für kuratierte Typ-Vokabulare mit
  // deutschen Labels (BL-203, INV-UI-4). Genutzt vom Archiv-Editor (`Repository.type`,
  // `REPO_TYPE_OPTIONS`) und vom Ort-Editor (`PlaceObject.type`, `PLACE_TYPE_OPTIONS`).
  //
  // Warum ein <select> und nicht die Preset+Freitext-`<datalist>`-Mechanik (Aufgaben-
  // Kategorien, Assoziations-Rollen): dort ist der getippte Text ZUGLEICH der gespeicherte
  // Wert. Hier nicht — gespeichert wird der englische GRAMPS-Enum-Wert (`Library`),
  // angezeigt das deutsche Label („Bibliothek"). Eine `<datalist>` bietet keine Rückabbildung
  // Anzeige→Wert; der Nutzer schriebe „Bibliothek" in `<type>` und bräche die Interop.
  // Derselbe Grund, aus dem Geschlecht/Status/Konfidenz bereits <select> sind.
  //
  // `value`+`onchange` statt `bind:value` ist Pflicht (TST-12, ESLint `no-restricted-syntax`):
  // <select bind:value> ist unter happy-dom nicht zuverlässig testbar.
  interface Props {
    /** Der ROHE gespeicherte Wert (GRAMPS-Enum oder Custom-String), nicht das Label. */
    value: string;
    /** Kuratiertes Vokabular, inkl. des leeren Zustands als erstem Eintrag. */
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
    /** Zugängliche Beschriftung (die sichtbare Caption stellt der Aufrufer). */
    label: string;
  }
  const { value, options, onChange, label }: Props = $props();

  // Ein Bestandswert außerhalb des kuratierten Vokabulars (GRAMPS-Custom-Typ, Altbestand,
  // Geocoder-Treffer) darf durch das bloße Öffnen des Editors nicht verschwinden — er wird
  // als zusätzliche, ausgewählte Option angehängt und roh beschriftet (keine erfundene
  // Übersetzung, gleicher Vertrag wie `repoTypeLabel`/`placeTypeLabel`).
  const freeValue = $derived(value && !options.some((o) => o.value === value) ? value : '');
</script>

<select
  class="type-select"
  aria-label={label}
  {value}
  onchange={(e) => onChange(e.currentTarget.value)}
>
  {#each options as opt (opt.value)}
    <option value={opt.value}>{opt.label}</option>
  {/each}
  {#if freeValue}
    <option value={freeValue}>{freeValue}</option>
  {/if}
</select>

<style>
  .type-select {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font: inherit;
    width: 100%;
  }
</style>
