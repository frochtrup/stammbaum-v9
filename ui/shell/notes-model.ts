// ui/shell/notes-model.ts — sammelt die Notizen EINES Datensatzes und beantwortet die
// Längenfrage (BL-381). Framework-frei und ohne DOM, damit die Regeln headless prüfbar sind;
// `NotesSection.svelte` rendert nur, was hier entsteht.
//
// WARUM DAS ZUSAMMENGEHÖRT. Ein Datensatz kann seine Notiz an drei Stellen tragen — als eigene
// Inline-Notiz (`noteText`), als weitere Inline-Notiz (`extraNotes`, BL-338) und als Verweis
// auf einen geteilten `0 @N@ NOTE`-Record (`noteRefs`). Gemessen an
// `Testdateien/Unsere Familie 2026-4.ged` waren davon **14.013 Zeichen auf keiner Lesefläche**
// zu sehen (12.434 in 219 Records, 1.579 in `Family.noteText`); die drei Quellen als drei
// Anzeigen zu bauen, hätte denselben Mechanismus dreimal erfunden (INV-UI-4). Sie sind EINE
// Liste mit einer Herkunfts-Angabe je Eintrag.

import type { Database, NoteId } from '../../core/model/types';

/** Woher die Notiz stammt — bestimmt Kennzeichnung und (ab BL-382) die destruktive Glyphe. */
export type NoteKind = 'own' | 'extra' | 'shared';

export interface NoteEntry {
  /** Stabil über Neuberechnungen (Svelte-`{#each}`-Schlüssel). */
  key: string;
  kind: NoteKind;
  text: string;
  /** Nur bei `shared`: der Record, auf den der Verweis zeigt. */
  noteId: NoteId | null;
  /**
   * Nur bei `shared`: wie viele ANDERE Datensätze denselben Record verweisen. Steht in der
   * Zusammenfassungszeile, weil ein Edit sie alle trifft — die Auskunft gehört VOR die
   * Änderung, nicht in eine Rückfrage danach (BL-382).
   */
  alsoUsedBy: number;
}

/** Was ein Steckbrief mitbringen muss. `noteRefs` fehlt der Familie — sie kennt keine. */
export interface NoteOwner {
  id: string;
  noteText: string;
  extraNotes: readonly string[];
  noteRefs?: readonly NoteId[];
}

/**
 * Wie viele Datensätze auf jeden Notiz-Record zeigen. Nur dann berechnet, wenn der
 * betrachtete Datensatz überhaupt Verweise trägt: im Bestand tun das 178 von 3.182 Personen,
 * der Durchlauf über alle Personen und Quellen bliebe sonst 94 % der Zeit ohne Ergebnis.
 */
function zaehleVerwender(db: Database): Map<NoteId, Set<string>> {
  const m = new Map<NoteId, Set<string>>();
  const merke = (ref: NoteId, ownerId: string): void => {
    const s = m.get(ref) ?? new Set<string>();
    s.add(ownerId);
    m.set(ref, s);
  };
  for (const p of db.individuals.values()) for (const r of p.noteRefs) merke(r, p.id);
  for (const s of db.sources.values()) for (const r of s.noteRefs) merke(r, s.id);
  return m;
}

/**
 * Die Notizen eines Datensatzes in Anzeige-Reihenfolge: eigene zuerst, dann weitere, dann
 * die verwiesenen Records. Leere Texte fallen weg — eine leere Notiz ist keine Notiz
 * (im Bestand trägt genau ein Record leeren Text).
 *
 * Ein Verweis, dessen Record fehlt (fremde Datei, gelöschter Record), wird übersprungen
 * statt als leere Zeile gezeigt: die Anzeige soll nicht behaupten, da stünde etwas.
 */
export function collectNotes(db: Database, owner: NoteOwner): NoteEntry[] {
  const out: NoteEntry[] = [];
  if (owner.noteText.trim() !== '') {
    out.push({ key: 'own', kind: 'own', text: owner.noteText, noteId: null, alsoUsedBy: 0 });
  }
  owner.extraNotes.forEach((t, i) => {
    if (t.trim() === '') return;
    out.push({ key: `extra-${i}`, kind: 'extra', text: t, noteId: null, alsoUsedBy: 0 });
  });
  const refs = owner.noteRefs ?? [];
  if (refs.length > 0) {
    const verwender = zaehleVerwender(db);
    refs.forEach((id, i) => {
      const rec = db.notes.get(id);
      if (!rec || rec.text.trim() === '') return;
      const andere = verwender.get(id);
      out.push({
        key: `shared-${id}-${i}`,
        kind: 'shared',
        text: rec.text,
        noteId: id,
        alsoUsedBy: Math.max(0, (andere?.size ?? 1) - 1),
      });
    });
  }
  return out;
}

