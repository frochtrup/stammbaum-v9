<script lang="ts">
  // ui/shell/EventLine.svelte — geteilte Ereigniszeile (ADR-v9-80, INV-UI-4). Ersetzt
  // die BYTE-IDENTISCHE `{#snippet eventRow}`-Duplikation in PersonDetail.svelte UND
  // FamilyDetail.svelte (dieselbe Drift-Quelle, die schon `.person-detail__geo-link`/
  // `.family-detail__geo-link` zweimal unabhängig gefixt werden musste, Spec 21 §6a).
  //
  // Zwei Verhaltens-Änderungen ggü. den alten Kopien:
  // 1. Der Orts-/Hof-Name selbst wird zum Link ("Datum, [Ort-Link]" statt eines
  //    vorverknüpften `summary`-Strings) — ersetzt den separaten "Ort ansehen →"/
  //    "Hof ansehen →"-Button ersatzlos. Fehlt placeId/hofId, bleibt der Name
  //    unverlinkter Text (kein Link ohne Ziel).
  // 2. "Karte ↗" (Text-Link) wird zum geteilten `CoordIndicator` (Punkt l/ADR-v9-79) —
  //    EIN Icon-Vokabular für "hat Koordinaten" app-weit statt Icon in Listen + Text-
  //    Link in Detail-Ansichten.
  //
  // Alles Übrige (Label/Value/Addr/Note, Quellen-Badges via SourceBadge, ✕-Rücknahme,
  // ✎-Bearbeiten) bleibt unverändert — nur an EINER Stelle statt zwei.
  import type { AppState } from './app-state.svelte';
  import type { ViewState } from './view-state.svelte';
  import type { LensId } from './lens-model';
  import type { EventLineRow } from './event-line-row';
  import SourceBadge from './SourceBadge.svelte';
  import CoordIndicator from './CoordIndicator.svelte';

  interface Props {
    ev: EventLineRow;
    appState: AppState;
    viewState: ViewState;
    /** Cross-Tab-Navigation zum Orte-Tab (optional — Tests/Kontexte ohne Orte-Tab). */
    onNavigateToPlace?: (placeId: string) => void;
    /** Cross-Tab-Navigation zum Höfe-Tab (optional — Tests/Kontexte ohne Höfe-Tab). */
    onNavigateToHof?: (hofId: string) => void;
    /** Cross-Tab-Navigation zur Quellen-Detailseite (optional). */
    onNavigateToSource?: (sourceId: string) => void;
    /** Cross-Tab-Navigation zur Karte-Lens (ADR-v9-78/80, `CoordIndicator`) — optional. */
    onNavigateLens?: (lens: LensId) => void;
    /** ✕-Rücknahme — weglassen, wenn diese Zeile NIE rücknehmbar ist (z. B. BIRT bei
     *  Person, MARR bei Familie). Der Aufrufer entscheidet PRO ZEILE (Guard bleibt beim
     *  Aufrufer, s. `ev.key !== 'DEAT'`/`ev.key !== 'MARR'`-Prüfung dort). */
    onRetract?: (key: string) => void;
    /** ✎-Bearbeiten. */
    onEdit: (key: string) => void;
  }
  const {
    ev,
    appState,
    viewState,
    onNavigateToPlace,
    onNavigateToHof,
    onNavigateToSource,
    onNavigateLens,
    onRetract,
    onEdit,
  }: Props = $props();

  // Hof-vor-Ort-Priorität (unverändert aus den alten Kopien übernommen): ein Ereignis
  // mit sowohl hofId als auch placeId zeigt den Hof-Link, nicht den Orts-Link — der
  // Hof ist die spezifischere Einheit. Derselbe Vorrang gilt für `focusId` unten.
  //
  // `focusId` ist NUR noch ein optionaler Hervorhebungs-Hinweis für `CoordIndicator`
  // (hebt einen kuratierten PlaceObject-/HofObject-Marker zusätzlich hervor, FALLS
  // einer an dieser Stelle existiert) — der Koordinaten-Sprung selbst hängt seit dem
  // ADR-v9-78-Nachtrag nicht mehr davon ab (Event-Koordinaten sind oft präziser als
  // die des zugeordneten Orts, `CoordIndicator` zentriert direkt auf `ev.coords`).
  // Ein `focusId`, der auf kein kuratiertes Objekt mit eigenen Koordinaten zeigt, ist
  // harmlos — die Karte-Insel (`findFocusPoint`) findet dann schlicht keinen Marker
  // zum Hervorheben und zentriert trotzdem korrekt auf die rohen Koordinaten. Deshalb
  // hier bewusst EINFACH, keine Objekt-Lookup-Vorprüfung mehr nötig (frühere Fassung
  // dieses Bau-Nachtrags hatte das noch zur Gating-Bedingung gemacht, war aber nach
  // der Korrektur unten überflüssig geworden).
  const focusId = $derived(ev.hofId ?? ev.placeId ?? null);
  const placeClickable = $derived((!!ev.hofId && !!onNavigateToHof) || (!!ev.placeId && !!onNavigateToPlace));

  function handlePlaceClick() {
    if (ev.hofId && onNavigateToHof) onNavigateToHof(ev.hofId);
    else if (ev.placeId && onNavigateToPlace) onNavigateToPlace(ev.placeId);
  }

  // CoordIndicator nur zeigen, wenn diese Zeile überhaupt einen Orts-Bezug hat (Koords
  // ODER ein Ortstext) — ein Ereignis ganz ohne Ortskonzept (z. B. OCCU ohne Ort) zeigt
  // keinen irreführenden "Koordinaten fehlen"-Glyph.
  const showCoordIndicator = $derived(ev.coords != null || ev.placeLabel !== '');
