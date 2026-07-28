// ui/views/story/story-model.ts — reiner Story-Aufbau (BL-133 Personen-Biografie, Spec 20
// §1.10). Wandelt eine Person in ein STRUKTURIERTES `StoryDoc` (Abschnitte aus reinem Text)
// — headless goldfile-testbar, kein DOM. Verhaltens-Orakel: v8 `legacy-v8/ui-story-person.js`
// (`_renderStory`, `_sectionEarlyLife`/`_sectionEvents`/`_sectionFamilies`/`_sectionDeath`/
// `_sectionReli`, `_mergeEducGrad`).
//
// Zwei Konsumenten teilen dasselbe Doc: die reaktive Lens (`StoryLensView.svelte`, rendert
// Text + montiert Karte/Diagramm-Insel) und der HTML-Download (`story-to-html.ts`, BL-190).
// Deshalb reiner Text pro Absatz — Escaping/Layout entscheidet jeder Konsument selbst.
import type { Database, Event, PersonId } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import { personBiographyPoints, type BiographyPoint } from '../../islands/map/map-model';
import { EVENT_LABELS } from '../../islands/timeline/timeline-model';
import { getParentIds, getSpouseFamilies } from '../../islands/tree/tree-model';
import { displayName } from '../../shell/person-display';
import { isDisplayableImage } from '../media/media-gallery-model';
import { epochContext } from './story-epochs';
import { buildPlaceContextSentence } from './place-context';
import {
  atDate,
  childSentence,
  eventSentence,
  fmtDate,
  mergeCareerSentence,
  mergeEducSentence,
  mergeGradSentence,
  mergeOccuSentence,
  mergeResiSentence,
  partnerSpan,
  pronoun,
  shortPlace,
  stripQuotes,
  yearFromDate,
  type Pronoun,
} from './story-templates';

/** Unter-Block eines Abschnitts mit eigener Zwischenüberschrift (Familien-„Eltern": je
 *  Elternteil eine Karte). */
export interface StoryBlock {
  subheading: string;
  paragraphs: string[];
}

/** Ein Abschnitt der Biografie: Überschrift (oder keine) + reine Textabsätze und/oder
 *  zwischenüberschriftete Blöcke. */
export interface StorySection {
  id: string;
  heading: string | null;
  paragraphs: string[];
  blocks?: StoryBlock[];
}

/** Ein einbettbares Story-Foto (BL-189): `src` ist stets ein `data:image/…`-URI. */
export interface StoryPhoto {
  src: string;
  title: string;
}

/** Das strukturierte Biografie-Dokument (Personen- oder Familien-Story). */
export interface StoryDoc {
  subject: 'person' | 'family';
  id: string;
  /** Anzeigename (Person) bzw. „Familie X & Y". */
  title: string;
  /** Lebensspanne „1850 – 1920" (reiner Text), '' wenn unbekannt. */
  lifespan: string;
  /** Zusatzzeile unter dem Titel (Familien-Story: „⚭ Datum, Ort"). '' = keine. */
  subtitle: string;
  /** Direkt darstellbare Fotos (data:-URI), Primärfoto zuerst (BL-189). Leer = keine. */
  photos: StoryPhoto[];
  sections: StorySection[];
  /** Geo-Stationen des Lebenswegs für die Karte (BL-187). Leer = keine Karte. */
  mapPoints: BiographyPoint[];
}

/**
 * Direkt darstellbare Fotos einer Person (BL-189): löst `person.media` über `db.media` auf
 * und behält nur `data:image/…`-URIs (isDisplayableImage — EIN Kriterium wie die Medien-
 * Vorschau BL-181). Primärfoto (`_PRIM`) zuerst. Ein bloßer Dateipfad trägt im
 * serverlosen Browser keine Bytes und wird bewusst weggelassen (kein totes `<img>`).
 */
export function collectStoryMedia(db: Database, personId: PersonId): StoryPhoto[] {
  const p = db.individuals.get(personId);
  if (!p) return [];
  const cits = [...p.media].sort((a, b) => Number(b.primary) - Number(a.primary));
  const out: StoryPhoto[] = [];
  for (const mc of cits) {
    const m = db.media.get(mc.mediaId);
    if (!m || !isDisplayableImage(m.file)) continue;
    out.push({ src: m.file, title: mc.title || m.title || '' });
  }
  return out;
}

