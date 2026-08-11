// core/interop/model-equiv.ts — Modell-Äquivalenz-Vergleicher (RT-4, ADR-v9-127).
//
// Reine Funktion `modelEquiv(a, b): Diff[]` — DOM-/framework-frei, build-frei testbar
// (INV-ARCH-1/-2). Kernversprechen des Cross-Family-Epics: die Metrik ist
// **Modell-Äquivalenz, nicht Byte-Gleichheit** — über Familiengrenzen (GEDCOM↔GRAMPS)
// ist Byte-Gleichheit unmöglich (ADR-v9-127 Entscheidung 3). Später von BL-157/158/159
// als Gate für `A→Modell→B→Modell'` importiert.
//
// ── Matching-Strategie (der Kern) ────────────────────────────────────────────
// IDs werden cross-family REMAPPED (ADR-v9-127 Entscheidung 2), daher wird NIE über
// `id`-Gleichheit verglichen, sondern über eine **strukturelle Korrespondenz**:
//
//   1. Jede Entität bekommt eine stabile SIGNATUR aus ihren erhaltungspflichtigen
//      Kernfeldern (Person: Name+Geschlecht+Geburts-/Sterbedatum; Familie: Partner-
//      Signaturen+Heiratsdatum; Quelle: Titel+Autor+Kürzel; …). Die Signatur ist
//      id-frei, überlebt also das Remapping.
//   2. Entitäten werden über GLEICHE Signatur gepaart (order-stabile Buckets: bei
//      mehreren Trägern derselben Signatur — echten Duplikaten — paart die Reihen-
//      folge. Für den Identitäts-Fall a===b iteriert dieselbe Map in derselben
//      Reihenfolge → jede Entität paart mit sich selbst → garantiert leerer Diff).
//   3. REFERENZEN (Familie→Person, Zitat→Quelle, Ereignis→Medium) werden NICHT roh
//      per id verglichen, sondern über die Signatur der AUFGELÖSTEN Zielentität —
//      so bleibt der Vergleich unter Remapping korrekt.
//
// ── Was verglichen wird (MUSS erhalten bleiben, ADR-v9-127 Entscheidung 3) ────
//   Personen: Namensteile, Geschlecht, Kern-Ereignisse (BIRT/CHR/DEAT/BURI) + events[]
//     mit date/place/value, Zitat-QUELLEN, Medien-DATEI-Referenzen, Familienlinks, Notiz.
//   Familien: husband/wife/children (als Personen-Signaturen), Ereignisse.
//   Quellen, Repositories, Notizen, Orte/Höfe (Kernattribute).
//
// ── Was NICHT verglichen wird (DARF dokumentiert abweichen) ───────────────────
//   - `id` (remapped), GRAMPS-`grampsId`/`handle`, `wireOrigin`, `formWire` (der rohe
//     GEDCOM-FORM-Wert — existiert in GRAMPS gar nicht, s. BL-290),
//     `lastChanged`/`createdDate` (format-native Fidelity-/Zeitstempel-Felder).
//   - Passthrough-Rohbäume (`GedNode`, `MediaCitation.extra`) — reiner Format-Backbone.
//   - `shortName` (app-privat, erreicht den Export nie, Spec 11).
//   Datum/Ort werden nach LEICHTER Normalisierung verglichen (trim/collapse). Volle
//   format-übergreifende Datums-/`form`-Normalisierung ist BL-156/159 vorbehalten; hier
//   bewusst konservativ (ein Rest an Repräsentations-Diffs ist im Cross-Family-Fall
//   erwartet und für BL-159 diagnostisch, nicht für das BL-155-Identitätsgate relevant).

import type {
  Database,
  Person,
  Family,
  Event,
  Source,
  Repository,
  Note,
  Citation,
  MediaCitation,
} from '../model/types';
import type { PlaceObject, HofObject } from '../places/types';

