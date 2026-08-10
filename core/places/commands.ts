// core/places/commands.ts — Mutations-Kommandos für PlaceObject/HofObject (Spec 20
// §1.7/§1.8 [K] "Bearbeitung"). Analog core/model/integrity.ts: reine Kommando-
// Funktionen, die ein VOLLSTÄNDIGES Objekt entgegennehmen und die Map mutieren — keine
// verstreuten Feld-Setter aus dem DOM (Auftrags-Vorgabe "savePerson(model)"-Muster).
// Kein Zustand hier, kein DOM/I/O (INV-ARCH-1/2) — die UI-Schale ruft diese Kommandos
// über ein AppState-Kommando auf, das die Reaktivität auslöst (Svelte-Reassign obliegt
// der Schale, s. ui/shell/app-state.svelte.ts).
import type { Event, PlaceId, HofId } from '../model/types';
import type { PlaceObject, HofObject, PlaceObjects, HofObjects, DatedName, DatedRef, DatedAddress, NameTranslation, Year } from './types';
import { buildPlacForGedcom, eventSpanne, type PlaceContext } from './build-plac';
import { normPlaceName, normHofAddr } from './normalize';
import { alsGrenze, type GrenzEingabe } from './zeitbezug';
import { klonen } from '../clone-diagnose';

/**
 * Kommando: legt ein PlaceObject an oder ersetzt es vollständig (Upsert per id).
 * `savePlaceObject(model)`-Muster — kein Feld-Setter, das Objekt kommt komplett von
 * der aufrufenden Formular-Komponente (dort bereits validiert/zusammengebaut).
 */
export function savePlaceObject(places: PlaceObjects, next: PlaceObject): void {
  places.set(next.id, next);
}

/** Kommando: entfernt ein PlaceObject. Referenzen (`enclosedBy`) werden NICHT nachgeführt
 * (das ist Sache eines künftigen Orts-Review-Workflows, außerhalb dieser Scheibe). */
export function deletePlaceObject(places: PlaceObjects, id: PlaceId): void {
  places.delete(id);
}

/** Kommando: legt ein HofObject an oder ersetzt es vollständig (Upsert per id). */
export function saveHofObject(hofs: HofObjects, next: HofObject): void {
  hofs.set(next.id, next);
}

/** Kommando: entfernt ein HofObject. */
export function deleteHofObject(hofs: HofObjects, id: HofId): void {
  hofs.delete(id);
}

/**
 * Setzt oder entfernt den Prüf-Marker eines Orts (Spec 11 §9.1, ADR-v9-191). Reine Kopie —
 * der Aufrufer speichert über `savePlaceObject`.
 *
 * `at = null` hebt den Marker auf. Das ist kein Sonderfall, sondern die Gegenrichtung
 * derselben Handlung: wer feststellt, dass er sich getäuscht hat, muss die Aussage
 * zurücknehmen können (INV-UI-10-Geist — ein Direkt-Kommando braucht eine ebenso leichte
 * Rücknahme).
 *
 * **Diese Funktion ist der einzige Weg zum Marker.** Kein Lade-, Seed-, Bootstrap-, GOV-
 * oder Merge-Pfad ruft sie auf; sie hängt allein am „geprüft"-Knopf des Steckbriefs. Genau
 * das macht die Aussage belastbar: ein automatisch gesetzter Marker sagte nichts mehr über
 * einen Menschen aus.
 */
export function markPlaceReviewed(pl: PlaceObject, at: number | null): PlaceObject {
  return { ...pl, reviewedAt: at };
}

/** Geschwister von `markPlaceReviewed` für Höfe (Spec 11 §9.1, ADR-v9-191). */
export function markHofReviewed(h: HofObject, at: number | null): HofObject {
  return { ...h, reviewedAt: at };
}

/**
 * Setzt beide Datierungs-Hälften EINER Grenze zugleich (BL-324): `from`/`to` als Jahr und
 * `fromDate`/`toDate` als Tag. Ein gemeinsamer Helfer, damit die von [ADR-v9-243]
 * verlangte Kongruenz („das Jahr ist aus dem Tag ableitbar") nicht an vier Stellen
 * einzeln hergestellt — und an einer vergessen — werden kann.
 */
function datiert<T>(basis: T, fromEin: GrenzEingabe, toEin: GrenzEingabe): T & {
  from: Year;
  to: Year;
  fromDate: string | null;
  toDate: string | null;
} {
  const from = alsGrenze(fromEin);
  const to = alsGrenze(toEin);
  return { ...basis, from: from.jahr, to: to.jahr, fromDate: from.datum, toDate: to.datum };
}

/**
 * Hängt eine Namensvariante (`pnames`) mit optionalem Zeitraum an ein bestehendes
 * PlaceObject an. Reine Kopie — der Aufrufer speichert das Ergebnis über
 * savePlaceObject(). Keine Dedup-Logik hier (Nutzer-Intent bleibt erhalten, analog
 * addHofVariant in hof-id.ts).
 */
export function withAddedPname(pl: PlaceObject, value: string, from: GrenzEingabe, to: GrenzEingabe): PlaceObject {
  if (!value.trim()) return pl;
  const entry: DatedName = datiert({ value: value.trim() }, from, to);
  return { ...pl, pnames: [...pl.pnames, entry] };
}

/** Entfernt eine pnames-Variante am angegebenen Index. */
export function withRemovedPname(pl: PlaceObject, index: number): PlaceObject {
  return { ...pl, pnames: pl.pnames.filter((_, i) => i !== index) };
}

