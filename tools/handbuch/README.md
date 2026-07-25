# Handbuch-Automatisierung (`tools/handbuch/`)

Erzeugt [`HANDBUCH.html`](../../HANDBUCH.html) reproduzierbar neu: Screenshots aus der
laufenden App, illustriert mit einer **anonymisierten, reichhaltigen** Beispieldatei.

## Schnellstart
```bash
npm run handbuch
```
Danach den Diff prüfen und bewusst committen (siehe Skill `/handbuch-build`).

## Dateien
| Datei | Zweck |
|-------|-------|
| `anonymize-ged.mjs` | Wandelt eine echte (private) GEDCOM in eine anonymisierte Beispieldatei: Personennamen werden deterministisch pseudonymisiert (gleicher Name → gleiches Pseudonym), Foto-/Dateipfade neutralisiert. **Erhalten bleiben** Struktur, Daten, Verwandtschaft, Quellen und die **reale Ortsgeografie** (öffentlich; die Verknüpfung Ort/Hof → reale Person ist durch die Pseudonymisierung ohnehin gekappt). |
| `capture.mjs` | Fährt die App headless (puppeteer-core + System-Chrome), seedt den Orts-Spiegel und etwas Forschungsdaten und schießt alle `handbuch-assets/*.png`. |
| `build-handbook.mjs` | Orchestrator: demo.ged umlegen → Dev-Server → capture → aufräumen → Version/Changelog/HTML-Stempel. |
| `fixtures/demo-rich.anon.ged` | Die **committefähige** anonymisierte Beispieldatei (≈2.800 Personen). |
| `fixtures/orte.json` | Orts-Anreicherung (Koordinaten/Hierarchien) — öffentliche Geografie, für Kartenmarker. |
| `handbuch.version.json` | Aktuelle Handbuch-Version (Minor-Bump je Lauf). |

## Anonymisierte Fixture neu erzeugen
Nur nötig, wenn sich der reale Quellbestand geändert hat (die Quelle ist privat/gitignored):
```bash
npm run handbuch:anon -- /pfad/zur/echten.ged tools/handbuch/fixtures/demo-rich.anon.ged
```
Danach in `capture.mjs` die Ziel-Personen (`RICH_PERSON` / `RICH_SURNAME`) gegen die neue
Fixture verifizieren (reichste Person mit vielen Ereignissen für die Detail-Screenshots).

## Wichtig
- **Committet nie automatisch.** Der Diff wird vom Nutzer geprüft.
- **Anonymität selbst gegenprüfen:** nach dem Lauf stichprobenartig sicherstellen, dass in
  den PNGs keine echten Personennamen erscheinen.
- Läuft **lokal** (System-Chrome, Dev-Server) — nicht in CI.
