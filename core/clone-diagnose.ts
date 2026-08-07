// core/clone-diagnose.ts — findet heraus, WELCHER Teil eines Werts das strukturierte
// Klonen verhindert (DataCloneError).
//
// DER ANLASS: „Import fehlgeschlagen: The object can not be cloned." (Safari, 2026-08-07).
// Die Meldung nennt weder den Speicherort noch das Feld — sie ist in jedem Browser anders
// formuliert, und keine Fassung sagt, WO das Hindernis steckt. Genau das kostet eine
// Fehlersuche pro Vorfall: die Ursache ist ein einzelnes Feld irgendwo in einem
// mehrtausendteiligen Objektbaum, und der Browser verrät es nicht.
//
// WARUM DAS NICHT DER BROWSER MACHT: Der Structured-Clone-Algorithmus bricht beim ersten
// unklonbaren Wert ab und wirft einen DOMException ohne Pfadangabe. Chromium hängt
// immerhin eine Kurzform des Werts an (`#<Object> could not be cloned`), WebKit nicht
// einmal das. Der Pfad ist nur durch Nachmessen zu bekommen — genau das tut diese Datei.
//
// VERFAHREN: absteigend halbieren wäre schneller, ist aber nur bei Arrays sauber
// definiert; hier wird linear abgestiegen, weil der Code NUR im Fehlerfall läuft (dann
// zählt Aussagekraft, nicht Geschwindigkeit) und weil ein linearer Abstieg denselben
// Pfad für Objekte, Arrays und Maps liefert, ohne drei Sonderfälle zu bauen.
//
// KEIN DOM, kein Framework (INV-ARCH-1) — `structuredClone` ist seit Node 17 global und
// damit auch build-frei testbar (INV-ARCH-2).

/** Obergrenze für die Suchtiefe — verhindert, dass eine zyklische oder absurd tiefe
 *  Struktur die Diagnose selbst zum Problem macht. Genealogie-Objekte sind flach
 *  (Person → events[] → citations[] → media[]), 12 Ebenen sind reichlich. */
const MAX_TIEFE = 12;

/** Obergrenze für Klon-Proben. Bei ~3000 Personen liegt eine vollständige Suche darunter;
 *  wird sie überschritten, meldet die Diagnose das ehrlich, statt stillschweigend eine
 *  unvollständige Antwort zu geben. */
const MAX_PROBEN = 20000;

