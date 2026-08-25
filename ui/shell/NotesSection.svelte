<script lang="ts">
  // ui/shell/NotesSection.svelte — die Notizen EINES Datensatzes, an allen Steckbriefen
  // derselbe Baustein (BL-381 Anzeige, BL-382 Bearbeitung; INV-UI-4).
  //
  // WOZU. Ein Datensatz trägt seine Notiz an bis zu drei Stellen — eigene Inline-Notiz,
  // weitere Inline-Notizen (`extraNotes`, BL-338) und Verweise auf geteilte
  // `0 @N@ NOTE`-Records. Gemessen an `Testdateien/Unsere Familie 2026-4.ged` standen davon
  // **14.013 Zeichen auf keiner Lesefläche**: die Records nirgends, `Family.noteText`
  // nirgends. Drei Anzeigen dafür zu bauen hieße, denselben Mechanismus dreimal zu erfinden;
  // hier ist es einer, und die Herkunft steht an der Zeile statt in der Bauart.
  //
  // LANGE NOTIZEN — SCHWELLE STATT DAUER-KÜRZUNG. Ausgezählt sind Notizen kurz (Median 10
  // Zeichen am Ereignis, 32 an geteilten Records, 84 an Personen; 97 % der geteilten passen
  // in ≤ 4 Zeilen). Lang ist eine Handvoll — 11 Records über 200 Zeichen. Eine Kürzung über
  // alles zu legen verschlechterte 98 % der Fälle für 2 %. Deshalb: unter der Schwelle steht
  // die Notiz einfach da; darüber trägt sie ein `<details>` (nativ tastaturbedienbar und
  // vorlesbar — ein CSS-Clamp müsste beides nachbauen und ließe den Text für die Suche
  // auffindbar, aber fürs Auge verschwunden).
  //
  // ZWEI GLYPHEN, ZWEI BEDEUTUNGEN (BL-382, [ADR-v9-263] E4). `.stb-icon-btn`, `✎` zuerst,
  // destruktiv außen — wie an der Aufgaben-, Protokoll- und Hypothesen-Zeile. Und die
  // Unterscheidung, an der hier alles hängt: `🗑` heißt „der Eintrag verschwindet" und gilt
  // nur für die EIGENEN Inline-Notizen; an einer geteilten Notiz steht `✕` = **Verweis
  // entfernen**, denn der Record gehört möglicherweise anderen und bleibt bestehen. Die
  // Glyphe sagt das, bevor geklickt wird — nicht die Rückfrage danach.
  //
  // Die Zusammenfassungszeile trägt INFORMATION, nicht „Mehr": Anriss der ersten Zeile plus
  // Umfang — und bei einer geteilten Notiz, wie viele weitere Datensätze an ihr hängen. Das
  // ist die Auskunft, die VOR dem Edit gebraucht wird, nicht danach.
  import type { AppState } from './app-state.svelte';
  import { collectNotes, istLangeNotiz, notizAnriss, type NoteEntry, type NoteOwner } from './notes-model';
  import { PROSE_FIELD, autoGrow } from './plain-input';
  import { formEscape, formSubmit } from './form-keys';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { tooltip } from './tooltip';

  interface Props {
    appState: AppState;
    /** Person, Familie oder Quelle — die Familie kennt keine `noteRefs`, das ist zulässig. */
    owner: NoteOwner;
    /**
     * Übernimmt die geänderten TRÄGER-Felder. Nur der Aufrufer weiß, ob er Person, Familie
     * oder Quelle ist und welches Speicher-Kommando dazugehört; die Sektion rechnet nur aus,
     * wie die Felder danach aussehen. Ein geteilter Record wird dagegen direkt über
     * `appState.saveNote` geschrieben — er gehört keinem Träger.
     */
    onOwnerChange: (patch: { noteText: string; extraNotes: string[]; noteRefs: string[] }) => void;
  }
  const { appState, owner, onOwnerChange }: Props = $props();

  const notes = $derived(collectNotes(appState.db, owner));

  const HERKUNFT: Record<string, string> = {
    extra: 'Weitere Notiz',
    shared: 'Geteilte Notiz',
  };

  /** „783 Zeichen" — der Umfang, auf den man sich beim Aufklappen einlässt. */
  function umfang(text: string): string {
    return `${text.length} Zeichen`;
  }

  function mitverwender(n: number): string {
    return n === 1 ? 'auch bei 1 weiteren Datensatz' : `auch bei ${n} weiteren Datensätzen`;
  }

  // — Bearbeiten —
  /** Der Schlüssel der Zeile im Edit-Modus; `neu` ist die noch nicht angelegte Notiz. */
  let editKey = $state<string | null>(null);
  let entwurf = $state('');
  let frage = $state<NoteEntry | null>(null);

  function starteEdit(n: NoteEntry): void {
    editKey = n.key;
    entwurf = n.text;
  }

  function starteNeu(): void {
    editKey = 'neu';
    entwurf = '';
  }

  function abbrechen(): void {
    editKey = null;
    entwurf = '';
  }

  const felder = (): { noteText: string; extraNotes: string[]; noteRefs: string[] } => ({
    noteText: owner.noteText,
    extraNotes: [...owner.extraNotes],
    noteRefs: [...(owner.noteRefs ?? [])],
  });

  function speichern(n: NoteEntry | null): void {
    const text = entwurf.trim();
    if (n === null) {
      // NEU: die erste Notiz wird die eigene, jede weitere eine `extraNotes`-Zeile. Das ist
      // keine Rangordnung, sondern die Wire-Form: `1 NOTE` steht einmal, alles Weitere ist
      // eine zweite `1 NOTE`-Zeile (BL-338).
      if (text === '') { abbrechen(); return; }
      const f = felder();
      if (f.noteText.trim() === '') f.noteText = text;
      else f.extraNotes.push(text);
      onOwnerChange(f);
    } else if (n.kind === 'shared' && n.noteId) {
      const rec = appState.db.notes.get(n.noteId);
      if (rec) appState.saveNote({ ...rec, text });
    } else if (n.kind === 'own') {
      onOwnerChange({ ...felder(), noteText: text });
    } else {
      const f = felder();
      const i = Number(n.key.slice('extra-'.length));
      f.extraNotes[i] = text;
      onOwnerChange(f);
    }
    abbrechen();
  }

  /**
   * `🗑` an einer eigenen Notiz — der Eintrag verschwindet. `✕` an einer geteilten entfernt
   * nur den VERWEIS; der Record bleibt im Bestand, auch wenn ihn danach niemand mehr verweist
   * (35 solche gibt es dort bereits, BL-380).
   */
  function entfernen(n: NoteEntry): void {
    const f = felder();
    if (n.kind === 'own') f.noteText = '';
    else if (n.kind === 'extra') f.extraNotes.splice(Number(n.key.slice('extra-'.length)), 1);
    else f.noteRefs = f.noteRefs.filter((id) => id !== n.noteId);
    onOwnerChange(f);
    frage = null;
  }

  const frageTitel = $derived(frage?.kind === 'shared' ? 'Verweis entfernen?' : 'Notiz löschen?');
  const frageText = $derived(
    frage === null
      ? ''
      : frage.kind === 'shared'
        ? `Die geteilte Notiz bleibt im Bestand${frage.alsoUsedBy > 0 ? ` — ${mitverwender(frage.alsoUsedBy)}` : ''}; nur der Verweis von hier wird gelöst.`
        : `„${notizAnriss(frage.text)}" geht mit ihrem gesamten Text verloren.`,
  );