/**
 * Bearbeitet eine BESTEHENDE Namensvariante am angegebenen Index (ADR-v9-183) —
 * Geschwister von `withUpdatedHofAddr` und aus demselben Anlass: bis dahin ließ sich ein
 * `pnames`-Eintrag nur wegwerfen und neu tippen, was bei einem Tippfehler im Zeitraum die
 * Array-Position kostete. Gleiche Signaturform, gleiche No-Op-Toleranz (leerer `value` oder
 * Index außerhalb `0..pnames.length-1` gibt `pl` unverändert zurück — kein Crash, kein
 * stillschweigendes Löschen), gleiche Trim-Disziplin wie `withAddedPname`.
 *
 * `dateRaw` des ersetzten Eintrags wird bewusst NICHT übernommen: der Roh-Datumsstring
 * belegt das GEDCOM/GRAMPS-Original (Roundtrip-Fidelity, `core/places/types.ts`) und wäre
 * nach einer Hand-Korrektur von `from`/`to` eine Herkunftsbehauptung über einen Wert, den
 * der Nutzer gerade selbst gesetzt hat. Ändert der Nutzer nur den `value`, gilt dasselbe —
 * die Datierung dieses Eintrags kommt dann ebenfalls aus der Eingabe, nicht aus der Datei.
 */
export function withUpdatedPname(
  pl: PlaceObject,
  index: number,
  value: string,
  from: GrenzEingabe,
  to: GrenzEingabe,
): PlaceObject {
  if (!value.trim()) return pl;
  if (index < 0 || index >= pl.pnames.length) return pl;
  const entry: DatedName = datiert({ value: value.trim() }, from, to);
  return { ...pl, pnames: pl.pnames.map((p, i) => (i === index ? entry : p)) };
}

/**
 * Hängt eine Übersetzung (Sprachachse `translations`, BL-59) an ein PlaceObject an — z. B.
 * `{ lang: 'pl', value: 'Wrocław' }`. Reine Kopie (Aufrufer speichert über
 * savePlaceObject()). Leerer Wert wird ignoriert; das Sprachkürzel wird getrimmt/klein
 * geschrieben (ISO-639-Konvention, tolerant). Das Feld ist app-privat und speist NIE den
 * PLAC-Wire (analog `shortName`/`withAddedPname` ohne Dedup — Nutzer-Intent bleibt).
 * `pl.translations ?? []` toleriert alte, aus einer feldlosen orte.json geladene Orte.
 */
export function withAddedTranslation(pl: PlaceObject, lang: string, value: string): PlaceObject {
  if (!value.trim()) return pl;
  const entry: NameTranslation = { lang: lang.trim().toLowerCase(), value: value.trim() };
  return { ...pl, translations: [...(pl.translations ?? []), entry] };
}

/** Entfernt eine Übersetzung am angegebenen Index (Sprachachse `translations`, BL-59). */
export function withRemovedTranslation(pl: PlaceObject, index: number): PlaceObject {
  return { ...pl, translations: (pl.translations ?? []).filter((_, i) => i !== index) };
}

/** Hängt eine enclosedBy-Zugehörigkeit (Verwaltungs-Zeitachse) an ein PlaceObject an. */
export function withAddedEnclosedBy(
  pl: PlaceObject,
  parentId: PlaceId,
  from: GrenzEingabe,
  to: GrenzEingabe,
): PlaceObject {
  if (!parentId) return pl;
  const entry: DatedRef = datiert({ placeId: parentId }, from, to);
  return { ...pl, enclosedBy: [...pl.enclosedBy, entry] };
}

/** Entfernt eine enclosedBy-Zugehörigkeit am angegebenen Index. */
export function withRemovedEnclosedBy(pl: PlaceObject, index: number): PlaceObject {
  return { ...pl, enclosedBy: pl.enclosedBy.filter((_, i) => i !== index) };
}

/**
 * Bearbeitet eine BESTEHENDE enclosedBy-Zugehörigkeit am angegebenen Index (ADR-v9-183).
 * Gleiche Bauform wie `withUpdatedPname`/`withUpdatedHofAddr`.
 *
 * Der Zeitraum ist hier nicht bloß Beschriftung, sondern Auswertungsgrundlage: er speist
 * `enclosureWinnerAsOf` (Spec 11 §5) und damit die periodengerechte PLAC-Projektion sowie
 * die Verwaltungsgeschichte im Steckbrief. Ein falsch getipptes Jahr war deshalb bisher
 * nur durch Entfernen + Neuanlegen zu korrigieren — mit Positionswechsel im Array.
 *
 * Kein Re-Resolve hier (wie bei allen `with…`-Kommandos): der Aufrufer speichert über
 * `savePlaceObject()`, der reguläre Lade-/Auflösungspfad rechnet die Zuordnung neu
 * (Spec 11 §4.1 — Re-Derivation ist die Persistenz). `parentId` leer lassen ist kein
 * Löschweg: dafür gibt es `withRemovedEnclosedBy`.
 */
export function withUpdatedEnclosedBy(
  pl: PlaceObject,
  index: number,
  parentId: PlaceId,
  from: GrenzEingabe,
  to: GrenzEingabe,
): PlaceObject {
  if (!parentId) return pl;
  if (index < 0 || index >= pl.enclosedBy.length) return pl;
  const entry: DatedRef = datiert({ placeId: parentId }, from, to);
  return { ...pl, enclosedBy: pl.enclosedBy.map((e, i) => (i === index ? entry : e)) };
}

/**
 * Hängt eine Adressvariante an ein bestehendes HofObject an (Formular-Pfad — NICHT
 * addHofVariant aus hof-id.ts, die ist für den Review-Workflow reserviert und dedupliziert
 * per Norm; hier: Nutzer bearbeitet das Hof-Formular direkt, explizite Werte gewinnen).
 */
export function withAddedHofAddr(
  hof: HofObject,
  value: string,
  from: GrenzEingabe,
  to: GrenzEingabe,
): HofObject {
  if (!value.trim()) return hof;
  const entry: DatedAddress = datiert({ value: value.trim() }, from, to);
  return { ...hof, addrs: [...hof.addrs, entry] };
}

