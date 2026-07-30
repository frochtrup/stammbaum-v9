<script lang="ts">
  // ui/views/place/PlaceMergeSection.svelte — der „Dubletten-Merge" des Ort-Steckbriefs
  // (Spec 20 §1.7 [K] „Dubletten-Merge, verlustfrei"). Aus PlaceDetail extrahiert, damit
  // diese Datei unter dem regulären max-lines-Limit (600) bleibt.
  //
  // Der aktuell gezeigte Ort (die Dublette) wird IN den gewählten Ziel-Ort (Überlebenden)
  // gefaltet. `appState.mergePlace` ist der EINE Chokepoint (INV-ARCH-1) — keine Merge-
  // Logik hier. Selbst-Merge ausgeschlossen; danach Navigation zum Überlebenden.
  //
  // Der Aufrufer rendert diese Sektion nur im Bearbeiten-Modus (`{#if editing}`, ADR-v9-30:
  // kein mutierendes Control außerhalb des Bearbeiten-Modus).
  import type { PlacesHost, PlacesNav } from '../../shell/places-host';
  import type { PlaceObject } from '../../../core/places/types';
  import { placeDisplayName } from '../../../core/places';
  import Picker from '../../shell/Picker.svelte';

  interface Props {
    appState: PlacesHost;
    viewState: PlacesNav;
    place: PlaceObject;
    placeId: string;
  }
  const { appState, viewState, place, placeId }: Props = $props();

  let targetId = $state('');
  let error = $state('');

  const others = $derived(
    Array.from(appState.db.placeObjects.values()).filter((p) => p.id !== place.id),
  );
  const label = (p: PlaceObject) => placeDisplayName(p);
  const matches = (p: PlaceObject, query: string) =>
    label(p).toLowerCase().includes(query.trim().toLowerCase());

  function merge() {
    if (!targetId || targetId === placeId) {
      error = 'Bitte einen anderen Ziel-Ort wählen.';
      return;
    }
    appState.mergePlace(targetId, placeId);
    viewState.setCurrent('place', targetId);
    targetId = '';
    error = '';
  }
</script>

<section class="merge">
  <h3>Dubletten-Merge</h3>
  <p class="merge__muted">
    Diesen Ort verlustfrei in einen anderen Ort zusammenführen — Titel und Namensvarianten
    von „{place.title || place.id}" erscheinen danach als Herkunfts-Pillen beim Ziel-Ort.
  </p>
  {#if others.length === 0}
    <p class="merge__muted">Kein weiterer Ort vorhanden, um damit zusammenzuführen.</p>
  {:else}
    <div class="merge__add-row">
      <!-- Kein „+ neu anlegen"-Slot — bewusste EINZIGE Ausnahme (ADR-v9-42): ein frisch
           angelegter leerer Ort als Merge-Ziel ist bedeutungslos. -->
      <Picker
        items={others}
        getId={(p) => p.id}
        getLabel={label}
        getSubLabel={(p) => p.id}
        {matches}
        value={targetId || null}
        onChange={(id) => (targetId = id ?? '')}
        label="Ziel-Ort für Merge"
        placeholder="Ziel-Ort wählen…"
      />
      <button type="button" class="merge__btn" onclick={merge} disabled={!targetId}>
        In Ziel-Ort zusammenführen
      </button>
    </div>
    {#if error}<p class="merge__error">{error}</p>{/if}
  {/if}
</section>

<style>
  .merge {
    margin-top: 1.25rem;
  }

  .merge h3 {
    font-size: 0.95rem;
    color: var(--stb-gold-light);
    margin-bottom: 0.4rem;
  }

  .merge__muted {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .merge__add-row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }

  .merge__btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }

  .merge__btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .merge__error {
    color: var(--stb-danger);
    font-size: 0.82rem;
    margin-top: 0.3rem;
  }
</style>