</script>

<li class="event-line">
  <div class="event-line__head">
    <span class="event-line__label">{ev.label}</span>
    {#if ev.value}<span class="event-line__value">{ev.value}</span>{/if}
    {#if ev.addr}<span class="event-line__value">{ev.addr}</span>{/if}
    {#if ev.dateLabel || ev.placeLabel}
      <span class="event-line__date">
        {#if ev.dateLabel}{ev.dateLabel}{/if}{#if ev.dateLabel && ev.placeLabel}, {/if}{#if ev.placeLabel}{#if placeClickable}<button
              type="button"
              class="event-line__place-link"
              onclick={handlePlaceClick}
            >{ev.placeLabel}</button>{:else}<span class="event-line__place-text">{ev.placeLabel}</span>{/if}{/if}
      </span>
    {/if}
    {#if showCoordIndicator}
      <CoordIndicator coords={ev.coords} {focusId} {viewState} {onNavigateLens} />
    {/if}
    {#each ev.citations as cit, i (i)}
      <SourceBadge citation={cit} source={appState.db.sources.get(cit.sourceId)} onSelect={onNavigateToSource} />
    {/each}
    <span class="event-line__actions">
      {#if ev.empty && onRetract}
        <button
          type="button"
          class="stb-pill__remove"
          onclick={() => onRetract(ev.key)}
          aria-label={`${ev.label} zurücknehmen`}
          title="Zurücknehmen"
        >
          ✕
        </button>
      {/if}
      <button
        type="button"
        class="event-line__edit-btn"
        onclick={() => onEdit(ev.key)}
        aria-label={`${ev.label} bearbeiten`}
      >
        ✎
      </button>
    </span>
  </div>
  {#if ev.note}<p class="event-line__note">{ev.note}</p>{/if}
</li>

<style>
  .event-line {
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
    padding: 0.4rem 0.65rem;
    margin-bottom: 0.3rem;
  }

  .event-line__head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
  }

  .event-line__label {
    font-weight: 700;
  }

  .event-line__value {
    color: var(--stb-text);
    font-size: 0.85rem;
  }

  .event-line__date {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .event-line__place-link {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    padding: 0;
    font: inherit;
    font-size: inherit;
    text-decoration: underline;
  }

  .event-line__place-text {
    color: var(--stb-text-dim);
  }

  /* Aktions-Gruppe (✕-Rücknahme + ✎-Bearbeiten): IMMER das letzte Kind der Kopfzeile
     (unconditionally gerendert) — margin-left:auto auf DIESEM Wrapper statt auf
     :last-child eines bedingt vorhandenen Geschwisters (TST-11-Lehre, übernommen aus
     den alten `.person-detail__event-actions`/`.family-detail__event-actions`). */
  .event-line__actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex: 0 0 auto;
  }

  .event-line__edit-btn {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    padding: 0;
    font-size: 0.85rem;
    line-height: 1;
    flex: 0 0 auto;
  }

  .event-line__edit-btn:hover,
  .event-line__edit-btn:focus-visible {
    color: var(--stb-gold-light);
  }

  .event-line__note {
    margin: 0.3rem 0 0;
    font-size: 0.82rem;
    color: var(--stb-text-dim);
  }
</style>
