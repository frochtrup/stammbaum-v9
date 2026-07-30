<script lang="ts">
  // ui/views/place/PlaceNamesSection.svelte — Namens-Varianten eines Orts: die Zeitachse
  // (`pnames`, Spec 11 §1) und die Sprachachse (`translations`, BL-59) in EINER Sektion.
  //
  // Aus `PlaceDetail.svelte` herausgelöst, als diese die 600-Zeilen-Schwelle (BL-54)
  // überschritt. Bewusst großzügig geschnitten statt knapp getrimmt: die Sektion ist eine
  // kohäsive Einheit (zwei Achsen desselben Gegenstands, gleicher Pill-/Add-Zeilen-Bau,
  // gleiches Bearbeiten-Gating) und trägt ihren Zustand — die vier Entwurfsfelder der
  // Add-Zeilen — vollständig selbst. Die Restdatei liegt damit komfortabel unter der
  // Schwelle, nicht knapp darunter.
  //
  // Schreibt über `onSave(next)` nach oben, statt `appState` selbst anzufassen: dieselbe
  // Rolle wie `PlaceEditForm` daneben — die Sektion baut das neue PlaceObject, das
  // Kommando setzt der Steckbrief ab.
  import { tooltip } from '../../shell/tooltip';
  import type { PlaceObject } from '../../../core/places/types';
  import {
    withAddedPname,
    withRemovedPname,
    withAddedTranslation,
    withRemovedTranslation
  } from '../../../core/places';

  interface Props {
    place: PlaceObject;
    /** Datierte Namensvarianten, wie der Steckbrief sie berechnet (inkl. Titel-Fold). */
    variants: readonly { value: string; from: number | null; to: number | null }[];
    editing: boolean;
    onSave: (next: PlaceObject) => void;
  }
  const { place, variants, editing, onSave }: Props = $props();

  /** `?? []` toleriert Orte aus einer orte.json ohne das nachträglich ergänzte Feld. */
  const translations = $derived(place.translations ?? []);

  let newPnameValue = $state('');
  let newPnameFrom = $state<number | null>(null);
  let newPnameTo = $state<number | null>(null);
  let newTransLang = $state('');
  let newTransValue = $state('');

  function addPname() {
    if (!newPnameValue.trim()) return;
    onSave(withAddedPname(place, newPnameValue, newPnameFrom, newPnameTo));
    newPnameValue = '';
    newPnameFrom = null;
    newPnameTo = null;
  }

  function removePname(index: number) {
    onSave(withRemovedPname(place, index));
  }

  /** Übersetzung anhängen (Sprachachse, BL-59) — gleicher Sofort-Speichern-Pfad wie addPname. */
  function addTranslation() {
    if (!newTransValue.trim()) return;
    onSave(withAddedTranslation(place, newTransLang, newTransValue));
    newTransLang = '';
    newTransValue = '';
  }

  function removeTranslation(index: number) {
    onSave(withRemovedTranslation(place, index));
  }
</script>

{#if variants.length > 0 || translations.length > 0 || editing}
  <section class="place-detail__section">
    <h3>Namens-Varianten</h3>
    {#if variants.length > 0}
      <div class="stb-pill-row" aria-label="Namensvarianten">
        {#each variants as v, i (i)}
          <span class="stb-pill" use:tooltip={v.from || v.to ? `${v.from ?? '…'}–${v.to ?? '…'}` : undefined}>
            {v.value}
            {#if editing}
              <button type="button" class="stb-pill__remove" onclick={() => removePname(i)} aria-label={`Namensvariante „${v.value}" entfernen`}>✕</button>
            {/if}
          </span>
        {/each}
      </div>
    {/if}
    {#if editing}
      <div class="place-detail__add-row">
        <input type="text" placeholder="neue Schreibweise…" bind:value={newPnameValue} aria-label="Neue Namensvariante" />
        <input type="number" placeholder="von" bind:value={newPnameFrom} aria-label="Gültig von (Jahr)" />
        <input type="number" placeholder="bis" bind:value={newPnameTo} aria-label="Gültig bis (Jahr)" />
        <button type="button" onclick={addPname}>+ Hinzufügen</button>
      </div>
    {/if}

    <!-- Übersetzungen (Sprachachse, BL-59) — dieselbe Pill-/Add-Zeilen-Optik wie pnames
         (INV-UI-4), nur der Feld-Schnitt (Sprachkürzel + Text statt Zeitraum + Text)
         unterscheidet sich. Gleiches Bearbeitungs-Modus-Gating (kein Add/Remove außerhalb
         `editing`, ADR-v9-30) — kein zweiter Editier-Zustand, keine zweite Sektion. -->
    {#if translations.length > 0 || editing}
      <p class="place-detail__hint">Übersetzungen (Sprachen):</p>
      {#if translations.length > 0}
        <div class="stb-pill-row" aria-label="Übersetzungen">
          {#each translations as t, i (i)}
            <span class="stb-pill">
              <span class="place-detail__trans-lang">{t.lang}</span> {t.value}
              {#if editing}
                <button type="button" class="stb-pill__remove" onclick={() => removeTranslation(i)} aria-label={`Übersetzung „${t.value}" entfernen`}>✕</button>
              {/if}
            </span>
          {/each}
        </div>
      {/if}
      {#if editing}
        <div class="place-detail__add-row">
          <input type="text" class="place-detail__trans-lang-input" placeholder="Sprache (z. B. pl)" bind:value={newTransLang} aria-label="Sprachkürzel" />
          <input type="text" placeholder="Name in dieser Sprache…" bind:value={newTransValue} aria-label="Übersetzter Ortsname" />
          <button type="button" onclick={addTranslation}>+ Übersetzung</button>
        </div>
      {/if}
    {/if}
  </section>
{/if}

<style>
  /* Die Klassennamen bleiben `place-detail__*`: die Sektion ist optisch Teil des
     Steckbriefs, und ein eigener Namensraum hätte hier nur die Herkunft verschleiert. */
  .place-detail__section {
    padding: 0 1rem 1rem;
  }

  .place-detail__section h3 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
    color: var(--stb-gold-light);
  }

  .place-detail__hint {
    margin: 0.6rem 0 0.3rem;
    font-size: 0.75rem;
    color: var(--stb-text-dim);
  }

  .place-detail__add-row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }

  .place-detail__add-row input {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    color: var(--stb-text);
    font: inherit;
    font-size: 0.8rem;
    padding: 0.3rem 0.4rem;
    min-width: 0;
  }

  .place-detail__add-row input[type='number'] {
    width: 5rem;
  }

  .place-detail__add-row button {
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    color: var(--stb-gold-light);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .place-detail__trans-lang {
    color: var(--stb-text-dim);
    font-size: 0.7rem;
    text-transform: uppercase;
  }

  .place-detail__trans-lang-input {
    width: 6rem;
  }
</style>
