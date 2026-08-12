<script lang="ts">
  // ui/shell/EventCitationsSection.svelte — die Quellen-Sektion des Ereignis-Editors:
  // Überschrift, „+ Quelle hinzufügen" und die Liste der `SourceCitationRow`-Zeilen.
  //
  // Aus `EventEditModal.svelte` extrahiert, als diese die max-lines-Ratsche (BL-54) riss.
  // Es ist die Fortsetzung derselben Aufteilung, die schon `event-edit-citations.ts`
  // erzeugt hat: dort liegen die reinen Array-Funktionen (add/remove/setXAt), hier ihre
  // OBERFLÄCHE — Überschrift, Knopf, Zeilenliste und deren Stil. Was im Modal bleibt, ist
  // das Ereignis selbst.
  //
  // Sie hält keinen Zustand: sie bekommt die aktuelle Zitatliste und meldet jede Änderung
  // als GANZE neue Liste zurück (`onChange`) — dasselbe Whole-Object-Muster wie die
  // Kommandos des Kerns, kein Feld-Setter über eine fremde Struktur.
  import type { AppState } from './app-state.svelte';
  import type { Citation } from '../../core/model/types';
  import type { CitationClipboard } from './citation-clipboard.svelte';
  import { citationUrl } from '../../core/model';
  import SourceCitationRow from './SourceCitationRow.svelte';
  import {
    abgeloest,
    addCitationFor,
    addCitationFrom,
    removeCitationAt,
    setCitationSourceAt,
    setCitationPageAt,
    setCitationNoteAt,
    setCitationQuayAt,
    setCitationUrlAt,
    setCitationEvalAt,
  } from './event-edit-citations';

  interface Props {
    appState: AppState;
    citations: Citation[];
    /** Beschriftungs-Präfix der Zeilen (der Ereignis-Name) — für `aria-label`. */
    labelPrefix: string;
    /** Quellreferenz-Ablage der Sitzung (BL-234) — ohne sie entfallen ⧉ und Übernehmen. */
    citationClipboard?: CitationClipboard;
    onChange: (next: Citation[]) => void;
  }
  const { appState, citations, labelPrefix, citationClipboard, onChange }: Props = $props();

  const sources = $derived(Array.from(appState.db.sources.values()));

  /** Der EINE Guard, der eine Quelle voraussetzt — ohne Quellen gäbe es nichts zu zitieren. */
  function addCitation() {
    if (sources.length === 0) return;
    onChange(addCitationFor(citations, sources[0].id));
  }

  // --- Quellreferenz-Ablage (BL-234) ----------------------------------------------------
  // Die Beschriftung wird beim KOPIEREN festgehalten, nicht beim Anzeigen berechnet: die
  // Ablage überlebt den Wechsel in einen anderen Datensatz, dort ist der Kontext der
  // Herkunft nicht mehr da (dieselbe Lehre wie bei der Ereignis-Ablage, deren erstes
  // „⧉ Übernehmen: Beruf" weder verriet, WELCHER noch VON WEM).
  function sourceLabelFor(sourceId: string): string {
    const s = appState.db.sources.get(sourceId);
    return s ? s.abbr || s.title || s.id : sourceId;
  }

  function copyCitation(cit: Citation) {
    const name = sourceLabelFor(cit.sourceId);
    // Die Beschriftung nennt, was die Fundstelle IDENTIFIZIERT (Quelle + Seite) — nicht
    // alles, was mitreist; eine Zeile mit QUAY, Notiz und drei Achsen wäre unlesbar.
    // Kein „S. "-Präfix: `PAGE` ist Freitext und trägt seine Einheit oft selbst
    // („S. 214", „fol. 3v", „Bd. 2, Nr. 17") — am Realbestand ergab die Vorsilbe prompt
    // ein „· S. S. 214". Der Trenner reicht. Das „↗" sagt, dass ein Weblink dabei ist —
    // der EINE mitreisende Wert, der auf einen fremden Datensatz zeigen kann
    // (s. Kopfkommentar der Ablage).
    const beschriftung = [cit.page ? `${name} · ${cit.page}` : name, citationUrl(cit) ? '↗' : '']
      .filter(Boolean)
      .join(' ');
    citationClipboard?.copy(cit, beschriftung);
  }

  /**
   * Die Positionen der in DIESER Editor-Sitzung aus der Ablage eingefügten Zeilen. Sie
   * tragen noch die `grampsId` des geteilten `<citation>`-Records, aus dem sie stammen
   * (s. `addCitationFrom`). Wird eine davon geändert, ist sie nicht mehr dieselbe
   * Fundstelle und muss sich vom Record lösen — sonst schriebe der Edit auch die Zeile
   * um, aus der kopiert wurde.
   *
   * Gemerkt wird die POSITION, nicht das Objekt: die Zitate kommen als `$state`-Proxy
   * herein (der Aufrufer hält sie in einem Runes-Objekt), ein `WeakSet` über die rohen
   * Objekte fände sie beim Zurücklesen nicht wieder — eine Falle, die nur ein Test über
   * den ECHTEN Editor aufdeckt, nicht einer, der ein einfaches Array durchreicht.
   * Entfernte Zeilen verschieben die Positionen, deshalb zieht `entferne()` sie mit.
   *
   * Lokaler, transienter Zustand, kein Modellfeld: nach dem Speichern ist die eingefügte
   * Zeile eine gewöhnliche geteilte Zitation, und die zu ändern heißt in GRAMPS dann auch
   * dort, sie für ALLE Besitzer zu ändern. Das ist die Semantik der Datei, keine Lücke.
   */
  let eingefuegt = $state(new Set<number>());

  function pasteCitation() {
    const cit = citationClipboard?.take();
    if (!cit) return;
    eingefuegt = new Set([...eingefuegt, citations.length]);
    onChange(addCitationFrom(citations, cit));
  }

  /** Jede Änderung an einer Zeile läuft hierdurch — sie löst eine frisch eingefügte Zeile
   *  vom geteilten Record und meldet die neue Liste nach oben. */
  function aendere(index: number, next: Citation[]) {
    if (!eingefuegt.has(index)) return onChange(next);
    eingefuegt = new Set([...eingefuegt].filter((i) => i !== index));
    onChange(next.map((c, i) => (i === index ? abgeloest(c) : c)));
  }

  /** Entfernen verschiebt alles darunter um eine Position nach oben. */
  function entferne(index: number) {
    eingefuegt = new Set(
      [...eingefuegt].filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)),
    );
    onChange(removeCitationAt(citations, index));
  }
