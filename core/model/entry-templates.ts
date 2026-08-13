// core/model/entry-templates.ts — Erfassungs-Vorlagen: Modell + die drei mitgelieferten
// Standard-Vorlagen (Spec 20 §2 „Erfassungs-Vorlagen", ADR-v9-264, BL-232).
//
// Eine Vorlage beschreibt einen wiederkehrenden Quellen-Eintrag (ein Trauregister-Eintrag,
// ein Taufeintrag) und legt daraus in EINEM Zug mehrere zusammenhängende Personen und
// Familien an. Angewandt wird sie von `applyEntryTemplate` (apply-entry-template.ts);
// hier stehen nur Form und Daten.
//
// BEWUSST IM KERN, genau wie `source-templates.ts`: der laufende Bestand an Vorlagen wohnt
// im B1-Bündel (`services/app-data/`, Spec 30 §2.2). INV-ARCH-1 erlaubt `services/` den
// Griff nach `core/`, nicht umgekehrt — also muss der Typ hier liegen, damit der Abschnitt
// ihn importieren kann statt ihn ein zweites Mal zu deklarieren.
//
// DIE ENTSCHEIDUNG, DIE DIESE DATEI TRÄGT (ADR-v9-264 Entscheidung 1): das Feld-Vokabular
// IST das Modell. v8 (`legacy-v8/ui-quicktpl.js`) führte daneben eine eigene Liste
// (`QT_FIELD_TYPES` × `QT_TARGETS`, Z. 73–81) — neun Feldtypen und fünf Ziele, aus denen
// der Builder Kombinationen anbot, die der Speicher-Pfad nicht kannte (`place` + Ziel
// `marr` fiel kommentarlos durch die Whitelist, Z. 1051). Hier gibt es keine zweite Liste:
// `IDENTITY_FIELDS` und `EVENT_FIELDS` sind per `satisfies` an `keyof Person`/`keyof Event`
// gebunden, ein Feldname, den das Modell nicht (mehr) hat, bricht den Compiler.
//
// Verhaltens-Orakel für die FACHLICHE Feldauswahl der drei Standard-Vorlagen:
// `legacy-v8/ui-quicktpl.js` Z. 13–62 (`QT_BASE_PATTERNS`). Übernommen ist die Auswahl,
// NICHT die Form: v8 hielt dafür einen zweiten Rollenraum (`h`/`w`/`p` gegen
// `main`/`father`/`mother`/`spouse`, Z. 14–72) und drei handgeschriebene Save-Funktionen.
// Das Feld „Seite / Eintrag" fehlt hier folgerichtig — es ist die Zitation, kein Modellfeld
// (ADR-v9-264 E1); es lebt im Entwurf (`EntryTemplateDraft.page`).
import type { Event, Person, Quay, SourceId, Source } from './types';

// --- Rollen (ADR-v9-264 E2) -----------------------------------------------------------

/**
 * Die sechs Personen-Rollen — sie tragen Identitäts- UND Personen-Ereignis-Felder.
 *
 * `spouseFather`/`spouseMother` sind die symmetrische Ergänzung zu `father`/`mother`
 * (ADR-v9-268 E1). Der Anlass ist die Quelle selbst: ein Trauregister-Eintrag nennt in
 * aller Regel BEIDE Elternpaare — ohne diese Rollen bildet die Vorlage genau den Eintrag
 * nicht ab, für den sie gemacht ist.
 */
export const ENTRY_PERSON_ROLES = [
  'main',
  'father',
  'mother',
  'spouse',
  'spouseFather',
  'spouseMother',
] as const;
export type EntryPersonRole = (typeof ENTRY_PERSON_ROLES)[number];

/** Die drei Familien-Rollen: `parentFamily` = FAMC von `main`, `spouseParentFamily` = FAMC
 *  von `spouse`, `spouseFamily` = FAMS von `main`+`spouse`. Sie tragen AUSSCHLIESSLICH
 *  Familien-Ereignis-Felder. */