/** Entfernt eine Adressvariante am angegebenen Index. */
export function withRemovedHofAddr(hof: HofObject, index: number): HofObject {
  return { ...hof, addrs: hof.addrs.filter((_, i) => i !== index) };
}

/**
 * Bearbeitet eine BESTEHENDE Adressvariante am angegebenen Index (Formular-Pfad —
 * u. a. der im Steckbrief angezeigte "Name" eines Hofes, `addrs[0].value`, den es sonst
 * nur per Löschen+Neu-Anhängen umbenennen ließe; das verlöre die Array-Position).
 * Ersetzt `addrs[index]` durch `{ value: value.trim(), from, to }` — gleiche Trim-Disziplin
 * wie `withAddedHofAddr`. No-Op-tolerant: leerer `value.trim()` oder Index außerhalb
 * `0..addrs.length-1` gibt `hof` unverändert zurück (kein Crash, kein stillschweigendes
 * Löschen). Reine, unveränderliche Funktion — mutiert weder `hof` noch das `addrs`-Array.
 *
 * `hof.id` bleibt UNVERÄNDERT: die Hof-`id` ist deterministisch aus der Adresse bei
 * ERSTANLAGE (Spec 11 §1, §6) und wird durch nachträgliche Edits nie neu berechnet
 * (analog `PlaceObject.title`, das sich ohne `id`-Neuberechnung ändern kann). Diese Funktion
 * ändert nur den Inhalt des Eintrags — kein Re-Resolve. Dass künftige Event-Zuordnungen gegen
 * `normHofAddr(a.value)` matchen (hof-registry.ts), ist bestehendes, gewolltes Verhalten
 * (Adressvarianten bestimmen ohnehin, wogegen gematcht wird) — keine Sorge dieser Funktion.
 */
export function withUpdatedHofAddr(
  hof: HofObject,
  index: number,
  value: string,
  from: GrenzEingabe,
  to: GrenzEingabe,
): HofObject {
  if (!value.trim()) return hof;
  if (index < 0 || index >= hof.addrs.length) return hof;
  const entry: DatedAddress = datiert({ value: value.trim() }, from, to);
  return { ...hof, addrs: hof.addrs.map((a, i) => (i === index ? entry : a)) };
}

/**
 * Kommando (Spec 20 §1.7 [K] "String→PlaceObject verknüpfen"): setzt `ev.placeId` auf
 * ein bestehendes PlaceObject UND reprojiziert `ev.place` sofort (Spec 11 §3 INV-PLACE,
 * ADR-v9-19 — Sofort-Reprojektion im Kommando). Die Reprojektion läuft an ZWEI Stellen,
 * die INV-PLACE gemeinsam garantieren: beim Laden (voller `resolveEvents()`-Pass) UND in
 * jedem `placeId`/`hofId`-setzenden Modell-Kommando (Spec 11 §4.1). Das ist reine
 * Kern-Logik (`buildPlacForGedcom`), INV-ARCH-1-konform — KEINE UI-/DOM-Referenz; die
 * Schale reicht nur den `PlaceContext` (Chokepoints, Spec 11 §5) herein.
 * Es gibt keinen Zwischenzustand, in dem `placeId` gesetzt, `ev.place` aber veraltet ist.
 * Mutiert das Event in-place (Event-Objekte werden von Person/Family referenziert,
 * analog core/model/integrity.ts-Kommandos, die ihre Owner-Objekte ebenfalls in-place
 * mutieren statt zu kopieren). Persistiert wird nur `placeId`, nie `ev.place` (Spec 11 §2).
 */
export function linkEventToPlace(ev: Event, placeId: PlaceId, ctx: PlaceContext): void {
  ev.placeId = placeId;
  const proj = buildPlacForGedcom(ev, eventSpanne(ev), ctx);
  if (proj != null) ev.place = proj;
}

/**
 * Kommando (ADR-v9-42, Spec 20 §1.7 [K] "String→HofObject verknüpfen"): setzt `ev.hofId`
 * auf ein bestehendes HofObject UND reprojiziert sofort (Spec 11 §3 INV-PLACE, ADR-v9-19).
 * Exakt analog `linkEventToPlace`, aber für den Hof-Pfad — es gibt keinen Zwischenzustand,
 * in dem `hofId` gesetzt, `ev.place`/`ev.addr` aber veraltet sind (der frühere Drift in
 * hof-review-actions.ts, „Reprojektion erst beim nächsten Laden", widersprach ADR-v9-19).
 *
 * Reprojiziert IDENTISCH zum `reproject()`-Wrapper in resolve.ts (Spec 11 §4.1):
 *   - `ev.place` = periodengerechte Projektion via `buildPlacForGedcom` (Hof-Adresse,
 *     Komma-geschützt via Konvention α, + Dorf-Hierarchie). Nur setzen wenn Projektion
 *     != null (fehlt das HofObject, bleibt der Rohstring — kein Overwrite mit null).
 *   - `ev.addr` NUR füllen wenn leer — der volle Hof-Adresswert (mit evtl. Komma) aus
 *     `resolveAddrAsOf`. Eine bereits gesetzte, explizite `ev.addr` bleibt byte-identisch
 *     (Wire-ADDR-Roundtrip, LP-1). ADDR trägt den vollen Wert; beim Re-Import findet
 *     Pfad B (ADDR-basiert) den Hof wieder.
 *
 * Reine Kern-Logik, INV-ARCH-1-konform — KEINE UI-/DOM-Referenz; die Schale reicht nur
 * den `PlaceContext` (Chokepoints, Spec 11 §5) herein. Mutiert das Event in-place
 * (analog `linkEventToPlace`). Persistiert wird nur `hofId`, nie `ev.place` (Spec 11 §2).
 */
