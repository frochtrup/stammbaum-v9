# v8-Abweichungs-Register

> Geführte Liste jeder Stelle, an der v9-Ausgabe **bewusst** vom v8-Verhaltens-Orakel
> abweicht (Testframework [32 §9](../../Stammbaum/specs/v9/32-Testframework.md), TST-DEV).
> Jede beabsichtigte Abweichung hat (a) einen Eintrag hier **und** (b) einen
> verriegelnden Test. Ein unerwarteter Orakel-Diff ohne Eintrag = Regression → CI rot.

Grund-Legende: `bug-fix` = v8 war falsch · `by-design` = Format-/Konventions-Grenze.

| ID | Kontext | v8-Verhalten | v9-Verhalten | Grund | Test |
|---|---|---|---|---|---|
| DEV-PLACE-01 | Konvention 2 (`PLAC Dorf + ADDR Hof`, Hof-Typ), Hof existiert nicht | v8 bootstrapt den Hof beim Laden und ergänzt beim ersten Speichern den Hof-Präfix in PLAC (`net_delta≠0` beim ersten Speichern, danach idempotent = Konvention 1) | v9 identisch: Pfad B' bootstrapt den Hof, die Reprojektion setzt `ev.place` = `buildPlacForGedcom` (Hof-Präfix ergänzt), danach idempotent | `by-design` | `tests/core/konvention-matrix.test.ts` › „Hof-Typ, Hof existiert nicht → Pfad B' … sichtbarer Übergang zu Konvention 1" |
| DEV-02 | HEAD, mutierendes Speichern (`updateHeadDate=true`) | v8 hält den HEAD verbatim (GED5), setzt `1 DATE`/`2 TIME` nur bei echtem Speichern auf jetzt | v9 identisch: der Writer gibt den HEAD verbatim aus (`header.raw`), `1 DATE`/`2 TIME` nur bei `updateHeadDate` über die injizierte Clock (TST-3). Der nicht-mutierende Roundtrip lässt den HEAD unverändert → `net_delta=0` | `by-design` | `tests/core/interop-unit.test.ts` › „HEAD-Zeilen bleiben verbatim erhalten"; `tests/roundtrip/gedcom-ancestris.roundtrip.test.ts` › RT-2 |
| DEV-03 | GRAMPS-Roundtrip (`Unsere Familie.gramps`), Whitespace zwischen Attributen/Elementen | v8 gibt GRAMPS über den DOM-Serializer aus (normalisierte Ausgabe) | v9 gibt den struktur-erhaltenden XML-Baum mit deterministischer 2-Space-Einrückung + Einfach-Space-Attributtrennung aus. Die Quelldatei enthält vereinzelt unregelmäßige Attribut-Abstände (`<url  href`, trailing space) — v9 normiert sie. KEIN Datenverlust (Element-/Attribut-/Textparität geprüft), Ziel ist `xml1===xml2` (Writer-Idempotenz, Spec 13 §6), nicht Byte-Gleichheit zur Quelle | `by-design` | `tests/roundtrip/gramps-familie.roundtrip.test.ts` › RT-1 (`xml1===xml2`); `tests/roundtrip/gramps-mini.roundtrip.test.ts` › INV-PT-Fälle |
| DEV-04 | Strict-Export (`format:'strict'`) | v8 lässt `_`-Tags weg / mappt sie (bewusst nicht verlustfrei) | v9 identisch: `_UID`→`REFN`+`TYPE UID`, `_RUFNAME`→`NICK`, `_FREL`/`_MREL`→`PEDI`, `_EVAL`/`_HYPO`/… weg. Roundtrip-stabil (`strict(strict)===strict`), aber by-design verlustbehaftet | `by-design` | `tests/core/interop-strict.test.ts` |
| DEV-05 | GED7-Export (`format:'7.0'`) | v8: `REFN`→`EXID`, `1 NOTE Kein bekanntes Ereignis: X`→`1 NO X`, `NOTE`→`SNOTE`, `_TRAN`→`TRAN`, `RELA`→`ROLE`, CHAR/FORM raus | v9 identisch via reinem Baum-Adapter | `by-design` | `tests/core/interop-ged7.test.ts` |

## Offene Kandidaten (noch nicht berührt)

- **Doppeltes `3 MAP` / nacktes `1 CHAN` ohne DATE** (Seed-`bug-fix`-Kandidaten aus
  32 §9): Der v9-Writer gibt den geparsten Baum verbatim wieder (Passthrough-Backbone),
  ergänzt beim nicht-mutierenden Roundtrip NICHTS und verstümmelt NICHTS — er reproduziert
  die Orakel-Datei mit `net_delta=0` (logische Zeilengleichheit zur Quelle, Position für
  Position geprüft). Damit tritt **keiner** dieser v8-Einzelverluste in v9 auf; sobald
  der Modell-getriebene Writer diese Konstrukte aus dem Modell (statt aus dem Baum)
  neu erzeugt (z. B. bei editierten Records), wird die Verbesserung hier als `bug-fix`
  registriert + verriegelt.
- **Modell-getriebene Record-Ausgabe bei Edits:** Der aktuelle Writer serialisiert primär
  den Passthrough-Baum (Roundtrip-Treue). Das Zurückprojizieren *editierter* Modellfelder
  an ihre kanonische Position (Spec 13 §2.1, zweiter Halbsatz) ist noch nicht implementiert
  — das ist ein Editier-Pfad, kein Roundtrip-Pfad, und gehört in den App-Schritt. Bis dahin
  ist der Kern-Roundtrip vollständig grün und verlustfrei (siehe „Bewusst offen" im
  Bau-Bericht).

### Anonymisierung / GRAMPS-Vollprojektion — bewusst offen
- **`buildLivingSet`/`anonymizeIndi`** sind implementiert + unit-getestet (Spec 13 §7);
  die Verdrahtung eines vollständigen anonymisierten *Datei-Exports* (alle Records durch
  den Baum-Filter) ist ein dünner App-Adapter und noch nicht als Datei-Roundtrip getestet.
- **GRAMPS-Modell-Projektion** deckt die Kern-Entitäten ab (Person/Familie/Quelle/Archiv/
  Notiz); die Fidelity hängt am erhaltenen XML-Baum, nicht an der Projektionstiefe. Ereignis-
  und Zitat-Deref über Handles ins Modell ist für den Roundtrip nicht nötig und offen.