</script>

<!-- Die Sektion steht auch OHNE Notizen, seit es hier etwas anzulegen gibt (BL-382) — sonst
     gäbe es keinen Einstieg. Dasselbe Muster wie „Personenbezüge" mit „+ Assoziation". -->
<section class="notes-section" class:notes-section--empty={notes.length === 0}>
  <h3 class="stb-section-title">Notizen</h3>

  {#if notes.length > 0}
    <ul class="notes-section__list">
      {#each notes as note (note.key)}
        <li class="notes-section__row">
          <div class="notes-section__kopf">
            {#if HERKUNFT[note.kind]}
              <p class="stb-role-label notes-section__herkunft">
                {HERKUNFT[note.kind]}
                {#if note.kind === 'shared' && note.alsoUsedBy > 0}
                  <span
                    class="notes-section__geteilt"
                    use:tooltip={'Diese Notiz gehört mehreren Datensätzen — eine Änderung wirkt bei allen.'}
                  >{mitverwender(note.alsoUsedBy)}</span>
                {/if}
              </p>
            {/if}
            <!-- Die Bedienelemente sitzen an der Zeile, nicht im Aufklapper: sie müssen
                 erreichbar sein, ohne den Text zu öffnen (INV-UI-12). -->
            <span class="notes-section__aktionen">
              <button
                type="button"
                class="stb-icon-btn"
                onclick={() => starteEdit(note)}
                aria-label={`${HERKUNFT[note.kind] ?? 'Notiz'} bearbeiten`}
                use:tooltip={'Bearbeiten'}
              >✎</button>
              <button
                type="button"
                class="stb-icon-btn"
                data-variant="danger"
                onclick={() => (frage = note)}
                aria-label={note.kind === 'shared' ? 'Verweis auf die geteilte Notiz entfernen' : 'Notiz löschen'}
                use:tooltip={note.kind === 'shared' ? 'Verweis entfernen' : 'Löschen'}
              >{note.kind === 'shared' ? '✕' : '🗑'}</button>
            </span>
          </div>

          {#if editKey === note.key}
            <!-- `<form onsubmit>` + `type="submit"` wie an jeder anderen Speichern-Fläche
                 (BL-276/§6i). Dass das Feld mehrzeilig ist, steht dem NICHT entgegen: ein
                 `<textarea>` löst kein implicit submission aus — Enter bleibt dort ein
                 Absatz, und der Submit-Pfad ist trotzdem da. (Ich hatte das Gegenteil
                 angenommen und die Knöpfe erst als `type="button"` gebaut; der Wächter
                 `tests/ui/entity-form-keyboard.test.ts` hat es sofort gemeldet.) -->
            <form class="notes-section__form" onsubmit={formSubmit(() => speichern(note))} onkeydown={formEscape(abbrechen)}>
              <textarea {...PROSE_FIELD} use:autoGrow bind:value={entwurf} aria-label="Notiztext"></textarea>
              <div class="notes-section__form-aktionen">
                <button type="submit" class="stb-btn" data-variant="primary">Speichern</button>
                <button type="button" class="stb-btn" data-variant="secondary" onclick={abbrechen}>Abbrechen</button>
              </div>
            </form>
          {:else if istLangeNotiz(note.text)}
            <details class="notes-section__lang">
              <summary class="notes-section__summary">
                <span class="notes-section__anriss">{notizAnriss(note.text)}</span>
                <span class="notes-section__umfang">{umfang(note.text)}</span>
              </summary>
              <p class="notes-section__text">{note.text}</p>
            </details>
          {:else}
            <p class="notes-section__text">{note.text}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if editKey === 'neu'}
    <form class="notes-section__form" onsubmit={formSubmit(() => speichern(null))} onkeydown={formEscape(abbrechen)}>
      <textarea {...PROSE_FIELD} use:autoGrow bind:value={entwurf} aria-label="Neue Notiz"></textarea>
      <div class="notes-section__form-aktionen">
        <button type="submit" class="stb-btn" data-variant="primary">Speichern</button>
        <button type="button" class="stb-btn" data-variant="secondary" onclick={abbrechen}>Abbrechen</button>
      </div>
    </form>
  {:else}
    <button type="button" class="stb-activation-pill" onclick={starteNeu}>+ Notiz</button>
  {/if}
</section>

{#if frage}
  <ConfirmDialog
    titel={frageTitel}
    text={frageText}
    bestaetigen={frage.kind === 'shared' ? 'Entfernen' : 'Löschen'}
    onConfirm={() => entfernen(frage!)}
    onCancel={() => (frage = null)}
  />
{/if}

<style>
  .notes-section__list {
    list-style: none;
    margin: 0 0 0.5rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .notes-section__kopf {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .notes-section__herkunft {
    margin: 0 0 0.15rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  /* Die Mitverwender-Angabe ist die inhaltlich wichtigste Auskunft der Zeile und darf nicht
     wie eine Fußnote aussehen — sie bekommt die Textfarbe, nicht die gedämpfte. */
  .notes-section__geteilt {
    color: var(--stb-text-dim);
    text-transform: none;
    letter-spacing: normal;
  }

  /* Ohne Herkunfts-Label (eigene Notiz) steht die Knopfgruppe trotzdem rechts. */
  .notes-section__aktionen {
    margin-left: auto;
    display: flex;
    gap: 0.2rem;
  }

  /* `pre-wrap` wie bei Ort/Hof/Quelle/Hypothesen: 9 der 11 langen Notizen tragen eigene
     Zeilenumbrüche, ihre Absatzstruktur IST der Lesefluss. */
  .notes-section__text {
    margin: 0;
    white-space: pre-wrap;
    color: var(--stb-text);
  }

  .notes-section__summary {
    cursor: pointer;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;
  }

  .notes-section__umfang {
    color: var(--stb-text-dim);
    font-size: 0.8rem;
  }

  .notes-section__lang .notes-section__text {
    margin-top: 0.35rem;
  }

  .notes-section__form textarea {
    width: 100%;
    box-sizing: border-box;
  }

  .notes-section__form-aktionen {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.35rem;
  }
</style>
