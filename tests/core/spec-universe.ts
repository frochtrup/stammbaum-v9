// tests/core/spec-universe.ts — der NENNER des Coverage-Audits (BL-162, ADR-v9-127).
//
// BL-155 lieferte den ZÄHLER (was in zwei Bestandsdateien vorkommt). Dieser Nenner ist
// der Möglichkeitsraum der ÖFFENTLICHEN Specs — "0 Vorkommen" heißt damit nicht mehr
// "nicht in der Spec" (ADR-v9-124-Lehre). Beide Universen sind aus der jeweils
// AUTHORITATIVEN Quelle SELBST extrahiert (kein Summarizer, kein Memory-Nachbau) und hier
// eingefroren, damit coverage-spec.test.ts headless/offline läuft (INV-ARCH-2).
//
// Beleg, WARUM Selbst-Extraktion Pflicht war: der WebFetch-Summarizer unterschlug beim
// ersten Versuch 17 der 107 DTD-Elemente; die erste PDF-Regex übersah GIVN/FONE (das `:=`
// stand nicht immer am Zeilenende). Erst der Abgleich gegen die tatsächlich MODELLIERTEN
// Tags (jeder modellierte 5.5.1-Tag MUSS im Universum sein) machte die Lücken sichtbar.

// ── GEDCOM 5.5.1 — Appendix A "Lineage-Linked GEDCOM Tag Definitions" (135 Standard-Tags) ──
//   Quelle: https://gedcom.io/specifications/ged551.pdf, Appendix A (S. 83-95).
//   Extraktion 2026-07-26: Definitions-Zeilen der Form  TAG {NAME}  am Zeilenanfang.
export const GEDCOM_551_TAGS: readonly string[] = [
  'ABBR', 'ADDR', 'ADOP', 'ADR1', 'ADR2', 'AFN', 'AGE', 'AGNC', 'ALIA', 'ANCE', 'ANCI', 'ANUL',
  'ASSO', 'AUTH', 'BAPM', 'BARM', 'BASM', 'BIRT', 'BLES', 'BURI', 'CALN', 'CAST', 'CAUS', 'CENS',
  'CHAN', 'CHAR', 'CHIL', 'CHR', 'CHRA', 'CITY', 'CONC', 'CONF', 'CONL', 'CONT', 'COPR', 'CORP',
  'CREM', 'CTRY', 'DATA', 'DATE', 'DEAT', 'DESC', 'DESI', 'DEST', 'DIV', 'DIVF', 'DSCR', 'EDUC',
  'EMAI', 'EMIG', 'ENDL', 'ENGA', 'EVEN', 'FACT', 'FAM', 'FAMC', 'FAMF', 'FAMS', 'FAX', 'FCOM',
  'FILE', 'FONE', 'FORM', 'GEDC', 'GIVN', 'GRAD', 'HEAD', 'HUSB', 'IDNO', 'IMMI', 'INDI', 'LANG',
  'LATI', 'LONG', 'MAP', 'MARB', 'MARC', 'MARL', 'MARR', 'MARS', 'MEDI', 'NAME', 'NATI', 'NATU',
  'NCHI', 'NICK', 'NMR', 'NOTE', 'NPFX', 'NSFX', 'OBJE', 'OCCU', 'ORDI', 'ORDN', 'PAGE', 'PEDI',
  'PHON', 'PLAC', 'POST', 'PROB', 'PROP', 'PUBL', 'QUAY', 'REFN', 'RELA', 'RELI', 'REPO', 'RESI',
  'RESN', 'RETI', 'RFN', 'RIN', 'ROLE', 'ROMN', 'SEX', 'SLGC', 'SLGS', 'SOUR', 'SPFX', 'SSN',
  'STAE', 'STAT', 'SUBM', 'SUBN', 'SURN', 'TEMP', 'TEXT', 'TIME', 'TITL', 'TRLR', 'TYPE', 'VERS',
  'WIFE', 'WILL', 'WWW',
];

