<script lang="ts">
  // ui/views/hof/HofEditForm.svelte — die „Grunddaten"-Bearbeiten-Form des Hof-Steckbriefs
  // (Spec 20 §1.8 [K] „Hof-Bearbeitung: Koordinaten, Notiz, Lebenszyklus/Vorgänger-Nachfolger,
  // govId/govTypes"). Aus HofDetail extrahiert, damit diese Datei unter dem regulären
  // max-lines-Limit bleibt — dieselbe Aufteilung wie PlaceDetail/PlaceEditForm (INV-UI-4).
  //
  // Die Komponente OWNS ihren Formularzustand (init aus `hof` beim Mount — sie mountet frisch
  // je Bearbeiten-Sitzung, `{#if editing}`). Sie schreibt NICHT selbst: `save()` baut das
  // aktualisierte HofObject und reicht es per `onSave` an den Aufrufer (der ruft appState.saveHof).
  // Die inline-Neuanlage eines Vorgänger-/Nachfolger-Hofs läuft über den `onCreateHof`-Callback
  // (der Aufrufer kennt Dorf-Kontext + appState) — die Form bleibt frei von PlacesHost/Plattform.
  // Name & Adressvarianten bleiben BEWUSST im HofDetail: sie committen sofort (eigenes Timing),
  // nicht über den „Speichern"-Button dieser Form.
  //
  // DIESE FLÄCHE IST DIE TRANSAKTIONSGRENZE (Spec 21 §6m, INV-UI-16, ADR-v9-193) — und genau
  // deshalb steht der Satz darüber nicht mehr nur als Kommentar da: „Verwerfen" setzt die
  // FELDWERTE zurück und schließt die Fläche NICHT (kein `onCancel` mehr). Vorher schloss
  // derselbe Knopf den Modus und wirkte damit wie eine Rücknahme auch der Adressvarianten
  // und des Dorf-Wechsels daneben — die er nie war (`updateHofAddr` zieht die Umbenennung
  // längst über alle referenzierenden Ereignisse, ADR-v9-81).
  import { untrack } from 'svelte';
  import Picker from '../../shell/Picker.svelte';
  import CoordFields from '../../shell/CoordFields.svelte';
  import { resolveCoordFields } from '../../../core/places';
  import type { HofObject } from '../../../core/places/types';

  interface Props {
    hof: HofObject;
    /** Alle übrigen Höfe (für die Vorgänger-/Nachfolger-Picker) — ohne diesen Hof selbst. */
    otherHofs: HofObject[];
    onSave: (updated: HofObject) => void;
    onDelete: () => void;
    /** Legt einen neuen Hof mit dieser Adresse (im Dorf-Kontext des Aufrufers) an und liefert
     *  dessen id zurück (oder null bei leerer/ungültiger Adresse). */
    onCreateHof: (addr: string) => string | null;
  }
  const { hof, otherHofs, onSave, onDelete, onCreateHof }: Props = $props();

  // Startwerte EINMAL aus `hof` lesen (Arbeitskopie, mountet frisch je Bearbeiten-Sitzung) —
  // aus plain-Const initialisieren, nicht direkt aus dem Prop (svelte-check state_referenced_locally).
  const init = untrack(() => ({
    latText: hof.lat != null ? String(hof.lat) : '',
    longText: hof.long != null ? String(hof.long) : '',
    // Geschwister-Stelle zu PlaceEditForm: dieselbe Absicherung gegen Objekte aus älteren
    // orte.json-Fassungen, auch wo heute noch kein Feld fehlt — die Regel gilt nicht nur
    // dort, wo sie aufgefallen ist.
    note: hof.note ?? '',
    existsFrom: hof.existsFrom,
    existsTo: hof.existsTo,
    predecessor: hof.predecessor ?? '',
    successor: hof.successor ?? '',
    govId: hof.govId ?? '',
    govTypes: hof.govTypes?.join(', ') ?? '',
  }));

  // Koordinaten als Text (nicht type="number"): ein Feld nimmt ein komplettes eingefügtes
  // Apple-Maps-Paar auf, das wir zerlegen (Spec 20 §1.7). Zahlen entstehen erst beim Speichern.
  let formLatText = $state(init.latText);
  let formLongText = $state(init.longText);
  let formNote = $state(init.note);
  let formExistsFrom = $state<number | null>(init.existsFrom);
  let formExistsTo = $state<number | null>(init.existsTo);
  let formPredecessor = $state(init.predecessor);
  let formSuccessor = $state(init.successor);
  let formGovId = $state(init.govId);
  /** GOV-Typen (`govTypes: string[] | null`) als komma-getrennter Freitext (analog PlaceEditForm). */
  let formGovTypes = $state(init.govTypes);

  /**
   * Setzt die Feldwerte auf den GESPEICHERTEN Stand zurück (INV-UI-16). Liest `hof` frisch
   * statt `init`: die sofort committenden Abschnitte daneben (Adressvarianten, Dorf-Picker)
   * können den Hof seit dem Öffnen geändert haben — auf `init` zurückzusetzen nähme deren
   * Ergebnis beim nächsten „Speichern" mit.
   */
  function discard() {
    formLatText = hof.lat != null ? String(hof.lat) : '';
    formLongText = hof.long != null ? String(hof.long) : '';
    formNote = hof.note ?? '';
    formExistsFrom = hof.existsFrom;
    formExistsTo = hof.existsTo;
    formPredecessor = hof.predecessor ?? '';
    formSuccessor = hof.successor ?? '';
    formGovId = hof.govId ?? '';
    formGovTypes = hof.govTypes?.join(', ') ?? '';
  }

  /** Inline-Neuanlage eines Vorgänger-/Nachfolger-Hofes (ADR-v9-42 Punkt 5): Hof-Identität
   *  braucht Adresse+Dorf-Kontext — ein simples Adress-Textfeld statt eines eigenen HofForm. */
  let creatingHofFor = $state<'predecessor' | 'successor' | null>(null);
  let newHofAddr = $state('');

  function beginCreateHof(target: 'predecessor' | 'successor') {
    creatingHofFor = target;
    newHofAddr = '';
  }

  function cancelCreateHof() {
    creatingHofFor = null;
    newHofAddr = '';
  }

  function confirmCreateHof() {
    if (!creatingHofFor) return;
    const id = onCreateHof(newHofAddr.trim());
    if (!id) return;
    if (creatingHofFor === 'predecessor') formPredecessor = id;
    else formSuccessor = id;
    creatingHofFor = null;
    newHofAddr = '';
  }

  /** Komma-getrennten Freitext in `govTypes: string[] | null` zurückübersetzen (analog PlaceEditForm). */
  function parseGovTypes(text: string): string[] | null {
    const items = text.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    return items.length > 0 ? items : null;
  }

  function save() {
    const { lat, long } = resolveCoordFields(formLatText, formLongText);
    onSave({
      ...hof,
      lat,
      long,
      note: formNote,
      existsFrom: formExistsFrom,
      existsTo: formExistsTo,
      predecessor: formPredecessor || null,
      successor: formSuccessor || null,
      govId: formGovId.trim() || null,
      govTypes: parseGovTypes(formGovTypes),
    });
  }

  function hofLabel(h: HofObject): string {
    return h.addrs[0]?.value ?? h.id;
  }

  function hofMatches(h: HofObject, query: string): boolean {
    return hofLabel(h).toLowerCase().includes(query.trim().toLowerCase());
  }