function placeSuffix(place: string | null): string {
  const p = shortPlace(place);
  return p ? ' in ' + p : '';
}

/** EDUC + GRAD (je genau eines) zu einem Bildungsweg-Satz (Orakel `_mergeEducGrad`). */
function mergeEducGrad(educ: Event, grad: Event, pr: Pronoun): string {
  const val = educ.value ? stripQuotes(educ.value) : 'eine Schule';
  const ePlace = shortPlace(educ.place);
  const gPlace = shortPlace(grad.place);
  const eLoc = ePlace && !(val && val.toLowerCase().includes(ePlace.toLowerCase())) ? ' in ' + ePlace : '';
  const educDate = atDate(educ);
  const samePlace = !gPlace || (ePlace && ePlace.toLowerCase() === gPlace.toLowerCase());
  const gradYr = yearFromDate(grad.date);
  const educEndYr = educ.date
    ? (() => {
        const m = educ.date.match(/(?:TO|AND)\s+(\d{4})/i);
        return m ? parseInt(m[1], 10) : yearFromDate(educ.date);
      })()
    : null;
  const gradDateStr = gradYr && gradYr !== educEndYr ? ' ' + gradYr : '';
  const gLoc = samePlace && eLoc ? ' dort' : !samePlace && gPlace ? ' in ' + gPlace : '';
  const gradVal = grad.value ? stripQuotes(grad.value) : '';
  const gradPart = gradVal ? `erlangte${gradDateStr}${gLoc} die ${gradVal}` : `erlangte${gradDateStr}${gLoc} einen Abschluss`;
  return `${pr.Er} besuchte ${val}${eLoc}${educDate} und ${gradPart}.`;
}

/** Frühes Leben: Geburt, Taufe, Eltern, Geschwister (Orakel `_sectionEarlyLife`). */
function earlyLife(db: Database, ctx: PlaceContext, personId: PersonId, pr: Pronoun): StorySection | null {
  const p = db.individuals.get(personId)!;
  const name = displayName(p) || pr.Er;
  const sentences: string[] = [];

  const bRaw = p.birth.date || '';
  const bPlace = placeSuffix(p.birth.place);
  if (p.birth.seen || bRaw || bPlace) {
    if (/^\d{4}$/.test(bRaw.trim())) {
      sentences.push(`${name} kam ${bRaw.trim()}${bPlace} zur Welt.`);
    } else {
      sentences.push(`${name} wurde${atDate({ date: bRaw })}${bPlace} geboren.`);
    }
    const pctx = buildPlaceContextSentence(ctx, p.birth.placeId, yearFromDate(bRaw));
    if (pctx) sentences.push(pctx);
  }

  if (p.chr.seen) {
    sentences.push(`${pr.Er} wurde${atDate({ date: p.chr.date })}${placeSuffix(p.chr.place)} getauft.`);
    const pctx = buildPlaceContextSentence(ctx, p.chr.placeId, yearFromDate(p.chr.date));
    if (pctx) sentences.push(pctx);
  }

  const { father, mother } = getParentIds(db, personId);
  const fn = father ? displayName(db.individuals.get(father)!) : null;
  const mn = mother ? displayName(db.individuals.get(mother)!) : null;
  if (fn || mn) {
    const parents = fn && mn ? fn + ' und ' + mn : fn || mn;
    sentences.push(`${pr.Er} war ${pr.SohnArt} ${pr.Sohn} von ${parents}.`);
  }

  const originFamId = p.childOf[0]?.familyId;
  const originFam = originFamId ? db.families.get(originFamId) : null;
  if (originFam) {
    const sibCount = originFam.children.filter((cid) => cid !== personId).length;
    if (sibCount === 0 && (father || mother)) sentences.push(`${pr.Er} wuchs als Einzelkind auf.`);
    else if (sibCount === 1) sentences.push(`${pr.Er} wuchs mit einem Geschwister auf.`);
    else if (sibCount > 1) sentences.push(`${pr.Er} wuchs mit ${sibCount} Geschwistern auf.`);
  }

  if (!sentences.length) return null;
  return { id: 'intro', heading: null, paragraphs: [sentences.join(' ')] };
}

