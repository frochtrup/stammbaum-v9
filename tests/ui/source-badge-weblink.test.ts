// tests/ui/source-badge-weblink.test.ts — End-to-End-Beleg für den Quellen-Weblink der
// angedockten Ergänzungs-Pille (ADR-v9-131): echtes GEDCOM → Parser → Zitat → badgeLinkHref.
// Der reine badgeLinkHref/badgeLabel ist bereits synthetisch in source-badge.test.ts
// abgedeckt; hier zählt die KETTE, die im UI die Pille (und ihr ↗) erscheinen lässt —
// inkl. der realen Falle, dass eine URL MITTEN in PAGE (nicht `^https?://`) KEINEN Link ergibt.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom } from '../../core/interop';
import { badgeLabel, badgeLinkHref } from '../../ui/shell/source-badge';
import type { Citation, Event } from '../../core/model/types';

const WEBLINK = readFileSync(join(__dirname, '../fixtures/weblink.small.ged'), 'utf8');
const URL = 'https://data.matricula-online.eu/de/deutschland/muenster/ochtrup-st-lambertus/KB012/?pg=126';

function onlyPerson() {
  const { db } = parseGedcom(WEBLINK);
  const person = [...db.individuals.values()][0];
  expect(person, 'Fixture liefert genau eine Person').toBeDefined();
  return { db, person };
}

function eventOfType(events: readonly Event[], type: string): Event {
  const ev = events.find((e) => e.type === type);
  expect(ev, `Ereignis ${type} vorhanden`).toBeDefined();
  return ev!;
}

function citationByPage(cits: readonly Citation[], pageIncludes: string): Citation {
  const cit = cits.find((c) => c.page.includes(pageIncludes));
  expect(cit, `Zitat mit PAGE ~ "${pageIncludes}"`).toBeDefined();
  return cit!;
}

describe('Quellen-Weblink End-to-End (ADR-v9-131): OBJE→FILE-URL wird zum ↗', () => {
  it('OCCU-Zitat mit OBJE→FILE http liefert den Weblink (docked-Pille erscheint)', () => {
    const { person } = onlyPerson();
    const occu = eventOfType(person.events, 'OCCU');
    const cit = citationByPage(occu.citations, 'KB012 S_126');
    // Parser projiziert FILE-URL nach media[0].mediaId UND deepLinkUrl (gedcom-parse.ts).
    expect(cit.media[0]?.mediaId).toBe(URL);
    expect(cit.deepLinkUrl).toBe(URL);
    expect(badgeLinkHref(cit)).toBe(URL);
  });

  it('das Label der Weblink-Quelle ist der gekürzte Kurzname (KB Ochtrup, St. L…)', () => {
    const { db, person } = onlyPerson();
    const cit = citationByPage(eventOfType(person.events, 'OCCU').citations, 'KB012 S_126');
    const source = db.sources.get(cit.sourceId);
    expect(badgeLabel(cit, source)).toBe('KB Ochtrup, St. L…');
  });

  it('Zitat ohne URL (nur PAGE-Text) ergibt KEINEN Link', () => {
    const { person } = onlyPerson();
    const cit = citationByPage(eventOfType(person.events, 'OCCU').citations, 'S. 209');
    expect(cit.media.length).toBe(0);
    expect(badgeLinkHref(cit)).toBe('');
  });

  it('URL MITTEN in PAGE (nicht am Anfang) ergibt KEINEN Link — reale Matricula-Falle', () => {
    const { person } = onlyPerson();
    // BIRT ist im Modell ein eigenes Feld (nicht in `events`). Sein Zitat trägt
    // PAGE = `"KB012 S_126," https://…` — die URL steht eingebettet, nicht am Start.
    const cit = citationByPage(person.birth.citations, 'KB012 S_126');
    expect(cit.page).toContain(URL);
    expect(badgeLinkHref(cit)).toBe('');
  });
});
