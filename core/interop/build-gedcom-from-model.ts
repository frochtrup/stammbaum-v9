// core/interop/build-gedcom-from-model.ts — Modell → kompletter GEDCOM-Baum (BL-157, ADR-v9-127).
//
// Cross-Family-Synthese: baut aus einem `db` (aus JEDEM Quellformat projiziert, typ. GRAMPS)
// einen VOLLSTÄNDIGEN GEDCOM-5.5.1-Baum VON GRUND AUF — HEAD + alle Records (INDI/FAM/SOUR/
// REPO/NOTE/OBJE) + TRLR. Das ist ein SEPARATER Code-Pfad neben dem nativen Write-Back
// (ADR-v9-127 Entscheidung 1: Native unangetastet) — der native Roundtrip-Anker (Passthrough-
// Baum) bleibt für GEDCOM-Quellen die Treue-Referenz; diese Synthese greift, wenn KEIN
// GEDCOM-Quellbaum existiert (z. B. GRAMPS-Load → GEDCOM-Export).
//
// ── Bausteine (Vereinfachen vor Erfinden) ────────────────────────────────────
// Es werden die VORHANDENEN Emit-Primitiven (write-back-emit.ts) konsumiert — dieselben, die
// der native Write-Back für neue Records nutzt; sie schreiben Referenzen HEUTE roh aus dem
// Modell (`N('FAMC', link.familyId)` …). Der From-Scratch-Baum wird danach NACHBEARBEITET:
// jede Record-Xref und jeder Referenz-Wert wird über die ID-Remap (id-remap.ts) auf frische
// ziel-native GEDCOM-Pointer (`@I1@/@F1@/…`) umgeschrieben (ADR-v9-127 Entscheidung 2 — IDs
// werden am OUTPUT remappt, das Modell bleibt quell-nativ). Post-Processing statt Remap durch
// jede Primitive zu fädeln: hält die Primitiven (und damit Natives) unberührt.
//
// Warum die IDs eines GRAMPS-`db` remappt WERDEN MÜSSEN: dort sind Modell-ids und -Referenzen
// GRAMPS-nativ (`I0001`, `F0001`, `S0001`, …), NICHT `@…@`-Pointer. Roh geschrieben ergäbe
// das ungültige GEDCOM-Zeiger (`1 FAMC I0001`). Die Remap vergibt gültige `@F1@` und schreibt
// jede Referenz konsistent um.
//
// Metrik ist Modell-Äquivalenz (RT-4, modelEquiv), nicht Byte (ADR-v9-127 E3) — s. Gate-Test
// tests/roundtrip/cross-gramps-to-gedcom.test.ts.
//
// Reine Funktion, DOM-/Plattform-frei (INV-ARCH-1), build-frei testbar (INV-ARCH-2).

import type { Database, Note } from '../model/types';
import type { GedNode } from './gedcom-tree';
import {
  N,
  emitPerson,
  emitFamily,
  emitSource,
  emitRepository,
  emitMediaRecord,
  type MediaLookup,
} from './write-back-emit';
import { remapIdsForFormat, mappedOr, type IdRemap } from './id-remap';

/** Frischer GEDCOM-5.5.1-HEAD (wie ein nativer Writer ihn schreibt). Re-parst sauber
 *  (GEDC/VERS liefert gedVersion=5.5.1). modelEquiv vergleicht den HEAD nicht — er muss nur
 *  wohlgeformt sein. */
function buildHead(): GedNode {
  return N('HEAD', '', [
    N('SOUR', 'Stammbaum-App'),
    N('GEDC', '', [N('VERS', '5.5.1'), N('FORM', 'LINEAGE-LINKED')]),
    N('CHAR', 'UTF-8'),
  ]);
}

/** NOTE-Record `0 @N@ NOTE …` (invers zu parseNote): mehrzeiliger Text → value + CONT-Kinder. */
function emitNote(n: Note): GedNode {
  const parts = n.text.split('\n');
  const kids: GedNode[] = [];
  for (let i = 1; i < parts.length; i++) kids.push(N('CONT', parts[i]));
  return N(n.type, parts[0] ?? '', kids, n.id);
}

// ── Referenz-Remapping: Tag → zuständige Klassen-Abbildung ────────────────────
// Jeder pointer-tragende GEDCOM-Tag wird auf die Abbildung seiner Zielentität geführt.
// mappedOr lässt Nicht-Treffer unverändert (dangling/Fremdreferenz bleibt erkennbar; ein
// ALIA-Namensstring oder inline-NOTE-Text ist keine id → bleibt roh). So bleibt der Walk
// robust, ohne inline-Text von echten Zeigern strukturell trennen zu müssen.
function pointerMapFor(tag: string, r: IdRemap): Map<string, string> | null {
  switch (tag) {
    case 'FAMC':
    case 'FAMS':
      return r.family;
    case 'HUSB':
    case 'WIFE':
    case 'CHIL':
    case 'ASSO':
    case 'ALIA':
      return r.person;
    case 'NOTE':
      return r.note;
    case 'SOUR':
      return r.source;
    case 'REPO':
      return r.repo;
    case 'OBJE':
      return r.media;
    default:
      return null;
  }
}

