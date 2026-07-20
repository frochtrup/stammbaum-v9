<script lang="ts">
  // ui/views/person/PersonMergeModal.svelte — Merge-Modal der Duplikat-Erkennung
  // (BL-104, Spec 20 §1.12). Item-Modal nach ADR-v9-63: Personen-Vergleich mit vielen
  // Feldern nebeneinander, dichte Kindstruktur — kein Toggle-Formular.
  //
  // Führt NICHT selbst zusammen: der Merge läuft über den Kommando-Chokepoint
  // `appState.mergePerson(winner, loser, selections)` (Spec 02 §3), der Undo über
  // `commit` mitbringt. Hier lebt nur die Auswahl.
  //
  // Die Zeilen kommen aus `MERGEABLE_PERSON_FIELDS` (core/dedup) statt aus einer
  // lokalen Liste — ein hier wählbares Feld, das das Kommando nicht kennt, wäre eine
  // stumm verworfene Nutzerentscheidung (ADR-v9-104).
  //
  // Backdrop aus `.stb-modal-backdrop` (design-system.css, INV-UI-4) — nicht lokal
  // nachgebaut, sonst läge das Panel wie einst beim EventEditModal unter der Bottom-Nav.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { MergeSelections, MergeSide } from '../../../core/dedup';
  import { makeLogEntry } from '../../../core/research';
  import { displayName } from '../../shell/person-display';
  import { buildCompareRows, contextRows } from './person-dedup-model';

  interface Props {
    appState: AppState;
    /** Linke Seite (A) und rechte Seite (B) — die Anzeige-Reihenfolge, nicht die Rolle. */
    idA: string;
    idB: string;
    score: number;
    reasons: string[];
    /** Vorschlag, welche Seite bleibt. Der Nutzer kann mit „⇄ Seiten tauschen" wechseln. */
    suggestedWinner: string;
    onClose: () => void;
    /** Nach erfolgreichem Merge/Protokolleintrag — der Aufrufer meldet den Erfolg. */
    onDone: (message: string) => void;
    /** „Ignorieren" (BL-105): das Paar dauerhaft als „kein Duplikat" merken. Die
     *  Persistenz gehört der Ansicht, nicht diesem Modal — hier wird nur gemeldet. */
    onIgnore: () => void;
  }
  const { appState, idA, idB, score, reasons, suggestedWinner, onClose, onDone, onIgnore }: Props = $props();

  /**
   * Eigene Wahl des Nutzers; `null` = dem Vorschlag folgen. Bewusst NICHT
   * `$state(suggestedWinner)`: ein aus einem Prop initialisierter Zustand friert dessen
   * ersten Wert ein (svelte-check meldet das zu Recht) und wäre still falsch, sobald das
   * Modal je für ein zweites Paar wiederverwendet würde. Gleiches Muster wie
   * `chosenWinner` in PlaceDedupView.
   */
  let chosenWinner = $state<string | null>(null);
  const winnerId = $derived(chosenWinner ?? suggestedWinner);
  /**
   * Die Wahl wird SPALTENWEISE gehalten ('A'/'B'), nicht als Merge-Rolle. Sonst kippte
   * jede getroffene Feldwahl beim „⇄ Seiten tauschen" mit um: der Tausch entscheidet,
   * wer BLEIBT, nicht welcher Wert gemeint war. Übersetzt wird erst beim Zusammenführen.
   * (Gleiches Verhalten wie das v8-Orakel, das seine Auswahl ebenfalls als A/B hält.)
   */
  let columnChoice = $state<Record<string, 'A' | 'B'>>({});

  const personA = $derived(appState.db.individuals.get(idA));
  const personB = $derived(appState.db.individuals.get(idB));
  const winnerIsA = $derived(winnerId === idA);
  const loserId = $derived(winnerIsA ? idB : idA);

  const rows = $derived(personA && personB ? buildCompareRows(personA, personB, appState.placeContext) : []);
  const context = $derived(
    personA && personB ? contextRows({ individuals: appState.db.individuals, families: appState.db.families }, personA, personB) : [],
  );

  const winnerColumn = $derived<'A' | 'B'>(winnerIsA ? 'A' : 'B');

  /** Ohne eigene Wahl gilt die Gewinner-Spalte — dieselbe Voreinstellung wie im Kommando. */
  function chosenColumn(key: string): 'A' | 'B' {
    return columnChoice[key] ?? winnerColumn;
  }

  function choose(key: string, column: 'A' | 'B') {
    columnChoice = { ...columnChoice, [key]: column };
  }

  /**
   * Übersetzt die Spaltenwahl in die Merge-Rollen des Kommandos. Diese Übersetzung sitzt
   * bewusst NUR hier: das Kommando soll nichts von Bildschirmseiten wissen, die Ansicht
   * nichts von der Merge-Rolle einzelner Felder.
   */
  function toSelections(): MergeSelections {
    const out: Record<string, MergeSide> = {};
    for (const [key, column] of Object.entries(columnChoice)) {
      out[key] = column === winnerColumn ? 'winner' : 'loser';
    }
    return out;
  }

  function swapSides() {
    chosenWinner = winnerId === idA ? idB : idA;
  }

  function confirmMerge() {
    const winnerName = displayName(appState.db.individuals.get(winnerId)!);
    const loserName = displayName(appState.db.individuals.get(loserId)!);
    appState.mergePerson(winnerId, loserId, toSelections());
    onDone(`Zusammengeführt: „${loserName}" → „${winnerName}".`);
    onClose();
  }

  /**
   * „Statt Merge": legt bei BEIDEN Personen einen offenen Protokolleintrag an — reine
   * Wiederverwendung des LogEntry-Mechanismus (Spec 12 §2), kein zweiter Ablageort für
   * „das muss ich später klären".
   */
  function createLogEntries() {
    const today = new Date().toISOString().slice(0, 10);
    const a = appState.db.individuals.get(idA)!;
    const b = appState.db.individuals.get(idB)!;
    const note = `Gründe: ${reasons.join(', ')}`;
    for (const [self, other] of [
      [a, b],
      [b, a],
    ] as const) {
      appState.addLogEntry(
        'person',
        self.id,
        makeLogEntry({
          date: today,
          query: `Duplikat-Prüfung mit ${displayName(other)} (${other.id}) — Score ${score}`,
          result: 'pending',
          note,
        }),
      );
    }
    onDone('Forschungseintrag bei beiden Personen angelegt.');
    onClose();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="stb-modal-backdrop" onclick={onClose} role="presentation">
  <div
    class="person-merge__panel"
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Personen zusammenführen"
  >
    <div class="person-merge__head">
      <h3>Zusammenführen</h3>
      <button type="button" class="person-merge__close-btn" onclick={onClose} aria-label="Schließen">✕</button>
    </div>

    {#if !personA || !personB}
      <p class="person-merge__gone">Eine der beiden Personen existiert nicht mehr.</p>
    {:else}
      <p class="person-merge__score">
        Score <strong>{score}</strong>{#if reasons.length} — {reasons.join(', ')}{/if}
      </p>
      <p class="person-merge__hint">
        Gleiche Felder sind zusammengefasst. Wo sich die Angaben unterscheiden, den gewünschten Wert anklicken.
      </p>

      <table class="person-merge__table">
        <thead>
          <tr>
            <th scope="col">Feld</th>
            <th scope="col" class:person-merge__th--winner={winnerIsA}>
              {displayName(personA)}{#if winnerIsA}<span class="person-merge__keeps"> — bleibt</span>{/if}
            </th>
            <th scope="col" class:person-merge__th--winner={!winnerIsA}>
              {displayName(personB)}{#if !winnerIsA}<span class="person-merge__keeps"> — bleibt</span>{/if}
            </th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.key)}
            {#if row.equal}
              <tr class="person-merge__row--equal">
                <th scope="row">{row.label}</th>
                <td colspan="2">{row.displayA || '–'}</td>
              </tr>
            {:else}
              <tr class="person-merge__row--diff">
                <th scope="row">{row.label}</th>
                <td>
                  <button
                    type="button"
                    class="person-merge__cell"
                    class:person-merge__cell--chosen={chosenColumn(row.key) === 'A'}
                    aria-pressed={chosenColumn(row.key) === 'A'}
                    onclick={() => choose(row.key, 'A')}
                  >
                    {row.displayA || '–'}
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    class="person-merge__cell"
                    class:person-merge__cell--chosen={chosenColumn(row.key) === 'B'}
                    aria-pressed={chosenColumn(row.key) === 'B'}
                    onclick={() => choose(row.key, 'B')}
                  >
                    {row.displayB || '–'}
                  </button>
                </td>
              </tr>
            {/if}
          {/each}
          {#each context as row (row.label)}
            <tr class="person-merge__row--context">
              <th scope="row">{row.label}</th>
              <td>{row.valueA || '–'}</td>
              <td>{row.valueB || '–'}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      <p class="person-merge__note">
        Ereignisse, Quellen, Medien, Notizen und Familienbindungen beider Personen werden vollständig
        übernommen — nur die oben gewählten Einzelfelder entscheiden sich für eine Seite.
        Rücknehmbar über „Rückgängig“.
      </p>

      <div class="person-merge__actions">
        <button type="button" class="person-merge__btn" onclick={swapSides}>⇄ Seiten tauschen</button>
        <button type="button" class="person-merge__btn" onclick={createLogEntries}>📝 Forschungseintrag</button>
        <button type="button" class="person-merge__btn" onclick={onIgnore}>Kein Duplikat</button>
        <button type="button" class="person-merge__btn person-merge__btn--primary" onclick={confirmMerge}>
          Zusammenführen
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .person-merge__panel {
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
    padding: 1rem;
    width: min(92vw, 640px);
    max-height: 88vh;
    overflow-y: auto;
  }

  .person-merge__head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .person-merge__head h3 {
    margin: 0;
  }

  .person-merge__close-btn {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--stb-text);
    font-size: 1.1rem;
    cursor: pointer;
  }

  .person-merge__score,
  .person-merge__hint,
  .person-merge__note,
  .person-merge__gone {
    font-size: 0.82rem;
    color: var(--stb-text-dim);
    margin: 0.5rem 0 0;
  }

  /* `table-layout: fixed` ist hier nicht Kosmetik, sondern die Funktionsbedingung:
     ohne sie bestimmt der längste Zellinhalt die Spaltenbreite, und eine volle
     Verwaltungskette („Ochtrup, Amt Ochtrup, Kreis Steinfurt, Provinz Westfalen,
     Königreich Preußen, Deutsches Reich") schob die B-Spalte aus dem Panel heraus —
     am echten Bestand gesehen: Werte weder lesbar noch anklickbar, ohne jede
     Scroll-Affordanz (dieselbe Fehlerklasse wie BL-95). Feste Spaltenanteile plus
     Umbruch halten beide Seiten sichtbar. */
  .person-merge__table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    margin-top: 0.7rem;
    font-size: 0.84rem;
  }

  .person-merge__table th,
  .person-merge__table td {
    text-align: left;
    padding: 0.25rem 0.35rem;
    vertical-align: top;
    overflow-wrap: anywhere;
  }

  .person-merge__table th:first-child,
  .person-merge__table td:first-child {
    width: 26%;
  }

  .person-merge__table thead th {
    color: var(--stb-gold-light);
    border-bottom: 1px solid var(--stb-gold-dim);
  }

  .person-merge__th--winner {
    color: var(--stb-gold);
  }

  .person-merge__keeps {
    font-weight: 400;
    font-size: 0.72rem;
    color: var(--stb-text-dim);
  }

  .person-merge__row--equal td {
    color: var(--stb-text-dim);
  }

  .person-merge__row--context th,
  .person-merge__row--context td {
    color: var(--stb-text-dim);
    font-size: 0.78rem;
    border-top: 1px solid var(--stb-surface-3);
  }

  .person-merge__cell {
    width: 100%;
    text-align: left;
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid transparent;
    border-radius: var(--stb-radius-control);
    padding: 0.2rem 0.4rem;
    cursor: pointer;
    font: inherit;
  }

  .person-merge__cell--chosen {
    border-color: var(--stb-gold);
    background: var(--stb-surface-3);
  }

  .person-merge__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.9rem;
  }

  .person-merge__btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.7rem;
    cursor: pointer;
  }

  .person-merge__btn--primary {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border-color: var(--stb-gold);
    font-weight: 600;
    margin-left: auto;
  }
</style>