export function linkEventToHof(ev: Event, hofId: HofId, ctx: PlaceContext): void {
  ev.hofId = hofId;
  // Zeitbezug wie im Zwilling `linkEventToPlace` darüber (ADR-v9-245) — die beiden
  // Sofort-Reprojektionen unterschieden sich hier, obwohl sie dieselbe Frage stellen.
  const bezug = eventSpanne(ev);
  const proj = buildPlacForGedcom(ev, bezug, ctx);
  if (proj != null) ev.place = proj;
  if (!ev.addr) {
    const a = ctx.hofs.resolveAddrAsOf(hofId, bezug);
    if (a) ev.addr = a;
  }
}

/**
 * Bearbeitbares Exemplar aus einer Entitäts-Map: klont beim ERSTEN Zugriff und schreibt
 * die Kopie zurück (Copy-on-Write, ADR-v9-92). Ohne diesen Schritt würden die Merges die
 * PlaceObject-/HofObject-OBJEKTE mutieren, die ein zurückgehaltener Undo-Snapshot noch
 * teilt — die Map-Kopie allein (`new Map(db.placeObjects)`) schützt nur die Map, nicht
 * ihre Werte. `thawed` hält fest, was in DIESEM Merge bereits aufgetaut wurde, damit
 * mehrfach berührte Objekte nicht mehrfach kopiert werden.
 */
function editableIn<K, V>(map: Map<K, V>, key: K, thawed: Set<K>): V | undefined {
  const current = map.get(key);
  if (current === undefined) return undefined;
  if (thawed.has(key)) return current;
  const copy = klonen(current, 'Kopie eines Orts-/Hof-Datensatzes zum Bearbeiten');
  map.set(key, copy);
  thawed.add(key);
  return copy;
}

/** Ergebnis eines Dorf-Merges — meldet den automatischen Hof-Nachlauf (§9.2, für UI-Toast). */
export interface MergeResult {
  /** Anzahl automatisch nachkonsolidierter Hof-Dubletten (Verlierer-Höfe) unter dem Gewinner-Dorf. */
  hofsMerged: number;
  /** Dorf, unter dem konsolidiert wurde (null, wenn nichts nachkonsolidiert wurde). */
  villageId: PlaceId | null;
  /**
   * Verlierer-Hof → Überlebender-Hof. Der Merge hängt `event.hofId` NICHT mehr selbst um
   * (das mutierte db-ansässige Ereignisse in-place und damit auch gehaltene Undo-
   * Snapshots, ADR-v9-92); stattdessen zieht der Aufrufer die Referenzen copy-on-write
   * nach (`mapAllEvents`). Leer, wenn kein Hof zusammengeführt wurde.
   */
  hofRemap: ReadonlyMap<HofId, HofId>;
  /**
   * Normalisierte Namen der zusammengeführten Gruppe (Titel + `pnames` aller Mitglieder,
   * VOR dem Merge gelesen) — die Ortsnennungen, die der Aufrufer an den Überlebenden
   * binden und auf dessen Kette umschreiben soll (ADR-v9-222).
   *
   * WOZU. Seit dem Merge nur noch der Gewinner überlebt (keine Namens-/Kettenfaltung
   * mehr), verliert der Bestand die Schreibweisen und Verwaltungsketten der Verlierer.
   * Ereignisse, die zum Merge-Zeitpunkt MEHRDEUTIG waren (Review-Klasse P, `placeId=null`,
   * also von `placeRemap` nicht erfasst), trügen ihren alten Text sonst unverändert weiter
   * — und der Seed des nächsten Ladepasses legte den Verlierer daraus neu an. Am
   * Realbestand: 14 von 129 zusammengeführten Orten kamen so zurück. Genau diese Nennungen
   * löst der Merge auf, indem der Aufrufer sie an den Überlebenden bindet.
   *
   * LEER, wenn nach dem Merge noch ein gleichnamiger Ort AUSSERHALB der Gruppe steht (etwa
   * weil der Nutzer im Dialog nur einen Teil der Gruppe ausgewählt hat, §9.2): dann ist die
   * Mehrdeutigkeit echt und keine Nennung darf still gebunden werden.
   */
  mentionNames: string[];
  /**
   * Verlierer-Ort → Überlebender-Ort, exakt in der Rolle von `hofRemap` (ADR-v9-195).
   * Bis dahin fasste der Merge `event.placeId` gar nicht an, mit der Begründung, das Feld
   * sei runtime-only und werde „beim nächsten `resolveEvents()` neu abgeleitet". Beide
   * Hälften der Annahme trugen nicht: in der laufenden Sitzung zeigt die Referenz auf eine
   * gelöschte ID (sichtbar als „Ort nicht gefunden" am Ereignis-Link, und die Ereignisse
   * fehlen im Steckbrief des Überlebenden), und der nächste Ladepass holte sie nicht heim,
   * sondern warf sie in Review-Klasse P (s. `resolve.ts::chainCompatible`, im selben ADR
   * behoben). Enthält nur tatsächlich zusammengeführte Orte — Selbst-Merge und fehlende
   * IDs stehen nicht drin.
   */
  placeRemap: ReadonlyMap<PlaceId, PlaceId>;
}

