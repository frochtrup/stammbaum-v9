// core/interop/gramps-media.ts — GRAMPS-Medien-Projektion (ADR-v9-125).
// `<object>` → Top-Level-`Media` (Titel global aus `<file description>`), `<objref>` →
// referenz-spezifische `MediaCitation`. GRAMPS-`objref` trägt keinen Per-Ref-Titel; seine
// Kinder (region/attribute/…) bleiben Passthrough im XML-Baum, daher `extra` leer.
// Leaf-Modul (nur xml-tree + model/factory) — vermeidet Import-Zyklen mit gramps-enrich/-events.
import type { XmlNode } from './xml-tree';
import { attr, childrenByTag, firstChild } from './xml-tree';
import { makeMedia, makeMediaCitation } from '../model/factory';
import type { Media, MediaCitation, MediaId } from '../model/types';

/** `<objref hlink>`-Kinder eines Owners → `MediaCitation[]` (mediaId via handle→id). */
export function grampsMediaRefs(node: XmlNode, handleToId: Map<string, string>): MediaCitation[] {
  return childrenByTag(node, 'objref').map((ref) => {
    const h = attr(ref, 'hlink');
    return makeMediaCitation(handleToId.get(h) ?? h);
  });
}

/**
 * Ein `<object>`-Knoten → `Media` (id = GRAMPS-id, ersatzweise handle). Globale Felder aus
 * `<file>`: `src`→file, `mime`→form, `description`→title (global). `type` (MEDI) hat in
 * GRAMPS kein `<file>`-Pendant → immer ''. Kontextfrei, damit der Write-Back denselben Knoten
 * mit EXAKT dieser Vorschrift re-projizieren kann („hat sich etwas geändert?", ADR-v9-14/125).
 *
 * `formWire` bleibt hier bewusst LEER (BL-290): es hält den GEDCOM-`FORM`-Wert, den GRAMPS
 * gar nicht kennt — sein `mime` IST das kanonische MIME und wird aus `form` zurück-
 * geschrieben, es gibt also keine Schreibweise zu bewahren. Würde man es hier füllen, trüge
 * ein GRAMPS→GEDCOM-Export `image/jpeg` in ein 5.5.1-`FORM`, das eine Endung erwartet.
 */
export function projectGrampsObject(obj: XmlNode): Media {
  const id = attr(obj, 'id') || attr(obj, 'handle');
  const file = firstChild(obj, 'file');
  return makeMedia(id, {
    file: file ? attr(file, 'src') : '',
    form: file ? attr(file, 'mime') : '',
    title: file ? attr(file, 'description') : '',
    type: '',
    wireOrigin: 'record',
  });
}

/** `<objects>/<object>` → `db.media`. id = GRAMPS-id; Titel = `<file description>` (global). */
export function collectGrampsMedia(root: XmlNode): Map<MediaId, Media> {
  const out = new Map<MediaId, Media>();
  const sec = firstChild(root, 'objects');
  if (!sec) return out;
  for (const obj of childrenByTag(sec, 'object')) {
    const id = attr(obj, 'id') || attr(obj, 'handle');
    if (!id || out.has(id)) continue;
    out.set(id, projectGrampsObject(obj));
  }
  return out;
}
