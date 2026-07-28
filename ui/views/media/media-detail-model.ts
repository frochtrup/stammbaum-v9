// ui/views/media/media-detail-model.ts — reine Projektion eines Mediums auf ein
// Detail-Modell (Spec 20 §1.4 [S] "② Medium-Detail" / "③ Referenzliste"). Liest
// AUSSCHLIESSLICH über core-Felder (Spec 02 §3 Chokepoint) — keine Kern-Logik.
//
// Referenzzeilen-Vollständigkeit (TST-9/TST-14-Geist): JEDE Fundstelle einer
// MediaCitation wird angezeigt (Person Top-Level/Events/Zitate, Familie Events/Zitate,
// Source Top-Level) — dieselbe Traversierungstiefe wie media-gallery-model.ts/
// `deleteMedia`s Kaskade. NUR die drei Owner-Arten aus Spec 20 §1.4 ("+Person/+Familie/
// +Quelle") sind über diese Ansicht EDITIERBAR (✕ entfernen + Per-Ref-Formular) — Event-/
// Zitat-Fundstellen (z. B. eine Geburts-OBJE aus dem GEDCOM-Import) sind hier bewusst
// NUR LESEND mit Sprungmöglichkeit: ihr Entfernen/Editieren läuft über den bestehenden
// Ereignis-Editor (EventEditModal), der die Event-Identität kennt — dieses Modell würde
// sonst eine zweite, parallele Owner-Adressierung für verschachtelte Events erfinden
// (INV-UI-4-Verstoß). Bewusst offen gelassen, im Baubericht benannt, nicht still
// weggelassen (TST-9).
import type { Citation, Database, Media, MediaCitation, MediaId } from '../../../core/model/types';
import { displayName } from '../../shell/person-display';
import { familyLabelFor } from '../source/family-label';
import { groupByKey, type EventGroup } from '../../shell/event-grouping';
import { displayTitle } from './media-gallery-model';

const PERSON_EVENT_FIELDS = ['birth', 'chr', 'death', 'buri'] as const;
const FAMILY_EVENT_FIELDS = ['marriage', 'engagement'] as const;

export type MediaRefOwnerKind = 'person' | 'family' | 'source' | 'event' | 'citation';

export interface MediaReferenceRow {
  key: string;
  ownerKind: MediaRefOwnerKind;
  /** NUR für 'person'/'family'/'source' true (s. Modul-Kommentar) — steuert, ob die
   *  Zeile ✕-Entfernen + das Per-Ref-Formular anbietet. */
  editable: boolean;
  /** Person-/Familie-/Quelle-id, die diese Referenz TRÄGT (für den ↗-Sprung UND — bei
   *  `editable` — für savePerson/saveFamily/saveSource). Bei Event-/Zitat-Fundstellen
   *  ist das die Person/Familie, an der das Event/Zitat hängt (nicht editierbar). */
  ownerId: string;
  ownerKindForNav: 'person' | 'family' | 'source';
  ownerLabel: string;
  /** z. B. "Person", "Geburt", "Familie", "Zitat: Standesamt Ochtrup". */
  context: string;
  citation: MediaCitation;
}

export interface MediaDetailModel {
  media: Media;
  displayTitle: string;
  references: MediaReferenceRow[];
  referencesByType: EventGroup<MediaReferenceRow>[];
}

function citationContext(db: Database, c: Citation): string {
  const s = db.sources.get(c.sourceId);
  const label = s ? s.abbr || s.title || s.id : c.sourceId;
  return `Zitat: ${label}`;
}

function pushMediaRows(
  rows: MediaReferenceRow[],
  cits: readonly MediaCitation[],
  opts: {
    ownerKind: MediaRefOwnerKind;
    editable: boolean;
    ownerId: string;
    ownerKindForNav: 'person' | 'family' | 'source';
    ownerLabel: string;
    context: string;
  },
): void {
  cits.forEach((citation, i) => {
    rows.push({
      key: `${opts.ownerKind}-${opts.ownerId}-${opts.context}-${i}`,
      ownerKind: opts.ownerKind,
      editable: opts.editable,
      ownerId: opts.ownerId,
      ownerKindForNav: opts.ownerKindForNav,
      ownerLabel: opts.ownerLabel,
      context: opts.context,
      citation,
    });
  });
}

