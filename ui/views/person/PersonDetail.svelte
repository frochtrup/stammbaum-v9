<script lang="ts">
  // ui/views/person/PersonDetail.svelte — Personen-Detail (Spec 20 §1.4 [K]): Ereignisse,
  // Quellen-Badges §N (QUAY-Farbindikator), Geo-Links, Familien-Navigationszeilen.
  // "✎ Bearbeiten" öffnet PersonForm inline (jetzt NUR Identitätsfelder, ADR-v9-63) —
  // Ereignisse werden NICHT mehr über das Formular bearbeitet/angelegt, sondern direkt
  // hier über `EventEditModal` (✎ je Zeile, Bau-Auftrag ADR-v9-60) UND die gestufte
  // Ereignis-Pill-Reihe (ADR-v9-62/63): "☠ Verstorben markieren" (Direkt-Kommando, kein
  // Modal), "+ Wohnort"-Standing-Pill, "+ Ereignis"-Sammel-Menü (`EventTypeMenu.svelte`).
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import type { LensId } from '../../shell/lens-model';
  import type { EventClipboard } from '../../shell/event-clipboard.svelte';
  import type { MediaResolver } from '../../../services/media';
  import type { Person, Event } from '../../../core/model/types';
  import { untrack } from 'svelte';
  import PersonDetailHeader from './PersonDetailHeader.svelte';
  import MediaThumb from '../../shell/MediaThumb.svelte';
  import { personPortrait, eventImages } from '../../shell/entity-media';
  import { primaryEventMenu, secondaryEventMenu, otherEventMenu } from './person-event-menu';
  import DeleteEntityButton from '../../shell/DeleteEntityButton.svelte';
  import EventEditModal from '../../shell/EventEditModal.svelte';
  import EventTypeMenu from '../../shell/EventTypeMenu.svelte';
  import EventLine from '../../shell/EventLine.svelte';
  import { tooltip } from '../../shell/tooltip';
  import { displayName } from '../../shell/person-display';
  import { resolveProband } from '../../shell/proband';
  import { buildPersonDetail, type EventRow } from './person-detail-model';
  import PersonForm from './PersonForm.svelte';
  import PersonFamilies from './PersonFamilies.svelte';
  import PersonAssociations from './PersonAssociations.svelte';
  import ProofSummaryNote from './ProofSummaryNote.svelte';
  import { makeEvent, makeAssociation } from '../../../core/model/factory';
  import { isEventPresent, isEventEmpty } from '../../../core/model';
  import { eventTypeLabel } from '../../shell/event-labels';
  import { formatDateForDisplay } from '../../../core/model/gedcom-date';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Cross-Tab-Navigation zur Familien-Detailseite (optional — Tests/Kontexte ohne Familien-Tab). */
    onNavigateToFamily?: (familyId: string) => void;
    /** Cross-Tab-Navigation zur Quellen-Detailseite (optional — Tests/Kontexte ohne Quellen-Tab). */
    onNavigateToSource?: (sourceId: string) => void;
    /** Cross-Tab-Navigation zum Orte-Tab (optional — Tests/Kontexte ohne Orte-Tab). */
    onNavigateToPlace?: (placeId: string) => void;
    /** Cross-Tab-Navigation zum Höfe-Tab (optional — Tests/Kontexte ohne Höfe-Tab). */
    onNavigateToHof?: (hofId: string) => void;
    /** „Diese Person in Ansicht X" — Baum/Karte/Zeitleiste/Story über DEN EINEN
     *  Lens-Umschalter (BL-60, ADR-v9-153; ersetzt die vormaligen Einzel-Callbacks
     *  `onNavigateToTree`/`onOpenStory`). Optional — Tests/Kontexte ohne Lens-Fläche. */
    onOpenLens?: (personId: string, lens: LensId) => void;
    /** Cross-Tab-Navigation zur Karte-Lens (ADR-v9-78/80, `EventLine`/`CoordIndicator`)
     *  — optional, damit isolierte Tests/Kontexte ohne Lens-Umschalter weiterlaufen. */
    onNavigateLens?: (lens: LensId) => void;
    /** "← Zur Liste" (Spec 21 §6b: EINE gemeinsame Kopfzeile statt EntityTabs eigener
     *  Zeile) — optional, damit isolierte Tests/Kontexte ohne EntityTab weiterlaufen. */
    onBack?: () => void;
    /** Medien-Auflösung (BL-260) — optional; ohne sie bleibt das Porträt aus, weil ein
     *  Pfad-Bild ohne verbundenen Ordner keine Bytes hat. */
    mediaResolver?: MediaResolver;
    /** Ereignis-Zwischenablage der Sitzung (BL-212) — optional: ohne sie entfallen
     *  „⧉ Kopieren" und „⧉ Übernehmen" ersatzlos (Tests/Kontexte ohne Schale). */
    clipboard?: EventClipboard;
    /** Öffnet den Editor sofort beim Mount (z. B. direkt nach "＋ Neue Person", Spec 20 §2).
     *  Nur der Startwert zählt (untrack) — kein fortlaufendes Re-Öffnen bei jedem Re-Render. */
    startInEdit?: boolean;
  }
  const {
    appState,
    viewState,
    onNavigateToFamily,
    onNavigateToSource,
    onNavigateToPlace,
    onNavigateToHof,
    onOpenLens,
    onNavigateLens,
    onBack,
    clipboard,
    mediaResolver,
    startInEdit = false,
  }: Props = $props();

  const personId = $derived(viewState.getCurrent('person'));

  // Porträt (BL-260) — die Auswahl liegt in `entity-media.ts`, damit Steckbrief, Story
  // und Familienbuch dasselbe Bild wählen (kein zweiter Rechenweg).
  const portrait = $derived(personId ? personPortrait(appState.db, personId) : null);

  // Ist die angezeigte Person die effektive Referenzperson der Sitzung (Session-Proband,
  // sonst kleinste ID)? Steuert die Proband-Aktion im Kopf (BL-120, ADR-v9-135/139).
  const isProband = $derived(!!personId && resolveProband(appState.db, viewState) === personId);
  const detail = $derived(personId ? buildPersonDetail(appState.db, appState.placeContext, personId) : null);

  let editing = $state(untrack(() => startInEdit));

  function goToPerson(id: string) {
    viewState.setCurrent('person', id);
  }

  /** Speichern schließt den Modus — die Transaktion ist abgeschlossen (INV-UI-16).
   *  „Verwerfen" im Formular darf das NICHT, es betrifft nur die Feldwerte. */
  function afterSave() {
    editing = false;
  }

  // --- Ereignis-Kategorien: "Lebensdaten" (Geburt/Taufe/Tod/Bestattung) wird separat
  // gerendert (statt Teil der generischen Gruppen-Schleife), damit die Tod-Doppelaktion/
  // Wohnort-Standing-Pill/"+ Ereignis"-Menü GENAU zwischen Lebensdaten und den übrigen
  // Kategorien sitzen (Reihenfolge Spec 20 §2: "Geburt -> Tod -> Wohnort-Pill/Sammel-Menü
  // -> aktivierte/weitere Ereignisse"). ---
  const lebensdatenGroup = $derived(detail?.eventGroups.find((g) => g.type === 'Lebensdaten') ?? null);
  const remainingGroups = $derived(detail?.eventGroups.filter((g) => g.type !== 'Lebensdaten') ?? []);

  // --- Tod: zweistufig (ADR-v9-62) --------------------------------------------------
  const deathPresent = $derived(!!detail && isEventPresent(detail.person.death));
  /** Trägt der Tod-Block MEHR als das bloße Bool-Flag (81 % im Referenzbestand haben
   *  NUR `DEAT Y`, s. ADR-v9-62)? Dann zeigt die Zeile die volle Struktur (wie jedes
   *  andere Ereignis) statt der kompakten "✓ Verstorben"-Zeile. Nutzt die geteilte
   *  `isEventEmpty` (Nachtrag 2026-07-12, Spec 20 §2 „Generalisiert") mit `value`
   *  ausgeblendet (`value` zählt bei Tod bewusst NICHT mit — das ist genau das Bool-Flag
   *  'Y', keine "echte" Detailangabe, anders als bei generischen Ereignissen, wo `value`
   *  z. B. den Beruf trägt). `cause` (Person.cause, nicht Teil von Event) separat geprüft. */
  const deathHasDetails = $derived(
    !!detail &&
      (!isEventEmpty({ ...detail.person.death, value: '' }) || detail.person.cause !== ''),
  );
  const deathCompact = $derived(deathPresent && !deathHasDetails);

  function markDeceased() {
    if (!detail) return;
    const p = detail.person;
    const next: Person = { ...p, death: { ...p.death, seen: true, value: 'Y' } };
    appState.savePerson(next);
  }

  /** Rücknahme von "Verstorben markieren" (Nachtrag 2026-07-12 zu ADR-v9-62/63,
   *  Spec 20 §2) — nur erreichbar, solange `deathCompact` gilt (bloßes Flag, keine
   *  echten Daten, per Template-Guard sichergestellt). Setzt `death` exakt auf den
   *  Ausgangszustand zurück, den `makePerson` selbst vergibt (`makeEvent('DEAT')`),
   *  statt einzelne Felder von Hand zurückzudrehen — eine Quelle für "was ist der
   *  unbefüllte Zustand". `cause` ist an dieser Stelle bereits '' (sonst wäre
   *  `deathHasDetails` true und die Zeile gar nicht kompakt), wird hier trotzdem
   *  explizit mitgesetzt für Symmetrie zu `saveModal`s DEAT-Zweig. */
  function retractDeath() {
    if (!detail) return;
    const p = detail.person;
    const next: Person = { ...p, death: makeEvent('DEAT'), cause: '' };
    appState.savePerson(next);
  }

  /** Generalisierte ✕-Rücknahme (Nachtrag 2026-07-12, Spec 20 §2 „Generalisiert") für JEDE
   *  Ereigniszeile außer BIRT (immer offen, nicht rücknehmbar) UND DEAT (eigener, oben
   *  bereits bestehender Pfad `retractDeath`, andere Leer-Semantik bei `value`). Direktes
   *  Kommando, kein Modal — derselbe Chokepoint (`appState.savePerson`, volles, geklontes
   *  Objekt) wie überall sonst. Sonder-Felder (Taufe/Bestattung) werden auf den
   *  unbefüllten Ausgangszustand zurückgesetzt (`makeEvent(tag)`, wie bei Tod); generische
   *  `events[]`-Einträge (`ev-${i}`-Key) werden aus dem Array entfernt (NICHT zurück-
   *  gesetzt — es gibt kein "unbefülltes Array-Element", das je wieder befüllt würde). Nur
   *  über den Template-Guard `ev.empty` erreichbar — kein Bestätigungsdialog nötig, weil
   *  ausschließlich der leere/folgenlose Fall betroffen ist (kein allgemeiner Lösch-
   *  Mechanismus für recherchierte Ereignisse, s. Spec-Abgrenzung). */
  function retractOrRemove(key: string) {
    if (!detail) return;
    const p = detail.person;
    if (key === 'CHR') {
      appState.savePerson({ ...p, chr: makeEvent('CHR') });
    } else if (key === 'BURI') {
      appState.savePerson({ ...p, buri: makeEvent('BURI') });
    } else if (key.startsWith('ev-')) {
      const idx = Number(key.slice(3));
      appState.savePerson({ ...p, events: p.events.filter((_, i) => i !== idx) });
    }
  }

  // Das „+ Ereignis"-Sammelmenü lebt seit BL-260 in `person-event-menu.ts` (max-lines-
  // Ratsche): welche Typen noch angeboten werden, ist eine reine Projektion über die
  // Person und braucht diese Komponente nicht.
  const menuPrimary = $derived(primaryEventMenu(detail?.person ?? null));
  const menuSecondary = $derived(secondaryEventMenu(detail?.person ?? null));
  const menuOther = otherEventMenu;

  // --- Einzel-Ereignis-Editor (✎-Icon je Zeile, ADR-v9-60) + Neu-Anlage (ADR-v9-63) —
  // EIN Modal-Zustand für beide Aufrufarten: `edit` (bestehende Zeile, Row-`key` wie in
  // person-detail-model.ts's toEventRow: 'BIRT'/'CHR'/'DEAT'/'BURI'/`ev-${i}`) ODER
  // `create` (frisch angelegtes Event eines GEDCOM-Tags, `makeEvent(tag)`). ---
  type ModalState = { kind: 'edit'; key: string } | { kind: 'create'; tag: string };
  let modal = $state<ModalState | null>(null);

  /** Liest das rohe Event-Objekt aus der Person für einen Row-key (Kehrseite von
   *  toEventRow's key-Vergabe). */
  function eventForKey(p: Person, key: string): Event {
    if (key === 'BIRT') return p.birth;
    if (key === 'CHR') return p.chr;
    if (key === 'DEAT') return p.death;
    if (key === 'BURI') return p.buri;
    return p.events[Number(key.slice(3))];
  }

  function openEventEdit(key: string) {
    modal = { kind: 'edit', key };
  }

  /** Sonder-Ereignis-Pills (Taufe/Bestattung) UND generische Neu-Anlage (Wohnort-
   *  Standing-Pill, "+ Ereignis"-Menü, "andere Typ"-Fallback) laufen über denselben
   *  Neu-Modus — der Aufrufer (saveModal) entscheidet anhand des Tags, ob das Ergebnis
   *  ein Sonder-Feld ersetzt oder zu `events[]` hinzugefügt wird. */
  function startCreate(tag: string) {
    modal = { kind: 'create', tag };
  }

  function closeModal() {
    modal = null;
  }

  /** Zwischenablage (BL-212): kopieren aus dem Editor, einfügen über das „+ Ereignis"-
   *  Menü. Das eingefügte Ereignis wird direkt angehängt — es ist bereits vollständig,
   *  ein leerer Editor-Zwischenschritt wäre nur ein Klick mehr. */
  /** Beschriftung der Ablage: Typ + der Wert, der das Ereignis unterscheidbar macht,
   *  + Herkunftsperson (Design-Kritik 2026-07-31 — „⧉ Übernehmen: Beruf" verriet weder,
   *  WELCHER Beruf noch VON WEM; nach ein paar Minuten ist das nicht mehr erratbar). */
  function copyEvent(ev: Event) {
    if (!detail) return;
    const typ = eventTypeLabel(ev.type);
    const wert = ev.value || ev.addr || ev.place || '';
    const wer = displayName(detail.person) || detail.person.id;
    clipboard?.copy(ev, wert ? `${typ} (${wert}) von ${wer}` : `${typ} von ${wer}`);
  }

  /** Kopieren gibt es NUR für generische `events[]`-Einträge, nicht für die vier
   *  Sonder-Felder (BIRT/CHR/DEAT/BURI): eingefügt landet ein Ereignis immer in `events[]`,
   *  ein dort abgelegtes DEAT erzeugte also eine ZWEITE `1 DEAT`-Zeile im Export neben
   *  `person.death` — beim nächsten Laden gewönne eine davon still (dieselbe Falle wie
   *  RELI, ADR-v9-156). */
  const copyable = $derived(modal?.kind === 'edit' && modal.key.startsWith('ev-'));

  function pasteEvent() {
    if (!detail || !clipboard) return;
    const ev = clipboard.take();
    if (!ev) return;
    appState.savePerson({ ...detail.person, events: [...detail.person.events, ev] });
  }

  /** Assoziationen (BL-127) — dasselbe Kommando-Chokepoint-Muster wie `saveModal`:
   *  vollständige Person an `savePerson`, kein Feld-Setter. Bestehende Einträge werden
   *  unverändert durchgereicht, damit `grampsHandle` und Zitate erhalten bleiben (die
   *  Zeilen-Projektion trägt sie nicht — sie zu „ersetzen" hieße, sie zu verlieren). */
  function addAssociation(personId: string, role: string, note: string) {
    if (!detail) return;
    const p = detail.person;
    appState.savePerson({ ...p, associations: [...p.associations, makeAssociation(personId, { role, note })] });
  }

  function removeAssociation(index: number) {
    if (!detail) return;
    const p = detail.person;
    appState.savePerson({ ...p, associations: p.associations.filter((_, i) => i !== index) });
  }

  const modalEvent = $derived.by<Event | null>(() => {
    if (!detail || !modal) return null;
    if (modal.kind === 'edit') return eventForKey(detail.person, modal.key);
    return makeEvent(modal.tag);
  });

  const modalLabel = $derived.by<string>(() => {
    if (!detail || !modal) return '';
    // Lokale Kopie: im `.find()`-Callback verliert TypeScript sonst die Einschränkung
    // auf `kind === 'edit'` (Closure über eine mutable `let`-Variable — TS muss
    // annehmen, sie könne sich zwischen Check und Aufruf ändern). Zur Laufzeit
    // harmlos (`.find` ist synchron), aber svelte-check meldet es zu Recht.
    const m = modal;
    if (m.kind === 'edit') {
      const row = detail.events.find((r) => r.key === m.key);
      return row?.label ?? eventTypeLabel(m.key);
    }
    return eventTypeLabel(m.tag);
  });

  const modalCause = $derived(modal?.kind === 'edit' && modal.key === 'DEAT' ? (detail?.person.cause ?? '') : null);

  /** Speichert das im Modal bearbeitete/angelegte Event zurück — klont die Person,
   *  ersetzt NUR das betroffene Feld (Sonder-Ereignis-Feld ODER events[Index]) bzw. hängt
   *  ein frisch angelegtes generisches Event an `events[]` an, und ruft
   *  appState.savePerson(model) mit dem VOLLSTÄNDIGEN Objekt auf (Spec 02 §3 Kommando-
   *  Chokepoint, kein Feld-Setter-Pattern). `cause` (Todesursache) wird nur bei
   *  key==='DEAT' übernommen (lebt auf Person.cause, nicht am Event). */
  function saveModal(updated: Event, cause: string, derivedBirth: string | null = null) {
    if (!detail || !modal) return;
    const p = detail.person;
    const next: Person = { ...p };
    if (modal.kind === 'edit') {
      const key = modal.key;
      if (key === 'BIRT') next.birth = updated;
      else if (key === 'CHR') next.chr = updated;
      else if (key === 'DEAT') {
        next.death = updated;
        next.cause = cause;
      } else if (key === 'BURI') next.buri = updated;
      else {
        const idx = Number(key.slice(3));
        next.events = p.events.map((e, i) => (i === idx ? updated : e));
      }
    } else {
      const tag = modal.tag;
      if (tag === 'CHR') next.chr = updated;
      else if (tag === 'BURI') next.buri = updated;
      else next.events = [...p.events, updated];
    }
    // Im Dialog vorgemerktes Geburtsdatum (BL-212/ADR-v9-168) im SELBEN Kommando
    // schreiben — ein Speichern, ein Undo-Schritt. Ein vorhandenes Datum wird nie still
    // überschrieben; sagt der Nutzer hier Nein, bleibt der Rest der Änderung trotzdem.
    if (derivedBirth) {
      const vorhanden = next.birth.date;
      const label = formatDateForDisplay(derivedBirth);
      if (!vorhanden || window.confirm(`Geburtsdatum ist bereits „${formatDateForDisplay(vorhanden)}". Durch „${label}" ersetzen?`)) {
        next.birth = { ...next.birth, date: derivedBirth };
      }
    }
    appState.savePerson(next);
    modal = null;
  }
