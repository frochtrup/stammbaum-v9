// ui/views/media/media-gallery-model.ts — reine Aufbereitung der Medien-Kachelgalerie
// (Spec 20 §1.4 [S] "① Kachelgalerie": globale Arbeitsfläche, Filter Alle/Personen/
// Familien/Quellen, Suche über Dateiname/Titel/Notiz). Liest AUSSCHLIESSLICH über
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
export type MediaOwnerFilter = 'all' | MediaOwnerKind;

/**
 * Art-Facette der Galerie (ADR-v9-187): am Realbestand sind 452 der 642 Medien Weblinks —
 * ohne diese Trennung überdecken sie die 189 echten Dateien vollständig. Bewusst DREI
 * Chips statt einer Aufteilung nach Bild/Dokument: der Unterschied Bild ⇄ Dokument ist
 * eine Frage der KACHEL-Darstellung (Thumbnail vs. Dokumentsymbol), keine, nach der man
 * sucht — und jeder weitere Chip kostet Fläche (INV-UI-11).
 *
 * `files` bündelt alles, was Inhalt IST (Pfad-Datei + eingebettet + die seltene leere
 * Hülle), `weblinks` alles, was auf einen Fundort ZEIGT.
 */
export type MediaKindFilter = 'files' | 'weblinks' | 'all';

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

export function matchesOwnerFilter(row: MediaTileRow, filter: MediaOwnerFilter): boolean {
  if (filter === 'all') return true;
  return row.ownerKinds.has(filter);
}

/** "Suche über Dateiname/Titel/Notiz" (Spec 20 §1.4 [S]). */
export function matchesMediaSearch(row: MediaTileRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [row.title, row.file, row.notes].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

export interface MediaOwnerFilterOption {
  id: MediaOwnerFilter;
  label: string;
  count: number;
}

/** Filter-Chips MIT Zähler (analog ADR-v9-130s Such-Typ-Filter) — "Alle" zählt jede
 *  Kachel unabhängig von der Suche, die übrigen Chips die jeweilige Owner-Art. */
export function buildOwnerFilterOptions(rows: readonly MediaTileRow[]): MediaOwnerFilterOption[] {
  return [
    { id: 'all', label: 'Alle', count: rows.length },
    { id: 'person', label: 'Personen', count: rows.filter((r) => r.ownerKinds.has('person')).length },
    { id: 'family', label: 'Familien', count: rows.filter((r) => r.ownerKinds.has('family')).length },
    { id: 'source', label: 'Quellen', count: rows.filter((r) => r.ownerKinds.has('source')).length },
  ];
}

export interface MediaKindFilterOption {
  id: MediaKindFilter;
  label: string;
  count: number;
}

export function matchesKindFilter(row: MediaTileRow, filter: MediaKindFilter): boolean {
  if (filter === 'all') return true;
  const isLink = row.fileKind === 'weblink';
  return filter === 'weblinks' ? isLink : !isLink;
}

/**
 * Art-Chips MIT Zähler. „Dateien" steht vorn UND ist die Vorauswahl (ADR-v9-187): am
 * Realbestand stünden sonst 452 Weblink-Kacheln vor den 189 Dateien. Ausgeblendet ist
 * nicht versteckt — der Weblink-Chip trägt seine Zahl offen.
 *
 * Die Chips erscheinen NUR, wenn beide Arten vorkommen; bei einem Bestand aus lauter
 * Dateien (oder lauter Weblinks) wäre eine Reihe mit einem sinnvollen Chip reine Fläche
 * (dieselbe Regel wie die Such-Typ-Chips, ADR-v9-130: erst ab ≥2 getroffenen Arten).
 */
export function buildKindFilterOptions(rows: readonly MediaTileRow[]): MediaKindFilterOption[] {
  const links = rows.filter((r) => r.fileKind === 'weblink').length;
  const files = rows.length - links;
  if (links === 0 || files === 0) return [];
  return [
    { id: 'files', label: 'Dateien', count: files },
    { id: 'weblinks', label: 'Weblinks', count: links },
    { id: 'all', label: 'Alle', count: rows.length },
  ];
}

/**
 * Startwert der Art-Facette: „Dateien", sobald es beide Arten gibt — sonst „Alle", damit
 * ein reiner Weblink-Bestand nicht in eine leere Galerie startet (der Fall existiert:
 * ein Bestand kann ausschließlich Zitat-Fundorte tragen).
 */
export function initialKindFilter(rows: readonly MediaTileRow[]): MediaKindFilter {
  return buildKindFilterOptions(rows).length > 0 ? 'files' : 'all';
}
