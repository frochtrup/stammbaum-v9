<script lang="ts">
  // ui/views/import/ImportCompareView.svelte — Import-Vergleich (BL-107, Spec 20 §1.12).
  //
  // Zweite Datei gegen den Bestand halten, pro Person entscheiden, am Ende EINMAL
  // übernehmen. Die Ansicht rechnet nichts und schreibt nichts selbst: Vergleich kommt
  // aus `compareImport`, das Schreiben läuft über `appState.applyImport(...)` — damit
  // hängt die Übernahme am regulären Undo-Stack.
  //
  // NUR GEDCOM. Spec 20 §1.12 nennt „GEDCOM oder GRAMPS"; der bestehende Lade-Pfad
  // (`ImportButton.svelte`) ist ebenfalls GEDCOM-only, und eine halbe GRAMPS-Anbindung
  // wäre schlechter als eine benannte Lücke — eine `.gramps`-Datei wird deshalb klar
  // abgewiesen statt still falsch geparst.
  //
  // Paginierung über `pageSlice` wie überall sonst (Spec 21 §10b, INV-UI-4): der
  // Vergleich zweier vollständiger Bestände liefert Tausende Zeilen (am echten Material
  // 2.811).
  import type { AppState } from '../../shell/app-state.svelte';
  import type { FileService } from '../../../services/file';
  import type { ImportMatch, ImportSelections, FieldDecision, PersonGraph } from '../../../core/dedup';
  import { compareImport } from '../../../core/dedup';
  import { parseGedcom } from '../../../core/interop';
  import { makeLogEntry } from '../../../core/research';
  import { pageSlice, DEFAULT_PAGE_SIZE } from '../../shell/pagination';
  import { buildImportRows, countByStatus, diffForRow, STATUS_LABELS, type ImportRow } from './import-compare-model';

  interface Props {
    appState: AppState;
    fileService: FileService;
    onClose?: () => void;
  }
  const { appState, fileService, onClose }: Props = $props();

  let fileName = $state('');
  let fehler = $state('');
  let laden = $state(false);
  let fremd = $state<PersonGraph | null>(null);
  /** Die volle Fremddatei inkl. Quellen/Archiven — nötig, damit Belege mitwandern (BL-106). */
  let fremdDatei = $state<Parameters<AppState['applyImport']>[0] | null>(null);
  let treffer = $state<ImportMatch[]>([]);
  let statusFilter = $state<'matched' | 'uncertain' | 'new'>('matched');
  let shown = $state(DEFAULT_PAGE_SIZE);
  let gewaehlt = $state<ImportRow | null>(null);
  let meldung = $state('');

  /** „≠ Andere Person" — aufgehobene Zuordnungen (Spec 20 §1.12). */
  let aufgehoben = $state<Set<string>>(new Set());
  /** Feld-Entscheidungen je Import-Person. */
  let felder = $state<Record<string, Record<string, FieldDecision>>>({});
  /** Import-Personen, die vollständig übernommen werden sollen. */
  let neuUebernehmen = $state<Set<string>>(new Set());

  const basis = $derived<PersonGraph>({ individuals: appState.db.individuals, families: appState.db.families });
  const zeilen = $derived(
    fremd ? buildImportRows(basis, fremd, treffer, appState.placeContext, aufgehoben) : [],
  );
  const zaehler = $derived(countByStatus(zeilen));
  const gefiltert = $derived(zeilen.filter((z) => z.status === statusFilter));
  const paged = $derived(pageSlice(gefiltert, shown));
  const diff = $derived(fremd && gewaehlt ? diffForRow(basis, fremd, gewaehlt) : null);

  async function dateiWaehlen() {
    fehler = '';
    meldung = '';
    laden = true;
    try {
      const picked = await fileService.pickAndImport();
      if (!picked) return;
      if (picked.name.toLowerCase().endsWith('.gramps')) {
        fehler = 'GRAMPS-Dateien werden hier noch nicht verglichen — bitte eine GEDCOM-Datei wählen.';
        return;
      }
      const { db } = parseGedcom(picked.text);
      fileName = picked.name;
      fremd = { individuals: db.individuals, families: db.families };
      fremdDatei = db;
      treffer = compareImport(basis, fremd);
      zuruecksetzen();
    } catch (err) {
      fehler = err instanceof Error ? err.message : String(err);
    } finally {
      laden = false;
    }
  }

  function zuruecksetzen() {
    aufgehoben = new Set();
    felder = {};
    neuUebernehmen = new Set();
    gewaehlt = null;
    shown = DEFAULT_PAGE_SIZE;
  }

  function waehleStatus(s: typeof statusFilter) {
    statusFilter = s;
    shown = DEFAULT_PAGE_SIZE;
    gewaehlt = null;
  }

  function entscheide(importId: string, key: string, decision: FieldDecision) {
    felder = { ...felder, [importId]: { ...(felder[importId] ?? {}), [key]: decision } };
  }

  function entscheidungVon(importId: string, key: string): FieldDecision {
    return felder[importId]?.[key] ?? 'ignore';
  }

  function andereePerson(row: ImportRow) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const next = new Set(aufgehoben);
    next.add(row.importId);
    aufgehoben = next;
    gewaehlt = null;
    meldung = `Zuordnung aufgehoben — „${row.importLabel}" gilt jetzt als neu.`;
  }

  function neuUmschalten(row: ImportRow) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const next = new Set(neuUebernehmen);
    if (next.has(row.importId)) next.delete(row.importId);
    else next.add(row.importId);
    neuUebernehmen = next;
  }

  /**
   * „Forschungseintrag" statt Übernahme — dieselbe LogEntry-Wiederverwendung wie im
   * Duplikat-Merge (Spec 20 §1.12: EIN Mechanismus für „unklar, später prüfen").
   */
  function forschungseintrag(row: ImportRow, label: string, wert: string) {
    if (!row.baseId) return;
    appState.addLogEntry(
      'person',
      row.baseId,
      makeLogEntry({
        date: new Date().toISOString().slice(0, 10),
        query: `${label} aus ${fileName}: „${wert}"`,
        result: 'pending',
        note: `Import-Vergleich mit ${fileName}`,
      }),
    );
    meldung = `Forschungseintrag bei „${row.baseLabel}" angelegt.`;
  }

  function uebernehmen() {
    if (!fremdDatei) return;
    const auswahl: ImportSelections = { fields: felder, importNew: [...neuUebernehmen] };
    const wirksameTreffer = treffer.map((m) =>
      aufgehoben.has(m.importId) ? { ...m, baseId: null, status: 'new' as const } : m,
    );
    const r = appState.applyImport(fremdDatei, wirksameTreffer, auswahl, {
      title: `Import: ${fileName}`,
      date: new Date().toISOString().slice(0, 10),
    });
    const teile = [`${r.changedPersons} Personen ergänzt`, `${r.importedPersons} neu übernommen`];
    if (r.carriedSources > 0) teile.push(`${r.carriedSources} Quellen mitgezogen`);
    if (r.droppedCitations > 0) teile.push(`${r.droppedCitations} Zitate ohne Quelle entfallen`);
    meldung = `${teile.join(', ')}.`;
    treffer = compareImport(basis, fremd!);
    zuruecksetzen();
  }

  const offeneEntscheidungen = $derived(
    Object.values(felder).reduce((n, f) => n + Object.values(f).filter((d) => d !== 'ignore').length, 0) +
      neuUebernehmen.size,
  );
