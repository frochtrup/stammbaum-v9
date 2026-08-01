<script lang="ts">
  // ui/views/person/PersonDetailHeader.svelte — Kopfbereich der Personen-Detailansicht:
  // die geteilte DetailHeader-Kopfzeile (Zur-Liste + Aktionen + Titel) mit dem Geschlechts-
  // Icon inline am Titel (BL-198, titlePrefix) und dem optionalen Untertitel (Rufname/CHAN).
  // Aus PersonDetail.svelte extrahiert (max-lines-Ratsche, feedback_generous_file_split) —
  // reine Präsentations-/Aktions-Weiterleitung, kein eigener Zustand.
  import type { Person } from '../../../core/model/types';
  import DetailHeader from '../../shell/DetailHeader.svelte';
  import LensSwitcher from '../../shell/LensSwitcher.svelte';
  import type { LensId } from '../../shell/lens-model';
  import { displayName, sexSymbol } from '../../shell/person-display';
  import { formatDateForDisplay } from '../../../core/model/gedcom-date';
  import { tooltip } from '../../shell/tooltip';

  interface Props {
    person: Person;
    isProband: boolean;
    onBack: () => void;
    onEdit: () => void;
    onSetProband: () => void;
    /** „Diese Person in Ansicht X" — DER EINE Lens-Umschalter (BL-60, ADR-v9-153),
     *  optional, damit isolierte Tests/Kontexte ohne Lens-Fläche weiterlaufen. */
    onOpenLens?: (personId: string, lens: LensId) => void;
  }
  const { person, isProband, onBack, onEdit, onSetProband, onOpenLens }: Props = $props();
</script>

<DetailHeader title={displayName(person)} {onBack}>
  {#snippet titlePrefix()}
    <!-- Nur ♂/♀ am Titel; ◇ (unbekannt) wäre nur Rauschen (Design-Kritik). -->
    {#if person.sex !== 'U'}
      <span class="person-detail-header__title-sex person-detail-header__sex--{person.sex.toLowerCase()}" aria-hidden="true">{sexSymbol(person.sex)}</span>
    {/if}
  {/snippet}
  {#snippet actions()}
    <button type="button" class="stb-btn" data-variant="secondary" onclick={onEdit}>✎ Bearbeiten</button>
    <!-- „Als Proband setzen" (BL-120): setzt die Referenzperson der Sitzung (transient,
         ADR-v9-135). Ist diese Person es bereits, zeigt der Knopf den Zustand statt einer
         wirkungslosen Wiederholung. -->
    <button
      type="button"
      class="person-detail-header__proband-btn"
      class:person-detail-header__proband-btn--active={isProband}
      disabled={isProband}
      title={isProband
        ? 'Diese Person ist der Proband dieser Sitzung'
        : 'Als Proband (Referenzperson der Sitzung) setzen'}
      onclick={onSetProband}
    >{isProband ? '★ Proband' : '☆ Als Proband'}</button>
  {/snippet}
</DetailHeader>

<!-- Kopf-Untertitel (BL-198): nur bei nick/CHAN — der Sex-Icon sitzt inline am Titel
     (titlePrefix), daher keine verwaiste Ein-Icon-Zeile (Design-Kritik, §10f). -->
{#if person.nick || person.lastChanged}
  <p class="person-detail-header__subtitle">
    {#if person.nick}
      <span class="person-detail-header__nick" use:tooltip={'Rufname'}>«{person.nick}»</span>
    {/if}
    {#if person.lastChanged}
      <span>Geändert {formatDateForDisplay(person.lastChanged) || person.lastChanged}</span>
    {/if}
  </p>
{/if}

<!-- Lens-Absprung (BL-60, ADR-v9-153): DER EINE Umschalter (`LensSwitcher`, INV-UI-3/4)
     im Absprung-Modus (`active={null}`), statt der vormaligen zwei handgebauten Knöpfe
     „⧖ Im Baum anzeigen" + „📖 Story" in der Aktions-Reihe. Drei Gründe in einem Zug:
     (a) Karte und Zeitleiste fehlten als Ziel überhaupt (BL-60); (b) zwei eigene
     Sprung-Knöpfe neben dem kanonischen Umschalter sind genau das, was INV-UI-3
     ausschließt; (c) die Aktions-Reihe sprengte bei 375px das Befehlsflächen-Budget
     (INV-UI-11) — GEMESSEN, nicht geschätzt: 3 Zeilen / 5 dauerhaft sichtbare
     Bedienelemente (← Zur Liste · Bearbeiten · Als Proband · Im Baum anzeigen · Story).
     Segment-/Tab-Reihen zählen laut §6h NICHT ins Budget (sie sind Navigation, kein
     Befehl), die Aktions-Reihe steht damit wieder bei drei Elementen. -->
{#if onOpenLens}
  <div class="person-detail-header__lens-row">
    <LensSwitcher
      active={null}
      ariaLabel="Diese Person in einer anderen Ansicht öffnen"
      onNavigate={(lens) => onOpenLens(person.id, lens)}
    />
  </div>
{/if}

<style>
  /* Die Reihe selbst bringt kein Padding mit — `.stb-segment-row` (design-system.css)
     trägt seines, sonst läge die Einrückung doppelt (dieselbe Lehre wie in
     LensViewHeader.svelte). Nur der Abstand nach unten ist hier zu setzen. */
  .person-detail-header__lens-row {
    margin: 0 -0.15rem 0.4rem;
  }


  .person-detail-header__proband-btn {
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    color: var(--stb-gold-light);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.6rem;
    font-size: 0.78rem;
    cursor: pointer;
    white-space: nowrap;
  }

  /* Ist die Person bereits Proband: aktiver Gold-Zustand, nicht klickbar (kein No-op). */
  .person-detail-header__proband-btn--active {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border-color: var(--stb-gold);
    font-weight: 600;
    cursor: default;
  }

  /* Geschlechts-Icon inline am Titel (BL-198) — kleiner als der Name; Farbe via --sex--m/f. */
  .person-detail-header__title-sex {
    font-size: 0.8em;
    margin-right: 0.4rem;
    vertical-align: 0.05em;
  }
  .person-detail-header__sex--m {
    color: var(--stb-sex-m);
  }
  .person-detail-header__sex--f {
    color: var(--stb-sex-f);
  }

  .person-detail-header__subtitle {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin: -0.2rem 0 1rem;
    font-size: 0.82rem;
    color: var(--stb-text-dim);
  }
  .person-detail-header__nick {
    font-style: italic;
    color: var(--stb-text);
  }
</style>