</script>

<div class="event-citations">
  <div class="event-citations__head">
    <h5>Quellen</h5>
    <button type="button" class="event-citations__add-btn" onclick={addCitation} disabled={sources.length === 0}>
      + Quelle hinzufügen
    </button>
  </div>
  <!-- Einfügen aus der Ablage (BL-234): erscheint NUR, solange etwas abgelegt ist — kein
       neues Dauer-Bedienelement (INV-UI-11, wie „⧉ Übernehmen" bei BL-212). Bewusst eine
       EIGENE Zeile unter der Kopfzeile, nicht in ihr: eine Quellenbezeichnung samt Seite
       ist zu lang, um neben „+ Quelle hinzufügen" zu stehen, ohne die Kopfzeile
       umzubrechen — im Browser gemessen, der Hinzufügen-Knopf stand danach allein auf
       einer Zeile über der Überschrift. Der Chip trägt sein eigenes ✕, sonst bliebe eine
       einmal gefüllte Ablage die ganze Sitzung stehen (Design-Kritik 2026-07-31 zur
       Ereignis-Ablage) — dasselbe „Tag mit ✕"-Muster wie im übrigen Quellen-Widget
       ([20 §2]), kein neues. -->
  {#if citationClipboard?.value}
    <div class="event-citations__paste-row">
      <span class="event-citations__paste">
        <button type="button" class="event-citations__paste-btn" onclick={pasteCitation}>
          📋 Übernehmen: {citationClipboard.label}
        </button>
        <button
          type="button"
          class="event-citations__paste-clear"
          aria-label="Quellen-Ablage leeren"
          onclick={() => citationClipboard.clear()}
        >
          ✕
        </button>
      </span>
    </div>
  {/if}
  {#each citations as cit, i (i)}
    <SourceCitationRow
      {appState}
      citation={cit}
      index={i}
      {labelPrefix}
      onCopy={citationClipboard ? () => copyCitation(cit) : undefined}
      onSourceChange={(id) => aendere(i, setCitationSourceAt(citations, i, id))}
      onPageChange={(page) => aendere(i, setCitationPageAt(citations, i, page))}
      onQuayChange={(quay) => aendere(i, setCitationQuayAt(citations, i, quay))}
      onNoteChange={(note) => aendere(i, setCitationNoteAt(citations, i, note))}
      onUrlChange={(u) => aendere(i, setCitationUrlAt(citations, i, u))}
      onEvalChange={(ev) => aendere(i, setCitationEvalAt(citations, i, ev))}
      onRemove={() => entferne(i)}
    />
  {/each}
</div>

<style>
  .event-citations {
    margin-top: 0.6rem;
  }

  .event-citations__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.3rem;
  }

  .event-citations h5 {
    font-size: 0.8rem;
    color: var(--stb-text-dim);
    margin: 0;
  }

  .event-citations__add-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
    min-height: var(--stb-touch-target);
  }

  .event-citations__add-btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  /* Eigene Zeile für den Ablage-Chip (s. Kommentar im Markup) — die Kopfzeile bleibt
     unverändert die kompakte Überschrift+Knopf-Zeile aus [20 §2]. */
  .event-citations__paste-row {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0.35rem;
  }

  .event-citations__paste {
    display: inline-flex;
    align-items: center;
    /* Ein Element aus zwei Knöpfen: gemeinsame Umrandung, innen kein Spalt — dasselbe
       „Tag mit ✕"-Bild wie an den übrigen Quellen-Tags. */
    border: 1px solid var(--stb-gold-light);
    border-radius: var(--stb-radius-control);
    max-width: 100%;
  }

  .event-citations__paste-btn {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    font: inherit;
    font-size: 0.82rem;
    padding: 0.3rem 0.5rem;
    min-height: var(--stb-touch-target);
    /* Eine lange Quellenbezeichnung darf die Kopfzeile nicht aufspannen. */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .event-citations__paste-clear {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0 0.45rem;
    min-height: var(--stb-touch-target);
    flex: 0 0 auto;
  }

  .event-citations__paste-btn:hover,
  .event-citations__paste-btn:focus-visible,
  .event-citations__paste-clear:hover,
  .event-citations__paste-clear:focus-visible {
    background: var(--stb-surface-2);
  }
</style>
