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
  import type { Person, Event } from '../../../core/model/types';
  import { untrack } from 'svelte';
  import PersonDetailHeader from './PersonDetailHeader.svelte';
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
  import ProofSummaryNote from './ProofSummaryNote.svelte';
  import { makeEvent } from '../../../core/model/factory';
  import { isEventPresent, isEventEmpty } from '../../../core/model';
  import { eventTypeLabel } from '../../shell/event-labels';

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
    startInEdit = false,
  }: Props = $props();

  const personId = $derived(viewState.getCurrent('person'));

  // Ist die angezeigte Person die effektive Referenzperson der Sitzung (Session-Proband,
  // sonst kleinste ID)? Steuert die Proband-Aktion im Kopf (BL-120, ADR-v9-135/139).
  const isProband = $derived(!!personId && resolveProband(appState.db, viewState) === personId);
  const detail = $derived(personId ? buildPersonDetail(appState.db, appState.placeContext, personId) : null);

  let editing = $state(untrack(() => startInEdit));

  function goToPerson(id: string) {
    viewState.setCurrent('person', id);
  }

  function startEdit() {
    editing = true;
  }

  function cancelEdit() {
    editing = false;
  }

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

  // --- "+ Ereignis"-Sammel-Menü (ADR-v9-62): Taufe/Beruf/Bestattung zuerst (zweite
  // Häufigkeits-Gruppe), dann EVEN/Eigentum/Auswanderung/Abschluss/Ausbildung. Jedes
  // Item verschwindet, sobald es nicht mehr "leer/nicht vorhanden" ist ("gefüllt schlägt
  // selten") — der generische "andere Typ"-Fallback (`otherItems`, unverändert
  // erreichbar für IMMI/MILI/CENS/NATU/ADOP/FACT UND Duplikate) bleibt davon unberührt. */
  function hasEventType(tag: string): boolean {
    return !!detail && detail.person.events.some((e) => e.type === tag);
  }

  interface MenuItem {
    tag: string;
    label: string;
  }

  const menuPrimary = $derived.by<MenuItem[]>(() => {
    if (!detail) return [];
    const list: MenuItem[] = [];
    if (!isEventPresent(detail.person.chr)) list.push({ tag: 'CHR', label: eventTypeLabel('CHR') });
    if (!hasEventType('OCCU')) list.push({ tag: 'OCCU', label: eventTypeLabel('OCCU') });
    if (!isEventPresent(detail.person.buri)) list.push({ tag: 'BURI', label: eventTypeLabel('BURI') });
    return list;
  });

  const menuSecondary = $derived.by<MenuItem[]>(() => {
    if (!detail) return [];
    return ['EVEN', 'PROP', 'EMIG', 'GRAD', 'EDUC']
      .filter((t) => !hasEventType(t))
      .map((t) => ({ tag: t, label: eventTypeLabel(t) }));
  });

  /** Generischer "beliebiger Typ"-Fallback (unverändert zum bisherigen Typ-Dropdown-
   *  Mechanismus in PersonForm, Spec 20 §2) — bleibt für ALLE übrigen GEDCOM-Typen
   *  (inkl. der sechs, die ihren eigenen Pill-Platz verloren haben) UND für Duplikate
   *  bereits benannter Typen (z. B. Berufswechsel) erreichbar. */
  const OTHER_EVENT_TYPES = [
    'OCCU', 'RESI', 'EDUC', 'EMIG', 'IMMI', 'NATU', 'EVEN', 'GRAD', 'ADOP', 'MILI', 'FACT', 'CENS', 'PROP',
  ] as const;
  const menuOther: MenuItem[] = OTHER_EVENT_TYPES.map((t) => ({ tag: t, label: eventTypeLabel(t) }));

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
  function saveModal(updated: Event, cause: string) {
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
          class="stb-pill__remove person-detail__death-retract-btn"
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
    />
  {/if}
{/snippet}

<div class="person-detail">
  {#if !personId}
    <p class="person-detail__empty">Keine Person ausgewählt.</p>
  {:else if !detail}
    <p class="person-detail__empty">Person nicht gefunden (evtl. gelöscht oder Datei gewechselt).</p>
  {:else if editing}
    <PersonForm {appState} person={detail.person} onSaved={afterSave} onCancel={cancelEdit} />
  {:else}
    <PersonDetailHeader
      person={detail.person}
      {isProband}
      onBack={onBack ?? (() => {})}
      onEdit={startEdit}
      onSetProband={() => viewState.setProband(detail.person.id)}
      {onOpenLens}
    />

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
        <EventTypeMenu groups={[menuPrimary, menuSecondary]} otherItems={menuOther} onSelect={startCreate} />
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
      />
    {/if}

    {#if detail.families.length > 0}
      <section class="person-detail__section">
        <h3>Familien</h3>
        <PersonFamilies families={detail.families} onGoToPerson={goToPerson} {onNavigateToFamily} />
      </section>
    {/if}

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
