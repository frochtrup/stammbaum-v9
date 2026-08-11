<script lang="ts">
  // ui/views/family/FamilyChildrenSection.svelte — die Kinder-Sektion der Familien-
  // Detailseite: Kind-Zeilen (Name + Geburtsjahr + Kind-Verhältnis + Kindschafts-Belege),
  // ihre beiden Zeilen-Aktionen (✎ Kindschaft, ✕ entfernen) und der „Kind hinzufügen"-
  // Picker darunter.
  //
  // Aus `FamilyDetail.svelte` extrahiert, als diese mit den Kindschafts-Belegen (BL-329)
  // die max-lines-Ratsche (BL-54) riss — dieselbe Aufteilung, die `EventCitationsSection`
  // aus `EventEditModal` gelöst hat: eine in sich geschlossene Sektion samt ihrem Stil,
  // ohne eigenen Zustand. Sie speichert nichts: jede Handlung geht als Callback zurück an
  // `FamilyDetail`, wo der Kommando-Chokepoint sitzt ([02 §3.3]).
  import type { AppState } from '../../shell/app-state.svelte';
  import type { PersonId } from '../../../core/model/types';
  import type { FamilyMemberRow } from './family-detail-model';
  import PersonPicker from '../../shell/PersonPicker.svelte';
  import SourceBadge from '../../shell/SourceBadge.svelte';
  import { tooltip } from '../../shell/tooltip';

  interface Props {
    appState: AppState;
    /** Die Kind-Zeilen dieser Familie (`role === 'child'`, bereits projiziert). */
    children: FamilyMemberRow[];
    /** Für den Picker: wer schon Kind ist, steht nicht mehr zur Auswahl. */
    excludeIds: string[];
    onNavigateToPerson: (personId: string) => void;
    onNavigateToSource?: (sourceId: string) => void;
    onEditChildLink: (personId: PersonId) => void;
    onAddChild: (personId: PersonId | null) => void;
    onRemoveChild: (personId: PersonId) => void;
  }
  const {
    appState,
    children,
    excludeIds,
    onNavigateToPerson,
    onNavigateToSource,
    onEditChildLink,
    onAddChild,
    onRemoveChild,
  }: Props = $props();
</script>

<section class="family-children">
  {#if children.length > 0}
    <h3 class="stb-section-title">Kinder</h3>
    <ul class="family-children__list">
      {#each children as child (child.personId)}
        <li>
          <button
            type="button"
            class="family-children__link"
            onclick={() => onNavigateToPerson(child.personId)}
          >
            {child.name}
            {#if child.summary}<span class="family-children__summary">({child.summary})</span>{/if}
            {#if child.pedigree}<span class="family-children__pedigree">· {child.pedigree}</span>{/if}
          </button>
          <!-- Belege + Zeilen-Aktionen als EINE Umbruch-Einheit (INV-UI-5): bei 375px
               gemessen — einzeln umbrechend zerriss die Kindschafts-Pille (BL-329) den
               Namen über zwei Zeilen und schob das ✕ allein in eine dritte. -->
          <span class="family-children__tail">
            {#each child.childCitations as cit, i (i)}
              <SourceBadge
                citation={cit}
                source={appState.db.sources.get(cit.sourceId)}
                onSelect={onNavigateToSource}
              />
            {/each}
            <button
              type="button"
              class="stb-icon-btn"
              onclick={() => onEditChildLink(child.personId)}
              aria-label={`Kindschaft von ${child.name} bearbeiten`}
              use:tooltip={'Kind-Verhältnis und Quellen der Kindschaft'}
            >
              ✎
            </button>
            <button
              type="button"
              class="stb-icon-btn"
              data-variant="danger"
              onclick={() => onRemoveChild(child.personId)}
              aria-label={`Kind ${child.name} entfernen`}
            >
              ✕
            </button>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="family-children__add">
    <PersonPicker
      {appState}
      value={null}
      onChange={onAddChild}
      {excludeIds}
      label="Kind hinzufügen"
      placeholder="Kind hinzufügen…"
    />
  </div>
</section>

<style>
  /* Abstände/Überschrift wie jede andere Sektion der Familien-Detailseite
     (`.family-detail__section`, INV-UI-4) — die Extraktion ändert die Optik nicht. */
  .family-children {
    margin-bottom: 1.25rem;
  }

  /* Kinder — kompakte, anklickbare Einzeiler (INV-UI-5): Name + Geburtsjahr in Klammern,
     kein voller .stb-person-box-Kasten nötig (Nachtrag 2026-07-06 [20 §1.5]). */
  .family-children__list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .family-children__list li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--stb-surface-2);
  }

  /* Belege + Aktionen wandern GEMEINSAM in die zweite Zeile, wenn es eng wird
     (INV-UI-5/INV-UI-11, bei 375px gemessen). */
  .family-children__tail {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-left: auto;
  }

  .family-children__link {
    /* Basis 60 % (bei 375px gemessen, INV-UI-11): so passt der Anhang aus Pille und
       Aktionen nicht mehr daneben und wandert als Ganzes in die zweite Zeile, statt den
       Namen zu quetschen. Ohne Pille (der Regelfall) bleibt alles einzeilig. */
    flex: 1 1 60%;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    padding: 0.4rem 0;
    font: inherit;
    text-align: left;
    text-decoration: underline;
  }

  .family-children__summary {
    color: var(--stb-text-dim);
    font-size: 0.82rem;
    text-decoration: none;
  }

  /* Kind-Verhältnis (BL-199) — nur bei abweichendem PEDI, dezent gold hervorgehoben. */
  .family-children__pedigree {
    color: var(--stb-gold-light);
    font-size: 0.78rem;
    text-decoration: none;
  }

  .family-children__add {
    margin-top: 0.5rem;
  }
</style>
