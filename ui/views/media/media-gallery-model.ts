// ui/views/media/media-gallery-model.ts — reine Aufbereitung der Medien-Kachelgalerie
// (Spec 20 §1.4 [S] "① Kachelgalerie": globale Arbeitsfläche, Bezugs- und Art-Facette
// ADDITIV (ADR-v9-192), Suche über Dateiname/Titel/Notiz). Liest AUSSCHLIESSLICH über
// core-Felder (Spec 02 §3 Chokepoint) — keine Kern-Logik hier, reine Aggregation für
// die Darstellung, analog source-list-model.ts/citation-refs.ts.
//
// EIN Durchlauf über die Datenbank sammelt für jede Media-id, WELCHE Owner-Arten sie
// referenzieren (Person/Familie/Quelle) + wie oft insgesamt (über ALLE MediaCitation-
// Vorkommen: Person-Top-Level, Event-Slots von Person UND Familie, sämtliche
// Zitat-Fundstellen, Source-Top-Level) — dieselbe Traversierungs-Tiefe wie
// `deleteMedia`s Kaskade (core/model/commands.ts), damit Referenzzähler und
// Lösch-Kaskade nicht auseinanderdriften (INV-UI-4-Geist: eine Traversierung, zwei
// Konsumenten).
import type { Citation, Database, Media, MediaCitation, MediaId } from '../../../core/model/types';
import {
  classifyMediaFile,
  isImageMedia,
  webLinkLabel,
  type MediaFileKind,
} from '../../../core/model/media-kind';

export type MediaOwnerKind = 'person' | 'family' | 'source';

/**
 * Art-Facette der Galerie (ADR-v9-187): am Realbestand sind 452 der 642 Medien Weblinks —
 * ohne diese Trennung überdecken sie die 189 echten Dateien vollständig. Bewusst ZWEI
 * Facetten statt einer Aufteilung nach Bild/Dokument: der Unterschied Bild ⇄ Dokument ist
 * eine Frage der KACHEL-Darstellung (Thumbnail vs. Dokumentsymbol), keine, nach der man
 * sucht — und jeder weitere Chip kostet Fläche (INV-UI-11).
 *
 * `files` bündelt alles, was Inhalt IST (Pfad-Datei + eingebettet + die seltene leere
 * Hülle), `weblinks` alles, was auf einen Fundort ZEIGT.
 */
export type MediaKindFacet = 'files' | 'weblinks';

/**
 * Beide Chip-Reihen wirken ADDITIV (ADR-v9-192): innerhalb einer Reihe vereinigen sich
 * die gewählten Facetten (ODER), zwischen den Reihen schneiden sie sich (UND). Vorher war
 * jede Reihe eine Einfachauswahl — „Personen ODER Familien" ließ sich gar nicht ausdrücken,
 * jeder Tipp verwarf den vorherigen.
 *
 * **Die leere Menge ist die Nicht-Einschränkung**, nicht ein zusätzlicher `'all'`-Wert:
 * „Alle" ist kein vierter Bezug und keine dritte Art, sondern der Zustand „nichts gewählt".
 * Ein `'all'` IM Wertebereich müsste in jeder Kombinationsregel gesondert behandelt werden
 * (und wäre bei Mehrfachauswahl mehrdeutig: was bedeutet `{all, person}`?).
 */
export type MediaOwnerSelection = ReadonlySet<MediaOwnerKind>;
export type MediaKindSelection = ReadonlySet<MediaKindFacet>;

/** Chip an/aus — die eine Stelle, die aus einer Auswahl die nächste macht. */
export function toggleFacet<T>(selection: ReadonlySet<T>, facet: T): Set<T> {
  const next = new Set(selection);
  if (!next.delete(facet)) next.add(facet);
  return next;
}

const PERSON_EVENT_FIELDS = ['birth', 'chr', 'death', 'buri'] as const;
const FAMILY_EVENT_FIELDS = ['marriage', 'engagement'] as const;

