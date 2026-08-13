<script lang="ts">
  // ui/views/place/PlaceEnclosureEditModal.svelte — Bearbeitungs-Modal für die direkte
  // Verwaltungszugehörigkeit (`place.enclosedBy`) eines Ortes (Bau-Auftrag "Orts-
  // Detailansicht": "die direkte Zuordnung … wandert in den Bearbeiten-Modal. der
  // Genealoge möchte die jeweilige Ortsketten über die Zeit verstehen, während die
  // direkte Zuordnung ein Mittel zum Zweck ist, um diese aufzubauen").
  //
  // Enthält NUR den enclosedBy-Editor (Picker + Von/Bis-Jahr + Hinzufügen/Entfernen +
  // "+ neuen Ort anlegen"-Unterfluss, ADR-v9-42) — vorher inline auf PlaceDetail.svelte
  // gerendert (Zeitraum-sortierte Lese-Ansicht bleibt dort, s. `enclosureTimeline`).
  // Andere Bearbeitungsfelder (Titel/Typ/Koordinaten/Notiz, Namensvarianten, Merge)
  // bleiben UNVERÄNDERT in PlaceDetail.svelte's bestehendem `editing`-Toggle.
  //
  // Modal-Schale (Backdrop + Panel + Escape/Backdrop-Klick schließt) ist aus
  // ui/shell/EventEditModal.svelte übernommen (INV-UI-4, dort als Vorbild markiert) —
  // eigene `.place-enclosure-modal__*`-Klassen statt `.event-edit-modal__*`
  // wiederzuverwenden, analog wie PersonForm/FamilyForm je einen eigenen, sehr
  // ähnlichen CSS-Block pflegen (s. EventEditModal-Kopfkommentar).
  //
  // Speichert über DENSELBEN Chokepoint wie die bisherige inline-Bearbeitung:
  // appState.savePlace(model) nach withAddedEnclosedBy/withRemovedEnclosedBy
  // (core/places) — kein zweiter Speicher-Mechanismus. Liest das PlaceObject reaktiv
  // über `placeId` (nicht als statisches Objekt-Prop), damit aufeinanderfolgende
  // Hinzufügen/Entfernen-Aktionen im selben Modal-Aufenthalt sofort sichtbar werden.
  import type { PlacesHost } from '../../shell/places-host';
  import type { PlaceId } from '../../../core/model/types';
  import type { PlaceObject } from '../../../core/places/types';
  import Picker from '../../shell/Picker.svelte';
  import {
    withAddedEnclosedBy,
    withRemovedEnclosedBy,
    withUpdatedEnclosedBy,
    placeDisplayName,
    grenzeAusEingabe,
    grenzeText,
    OFFENE_GRENZE,
    type Grenze,
  } from '../../../core/places';
  import { grenzeAusFeld } from '../../shell/grenz-feld';
  import PlaceForm from './PlaceForm.svelte';
  import { PLAIN_FIELD } from '../../shell/plain-input';
  import { portal } from '../../shell/portal';
  import { focusTrap } from '../../shell/focus-trap';

  interface Props {
    appState: PlacesHost;
    placeId: PlaceId;
    onClose: () => void;
  }
  const { appState, placeId, onClose }: Props = $props();

  const place = $derived(appState.db.placeObjects.get(placeId));

  /**
   * Sortier-Rang eines Eintrags — DREI Zustände, nicht zwei (ADR-v9-181, Spec 11 §1):
   * nach unten offen (`from` fehlt, `to` gesetzt: „seit jeher bis X") gehört an den
   * ANFANG, undatiert (beide fehlen) ans Ende, alles Datierte dazwischen nach `from`.
   *
   * Das v8-Vorbild `_renderEnclosedByList` sortierte mit `from ?? 9999` und warf damit
   * beide offenen Fälle in einen Topf — „…–1806" stand deshalb UNTER „1816–…", also
   * genau verkehrt herum.
   */
  type Zeitraum = { from: number | null; to: number | null };

  /** 0 = nach unten offen · 1 = datiert · 2 = undatiert. */
  function sortRang(enc: Zeitraum): 0 | 1 | 2 {
    if (enc.from != null) return 1;
    return enc.to != null ? 0 : 2;
  }

  /** Innerhalb desselben Rangs: Datierte nach `from`, nach unten offene nach `to` (die
   *  früher endende Zuordnung zuerst). Bewusst KEINE Arithmetik über ±Infinity — sie
   *  ergäbe zwischen zwei gleichrangigen Einträgen `NaN` und damit eine undefinierte
   *  Sortierreihenfolge. */
  function vergleicheZeitraum(a: Zeitraum, b: Zeitraum): number {
    const ra = sortRang(a);
    const rb = sortRang(b);
    if (ra !== rb) return ra - rb;
    if (ra === 1) return (a.from as number) - (b.from as number);
    if (ra === 0) return (a.to as number) - (b.to as number);
    return 0;
  }

  /** Chronologisch sortiert. Trägt den ORIGINAL-Index mit, weil die Kommandos über den
   *  Index im ROHEN `place.enclosedBy`-Array arbeiten, nicht über die Anzeige-Reihenfolge. */
  const sortedEnclosedBy = $derived(
    place
      ? place.enclosedBy
          .map((enc, originalIndex) => ({ enc, originalIndex }))
          .sort((a, b) => vergleicheZeitraum(a.enc, b.enc))
      : [],
  );

  let newEnclosedParent = $state('');
  // BL-324: EIN Feld je Grenze, das Jahr ODER Stichtag nimmt (1810 oder 1 OCT 1810).
  // Zwei getrennte Felder (Jahr + Tag) hätten sie auseinanderlaufen lassen — genau das
  // verbietet [ADR-v9-243]: das Jahr MUSS aus dem Tag ableitbar sein und dazu passen.
  let newEnclosedFrom = $state('');
  let newEnclosedTo = $state('');
  /** Sichtbare Rückmeldung statt eines toten Knopfes (s. addEnclosedBy).
   *  BEWUSST KEIN `StatusNotice` (BL-334): das hier ist ein FELDFEHLER, keine transiente
   *  Rückmeldung. Er sagt aus, dass die Eingabe daneben ungültig IST — solange sie es ist,
   *  muss er stehen bleiben. Eine 12-s-Frist würde die Begründung wegnehmen, während der
   *  Nutzer noch am Feld tippt, und der Knopf wäre wieder stumm. */
  let grenzFehler = $state('');

  /** Inline-Neuanlage eines übergeordneten Ortes (ADR-v9-42 Punkt 4). */
  let creatingEnclosedParent = $state(false);

  function beginCreateEnclosedParent() {
    creatingEnclosedParent = true;
  }

  function onEnclosedParentCreated(id: string) {
    creatingEnclosedParent = false;
    newEnclosedParent = id;
  }

  function cancelCreateEnclosedParent() {
    creatingEnclosedParent = false;
  }

  function addEnclosedBy() {
    if (!place || !newEnclosedParent) return;
    const von = grenzeAusEingabe(newEnclosedFrom);
    const bis = grenzeAusEingabe(newEnclosedTo);
    // Kein stiller Abbruch (Spec 21 §5): ein unlesbares Datum legt die Zuordnung NICHT
    // undatiert an, sondern sagt es. Sonst wäre der Knopf tot — derselbe Fehler wie beim
    // Speichern-Knopf in ADR-v9-241, nur eine Fläche weiter.
    if (!von.ok || !bis.ok) {
      grenzFehler = 'Datum nicht lesbar — Jahr („1810") oder Stichtag („1 OCT 1810").';
      return;
    }
    grenzFehler = '';
    const next = withAddedEnclosedBy(place, newEnclosedParent, von.grenze, bis.grenze);
    appState.savePlace(next);
    newEnclosedParent = '';
    newEnclosedFrom = '';
    newEnclosedTo = '';
  }

  function removeEnclosedBy(index: number) {
    if (!place) return;
    appState.savePlace(withRemovedEnclosedBy(place, index));
  }

  /** Ändert den Zeitraum einer BESTEHENDEN Zuordnung (ADR-v9-183). Committet sofort —
   *  gleiches Timing wie Hinzufügen/Entfernen daneben; dieses Modal hat keinen eigenen
   *  Speichern-Knopf, „Fertig" schließt nur. */
  function updateEnclosedBySpan(index: number, from: Grenze, to: Grenze) {
    if (!place) return;
    const enc = place.enclosedBy[index];
    if (!enc) return;
    appState.savePlace(withUpdatedEnclosedBy(place, index, enc.placeId, from, to));
  }

  /** Die GEGENGRENZE beim Ändern einer Zeile: sie steht bereits gespeichert im Modell,
   *  ihr Rücklesen kann also nicht fehlschlagen. `OFFENE_GRENZE` ist der korrekte
   *  Rückfall für eine leere Gegenseite und keine Notlösung. */
  const grenzeAusEingabeSicher = (text: string): Grenze => {
    const l = grenzeAusEingabe(text);
    return l.ok ? l.grenze : OFFENE_GRENZE;
  };

  /** Der aktuelle Feldinhalt einer Grenze: der Stichtag, wenn es einen gibt, sonst das Jahr. */
  const grenzeVon = (e: { from: number | null; fromDate?: string | null }): string =>
    grenzeText(e.from, e.fromDate);
  const grenzeBis = (e: { to: number | null; toDate?: string | null }): string =>
    grenzeText(e.to, e.toDate);

  // Das frühere `jahrAusEingabe` ist mit BL-324 in den Kern gewandert und heißt dort
  // `grenzeAusEingabe` — es liest jetzt nicht mehr nur eine Zahl, sondern auch einen
  // Stichtag. Die Regel „geleertes Feld heißt offen (null), nicht 0" (Spec 11 §1) gilt
  // unverändert und steht dort.

  const otherPlaces = $derived(
    place ? Array.from(appState.db.placeObjects.values()).filter((p) => p.id !== place.id) : [],
  );

  function placeTitleFor(id: string): string {
    return placeDisplayName(appState.db.placeObjects.get(id)) || id;
  }

  function placeLabel(p: PlaceObject): string {
    return placeDisplayName(p);
  }

  function placeMatches(p: PlaceObject, query: string): boolean {
    return placeLabel(p).toLowerCase().includes(query.trim().toLowerCase());
  }

  function onBackdropKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onBackdropKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- Portaliert (BL-278, INV-UI-13/§6k): §6k nennt Modal-Backdrops namentlich unter
     „Wer portaliert" — bis hierher taten es die vier Konsumenten als einzige nicht. Der
     Backdrop liegt `position: fixed`, das trug bisher; es trägt aber nur, solange KEIN
     Vorfahre `transform`/`filter`/`contain`/`will-change` setzt (dann wird er der
     Containing Block, und erst dann klippt auch sein `overflow: auto`). Diese Bedingung
     ist nichts, worauf eine Overlay-Fläche sich verlassen darf. -->
