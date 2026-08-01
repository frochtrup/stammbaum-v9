# tests/fixtures — welche Datei wofür

**Wer „am Realbestand kommt X N× vor" auszählen will, nimmt `Unsere Familie 2026.ged`.
Nicht `MeineDaten_ancestris.ged`.** Diese Datei steht hier, weil genau diese Verwechslung
schon zweimal passiert ist.

| Datei | Stand | Personen | wofür |
|---|---|---|---|
| `Unsere Familie 2026.ged` | 25 JUN 2026 | 3180 | **der aktuelle Bestand** — jede Häufigkeits-/Priorisierungsaussage |
| `MeineDaten_ancestris.ged` | 7 MAR 2026 | 2795 | eingefrorenes **Orakel** — Roundtrip, Parser-Kanten, Skalenverhalten |
| `Unsere Familie.gramps` | — | 2894 | GRAMPS-Orakel, dieselbe Rolle |
| `*.small.ged` / `*.small.gramps` | — | — | kuratierte Klein-Fixtures, **die einzigen committeten** |

## Warum das eine Falle ist

Der Orakel-Snapshot liegt seit Monaten hier und *sieht* dadurch kanonisch aus — die
Roundtrip-Tests laufen gegen ihn, sein Name taucht in 15 Testdateien auf. Der maßgebliche
Bestand liegt dagegen gitignored und ist auf einem frischen Rechner gar nicht da.

Wer also „den echten Datenbestand" auszählen will, findet zuerst den Snapshot und hat
keinen Anlass zu zweifeln. ADR-v9-151 hat auf diesem Weg sechs Quellen-Zahlen falsch
gemessen — `SOUR.DATA.EVEN` galt als „0× vorhanden" und kommt tatsächlich 7× vor, jeweils
vollständig mit Zeitraum und Ort. Eine Backlog-Zeile landete dadurch in der falschen
Klasse und der falschen Welle (ADR-v9-178).

**Der Snapshot ist deswegen nicht falsch.** Für Roundtrip-Treue und Parser-Kanten ist eine
eingefrorene Datei genau richtig — dass sie sich nicht bewegt, ist dort der Vorzug. Falsch
ist nur, sie für eine Aussage über den *heutigen* Bestand zu benutzen.

## Einrichtung

`Unsere Familie 2026.ged` ist ein **Symlink** auf den Export im Spec-Repo, keine Kopie —
eine Kopie veraltet still und wäre dieselbe Falle noch einmal:

```bash
ln -s "$HOME/Documents/GitHub/Stammbaum/Testdateien/Unsere Familie 2026.ged" "tests/fixtures/Unsere Familie 2026.ged"
```

Fehlt der Link, überspringen die betroffenen Tests — sichtbar, mit Dateinamen im
Protokoll (Spec 32 TST-21). Zeigt er auf eine andere oder veraltete Datei, wird
`tests/core/realdaten-basis.test.ts` **rot**; die Deklaration der Sollzahlen steht in
`tests/core/realdaten.ts`.
