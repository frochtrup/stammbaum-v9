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
  import type { Person, Event } from '../../../core/model/types';
  import { untrack } from 'svelte';
  import SourceBadge from '../../shell/SourceBadge.svelte';
  import DetailHeader from '../../shell/DetailHeader.svelte';
  import EventEditModal from '../../shell/EventEditModal.svelte';
  import EventTypeMenu from '../../shell/EventTypeMenu.svelte';
  import { displayName } from '../../shell/person-display';
  import { buildPersonDetail, type EventRow } from './person-detail-model';
  import PersonForm from './PersonForm.svelte';
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
    /** "Im Baum anzeigen" (optional — Tests/Kontexte ohne Baum-Tab, Spec 20 §1.3 [K]). */
    onNavigateToTree?: (personId: string) => void;
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
    onNavigateToTree,
    onBack,
    startInEdit = false,
  }: Props = $props();

  const personId = $derived(viewState.getCurrent('person'));
  const detail = $derived(personId ? buildPersonDetail(appState.db, appState.placeContext, personId) : null);

  let editing = $state(untrack(() => startInEdit));

  function geoHref(coords: { lat: number; long: number }): string {
    return `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.long}#map=12/${coords.lat}/${coords.long}`;
  }

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
    if (modal.kind === 'edit') {
      const row = detail.events.find((r) => r.key === modal.key);
      return row?.label ?? eventTypeLabel(modal.key);
    }
    return eventTypeLabel(modal.tag);
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
          title="Zurücknehmen"
        >
          ✕
        </button>
      </div>
    </li>
  {:else}
    <li class="person-detail__event">
      <div class="person-detail__event-head">
        <span class="person-detail__event-label">{ev.label}</span>
        {#if ev.value}<span class="person-detail__event-value">{ev.value}</span>{/if}
        {#if ev.addr}<span class="person-detail__event-value">{ev.addr}</span>{/if}
        {#if ev.summary}<span class="person-detail__event-summary">{ev.summary}</span>{/if}
        {#if ev.coords}
          <a class="person-detail__geo-link" href={geoHref(ev.coords)} target="_blank" rel="noopener noreferrer">
            Karte ↗
          </a>
        {/if}
        {#if ev.hofId && onNavigateToHof}
          <button type="button" class="person-detail__place-link" onclick={() => onNavigateToHof(ev.hofId!)}>
            Hof ansehen →
          </button>
        {:else if ev.placeId && onNavigateToPlace}
          <button type="button" class="person-detail__place-link" onclick={() => onNavigateToPlace(ev.placeId!)}>
            Ort ansehen →
          </button>
        {/if}
        {#each ev.citations as cit, i (i)}
          <SourceBadge citation={cit} source={appState.db.sources.get(cit.sourceId)} onSelect={onNavigateToSource} />
        {/each}
        <span class="person-detail__event-actions">
          {#if ev.empty && ev.key !== 'DEAT'}
            <button
              type="button"
              class="stb-pill__remove"
              onclick={() => retractOrRemove(ev.key)}
              aria-label={`${ev.label} zurücknehmen`}
              title="Zurücknehmen"
            >
              ✕
            </button>
          {/if}
          <button
            type="button"
            class="person-detail__event-edit-btn"
            onclick={() => openEventEdit(ev.key)}
            aria-label={`${ev.label} bearbeiten`}
          >
            ✎
          </button>
        </span>
      </div>
      {#if ev.note}<p class="person-detail__event-note">{ev.note}</p>{/if}
    </li>
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
    <DetailHeader title={displayName(detail.person)} onBack={onBack ?? (() => {})}>
      {#snippet actions()}
        <button type="button" class="person-detail__edit-btn" onclick={startEdit}>✎ Bearbeiten</button>
        {#if onNavigateToTree}
          <button
            type="button"
            class="person-detail__tree-link"
            onclick={() => onNavigateToTree(detail.person.id)}
          >
            ⧖ Im Baum anzeigen
          </button>
        {/if}
      {/snippet}
    </DetailHeader>

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
        <ul class="person-detail__families">
          {#each detail.families as fam (fam.familyId + fam.role)}
            <li>
              <span class="stb-role-label">
                {fam.role === 'parentIn' ? 'Eigene Familie' : 'Herkunftsfamilie'}
              </span>
              {#if fam.members.length === 0}
                <span class="person-detail__family-label">{fam.label}</span>
              {:else}
                {#each fam.members as member (member.personId)}
                  <button
                    type="button"
                    class="person-detail__family-link"
                    onclick={() => goToPerson(member.personId)}
                  >
                    {member.name}
                  </button>
                {/each}
              {/if}
              {#if fam.children.length > 0}
                <span class="person-detail__family-children">
                  <span class="person-detail__family-children-label">Kinder:</span>
                  {#each fam.children as child, i (child.personId)}
                    <button
                      type="button"
                      class="person-detail__family-link"
                      onclick={() => goToPerson(child.personId)}
                    >
                      {child.name}{#if child.summary}<span class="person-detail__family-children-summary">({child.summary})</span>{/if}
                    </button>{#if i < fam.children.length - 1}<span class="person-detail__family-children-sep">,</span>{/if}
                  {/each}
                </span>
              {/if}
              {#if onNavigateToFamily}
                <button
                  type="button"
                  class="person-detail__family-detail-link"
                  onclick={() => onNavigateToFamily(fam.familyId)}
                  title="Familien-Detail öffnen"
                >
                  Familie ansehen →
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}
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

  .person-detail__tree-link {
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    color: var(--stb-gold-light);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.6rem;
    font-size: 0.78rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .person-detail__edit-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
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

  .person-detail__event-summary {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .person-detail__event-value {
    color: var(--stb-text);
    font-size: 0.85rem;
  }

  .person-detail__geo-link {
    font-size: 0.78rem;
  }

  .person-detail__place-link {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    padding: 0;
    font: inherit;
    font-size: 0.78rem;
    text-decoration: underline;
  }

  /* Aktions-Gruppe (✕-Rücknahme, Nachtrag 2026-07-12, + ✎-Bearbeiten, Bau-Auftrag
     "Ereignis direkt aus der Detail-Ansicht bearbeiten"): IMMER das letzte Kind der
     Kopfzeile (unconditionally nach allen anderen Elementen gerendert) — deshalb
     margin-left:auto auf DIESEM Wrapper statt auf :last-child eines bedingt vorhandenen
     Geschwisters (TST-11-Lehre: margin-left:auto nur auf ein Element, das garantiert das
     letzte in der Flex-Zeile ist). Das ✕-Control innerhalb des Wrappers ist bedingt
     (`ev.empty`) — ein zweites eigenes margin-left:auto darauf wäre die TST-11-Falle
     (zwei Auto-Margins auf derselben Achse teilen sich den Freiraum, statt dass beide
     Buttons zusammen am Rand kleben) — deshalb EIN Wrapper, normale `gap`-Abstände
     zwischen ✕ und ✎ darin. Ersetzt das vormalige `.person-detail__geo-link:last-child`-
     Muster, das nie mehr zutrifft, weil dieser Wrapper immer danach folgt. Gilt genauso
     für die kompakte Tod-Zeile (`.stb-activation-pill`/`.stb-pill__remove` als
     letzte/einzige interaktive Kinder dort, kein gemeinsamer Wrapper nötig). */
  .person-detail__event-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex: 0 0 auto;
  }

  .person-detail__event-edit-btn {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    padding: 0;
    font-size: 0.85rem;
    line-height: 1;
    flex: 0 0 auto;
  }

  .person-detail__event-edit-btn:hover,
  .person-detail__event-edit-btn:focus-visible {
    color: var(--stb-gold-light);
  }

  /* Rücknahme-Control der kompakten Tod-Zeile (Nachtrag 2026-07-12): visueller Stil kommt
     aus dem geteilten `.stb-pill__remove` (design-system.css, INV-UI-4 — selber "✕"-
     Mechanismus wie PlaceDetail's Namensvarianten-Entfernen), hier nur die Positionierung
     als letztes Kind der Flex-Kopfzeile (TST-11: margin-left:auto NUR auf ein Element, das
     garantiert das letzte in der Zeile ist — hier zutreffend, da unconditionally zuletzt
     gerendert). */
  .person-detail__death-retract-btn {
    margin-left: auto;
    flex: 0 0 auto;
  }

  .person-detail__event-note {
    margin: 0.3rem 0 0;
    font-size: 0.82rem;
    color: var(--stb-text-dim);
  }

  .person-detail__families {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .person-detail__families li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--stb-surface-2);
    flex-wrap: wrap;
  }

  /* .person-detail__family-role entfällt — Rollen-Label kommt jetzt aus dem
     geteilten .stb-role-label (design-system.css, INV-UI-4). */

  .person-detail__family-label {
    color: var(--stb-text-dim);
  }

  .person-detail__family-link {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    padding: 0;
    font: inherit;
    text-decoration: underline;
  }

  .person-detail__family-children {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem;
  }

  .person-detail__family-children-label {
    color: var(--stb-text-dim);
    font-size: 0.82rem;
  }

  .person-detail__family-children-sep {
    color: var(--stb-text-dim);
    margin-right: -0.15rem;
  }

  .person-detail__family-children-summary {
    color: var(--stb-text-dim);
    font-size: 0.82rem;
    text-decoration: none;
    margin-left: 0.2rem;
  }

  .person-detail__family-detail-link {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    padding: 0;
    font: inherit;
    font-size: 0.78rem;
    margin-left: auto;
    text-decoration: underline;
  }
</style>