/**
 * Kommando: Dubletten-Merge (Spec 20 §1.7 [K], §9.2 Punkt 2). Führt ein ODER mehrere
 * PlaceObjects (`mergedIds`) in `survivorId` zusammen und entfernt sie. Dünner Wrapper über
 * die paarweise Merge-Logik (`mergePlaceObjectPair`) — keine Duplizierung.
 *
 * **Der Gewinner bleibt der Gewinner (ADR-v9-222).** Er erbt weder Namen noch Ketten noch
 * Existenzspanne der Verlierer; beschreibende Felder werden nur gefüllt, wo er leer ist.
 * Was die Verlierer an Identität trugen, gibt die Rückgabe als `mentionNames` weiter —
 * der Aufrufer bindet die betroffenen Ortsnennungen an den Überlebenden und schreibt sie
 * auf dessen Kette um (dieselbe Arbeitsteilung wie bei `placeRemap`/`hofRemap`).
 *
 * Anschließend läuft der **automatische, verlustfreie Hof-Nachlauf** (ADR-v9-45 Nachtrag
 * 2026-07-10, Schritt 6/7): sind durch die `HofObjects.villageId`-Umhängung Höfe mit identischer
 * normalisierter Adresse unter dem Gewinner-Dorf entstanden, werden sie automatisch per
 * `mergeHofObjects` konsolidiert (Gewinner-Heuristik: Verwendungszahl → Koordinaten → Notiz →
 * kleinste ID). Grund: `hof-registry.ts::findByAddr` liefert bei ≥2 Kandidaten `null` (strikt
 * eindeutig — sonst Review-Klasse C); ohne den Nachlauf kippten zuvor eindeutig auflösbare
 * Events beim nächsten Reload auf „mehrdeutig" — eine echte Resolver-Regression. Der Nachlauf
 * braucht KEINE neue Nutzer-Entscheidung: `(villageId, norm. Adresse)` ist bereits die
 * strukturelle Hof-Identität (§4.4), die der Nutzer mit „Dorf A = Dorf B" schon bestätigt hat.
 *
 * `events` dient NUR der Verwendungszahl-Heuristik (rein, kein I/O) — bleibt eine reine
 * Funktion (INV-ARCH-1/2) und wird NICHT mutiert. `event.hofId`-Referenzen auf einen
 * konsolidierten Verlierer-Hof meldet die Rückgabe als `hofRemap`; der Aufrufer zieht sie
 * copy-on-write nach (ADR-v9-92 — früher geschah das hier per In-Place-Mutation, was in
 * gehaltene Undo-Snapshots schrieb). Rückgabe meldet außerdem den Nachlauf für den
 * UI-Toast. No-Op-tolerant (gleiche/fehlende IDs werden übersprungen).
 */
export function mergePlaceObjects(
  places: PlaceObjects,
  hofObjects: HofObjects,
  survivorId: PlaceId,
  mergedIds: PlaceId | readonly PlaceId[],
  events: readonly Event[] = [],
): MergeResult {
  const losers = Array.isArray(mergedIds) ? mergedIds : [mergedIds as PlaceId];
  // Die Namen der Gruppe VOR dem Merge einsammeln — danach sind die Verlierer weg und
  // ihre Schreibweisen mit ihnen (ADR-v9-222).
  const mentionNames = new Set<string>();
  for (const id of [survivorId, ...losers]) {
    const po = places.get(id);
    if (!po) continue;
    for (const name of [po.title, ...po.pnames.map((p) => p.value)]) {
      const k = normPlaceName(name);
      if (k) mentionNames.add(k);
    }
  }

  const thawedPlaces = new Set<PlaceId>();
  const thawedHofs = new Set<HofId>();
  const placeRemap = new Map<PlaceId, PlaceId>();
  for (const mergedId of losers) {
    mergePlaceObjectPair(places, hofObjects, survivorId, mergedId, thawedPlaces, thawedHofs, placeRemap);
  }

  // Steht noch ein gleichnamiger Ort außerhalb der Gruppe? Dann ist die Mehrdeutigkeit
  // echt (Teil-Auswahl im Dialog, §9.2) und keine Nennung darf gebunden werden.
  const fremdGleichnamig = [...places.values()].some(
    (po) =>
      po.id !== survivorId &&
      [po.title, ...po.pnames.map((p) => p.value)].some((n) => mentionNames.has(normPlaceName(n))),
  );

  const hofRemap = new Map<HofId, HofId>();
  const hofsMerged = reconcileHofsUnderVillage(hofObjects, survivorId, events, thawedHofs, hofRemap);
  return {
    hofsMerged,
    villageId: hofsMerged > 0 ? survivorId : null,
    hofRemap,
    placeRemap,
    mentionNames: fremdGleichnamig || placeRemap.size === 0 ? [] : [...mentionNames],
  };
}

/**
 * Identität eines `enclosedBy`-Eintrags für die Dedup-Prüfung: derselbe Elter zur selben
 * Periode. EINE Definition für den Vereinigungs-Schritt und das Umhängen (ADR-v9-195) —
 * zwei Kopien wären zwei Gelegenheiten zum Auseinanderlaufen.
 */
const encKey = (e: DatedRef): string => `${e.placeId}|${e.from}|${e.to}`;

/**
 * Paarweiser Orts-Merge (interne Kern-Logik, §9.2 Punkt 2). Seit ADR-v9-222 überlebt der
 * Gewinner mit SEINEN Angaben: Namen (`title`/`pnames`), Zugehörigkeiten (`enclosedBy`) und
 * Existenzspanne des Verlierers fallen weg; beschreibende Felder werden nur gefüllt, wo der
 * Gewinner leer ist. Alle Fremd-Referenzen (andere
 * `PlaceObjects.enclosedBy`, `HofObjects.villageId`) werden umgehängt. `event.placeId` wird nicht
 * mutiert, sondern über `remap` GEMELDET — der Aufrufer zieht die Referenzen copy-on-write
 * nach (ADR-v9-195, dieselbe Arbeitsteilung wie beim Hof-Merge, ADR-v9-92).
 * No-Op bei gleicher ID oder fehlendem Ort. Der Hof-Nachlauf läuft NICHT hier, sondern einmal
 * im Wrapper `mergePlaceObjects` (nach allen Verlierern).
 */
