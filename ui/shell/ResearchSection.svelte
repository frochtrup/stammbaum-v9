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
  import TaskForm, { type TaskFormValues } from '../views/tasks/TaskForm.svelte';
  import LogForm, { type LogFormValues } from '../views/research-log/LogForm.svelte';
  import HypothesisForm, { type HypothesisFormValues } from '../views/hypotheses/HypothesisForm.svelte';
  import { newTaskId } from '../views/tasks/tasks-commands';
  import { newHypothesisId } from '../views/hypotheses/hypothesis-commands';
  import { makeLogEntry } from '../../core/research/index';
  import type { AppState } from './app-state.svelte';
  import type { TaskEntityKind } from '../views/tasks/tasks-model';

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
  let offen = $state<Art | null>(null);
  let ausgeklappt = $state(false);

  /** Ab wie vielen Einträgen die Liste einklappt (Nutzer-Entscheidung: mehr als drei). */
  const SICHTBAR = 3;

  interface Zeile {
    art: Art;
    /** Rollen-Beschriftung links — dieselbe `.stb-role-label`-Vorsatzform wie in den
     *  Familien- und Ereigniszeilen daneben. */
    rolle: string;
    text: string;
    /** Kurzer Zusatz rechts (Status, Gewicht, Datum) — nie die einzige Information. */
    neben: string;
  }

  const traeger = $derived(
    kind === 'person' ? appState.db.individuals.get(entityId) : appState.db.families.get(entityId),
  );

  const zeilen = $derived.by<Zeile[]>(() => {
    const t = traeger;
    if (!t) return [];
    return [
      ...t.tasks.map((a): Zeile => ({ art: 'task', rolle: 'Aufgabe', text: a.text, neben: a.category })),
      ...t.hypotheses.map((h): Zeile => ({ art: 'hypo', rolle: 'Hypothese', text: h.text, neben: h.status })),
      // Das Protokoll zuletzt: es wächst am schnellsten und ist am wenigsten
      // handlungsleitend — Aufgaben und Hypothesen sagen, was noch zu tun ist.
      ...t.researchLog.map((l): Zeile => ({ art: 'log', rolle: 'Protokoll', text: l.query || l.result, neben: l.date })),
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

  function speichereAufgabe(v: TaskFormValues) {
    appState.addTask(kind, entityId, newTaskId(), v.text, v.category, heute, v.sourceRef);
    offen = null;
  }
  function speichereProtokoll(v: LogFormValues) {
    appState.addLogEntry(kind, entityId, makeLogEntry(v));
    offen = null;
  }
  function speichereHypothese(v: HypothesisFormValues) {
    appState.addHypothesis(kind, entityId, newHypothesisId(), {
      text: v.text, status: v.status, weight: v.weight,
      evidence: v.evidence, rationale: v.rationale, conclusion: v.conclusion,
    }, heute);
    offen = null;
  }
</script>

<section class="forschung">
  <p class="stb-role-label">Forschung</p>

  {#if zeilen.length > 0}
    <ul class="forschung__liste">
      {#each sichtbareZeilen as z, i (z.art + i)}
        <li>
          <span class="stb-role-label forschung__rolle">{z.rolle}</span>
          <span class="forschung__text">{z.text}</span>
          {#if z.neben}<span class="forschung__neben">· {z.neben}</span>{/if}
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
    <EventTypeMenu triggerLabel="+ Forschungseintrag" groups={[MENU]} onSelect={(tag) => (offen = tag as Art)} />
  </div>

  <!-- Die Formulare sind DIESELBEN wie in den drei Forschungsansichten (INV-UI-4); nur
       `zielFest` unterdrückt den Entitäts-Picker, weil das Ziel hier die Seite selbst ist.
       Inline statt Modal — genauso zeigen TasksView/LogView/HypothesesView sie an. -->
  {#if offen === 'task'}
    <TaskForm
      {appState}
      initial={{ text: '', category: '', sourceRef: '', kind, entityId }}
      isEditing={false}
      zielFest={true}
      onSubmit={speichereAufgabe}
      onCancel={() => (offen = null)}
    />
  {:else if offen === 'log'}
    <LogForm
      {appState}
      initial={{ date: heute, repoRef: '', sourceRef: '', query: '', result: 'pending', note: '', taskId: '', kind, entityId }}
      isEditing={false}
      zielFest={true}
      onSubmit={speichereProtokoll}
      onCancel={() => (offen = null)}
    />
  {:else if offen === 'hypo'}
    <HypothesisForm
      {appState}
      initial={{ text: '', status: 'open', weight: 'low', evidence: [], rationale: '', conclusion: '', kind, entityId }}
      isEditing={false}
      zielFest={true}
      onSubmit={speichereHypothese}
      onCancel={() => (offen = null)}
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

  .forschung__aktionen {
    margin-top: 0.55rem;
  }
</style>