<div class="stb-modal-backdrop" use:portal use:focusTrap onclick={onClose} role="presentation">
  <div
    class="place-enclosure-modal__panel"
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Verwaltungszugehörigkeit bearbeiten"
  >
    <div class="place-enclosure-modal__head">
      <h3>Verwaltungszugehörigkeit bearbeiten</h3>
      <button type="button" class="place-enclosure-modal__close-btn" onclick={onClose} aria-label="Schließen">✕</button>
    </div>

    {#if !place}
      <p class="place-enclosure-modal__muted">Ort nicht (mehr) gefunden.</p>
    {:else}
      <ul class="place-enclosure-modal__list">
        <!-- Der Zeitraum steht als ZWEI Eingabefelder da, nicht als Text in Klammern
             (ADR-v9-183): er ist Auswertungsgrundlage (`enclosureWinnerAsOf` → PLAC-
             Projektion, Verwaltungsgeschichte), und ein falsch getipptes Jahr kostete
             vorher Entfernen + Neuanlegen samt Positionswechsel im Array. Ein geleertes
             „von" ist der reguläre Weg zu einer nach unten offenen Zuordnung. -->
        {#each sortedEnclosedBy as { enc, originalIndex } (originalIndex)}
          <li>
            <span class="place-enclosure-modal__parent">{placeTitleFor(enc.placeId)}</span>
            <input
              type="text" {...PLAIN_FIELD}
              class="place-enclosure-modal__year"
              value={grenzeVon(enc)}
              placeholder="von"
              aria-label={`${placeTitleFor(enc.placeId)} — gültig von (Jahr oder Stichtag)`}
              onchange={(e) => {
                const g = grenzeAusFeld(e.currentTarget, grenzeVon(enc));
                if (g) updateEnclosedBySpan(originalIndex, g, grenzeAusEingabeSicher(grenzeBis(enc)));
              }}
            />
            <input
              type="text" {...PLAIN_FIELD}
              class="place-enclosure-modal__year"
              value={grenzeBis(enc)}
              placeholder="bis"
              aria-label={`${placeTitleFor(enc.placeId)} — gültig bis (Jahr oder Stichtag)`}
              onchange={(e) => {
                const g = grenzeAusFeld(e.currentTarget, grenzeBis(enc));
                if (g) updateEnclosedBySpan(originalIndex, grenzeAusEingabeSicher(grenzeVon(enc)), g);
              }}
            />
            <button type="button" class="place-enclosure-modal__remove-btn" onclick={() => removeEnclosedBy(originalIndex)} aria-label="Zugehörigkeit entfernen">✕</button>
          </li>
        {/each}
        {#if place.enclosedBy.length === 0}
          <li class="place-enclosure-modal__muted">Noch keine Verwaltungszugehörigkeit erfasst.</li>
        {/if}
      </ul>

      <div class="place-enclosure-modal__add-row">
        {#if creatingEnclosedParent}
          <!-- ADR-v9-42: eine einzelne, bewusste Nutzerhandlung im Editier-Modus ist
               strukturell identisch zu "+ Neue Person/Familie/Quelle/Archiv anlegen". -->
          <PlaceForm {appState} onSaved={onEnclosedParentCreated} onCancel={cancelCreateEnclosedParent} />
        {:else}
          <Picker
            items={otherPlaces}
            getId={(p) => p.id}
            getLabel={placeLabel}
            matches={placeMatches}
            value={newEnclosedParent || null}
            onChange={(id) => (newEnclosedParent = id ?? '')}
            label="Übergeordneter Ort"
            placeholder="Übergeordneten Ort wählen…"
            createLabel="+ neuen Ort anlegen …"
            onCreateRequested={beginCreateEnclosedParent}
          />
          <input
            type="text" {...PLAIN_FIELD}
            placeholder="von"
            bind:value={newEnclosedFrom}
            aria-label="Gültig von (Jahr oder Stichtag)"
          />
          <input
            type="text" {...PLAIN_FIELD}
            placeholder="bis"
            bind:value={newEnclosedTo}
            aria-label="Gültig bis (Jahr oder Stichtag)"
          />
        {#if grenzFehler}
          <p class="place-enclosure-modal__muted" role="alert">{grenzFehler}</p>
        {/if}
          <button type="button" onclick={addEnclosedBy}>+ Hinzufügen</button>
        {/if}
      </div>
    {/if}

    <div class="place-enclosure-modal__actions">
      <button type="button" class="place-enclosure-modal__done-btn" onclick={onClose}>Fertig</button>
    </div>
  </div>
</div>

<style>
  .place-enclosure-modal__panel {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
    padding: 1rem;
    max-width: 32rem;
    width: 100%;
  }

  .place-enclosure-modal__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .place-enclosure-modal__head h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--stb-gold-light);
  }

  .place-enclosure-modal__close-btn {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 1rem;
    padding: 0;
  }

  .place-enclosure-modal__muted {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .place-enclosure-modal__list {
    list-style: none;
    margin: 0.6rem 0 0;
    padding: 0;
  }

  .place-enclosure-modal__list li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--stb-surface-2);
    flex-wrap: wrap;
  }

  /* Der Elternort trägt die Zeile; die beiden Jahresfelder bleiben schmal daneben. */
  .place-enclosure-modal__parent {
    flex: 1 1 8rem;
    min-width: 0;
  }

  .place-enclosure-modal__year {
    width: 5rem;
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    font: inherit;
    font-size: 0.85rem;
    padding: 0.2rem 0.35rem;
  }

  .place-enclosure-modal__remove-btn {
    margin-left: auto;
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
  }

  .place-enclosure-modal__add-row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-top: 0.6rem;
  }

  .place-enclosure-modal__add-row input {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.5rem;
  }

  .place-enclosure-modal__add-row button {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }

  .place-enclosure-modal__actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1.1rem;
  }

  .place-enclosure-modal__done-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.45rem 1rem;
    cursor: pointer;
    font-weight: 600;
  }
</style>
