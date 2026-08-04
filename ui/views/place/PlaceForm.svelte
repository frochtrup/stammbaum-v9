<script lang="ts">
  // ui/views/place/PlaceForm.svelte — Orts-NEUANLAGE (ADR-v9-42 Punkt 4, Spec 20 §"Ort").
  // Bewusst NUR für die Erstanlage (analog SourceForm.svelte im Aufbau, aber ohne
  // "editiere bestehendes Objekt"-Fall) — Koordinaten/Notiz/pnames/enclosedBy bleiben
  // ausschließlich PlaceDetail.svelte-Bearbeitung vorbehalten (progressive Offenlegung:
  // minimal hier, Rest später am Steckbrief). Titel ist Pflicht, Typ optional Freitext
  // (gleiche Freitext-Entscheidung wie PlaceDetail.svelte "Typ"-Feld — kein neues
  // <select>, konsistent mit dem bestehenden Muster statt eine zweite Optik zu erfinden).
  //
  // ID-Vergabe: `draftPlaceId` ist eine EIGENSTÄNDIGE, kleine Hilfsfunktion (nicht aus
  // core/places/seed.ts importiert — das ist ein anderer Anwendungsfall/Modul-Zweck,
  // s. ADR-v9-42 Auftrag). Schema angelehnt an seed.ts' `mintId` (`_plac_<slug>`,
  // Kollisions-Suffix `_2`/`_3`/…), aber unabhängig implementiert. `slugify` selbst wird
  // wiederverwendet (core/places/normalize.ts, allgemeines String-Utility — kein
  // Duplikat der mintId-Algorithmik).
  import type { PlacesHost } from '../../shell/places-host';
  import type { PlaceObject } from '../../../core/places/types';
  import { slugify } from '../../../core/places';
  import { formEscape, formSubmit } from '../../shell/form-keys';

  interface Props {
    appState: PlacesHost;
    /** Nach erfolgreichem Anlegen — liefert die neu vergebene PlaceId. */
    onSaved?: (placeId: string) => void;
    /** Abbrechen ohne Anlegen. */
    onCancel?: () => void;
  }
  const { appState, onSaved, onCancel }: Props = $props();

  let title = $state('');
  let type = $state('');

  /** Deterministische, kollisionsfreie PlaceId aus dem Titel (s. Kopfkommentar). */
  function draftPlaceId(rawTitle: string, existingIds: Set<string>): string {
    const base = `_plac_${slugify(rawTitle) || 'ort'}`;
    if (!existingIds.has(base)) return base;
    let n = 2;
    let id = `${base}_${n}`;
    while (existingIds.has(id)) {
      n += 1;
      id = `${base}_${n}`;
    }
    return id;
  }

  function save() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const existingIds = new Set(appState.db.placeObjects.keys());
    const id = draftPlaceId(trimmedTitle, existingIds);
    const next: PlaceObject = {
      id,
      title: trimmedTitle,
      // Anzeigename bleibt bei der Neuanlage leer ⇒ Listen zeigen `title` (ADR-v9-90).
      // Kuriert wird er erst, wenn ein echtes Homonym ihn nötig macht.
      shortName: '',
      type: type.trim(),
      pnames: [],
      translations: [], // Sprachachse (BL-59) — bei Neuanlage leer, Kuration im Steckbrief.
      enclosedBy: [],
      lat: null,
      long: null,
      note: '',
      existsFrom: null,
      existsTo: null,
      govId: null,
      govTypes: null,
    };
    appState.savePlace(next);
    onSaved?.(id);
  }

  function cancel() {
    onCancel?.();
  }
</script>

<!-- `<form>`, nicht `<div>` (BL-276, §6i): Enter legt an, Escape ruft denselben
     Sekundär-Ausgang wie der Knopf unten — Regel und Fallen in `form-keys.ts`. -->
<!-- Der Escape-Handler gehört der GANZEN Formularfläche, nicht einem einzelnen
     Feld (BL-276, `form-keys.ts`) — ein Rollen-Attribut daran wäre eine
     Falschaussage. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="place-form" onsubmit={formSubmit(save)} onkeydown={formEscape(cancel)}>
  <h3>Neuer Ort</h3>

  <label>
    Name
    <!-- Eigenes aria-label (nicht schlicht "Name"): PlaceForm wird oft NEBEN einer
         bestehenden PlaceDetail-Bearbeitung eingebettet (z. B. enclosedBy-Picker im
         Bearbeiten-Modus), die selbst ein "Name"-Feld hat — Kollision vermeiden. -->
    <input type="text" bind:value={title} aria-label="Name (neuer Ort)" />
  </label>
  <label>
    Typ
    <input
      type="text"
      bind:value={type}
      placeholder="z. B. Village, City, County…"
      aria-label="Typ (neuer Ort)"
    />
  </label>

  <div class="place-form__actions">
    <button type="submit" class="stb-btn" data-variant="primary" disabled={!title.trim()}>Speichern</button>
    <button type="button" class="stb-btn" data-variant="secondary" onclick={cancel}>Abbrechen</button>
  </div>
</form>

<style>
  .place-form {
    padding: 0.8rem;
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .place-form h3 {
    margin: 0 0 0.2rem;
    font-size: 0.9rem;
    color: var(--stb-gold-light);
  }

  .place-form label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .place-form input {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font: inherit;
  }

  .place-form__actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.3rem;
  }



</style>
