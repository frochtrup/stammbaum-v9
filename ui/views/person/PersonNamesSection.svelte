<script lang="ts">
  // ui/views/person/PersonNamesSection.svelte — die WEITEREN Namensformen einer Person
  // (`Person.extraNames`, Spec 10 §2 „Namen"; Spec 20 §1.4): Geburts-/Mädchen-/Ehename,
  // Alias, Name nach Einwanderung.
  //
  // WARUM ALS EIGENE SEKTION UND NICHT IM FORMULAR. `PersonForm` sammelt Feldwerte und
  // committet sie am „Speichern"-Knopf; diese Liste committet SOFORT je Zeile. Beides
  // unter denselben Knopf zu legen wäre exakt der Verstoß, den INV-UI-16 benennt (kein
  // Sofort-Commit innerhalb einer Speichern/Abbrechen-Fläche) — und Spec 21 §6m ordnet
  // eine Namensvariante ausdrücklich der Sofort-Spalte zu: sie ist für sich allein eine
  // vollständige Aussage. Der „✎ Identität"-Schalter gated hier nur die SICHTBARKEIT der
  // Mutations-Controls (ADR-v9-30/INV-UI-16), wie bei `PlaceNamesSection` daneben.
  //
  // Gebaut als Geschwister von `PlaceNamesSection.svelte` (INV-UI-4): dieselbe Lese-Pille,
  // dieselbe Editier-Zeile, dieselbe Add-Zeile, dieselbe `onSave(next)`-Rolle — nur der
  // Feld-Schnitt (Vorname/Nachname/Art statt Wert/von/bis) unterscheidet sich. Die Art
  // läuft über das geteilte `TypeSelect` (INV-UI-4), das den rohen `NAME_TYPE`-Wert hält
  // und deutsch beschriftet; ein Freitext-Feld schriebe „Ehename" in `2 TYPE` und bräche
  // die Interop.
  import type { Person } from '../../../core/model/types';
  import { PLAIN_FIELD } from '../../shell/plain-input';
  import TypeSelect from '../../shell/TypeSelect.svelte';
  import { NAME_TYPE_OPTIONS, nameTypeLabel } from '../../shell/name-type-labels';
  import {
    extraNameParts,
    extraNameDisplay,
    withAddedExtraName,
    withRemovedExtraName,
    withUpdatedExtraName,
  } from '../../../core/model';

  interface Props {
    person: Person;
    /** „✎ Identität" offen? Gated nur die Sichtbarkeit der Mutations-Controls. */
    editing: boolean;
    /** Der Steckbrief setzt das Kommando ab (`appState.savePerson`) — dieselbe Rolle wie
     *  bei `PlaceNamesSection`: die Sektion baut das neue Objekt, sie speichert nicht. */
    onSave: (next: Person) => void;
  }
  const { person, editing, onSave }: Props = $props();

  /** Zeilen-Modell der Sektion. Vor-/Nachname kommen aus dem Kern (`extraNameParts`),
   *  nicht aus einer zweiten, hier nachgebauten Zerlegung — der `NAME`-Wert hat Vorrang
   *  vor den Untertags, und diese Regel gehört genau einmal ins Programm. */
  const rows = $derived(
    person.extraNames.map((n, index) => ({
      index,
      display: extraNameDisplay(n),
      typeLabel: nameTypeLabel(n.type),
      type: n.type,
      citationCount: n.citations.length,
      ...extraNameParts(n),
    })),
  );

  let newGiven = $state('');
  let newSurname = $state('');
  let newType = $state('');

  function addName() {
    if (!newGiven.trim() && !newSurname.trim()) return;
    onSave(withAddedExtraName(person, newGiven, newSurname, newType));
    newGiven = '';
    newSurname = '';
    newType = '';
  }
</script>