/** Ein einzelner Äquivalenz-Verstoß (für die RT-4-Diagnose brauchbar). */
export interface Diff {
  /** Entitätsklasse: 'person' | 'family' | 'source' | 'repository' | 'note' | 'place' | 'hof'. */
  entity: string;
  /** Signatur/Schlüssel der betroffenen Entität (Diagnose-Anker). */
  key: string;
  /** Feldpfad relativ zur Entität, z. B. 'birth.place' oder 'children'. '' bei ganzer Entität. */
  path: string;
  /** 'missing' = nur in a, 'extra' = nur in b, 'changed' = beide, Wert weicht ab. */
  kind: 'missing' | 'extra' | 'changed';
  /** Wert in a (undefined bei 'extra'). */
  a?: unknown;
  /** Wert in b (undefined bei 'missing'). */
  b?: unknown;
}

// ── Normalisierung ────────────────────────────────────────────────────────────

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, ' ');
}

/** Datums-/Wert-Normalisierung: trim + Whitespace-Kollaps + Großschreibung (GEDCOM-Monate/Qualifier). */
function normVal(s: string | null | undefined): string {
  return norm(s).toUpperCase();
}

// ── Signaturen (id-frei, überleben das Remapping) ─────────────────────────────

// Signatur über die IDENTIFIZIERENDEN Namens-TEILE, nicht den zusammengesetzten
// `name`-String (BL-159): Cross-Family rekonstruiert die NAME-Zeile format-spezifisch
// (GEDCOM `Dr.-Ing. Franz /Decker/` vs. GRAMPS `given /surname/`) — der String ist damit
// für die id-freie Paarung zerbrechlich (1431/2795 Personen sonst nicht paarbar). given/
// surname/sex/Kern-Daten sind erhaltungspflichtig UND format-stabil. `prefix`/`suffix`
// (Titel/Zusatz) bleiben BEWUSST draußen — sie sind nicht identitätsstiftend (ein „Dr."
// macht keine andere Person, INV: prefix ist ein Nicht-Signatur-Feld) und werden weiter
// als FELD verglichen (comparePerson), ebenso der `name`-String selbst.
function personSig(p: Person): string {
  return [
    'P',
    norm(p.given),
    norm(p.surname),
    p.sex,
    normVal(p.birth.date),
    normVal(p.death.date),
  ].join('|');
}

function sourceSig(s: Source): string {
  return ['S', norm(s.title), norm(s.author), norm(s.abbr)].join('|');
}

function repoSig(r: Repository): string {
  return ['R', norm(r.name), norm(r.address)].join('|');
}

function noteSig(n: Note): string {
  return ['N', n.type, norm(n.text)].join('|');
}

function placeSig(p: PlaceObject): string {
  return ['PL', norm(p.title)].join('|');
}

function hofSig(h: HofObject, resolvePlace: (id: string) => string): string {
  const addr = h.addrs[0]?.value ?? '';
  return ['HOF', norm(addr), resolvePlace(h.villageId)].join('|');
}

/**
 * Familien-Signatur über die AUFGELÖSTEN Partner-Signaturen (id-frei) + Heiratsdatum.
 * `resolvePerson` liefert die Personen-Signatur zur id (oder die id, wenn unauflösbar).
 */
function familySig(f: Family, resolvePerson: (id: string | null) => string): string {
  return [
    'F',
    resolvePerson(f.husband),
    resolvePerson(f.wife),
    normVal(f.marriage.date),
  ].join('|');
}

// ── Signatur-basiertes, order-stabiles Matching ───────────────────────────────

interface Matched<T> {
  pairs: Array<[T, T]>;
  onlyA: T[];
  onlyB: T[];
}

