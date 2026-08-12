<script lang="ts">
  // ui/shell/ChildLinkEditModal.svelte — der Kindschafts-Editor (BL-329, ADR-v9-244):
  // Kind-Verhältnis (PEDI) und die BELEGE DER ABSTAMMUNG selbst an EINER Stelle.
  //
  // Warum es ihn gibt: `ChildLink.citations` ([10 §2]) war seit je modelliert und wurde
  // von keiner Fläche gezeigt — am Realbestand (`Testdateien/Unsere Familie 2026.ged`)
  // sind das 812 Zitate an 769 Personen, die die Abstammung belegen und in der App
  // unsichtbar waren. `pedigree` war sichtbar, aber nirgends editierbar; der Kommentar an
  // `saveFamily` (core/model/commands.ts) verwies seit BL-199 auf einen „ChildLink-Editor",
  // den es nicht gab. Das ist er.
  //
  // ZWEI EINSTIEGE, EINE KOMPONENTE (INV-UI-4): die Kind-Zeile der Familien-Detailseite
  // (dort steht die Kindschaft neben den Eltern, die sie belegt) und die Herkunftsfamilien-
  // Zeile des Personen-Steckbriefs (dort ist sie die eigene Abstammung). Beide zeigen
  // DENSELBEN `ChildLink` — eine zweite Fassung wäre eine zweite Wahrheit.
  //
  // Bauform: das etablierte Item-Modal (ADR-v9-65) wie `EventEditModal` — Backdrop aus
  // `.stb-modal-backdrop`, portaliert (INV-UI-13/[21 §6k]), Fokusfalle, Escape schließt,
  // Enter speichert (`formSubmit`), `<form>` INNERHALB des Panels ([21 §6i]). Die
  // Quellen-Sektion ist die vorhandene `EventCitationsSection` — sie kennt kein Ereignis,
  // nur eine Zitatliste, und war damit ohne Änderung wiederverwendbar.
  //
  // ANDERS ALS `EventEditModal` speichert dieses Modal SELBST: die Adresse des Objekts ist
  // vollständig durch (`personId`, `link.familyId`) bestimmt — es gibt nichts, was nur der
  // Aufrufer wüsste. Bei einem Ereignis ist das anders (birth/chr/…/events[i]); dort MUSS
  // der Aufrufer die Ablage kennen, und genau deshalb reicht es sein Ergebnis zurück.
  import { untrack } from 'svelte';
  import type { AppState } from './app-state.svelte';
  import type { ChildLink, Citation, PersonId } from '../../core/model/types';
  import EventCitationsSection from './EventCitationsSection.svelte';
  import type { CitationClipboard } from './citation-clipboard.svelte';
  import { formSubmit } from './form-keys';
  import { portal } from './portal';
  import { focusTrap } from './focus-trap';

  interface Props {
    appState: AppState;
    /** Das KIND — Träger des `ChildLink` (INV-P4: die Kindschaft wird INDI-seitig geführt). */
    personId: PersonId;
    /** Name des Kindes, für Überschrift und `aria-label` (INV-UI-6: nicht nur eine id). */
    personName: string;
    /** Bezeichnung der Herkunftsfamilie („Johann Decker ⚭ Anna Meyer") — Kontext in der Überschrift. */
    familyLabel: string;
    /** Der zu bearbeitende Link (roh aus dem Modell). */
    link: ChildLink;
    /** Quellreferenz-Ablage der Sitzung (BL-234) — durchgereicht an die Quellen-Sektion. */
    citationClipboard?: CitationClipboard;
    onClose: () => void;
  }
  const { appState, personId, personName, familyLabel, link, citationClipboard, onClose }: Props = $props();

  /** Kind-Verhältnis-Vokabular (PEDI, [10 §2]). Der leere Wert ist die Aussage „nicht
   *  angegeben" — NICHT „leiblich": ein leeres PEDI schreibt keine Zeile in die Datei, und
   *  aus dem Fehlen einer Angabe eine zu machen wäre eine Behauptung über die Quelle. */
  const PEDIGREE_OPTIONS: { value: ChildLink['pedigree']; label: string }[] = [
    { value: '', label: '— nicht angegeben —' },
    { value: 'birth', label: 'leiblich' },
    { value: 'adopted', label: 'adoptiert' },
    { value: 'foster', label: 'Pflegekind' },
    { value: 'sealing', label: 'gesiegelt (LDS)' },
  ];

  // Lokaler Entwurf: erst „Speichern" schreibt (kein Feld-Setter über eine fremde
  // Struktur). Einmalig aus dem Prop übernommen (`untrack`, PersonForm/EventEditModal-
  // Muster, TST-10) — KEIN fortlaufendes Re-Sync, sonst überschriebe ein Fremd-Update die
  // halbfertige Eingabe. `$state.snapshot` in `saveChildLink` löst den Proxy wieder auf.
  let pedigree = $state<ChildLink['pedigree']>(untrack(() => link.pedigree));
  let citations = $state<Citation[]>(untrack(() => link.citations.map((c) => ({ ...c }))));

  function save(): void {
    appState.saveChildLink(personId, { ...link, pedigree, citations });
    onClose();
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') onClose();
  }}
/>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="stb-modal-backdrop" use:portal use:focusTrap onclick={onClose} role="presentation">
  <div
    class="childlink-modal__panel"
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label={`Kindschaft von ${personName} bearbeiten`}
  >
    <form class="childlink-modal__form" onsubmit={formSubmit(save)}>
      <div class="childlink-modal__head">
        <h3>Kindschaft bearbeiten</h3>
        <button type="button" class="childlink-modal__close-btn" onclick={onClose} aria-label="Schließen">✕</button>
      </div>

      <p class="childlink-modal__context">
        <strong>{personName}</strong> als Kind von {familyLabel}
      </p>

      <label>
        Kind-Verhältnis
        <!-- `value` + `onchange` statt `bind:value` (TST-12, ESLint no-restricted-syntax):
             happy-dom setzt bei `bind:value` auf einem `<select>` nicht zuverlässig. -->
        <select
          aria-label="Kind-Verhältnis"
          value={pedigree}
          onchange={(e) => (pedigree = (e.currentTarget as HTMLSelectElement).value as ChildLink['pedigree'])}
        >
          {#each PEDIGREE_OPTIONS as opt (opt.value)}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </label>

      <EventCitationsSection
        {appState}
        {citations}
        labelPrefix="Kindschaft"
        {citationClipboard}
        onChange={(next) => (citations = next)}
      />

      <div class="childlink-modal__actions">
        <button type="submit" class="stb-btn" data-variant="primary">Speichern</button>
        <button type="button" class="stb-btn" data-variant="secondary" onclick={onClose}>Abbrechen</button>
      </div>
    </form>
  </div>
</div>

<style>
  /* Das Formular ist eine reine Gruppierungs-Hülle im Panel — es soll dessen Fluss nicht
     verändern, deshalb erbt es Spalten-Layout und Lücke (wie `EventEditModal`). */
  .childlink-modal__form {
    display: contents;
  }

  .childlink-modal__panel {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
    padding: 1rem;
    width: min(38rem, 94vw);
    max-height: 88vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .childlink-modal__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .childlink-modal__head h3 {
    margin: 0;
    font-size: 1rem;
  }

  .childlink-modal__close-btn {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 1.1rem;
    min-width: var(--stb-touch-target);
    min-height: var(--stb-touch-target);
  }

  .childlink-modal__context {
    margin: 0;
    color: var(--stb-text-dim);
    font-size: 0.88rem;
  }

  .childlink-modal__actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
</style>
