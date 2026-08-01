// core/research/project.ts — Forschungsprojekt (Spec 12 §5).
// App-privat: reist NICHT mit der Datei (Persistenz: 30 §2). Hier nur die reine Form
// plus die Scope-Matching-Funktion (Spec 20 §1.11f, BL-58).
import type { Event, Person } from '../model/types';
import { eventYear } from '../places/build-plac';
import type { Project, ProjectScope, ScopePersonRef } from './types';

function emptyScope(): ProjectScope {
  return { surnames: [], places: [], yearFrom: null, yearTo: null, personRefs: [] };
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Die für den Scope relevanten Ereignisse einer Person (Haupt-Lebensdaten + Rest). */
function scopeEvents(p: Person): Event[] {
  return [p.birth, p.chr, p.death, p.buri, ...p.events];
}

function surnameOk(p: Person, surnames: string[]): boolean {
  if (surnames.length === 0) return true; // leere Achse schränkt nicht ein
  const sn = norm(p.surname);
  return surnames.some((s) => norm(s) === sn);
}

function placeOk(p: Person, places: string[]): boolean {
  if (places.length === 0) return true;
  const evs = scopeEvents(p);
  return places.some((pl) => {
    const needle = norm(pl);
    return needle !== '' && evs.some((ev) => norm(ev.place ?? '').includes(needle));
  });
}

function yearOk(p: Person, from: number | null, to: number | null): boolean {
  if (from == null && to == null) return true;
  const years = [eventYear(p.birth), eventYear(p.death)].filter((y): y is number => y != null);
  if (years.length === 0) return false; // Zeitraum gefordert, aber kein datiertes Ereignis
  return years.some((y) => (from == null || y >= from) && (to == null || y <= to));
}

/**
 * Fällt eine Person in einen Scope (Spec 20 §1.11f, BL-58)? Die drei Achsen
 * Nachname/Ort/Zeitraum sind **UND-verknüpft**; eine leere Achse schränkt nicht ein
 * (ein vollständig leerer Scope trifft daher JEDE Person). Zusätzlich ist eine
 * ausdrücklich in `personIds` gelistete Person immer enthalten (ODER-Übersteuerung —
 * „diese Person gehört zum Projekt, egal was die Achsen sagen").
 */
export function matchesScope(person: Person, scope: ProjectScope): boolean {
  // Der Bezug übersteuert nur, wenn er WIRKLICH diese Person meint (BL-238): in einer
  // zweiten Datei zeigt dieselbe Id auf jemand anderen. Der Referent ist hier die
  // geprüfte Person selbst — ein Bestands-Lookup ist dafür nicht nötig.
  const explizit = scope.personRefs.some(
    (ref) => ref.id === person.id && resolveScopePersonRef(ref, person) !== null,
  );
  if (explizit) return true;
  return (
    surnameOk(person, scope.surnames) &&
    placeOk(person, scope.places) &&
    yearOk(person, scope.yearFrom, scope.yearTo)
  );
}

/** Konstruktor. `created` wird injiziert (TST-3); leerer Scope als Default. */
export function makeProject(id: string, patch: Partial<Omit<Project, 'id'>> = {}): Project {
  return {
    id,
    name: patch.name ?? '',
    color: patch.color ?? '',
    scope: patch.scope ?? emptyScope(),
    note: patch.note ?? '',
    created: patch.created ?? '',
  };
}

// --- Personenbezug: Id + Fingerabdruck (BL-238, ADR-v9-176) ------------------

/** Nimmt eine Person ausdrücklich in einen Scope auf — Id samt Fingerabdruck. */
export function makeScopePersonRef(person: Person): ScopePersonRef {
  return {
    id: person.id,
    name: refName(person),
    year: eventYear(person.birth) ?? null,
  };
}

function refName(person: Person): string {
  return `${person.given} ${person.surname}`.trim().replace(/\s+/g, ' ');
}

/**
 * Löst einen Scope-Personenbezug **am Referenten** auf: an derjenigen Person, die im
 * AKTUELLEN Bestand unter `ref.id` steht (`db.individuals.get(ref.id)`, oder `undefined`,
 * wenn es die Id dort gar nicht gibt).
 *
 * Ergebnis `null` heißt „dieser Bezug meint jemand anderen und wird ignoriert" — das ist
 * der ganze Zweck (BL-238): der Projekt-Speicher ist global, die Ids sind datei-lokal,
 * also muss beim Auswerten geprüft werden statt geglaubt. Bewusst ohne `Database`-Parameter:
 * der Vergleich braucht nur den Referenten, und `matchesScope` hat ihn ohnehin in der Hand.
 *
 * Vergleichsregel:
 * - **Kein Fingerabdruck** (`name === ''`, Altbestand vor BL-238) → unprüfbar, gilt. Diese
 *   Bezüge entstanden im Bestand des Nutzers; sie nachträglich zu entwerten verlöre echte
 *   Kuration für einen hypothetischen Fall. Der Fingerabdruck entsteht beim nächsten Edit.
 * - **Name** (Vorname + Nachname, normalisiert) muss übereinstimmen. Der Preis: wer eine
 *   Person im eigenen Baum umbenennt, verliert ihre ausdrückliche Projekt-Zugehörigkeit
 *   und trägt sie neu ein — hinnehmbar, weil ein Projekt eine *Sicht* ist (ADR-v9-117)
 *   und keine Aussage über den Bestand.
 * - **Geburtsjahr** entscheidet nur, wenn BEIDE Seiten es kennen (sonst schlösse ein
 *   nachgetragenes Datum den Bezug fälschlich aus); dann trennt es Namensvettern.
 */
export function resolveScopePersonRef(ref: ScopePersonRef, referent: Person | undefined): Person | null {
  if (!referent || referent.id !== ref.id) return null;
  if (ref.name === '') return referent;
  if (norm(ref.name) !== norm(refName(referent))) return null;
  const jahr = eventYear(referent.birth);
  if (ref.year != null && jahr != null && ref.year !== jahr) return null;
  return referent;
}

// --- Normalisierung gespeicherter Projekte ----------------------------------

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toPersonRefs(scope: Record<string, unknown>): ScopePersonRef[] {
  // Altbestand (vor BL-238): `personIds: string[]` — ohne Fingerabdruck, also unprüfbar.
  const alt = strList(scope.personIds).map((id) => ({ id, name: '', year: null }));
  const roh = Array.isArray(scope.personRefs) ? scope.personRefs : [];
  const neu = roh
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({ id: str(r.id), name: str(r.name), year: num(r.year) }))
    .filter((r) => r.id !== '');
  return [...neu, ...alt];
}

/**
 * Hebt ein GESPEICHERTES Projekt auf die aktuelle Form — Altbestand (`personIds:
 * string[]`) und Fremdeinflüsse (eine von Hand bearbeitete `app-data.json`, BL-239)
 * eingeschlossen.
 *
 * Beides läuft durch dieselbe Funktion, weil beides dieselbe Frage stellt: was hier
 * ankommt, ist `unknown` und nicht `Project`. Ein Feld, das nicht die erwartete Form hat,
 * fällt auf den Leerwert zurück statt die Projektliste zu sprengen (dieselbe Haltung wie
 * `loadProjects`: der Nutzer verliert eine Definition, nicht die Funktion).
 */
export function normalizeProject(raw: unknown): Project {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const s = (typeof o.scope === 'object' && o.scope !== null ? o.scope : {}) as Record<string, unknown>;
  return {
    id: str(o.id),
    name: str(o.name),
    color: str(o.color),
    note: str(o.note),
    created: str(o.created),
    scope: {
      surnames: strList(s.surnames),
      places: strList(s.places),
      yearFrom: num(s.yearFrom),
      yearTo: num(s.yearTo),
      personRefs: toPersonRefs(s),
    },
  };
}