/** Ist dieser Wert für sich genommen klonbar? */
function klonbar(wert: unknown): boolean {
  try {
    structuredClone(wert);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kurzbeschreibung eines Werts für die Fehlermeldung — Typ und, wo vorhanden, ein
 * identifizierendes Merkmal. Bewusst KEIN JSON.stringify des ganzen Werts: die
 * Meldung landet in der Oberfläche, und ein 2-MB-Objekt als Text hilft niemandem.
 */
export function beschreibeWert(wert: unknown): string {
  if (wert === null) return 'null';
  if (wert === undefined) return 'undefined';
  const t = typeof wert;
  if (t === 'function') return `Funktion${(wert as { name?: string }).name ? ` „${(wert as { name: string }).name}"` : ''}`;
  if (t === 'symbol') return `Symbol(${String(wert)})`;
  if (t !== 'object') return `${t} (${String(wert).slice(0, 40)})`;
  const name = (wert as object).constructor?.name ?? 'Object ohne Prototyp';
  // Ein Proxy ist von außen nicht als solcher erkennbar — aber ein Objekt, dessen
  // Bestandteile alle klonbar sind und das trotzdem scheitert, ist fast immer einer
  // (beide Engines lehnen Proxies ab). Das sagt die Meldung im Aufrufer, nicht hier.
  const id = (wert as { id?: unknown }).id;
  return typeof id === 'string' ? `${name} (id: ${id})` : name;
}

interface Kind {
  schluessel: string;
  wert: unknown;
}

/** Die Kinder eines Werts in einheitlicher Form — Objekt-Properties, Array-Elemente,
 *  Map-Einträge und Set-Mitglieder, damit der Abstieg nur EINE Schleife braucht. */
function kinderVon(wert: object): Kind[] {
  if (wert instanceof Map) {
    return [...wert.entries()].map(([k, v]) => ({ schluessel: `.get(${String(k)})`, wert: v }));
  }
  if (wert instanceof Set) {
    return [...wert.values()].map((v, i) => ({ schluessel: `#${i}`, wert: v }));
  }
  if (Array.isArray(wert)) {
    return wert.map((v, i) => ({ schluessel: `[${i}]`, wert: v }));
  }
  return Object.entries(wert).map(([k, v]) => ({ schluessel: `.${k}`, wert: v }));
}

export interface KlonHindernis {
  /** Pfad zum schuldigen Wert, z. B. `.individuals.get(@I42@).events[2].quelle`. Leer,
   *  wenn der übergebene Wert SELBST das Hindernis ist. */
  pfad: string;
  /** Kurzbeschreibung des schuldigen Werts (Typ + ggf. id). */
  wert: string;
  /** true, wenn kein einzelnes Kind schuld ist — dann liegt es am Container selbst
   *  (Proxy, exotische Klasse). Das ist die schwerer zu findende Sorte. */
  containerSelbst: boolean;
  /** true, wenn die Suche an einer Grenze abgebrochen hat — die Antwort ist dann der
   *  beste bekannte Stand, nicht das letzte Wort. */
  unvollstaendig: boolean;
}

/**
 * Sucht den ersten nicht klonbaren Bestandteil von `wert`.
 *
 * Gibt `null` zurück, wenn der Wert vollständig klonbar ist — der Aufrufer sollte dann
 * NICHT behaupten, es liege am Klonen (der DataCloneError kam womöglich von woanders,
 * etwa einem zweiten Feld, das erst durch einen Getter entsteht).
 */
export function findeKlonHindernis(wert: unknown): KlonHindernis | null {
  if (klonbar(wert)) return null;

  let proben = 0;
  let pfad = '';
  let aktuell = wert;

  for (let tiefe = 0; tiefe < MAX_TIEFE; tiefe += 1) {
    if (aktuell === null || typeof aktuell !== 'object') {
      // Ein primitiver Wert, der nicht klonbar ist: nur Symbole und Funktionen.
      return { pfad, wert: beschreibeWert(aktuell), containerSelbst: false, unvollstaendig: false };
    }

    const kinder = kinderVon(aktuell as object);
    let schuldiges: Kind | null = null;
    for (const kind of kinder) {
      if (proben >= MAX_PROBEN) {
        return { pfad, wert: beschreibeWert(aktuell), containerSelbst: false, unvollstaendig: true };
      }
      proben += 1;
      if (!klonbar(kind.wert)) {
        schuldiges = kind;
        break;
      }
    }

    // Kein Kind ist schuld, der Knoten aber schon → der Container SELBST ist das
    // Hindernis. Das ist der Proxy-/Fremdklassen-Fall und die eigentlich interessante
    // Auskunft: sie sagt dem Leser, dass er nicht weiter nach einem Feld suchen muss.
    if (!schuldiges) {
      return { pfad, wert: beschreibeWert(aktuell), containerSelbst: true, unvollstaendig: false };
    }

    pfad += schuldiges.schluessel;
    aktuell = schuldiges.wert;
  }

  return { pfad, wert: beschreibeWert(aktuell), containerSelbst: false, unvollstaendig: true };
}

/**
 * Fertiger Meldungssatz für die Oberfläche: nennt Ort und Hindernis in einem Satz, den
 * ein Nutzer weitergeben kann, ohne die Konsole zu öffnen.
 *
 * `kontext` benennt die Handlung/den Speicher („IndexedDB-Speicher „places-mirror"",
 * „Kopie einer Person"), damit die Meldung auch dann verortet ist, wenn der Pfad leer
 * bleibt, weil der übergebene Wert selbst das Hindernis war.
 */
export function klonFehlerText(wert: unknown, kontext: string): string {
  const h = findeKlonHindernis(wert);
  if (!h) {
    // Ehrlich bleiben: Wenn die Nachmessung nichts findet, ist die Ursache nicht das,
    // wonach wir gesucht haben. Eine erfundene Verortung wäre schlimmer als keine.
    return `${kontext}: Der Browser lehnt das Speichern ab, obwohl die Nachprüfung keinen unklonbaren Bestandteil findet.`;
  }
  const ort = h.pfad ? `bei ${h.pfad}` : 'am übergebenen Wert selbst';
  const art = h.containerSelbst
    ? `${h.wert} lässt sich nicht kopieren, obwohl alle seine Bestandteile es könnten (typisch für Proxy-Objekte)`
    : `${h.wert} lässt sich nicht kopieren`;
  const rest = h.unvollstaendig ? ' (Suche abgebrochen — es kann weitere geben)' : '';
  return `${kontext}: ${art} — ${ort}.${rest}`;
}

/**
 * `structuredClone` mit sprechendem Fehler. Für die Kern-Chokepoints, die pro Bearbeitung
 * laufen (`draft.ts::thaw` & Co.): der `try` kostet im Normalfall nichts, und im
 * Fehlerfall steht der Pfad in der Meldung statt eines nackten „The object can not be
 * cloned." — der Satz, mit dem eine Fehlersuche sonst bei null anfängt.
 */
export function klonen<T>(wert: T, kontext: string): T {
  try {
    return structuredClone(wert);
  } catch (err) {
    if (err instanceof Error && err.name === 'DataCloneError') {
      throw new Error(klonFehlerText(wert, kontext), { cause: err });
    }
    throw err;
  }
}