</script>

{#snippet eventRow(ev: EventRow)}
  {#if ev.key === 'DEAT' && deathCompact}
    <li class="person-detail__event">
      <div class="person-detail__event-head">
        <span class="person-detail__event-label">{ev.label}</span>
        <span class="person-detail__event-value">✓ Verstorben</span>
        <button type="button" class="stb-activation-pill" onclick={() => openEventEdit('DEAT')}>
          + Datum/Ort ergänzen
        </button>
        <button
          type="button"
          class="stb-icon-btn person-detail__death-retract-btn"
          data-variant="danger"
          onclick={retractDeath}
          aria-label="Verstorben-Markierung zurücknehmen"
          use:tooltip={'Zurücknehmen'}
        >
          ✕
        </button>
      </div>
    </li>
  {:else}
    <EventLine
      {ev}
      {appState}
      {viewState}
      {onNavigateToPlace}
      {onNavigateToHof}
      {onNavigateToSource}
      {onNavigateLens}
      onRetract={ev.key !== 'DEAT' ? retractOrRemove : undefined}
      onEdit={openEventEdit}
      images={detail ? eventImages(appState.db, eventForKey(detail.person, ev.key)) : []}
      {mediaResolver}
    />
  {/if}
{/snippet}

<div class="person-detail">
  {#if !personId}
    <p class="person-detail__empty">Keine Person ausgewählt.</p>
  {:else if !detail}
    <p class="person-detail__empty">Person nicht gefunden (evtl. gelöscht oder Datei gewechselt).</p>
  {:else}
    <!-- BL-274/INV-UI-16: der Editor ERSETZT die Seite nicht mehr. Vorher stand hier ein
         `{:else if editing}`-Zweig VOR der Kopfzeile — damit verschwanden Titel und
         Rückweg genau in dem Moment, in dem der Nutzer den Namen ändert, und es blieb
         nur ein `<h3>Person bearbeiten` ohne die Person. Jetzt wie bei Ort/Hof: Kopfzeile
         bleibt, das Formular erscheint darunter. -->
    <PersonDetailHeader
      person={detail.person}
      {isProband}
      {editing}
      onBack={onBack ?? (() => {})}
      onToggleEdit={() => (editing = !editing)}
      onSetProband={() => viewState.setProband(detail.person.id)}
      {onOpenLens}
    />

    {#if editing}
      <PersonForm {appState} person={detail.person} onSaved={afterSave} />
    {/if}

    <!-- Porträt (BL-260): das als `_PRIM` markierte Bild der Person, sonst ihr erstes.
         Reine ANZEIGE — verwaltet wird in der Medien-Fläche (INV-UI-11, kein neues
         Bedienelement). Erscheint nur, wenn es ein Bild GIBT und es auflösbar ist;
         `MediaThumb` entscheidet das, nicht diese View. -->
    {#if portrait}
      <figure class="person-detail__portrait">
        <MediaThumb
          file={portrait.file}
          form={portrait.form}
          alt={portrait.title || displayName(detail.person)}
          resolver={mediaResolver}
          size="inline"
        />
      </figure>
    {/if}

    <section class="person-detail__section">
      <h3>Ereignisse</h3>

      {#if lebensdatenGroup}
        <h4 class="person-detail__event-category">{lebensdatenGroup.type}</h4>
        <ul class="person-detail__events">
          {#each lebensdatenGroup.rows as ev (ev.key)}
            {@render eventRow(ev)}
          {/each}
        </ul>
      {/if}

      <div class="stb-activation-pill-row person-detail__quick-actions">
        {#if !deathPresent}
          <button type="button" class="stb-activation-pill" onclick={markDeceased}>☠ Verstorben markieren</button>
        {/if}
        <button type="button" class="stb-activation-pill" onclick={() => startCreate('RESI')}>+ Wohnort</button>
        <EventTypeMenu
          groups={[menuPrimary, menuSecondary]}
          otherItems={menuOther}
          onSelect={startCreate}
          pasteItem={clipboard?.event ? { label: `⧉ Übernehmen: ${clipboard.label}`, onSelect: pasteEvent } : undefined}
          clearItem={clipboard?.event ? { label: '⧉ Ablage leeren', onSelect: () => clipboard.clear() } : undefined}
        />
      </div>

      {#each remainingGroups as group (group.type)}
        <h4 class="person-detail__event-category">{group.type}</h4>
        <ul class="person-detail__events">
          {#each group.rows as ev (ev.key)}
            {@render eventRow(ev)}
          {/each}
        </ul>
      {/each}
    </section>

    {#if modal && modalEvent}
      <EventEditModal
        {appState}
        event={modalEvent}
        label={modalLabel}
        cause={modalCause}
        mode={modal.kind}
        onSave={saveModal}
        onClose={closeModal}
        onCopy={clipboard && copyable ? copyEvent : undefined}
        allowDeriveBirth={true}
      />
    {/if}

    {#if detail.families.length > 0}
      <section class="person-detail__section">
        <h3>Familien</h3>
        <PersonFamilies families={detail.families} onGoToPerson={goToPerson} {onNavigateToFamily} />
      </section>
    {/if}

    <PersonAssociations
      {appState}
      rows={detail.associations}
      godchildren={detail.godchildren}
      selfId={detail.person.id}
      onGoToPerson={goToPerson}
      onAdd={addAssociation}
      onRemove={removeAssociation}
    />

    {#if detail.person.hypotheses.length > 0}
      <ProofSummaryNote person={detail.person} />
    {/if}
    <DeleteEntityButton
      label="Person löschen"
      message={`Person „${displayName(detail.person) || detail.person.id}" wirklich löschen? Sie wird aus allen Familien, Assoziationen und Patenschaften entfernt; eine dadurch leer werdende Familie wird mitgelöscht. Andere Personen und Ereignisse bleiben bestehen.`}
      onConfirm={() => {
        appState.deletePerson(detail.person.id);
        editing = false;
        onBack?.();
      }}
    />
  {/if}
</div>

<style>
  /* Das Porträt begleitet den Kopf, es führt die Seite nicht an — linksbündig und klein
     genug, dass „Ereignisse" ohne Scrollen sichtbar bleibt (INV-UI-5). */
  .person-detail__portrait {
    margin: 0.5rem 1rem 0;
  }

  .person-detail {
    padding: 1rem;
    overflow-y: auto;
  }

  .person-detail__empty {
    color: var(--stb-text-dim);
  }

  .person-detail__section {
    margin-bottom: 1.25rem;
  }

  .person-detail__section h3 {
    font-size: 0.95rem;
    color: var(--stb-gold-light);
    margin-bottom: 0.4rem;
  }

  .person-detail__events {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* Kategorie-Header (Nutzer-Vorgabe 2026-07-10: Lebensdaten/Bildung/Beruf/Wohnen &
     Eigentum/Weitere Ereignisse, event-labels.ts EVENT_CATEGORY_ORDER) — visuell
     angeglichen an EventsByType.svelte's Gruppen-Header (INV-UI-4-Stil), hier nicht die
     Komponente selbst wiederverwendet, weil eine Ereigniszeile HIER zweiteilig ist
     (Kopfzeile + optionale Notiz-Zeile) — EventsByType's <li> ist als reine `flex-row`
     ausgelegt (passt für PlaceDetail/SourceDetail's einzeiligen Zeilen, nicht hier). */
  .person-detail__event-category {
    font-size: 0.78rem;
    color: var(--stb-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin: 0.6rem 0 0.3rem;
  }

  .person-detail__event-category:first-of-type {
    margin-top: 0;
  }

  /* Gestufte Ereignis-Pill-Reihe (ADR-v9-62/63): Tod-Doppelaktion/Wohnort-Standing-Pill/
     "+ Ereignis"-Menü sitzen zwischen der Lebensdaten-Kategorie und den übrigen
     Kategorien — eigener Abstand oben/unten statt in den Kategorie-Rhythmus verwoben. */
  .person-detail__quick-actions {
    margin: 0.5rem 0 0.75rem;
  }

  /* Kompakteres Padding/Abstand (Nutzer-Fund 2026-07-10, "Kompaktheit ist das Ziel") —
     vorher 0.6rem/0.8rem Padding + 0.5rem Margin wirkte pro Ereignis überproportional
     groß neben den schlanken Identitäts-Feldern. */
  .person-detail__event {
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
    padding: 0.4rem 0.65rem;
    margin-bottom: 0.3rem;
  }

  .person-detail__event-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
  }

  .person-detail__event-label {
    font-weight: 700;
  }

  .person-detail__event-value {
    color: var(--stb-text);
    font-size: 0.85rem;
  }

  /* Rücknahme-Control der kompakten Tod-Zeile (Nachtrag 2026-07-12): visueller Stil kommt
     aus dem geteilten `.stb-pill__remove` (design-system.css, INV-UI-4 — selber "✕"-
     Mechanismus wie PlaceDetail's Namensvarianten-Entfernen), hier nur die Positionierung
     als letztes Kind der Flex-Kopfzeile (TST-11: margin-left:auto NUR auf ein Element, das
     garantiert das letzte in der Zeile ist — hier zutreffend, da unconditionally zuletzt
     gerendert). Die generische (nicht-kompakte) Ereigniszeile lebt seit ADR-v9-80 in
     `EventLine.svelte` (`ui/shell/`) — deren `.event-line__*`-Klassen dort, nicht hier. */
  .person-detail__death-retract-btn {
    margin-left: auto;
    flex: 0 0 auto;
  }

</style>
