// core/model/source-kinds.ts — die Gattung einer Quelle (Spec 20 §1.6 [S], BL-373).
//
// KEIN MODELLFELD, KEIN WIRE-TAG. Die Gattung wird aus Kurzname und Titel ABGELEITET.
// Der Grund steht direkt nebenan: `source-templates.ts` belegt den Kurznamen jeder neu
// angelegten Quelle bereits genau so vor (`KB Taufen`, `StA Geburten`, `Grabstein`,
// `Totenzettel`) — die Konvention ist also das, was die App ohnehin schreibt, und ein
// eigener `_GATT`-Tag daneben wäre eine zweite Wahrheit über dieselbe Sache. Damit bleibt
// der Roundtrip (LP-1) unberührt: es gibt nichts zu schreiben, zu lesen oder zu strippen.
//
// Der Preis ist benannt und Teil der Entscheidung: eine Fehleinordnung wird durch
// UMBENENNEN korrigiert, und der Kurzname steht in Zitaten und im Quellenverzeichnis. Die
// Einordnung ist deshalb eine Anzeige-Entscheidung, keine stille Metadatenpflege.
//
// ZWEI STUFEN, und die Reihenfolge ist die halbe Miete:
//   (0) ein FÜHRENDER Marker im Kurznamen gewinnt — immer. Ohne diese Stufe wäre die
//       Auswahlbox wirkungslos: wer „Totenzettel Meier" auf „Standesamt" korrigiert,
//       bekäme „StA Totenzettel Meier" und läge danach wieder auf `grab`, weil das
//       Stichwort „totenzettel" irgendwo im Text steht. Die Korrektur MUSS die Ableitung
//       schlagen können, sonst ist sie keine.
//   (1) danach die Stichwörter über Kurzname + Titel, GEORDNET — die erste passende
//       Gattung gewinnt. Die Ordnung trägt echte Fälle: „Todesanzeige" ist ein Totenzettel
//       und keine Zeitung, obwohl „Anzeiger" ein Presse-Stichwort ist; „Taufurkunde" ist
//       kirchlich, obwohl „Urkunde" ein Standesamt-Stichwort ist.
//
// Kurze Marker (`KB`, `StA`) stehen NUR in Stufe 0, nicht in den Stichwörtern: als
// Teilzeichenkette träfe `sta ` auch „Costa Rica". Ein Marker ist eine Aussage über den
// Anfang des Namens, kein Fund irgendwo im Text.
//
// Bewusst im KERN und nicht in `ui/`: Ableitung und Auswahlbox lesen dasselbe Vokabular
// (INV-UI-4 auf Datenebene, gleiche Begründung wie bei `SOURCE_TEMPLATES`), und der Kern
// darf nicht nach oben greifen (INV-ARCH-1).

/** Stabile Schlüssel — Anzeigetexte ändern sich, diese nicht. */
export type SourceKind =
  | 'kirchenbuch'
  | 'standesamt'
  | 'grab'
  | 'presse'
  | 'persoenlich'
  | 'online'
  | 'fremdbaum'
  | 'sonstiges';

export interface SourceKindDef {
  key: SourceKind;
  /** Deutscher Anzeigename (Filter-Stufe, Auswahlbox, Listenzeile). */
  label: string;
  /**
   * Akzeptierte FÜHRENDE Marker im Kurznamen, in absteigender Verbindlichkeit. Der erste
   * ist der kanonische — ihn schreibt `withSourceKindMarker`. Die weiteren sind die
   * natürlichen Wörter, mit denen ein Bestand denselben Anfang schon macht; sie zu
   * akzeptieren erspart dem Nutzer, einen bereits richtigen Namen umzuschreiben.
   */
  markers: string[];
  /** Stichwörter (klein), gesucht in Kurzname + Titel. Ganze Wörter, keine Kürzel. */
  keywords: string[];
}

