<script lang="ts">
  // ui/shell/NotesSection.svelte — die Notizen EINES Datensatzes, an allen Steckbriefen
  // derselbe Baustein (BL-381, INV-UI-4).
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
  // Die Zusammenfassungszeile trägt INFORMATION, nicht „Mehr": Anriss der ersten Zeile plus
  // Umfang — und bei einer geteilten Notiz, wie viele weitere Datensätze an ihr hängen. Das
  // ist die Auskunft, die VOR einem Edit gebraucht wird (BL-382), nicht danach.
  import type { Database } from '../../core/model/types';
  import { collectNotes, istLangeNotiz, notizAnriss, type NoteOwner } from './notes-model';
  import { tooltip } from './tooltip';

  interface Props {
    db: Database;
    /** Person, Familie oder Quelle — die Familie kennt keine `noteRefs`, das ist zulässig. */
    owner: NoteOwner;
  }
  const { db, owner }: Props = $props();

  const notes = $derived(collectNotes(db, owner));

  const HERKUNFT: Record<string, string> = {
    extra: 'Weitere Notiz',
    shared: 'Geteilte Notiz',
  };

  /** „· 783 Zeichen" — der Umfang, auf den man sich beim Aufklappen einlässt. */
  function umfang(text: string): string {
    return `${text.length} Zeichen`;
  }

  function mitverwender(n: number): string {
    return n === 1 ? 'auch bei 1 weiteren Datensatz' : `auch bei ${n} weiteren Datensätzen`;
  }
</script>

<!-- Ohne Notizen KEINE leere Sektion: der Steckbrief ist ohnehin lang, und eine Überschrift
     über nichts ist eine Zeile, die nichts sagt. Die Fläche zum Anlegen kommt mit BL-382 —
     dort hat sie einen Zweck. -->
{#if notes.length > 0}
  <section class="notes-section">
    <h3 class="stb-section-title">Notizen</h3>
    <ul class="notes-section__list">
      {#each notes as note (note.key)}
        <li class="notes-section__row">
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

          {#if istLangeNotiz(note.text)}
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
  </section>
{/if}

<style>
  .notes-section__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
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
</style>