/** Klassen-Abbildung für die Xref eines Level-0-Records (nach Record-Tag). */
function recordMapFor(tag: string, r: IdRemap): Map<string, string> | null {
  switch (tag) {
    case 'INDI':
      return r.person;
    case 'FAM':
      return r.family;
    case 'SOUR':
      return r.source;
    case 'REPO':
      return r.repo;
    case 'NOTE':
    case 'SNOTE':
      return r.note;
    case 'OBJE':
      return r.media;
    default:
      return null;
  }
}

/** Remappt rekursiv jeden Referenz-Wert (pointer-tragende Tags) auf die Ziel-id. In-place auf
 *  dem frisch emittierten Teilbaum (jede N()-Instanz ist neu, Mutation ist lokal). */
function remapRefs(node: GedNode, r: IdRemap): void {
  const m = pointerMapFor(node.tag, r);
  if (m && node.value) node.value = mappedOr(m, node.value);
  for (const c of node.children) remapRefs(c, r);
}

/** Setzt die Record-Xref auf die frische Ziel-id und remappt alle enthaltenen Referenzen. */
function finalizeRecord(node: GedNode, r: IdRemap): GedNode {
  const rm = recordMapFor(node.tag, r);
  if (rm && node.xref) node.xref = mappedOr(rm, node.xref);
  remapRefs(node, r);
  return node;
}

/**
 * Baut den kompletten GEDCOM-Baum (roots) aus `db`. Ergebnis ist über `serializeGedcom`
 * direkt in GEDCOM-Text übersetzbar. IDs sind frisch ziel-nativ (`@I1@/@F1@/…`), alle
 * Referenzen konsistent umgeschrieben.
 *
 * Record-Reihenfolge = Store-Reihenfolge je Klasse (deterministisch; die Metrik modelEquiv
 * ist ordnungs-unabhängig). Ort/Hof/geteilte Events/Zitate haben in GEDCOM keine eigenen
 * Records (inline über die Emit-Primitiven, PLAC via PlaceContext) — daher keine eigenen roots.
 */
export function buildGedcomTreeFromModel(db: Database): GedNode[] {
  const remap = remapIdsForFormat(db, 'gedcom');
  const media: MediaLookup = db.media;

  // BEWUSST OHNE PlaceContext (ctx=undefined): die Emit-Primitiven schreiben dann den ROHEN
  // `ev.place`-String — die Ortsangabe genau so, wie das Quellformat sie ausgedrückt hat. Die
  // Live-PLAC-Herleitung (buildPlacForGedcom, ADR-v9-47) ist FÜR DEN NATIVEN EDIT-FLOW gedacht,
  // wo der Nutzer PlaceObjects editiert hat und `ev.place` nur ein evtl. veralteter Cache ist.
  // Für den Cross-Family-Export aus einem FRISCH geparsten Fremd-`db` ist `ev.place` dagegen
  // die authoritative Quelle; die Re-Herleitung aus der (GRAMPS-projizierten) Enclosure-Kette
  // würde die Ortsrepräsentation verändern (teils eine andere Ebene wählen, z. B. Ochtrup→
  // Steinfurt) statt sie zu erhalten. Ergebnis: 0 `*.place`-Diffs im GRAMPS→GEDCOM-Gate.
  const roots: GedNode[] = [buildHead()];

  for (const p of db.individuals.values()) roots.push(finalizeRecord(emitPerson(p, undefined, media), remap));
  for (const f of db.families.values()) roots.push(finalizeRecord(emitFamily(f, undefined, media), remap));
  for (const s of db.sources.values()) roots.push(finalizeRecord(emitSource(s, media), remap));
  for (const rep of db.repositories.values()) roots.push(finalizeRecord(emitRepository(rep), remap));
  for (const n of db.notes.values()) roots.push(finalizeRecord(emitNote(n), remap));
  // Nur record-basierte Medien sind Top-Level-Records (ADR-v9-125); inline-Medien leben am Verweis.
  for (const m of db.media.values()) {
    if (m.wireOrigin === 'record') roots.push(finalizeRecord(emitMediaRecord(m), remap));
  }

  roots.push(N('TRLR', ''));
  return roots;
}