</script>

<div class="import-compare">
  <div class="import-compare__head">
    <h2>Import-Vergleich</h2>
    {#if onClose}
      <button type="button" class="import-compare__close-btn" onclick={onClose}>✕ Schließen</button>
    {/if}
  </div>

  <div class="import-compare__controls">
    <button type="button" class="import-compare__pick-btn" onclick={dateiWaehlen} disabled={laden}>
      {laden ? 'Wird gelesen…' : 'Zweite Datei wählen'}
    </button>
    {#if fileName}<span class="import-compare__filename">{fileName}</span>{/if}
  </div>

  {#if fehler}<p class="import-compare__error">{fehler}</p>{/if}
  {#if meldung}<p class="import-compare__status">{meldung}</p>{/if}

  {#if !fremd}
    <p class="import-compare__empty">
      Noch keine Vergleichsdatei geladen. Die gewählte Datei wird nur verglichen — der Bestand
      ändert sich erst, wenn Sie unten „Übernehmen" drücken.
    </p>
  {:else}
    <div class="stb-segment-row" role="tablist" aria-label="Klassifikation wählen">
      {#each (['matched', 'uncertain', 'new'] as const) as s (s)}
        <button
          type="button"
          role="tab"
          aria-selected={statusFilter === s}
          class="import-compare__seg"
          class:import-compare__seg--active={statusFilter === s}
          onclick={() => waehleStatus(s)}
        >
          {STATUS_LABELS[s]} ({zaehler[s]})
        </button>
      {/each}
    </div>

    <ul class="import-compare__list">
      {#each paged.visible as row (row.key)}
        <li>
          <button
            type="button"
            class="import-compare__row"
            class:import-compare__row--active={gewaehlt?.key === row.key}
            onclick={() => (gewaehlt = row)}
          >
            <span class="import-compare__names">
              <span>{row.importLabel}</span>
              {#if row.baseLabel}<span class="import-compare__vs">↔ {row.baseLabel}</span>{/if}
              {#if row.status !== 'new'}<span class="import-compare__score">{row.score}</span>{/if}
            </span>
            <span class="import-compare__meta">{row.importMeta || '?'}</span>
            {#if row.offeneFelder > 0}
              <span class="import-compare__badge">{row.offeneFelder} abweichende Felder</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
    {#if paged.remaining > 0}
      <button type="button" class="import-compare__more" onclick={() => (shown += DEFAULT_PAGE_SIZE)}>
        {Math.min(paged.remaining, DEFAULT_PAGE_SIZE)} weitere laden
      </button>
    {/if}

    {#if gewaehlt}
      <div class="import-compare__detail">
        <h3>{gewaehlt.importLabel}</h3>
        {#if gewaehlt.status === 'new'}
          <p class="import-compare__hint">Diese Person kommt im Bestand nicht vor.</p>
          <label class="import-compare__take-new">
            <input
              type="checkbox"
              checked={neuUebernehmen.has(gewaehlt.importId)}
              onchange={() => neuUmschalten(gewaehlt!)}
            />
            <span>Vollständig übernehmen</span>
          </label>
        {:else if diff}
          <p class="import-compare__hint">
            Zugeordnet zu „{gewaehlt.baseLabel}" ({gewaehlt.score}){#if gewaehlt.reasons.length}
              — {gewaehlt.reasons.join(', ')}{/if}
          </p>
          <button type="button" class="import-compare__unmatch" onclick={() => andereePerson(gewaehlt!)}>
            ≠ Andere Person
          </button>

          {#each [{ titel: 'Ergänzungen', eintraege: diff.additions, konflikt: false }, { titel: 'Konflikte', eintraege: diff.conflicts, konflikt: true }] as gruppe (gruppe.titel)}
            {#if gruppe.eintraege.length > 0}
              <h4>{gruppe.titel} ({gruppe.eintraege.length})</h4>
              <ul class="import-compare__fields">
                {#each gruppe.eintraege as f (f.key)}
                  <li class="import-compare__field">
                    <span class="import-compare__field-label">{f.label}</span>
                    {#if gruppe.konflikt}
                      <span class="import-compare__field-base">Bestand: {f.baseValue}</span>
                    {/if}
                    <span class="import-compare__field-import">Import: {f.importValue}</span>
                    <span class="import-compare__field-actions">
                      <button
                        type="button"
                        aria-pressed={entscheidungVon(gewaehlt.importId, f.key) === 'take'}
                        class:import-compare__chosen={entscheidungVon(gewaehlt.importId, f.key) === 'take'}
                        onclick={() => entscheide(gewaehlt!.importId, f.key, 'take')}
                      >Übernehmen</button>
                      {#if gruppe.konflikt}
                        <button
                          type="button"
                          aria-pressed={entscheidungVon(gewaehlt.importId, f.key) === 'both'}
                          class:import-compare__chosen={entscheidungVon(gewaehlt.importId, f.key) === 'both'}
                          onclick={() => entscheide(gewaehlt!.importId, f.key, 'both')}
                        >A+B</button>
                      {/if}
                      <button
                        type="button"
                        aria-pressed={entscheidungVon(gewaehlt.importId, f.key) === 'ignore'}
                        class:import-compare__chosen={entscheidungVon(gewaehlt.importId, f.key) === 'ignore'}
                        onclick={() => entscheide(gewaehlt!.importId, f.key, 'ignore')}
                      >Ignorieren</button>
                      <button type="button" onclick={() => forschungseintrag(gewaehlt!, f.label, f.importValue)}>
                        📝 Forschungseintrag
                      </button>
                    </span>
                  </li>
                {/each}
              </ul>
            {/if}
          {/each}

          {#if diff.identical.length > 0}
            <details class="import-compare__identical">
              <summary>Identisch ({diff.identical.length})</summary>
              <ul>
                {#each diff.identical as f (f.key)}
                  <li>{f.label}: {f.importValue}</li>
                {/each}
              </ul>
            </details>
          {/if}
        {/if}
      </div>
    {/if}

    <div class="import-compare__apply">
      <button type="button" class="import-compare__apply-btn" onclick={uebernehmen} disabled={offeneEntscheidungen === 0}>
        Übernehmen ({offeneEntscheidungen})
      </button>
    </div>
  {/if}
</div>

<style>
  .import-compare {
    padding: 1rem;
    overflow-y: auto;
  }

  .import-compare__head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .import-compare__head h2 {
    margin: 0;
  }

  .import-compare__close-btn,
  .import-compare__unmatch,
  .import-compare__more {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }

  .import-compare__close-btn {
    margin-left: auto;
  }

  .import-compare__controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.8rem;
  }

  .import-compare__pick-btn,
  .import-compare__apply-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  .import-compare__apply-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .import-compare__filename {
    font-size: 0.82rem;
    color: var(--stb-text-dim);
  }

  .import-compare__error,
  .import-compare__status,
  .import-compare__empty,
  .import-compare__hint {
    font-size: 0.85rem;
    color: var(--stb-text-dim);
    margin: 0.7rem 0 0;
  }

  .import-compare__error {
    color: var(--stb-quay-1);
  }

  .import-compare__seg {
    background: none;
    border: none;
    color: var(--stb-text-dim);
    padding: 0.35rem 0.6rem;
    cursor: pointer;
    font: inherit;
  }

  .import-compare__seg--active {
    color: var(--stb-gold);
    border-bottom: 2px solid var(--stb-gold);
  }

  .import-compare__list {
    list-style: none;
    margin: 0.6rem 0 0;
    padding: 0;
  }

  .import-compare__row {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    width: 100%;
    text-align: left;
    background: var(--stb-surface-1);
    color: var(--stb-text);
    border: 1px solid transparent;
    border-radius: var(--stb-radius-card);
    padding: 0.45rem 0.7rem;
    margin-bottom: 0.35rem;
    cursor: pointer;
    font: inherit;
  }

  .import-compare__row--active {
    border-color: var(--stb-gold);
  }

  .import-compare__names {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    font-size: 0.88rem;
  }

  .import-compare__score {
    margin-left: auto;
    font-weight: 600;
    color: var(--stb-gold);
  }

  .import-compare__vs,
  .import-compare__meta,
  .import-compare__badge {
    font-size: 0.76rem;
    color: var(--stb-text-dim);
  }

  .import-compare__detail {
    margin-top: 1rem;
    padding: 0.8rem;
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
  }

  .import-compare__detail h3,
  .import-compare__detail h4 {
    margin: 0 0 0.4rem;
    font-size: 0.92rem;
  }

  .import-compare__fields {
    list-style: none;
    margin: 0 0 0.8rem;
    padding: 0;
  }

  .import-compare__field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.4rem 0;
    border-top: 1px solid var(--stb-surface-3);
    font-size: 0.82rem;
  }

  .import-compare__field-label {
    font-weight: 600;
  }

  .import-compare__field-base,
  .import-compare__field-import {
    color: var(--stb-text-dim);
    overflow-wrap: anywhere;
  }

  .import-compare__field-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.2rem;
  }

  .import-compare__field-actions button {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid transparent;
    border-radius: var(--stb-radius-control);
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    font: inherit;
    font-size: 0.78rem;
  }

  .import-compare__field-actions button.import-compare__chosen {
    border-color: var(--stb-gold);
    background: var(--stb-surface-3);
  }

  .import-compare__take-new {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.5rem;
    font-size: 0.85rem;
  }

  .import-compare__identical {
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .import-compare__apply {
    margin-top: 1rem;
  }
</style>