/**
 * Ab wann eine Notiz aufgeklappt werden muss — in ZEILEN, nicht in Zeichen (BL-381).
 *
 * WARUM EINE SCHWELLE UND KEINE DAUER-KÜRZUNG. Ausgezählt am Bestand sind Notizen kurz:
 * Median 10 Zeichen an Ereignissen, 32 an geteilten Records, 84 an Personen; **100 % der
 * Ereignisnotizen und 97 % der geteilten passen in ≤ 4 Zeilen**. Lang ist eine Handvoll —
 * 11 Records über 200 Zeichen, davon 9 mit eigenen Zeilenumbrüchen. Eine Kürzung über alles
 * zu legen hieße, 98 % der Fälle für 2 % zu verschlechtern: eine 10-Zeichen-Notiz hinter
 * einem Aufklapper ist schlechter als die Notiz selbst.
 */
export const NOTIZ_SCHWELLE_ZEILEN = 4;

/**
 * Zeichen je Zeile auf der schmalsten Zielbreite (375 px) — die Zahl, über die sich die
 * Zeilen-Schwelle ohne Rendern in Zeichen umrechnen lässt.
 *
 * **Im Browser gemessen** (Fenster 375 px, `.notes-section__text`: 343 px breit, 16 px
 * `Source Serif 4`): ein 278-Zeichen-Absatz belegt **6 Zeilen** → 46 Zeichen je Zeile. Die
 * mittlere ZEICHENBREITE allein ergäbe 49 — der Wortumbruch kostet die Differenz, und
 * gemessen wird deshalb der Umbruch, nicht die Buchstabenbreite. Geschätzt hatte ich 42.
 *
 * Keine der drei Zahlen ist dramatisch verschieden; dass hier trotzdem die gemessene steht,
 * ist der Punkt: eine Zahl, die eine Regel trägt, wird gemessen, bevor sie festgeschrieben
 * wird ([ADR-v9-91]). `tests/ui/notes-model.test.ts` hält sie als Kontrakt fest, damit eine
 * Schriftänderung sie nicht still verschiebt.
 */
export const ZEICHEN_JE_ZEILE = 46;

/**
 * Zählt die Zeilen, die ein Text auf der schmalsten Breite belegt: eigene Umbrüche zählen als
 * Zeilengrenze, der Rest wird umgebrochen. Die eigenen Umbrüche sind kein Detail — 9 der 11
 * langen Notizen tragen welche, ihre erste Zeile ist faktisch eine Überschrift.
 */
export function notizZeilen(text: string): number {
  return text
    .split('\n')
    .reduce((n, zeile) => n + Math.max(1, Math.ceil(zeile.length / ZEICHEN_JE_ZEILE)), 0);
}

/** Braucht diese Notiz einen Aufklapper? */
export function istLangeNotiz(text: string): boolean {
  return notizZeilen(text) > NOTIZ_SCHWELLE_ZEILEN;
}

/**
 * Der Anriss für die Zusammenfassungszeile: die erste eigene Zeile, sonst der Anfang bis zur
 * Zeilenbreite. Ein Wort wird nicht zerrissen, wenn sich in Reichweite eine Lücke findet.
 * Die Zeile trägt zusätzlich den Umfang (s. `NotesSection.svelte`) — „Mehr anzeigen" allein
 * sagt nichts darüber, worauf man sich einlässt.
 */
export function notizAnriss(text: string): string {
  const ersteZeile = text.split('\n')[0] ?? '';
  if (ersteZeile.length <= ZEICHEN_JE_ZEILE) return ersteZeile;
  const roh = ersteZeile.slice(0, ZEICHEN_JE_ZEILE);
  const luecke = roh.lastIndexOf(' ');
  return `${(luecke > ZEICHEN_JE_ZEILE / 2 ? roh.slice(0, luecke) : roh).trimEnd()}…`;
}