function bucketize<T>(items: Iterable<T>, sig: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = sig(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/**
 * Paart a-Entitäten mit b-Entitäten über gleiche Signatur, order-stabil innerhalb
 * eines Buckets. Identität (a===b, gleiche Map, gleiche Reihenfolge) ⇒ Selbst-Paarung.
 *
 * `sigB` (default = `sigA`) erlaubt SEITENSPEZIFISCHE Signaturen: Signaturen, die
 * Referenzen über die OWNING-db auflösen (Familie → Partner-Signaturen), müssen für die
 * b-Seite den b-Resolver nutzen — sonst schlägt das Matching unter cross-family REMAPPTEN
 * IDs fehl (a: `I0001`, b: `@I1@`), obwohl die Strukturen äquivalent sind. Für id-freie
 * Signaturen (Person/Quelle/Notiz/Ereignis) sind beide Seiten identisch (Default greift).
 */
function matchBySig<T>(
  as: Iterable<T>,
  bs: Iterable<T>,
  sigA: (t: T) => string,
  sigB: (t: T) => string = sigA,
): Matched<T> {
  const bBuckets = bucketize(bs, sigB);
  const pairs: Array<[T, T]> = [];
  const onlyA: T[] = [];
  const consumed = new Map<string, number>();
  for (const a of as) {
    const k = sigA(a);
    const bArr = bBuckets.get(k);
    const used = consumed.get(k) ?? 0;
    if (bArr && used < bArr.length) {
      pairs.push([a, bArr[used]]);
      consumed.set(k, used + 1);
    } else {
      onlyA.push(a);
    }
  }
  const onlyB: T[] = [];
  for (const [k, bArr] of bBuckets) {
    const used = consumed.get(k) ?? 0;
    for (let i = used; i < bArr.length; i++) onlyB.push(bArr[i]);
  }
  return { pairs, onlyA, onlyB };
}

// ── Resolver: id → Signatur der Zielentität (referenz-auflösung, remap-fest) ──

function makeResolvers(db: Database) {
  const resolvePerson = (id: string | null): string => {
    if (!id) return '∅';
    const p = db.individuals.get(id);
    return p ? personSig(p) : `⟨unresolved:${id}⟩`;
  };
  const resolveSource = (id: string): string => {
    const s = db.sources.get(id);
    return s ? sourceSig(s) : `⟨unresolved:${id}⟩`;
  };
  const resolveMediaFile = (id: string): string => {
    const m = db.media.get(id);
    return m ? norm(m.file) : `⟨unresolved:${id}⟩`;
  };
  const resolvePlace = (id: string): string => {
    const p = db.placeObjects.get(id);
    return p ? placeSig(p) : `⟨unresolved:${id}⟩`;
  };
  return { resolvePerson, resolveSource, resolveMediaFile, resolvePlace };
}

type Resolvers = ReturnType<typeof makeResolvers>;

// ── Feld-Vergleiche ───────────────────────────────────────────────────────────

function pushScalar(
  diffs: Diff[],
  entity: string,
  key: string,
  path: string,
  a: string,
  b: string,
): void {
  if (a !== b) diffs.push({ entity, key, path, kind: 'changed', a, b });
}

/** Multiset-Vergleich (sortiert): erhält „welche Werte, wie oft", nicht die Reihenfolge. */
function pushMultiset(
  diffs: Diff[],
  entity: string,
  key: string,
  path: string,
  a: string[],
  b: string[],
): void {
  const sa = [...a].sort();
  const sb = [...b].sort();
  if (sa.length !== sb.length || sa.some((v, i) => v !== sb[i])) {
    diffs.push({ entity, key, path, kind: 'changed', a: sa, b: sb });
  }
}

function citationSourceSigs(cits: Citation[], r: Resolvers): string[] {
  return cits.map((c) => r.resolveSource(c.sourceId));
}

function mediaFileSigs(media: MediaCitation[], r: Resolvers): string[] {
  return media.map((m) => r.resolveMediaFile(m.mediaId));
}

/** Vergleicht EIN Ereignis (Kern-Slot oder events[]-Eintrag): Datum/Ort/Wert/Quellen/Medien. */
function compareEvent(
  ea: Event,
  eb: Event,
  entity: string,
  key: string,
  path: string,
  ra: Resolvers,
  rb: Resolvers,
  diffs: Diff[],
): void {
  pushScalar(diffs, entity, key, `${path}.date`, normVal(ea.date), normVal(eb.date));
  pushScalar(diffs, entity, key, `${path}.place`, norm(ea.place), norm(eb.place));
  pushScalar(diffs, entity, key, `${path}.value`, norm(ea.value), norm(eb.value));
  pushMultiset(
    diffs,
    entity,
    key,
    `${path}.citations`,
    citationSourceSigs(ea.citations, ra),
    citationSourceSigs(eb.citations, rb),
  );
  pushMultiset(
    diffs,
    entity,
    key,
    `${path}.media`,
    mediaFileSigs(ea.media, ra),
    mediaFileSigs(eb.media, rb),
  );
}

/** Signatur eines events[]-Eintrags fürs Matching (Typ + Datum). */
function eventSig(e: Event): string {
  return [norm(e.eventType) || norm(e.type), normVal(e.date)].join('|');
}

function compareEventList(
  as: Event[],
  bs: Event[],
  entity: string,
  key: string,
  path: string,
  ra: Resolvers,
  rb: Resolvers,
  diffs: Diff[],
): void {
  const m = matchBySig(as, bs, eventSig);
  for (const e of m.onlyA)
    diffs.push({ entity, key, path: `${path}[${eventSig(e)}]`, kind: 'missing', a: eventSig(e) });
  for (const e of m.onlyB)
    diffs.push({ entity, key, path: `${path}[${eventSig(e)}]`, kind: 'extra', b: eventSig(e) });
  for (const [ea, eb] of m.pairs)
    compareEvent(ea, eb, entity, key, `${path}[${eventSig(ea)}]`, ra, rb, diffs);
}

function comparePerson(
  pa: Person,
  pb: Person,
  ra: Resolvers,
  rb: Resolvers,
  diffs: Diff[],
): void {
  const key = personSig(pa);
  pushScalar(diffs, 'person', key, 'name', norm(pa.name), norm(pb.name));
  pushScalar(diffs, 'person', key, 'given', norm(pa.given), norm(pb.given));
  pushScalar(diffs, 'person', key, 'surname', norm(pa.surname), norm(pb.surname));
  pushScalar(diffs, 'person', key, 'prefix', norm(pa.prefix), norm(pb.prefix));
  pushScalar(diffs, 'person', key, 'suffix', norm(pa.suffix), norm(pb.suffix));
  pushScalar(diffs, 'person', key, 'sex', pa.sex, pb.sex);
  compareEvent(pa.birth, pb.birth, 'person', key, 'birth', ra, rb, diffs);
  compareEvent(pa.chr, pb.chr, 'person', key, 'chr', ra, rb, diffs);
  compareEvent(pa.death, pb.death, 'person', key, 'death', ra, rb, diffs);
  compareEvent(pa.buri, pb.buri, 'person', key, 'buri', ra, rb, diffs);
  compareEventList(pa.events, pb.events, 'person', key, 'events', ra, rb, diffs);
  // Familienlinks als aufgelöste Familien-Signaturen (remap-fest über Partner-Sigs).
  pushMultiset(
    diffs,
    'person',
    key,
    'childOf',
    pa.childOf.map((c) => famSigOf(ra, c.familyId)),
    pb.childOf.map((c) => famSigOf(rb, c.familyId)),
  );
  pushMultiset(
    diffs,
    'person',
    key,
    'parentIn',
    pa.parentIn.map((fid) => famSigOf(ra, fid)),
    pb.parentIn.map((fid) => famSigOf(rb, fid)),
  );
  pushMultiset(
    diffs,
    'person',
    key,
    'media',
    mediaFileSigs(pa.media, ra),
    mediaFileSigs(pb.media, rb),
  );
  pushMultiset(
    diffs,
    'person',
    key,
    'topLevelCitations',
    citationSourceSigs(pa.topLevelCitations, ra),
    citationSourceSigs(pb.topLevelCitations, rb),
  );
  pushScalar(diffs, 'person', key, 'noteText', norm(pa.noteText), norm(pb.noteText));
}

// Familien-Signatur-Cache pro Resolver-Satz (die Resolver kennen ihre db nicht direkt
// als Family-Lookup; famSigOf wird über eine an makeContext gebundene db aufgelöst).
const famSigCache = new WeakMap<Resolvers, (fid: string) => string>();

function famSigOf(r: Resolvers, fid: string): string {
  const fn = famSigCache.get(r);
  return fn ? fn(fid) : `⟨fam:${fid}⟩`;
}

function compareFamily(
  fa: Family,
  fb: Family,
  ra: Resolvers,
  rb: Resolvers,
  diffs: Diff[],
): void {
  const key = familySig(fa, ra.resolvePerson);
  pushScalar(diffs, 'family', key, 'husband', ra.resolvePerson(fa.husband), rb.resolvePerson(fb.husband));
  pushScalar(diffs, 'family', key, 'wife', ra.resolvePerson(fa.wife), rb.resolvePerson(fb.wife));
  pushMultiset(
    diffs,
    'family',
    key,
    'children',
    fa.children.map((c) => ra.resolvePerson(c)),
    fb.children.map((c) => rb.resolvePerson(c)),
  );
  compareEvent(fa.marriage, fb.marriage, 'family', key, 'marriage', ra, rb, diffs);
  compareEvent(fa.engagement, fb.engagement, 'family', key, 'engagement', ra, rb, diffs);
  compareEventList(fa.events, fb.events, 'family', key, 'events', ra, rb, diffs);
  pushScalar(diffs, 'family', key, 'noteText', norm(fa.noteText), norm(fb.noteText));
}

function compareSource(sa: Source, sb: Source, diffs: Diff[]): void {
  const key = sourceSig(sa);
  pushScalar(diffs, 'source', key, 'title', norm(sa.title), norm(sb.title));
  pushScalar(diffs, 'source', key, 'author', norm(sa.author), norm(sb.author));
  pushScalar(diffs, 'source', key, 'abbr', norm(sa.abbr), norm(sb.abbr));
  pushScalar(diffs, 'source', key, 'publisher', norm(sa.publisher), norm(sb.publisher));
  // `createdDate` ist Metadaten ÜBER den Datensatz, nicht über die Quelle — es steht in
  // [13 §1] ausdrücklich unter „darf abweichen" (wie `lastChanged`) und wird deshalb
  // NICHT verglichen; es hier zu prüfen brächte cross-family lauter Schein-Diffs.
  pushScalar(diffs, 'source', key, 'agnc', norm(sa.agnc), norm(sb.agnc));
  pushScalar(diffs, 'source', key, 'text', norm(sa.text), norm(sb.text));
  // `noteText` (BL-336) gehört in dieselbe Reihe wie `family.noteText` — es ist Inhalt der
  // Quelle, nicht Metadatum über den Datensatz (anders als `createdDate`/`lastChanged`
  // darüber). Cross-family teilt es das Schicksal von `text`: GRAMPS führt Notizen
  // ausschließlich als eigene `<note>`-Records mit `noteref`, und der Modell-Slot für die
  // INLINE-Notiz hat dort kein Gegenstück — für `person.noteText` gilt das seit jeher, das
  // ist keine mit BL-336 neu aufgerissene Lücke.
  pushScalar(diffs, 'source', key, 'noteText', norm(sa.noteText), norm(sb.noteText));
  pushScalar(diffs, 'source', key, 'callNumber', norm(sa.callNumber), norm(sb.callNumber));
}

function compareRepository(ra: Repository, rb: Repository, diffs: Diff[]): void {
  const key = repoSig(ra);
  pushScalar(diffs, 'repository', key, 'name', norm(ra.name), norm(rb.name));
  pushScalar(diffs, 'repository', key, 'address', norm(ra.address), norm(rb.address));
  pushScalar(diffs, 'repository', key, 'www', norm(ra.www), norm(rb.www));
  pushScalar(diffs, 'repository', key, 'email', norm(ra.email), norm(rb.email));
}

function compareNote(na: Note, nb: Note, diffs: Diff[]): void {
  const key = noteSig(na);
  pushScalar(diffs, 'note', key, 'type', na.type, nb.type);
  pushScalar(diffs, 'note', key, 'text', norm(na.text), norm(nb.text));
}

function comparePlace(pa: PlaceObject, pb: PlaceObject, diffs: Diff[]): void {
  const key = placeSig(pa);
  pushScalar(diffs, 'place', key, 'title', norm(pa.title), norm(pb.title));
  pushScalar(diffs, 'place', key, 'type', norm(pa.type), norm(pb.type));
  pushScalar(diffs, 'place', key, 'note', norm(pa.note), norm(pb.note));
}

function compareHof(
  ha: HofObject,
  hb: HofObject,
  resolveA: (id: string) => string,
  resolveB: (id: string) => string,
  diffs: Diff[],
): void {
  const key = hofSig(ha, resolveA);
  pushMultiset(
    diffs,
    'hof',
    key,
    'addrs',
    ha.addrs.map((a) => norm(a.value)),
    hb.addrs.map((a) => norm(a.value)),
  );
  pushScalar(diffs, 'hof', key, 'village', resolveA(ha.villageId), resolveB(hb.villageId));
  pushScalar(diffs, 'hof', key, 'note', norm(ha.note), norm(hb.note));
}

// ── Generischer Collection-Vergleich ──────────────────────────────────────────

function compareCollection<T>(
  entity: string,
  as: Iterable<T>,
  bs: Iterable<T>,
  sig: (t: T) => string,
  cmp: (a: T, b: T) => void,
  diffs: Diff[],
  sigB: (t: T) => string = sig,
): void {
  const m = matchBySig(as, bs, sig, sigB);
  for (const a of m.onlyA) diffs.push({ entity, key: sig(a), path: '', kind: 'missing', a: sig(a) });
  for (const b of m.onlyB) diffs.push({ entity, key: sigB(b), path: '', kind: 'extra', b: sigB(b) });
  for (const [a, b] of m.pairs) cmp(a, b);
}

/**
 * Modell-Äquivalenz-Vergleicher (RT-4). Leere Liste ⇒ äquivalent. Jeder Diff nennt
 * Entität, Signatur-Schlüssel, Feldpfad und beide Werte. Vergleicht id-frei über
 * strukturelle Korrespondenz (s. Kopfkommentar), damit cross-family remappte IDs
 * KEINEN Diff erzeugen.
 */
export function modelEquiv(a: Database, b: Database): Diff[] {
  const diffs: Diff[] = [];
  const ra = makeResolvers(a);
  const rb = makeResolvers(b);
  // Familien-Signatur-Auflösung an die jeweilige db binden (für childOf/parentIn-Vergleich).
  famSigCache.set(ra, (fid: string) => {
    const f = a.families.get(fid);
    return f ? familySig(f, ra.resolvePerson) : `⟨fam:${fid}⟩`;
  });
  famSigCache.set(rb, (fid: string) => {
    const f = b.families.get(fid);
    return f ? familySig(f, rb.resolvePerson) : `⟨fam:${fid}⟩`;
  });

  compareCollection(
    'person',
    a.individuals.values(),
    b.individuals.values(),
    personSig,
    (pa, pb) => comparePerson(pa, pb, ra, rb, diffs),
    diffs,
  );
  compareCollection(
    'family',
    a.families.values(),
    b.families.values(),
    (f) => familySig(f, ra.resolvePerson),
    (fa, fb) => compareFamily(fa, fb, ra, rb, diffs),
    diffs,
    // b-Seite MUSS mit dem b-Resolver signieren (cross-family remappte Partner-IDs) —
    // sonst false-mismatch aller Familien. Für a===b identisch zum a-Sig (Default-Verhalten).
    (f) => familySig(f, rb.resolvePerson),
  );
  compareCollection(
    'source',
    a.sources.values(),
    b.sources.values(),
    sourceSig,
    (sa, sb) => compareSource(sa, sb, diffs),
    diffs,
  );
  compareCollection(
    'repository',
    a.repositories.values(),
    b.repositories.values(),
    repoSig,
    (rA, rB) => compareRepository(rA, rB, diffs),
    diffs,
  );
  compareCollection(
    'note',
    a.notes.values(),
    b.notes.values(),
    noteSig,
    (na, nb) => compareNote(na, nb, diffs),
    diffs,
  );
  compareCollection(
    'place',
    a.placeObjects.values(),
    b.placeObjects.values(),
    placeSig,
    (pa, pb) => comparePlace(pa, pb, diffs),
    diffs,
  );
  compareCollection(
    'hof',
    a.hofObjects.values(),
    b.hofObjects.values(),
    (h) => hofSig(h, ra.resolvePlace),
    (ha, hb) => compareHof(ha, hb, ra.resolvePlace, rb.resolvePlace, diffs),
    diffs,
    // Wie bei Familie: die b-Seite löst villageId über den b-Resolver auf (cross-family).
    (h) => hofSig(h, rb.resolvePlace),
  );

  return diffs;
}