export const ENTRY_FAMILY_ROLES = ['parentFamily', 'spouseParentFamily', 'spouseFamily'] as const;
export type EntryFamilyRole = (typeof ENTRY_FAMILY_ROLES)[number];

export type EntryRole = EntryPersonRole | EntryFamilyRole;

export function isFamilyRole(role: string): role is EntryFamilyRole {
  return (ENTRY_FAMILY_ROLES as readonly string[]).includes(role);
}

// --- Feldnamen: die des Modells, keine zweite Liste (ADR-v9-264 E1) --------------------

/** Identitätsfelder. `satisfies keyof Person` ist der Punkt: eine Umbenennung im Modell
 *  bricht hier, statt eine tote Vorlage zu hinterlassen. */
export const IDENTITY_FIELDS = ['given', 'surname', 'sex'] as const satisfies readonly (keyof Person)[];
export type IdentityFieldName = (typeof IDENTITY_FIELDS)[number];

/** Ereignisfelder (Spec 10 §5.1). Ebenfalls compiler-gebunden — an `keyof Event`. */
export const EVENT_FIELDS = ['date', 'place', 'addr', 'value', 'note'] as const satisfies readonly (keyof Event)[];
export type EventFieldName = (typeof EVENT_FIELDS)[number];

/**
 * Die Ereignistypen, die eine FAMILIEN-Rolle tragen darf (ADR-v9-264 E2: „nur
 * Familien-Ereignis-Slots (MARR/ENGA)"). Bewusst geschlossen: Beruf oder Wohnort an einer
 * Familie wären genau die Ziel-Verwechslung, die v8s `QT_TARGETS` erlaubte.
 *
 * Personen-Rollen sind dagegen NICHT eingeschränkt — ihr Tag ist ein freier GEDCOM-Tag
 * (die deutschen Labels liegen in `ui/shell/event-labels.ts`; der Kern kennt sie nicht und
 * darf sie nach INV-ARCH-1 auch nicht kennen, er speichert nur den Tag).
 */
export const FAMILY_EVENT_TAGS = ['MARR', 'ENGA'] as const;
export type FamilyEventTag = (typeof FAMILY_EVENT_TAGS)[number];

// --- Slots (ADR-v9-264 E1/E3) ---------------------------------------------------------

/** `hidden` = der Wert wird übernommen, ohne ein Feld zu zeigen; `locked` = sichtbar und
 *  `readonly` (ADR-v9-264 E3: gesperrt heißt gesperrt, nicht „Schloss-Icon daneben"). */
export type PrefillMode = 'hidden' | 'locked';

/**
 * Vorbelegung JE SLOT. Als Paar-Union statt zweier unabhängiger optionaler Felder: ein
 * `prefillMode` ohne Wert wäre eine Anzeige-Anweisung über nichts, ein `prefill` ohne
 * Modus eine Vorbelegung ohne Aussage darüber, ob der Nutzer sie sehen soll. Der Compiler
 * stellt die Frage, nicht ein Kommentar.
 */
type SlotPrefill =
  | { prefill?: undefined; prefillMode?: undefined }
  | { prefill: string; prefillMode: PrefillMode };

/** Identitätsfeld an einer Personen-Rolle — trägt KEINEN Ereignistyp. */
export type IdentitySlot = { role: EntryPersonRole; field: IdentityFieldName } & SlotPrefill;

/** Ereignisfeld an einer Personen-Rolle. `event` ist der GEDCOM-Tag (BIRT/CHR/OCCU/…). */
export type PersonEventSlot = {
  role: EntryPersonRole;
  field: EventFieldName;
  event: string;
} & SlotPrefill;

/** Ereignisfeld an einer Familien-Rolle — nur MARR/ENGA (s. `FAMILY_EVENT_TAGS`). */
export type FamilyEventSlot = {
  role: EntryFamilyRole;
  field: EventFieldName;
  event: FamilyEventTag;
} & SlotPrefill;