/** Lebenslauf: Bildung/Abschluss, Beruf, Stationen, Wohnorte, übrige Ereignisse (Orakel `_sectionEvents`). */
function lifeCourse(personId: PersonId, db: Database, pr: Pronoun): StorySection | null {
  const p = db.individuals.get(personId)!;
  const skip = new Set(['MARR', 'ENGA', 'DIV', 'DIVF', 'BIRT', 'CHR', 'DEAT', 'BURI', 'RELI']);
  const allEvs = p.events.filter((ev) => !skip.has(ev.type));
  const byYear = (a: Event, b: Event) => (yearFromDate(a.date) ?? Infinity) - (yearFromDate(b.date) ?? Infinity);
  const byType = (t: string) => allEvs.filter((ev) => ev.type === t).sort(byYear);

  const occus = byType('OCCU');
  const grads = byType('GRAD');
  const educs = byType('EDUC');
  const resis = byType('RESI');
  const merged = new Set(['OCCU', 'GRAD', 'EDUC', 'RESI']);
  const evs = allEvs.filter((ev) => !merged.has(ev.type));

  const isCareer = (ev: Event) => !!ev.value && !!ev.date && /^FROM\s+/i.test(ev.date);
  const careers = evs.filter(isCareer).sort(byYear);
  const otherEvs = evs.filter((ev) => !isCareer(ev));

  const paragraphs: string[] = [];
  const educGradMerged = educs.length === 1 && grads.length === 1;
  if (educGradMerged) {
    paragraphs.push(mergeEducGrad(educs[0], grads[0], pr));
  } else {
    const educSent = mergeEducSentence(educs, pr);
    if (educSent) paragraphs.push(educSent);
    if (educs.length > 0) {
      const gradSent = mergeGradSentence(grads, pr);
      if (gradSent) paragraphs.push(gradSent);
    }
  }

  const occuSent = mergeOccuSentence(occus, pr);
  if (occuSent) paragraphs.push(occuSent);
  const careerSent = mergeCareerSentence(careers, pr);
  if (careerSent) paragraphs.push(careerSent);
  const resiSent = mergeResiSentence(resis, pr);
  if (resiSent) paragraphs.push(resiSent);

  if (!educGradMerged && educs.length === 0) {
    const gradSent = mergeGradSentence(grads, pr);
    if (gradSent) paragraphs.push(gradSent);
  }

  const sorted = [...otherEvs].sort((a, b) => {
    const ya = yearFromDate(a.date);
    const yb = yearFromDate(b.date);
    if (ya === null && yb === null) return 0;
    if (ya === null) return 1;
    if (yb === null) return -1;
    return ya - yb;
  });
  for (const ev of sorted) paragraphs.push(eventSentence(ev, pr));

  if (!paragraphs.length) return null;
  return { id: 'events', heading: 'Lebenslauf', paragraphs };
}

/** Familie: je Ehe ein Absatz (Partner/Heirat/Kinder) (Orakel `_sectionFamilies`). */
function families(db: Database, personId: PersonId, pr: Pronoun): StorySection | null {
  const p = db.individuals.get(personId)!;
  const name = displayName(p) || pr.Er;
  const spouseFamilies = getSpouseFamilies(db, personId).sort((a, b) => {
    const ya = yearFromDate(db.families.get(a.familyId)?.marriage.date) ?? Infinity;
    const yb = yearFromDate(db.families.get(b.familyId)?.marriage.date) ?? Infinity;
    return ya - yb;
  });

  const paragraphs: string[] = [];
  for (const sf of spouseFamilies) {
    const fam = db.families.get(sf.familyId);
    if (!fam) continue;
    const partner = sf.spouseId ? db.individuals.get(sf.spouseId) : null;
    const sentences: string[] = [];

    const marr = fam.marriage;
    if (marr.seen || marr.date || marr.place) {
      const pName = partner
        ? displayName(partner) + partnerSpan(yearFromDate(partner.birth.date || partner.chr.date), yearFromDate(partner.death.date))
        : 'unbekannt';
      sentences.push(`${name} heiratete ${pName}${atDate({ date: marr.date })}${placeSuffix(marr.place)}.`);
    } else if (partner) {
      const pName = displayName(partner) + partnerSpan(yearFromDate(partner.birth.date || partner.chr.date), yearFromDate(partner.death.date));
      sentences.push(`${name} war mit ${pName} verheiratet.`);
    }

    const children = sf.children
      .map((cid) => db.individuals.get(cid))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ name: displayName(c), year: yearFromDate(c.birth.date || c.chr.date) }));
    const childStr = childSentence(children);
    if (childStr) sentences.push(childStr);

    if (sentences.length) paragraphs.push(sentences.join(' '));
  }

  if (!paragraphs.length) return null;
  return { id: 'family', heading: 'Familie', paragraphs };
}

