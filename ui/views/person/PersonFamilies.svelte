<script lang="ts">
  // ui/views/person/PersonFamilies.svelte — die Familien-Liste einer Person (Herkunfts-/
  // eigene Familie mit Mitgliedern + Kindern). Aus PersonDetail.svelte extrahiert, um die
  // Detail-Ansicht an der max-lines-Ratsche (BL-54) abzubauen — reine Anzeige/Navigation,
  // kein Edit-Zustand, daher eine saubere in sich geschlossene Einheit.
  //
  // INV-UI-6 (Disambiguierung): Mitglieder/Kinder tragen `summary` (Geburtsjahr/-ort),
  // in PersonDetailModel bereits berechnet (yearPlaceSummary). INV-UI-12: die Navigation
  // zur Familien-Detailseite hängt am Rollen-Label selbst, nicht an einem Extra-Link.
  import { tooltip } from '../../shell/tooltip';
  import type { FamilyNavRow } from './person-detail-model';

  interface Props {
    families: FamilyNavRow[];
    onGoToPerson: (id: string) => void;
    onNavigateToFamily?: (id: string) => void;
  }
  const { families, onGoToPerson, onNavigateToFamily }: Props = $props();
</script>

<ul class="person-families">
  {#each families as fam (fam.familyId + fam.role)}
    <li>
      {#if onNavigateToFamily}
        <button
          type="button"
          class="stb-role-label person-families__role-link"
          onclick={() => onNavigateToFamily(fam.familyId)}
          use:tooltip={'Familien-Detail öffnen'}
        >
          {fam.role === 'parentIn' ? 'Eigene Familie' : 'Herkunftsfamilie'}
        </button>
      {:else}
        <span class="stb-role-label">
          {fam.role === 'parentIn' ? 'Eigene Familie' : 'Herkunftsfamilie'}
        </span>
      {/if}
      {#if fam.members.length === 0}
        <span class="person-families__label">{fam.label}</span>
      {:else}
        {#each fam.members as member (member.personId)}
          <button type="button" class="person-families__link" onclick={() => onGoToPerson(member.personId)}>
            {member.name}{#if member.summary}<span class="person-families__summary">({member.summary})</span>{/if}
          </button>
        {/each}
      {/if}
      {#if fam.children.length > 0}
        <span class="person-families__children">
          <span class="person-families__children-label">Kinder:</span>
          {#each fam.children as child, i (child.personId)}
            <button type="button" class="person-families__link" onclick={() => onGoToPerson(child.personId)}>
              {child.name}{#if child.summary}<span class="person-families__summary">({child.summary})</span>{/if}
            </button>{#if i < fam.children.length - 1}<span class="person-families__sep">,</span>{/if}
          {/each}
        </span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .person-families {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .person-families li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--stb-surface-2);
    flex-wrap: wrap;
  }

  .person-families__label {
    color: var(--stb-text-dim);
  }

  .person-families__link {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    padding: 0;
    font: inherit;
    text-decoration: underline;
  }

  .person-families__children {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem;
  }

  .person-families__children-label {
    color: var(--stb-text-dim);
    font-size: 0.82rem;
  }

  .person-families__sep {
    color: var(--stb-text-dim);
    margin-right: -0.15rem;
  }

  .person-families__summary {
    color: var(--stb-text-dim);
    font-size: 0.82rem;
    text-decoration: none;
    margin-left: 0.2rem;
  }

  /* Rollen-Label als Link zur Familien-Detailseite (INV-UI-12) — behält die
     .stb-role-label-Optik (klein/GROSS/gedimmt), wird nur klickbar + unterstrichen bei Hover.
     NUR font-family erben — font-size/transform/letter-spacing/color kommen aus
     .stb-role-label; das `font`-Shorthand würde deren font-size überschreiben. */
  .person-families__role-link {
    background: transparent;
    border: none;
    padding: 0;
    font-family: inherit;
    cursor: pointer;
    text-decoration: none;
  }

  .person-families__role-link:hover,
  .person-families__role-link:focus-visible {
    color: var(--stb-gold-light);
    text-decoration: underline;
  }
</style>
