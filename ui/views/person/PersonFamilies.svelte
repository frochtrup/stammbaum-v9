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
  import SourceBadge from '../../shell/SourceBadge.svelte';
  import type { Source } from '../../../core/model/types';
  import type { FamilyNavRow } from './person-detail-model';

  interface Props {
    families: FamilyNavRow[];
    onGoToPerson: (id: string) => void;
    onNavigateToFamily?: (id: string) => void;
    /** Quellen-Auflösung für die Kindschafts-Pillen (BL-329) — nur lesend; ohne sie zeigt
     *  die Pille den nackten Quellen-Schlüssel, wie überall sonst bei fehlender Quelle. */
    sourceOf?: (sourceId: string) => Source | undefined;
    /** Quellen-Detailseite öffnen (optional — Kontexte/Tests ohne Quellen-Tab). */
    onNavigateToSource?: (sourceId: string) => void;
    /** „Kindschaft bearbeiten" (BL-329) — öffnet den geteilten `ChildLinkEditModal` beim
     *  Aufrufer. Nur an Herkunftsfamilien-Zeilen sichtbar; ohne Callback bleibt die Zeile
     *  reine Anzeige (INV-UI-2: kein zweiter Bedienweg daneben). */
    onEditChildLink?: (familyId: string) => void;
    /**
     * Öffnet den Familien-Picker für DIESE Rolle (BL-344). Ohne Callback bleibt die
     * Liste reine Anzeige — Tests und die Familien-Detailseite ändern sich nicht.
     *
     * Das `+` sitzt hinter dem Rollen-Label, weil das Label sagt, worauf es sich bezieht
     * (INV-UI-12) — so braucht der Knopf keinen eigenen Text. An einer vorhandenen Zeile
     * heißt es „noch eine davon" (Wiederheirat, zweite Herkunftsfamilie); fehlt die Rolle
     * ganz, steht sie unten als Label-Zeile nur mit dem `+`.
     */
    onAdd?: (rolle: 'parentIn' | 'childOf') => void;
    /** Tooltip/aria-label je Rolle — der Text lebt beim Aufrufer, nicht hier. */
    addHinweis?: (rolle: 'parentIn' | 'childOf') => string;
  }
  const {
    families, onGoToPerson, onNavigateToFamily, sourceOf, onNavigateToSource, onEditChildLink,
    onAdd, addHinweis,
  }: Props = $props();

  /** Rollen, die KEINE Zeile haben — sie bekommen unten eine Label-Zeile nur mit dem `+`,
   *  damit auch die fehlende Beziehung einen Einstieg hat (BL-344). Nur wenn überhaupt
   *  angelegt werden kann. */
  const ROLLEN = ['parentIn', 'childOf'] as const;
  const fehlend = $derived(
    onAdd ? ROLLEN.filter((r) => !families.some((f) => f.role === r)) : [],
  );
  const rollenLabel = (r: 'parentIn' | 'childOf'): string =>
    r === 'parentIn' ? 'Eigene Familie' : 'Herkunftsfamilie';
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
      {#if onAdd}
        <button
          type="button"
          class="stb-activation-pill person-families__add"
          onclick={() => onAdd(fam.role)}
          aria-label={addHinweis?.(fam.role) ?? 'Weitere Familie'}
          use:tooltip={addHinweis?.(fam.role) ?? 'Weitere Familie'}
        >
          +
        </button>
      {/if}
      {#if fam.pedigree}<span class="person-families__pedigree" use:tooltip={'Kind-Verhältnis'}>· {fam.pedigree}</span>{/if}
      {#if fam.members.length === 0}
        <span class="person-families__label">{fam.label}</span>
      {:else}
        {#each fam.members as member (member.personId)}
          <button type="button" class="person-families__link" onclick={() => onGoToPerson(member.personId)}>
            {member.name}{#if member.summary}<span class="person-families__summary">({member.summary})</span>{/if}
          </button>
        {/each}
      {/if}
      <!-- Hochzeitsdatum der Familie (Nutzer-Wunsch 2026-08-13). Steht NACH den Personen:
           erst wer, dann wann. Das ⚭ trägt die Bedeutung, deshalb kein zusätzliches Wort
           (INV-UI-5) — den Klartext gibt der Tooltip. -->
      {#if fam.marriage}
        <span class="person-families__marriage" use:tooltip={'Hochzeitsdatum'}>⚭ {fam.marriage}</span>
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
      <!-- Belege der eigenen Abstammung (BL-329) + Einstieg in den geteilten Kindschafts-
           Editor. Nur an der Herkunftsfamilie: an der eigenen Familie gibt es keine
           Kindschaft dieser Person. -->
      {#if fam.role === 'childOf'}
        {#each fam.childCitations as cit, i (i)}
          <SourceBadge citation={cit} source={sourceOf?.(cit.sourceId)} onSelect={onNavigateToSource} />
        {/each}
        {#if onEditChildLink}
          <button
            type="button"
            class="stb-icon-btn"
            onclick={() => onEditChildLink(fam.familyId)}
            aria-label="Kindschaft bearbeiten"
            use:tooltip={'Kind-Verhältnis und Quellen der Kindschaft'}
          >
            ✎
          </button>
        {/if}
      {/if}
    </li>
  {/each}

  <!-- Die fehlende Rolle bekommt eine Zeile aus Label und `+` (BL-344). Ohne sie hätte
       ausgerechnet die Person OHNE eigene Familie bzw. OHNE Eltern keinen Einstieg — und
       das ist die Person, die ihn am dringendsten braucht. Kein Rollen-LINK hier: es gibt
       noch nichts, wohin er führen könnte. -->
  {#each fehlend as rolle (rolle)}
    <li class="person-families__leer">
      <span class="stb-role-label">{rollenLabel(rolle)}</span>
      <button
        type="button"
        class="stb-activation-pill person-families__add"
        onclick={() => onAdd?.(rolle)}
        aria-label={addHinweis?.(rolle) ?? rollenLabel(rolle)}
        use:tooltip={addHinweis?.(rolle) ?? rollenLabel(rolle)}
      >
        +
      </button>
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

  /* Das `+` schließt direkt ans Label an, statt in der Zeile zu schwimmen — es gehört zu
     ihm, nicht zur Zeile (INV-UI-12). */
  .person-families__add {
    margin-left: -0.25rem;
    line-height: 1;
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

  .person-families__marriage {
    color: var(--stb-text-dim);
    white-space: nowrap;
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

  /* Kind-Verhältnis der Person zu ihren Eltern (BL-199) — nur bei abweichendem PEDI. */
  .person-families__pedigree {
    color: var(--stb-gold-light);
    font-size: 0.78rem;
    margin-left: 0.3rem;
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