function mergePlaceObjectPair(
  places: PlaceObjects,
  hofObjects: HofObjects,
  survivorId: PlaceId,
  mergedId: PlaceId,
  thawedPlaces: Set<PlaceId>,
  thawedHofs: Set<HofId>,
  remap: Map<PlaceId, PlaceId>,
): void {
  if (survivorId === mergedId) return;
  // Der Überlebende wird geändert → bearbeitbares Exemplar (Copy-on-Write, ADR-v9-92).
  // `merged` wird nur gelesen und am Ende entfernt — kein Auftauen nötig.
  const survivor = editableIn(places, survivorId, thawedPlaces);
  const merged = places.get(mergedId);
  if (!survivor || !merged) return;

  // 1./2. KEINE Namens- und KEINE Zugehörigkeits-Faltung mehr (ADR-v9-222). Titel, `pnames`
  //    und `enclosedBy` des Verlierers fallen mit ihm weg — es sind genau die Felder, über
  //    die der Resolver Identität entscheidet, und in der Vereinigung machten sie den
  //    Überlebenden zu einem Ort mit mehreren gleichzeitig gültigen, undatierten
  //    Verwaltungsketten (am Realbestand: „Steinwedel" zugleich unter Fürstentum Lüneburg,
  //    Kurfürstentum Braunschweig-Lüneburg, Kurfürstentum Hannover und Département de
  //    l'Aller). Das Wissen geht nicht verloren, es wechselt den Ort: die betroffenen
  //    Ortsnennungen werden auf die Kette des Überlebenden umgeschrieben (`mentionNames`,
  //    s. MergeResult) — dort, wo der Nutzer sie liest, statt als Altlast am Objekt.
  //    Ebenso NICHT geerbt: `existsFrom`/`existsTo` — die Lebensspanne eines anderen
  //    Eintrags datiert nicht den Überlebenden.

  // 3. Fehlende Metadaten des Überlebenden aus dem Merged füllen (nie überschreiben) —
  //    beschreibende Felder ohne Einfluss auf die Identitätsauflösung, jedes höchstens
  //    EINMAL vorhanden. Sie können den Überlebenden nicht „zumüllen": entweder er hat
  //    den Wert schon (dann passiert nichts), oder die Lücke wird geschlossen.
  if (!survivor.type && merged.type) survivor.type = merged.type;
  if (survivor.lat == null && merged.lat != null) survivor.lat = merged.lat;
  if (survivor.long == null && merged.long != null) survivor.long = merged.long;
  // Notiz: fill-if-empty wie der Rest — die frühere `\n`-Verkettung war die einzige Stelle,
  // an der ein Feld beim Merge WUCHS statt gefüllt zu werden.
  if (!survivor.note) survivor.note = merged.note;
  if (!survivor.shortName && merged.shortName) survivor.shortName = merged.shortName;
  // translations (Sprachachse, BL-59): ebenfalls fill-if-empty statt Union — eine Liste,
  // die bei jedem Merge wächst, ist dasselbe Zumüllen wie bei `pnames`, auch wenn sie den
  // Resolver nicht beeinflusst.
  if ((survivor.translations ?? []).length === 0 && (merged.translations ?? []).length > 0) {
    survivor.translations = (merged.translations ?? []).map((t) => ({ ...t }));
  }
  if (!survivor.govId && merged.govId) survivor.govId = merged.govId;
  if (!survivor.govTypes && merged.govTypes) survivor.govTypes = merged.govTypes;
  // `reviewedAt` folgt BEWUSST NICHT dem fill-if-empty-Muster der Metadaten darüber
  // (ADR-v9-191): der Marker ist keine Eigenschaft des Inhalts, sondern eine Aussage über
  // einen Menschen. Ihn vom Verlierer zu erben hieße, dem Überlebenden eine Prüfung
  // zuzuschreiben, die nie an ihm stattfand — und der Merge wäre der automatische Pfad, den
  // es für dieses Feld nicht geben darf. Der Überlebende behält seinen eigenen Stand; wer
  // das Ergebnis für geprüft hält, sagt es mit einem Klick (der Dedup-Dialog zeigt den
  // Marker je Mitglied, BL-267).

  // 4. Fremd-Referenzen umhängen: andere PlaceObjects.enclosedBy, die auf mergedId zeigen.
  //    Erst prüfen (auf dem geteilten Objekt), dann NUR die Treffer auftauen — sonst wäre
  //    jeder Merge eine Tiefkopie aller Orte.
  //
  //    ZWEI Fälle, die ein naives Umhängen kaputtmacht (ADR-v9-195):
  //    (a) Das Ziel IST der Überlebende — er war unter dem Verlierer eingeordnet (Merge
  //        eines Ortes in sein eigenes Kind) oder hat den Verweis in Schritt 2 von einem
  //        früheren Verlierer derselben Gruppe geerbt. Umhängen ergäbe „Ort enthält sich
  //        selbst": ein Zustand, der in orte.json persistiert und jede Kette still an
  //        Ort und Stelle enden lässt (`enclosureIdsAsOf` bricht per `seen`-Guard ab).
  //        Der Verweis fällt deshalb ersatzlos weg — die Zugehörigkeit „zu sich selbst"
  //        trägt keine Information, es geht nichts verloren (LP-1 unberührt).
  //    (b) Das Ziel zeigt bereits auf den Überlebenden — dann entstünde durch das Umhängen
  //        ein exaktes Duplikat. Dedupliziert wird über dasselbe `{placeId, from, to}`-
  //        Tripel wie in Schritt 2 (eine Regel, nicht zwei).
  for (const id of [...places.keys()]) {
    if (id === mergedId) continue;
    const pl = places.get(id)!;
    if (!pl.enclosedBy.some((e) => e.placeId === mergedId)) continue;
    const target = editableIn(places, id, thawedPlaces)!;
    const seenEnc = new Set<string>();
    target.enclosedBy = target.enclosedBy
      .map((e) => (e.placeId === mergedId ? { ...e, placeId: survivorId } : e))
      .filter((e) => {
        if (e.placeId === id) return false; // (a) Selbstbezug
        const k = encKey(e);
        if (seenEnc.has(k)) return false; // (b) Duplikat
        seenEnc.add(k);
        return true;
      });
  }
  // 5. HofObjects.villageId umhängen (gleiches Muster: prüfen, dann nur Treffer auftauen).
  for (const id of [...hofObjects.keys()]) {
    if (hofObjects.get(id)!.villageId !== mergedId) continue;
    editableIn(hofObjects, id, thawedHofs)!.villageId = survivorId;
  }

  // 6. Zusammengeführten Ort entfernen und die Umhängung melden (ADR-v9-195). Der Eintrag
  //    entsteht erst HIER — nach allen Guards oben —, damit nur tatsächlich zusammengeführte
  //    Orte gemeldet werden (Selbst-Merge und fehlende IDs sind vorher schon returniert).
  places.delete(mergedId);
  remap.set(mergedId, survivorId);
}