/**
 * Ein Feld einer Vorlage, adressiert als `(Rolle, Feldname[, Ereignistyp])`.
 *
 * Die Union erzwingt die Semantik aus ADR-v9-264 E2, soweit TypeScript das kann: an einer
 * Familien-Rolle gibt es kein `given`, und ein Identitätsfeld hat keinen Ereignistyp —
 * beides ist ein Typfehler, nicht eine Laufzeit-Whitelist wie in v8.
 */
export type EntrySlot = IdentitySlot | PersonEventSlot | FamilyEventSlot;

/** Trägt der Slot einen Ereignistyp (und schreibt damit in ein `Event`)? */
export function isEventSlot(slot: EntrySlot): slot is PersonEventSlot | FamilyEventSlot {
  return 'event' in slot && typeof slot.event === 'string';
}

/** Das Gegenstück — ein Identitätsfeld an einer Personen-Rolle. Zwei Wächter statt eines
 *  `as`-Casts auf der Gegenseite: die Union ist eine Schnittmenge mit `SlotPrefill` und
 *  lässt sich per `Exclude` nicht sauber auflösen. */
export function isIdentitySlot(slot: EntrySlot): slot is IdentitySlot {
  return !isEventSlot(slot);
}

/**
 * Die stabile Adresse eines Slots — der Schlüssel, unter dem der Entwurf seinen Wert hält
 * (`EntryTemplateDraft.values`) und unter dem die Erfassungs-Fläche ihr Feld bindet.
 * `main.given` bzw. `main.CHR.date`.
 */
export function slotKey(slot: EntrySlot): string {
  return isEventSlot(slot) ? `${slot.role}.${slot.event}.${slot.field}` : `${slot.role}.${slot.field}`;
}

// --- Quellen-Vorbelegung mit Fingerabdruck (ADR-v9-264 E7) ----------------------------

/**
 * Optionale Quellen-Vorbelegung einer Vorlage. `sourceId` ist eine DATEI-LOKALE
 * GEDCOM-Id; die Vorlage reist aber im B1-Bündel über Geräte und Bestände (Spec 30 §2.3).
 * Deshalb führt sie einen Fingerabdruck mit und wird beim Anwenden am Referenten geprüft —
 * exakt der Mechanismus, den ADR-v9-176 für die Projekt-Scopes festgelegt hat
 * (`resolveScopePersonRef`, core/research/project.ts). Passt sie nicht, ist sie
 * WIRKUNGSLOS statt falsch.
 */
