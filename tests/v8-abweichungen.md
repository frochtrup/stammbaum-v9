# v8-Abweichungs-Register

> Geführte Liste jeder Stelle, an der v9-Ausgabe **bewusst** vom v8-Verhaltens-Orakel
> abweicht (Testframework 32 §9 im Specs-Repo `Stammbaum/specs/v9/32-Testframework.md`
> — separates Repo, kein relativer Pfad möglich, TST-DEV).
> Jede beabsichtigte Abweichung hat (a) einen Eintrag hier **und** (b) einen
> verriegelnden Test. Ein unerwarteter Orakel-Diff ohne Eintrag = Regression → CI rot.

Grund-Legende: `bug-fix` = v8 war falsch · `by-design` = Format-/Konventions-Grenze.

| ID | Kontext | v8-Verhalten | v9-Verhalten | Grund | Test |
|---|---|---|---|---|---|
| DEV-PLACE-01 | Konvention 2 (`PLAC Dorf + ADDR Hof`, Hof-Typ), Hof existiert nicht | v8 bootstrapt den Hof beim Laden und ergänzt beim ersten Speichern den Hof-Präfix in PLAC (`net_delta≠0` beim ersten Speichern, danach idempotent = Konvention 1) | v9 identisch: Pfad B' bootstrapt den Hof, die Reprojektion setzt `ev.place` = `buildPlacForGedcom` (Hof-Präfix ergänzt), danach idempotent | `by-design` | `tests/core/konvention-matrix.test.ts` › „Hof-Typ, Hof existiert nicht → Pfad B' … sichtbarer Übergang zu Konvention 1" |
| DEV-02 | HEAD, mutierendes Speichern (`updateHeadDate=true`) | v8 hält den HEAD verbatim (GED5), setzt `1 DATE`/`2 TIME` nur bei echtem Speichern auf jetzt | v9 identisch: der Writer gibt den HEAD verbatim aus (`header.raw`), `1 DATE`/`2 TIME` nur bei `updateHeadDate` über die injizierte Clock (TST-3). Der nicht-mutierende Roundtrip lässt den HEAD unverändert → `net_delta=0` | `by-design` | `tests/core/interop-unit.test.ts` › „HEAD-Zeilen bleiben verbatim erhalten"; `tests/roundtrip/gedcom-ancestris.roundtrip.test.ts` › RT-2 |
| DEV-03 | GRAMPS-Roundtrip (`Unsere Familie.gramps`), Whitespace zwischen Attributen/Elementen | v8 gibt GRAMPS über den DOM-Serializer aus (normalisierte Ausgabe) | v9 gibt den struktur-erhaltenden XML-Baum mit deterministischer 2-Space-Einrückung + Einfach-Space-Attributtrennung aus. Die Quelldatei enthält vereinzelt unregelmäßige Attribut-Abstände (`<url  href`, trailing space) — v9 normiert sie. KEIN Datenverlust (Element-/Attribut-/Textparität geprüft), Ziel ist `xml1===xml2` (Writer-Idempotenz, Spec 13 §6), nicht Byte-Gleichheit zur Quelle | `by-design` | `tests/roundtrip/gramps-familie.roundtrip.test.ts` › RT-1 (`xml1===xml2`); `tests/roundtrip/gramps-mini.roundtrip.test.ts` › INV-PT-Fälle |
| DEV-04 | Strict-Export (`format:'strict'`) | v8 lässt `_`-Tags weg / mappt sie (bewusst nicht verlustfrei) | v9 identisch: `_UID`→`REFN`+`TYPE UID`, `_RUFNAME`→`NICK`, `_FREL`/`_MREL`→`PEDI`, `_EVAL`/`_HYPO`/… weg. Roundtrip-stabil (`strict(strict)===strict`), aber by-design verlustbehaftet | `by-design` | `tests/core/interop-strict.test.ts` |
| DEV-05 | GED7-Export (`format:'7.0'`) | v8: `REFN`→`EXID`, `1 NOTE Kein bekanntes Ereignis: X`→`1 NO X`, `NOTE`→`SNOTE`, `_TRAN`→`TRAN`, `RELA`→`ROLE`, CHAR/FORM raus | v9 identisch — **bis auf die ASSO-Rolle** (BL-241): v8 (und v9 bis dahin) benennt `RELA`->`ROLE` bloss um und schreibt damit Freitext in ein Feld, das in GEDCOM 7 eine **Enumeration** ist (`CHIL…OTHER`, gegen gedcom.io geprueft) — die acht Klartext-Presets der Assoziations-Eingabe sind dort nie zulaessig. v9 kodiert stattdessen (`ged7Role`): bekannte Rolle -> Enum-Wert, sonst `OTHER`, der Wortlaut immer in `3 PHRASE` (verlustfrei). Beim Lesen gewinnt die PHRASE | `bug-fix` | `tests/core/interop-ged7.test.ts` |
| DEV-06 | Anonymisierter Export, FAM-Records mit lebendem Partner | v8 schreibt FAM-Records ungefiltert (`writeGEDCOM` reicht `_livingSet` nur an `writeINDIRecord` weiter) — gemessen an `MeineDaten_ancestris.ged` bleiben 265 `MARR`-Daten und 31 `MARR`-Orte lebender Paare in der „anonymisierten" Datei stehen | v9 schwärzt FAM-Records mit mindestens einem lebenden PARTNER: `HUSB`/`WIFE`/`CHIL` bleiben (Spec 13 §7 „Familienlinks bleiben"), Ereignisdetails (`MARR`/`DIV` samt `DATE`/`PLAC`/`SOUR`, `NCHI`) fallen weg. Ein Hochzeitsdatum ist ein personenbezogenes Datum der Lebenden | `bug-fix` | `tests/core/interop-anonymize-doc.test.ts` › „FAM mit lebendem Partner behält HUSB/WIFE/CHIL, verliert aber MARR mit Datum und Ort" |

