// core/model/source-templates.ts — Quellen-Vorlagen (Spec 20 §1.6, letzter Punkt
// "Quellen-Vorlagen" [S]). Beim Anlegen einer neuen Quelle wählbare Presets, die
// Kurzname/Titel/Autor/Medientyp vorbelegen — gleiche Preset+Freitext-`<datalist>`-
// Mechanik wie Aufgaben-Kategorien (`ui/views/tasks/TaskForm.svelte` CATEGORY_PRESETS)
// und Assoziations-Rollen (`ui/views/person/PersonAssociations.svelte` ROLE_PRESETS,
// INV-UI-4) — KEIN geschlossenes Enum: die Auswahl liefert nur Startwerte, jedes Feld
// bleibt danach frei editierbar (SourceForm.svelte).
//
// Bewusst im KERN (nicht in ui/), obwohl CATEGORY_PRESETS/ROLE_PRESETS lokal in ihrer
// jeweiligen Komponente liegen: der unmittelbar folgende Bauabschnitt BL-228
// (`suggestResearchStep`, core/research/) muss laut ADR-v9-165 Punkt 3 GENAU dieses
// Gattungs-Vokabular verwenden, "nicht eine zweite Liste". INV-ARCH-1 verbietet dem
// Kern den Zugriff auf ui/ — also muss das gemeinsame Vokabular hier wohnen, damit
// core/research/ es lesen kann, ohne nach oben zu greifen.
//
// Verhaltens-Orakel: legacy-v8/ui-forms.js `_SOUR_TEMPLATES` (Schlüssel kb-tauf/kb-heir/
// kb-beer/sta-geb/sta-heir/sta-sterb/volkszaehl/grabstein/totenzettel/militaer). Die
// Gattungsliste und die `medi`-Werte (GEDCOM-5.5.1-Standard-Enum für `Source.callMedia`,
// SOUR.REPO.CALN.MEDI: "manuscript"/"tombstone"/"card" — dieselbe Kern-Wahrheit wie
// `Media.type`) sind übernommen. BEWUSST NICHT übernommen: v8s erfundene Autor-
// Platzhalter ("Pfarramt …", "Standesamt …", "Statistisches Amt", "Bundesarchiv-
// Militärarchiv") — das sind keine echten, für JEDE Quelle dieser Gattung zutreffenden
// Autorenangaben, sondern Rate-Werte, die als scheinbar fertiger Text im Feld stehen
// blieben, wenn der Nutzer sie nicht überschreibt (Auftrags-Vorgabe: ein leeres
// Autor-Feld ist ehrlicher als ein plausibel aussehender Fantasiewert). Titel bekommt
// stattdessen ein Gerüst mit "[…]"-Lücken, die eindeutig als auszufüllend erkennbar
// sind, statt v8s Auslassungspunkten ("…"), die wie bereits eingetragener Text aussehen.

export interface SourceTemplate {
  /** Stabiler Schlüssel — nicht übersetzen, potenzielles Referenzziel für BL-228. */
  key: string;
  /** Deutscher Anzeigename in der Vorlagen-Auswahl (Chips/Datalist). */
  label: string;
  /** Vorbelegung für `Source.abbr` (Kurzname). */
  abbr: string;
  /** Vorbelegung für `Source.title` — Gerüst mit "[…]"-Lücken statt Fantasiewert. */
  title: string;
  /** Vorbelegung für `Source.author` — bewusst leer, wo die Gattung keinen für ALLE
   *  Instanzen zutreffenden Autor hergibt (s. Kopfkommentar). */
  author: string;
  /** Vorbelegung für `Source.callMedia` (Medientyp, GEDCOM SOUR.REPO.CALN.MEDI). */
  callMedia: string;
}

export const SOURCE_TEMPLATES: SourceTemplate[] = [
  {
    key: 'kb-taufen',
    label: 'Kirchenbuch Taufen',
    abbr: 'KB Taufen',
    title: 'Kirchenbuch Taufen, [Pfarrei], [Jahre]',
    author: '',
    callMedia: 'manuscript',
  },
  {
    key: 'kb-heiraten',
    label: 'Kirchenbuch Heiraten',
    abbr: 'KB Heiraten',
    title: 'Kirchenbuch Heiraten, [Pfarrei], [Jahre]',
    author: '',
    callMedia: 'manuscript',
  },
  {
    key: 'kb-beerdigungen',
    label: 'Kirchenbuch Beerdigungen',
    abbr: 'KB Beerdigungen',
    title: 'Kirchenbuch Beerdigungen, [Pfarrei], [Jahre]',
    author: '',
    callMedia: 'manuscript',
  },
  {
    key: 'standesamt-geburt',
    label: 'Standesamt Geburt',
    abbr: 'StA Geburten',
    title: 'Geburtenregister, [Standesamt], [Jahre]',
    author: '',
    callMedia: 'manuscript',
  },
  {
    key: 'standesamt-heirat',
    label: 'Standesamt Heirat',
    abbr: 'StA Heiraten',
    title: 'Heiratsregister, [Standesamt], [Jahre]',
    author: '',
    callMedia: 'manuscript',
  },
  {
    key: 'standesamt-sterbefall',
    label: 'Standesamt Sterbefall',
    abbr: 'StA Sterbefälle',
    title: 'Sterberegister, [Standesamt], [Jahre]',
    author: '',
    callMedia: 'manuscript',
  },
  {
    key: 'volkszaehlung',
    label: 'Volkszählung',
    abbr: 'Volkszählung',
    title: 'Volkszählung [Jahr], [Ort]',
    author: '',
    callMedia: 'manuscript',
  },
  {
    key: 'grabstein',
    label: 'Grabstein',
    abbr: 'Grabstein',
    title: 'Grabstein, [Friedhof/Ort]',
    author: '',
    callMedia: 'tombstone',
  },
  {
    key: 'totenzettel',
    label: 'Totenzettel',
    abbr: 'Totenzettel',
    title: 'Totenzettel, [Name]',
    author: '',
    callMedia: 'card',
  },
  {
    key: 'militaerakte',
    label: 'Militärakte',
    abbr: 'Militärakte',
    title: 'Militärakte, [Name/Einheit]',
    author: '',
    callMedia: 'manuscript',
  },
];