/** Konfession — kurze Schlusszeile (Orakel `_sectionReli`). */
function religion(personId: PersonId, db: Database, pr: Pronoun): StorySection | null {
  const p = db.individuals.get(personId)!;
  const reli = p.events.find((ev) => ev.type === 'RELI' && ev.value);
  if (!reli) return null;
  const val = reli.value.trim();
  const dot = val.endsWith('.') ? '' : '.';
  return { id: 'reli', heading: null, paragraphs: [`${pr.Er} war ${val}${atDate(reli)}${dot}`] };
}

/** Tod + Begräbnis (Orakel `_sectionDeath`). */
function death(db: Database, ctx: PlaceContext, personId: PersonId, pr: Pronoun): StorySection | null {
  const p = db.individuals.get(personId)!;
  const name = displayName(p) || pr.Er;
  const sentences: string[] = [];

  if (p.death.seen || p.death.date || p.death.place) {
    const causeFull = p.cause ? (p.cause.length > 30 ? ' (' + p.cause + ')' : ' an ' + p.cause) : '';
    sentences.push(`${name} verstarb${atDate({ date: p.death.date })}${placeSuffix(p.death.place)}${causeFull}.`);
    const pctx = buildPlaceContextSentence(ctx, p.death.placeId, yearFromDate(p.death.date));
    if (pctx) sentences.push(pctx);
  }
  if (p.buri.seen || p.buri.place) {
    sentences.push(`${pr.Er} wurde${atDate({ date: p.buri.date })}${placeSuffix(p.buri.place)} begraben.`);
    const pctx = buildPlaceContextSentence(ctx, p.buri.placeId, yearFromDate(p.buri.date));
    if (pctx) sentences.push(pctx);
  }

  if (!sentences.length) return null;
  return { id: 'death', heading: null, paragraphs: [sentences.join(' ')] };
}

/** Personen-Biografie als strukturiertes Dokument (Orakel `_renderStory`). */
export function buildPersonStory(db: Database, ctx: PlaceContext, personId: PersonId): StoryDoc {
  const p = db.individuals.get(personId);
  if (!p) throw new Error('Person nicht gefunden: ' + personId);
  const pr = pronoun(p);

  const fmtB = fmtDate(p.birth.date || p.chr.date || '');
  const fmtD = fmtDate(p.death.date || '');
  const lifespan = fmtB || fmtD ? `${fmtB}${fmtB && fmtD ? ' – ' : ''}${fmtD}` : '';

  const by = yearFromDate(p.birth.date || p.chr.date);
  const dy = yearFromDate(p.death.date);

  const sections: StorySection[] = [];
  const push = (s: StorySection | null) => {
    if (s) sections.push(s);
  };
  push(earlyLife(db, ctx, personId, pr));
  const epoch = epochContext(by, dy, pr.Er);
  if (epoch) sections.push({ id: 'epoch', heading: null, paragraphs: [epoch] });
  push(lifeCourse(personId, db, pr));
  push(families(db, personId, pr));
  push(religion(personId, db, pr));
  push(death(db, ctx, personId, pr));
  if (p.noteText) sections.push({ id: 'notes', heading: 'Notizen', paragraphs: [p.noteText] });

  return {
    subject: 'person',
    id: personId,
    title: displayName(p) || personId,
    lifespan,
    subtitle: '',
    photos: collectStoryMedia(db, personId),
    sections,
    mapPoints: personBiographyPoints(db, ctx, personId),
  };
}

