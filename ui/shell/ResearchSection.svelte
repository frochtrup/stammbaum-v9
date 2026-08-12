<script lang="ts">
  // ui/shell/ResearchSection.svelte — Forschungseinträge AN der Person/Familie (BL-341).
  //
  // DER BEFUND. `Person.tasks`/`researchLog`/`hypotheses` existieren im Modell seit dem
  // Neuaufsatz, die Kommandos sind seit jeher auf `(kind, entityId)` adressiert, und die
  // drei Formulare stehen als eigenständige Komponenten bereit. Nur der Weg dorthin fehlte:
  // angelegt werden konnte ein Eintrag ausschließlich in den drei Forschungsansichten, wo
  // man die Zielperson erst wieder heraussuchen muss — obwohl man gerade auf ihrer Seite
  // steht. Nutzer-Befund: „Forschungseinträge sollten direkt in Person/Familie angelegt
  // werden können."
  //
  // EINE KOMPONENTE FÜR BEIDE TRÄGER (INV-UI-4). Person und Familie unterscheiden sich hier
  // nur im `kind`-Parameter der Kommandos — zwei Fassungen wären zwei Stellen, an denen die
  // nächste Änderung nur zur Hälfte ankommt.
  //
  // EIN TRIGGER, NICHT DREI. Drei Knöpfe („+ Aufgabe", „+ Protokoll", „+ Hypothese") wären
  // drei Befehlsflächen für eine Absicht und rissen das Budget (INV-UI-11) auf einer Seite,
  // die schon fünf trägt. Das Sammelmenü ist dasselbe `EventTypeMenu`, das über den
  // Ereignissen steht — kein zweiter Mechanismus.
  //
  // WARUM DIE SEKTION AUCH ANZEIGT, was schon da ist: Anlegen ohne Anzeigen ist die Falle,
  // die in diesem Bereich schon zweimal zugeschnappt ist (die unsichtbare Priesterweihe,
  // das verlorene Geburtsdatum) — der Nutzer trägt etwas ein und kann nicht prüfen, ob es
  // angekommen ist. Ab dem VIERTEN Eintrag klappt die Liste ein (Nutzer-Entscheidung
  // 2026-08-11): die Steckbriefseite ist ohnehin lang, und wer viel Forschung an einer
  // Person hat, arbeitet in den Forschungsansichten weiter.
  import EventTypeMenu from './EventTypeMenu.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import TaskForm, { type TaskFormValues } from '../views/tasks/TaskForm.svelte';
  import LogForm, { type LogFormValues } from '../views/research-log/LogForm.svelte';
  import HypothesisForm, { type HypothesisFormValues } from '../views/hypotheses/HypothesisForm.svelte';
  import { newTaskId } from '../views/tasks/tasks-commands';
  import { newHypothesisId } from '../views/hypotheses/hypothesis-commands';
  import { makeLogEntry } from '../../core/research/index';
  import { resultLabel } from '../views/research-log/log-model';
  import { statusLabel } from '../views/hypotheses/hypothesis-model';
  import { sourceLabel } from './source-label';
  import type { AppState } from './app-state.svelte';
  import type { TaskEntityKind } from '../views/tasks/tasks-model';
  import type { Hypothesis, LogEntry, ResearchTask } from '../../core/research/types';

  interface Props {
    appState: AppState;
    /** Träger des Eintrags — bestimmt allein, welches Aggregat die Kommandos anfassen. */
    kind: TaskEntityKind;
    entityId: string;
    /** Heutiges Datum als `YYYY-MM-DD`. Injiziert statt hier gebildet (TST-3): der Kern ist
     *  uhrfrei, und ein Test soll das Datum setzen können statt es zu erraten. */
    heute: string;
  }
  const { appState, kind, entityId, heute }: Props = $props();

  type Art = 'task' | 'log' | 'hypo';

  /**
   * Was gerade offen ist — und WORAN es arbeitet (BL-350). `ziel: null` heißt anlegen,
   * ein gesetztes Ziel heißt bearbeiten; die Vorbelegung reist mit, weil die Formulare
   * ihren Startwert nur EINMAL beim Montieren lesen (`untrack`-Muster, TST-10).
   *
   * Adressiert wird wie in den drei Forschungsansichten, deren Kommandos hier
   * unverändert benutzt werden: Aufgabe und Hypothese über ihre `id`, der
   * Protokolleintrag über seinen INDEX — `LogEntry` hat bewusst keine eigene Id
   * (core/research/types.ts, v8-Parität).
   */
  type Offen =
    | { art: 'task'; ziel: { id: string } | null; initial: TaskFormValues }
    | { art: 'log'; ziel: { index: number } | null; initial: LogFormValues }
    | { art: 'hypo'; ziel: { id: string } | null; initial: HypothesisFormValues };
  let offen = $state<Offen | null>(null);
  let ausgeklappt = $state(false);

  /** Ab wie vielen Einträgen die Liste einklappt (Nutzer-Entscheidung: mehr als drei). */
  const SICHTBAR = 3;

  interface ZeileBasis {
    /** Rollen-Beschriftung links — dieselbe `.stb-role-label`-Vorsatzform wie in den
     *  Familien- und Ereigniszeilen daneben. */
    rolle: string;
    text: string;
    /** Kurzer Zusatz rechts (Status, Quelle, Datum) — nie die einzige Information. */
    neben: string;
  }
  /** Die Zeile trägt ihren Rohdatensatz mit: daraus wird die Vorbelegung beim
   *  Bearbeiten gebaut, ohne ihn ein zweites Mal zu suchen. */
  type Zeile =
    | (ZeileBasis & { art: 'task'; task: ResearchTask })
    | (ZeileBasis & { art: 'hypo'; hypo: Hypothesis })
    | (ZeileBasis & { art: 'log'; index: number; log: LogEntry });

  const traeger = $derived(
    kind === 'person' ? appState.db.individuals.get(entityId) : appState.db.families.get(entityId),
  );

  /** Die Zusätze einer Zeile: alles, was da ist, in fester Reihenfolge, mit „ · " getrennt
   *  — dieselbe Trennung wie in den Ereigniszeilen daneben. Leere Felder fallen weg,
   *  statt als „ ·  · " durchzuschlagen. */
  const zusatz = (...teile: string[]) => teile.filter((s) => s.trim() !== '').join(' · ');

  const zeilen = $derived.by<Zeile[]>(() => {
    const t = traeger;
    if (!t) return [];
    return [
      ...t.tasks.map(
        (a): Zeile => ({ art: 'task', rolle: 'Aufgabe', text: a.text, neben: a.category, task: a }),
      ),
      ...t.hypotheses.map(
        (h): Zeile => ({
          art: 'hypo',
          rolle: 'Hypothese',
          text: h.text,
          // `statusLabel` statt des rohen `h.status`: hier stand bis BL-350 „open" —
          // der englische Enum-Wert, den die Hypothesen-Ansicht nebenan längst
          // übersetzt (INV-UI-4: dieselbe Beschriftung, dieselbe Quelle).
          neben: statusLabel(h.status),
          hypo: h,
        }),
      ),
      // Das Protokoll zuletzt: es wächst am schnellsten und ist am wenigsten
      // handlungsleitend — Aufgaben und Hypothesen sagen, was noch zu tun ist.
      ...t.researchLog.map(
        (l, index): Zeile => ({
          art: 'log',
          rolle: 'Protokoll',
          // Der Suchbegriff ist die Überschrift der Zeile. Vorher stand hier
          // `l.query || l.result` — ohne Suchbegriff erschien der rohe Enum-Wert
          // („pending") als Text. Das Ergebnis gehört in den Zusatz, nicht in die
          // Überschrift (Formulierung wie in LogView).
          text: l.query || '(kein Suchbegriff)',
          // Nutzer-Befund 2026-08-12: „braucht nicht nur die Überschrift, sondern auch
          // Status und Quelle". Ein Protokolleintrag beantwortet drei Fragen — was
          // gesucht wurde, was dabei herauskam, worin gesucht wurde. Nur die erste stand
          // hier; ob eine Suche schon erledigt war, musste man in der Protokoll-Ansicht
          // nachsehen.
          neben: zusatz(resultLabel(l.result), sourceLabel(appState.db, l.sourceRef), l.date),
          index,
          log: l,
        }),
      ),
    ];
  });

  const sichtbareZeilen = $derived(
    ausgeklappt || zeilen.length <= SICHTBAR ? zeilen : zeilen.slice(0, SICHTBAR),
  );
  const verborgen = $derived(zeilen.length - sichtbareZeilen.length);

  const MENU = [
    { tag: 'task', label: 'Aufgabe' },
    { tag: 'log', label: 'Protokolleintrag' },
    { tag: 'hypo', label: 'Hypothese' },
  ];

  /** „+ Forschungseintrag" → Anlegen: leere Vorbelegung, kein Ziel. */
  function oeffneNeu(art: Art) {
    if (art === 'task') offen = { art, ziel: null, initial: { text: '', category: '', sourceRef: '', kind, entityId } };
    else if (art === 'log')
      offen = {
        art,
        ziel: null,
        initial: { date: heute, repoRef: '', sourceRef: '', query: '', result: 'pending', note: '', taskId: '', kind, entityId },
      };
    else
      offen = {
        art,
        ziel: null,
        initial: { text: '', status: 'open', weight: 'low', evidence: [], rationale: '', conclusion: '', kind, entityId },
      };
  }

  /** „✎" an einer Zeile → dasselbe Formular, vorbelegt und mit Ziel (BL-350). Die
   *  Vorbelegung wird hier aus dem Rohdatensatz gebaut, wie in LogView/TasksView/
   *  HypothesesView — kein zweiter Weg, nur ein zweiter Einstieg. */
  function bearbeite(z: Zeile) {
    if (z.art === 'task') {
      offen = {
        art: 'task',
        ziel: { id: z.task.id },
        initial: { text: z.task.text, category: z.task.category, sourceRef: z.task.sourceRef, kind, entityId },
      };
    } else if (z.art === 'log') {
      offen = { art: 'log', ziel: { index: z.index }, initial: { ...z.log, kind, entityId } };
    } else {
      const h = z.hypo;
      offen = {
        art: 'hypo',
        ziel: { id: h.id },
        initial: {
          text: h.text, status: h.status, weight: h.weight,
          // Kopie der Evidenzliste: das Formular arbeitet auf seiner eigenen, sonst
          // änderte ein Abbruch den Datensatz trotzdem.
          evidence: h.evidence.map((e) => ({ ...e })),
          rationale: h.rationale, conclusion: h.conclusion, kind, entityId,
        },
      };
    }
  }

  /** „🗑" an einer Zeile — die Rückfrage kommt aus `ConfirmDialog` (BL-351), wie an der
   *  Ereigniszeile daneben. Der Text nennt, WAS verschwindet, nicht bloß „wirklich?". */
  let frage = $state<Zeile | null>(null);
  const artName = (z: Zeile) =>
    z.art === 'task' ? 'Aufgabe' : z.art === 'log' ? 'Protokolleintrag' : 'Hypothese';

  function loesche(z: Zeile) {
    if (z.art === 'task') appState.deleteTask(kind, entityId, z.task.id);
    else if (z.art === 'log') appState.deleteLogEntry(kind, entityId, z.index);
    else appState.deleteHypothesis(kind, entityId, z.hypo.id);
    // Ein offenes Formular kann sich auf genau diesen Eintrag beziehen — und ein
    // Protokoll-Ziel ist ein INDEX, der nach dem Löschen auf den Nachbarn zeigt.
    offen = null;
    frage = null;
  }

  function speichereAufgabe(v: TaskFormValues) {
    const ziel = offen?.art === 'task' ? offen.ziel : null;
    if (ziel) appState.updateTask(kind, entityId, ziel.id, v.text, v.category, v.sourceRef);
    else appState.addTask(kind, entityId, newTaskId(), v.text, v.category, heute, v.sourceRef);
    offen = null;
  }
  function speichereProtokoll(v: LogFormValues) {
    const ziel = offen?.art === 'log' ? offen.ziel : null;
    if (ziel) appState.updateLogEntry(kind, entityId, ziel.index, makeLogEntry(v));
    else appState.addLogEntry(kind, entityId, makeLogEntry(v));
    offen = null;
  }
  function speichereHypothese(v: HypothesisFormValues) {
    const patch = {
      text: v.text, status: v.status, weight: v.weight,
      evidence: v.evidence, rationale: v.rationale, conclusion: v.conclusion,
    };
    const ziel = offen?.art === 'hypo' ? offen.ziel : null;
    if (ziel) appState.updateHypothesis(kind, entityId, ziel.id, patch);
    else appState.addHypothesis(kind, entityId, newHypothesisId(), patch, heute);
    offen = null;
  }