// ── GEDCOM 7.0 — Standard-Tags (141), aus der maschinenlesbaren FamilySearch-Registry (BL-163) ──
//   Quelle: github.com/FamilySearch/GEDCOM-registries, `structure/standard/*.yaml` (je Struktur
//   ein YAML mit `standard tag` + `uri`). Extraktion 2026-07-26 aus dem Repo-Tarball: distinkte
//   `standard tag` aller Strukturen mit `/v7/`-URI — NICHT via HTML-Summarizer (der lieferte eine
//   erkennbar unvollständige Liste; BURI/DEAT/GIVN fehlten). Gegengeprüft: alle Modell-7.0-Tags
//   (SNOTE/EXID/EMAIL/CREA) + INDI/FAM/PHRASE/MIME/SCHMA/UID enthalten.
export const GEDCOM_70_TAGS: readonly string[] = [
  'ABBR', 'ADDR', 'ADOP', 'ADR1', 'ADR2', 'ADR3', 'AGE', 'AGNC', 'ALIA', 'ANCI', 'ANUL', 'ASSO',
  'AUTH', 'BAPL', 'BAPM', 'BARM', 'BASM', 'BIRT', 'BLES', 'BURI', 'CALN', 'CAST', 'CAUS', 'CENS',
  'CHAN', 'CHIL', 'CHR', 'CHRA', 'CITY', 'CONF', 'CONL', 'CONT', 'COPR', 'CORP', 'CREA', 'CREM',
  'CROP', 'CTRY', 'DATA', 'DATE', 'DEAT', 'DESI', 'DEST', 'DIV', 'DIVF', 'DSCR', 'EDUC', 'EMAIL',
  'EMIG', 'ENDL', 'ENGA', 'EVEN', 'EXID', 'FACT', 'FAM', 'FAMC', 'FAMS', 'FAX', 'FCOM', 'FILE',
  'FORM', 'GEDC', 'GIVN', 'GRAD', 'HEAD', 'HEIGHT', 'HUSB', 'IDNO', 'IMMI', 'INDI', 'INIL', 'LANG',
  'LATI', 'LEFT', 'LONG', 'MAP', 'MARB', 'MARC', 'MARL', 'MARR', 'MARS', 'MEDI', 'MIME', 'NAME',
  'NATI', 'NATU', 'NCHI', 'NICK', 'NMR', 'NO', 'NOTE', 'NPFX', 'NSFX', 'OBJE', 'OCCU', 'ORDN',
  'PAGE', 'PEDI', 'PHON', 'PHRASE', 'PLAC', 'POST', 'PROB', 'PROP', 'PUBL', 'QUAY', 'REFN', 'RELI',
  'REPO', 'RESI', 'RESN', 'RETI', 'ROLE', 'SCHMA', 'SDATE', 'SEX', 'SLGC', 'SLGS', 'SNOTE', 'SOUR',
  'SPFX', 'SSN', 'STAE', 'STAT', 'SUBM', 'SURN', 'TAG', 'TEMP', 'TEXT', 'TIME', 'TITL', 'TOP',
  'TRAN', 'TRLR', 'TYPE', 'UID', 'VERS', 'WIDTH', 'WIFE', 'WILL', 'WWW',
];

// ── GRAMPS XML DTD v1.7.2 — ALLE 107 <!ELEMENT>-Deklarationen ──
//   Exakt die Version, die "Unsere Familie.gramps" deklariert ("-//Gramps//DTD Gramps XML 1.7.2//EN").
//   Quelle: https://raw.githubusercontent.com/gramps-project/gramps/refs/heads/master/data/grampsxml.dtd
//   Extraktion 2026-07-26: grep -oE '<!ELEMENT +NAME' über die ROHE DTD (nicht via Summarizer).
export const GRAMPS_172_ELEMENTS: readonly string[] = [
  'address', 'attribute', 'bookmark', 'bookmarks', 'call', 'cause', 'childof', 'childref', 'citation', 'citationref', 'citations', 'city',
  'code', 'confidence', 'coord', 'country', 'county', 'created', 'data_item', 'database', 'daterange', 'datespan', 'datestr', 'dateval',
  'description', 'event', 'eventref', 'events', 'families', 'family', 'familynick', 'father', 'file', 'first', 'format', 'gender',
  'group', 'header', 'lds_ord', 'locality', 'location', 'map', 'mediapath', 'mother', 'name', 'name-formats', 'namemaps', 'nick',
  'note', 'noteref', 'notes', 'object', 'objects', 'objref', 'page', 'parentin', 'people', 'person', 'personref', 'phone',
  'place', 'placeobj', 'placeref', 'places', 'pname', 'postal', 'ptitle', 'range', 'region', 'rel', 'reporef', 'repositories',
  'repository', 'resaddr', 'rescity', 'rescountry', 'researcher', 'resemail', 'reslocality', 'resname', 'resphone', 'respostal', 'resstate', 'rname',
  'sabbrev', 'sauthor', 'sealed_to', 'source', 'sourceref', 'sources', 'spubinfo', 'srcattribute', 'state', 'status', 'stitle', 'street',
  'style', 'suffix', 'surname', 'tag', 'tagref', 'tags', 'temple', 'text', 'title', 'type', 'url',
];

