// ui/shell/entity-media.ts — WELCHE Bilder gehören zu einer Person/einem Ereignis?
// (BL-260/BL-261, ADR-v9-187, Spec 21 §10n). Reine Projektion über `db`, kein DOM.
//
// EINE Auswahl, drei Konsumenten: das Porträt im Steckbrief, die Miniatur an der
// Ereigniszeile und die Fotos in Story/§4-Ausgaben. Vor BL-260 traf `collectStoryMedia`
// diese Wahl allein — mit einem eingebauten `data:`-Filter, der am Realbestand NIE traf.
// Wer eine zweite Auswahl daneben stellt, bekommt genau die Drift, die ADR-v9-187 an der
// Klassifikation schon einmal aufgelöst hat.
//
// WAS HIER NICHT PASSIERT: auflösen. Ob die Datei auffindbar ist, weiß erst
// `services/media`; diese Funktionen liefern die REFERENZEN in der richtigen Reihenfolge.
import type { Database, Event, MediaCitation, PersonId } from '../../core/model/types';
import { isImageMedia } from '../../core/model/media-kind';

export interface EntityImage {
  /** Roher `Media.file`-Wert — Pfad, `data:`-URI oder Weblink. NICHT aufgelöst. */
  file: string;
  /** Kanonisches MIME (`Media.form`). */
  form: string;
  /** Referenz-Titel, sonst globaler Titel, sonst ''. */
  title: string;
  primary: boolean;
}

function toImages(db: Database, cits: readonly MediaCitation[]): EntityImage[] {
  const out: EntityImage[] = [];
  for (const mc of cits) {
    const m = db.media.get(mc.mediaId);
    if (!m || !isImageMedia(m.file, m.form)) continue;
    out.push({ file: m.file, form: m.form, title: mc.title || m.title || '', primary: mc.primary });
  }
  // Das als `_PRIM` markierte Bild führt — es ist die Wahl des Nutzers, welches Bild
  // diesen Datensatz vertritt. Sonst bleibt die Datei-Reihenfolge (stabil, nicht sortiert:
  // eine alphabetische Ordnung würde die bewusste Reihenfolge im Bestand zerstören).
  return out.sort((a, b) => Number(b.primary) - Number(a.primary));
}

/** Bilder AN DER PERSON (`INDI.OBJE`) — am Realbestand 85 Verweise, davon 76 Dateipfade. */
export function personImages(db: Database, personId: PersonId): EntityImage[] {
  const p = db.individuals.get(personId);
  return p ? toImages(db, p.media) : [];
}

/** Das eine Bild, das die Person vertritt (Steckbrief-Porträt), oder null. */
export function personPortrait(db: Database, personId: PersonId): EntityImage | null {
  return personImages(db, personId)[0] ?? null;
}

/** Bilder AM EREIGNIS (`…OBJE` unter BIRT/RESI/…) — am Realbestand 20 Verweise. */
export function eventImages(db: Database, ev: Event | null | undefined): EntityImage[] {
  return ev ? toImages(db, ev.media) : [];
}