/**
 * Die acht Gattungen aus Spec 20 §1.6, IN AUSWERTUNGS-REIHENFOLGE. `sonstiges` steht
 * zuletzt und trägt weder Marker noch Stichwörter — es ist der Rückfall, keine Wahl.
 */
export const SOURCE_KINDS: SourceKindDef[] = [
  {
    key: 'kirchenbuch',
    label: 'Kirchenbuch',
    markers: ['KB', 'Kirchenbuch'],
    keywords: [
      'kirchenbuch',
      'kirchbuch',
      'taufbuch',
      'traubuch',
      'totenbuch',
      'taufregister',
      'taufurkunde',
      'taufbescheinigung',
      'taufschein',
      'pfarramt',
      'pfarrei',
      'pfarrarchiv',
      'firmung',
    ],
  },
  {
    // Deckt die AMTLICHEN Unterlagen insgesamt ab — Standesamt, Melderegister, Zensus,
    // Militär —, nicht nur die Personenstandsurkunde. Das Label nennt das häufigste
    // Mitglied, weil ein Filtereintrag „Amtliche Unterlagen (Standesamt, Melde-, Zensus-,
    // Militärunterlagen)" niemandem hilft; die Vorlagen `Volkszählung` und `Militärakte`
    // ordnen sich hier ein (der Test darüber hält das fest).
    key: 'standesamt',
    label: 'Standesamt/Urkunde',
    markers: ['StA', 'Standesamt'],
    keywords: [
      'standesamt',
      'volkszählung',
      'volkszaehlung',
      'zensus',
      'militärakte',
      'militaerakte',
      'wehrstammbuch',
      'musterung',
      'geburtsurkunde',
      'heiratsurkunde',
      'sterbeurkunde',
      'geburtenregister',
      'heiratsregister',
      'sterberegister',
      'zivilstandsregister',
      'heiratsbuch',
      'familienbuch',
      'stammbuch',
      'geburtsanzeige',
      'verlobungsanzeige',
      'erbschein',
      'personalausweis',
      'vollmacht',
      'besitzzeugnis',
      'melderegister',
      'urkunde',
    ],
  },
  {
    key: 'grab',
    label: 'Grabstein/Totenzettel',
    markers: ['Totenzettel', 'Grabstein', 'Todesanzeige'],
    keywords: [
      'totenzettel',
      'grabstein',
      'grabmal',
      'sterbebild',
      'friedhof',
      'todesanzeige',
      'totenanzeige',
      'traueranzeige',
      'findagrave',
      'findgrave',
      'find a grave',
    ],
  },
  {
    key: 'presse',
    label: 'Zeitung/Literatur',
    markers: ['Zeitung', 'Adressbuch'],
    keywords: [
      'zeitung',
      'anzeiger',
      'tageblatt',
      'wochenblatt',
      'adressbuch',
      'chronik',
      'festschrift',
      'heimatblatt',
      'zeitschrift',
      'veröffentlich',
    ],
  },
  {
    key: 'persoenlich',
    label: 'Persönliche Information',
    markers: ['Privat', 'Interview'],
    keywords: [
      'interview',
      'eigene information',
      'ahnenpass',
      'ahnenpaß',
      'aufsatz',
      'erinnerung',
      'tagebuch',
      'beileid',
      'gespräch',
      'eigenbeleg',
      'mitteilung',
      'nachlass',
    ],
  },
  {
    key: 'online',
    label: 'Internet/Datenbank',
    markers: ['Online', 'Internet'],
    keywords: [
      'gedbas',
      'internet',
      'online',
      'ancestry',
      'familysearch',
      'matricula',
      'arcinsys',
      'geneanet',
      'wikipedia',
      'web site',
      'website',
      'datenbank',
      'http',
    ],
  },
  {
    key: 'fremdbaum',
    label: 'Fremder Stammbaum',
    markers: ['Stammbaum', 'Ahnenliste'],
    keywords: [
      'stammbaum',
      'ahnenliste',
      'ahnentafel',
      'zusammenstellung',
      'nachkommenliste',
      'familienforschung',
    ],
  },
  { key: 'sonstiges', label: 'Sonstiges', markers: [], keywords: [] },
];