// ── GRAMPS-Elemente, deren DATEN ins Modell projiziert werden ("modelliert") ──
//   KONSERVATIV kuratiert aus dem Projektions-Code (core/interop/gramps*.ts) + der BL-155-
//   Realdaten-Messung (§1.1). Bewusst NICHT der blinde String-Literal-Match: Elemente wie
//   `tagref`/`lds_ord`/`attribute`/`srcattribute`/`style` sind im Code referenziert, aber nur
//   fürs Ref-/Passthrough-Plumbing, nicht projiziert (falsch-positiv). Unsichere Elemente
//   bleiben bewusst DRAUSSEN → sie erscheinen in der At-Risk-Liste (konservativ, überschätzt
//   das Risiko lieber, als es zu verstecken).
export const GRAMPS_MODELED: readonly string[] = [
  // Struktur-Container (werden traversiert)
  'database', 'header', 'people', 'families', 'sources', 'places', 'objects', 'repositories', 'notes', 'citations', 'events',
  // Person + Namensteile + Links
  'person', 'gender', 'name', 'first', 'call', 'suffix', 'title', 'nick', 'familynick', 'surname', 'childof', 'parentin', 'personref', 'address',
  // Familie
  'family', 'father', 'mother', 'childref', 'rel',
  // Ereignis + Datum
  'event', 'type', 'description', 'cause', 'dateval', 'daterange', 'datespan', 'datestr',
  // Referenzen
  'eventref', 'citationref', 'sourceref', 'noteref', 'reporef', 'objref',
  // Quelle / Zitat
  'source', 'stitle', 'sauthor', 'spubinfo', 'sabbrev', 'citation', 'page', 'confidence',
  // Ort / Medium / Archiv / Notiz
  'placeobj', 'ptitle', 'pname', 'coord', 'placeref', 'object', 'file', 'repository', 'rname', 'url', 'note', 'text',
];

// ── GEDCOM-Tags, deren DATEN der Parser ins Modell projiziert ("modelliert") ──
//   Standard-Tags + v9-Erweiterungs-Tags (`_`). Einzige Wahrheitsquelle; der BL-155-Census
//   (_coverage-audit.census.test.ts) UND coverage-spec.test.ts (BL-162) importieren sie hier.
//   Nicht-`_` und nicht in 5.5.1: SNOTE/EXID/EMAIL/CREA (→ GEDCOM_70_TAGS) sowie MILI
//   (verbreitete, nicht-standardisierte Militärdienst-Erweiterung — bewusst als solche geführt).
export const MODELED_GEDCOM_TAGS: ReadonlySet<string> = new Set(
  ('ABBR ADDR ADOP ALIA ASSO AUTH BAPM BIRT BURI CALN CAUS CENS CHAN CHIL CHR CONC CONF CONT CREA DATE DEAT DIV EDUC EMAIL EMIG ENGA EVEN EXID FACT FAM FAMC FAMS FILE FORM GEDC GIVN GRAD HEAD HUSB IMMI INDI LATI LONG MAP MARR MEDI MILI NAME NATU NICK NOTE NPFX NSFX OBJE OCCU PAGE PEDI PHON PLAC PROP PUBL QUAY REFN RELA RELI REPO RESI RESN ROLE SEX SNOTE SOUR SURN TEXT TIME TITL TRLR TYPE VERS WIFE WWW ' +
    '_CAT _CONCL _DATE _FAURL _FREL _HSTAT _HWGT _HYPO _ID _MREL _PRIM _QUERY _RATIO _RESULT _RLOG _RTYPE _TASK _TASKID _TSTAT _UID')
    .split(/\s+/),
);

// Nicht-standardisierte (weder 5.5.1 noch 7.0) Tags, die das Modell dennoch als Ereignis führt.
export const GEDCOM_NONSTANDARD_MODELED: readonly string[] = ['MILI'];
