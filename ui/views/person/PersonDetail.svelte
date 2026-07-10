<script lang="ts">
  // ui/views/person/PersonDetail.svelte — Personen-Detail (Spec 20 §1.4 [K]): Ereignisse,
  // Quellen-Badges §N (QUAY-Farbindikator), Geo-Links, Familien-Navigationszeilen
  // (anklickbar -> verlinkte Person). "Bearbeiten" öffnet PersonForm inline (analog
  // PlaceDetail.svelte's editing-Abschnitt, Spec 20 §2) — Beziehungen bearbeiten bleibt
  // außerhalb dieser Scheibe.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { untrack } from 'svelte';
  import SourceBadge from '../../shell/SourceBadge.svelte';
  import DetailHeader from '../../shell/DetailHeader.svelte';
  import { displayName } from '../../shell/person-display';
  import { buildPersonDetail } from './person-detail-model';
  import PersonForm from './PersonForm.svelte';

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
</script>

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
      {#if detail.eventGroups.length === 0}
        <p class="person-detail__muted">Keine Ereignisse erfasst.</p>
      {:else}
        {#each detail.eventGroups as group (group.type)}
          <h4 class="person-detail__event-category">{group.type}</h4>
          <ul class="person-detail__events">
            {#each group.rows as ev (ev.key)}
              <li class="person-detail__event">
                <div class="person-detail__event-head">
                  <span class="person-detail__event-label">{ev.label}</span>
                  {#if ev.value}<span class="person-detail__event-value">{ev.value}</span>{/if}
                  {#if ev.addr}<span class="person-detail__event-value">{ev.addr}</span>{/if}
                  {#if ev.summary}<span class="person-detail__event-summary">{ev.summary}</span>{/if}
                  {#if ev.coords}
                    <a
                      class="person-detail__geo-link"
                      href={geoHref(ev.coords)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
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
                    <SourceBadge
                      citation={cit}
                      source={appState.db.sources.get(cit.sourceId)}
                      onSelect={onNavigateToSource}
                    />
                  {/each}
                </div>
                {#if ev.note}<p class="person-detail__event-note">{ev.note}</p>{/if}
              </li>
            {/each}
          </ul>
        {/each}
      {/if}
    </section>

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

  .person-detail__muted {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
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

  /* ADR-v9-30 Nachtrag 2026-07-06 Befund 1 (INV-UI-5): margin-left:auto nur auf
     :last-child, sonst drückt es einen nachfolgenden Ort-/Hof-Link aus der Zeile heraus,
     obwohl beide Links zusammen mit Label/Datum/Ort umbruchfrei in eine Zeile passen
     würden. */
  .person-detail__geo-link:last-child {
    margin-left: auto;
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