export interface EntrySourcePrefill {
  sourceId: SourceId;
  /** Fingerabdruck: `Source.abbr` (Kurzname) der gemeinten Quelle. */
  abbr: string;
  /** Fingerabdruck: `Source.title` — entscheidet nur, wenn beide Seiten ihn kennen. */
  title: string;
  /** Vorbelegung für `Citation.quay`; `null` = keine Bewertung. */
  quay: Quay | null;
  /** Muster für das Seitenfeld der Zitation (`Nr. […]`) — Startwert, frei überschreibbar. */
  pagePattern: string;
  /** Muster für den Weblink der Zitation. */
  urlPattern: string;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Löst die Quellen-Vorbelegung **am Referenten** auf: an derjenigen Quelle, die im
 * AKTUELLEN Bestand unter `prefill.sourceId` steht (`db.sources.get(id)`, oder `undefined`,
 * wenn es die Id dort nicht gibt).
 *
 * `null` heißt „diese Vorbelegung meint eine andere Quelle und wird ignoriert" — die
 * Vorlage funktioniert ohne sie weiter. Bewusst ohne `Database`-Parameter, wie
 * `resolveScopePersonRef`: der Vergleich braucht nur den Referenten. Generisch über den
 * Referenten, damit auch ein EINGEFRORENER Stand (`DeepReadonly<Source>` aus
 * `ReadonlyDatabase`) ohne Cast hineingeht — verglichen werden ohnehin nur drei Felder.
 *
 * Vergleichsregel (dieselbe Staffelung wie beim Personenbezug):
 * - **Kein Fingerabdruck** (`abbr` und `title` leer) → unprüfbar, gilt. Von Hand
 *   geschriebene Vorlagen sollen nicht entwertet werden, nur weil sie unvollständig sind.
 * - **Kurzname** muss übereinstimmen, sobald die Vorbelegung ihn führt (normalisiert).
 * - **Titel** entscheidet nur, wenn BEIDE Seiten ihn kennen — sonst schlösse ein
 *   nachgetragener Titel die Vorbelegung fälschlich aus.
 */
export function resolveEntrySourcePrefill<T extends Pick<Source, 'id' | 'abbr' | 'title'>>(
  prefill: EntrySourcePrefill,
  referent: T | undefined,
): T | null {
  if (!referent || referent.id !== prefill.sourceId) return null;
  if (prefill.abbr === '' && prefill.title === '') return referent;
  if (prefill.abbr !== '' && norm(prefill.abbr) !== norm(referent.abbr)) return null;
  if (prefill.title !== '' && referent.title !== '' && norm(prefill.title) !== norm(referent.title)) {
    return null;
  }
  return referent;
}

// --- Die Vorlage selbst ---------------------------------------------------------------

export interface EntryTemplate {
  /** Stabiler Schlüssel — zugleich der Merge-Schlüssel im B1-Bündel (id-gekeyte Sammlung). */
  id: string;
  /** Deutscher Anzeigename in Liste und Erfassungs-Fläche. */
  label: string;
  /** Die Felder, in Erfassungs-Reihenfolge. */
  slots: EntrySlot[];
  /** Optionale Quellen-Vorbelegung (mitgelieferte Vorlagen haben keine). */
  source?: EntrySourcePrefill;
}

/** Konstruktor. Kein Zufall, keine Uhr (TST-3) — die `id` kommt vom Aufrufer. */
export function makeEntryTemplate(
  id: string,
  patch: Partial<Omit<EntryTemplate, 'id'>> = {},
): EntryTemplate {
  return {
    id,
    label: patch.label ?? '',
    slots: patch.slots ?? [],
    source: patch.source,
  };
}

// --- Die drei mitgelieferten Standard-Vorlagen (ADR-v9-264 E8) ------------------------
//
// ALS DATEN, in genau der Form, die auch der Builder erzeugt — die Zusage aus ADR-v9-69
// Punkt 4. v8 hatte dafür einen eigenen Codepfad (`_qtSchema`, Z. 87–90: ein `if` zwischen
// zwei Schema-Welten) und daraus folgend zwei Rollenräume; genau das entfällt hier.
//
// OHNE Quellen-Vorbelegung: welche Quelle gemeint ist, weiß nur der Nutzer, und eine
// erfundene Id wäre in jedem Bestand falsch. Der Ort ist dagegen ein normaler `place`-Slot
// (v8 trug ihn als „impliziten Kontext" der Vorlage, unsichtbar und unbearbeitbar).
//
// Kopierbar, nicht überschreibbar: die Liste ist eine Konstante; die Verwaltung (BL-353)
// legt Kopien mit eigener id an.

export const BUILTIN_ENTRY_TEMPLATES: EntryTemplate[] = [
  makeEntryTemplate('heirat', {
    label: 'Heirat (Heiratsbuch)',
    slots: [
      { role: 'spouseFamily', field: 'date', event: 'MARR' },
      { role: 'spouseFamily', field: 'place', event: 'MARR' },
      { role: 'main', field: 'surname' },
      { role: 'main', field: 'given' },
      { role: 'main', field: 'sex', prefill: 'M', prefillMode: 'hidden' },
      { role: 'spouse', field: 'surname' },
      { role: 'spouse', field: 'given' },
      { role: 'spouse', field: 'sex', prefill: 'F', prefillMode: 'hidden' },
    ],
  }),
  makeEntryTemplate('taufe', {
    label: 'Taufe (Taufbuch)',
    slots: [
      { role: 'main', field: 'date', event: 'CHR' },
      { role: 'main', field: 'place', event: 'CHR' },
      { role: 'main', field: 'surname' },
      { role: 'main', field: 'given' },
    ],
  }),
  makeEntryTemplate('sterbefall', {
    label: 'Sterbefall (Sterberegister)',
    slots: [
      { role: 'main', field: 'date', event: 'DEAT' },
      { role: 'main', field: 'place', event: 'DEAT' },
      { role: 'main', field: 'date', event: 'BURI' },
      { role: 'main', field: 'surname' },
      { role: 'main', field: 'given' },
    ],
  }),
];

const BUILTIN_IDS = new Set(BUILTIN_ENTRY_TEMPLATES.map((t) => t.id));

/** Ist das eine mitgelieferte Vorlage? (Sie wird kopiert, nicht überschrieben.) */
export function isBuiltinEntryTemplate(id: string): boolean {
  return BUILTIN_IDS.has(id);
}

// --- Normalisierung gespeicherter Vorlagen --------------------------------------------
//
// Was aus dem B1-Bündel kommt, ist `unknown` und nicht `EntryTemplate`: die Datei kann von
// Hand bearbeitet oder von einer anderen Programmversion geschrieben worden sein (dieselbe
// Lage wie bei `normalizeProject`, BL-239). Ein Feld in fremder Form fällt auf den Leerwert
// zurück, ein unbrauchbarer Slot fällt weg — der Nutzer verliert eine Zeile, nicht die
// Vorlagenliste.

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function quayOf(v: unknown): Quay | null {
  return v === 0 || v === 1 || v === 2 || v === 3 ? v : null;
}

function prefillOf(o: Record<string, unknown>): SlotPrefill {
  if (typeof o.prefill !== 'string') return {};
  const mode = o.prefillMode === 'hidden' ? 'hidden' : 'locked';
  return { prefill: o.prefill, prefillMode: mode };
}

function slotOf(raw: unknown): EntrySlot | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const role = str(o.role);
  const field = str(o.field);
  const event = str(o.event);
  const prefill = prefillOf(o);