## Offene Kandidaten (noch nicht berührt)

- **Doppeltes `3 MAP` / nacktes `1 CHAN` ohne DATE** (Seed-`bug-fix`-Kandidaten aus
  32 §9): Der v9-Writer gibt den geparsten Baum verbatim wieder (Passthrough-Backbone),
  ergänzt beim nicht-mutierenden Roundtrip NICHTS und verstümmelt NICHTS — er reproduziert
  die Orakel-Datei mit `net_delta=0` (logische Zeilengleichheit zur Quelle, Position für
  Position geprüft). Damit tritt **keiner** dieser v8-Einzelverluste in v9 auf; sobald
  der Modell-getriebene Writer diese Konstrukte aus dem Modell (statt aus dem Baum)
  neu erzeugt (z. B. bei editierten Records), wird die Verbesserung hier als `bug-fix`
  registriert + verriegelt.
- **Modell-getriebene Record-Ausgabe bei Edits — IMPLEMENTIERT (2026-07-07):** Der
  Write-Back-Pfad (`core/interop/write-back.ts`, `applyDatabaseToRoots(db, roots)`,
  Spec 13 §2.1 zweiter Halbsatz, ADR-v9-14) projiziert editierte Modellfelder an ihre
  kanonische Baumposition zurück, OHNE einen neuen Orakel-Diff einzuführen: ein Record,
  dessen erkannte Modellfelder unverändert sind, kommt als IDENTISCHE GedNode-Referenz aus
  `roots` zurück (Struktur-Vergleich per Re-Projektion, kein Dirty-Flag) — der
  nicht-mutierende Roundtrip bleibt damit byte-identisch (`net_delta=0` auf
  `MeineDaten_ancestris.ged` mit 2811 referenzgleichen Records, verifiziert). Nur editierte
  Feldgruppen werden neu erzeugt; Passthrough-Zeilen (unbekannte `_`-Tags, tiefe
  OBJE/MAP-Ketten) bleiben in Reihenfolge/Tiefe erhalten (INV-PT). Damit tritt **kein**
  bewusster Orakel-Diff auf (kein DEV-NN-Eintrag nötig) — es ist eine neue Fähigkeit, keine
  Abweichung. Verriegelt durch `tests/core/interop-write-back.test.ts` (16 Tests:
  unverändert→byte-identisch, Feld-Edit→Passthrough überlebt, Neu-/Löschfälle, GED7/Strict
  auf synthetisierten Knoten). Scope: INDI/FAM/SOUR/REPO (die vier Typen mit Save-Kommandos);
  Notes/Places laufen über eigene Kanäle (Spec 11 §2). GRAMPS-Write-Back bleibt offen.

### Anonymisierung / GRAMPS-Vollprojektion
- **Anonymisierter Datei-Export — IMPLEMENTIERT (2026-07-22, BL-138/ADR-v9-113):**
  `anonymizeDoc(doc, referenceYear)` führt alle Records durch den Baum-Filter, der
  Export-Schalter `anonymizeReferenceYear` hängt am einen Rohr (`services/file/export-pipe.ts`)
  und erzwingt `_anon`-Suffix + Download. Zwei Punkte, die vorher nur als „dünner Adapter"
  galten und es nicht waren: (a) die **BFS-Bremse** — v9s Propagation lief ohne `dead`-Set
  durch datiert Verstorbene und klassifizierte 2767 von 2795 Personen als lebend, das
  Orakel 689; jetzt Orakel-Parität (kein DEV-Eintrag, es ist ein Defektfix, kein Diff).
  (b) FAM-Records, s. **DEV-06** oben. Verriegelt durch
  `tests/core/interop-anonymize-doc.test.ts` + den Anon-Block in
  `tests/services/export-pipe.test.ts`. **Offen bleibt die Bedienfläche** (BL-119) — bis
  dahin hat der Schalter keinen Aufrufer in `ui/`/`app/`.
- **Anonymisierung + GRAMPS** ist nicht umgesetzt (die Schwärzung arbeitet auf
  GEDCOM-Records): das Rohr wirft in dieser Kombination, statt still eine unanonymisierte
  Datei zu liefern.
- **GRAMPS-Modell-Projektion** deckt die Kern-Entitäten ab (Person/Familie/Quelle/Archiv/
  Notiz); die Fidelity hängt am erhaltenen XML-Baum, nicht an der Projektionstiefe. Ereignis-
  und Zitat-Deref über Handles ins Modell ist für den Roundtrip nicht nötig und offen.