<!-- Ohne Namensform UND ohne Bearbeiten-Modus steht hier nichts: eine leere Sektion mit
     Überschrift wäre auf der Mehrzahl der Steckbriefe reines Rauschen. -->
{#if rows.length > 0 || editing}
  <section class="person-detail__section person-names">
    <h3 class="stb-section-title">Weitere Namensformen</h3>

    <!-- Lesefläche: die ART steht im sichtbaren Text der Pille, nicht in einem Tooltip —
         dieselbe Begründung wie bei der Gültigkeit der Orts-Varianten (ADR-v9-183): ein
         Kanal, den es auf dem Telefon nicht gibt, ist keine Anzeige. -->
    {#if rows.length > 0 && !editing}
      <div class="stb-pill-row" aria-label="Weitere Namensformen">
        {#each rows as r (r.index)}
          <span class="stb-pill">
            {r.display}
            {#if r.typeLabel}<span class="person-names__type">{r.typeLabel}</span>{/if}
            {#if r.citationCount > 0}<span class="person-names__cits">§{r.citationCount}</span>{/if}
          </span>
        {/each}
      </div>
    {/if}

    <!-- Bearbeiten-Modus: bestehende Formen sind ZEILEN, keine Pillen — Vorname, Nachname
         und Art direkt änderbar (ADR-v9-183-Form). Jede Änderung committet sofort,
         gleiches Timing wie die Add-Zeile darunter; rückgängig über den regulären
         Undo-Stack (INV-UI-10). -->
    {#if editing && rows.length > 0}
      <ul class="person-names__edit-list" aria-label="Weitere Namensformen bearbeiten">
        {#each rows as r (r.index)}
          <li class="person-names__edit-row">
            <input
              type="text" {...PLAIN_FIELD}
              value={r.given}
              placeholder="Vorname"
              aria-label={`Namensform ${r.index + 1} — Vorname`}
              onchange={(e) => onSave(withUpdatedExtraName(person, r.index, e.currentTarget.value, r.surname, r.type))}
            />
            <input
              type="text" {...PLAIN_FIELD}
              value={r.surname}
              placeholder="Nachname"
              aria-label={`Namensform ${r.index + 1} — Nachname`}
              onchange={(e) => onSave(withUpdatedExtraName(person, r.index, r.given, e.currentTarget.value, r.type))}
            />
            <span class="person-names__type-field">
              <TypeSelect
                value={r.type}
                options={NAME_TYPE_OPTIONS}
                label={`Namensform ${r.index + 1} — Art`}
                onChange={(v) => onSave(withUpdatedExtraName(person, r.index, r.given, r.surname, v))}
              />
            </span>
            <!-- Die Zitate der Namensform reisen mit (`withUpdatedExtraName` lässt sie
                 unangetastet); ein Entfernen nimmt sie mit — deshalb sagt die
                 Beschriftung, WELCHE Form gemeint ist. -->
            <button
              type="button"
              class="stb-icon-btn person-names__remove"
              data-variant="danger"
              onclick={() => onSave(withRemovedExtraName(person, r.index))}
              aria-label={`Namensform „${r.display}“ entfernen`}
            >✕</button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if editing}
      <div class="person-names__add-row">
        <input type="text" {...PLAIN_FIELD} placeholder="Vorname" bind:value={newGiven} aria-label="Neue Namensform — Vorname" />
        <input type="text" {...PLAIN_FIELD} placeholder="Nachname" bind:value={newSurname} aria-label="Neue Namensform — Nachname" />
        <span class="person-names__type-field">
          <TypeSelect
            value={newType}
            options={NAME_TYPE_OPTIONS}
            label="Neue Namensform — Art"
            onChange={(v) => (newType = v)}
          />
        </span>
        <button type="button" onclick={addName}>+ Namensform</button>
      </div>
    {/if}
  </section>
{/if}

<style>
  /* `person-detail__section` liefert den Rahmen des Steckbriefs (aus PersonDetail);
     `person-names__*` nur, was diese Sektion eigen hat — gleiche Aufteilung wie bei
     `PlaceNamesSection`. */
  .person-names__type {
    color: var(--stb-text-dim);
    font-size: 0.72rem;
    margin-left: 0.35rem;
  }

  .person-names__cits {
    color: var(--stb-text-muted);
    font-size: 0.72rem;
    margin-left: 0.3rem;
  }

  .person-names__edit-list {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
  }

  .person-names__edit-row,
  .person-names__add-row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .person-names__edit-row {
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--stb-surface-2);
  }

  .person-names__add-row {
    margin-top: 0.5rem;
  }

  .person-names__edit-row input,
  .person-names__add-row input {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    color: var(--stb-text);
    font: inherit;
    font-size: 0.8rem;
    padding: 0.3rem 0.4rem;
    min-width: 0;
    flex: 1 1 7rem;
  }

  /* `TypeSelect` ist auf `width: 100%` gebaut (es sitzt sonst in Formularspalten) —
     in dieser Zeile braucht es einen eigenen Halter, sonst sprengt es die Zeile. */
  .person-names__type-field {
    flex: 1 1 10rem;
    min-width: 0;
  }

  .person-names__add-row button {
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    color: var(--stb-gold-light);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .person-names__remove {
    margin-left: auto;
  }
</style>
