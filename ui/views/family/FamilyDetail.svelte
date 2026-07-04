<script lang="ts">
  // ui/views/family/FamilyDetail.svelte — Familien-Detail (Spec 20 §1.5 [K], read-only
  // für diese Scheibe): anklickbare Mitglieder (-> Personen-Detail), Ereignisse,
  // Quellen-Badges. "Baum-Sprung" ist NICHT Teil dieser Scheibe (imperative Insel).
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import SourceBadge from '../../shell/SourceBadge.svelte';
  import { buildFamilyDetail } from './family-detail-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Cross-Tab-Navigation zu einer Person (wechselt auch den Entitäts-Segment). */
    onNavigateToPerson: (personId: string) => void;
    /** Cross-Tab-Navigation zur Quellen-Detailseite (optional — Tests ohne Quellen-Tab). */
    onNavigateToSource?: (sourceId: string) => void;
    /** Cross-Tab-Navigation zum Orte-Tab (optional — Tests/Kontexte ohne Orte-Tab). */
    onNavigateToPlace?: (placeId: string) => void;
    /** Cross-Tab-Navigation zum Höfe-Tab (optional — Tests/Kontexte ohne Höfe-Tab). */
    onNavigateToHof?: (hofId: string) => void;
  }
  const { appState, viewState, onNavigateToPerson, onNavigateToSource, onNavigateToPlace, onNavigateToHof }: Props =
    $props();

  const familyId = $derived(viewState.getCurrent('family'));
  const detail = $derived(familyId ? buildFamilyDetail(appState.db, appState.placeContext, familyId) : null);

  const roleLabel: Record<'husband' | 'wife' | 'child', string> = {
    husband: 'Ehemann',
    wife: 'Ehefrau',
    child: 'Kind',
  };

  function geoHref(coords: { lat: number; long: number }): string {
    return `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.long}#map=12/${coords.lat}/${coords.long}`;
  }
</script>

<div class="family-detail">
  {#if !familyId}
    <p class="family-detail__empty">Keine Familie ausgewählt.</p>
  {:else if !detail}
    <p class="family-detail__empty">Familie nicht gefunden (evtl. gelöscht oder Datei gewechselt).</p>
  {:else}
    <h2 class="family-detail__label">{detail.label}</h2>

    <section class="family-detail__section">
      <h3>Mitglieder</h3>
      <ul class="family-detail__members">
        {#each detail.members as member (member.personId)}
          <li>
            <span class="family-detail__member-role">{roleLabel[member.role]}</span>
            <button
              type="button"
              class="family-detail__member-link"
              onclick={() => onNavigateToPerson(member.personId)}
            >
              {member.name}
            </button>
          </li>
        {/each}
      </ul>
    </section>

    <section class="family-detail__section">
      <h3>Ereignisse</h3>
      {#if detail.events.length === 0}
        <p class="family-detail__muted">Keine Ereignisse erfasst.</p>
      {:else}
        <ul class="family-detail__events">
          {#each detail.events as ev (ev.key)}
            <li class="family-detail__event">
              <div class="family-detail__event-head">
                <span class="family-detail__event-label">{ev.label}</span>
                {#if ev.summary}<span class="family-detail__event-summary">{ev.summary}</span>{/if}
                {#if ev.coords}
                  <a
                    class="family-detail__geo-link"
                    href={geoHref(ev.coords)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Karte ↗
                  </a>
                {/if}
                {#if ev.hofId && onNavigateToHof}
                  <button type="button" class="family-detail__place-link" onclick={() => onNavigateToHof(ev.hofId!)}>
                    Hof ansehen →
                  </button>
                {:else if ev.placeId && onNavigateToPlace}
                  <button type="button" class="family-detail__place-link" onclick={() => onNavigateToPlace(ev.placeId!)}>
                    Ort ansehen →
                  </button>
                {/if}
              </div>
              {#if ev.note}<p class="family-detail__event-note">{ev.note}</p>{/if}
              {#if ev.citations.length > 0}
                <div class="family-detail__citations">
                  {#each ev.citations as cit, i (i)}
                    <SourceBadge
                      citation={cit}
                      source={appState.db.sources.get(cit.sourceId)}
                      onSelect={onNavigateToSource}
                    />
                  {/each}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    {#if detail.citations.length > 0}
      <section class="family-detail__section">
        <h3>Quellen (Familie)</h3>
        <div class="family-detail__citations">
          {#each detail.citations as cit, i (i)}
            <SourceBadge
              citation={cit}
              source={appState.db.sources.get(cit.sourceId)}
              onSelect={onNavigateToSource}
            />
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>

<style>
  .family-detail {
    padding: 1rem;
    overflow-y: auto;
  }

  .family-detail__empty {
    color: var(--stb-text-dim);
  }

  .family-detail__label {
    margin-top: 0;
  }

  .family-detail__section {
    margin-bottom: 1.25rem;
  }

  .family-detail__section h3 {
    font-size: 0.95rem;
    color: var(--stb-gold-light);
    margin-bottom: 0.4rem;
  }

  .family-detail__muted {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .family-detail__members {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .family-detail__members li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--stb-surface-2);
  }

  .family-detail__member-role {
    font-size: 0.72rem;
    color: var(--stb-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    min-width: 5.5rem;
  }

  .family-detail__member-link {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    padding: 0;
    font: inherit;
    text-decoration: underline;
  }

  .family-detail__events {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .family-detail__event {
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
    padding: 0.6rem 0.8rem;
    margin-bottom: 0.5rem;
  }

  .family-detail__event-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
  }

  .family-detail__event-label {
    font-weight: 700;
  }

  .family-detail__event-summary {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .family-detail__geo-link {
    font-size: 0.78rem;
    margin-left: auto;
  }

  .family-detail__place-link {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    padding: 0;
    font: inherit;
    font-size: 0.78rem;
    text-decoration: underline;
  }

  .family-detail__event-note {
    margin: 0.3rem 0 0;
    font-size: 0.82rem;
    color: var(--stb-text-dim);
  }

  .family-detail__citations {
    margin-top: 0.35rem;
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }
</style>