/**
 * Kommando: verlustfreier Hof-Merge (Spec 11 §9.2). Führt ein ODER mehrere HofObjects
 * (`mergedIds`) in `survivorId` zusammen und entfernt sie. VERLUSTFREI, analog zum Orts-Merge:
 * `addrs`-Historie vereinigt (dedupliziert über die Norm-Form, Konvention α); fehlende
 * Koordinaten/Notiz/Existenz-Spanne/Lebenszyklus-Verweise/GOV des Überlebenden werden gefüllt
 * (nie überschrieben); `event.hofId`-Referenzen der Verlierer werden für die Session-Konsistenz
 * auf `survivorId` umgehängt (persistiert wird `hofId` nie, Spec 11 §2 — beim nächsten Load
 * ohnehin neu abgeleitet). Mutiert `hofs` in place. No-Op bei gleicher/fehlender ID.
 */
export function mergeHofObjects(
  hofs: HofObjects,
  survivorId: HofId,
  mergedIds: HofId | readonly HofId[],
  thawed: Set<HofId> = new Set(),
  remap: Map<HofId, HofId> = new Map(),
): ReadonlyMap<HofId, HofId> {
  const losers = Array.isArray(mergedIds) ? mergedIds : [mergedIds as HofId];
  // Bearbeitbares Exemplar (Copy-on-Write, ADR-v9-92) — der Überlebende wird verändert.
  const survivor = editableIn(hofs, survivorId, thawed);
  if (!survivor) return remap;
  const loserSet = new Set(losers);

  for (const mergedId of losers) {
    if (mergedId === survivorId) continue;
    const merged = hofs.get(mergedId);
    if (!merged) continue;

    // 1. addrs vereinigen (dedupliziert über die Norm-Form — Nutzer-/Quellen-Varianten bleiben).
    const seen = new Set(survivor.addrs.map((a) => normHofAddr(a.value)));
    for (const a of merged.addrs) {
      const k = normHofAddr(a.value);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      survivor.addrs.push({ ...a });
    }

    // 2. Fehlende Metadaten des Überlebenden aus dem Merged füllen (nie überschreiben).
    if (survivor.lat == null && merged.lat != null) survivor.lat = merged.lat;
    if (survivor.long == null && merged.long != null) survivor.long = merged.long;
    if (!survivor.note) survivor.note = merged.note;
    else if (merged.note && merged.note !== survivor.note) survivor.note = `${survivor.note}\n${merged.note}`;
    if (survivor.existsFrom == null) survivor.existsFrom = merged.existsFrom;
    if (survivor.existsTo == null) survivor.existsTo = merged.existsTo;
    // Lebenszyklus nur adoptieren, wenn er nicht auf den Überlebenden/einen Verlierer zeigt.
    if (survivor.predecessor == null && merged.predecessor != null
      && merged.predecessor !== survivorId && !loserSet.has(merged.predecessor)) {
      survivor.predecessor = merged.predecessor;
    }
    if (survivor.successor == null && merged.successor != null
      && merged.successor !== survivorId && !loserSet.has(merged.successor)) {
      survivor.successor = merged.successor;
    }
    if (!survivor.govId && merged.govId) survivor.govId = merged.govId;
    if (!survivor.govTypes && merged.govTypes) survivor.govTypes = merged.govTypes;

    // 3. Umhängung MELDEN statt ausführen: `event.hofId` zeigt auf einen Hof, der gleich
    //    verschwindet — der Aufrufer zieht das copy-on-write nach (ADR-v9-92). Bereits
    //    eingetragene Ziele mitziehen, falls in derselben Runde weitergemergt wird.
    remap.set(mergedId, survivorId);
    for (const [loser, target] of remap) {
      if (target === mergedId) remap.set(loser, survivorId);
    }

    // 4. Verlierer entfernen.
    hofs.delete(mergedId);
  }
  return remap;
}

/**
 * Gewinner-Heuristik (ADR-v9-45, wie v8 `_pickFarmWinner`): Verwendungszahl im Baum →
 * hat Koordinaten → hat Notiz → kleinste ID (deterministisch). Verwendung = Events mit
 * `ev.hofId === id` (der aufgelöste/gesetzte Link; `eventHofId` bräuchte einen Kontext,
 * die runtime-gesetzte `hofId` genügt und hält die Funktion kontextfrei).
 */
function pickHofWinner(ids: readonly HofId[], hofs: HofObjects, events: readonly Event[]): HofId {
  const usage = new Map<HofId, number>(ids.map((id) => [id, 0]));
  for (const ev of events) {
    if (ev.hofId != null && usage.has(ev.hofId)) usage.set(ev.hofId, usage.get(ev.hofId)! + 1);
  }
  return ids
    .slice()
    .sort((a, b) => {
      const ua = usage.get(a) ?? 0;
      const ub = usage.get(b) ?? 0;
      if (ub !== ua) return ub - ua;
      const ha = hofs.get(a);
      const hb = hofs.get(b);
      const ca = ha && ha.lat != null ? 1 : 0;
      const cb = hb && hb.lat != null ? 1 : 0;
      if (cb !== ca) return cb - ca;
      const na = ha && ha.note ? 1 : 0;
      const nb = hb && hb.note ? 1 : 0;
      if (nb !== na) return nb - na;
      return String(a).localeCompare(String(b));
    })[0];
}

