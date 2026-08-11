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
  import type { Person } from '../../../core/model/types';
  import { untrack } from 'svelte';
  import PersonDetailHeader from './PersonDetailHeader.svelte';
  import MediaThumb from '../../shell/MediaThumb.svelte';
  import { personPortrait, eventImages } from '../../shell/entity-media';
  import { primaryEventMenu, secondaryEventMenu, otherEventMenu } from './person-event-menu';
  import DeleteEntityButton from '../../shell/DeleteEntityButton.svelte';
  import EventEditModal from '../../shell/EventEditModal.svelte';
  import ChildLinkEditModal from '../../shell/ChildLinkEditModal.svelte';
  import EventTypeMenu from '../../shell/EventTypeMenu.svelte';
  import EventLine from '../../shell/EventLine.svelte';
  import { tooltip } from '../../shell/tooltip';
  import { displayName } from '../../shell/person-display';
  import { resolveProband } from '../../shell/proband';
  import { buildPersonDetail, type EventRow } from './person-detail-model';
  import { createPersonEventModal, eventForKey } from './person-event-modal.svelte';
  import PersonForm from './PersonForm.svelte';
  import PersonFamilySection from './PersonFamilySection.svelte';
  import ResearchSection from '../../shell/ResearchSection.svelte';
  import PersonAssociations from './PersonAssociations.svelte';
  import ProofSummaryNote from './ProofSummaryNote.svelte';
  import { makeEvent, makeAssociation } from '../../../core/model/factory';
  import { isEventPresent, isEventEmpty, isPersonEmpty } from '../../../core/model';
  import { retractIfPristine } from '../../shell/create-retraction';

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

  // Kindschafts-Editor (BL-329): der Zustand ist die familyId der Herkunftsfamilie, deren
  // Modal offen ist — dieselbe Komponente, die die Familien-Detailseite an ihrer
  // Kind-Zeile öffnet (EINE Fläche für beide Einstiege, INV-UI-4).
  let childLinkEdit = $state<string | null>(null);
  const childLink = $derived(
    childLinkEdit && detail ? detail.person.childOf.find((l) => l.familyId === childLinkEdit) ?? null : null,
  );

  /**
   * Läuft gerade eine ANLAGE-Sitzung (BL-275)? `startInEdit` setzt nur `entity-tab-
   * navigation` und nur direkt nach „＋ Neue Person" — der Wert ist damit die einzige
   * Auskunft dieser Fläche darüber, dass der Datensatz eben erst entstanden ist.
   * Eigener Zustand statt einer Ableitung aus `editing`: der Modus wird auf einer
   * bestehenden Person genauso geöffnet, die Anlage-Eigenschaft gilt aber nur einmal.
   */
  let freshlyCreated = $state(untrack(() => startInEdit));

  function goToPerson(id: string) {
    viewState.setCurrent('person', id);
  }

  /** Speichern schließt den Modus — die Transaktion ist abgeschlossen (INV-UI-16).
   *  „Verwerfen" im Formular darf das NICHT, es betrifft nur die Feldwerte. */
  function afterSave() {
    editing = false;
    // Ein bewusstes „Speichern" beendet die Anlage-Sitzung: ab hier ist der Datensatz
    // bestätigt, auch wenn er leer geblieben ist (INV-UI-10 schützt den unbestätigten
    // Zustand, nicht den bestätigten). Sonst nähme der nächste Ausgang eine Anlage
    // zurück, die der Nutzer gerade eben ausdrücklich abgeschlossen hat.
    freshlyCreated = false;
  }

  /**
   * Der Ausgang aus einer Anlage, an der nichts hängt (BL-275, INV-UI-10 — Regel und
   * Begründung in `create-retraction.ts`). Liefert `true`, wenn die Person entfernt
   * wurde; dann gibt es hier nichts mehr zu zeigen und der Rückweg ist Pflicht.
   */
  function retractIfAbandoned(): boolean {
    const weg = retractIfPristine({
      fresh: freshlyCreated,
      entity: detail?.person ?? null,
      isEmpty: isPersonEmpty,
      remove: (p) => appState.deletePerson(p.id),
    });
    if (weg) freshlyCreated = false;
    return weg;
  }

  /** „Fertig"/„✎ Identität" — derselbe Schalter (INV-UI-16). Schließt er eine leer
   *  gebliebene Neuanlage, ist das zugleich deren Rücknahme. */
  function toggleEdit() {
    if (editing && retractIfAbandoned()) {
      onBack?.();
      return;
    }
    editing = !editing;
  }

  /** „← Zurück" — der zweite Ausgang aus der Anlage-Sitzung, mit derselben Rücknahme.
   *  Ohne ihn bliebe die Leiche genau auf dem Weg zurück, den der zweifelnde Nutzer
   *  am ehesten nimmt. */
  function handleBack() {
    retractIfAbandoned();
    onBack?.();
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
   *  Spec 20 §2). Setzt `death` exakt auf den Ausgangszustand zurück, den `makePerson`
   *  selbst vergibt (`makeEvent('DEAT')`), statt einzelne Felder von Hand zurückzudrehen
   *  — eine Quelle für "was ist der unbefüllte Zustand".
   *
   *  ZWEI Aufrufer: das ✕ am kompakten "✓ Verstorben"-Indikator (bloßes Flag, folgenlos)
   *  UND `retractOrRemove('DEAT')` für die befüllte Tod-Zeile (dort mit `confirm` davor,
   *  s. `EventLine`). Deshalb setzt es `cause` explizit mit zurück statt sich darauf zu
   *  verlassen, dass es im kompakten Fall ohnehin '' ist. */
  function retractDeath() {
    if (!detail) return;
    const p = detail.person;
    const next: Person = { ...p, death: makeEvent('DEAT'), cause: '' };
    appState.savePerson(next);
  }

  /** Entfernen einer Ereigniszeile (Spec 20 §2) für JEDE Zeile außer BIRT. Direktes
   *  Kommando, kein Modal — derselbe Chokepoint (`appState.savePerson`, volles, geklontes
   *  Objekt) wie überall sonst. Sonder-Felder (Taufe/Tod/Bestattung) werden auf den
   *  unbefüllten Ausgangszustand zurückgesetzt (`makeEvent(tag)`); generische
   *  `events[]`-Einträge (`ev-${i}`-Key) werden aus dem Array entfernt (NICHT zurück-
   *  gesetzt — es gibt kein "unbefülltes Array-Element", das je wieder befüllt würde).
   *
   *  Diese Funktion prüft NICHT, ob das Ereignis leer ist: `EventLine` entscheidet, ob
   *  die Handlung sofort (leer, ✕) oder erst nach `confirm` (befüllt, 🗑) hier ankommt.
   *  Das Ergebnis ist in beiden Fällen dasselbe — ein Reset auf `makeEvent(tag)` bzw. ein
   *  Array-Splice.
   *
   *  **BIRT ist die einzige Ausnahme** (Aufrufer-Guard im Template, s. `eventRow`): die
   *  Geburtszeile ist `isEventPresent`-gegatet und hat keinen "+ Geburt"-Pill — gelöscht
   *  wäre sie ohne jede Affordanz aus der Fläche verschwunden.
   *
   *  DEAT delegiert an `retractDeath`, statt den Reset ein zweites Mal zu schreiben —
   *  dort hängt `cause` (Person-Feld, nicht Event-Feld) mit dran. Der kompakte
   *  "✓ Verstorben"-Zweig hat sein eigenes ✕ und läuft gar nicht durch `EventLine`. */
  function retractOrRemove(key: string) {
    if (!detail) return;
    const p = detail.person;
    if (key === 'DEAT') {
      retractDeath();
    } else if (key === 'CHR') {
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

  // Der Einzel-Ereignis-Editor (Zustand + Ableitungen + Rückschreib-Pfad) lebt seit
  // BL-275 in `person-event-modal.svelte.ts` (max-lines-Ratsche, dieselbe Aufteilung wie
  // `person-event-menu.ts`): WAS bearbeitet wird, gehört nicht in die Frage, WAS
  // gerendert wird. `untrack`, weil die Fabrik einmal je Mount entsteht und ihre
  // Abhängigkeiten selbst als Getter liest.
  const eventModal = untrack(() =>
    createPersonEventModal({ appState, detail: () => detail, clipboard }),
  );

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

  /** Heutiges Datum für neu angelegte Forschungseinträge (BL-341). Hier gebildet und
   *  hineingereicht, nicht in `ResearchSection`: dieselbe Form wie in TasksView/
   *  HypothesesView, und die Sektion selbst bleibt damit ohne Wall-Clock testbar (TST-3). */
  const heute = (): string => new Date().toISOString().slice(0, 10);

</script>

{#snippet eventRow(ev: EventRow)}
  {#if ev.key === 'DEAT' && deathCompact}
    <li class="person-detail__event">
      <div class="person-detail__event-head">
        <span class="person-detail__event-label">{ev.label}</span>
        <span class="person-detail__event-value">✓ Verstorben</span>
        <button type="button" class="stb-activation-pill" onclick={() => eventModal.openEdit('DEAT')}>
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
    <!-- Geburt behält als EINZIGE Zeile kein Entfernen-Control (Spec 20 §2, Begründung an
         `retractOrRemove`). DEAT kommt hier nur im BEFÜLLTEN Fall an — der kompakte
         "✓ Verstorben"-Zweig oben hat sein eigenes, folgenloses ✕. -->
    <EventLine
      {ev}
      {appState}
      {viewState}
      {onNavigateToPlace}
      {onNavigateToHof}
      {onNavigateToSource}
      {onNavigateLens}
      onRetract={ev.key !== 'BIRT' ? retractOrRemove : undefined}
      onEdit={(key) => eventModal.openEdit(key)}
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
         nur ein `<h3 class="stb-section-title">Person bearbeiten` ohne die Person. Jetzt wie bei Ort/Hof: Kopfzeile
         bleibt, das Formular erscheint darunter. -->
    <PersonDetailHeader
      person={detail.person}
      {isProband}
      {editing}
      onBack={handleBack}
      onToggleEdit={toggleEdit}
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
      <h3 class="stb-section-title">Ereignisse</h3>

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
        <button type="button" class="stb-activation-pill" onclick={() => eventModal.startCreate('RESI')}>+ Wohnort</button>
        <EventTypeMenu
          groups={[menuPrimary, menuSecondary]}
          otherItems={menuOther}
          onSelect={(tag) => eventModal.startCreate(tag)}
          pasteItem={clipboard?.event ? { label: `⧉ Übernehmen: ${clipboard.label}`, onSelect: () => eventModal.paste() } : undefined}
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

    {#if eventModal.event && eventModal.mode}
      <EventEditModal
        {appState}
        event={eventModal.event}
        label={eventModal.label}
        cause={eventModal.cause}
        mode={eventModal.mode}
        onSave={(ev, cause, derivedBirth) => eventModal.save(ev, cause, derivedBirth)}
        onClose={() => eventModal.close()}
        onCopy={clipboard && eventModal.copyable ? (ev) => eventModal.copy(ev) : undefined}
        allowDeriveBirth={true}
      />
    {/if}

    <PersonFamilySection
      {appState}
      personId={detail.person.id}
      families={detail.families}
      onGoToPerson={goToPerson}
      {onNavigateToFamily}
      {onNavigateToSource}
      sourceOf={(id) => appState.db.sources.get(id)}
      onEditChildLink={(familyId) => (childLinkEdit = familyId)}
    />

    {#if childLinkEdit && childLink}
      <ChildLinkEditModal
        {appState}
        personId={detail.person.id}
        personName={displayName(detail.person)}
        familyLabel={detail.families.find((f) => f.familyId === childLinkEdit)?.label ?? ''}
        link={childLink}
        onClose={() => (childLinkEdit = null)}
      />
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

    <!-- Forschung an DIESER Person (BL-341) — Aufgaben, Protokoll, Hypothesen anlegen und
         sehen, ohne den Umweg über die drei Forschungsansichten und das dortige
         Heraussuchen derselben Person. Steht hinter den Beziehungen und vor der
         Beweis-Zusammenfassung: erst die Daten, dann die Arbeit daran. -->
    <section class="person-detail__section">
      <ResearchSection {appState} kind="person" entityId={detail.person.id} heute={heute()} />
    </section>

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

  /* Der Abstand zwischen den Abschnitten gehört dem CONTAINER, nicht den Abschnitten
     (BL-342). Vorher trug ihn `.person-detail__section { margin-bottom }` — scoped, und
     damit wirkungslos für jeden Abschnitt, der in einer eigenen Komponente lebt
     (`PersonAssociations`, `PersonFamilySection`, `ResearchSection`). Im Screenshot des
     Nutzers standen die drei sichtbar enger beieinander als der Rest.

     `gap` statt `margin` ist zugleich die robustere Form: es kollabiert nicht, verdoppelt
     sich nicht, und es gilt für JEDES Kind — unabhängig davon, welche Komponente es
     rendert. Eine Extraktion kann den Rhythmus damit nicht mehr aus Versehen verlieren. */
  .person-detail {
    padding: 1rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .person-detail__empty {
    color: var(--stb-text-dim);
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