function collectReferences(db: Database, mediaId: MediaId): MediaReferenceRow[] {
  const rows: MediaReferenceRow[] = [];
  const hit = (cits: readonly MediaCitation[]): MediaCitation[] => cits.filter((m) => m.mediaId === mediaId);

  for (const p of db.individuals.values()) {
    const label = displayName(p);
    pushMediaRows(rows, hit(p.media), {
      ownerKind: 'person',
      editable: true,
      ownerId: p.id,
      ownerKindForNav: 'person',
      ownerLabel: label,
      context: 'Person',
    });
    for (const f of PERSON_EVENT_FIELDS) {
      const ev = p[f];
      const evLabel = f === 'birth' ? 'Geburt' : f === 'chr' ? 'Taufe' : f === 'death' ? 'Tod' : 'Bestattung';
      pushMediaRows(rows, hit(ev.media), {
        ownerKind: 'event',
        editable: false,
        ownerId: p.id,
        ownerKindForNav: 'person',
        ownerLabel: label,
        context: evLabel,
      });
      for (const c of ev.citations) {
        pushMediaRows(rows, hit(c.media), {
          ownerKind: 'citation',
          editable: false,
          ownerId: p.id,
          ownerKindForNav: 'person',
          ownerLabel: label,
          context: citationContext(db, c),
        });
      }
    }
    for (const ev of p.events) {
      pushMediaRows(rows, hit(ev.media), {
        ownerKind: 'event',
        editable: false,
        ownerId: p.id,
        ownerKindForNav: 'person',
        ownerLabel: label,
        context: ev.eventType || ev.type || 'Ereignis',
      });
      for (const c of ev.citations) {
        pushMediaRows(rows, hit(c.media), {
          ownerKind: 'citation',
          editable: false,
          ownerId: p.id,
          ownerKindForNav: 'person',
          ownerLabel: label,
          context: citationContext(db, c),
        });
      }
    }
    const otherCitations: Citation[] = [
      ...p.topLevelCitations,
      ...p.nameCitations,
      ...p.extraNames.flatMap((n) => n.citations),
      ...p.childOf.flatMap((l) => l.citations),
      ...p.associations.flatMap((a) => a.citations),
    ];
    for (const c of otherCitations) {
      pushMediaRows(rows, hit(c.media), {
        ownerKind: 'citation',
        editable: false,
        ownerId: p.id,
        ownerKindForNav: 'person',
        ownerLabel: label,
        context: citationContext(db, c),
      });
    }
  }

  for (const f of db.families.values()) {
    const label = familyLabelFor(db, f.id);
    for (const k of FAMILY_EVENT_FIELDS) {
      const ev = f[k];
      pushMediaRows(rows, hit(ev.media), {
        ownerKind: 'family',
        // NUR marriage ist der von der UI genutzte Anhängepunkt für "+ Familie"
        // (media-detail-model.ts-Aufrufer/MediaDetail.svelte) — engagement bleibt
        // deshalb bewusst nur lesend, damit "editable" nicht zwei unterschiedliche
        // Speicherziele suggeriert.
        editable: k === 'marriage',
        ownerId: f.id,
        ownerKindForNav: 'family',
        ownerLabel: label,
        context: k === 'marriage' ? 'Heirat' : 'Verlobung',
      });
      for (const c of ev.citations) {
        pushMediaRows(rows, hit(c.media), {
          ownerKind: 'citation',
          editable: false,
          ownerId: f.id,
          ownerKindForNav: 'family',
          ownerLabel: label,
          context: citationContext(db, c),
        });
      }
    }
    for (const ev of f.events) {
      pushMediaRows(rows, hit(ev.media), {
        ownerKind: 'event',
        editable: false,
        ownerId: f.id,
        ownerKindForNav: 'family',
        ownerLabel: label,
        context: ev.eventType || ev.type || 'Ereignis',
      });
      for (const c of ev.citations) {
        pushMediaRows(rows, hit(c.media), {
          ownerKind: 'citation',
          editable: false,
          ownerId: f.id,
          ownerKindForNav: 'family',
          ownerLabel: label,
          context: citationContext(db, c),
        });
      }
    }
    for (const c of f.citations) {
      pushMediaRows(rows, hit(c.media), {
        ownerKind: 'citation',
        editable: false,
        ownerId: f.id,
        ownerKindForNav: 'family',
        ownerLabel: label,
        context: citationContext(db, c),
      });
    }
  }

  for (const s of db.sources.values()) {
    const label = s.abbr || s.title || s.id;
    pushMediaRows(rows, hit(s.media), {
      ownerKind: 'source',
      editable: true,
      ownerId: s.id,
      ownerKindForNav: 'source',
      ownerLabel: label,
      context: 'Quelle',
    });
  }

  return rows;
}

/**
 * Baut das read-only Detail-Modell eines Mediums. `null`, wenn die id im aktuellen
 * Datenbestand fehlt (definierter Fallback, Spec 21 §5).
 */
export function buildMediaDetail(db: Database, mediaId: MediaId): MediaDetailModel | null {
  const media = db.media.get(mediaId);
  if (!media) return null;

  const references = collectReferences(db, mediaId);
  const referencesByType = groupByKey(references, (r) => r.context);

  return { media, displayTitle: displayTitle(media), references, referencesByType };
}