/** Lebensdaten-Jahre (Geburt/Taufe, Tod) einer Person für Spann-Berechnungen. */
function lifeYearsOf(p: { birth: Event; chr: Event; death: Event }): number[] {
  const out: number[] = [];
  const by = yearFromDate(p.birth.date || p.chr.date);
  const dy = yearFromDate(p.death.date);
  if (by) out.push(by);
  if (dy) out.push(dy);
  return out;
}

/** Familien-Biografie als strukturiertes Dokument (Orakel `_renderFamilyStory`, BL-186). */
export function buildFamilyStory(db: Database, familyId: string): StoryDoc {
  const fam = db.families.get(familyId);
  if (!fam) throw new Error('Familie nicht gefunden: ' + familyId);
  const husb = fam.husband ? (db.individuals.get(fam.husband) ?? null) : null;
  const wife = fam.wife ? (db.individuals.get(fam.wife) ?? null) : null;
  const children = fam.children
    .map((cid) => db.individuals.get(cid))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .sort((a, b) => (yearFromDate(a.birth.date || a.chr.date) ?? Infinity) - (yearFromDate(b.birth.date || b.chr.date) ?? Infinity));

  const hName = husb ? displayName(husb) : '–';
  const wName = wife ? displayName(wife) : '–';
  const both = !!husb && !!wife;

  // Lebensspanne aus Eltern + Kindern.
  const years: number[] = [];
  for (const p of [husb, wife]) if (p) years.push(...lifeYearsOf(p));
  for (const c of children) years.push(...lifeYearsOf(c));
  const minY = years.length ? Math.min(...years) : null;
  const maxY = years.length ? Math.max(...years) : null;
  const lifespan = minY && maxY && minY !== maxY ? `(${minY}–${maxY})` : minY ? `(${minY})` : '';

  const marr = fam.marriage;
  const engag = fam.engagement;
  const divorce = fam.events.find((ev) => ev.type === 'DIV' || ev.type === 'DIVF') ?? null;

  const subtitle = marr.date || marr.place ? '⚭ ' + [fmtDate(marr.date), shortPlace(marr.place)].filter(Boolean).join(', ') : '';

  const sections: StorySection[] = [];

  // ── Heirat ──
  const marrSentences: string[] = [];
  if (engag.seen || engag.date || engag.place) {
    marrSentences.push(
      both
        ? `${hName} und ${wName} verlobten sich${atDate({ date: engag.date })}${placeSuffix(engag.place)}.`
        : `Verlobung${atDate({ date: engag.date })}${placeSuffix(engag.place)}.`,
    );
  }
  if (marr.seen || marr.date || marr.place) {
    if (marrSentences.length) {
      marrSentences.push(`Sie heirateten${atDate({ date: marr.date })}${placeSuffix(marr.place)}.`);
    } else {
      marrSentences.push(
        both
          ? `${hName} und ${wName} heirateten${atDate({ date: marr.date })}${placeSuffix(marr.place)}.`
          : `Heirat${atDate({ date: marr.date })}${placeSuffix(marr.place)}.`,
      );
    }
  } else if (both) {
    marrSentences.push(`${hName} und ${wName} bildeten eine Familie.`);
  }
  if (divorce && (divorce.seen || divorce.date)) {
    marrSentences.push(`Die Ehe wurde${atDate({ date: divorce.date })} geschieden.`);
  }
  if (marrSentences.length) sections.push({ id: 'marriage', heading: 'Heirat', paragraphs: [marrSentences.join(' ')] });

  // ── Eltern (je ein Block) ──
  const parentBlocks: StoryBlock[] = [];
  for (const p of [husb, wife]) {
    if (!p) continue;
    const pr = pronoun(p);
    const name = displayName(p) || pr.Er;
    const sentences: string[] = [];
    const bRaw = p.birth.date || '';
    const bPlace = placeSuffix(p.birth.place);
    if (bRaw || bPlace || p.birth.seen) {
      if (/^\d{4}$/.test(bRaw.trim())) sentences.push(`${name} kam ${bRaw.trim()}${bPlace} zur Welt.`);
      else sentences.push(`${name} wurde${atDate({ date: bRaw })}${bPlace} geboren.`);
    }
    const occus = p.events.filter((ev) => ev.type === 'OCCU' && ev.value);
    const occuSent = mergeOccuSentence(occus, pr);
    if (occuSent) sentences.push(occuSent);
    if (p.death.seen || p.death.date || p.death.place) {
      sentences.push(`${pr.Er} verstarb${atDate({ date: p.death.date })}${placeSuffix(p.death.place)}.`);
    }
    if (!sentences.length) continue;
    const role = p.sex === 'M' ? 'Vater' : p.sex === 'F' ? 'Mutter' : 'Elternteil';
    parentBlocks.push({ subheading: `${name} — ${role}`, paragraphs: [sentences.join(' ')] });
  }
  if (parentBlocks.length) sections.push({ id: 'parents', heading: 'Eltern', paragraphs: [], blocks: parentBlocks });

  // ── Kinder (N) ──
  if (children.length) {
    const rows = children.map((c) => {
      const by = yearFromDate(c.birth.date || c.chr.date);
      const dy = yearFromDate(c.death.date);
      const age = by && dy ? dy - by : null;
      const lifeStr = by && dy ? `*${by} †${dy}` : by ? `*${by}` : dy ? `†${dy}` : '';
      const partners = getSpouseFamilies(db, c.id)
        .map((sf) => (sf.spouseId ? db.individuals.get(sf.spouseId) : null))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => displayName(s));
      const occuFirst = c.events.find((ev) => ev.type === 'OCCU' && ev.value);
      const meta: string[] = [];
      if (lifeStr) meta.push(lifeStr);
      if (age !== null && age < 18) meta.push('jung gestorben');
      if (occuFirst?.value) meta.push(occuFirst.value);
      if (partners.length) meta.push('⚭ ' + partners.join(', '));
      return displayName(c) + (meta.length ? ' — ' + meta.join(' · ') : '');
    });
    sections.push({ id: 'children', heading: `Kinder (${children.length})`, paragraphs: rows });
  }

  // ── Familienchronik ──
  const chron: { yr: number; text: string }[] = [];
  const addEv = (label: string, date: string | null, who: string | null) =>
    chron.push({ yr: yearFromDate(date) ?? 99999, text: `${label}${who ? ` (${who})` : ''}` });
  if (engag.date || engag.seen) addEv('Verlobung', engag.date, null);
  if (marr.date || marr.seen) addEv('Heirat', marr.date, null);
  for (const ev of fam.events) addEv(ev.eventType || EVENT_LABELS[ev.type] || ev.type || 'Ereignis', ev.date, null);
  if (divorce && (divorce.date || divorce.seen)) addEv('Scheidung', divorce.date, null);
  for (const c of children) {
    if (c.birth.date || c.birth.seen) addEv('Geburt', c.birth.date || c.chr.date, displayName(c));
    if (c.death.date || c.death.seen) addEv('Tod', c.death.date, displayName(c));
  }
  chron.sort((a, b) => a.yr - b.yr);
  if (chron.length) {
    sections.push({
      id: 'timeline',
      heading: 'Familienchronik',
      paragraphs: chron.map((e) => (e.yr !== 99999 ? `${e.yr} — ${e.text}` : e.text)),
    });
  }

  if (fam.noteText) sections.push({ id: 'notes', heading: 'Notizen', paragraphs: [fam.noteText] });

  // Familien-Kopf zeigt (wie im v8-Orakel) das Primärfoto beider Partner.
  const famPhotos: StoryPhoto[] = [];
  for (const p of [husb, wife]) {
    if (p) famPhotos.push(...collectStoryMedia(db, p.id).slice(0, 1));
  }

  return {
    subject: 'family',
    id: familyId,
    title: `Familie ${hName} & ${wName}`,
    lifespan,
    subtitle,
    photos: famPhotos,
    sections,
    mapPoints: [],
  };
}