/** Die Gattungen, die eine Auswahlbox ANBIETEN kann — `sonstiges` ist ein Befund, keine
 *  Wahl: es gibt kein Wort, das man einem Namen hinzufügt, damit er nichts mehr aussagt.
 *  Wer eine Einordnung loswerden will, bearbeitet den Kurznamen. */
export const ASSIGNABLE_SOURCE_KINDS: SourceKindDef[] = SOURCE_KINDS.filter(
  (k) => k.markers.length > 0,
);

const BY_KEY = new Map<SourceKind, SourceKindDef>(SOURCE_KINDS.map((k) => [k.key, k]));

export function sourceKindLabel(key: SourceKind): string {
  return BY_KEY.get(key)?.label ?? BY_KEY.get('sonstiges')!.label;
}

/** Führt `text` mit `marker` als eigenständigem ersten Wort? (Groß-/Kleinschreibung egal;
 *  „KBW Meier" ist KEIN Treffer auf „KB" — der Marker muss enden, wo das Wort endet.) */
function leadsWith(text: string, marker: string): boolean {
  const t = text.trimStart().toLowerCase();
  const m = marker.toLowerCase();
  if (!t.startsWith(m)) return false;
  const rest = t.slice(m.length);
  return rest === '' || !/^[\p{L}\p{N}]/u.test(rest);
}

/** Die Gattung, die der führende Marker des Kurznamens behauptet — `null`, wenn keiner. */
function kindFromMarker(abbr: string): SourceKind | null {
  for (const def of SOURCE_KINDS) {
    if (def.markers.some((m) => leadsWith(abbr, m))) return def.key;
  }
  return null;
}

/** Nur die Felder, die die Ableitung liest — damit auch ein Zeilen-Modell (`SourceRow`)
 *  oder ein Formular-Entwurf befragt werden kann, nicht nur ein vollständiger `Source`. */
export interface SourceKindInput {
  abbr: string;
  title: string;
}

/**
 * Die abgeleitete Gattung. Stufe 0 (führender Marker) schlägt Stufe 1 (Stichwörter);
 * ohne Treffer `sonstiges`.
 */
export function sourceKindOf(s: SourceKindInput): SourceKind {
  const marker = kindFromMarker(s.abbr || '');
  if (marker) return marker;
  const hay = `${s.abbr || ''} ${s.title || ''}`.toLowerCase();
  for (const def of SOURCE_KINDS) {
    if (def.keywords.some((k) => hay.includes(k))) return def.key;
  }
  return 'sonstiges';
}

/**
 * Der Kurzname, der `kind` ausdrückt — das, was die Auswahlbox ins Feld schreibt.
 *
 * Drei Fälle, und der dritte ist der Grund für die Funktion: führt der Name bereits einen
 * Marker DIESER Gattung, bleibt er unangetastet (der Regelfall — die Vorlagen und der
 * gewachsene Bestand sind schon richtig benannt); führt er den Marker einer ANDEREN
 * Gattung, wird dieser ERSETZT statt ergänzt (sonst sammelten sich bei jeder Korrektur
 * Präfixe an); sonst wird der kanonische Marker vorangestellt.
 */
export function withSourceKindMarker(abbr: string, kind: SourceKind): string {
  const def = BY_KEY.get(kind);
  if (!def || def.markers.length === 0) return abbr;
  const text = abbr.trim();
  const current = kindFromMarker(text);
  if (current === kind) return abbr;
  if (current !== null) {
    const alt = BY_KEY.get(current)!.markers.find((m) => leadsWith(text, m))!;
    return `${def.markers[0]}${text.slice(alt.length)}`.trim();
  }
  return text ? `${def.markers[0]} ${text}` : def.markers[0];
}