export interface MediaTileRow {
  id: MediaId;
  /** Anzeige-Titel: globaler `Media.title`, sonst der Datei-Basisname (Spec 10 §4:
   *  "leer bei 5.5.1-Inline" — der Dateiname bleibt dann der einzige sinnvolle Titel). */
  title: string;
  file: string;
  form: string;
  type: string;
  ownerKinds: ReadonlySet<MediaOwnerKind>;
  refCount: number;
  /** Vereinigung aller referenz-spezifischen Notizen (Spec 20 §1.4 [S]: "Suche über
   *  Dateiname/Titel/Notiz") — Media selbst hat kein eigenes Notiz-Feld (nur
   *  MediaCitation.note, je Referenz). */
  notes: string;
  /** Form des `file`-Werts (ADR-v9-187) — aus dem EINEN Kern-Chokepoint, nicht hier
   *  nochmal entschieden. */
  fileKind: MediaFileKind;
  /** Wird als Bild dargestellt (sobald die Bytes vorliegen) oder als Dokument. */
  isImage: boolean;
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function displayTitle(m: Media): string {
  if (m.title) return m.title;
  // Ein Weblink hat keinen „Dateinamen" — sein letztes Pfadstück ist bei den häufigen
  // Archiv-Adressen leer, und der Rückfall lieferte die Query (`?pg=10`). Am Realbestand
  // hießen dadurch 451 Kacheln fast gleich (eigene Browser-Verifikation, BL-256).
  const link = webLinkLabel(m.file);
  if (link) return link;
  return basename(m.file) || m.id;
}

// `isDisplayableImage` lebte hier bis ADR-v9-187 und entschied für die ganze UI, ob ein
// Medium anzeigbar ist. Diese Entscheidung liegt jetzt im Kern (`core/model/media-kind.ts`,
// `isEmbeddedImage`/`isImageMedia`) — sie wird an fünf Stellen gebraucht (Kachel, Detail,
// Steckbrief, Ereigniszeile, Berichts-Vorlauf), und eine davon darf sie nicht besitzen.

interface OwnerAcc {
  kinds: Set<MediaOwnerKind>;
  count: number;
  notes: Set<string>;
}

function bump(acc: Map<MediaId, OwnerAcc>, mc: MediaCitation, kind: MediaOwnerKind): void {
  let e = acc.get(mc.mediaId);
  if (!e) {
    e = { kinds: new Set(), count: 0, notes: new Set() };
    acc.set(mc.mediaId, e);
  }
  e.kinds.add(kind);
  e.count += 1;
  if (mc.note.trim()) e.notes.add(mc.note.trim());
}

function bumpAll(acc: Map<MediaId, OwnerAcc>, cits: readonly MediaCitation[], kind: MediaOwnerKind): void {
  for (const mc of cits) bump(acc, mc, kind);
}

function bumpCitations(acc: Map<MediaId, OwnerAcc>, cits: readonly Citation[], kind: MediaOwnerKind): void {
  for (const c of cits) bumpAll(acc, c.media, kind);
}

function collectOwnerInfo(db: Database): Map<MediaId, OwnerAcc> {
  const acc = new Map<MediaId, OwnerAcc>();

  for (const p of db.individuals.values()) {
    bumpAll(acc, p.media, 'person');
    for (const f of PERSON_EVENT_FIELDS) {
      bumpAll(acc, p[f].media, 'person');
      bumpCitations(acc, p[f].citations, 'person');
    }
    for (const ev of p.events) {
      bumpAll(acc, ev.media, 'person');
      bumpCitations(acc, ev.citations, 'person');
    }
    bumpCitations(acc, p.topLevelCitations, 'person');
    bumpCitations(acc, p.nameCitations, 'person');
    for (const n of p.extraNames) bumpCitations(acc, n.citations, 'person');
    for (const l of p.childOf) bumpCitations(acc, l.citations, 'person');
    for (const a of p.associations) bumpCitations(acc, a.citations, 'person');
  }

  for (const f of db.families.values()) {
    for (const k of FAMILY_EVENT_FIELDS) {
      bumpAll(acc, f[k].media, 'family');
      bumpCitations(acc, f[k].citations, 'family');
    }
    for (const ev of f.events) {
      bumpAll(acc, ev.media, 'family');
      bumpCitations(acc, ev.citations, 'family');
    }
    bumpCitations(acc, f.citations, 'family');
  }

  for (const s of db.sources.values()) {
    bumpAll(acc, s.media, 'source');
  }

  return acc;
}

/** Alle Kacheln der Galerie — alphabetisch nach Anzeige-Titel. */
export function buildMediaTiles(db: Database): MediaTileRow[] {
  const ownerInfo = collectOwnerInfo(db);
  const rows: MediaTileRow[] = [];
  for (const m of db.media.values()) {
    const info = ownerInfo.get(m.id);
    rows.push({
      id: m.id,
      title: displayTitle(m),
      file: m.file,
      form: m.form,
      type: m.type,
      ownerKinds: info?.kinds ?? new Set(),
      refCount: info?.count ?? 0,
      notes: info ? Array.from(info.notes).join(' ') : '',
      fileKind: classifyMediaFile(m.file),
      isImage: isImageMedia(m.file, m.form),
    });
  }
  return rows.sort((a, b) => a.title.localeCompare(b.title, 'de'));
}

/** Leere Auswahl = keine Einschränkung; sonst ODER über die gewählten Bezüge. */
export function matchesOwnerFilter(row: MediaTileRow, selection: MediaOwnerSelection): boolean {
  if (selection.size === 0) return true;
  for (const kind of selection) if (row.ownerKinds.has(kind)) return true;
  return false;
}

/** "Suche über Dateiname/Titel/Notiz" (Spec 20 §1.4 [S]). */
export function matchesMediaSearch(row: MediaTileRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [row.title, row.file, row.notes].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

export interface MediaOwnerFilterOption {
  id: MediaOwnerKind;
  label: string;
  count: number;
}

/**
 * Bezugs-Chips MIT Zähler (analog ADR-v9-130s Such-Typ-Filter). KEIN „Alle"-Eintrag: der
 * ist die leere Auswahl und gehört als Zurücksetz-Chip in die View, nicht in den
 * Wertebereich (s. `MediaOwnerSelection`).
 *
 * **`rows` ist die bereits durch die ANDEREN Bedingungen (Art-Facette + Suche) gefilterte
 * Menge** — nicht der Gesamtbestand. Sonst versprächen die Zahlen etwas, das ein Tipp auf
 * den Chip nicht einlöst: bei aktiver Art-Facette „Dateien" (189 von 641) stand am
 * Personen-Chip weiterhin 515, obwohl der Tipp nur die Dateien davon zeigen konnte. Das
 * ist genau die Zahl, die „additiv" lesbar macht: sie sagt, wie viele Kacheln dieser Chip
 * HINZUFÜGT. Die eigene Reihe zählt bewusst NICHT mit — sonst zeigte jeder abgewählte
 * Chip 0 und die Reihe wäre nicht mehr bedienbar.
 */
export function buildOwnerFilterOptions(rows: readonly MediaTileRow[]): MediaOwnerFilterOption[] {
  return [
    { id: 'person', label: 'Personen', count: rows.filter((r) => r.ownerKinds.has('person')).length },
    { id: 'family', label: 'Familien', count: rows.filter((r) => r.ownerKinds.has('family')).length },
    { id: 'source', label: 'Quellen', count: rows.filter((r) => r.ownerKinds.has('source')).length },
  ];
}

export interface MediaKindFilterOption {
  id: MediaKindFacet;
  label: string;
  count: number;
}

/** Welcher Art eine Kachel ist — eine Kachel ist immer genau eines von beiden. */
export function mediaKindFacet(row: MediaTileRow): MediaKindFacet {
  return row.fileKind === 'weblink' ? 'weblinks' : 'files';
}

/** Leere Auswahl = keine Einschränkung; sonst ODER über die gewählten Arten. */
export function matchesKindFilter(row: MediaTileRow, selection: MediaKindSelection): boolean {
  if (selection.size === 0) return true;
  return selection.has(mediaKindFacet(row));
}

/**
 * Art-Chips MIT Zähler. „Dateien" steht vorn UND ist die Vorauswahl (ADR-v9-187): am
 * Realbestand stünden sonst 452 Weblink-Kacheln vor den 189 Dateien. Ausgeblendet ist
 * nicht versteckt — der Weblink-Chip trägt seine Zahl offen.
 *
 * `rows` ist wie bei den Bezugs-Chips die durch die andere Reihe + Suche gefilterte Menge.
 * OB die Reihe überhaupt erscheint, entscheidet dagegen `hasBothMediaKinds` am
 * GESAMTbestand (s. dort).
 */
export function buildKindFilterOptions(rows: readonly MediaTileRow[]): MediaKindFilterOption[] {
  const links = rows.filter((r) => r.fileKind === 'weblink').length;
  return [
    { id: 'files', label: 'Dateien', count: rows.length - links },
    { id: 'weblinks', label: 'Weblinks', count: links },
  ];
}

/**
 * Die Art-Reihe erscheint NUR, wenn beide Arten im Bestand vorkommen; bei lauter Dateien
 * (oder lauter Weblinks) wäre eine Reihe mit einem sinnvollen Chip reine Fläche (dieselbe
 * Regel wie die Such-Typ-Chips, ADR-v9-130: erst ab ≥2 getroffenen Arten).
 *
 * Bewusst am GESAMTbestand gemessen, nicht an der gefilterten Menge: sonst verschwände die
 * Reihe während des Tippens unter den Fingern, sobald eine Suche zufällig nur noch eine Art
 * trifft — und mit ihr der Weg, die Einschränkung wieder aufzuheben.
 */
export function hasBothMediaKinds(rows: readonly MediaTileRow[]): boolean {
  const links = rows.filter((r) => r.fileKind === 'weblink').length;
  return links > 0 && links < rows.length;
}

/**
 * Startwert der Art-Facette: „Dateien", sobald es beide Arten gibt — sonst die leere
 * Auswahl („Alle"), damit ein reiner Weblink-Bestand nicht in eine leere Galerie startet
 * (der Fall existiert: ein Bestand kann ausschließlich Zitat-Fundorte tragen).
 */
export function initialKindSelection(rows: readonly MediaTileRow[]): MediaKindSelection {
  return hasBothMediaKinds(rows) ? new Set<MediaKindFacet>(['files']) : new Set<MediaKindFacet>();
}
