// tests/ui/story-to-html.test.ts — Story-Download als selbst-enthaltenes HTML (BL-190,
// Spec 20 §1.10 / §4). Reine Renderfunktion StoryDoc→HTML über die geteilte Report-Hülle;
// deterministisch (injiziertes Datum, TST-3). Wächter: bleibt unskipped.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily, makeEvent, makeMedia, makeMediaCitation } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import type { ChildLink } from '../../core/model/types';
import { buildPersonStory, buildFamilyStory } from '../../ui/views/story/story-model';
import { buildStoryHtml } from '../../ui/views/story/story-to-html';

const ON = '28. Juli 2026';
const CTX: PlaceContext = { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };

function childLink(familyId: string): ChildLink {
  return { familyId, pedigree: 'birth', fatherRel: '', motherRel: '', fatherRelSeen: false, motherRelSeen: false, citations: [] };
}

function makeTree(): ReturnType<typeof makeDatabase> {
  const db = makeDatabase();
  db.individuals.set('I1', makePerson('I1', {
    given: 'Otto', surname: 'Meyer', sex: 'M',
    birth: makeEvent('BIRT', { date: '1850', place: 'Detmold' }),
    death: makeEvent('DEAT', { date: '1920', place: 'Lemgo' }),
    parentIn: ['F2'],
  }));
  db.individuals.set('I4', makePerson('I4', { given: 'Berta', surname: 'Klein', sex: 'F', birth: makeEvent('BIRT', { date: '1855' }), parentIn: ['F2'] }));
  db.individuals.set('I5', makePerson('I5', { given: 'Carl', surname: 'Meyer', sex: 'M', birth: makeEvent('BIRT', { date: '1880' }), childOf: [childLink('F2')] }));
  db.families.set('F2', makeFamily('F2', {
    husband: 'I1', wife: 'I4', children: ['I5'],
    marriage: makeEvent('MARR', { date: '1878', place: 'Detmold' }),
  }));
  return db;
}

describe('buildStoryHtml (Personen-Story)', () => {
  const personDb = makeTree();
  const html = buildStoryHtml(personDb, buildPersonStory(personDb, CTX, 'I1'), ON);

  it('vollständiges Standalone-HTML mit Titel, Untertitel, Erstell-Datum', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>Otto Meyer</title>');
    expect(html).toContain('1850 – 1920');
    expect(html).toContain('erstellt am 28. Juli 2026');
  });

  it('enthält die Erzählung (Geburt, Familie, Tod)', () => {
    expect(html).toContain('Otto Meyer kam 1850 in Detmold zur Welt.');
    expect(html).toContain('<h2>Familie</h2>');
    expect(html).toContain('Otto Meyer verstarb (1920) in Lemgo.');
  });

  it('selbst-enthalten: keine externen Ressourcen (kein http-Fetch, kein <script>/<link>)', () => {
    // data:-URIs sind self-enthalten und erlaubt; verboten sind externe Fetches.
    expect(html).not.toMatch(/\bsrc=["']https?:|\bhref=["']https?:|<link\b|<script\b/);
  });
});

describe('buildStoryHtml — eingebettete Fotos (BL-189)', () => {
  it('bettet data:-URI-Fotos als self-enthaltene <img> ein', () => {
    const db = makeTree();
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA';
    const mediaId = 'M1';
    db.media.set(mediaId, makeMedia(mediaId, { file: dataUri, form: 'png', title: 'Porträt Otto' }));
    db.individuals.get('I1')!.media.push(makeMediaCitation(mediaId, { primary: true }));

    const html = buildStoryHtml(db, buildPersonStory(db, CTX, 'I1'), ON);
    expect(html).toContain('<section class="story-photos">');
    expect(html).toContain(`src="${dataUri}"`);
    expect(html).toContain('alt="Porträt Otto"');
    // Weiterhin keine externen Ressourcen.
    expect(html).not.toMatch(/\bsrc=["']https?:/);
  });
});

describe('buildStoryHtml (Familien-Story)', () => {
  const famDb = makeTree();
  const html = buildStoryHtml(famDb, buildFamilyStory(famDb, 'F2'), ON);

  it('Titel „Familie X & Y" + ⚭-Untertitel', () => {
    // Der Titel wird HTML-escaped (esc): „&" → „&amp;".
    expect(html).toContain('<title>Familie Otto Meyer &amp; Berta Klein</title>');
    expect(html).toContain('⚭ 1878, Detmold');
  });

  it('Kinder als Liste', () => {
    expect(html).toContain('<h2>Kinder (1)</h2>');
    expect(html).toContain('<ul class="story-children">');
  });
});
