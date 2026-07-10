<script lang="ts">
  // ui/shell/DetailHeader.svelte — DIE EINE Kopfzeile für jede Entitäten-Detailansicht
  // (Person/Familie/Ort/Hof, künftig Quelle/Archiv — Spec 21 §6b, INV-UI-4).
  //
  // Befund (Spec 21 §6b): EntityTab.svelte rendert "← Zur Liste" bislang als eigene,
  // von der jeweiligen Detail-Komponente UNABHÄNGIGE Zeile (`.entity-tab__detail-header`)
  // — direkt darunter saß dann PersonDetail/FamilyDetail/PlaceDetail/HofDetails eigene
  // `__hero`/`__head`-Zeile (Titel + "✎ Bearbeiten" + ggf. "⧖ Im Baum anzeigen"). Zwei
  // getrennte Komponenten erzeugten zwei optisch getrennte Zeilen für einen inhaltlich
  // einzigen Kopfbereich — derselbe Bau-Fehler wie beim `LensViewHeader`-Präzedenzfall
  // (Baum/Karte hatten je eine eigene Topbar, bevor sie auf eine Komponente konsolidiert
  // wurden).
  //
  // Diese Komponente ist jetzt die EINE Quelle: Zeile 1 = "← Zur Liste" (Navigation)
  // + View-spezifische Aktionen (Bearbeiten, Im Baum anzeigen, …) in EINER flex-wrap-
  // Zeile (INV-UI-5, §6a) — Zurück links, Aktionen rechts. Zeile 2 = der Titel als
  // eigene Zeile darunter (Titel ist Inhalt, keine Navigations-Funktion, s. Spec 21 §6b).
  import type { Snippet } from 'svelte';

  interface Props {
    /** Personenname/Familienlabel/Ortsname/Hofadresse — Inhalt, keine Navigation, s. o. */
    title: string;
    onBack: () => void;
    /** View-spezifische Aktions-Buttons (Bearbeiten, Im Baum anzeigen, …), rechts neben
     *  "Zur Liste" in derselben Zeile. */
    actions?: Snippet;
    /** Kompakt-Modus (Spec 21 §10e-Aufarbeitung): der Titel läuft klein in der Kopfzeile
     *  selbst statt als eigene große zweite Zeile darunter — für Views, deren Titel bereits
     *  redundant zu strukturell reicherem Inhalt weiter unten ist (z. B. FamilyDetail's
     *  "Ehemann ⚭ Ehefrau", das die Eltern-Boxen unten mit Name+Geburtsjahr/-ort ohnehin
     *  wiederholen). Default false — PersonDetail/PlaceDetail/HofDetail behalten ihre
     *  bisherige große Titelzeile. */
    compact?: boolean;
  }
  const { title, onBack, actions, compact = false }: Props = $props();
</script>

<div class="detail-header">
  <div class="detail-header__row">
    <div class="detail-header__left">
      <button type="button" class="detail-header__back" onclick={onBack}>← Zur Liste</button>
      {#if compact}
        <span class="detail-header__compact-title">{title}</span>
      {/if}
    </div>
    {#if actions}
      <div class="detail-header__actions">
        {@render actions()}
      </div>
    {/if}
  </div>
  {#if !compact}
    <h2 class="detail-header__title">{title}</h2>
  {/if}
</div>

<style>
  .detail-header {
    padding: 0 0 0.6rem;
  }

  .detail-header__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .detail-header__back {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    font: inherit;
    padding: 0;
    white-space: nowrap;
  }

  /* Linke Gruppe (Zurück + optionaler Kompakt-Titel) — eigenes Flex-Item, damit
     `.detail-header__row`s `justify-content: space-between` weiterhin nur zwischen ZWEI
     Kindern (links/rechts) wirkt statt einen dritten mittigen Titel unvorhersehbar
     einzuquetschen (TST-11-Lehre). */
  .detail-header__left {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    flex-wrap: wrap;
    min-width: 0;
  }

  .detail-header__compact-title {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .detail-header__actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .detail-header__title {
    margin: 0.4rem 0 0;
  }
</style>
