// tests/core/media-kind.test.ts — BL-256/ADR-v9-187: die eine Klassifikation von
// `Media.file`. Die Beispiele sind KEINE erfundenen Strings, sondern Formen aus dem
// Realbestand (`Testdateien/Unsere Familie 2026.ged`): matricula-/online-ofb-Weblinks,
// `Pictures/…`-Pfade mit gemischter Groß-/Kleinschreibung, ein absoluter Pfad.
import { describe, it, expect } from 'vitest';
import {
  classifyMediaFile,
  isWebLink,
  webLinkHost,
  isImageMedia,
  isEmbeddedImage,
} from '../../core/model/media-kind';

describe('classifyMediaFile (ADR-v9-187)', () => {
  it('erkennt eingebettete data:-URIs', () => {
    expect(classifyMediaFile('data:image/png;base64,iVBORw0KGgo=')).toBe('embedded');
    expect(classifyMediaFile('DATA:image/svg+xml,<svg/>')).toBe('embedded');
  });

  it('erkennt Weblinks — der häufigste Fall im Bestand (1968 von 2198)', () => {
    expect(classifyMediaFile('https://data.matricula-online.eu/de/deutschland/x/')).toBe('weblink');
    expect(classifyMediaFile('http://www.online-ofb.de/famreport.php?ofb=x')).toBe('weblink');
    expect(classifyMediaFile('HTTPS://WWW.ARCHION.DE/x')).toBe('weblink');
  });

  it('erkennt Dateipfade — relativ, absolut, mit Backslash', () => {
    expect(classifyMediaFile('Pictures/FranzDecker.BMP')).toBe('file');
    expect(classifyMediaFile('Documents/Urkunde.pdf')).toBe('file');
    expect(classifyMediaFile('/Documents/alt.jpg')).toBe('file');
    expect(classifyMediaFile('Pictures\\bardel.jpg')).toBe('file');
    expect(classifyMediaFile('bardel.jpg')).toBe('file');
  });

  it('unterscheidet „kein Wert" von „Datei"', () => {
    expect(classifyMediaFile('')).toBe('empty');
    expect(classifyMediaFile('   ')).toBe('empty');
  });

  it('ignoriert umgebende Leerzeichen wie der Rest des Parsers', () => {
    expect(classifyMediaFile('  https://example.org/x  ')).toBe('weblink');
    expect(classifyMediaFile('  Pictures/x.jpg ')).toBe('file');
  });

  it('behandelt Nicht-http-Schemata als Pfad, nicht als Weblink', () => {
    // Bewusst eng: `file:`/`ftp:`/`blob:` sind keine anklickbaren Fundorte im Sinne
    // von ADR-v9-187 und dürfen nicht in den ↗-Zweig fallen.
    expect(classifyMediaFile('ftp://host/x.jpg')).toBe('file');
    expect(classifyMediaFile('blob:https://app/1234')).toBe('file');
  });
});

describe('isWebLink / webLinkHost', () => {
  it('isWebLink deckt sich mit der Klassifikation', () => {
    for (const f of ['https://a.de/x', 'http://b.de', 'Pictures/x.jpg', '', 'data:image/png,x']) {
      expect(isWebLink(f)).toBe(classifyMediaFile(f) === 'weblink');
    }
  });

  it('liefert den Host als Kurztext', () => {
    expect(webLinkHost('https://data.matricula-online.eu/de/x/')).toBe('data.matricula-online.eu');
    expect(webLinkHost('http://www.online-ofb.de/x.php?a=1')).toBe('www.online-ofb.de');
  });

  it('liefert einen leeren Host für Nicht-Weblinks und für kaputte Adressen', () => {
    expect(webLinkHost('Pictures/x.jpg')).toBe('');
    expect(webLinkHost('')).toBe('');
    expect(webLinkHost('https://')).toBe('');
  });
});

describe('isImageMedia — Bild oder Dokument', () => {
  it('entscheidet über das kanonische MIME aus Media.form', () => {
    expect(isImageMedia('Pictures/x.jpg', 'image/jpeg')).toBe(true);
    expect(isImageMedia('Documents/u.pdf', 'application/pdf')).toBe(false);
  });

  it('fällt ohne form auf die Datei-Endung zurück — dieselbe Tabelle wie der Writer', () => {
    // Der Bestand trägt 126 BMP und 30 PDF; 5.5.1-Inline liefert `form` oft leer.
    expect(isImageMedia('Pictures/FranzDecker.BMP', '')).toBe(true);
    expect(isImageMedia('Pictures/x.jpg', '')).toBe(true);
    expect(isImageMedia('Documents/Urkunde.pdf', '')).toBe(false);
    expect(isImageMedia('Documents/seite.htm', '')).toBe(false);
  });

  it('liest bei data:-URIs das MIME aus dem Wert, nicht aus form', () => {
    expect(isImageMedia('data:image/png;base64,AA', '')).toBe(true);
    expect(isImageMedia('data:application/pdf;base64,AA', 'image/jpeg')).toBe(false);
  });
});

describe('isEmbeddedImage — ersetzt isDisplayableImage (ADR-v9-136 → -187)', () => {
  it('trifft nur auf eingebettete Bilder zu', () => {
    expect(isEmbeddedImage('data:image/png;base64,AA')).toBe(true);
    expect(isEmbeddedImage('data:application/pdf;base64,AA')).toBe(false);
  });

  it('trifft NICHT auf Pfad-Bilder zu — die brauchen erst den Medien-Ordner', () => {
    // Genau hier lag die Grenze von ADR-v9-136: ein Pfad-Bild IST ein Bild
    // (`isImageMedia` sagt ja), nur direkt einsetzbar ist es nicht.
    expect(isEmbeddedImage('Pictures/x.jpg')).toBe(false);
    expect(isImageMedia('Pictures/x.jpg', '')).toBe(true);
  });

  it('trifft NICHT auf Weblinks zu — sie werden verlinkt, nie geladen (LP-2/CSP)', () => {
    expect(isEmbeddedImage('https://sites-cf.mhcache.com/foto.jpg')).toBe(false);
  });
});