/**
 * Automatischer Hof-Nachlauf nach Dorf-Merge (ADR-v9-45 Nachtrag). Gruppiert die Höfe unter
 * `villageId` per Union-Find über gemeinsame normalisierte Adress-Schlüssel (exakt die
 * Bedingung, unter der `findByAddr` mehrdeutig würde) und konsolidiert jede Gruppe ≥2
 * verlustfrei via `mergeHofObjects`. Gibt die Anzahl zusammengeführter Verlierer-Höfe zurück.
 */
function reconcileHofsUnderVillage(
  hofs: HofObjects,
  villageId: PlaceId,
  events: readonly Event[],
  thawed: Set<HofId>,
  remap: Map<HofId, HofId>,
): number {
  const inVillage = [...hofs.values()].filter((h) => h.villageId === villageId);
  if (inVillage.length < 2) return 0;

  const parent = new Map<HofId, HofId>();
  for (const h of inVillage) parent.set(h.id, h.id);
  const find = (x: HofId): HofId => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const union = (a: HofId, b: HofId): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const byKey = new Map<string, HofId[]>();
  for (const h of inVillage) {
    const seen = new Set<string>();
    for (const a of h.addrs) {
      const k = normHofAddr(a.value);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const arr = byKey.get(k);
      if (arr) arr.push(h.id);
      else byKey.set(k, [h.id]);
    }
  }
  for (const ids of byKey.values()) for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);

  const clusters = new Map<HofId, HofId[]>();
  for (const h of inVillage) {
    const root = find(h.id);
    const arr = clusters.get(root);
    if (arr) arr.push(h.id);
    else clusters.set(root, [h.id]);
  }

  let merged = 0;
  for (const ids of clusters.values()) {
    if (ids.length < 2) continue;
    const winner = pickHofWinner(ids, hofs, events);
    const clusterLosers = ids.filter((x) => x !== winner);
    mergeHofObjects(hofs, winner, clusterLosers, thawed, remap);
    merged += clusterLosers.length;
  }
  return merged;
}

/** Ergebnis eines Hof-Umzugs in ein anderes Dorf (BL-236/OE-12, ADR-v9-172). */
export interface MoveHofResult {
  /** Id, unter der der Hof danach lebt — bei Kollision im Zieldorf die des Überlebenden. */
  hofId: HofId;
  /** Umgehängte `event.hofId`-Referenzen (leer, wenn nichts konsolidiert wurde). */
  remap: ReadonlyMap<HofId, HofId>;
  /** Zahl der beim Umzug automatisch zusammengeführten Verlierer-Höfe. */
  merged: number;
}

/**
 * Hängt einen Hof an ein anderes Dorf (Spec 11 §1: `villageId` ist Pflicht-FK und Teil der
 * Hof-Identität `(villageId, normalisierte Adresse)`).
 *
 * WARUM DAS MEHR IST ALS EIN FELD-SETZER — zwei Nachläufe, beide mit Präzedenz:
 *
 * 1. **Kollision im Zieldorf.** Trägt dort bereits ein Hof dieselbe normalisierte Adresse,
 *    entstünden zwei Höfe mit identischer Identität; `hof-registry.ts::findByAddr` liefert
 *    bei ≥2 Kandidaten `null`, und zuvor eindeutige Ereignisse kippten in Review-Klasse C
 *    (§6). Das ist exakt die Regression, die ADR-v9-45s Nachtrag für den Dorf-Merge
 *    beschreibt — und dieselbe Antwort gilt: `(villageId, Adresse)` IST die Identität, der
 *    Nutzer hat mit dem Umzug bereits entschieden, dass der Hof dorthin gehört. Also
 *    konsolidiert derselbe, verlustfreie Nachlauf (`reconcileHofsUnderVillage`), statt eine
 *    zweite Nutzer-Entscheidung zu verlangen.
 * 2. **Die Id bleibt.** `_hof_<addr>_<village>` trägt das Dorf im Namen, wird aber NIRGENDS
 *    geparst (am Code geprüft) — sie ist ein Schlüssel, kein Datum. Sie mitzuwandern hieße,
 *    jede `event.hofId`-Referenz umzuhängen, ohne dass irgendwer davon profitiert; der
 *    Merge lässt die Gewinner-Id aus demselben Grund stehen.
 *
 * Der dritte Nachlauf liegt NICHT hier, sondern in `services/places` (`relinkHofVillageInEvents`):
 * die `event.placeId`-Dorfanker referenzierender Ereignisse. Dieses Modul kennt keine
 * Ereignisse (INV-ARCH-1) — `events` dient allein der Gewinner-Heuristik.
 *
 * Mutiert `hofs` in place (Copy-on-Write je berührtem Objekt). No-Op, wenn der Hof fehlt
 * oder bereits an diesem Dorf hängt.
 */
export function moveHofToVillage(
  hofs: HofObjects,
  hofId: HofId,
  villageId: PlaceId,
  events: readonly Event[] = [],
): MoveHofResult {
  const remap = new Map<HofId, HofId>();
  const current = hofs.get(hofId);
  if (!current || !villageId || current.villageId === villageId) return { hofId, remap, merged: 0 };

  const thawed = new Set<HofId>();
  editableIn(hofs, hofId, thawed)!.villageId = villageId;

  const merged = reconcileHofsUnderVillage(hofs, villageId, events, thawed, remap);
  // Wurde der umgezogene Hof selbst zum Verlierer, lebt er ab jetzt unter der Gewinner-Id.
  return { hofId: remap.get(hofId) ?? hofId, remap, merged };
}
