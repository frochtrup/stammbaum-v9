# Handbuch — Änderungsprotokoll

Versionsverlauf des Benutzerhandbuchs ([HANDBUCH.html](HANDBUCH.html)).

**Arbeitsweise (Teil der Basisroutinen):** Jeder PR, der etwas **im Handbuch
Sichtbares** ändert — ein neues Feature, eine geänderte Ansicht, ein neuer Screen —
trägt eine Zeile unter **[Unreleased]** ein. Beim nächsten Lauf von
`npm run handbuch` (Skill `/handbuch-build`) werden die Screenshots neu erzeugt, die
Version hochgezählt und der Unreleased-Block zu einer datierten Version gemacht.

Die Illustrationen entstehen aus einer **anonymisierten** Beispieldatei
(`tools/handbuch/fixtures/demo-rich.anon.ged`) — reichhaltig, aber ohne echte
Personennamen (siehe [tools/handbuch/README.md](tools/handbuch/README.md)).

---

## [Unreleased]

- **Entitäten löschen:** Person, Familie, Quelle und Archiv haben jeweils unten im Detail
  eine „… löschen"-Schaltfläche (mit Rückfrage). Das Löschen räumt alle Verweise sauber auf
  (Familien-Rollen, Kindlisten, Zitate, Archiv-Bezüge), sodass keine kaputten Verknüpfungen
  zurückbleiben; eine dadurch völlig leere Familie wird automatisch mitentfernt. Andere
  Personen und Ereignisse bleiben bestehen.
- **Ereigniszeile — doppelte Adress-/Notizangabe ausgeblendet:** ist die Notiz einer
  Ereigniszeile zeichengleich zur Adresse, wird sie nicht mehr doppelt angezeigt.
- **Forschung als eigene Sidebar-Kategorie (Desktop):** Aufgaben, Protokoll, Hypothesen und
  Dashboard sind jetzt eigene, beschriftete Einträge einer neuen Sidebar-Gruppe „Forschung"
  (statt Segmente hinter einem einzelnen „Aufgaben"-Eintrag). In der mobilen Segment-Reihe
  steht das **Dashboard an erster Stelle**.
- **Forschungsprojekte:** ein Projekt-Chip-Selektor oberhalb der Forschungs-Segmente bündelt
  Aufgaben, Protokoll, Hypothesen und Dashboard auf einen Ausschnitt. Ein Projekt wird über
  Nachname, Ort und Zeitraum abgegrenzt (jede Achse ist optional, leere Achse schränkt nicht
  ein); die Projekte bleiben geräteweit auf diesem Gerät und reisen **nicht** mit der Datei.
- **Protokoll — Ergebnis „teilweise":** vierter Ergebniswert neben gefunden/nichts
  gefunden/ausstehend, für „Fund, aber unvollständig" (trägt die Wiedervorlage).
- **Protokoll — Timeline-Umschalter:** Umschalten zwischen personenweiser Gruppierung und
  einer chronologischen Research-Timeline (neueste zuerst) — gleiche Einträge, andere Sicht.
- **Aus einer Aufgabe direkt ins Protokoll:** die Schaltfläche „🔍 Protokoll" an einer
  Aufgabe legt einen vorbefüllten, verknüpften Protokolleintrag an; die Protokollzeile zeigt
  die auslösende Aufgabe als Rückverweis.
- **Disambiguierung in den Forschungslisten:** Aufgaben, Protokoll und Hypothesen zeigen bei
  namensgleichen Personen zusätzlich das Geburtsjahr/den Geburtsort als Unterscheidungsmerkmal.
- **Beweisführungsnotiz im Personendetail:** eine automatisch berechnete, rein lesende
  Zusammenfassung (Reifegrad „% aufgelöst" · Quellenlage mit Evidenz-/QUAY-Anteil ·
  bestätigte/offene/verworfene Hypothesen) — erscheint, sobald die Person mindestens eine
  Hypothese trägt.

---

## [9.0] — 2026-07-25

Erste Fassung des v9-Handbuchs.

- **Funktionsumfang:** vollständige Beschreibung der **gebauten** v9-Funktionen — nur
  Erreichbares; geplante Bereiche in „Was noch folgt" gesammelt.
- **Vorgehensweisen & gute Praxis:** Arbeitsablauf-Überblick, Schritt-Anleitungen
  (Person/Ereignis erfassen, Orte pflegen, Belege führen, Befunde abarbeiten,
  Forschungs-Kreislauf), FAQ, Umstieg von anderen Programmen, Startcheckliste.
- **Technische Anhänge:** Symbol-/Tastaturreferenz, GEDCOM- und GRAMPS-Dateiformat
  (Roundtrip, Formate, proprietäre Tags — am Interop-Code verifiziert) sowie technischer
  Überblick (Architektur, Orts-/Hofauflösung, Anonymisierung).
- **Illustration** mit echten App-Screenshots (mobil + Desktop) auf Basis einer
  reichhaltigen, anonymisierten Beispieldatei mit angereicherten Orten (Kartenmarker).
- **Automatisierte Erzeugung** eingeführt: Anonymisierer, Screenshot-Pipeline,
  Orchestrator (`npm run handbuch`), Versions- und Changelog-Verwaltung, Skill
  `/handbuch-build`.
