<script lang="ts">
  // ui/views/place/PlaceEditForm.svelte — die „Grunddaten"-Bearbeiten-Form des Ort-
  // Steckbriefs (Spec 20 §1.7 [K] „Bearbeitung: alle PlaceObject-Felder"). Aus PlaceDetail
  // extrahiert, damit diese Datei unter dem regulären max-lines-Limit (600) bleibt.
  //
  // Die Komponente OWNS ihren Formularzustand (init aus `place` beim Mount — sie mountet
  // frisch je Bearbeiten-Sitzung, `{#if editing}`). Sie schreibt NICHT selbst: `save()`
  // baut das aktualisierte PlaceObject und reicht es per `onSave` an den Aufrufer
  // (der ruft appState.savePlace). Löschen ist ebenfalls ein Callback.
  //
  // DIESE FLÄCHE IST DIE TRANSAKTIONSGRENZE (Spec 21 §6m, INV-UI-16, ADR-v9-193).
  // „Verwerfen" setzt die FELDWERTE zurück und schließt die Fläche NICHT — deshalb gibt
  // es hier kein `onCancel` mehr. Vorher tat derselbe Knopf beides (`editing = false` im
  // Aufrufer), und weil derselbe Schalter auch die sofort committenden Abschnitte
  // daneben sichtbar macht (Namensvarianten, Zugehörigkeit, GOV-Import, Merge), las er
  // sich als Rücknahme von allem seit dem Öffnen — die war er nie. Den Modus verlässt
  // der Schalter, der ihn geöffnet hat („Fertig" im Kopf).
  import { untrack } from 'svelte';
  import type { PlaceObject } from '../../../core/places/types';
  import { resolveCoordFields, type GeocodeHit } from '../../../core/places';
  import CoordFields from '../../shell/CoordFields.svelte';
  import GeocodeButton from '../../shell/GeocodeButton.svelte';
  import TypeSelect from '../../shell/TypeSelect.svelte';
  import { PLACE_TYPE_OPTIONS } from '../../shell/place-labels';

  interface Props {
    place: PlaceObject;
    onSave: (updated: PlaceObject) => void;
    onDelete: () => void;
  }
  const { place, onSave, onDelete }: Props = $props();

  // Startwerte EINMAL aus `place` lesen (die Form ist eine Arbeitskopie und mountet frisch
  // je Bearbeiten-Sitzung — sie soll bewusst NICHT auf spätere `place`-Änderungen reagieren).
  // Aus einer plain-Const initialisieren, nicht direkt aus dem Prop (svelte-check
  // `state_referenced_locally`).
  // `?? ''` ist hier PFLICHT, nicht Vorsicht: `shortName` (ADR-v9-90) ist ein NACHTRÄGLICH
  // ergänztes, abwärtskompatibles orte.json-Feld — an einem Ort aus einer älteren Datei
  // fehlt es schlicht, und `undefined.trim()` in `save()` wirft. Am echten Bestand gemessen:
  // ALLE 128 Orte von `tools/handbuch/fixtures/orte.json` haben weder `shortName` noch
  // `translations`. Aufgefallen erst bei der Browser-Verifikation des Orte-Editors, weil
  // dessen Dateien beliebigen Alters sind; im Hauptprogramm setzen die Fixtures das Feld
  // immer. Dieselbe Klasse wie das `?? []` in `app-state.svelte.ts::importGovEntry`.
  const init = untrack(() => ({
    title: place.title ?? '',
    shortName: place.shortName ?? '',
    type: place.type ?? '',
    latText: place.lat != null ? String(place.lat) : '',
    longText: place.long != null ? String(place.long) : '',
    note: place.note ?? '',
    existsFrom: place.existsFrom,
    existsTo: place.existsTo,
    govId: place.govId ?? '',
    govTypesText: place.govTypes?.join(', ') ?? '',
  }));

  let title = $state(init.title);
  /** Zeitinvarianter Listen-Anzeigename (Spec 11 §1, INV-UI-14) — nie Export (LP-1). */
  let shortName = $state(init.shortName);
  let type = $state(init.type);
  // Koordinaten als Text (nicht type="number"): ein Feld nimmt ein komplettes eingefügtes
  // Apple-Maps-Paar auf, das wir zerlegen (Spec 20 §1.7). Zahlen entstehen erst beim Speichern.
  let latText = $state(init.latText);
  let longText = $state(init.longText);
  let note = $state(init.note);
  let existsFrom = $state<number | null>(init.existsFrom);
  let existsTo = $state<number | null>(init.existsTo);
  let govId = $state(init.govId);
  /** GOV-Typen (`govTypes: string[] | null`) als komma-getrennter Freitext. */
  let govTypesText = $state(init.govTypesText);

  /** Komma-getrennten Freitext in `govTypes: string[] | null` — leere Liste wird `null`. */
  function parseGovTypes(text: string): string[] | null {
    const items = text.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    return items.length > 0 ? items : null;
  }

  /** Nominatim-Treffer ins Formular; Typ nur, wenn leer/Unknown (Kuration bleibt, wie Batch/v8). */
  function applyGeocodeHit(hit: GeocodeHit) {
    latText = String(hit.lat);
    longText = String(hit.long);
    if ((!type.trim() || type === 'Unknown') && hit.type !== 'Unknown') type = hit.type;
  }

  /**
   * Setzt die Feldwerte auf den GESPEICHERTEN Stand zurück (INV-UI-16). Liest bewusst
   * `place` frisch und nicht `init`: `init` ist der Stand beim Öffnen der Fläche, aber
   * die sofort committenden Abschnitte daneben (Namensvarianten, GOV-Import) können den
   * Ort seither geändert haben. Auf `init` zurückzusetzen hieße, deren Ergebnis beim
   * nächsten „Speichern" zu überschreiben — ein Verwerfen, das fremde Arbeit mitnimmt.
   */
  function discard() {
    title = place.title ?? '';
    shortName = place.shortName ?? '';
    type = place.type ?? '';
    latText = place.lat != null ? String(place.lat) : '';
    longText = place.long != null ? String(place.long) : '';
    note = place.note ?? '';
    existsFrom = place.existsFrom;
    existsTo = place.existsTo;
    govId = place.govId ?? '';
    govTypesText = place.govTypes?.join(', ') ?? '';
  }

  function save() {
    const { lat, long } = resolveCoordFields(latText, longText);
    onSave({
      ...place,
      title: title.trim(),
      shortName: shortName.trim(),
      type: type.trim(),
      lat,
      long,
      note,
      existsFrom,
      existsTo,
      govId: govId.trim() || null,
      govTypes: parseGovTypes(govTypesText),
    });
  }