</script>

<section class="forschung">
  <h3 class="stb-section-title">Forschung</h3>

  {#if zeilen.length > 0}
    <ul class="forschung__liste">
      {#each sichtbareZeilen as z, i (z.art + ':' + (z.art === 'log' ? z.index : z.art === 'task' ? z.task.id : z.hypo.id) + ':' + i)}
        <li>
          <span class="stb-role-label forschung__rolle">{z.rolle}</span>
          <span class="forschung__text">{z.text}</span>
          {#if z.neben}<span class="forschung__neben">· {z.neben}</span>{/if}
          <!-- Bearbeiten/Löschen wie an einer Ereigniszeile (EventLine, INV-UI-4): dieselbe
               Knopf-Primitive, dieselben Glyphen, dieselbe Reihenfolge — die Zeile daneben
               am selben Steckbrief soll sich nicht anders bedienen lassen. -->
          <span class="forschung__zeilen-aktionen">
            <button
              type="button"
              class="stb-icon-btn"
              onclick={() => bearbeite(z)}
              aria-label={`${z.rolle} „${z.text}“ bearbeiten`}
            >
              ✎
            </button>
            <button
              type="button"
              class="stb-icon-btn"
              data-variant="danger"
              onclick={() => (frage = z)}
              aria-label={`${z.rolle} „${z.text}“ löschen`}
            >
              🗑
            </button>
          </span>
        </li>
      {/each}
    </ul>
    {#if verborgen > 0}
      <button type="button" class="stb-activation-pill" onclick={() => (ausgeklappt = true)}>
        {verborgen} weitere anzeigen
      </button>
    {:else if ausgeklappt && zeilen.length > SICHTBAR}
      <button type="button" class="stb-activation-pill" onclick={() => (ausgeklappt = false)}>
        Weniger anzeigen
      </button>
    {/if}
  {/if}

  <div class="forschung__aktionen">
    <EventTypeMenu triggerLabel="+ Forschungseintrag" groups={[MENU]} onSelect={(tag) => oeffneNeu(tag as Art)} />
  </div>

  <!-- Die Formulare sind DIESELBEN wie in den drei Forschungsansichten (INV-UI-4); nur
       `zielFest` unterdrückt den Entitäts-Picker, weil das Ziel hier die Seite selbst ist.
       Inline statt Modal — genauso zeigen TasksView/LogView/HypothesesView sie an.
       Anlegen und Bearbeiten teilen sich dasselbe Formular; `isEditing` sagt nur, ob ein
       Ziel gesetzt ist — die Kommando-Wahl trifft der Aufrufer (Chokepoint, Spec 02 §3). -->
  {#if offen?.art === 'task'}
    <TaskForm
      {appState}
      initial={offen.initial}
      isEditing={!!offen.ziel}
      zielFest={true}
      onSubmit={speichereAufgabe}
      onCancel={() => (offen = null)}
    />
  {:else if offen?.art === 'log'}
    <LogForm
      {appState}
      initial={offen.initial}
      isEditing={!!offen.ziel}
      zielFest={true}
      onSubmit={speichereProtokoll}
      onCancel={() => (offen = null)}
    />
  {:else if offen?.art === 'hypo'}
    <HypothesisForm
      {appState}
      initial={offen.initial}
      isEditing={!!offen.ziel}
      zielFest={true}
      onSubmit={speichereHypothese}
      onCancel={() => (offen = null)}
    />
  {/if}

  {#if frage}
    <ConfirmDialog
      titel={`${artName(frage)} löschen?`}
      text={`„${frage.text}“ geht mit allen Angaben verloren.`}
      onConfirm={() => frage && loesche(frage)}
      onCancel={() => (frage = null)}
    />
  {/if}
</section>

<style>
  .forschung__liste {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .forschung__liste li {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--stb-surface-2);
    flex-wrap: wrap;
  }

  /* Feste Spaltenbreite wie in den Familienzeilen daneben — die Rolle ist der Anker, an
     dem das Auge die Liste überfliegt. */
  .forschung__rolle {
    min-width: 5.5rem;
  }

  .forschung__text {
    flex: 1 1 12rem;
  }

  .forschung__neben {
    color: var(--stb-text-dim);
    font-size: 0.82rem;
  }

  /* Die Knöpfe stehen rechts außen und behalten ihre Größe (`flex: 0 0 auto`), auch wenn
     die Zeile umbricht — wörtlich die Anordnung von `.event-line__actions`. `align-items:
     center` lokal, weil die Zeile an der Grundlinie ausgerichtet ist: eine Glyphe auf der
     Grundlinie eines mehrzeiligen Textes hinge schief. */
  .forschung__zeilen-aktionen {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex: 0 0 auto;
    align-self: center;
  }

  .forschung__aktionen {
    margin-top: 0.55rem;
  }
</style>