</script>

<section class="hof-detail__section hof-detail__form" data-no-swipe>
  <h3>Grunddaten</h3>
  <CoordFields bind:latText={formLatText} bind:longText={formLongText} />
  <label>
    Notiz
    <textarea bind:value={formNote}></textarea>
  </label>
  <label>
    Existiert von (Jahr)
    <input type="number" bind:value={formExistsFrom} />
  </label>
  <label>
    Existiert bis (Jahr)
    <input type="number" bind:value={formExistsTo} />
  </label>
  <div class="stb-field">
    <span class="stb-field__caption">Vorgänger-Hof</span>
    <!-- "+ neuen Hof anlegen" (ADR-v9-42, ersetzt die ADR-v9-40-Ausnahme): eine einzelne,
         bewusste Nutzerhandlung im Editier-Modus ist strukturell identisch zu "+ Neue
         Person/Familie/Quelle/Archiv anlegen" — die Kurations-Sorge (ADR-v9-13/28/29)
         betrifft nur automatische Massenanlage beim Import. -->
    {#if creatingHofFor === 'predecessor'}
      <div class="hof-detail__inline-create">
        <input type="text" placeholder="Adresse des neuen Hofs…" bind:value={newHofAddr} aria-label="Adresse des neuen Vorgänger-Hofs" />
        <button type="button" onclick={confirmCreateHof} disabled={!newHofAddr.trim()}>Anlegen</button>
        <button type="button" onclick={cancelCreateHof}>Abbrechen</button>
      </div>
    {:else}
      <Picker
        items={otherHofs}
        getId={(h) => h.id}
        getLabel={hofLabel}
        matches={hofMatches}
        value={formPredecessor || null}
        onChange={(id) => (formPredecessor = id ?? '')}
        allowNone={true}
        noneLabel="(keiner)"
        label="Vorgänger-Hof"
        createLabel="+ neuen Hof anlegen …"
        onCreateRequested={() => beginCreateHof('predecessor')}
      />
    {/if}
  </div>
  <div class="stb-field">
    <span class="stb-field__caption">Nachfolger-Hof</span>
    {#if creatingHofFor === 'successor'}
      <div class="hof-detail__inline-create">
        <input type="text" placeholder="Adresse des neuen Hofs…" bind:value={newHofAddr} aria-label="Adresse des neuen Nachfolger-Hofs" />
        <button type="button" onclick={confirmCreateHof} disabled={!newHofAddr.trim()}>Anlegen</button>
        <button type="button" onclick={cancelCreateHof}>Abbrechen</button>
      </div>
    {:else}
      <Picker
        items={otherHofs}
        getId={(h) => h.id}
        getLabel={hofLabel}
        matches={hofMatches}
        value={formSuccessor || null}
        onChange={(id) => (formSuccessor = id ?? '')}
        allowNone={true}
        noneLabel="(keiner)"
        label="Nachfolger-Hof"
        createLabel="+ neuen Hof anlegen …"
        onCreateRequested={() => beginCreateHof('successor')}
      />
    {/if}
  </div>
  <label>
    GOV-ID
    <input type="text" bind:value={formGovId} placeholder="z. B. eine gov.genealogy.net-Kennung" />
  </label>
  <label>
    GOV-Typen (kommagetrennt)
    <input type="text" bind:value={formGovTypes} placeholder="z. B. Hof, Gehöft" />
  </label>
  <div class="hof-detail__form-actions">
    <button type="button" class="stb-btn" data-variant="primary" onclick={save}>Speichern</button>
    <!-- „Verwerfen", nicht „Abbrechen" — Feldwerte dieser Fläche, nicht die Sitzung (INV-UI-16). -->
    <button type="button" class="stb-btn" data-variant="secondary" onclick={discard}>Verwerfen</button>
    <button type="button" class="stb-btn" data-variant="danger" onclick={onDelete}>Hof löschen</button>
  </div>
</section>

<style>
  .hof-detail__form {
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
    padding: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .hof-detail__form label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .hof-detail__form input,
  .hof-detail__form textarea {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font: inherit;
  }

  /* Inline-Neuanlage Vorgänger-/Nachfolger-Hof (ADR-v9-42): eigener Klassenname statt
     weiterer add-row-Überladung (andere Spalten: Adresstext + Anlegen + Abbrechen). */
  .hof-detail__inline-create {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .hof-detail__inline-create input {
    flex: 1 1 auto;
    min-width: 8rem;
  }

  .hof-detail__inline-create button {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }

  .hof-detail__inline-create button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .hof-detail__form-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }




  .hof-detail__form-actions > :last-child {
    margin-left: auto;
  }
</style>