</script>

<section class="place-edit-form" data-no-swipe>
  <h3>Grunddaten</h3>
  <label>
    Name
    <input type="text" bind:value={title} />
  </label>
  <label>Anzeigename (Listen) <input type="text" bind:value={shortName} placeholder="nur bei Homonymen nötig, z. B. Frankfurt (Main) — nie exportiert" /></label>
  <!-- Geschwister-Stelle zu BL-203: ADR-v9-149 hat die ANZEIGE des Ortstyps auf Deutsch
       umgestellt, das Eingabefeld blieb englischer Freitext („z. B. Village, City…") —
       getippt englisch, angezeigt deutsch. Gleicher Mechanismus wie der Archivtyp
       (`TypeSelect`, INV-UI-4); ein vorhandener Custom-/Geocoder-Wert bleibt erhalten. -->
  <div class="stb-field">
    <span class="stb-field__caption">Typ</span>
    <TypeSelect value={type} options={PLACE_TYPE_OPTIONS} onChange={(v) => (type = v)} label="Typ" />
  </div>
  <CoordFields bind:latText bind:longText />
  <GeocodeButton name={title.trim() || place.title} onResult={applyGeocodeHit} />
  <label>
    Notiz
    <textarea bind:value={note}></textarea>
  </label>
  <label>
    Existiert von (Jahr)
    <input type="number" bind:value={existsFrom} />
  </label>
  <label>
    Existiert bis (Jahr)
    <input type="number" bind:value={existsTo} />
  </label>
  <label>
    GOV-ID
    <input type="text" bind:value={govId} placeholder="z. B. eine gov.genealogy.net-Kennung" />
  </label>
  <label>
    GOV-Typen (kommagetrennt)
    <input type="text" bind:value={govTypesText} placeholder="z. B. Stadt, Kreis" />
  </label>
  <div class="place-edit-form__actions">
    <button type="button" class="place-edit-form__save" onclick={save}>Speichern</button>
    <!-- „Verwerfen", nicht „Abbrechen": es betrifft die Feldwerte DIESER Fläche, nicht
         die Bearbeiten-Sitzung (INV-UI-16). Das alte Wort versprach mehr, als es hielt. -->
    <button type="button" class="place-edit-form__cancel" onclick={discard}>Verwerfen</button>
    <button type="button" class="place-edit-form__delete" onclick={onDelete}>Ort löschen</button>
  </div>
</section>

<style>
  .place-edit-form {
    margin-top: 1.25rem;
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
    padding: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .place-edit-form h3 {
    font-size: 0.95rem;
    color: var(--stb-gold-light);
    margin-bottom: 0.4rem;
  }

  .place-edit-form label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .place-edit-form input,
  .place-edit-form textarea {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font: inherit;
  }

  .place-edit-form__actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .place-edit-form__save {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    cursor: pointer;
    font-weight: 600;
  }

  .place-edit-form__cancel {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    cursor: pointer;
    font-weight: 600;
  }

  /* Destruktive Aktion — eigener Akzent (`--stb-danger`), `margin-left: auto` nur auf dem
     letzten Element (TST-11 — sicher, da garantiert letztes in der flex-wrap-Zeile). */
  .place-edit-form__delete {
    background: transparent;
    color: var(--stb-danger);
    border: 1px solid var(--stb-danger);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    cursor: pointer;
  }

  .place-edit-form__actions > :last-child {
    margin-left: auto;
  }
</style>
