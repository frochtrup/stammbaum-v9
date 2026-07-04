<script lang="ts">
  // ui/views/person/PersonDetail.svelte — Personen-Detail (Spec 20 §1.4 [K], read-only
  // für diese Scheibe): Ereignisse, Quellen-Badges §N (QUAY-Farbindikator), Geo-Links,
  // Familien-Navigationszeilen (anklickbar -> verlinkte Person). Bearbeiten/Formulare
  // sind NICHT Teil dieser Scheibe (Spec 20 §2, künftiger Durchgang).
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import SourceBadge from '../../shell/SourceBadge.svelte';
  import { displayName } from '../../shell/person-display';
  import { buildPersonDetail } from './person-detail-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
  }
  const { appState, viewState }: Props = $props();

  const personId = $derived(viewState.getCurrent('person'));
  const detail = $derived(personId ? buildPersonDetail(appState.db, appState.placeContext, personId) : null);

  function geoHref(coords: { lat: number; long: number }): string {
    return `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.long}#map=12/${coords.lat}/${coords.long}`;
  }

  function goToPerson(id: string) {
    viewState.setCurrent('person', id);
  }
</script>

<div class="person-detail">
  {#if !personId}
    <p class="person-detail__empty">Keine Person ausgewählt.</p>
  {:else if !detail}
    <p class="person-detail__empty">Person nicht gefunden (evtl. gelöscht oder Datei gewechselt).</p>
  {:else}
    <h2 class="person-detail__name">{displayName(detail.person)}</h2>

    <section class="person-detail__section">
      <h3>Ereignisse</h3>
      {#if detail.events.length === 0}
        <p class="person-detail__muted">Keine Ereignisse erfasst.</p>
      {:else}
        <ul class="person-detail__events">
          {#each detail.events as ev (ev.key)}
            <li class="person-detail__event">
              <div class="person-detail__event-head">
                <span class="person-detail__event-label">{ev.label}</span>
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
              </div>
              {#if ev.note}<p class="person-detail__event-note">{ev.note}</p>{/if}
              {#if ev.citations.length > 0}
                <div class="person-detail__citations">
                  {#each ev.citations as cit, i (i)}
                    <SourceBadge citation={cit} source={appState.db.sources.get(cit.sourceId)} />
                  {/each}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="person-detail__section">
      <h3>Familien</h3>
      {#if detail.families.length === 0}
        <p class="person-detail__muted">Keine Familienverknüpfung.</p>
      {:else}
        <ul class="person-detail__families">
          {#each detail.families as fam (fam.familyId + fam.role)}
            <li>
              <span class="person-detail__family-role">
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
            </li>
          {/each}
        </ul>
      {/if}
    </section>
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

  .person-detail__name {
    margin-top: 0;
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

  .person-detail__event {
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
    padding: 0.6rem 0.8rem;
    margin-bottom: 0.5rem;
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

  .person-detail__geo-link {
    font-size: 0.78rem;
    margin-left: auto;
  }

  .person-detail__event-note {
    margin: 0.3rem 0 0;
    font-size: 0.82rem;
    color: var(--stb-text-dim);
  }

  .person-detail__citations {
    margin-top: 0.35rem;
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
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

  .person-detail__family-role {
    font-size: 0.72rem;
    color: var(--stb-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

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
</style>