  if (isFamilyRole(role)) {
    if (!(EVENT_FIELDS as readonly string[]).includes(field)) return null;
    if (!(FAMILY_EVENT_TAGS as readonly string[]).includes(event)) return null;
    return { role, field: field as EventFieldName, event: event as FamilyEventTag, ...prefill };
  }
  if (!(ENTRY_PERSON_ROLES as readonly string[]).includes(role)) return null;
  const personRole = role as EntryPersonRole;
  if ((IDENTITY_FIELDS as readonly string[]).includes(field)) {
    if (event !== '') return null; // ein Identitätsfeld hat keinen Ereignistyp
    return { role: personRole, field: field as IdentityFieldName, ...prefill };
  }
  if ((EVENT_FIELDS as readonly string[]).includes(field) && event !== '') {
    return { role: personRole, field: field as EventFieldName, event, ...prefill };
  }
  return null;
}

function sourceOf(raw: unknown): EntrySourcePrefill | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  const sourceId = str(o.sourceId);
  if (sourceId === '') return undefined;
  return {
    sourceId,
    abbr: str(o.abbr),
    title: str(o.title),
    quay: quayOf(o.quay),
    pagePattern: str(o.pagePattern),
    urlPattern: str(o.urlPattern),
  };
}

/** Hebt eine GESPEICHERTE Vorlage auf die aktuelle Form (s. Blockkommentar). */
export function normalizeEntryTemplate(raw: unknown): EntryTemplate {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const slots = Array.isArray(o.slots)
    ? o.slots.map(slotOf).filter((s): s is EntrySlot => s !== null)
    : [];
  return { id: str(o.id), label: str(o.label), slots, source: sourceOf(o.source) };
}
