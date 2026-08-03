// core/model/empty.ts — „Ist an diesem Datensatz seit seiner Anlage nichts passiert?"
// (BL-275, INV-UI-10). Geschwister von `isEventEmpty` (event.ts) eine Ebene höher: dort
// geht es um eine leer angelegte Ereigniszeile, hier um einen leer angelegten RECORD.
//
// WARUM VERGLEICH STATT FELDLISTE. `isEventEmpty` zählt seine Felder einzeln auf — bei
// `Event` (13 Felder) ist das lesbar. `Person` hat über 40, und die Liste wüchse mit
// jedem neuen Modellfeld weiter, ohne dass irgendetwas rot würde, wenn jemand das
// Nachtragen vergisst: ein still übersehenes Feld hieße „leer" für einen Datensatz, der
// etwas trägt — und der Aufrufer LÖSCHT ihn dann. Deshalb wird gegen den Fabrik-Default
// verglichen: ein neues Feld ist automatisch mit erfasst (CLAUDE.md „den Zwang statt die
// Erinnerung wählen").
//
// Der Vergleich ist bewusst grob (serialisiert, nicht feldweise): jede Abweichung — auch
// eine bloß andere Schlüsselreihenfolge — bedeutet „nicht leer" und damit „nicht löschen".
// Die Fehlerrichtung ist damit die harmlose; die gefährliche (etwas als leer melden, das
// Inhalt trägt) ist nur über `Set` erreichbar, den `JSON.stringify` sonst zu `{}`
// einebnete — deshalb der Replacer.
import type { Person, Repository, Source } from './types';
import { makePerson, makeRepository, makeSource } from './factory';

function serialisiere(x: unknown): string {
  return JSON.stringify(x, (_k, v) => (v instanceof Set ? Array.from(v as Set<unknown>) : v)) ?? '';
}

function istUnveraendert<T>(ist: T, fabrikStand: T): boolean {
  return serialisiere(ist) === serialisiere(fabrikStand);
}

/**
 * Trägt die Person nichts außer ihrer id? — also exakt der Stand, den `＋ Neue Person`
 * anlegt (`makePerson(id)`, `PersonList.createPerson`). Sobald irgendetwas daran hängt
 * (getippter Name, ein per Pille angelegtes Ereignis, eine Familienbindung, eine
 * Forschungsnotiz), ist die Antwort `false`.
 */
export function isPersonEmpty(p: Person): boolean {
  return istUnveraendert(p, makePerson(p.id));
}

/** Geschwister zu `isPersonEmpty` für `＋ Neue Quelle` (`makeSource(id)`). */
export function isSourceEmpty(s: Source): boolean {
  return istUnveraendert(s, makeSource(s.id));
}

/** Geschwister zu `isPersonEmpty` für `＋ Neues Archiv` (`makeRepository(id)`). */
export function isRepositoryEmpty(r: Repository): boolean {
  return istUnveraendert(r, makeRepository(r.id));
}
