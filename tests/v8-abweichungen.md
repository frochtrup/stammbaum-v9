# v8-Abweichungs-Register

> Geführte Liste jeder Stelle, an der v9-Ausgabe **bewusst** vom v8-Verhaltens-Orakel
> abweicht (Testframework [32 §9](../../Stammbaum/specs/v9/32-Testframework.md), TST-DEV).
> Jede beabsichtigte Abweichung hat (a) einen Eintrag hier **und** (b) einen
> verriegelnden Test. Ein unerwarteter Orakel-Diff ohne Eintrag = Regression → CI rot.

Grund-Legende: `bug-fix` = v8 war falsch · `by-design` = Format-/Konventions-Grenze.

| ID | Kontext | v8-Verhalten | v9-Verhalten | Grund | Test |
|---|---|---|---|---|---|
| DEV-PLACE-01 | Konvention 2 (`PLAC Dorf + ADDR Hof`, Hof-Typ), Hof existiert nicht | v8 bootstrapt den Hof beim Laden und ergänzt beim ersten Speichern den Hof-Präfix in PLAC (`net_delta≠0` beim ersten Speichern, danach idempotent = Konvention 1) | v9 identisch: Pfad B' bootstrapt den Hof, die Reprojektion setzt `ev.place` = `buildPlacForGedcom` (Hof-Präfix ergänzt), danach idempotent | `by-design` | `tests/core/konvention-matrix.test.ts` › „Hof-Typ, Hof existiert nicht → Pfad B' … sichtbarer Übergang zu Konvention 1" |

## Offene Kandidaten (noch nicht relevant für den Orts-Kern)

Interop-seitige Seed-Einträge (HEAD-Rewrite `by-design`, doppeltes `3 MAP`
`bug-fix`, nacktes `1 CHAN` ohne DATE `bug-fix`) gehören in den Interop-Bau
(Spec 13) und werden dort ergänzt, sobald der Writer sie berührt. Der Orts-Kern
berührt nur den PLAC-/MAP-/ADDR-Inhalt über den Chokepoint `buildPlacForGedcom`;
solange dessen Ausgabe die v8-Bytes reproduziert (Konvention 1 bit-identisch,
Konvention 3a bit-identisch), entsteht kein weiterer Eintrag.
